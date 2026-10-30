// Movimento compartilhado pelas telas: saídas animadas e entradas que recomeçam.
// Durações e curvas ficam só no motion.css; o JS apenas espera a animação que o CSS começou.
// Com "Reduzir animações" (ou a preferência do sistema) o CSS não anima nada, e tudo acontece na hora.
window.Motion = (() => {
  const SAFETY_MS = 600; // aba em segundo plano ou animação que não termina: o nó não fica preso na tela

  // Chama done quando as animações e transições finitas do próprio nó terminam (ou na hora, se não houver).
  function settle(node, done) {
    const running = (node.getAnimations?.() || []).filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
    if (!running.length) { done(); return; }
    let called = false;
    const finish = () => { if (!called) { called = true; done(); } };
    Promise.allSettled(running.map((a) => a.finished)).then(finish);
    setTimeout(finish, SAFETY_MS);
  }

  const api = {
    // Tira da página um nó criado na hora (confirmação, diálogo, folha) depois da saída dele: ganha .leaving,
    // fica inerte para não receber clique nem foco, e some quando a animação do CSS acaba.
    leave(node, done) {
      if (!node?.isConnected) { done?.(); return; }
      if (node.classList.contains('leaving')) return; // já saindo: a primeira chamada termina o serviço
      node.classList.add('leaving');
      node.inert = true;
      settle(node, () => { node.remove(); done?.(); });
    },
    // Deixa uma cópia inerte do painel esmaecendo no lugar dele, para o original ser escondido e reaproveitado
    // na hora (o menu de contexto muda de classes e de largura a cada abertura). A cópia vem logo depois do
    // original, então $('#context-menu') continua achando o de verdade.
    fadeCopy(node) {
      if (!node.getAnimations || node.classList.contains('hidden')) return;
      const copy = node.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      node.after(copy);
      api.leave(copy);
    },
    // Roda fn quando um painel escondido com .hidden termina de sair, se ninguém o reabriu no meio.
    // Serve para limpar o que mudaria o desenho do painel durante a saída (classes, largura, imagem).
    afterHide(node, fn) {
      settle(node, () => { if (node.classList.contains('hidden')) fn(); });
    },
    // Recomeça a animação de entrada de um nó que continua na tela (ex.: a lista ao trocar de canal).
    replay(node) {
      if (!node) return;
      node.style.animation = 'none';
      void node.offsetWidth;
      node.style.animation = '';
    },
  };

  // Janela em segundo plano: aba escondida, janela sem foco (jogo na frente, app minimizado) ou app de Android
  // fora da tela. As animações contínuas que sobraram (quem fala, carregando, DJ, chamada tocando) param
  // (motion.css, .bg-window). No app de Windows a página minimizada continua "visível" para o site
  // (backgroundThrottling: false), então o foco da janela é o sinal; foco que foi para um iframe do app não conta.
  const root = document.documentElement;
  let androidHidden = false;
  const syncBackground = () => root.classList.toggle('bg-window', document.hidden || androidHidden || !document.hasFocus());
  document.addEventListener('visibilitychange', syncBackground);
  window.addEventListener('focus', syncBackground);
  window.addEventListener('blur', () => setTimeout(syncBackground, 0));
  window.addEventListener('resenhex:app-visibility', (e) => { androidHidden = !e.detail?.visible; syncBackground(); });
  syncBackground();
  return api;
})();
