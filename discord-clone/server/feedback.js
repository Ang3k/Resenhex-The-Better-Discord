// Sugestões de usuários autenticados, entregues ao mantenedor pelo mesmo e-mail do Resenhex que manda o
// "Esqueci a senha" (server/mailer.js). Até a 2.3.5 iam pelo FormSubmit, que parou de entregar quando o site
// trocou de domínio (ele pede uma nova ativação para cada endereço de site).
const express = require('express');

const FEEDBACK_EMAIL = 'angejesufern@gmail.com';
const MAX_FEEDBACK_LENGTH = 3000;
const DELIVERY_TIMEOUT_MS = 15_000;

function feedbackRoutes({ authenticate, allow, version, mailer, to = FEEDBACK_EMAIL }) {
  const router = express.Router();
  router.post('/feedback', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const account = authenticate(req);
    if (!account) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente para enviar sua sugestão.' });
    if (!allow('feedback-attempt:' + account.id, 10, 60_000)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' });
    res.locals.feedbackAccount = account;
    next();
  }, express.json({ limit: '16kb' }), async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > MAX_FEEDBACK_LENGTH) {
      return res.status(400).json({ error: `Escreva uma sugestão de até ${MAX_FEEDBACK_LENGTH} caracteres.` });
    }
    const account = res.locals.feedbackAccount;
    if (!mailer?.enabled) {
      return res.status(503).json({ error: 'O envio de sugestões está desligado agora. Sua ideia continua aqui; tente mais tarde.' });
    }
    if (!allow('feedback-send:' + account.id, 3, 10 * 60_000)) {
      return res.status(429).json({ error: 'Você já enviou algumas sugestões. Aguarde dez minutos para enviar outra.' });
    }
    // Com e-mail confirmado, "Responder" no Gmail vai direto para quem mandou a ideia.
    const replyTo = account.emailVerified && account.email ? account.email : undefined;
    const name = String(account.name || '').replace(/[\r\n]+/g, ' ').slice(0, 60);
    const text = [
      message,
      '',
      '—',
      `De: ${name} (conta ${account.id})`,
      `E-mail: ${replyTo || 'sem e-mail confirmado'}`,
      `Versão: ${version}`,
      `Enviado: ${new Date().toISOString()}`,
    ].join('\n');
    let timer;
    try {
      await Promise.race([
        mailer.send({ to, subject: `[Resenhex] Sugestão de ${name}`, text, replyTo }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tempo esgotado')), DELIVERY_TIMEOUT_MS); }),
      ]);
      res.json({ ok: true });
    } catch (error) {
      // Nunca confirmar um envio que falhou nem expor o erro do provedor ao usuário; o log fica para o dono.
      console.error('[feedback] envio falhou:', error?.message || error);
      res.status(502).json({ error: 'Não foi possível enviar agora. Sua ideia continua aqui; tente novamente em alguns instantes.' });
    } finally {
      clearTimeout(timer);
    }
  });
  router.use((error, _req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Sua sugestão é muito longa. Use até 3000 caracteres.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Não foi possível ler sua sugestão. Tente novamente.' });
    next(error);
  });
  return router;
}

module.exports = { feedbackRoutes };
