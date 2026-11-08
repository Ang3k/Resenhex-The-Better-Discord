// Enquetes do chat da chamada: uma pergunta, de 2 a 6 opções e quem votou em cada uma (com foto, entre
// amigos o divertido é ver quem votou em quê). Um voto por pessoa, que dá para trocar enquanto está aberta.
// A enquete mora numa mensagem (msg.poll); aqui ficam só as regras, sem socket nem banco.

const MAX_QUESTION = 200;
const MAX_OPTION = 80;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
// Durações oferecidas, em ms. 0 = fica aberta até alguém encerrar.
const DURATIONS = [60 * 1000, 5 * 60 * 1000, 0];

const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

class PollError extends Error {}

function create({ question, options, duration }, now = Date.now()) {
  question = clean(question, MAX_QUESTION);
  if (!question) throw new PollError('Escreva a pergunta da enquete.');
  const texts = (Array.isArray(options) ? options : []).map((o) => clean(o, MAX_OPTION)).filter(Boolean);
  if (texts.length < MIN_OPTIONS) throw new PollError('A enquete precisa de pelo menos 2 opções.');
  if (texts.length > MAX_OPTIONS) throw new PollError('A enquete pode ter até 6 opções.');
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) throw new PollError('Tem opções repetidas.');
  duration = Number(duration);
  if (!DURATIONS.includes(duration)) throw new PollError('Duração inválida.');
  return { question, options: texts.map((text) => ({ text, votes: [] })), endsAt: duration ? now + duration : null, ended: null };
}

const isOpen = (poll, now = Date.now()) => !!poll && !poll.ended && (!poll.endsAt || poll.endsAt > now);

// Votar de novo na mesma opção tira o voto; em outra, troca.
function vote(poll, accountId, option, now = Date.now()) {
  if (!isOpen(poll, now)) throw new PollError('Essa enquete já acabou.');
  if (!Number.isInteger(option) || !poll.options[option]) throw new PollError('Opção inválida.');
  const had = poll.options[option].votes.includes(accountId);
  for (const o of poll.options) o.votes = o.votes.filter((id) => id !== accountId);
  if (!had) poll.options[option].votes.push(accountId);
  return !had;
}

function end(poll, now = Date.now()) {
  if (poll.ended) return false;
  poll.ended = poll.endsAt && poll.endsAt < now ? poll.endsAt : now;
  return true;
}

// As opções com mais votos (empate = várias); nenhuma se ninguém votou.
function winners(poll) {
  const top = Math.max(0, ...poll.options.map((o) => o.votes.length));
  return top ? poll.options.flatMap((o, i) => (o.votes.length === top ? [i] : [])) : [];
}

module.exports = { create, vote, end, isOpen, winners, PollError, DURATIONS, MAX_OPTIONS, MAX_QUESTION, MAX_OPTION };
