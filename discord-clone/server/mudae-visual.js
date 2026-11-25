// Mudae: o jeito de cada pessoa ver o seu harém. Imagens extras por personagem ($addimg, $changeimg, $randomimg) e
// preferências de texto e cor ($renameharem, $colormm, $renameclaim, $renamedivorce).
//
// Tudo mora no store da comunidade:
//   store.images[idDoPersonagem] = { list: [links], pick: 1 }   (pick 1 = a foto do catálogo; 2 em diante = list[pick - 2])
//   store.prefs[conta] = { title, color, claimText, divorceText, randomimg }
// As imagens extras pertencem a quem tem o personagem: quando ele muda de dono (divórcio, presente, troca), saem.
// Só entra link do imgur (como no Mudae do Discord): o navegador carrega a foto direto de lá, então não há como
// aceitar qualquer endereço sem expor o IP de quem abre o harém.
const { KAKERA_SHAPES, KAKERA_COLORS } = require('./mudae-regras');
const IMG_MAX = 12;
const IMG_HOSTS = new Set(['i.imgur.com']);
const TITLE_MAX = 40;
const TEXT_MAX = 120;
const PLACEHOLDERS = ['{personagem}', '{usuario}'];

const clean = (text, max) => String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const parts = (arg) => String(arg || '').split('$').map((s) => s.trim());

// Só https://i.imgur.com/<código>.<png|jpg|jpeg|gif|webp>. Devolve o link limpo ou null.
function imageLink(text) {
  let url;
  try { url = new URL(String(text || '').trim()); } catch { return null; }
  if (url.protocol !== 'https:' || !IMG_HOSTS.has(url.hostname) || url.username || url.password || url.port) return null;
  if (!/^\/[A-Za-z0-9]{5,12}\.(png|jpe?g|gif|webp)$/i.test(url.pathname)) return null;
  return `https://${url.hostname}${url.pathname}`;
}

