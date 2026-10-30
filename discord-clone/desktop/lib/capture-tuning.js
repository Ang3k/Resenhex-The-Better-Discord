// Liga o ajuste da captura de tela do Windows (native/captura, explicado em captura.cc): sem ele, a
// transmissão fica em 48 fps em monitores de 144 Hz. Só existe a partir do Windows 11 24H2. Precisa
// rodar antes da primeira captura, porque capturas já começadas continuam com o intervalo do Windows.
// RESENHEX_CAPTURA_PADRAO=1 deixa a captura como o Chromium faz, para comparar; RESENHEX_CAPTURA_ANEL=0
// desliga só o anel de leitura (com a placa cheia, a captura para de esperar ela terminar cada cópia;
// ver captura.cc).
const os = require('node:os');
const path = require('node:path');

const BINARY = path.join(__dirname, '..', 'native', 'captura', 'build', 'Release', 'captura.node');
const FIRST_BUILD = 26100; // Windows 11 24H2
const INTERVAL_MS = 8;
// Anel ligado (ele só entra com a placa cheia, com um quadro de idade na imagem) e 3 buffers a mais na
// fila do WGC (com a placa cheia, cada um demora a voltar).
const RING = { anel: 1, folga: 3 };
const ringOptions = (on) => (on ? RING : { anel: 0, folga: 0 });

function skipReason({ platform = process.platform, release = os.release(), env = process.env } = {}) {
  if (platform !== 'win32') return 'fora do Windows';
  if (env.RESENHEX_CAPTURA_PADRAO === '1') return 'desligado por RESENHEX_CAPTURA_PADRAO';
  if (!(Number(String(release).split('.')[2]) >= FIRST_BUILD)) return 'Windows anterior ao 24H2';
  return null;
}

// Tenta uma vez e só registra o resultado: sem o ajuste, a captura continua como sempre foi.
function install({ log, load = () => require(BINARY), ring = true, ...system } = {}) {
  const reason = skipReason(system);
  const ringOn = ring && (system.env ?? process.env).RESENHEX_CAPTURA_ANEL !== '0';
  let result;
  try {
    result = reason ? { ok: false, reason } : load().install({ intervalMs: INTERVAL_MS, drain: true, ...ringOptions(ringOn) });
  } catch (error) {
    result = { ok: false, reason: error.message };
  }
  if (result.ok) log?.info(`Captura de tela: até 1 quadro a cada ${INTERVAL_MS} ms, sempre o mais novo${ringOn ? ', sem esperar a placa quando ela está cheia' : ''}.`);
  else if (reason) log?.info(`Captura de tela sem ajuste: ${reason}.`);
  else log?.warn('Captura de tela sem ajuste:', { ...result, ...(result.hr != null && { hr: `0x${result.hr.toString(16)}` }) });
  return result;
}

let installed = null;
const tuneCapture = (log, options) => (installed ||= install({ log, ...options }));

// Liga ou desliga o anel nas próximas capturas; a que está rodando segue como começou.
function setCaptureRing(on, { load = () => require(BINARY) } = {}) {
  if (!installed?.ok) return false;
  try { load().install(ringOptions(on)); return true; } catch { return false; }
}

// Capturas desde que o app abriu, para o registro: quantas tiveram o intervalo trocado, o intervalo
// que o Windows trazia, quantos quadros velhos foram pulados, como foi o anel e a espera da placa.
function captureStats() {
  if (!installed?.ok) return null;
  try { return require(BINARY).stats(); } catch { return null; }
}

module.exports = { skipReason, install, tuneCapture, setCaptureRing, captureStats, BINARY, INTERVAL_MS, RING };
