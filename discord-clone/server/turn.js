// Retransmissor das chamadas (coturn). Cada conta recebe um usuário e uma senha temporários no formato que
// o coturn confere com use-auth-secret ("TURN REST API"): usuário "<validade em segundos>:<conta>", senha =
// HMAC-SHA1 do usuário com o segredo, em base64. O coturn recusa a senha vencida, encerra a alocação na
// validade e conta o limite de alocações por pessoa (user-quota) pelo que vem depois dos dois-pontos: a conta.
// Sem TURN_SECRET, vale a senha fixa de TURN_USERNAME/TURN_CREDENTIAL (instalações antigas e testes).
const crypto = require('node:crypto');

const VALID_S = 24 * 3600; // cada senha vale de 24 a 30 h: dá para uma noite inteira de chamada
const STEP_S = 6 * 3600; // a validade anda de 6 em 6 h, e a conta recebe a mesma senha nesse intervalo

function createTurn({ urls = '', secret = '', username = '', credential = '', allowed = () => true, now = Date.now } = {}) {
  const list = urls.split(',').map((url) => url.trim()).filter(Boolean);
  // allowed() falso (a rede do mês passou do limite, server/health.js): só STUN, sem o retransmissor.
  function iceServers(accountId) {
    const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
    if (!list.length || !allowed()) return servers;
    if (secret) {
      const expires = Math.ceil((Math.floor(now() / 1000) + VALID_S) / STEP_S) * STEP_S;
      const user = `${expires}:${accountId}`;
      servers.push({ urls: list, username: user, credential: crypto.createHmac('sha1', secret).update(user).digest('base64') });
    } else if (username) {
      servers.push({ urls: list, username, credential });
    }
    return servers;
  }
  return { iceServers };
}

module.exports = { createTurn, VALID_S, STEP_S };
