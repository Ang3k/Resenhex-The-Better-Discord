package org.duckdns.resenhex;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
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
    static final String EXTRA_NOTIFICATION = "notificationId";

    private static final int REQUEST_MEDIA = 1;
    private static final int REQUEST_NOTIFICATIONS = 2;
    private static final int REQUEST_FILES = 3;
    private static final String PREFS = "resenhex";

    /** Atividade aberta, para o serviço da chamada repassar os botões da notificação ao site. */
    private static MainActivity current;

    private WebView web;
    private FrameLayout root;
    private PermissionRequest pendingMedia;
    private ValueCallback<Uri[]> pendingFiles;
    private WebChromeClient chrome;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private final Map<Integer, String> notificationTags = new HashMap<>();
    private boolean inCall;
    private String callTitle = "";
    private boolean callMuted;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        current = this;
        createChannels(this);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#1E1F22"));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyEdgeToEdge();
        setupWebView();

        Uri link = linkFrom(getIntent());
        web.loadUrl(link != null ? link.toString() : HOME);
        askNotificationsOnce();
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

    private void setCall(boolean active, String title, boolean muted) {
        if (active == inCall && title.equals(callTitle) && muted == callMuted) return;
        boolean starting = active && !inCall;
        inCall = active;
        callTitle = title;
        callMuted = muted;
        // Os botões de volume controlam o volume da call enquanto ela durar.
        setVolumeControlStream(active ? AudioManager.STREAM_VOICE_CALL : AudioManager.USE_DEFAULT_STREAM_TYPE);
        if (!active) {
            stopService(new Intent(this, CallService.class));
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        Intent intent = new Intent(this, CallService.class).putExtra(CallService.EXTRA_TITLE, title).putExtra(CallService.EXTRA_MUTED, muted);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
        else startService(intent);
        if (starting) askBatteryOnce();
    }

    /**
     * Na primeira call, explica e pede para o Android não pausar o Resenhex com a tela bloqueada.
     * Sem isso, alguns celulares (Xiaomi, Samsung com economia de bateria) derrubam a call.
     */
    private void askBatteryOnce() {
        PowerManager power = getSystemService(PowerManager.class);
        if (power.isIgnoringBatteryOptimizations(getPackageName()) || prefs().getBoolean("askedBattery", false)) return;
        prefs().edit().putBoolean("askedBattery", true).apply();
        new AlertDialog.Builder(this)
                .setTitle("Manter a call com a tela bloqueada")
                .setMessage("Para a call não cair quando você bloquear o celular, permita que o Resenhex rode em segundo plano. "
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
    }

    /** Botões "Silenciar" e "Sair" da notificação da call. */
    static void callAction(String action) {
        MainActivity activity = current;
        if (activity == null) return;
        activity.runOnUiThread(() -> activity.callJs("_callAction", "'" + action + "'"));
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
        if (inCall) stopService(new Intent(this, CallService.class));
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
