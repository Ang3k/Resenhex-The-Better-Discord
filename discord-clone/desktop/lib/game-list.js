// Lista de jogos que o servidor do Resenhex manda (server/games.js), usada pelo overlay e pela
// transmissão que segue a partida. Renova a cada 24 h, também com o app aberto. A cópia em disco é
// a resposta inteira do servidor (lista e regras das pastas); uma cópia sem as regras é de versões
// anteriores e é baixada de novo.
// custom(): os jogos que a pessoa adicionou no app ([{ name, exe }]), somados à lista do servidor.
const fs = require('node:fs');
const { createGameMatcher, withCustom } = require('./game-detect');

const LIST_MAX_AGE = 24 * 60 * 60 * 1000;

function createGameList({ cacheFile, origin, fetch, log, custom = () => [] }) {
  let matcher = null;
  let combined = { list: null, base: null, matcher: null }; // refeito só quando uma das duas listas muda
  let savedAt = 0; // quando a lista em uso foi baixada
  let loading = null;

  function load() {
    if (loading || (matcher && Date.now() - savedAt < LIST_MAX_AGE)) return;
    if (!matcher) {
      let saved = null;
      try { saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* primeira vez */ }
      if (Array.isArray(saved?.games)) {
        matcher = createGameMatcher(saved);
        savedAt = Array.isArray(saved.folders) ? saved.savedAt || 0 : 0;
        if (Date.now() - savedAt < LIST_MAX_AGE) return;
      }
    }
    loading = (async () => {
      try {
        const response = await fetch(new URL('/api/games/detectable', origin).href);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const body = await response.json();
        if (!Array.isArray(body.games) || !body.games.length) throw new Error('lista vazia');
        matcher = createGameMatcher(body);
        savedAt = Date.now();
        fs.writeFileSync(cacheFile + '.tmp', JSON.stringify({ ...body, savedAt }));
        fs.renameSync(cacheFile + '.tmp', cacheFile);
        log.info(`Jogos: ${body.games.length} conhecidos e ${matcher.folders} pastas de lojas`);
      } catch (error) {
        log.warn('Jogos: a lista não foi baixada:', error.message);
      } finally { loading = null; }
    })();
  }

  // O reconhecedor em uso (ou null antes da primeira lista e sem jogos adicionados); pedir também renova a lista vencida.
  return {
    matcher() {
      load();
      const list = custom();
      if (combined.list !== list || combined.base !== matcher) combined = { list, base: matcher, matcher: withCustom(matcher, list) };
      return combined.matcher;
    },
  };
}

module.exports = { createGameList };
