// Integração com o app de Android do Resenhex (pasta android/ do projeto).
// O app abre o site num WebView e expõe window.ResenhexAndroid. O WebView não tem a API de
// notificações do navegador, então ela é trocada aqui por uma que mostra a notificação do Android:
// o resto do site continua usando new Notification() normalmente.
// Durante uma chamada, o app liga um serviço que mantém a call viva com a tela bloqueada.
window.AndroidApp = (() => {
  const bridge = window.ResenhexAndroid;
  if (!bridge) return { available: false, callState() {}, onCallAction() {} };

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

  return {
    available: true,
    // Liga ou desliga o serviço de chamada (a notificação fixa "Na call").
    callState(inCall, title = '', muted = false) {
      bridge.callState(!!inCall, String(title), !!muted);
    },
    // O app chama isto quando a pessoa toca em "Silenciar" ou "Sair" na notificação da chamada.
    onCallAction(handler) { actionHandler = handler; },

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
  };
})();
