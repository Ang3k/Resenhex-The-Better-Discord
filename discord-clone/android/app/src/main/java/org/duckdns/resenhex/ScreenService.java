package org.duckdns.resenhex;

import android.Manifest;
import android.annotation.TargetApi;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.Surface;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/**
 * Transmissão da tela do celular, como o "Transmitir tela" do Discord no Android.
 *
 * O WebView não tem getDisplayMedia, então a captura é do app: a captura de tela do Android
 * (MediaProjection) desenha numa tela virtual ligada ao codificador H.264 do próprio celular, que
 * quase não usa o processador. Os quadros vão para o site pela ScreenFeed; lá o VideoDecoder os
 * decodifica e a transmissão segue pelo WebRTC como a de um computador (public/android-screen.js).
 * Se o codificador falhar, ou o site pedir, a captura vira JPEG (mais pesada, funciona em qualquer
 * celular). No Android 10+ vai também o som do celular (jogos e vídeos), nunca o som da call.
 *
 * É um serviço em primeiro plano do tipo mediaProjection, com a notificação "Transmitindo a tela".
 */
public class ScreenService extends Service {
    static final String EXTRA_CODE = "code";
    static final String EXTRA_DATA = "data";
    static final String EXTRA_CONFIG = "config";
    static final String EXTRA_TOKEN = "token";
    private static final String ACTION_STOP = "org.duckdns.resenhex.SCREEN_STOP";
    private static final int NOTIFICATION_ID = 2;
    /** Som do celular: 48 kHz, estéreo, 16 bits, em pedaços de 10 ms. */
    static final int AUDIO_RATE = 48000;
    private static final int AUDIO_CHUNK = AUDIO_RATE / 100 * 4;

    static final ScreenFeed feed = new ScreenFeed();
    /** Chave do endereço que o site lê nesta transmissão (null sem transmissão). */
    static volatile String token;
    private static volatile ScreenService running;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaProjection projection;
    private VirtualDisplay display;
    private Sink sink;
    private AudioCapture audio;
    private DisplayManager.DisplayListener displayListener;
    /** Caixa do perfil (720p: 1280×720): a imagem cabe nela, deitada ou em pé, sem distorcer. */
    private int boxWidth = 1280;
    private int boxHeight = 720;
    private int fps = 30;
    private boolean allowH264 = true;
    private boolean wantAudio = true;
    private boolean jpeg;
    private int generation;
    private int width;
    private int height;
    private int dpi = 320;
    /** Android 14+: tamanho do app transmitido sozinho (0 = a tela inteira). */
    private int contentWidth;
    private int contentHeight;
    private boolean stopping;
    private String audioProblem = "";

    private final Runnable checkRotation = this::checkRotation;

    private final MediaProjection.Callback callback = new MediaProjection.Callback() {
        @Override
        public void onStop() {
            // A pessoa parou pelo Android (o chip da barra de status, a tela de bloqueio em alguns aparelhos).
            handler.post(() -> finish("system"));
        }

        @Override
        public void onCapturedContentResize(int newWidth, int newHeight) {
            handler.post(() -> {
                if (newWidth <= 0 || newHeight <= 0) return;
                contentWidth = newWidth;
                contentHeight = newHeight;
                double before = height > 0 ? (double) width / height : 0;
                double after = (double) newWidth / newHeight;
                if (Math.abs(after / Math.max(before, 0.01) - 1) > 0.03) rebuild();
            });
        }

        @Override
        public void onCapturedContentVisibilityChanged(boolean visible) {
            // Android 14+, transmitindo um app só: ele saiu (ou voltou) da tela.
            handler.post(() -> report(visible ? "resumed" : "paused", null));
        }
    };

    static boolean isRunning() {
        return running != null;
    }

    /** Para a transmissão (o site pediu, a call acabou ou a página recarregou). */
    static void stopNow() {
        ScreenService service = running;
        if (service != null) service.handler.post(() -> service.finish("app"));
    }

    /** Novo perfil de qualidade: lado maior da imagem e quadros por segundo. */
    static void setQuality(int boxWidth, int boxHeight, int fps) {
        ScreenService service = running;
        if (service == null) return;
        service.handler.post(() -> {
            int w = clamp(boxWidth, 320, 1920), h = clamp(boxHeight, 320, 1920), rate = clamp(fps, 5, 60);
            if (w == service.boxWidth && h == service.boxHeight && rate == service.fps) return;
            service.boxWidth = w;
            service.boxHeight = h;
            service.fps = rate;
            service.rebuild();
        });
    }

