// Envio dos e-mails do Resenhex (confirmação do e-mail e "Esqueci a senha") por SMTP, pelo Gmail do Resenhex.
// Sem SMTP configurado o envio fica desligado. MAIL_DEV=console escreve as mensagens no log, para testar
// na máquina local e nos testes; nunca use em produção, porque os links de redefinição ficariam no log.
const nodemailer = require('nodemailer');

function createMailer(env = process.env, { createTransport = nodemailer.createTransport } = {}) {
  if (env.MAIL_DEV === 'console') {
    return { enabled: true, async send(message) { console.log('[e-mail] ' + JSON.stringify(message)); } };
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { enabled: false, async send() { throw new Error('Envio de e-mail desligado.'); } };
  }
  const port = Number(SMTP_PORT) || 465;
  const transport = createTransport({
    host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Minha conta espera a resposta: um Gmail lento não pode prender a tela por muito tempo.
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 10_000,
  });
  const from = MAIL_FROM || `Resenhex <${SMTP_USER}>`;
  return {
    enabled: true,
    async send({ to, subject, text, html }) { await transport.sendMail({ from, to, subject, text, html }); },
  };
}

module.exports = { createMailer };
