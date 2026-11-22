// DJ de cada sala de voz: fila, música atual e o relógio que deixa todo mundo no mesmo ponto.
// O servidor não toca nada. Ele guarda quando a música começou (startedAt) e cada pessoa toca o
// vídeo no próprio player do YouTube, pulando para "agora - startedAt".
const MAX_QUEUE = 50;
const END_GRACE = 2500; // folga para quem carregou um pouco depois terminar a música
const IDLE_MS = 5 * 60_000; // sala vazia: o DJ espera a turma voltar e depois esquece a fila
const EMBED_BLOCKED = new Set([100, 101, 150]);
// Mudar o tempo: entre pulos de pessoas diferentes, a espera é mais ou menos o que o player de cada um
// leva para carregar o ponto novo. Pular antes disso só deixa o vídeo travando para a sala toda.
const SEEK_GAP_MS = 2000;
const MAX_MARKS = 5; // balões na linha do tempo: o último pulo de cada pessoa, nesta música

// 281 -> "4:41"; 3723 -> "1:02:03".
function clockText(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

function createDj({ newId, onChange = () => {}, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const rooms = new Map();
  const position = (room) => room.pausedAt ?? now() - room.startedAt;

  function roomOf(key) {
    let room = rooms.get(key);
    if (!room) {
      room = { current: null, queue: [], startedAt: 0, pausedAt: null, held: false, marks: [], last: null, endTimer: null, idleTimer: null, count: 1 };
      rooms.set(key, room);
    }
    return room;
  }

  function playing(key) {
    const room = rooms.get(key);
    if (!room?.current) throw new Error('Não tem nenhuma música tocando.');
    return room;
  }

  const note = (room, text) => { room.last = { text, at: now() }; };

  // A música acaba sozinha no servidor (mesmo que ninguém avise), com uma pequena folga.
  function schedule(key, room) {
    clearTimer(room.endTimer);
    room.endTimer = null;
    const track = room.current;
    if (!track?.duration || room.pausedAt !== null) return;
    room.endTimer = setTimer(() => {
      room.endTimer = null;
      next(room);
      schedule(key, room);
      onChange(key);
    }, Math.max(0, track.duration * 1000 - position(room) + END_GRACE));
  }

  function start(room, track) {
    room.current = track;
    room.startedAt = now();
    room.pausedAt = null;
    room.held = false;
    room.marks = [];
  }

  function next(room) {
    const track = room.queue.shift();
    if (track) start(room, track);
    else room.current = null;
  }

  function changed(key, room) {
    schedule(key, room);
    onChange(key);
  }

  const trackFrom = (item, extra) => ({
    id: newId(), videoId: item.videoId, title: item.title, author: item.author || '',
    duration: item.duration || null, live: !!item.live, ...extra,
  });

  function add(key, item, by, alts = []) {
    const room = roomOf(key);
    if (room.queue.length >= MAX_QUEUE) throw new Error(`A fila já tem ${MAX_QUEUE} músicas.`);
    const track = trackFrom(item, { by: by.id, byName: by.name, alts: alts.slice(0, 3) });
    let place = 0;
    if (room.current) {
      room.queue.push(track);
      place = room.queue.length;
      note(room, `${by.name} adicionou “${track.title}” à fila`);
    } else {
      start(room, track);
      note(room, `${by.name} colocou “${track.title}” para tocar`);
    }
    changed(key, room);
    return { place, title: track.title };
  }

  function skip(key, by) {
    const room = playing(key);
    note(room, `${by.name} pulou “${room.current.title}”`);
    next(room);
    changed(key, room);
  }

  function pause(key, by) {
    const room = playing(key);
    if (room.pausedAt !== null && !room.held) return;
    room.pausedAt = position(room);
    room.held = false;
    note(room, `${by.name} pausou a música`);
    changed(key, room);
  }

  function resume(key, by) {
    const room = playing(key);
    if (room.pausedAt === null) return;
    room.startedAt = now() - room.pausedAt;
    room.pausedAt = null;
    room.held = false;
    note(room, `${by.name} continuou a música`);
    changed(key, room);
  }

  // Leva a música para outro ponto, para todos. Pausada, continua pausada no ponto novo. Quem mudou
  // vira um balão na linha do tempo. Outra pessoa só pode mudar de novo depois de SEEK_GAP_MS; a mesma
  // pode corrigir na hora (errou o ponto ao arrastar).
  function seek(key, by, seconds, trackId) {
    const room = playing(key);
    const track = room.current;
    if (trackId && trackId !== track.id) throw new Error('A música mudou. Tente de novo.');
    if (track.live) throw new Error('Numa live não dá para mudar o tempo.');
    if (!track.duration) throw new Error('Espere a música começar a tocar para mudar o tempo.');
    if (!Number.isFinite(seconds)) throw new Error('Tempo inválido.');
    const last = room.marks.at(-1);
    if (last && last.by !== by.id && now() - last.when < SEEK_GAP_MS) throw new Error(`${last.name} acabou de mudar o tempo. Espere um instante.`);
    const at = Math.round(Math.min(Math.max(0, seconds), track.duration - 1));
    if (room.pausedAt !== null) room.pausedAt = at * 1000;
    else room.startedAt = now() - at * 1000;
    room.marks = [...room.marks.filter((mark) => mark.by !== by.id), { by: by.id, name: by.name, at, when: now() }].slice(-MAX_MARKS);
    note(room, `${by.name} pulou para ${clockText(at)}`);
    changed(key, room);
    return { at };
  }

  function stop(key, by) {
    const room = playing(key);
    room.queue = [];
    room.current = null;
    note(room, `${by.name} parou o DJ`);
    changed(key, room);
  }

  function remove(key, trackId, by) {
    const room = roomOf(key);
    const i = room.queue.findIndex((track) => track.id === trackId);
    if (i < 0) throw new Error('Essa música já saiu da fila.');
    const [track] = room.queue.splice(i, 1);
    note(room, `${by.name} tirou “${track.title}” da fila`);
    changed(key, room);
  }

  // Avisos que vêm dos players de quem está na sala. Vários avisam a mesma coisa: só o
  // primeiro conta, porque depois dele a música atual já tem outro id.
  function ended(key, trackId) {
    const room = rooms.get(key);
    const track = room?.current;
    if (!track || track.id !== trackId || room.pausedAt !== null) return;
    if (track.duration && position(room) < track.duration * 1000 - 15_000) return;
    next(room);
    changed(key, room);
  }

  // O bloqueio pode ser só de um aparelho (país, idade, endereço da página). A música só troca
  // para todos quando mais da metade da sala não consegue tocar; o resto continua ouvindo.
  function failed(key, trackId, code, reporter) {
    const room = rooms.get(key);
    const track = room?.current;
    if (!track || track.id !== trackId || !EMBED_BLOCKED.has(code)) return;
    (track.failures ||= new Set()).add(reporter);
    if (track.failures.size < Math.floor(room.count / 2) + 1) return;
    const [alt, ...rest] = track.alts;
    if (alt) {
      start(room, trackFrom(alt, { by: track.by, byName: track.byName, alts: rest, alt: true }));
      note(room, `“${track.title}” não pode tocar fora do YouTube. Tocando outra versão.`);
    } else {
      note(room, `“${track.title}” não pode tocar fora do YouTube. Pulando.`);
      next(room);
    }
    changed(key, room);
  }

  // Link colado sem duração conhecida: o primeiro player que carregar informa.
  function measured(key, trackId, seconds) {
    const track = rooms.get(key)?.current;
    if (!track || track.id !== trackId || track.duration || track.live || !(seconds > 0 && seconds < 86_400)) return;
    track.duration = Math.round(seconds);
    changed(key, rooms.get(key));
  }

  // Chamado a cada atualização de estado com quantas pessoas estão na sala. Devolve true se a música pausou ou voltou.
  function occupancy(key, count) {
    const room = rooms.get(key);
    if (!room) return false;
    room.count = count;
    if (count === 0 && !room.idleTimer) {
      room.idleTimer = setTimer(() => { drop(key); onChange(key); }, IDLE_MS);
      if (room.current && room.pausedAt === null) {
        room.pausedAt = position(room);
        room.held = true;
        schedule(key, room);
        return true;
      }
    } else if (count > 0 && room.idleTimer) {
      clearTimer(room.idleTimer);
      room.idleTimer = null;
      // Pausada só porque a sala esvaziou (ex.: a internet caiu): volta de onde parou.
      if (room.held) {
        room.startedAt = now() - room.pausedAt;
        room.pausedAt = null;
        room.held = false;
        schedule(key, room);
        return true;
      }
    }
    return false;
  }

  function drop(key) {
    const room = rooms.get(key);
    if (!room) return;
    clearTimer(room.endTimer);
    clearTimer(room.idleTimer);
    rooms.delete(key);
  }

  const publicTrack = (t) => ({ id: t.id, videoId: t.videoId, title: t.title, author: t.author, duration: t.duration, live: t.live, by: t.by, byName: t.byName, alt: !!t.alt });

  function view(key) {
    const room = rooms.get(key);
    if (!room?.current) return null;
    return {
      current: publicTrack(room.current),
      queue: room.queue.map(publicTrack),
      startedAt: room.startedAt,
      pausedAt: room.pausedAt,
      held: room.held,
      marks: room.marks.map((mark) => ({ ...mark })),
      last: room.last,
      now: now(),
    };
  }

  const summary = (key) => {
    const room = rooms.get(key);
    return room?.current ? { title: room.current.title, paused: room.pausedAt !== null } : null;
  };

  return { add, skip, pause, resume, seek, stop, remove, ended, failed, measured, occupancy, drop, view, summary, keys: () => [...rooms.keys()] };
}

module.exports = { createDj, MAX_QUEUE, IDLE_MS, SEEK_GAP_MS, MAX_MARKS };
