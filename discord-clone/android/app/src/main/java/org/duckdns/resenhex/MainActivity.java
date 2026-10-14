package org.duckdns.resenhex;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioManager;
import android.media.AudioRecordingConfiguration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.os.PowerManager;
import android.os.RemoteException;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.json.JSONObject;

/**
 * Tela única do app: um WebView com o site do Resenhex. O site conversa com o app pela ponte
 * window.ResenhexAndroid (notificações e estado da chamada; veja public/android.js no site).
 */
public class MainActivity extends Activity {
    static final String HOME = BuildConfig.SITE;
    static final String HOST = Uri.parse(HOME).getHost();
    private static final String SCHEME = Uri.parse(HOME).getScheme();

    static final String CHANNEL_MESSAGES = "mensagens";
    static final String CHANNEL_RINGS = "chamadas";
    static final String CHANNEL_UPDATES = "atualizacoes";
    static final String CHANNEL_CALL_ALERTS = "avisos-da-call";
    static final String EXTRA_NOTIFICATION = "notificationId";
    /** Espera antes de encerrar o serviço da call: trocar de sala ou voltar de uma queda não o derruba. */
    private static final long CALL_STOP_GRACE_MS = 4000;

    private static final int REQUEST_MEDIA = 1;
    private static final int REQUEST_NOTIFICATIONS = 2;
    private static final int REQUEST_FILES = 3;
    private static final String PREFS = "resenhex";

    /** Atividade aberta, para o serviço da chamada repassar os botões da notificação ao site. */
    private static MainActivity current;

    private CallWebView web;
    private FrameLayout root;
    private PermissionRequest pendingMedia;
    private ValueCallback<Uri[]> pendingFiles;
    private WebChromeClient chrome;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private final Map<Integer, String> notificationTags = new HashMap<>();
    private volatile boolean inCall;
    private String callTitle = "";
    private boolean callMuted;
    /** A atividade está na tela (CallWebView esconde isso do site durante a call). */
    private volatile boolean appVisible;
    private volatile String callServiceError = "";
    /** "Sair da call" na notificação: o serviço para na hora, sem a espera de troca de sala. */
    private boolean leavingFromNotification;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable stopCall = this::endCall;
    private Updater updater;

    // Som do DJ no processo :dj (DjService). djLast é o último estado: vai de novo se o processo reiniciar.
    private Messenger djService;
    private boolean djBound;
    private String djLast;
    private final Messenger djReplies = new Messenger(new Handler(Looper.getMainLooper()) {
        @Override
        public void handleMessage(Message message) {
            if (message.what != DjService.MSG_REPORT) return;
            String json = safeJson(message.getData().getString(DjService.KEY_JSON));
            if (json != null) callJs("_djReport", json);
        }
    });
    private final ServiceConnection djConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            djService = new Messenger(binder);
            if (djLast != null) sendDj(djLast);
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            djService = null; // o processo do DJ caiu; o Android o religa e o último estado vai de novo
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;
        createChannels(this);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#1E1F22"));
        web = new CallWebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyEdgeToEdge();
        setupWebView();

