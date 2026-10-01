# Gacha 3D no Salão do Mudae — design

Data: 2026-10-01 · Base: Salão do Mudae v0.99.9 (branch `claude/mudae`)

## Objetivo

Trocar a roleta de fotos do palco do Salão por uma cena 3D feita só com código (Three.js, sem imagens prontas):
uma lojinha japonesa de rua à noite com máquinas gashapon. Quando alguém roda, o botão da máquina gira, uma
cápsula cai, quica, balança subindo de cor conforme a raridade e abre; a carta do personagem sai de dentro.
Todos no Salão veem a mesma coisa ao mesmo tempo. Tem que ser bonito ("alta qualidade"), leve para o servidor
e fácil de estender com outros cenários e outros lançadores (esfera, pião…).

Fora do escopo: cosméticos por pessoa, outros cenários e lançadores (só a arquitetura fica pronta para eles),
mudanças no modo simplificado e no chat.

## A experiência

Linha do tempo de um roll, contada a partir de `ts` (hora do roll no servidor):

| Fase | O que acontece | Duração |
|---|---|---|
| `crank` | câmera aproxima um pouco; o botão da máquina central gira 1 volta com *clack*; a cúpula sacode, as cápsulas internas se mexem | 500 ms |
| `drop` | a cápsula sai pela portinhola, cai, quica 2 vezes no chão molhado (respingo) e rola até o círculo de luz | 600 ms |
| `wobble` ×N | cada balançada é um tombo para um lado e volta; a cor da cápsula pode subir de nível no pico da balançada; pontinhos acima da cápsula acendem (N de 3) | 450 ms cada |
| `lock` (só lendário) | a cápsula trava, treme cada vez mais forte, fica dourada e a luz dourada toma a cena | 1000 ms |
| `open` | as metades estouram para os lados e sobe um feixe de luz da cor da raridade | 400 ms, terminando no `revealAt` |
| revelação | no `revealAt` a carta (HTML) sai de dentro da cápsula, pequena e de lado, sobe até o lugar dela e vira de frente | 750 ms (já dá para casar) |

Balançadas e cores por raridade (a cápsula cai branca):

| Raridade | Balançadas | Cores no pico de cada balançada | `revealAt - ts` |
|---|---|---|---|
| comum | 1 | branco | 500+600+450+400 = **1950 ms** |
| raro | 2 | branco → azul | **2400 ms** |
| épico | 3 | branco → azul → roxo | **2850 ms** |
| lendário | 3 + trava | branco → azul → roxo → (trava) dourado | 500+600+1350+1000+400 = **3850 ms** |

Para não entregar o resultado cedo: no raro, a 1ª balançada fica branca; no épico, as duas primeiras sobem só até
azul; a cor final só aparece na última balançada. O lendário é idêntico ao épico até a trava.

A cápsula é uma fonte de luz (PointLight) na cor atual: quando sobe para roxo, máquina, chão e poças ficam roxos;
no lendário a luz ambiente da cena inteira esquenta para dourado por ~2 s, junto com o banner/flash que já existem.

Cena parada (ninguém rodando): chuva fina, neon piscando de vez em quando, pétalas caindo, a cápsula/carta do
último roll em cima do círculo de luz (carta HTML como hoje). Esse "idle" roda a ~30 fps e para quando a aba está
escondida, o Salão não está na tela ou a aba não é a Mesa.

Quem entra no meio de um roll vê a animação no ponto certo (a linha do tempo é uma função do tempo). Quem volta
de outra aba depois do `revealAt` vê direto a carta revelada, sem replay.

Sons: os presets atuais de raridade (`mudaeCommon`…`mudaeLegendary`) continuam no `revealAt`; entram presets
novos curtos (`gachaClack`, `gachaBounce`, `gachaWobble`, `gachaPop`), sintetizados como os outros em `sounds.js`.

## A cena (estilo brinquedo)

Formas simples, cantos arredondados, cores pastel, luz caprichada. Tudo gerado por código:

- **Loja**: fachada de madeira escura (caixas), vitrine com luz quente por dentro (plano emissivo com prateleiras
  em silhueta), porta escura no centro, toldo listrado vermelho/branco (textura gerada em `<canvas>` e geometria
  levemente ondulada), lâmpada pendurada sobre o centro (SpotLight quente fazendo o círculo de luz no chão).
- **Neon "ガチャ"** e estrela: texto desenhado num `<canvas>` (fonte do sistema com fallback; se o sistema não
  tiver fonte japonesa o texto vira "GACHA") como textura emissiva + bloom; pisca de vez em quando.
- **Máquinas**: modelo procedural único (corpo em `RoundedBoxGeometry`, cúpula de acrílico transparente com
  `MeshPhysicalMaterial` com `transmission`, placa do mecanismo, botão giratório, portinhola); 4 cópias pastel nas
  laterais (menta, rosa, azul-claro, amarelo) e a central lavanda com frisos dourados. Cápsulas dentro das cúpulas
  com `InstancedMesh`.
- **Cápsula**: duas meias-esferas (metade de cima transparente, metade de baixo colorida), friso na emenda.
- **Chão**: asfalto molhado com `Reflector` em meia resolução + leve rugosidade para os reflexos do neon;
  respingos e pétalas como partículas (`Points`).
- **Chuva**: `LineSegments`/`Points` instanciados caindo, reaproveitando as mesmas partículas.
- **Pós-processamento**: `EffectComposer` + `UnrealBloomPass` (só o neon, a cápsula e o feixe passam do limiar)
  + `OutputPass`.
- **Câmera**: perspectiva frontal, levemente de baixo. Em tela larga mostra as 5 máquinas; em tela estreita
  (retrato) se aproxima e mostra a central e metade das vizinhas. Faz um pequeno *dolly-in* no `crank` e um
  *push* maior no lendário.
