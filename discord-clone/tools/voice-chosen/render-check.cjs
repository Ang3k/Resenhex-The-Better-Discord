const fs = require("node:fs"),
  path = require("node:path");
const output = path.resolve(process.argv[2] || ""),
  chosen = process.argv.slice(3);
if (!fs.existsSync(output)) throw Error("Output directory required");
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
  app.setPath(
    "userData",
    fs.mkdtempSync(path.join(require("node:os").tmpdir(), "voice-chosen-")),
  );
  app
    .whenReady()
    .then(async () => {
      const w = new BrowserWindow({
        show: false,
        width: 1440,
        height: 1080,
        webPreferences: { backgroundThrottling: false },
      });
      const errors = [];
      w.webContents.on("console-message", (event) => {
        if (event.level === "error" && !event.message.includes("404"))
          errors.push(event.message);
      });
      await w.loadURL("http://127.0.0.1:38156/");
      for (
        let i = 0;
        i < 100 &&
        !(await w.webContents.executeJavaScript("!!window.labReady"));
        i++
      )
        await new Promise((r) => setTimeout(r, 100));
      const results = await w.webContents.executeJavaScript(
        `(async()=>{try{return await renderAll(${chosen.length ? JSON.stringify(chosen) : ""});}catch(error){return{error:error.stack};}})()`,
      );
      if (results.error) {
        fs.writeFileSync(
          path.join(output, "console-errors.json"),
          JSON.stringify(errors, null, 2),
        );
        throw Error(results.error + "\n" + errors.join("\n"));
      }
      const previous = fs.existsSync(path.join(output, "metrics.json"))
        ? JSON.parse(fs.readFileSync(path.join(output, "metrics.json"), "utf8"))
        : [];
      for (const result of results) {
        fs.writeFileSync(
          path.join(output, result.id + ".wav"),
          Buffer.from(result.wav, "base64"),
        );
        delete result.wav;
        const index = previous.findIndex((row) => row.id === result.id);
        if (index >= 0) previous[index] = result;
        else previous.push(result);
        console.log(JSON.stringify(result));
      }
      fs.writeFileSync(
        path.join(output, "metrics.json"),
        JSON.stringify(previous, null, 2),
      );
      fs.writeFileSync(
        path.join(output, "console-errors.json"),
        JSON.stringify(errors, null, 2),
      );
      w.destroy();
      app.quit();
    })
    .catch((error) => {
      console.error(error.stack);
      app.exit(1);
    });
}