    /** O site não decodifica o H.264 deste celular: passa para JPEG. */
    static void useJpeg() {
        ScreenService service = running;
        if (service == null) return;
        service.handler.post(() -> {
            if (service.jpeg) return;
            service.jpeg = true;
            service.rebuild();
        });
    }

    static void requestKeyframe() {
        ScreenService service = running;
        Sink current = service == null ? null : service.sink;
        if (current != null) current.keyframe();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            finish("notification");
            return START_NOT_STICKY;
        }
        if (projection != null || intent == null) return START_NOT_STICKY;
        // Uma transmissão nova pode chegar antes de o Android destruir o serviço da anterior.
        stopping = false;
        contentWidth = contentHeight = 0;
        audioProblem = "";
        readConfig(intent.getStringExtra(EXTRA_CONFIG));

        // 1. Primeiro plano antes de abrir a captura: o Android 10+ exige o tipo mediaProjection.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
            else startForeground(NOTIFICATION_ID, buildNotification());
        } catch (RuntimeException error) {
            fail("foreground");
            return START_NOT_STICKY;
        }

        // 2. A captura, com o consentimento que a pessoa acabou de dar (vale uma vez só no Android 14+).
        Intent data = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(EXTRA_DATA, Intent.class) : intent.getParcelableExtra(EXTRA_DATA);
        int code = intent.getIntExtra(EXTRA_CODE, 0);
        try {
            MediaProjectionManager manager = getSystemService(MediaProjectionManager.class);
            projection = data == null ? null : manager.getMediaProjection(code, data);
        } catch (RuntimeException error) {
            projection = null;
        }
        if (projection == null) {
            fail("projection");
            return START_NOT_STICKY;
        }
        projection.registerCallback(callback, handler); // antes da tela virtual (exigência do Android 14+)
        running = this;
        token = intent.getStringExtra(EXTRA_TOKEN);
        feed.reset();
        feed.setListener(ScreenService::requestKeyframe);

        // 3. A tela virtual ligada ao codificador.
        computeSize();
        sink = createSink();
        if (sink == null) {
            fail("encoder");
            return START_NOT_STICKY;
        }
        sendInfo();
        try {
            display = projection.createVirtualDisplay("Resenhex-tela", width, height, dpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, sink.surface(), null, handler);
        } catch (RuntimeException error) {
            display = null;
        }
        if (display == null) {
            fail("display");
            return START_NOT_STICKY;
        }
        watchRotation();
        startAudio();
        report("started", null);
        return START_NOT_STICKY;
    }

    private void readConfig(String json) {
        try {
            JSONObject config = new JSONObject(json == null ? "{}" : json);
            boxWidth = clamp(config.optInt("width", 1280), 320, 1920);
            boxHeight = clamp(config.optInt("height", 720), 320, 1920);
            fps = clamp(config.optInt("fps", 30), 5, 60);
            allowH264 = config.optBoolean("h264", true);
            wantAudio = config.optBoolean("audio", true);
        } catch (Exception ignored) {
            // Perfil padrão.
        }
        jpeg = !allowH264;
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    // ---------------- tamanho da imagem ----------------

    /** Tamanho do que está sendo capturado: o app transmitido sozinho (Android 14+) ou a tela inteira. */
    private int[] sourceSize() {
        if (contentWidth > 0 && contentHeight > 0) return new int[]{contentWidth, contentHeight};
        Display screen = getSystemService(DisplayManager.class).getDisplay(Display.DEFAULT_DISPLAY);
        DisplayMetrics metrics = new DisplayMetrics();
        screen.getRealMetrics(metrics);
        dpi = metrics.densityDpi;
        return new int[]{metrics.widthPixels, metrics.heightPixels};
    }

    /** O lado maior fica no perfil (720p: 1280; 1080p: 1920), em múltiplos de 16 (exigência de alguns codificadores). */
    private void computeSize() {
        int[] source = sourceSize();
        double scale = Math.min(1.0, Math.min((double) boxWidth / Math.max(1, source[0]), (double) boxHeight / Math.max(1, source[1])));
        // Múltiplos de 16: o tamanho que todo codificador H.264 aceita sem bordas.
        width = Math.max(160, (int) Math.floor(source[0] * scale / 16.0) * 16);
        height = Math.max(160, (int) Math.floor(source[1] * scale / 16.0) * 16);
    }

    /** Girar o celular: a imagem passa a ser deitada (jogos) ou em pé. */
    private void watchRotation() {
        displayListener = new DisplayManager.DisplayListener() {
            @Override public void onDisplayAdded(int displayId) {}
            @Override public void onDisplayRemoved(int displayId) {}
            @Override public void onDisplayChanged(int displayId) {
                if (displayId != Display.DEFAULT_DISPLAY) return;
                handler.removeCallbacks(checkRotation);
                handler.postDelayed(checkRotation, 150);
            }
        };
        getSystemService(DisplayManager.class).registerDisplayListener(displayListener, handler);
    }

    private void checkRotation() {
        if (projection == null || contentWidth > 0) return; // um app só: o Android avisa o tamanho dele
        int[] source = sourceSize();
        if ((source[0] > source[1]) != (width > height)) rebuild();
    }

    /** Tamanho, qualidade ou formato mudou: codificador novo, ligado à mesma tela virtual. */
    private void rebuild() {
        if (projection == null || display == null || stopping) return;
        Sink old = sink;
        computeSize();
        generation = (generation + 1) & 0xffff;
        Sink fresh = createSink();
        if (fresh == null) {
            finish("encoder");
            return;
        }
        sink = fresh;
        sendInfo(); // a descrição vai antes do primeiro quadro do codificador novo
        display.resize(width, height, dpi);
        display.setSurface(fresh.surface());
        if (old != null) old.stop();
        report("size", null);
    }

    private Sink createSink() {
        if (!jpeg) {
            try {
                return new H264Sink(width, height, generation);
            } catch (Exception error) {
                jpeg = true; // este celular não codifica H.264 nesse tamanho: segue em JPEG
            }
        }
        try {
            return new JpegSink(width, height, generation);
        } catch (Exception error) {
            return null;
        }
    }

    /** Descrição do vídeo para o site: codec, tamanho e geração (o site recomeça o decodificador). */
    private void sendInfo() {
        try {
            JSONObject info = new JSONObject();
            info.put("gen", generation);
            info.put("codec", jpeg ? "jpeg" : "h264");
            info.put("width", width);
            info.put("height", height);
            info.put("fps", fps);
            byte[] bytes = info.toString().getBytes(StandardCharsets.UTF_8);
            feed.info(ScreenFeed.packet(ScreenFeed.TYPE_INFO, 0, generation, SystemClock.elapsedRealtimeNanos() / 1000, bytes, 0, bytes.length));
        } catch (Exception ignored) {
            // JSONObject não falha com esses valores.
        }
    }

    // ---------------- codificadores ----------------

    private interface Sink {
        Surface surface();
        void keyframe();
        void stop();
    }

    /** H.264 do próprio celular, com a tela virtual desenhando direto na entrada dele. */
    private final class H264Sink implements Sink, Runnable {
        private final MediaCodec codec;
        private final Surface input;
        private final int gen;
        private final Thread thread;
        private volatile boolean alive = true;
        private byte[] config;

        H264Sink(int w, int h, int gen) throws Exception {
            this.gen = gen;
            codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC);
            try {
                MediaCodecInfo.VideoCapabilities caps = codec.getCodecInfo().getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC).getVideoCapabilities();
                if (caps != null && !caps.isSizeSupported(w, h)) throw new IllegalArgumentException("tamanho");
                try {
                    codec.configure(format(w, h, true), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
                } catch (RuntimeException detailed) {
                    // Alguns codificadores recusam perfil ou prioridade: tenta só com o básico.
                    codec.reset();
                    codec.configure(format(w, h, false), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
                }
                input = codec.createInputSurface();
                codec.start();
            } catch (Exception error) {
                codec.release();
                throw error;
            }
            thread = new Thread(this, "resenhex-tela-h264");
            thread.start();
        }

        private MediaFormat format(int w, int h, boolean detailed) {
            MediaFormat format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h);
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            // Boa qualidade: a imagem ainda é codificada de novo pelo WebRTC.
            format.setInteger(MediaFormat.KEY_BIT_RATE, clamp((int) ((long) w * h * fps / 5), 1_500_000, 12_000_000));
            format.setInteger(MediaFormat.KEY_FRAME_RATE, fps);
            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2);
            // Tela parada: repete o último quadro a 5 fps, para quem começa a assistir não ficar no preto.
            format.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 200_000);
            // Telas de 90/120 Hz: o Android descarta o excesso antes do codificador (Android 10+).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) format.setFloat(MediaFormat.KEY_MAX_FPS_TO_ENCODER, fps);
            if (detailed) {
                format.setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline);
                format.setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel41);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) format.setInteger(MediaFormat.KEY_PRIORITY, 0); // tempo real
            }
            return format;
        }

        @Override
        public Surface surface() {
            return input;
        }

        @Override
        public void keyframe() {
            if (!alive) return;
            Bundle params = new Bundle();
            params.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0);
            try {
                codec.setParameters(params);
            } catch (RuntimeException ignored) {
                // Codificador já parando.
            }
        }

        @Override
        public void run() {
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            try {
                while (alive) {
                    int index = codec.dequeueOutputBuffer(info, 100_000);
                    if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        // Alguns codificadores mandam SPS e PPS no formato, não num buffer de configuração.
                        MediaFormat format = codec.getOutputFormat();
                        ByteBuffer sps = format.getByteBuffer("csd-0"), pps = format.getByteBuffer("csd-1");
                        if (sps != null) config = concat(bytes(sps), pps == null ? new byte[0] : bytes(pps));
                        continue;
                    }
                    if (index < 0) continue;
                    ByteBuffer buffer = codec.getOutputBuffer(index);
                    if (buffer != null && info.size > 0) {
                        byte[] data = new byte[info.size];
                        buffer.position(info.offset);
                        buffer.get(data, 0, info.size);
                        if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                            config = data;
                        } else {
                            boolean key = (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0;
                            // O quadro-chave leva SPS e PPS junto: o site pode começar dele.
                            byte[] payload = key && config != null ? concat(config, data) : data;
                            feed.video(ScreenFeed.packet(ScreenFeed.TYPE_H264, key ? ScreenFeed.FLAG_KEY : 0, gen, info.presentationTimeUs, payload, 0, payload.length), key);
                        }
                    }
                    codec.releaseOutputBuffer(index, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break;
                }
            } catch (RuntimeException ignored) {
                // Codificador parado no meio da leitura.
            } finally {
                try {
                    codec.stop();
                } catch (RuntimeException ignored) {
                }
                codec.release();
                input.release();
            }
        }

        @Override
        public void stop() {
            alive = false; // a linha de leitura solta o codificador ao sair
        }
    }

    private static byte[] bytes(ByteBuffer buffer) {
        ByteBuffer copy = buffer.duplicate();
        copy.position(0);
        byte[] out = new byte[copy.remaining()];
        copy.get(out);
        return out;
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] out = new byte[a.length + b.length];
        System.arraycopy(a, 0, out, 0, a.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }

    /** JPEG: cada quadro é uma imagem inteira. Mais pesado, mas funciona em qualquer celular. */
    private final class JpegSink implements Sink {
        private final ImageReader reader;
        private final HandlerThread thread;
        private final int gen;
        private final int w;
        private final int h;
        private final ByteArrayOutputStream out = new ByteArrayOutputStream(256 * 1024);
        private Bitmap bitmap;
        private ByteBuffer padded;
        private long last;

        JpegSink(int w, int h, int gen) {
            this.w = w;
            this.h = h;
            this.gen = gen;
            reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
            thread = new HandlerThread("resenhex-tela-jpeg");
            thread.start();
            reader.setOnImageAvailableListener(r -> onImage(), new Handler(thread.getLooper()));
        }

        private void onImage() {
            Image image;
            try {
                image = reader.acquireLatestImage();
            } catch (RuntimeException e) {
                return;
            }
            if (image == null) return;
            try {
                long now = SystemClock.elapsedRealtime();
                if (now - last < 1000 / fps - 3) return; // no máximo o fps do perfil
                last = now;
                Image.Plane plane = image.getPlanes()[0];
                int stride = plane.getRowStride() / plane.getPixelStride();
                if (bitmap == null || bitmap.getWidth() != stride || bitmap.getHeight() != h) bitmap = Bitmap.createBitmap(stride, h, Bitmap.Config.ARGB_8888);
                ByteBuffer pixels = plane.getBuffer();
                int needed = stride * h * 4;
                if (pixels.remaining() < needed) {
                    // A última linha pode vir sem o enchimento: completa com zeros.
                    if (padded == null || padded.capacity() != needed) padded = ByteBuffer.allocateDirect(needed);
                    padded.clear();
                    padded.put(pixels);
                    while (padded.hasRemaining()) padded.put((byte) 0);
                    padded.flip();
                    pixels = padded;
                }
                bitmap.copyPixelsFromBuffer(pixels);
                out.reset();
                bitmap.compress(Bitmap.CompressFormat.JPEG, 75, out); // a largura extra é cortada no site
                byte[] jpg = out.toByteArray();
                feed.video(ScreenFeed.packet(ScreenFeed.TYPE_JPEG, ScreenFeed.FLAG_KEY, gen, image.getTimestamp() / 1000, jpg, 0, jpg.length), true);
            } catch (RuntimeException ignored) {
                // Quadro perdido; o próximo vem em seguida.
            } finally {
                image.close();
            }
        }

        @Override
        public Surface surface() {
            return reader.getSurface();
        }

        @Override
        public void keyframe() {
            // Todo quadro JPEG é completo.
        }

        @Override
        public void stop() {
            reader.setOnImageAvailableListener(null, null);
            thread.quitSafely();
            reader.close();
        }
    }

    // ---------------- som do celular (Android 10+) ----------------

    private void startAudio() {
        if (!wantAudio) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) { audioProblem = "android"; return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { audioProblem = "permission"; return; }
        try {
            audio = new AudioCapture(projection);
        } catch (Exception error) {
            audio = null;
            audioProblem = "capture";
        }
    }

    /** Som de jogos, vídeos e músicas do celular. O som da call (ligação) o Android não deixa capturar. */
    @TargetApi(Build.VERSION_CODES.Q)
    private static final class AudioCapture implements Runnable {
        private final AudioRecord record;
        private final Thread thread;
        private volatile boolean alive = true;

        AudioCapture(MediaProjection projection) {
            AudioPlaybackCaptureConfiguration config = new AudioPlaybackCaptureConfiguration.Builder(projection)
                    .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                    .addMatchingUsage(AudioAttributes.USAGE_GAME)
                    .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                    .excludeUid(Process.myUid()) // o DJ do próprio Resenhex: quem assiste já ouve
                    .build();
            AudioFormat format = new AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(AUDIO_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
                    .build();
            int min = AudioRecord.getMinBufferSize(AUDIO_RATE, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT);
            record = new AudioRecord.Builder()
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(Math.max(min * 2, AUDIO_RATE * 4 / 5))
                    .setAudioPlaybackCaptureConfig(config)
                    .build();
            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                record.release();
                throw new IllegalStateException("audio");
            }
            record.startRecording();
            thread = new Thread(this, "resenhex-tela-som");
            thread.start();
        }

        @Override
        public void run() {
            byte[] chunk = new byte[AUDIO_CHUNK];
            while (alive) {
                int n = record.read(chunk, 0, chunk.length);
                if (n < 0) break;
                if (n > 0) feed.audio(ScreenFeed.packet(ScreenFeed.TYPE_PCM, 0, 0, SystemClock.elapsedRealtimeNanos() / 1000, chunk, 0, n));
            }
        }

        void stop() {
            alive = false;
            try {
                record.stop();
            } catch (RuntimeException ignored) {
            }
            try {
                thread.join(300);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            record.release();
        }
    }

    // ---------------- notificação e fim ----------------

    private Notification buildNotification() {
        MainActivity.createChannels(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 20, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop = PendingIntent.getService(this, 21, new Intent(this, ScreenService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CallService.CHANNEL)
                : new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
        return builder.setSmallIcon(R.drawable.ic_stat_resenhex)
                .setColor(Color.parseColor("#6B38E8"))
                .setContentTitle("Transmitindo a tela")
                .setContentText("Quem está na call vê a tela do seu celular")
                .setContentIntent(tap)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setGroup("call")
                .addAction(new Notification.Action.Builder(null, "Parar transmissão", stop).build())
                .build();
    }

    /** Conta ao site como está a transmissão (MainActivity repassa para window.AndroidApp). */
    private void report(String state, String reason) {
        try {
            JSONObject status = new JSONObject();
            status.put("state", state);
            if (reason != null) status.put("reason", reason);
            if ("started".equals(state)) status.put("token", token);
            status.put("codec", jpeg ? "jpeg" : "h264");
            status.put("width", width);
            status.put("height", height);
            status.put("fps", fps);
            status.put("audio", audio != null);
            status.put("audioProblem", audioProblem);
            MainActivity.screenState(status.toString());
        } catch (Exception ignored) {
            // JSONObject não falha com esses valores.
        }
    }

    private void fail(String reason) {
        finish(null); // antes do aviso: a janelinha da call volta a valer quando o site fica sabendo
        report("error", reason);
    }

    /** Fim da transmissão por qualquer caminho: solta a captura, o codificador e o som. */
    private void finish(String reason) {
        if (stopping) return;
        stopping = true;
        handler.removeCallbacks(checkRotation);
        if (displayListener != null) getSystemService(DisplayManager.class).unregisterDisplayListener(displayListener);
        displayListener = null;
        if (audio != null) audio.stop();
        audio = null;
        if (display != null) display.release();
        display = null;
        if (sink != null) sink.stop();
        sink = null;
        if (projection != null) {
            projection.unregisterCallback(callback);
            try {
                projection.stop();
            } catch (RuntimeException ignored) {
            }
        }
        projection = null;
        feed.setListener(null);
        feed.close();
        token = null;
        if (running == this) running = null;
        if (reason != null) report("stopped", reason);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        finish("destroyed");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
