// Gera os ícones do app instalável (PWA e Android) a partir de tools/marca/resenhax-logo.png (o original em alta).
// O fundo em degradê é reconstruído por um ajuste de superfície, então dá para afastar o desenho
// (ícone "maskable", que o Android recorta em círculo ou gota) sem aparecer a borda do logo original.
// Uso: node tools/icones-app.js
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');
const logo = PNG.sync.read(fs.readFileSync(path.join(root, 'tools', 'marca', 'resenhax-logo.png')));
const W = logo.width;
const H = logo.height;
const at = (x, y) => (y * W + x) * 4;

// Superfície quadrática (1, x, y, x², xy, y²) ajustada às amostras do fundo, por canal.
const terms = (x, y) => [1, x, y, x * x, x * y, y * y];
function fitBackground() {
  const n = 6;
  const ata = Array.from({ length: n }, () => new Float64Array(n));
  const atb = [0, 1, 2].map(() => new Float64Array(n));
  for (let y = 120; y < H - 120; y += 6) {
    for (let x = 120; x < W - 120; x += 6) {
      const i = at(x, y);
      if (logo.data[i + 3] < 250 || logo.data[i + 1] > 12) continue; // só fundo: opaco e sem branco
      const t = terms(x / W, y / H);
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) ata[a][b] += t[a] * t[b];
        for (let c = 0; c < 3; c++) atb[c][a] += t[a] * logo.data[i + c];
      }
    }
  }
  return atb.map((rhs) => solve(ata.map((row) => Float64Array.from(row)), Float64Array.from(rhs)));
}
function solve(m, v) {
  const n = v.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    [v[col], v[pivot]] = [v[pivot], v[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k < n; k++) m[r][k] -= f * m[col][k];
      v[r] -= f * v[col];
    }
  }
  return Array.from(v, (value, i) => value / m[i][i]);
}
const model = fitBackground();
const background = (x, y) => {
  const t = terms(x / W, y / H);
  return model.map((coef) => coef.reduce((sum, c, i) => sum + c * t[i], 0));
};

// Quanto de branco (o desenho do bigode) há em cada ponto do logo, com interpolação bilinear.
function glyph(x, y) {
  if (x < 0 || y < 0 || x > W - 2 || y > H - 2) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const value = (px, py) => {
    const i = at(px, py);
    if (logo.data[i + 3] < 250) return 0;
    const bg = background(px, py)[1];
    return Math.min(1, Math.max(0, (logo.data[i + 1] - bg) / (252 - bg)));
  };
  return (value(x0, y0) * (1 - fx) + value(x0 + 1, y0) * fx) * (1 - fy)
    + (value(x0, y0 + 1) * (1 - fx) + value(x0 + 1, y0 + 1) * fx) * fy;
}

// zoom > 1 afasta só o desenho (o degradê fica igual); shape decide o recorte (quadrado arredondado ou tela cheia).
function render(size, { zoom = 1, shape = 'full', mono = false }) {
  const out = new PNG({ width: size, height: size });
  const SS = 4;
  const radius = 0.2 * size;
  const inShape = (u, v) => {
    if (shape === 'full') return true;
    const inset = 0.006 * size;
    const dx = Math.max(inset + radius - u, 0, u - (size - inset - radius));
    const dy = Math.max(inset + radius - v, 0, v - (size - inset - radius));
    return dx * dx + dy * dy <= radius * radius;
  };
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      const sum = [0, 0, 0];
      let alpha = 0;
      let ink = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const pu = u + (sx + 0.5) / SS;
          const pv = v + (sy + 0.5) / SS;
          if (!inShape(pu, pv)) continue;
          const x = W / 2 + (pu / size - 0.5) * W * zoom;
          const y = H / 2 + (pv / size - 0.5) * H * zoom;
          const g = glyph(x, y);
          const bg = background(pu / size * W, pv / size * H); // o degradê não muda com o zoom
          for (let c = 0; c < 3; c++) sum[c] += bg[c] * (1 - g) + 252 * g;
          ink += g;
          alpha++;
        }
      }
      const i = (v * size + u) * 4;
      const n = SS * SS;
      if (mono) {
        out.data.set([255, 255, 255, Math.round((ink / n) * 255)], i);
      } else {
        for (let c = 0; c < 3; c++) out.data[i + c] = alpha ? Math.round(Math.min(255, Math.max(0, sum[c] / alpha))) : 0;
        out.data[i + 3] = Math.round((alpha / n) * 255);
      }
    }
  }
  return PNG.sync.write(out);
}

const dir = path.join(root, 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
const icons = [
  ['app-192.png', 192, { shape: 'rounded' }],
  ['app-512.png', 512, { shape: 'rounded' }],
  // O Android mostra só o círculo central de 80%: o desenho precisa caber nele.
  ['app-maskable-192.png', 192, { zoom: 1.45 }],
  ['app-maskable-512.png', 512, { zoom: 1.45 }],
  ['app-monochrome-512.png', 512, { zoom: 1.45, mono: true }],
];
for (const [name, size, options] of icons) {
  fs.writeFileSync(path.join(dir, name), render(size, options));
  console.log('public/icons/' + name);
}

// Ícone da barra de status do app de Android (notificações): só o desenho, em branco.
const densities = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
for (const [density, size] of Object.entries(densities)) {
  const out = path.join(root, 'android', 'app', 'src', 'main', 'res', `drawable-${density}`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'ic_stat_resenhex.png'), render(size, { zoom: 1.12, mono: true }));
  console.log(`android/.../drawable-${density}/ic_stat_resenhex.png`);
}
