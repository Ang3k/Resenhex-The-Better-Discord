// Integração com o app de Android do Resenhex (pasta android/ do projeto).
// O app abre o site num WebView e expõe window.ResenhexAndroid. O WebView não tem a API de
// notificações do navegador, então ela é trocada aqui por uma que mostra a notificação do Android:
// o resto do site continua usando new Notification() normalmente.
// Durante uma chamada, o app liga um serviço que mantém a call viva com a tela bloqueada.
window.AndroidApp = (() => {
  const bridge = window.ResenhexAndroid;
  if (!bridge) return { available: false, backgrounded: false, djSound: null, callState() {}, onCallAction() {}, onAppVisibility() {}, onCallService() {}, onDjReport() {} };

  document.documentElement.classList.add('android-app');

  // ---------------- notificações ----------------
  const open = new Map(); // id -> notificação ainda na barra
  let nextId = 1;
  let pendingPermission = [];

  class AndroidNotification extends EventTarget {
    constructor(title, options = {}) {
      super();
      this.id = nextId++;
      this.title = String(title);
      this.body = String(options.body || '');
      this.tag = String(options.tag || '');
      this.onclick = null;
      open.set(this.id, this);
      bridge.notify(this.id, this.title, this.body, this.tag, !!options.requireInteraction);
    }
    close() {
      open.delete(this.id);
      bridge.cancelNotification(this.id);
    }
    static get permission() { return bridge.notificationPermission(); }
    static requestPermission(callback) {
      return new Promise((resolve) => {
        pendingPermission.push((result) => { callback?.(result); resolve(result); });
        bridge.requestNotificationPermission();
      });
    }
  }
  window.Notification = AndroidNotification;

  // ---------------- chamada ----------------
  let actionHandler = null;
  let visibilityHandler = null;
  let serviceHandler = null;
  let djHandler = null;
  // Durante a call o app mantém a página "visível" (o site não desacelera), então document.hidden
  // não diz se a tela bloqueou. O APK 1.3.1+ conta o estado real; nos anteriores, a perda de foco
  // do WebView é o sinal mais próximo.
  const nativeVisibility = typeof bridge.isInBackground === 'function';
  let backgrounded = nativeVisibility ? !!bridge.isInBackground() : false;
  function appVisibilityChanged(visible) {
    if (backgrounded === !visible) return;
    backgrounded = !visible;
    visibilityHandler?.(!!visible);
    // O motion.js pausa as animações contínuas com o app fora da tela.
    window.dispatchEvent(new CustomEvent('resenhex:app-visibility', { detail: { visible: !!visible } }));
  }
  if (!nativeVisibility) {
    window.addEventListener('blur', () => appVisibilityChanged(false));
    window.addEventListener('focus', () => appVisibilityChanged(true));
  }
  if (backgrounded) window.dispatchEvent(new CustomEvent('resenhex:app-visibility', { detail: { visible: false } }));
  // A página acabou de abrir: se ela recarregou no meio de uma call, a call acabou junto.
  bridge.callState(false, '', false);

  return {
    available: true,
    // O app está fora da tela (tela bloqueada ou outro app aberto).
    get backgrounded() { return backgrounded; },
    // Liga ou desliga o serviço de chamada (a notificação fixa "Na call").
    callState(inCall, title = '', muted = false) {
      bridge.callState(!!inCall, String(title), !!muted);
    },
    // O app chama isto quando a pessoa toca em "Silenciar" ou "Sair" na notificação da chamada.
    onCallAction(handler) { actionHandler = handler; },
    onAppVisibility(handler) { visibilityHandler = handler; },
    // Estado do serviço da call (APK 1.3.1+): ligado, com microfone, microfone pausado pelo Android.
    onCallService(handler) { serviceHandler = handler; },
    // Som do DJ fora do processo da call (APK 1.3.2+, Android 9+). Com o microfone aberto, tudo que
    // o WebView toca vai para a faixa da ligação; lá a música sai como mídia. null: toca aqui mesmo.
    djSound: typeof bridge.djSound === 'function' && bridge.djSoundAvailable?.() ? (state) => bridge.djSound(JSON.stringify(state)) : null,
    onDjReport(handler) { djHandler = handler; },

    // ---- chamados pelo app (Java) ----
    _notificationClicked(id) {
      const notification = open.get(id);
      if (!notification) return;
      open.delete(id);
      const event = new Event('click');
      notification.dispatchEvent(event);
      notification.onclick?.(event);
    },
    _permissionResult(result) {
      const waiting = pendingPermission;
      pendingPermission = [];
      for (const resolve of waiting) resolve(result);
    },
    _callAction(action) { actionHandler?.(action); },
    _appVisibilityChanged: appVisibilityChanged,
    _callServiceState(status) {
      if (typeof status === 'string') try { status = JSON.parse(status); } catch { return; }
      if (status) serviceHandler?.(status);
    },
    _djReport(report) { if (report && typeof report === 'object') djHandler?.(report); },
  };
})();
