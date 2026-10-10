package org.duckdns.resenhex;

import android.content.Context;
import android.view.View;
import android.webkit.WebView;

/**
 * WebView que continua "visível" para o site enquanto a pessoa está numa call.
 *
 * Com a tela bloqueada ou o app em segundo plano, o WebView avisa o site que a página ficou
 * escondida, e o Chromium passa a rodar os timers do site 1 vez por segundo (depois de 5 minutos,
 * 1 vez por minuto). O corte de ruído do microfone, a reconexão e o resto da call dependem desses
 * timers: o microfone parava de abrir e a call ficava muda nos dois sentidos. Durante a call, o
 * serviço em primeiro plano já mantém o app vivo; aqui a página também segue como se estivesse na tela.
 */
class CallWebView extends WebView {
    private boolean keepVisible;
    private int realVisibility = View.VISIBLE;

    CallWebView(Context context) {
        super(context);
    }

    void setKeepVisible(boolean keep) {
        if (keep == keepVisible) return;
        keepVisible = keep;
        super.onWindowVisibilityChanged(keep ? View.VISIBLE : realVisibility);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        realVisibility = visibility;
        super.onWindowVisibilityChanged(keepVisible ? View.VISIBLE : visibility);
    }
}
