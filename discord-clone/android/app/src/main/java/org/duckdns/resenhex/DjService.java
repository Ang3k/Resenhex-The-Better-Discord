package org.duckdns.resenhex;

import android.annotation.SuppressLint;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Message;
import android.os.Messenger;
import android.os.RemoteException;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/**
 * Som do DJ durante a call, num processo só dele (android:process=":dj").
 *
 * Quando o site abre o microfone com o cancelamento de eco do celular, o WebView liga o "modo de
 * comunicação" para o processo inteiro: dali em diante tudo que ele toca sai na faixa da ligação
 * (qualidade de voz, volume da call), inclusive a música do DJ. Neste processo nenhum microfone é
 * aberto, então o player do YouTube daqui toca como mídia. O site do processo principal segue com o
 * vídeo, mudo, e manda para cá a faixa, o ponto da música e o volume.
 */
public class DjService extends Service {
    static final int MSG_STATE = 1; // site -> DJ: { on, trackId, videoId, live, duration, position, at, paused, volume, muted }
    static final int MSG_REPORT = 2; // DJ -> site: { type: playing | ended | error, trackId, ... }
    static final String KEY_JSON = "json";

    private DjWebView web;
    private Messenger client;
    private String pending; // estado que chegou antes da página do DJ carregar
    private boolean pageReady;

    private final Messenger messenger = new Messenger(new Handler(Looper.getMainLooper()) {
        @Override
        public void handleMessage(Message message) {
            if (message.what != MSG_STATE) return;
            if (message.replyTo != null) client = message.replyTo;
            String json = message.getData().getString(KEY_JSON);
            if (json != null) apply(json);
        }
    });

    /** A pasta só pode ser escolhida antes do primeiro WebView deste processo (o serviço pode voltar várias vezes nele). */
    private static boolean dataDirectorySet;

    @Override
    public void onCreate() {
        super.onCreate();
        // Um WebView por processo precisa de pasta própria (Android 9+); sem isso os dois processos brigam por ela.
        if (!dataDirectorySet && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            dataDirectorySet = true;
            try {
                WebView.setDataDirectorySuffix("dj");
            } catch (IllegalStateException alreadyInitialized) {
                // O WebView deste processo já começou com a pasta "dj".
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return messenger.getBinder();
    }

    @Override
    public boolean onUnbind(Intent intent) {
        stopSelf();
        return false;
    }

    private void apply(String json) {
        if (web == null) create();
        if (!pageReady) { pending = json; return; }
        web.evaluateJavascript("window.DjSom && window.DjSom.apply(" + JSONObject.quote(json) + ")", null);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void create() {
        web = new DjWebView(this);
        // Sem janela o WebView teria 0x0, e o player do YouTube não toca num espaço vazio.
        int size = 720;
        web.measure(View.MeasureSpec.makeMeasureSpec(size, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(size, View.MeasureSpec.EXACTLY));
        web.layout(0, 0, size, size);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false); // a música toca sem um toque nesta página
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " ResenhexAndroid/" + BuildConfig.VERSION_NAME + " ResenhexDj");
        web.addJavascriptInterface(new Bridge(), "ResenhexDj");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame(); // a página do DJ não sai dela mesma (links do YouTube, por exemplo)
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pending != null) {
                    String state = pending;
                    pending = null;
                    apply(state);
                }
            }
        });
        web.loadUrl(MainActivity.HOME + "dj-som.html");
    }

    private void report(String json) {
        Messenger target = client;
        if (target == null) return;
        Message message = Message.obtain(null, MSG_REPORT);
        Bundle data = new Bundle();
        data.putString(KEY_JSON, json);
        message.setData(data);
        try {
            target.send(message);
        } catch (RemoteException ignored) {
            client = null; // o app fechou
        }
    }

    private class Bridge {
        @JavascriptInterface
        public void report(String json) {
            new Handler(Looper.getMainLooper()).post(() -> DjService.this.report(json));
        }
    }

    @Override
    public void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /**
     * WebView sem janela: para o site e para o player do YouTube ele está sempre "na tela", senão o
     * player pausa a música assim que a página é escondida.
     */
    static class DjWebView extends WebView {
        DjWebView(android.content.Context context) {
            super(context);
            super.onWindowVisibilityChanged(View.VISIBLE);
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }
}
