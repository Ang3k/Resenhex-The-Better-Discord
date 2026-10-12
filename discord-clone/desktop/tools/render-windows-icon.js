// O Windows usa os tamanhos nativos do ICO na janela e na barra de tarefas.
// Rode npm run icons:win para converter o logo existente, sem redesenhá-lo.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(() => {
  const root = path.join(__dirname, '..');
  const logo = nativeImage.createFromPath(path.join(root, 'build', 'logo-1024.png'));
  if (logo.isEmpty()) throw new Error('O logo build/logo-1024.png não pôde ser carregado.');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const frames = sizes.map(size => logo.resize({ width: size, height: size, quality: 'best' }).toPNG());
  const directory = Buffer.alloc(6 + 16 * frames.length);
  directory.writeUInt16LE(1, 2); // ICONDIR: tipo ícone
  directory.writeUInt16LE(frames.length, 4);
  let offset = directory.length;
  frames.forEach((frame, index) => {
    const entry = 6 + 16 * index;
    directory[entry] = directory[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(frame.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), Buffer.concat([directory, ...frames]));
  console.log('gerado build/icon.ico (16, 24, 32, 48, 64, 128 e 256 px)');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