// deps: owned, find, rows, random.
function createVisualTools(d) {
  const entry = (store, id) => store.images?.[String(id)];

  // O personagem do harém que o texto aponta, ou um erro.
  function mine(store, accountId, name) {
    if (!name) return { error: 'Diga o nome do personagem: **$addimg Gojo $ https://i.imgur.com/abc123.png**.' };
    const k = d.find(name, d.owned(store, accountId));
    if (k === null) return { error: `Você não tem ninguém chamado **${name.slice(0, 80)}** no seu harem.` };
    return { k, row: d.rows([k])[0] };
  }
  const save = (store, id, e) => {
    if (e.list.length) (store.images ||= {})[String(id)] = e;
    else if (store.images) { delete store.images[String(id)]; if (!Object.keys(store.images).length) delete store.images; }
  };

  // $addimg nome $ link $ link, $addimg remove nome $ posição, $addimg removeall nome.
  function addImage(store, accountId, arg) {
    const sub = /^(remove|removeall)\s+([\s\S]*)$/i.exec(String(arg || '').trim());
    const p = parts(sub ? sub[2] : arg);
    const found = mine(store, accountId, p[0]);
    if (found.error) return found;
    const id = String(found.row.id);
    const e = entry(store, id) || { list: [], pick: 1 };
    if (sub?.[1].toLowerCase() === 'removeall') {
      save(store, id, { list: [], pick: 1 });
      return { name: found.row.name, count: 0, removed: e.list.length };
    }
    if (sub) {
      const pos = Number(p[1]);
      if (!Number.isInteger(pos) || pos < 2 || pos > e.list.length + 1) return { error: `Diga a posição da imagem extra (de 2 a ${e.list.length + 1}): **$addimg remove Gojo $ 2**. A 1 é a foto original e não sai.` };
      e.list.splice(pos - 2, 1);
      if (e.pick === pos) e.pick = 1; else if (e.pick > pos) e.pick--;
      save(store, id, e);
      return { name: found.row.name, count: e.list.length, removed: 1 };
    }
    const links = p.slice(1).filter(Boolean);
    if (!links.length) return { error: 'Falta o link da imagem: **$addimg Gojo $ https://i.imgur.com/abc123.png**. Só aceito links diretos do imgur (i.imgur.com).' };
    const valid = [];
    for (const link of links) {
      const url = imageLink(link);
      if (!url) return { error: `Esse link não serve: **${link.slice(0, 60)}**. Use o link direto do imgur, terminado em .png, .jpg, .gif ou .webp (i.imgur.com/…).` };
      if (!e.list.includes(url) && !valid.includes(url)) valid.push(url);
    }
    if (e.list.length + valid.length > IMG_MAX) return { error: `Cada personagem aceita no máximo ${IMG_MAX} imagens extras (esse tem ${e.list.length}).` };
    e.list.push(...valid);
    save(store, id, e);
    return { name: found.row.name, count: e.list.length, added: valid.length };
  }

  // $changeimg nome $ posição: qual imagem aparece primeiro (1 = a original).
  function changeImage(store, accountId, arg) {
    const p = parts(arg);
    const found = mine(store, accountId, p[0]);
    if (found.error) return found;
    const id = String(found.row.id);
    const e = entry(store, id);
    if (!e) return { error: `**${found.row.name}** só tem a foto original. Adicione outras com **$addimg**.` };
    const pos = Number(p[1]);
    if (!Number.isInteger(pos) || pos < 1 || pos > e.list.length + 1) return { error: `Diga a posição, de 1 a ${e.list.length + 1}: **$changeimg ${found.row.name.split(' ')[0]} $ 2**.` };
    e.pick = pos;
    save(store, id, e);
    return { name: found.row.name, pick: pos };
  }

  // A foto que vale para este personagem: a escolhida e, com $randomimg ligado, uma sorteada entre todas.
  function imageFor(store, id, base, { random = false } = {}) {
    const e = entry(store, id);
    if (!e) return base;
    if (random) {
      const all = [base, ...e.list];
      return all[Math.floor(d.random() * all.length)];
    }
    return e.pick > 1 ? e.list[e.pick - 2] || base : base;
  }
  const imagesOf = (store, id) => entry(store, id)?.list.length || 0;
  function dropImages(store, id) {
    if (!store.images?.[String(id)]) return;
    delete store.images[String(id)];
    if (!Object.keys(store.images).length) delete store.images;
  }

  // ---------- preferências ----------
  const prefsOf = (store, accountId) => store.prefs?.[accountId] || {};
  function setPref(store, accountId, key, value) {
    const all = (store.prefs ||= {});
    const mine = (all[accountId] ||= {});
    if (value === null || value === undefined || value === '' || value === false || value === 0) delete mine[key]; else mine[key] = value;
    if (!Object.keys(mine).length) delete all[accountId];
    if (!Object.keys(all).length) delete store.prefs;
  }

  // $renameharem título (ou "none" para voltar ao padrão).
  function rename(store, accountId, arg, key = 'title') {
    const text = clean(arg, TITLE_MAX);
    if (!text) return { error: 'Diga o título: **$renameharem Meu cantinho**. Para voltar ao padrão: **$renameharem none**.' };
    const reset = /^(none|padrao|padrão)$/i.test(text);
    setPref(store, accountId, key, reset ? null : text);
    return { title: reset ? null : text };
  }

  // $colormm #aabbcc (ou "none").
  function color(store, accountId, arg) {
    const text = String(arg || '').trim();
    if (/^(none|padrao|padrão)$/i.test(text)) { setPref(store, accountId, 'color', null); return { color: null }; }
    const m = /^#?([0-9a-f]{6})$/i.exec(text);
    if (!m) return { error: 'Diga a cor em hexadecimal: **$colormm #ff4d94**. Para voltar ao padrão: **$colormm none**.' };
    const hex = '#' + m[1].toLowerCase();
    setPref(store, accountId, 'color', hex);
    return { color: hex };
  }

  // $renameclaim e $renamedivorce: o texto da mensagem, com {personagem} (obrigatório) e {usuario}.
  function messageText(store, accountId, key, arg) {
    const text = clean(arg, TEXT_MAX);
    if (!text) return { error: `Diga o texto, com **{personagem}** e, se quiser, **{usuario}**: **$${key === 'claimText' ? 'renameclaim' : 'renamedivorce'} {usuario} ama {personagem}!**. Para voltar ao padrão: **none**.` };
    if (/^(none|padrao|padrão)$/i.test(text)) { setPref(store, accountId, key, null); return { text: null }; }
    if (!text.includes('{personagem}')) return { error: 'O texto precisa ter **{personagem}** para mostrar o nome do personagem.' };
    const extra = text.match(/\{[^}]*\}/g)?.filter((x) => !PLACEHOLDERS.includes(x));
    if (extra?.length) return { error: `Não conheço **${extra[0]}**. Só existem {personagem} e {usuario}.` };
    setPref(store, accountId, key, text);
    return { text };
  }

  // $kakerareact cor forma: a forma que o cristal dessa cor tem NA SUA tela (gema, coração, estrela, gota, losango).
  function kakeraIcon(store, accountId, arg) {
    const words = String(arg || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').split(/\s+/).filter(Boolean);
    const icons = { ...(prefsOf(store, accountId).kakeraIcons || {}) };
    if (!words.length || words[0] === 'list' || words[0] === 'lista') return { icons, list: true };
    if (words[0] === 'reset') { setPref(store, accountId, 'kakeraIcons', null); return { icons: {}, reset: true }; }
    const color = words[0] === 'arco-iris' ? 'arcoiris' : words[0];
    if (!KAKERA_COLORS.includes(color)) return { error: `Não conheço a cor **${words[0].slice(0, 20)}**. As cores são ${KAKERA_COLORS.join(', ')}.` };
    if (words[1] === 'reset' || words[1] === 'none') {
      delete icons[color];
      setPref(store, accountId, 'kakeraIcons', Object.keys(icons).length ? icons : null);
      return { icons, color, shape: null };
    }
    if (!KAKERA_SHAPES.includes(words[1])) return { error: `Escolha a forma do cristal ${color}: ${KAKERA_SHAPES.join(', ')} (ou **reset**).` };
    icons[color] = words[1];
    setPref(store, accountId, 'kakeraIcons', icons);
    return { icons, color, shape: words[1] };
  }

  return { addImage, changeImage, kakeraIcon, imageFor, imagesOf, dropImages, prefsOf, setPref, rename, color, messageText };
}

module.exports = { createVisualTools, imageLink, IMG_MAX, IMG_HOSTS, TITLE_MAX, TEXT_MAX };
