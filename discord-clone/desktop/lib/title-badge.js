// Lê o título da página do Resenhex ("(3) geral | Resenha | Resenhex", "• geral | ...")
// para saber quantas menções e se há mensagens não lidas.
function parseTitle(title) {
  const text = String(title || '');
  const match = /^\((\d+)\)\s/.exec(text);
  const mentions = match ? Number(match[1]) : 0;
  return { mentions, unread: mentions > 0 || text.startsWith('• ') };
}

// Nome do ícone de sobreposição da barra de tarefas para o estado atual.
function badgeName({ mentions, unread }) {
  if (mentions > 9) return 'badge-9plus';
  if (mentions > 0) return `badge-${mentions}`;
  return unread ? 'badge-dot' : null;
}

module.exports = { parseTitle, badgeName };