        Uri link = linkFrom(getIntent());
        web.loadUrl(link != null ? link.toString() : HOME);
        askNotificationsOnce();
        updater = new Updater(this);
        updater.checkSoon();
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = this;
        setAppVisible(true);
        // Com o app na tela, o serviço da call (re)ganha o microfone para a próxima vez que a tela bloquear.
        if (inCall) startCallService();
        if (updater != null) {
            updater.resume();
            updater.checkSoon();
        }
    }

    @Override
    protected void onPause() {
        // CallWebView mantém a página "visível" na call; o site recebe o estado real por aqui.
        setAppVisible(false);
        super.onPause();
    }

    private void setAppVisible(boolean visible) {
        appVisible = visible;
        if (web != null) callJs("_appVisibilityChanged", visible ? "true" : "false");
    }

    static MainActivity current() {
        return current;
    }

    boolean isInCall() {
        return inCall;
    }

    // ---------------- WebView ----------------

    private void setupWebView() {
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false); // sons da call e do toque tocam sem um toque antes
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " ResenhexAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true); // vídeos do YouTube no DJ
        // A call continua com o app fora da tela: o processo do site não perde prioridade.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        web.addJavascriptInterface(new Bridge(), "ResenhexAndroid");
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> openOutside(Uri.parse(url)));

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (SCHEME.equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
                if ("about".equals(uri.getScheme()) || "data".equals(uri.getScheme())) return false;
                openOutside(uri); // links de fora abrem no navegador
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // O Android encerrou o processo do site (falta de memória): recomeça a tela em vez de fechar o app.
                recreate();
                return true;
            }
        });

        chrome = new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleMediaRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingMedia == request) pendingMedia = null;
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                Intent intent = params.createIntent();
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(intent, REQUEST_FILES);
                } catch (ActivityNotFoundException e) {
                    pendingFiles = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                // Tela cheia de vídeo (transmissões): cobre o site até a pessoa sair.
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }

            @Override
            public void onHideCustomView() {
                if (fullscreenView == null) return;
                root.removeView(fullscreenView);
                fullscreenView = null;
                fullscreenCallback.onCustomViewHidden();
                fullscreenCallback = null;
            }
        };
        web.setWebChromeClient(chrome);
    }

    private void showOffline() {
        String html = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<body style='margin:0;min-height:100vh;display:grid;place-items:center;background:#1e1f22;color:#dbdee1;font:16px sans-serif;text-align:center'>"
                + "<div style='padding:24px'><h2 style='color:#fff;margin:0 0 8px'>Sem conexão com o Resenhex</h2>"
                + "<p style='margin:0 0 20px;color:#b5bac1'>Confira a internet do celular e tente de novo.</p>"
                + "<a href='" + HOME + "' style='display:inline-block;padding:12px 22px;border-radius:10px;background:#6b38e8;color:#fff;text-decoration:none;font-weight:600'>Tentar de novo</a></div>";
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    /** Edge-to-edge (obrigatório no Android 15+): o site fica entre a barra de status e a de navegação. */
    private void applyEdgeToEdge() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(0,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        if (Build.VERSION.SDK_INT < 35) return;
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsets.CONSUMED;
        });
    }

    // ---------------- microfone e câmera ----------------

    private void handleMediaRequest(PermissionRequest request) {
        Uri origin = request.getOrigin();
        if (origin == null || !HOST.equals(origin.getHost())) { request.deny(); return; }
        List<String> missing = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission = androidPermission(resource);
            if (permission != null && checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED && !missing.contains(permission)) missing.add(permission);
        }
        if (missing.isEmpty()) { grantAllowed(request); return; }
        if (pendingMedia != null) pendingMedia.deny();
        pendingMedia = request;
        requestPermissions(missing.toArray(new String[0]), REQUEST_MEDIA);
    }

    private static String androidPermission(String resource) {
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) return Manifest.permission.RECORD_AUDIO;
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) return Manifest.permission.CAMERA;
        return null;
    }

    /** Libera para o site só o que o Android liberou (o microfone pode vir sem a câmera, por exemplo). */
    private void grantAllowed(PermissionRequest request) {
        List<String> allowed = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission = androidPermission(resource);
            if (permission != null && checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) allowed.add(resource);
        }
        if (allowed.isEmpty()) request.deny();
        else request.grant(allowed.toArray(new String[0]));
    }

    // ---------------- notificações ----------------

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel messages = new NotificationChannel(CHANNEL_MESSAGES, "Mensagens", NotificationManager.IMPORTANCE_DEFAULT);
        messages.setDescription("Mensagens e menções quando o Resenhex não está na tela.");
        NotificationChannel rings = new NotificationChannel(CHANNEL_RINGS, "Ligações", NotificationManager.IMPORTANCE_HIGH);
        rings.setDescription("Quando alguém liga para você numa conversa privada.");
        rings.setSound(null, null); // o toque é o do próprio Resenhex
        NotificationChannel call = new NotificationChannel(CallService.CHANNEL, "Call em andamento", NotificationManager.IMPORTANCE_LOW);
        call.setDescription("Mantém a call conectada com a tela bloqueada.");
        call.setShowBadge(false);
        manager.createNotificationChannel(messages);
        manager.createNotificationChannel(rings);
        manager.createNotificationChannel(call);
        // Aparece por cima da tela (sem som) quando o app termina de se atualizar.
        NotificationChannel updates = new NotificationChannel(CHANNEL_UPDATES, "Atualizações do app", NotificationManager.IMPORTANCE_HIGH);
        updates.setDescription("Avisa quando o app terminou de se atualizar.");
        updates.setSound(null, null);
        manager.createNotificationChannel(updates);
        // Aparece por cima da tela e vibra: a pessoa está falando e ninguém a ouve.
        NotificationChannel alerts = new NotificationChannel(CHANNEL_CALL_ALERTS, "Avisos da call", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Avisa quando o Android pausa o seu microfone durante uma call.");
        alerts.setSound(null, null);
        alerts.enableVibration(true);
        manager.createNotificationChannel(alerts);
    }

    private boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    private String notificationPermission() {
        if (notificationsAllowed()) return "granted";
        if (Build.VERSION.SDK_INT >= 33 && !prefs().getBoolean("askedNotifications", false)) return "default";
        return "denied";
    }

    /** Na primeira abertura, pede para mostrar notificações (Android 13+). */
    private void askNotificationsOnce() {
        if (Build.VERSION.SDK_INT < 33 || notificationsAllowed() || prefs().getBoolean("askedNotifications", false)) return;
        prefs().edit().putBoolean("askedNotifications", true).apply();
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
    }

    private void showNotification(int id, String title, String body, String tag, boolean urgent) {
        if (!notificationsAllowed()) return;
        Intent open = new Intent(this, MainActivity.class).putExtra(EXTRA_NOTIFICATION, id).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, id, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, urgent ? CHANNEL_RINGS : CHANNEL_MESSAGES)
                : new Notification.Builder(this).setPriority(urgent ? Notification.PRIORITY_HIGH : Notification.PRIORITY_DEFAULT);
        builder.setSmallIcon(R.drawable.ic_stat_resenhex)
                .setColor(Color.parseColor("#6B38E8"))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setGroup(urgent ? CHANNEL_RINGS : CHANNEL_MESSAGES)
                .setCategory(urgent ? Notification.CATEGORY_CALL : Notification.CATEGORY_MESSAGE);
        if (urgent) builder.setOngoing(true).setFullScreenIntent(tap, true);
        // Mesma tag substitui a anterior, como no navegador (várias mensagens do mesmo canal viram uma).
        String key = tag.isEmpty() ? "n" + id : tag;
        notificationTags.put(id, key);
        getSystemService(NotificationManager.class).notify(key, 0, builder.build());
    }

    private void cancelNotification(int id) {
        String key = notificationTags.remove(id);
        if (key != null) getSystemService(NotificationManager.class).cancel(key, 0);
    }

    // ---------------- chamada ----------------

    /**
     * O site avisa se a pessoa está numa call. O serviço liga na entrada e só desliga quando ela sai de
     * vez: um "fim" seguido de uma nova entrada (trocar de sala, voltar de uma queda da conexão) não o
     * derruba, porque com a tela bloqueada o Android não deixaria religá-lo com o microfone. Era isso
     * que deixava a pessoa ouvindo todo mundo e muda depois de uma reconexão.
     */
    private void setCall(boolean active, String title, boolean muted) {
        if (!active) {
            if (!inCall) return;
            handler.removeCallbacks(stopCall);
            // Com o app na tela ou pela notificação, a saída é na hora; com a tela bloqueada, espera.
            if (appVisible || leavingFromNotification) endCall();
            else handler.postDelayed(stopCall, CALL_STOP_GRACE_MS);
            return;
        }
        handler.removeCallbacks(stopCall);
        leavingFromNotification = false;
        boolean starting = !inCall;
        boolean changed = starting || !title.equals(callTitle) || muted != callMuted;
        inCall = true;
        callTitle = title;
        callMuted = muted;
        if (starting) {
            web.setKeepVisible(true); // a call não desacelera com a tela bloqueada
            // Os botões de volume controlam o volume da call enquanto ela durar.
            setVolumeControlStream(AudioManager.STREAM_VOICE_CALL);
        }
        boolean hasMicrophone = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        if (changed || !CallService.ready || hasMicrophone && !CallService.microphoneReady) startCallService();
        else reportCallServiceState(null);
        if (starting && appVisible) askBattery();
    }

    /** Liga o serviço da call ou atualiza a notificação dele (com o app na tela, renova o microfone). */
    private void startCallService() {
        boolean hasMicrophone = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        Intent intent = new Intent(this, CallService.class).putExtra(CallService.EXTRA_TITLE, callTitle)
                .putExtra(CallService.EXTRA_MUTED, callMuted).putExtra(CallService.EXTRA_CAPTURE, hasMicrophone)
                .putExtra(CallService.EXTRA_VISIBLE, appVisible);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !CallService.ready) startForegroundService(intent);
            else startService(intent);
        } catch (RuntimeException error) {
            // Android 12+ sem a liberação da bateria não deixa ligar o serviço com o app fora da tela.
            reportCallServiceState(appVisible ? "foreground_service_unavailable" : "open_app_to_start_call");
        }
    }

    /** A pessoa saiu da call: desliga o serviço e devolve o volume e as atualizações do app. */
    private void endCall() {
        handler.removeCallbacks(stopCall);
        leavingFromNotification = false;
        if (!inCall) return;
        inCall = false;
        callServiceError = "";
        web.setKeepVisible(false);
        setVolumeControlStream(AudioManager.USE_DEFAULT_STREAM_TYPE);
        stopService(new Intent(this, CallService.class));
        CallService.ready = false;
        CallService.microphoneReady = false;
        stopDjSound(); // o DJ só toca dentro da call
        reportCallServiceState(null);
        updater.allowCheck(); // atualização que chegou durante a call é oferecida agora
        updater.checkSoon();
    }

    /** Estado do serviço e do microfone, para o site avisar a pessoa e para diagnóstico. */
    private JSONObject callDiagnostics() {
        JSONObject result = new JSONObject();
        try {
            boolean hasMicrophone = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            result.put("requested", inCall);
            result.put("ready", inCall && CallService.ready);
            result.put("microphoneReady", inCall && CallService.microphoneReady && hasMicrophone);
            result.put("silenced", inCall && CallService.silenced);
            result.put("microphonePermission", hasMicrophone);
            result.put("backgrounded", !appVisible);
            result.put("error", callServiceError);
            result.put("sdkInt", Build.VERSION.SDK_INT);
            result.put("appVersion", BuildConfig.VERSION_NAME);
            result.put("manufacturer", Build.MANUFACTURER);
            result.put("model", Build.MODEL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.content.pm.PackageInfo provider = WebView.getCurrentWebViewPackage();
                if (provider != null) result.put("webViewVersion", provider.versionName);
            }
            AudioManager audio = getSystemService(AudioManager.class);
            result.put("audioMode", audio.getMode());
            result.put("systemMicrophoneMuted", audio.isMicrophoneMute());
            result.put("batteryExempt", getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getPackageName()));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                int silenced = 0;
                List<AudioRecordingConfiguration> recordings = audio.getActiveRecordingConfigurations();
                for (AudioRecordingConfiguration recording : recordings) if (recording.isClientSilenced()) silenced++;
                result.put("recordingsObserved", recordings.size());
                result.put("recordingsSilenced", silenced);
            }
        } catch (Exception ignored) {
            // Diagnóstico parcial nunca deve derrubar a chamada.
        }
        return result;
    }

    private void reportCallServiceState(String error) {
        if (error != null) callServiceError = error;
        else if (inCall && CallService.ready) callServiceError = "";
        callJs("_callServiceState", callDiagnostics().toString());
    }

    /** O serviço da call mudou (ligou, falhou, parou, microfone silenciado): conta ao site. */
    static void callServiceState(String error) {
        MainActivity activity = current;
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            activity.reportCallServiceState(error);
            // O serviço caiu no meio da call (o sistema o encerrou): liga de novo.
            if (error == null && activity.inCall && !CallService.ready && activity.callServiceError.isEmpty()) activity.startCallService();
        });
    }

    /**
     * Em toda call, enquanto o Android ainda pode pausar o Resenhex, explica e pede a liberação da
     * bateria. Sem ela, com o celular bloqueado e parado (na mesa), o Android entra no modo de economia
     * profunda e a call fica muda nos dois sentidos. Depois de liberado, em marcas que têm uma economia
     * própria por cima do Android (Xiaomi, Samsung...), mostra uma vez o passo extra daquela marca.
     */
    private void askBattery() {
        PowerManager power = getSystemService(PowerManager.class);
        if (!power.isIgnoringBatteryOptimizations(getPackageName())) {
            new AlertDialog.Builder(this)
                    .setTitle("Manter a call com a tela bloqueada")
                    .setMessage("Para a call não ficar muda quando você bloquear o celular, permita que o Resenhex rode em segundo plano. "
                            + "Ele só fica ativo enquanto você está numa call.")
                    .setPositiveButton("Permitir", (dialog, which) -> {
                        try {
                            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
                        } catch (ActivityNotFoundException e) {
                            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                        }
                    })
                    .setNegativeButton("Agora não", null)
                    .show();
            return;
        }
        String steps = brandSteps();
        if (steps == null || prefs().getBoolean("brandTipShown", false)) return;
        prefs().edit().putBoolean("brandTipShown", true).apply();
        new AlertDialog.Builder(this)
                .setTitle("Um passo a mais neste celular")
                .setMessage("Este celular tem uma economia de bateria própria que pode deixar a call muda com a tela bloqueada. " + steps)
                .setPositiveButton("Abrir configurações", (dialog, which) -> openBrandSettings())
                .setNegativeButton("Depois", null)
                .show();
    }

    /** O que liberar nas marcas com economia de bateria própria; null nas que não precisam. */
    private static String brandSteps() {
        String brand = (Build.MANUFACTURER + " " + Build.BRAND).toLowerCase(java.util.Locale.ROOT);
        if (brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco"))
            return "Nas configurações do Resenhex, ative “Início automático” e, em “Economia de bateria”, escolha “Sem restrições”.";
        if (brand.contains("samsung"))
            return "Nas configurações do Resenhex, toque em “Bateria”, escolha “Sem restrições” e confira se ele não está em “Apps em suspensão”.";
        if (brand.contains("huawei") || brand.contains("honor"))
            return "Em “Inicialização de apps”, deixe o Resenhex em “Gerenciar manualmente” com todas as opções ligadas.";
        if (brand.contains("oppo") || brand.contains("realme") || brand.contains("oneplus") || brand.contains("vivo"))
            return "Nas configurações do Resenhex, toque em “Uso da bateria” e permita a atividade em segundo plano.";
        return null;
    }

    private void openBrandSettings() {
        String brand = (Build.MANUFACTURER + " " + Build.BRAND).toLowerCase(java.util.Locale.ROOT);
        if (brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco")) {
            try {
                startActivity(new Intent().setComponent(new android.content.ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")));
                return;
            } catch (Exception ignored) {
                // MIUI/HyperOS sem essa tela: cai nas configurações do app.
            }
        }
        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
    }

    // ---------------- som do DJ ----------------

    /** O som do DJ pode tocar no processo próprio dele (precisa de uma pasta de WebView por processo, Android 9+). */
    static boolean djSoundAvailable() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P;
    }

    /** Estado do DJ vindo do site: liga o processo do DJ na primeira música e o desliga quando ela para. */
    private void setDjSound(String json) {
        JSONObject state;
        try {
            state = new JSONObject(json);
        } catch (Exception e) {
            return;
        }
        if (!state.optBoolean("on") || !djSoundAvailable()) {
            stopDjSound();
            return;
        }
        djLast = state.toString();
        if (!djBound) djBound = bindService(new Intent(this, DjService.class), djConnection, BIND_AUTO_CREATE | BIND_IMPORTANT);
        if (djService != null) sendDj(djLast);
    }

    private void sendDj(String json) {
        Message message = Message.obtain(null, DjService.MSG_STATE);
        message.replyTo = djReplies;
        Bundle data = new Bundle();
        data.putString(DjService.KEY_JSON, json);
        message.setData(data);
        try {
            djService.send(message);
        } catch (RemoteException e) {
            djService = null; // reconecta em onServiceConnected e manda djLast de novo
        }
    }

    private void stopDjSound() {
        djLast = null;
        djService = null;
        if (djBound) {
            unbindService(djConnection);
            djBound = false;
        }
    }

    /** Só JSON de verdade volta para o site (a ponte do DJ também fica ao alcance do iframe do YouTube). */
    private static String safeJson(String json) {
        if (json == null) return null;
        try {
            return new JSONObject(json).toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** Botões "Silenciar" e "Sair" da notificação da call. */
    static void callAction(String action) {
        MainActivity activity = current;
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if ("leave".equals(action)) {
                activity.leavingFromNotification = true;
                // Se o site não responder (página travada), a notificação não fica presa na tela.
                activity.handler.postDelayed(() -> { if (activity.leavingFromNotification) activity.endCall(); }, 5000);
            }
            activity.callJs("_callAction", "'" + action + "'");
        });
    }

    // ---------------- ponte com o site ----------------

    private void callJs(String method, String argument) {
        web.evaluateJavascript("window.AndroidApp && window.AndroidApp." + method + "(" + argument + ")", null);
    }

    private class Bridge {
        @JavascriptInterface
        public void notify(int id, String title, String body, String tag, boolean urgent) {
            runOnUiThread(() -> showNotification(id, title, body, tag, urgent));
        }

        @JavascriptInterface
        public void cancelNotification(int id) {
            runOnUiThread(() -> MainActivity.this.cancelNotification(id));
        }

        @JavascriptInterface
        public String notificationPermission() {
            return MainActivity.this.notificationPermission();
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        && !prefs().getBoolean("deniedNotifications", false)) {
                    prefs().edit().putBoolean("askedNotifications", true).apply();
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
                } else if (!notificationsAllowed()) {
                    // Já negado: só dá para liberar nas configurações do Android.
                    openNotificationSettings();
                    callJs("_permissionResult", "'denied'");
                } else {
                    callJs("_permissionResult", "'granted'");
                }
            });
        }

        @JavascriptInterface
        public void callState(boolean active, String title, boolean muted) {
            runOnUiThread(() -> setCall(active, title, muted));
        }

        /** O app está fora da tela (tela bloqueada ou outro app), mesmo com a página "visível" na call. */
        @JavascriptInterface
        public boolean isInBackground() {
            return !appVisible;
        }

        @JavascriptInterface
        public String getCallDiagnostics() {
            return callDiagnostics().toString();
        }

        /** O som do DJ toca fora do processo da call, como mídia (Android 9+). */
        @JavascriptInterface
        public boolean djSoundAvailable() {
            return MainActivity.djSoundAvailable();
        }

        @JavascriptInterface
        public void djSound(String json) {
            runOnUiThread(() -> setDjSound(json));
        }
    }

    private void openNotificationSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
    }

    // ---------------- ciclo de vida ----------------

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQUEST_MEDIA && pendingMedia != null) {
            grantAllowed(pendingMedia);
            pendingMedia = null;
        } else if (requestCode == REQUEST_NOTIFICATIONS) {
            boolean granted = notificationsAllowed();
            if (!granted) prefs().edit().putBoolean("deniedNotifications", true).apply();
            callJs("_permissionResult", granted ? "'granted'" : "'denied'");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_FILES || pendingFiles == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                result = new Uri[data.getClipData().getItemCount()];
                for (int i = 0; i < result.length; i++) result[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        pendingFiles.onReceiveValue(result);
        pendingFiles = null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        int id = intent.getIntExtra(EXTRA_NOTIFICATION, 0);
        if (id != 0) {
            notificationTags.remove(id);
            callJs("_notificationClicked", String.valueOf(id));
            return;
        }
        Uri link = linkFrom(intent);
        if (link != null) web.loadUrl(link.toString());
    }

    private static Uri linkFrom(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        return data != null && ("https".equals(data.getScheme()) || SCHEME.equals(data.getScheme())) && HOST.equals(data.getHost()) ? data : null;
    }

    @Override
    public void onBackPressed() {
        if (fullscreenView != null) { chrome.onHideCustomView(); return; }
        if (web.canGoBack()) { web.goBack(); return; }
        // Voltar no fim do histórico só manda o app para trás: fechar a tela derrubaria a call.
        moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        if (current == this) current = null;
        handler.removeCallbacksAndMessages(null);
        stopDjSound();
        if (inCall) {
            inCall = false;
            stopService(new Intent(this, CallService.class));
        }
        web.destroy();
        super.onDestroy();
    }

    private void openOutside(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }
}
