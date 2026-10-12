const express = require("express"),
  fs = require("node:fs"),
  path = require("node:path");
const app = express(),
  root = path.resolve(__dirname, "../.."),
  reference = path.resolve(process.argv[2] || ""),
  output = path.resolve(process.argv[3] || "");
const rawInput = process.argv[4] && path.resolve(process.argv[4]);
app.get('/arte/', (_, res) => res.redirect(302, '/'));
if (!fs.existsSync(path.join(reference, "original.wav")))
  throw Error("Pass the selected favorites directory and output directory.");
const files = {
  esquilo: "esquilo",
  gigante: "gigante",
  telefone: "telefone",
  megafone: "megafone",
  banheiro: "banheiro",
  caverna: "caverna",
  alien: "alien",
  robo: "robo",
  fantasma: "fantasma",
  bebado: "bebado-oscila",
  autotune: "autotune",
  acordes: "acordes-voz-0-75db",
  coral: "coral-voz-0-25db",
  original: "original",
};
app.get("/", (_, res) =>
  res.sendFile(path.join(__dirname, "lab.html"), { dotfiles: "allow" }),
);
app.get("/lab.mjs", (_, res) =>
  res.sendFile(path.join(__dirname, "lab.mjs"), { dotfiles: "allow" }),
);
app.get("/loopback.mjs", (_, res) =>
  res.sendFile(path.join(__dirname, "loopback.mjs"), { dotfiles: "allow" }),
);
app.get("/input.f32", (_, res) =>
  rawInput
    ? res.sendFile(rawInput, { dotfiles: "allow" })
    : res.sendStatus(404),
);
app.get("/reference/:id.wav", (req, res) =>
  files[req.params.id]
    ? res.sendFile(path.join(reference, files[req.params.id] + ".wav"))
    : res.sendStatus(404),
);
app.use("/rendered", express.static(output));
app.get("/vendor/stretch.mjs", (_, res) =>
  res.sendFile(
    path.join(
      path.dirname(require.resolve("signalsmith-stretch")),
      "SignalsmithStretch.mjs",
    ),
    { dotfiles: "allow" },
  ),
);
app.use(express.static(path.join(root, "public")));
app.listen(Number(process.env.PORT || 38156), "127.0.0.1", () =>
  console.log(
    "Efeitos escolhidos: http://127.0.0.1:" + (process.env.PORT || 38156),
  ),
);
