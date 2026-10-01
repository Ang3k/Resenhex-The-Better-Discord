// Som do computador na transmissão de tela, sem o que o próprio Resenhex toca (vozes da chamada,
// efeitos): senão quem está na chamada se ouve de volta na transmissão. O Chromium só deixa o
// próprio processo de fora sozinho no Windows 11, mas a mesma captura funciona no Windows 10 22H2
// (build 19045); builds anteriores do Windows 10 aceitam o pedido e mesmo assim capturam errado
// (testado pelo Vesktop, PR #1309). Nelas fica a captura de tudo, e o site tira o som do Resenhex
// com o próprio filtro (public/own-audio.js).
function systemAudioDevice(platform, systemVersion) {
  if (platform !== 'win32') return null;
  const build = Number(String(systemVersion).split('.')[2]) || 0;
  return build >= 19045 ? 'loopbackWithoutChrome' : 'loopback';
}

module.exports = { systemAudioDevice };
