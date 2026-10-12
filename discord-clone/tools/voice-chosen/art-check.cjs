const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const output = path.resolve(process.argv[2]);
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  require('node:child_process').spawn(process.env.ELECTRON_BINARY || 'C:/Games/project2/discord-clone/desktop/node_modules/electron/dist/electron.exe', [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' }).on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'voice-art-')));
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, width: 1440, height: 1040, webPreferences: { backgroundThrottling: false } });
    await window.loadURL('http://127.0.0.1:38156/arte/');
    const result = await window.webContents.executeJavaScript(`(async () => {
      const images = [...document.querySelectorAll('article img')];
      await Promise.all(images.map(image => image.decode()));
      return { count: images.length, allLoaded: images.every(image => image.naturalWidth === 192 && image.naturalHeight > 0), allLocal: images.every(image => new URL(image.src).pathname.startsWith('/assets/voice-effects/')), desktopOverflow: document.documentElement.scrollWidth > innerWidth, names: [...document.querySelectorAll('article h2')].map(title => title.textContent) };
    })()`);
    assert.equal(result.count, 15);
    assert.equal(result.allLoaded, true);
    assert.equal(result.allLocal, true);
    assert.equal(result.desktopOverflow, false);
    await new Promise(resolve => setTimeout(resolve, 150));
    fs.writeFileSync(path.join(output, 'collection-desktop.png'), (await window.webContents.capturePage()).toPNG());
    window.setContentSize(390, 844);
    await new Promise(resolve => setTimeout(resolve, 150));
    result.mobileOverflow = await window.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth');
    assert.equal(result.mobileOverflow, false);
    fs.writeFileSync(path.join(output, 'collection-mobile.png'), (await window.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, 'browser-check.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result)); window.destroy(); app.quit();
  }).catch(error => { console.error(error.stack); app.exit(1); });
}
