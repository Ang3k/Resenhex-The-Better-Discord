// Cliente em outra origem: o jogo não pode ler o token nem os dados do Resenhex.
// Ele roda dentro da área principal do app (mount); a chamada e a lateral continuam usáveis.
window.MinecraftGame = ({ confirm, mount, onChange }) => {
  let session = null;

  function gameUrl() {
    const url = new URL('/games/minecraft/', location.href);
    if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
    else if (url.hostname === '127.0.0.1') url.hostname = 'localhost';
    else if (url.hostname === '[::1]') url.hostname = 'localhost';
    else url.hostname = 'minecraft.' + url.hostname;
    if (url.origin === location.origin) throw new Error('O jogo precisa de uma origem separada.');
    return url;
  }

  function open() {
    if (session) { onChange(); session.frame.focus(); return; }
    const url = gameUrl();
    const shell = document.createElement('section');
    shell.className = 'minecraft-shell';
    shell.setAttribute('aria-labelledby', 'minecraft-title');
    shell.innerHTML = `<header class="minecraft-toolbar">
        <div class="minecraft-heading"><span class="minecraft-mark"></span><h2 id="minecraft-title">Minecraft <span>1.8.8 · Eaglercraft</span></h2></div>
        <div class="minecraft-actions"><button type="button" class="minecraft-fullscreen" aria-label="Tela cheia" title="Tela cheia"></button><button type="button" class="minecraft-close" aria-label="Fechar Minecraft" title="Fechar Minecraft"></button></div>
      </header>
      <div class="minecraft-stage">
        <div class="minecraft-loading" role="status"><span class="minecraft-spinner"></span><strong>Abrindo Minecraft</strong><p>A primeira vez pode levar um pouco mais.</p><button type="button" class="minecraft-retry hidden">Tentar novamente</button></div>
      </div>
      <footer class="minecraft-footer"><span>WASD para mover · Espaço para pular · Esc solta o mouse</span><span>Salve e saia do mundo antes de fechar.</span></footer>`;
    shell.querySelector('.minecraft-mark').append(Icon('blocks', 20));
    const fullscreen = shell.querySelector('.minecraft-fullscreen');
    const close = shell.querySelector('.minecraft-close');
    fullscreen.append(Icon('maximize', 18));
    close.append(Icon('x', 20));
    const stage = shell.querySelector('.minecraft-stage');
    const loading = shell.querySelector('.minecraft-loading');
    const retry = shell.querySelector('.minecraft-retry');
    const frame = document.createElement('iframe');
    frame.title = 'Minecraft 1.8.8';
    frame.className = 'minecraft-frame';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allow-downloads');
    frame.setAttribute('allow', 'autoplay; fullscreen');
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'no-referrer';
    url.searchParams.set('parentOrigin', location.origin);
    let timer, closing = false, ready = false;

    function error() {
      if (session?.frame !== frame) return;
      clearTimeout(timer);
      loading.classList.remove('hidden');
      loading.querySelector('.minecraft-spinner').classList.add('hidden');
      loading.querySelector('strong').textContent = 'Não foi possível abrir o jogo';
      loading.querySelector('p').textContent = 'Tente novamente usando a versão compatível.';
      retry.classList.remove('hidden');
    }
    function launch(compatible = false) {
      clearTimeout(timer);
      ready = false;
      loading.classList.remove('hidden');
      loading.querySelector('.minecraft-spinner').classList.remove('hidden');
      loading.querySelector('strong').textContent = 'Abrindo Minecraft';
      loading.querySelector('p').textContent = 'A primeira vez pode levar um pouco mais.';
      retry.classList.add('hidden');
      if (compatible) url.searchParams.set('runtime', 'js');
      frame.src = url.href;
      timer = setTimeout(error, 90000);
    }
    const onMessage = (event) => {
      if (event.source !== frame.contentWindow || event.origin !== url.origin) return;
      if (['resenhex:minecraft:started', 'resenhex:minecraft:ready'].includes(event.data?.type)) {
        if (event.data.type === 'resenhex:minecraft:ready') ready = true;
        clearTimeout(timer);
        loading.classList.add('hidden');
        if (!mount.classList.contains('hidden')) frame.focus();
      } else if (event.data?.type === 'resenhex:minecraft:error') error();
    };
    async function finish() {
      if (closing) return;
      closing = true;
      if (document.fullscreenElement === shell) await document.exitFullscreen().catch(() => {});
      if (ready && !await confirm({ title: 'Fechar Minecraft?', text: 'Salve e saia do mundo pelo menu do jogo antes de fechar para guardar seu progresso.', confirm: 'Fechar jogo', danger: false })) {
        closing = false; close.focus(); return;
      }
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.remove(); // Libera áudio, workers e memória do cliente.
      shell.remove();
      session = null;
      onChange();
    }
    fullscreen.onclick = () => shell.requestFullscreen?.().catch(() => {});
    close.onclick = finish;
    retry.onclick = () => launch(true);
    frame.onerror = error;
    window.addEventListener('message', onMessage);
    mount.replaceChildren(shell);
    stage.prepend(frame);
    session = { frame };
    launch();
    onChange();
    frame.focus();
  }
  return { open, active: () => !!session };
};
