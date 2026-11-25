// Mudae: tabela de comandos de chat. Cada comando é uma função que recebe o contexto da mensagem e devolve a resposta
// (só para quem pediu, em `ephemeral`) ou `{ ok: true }` quando já postou no canal. Se o comando não está na tabela, ou a
// função devolve undefined, o server.js segue para os comandos antigos (os que ainda estão no if/else dele).
//
// Contexto: { acc, c, store, arg, rest, target, command, only, error }. `arg` é o texto depois do comando;
// `rest` é o mesmo sem as menções; `target` é a pessoa mencionada (ou null).
const { KEYS, LIKES, WISHES, SETTINGS, KAKERA_SHAPES, KAKERA_COLORS, POWER_RECHARGE_MS } = require('./mudae-regras');
const { TIER_ORDER } = require('./mudae-chaves');
const help = require('../public/mudae-ajuda'); // o mesmo texto do popup de ajuda do Salão

const TIER_NAME = { bronze: 'bronze', prata: 'prata', ouro: 'ouro', caos: 'caos' };
const DONE = { ok: true };

// deps: mudae, forja, parseFlags, postMudae, save (grava a comunidade).
function createCommands({ mudae, forja, parseFlags, postMudae, save, achievements = null, envyNotify = () => {} }) {
  const notice = (x, text) => x.only({ kind: 'notice', text });
  const SCOPE = { note: 'char', noteseries: 'series', notepage: 'page' };
  const DIVORCE_SCOPE = { divorceseries: 'series', divorcepage: 'page', divorceall: 'all', divorceallbut: 'allbut' };
  const SORT_LABEL = { name: 'de A a Z', series: 'por obra', recent: 'dos mais recentes', note: 'pelas notas', value: 'pelo valor (o padrão)', reverse: 'de trás para frente' };

  // ---------- cuidar do harém ----------
  function note(x) {
    const r = mudae.haremTools.note(x.store, x.acc.id, SCOPE[x.cmd], x.arg);
    if (r.error) return x.error(r.error);
    save();
    const more = r.count > 1 ? ` e mais ${r.count - 1}` : '';
    return notice(x, r.removed ? `Nota apagada de **${r.count}** personagem(ns).` : `Nota guardada em **${r.first.name}**${more}.`);
  }
  function noteRemoveAll(x) {
    const r = mudae.haremTools.noteRemoveAll(x.store, x.acc.id);
    save();
    return notice(x, r.count ? `Você apagou **${r.count}** nota(s).` : 'Você não tinha nenhuma nota.');
  }
  function findNotes(x) {
    const r = mudae.haremTools.findNotes(x.store, x.acc.id, x.arg, { all: x.cmd === 'fnall', isMember: x.isMember });
    if (r.error) return x.error(r.error);
    if (!r.total) return notice(x, 'Nenhuma nota encontrada.');
    const lines = r.items.map(({ ownerId, card, note: text }) => `• **${card.name}** (${card.series})${x.cmd === 'fnall' ? ` de <@${ownerId}>` : ''}: ${text}`);
    return notice(x, `**${r.total}** nota(s) encontrada(s)${r.total > r.items.length ? ` (mostrando ${r.items.length})` : ''}:\n${lines.join('\n')}`);
  }
  function sortMarry(x) {
    const f = parseFlags(x.arg);
    if (!x.arg || (!f.order && !f.reverse) || f.gender || f.source || f.rest) {
      return x.error('Como ordenar: **$sm abc**, **$sm obra**, **$sm recentes**, **$sm nota**, **$sm inverso** ou **$sm valor** (volta ao padrão).');
    }
    const r = mudae.haremTools.sort(x.store, x.acc.id, f.order, f.reverse);
    if (r.error) return x.error(r.error);
    save();
    return notice(x, `Seu harém agora está em ordem **${SORT_LABEL[r.mode]}**${r.reverse && r.mode !== 'reverse' ? ' (invertida)' : ''}.`);
  }
  function divorceBatch(x) {
    const r = mudae.haremTools.prepareDivorce(x.store, x.acc.id, DIVORCE_SCOPE[x.cmd], x.arg);
    if (r.error) return x.error(r.error);
    const back = r.refund ? `Voltam **${r.refund}** de kakera${r.capped ? ' (o teto de hoje corta o resto)' : ''}.` : 'Hoje o divórcio já não devolve mais kakera.';
    return notice(x, `Divorciar **${r.count}** personagem(ns) de ${r.label}? Entre eles: ${r.names.join(', ')}${r.count > r.names.length ? '…' : ''}. ${back} Digite **$confirmar** em até 1 minuto, ou **$cancelar**.`);
  }
  function confirmDivorce(x) {
    const r = mudae.haremTools.confirmDivorce(x.store, x.acc.id);
    if (r.error) return x.error(r.error);
    save();
    postMudae(x.c, x.acc, x.command, { kind: 'notice', ownerId: x.acc.id, text: `<@${x.acc.id}> se divorciou de **${r.count}** personagem(ns) (${r.label})${r.refund ? `: +${r.refund} kakera` : ''}.` });
    return DONE;
  }
  function cancelDivorce(x) {
    const had = mudae.haremTools.cancelDivorce(x.acc.id);
    return notice(x, had ? 'Divórcio em lote cancelado.' : 'Não havia nada para cancelar.');
  }

  // ---------- o jeito de ver o harém ----------
  function images(x) {
    const r = x.cmd === 'addimg' ? mudae.visual.addImage(x.store, x.acc.id, x.arg) : mudae.visual.changeImage(x.store, x.acc.id, x.arg);
    if (r.error) return x.error(r.error);
    save();
    if (x.cmd === 'changeimg') return notice(x, `**${r.name}** agora mostra a imagem **${r.pick}**${r.pick === 1 ? ' (a original)' : ''}.`);
    return notice(x, r.added !== undefined ? `**${r.name}** ganhou **${r.added}** imagem(ns). Agora são ${r.count} extra(s).` : `**${r.name}**: ${r.removed} imagem(ns) extra(s) removida(s).`);
  }
  function randomImg(x) {
    if (x.arg !== '0' && x.arg !== '1') return x.error('Use **$randomimg 1** para sortear a imagem nos seus rolls (entre a original e as extras) ou **$randomimg 0** para desligar.');
    mudae.visual.setPref(x.store, x.acc.id, 'randomimg', x.arg === '1' ? 1 : null);
    save();
    return notice(x, x.arg === '1' ? 'Nos seus rolls, a imagem agora é sorteada quando o personagem tem extras.' : 'A imagem dos seus rolls voltou ao normal.');
  }
  function look(x) {
    const v = mudae.visual;
    const r = x.cmd === 'renameharem' ? v.rename(x.store, x.acc.id, x.arg) : x.cmd === 'colormm' ? v.color(x.store, x.acc.id, x.arg)
      : v.messageText(x.store, x.acc.id, x.cmd === 'renameclaim' ? 'claimText' : 'divorceText', x.arg);
    if (r.error) return x.error(r.error);
    save();
    const value = r.title ?? r.color ?? r.text;
    return notice(x, value ? `Pronto: **${value}**.` : 'Voltou ao padrão.');
  }
  function profile(x) {
    const who = x.target || x.acc.id;
    const s = mudae.stats(x.store, who);
    const summary = mudae.summary(x.store, who, forja.shownOf(x.store, who)) || { total: 0, value: 0, favorite: null, medals: [] };
    const title = mudae.visual.prefsOf(x.store, who).title;
    postMudae(x.c, x.acc, x.command, { kind: 'profile', ownerId: who, ...summary, kakera: mudae.kakeraOf(x.store, who),
      stats: { claims: s.claims, rolls: s.rolls, crystals: s.crystals, legendary: s.legendary, divorces: s.divorces || 0, notes: s.notes || 0, keys: s.keys || 0 },
      soulmates: mudae.chaves.soulmatesOf(x.store, who).length, ...(title ? { title } : {}), ...(mudae.badgeOf(x.store, who) ? { badge: mudae.badgeOf(x.store, who) } : {}) });
    return DONE;
  }

  // ---------- chaves e soulmates ----------
  const tierLabel = (tier) => TIER_NAME[tier] || '';
  function infoKeys(x) {
    const v = mudae.keysView(x.store, x.acc.id);
    const lines = [
      `**Chaves.** Rolar um personagem **seu** sobe a chave dele (uns ${Math.round(KEYS.ownChance * 100)}% dos seus rolls caem num personagem seu). ${TIER_ORDER.map((t) => `${tierLabel(t)} ${KEYS.tiers.find((y) => y.key === t).from}+`).join(' · ')}.`,
      `Cada nível especial aumenta o valor dele. Com a chave nível ${KEYS.embedFrom} você escolhe a cor do personagem (**$embedcolor nome $ #cor**). Do nível ${KEYS.goldFrom}, rolar o personagem devolve o valor dele em kakera (até ${KEYS.goldCap} por 24 h; ainda dá para pegar **${v.goldLeft}**). Com ${KEYS.soulNeed} chaves rolladas por você, ele vira soulmate.`,
    ];
    if (!v.withKeys) lines.push('Você ainda não tem nenhuma chave.');
    else lines.push(`Suas chaves (${v.withKeys} personagem(ns)):`, ...v.top.map((c) => `• **${c.name}**: nível ${c.level} (${tierLabel(c.tier)}), ${c.soul}/${KEYS.soulNeed} soulkeys`));
    return notice(x, lines.join('\n'));
  }
  function soulmates(x) {
    const who = x.target || x.acc.id;
    const v = mudae.keysView(x.store, who);
    if (!v.soulmates.length) return notice(x, who === x.acc.id ? `Você ainda não tem soulmates. Role um personagem seu ${KEYS.soulNeed} vezes para ele virar um.` : 'Essa pessoa ainda não tem soulmates.');
    return notice(x, `**Soulmates** (${v.soulmates.length}):\n${v.soulmates.map((c) => `• **${c.name}** (${c.series}): chave ${c.level}`).join('\n')}`);
  }
  function removeKeys(x) {
    const parts = String(x.arg || '').split('$').map((s) => s.trim());
    const n = parts.length > 1 ? Number(parts[1]) : 1;
    if (!parts[0] || !Number.isInteger(n) || n < 1) return x.error('Diga quem e quantas chaves tirar: **$removekeys Gojo $ 2** (sem número, tira 1).');
    const r = mudae.removeKeys(x.store, x.acc.id, parts[0], n);
    if (r.error) return x.error(r.error);
    save();
    return notice(x, `**${r.name}** foi de chave **${r.before}** para **${r.level}**. As soulkeys continuam contando.`);
  }

  function embedColor(x) {
    const parts = String(x.arg || '').split('$').map((s) => s.trim());
    if (parts.length < 2 || !parts[0]) return x.error('Diga o personagem e a cor: **$embedcolor Gojo $ #ff4d94**. Para voltar ao padrão: **$embedcolor Gojo $ none**.');
    const r = mudae.embedColor(x.store, x.acc.id, parts[0], parts[1]);
    if (r.error) return x.error(r.error);
    save();
    return notice(x, r.color ? `**${r.name}** agora tem a cor **${r.color}**.` : `**${r.name}** voltou à cor padrão.`);
  }

  // ---------- desejos e curtidas ----------
  const names = (arg) => String(arg || '').split('$').map((s) => s.trim()).filter(Boolean);
  const done = (x, text) => { save(); return notice(x, text); };
  // $wish a $ b $ c: vários de uma vez. Um nome só segue para o comando de sempre.
  function wishMany(x) {
    const list = names(x.arg);
    if (list.length < 2) return undefined;
    const lines = [];
    let ok = 0;
    for (const name of list) {
      const r = mudae.wish(x.store, x.acc.id, name);
      if (r.error) lines.push('• ' + r.error); else { ok++; lines.push(`• **${r.card.name}** (${r.total}/${r.max})`); }
    }
    return ok ? done(x, `**${ok}** de ${list.length} desejo(s) na lista:\n${lines.join('\n')}`) : notice(x, lines.join('\n'));
  }
  const one = (x, usage) => (x.arg ? null : x.error(usage));
  function starWish(x) {
    const bad = one(x, 'Diga o personagem: **$starwish Gojo**.');
    if (bad) return bad;
    const r = mudae.starWish(x.store, x.acc.id, x.arg);
    if (r.error) return x.error(r.error);
    return done(x, `**${r.card.name}** agora é uma starwish (${r.stars}/${r.starMax}). Ela tem mais chance quando o Rubi e o Chamar desejo escolhem um desejo.`);
  }
  function starRemove(x) {
    const bad = one(x, 'Diga a starwish: **$swr Gojo**.');
    if (bad) return bad;
    const r = mudae.unstar(x.store, x.acc.id, x.arg);
    if (r.error) return x.error(r.error);
    return done(x, `**${r.card.name}** deixou de ser starwish (continua na lista de desejos).`);
  }
  function starSlot(x) {
    const r = mudae.starSlot(x.store, x.acc.id);
    if (r.error) return x.error(r.error);
    return done(x, `Você trocou **${r.cost}** vagas de desejo por uma vaga de starwish: agora são **${r.starMax}** starwish(es) e ${r.max} vagas de desejo.`);
  }
  function wishK(x) {
    const bad = one(x, 'Diga o personagem: **$wishk Gojo**.');
    if (bad) return bad;
    const r = mudae.wishK(x.store, x.acc.id, x.arg);
    if (r.error) return x.error(r.error);
    return done(x, `**${r.card.name}** é um wishk: você não recebe aviso, mas ganha **${r.reward}** de kakera quando outra pessoa casa com ele (até ${WISHES.wishkCap} por dia).`);
  }
  function wishSeries(x) {
    const bad = one(x, 'Diga a obra: **$wishseries Naruto**. Para tirar: **$wr Naruto**.');
    if (bad) return bad;
    const r = mudae.wishSeries(x.store, x.acc.id, x.arg);
    if (r.error) return x.error(r.error);
    return done(x, `Você será avisado quando qualquer personagem de **${r.series}** aparecer (${r.count}/${r.max} obras).`);
  }
  function wishDm(x) {
    if (x.arg !== '0' && x.arg !== '1') return x.error('Use **$wishdm 1** para esconder sua lista de desejos dos outros (você continua recebendo os avisos) ou **$wishdm 0** para mostrar.');
    const r = mudae.wishDm(x.store, x.acc.id, x.arg === '1');
    return done(x, r.private ? 'Sua lista de desejos agora é privada.' : 'Sua lista de desejos voltou a ser pública.');
  }
  function wishSort(x) {
    const r = mudae.wishSort(x.store, x.acc.id);
    if (r.error) return x.error(r.error);
    return done(x, `Seus ${r.total} desejos agora estão em ordem alfabética.`);
  }
  function wishPurge(x) {
    const r = mudae.wishPurge(x.store, x.acc.id);
    return r.removed ? done(x, `**${r.removed}** desejo(s) que já tinham dono saíram da lista. Sobraram ${r.total}.`) : notice(x, 'Nenhum dos seus desejos tem dono.');
  }
  function like(x) {
    const list = names(x.arg);
    if (!list.length) return x.error('Diga o personagem: **$like Gojo** (vários: **$like Gojo $ Mikasa**).');
    const lines = [];
    let ok = 0;
    let total = 0;
    for (const name of list) {
      const r = mudae.like(x.store, x.acc.id, name);
      if (r.error) lines.push(r.error); else { ok++; total = r.total; lines.push(`**${r.card.name}**`); }
    }
    if (!ok) return notice(x, lines.join('\n'));
    const extra = total >= LIKES.dailyFrom ? ` Com ${LIKES.dailyFrom} ou mais na likelist, o **$daily** guarda 2 usos.` : ` Faltam ${LIKES.dailyFrom - total} para o **$daily** guardar 2 usos.`;
    return done(x, `Na likelist (${total}): ${lines.join(', ')}.${extra}`);
  }
  function unlike(x) {
    const bad = one(x, 'Diga o personagem: **$likeremove Gojo**.');
    if (bad) return bad;
    const r = mudae.unlike(x.store, x.acc.id, x.arg);
    if (r.error) return x.error(r.error);
    return done(x, `**${r.card.name}** saiu da likelist (${r.total}).`);
  }
  function likePos(x) {
    const p = String(x.arg || '').split('$').map((s) => s.trim());
    if (p.length < 2 || !p[0]) return x.error('Diga o personagem e o lugar: **$likepos Gojo $ 1**.');
    const r = mudae.likePos(x.store, x.acc.id, p[0], Number(p[1]));
    if (r.error) return x.error(r.error);
    return done(x, `**${r.card.name}** agora é o número **${r.pos}** da likelist.`);
  }
  function likeClear(x) {
    if (String(x.arg || '').trim().toLowerCase() !== 'sim') {
      const n = (x.store.likes?.[x.acc.id] || []).length;
      return n ? notice(x, `Isso apaga **${n}** personagem(ns) da likelist. Para confirmar, digite **$likeclear sim**.`) : notice(x, 'Sua likelist já está vazia.');
    }
    const r = mudae.likeClear(x.store, x.acc.id);
    return done(x, r.count ? `Likelist limpa (${r.count} personagem(ns)).` : 'Sua likelist já estava vazia.');
  }
  function likeList(x) {
    const who = x.target || x.acc.id;
    postMudae(x.c, x.acc, x.command, { kind: 'likelist', ...mudae.likeList(x.store, who, x.acc.id) });
    return DONE;
  }
  function likeDm(x) {
    if (x.arg !== '0' && x.arg !== '1') return x.error('Use **$likedm 1** para esconder sua likelist dos outros ou **$likedm 0** para mostrar.');
    const r = mudae.likeDm(x.store, x.acc.id, x.arg === '1');
    return done(x, r.private ? 'Sua likelist agora é privada.' : 'Sua likelist voltou a ser pública.');
  }
  function renameLikeList(x) {
    if (!String(x.arg || '').trim()) return x.error('Diga o título: **$renamelikelist Meus favoritos**. Para voltar ao padrão: **none**.');
    const r = mudae.visual.rename(x.store, x.acc.id, x.arg, 'likeTitle');
    if (r.error) return x.error(r.error);
    return done(x, r.title ? `Pronto: **${r.title}**.` : 'Voltou ao padrão.');
  }

  const minutes = (ms) => { const m = Math.max(1, Math.ceil(ms / 60_000)); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`; };

  // ---------- cristais na sua tela ----------
  function kakeraReact(x) {
    const r = mudae.visual.kakeraIcon(x.store, x.acc.id, x.arg);
    if (r.error) return x.error(r.error);
    if (r.list) {
      const lines = KAKERA_COLORS.map((c) => `• ${c}: ${r.icons[c] || 'gema'}`);
      return notice(x, `Formas dos cristais na sua tela:\n${lines.join('\n')}\nPara mudar: **$kakerareact roxo estrela** (formas: ${KAKERA_SHAPES.join(', ')}). Para voltar tudo: **$kakerareact reset**.`);
    }
    save();
    if (r.reset) return notice(x, 'Todos os cristais voltaram à forma de gema.');
    return notice(x, r.shape ? `O cristal **${r.color}** agora é ${r.shape} na sua tela.` : `O cristal **${r.color}** voltou a ser gema.`);
  }

  // ---------- ajustes do servidor e moderação (precisam de "Gerenciar o Mudae") ----------
  const needMod = (x) => (x.can('MANAGE_MUDAE') ? null : x.error('Você não pode gerenciar o Mudae neste servidor.'));
  const say = (x, text) => { postMudae(x.c, x.acc, x.command, { kind: 'notice', ownerId: x.acc.id, text }); return DONE; };
  function settings(x) {
    const lines = mudae.settingsView(x.store).map((s) => `• ${s.label}: **${typeof s.def === 'boolean' ? (s.value ? 'ligado' : 'desligado') : s.value + s.unit}**${s.changed ? ' (mudado)' : ''}`);
    return notice(x, `**Ajustes do Mudae neste servidor**\n${lines.join('\n')}\nQuem tem "Gerenciar o Mudae" muda com **$settimer**, **$setrolls**, **$haremlimit**, **$togglesnipe** e **$togglecrystals**.`);
  }
  const SET_KEY = { settimer: 'claimWindowSec', setrolls: 'rolls', haremlimit: 'haremLimit', togglesnipe: 'snipe', togglecrystals: 'crystals' };
  function setSetting(x) {
    const denied = needMod(x);
    if (denied) return denied;
    const key = SET_KEY[x.cmd];
    const bool = typeof SETTINGS[key].def === 'boolean';
    if (!bool && !String(x.arg || '').trim()) return x.error(`Diga o valor: **$${x.cmd} ${SETTINGS[key].def || 100}**.`);
    const r = mudae.setSetting(x.store, key, bool ? undefined : x.arg);
    if (r.error) return x.error(r.error);
    save();
    return say(x, `<@${x.acc.id}> mudou ${r.label}: **${bool ? (r.value ? 'ligado' : 'desligado') : r.value}**.`);
  }
  function serverDisable(x) {
    const denied = needMod(x);
    if (denied) return denied;
    if (!x.arg) {
      const v = mudae.serverDisabledView(x.store);
      return notice(x, v.series.length || v.chars.length ? `O servidor tirou da roleta: ${[...v.series, ...v.chars].join(', ')}. Use o mesmo comando com o nome para voltar.` : 'O servidor não tirou nada da roleta. Use **$serverdisable obra ou personagem**.');
    }
    const r = mudae.serverDisable(x.store, x.arg);
    if (r.error) return x.error(r.error);
    save();
    const name = r.series || r.card.name;
    return say(x, `<@${x.acc.id}> ${r.back ? 'devolveu à roleta' : 'tirou da roleta de todo mundo'}: **${name}**.`);
  }
  function forceDivorce(x) {
    const denied = needMod(x);
    if (denied) return denied;
    if (!x.arg) return x.error('Diga o personagem: **$forcedivorce Gojo**.');
    const r = mudae.forceDivorce(x.store, x.acc.id, x.arg);
    if (r.error) return x.error(r.error);
    save();
    return say(x, `<@${x.acc.id}> divorciou **${r.card.name}** de <@${r.ownerId}> à força (sem kakera). Dá para desfazer com **$restore**.`);
  }
  function userDivorce(x) {
    const denied = needMod(x);
    if (denied) return denied;
    if (!x.target) return x.error('Diga de quem: **$userdivorce @pessoa**.');
    const confirmed = String(x.rest || '').trim().toLowerCase() === 'sim';
    const r = mudae.userDivorce(x.store, x.acc.id, x.target, confirmed);
    if (r.error) return x.error(r.error);
    if (r.preview) return notice(x, `Isso tira **${r.count}** personagem(ns) de <@${x.target}>, sem kakera (dá para desfazer com **$restore**). Para confirmar: **$userdivorce @pessoa sim**.`);
    save();
    return say(x, `<@${x.acc.id}> tirou os **${r.count}** personagens de <@${x.target}> (sem kakera).`);
  }
  function restoreList(x) {
    const denied = needMod(x);
    if (denied) return denied;
    const list = mudae.restoreList(x.store);
    if (!list.length) return notice(x, 'Nada para restaurar.');
    return notice(x, `**Para restaurar** (${list.length}):\n${list.slice(0, 20).map((c) => `• **${c.name}** (${c.series}), de <@${c.ownerId}>`).join('\n')}${list.length > 20 ? '\n…' : ''}`);
  }
  function restore(x) {
    const denied = needMod(x);
    if (denied) return denied;
    if (!x.arg) return x.error('Diga o personagem: **$restore Gojo** (veja a lista em **$restorelist**).');
    const r = mudae.restore(x.store, x.arg, x.isMember);
    if (r.error) return x.error(r.error);
    save();
    return say(x, `<@${x.acc.id}> devolveu **${r.card.name}** para <@${r.ownerId}>.`);
  }
  function left(x) {
    const r = mudae.left(x.store);
    return notice(x, `Ainda há **${r.free.toLocaleString('pt-BR')}** personagens livres neste servidor, de ${r.total.toLocaleString('pt-BR')} na roleta (${r.claimed.toLocaleString('pt-BR')} já têm dono).`);
  }

  // ---------- utilidades ----------
  function marryUp(x) {
    const s = mudae.status(x.store, x.acc.id);
    const extra = s.reserveReady ? ' Você também tem um casamento de reserva.' : s.reserveIn ? ` O casamento de reserva volta em ${minutes(s.reserveIn)}.` : '';
    return notice(x, (s.claimReady ? 'Você **pode casar** agora!' : `Você já casou. Dá para casar de novo em **${minutes(s.claimResetIn)}**.`) + extra);
  }
  function rollsUp(x) {
    const s = mudae.status(x.store, x.acc.id);
    return notice(x, s.rollsLeft ? `Você tem **${s.rollsLeft}** de ${s.rollsMax} rolls. Eles voltam em **${minutes(s.rollResetIn)}**.` : `Seus rolls acabaram. Eles voltam em **${minutes(s.rollResetIn)}**.`);
  }
  function bonus(x) {
    const p = mudae.perksOf(x.store, x.acc.id);
    const k = mudae.keysView(x.store, x.acc.id);
    const likes = (x.store.likes?.[x.acc.id] || []).length;
    const lines = [];
    if (p.wishSlots) lines.push(`+${p.wishSlots} vaga(s) de desejo (Bronze)`);
    if (p.carry) lines.push(`até ${p.carry} roll(s) que sobram passam para a janela seguinte (Prata)`);
    if (p.extraRolls) lines.push(`+${p.extraRolls} roll(s) por janela (Safira)`);
    if (p.crystalBonus) lines.push(`+${Math.round(p.crystalBonus * 100)}% de kakera nos cristais (Ouro)`);
    if (p.dkDouble) lines.push('$dk em dobro (Ouro IV)');
    if (p.wishChance) lines.push(`${(p.wishChance * 100).toFixed(1).replace('.0', '')}% de chance de o roll trazer um desejo (Rubi)`);
    if (p.reserveEveryMs) lines.push(`um casamento de reserva a cada ${Math.round(p.reserveEveryMs / 3600_000)} h (Esmeralda)`);
    if (p.rechargeMs && p.rechargeMs < POWER_RECHARGE_MS) lines.push(`poderes recarregam em ${Math.round(p.rechargeMs / 3600_000)} h (Diamante)`);
    if (k.withKeys) lines.push(`${k.withKeys} personagem(ns) com chave${k.soulmates.length ? ` e ${k.soulmates.length} soulmate(s)` : ''}`);
    if (likes >= LIKES.dailyFrom) lines.push('o $daily guarda 2 usos (likelist com 5 ou mais)');
    return notice(x, lines.length ? `**Seus bônus**\n${lines.map((l) => '• ' + l).join('\n')}` : 'Você ainda não tem bônus. A Forja (**$forja**) e as chaves (**$infokeys**) dão os primeiros.');
  }
  function overview(x) {
    const id = x.acc.id;
    const prefs = mudae.visual.prefsOf(x.store, id);
    const lines = [
      `Lista de desejos: ${prefs.wishPrivate ? 'privada' : 'pública'} · likelist: ${prefs.likePrivate ? 'privada' : 'pública'}`,
      `Imagem sorteada nos rolls: ${prefs.randomimg ? 'sim' : 'não'} · título do harém: ${prefs.title || 'padrão'} · cor: ${prefs.color || 'padrão'}`,
      `Formas de cristal mudadas: ${Object.keys(prefs.kakeraIcons || {}).length}`,
    ];
    return notice(x, `**Suas configurações**\n${lines.map((l) => '• ' + l).join('\n')}`);
  }

  // ---------- ajuda ----------
  // $ajuda sozinho lista os assuntos; $ajuda sortmarry ou $ajuda chaves explica na hora.
  const helpCmd = (x) => notice(x, help.chatText(x.arg));

  // ---------- conquistas ----------
  function achievementsCmd(x) {
    const v = achievements.view(x.store, x.acc.id);
    save();
    const open = v.items.filter((i) => !i.locked && !i.complete).sort((a, b) => b.pct - a.pct).slice(0, 5);
    const lines = [`**Conquistas:** ${v.done} de ${v.total}${v.titleName ? ` · título: **${v.titleName}**` : ''}`];
    if (v.queue) lines.push(`Kakera de conquistas na fila: **${v.queue}** (pagam até ${v.dailyCap} por dia; hoje ainda cabem ${v.dailyLeft}).`);
    if (v.perks.length) lines.push(`Vantagens permanentes: ${v.perks.join(', ')}.`);
    if (open.length) lines.push('Mais perto de abrir:', ...open.map((i) => `• **${i.name}** (nível ${i.tier}/${i.tiers}): ${i.have.toLocaleString('pt-BR')}/${i.need.toLocaleString('pt-BR')}`));
    lines.push('Veja todas na aba **Conquistas** do Salão e escolha um título com **$titulo nome**.');
    return notice(x, lines.join('\n'));
  }
  const fold = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  function titleCmd(x) {
    const v = achievements.view(x.store, x.acc.id);
    const word = fold(x.arg);
    if (!word) {
      if (!v.titles.length) return notice(x, 'Você ainda não abriu nenhuma conquista, então não tem título. Veja **$conquistas**.');
      return notice(x, `Seus títulos: ${v.titles.slice(0, 25).map((t) => t.name).join(', ')}.${v.titleName ? ` Agora: **${v.titleName}**.` : ''} Escolha com **$titulo nome** ou tire com **$titulo none**.`);
    }
    if (word === 'none' || word === 'nenhum') { achievements.setTitle(x.store, x.acc.id, null); return done(x, 'Você ficou sem título.'); }
    const hit = v.titles.find((t) => fold(t.name) === word) || v.titles.find((t) => fold(t.name).includes(word));
    if (!hit) return x.error(`Você não tem nenhum título com **${String(x.arg).slice(0, 40)}**. Veja a lista com **$titulo**.`);
    achievements.setTitle(x.store, x.acc.id, hit.key);
    return done(x, `Seu título agora é **${hit.name}**.`);
  }

  // ---------- outros rankings do servidor ----------
  const BOARDS = {
    topservv: { metric: 'v', title: 'Haréns mais valiosos' },
    topservk: { metric: 'k', title: 'Mais kakera guardado', unit: 'kakera' },
    topservy: { metric: 'y', title: 'Mais chaves', unit: 'chaves' },
    topservn: { metric: 'nbr', title: 'Mais personagens', unit: 'personagens' },
    topservlc: { metric: 'lc', title: 'Último casamento' },
    topservu: { metric: 'u', title: 'Os mais azarados do servidor', unit: 'rolls de casados', roast: 'Quem mais rolou personagem que já tinha dono. Um abraço para o primeiro lugar.' },
  };
  const BOARD_ARG = { v: 'topservv', valor: 'topservv', k: 'topservk', kakera: 'topservk', y: 'topservy', chaves: 'topservy', nbr: 'topservn', n: 'topservn', lc: 'topservlc', lastclaim: 'topservlc', u: 'topservu', azar: 'topservu', azarados: 'topservu' };
  function topServer(x) {
    const key = x.cmd === 'topserv' ? BOARD_ARG[String(x.arg || '').trim().toLowerCase()] : x.cmd;
    if (!key) return undefined; // $topserv puro (ou com texto que não é um ranking): o ranking de sempre
    const b = BOARDS[key];
    if (b.metric === 'v') return undefined;
    const rows = mudae.board(x.store, b.metric, x.isMember);
    postMudae(x.c, x.acc, x.command, { kind: 'topserv', title: b.title, ...(b.unit ? { unit: b.unit } : {}), ...(b.roast && rows.length ? { roast: b.roast } : {}), rows });
    return DONE;
  }

  // ---------- inveja ----------
  // $inveja nome: um aviso (público, para todo mundo rir) ao dono do personagem. O dono também recebe um toque no Salão.
  function envy(x) {
    if (!String(x.arg || '').trim()) return x.error('Diga o personagem: **$inveja Gojo**');
    const r = mudae.envy(x.store, x.acc.id, x.arg);
    if (r.error) return x.error(r.error);
    save();
    envyNotify(r.ownerId, { card: { id: r.card.id, name: r.card.name, image: r.card.image }, by: x.acc.id, line: r.line });
    const text = r.line.replace('{quem}', `<@${x.acc.id}>`).replace('{personagem}', `**${r.card.name}**`);
    postMudae(x.c, x.acc, x.command, { kind: 'notice', text: `<@${r.ownerId}> ${text}` });
    return DONE;
  }

  const table = {
    inveja: envy,
    note, noteseries: note, notepage: note, noteremoveall: noteRemoveAll, fn: findNotes, fnall: findNotes, sortmarry: sortMarry,
    divorceseries: divorceBatch, divorcepage: divorceBatch, divorceall: divorceBatch, divorceallbut: divorceBatch, confirm: confirmDivorce, cancel: cancelDivorce,
    addimg: images, changeimg: images, randomimg: randomImg, renameharem: look, colormm: look, renameclaim: look, renamedivorce: look, profile,
    infokeys: infoKeys, sl: soulmates, removekeys: removeKeys, embedcolor: embedColor,
    wish: wishMany, starwish: starWish, starremove: starRemove, starslot: starSlot, wishk: wishK, wishseries: wishSeries, wishdm: wishDm, wishsort: wishSort, wishpurge: wishPurge,
    kakerareact: kakeraReact,
    settings, settimer: setSetting, setrolls: setSetting, haremlimit: setSetting, togglesnipe: setSetting, togglecrystals: setSetting, serverdisable: serverDisable,
    forcedivorce: forceDivorce, userdivorce: userDivorce, restorelist: restoreList, restore, left, mu: marryUp, ru: rollsUp, bonus, overview,
    ajuda: helpCmd,
    ...(achievements ? { conquistas: achievementsCmd, titulo: titleCmd } : {}),
    like, likeremove: unlike, likepos: likePos, likeclear: likeClear, likelist: likeList, likedm: likeDm, renamelikelist: renameLikeList,
    topserv: topServer, topservk: topServer, topservy: topServer, topservn: topServer, topservlc: topServer, topservu: topServer,
  };
  return table;
}

module.exports = { createCommands };
