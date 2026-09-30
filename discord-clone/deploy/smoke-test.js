// Executar com `node deploy/smoke-test.js` para verificar o servidor sem tocar nos dados reais.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-smoke-'));
const port = 3108 + Math.floor(Math.random() * 1000);
const password = 'a b$#[]';
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: {
    ...process.env,
    PORT: String(port), HOST: '127.0.0.1',
    DATA_FILE: path.join(temp, 'data.json'), UPLOAD_DIR: path.join(temp, 'uploads'),
    ACCESS_PASSWORD: 'fallback-incorrecto',
    ACCESS_PASSWORD_B64: Buffer.from(password).toString('base64'),
  },
  stdio: 'ignore',
});

async function poll(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function register(name, confirmPassword) {
  const url = `${base}/socket.io/?EIO=4&transport=polling`;
  const sid = JSON.parse((await poll(url)).slice(1)).sid;
  const sessionUrl = `${url}&sid=${sid}`;
  await fetch(sessionUrl, { method: 'POST', body: '40' });
  await poll(sessionUrl);
  const event = '421' + JSON.stringify(['auth', { mode: 'register', name, password: 'pass1234', confirmPassword }]);
  await fetch(sessionUrl, { method: 'POST', body: event });
  const packets = (await poll(sessionUrl)).split('\x1e');
  const ack = packets.find((packet) => packet.startsWith('431'));
  if (!ack) throw new Error(`Resposta de autenticação ausente: ${packets.map((p) => p.slice(0, 3)).join(', ')}`);
  return JSON.parse(ack.slice(3))[0];
}

(async () => {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const config = await (await fetch(`${base}/config`, { signal: AbortSignal.timeout(1000) })).json();
      if (config.passwordRequired || config.hasOwner) throw new Error('Configuração inicial incorreta');
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!ready) throw new Error('Servidor não iniciou');
  const denied = await register('BlockedSmoke', 'wrong');
  const accepted = await register('AllowedSmoke', 'pass1234');
  const newcomer = await register('NewcomerSmoke', 'pass1234');
  if (!denied.error || !accepted.accountId || !accepted.serverId || !newcomer.accountId || newcomer.serverId !== null) throw new Error('Validação de cadastro ou isolamento falhou');
  console.log('OK: cadastro com confirmação de senha; novas contas não entram automaticamente em servidores');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  child.kill();
  fs.rmSync(temp, { recursive: true, force: true });
});