- As cores de raridade vêm dos tokens que o Salão já usa (`--rarity-common/rare/epic/legendary`), lidos do CSS.

## Arquitetura

```
public/gacha/
  linha-do-tempo.mjs   função pura: (raridade, ms desde o roll) -> estado da cena; também exporta as durações
  cena.mjs             renderizador, câmera, luzes, composer, laço de desenho, resize, perda de contexto, dispose
  loja.mjs             o cenário (fachada, toldo, lâmpada, neon, chão, chuva, pétalas)
  maquina.mjs          a máquina gashapon procedural (com botão, cúpula, cápsulas internas)
  capsula.mjs          o lançador: aplica o estado da linha do tempo na cápsula e na luz dela
```

- **Three.js** vira dependência npm (`three@0.185.1`, versão fixa: é a última que ainda publica os arquivos
  minificados `three.module.min.js` e `three.core.min.js`) e é servido pelo próprio servidor em `/vendor/three/build`
  e `/vendor/three/addons` a partir de `node_modules/three` (mesmo padrão do `/vendor/noise`), com cache de 7 dias.
  Um `<script type="importmap">` no `index.html` mapeia `three` e `three/addons/`. Funciona igual no site e no app
  de desktop, sem depender de CDN; o deploy já roda `npm ci --omit=dev`.
- Os módulos de `public/gacha/` são ES modules (`.mjs`) carregados com `import()` dinâmico **só quando alguém abre
  a Mesa do Salão** e só se `WebGL2` existir.
- **Contrato com o Salão** (`mudae-salao.js` continua dono de carta, botões, fila, banner, sons e reações):

  ```js
  const { create } = await import('/gacha/cena.mjs');
  const gacha = await create(container, { now, reducedMotion, colors, onCue, onLost });
  gacha.play({ id, rarity, ts, revealAt });        // começa (ou retoma no ponto certo) a animação do roll
  gacha.rest({ rarity } | null);                    // cena parada, com ou sem cápsula aberta no círculo de luz
  gacha.cardAnchor();                               // {x, y, scale} em px do container: onde a carta sai
  gacha.setVisible(bool);                           // liga/desliga o laço (aba escondida, saiu da Mesa)
  gacha.dispose();                                  // libera GPU ao sair do Salão
  ```

  `create` rejeita se não houver WebGL ou se a inicialização falhar; aí o Salão usa a roleta atual. `onCue(nome)`
  avisa os momentos de som (`crank`, `bounce`, `wobble`, `lock`, `pop`); `onLost()` avisa que a placa de vídeo caiu.
  `play` usa `ts` e `revealAt` para esticar ou encolher a linha do tempo e abrir exatamente no `revealAt`.
- **O canvas fica atrás da carta**: `.salon-stage` ganha uma camada `.salon-gacha` (canvas) por baixo do
  `.salon-card-slot`. Durante o roll a carta HTML fica escondida; no `revealAt` ela aparece em `cardAnchor()`,
  pequena e de lado, sobe até o lugar normal e vira (CSS 3D). Depois disso o palco é o de hoje (botão de casar,
  anel, reações) com a cena 3D viva atrás.
- **Servidor**: `mudae.js` troca `SPIN_MS` por `REVEAL_MS = { common: 1950, rare: 2400, epic: 2850, legendary: 3850 }`
  e `revealDelay(rarity)`; `server.js` usa `revealAt = now + revealDelay(card.rarity)`. As iscas (`decoys`) continuam
  sendo enviadas porque a roleta de reserva usa. Um teste garante que `REVEAL_MS` bate com as durações da
  `linha-do-tempo.mjs`.
- Modo simplificado e linha compacta do chat não mudam: já escondem o resultado até o `revealAt`, seja qual for.

## Desempenho e erros

- Desenha só quando precisa: 60 fps durante um roll, ~30 fps no idle, nada com a aba escondida ou fora da Mesa.
- `devicePixelRatio` limitado a 2 no desktop e 1,5 em telas estreitas; o `Reflector` em meia resolução.
- Qualidade adaptativa: se a média ficar abaixo de ~40 fps por 2 s durante o idle, desliga reflexo, depois bloom,
  depois baixa a resolução. A escolha fica guardada no `localStorage` deste navegador.
- `webglcontextlost`: para o laço e o Salão volta para a roleta até a página ser recarregada.
- Sem WebGL2, erro de import, ou `GachaStage.create` falhando: roleta atual, sem aviso de erro.
- "Reduzir movimento": sem câmera, sem quiques nem balançadas; a cápsula aparece fechada com a cor final e abre
  no `revealAt`. Chuva e pétalas desligadas.
- Peso: Three.js (~750 KB minificado, ~190 KB com o gzip que o Caddy já faz) + addons usados + módulos próprios,
  baixados uma vez e guardados em cache.
  Nenhuma mudança de custo no servidor.

## Testes

- `test/gacha-timeline.test.mjs`: fases e cores por raridade; nenhuma cor acima de azul antes da última
  balançada no épico/lendário; "entrar no meio" devolve o estado certo; durações batem com `REVEAL_MS`.
- `test/mudae.test.js` / `test/mudae-server.test.js`: `revealAt - ts` igual a `REVEAL_MS[rarity]`.
- `test/server-ui.test.js` (jsdom, sem WebGL): o Salão continua girando a roleta de reserva e revelando.
- Verificação no navegador: desktop, celular (retrato) e tema escuro; roll comum, raro, épico e lendário (catálogo
  só com lendários via `MUDAE_CATALOG`); duas contas vendo o mesmo roll em sincronia; entrar no meio de um roll;
  aba escondida e volta; fps durante o roll e no idle; uso de GPU com a cena parada.
