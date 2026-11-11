// Ícones próprios do Mudae: o kakera, os 8 poderes e os símbolos das linhas do bot (casamento, desejo, medalha,
// troca, fontes dos personagens…). Mesma linguagem do Icon() de icons.js (quadro de 24, traço 2 redondo, currentColor),
// com uma camada de cor por baixo (.mi-tone) e pedacinhos que se mexem (.mi-glint, .mi-spark…), animados no
// mudae-icones.css. Os nomes dos poderes são as chaves de POWER (mudae.js): MudaeIcon('cadeado').
// O que não está aqui (dice, gamepad, clapperboard, sparkles, check, link…) vem do Icon() do app.
window.MudaeIcon = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const tone = (o = 0.22, cls = '') => `class="mi-tone${cls ? ' ' + cls : ''}" fill="currentColor" fill-opacity="${o}" stroke="none"`;
  const TONE = tone();
  const FILL = 'fill="currentColor" stroke="none"';
  // Brilho de quatro pontas (o kakera e o anel piscam com ele).
  const glint = (x, y, r = 2.6) => {
    const a = +(r * 0.28).toFixed(2), b = +(r * 0.72).toFixed(2);
    return `<path class="mi-glint" ${FILL} d="M${x} ${y - r}l${a} ${b} ${b} ${a}-${b} ${a}-${a} ${b}-${a}-${b}-${b}-${a} ${b}-${a}z"/>`;
  };
  const KAKERA = 'M12 1.5 18.5 8v8L12 22.5 5.5 16V8z';
  const HEART = 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z';
  const STAR = 'M11.5 2.8a.6.6 0 0 1 1 0l2.6 5.3 5.9.9a.6.6 0 0 1 .3 1l-4.2 4.1 1 5.8a.6.6 0 0 1-.8.6L12 17.8l-5.3 2.7a.6.6 0 0 1-.8-.6l1-5.8-4.2-4.1a.6.6 0 0 1 .3-1l5.9-.9z';
  const LEAF = 'M12 11.4C10.2 10 8.1 8.7 8.1 6.6a2.1 2.1 0 0 1 3.9-1.1 2.1 2.1 0 0 1 3.9 1.1c0 2.1-2.1 3.4-3.9 4.8z';
  const CLOUD = 'M7 13.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 5.8a3.9 3.9 0 0 1 .5 7.7z';
  const SHOOT = 'M14.5 3 16.15 7.23 20.68 7.49 17.16 10.37 18.32 14.76 14.5 12.3 10.68 14.76 11.84 10.37 8.32 7.49 12.85 7.23z';
  const drop = (x, y) => `<path class="mi-drop" fill="currentColor" stroke-width="1.2" d="M${x} ${y}l1.2 1.9-1.2 1.9-1.2-1.9z"/>`;

  const P = {
    // Kakera: o mesmo cristal que voa no Salão, pontudo em cima e embaixo. Face da esquerda clara, da direita escura.
    kakera: `<path ${TONE} d="${KAKERA}"/><path ${tone(0.35, 'mi-face-l')} d="M12 1.5 5.5 8v8l6.5 6.5L9 16V8z"/>`
      + `<path d="${KAKERA}"/><path class="mi-detail" d="M12 1.5 9 8v8l3 6.5M12 1.5 15 8v8l-3 6.5"/><path class="mi-small" d="M12 1.5v21"/>${glint(19.6, 3.6)}`,
    // Os poderes.
    videncia: `<circle ${TONE} cx="12" cy="10" r="7.5"/><circle cx="12" cy="10" r="7.5"/><path d="M7.5 15.9 6 20.5h12l-1.5-4.6"/>`
      + `<path class="mi-detail" stroke-width="1.5" d="M8.3 8.2a4.3 4.3 0 0 1 2.1-2.4"/><path class="mi-spark" ${FILL} d="M12.4 5.9l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1z"/>`,
    cadeado: `<rect ${TONE} x="4" y="10.5" width="16" height="11" rx="2.5"/><path class="mi-shackle" d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5"/>`
      + `<rect x="4" y="10.5" width="16" height="11" rx="2.5"/><g class="mi-key"><circle ${FILL} cx="12" cy="15" r="1.7"/><path d="M12 15.5v2.6"/></g>`,
    amuleto: `<g class="mi-leaves">${[0, 90, 180, 270].map((a) => `<path ${TONE} transform="rotate(${a} 12 12)" d="${LEAF}"/><path transform="rotate(${a} 12 12)" d="${LEAF}"/>`).join('')}</g>`
      + '<path d="M13.4 13.4c2 1.6 3.6 4.1 4.6 7.6"/>',
    chuva: `<path ${TONE} d="${CLOUD}"/><path d="${CLOUD}"/>${drop(7.6, 15.6)}${drop(12.3, 17.6)}${drop(17, 15.6)}`,
    desejo: `<g class="mi-star"><path ${tone(0.35)} d="${SHOOT}"/><path d="${SHOOT}"/></g><path class="mi-trail" d="M9 16.5 3.5 22M6.6 13.4 3 15.6M12 19.3l-1.6 2.6"/>`,
    eco: `<g class="mi-arrows"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/></g>`
      + `<rect ${TONE} x="9" y="8" width="6" height="8" rx="1.3"/><rect class="mi-card" x="9" y="8" width="6" height="8" rx="1.3"/>`,
    dupla: '<path class="mi-back" d="M13 6.5v-1a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4.5"/>'
      + `<g class="mi-front"><rect ${TONE} x="9.5" y="6.5" width="11" height="15" rx="2"/><rect x="9.5" y="6.5" width="11" height="15" rx="2"/><path ${FILL} d="M15 10.8l2.3 3.2-2.3 3.2-2.3-3.2z"/></g>`,
    laco: `<g class="mi-loop"><ellipse ${tone(0.14)} transform="rotate(-20 13.5 8.5)" cx="13.5" cy="8.5" rx="8" ry="4.3"/><ellipse transform="rotate(-20 13.5 8.5)" cx="13.5" cy="8.5" rx="8" ry="4.3"/></g>`
      + `<path d="M9.2 13.2c-1.4 1.8-.8 3.4.4 4.4s.6 3.2-3 4.1"/><circle ${FILL} cx="9.2" cy="13.2" r="1.9"/>`,
    // Os símbolos das linhas.
    ring: `<circle cx="12" cy="15" r="6.5"/><path ${tone(0.45)} d="M8.6 5.6 10.2 3h3.6l1.6 2.6L12 9z"/><path d="M8.6 5.6 10.2 3h3.6l1.6 2.6L12 9zM8.6 5.6h6.8"/>${glint(19, 5)}`,
    heart: `<path ${tone(0.4)} d="${HEART}"/><path d="${HEART}"/>`,
    heartBreak: `<path ${TONE} d="${HEART}"/><path d="${HEART}"/><path d="M12 5 10.4 9.2l3.1 2.4-2.6 3.4 1.1 3"/>`,
    wish: `<path ${tone(0.4)} d="${STAR}"/><path d="${STAR}"/>`,
    medal: `<path d="M6.5 2.5H10l2.6 6.3M17.5 2.5H14l-1.4 3.4"/><circle ${TONE} cx="12" cy="15.5" r="5.8"/><circle cx="12" cy="15.5" r="5.8"/>`
      + `<path class="mi-detail" ${FILL} d="M12 12.6l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>`,
    trophy: `<path ${TONE} d="M7 3h10v6a5 5 0 0 1-10 0z"/><path d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H4.8a2.3 2.3 0 0 0 0 4.6h2.6M17 5h2.2a2.3 2.3 0 0 1 0 4.6h-2.6M12 14v3.5M8 21h8M9.6 21l.6-3.5h3.6l.6 3.5"/>`,
    obra: `<path ${TONE} d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5z"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>`
      + `<path ${FILL} d="M10 2h4.5v7.5l-2.25-1.6L10 9.5z"/>`,
    bolt: `<path ${tone(0.4)} d="M13 2 4 14h7l-1 8 9-12h-7z"/><path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`,
    flame: `<path ${TONE} d="M12 2.5c.6 3.2 3.4 5 5 7.6a7 7 0 1 1-11.6 1c.5 1.5 1.5 2.4 2.8 2.7-.6-4.2 1.6-8.3 3.8-11.3z"/>`
      + '<path d="M12 2.5c.6 3.2 3.4 5 5 7.6a7 7 0 1 1-11.6 1c.5 1.5 1.5 2.4 2.8 2.7-.6-4.2 1.6-8.3 3.8-11.3z"/>'
      + `<path class="mi-core" ${FILL} fill-opacity=".85" d="M12 21a3.2 3.2 0 0 0 3.2-3.2c0-1.9-1.6-3-3.2-4.8-1.6 1.8-3.2 2.9-3.2 4.8A3.2 3.2 0 0 0 12 21z"/>`,
    emerald: `<path d="M8 2.5h8l4 4v11l-4 4H8l-4-4v-11z"/><path class="mi-detail" stroke-width="1.5" d="M6 4.5 8.5 7M18 4.5 15.5 7M6 19.5 8.5 17M18 19.5 15.5 17"/><rect ${tone(0.5)} x="8.5" y="7" width="7" height="10" rx=".8"/><rect x="8.5" y="7" width="7" height="10" rx=".8"/>`,
    trade: '<path d="M4 8h15M15.5 4.5 19 8l-3.5 3.5M20 16H5M8.5 12.5 5 16l3.5 3.5"/>',
    gift: `<rect ${TONE} x="5" y="12" width="14" height="9" rx="1"/><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>`
      + '<path class="mi-bow" d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    thief: `<path ${tone(0.35)} d="M2.5 10c0-2.2 2.2-3.5 5-3.5 2 0 3.2 1 4.5 1s2.5-1 4.5-1c2.8 0 5 1.3 5 3.5 0 3.4-2.1 6-4.8 6-2.2 0-3.3-2-4.7-2s-2.5 2-4.7 2c-2.7 0-4.8-2.6-4.8-6z"/>`
      + '<path d="M2.5 10c0-2.2 2.2-3.5 5-3.5 2 0 3.2 1 4.5 1s2.5-1 4.5-1c2.8 0 5 1.3 5 3.5 0 3.4-2.1 6-4.8 6-2.2 0-3.3-2-4.7-2s-2.5 2-4.7 2c-2.7 0-4.8-2.6-4.8-6z"/>'
      + '<path stroke-width="1.6" d="M5.8 10.9c.8-1.1 2.8-1.2 3.7 0-.9 1.1-2.8 1.1-3.7 0zM14.5 10.9c.9-1.2 2.9-1.1 3.7 0-.9 1.1-2.8 1.1-3.7 0z"/>',
    spark: `<path ${FILL} d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z"/>`,
    // As fontes dos personagens (Jogos e Séries usam o gamepad e a claquete do Icon()).
    torii: '<path d="M2 4c3.5 1.6 16.5 1.6 20 0M4.5 9.5h15M6.5 5.3V21M17.5 5.3V21M12 5.5v4"/>',
    comic: `<path ${TONE} d="M13.74 2.15 15.22 6.94 18.88 7.18 17.86 10.7 21.85 13.74 17.06 15.22 16.82 18.88 13.3 17.86 10.26 21.85 8.78 17.06 5.12 16.82 6.14 13.3 2.15 10.26 6.94 8.78 7.18 5.12 10.7 6.14z"/>`
      + '<path d="M13.74 2.15 15.22 6.94 18.88 7.18 17.86 10.7 21.85 13.74 17.06 15.22 16.82 18.88 13.3 17.86 10.26 21.85 8.78 17.06 5.12 16.82 6.14 13.3 2.15 10.26 6.94 8.78 7.18 5.12 10.7 6.14z"/>'
      + '<path d="M12 9v3.4M12 15.4h.01"/>',
    tv: `<rect ${TONE} x="5.5" y="10" width="10.5" height="8" rx="1.5"/><rect x="2.5" y="7" width="19" height="14" rx="3"/><path d="M8 2.5l4 4.5 4-4.5M18.6 11v.01M18.6 14v.01"/>`,
  };
  const POWERS = ['videncia', 'cadeado', 'amuleto', 'chuva', 'desejo', 'eco', 'dupla', 'laco'];

  function MudaeIcon(name, size = 20) {
    if (!P[name]) {
      const svg = window.Icon ? window.Icon(name, size) : document.createElementNS(NS, 'svg');
      svg.classList.add('mi', 'mi-' + name);
      return svg;
    }
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    // Mesmo peso ótico do Icon(): abaixo de 18 px o traço engrossa e os detalhes finos somem.
    if (size < 18) svg.style.setProperty('--ico-stroke', (36 / size).toFixed(2));
    svg.classList.add('ico', 'mi', 'mi-' + name);
    if (size < 18) svg.classList.add('mi-sm');
    if (POWERS.includes(name)) { svg.classList.add('mi-power'); svg.dataset.power = name; }
    svg.innerHTML = P[name];
    return svg;
  }
  // No meio do texto: acompanha o tamanho da letra. label é o que o leitor de tela fala no lugar do símbolo.
  MudaeIcon.inline = (name, label = '', extra = '') => {
    const span = document.createElement('span');
    span.className = 'mi-inline' + (extra ? ' ' + extra : '');
    if (label) { span.setAttribute('role', 'img'); span.setAttribute('aria-label', label); } else span.setAttribute('aria-hidden', 'true');
    span.append(MudaeIcon(name, 16));
    return span;
  };
  MudaeIcon.has = (name) => !!P[name];
  MudaeIcon.names = Object.keys(P);
  MudaeIcon.POWERS = POWERS;
  return MudaeIcon;
})();
