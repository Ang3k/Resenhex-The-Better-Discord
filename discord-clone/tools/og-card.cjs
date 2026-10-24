// Gera public/og-resenhex.png: a imagem que aparece quando alguém cola o link do Resenhex no WhatsApp, Discord, X…
// Usa o título e a prévia do app da página inicial (mesmo CSS), num cartão de 1200 × 630.
// node tools/og-card.cjs  (precisa do Chrome; outro caminho: CHROME="C:\...\chrome.exe")
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const publicDir = path.join(__dirname, '../public');
const out = path.join(publicDir, 'og-resenhex.png');
const chrome = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .find((file) => fs.existsSync(file));

// A prévia do app vem da própria página inicial, para o cartão nunca ficar diferente dela.
const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const preview = index.match(/<div class="ld-preview"[\s\S]*?(?=\n {6}<\/section>)/)[0];

const page = `<!doctype html>
<html lang="pt-BR" class="show-landing">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/experience.css">
<link rel="stylesheet" href="/polish.css">
<link rel="stylesheet" href="/brand.css">
<link rel="stylesheet" href="/landing.css">
<style>
  html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  #landing.og-card { display: grid; grid-template-columns: 600px 1fr; align-items: center; gap: 56px; padding: 0 0 0 76px; overflow: hidden; }
  #landing.og-card::before { height: 10px; }
  .og-brand { display: flex; align-items: center; gap: 14px; color: #fff; font-family: var(--ld-display); font-stretch: 125%; font-size: 30px; font-weight: 700; letter-spacing: -.02em; }
  .og-brand img { width: 48px; height: 48px; }
  .og-card h1 { margin: 40px 0 0; color: #fff; font-family: var(--ld-display); font-stretch: 125%; font-size: 64px; font-weight: 800; line-height: 1.02; letter-spacing: -.02em; text-transform: uppercase; }
  .og-card h1 .ld-keep { display: block; color: var(--ld-accent); }
  .og-lead { margin: 28px 0 0; color: #fff; font-size: 29px; line-height: 1.4; opacity: .9; }
  .og-url { display: inline-block; margin-top: 36px; padding: 10px 22px; border-radius: 999px; background: var(--ld-purple); color: #fff; font-size: 24px; font-weight: 700; }
  .og-card .ld-preview { width: 560px; } /* passa da borda direita de propósito: o título fica com espaço */
  .og-card .ld-av.speaking { box-shadow: 0 0 0 2px var(--bg-sidebar), 0 0 0 4px var(--green); }
  .og-card .ld-float-invite { display: none; }
</style>
</head>
<body>
<div id="landing" class="og-card">
  <div>
    <div class="og-brand"><img src="/resenhax-logo.png" alt="">Resenhex</div>
    <h1>A galera já <span class="ld-keep">tá na call</span></h1>
    <p class="og-lead">Chat, voz e transmissão de tela com os amigos. De graça.</p>
    <span class="og-url">resenhex.com.br</span>
  </div>
  ${preview}
</div>
<script src="/icons.js"></script>
<script>
  for (const node of document.querySelectorAll('[data-icon]')) node.prepend(Icon(node.dataset.icon, Number(node.dataset.size) || 20));
  for (const node of document.querySelectorAll('[data-logo]')) node.append(Icon.logo(Number(node.dataset.logo)));
</script>
</body>
</html>`;

const app = express();
app.get('/', (_req, res) => res.type('html').send(page));
app.use(express.static(publicDir));
const server = app.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  if (process.argv.includes('--serve')) { console.log('Cartão em', url); return; }
  if (!chrome) { console.error('Chrome não encontrado. Use CHROME=<caminho> ou --serve e tire o print à mão.'); process.exit(1); }
  // Perfil próprio e temporário: com o perfil normal, o Chrome aberto do usuário pegaria o pedido e o print nunca sairia.
  // Assíncrono: este mesmo processo precisa responder à página enquanto o Chrome tira o print.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'og-card-'));
  execFile(chrome, ['--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1200,630', '--virtual-time-budget=4000', `--screenshot=${out}`, url], { timeout: 60_000 }, (error) => {
    fs.rmSync(profile, { recursive: true, force: true });
    server.close();
    if (error) { console.error('O Chrome falhou:', error.message); process.exit(1); }
    console.log('Gerado:', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
  });
});
