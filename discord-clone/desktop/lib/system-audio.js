// Som do computador na transmissão de tela, sem o que o próprio Resenhex toca (vozes da chamada,
// efeitos): senão quem está na chamada se ouve de volta na transmissão. A captura que deixa um
// processo de fora existe desde o Windows 10 2004 (build 19041), mas o Chromium só a usa sozinho
// no Windows 11; antes disso fica a captura de tudo, e o site transmite sem o som do computador.
function systemAudioDevice(platform, systemVersion) {
  if (platform !== 'win32') return null;
  const build = Number(String(systemVersion).split('.')[2]) || 0;
  return build >= 19041 ? 'loopbackWithoutChrome' : 'loopback';
}

module.exports = { systemAudioDevice };
