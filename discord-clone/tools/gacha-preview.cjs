// Prévia local da cena: não usa contas, dados ou mensagens do Salão.
// node tools/gacha-preview.cjs — http://127.0.0.1:38147
const express = require('express');
const path = require('node:path');
const app = express();
const publicDir = path.join(__dirname, '..', 'public');
const threeDir = path.join(path.dirname(require.resolve('three')), '..');
app.use('/vendor/three/build', express.static(path.join(threeDir, 'build')));
app.use('/vendor/three/addons', express.static(path.join(threeDir, 'examples', 'jsm')));
// Prefixo separado para uma medição inicial sem reaproveitar o cache da prévia.
app.use('/benchmark-assets/vendor/three/build', express.static(path.join(threeDir, 'build'), { maxAge: '7d' }));
app.use('/benchmark-assets/vendor/three/addons', express.static(path.join(threeDir, 'examples', 'jsm'), { maxAge: '7d' }));
app.use('/benchmark-assets', express.static(publicDir, { maxAge: '7d' }));
app.get('/benchmark.mjs', (_req, res) => res.sendFile(path.join(__dirname, 'gacha-benchmark.mjs')));
app.get('/benchmark', (_req, res) => res.type('html').send(`<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gacha — performance e memória</title>
<script type="importmap">{"imports":{"three":"/benchmark-assets/vendor/three/build/three.module.min.js","three/addons/":"/benchmark-assets/vendor/three/addons/"}}</script>
<style>body{background:#15151e;color:#eee;font:14px system-ui;margin:20px}button{padding:10px;background:#7a64de;color:white;border:0;border-radius:6px}#host{margin-top:14px;max-width:none}canvas{display:block;width:100%;height:100%}pre{white-space:pre-wrap;font-size:12px}table{border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #444;text-align:left}</style>
<h1>Gacha — performance e memória</h1><p>Amostras no aparelho atual. O formato de celular simula resolução, não a GPU de um telefone.</p>
<button id="run" disabled>Medir todos os cenários</button> <output id="status">Carregando módulos…</output>
<div id="host"></div><table id="results"><thead><tr><th>Cenário</th><th>Fase</th><th>FPS</th><th>CPU p50 / p95</th><th>GPU p50 / p95</th><th>WebGL MB*</th></tr></thead><tbody></tbody></table>
<p>* Memória de texturas, renderbuffers e buffers solicitada ao WebGL; não é a VRAM total do processo.</p>
<details><summary>Dados completos em JSON</summary><pre id="data">{}</pre></details>
<script type="module" src="/benchmark.mjs"></script></html>`));
app.use(express.static(publicDir));
app.get('/preview', (_req, res) => res.type('html').send(`<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gacha — validação visual</title>
<script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.min.js","three/addons/":"/vendor/three/addons/"}}</script>
<link rel="stylesheet" href="/mudae-salao.css">
<style>
:root{--brand:#9c89ff;--yellow:#ffc53d;--bg-panel:#171724;--bg-floating:#242335;--text-muted:#c5bfd7;--divider:#393747}
*{box-sizing:border-box}body{margin:0;background:#101019;color:#eae5f3;font:14px system-ui;padding:20px}
fieldset{border:0;padding:0;margin:0;min-width:0}fieldset:disabled button{cursor:wait;opacity:.5}
main{max-width:1000px;margin:auto}h1{font-size:19px;margin:0 0 14px}header{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px}
button,select,input{font:inherit;color:inherit;background:#2b283b;border:1px solid #514961;border-radius:7px;padding:7px 10px}
button{cursor:pointer}label{display:flex;align-items:center;gap:6px}input[type=number]{width:90px}
.salon-stage{width:100%;height:480px;flex:none;max-width:880px;margin:auto}.salon-stage[data-layout=mobile]{max-width:350px;height:440px}
.salon-stage[data-layout=wide]{height:350px}.salon-card-slot{position:relative;z-index:1}.salon-card.big{width:160px}
.salon-card-art{display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,#f6c68d,#8167ba 52%,#15142b)}
.portrait{font-size:88px;color:#fff5da;text-shadow:0 8px 28px #4b2b6e}.salon-card[hidden]{display:none}
footer{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}output{display:block;margin-top:12px;color:#b3aac7}
@media(max-width:500px){body{padding:12px}.salon-stage{height:440px}h1{font-size:17px}}
</style>
<main><h1>Gacha — validação visual</h1><fieldset id="controls" disabled><header>
<label>Raridade <select id="rarity"><option value="common">Comum</option><option value="rare">Raro</option><option value="epic">Épico</option><option value="legendary">Lendário</option></select></label>
<label>Tempo (ms) <input id="time" type="number" value="0" step="50" min="0"></label>
<label>Formato <select id="layout"><option value="desktop">Desktop</option><option value="mobile">Celular</option><option value="wide">Panorâmico</option></select></label>
<button id="play">Rodar animação</button><button id="pause">Pausar</button>
<label><input type="checkbox" id="card">Carta</label>
<label><input type="checkbox" id="reduced">Reduzir movimento</label>
<label><input type="checkbox" id="cinematic" checked>Efeitos cinematográficos</label>
<label>Qualidade <select id="quality"><option value="3">Completa</option><option value="2">Sem reflexo</option><option value="1">Sem brilho/sombras</option><option value="0">Básica</option></select></label>
</header>
<div class="salon-stage gacha" data-layout="desktop"><div class="salon-gacha"></div><div class="salon-card-slot"><div class="salon-card big r-common" hidden><div class="salon-card-art"><span class="portrait">✦</span></div><div class="salon-card-info"><div class="salon-card-name">Carta de teste</div><div class="salon-card-series">Prévia do Salão</div><div class="salon-card-value">◆ 1.000</div></div></div></div></div>
<footer><button data-phase="idle">Loja parada</button><button data-phase="crank">Manivela</button><button data-phase="drop">Queda</button><button data-phase="wobble">Última balançada</button><button data-phase="lock">Trava dourada</button><button data-phase="open">Abertura</button><button data-phase="done">Revelação</button><button id="claim">💖 Casar</button><button id="steal">😈 Roubo</button></footer>
<output id="status">Carregando cena…</output></fieldset></main>
<script type="module">
import {create} from '/gacha/cena.mjs';
import {duration, state, CRANK, DROP, WOBBLE, LOCK, OPEN} from '/gacha/linha-do-tempo.mjs';
const $=s=>document.querySelector(s), params=new URLSearchParams(location.search);
$('#reduced').checked=params.get('reduced')==='1';$('#quality').value=params.get('quality')||'3';$('#cinematic').checked=params.get('effects')!=='0';
localStorage.setItem('gachaQuality',JSON.stringify({q:Number($('#quality').value),at:Date.now()}));
let frozen=0,running=false,started=0,id=0,shown=false,resting=true;
const now=()=>running?frozen+performance.now()-started:frozen;
const gacha=await create($('.salon-gacha'),{now,reducedMotion:$('#reduced').checked,cinematic:$('#cinematic').checked,onLost:()=>$('#status').textContent='Contexto WebGL perdido',onMachine:()=>$('#play').click()});
gacha.setRollable(true);
$('#claim').onclick=()=>gacha.celebrate('claim');$('#steal').onclick=()=>gacha.celebrate('steal');
function showCard(){const card=$('.salon-card');card.hidden=!$('#card').checked;card.className='salon-card big r-'+$('#rarity').value;}
function position(t){resting=false;running=false;frozen=t;$('#time').value=Math.round(t);gacha.play({id:++id,rarity:$('#rarity').value,ts:0,revealAt:duration($('#rarity').value)});shown=false;showCard();}
$('#time').oninput=()=>position(Number($('#time').value));$('#rarity').onchange=()=>position(Number($('#time').value));
$('#layout').onchange=()=>$('.salon-stage').dataset.layout=$('#layout').value;
$('#card').onchange=showCard;
for(const control of [$('#quality'),$('#reduced'),$('#cinematic')])control.onchange=()=>{params.set('quality',$('#quality').value);params.set('reduced',$('#reduced').checked?'1':'0');params.set('effects',$('#cinematic').checked?'1':'0');location.search=params.toString()};
$('#play').onclick=()=>{position(0);running=true;started=performance.now();$('#card').checked=false;showCard()};
$('#pause').onclick=()=>position(now());
for(const button of document.querySelectorAll('[data-phase]'))button.onclick=()=>{
 const r=$('#rarity').value,d=duration(r),w=r==='common'?1:r==='rare'?2:3;
 const times={crank:300,drop:850,wobble:CRANK+DROP+(w-.1)*WOBBLE,lock:CRANK+DROP+3*WOBBLE+LOCK*.85,open:d-OPEN*.3,done:d+50};
 if(button.dataset.phase==='idle'){resting=true;running=false;gacha.rest(null);$('#card').checked=false;showCard();$('#status').textContent='Loja parada';return}
 position(times[button.dataset.phase]);
};
function tick(){const t=now(),r=$('#rarity').value;if(running){$('#time').value=Math.round(t);if(t>=duration(r)&&!shown){shown=true;$('#card').checked=true;showCard();const a=gacha.cardAnchor(),box=$('.salon-stage').getBoundingClientRect(),c=$('.salon-card'),b=c.getBoundingClientRect();c.style.setProperty('--from-x',a.x-(b.left-box.left+b.width/2)+'px');c.style.setProperty('--from-y',a.y-(b.top-box.top+b.height/2)+'px');c.classList.add('emerging');c.onanimationend=()=>c.classList.remove('emerging')}}$('#status').textContent=resting?'Loja parada':state(r,t,{reduced:$('#reduced').checked}).phase+' · '+Math.round(t)+' ms';requestAnimationFrame(tick)}
gacha.rest(null);$('#controls').disabled=false;$('#status').textContent='Cena pronta';requestAnimationFrame(tick);
</script></html>`));
app.listen(38147, '127.0.0.1', () => console.log('Prévia: http://127.0.0.1:38147/preview'));
