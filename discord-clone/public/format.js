// Formatação de mensagens estilo Discord (markdown simples + menções), sempre
// gerando nós do DOM (nunca innerHTML), para que texto de usuário não vire código.
window.Format = (() => {
  // A ordem importa: o primeiro padrão que casar mais cedo no texto vence.
  const INLINE = [
    ['code', /`([^`\n]+)`/],
    ['spoiler', /\|\|([\s\S]+?)\|\|/],
    ['bold', /\*\*([\s\S]+?)\*\*/],
    ['underline', /__([\s\S]+?)__/],
    ['strike', /~~([\s\S]+?)~~/],
    ['italic', /\*([^*\n]+)\*/],
    ['italic', /(?<![\w])_([^_\n]+)_(?![\w])/],
    ['link', /https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/],
    ['user', /<@([0-9a-f]{16})>/],
    ['role', /<@&([0-9a-f]{16})>/],
    ['everyone', /@(everyone|here)\b/],
  ];

  function inline(text, ctx) {
    const frag = document.createDocumentFragment();
    while (text) {
      let best = null;
      for (const [type, re] of INLINE) {
        const m = re.exec(text);
        if (m && (!best || m.index < best.m.index)) best = { type, m };
      }
      if (!best) {
        frag.append(text);
        break;
      }
      const { type, m } = best;
      frag.append(text.slice(0, m.index));
      frag.append(node(type, m, ctx));
      text = text.slice(m.index + m[0].length);
    }
    return frag;
  }

  function wrap(tag, cls, children) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.append(children);
    return el;
  }

  function mention(label, color, onclick) {
    const el = document.createElement('span');
    el.className = 'mention';
    el.textContent = label;
    if (color) {
      el.style.color = color;
      el.style.background = color + '26';
    }
    if (onclick) el.onclick = onclick;
    return el;
  }

  function node(type, m, ctx) {
    switch (type) {
      case 'code': return wrap('code', 'inline-code', m[1]);
      case 'spoiler': {
        const el = wrap('span', 'spoiler', inline(m[1], ctx));
        el.title = 'Clique para revelar';
        el.onclick = () => el.classList.add('revealed');
        return el;
      }
      case 'bold': return wrap('strong', '', inline(m[1], ctx));
      case 'underline': return wrap('u', '', inline(m[1], ctx));
      case 'strike': return wrap('s', '', inline(m[1], ctx));
      case 'italic': return wrap('em', '', inline(m[1], ctx));
      case 'link': {
        const a = document.createElement('a');
        a.href = m[0];
        a.textContent = m[0];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return a;
      }
      case 'user': {
        const member = ctx.member(m[1]);
        return mention('@' + (member?.name || 'desconhecido'), null, member && ctx.onUser ? (e) => ctx.onUser(member.id, e) : null);
      }
      case 'role': {
        const role = ctx.role(m[1]);
        return mention('@' + (role?.name || 'cargo-apagado'), role?.color || null);
      }
      case 'everyone': return mention('@' + m[1]);
    }
  }

  // Blocos de código ``` ``` e citações "> " são tratados antes do resto.
  function render(text, ctx) {
    const frag = document.createDocumentFragment();
    const parts = text.split(/```(?:[a-z0-9+-]*\n)?([\s\S]*?)```/i);
    parts.forEach((part, i) => {
      if (i % 2) {
        frag.append(wrap('pre', 'code-block', wrap('code', '', part.replace(/\n$/, ''))));
        return;
      }
      const lines = part.split('\n');
      let quote = null;
      lines.forEach((line, j) => {
        const q = /^> (.*)$/.exec(line);
        if (q) {
          quote ||= frag.appendChild(document.createElement('blockquote'));
          if (quote.childNodes.length) quote.append('\n');
          quote.append(inline(q[1], ctx));
          return;
        }
        quote = null;
        frag.append(inline(line, ctx));
        if (j < lines.length - 1) frag.append('\n');
      });
    });
    return frag;
  }

  // Texto puro (para notificações e prévias de resposta), sem símbolos de formatação
  // e sem revelar spoilers.
  function plain(text, ctx) {
    return text
      .replace(/<@([0-9a-f]{16})>/g, (_, id) => '@' + (ctx.member(id)?.name || 'desconhecido'))
      .replace(/<@&([0-9a-f]{16})>/g, (_, id) => '@' + (ctx.role(id)?.name || 'cargo'))
      .replace(/\|\|[\s\S]+?\|\|/g, '▒▒▒▒▒')
      .replace(/```[a-z0-9+-]*\n?|```/gi, '')
      .replace(/\*\*|__|~~|`/g, '')
      .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, '$1$2')
      .replace(/^> /gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // "@Nome" digitado -> <@id>. Nomes mais longos primeiro ("Ana Paula" antes de "Ana").
  function toRaw(text, members, roles) {
    const usernames = new Set(members.map((m) => (m.username || m.name).toLowerCase()));
    const counts = new Map();
    for (const m of members) counts.set(m.name.toLowerCase(), (counts.get(m.name.toLowerCase()) || 0) + 1);
    const targets = [
      ...members.map((m) => ({ name: m.username || m.name, token: `<@${m.id}>` })),
      ...members.filter((m) => m.nickname && counts.get(m.name.toLowerCase()) === 1 && !usernames.has(m.name.toLowerCase()))
        .map((m) => ({ name: m.name, token: `<@${m.id}>` })),
      ...roles.filter((r) => r.id !== 'everyone').map((r) => ({ name: r.name, token: `<@&${r.id}>` })),
    ].sort((a, b) => b.name.length - a.name.length);
    for (const t of targets) {
      const re = new RegExp(`(^|[\\s(])@${escapeRe(t.name)}(?=$|[\\s.,!?:;)])`, 'gi');
      text = text.replace(re, (_, pre) => pre + t.token);
    }
    return text;
  }

  // <@id> -> "@Nome", para editar uma mensagem.
  const toDisplay = (text, ctx) => text
    .replace(/<@([0-9a-f]{16})>/g, (all, id) => (ctx.member(id) ? '@' + ctx.member(id).name : all))
    .replace(/<@&([0-9a-f]{16})>/g, (all, id) => (ctx.role(id) ? '@' + ctx.role(id).name : all));

  return { render, plain, toRaw, toDisplay };
})();
