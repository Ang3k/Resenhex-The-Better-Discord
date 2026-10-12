const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const output = path.resolve(process.argv[2]);

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const binary =
    process.env.ELECTRON_BINARY ||
    "C:/Games/project2/discord-clone/desktop/node_modules/electron/dist/electron.exe";
  require("node:child_process")
    .spawn(binary, [__filename, ...process.argv.slice(2)], {
      env,
      windowsHide: true,
      stdio: "inherit",
    })
    .on("exit", (code) => {
      process.exitCode = code ?? 1;
    });
} else {
  const { app, BrowserWindow } = require("electron");
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  app.setPath(
    "userData",
    fs.mkdtempSync(
      path.join(require("node:os").tmpdir(), "voice-chosen-page-"),
    ),
  );
  app
    .whenReady()
    .then(async () => {
      const window = new BrowserWindow({
        show: false,
        width: 1440,
        height: 1000,
        webPreferences: { backgroundThrottling: false },
      });
      await window.loadURL("http://127.0.0.1:38156/");
      const result = await window.webContents.executeJavaScript(`(async () => {
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      for (let i = 0; i < 100 && !window.labReady; i++) await wait(100);
      const players = [...document.querySelectorAll('audio')];
      await Promise.all(players.map(player => new Promise((resolve, reject) => {
        player.muted = true;
        if (player.readyState >= 1) return resolve();
        player.addEventListener('loadedmetadata', resolve, { once: true });
        player.addEventListener('error', () => reject(Error(player.src)), { once: true });
        setTimeout(() => reject(Error('Metadata timed out: ' + player.src)), 15000);
      })));
      const initial = { count: players.length, allPaused: players.every(p => p.paused), volume: players.every(p => p.volume === .25), durations: players.every(p => p.duration >= 18.5) };
      await players[0].play();
      await players[1].play();
      await wait(80);
      const singlePlayer = players.filter(p => !p.paused).length === 1 && players[0].paused;
      const slider = document.getElementById('volume');
      slider.value = '37';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      const volumeControl = players.every(p => p.volume === .37) && document.getElementById('value').value === '37%';
      document.getElementById('stop').click();
      slider.value = '25';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      const stopAll = players.every(p => p.paused && p.currentTime === 0);
      for (const player of players) player.muted = false;
      await wait(150);
      return { ...initial, singlePlayer, volumeControl, stopAll, playbackWasMuted: true, desktopOverflow: document.documentElement.scrollWidth > innerWidth };
    })()`);
      assert.equal(result.count, 26);
      for (const property of [
        "allPaused",
        "volume",
        "durations",
        "singlePlayer",
        "volumeControl",
        "stopAll",
      ])
        assert.equal(result[property], true, property);
      assert.equal(result.desktopOverflow, false);
      fs.writeFileSync(
        path.join(output, "gallery-desktop.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      await window.webContents.executeJavaScript(
        "document.getElementById('bebado').scrollIntoView({ block: 'center' })",
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(
        path.join(output, "gallery-effects.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      window.setContentSize(390, 844);
      await window.webContents.executeJavaScript("window.scrollTo(0, 0)");
      await new Promise((resolve) => setTimeout(resolve, 150));
      result.mobileOverflow = await window.webContents.executeJavaScript(
        "document.documentElement.scrollWidth > innerWidth",
      );
      assert.equal(result.mobileOverflow, false);
      fs.writeFileSync(
        path.join(output, "gallery-mobile.png"),
        (await window.webContents.capturePage()).toPNG(),
      );
      fs.writeFileSync(
        path.join(output, "gallery-check.json"),
        JSON.stringify(result, null, 2),
      );
      console.log(JSON.stringify(result));
      window.destroy();
      app.quit();
    })
    .catch((error) => {
      console.error(error.stack);
      app.exit(1);
    });
}
