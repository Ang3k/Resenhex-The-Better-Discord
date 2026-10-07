// Fichas biográficas de profissionais não entram no catálogo de personagens.
// A foto e o nome do intérprete nunca decidem a exclusão.
const fs = require('fs');
const path = require('path');
const reviewed = require('./pessoas-reais-revisadas.json');
const reviewedById = new Map(reviewed.entries.map((entry) => [String(entry.id), entry]));

const PROFESSIONAL = /\b(?:actor|actress|animator|filmmaker|screenwriter|producer|director|comedian|musician|singer|rapper|politician|writer|author|historian|scientist|composer|conductor|guitarist|drummer|choreographer|dancer|illustrator|cartoonist|journalist|presenter|broadcaster|entrepreneur|businessman|businesswoman|executive|athlete|basketball player|football player|sports analyst|voice artist|voice talent|voice over artist|voice-over artist)\b/i;
const NATIONALITY = /\b(?:American|British|English|Canadian|Australian|Japanese|Korean|Chinese|German|French|Italian|Irish|Scottish|Mexican|Brazilian|Swedish|Norwegian|Finnish|Russian|Indian|Indonesian|Spanish|Filipino|Taiwanese|Argentine|Argentinian|Dutch|Danish|Swiss|Austrian|Belgian|Polish|Portuguese|Welsh|New Zealand|Hong Kong)\b/i;
const YEAR = /\b(?:18|19|20)\d{2}\b/;
const strip = (value) => String(value || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const fieldLabel = (value) => value.replace(/\(s\)/gi, 's').replace(/\([^)]*\)/g, '').replace(/:$/, '').trim();

function readPersonInfobox(raw) {
  const fields = [], headers = [];
  try {
    const walk = (items) => {
      for (const item of items || []) {
        if (item.type === 'group') walk(item.data?.value);
        if (item.type === 'header') headers.push(strip(item.data?.value));
        if (item.type === 'data') fields.push({ source: String(item.data?.source || '').toLowerCase(), label: strip(item.data?.label), value: strip(item.data?.value) });
      }
    };
    for (const box of JSON.parse(raw || '[]')) walk(box.data);
  } catch { /* Sem ficha legível, não presume que o personagem seja uma pessoa real. */ }
  return { fields, headers };
}

function classifyFandomBiography(page) {
  const description = strip(page?.pageprops?.fandomdescription);
  const { fields, headers } = readPersonInfobox(page?.pageprops?.infoboxes);
  const staff = headers.some((h) => /^(?:cast\s*\/\s*crew|cast and crew|cast|voice actor|actor|actress|crew|guest star) information$/i.test(h));
  const characterHeader = headers.some((h) => /^(?:character|biological) information$/i.test(h));
  const characterFields = fields.some((f) => {
    const label = fieldLabel(f.label);
    // "Voice of" lista papéis de um dublador; "Voiced by" identifica o intérprete de um personagem.
    return /^(?:voiced by|voice actors?|voice actress|voice actresses|portrayed by|species|race)$/i.test(label)
      || /^(?:species|race|allies|enemies|voiced_by|voicedby|portrayed|actor|actress)$/i.test(f.source)
      || (f.source === 'voice' && !/^(?:voice of|voices|voice roles|characters voiced)$/i.test(label));
  });
  const definition = description.slice(0, 600).replace(/\([^)]*\)/g, ' ').replace(/\bU\.S\./g, 'US');
  const predicate = definition.match(/^.{1,200}?\b(?:is|was|are|were) (?:an?|the) ([^.!?]{1,240})/i)?.[1] || '';
  // Examina a definição do sujeito, sem confundir uma menção posterior ao criador ou a seus papéis.
  const primary = predicate.split(/\b(?:who|which|that|from|for|created|based on|about|with)\b/i)[0];
  const fictional = /^character\b|\b(?:fictional|in-universe|fictionalized|fictionalised|npc|non-player|non-playable|antagonist|protagonist)\b|\b(?:a|an|the|main|minor|supporting|recurring|playable) character\b/i.test(primary);
  const portrayedCharacter = /\b(?:is|was|are|were) (?:voiced|portrayed|played) by\b/i.test(description);
  if (characterHeader || characterFields || fictional) return null;

  const professional = PROFESSIONAL.test(primary.split(/\b(?:of|by|voiced|portrayed|played)\b/i)[0]);
  const group = !professional && /\b(?:band|group|company|television network|television channel)\b(?=\s+(?:formed|that|which|from|by|in|with|for)|[,.]|$)/i.test(primary);
  if (staff) return { kind: group ? 'biografia_grupo_real' : 'biografia_pessoa_real', reason: 'Ficha de elenco/equipe ou convidado profissional, sem ficha de personagem.' };
  const media = !professional && /\b(?:television series|animated series|film|movie|episode|song|album|soundtrack)\b(?=\s+(?:created|produced|directed|released|based|developed|that|which|from|about|by|in|with|for)|[,.]|$)/i.test(primary);
  if (group || media) return null;

  const birth = fields.some((f) => /^(?:born|birth|birthday|dateofbirth|date_of_birth|dob)$/.test(f.source) || /^(?:born|birth|birthday|date of birth)$/i.test(f.label))
    && fields.some((f) => /birth|born|\bdob\b/i.test(f.source + ' ' + f.label) && YEAR.test(f.value));
  const bornDescription = /\((?:born|b\.)[^)]{0,100}\b(?:18|19|20)\d{2}\b/i.test(description.slice(0, 300));
  const occupation = fields.some((f) => /occupation|profession/i.test(f.source + ' ' + f.label) && PROFESSIONAL.test(f.value));
  const voices = fields.some((f) => /^(?:voices|voice of|voice roles|characters voiced)$/i.test(fieldLabel(f.label)));
  if (portrayedCharacter && !(birth && voices)) return null;
  if ((professional && (NATIONALITY.test(primary) || birth || bornDescription)) || (birth && (occupation || voices))) {
    return { kind: 'biografia_pessoa_real', reason: 'Descrição profissional ou créditos de voz acompanhados de dados biográficos; sem sinais de personagem.' };
  }
  return null;
}

function realPeopleExclusions(cacheDir) {
  const entries = new Map(reviewedById);
  if (cacheDir) for (const provider of ['desenhos', 'jogos-fandom']) {
    const file = path.join(cacheDir, 'relatorios', provider + '.json');
    if (!fs.existsSync(file)) continue;
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const entry of report.excludedRealPeople || []) entries.set(String(entry.id), entry);
  }
  return entries;
}

function isRealPersonRow(row, exclusions = reviewedById) {
  return exclusions.has(String(row[0]));
}

module.exports = { classifyFandomBiography, readPersonInfobox, realPeopleExclusions, isRealPersonRow };
