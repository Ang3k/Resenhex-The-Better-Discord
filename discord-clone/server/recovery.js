// E-mail de recuperação (opcional): confirmação do endereço e "Esqueci a senha".
// Os tokens só existem nos links enviados. db.mailTokens guarda o sha256 de cada um, com o tipo,
// a conta, o e-mail para o qual foi enviado e a validade. Trocar o e-mail derruba os links antigos.
const crypto = require('node:crypto');

const CONFIRM_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_MS = 60 * 60 * 1000;
// Só o básico de um endereço, sem nome, vírgula ou ponto e vírgula, que mudariam quem recebe.
const EMAIL_PATTERN = /^[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Limites de envio, abaixo da cota diária do Gmail, para ninguém usar o Resenhex para mandar spam.
const PER_ADDRESS_HOUR = 5;
const PER_ADDRESS_DAY = 20;
const TOTAL_DAY = 400;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// '' = sem e-mail. Endereço inválido lança o erro que a pessoa vê.
function normalizeEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) throw new Error('Digite um e-mail válido.');
  return email;
}

// Texto puro e um HTML simples com a marca, a partir dos mesmos parágrafos.
// Cada parágrafo é um texto ou um botão { label, link }.
function message(to, subject, paragraphs) {
  const text = paragraphs.map((p) => typeof p === 'string' ? p : `${p.label}: ${p.link}`).join('\n\n') + '\n\n— Resenhex';
  const body = paragraphs.map((p) => typeof p === 'string'
    ? `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`
    : `<p style="margin:0 0 16px"><a href="${escapeHtml(p.link)}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(p.label)}</a></p>`).join('');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2328;max-width:520px">'
    + '<p style="margin:0 0 20px;font-size:20px;font-weight:700;color:#7c3aed">Resenhex</p>' + body
    + '<p style="margin:24px 0 0;font-size:12px;color:#6b7280">Você recebeu esta mensagem porque este e-mail foi cadastrado no Resenhex.</p></div>';
  return { to, subject, text, html };
}

