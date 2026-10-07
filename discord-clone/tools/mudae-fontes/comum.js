// Utilitários dos downloads do catálogo do Mudae: espera, pedidos com nova tentativa e um
// limitador simples de pedidos por segundo (cada fonte tem o seu limite).
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Garante um intervalo mínimo entre pedidos da mesma fonte.
function pacer(minGapMs) {
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + minGapMs;
    if (at > now) await wait(at - now);
  };
}

// fetch com até 6 tentativas em erro de rede, demora, 429 (limite) e 5xx. Erros 4xx param na hora.
async function request(url, options = {}, { label = url, parse = 'json', beforeAttempt } = {}) {
  for (let attempt = 1; ; attempt++) {
    if (beforeAttempt) await beforeAttempt();
    // Sem resposta em 45 s conta como erro de rede (e tenta de novo): um pedido preso travava o script.
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(45_000) }).catch((err) => ({ ok: false, status: 0, err, headers: new Headers() }));
    if (res.ok) return parse === 'json' ? res.json() : res.text();
    const retryable = res.status === 0 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 6) {
      const body = res.text ? (await res.text().catch(() => '')).slice(0, 200) : String(res.err);
      throw new Error(`${label}: HTTP ${res.status} ${body}`);
    }
    const retry = Number(res.headers.get('retry-after')) || Math.min(60, 2 ** attempt);
    console.log(`  ${label}: HTTP ${res.status}, tentando de novo em ${retry}s`);
    await wait(retry * 1000);
  }
}

const genderOf = (value) => {
  const v = String(value ?? '').toLowerCase();
  if (/\b(female|woman|girl|feminino|mulher|fêmea)\b/.test(v)) return 'F';
  if (/\b(male|man|boy|masculino|homem|macho)\b/.test(v)) return 'M';
  return '';
};

module.exports = { wait, pacer, request, genderOf };
