// Sugestões de usuários autenticados, entregues ao mantenedor pelo FormSubmit.
const express = require('express');

const FEEDBACK_EMAIL = 'angejesufern@gmail.com';
const MAX_FEEDBACK_LENGTH = 3000;
const DELIVERY_TIMEOUT_MS = 15_000;

function feedbackRoutes({ authenticate, allow, version, domain = 'resenhex.duckdns.org', fetchImpl = globalThis.fetch }) {
  const router = express.Router();
  const formUrl = new URL('/', `https://${domain}`).href;
  router.post('/feedback', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const account = authenticate(req);
    if (!account) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente para enviar sua sugestão.' });
    if (!allow('feedback-attempt:' + account.id, 10, 60_000)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto e tente novamente.' });
    res.locals.feedbackAuthor = account.name;
    res.locals.feedbackAccountId = account.id;
    next();
  }, express.json({ limit: '16kb' }), async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > MAX_FEEDBACK_LENGTH) {
      return res.status(400).json({ error: `Escreva uma sugestão de até ${MAX_FEEDBACK_LENGTH} caracteres.` });
    }
    if (!allow('feedback-send:' + res.locals.feedbackAccountId, 3, 10 * 60_000)) {
      return res.status(429).json({ error: 'Você já enviou algumas sugestões. Aguarde dez minutos para enviar outra.' });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`https://formsubmit.co/ajax/${FEEDBACK_EMAIL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Referer: formUrl, Origin: new URL(formUrl).origin },
        signal: controller.signal,
        body: JSON.stringify({
          name: res.locals.feedbackAuthor,
          message,
          Versão: version,
          Enviado: new Date().toISOString(),
          _subject: '[Resenhex] Nova sugestão de melhoria',
          _template: 'table',
          _captcha: 'false',
          _url: formUrl,
        }),
      });
      const result = await response.json();
      if (!response.ok || (result.success !== true && result.success !== 'true')) throw new Error('Entrega recusada');
      res.json({ ok: true });
    } catch {
      // Nunca confirmar um envio recusado ou expor a resposta do serviço ao usuário.
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