// save(...chaves) marca os pedaços do banco que mudaram (server/store.js); os campos da conta se marcam sozinhos.
function createRecovery({ db, save, mailer, publicUrl, now = Date.now, log = console.error }) {
  db.mailTokens ||= {};
  const tokenKey = (key) => 'mailTokens/' + key;
  const base = String(publicUrl).replace(/\/+$/, '');
  const sentAt = new Map(); // endereço → horários de envio nas últimas 24 h
  let sentTotal = [];
  const view = (account) => ({ email: account.email || null, emailVerified: !!account.emailVerified });

  function issue(kind, account, ttl) {
    const token = crypto.randomBytes(32).toString('hex');
    db.mailTokens[digest(token)] = { kind, accountId: account.id, email: account.email, expires: now() + ttl };
    save(tokenKey(digest(token)));
    return token;
  }
  // Sem "kind", derruba todos os links da conta.
  function drop(accountId, kind) {
    for (const [key, entry] of Object.entries(db.mailTokens)) {
      if (entry.accountId === accountId && (!kind || entry.kind === kind)) { delete db.mailTokens[key]; save(tokenKey(key)); }
    }
  }
  // Usa o token uma vez só. Ele vale apenas para a conta e o e-mail para os quais foi enviado.
  function take(kind, token) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
    const key = digest(token);
    const entry = db.mailTokens[key];
    if (!entry || entry.kind !== kind) return null;
    delete db.mailTokens[key];
    save(tokenKey(key));
    const account = db.accounts[entry.accountId];
    if (entry.expires <= now() || !account || account.email !== entry.email) return null;
    return account;
  }
  // Conta o envio antes de mandar; passou do limite, não manda e a pessoa vê o aviso para reenviar.
  function withinLimits(to) {
    const since = now() - DAY;
    sentTotal = sentTotal.filter((t) => t > since);
    const times = (sentAt.get(to) || []).filter((t) => t > since);
    sentAt.set(to, times);
    if (sentTotal.length >= TOTAL_DAY || times.length >= PER_ADDRESS_DAY
      || times.filter((t) => t > now() - HOUR).length >= PER_ADDRESS_HOUR) return false;
    times.push(now());
    sentTotal.push(now());
    return true;
  }
  async function deliver(mail) {
    if (!withinLimits(mail.to)) {
      log('E-mail não enviado: limite de envios atingido.');
      return false;
    }
    try {
      await mailer.send(mail);
      return true;
    } catch (error) {
      log('Falha ao enviar e-mail:', error.message);
      return false;
    }
  }
  function sendConfirmation(account) {
    const token = issue('confirm', account, CONFIRM_MS);
    return deliver(message(account.email, 'Confirme seu e-mail no Resenhex', [
      `Oi, ${account.name}! Confirme que este e-mail é seu para poder criar uma senha nova se um dia esquecer a sua.`,
      { label: 'Confirmar e-mail', link: `${base}/#confirmar=${token}` },
      'O link vale por 7 dias. Se não foi você que cadastrou este e-mail, é só ignorar esta mensagem.',
    ]));
  }

  return {
    enabled: mailer.enabled,
    view,
    // Adiciona ou troca o e-mail; '' remove. O endereço antigo, se estava confirmado, recebe um aviso.
    async setEmail(account, value) {
      const email = normalizeEmail(value);
      if (email && email === account.email && account.emailVerified) return { ...view(account), sent: false };
      const old = account.emailVerified ? account.email : null;
      drop(account.id);
      if (email) {
        account.email = email;
        account.emailVerified = false;
      } else {
        delete account.email;
        delete account.emailVerified;
      }
      save();
      const notice = old && old !== email ? deliver(message(old, 'Seu e-mail do Resenhex foi alterado', [
        email ? `O e-mail de recuperação da conta ${account.name} foi trocado por outro endereço.` : `O e-mail de recuperação da conta ${account.name} foi removido.`,
        'Se não foi você, entre no Resenhex e troque a senha agora mesmo.',
      ])) : null;
      const sent = email ? await sendConfirmation(account) : false;
      await notice;
      return { ...view(account), sent };
    },
    async resend(account) {
      if (!account.email) throw new Error('Adicione um e-mail primeiro.');
      if (account.emailVerified) throw new Error('Este e-mail já está confirmado.');
      drop(account.id, 'confirm');
      return { ...view(account), sent: await sendConfirmation(account) };
    },
    confirm(token) {
      const account = take('confirm', token);
      if (!account) return null;
      account.emailVerified = true;
      drop(account.id, 'confirm');
      save();
      return account;
    },
    // Um link por conta com esse e-mail confirmado; só o link mais novo de cada conta vale.
    async forgot(value) {
      const email = normalizeEmail(value);
      const accounts = email ? Object.values(db.accounts).filter((a) => a.email === email && a.emailVerified) : [];
      if (!accounts.length) return false;
      const links = accounts.map((account) => {
        drop(account.id, 'reset');
        return { label: `Criar senha nova para ${account.name}`, link: `${base}/#redefinir=${issue('reset', account, RESET_MS)}` };
      });
      return deliver(message(email, 'Criar uma senha nova no Resenhex', [
        accounts.length > 1
          ? 'Pediram para criar uma senha nova no Resenhex. Este e-mail está em mais de uma conta: use o botão da conta que você quer recuperar.'
          : `Pediram para criar uma senha nova para a conta ${accounts[0].name} no Resenhex.`,
        ...links,
        'Cada link vale por 1 hora e uma vez só. Se não foi você, ignore esta mensagem: sua senha continua a mesma.',
      ]));
    },
    takeReset: (token) => take('reset', token),
    passwordChanged(account) {
      drop(account.id, 'reset');
      save();
      if (!account.email || !account.emailVerified) return Promise.resolve(false);
      return deliver(message(account.email, 'Sua senha do Resenhex foi trocada', [
        `A senha da conta ${account.name} acabou de ser trocada pelo "Esqueci a senha", e todos os aparelhos conectados saíram da conta.`,
        'Se não foi você, peça um link novo em "Esqueci a senha" e crie outra senha.',
      ]));
    },
    prune() {
      for (const [key, entry] of Object.entries(db.mailTokens)) {
        if (entry.expires <= now()) { delete db.mailTokens[key]; save(tokenKey(key)); }
      }
      const since = now() - DAY;
      for (const [to, times] of sentAt) if (!times.some((t) => t > since)) sentAt.delete(to);
    },
  };
}

module.exports = { createRecovery, normalizeEmail, CONFIRM_MS, RESET_MS };
