const fs = require("node:fs"),
  path = require("node:path");
const output = path.resolve(process.argv[2]);
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  require("node:child_process")
    .spawn(
      process.env.ELECTRON_BINARY ||
        "C:/Games/project2/discord-clone/desktop/node_modules/electron/dist/electron.exe",
      [__filename, ...process.argv.slice(2)],
      { env, windowsHide: true, stdio: "inherit" },
    )
    .on("exit", (code) => (process.exitCode = code ?? 1));
} else {
  const { app, BrowserWindow } = require("electron");
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  app.setPath(
    "userData",
    fs.mkdtempSync(path.join(require("node:os").tmpdir(), "voice-chosen-rtc-")),
  );
  app
    .whenReady()
    .then(async () => {
      const w = new BrowserWindow({
        show: false,
        webPreferences: { backgroundThrottling: false },
      });
      await w.loadURL("http://127.0.0.1:38156/");
      const execute = async (expression) => {
        const result = await w.webContents.executeJavaScript(
          `(async()=>{try{return await ${expression};}catch(error){return{error:error.stack};}})()`,
        );
        if (result.error) throw Error(result.error);
        return result;
      };
      if (!process.argv.includes("--failure-only")) {
        const record = await execute(
          `import('/loopback.mjs').then(module=>module.loopback())`,
        );
        fs.writeFileSync(
          path.join(output, "loopback.json"),
          JSON.stringify(record, null, 2),
        );
        console.log(
          JSON.stringify({
            voices: record.voices.length,
            packets: record.packetsSent,
            drunk: record.drunkDuringSpeech,
            paused: record.drunkAfterPause,
          }),
        );
      }
      w.webContents.debugger.attach("1.3");
      await w.webContents.debugger.sendCommand("Fetch.enable", {
        patterns: [
          {
            urlPattern: "*voice-fx-classic-worklet.mjs",
            requestStage: "Request",
          },
        ],
      });
      w.webContents.debugger.on("message", async (_event, method, params) => {
        if (method !== "Fetch.requestPaused") return;
        try {
          const source = fs.readFileSync(
            path.join(__dirname, "../../public/voice-fx-classic-worklet.mjs"),
            "utf8",
          );
          const marker = /if\s*\(this\.kernel\)\s*\{/;
          if (!marker.test(source))
            throw Error("DSP failure injection point not found");
          const injected = source.replace(
            marker,
            (match) =>
              match +
              '\nif(this.frame++>16)throw Error("Injected DSP failure");',
          );
          await w.webContents.debugger.sendCommand("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: "Content-Type", value: "application/javascript" },
            ],
            body: Buffer.from(injected).toString("base64"),
          });
        } catch (error) {
          console.error(error);
        }
      });
      const recovery = await execute(
        `import('/loopback.mjs').then(module=>module.failureRecovery())`,
      );
      fs.writeFileSync(
        path.join(output, "failure-recovery.json"),
        JSON.stringify(recovery, null, 2),
      );
      console.log(JSON.stringify(recovery));
      w.destroy();
      app.quit();
    })
    .catch((error) => {
      console.error(error.stack);
      app.exit(1);
    });
}
