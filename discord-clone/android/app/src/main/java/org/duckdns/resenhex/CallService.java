package org.duckdns.resenhex;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.media.AudioManager;
import android.media.AudioRecordingConfiguration;
import android.media.MediaRecorder;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.util.List;

/**
 * Serviço em primeiro plano enquanto a pessoa está numa call, como o "Conectado à voz" do Discord.
 * Com ele, o Android mantém o microfone, a rede e o site rodando com a tela bloqueada.
 * A notificação fixa mostra a sala e tem os botões Silenciar e Sair.
 *
 * O acesso ao microfone com a tela bloqueada vem do tipo "microphone" deste serviço, e o Android só o
 * concede quando o serviço começa com o app na tela. Por isso ele não é parado e religado enquanto a
 * call continua (a notificação muda sem reiniciar o serviço), e volta a pedir o tipo microfone sempre
 * que o app aparece na tela. Se mesmo assim o Android silenciar o microfone, a notificação avisa.
 */
public class CallService extends Service {
    static final String CHANNEL = "call";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_MUTED = "muted";
    static final String EXTRA_CAPTURE = "capture";
    /** O app está na tela: dá para (re)pedir o tipo microfone ao Android. */
    static final String EXTRA_VISIBLE = "visible";
    private static final String ACTION_MUTE = "org.duckdns.resenhex.MUTE";
    private static final String ACTION_LEAVE = "org.duckdns.resenhex.LEAVE";
    private static final int NOTIFICATION_ID = 1;
    private static final String ALERT_TAG = "microfone-pausado";

    /** Serviço em primeiro plano (a call está protegida). */
    static volatile boolean ready;
    /** O serviço tem o tipo microfone: a captura continua com a tela bloqueada. */
    static volatile boolean microphoneReady;
    /** O Android está entregando silêncio no lugar do microfone. */
    static volatile boolean silenced;

    private PowerManager.WakeLock cpu;
    private WifiManager.WifiLock wifi;
    private WifiManager.WifiLock wifiLowLatency;
    private long startedAt; // o cronômetro da notificação conta desde a entrada na call
    private String title = "";
    private boolean muted;
    private boolean alerted; // o aviso de microfone pausado já tocou neste corte
    private final Handler handler = new Handler(Looper.getMainLooper());
    private AudioManager.AudioRecordingCallback recordings;

    /** Renova o bloqueio do processador enquanto a call durar (ele tem limite de 6 horas). */
    private final Runnable renewLocks = new Runnable() {
        @Override public void run() {
            MainActivity activity = MainActivity.current();
            if (!ready || activity == null || !activity.isInCall()) return;
            if (cpu != null) cpu.acquire(6 * 60 * 60 * 1000L);
            handler.postDelayed(this, 15 * 60 * 1000L);
        }
    };

