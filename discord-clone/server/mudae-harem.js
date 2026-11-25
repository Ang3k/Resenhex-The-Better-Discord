// Mudae: cuidar do harém. Notas ($note, $fn), ordem guardada ($sortmarry) e divórcio em lote
// ($divorceseries, $divorcepage, $divorceall, $divorceallbut), todos com o jeito do Mudae do Discord.
//
// Tudo mora no store da comunidade: store.notes[conta][id] = texto e store.order[conta] = [ids na ordem].
// O divórcio em lote pede confirmação: o pedido fica só na memória, por um minuto, e quem confirma
// só solta quem ainda for seu naquela hora.
const NOTE_MAX = 200; // letras por nota
const PAGE = 15; // personagens por "página" do harém ($notepage, $divorcepage)
const PENDING_MS = 60_000;
const FIND_LIMIT = 30; // resultados do $fn

const cleanNote = (text) => String(text || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
// "Gojo $ Naruto $ texto": as partes separadas por $, sem espaços nas pontas.
const parts = (arg) => String(arg || '').split('$').map((s) => s.trim());
const pageNumber = (text) => { const n = Number(String(text).replace(/^page\s+|^pagina\s+/i, '')); return Number.isInteger(n) && n >= 1 ? n : null; };

// deps (todos vêm do createMudae): owned/ordered (listas de k), find, findSeries, lookup, release, rows, card, cardById,
// seriesOf, eqOf, idOf, normalize, refundLeft, bump, now.
function createHaremTools(d) {
  const pending = new Map();
  const idsOf = (list) => d.rows(list).map((r) => String(r.id));

  // Quais personagens do harém a lista de alvos aponta. scope: char (nomes), series (obras) ou page (números).
  function resolve(store, accountId, scope, targets) {
    const list = d.ordered(store, accountId);
    const picked = new Set();
    for (const target of targets) {
      if (scope === 'char') {
        const k = d.find(target, list);
        if (k === null) return { error: `Você não tem ninguém chamado **${target.slice(0, 80)}** no seu harem.` };
        picked.add(k);
      } else if (scope === 'series') {
        const name = d.findSeries(target);
        const ks = name ? list.filter((k) => d.seriesOf(k) === name) : [];
        if (!ks.length) return { error: `Você não tem ninguém da obra **${target.slice(0, 80)}** no seu harem.` };
        for (const k of ks) picked.add(k);
      } else {
        const n = pageNumber(target);
        const ks = n ? list.slice((n - 1) * PAGE, n * PAGE) : [];
        if (!ks.length) return { error: `A página **${target.slice(0, 20)}** do seu harém não existe. Você tem ${Math.max(1, Math.ceil(list.length / PAGE))} página(s).` };
        for (const k of ks) picked.add(k);
      }
    }
    return { ks: [...picked] };
  }

  // ---------- notas ----------
  const noteOf = (store, accountId, id) => store.notes?.[accountId]?.[String(id)] || '';

  // $note nome $ texto, $noteseries obra $ texto, $notepage 2 $ texto. Vários alvos com $ no meio; texto vazio apaga.
  function note(store, accountId, scope, arg) {
    const p = parts(arg);
    if (p.length < 2) return { error: 'Escreva o alvo, um **$** e a nota: **$note Gojo $ meu favorito**. Para apagar, deixe a nota em branco.' };
    const text = cleanNote(p[p.length - 1]);
    const targets = p.slice(0, -1).filter(Boolean);
    if (!targets.length) return { error: 'Diga a quem a nota vale: **$note Gojo $ meu favorito**.' };
    const r = resolve(store, accountId, scope, targets);
    if (r.error) return r;
    const all = (store.notes ||= {});
    const mine = (all[accountId] ||= {});
    for (const id of idsOf(r.ks)) {
      if (text) mine[id] = text; else delete mine[id];
    }
    if (!Object.keys(mine).length) delete all[accountId];
    if (!Object.keys(all).length) delete store.notes;
    if (text) d.bump(store, accountId, 'notes', r.ks.length);
    return { count: r.ks.length, removed: !text, text, first: d.card(r.ks[0]) };
  }

  // A nota de uma carta pelo id (o álbum do Salão). Texto vazio apaga.
  function noteById(store, accountId, id, text) {
    const k = d.lookup(id);
    const sid = k === undefined ? null : String(d.idOf(k));
    if (!sid || store.claims[sid]?.ownerId !== accountId) return { error: 'Esse personagem não é seu.' };
    const value = cleanNote(text);
    const all = (store.notes ||= {});
    const mine = (all[accountId] ||= {});
    if (value) { mine[sid] = value; d.bump(store, accountId, 'notes', 1); } else delete mine[sid];
    if (!Object.keys(mine).length) delete all[accountId];
    if (!Object.keys(all).length) delete store.notes;
    return { text: value };
  }

  function noteRemoveAll(store, accountId) {
    const count = Object.keys(store.notes?.[accountId] || {}).length;
    if (store.notes) delete store.notes[accountId];
    if (store.notes && !Object.keys(store.notes).length) delete store.notes;
    return { count };
  }

  // Tira a nota de uma carta que saiu do harém (divórcio, presente ou troca).
  function dropNote(store, accountId, id) {
    const mine = store.notes?.[accountId];
    if (!mine || !(String(id) in mine)) return;
    delete mine[String(id)];
    if (!Object.keys(mine).length) delete store.notes[accountId];
    if (!Object.keys(store.notes).length) delete store.notes;
  }

  // $fn texto: procura nas notas. "--palavra" tira quem tiver a palavra. all: nas notas de todo mundo ($fnall).
  function findNotes(store, accountId, query, { all = false, isMember = () => true } = {}) {
    const terms = String(query || '').split(/\s+/).filter(Boolean);
    const want = d.normalize(terms.filter((t) => !t.startsWith('--')).join(' '));
    const skip = terms.filter((t) => t.startsWith('--') && t.length > 2).map((t) => d.normalize(t.slice(2))).filter(Boolean);
    if (!want && !skip.length) return { error: 'Diga o que procurar nas notas: **$fn favorito**.' };
    const hits = [];
    for (const [owner, notes] of Object.entries(store.notes || {})) {
      if (all ? !isMember(owner) : owner !== accountId) continue;
      for (const [id, text] of Object.entries(notes)) {
        const n = d.normalize(text);
        if ((want && !n.includes(want)) || skip.some((s) => n.includes(s))) continue;
        const card = d.cardById(id);
        if (card && store.claims[id]?.ownerId === owner) hits.push({ ownerId: owner, card, note: text });
      }
    }
    hits.sort((a, b) => a.card.rank - b.card.rank);
    return { total: hits.length, items: hits.slice(0, FIND_LIMIT) };
  }

  // ---------- ordem do harém ----------
  // abc/obra/recentes/nota/valor, e "inverso" vira a ordem de ponta-cabeça. "valor" sozinho volta ao padrão.
  function sort(store, accountId, mode, reverse = false) {
    const list = d.owned(store, accountId);
    if (!list.length) return { error: 'Seu harém está vazio.' };
    if ((!mode || mode === 'value') && !reverse) {
      if (store.order) { delete store.order[accountId]; if (!Object.keys(store.order).length) delete store.order; }
      return { mode: 'value', total: list.length };
    }
    const current = d.ordered(store, accountId, list);
    const rs = d.rows(current);
    let items = current.map((k, i) => [k, rs[i]]);
    const text = (id) => noteOf(store, accountId, id);
    const by = {
      name: (a, b) => a[1].name.localeCompare(b[1].name, 'pt'),
      series: (a, b) => d.seriesOf(a[0]).localeCompare(d.seriesOf(b[0]), 'pt') || d.eqOf(a[0]) - d.eqOf(b[0]),
      recent: (a, b) => store.claims[b[1].id].at - store.claims[a[1].id].at,
      note: (a, b) => (!!text(b[1].id) - !!text(a[1].id)) || text(a[1].id).localeCompare(text(b[1].id), 'pt') || d.eqOf(a[0]) - d.eqOf(b[0]),
      value: (a, b) => d.eqOf(a[0]) - d.eqOf(b[0]),
    };
    if (mode) items.sort(by[mode]);
    if (reverse) items = items.reverse();
    (store.order ||= {})[accountId] = items.map(([, r]) => String(r.id));
    d.bump(store, accountId, 'organized');
    return { mode: mode || 'reverse', reverse, total: items.length };
  }

  // A ordem que o álbum mandou (arrastar e soltar): só entram cartas que a pessoa tem, sem repetir, e quem ficou de
  // fora segue no fim, na ordem de antes.
  function setOrder(store, accountId, ids) {
    const list = d.owned(store, accountId);
    const have = new Set(idsOf(list));
    const seen = new Set();
    const order = [];
    for (const id of (Array.isArray(ids) ? ids : []).slice(0, 5000)) {
      const s = String(id);
      if (have.has(s) && !seen.has(s)) { seen.add(s); order.push(s); }
    }
    for (const s of idsOf(d.ordered(store, accountId, list))) if (!seen.has(s)) order.push(s);
    (store.order ||= {})[accountId] = order;
    d.bump(store, accountId, 'organized', 1);
    return { total: order.length };
  }

  // ---------- divórcio em lote ----------
  // scope: series, page, all ou allbut. Não solta ninguém: guarda o pedido e mostra o que vai acontecer.
  function prepareDivorce(store, accountId, scope, arg) {
    const list = d.ordered(store, accountId);
    if (!list.length) return { error: 'Seu harém está vazio.' };
    let ks;
    let label;
    if (scope === 'all') {
      ks = list;
      label = 'todo o seu harém';
    } else if (scope === 'allbut') {
      const names = parts(arg).filter(Boolean);
      if (!names.length) return { error: 'Diga quem fica: **$divorceallbut Gojo $ Mikasa** ou **$divorceallbut page 1**.' };
      const keep = new Set();
      for (const name of names) {
        const r = pageNumber(name) && /^(page|pagina)\s/i.test(name) ? resolve(store, accountId, 'page', [name]) : resolve(store, accountId, 'char', [name]);
        if (r.error) return r;
        for (const k of r.ks) keep.add(k);
      }
      ks = list.filter((k) => !keep.has(k));
      label = `todo o harém, menos ${keep.size} personagem(ns)`;
    } else {
      const targets = parts(arg).filter(Boolean);
      if (!targets.length) return { error: scope === 'series' ? 'Diga a obra: **$divorceseries Naruto**.' : 'Diga a página: **$divorcepage 2**.' };
      const r = resolve(store, accountId, scope, targets);
      if (r.error) return r;
      ks = r.ks;
      label = scope === 'series' ? `a obra ${targets.join(', ')}` : `a página ${targets.join(', ')}`;
    }
    if (!ks.length) return { error: 'Não sobrou ninguém para divorciar.' };
    const value = ks.reduce((total, k) => total + d.card(k).value, 0);
    const left = d.refundLeft(store, accountId);
    const refund = Math.min(value, left);
    pending.set(accountId, { at: d.now(), ids: idsOf(ks), label });
    return { count: ks.length, label, value, refund, capped: refund < value, names: d.rows(ks.slice(0, 6)).map((r) => r.name), expiresIn: PENDING_MS };
  }

  const hasPending = (accountId) => { const p = pending.get(accountId); return !!p && d.now() - p.at <= PENDING_MS; };
  function cancelDivorce(accountId) { return pending.delete(accountId); }

  // Solta de verdade o que o pedido apontava (só quem ainda é da pessoa) e soma o kakera que voltou, respeitando o teto.
  function confirmDivorce(store, accountId) {
    const p = pending.get(accountId);
    pending.delete(accountId);
    if (!p || d.now() - p.at > PENDING_MS) return { error: 'Não há divórcio em lote esperando confirmação (ele vale por 1 minuto).' };
    let count = 0;
    let refund = 0;
    let value = 0;
    const names = [];
    for (const id of p.ids) {
      const k = d.lookup(id);
      if (k === undefined || store.claims[String(id)]?.ownerId !== accountId) continue;
      const out = d.release(store, accountId, k);
      count++;
      refund += out.refund;
      value += out.value;
      if (names.length < 6) names.push(out.name);
    }
    return { count, refund, value, capped: refund < value, names, label: p.label };
  }

  return { note, noteById, setOrder, noteOf, noteRemoveAll, dropNote, findNotes, sort, prepareDivorce, confirmDivorce, cancelDivorce, hasPending };
}

module.exports = { createHaremTools, NOTE_MAX, PAGE, PENDING_MS, FIND_LIMIT };
