// Compatibilidade com WebView/Chrome antigo (a partir do 85). Celular sem a Play Store atualizada fica com o
// WebView de fábrica (Android 12 vem com o 91) e o site travava em "Entrando na resenha…". Em navegador novo
// nada aqui roda: cada parte só entra quando falta o recurso.
(function (root) {
  'use strict';

  const define = (target, name, value) => {
    if (target && !(name in target)) Object.defineProperty(target, name, { value, configurable: true, writable: true });
  };

  // ---------- JavaScript ----------
  define(Object, 'hasOwn', (object, key) => Object.prototype.hasOwnProperty.call(object, key));

  const TypedArray = Object.getPrototypeOf(Int8Array.prototype);
  function at(index) {
    const length = this.length;
    let i = Math.trunc(index) || 0;
    if (i < 0) i += length;
    return i < 0 || i >= length ? undefined : this[i];
  }
  function findLast(test, self) {
    for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return this[i];
    return undefined;
  }
  function findLastIndex(test, self) {
    for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return i;
    return -1;
  }
  for (const proto of [Array.prototype, String.prototype, TypedArray]) define(proto, 'at', at);
  for (const proto of [Array.prototype, TypedArray]) {
    define(proto, 'findLast', findLast);
    define(proto, 'findLastIndex', findLastIndex);
  }

  // Cópia profunda do que o site guarda (objetos, listas, datas, Map, Set, buffers). Blob, File e afins
  // são passados como estão, igual ao structuredClone de verdade faz com quem não tem o que copiar.
  define(root, 'structuredClone', function structuredClone(value) {
    const seen = new Map();
    const copy = (v) => {
      if (v === null || typeof v !== 'object') return v;
      if (seen.has(v)) return seen.get(v);
      let out;
      if (Array.isArray(v)) { out = []; seen.set(v, out); v.forEach((item, i) => { out[i] = copy(item); }); return out; }
      if (v instanceof Date) return new Date(v.getTime());
      if (v instanceof RegExp) return new RegExp(v.source, v.flags);
      if (v instanceof ArrayBuffer) return v.slice(0);
      if (ArrayBuffer.isView(v)) return new v.constructor(v.buffer.slice(0), v.byteOffset, v instanceof DataView ? v.byteLength : v.length);
      if (v instanceof Map) { out = new Map(); seen.set(v, out); v.forEach((item, key) => out.set(copy(key), copy(item))); return out; }
      if (v instanceof Set) { out = new Set(); seen.set(v, out); v.forEach((item) => out.add(copy(item))); return out; }
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return v;
      out = {};
      seen.set(v, out);
      for (const key of Object.keys(v)) out[key] = copy(v[key]);
      return out;
    };
    return copy(value);
  });

  // replaceChildren chegou no Chrome 86; o site usa em quase toda tela.
  function replaceChildren(...nodes) {
    while (this.lastChild) this.removeChild(this.lastChild);
    if (nodes.length) this.append(...nodes);
  }
  if (root.Element) for (const type of [root.Element, root.Document, root.DocumentFragment]) define(type.prototype, 'replaceChildren', replaceChildren);

  // ---------- CSS ----------
  const supports = (property, value) => {
    try { return !root.CSS?.supports || root.CSS.supports(property, value); } catch { return true; }
  };
  const supportsSelector = (selector) => {
    try { return !root.CSS?.supports || root.CSS.supports(`selector(${selector})`); } catch { return true; }
  };
  const fix = {
    mix: !supports('color', 'color-mix(in srgb, red 50%, blue)'),
    inset: !supports('inset', '0px'),
    dvh: !supports('height', '1dvh'),
    container: !supports('container-type', 'inline-size'),
    has: !supportsSelector(':has(a)'),
  };
  if (!root.document || !Object.values(fix).some(Boolean)) return;

  // Lê "cor 40%" ou "40% cor".
  function splitStop(text) {
    text = text.trim();
    let m = /^(-?[\d.]+)%\s+([\s\S]+)$/.exec(text);
    if (m) return { color: m[2].trim(), pct: parseFloat(m[1]) / 100 };
    m = /^([\s\S]+?)\s+(-?[\d.]+)%$/.exec(text);
    if (m) return { color: m[1].trim(), pct: parseFloat(m[2]) / 100 };
    return { color: text, pct: null };
  }

  // Divide por vírgulas que não estão dentro de parênteses.
  function splitArgs(text) {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    parts.push(text.slice(start));
    return parts;
  }

  // Índice do ")" que fecha o "(" em open.
  function closing(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0) return i;
    }
    return -1;
  }

  // Cada ocorrência de name( … ) no texto (só as de fora; as de dentro são tratadas por quem chama).
  function replaceCalls(text, name, replacer) {
    let out = '', from = 0;
    const needle = name + '(';
    for (;;) {
      const at = text.indexOf(needle, from);
      if (at < 0) return out + text.slice(from);
      const before = text[at - 1];
      if (before && /[\w-]/.test(before)) { out += text.slice(from, at + needle.length); from = at + needle.length; continue; }
      const end = closing(text, at + name.length);
      if (end < 0) return out + text.slice(from);
      const inner = text.slice(at + needle.length, end);
      const result = replacer(inner, text.slice(at, end + 1));
      out += text.slice(from, at) + (result == null ? text.slice(at, end + 1) : result);
      from = end + 1;
    }
  }

  const canvas = document.createElement('canvas').getContext('2d');
  // Cor CSS simples (hex, rgb, hsl, nome) → [r, g, b, a]; null se o navegador não entende.
  function parseColor(text) {
    if (!canvas || /currentcolor/i.test(text)) return null;
    canvas.fillStyle = '#000';
    canvas.fillStyle = text;
    const a = canvas.fillStyle;
    canvas.fillStyle = '#fff';
    canvas.fillStyle = text;
    if (a !== canvas.fillStyle) return null;
    if (a[0] === '#') return [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16), 1];
    const m = /rgba?\(([^)]+)\)/.exec(a);
    if (!m) return null;
    const [r, g, b, alpha = '1'] = m[1].split(',');
    return [+r, +g, +b, +alpha];
  }
  const rgba = ([r, g, b, a]) => a >= 1 ? `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
    : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(3)})`;

  let rootStyle = null;
  const usedVars = new Set();
  function rootVar(name) {
    usedVars.add(name);
    return (rootStyle || (rootStyle = getComputedStyle(document.documentElement))).getPropertyValue(name).trim();
  }

  // Troca var(--x) pelo valor que ele tem na raiz da página. Variável que só existe num elemento
  // (a cor de cada pessoa, por exemplo) não tem valor aqui: volta null.
  function resolveVars(text, depth = 0) {
    if (depth > 8) return null;
    let failed = false;
    const out = replaceCalls(text, 'var', (inner) => {
      const [name, ...rest] = splitArgs(inner);
      const value = rootVar(name.trim());
      if (value) return resolveVars(value, depth + 1) ?? (failed = true, '');
      if (rest.length) return resolveVars(rest.join(','), depth + 1) ?? (failed = true, '');
      failed = true;
      return '';
    });
    return failed ? null : out;
  }

  // Calcula a cor de um color-mix (no espaço sRGB: nos outros espaços a diferença é pequena).
  // Sem como calcular (variável de um elemento só), fica com a cor que pesa mais, como ela está escrita.
  function evaluateMix(inner) {
    const args = splitArgs(inner);
    if (args.length !== 3 || !/^\s*in\s/.test(args[0])) return null;
    const stops = [splitStop(args[1]), splitStop(args[2])];
    let [p1, p2] = stops.map((s) => s.pct);
    if (p1 == null && p2 == null) { p1 = 0.5; p2 = 0.5; } else if (p1 == null) p1 = 1 - p2; else if (p2 == null) p2 = 1 - p1;
    const sum = p1 + p2;
    if (!(sum > 0)) return null;
    const colors = stops.map((s) => {
      const plain = mixAll(s.color);
      if (plain == null) return null;
      const resolved = resolveVars(plain);
      // A variável da raiz também pode guardar um color-mix (o navegador antigo guarda o texto cru).
      return resolved == null ? null : parseColor(mixAll(resolved).trim());
    });
    if (!colors[0] || !colors[1]) {
      const heavy = p1 >= p2 ? 0 : 1;
      if (colors[heavy]) return rgba(colors[heavy]);
      const raw = mixAll(stops[heavy].color);
      return raw && !/color-mix\(/.test(raw) ? raw : null;
    }
    const w1 = p1 / sum, w2 = p2 / sum;
    const [c1, c2] = colors;
    const alpha = c1[3] * w1 + c2[3] * w2;
    const channel = (i) => (alpha ? (c1[i] * c1[3] * w1 + c2[i] * c2[3] * w2) / alpha : 0);
    return rgba([channel(0), channel(1), channel(2), alpha * Math.min(1, sum)]);
  }
  const mixAll = (text) => replaceCalls(text, 'color-mix', (inner) => evaluateMix(inner));

  const UNSUPPORTED_SELECTOR = /:has\(|:popover-open|:modal\b|:user-(?:in)?valid/;
  function dropHasSelectors(css) {
    let out = '', copied = 0, last = 0;
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (c === '}' || c === ';') last = i + 1;
      else if (c === '{') {
        const prelude = css.slice(last, i);
        if (UNSUPPORTED_SELECTOR.test(prelude) && !/^\s*@/.test(prelude)) {
          const parts = splitArgs(prelude);
          const kept = parts.filter((part) => !UNSUPPORTED_SELECTOR.test(part));
          if (kept.length && kept.length < parts.length) {
            out += css.slice(copied, last) + kept.join(',') + ' ';
            copied = i;
          }
        }
        last = i + 1;
      }
    }
    return out + css.slice(copied);
  }

  function rewrite(css) {
    let out = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // Condições de @supports ficam como estão (senão "@supports not (color-mix…)" passaria a mentir).
    if (fix.mix) {
      const supportsBlocks = [];
      out = out.replace(/@supports[^{]*/g, (cond) => { supportsBlocks.push(cond); return `@supports__${supportsBlocks.length - 1}__`; });
      out = mixAll(out);
      out = out.replace(/@supports__(\d+)__/g, (_, i) => supportsBlocks[+i]);
    }
    if (fix.dvh) out = out.replace(/(\d)(?:dvh|svh|lvh)\b/g, '$1vh').replace(/(\d)(?:dvw|svw|lvw)\b/g, '$1vw');
    // Consulta de contêiner vira consulta da tela: no celular a call, o palco e o DJ ocupam a largura toda.
    // Só as unidades de largura acompanham (cqw → vw); as de altura ficam de fora, porque o contêiner
    // costuma ser bem mais baixo que a tela.
    if (fix.container) out = out.replace(/@container\s+(?:[a-zA-Z][\w-]*\s+)?(?=\()/g, '@media ').replace(/(\d)(?:cqw|cqi)\b/g, '$1vw');
    // Uma regra com ":has" numa lista inteira de seletores era descartada toda; tira só os pedaços com ":has".
    if (fix.has) out = dropHasSelectors(out);
    if (fix.inset) {
      out = out.replace(/([{;\s])inset:\s*([^;}!]+?)\s*(!important)?\s*(?=[;}])/g, (_, lead, value, important = '') => {
        const v = value.trim().split(/\s+/);
        const [t, r = t, b = t, l = r] = v;
        const imp = important ? ' !important' : '';
        return `${lead}top: ${t}${imp}; right: ${r}${imp}; bottom: ${b}${imp}; left: ${l}${imp}`;
      });
    }
    return out;
  }

  // Cada folha de estilo do site é lida de novo (vem do cache), reescrita e posta no lugar da original,
  // na mesma ordem. Se as cores da raiz mudarem (tamanho da letra, tema), refaz a partir do texto original.
  const sheets = [];
  let snapshot = '';
  const snapshotOf = () => [...usedVars].map((name) => name + ':' + getComputedStyle(document.documentElement).getPropertyValue(name)).join(';');

  function apply() {
    rootStyle = null;
    usedVars.clear();
    for (const sheet of sheets) sheet.style.textContent = rewrite(sheet.text);
    snapshot = snapshotOf();
  }

  async function start() {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')].filter((link) => {
      try { return new URL(link.href).origin === location.origin; } catch { return false; }
    });
    const texts = await Promise.all(links.map((link) => fetch(link.href, { cache: 'force-cache' }).then((r) => (r.ok ? r.text() : null)).catch(() => null)));
    links.forEach((link, i) => {
      if (texts[i] == null || !link.parentNode) return;
      const style = document.createElement('style');
      style.dataset.compat = link.getAttribute('href');
      if (link.media) style.media = link.media;
      link.parentNode.insertBefore(style, link);
      sheets.push({ style, link, text: texts[i] });
    });
    apply();
    for (const sheet of sheets) sheet.link.remove();
    root.__compatCss = { sheets: sheets.length, fix };
    if (fix.mix) {
      let pending = 0;
      new MutationObserver(() => {
        clearTimeout(pending);
        pending = setTimeout(() => { if (snapshotOf() !== snapshot) apply(); }, 100);
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