    /** Confere o microfone 2 s depois de uma mudança: cortes rápidos (troca de rota de áudio) não avisam. */
    private final Runnable checkSilence = this::updateSilence;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_MUTE.equals(action)) { MainActivity.callAction("mute"); return START_NOT_STICKY; }
        if (ACTION_LEAVE.equals(action)) { MainActivity.callAction("leave"); return START_NOT_STICKY; }
        MainActivity activity = MainActivity.current();
        if (activity == null || !activity.isInCall()) { stopSelf(); return START_NOT_STICKY; }

        String newTitle = intent == null ? null : intent.getStringExtra(EXTRA_TITLE);
        title = newTitle == null ? "" : newTitle;
        muted = intent != null && intent.getBooleanExtra(EXTRA_MUTED, false);
        boolean visible = intent != null && intent.getBooleanExtra(EXTRA_VISIBLE, false);
        boolean capture = intent != null && intent.getBooleanExtra(EXTRA_CAPTURE, false)
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        if (startedAt == 0) startedAt = System.currentTimeMillis();

        // Já em primeiro plano e sem como ganhar o microfone agora (app fora da tela): só atualiza a
        // notificação. Pedir o primeiro plano de novo em segundo plano pode ser recusado pelo Android.
        if (ready && (!visible || !capture || microphoneReady && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q)) {
            refreshNotification();
        } else if (!goForeground(capture)) {
            ready = false;
            microphoneReady = false;
            MainActivity.callServiceState("foreground_service_unavailable");
            stopSelf();
            return START_NOT_STICKY;
        }
        holdLocks();
        handler.removeCallbacks(renewLocks);
        handler.postDelayed(renewLocks, 15 * 60 * 1000L);
        watchRecordings();
        MainActivity.callServiceState(null);
        return START_NOT_STICKY; // se o Android encerrar o app, a call acabou: o serviço não volta sozinho
    }

    /**
     * Entra (ou continua) em primeiro plano. Com o app na tela, o tipo microfone garante a captura com
     * a tela bloqueada; sem ele (Android 14+ recusa microfone pedido em segundo plano), o serviço fica
     * só com a reprodução, que mantém a call ouvindo até a pessoa abrir o app.
     */
    private boolean goForeground(boolean capture) {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            try {
                startForeground(NOTIFICATION_ID, notification);
            } catch (RuntimeException error) {
                return false;
            }
            ready = true;
            microphoneReady = capture;
            return true;
        }
        if (capture) {
            try {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                ready = true;
                microphoneReady = true;
                return true;
            } catch (RuntimeException error) {
                // Segue sem o microfone; ele volta quando a pessoa abrir o app.
            }
        }
        if (ready && microphoneReady) return true; // já tinha o microfone: mantém como está
        try {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } catch (RuntimeException error) {
            return false;
        }
        ready = true;
        microphoneReady = false;
        return true;
    }

    private void refreshNotification() {
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, buildNotification());
    }

    private Notification buildNotification() {
        MainActivity.createChannels(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent mute = PendingIntent.getService(this, 1, new Intent(this, CallService.class).setAction(ACTION_MUTE), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent leave = PendingIntent.getService(this, 2, new Intent(this, CallService.class).setAction(ACTION_LEAVE), PendingIntent.FLAG_IMMUTABLE);

        String text = silenced ? "O Android pausou seu microfone. Toque para voltar a falar"
                : muted ? "Seu microfone está desligado" : "Toque para voltar para a call";
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this).setPriority(Notification.PRIORITY_LOW);
        return builder.setSmallIcon(R.drawable.ic_stat_resenhex)
                .setColor(Color.parseColor("#6B38E8"))
                .setContentTitle(title.isEmpty() ? "Na call" : "Na call · " + title)
                .setContentText(text)
                .setContentIntent(tap)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setWhen(startedAt)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setCategory(Notification.CATEGORY_CALL)
                .setGroup("call") // fica separada das mensagens, com os botões sempre à vista
                .addAction(new Notification.Action.Builder(null, muted ? "Ligar microfone" : "Silenciar", mute).build())
                .addAction(new Notification.Action.Builder(null, "Sair da call", leave).build())
                .build();
    }

    /** Mantém o processador e o Wi-Fi acordados durante a call (com a tela apagada eles dormem). */
    private void holdLocks() {
        if (cpu == null) {
            cpu = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Resenhex:call");
            cpu.setReferenceCounted(false);
            cpu.acquire(6 * 60 * 60 * 1000L); // limite de segurança: 6 horas (renovado pelo renewLocks)
        }
        if (wifi == null) {
            WifiManager manager = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            // HIGH_PERF vale com a tela apagada até o Android 13; LOW_LATENCY só com o app na tela, e
            // o Android escolhe o que valer no momento quando os dois estão seguros. No 14+ o HIGH_PERF
            // virou um LOW_LATENCY.
            wifi = manager.createWifiLock(Build.VERSION.SDK_INT >= 34 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Resenhex:call");
            wifi.setReferenceCounted(false);
            wifi.acquire();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && Build.VERSION.SDK_INT < 34) {
                wifiLowLatency = manager.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "Resenhex:call-tela");
                wifiLowLatency.setReferenceCounted(false);
                wifiLowLatency.acquire();
            }
        }
    }

    // ---------------- microfone silenciado pelo Android ----------------

    /** Acompanha as gravações do aparelho para saber quando o Android passa a entregar silêncio. */
    private void watchRecordings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || recordings != null) return;
        recordings = new AudioManager.AudioRecordingCallback() {
            @Override
            public void onRecordingConfigChanged(List<AudioRecordingConfiguration> configs) {
                handler.removeCallbacks(checkSilence);
                handler.postDelayed(checkSilence, 2000);
            }
        };
        getSystemService(AudioManager.class).registerAudioRecordingCallback(recordings, handler);
        handler.postDelayed(checkSilence, 2000);
    }

    private void updateSilence() {
        boolean now = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && recordingSilenced();
        if (now == silenced) return;
        silenced = now;
        if (!ready) return;
        refreshNotification();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (now && !alerted) {
            alerted = true;
            manager.notify(ALERT_TAG, 0, buildAlert());
        } else if (!now) {
            alerted = false;
            manager.cancel(ALERT_TAG, 0);
        }
        MainActivity.callServiceState(null);
    }

    /**
     * Alguma captura de voz deste aparelho está silenciada pelo sistema? O Android não diz de qual app
     * é cada gravação; durante a call, a de voz é a do Resenhex. Numa ligação telefônica o corte é
     * esperado e não conta.
     */
    private boolean recordingSilenced() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false;
        AudioManager audio = getSystemService(AudioManager.class);
        if (audio.getMode() == AudioManager.MODE_IN_CALL) return false;
        for (AudioRecordingConfiguration config : audio.getActiveRecordingConfigurations()) {
            int source = config.getClientAudioSource();
            boolean voice = source == MediaRecorder.AudioSource.VOICE_COMMUNICATION || source == MediaRecorder.AudioSource.MIC
                    || source == MediaRecorder.AudioSource.DEFAULT || source == MediaRecorder.AudioSource.VOICE_RECOGNITION
                    || source == MediaRecorder.AudioSource.UNPROCESSED || source == MediaRecorder.AudioSource.CAMCORDER;
            if (voice && config.isClientSilenced()) return true;
        }
        return false;
    }

    private Notification buildAlert() {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 3, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, MainActivity.CHANNEL_CALL_ALERTS)
                : new Notification.Builder(this).setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_VIBRATE);
        return builder.setSmallIcon(R.drawable.ic_stat_resenhex)
                .setColor(Color.parseColor("#6B38E8"))
                .setContentTitle("Ninguém está te ouvindo")
                .setContentText("O Android pausou seu microfone. Toque para voltar a falar.")
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_CALL)
                .build();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(renewLocks);
        handler.removeCallbacks(checkSilence);
        if (recordings != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) getSystemService(AudioManager.class).unregisterAudioRecordingCallback(recordings);
        recordings = null;
        getSystemService(NotificationManager.class).cancel(ALERT_TAG, 0);
        ready = false;
        microphoneReady = false;
        silenced = false;
        if (cpu != null && cpu.isHeld()) cpu.release();
        if (wifi != null && wifi.isHeld()) wifi.release();
        if (wifiLowLatency != null && wifiLowLatency.isHeld()) wifiLowLatency.release();
        cpu = null;
        wifi = null;
        wifiLowLatency = null;
        MainActivity.callServiceState(null);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
