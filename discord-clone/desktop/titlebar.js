const button = document.getElementById('update');
button.addEventListener('click', () => window.titlebar.installUpdate());
window.titlebar.onState(({ theme, update }) => {
  document.documentElement.style.setProperty('--bg', theme.background);
  document.documentElement.style.setProperty('--fg', theme.foreground);
  button.classList.toggle('show', !!update);
  if (update) button.title = `Versão ${update.version} baixada. Clique para reiniciar o Resenhex e instalar.`;
});
window.titlebar.ready();
