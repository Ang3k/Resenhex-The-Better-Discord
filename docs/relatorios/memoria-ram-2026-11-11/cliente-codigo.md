# Memória RAM do cliente (public/) — leitura do código

Data: 11/11/2026. Worktree `claude/memoria-ram` (c3965e7, site 2.6.0). Só leitura de código: nada foi medido ao vivo aqui.
Caminhos relativos a `discord-clone/public/`, salvo quando dito.

Legenda:
- **Visto no código**: o comportamento está escrito no arquivo e linha citados.
- **Conta**: número calculado a partir de constantes do código (tamanho × bytes).
- **Estimativa**: ordem de grandeza tirada do que se sabe do Chromium/WebRTC; precisa da medição ao vivo para confirmar.
- "Renderer" = processo da página; "GPU" = processo da GPU do Electron.

---

## Resumo: os 15 mais pesados (por MB estimados)

| # | O quê | Onde | MB (conta ou estimativa) | Quando | Ideia de corte (sem mudar o que se vê/ouve, salvo aviso) |
|---|---|---|---|---|---|
| 1 | Player do YouTube do DJ nunca é destruído | `music.js:96` (cria), `music.js:139-144` (sem música só faz `stopVideo`) | **Estimativa 80–150 MB** num processo à parte (iframe do youtube.com) + decodificação do vídeo | Depois do 1º uso do DJ, até fechar o app | `player.destroy()` e esvaziar `#dj-yt` quando `music()` fica nulo por ~30 s; recriar na próxima música |
| 2 | Mensagens acumuladas sem limite na sessão | `app.js:2612` (`push` sem teto), `app.js:1716-1726` (cada canal aberto fica na memória), `app.js:713` (só zera ao reconectar) | **Estimativa 10–20 KB por mensagem no canal aberto** (DOM + objeto + assinatura) e 1–4 KB nos outros; Salão do Mudae aberto por dias: dezenas a centenas de MB | Cresce com o tempo | Cortar para as últimas 300 (igual ao servidor, `server.js:45`) nos canais fora da tela; no canal aberto, cortar quando a pessoa está no fim da lista. **Muda**: a rolagem para cima no canal aberto fica com 300, como já é depois de recarregar |
| 3 | Câmera em P2P: um codificador VP8 720p por pessoa e todas as câmeras decodificadas mesmo fora da tela | `media-session.js:121` (VP8 por conexão), `media-session.js:434` (1280×720 a 30), `media-session.js:276` (mesma resolução para todos), `app.js:2864` (vídeo da câmera sempre ligado) | **Estimativa 8–15 MB por codificador + 8–15 MB por câmera recebida** no renderer, mais 4–10 MB por câmera na GPU | Na chamada com câmera; multiplica pelo número de pessoas | Quem recebe avisa o tamanho do bloco e se ele está na tela (como já é feito com as telas); quem envia usa `active:false` para quem não vê e `scaleResolutionDownBy` para bloco pequeno |
| 4 | Estoque de fotos do Salão decodificadas e nunca soltas | `mudae-salao.js:112-127` (`WARM_MAX = 24` por fonte, 5 fontes), `mudae-salao.js:88-100` (`img.decode()`), `mudae-salao.js:209-223` (sair do Salão não limpa) | **Conta**: até 120 fotos; decodificadas 0,3–1,6 MB cada → **até ~40–100 MB** no cache de imagens (o navegador pode descartar) + 5–10 MB comprimidos | Ao abrir o Salão; fica depois de sair | `warm.clear()` no `unmount()`; decodificar só as próximas ~8 da roleta e deixar o resto só baixado |
| 5 | Sons do soundboard decodificados e guardados | `sounds.js:108-128` (cache por contexto), `sounds.js:131` (pré-carrega ao entrar na chamada), `sounds.js:341-347` (até 32 sons do servidor) | **Conta**: os 8 sons prontos (32,85 s estéreo + 1,6 s mono, 48 kHz) = **12,9 MB** decodificados; sons do servidor até 8 s mono 48 kHz = 1,5 MB cada, **até 49 MB** (32 sons) | Cresce com o uso do soundboard | Guardar só os bytes MP3/WAV (560 KB) e decodificar na hora de tocar (alguns ms), soltando o `AudioBuffer` no `onended`; ou manter só os 4 últimos |
| 6 | Fotos do chat em tamanho original | `app.js:2017` e `app.js:2023` (src = original), `style.css:361` (mostra no máximo 400×300), `server.js:47` (upload até 50 MB) | **Conta**: foto de 12 MP = 4000×3000×4 = **48 MB** ao decodificar; os bytes originais (2–5 MB) ficam enquanto a mensagem existe | Ao rolar por fotos; fica enquanto o canal está aberto | Servidor gera miniatura (~800 px WebP) para o chat; o original só no lightbox. Na tela fica igual (400 px × tela 2×) |
| 7 | Rolo de áudio do Clipar | `app.js:5686`, `clip-buffer.js:3` (até 12 pessoas), `clip-buffer-worklet.js:5` e `:42` (30 s em Int16) | **Conta**: 30 s × 48.000 × 2 bytes = **2,9 MB por pessoa** (eu inclusive); 5 pessoas = 14,4 MB; 12 = **34,6 MB** | Sempre, em toda chamada | Guardar o anel em Opus (WebCodecs `AudioEncoder`, ~64 kbit/s → ~0,24 MB por pessoa). **Muda pouco**: recompressão de algo que já chegou em Opus; testar se dá para ouvir diferença |
| 8 | Rolo de tela do Clipar | `clip-screen.js:5-8` (1280×720, 3 Mbit/s, 30 s), `:91` (OffscreenCanvas), `:92-101` (VideoEncoder), `:98` (pedaços) | **Conta**: 3 Mbit/s ÷ 8 × 31 s = **11,6 MB** + canvas 1280×720×4 = **3,7 MB**; codificador H.264 na GPU: **estimativa 10–30 MB** | Sempre que alguém transmite e eu assisto (ou transmito) | Ligar o rolo só depois de alguns segundos assistindo; ou guardar os quadros já codificados que chegam (Encoded Transform) em vez de decodificar e codificar de novo |
| 9 | Supressão de ruído por IA + contextos de áudio que nunca param | `app.js:5297` (`noise.ctx`), `app.js:5314-5318` (GTCRN), `app.js:5441` (`audioCtx`), `sounds.js:136` (`ctx` dos sons); nenhum `suspend()` no código | **Conta**: a memória inicial do `gtcrn.wasm` é 267 páginas × 64 KiB = **16,7 MB** por microfone ligado; teste de microfone durante a chamada cria outro (+16,7 MB). 3 contextos de áudio rodando para sempre depois da 1ª chamada: **estimativa 1–2 MB + uma thread de áudio cada** | GTCRN: na chamada (padrão é "IA avançada"). Contextos: da 1ª chamada até fechar | GTCRN não dá para cortar sem mudar o som. Suspender `audioCtx` e `noise.ctx` ao sair da chamada; os sons da interface usarem o mesmo contexto da chamada |
| 10 | Fotos de perfil, banners e fundos em GIF | `app.js:230-239` (img sempre animada), `server/avatar.js:87` (GIF de foto até 1024 px, 200 quadros), `server/avatar.js:102-114` (banner/fundo GIF até 1500 px, 500 quadros) | **Conta**: foto GIF 1024×1024×4 = **4 MB por quadro decodificado**; banner GIF 1500×1500×4 = **9 MB** por quadro | Sempre que a foto aparece (lista de membros, chat, chamada) | Servidor gera um GIF/WebP animado pequeno (128 px) para os lugares pequenos; o grande só no cartão de perfil. Na tela fica igual |
| 11 | Todo o código e CSS carregados na abertura | `index.html:1380-1434` (49 scripts), `index.html:25-62` (38 CSS) | **Conta**: 1,43 MB de JS; 38 dos 49 arquivos têm algum caractere fora do Latin-1 (—, →, emoji), então o texto fica em 2 bytes por letra: **~2,7 MB só de texto do código**; com bytecode e estruturas, **estimativa 10–20 MB**. CSS: 598 KB, 5.228 blocos, **estimativa 2–4 MB** | Sempre | Carregar Mudae (313 KB JS + 149 KB CSS), Clipar (57 KB), DJ (36 KB), Novidades (96 KB), recorte de som, Android e landing só quando forem usados; minificar no deploy; trocar `—`/`→` por escapes `\u` para o texto ficar em 1 byte |
| 12 | Respostas de impulso dos efeitos de voz guardadas | `voice-fx-chosen.mjs:62-81` (cache por contexto, nunca limpo), `voice-fx-assets/manifest.json` | **Conta**: caverna 485.760, alien 483.840, fantasma 489.600 amostras mono, banheiro 133.967, acordes 116.544, coral 155.280 estéreo, em float = **9,1 MB** se todos forem usados; o ConvolverNode guarda outra cópia transformada (**estimativa 2–4× o tamanho** enquanto o efeito está ligado) | Ao usar efeitos de voz; fica até fechar | Limpar o cache ao desligar o efeito (volta do cache HTTP na próxima vez) |
| 13 | Filtros de desfoque grandes na GPU | `music.css:51` (blur 56 px num quadro 124% do bloco do DJ), `call-stage.css:73` (blur 24 px na prévia da transmissão), `mudae-salao.css:286` (blur 32 px), `mudae-forja.css:77-100` (sombra dupla + animações infinitas nas medalhas) | **Estimativa 4–15 MB de GPU por superfície** enquanto aparece (largura × altura × 4, mais passes do filtro) | Só com o recurso na tela | Desfocar uma vez uma imagem minúscula (ex.: 32×18) num canvas e esticar; o resultado é o mesmo borrão |
| 14 | Seletor de emojis fica montado depois da 1ª abertura | `emoji-picker.js:35-37` (JSON de 252 KB + Map), `emoji-picker.js:56-63` (1.870 botões com 3 funções cada), `emoji-picker.js:172` (fica guardado) | **Estimativa 3–6 MB** | Da 1ª abertura até fechar o app | Um ouvinte só no painel (delegação) e esvaziar a lista ao fechar; remontar ao abrir leva poucos ms |
| 15 | Prévia da transmissão | `stream-preview.js:68-79` (um `<video>` só para ler a própria tela, tocando o tempo todo), `stream-preview.js:170-173` (duas `<img>` por prévia) | **Estimativa 3–10 MB** (último quadro da captura em tamanho cheio + bloco desfocado) | Quem transmite, enquanto alguém não assiste | Pausar o `<video>` leitor entre uma foto e outra (a cada 15 s) ou ler um quadro só com `MediaStreamTrackProcessor` |

---

## 1. Carregado sempre ao abrir, mesmo sem usar o recurso

### 1.1 Scripts (todos entram por `<script>` no `index.html`, linhas 1378–1434)

Contei com `node` (script em `artifacts/memoria-ram-2026-11-11/laboratorio/cliente/sizes.js`). **Conta**: 49 arquivos, 1.430.184 bytes no disco. 38 deles (incluindo `app.js`) têm pelo menos um caractere fora do Latin-1 (travessão, seta, emoji), e aí o navegador guarda o texto inteiro do arquivo com 2 bytes por letra: **~2,74 MB só de texto do código**. Bytecode, funções e objetos criados na abertura somam mais (**estimativa 10–20 MB** no total do código).

| Grupo | Arquivos | Tamanho | O que cria ao abrir (visto no código) |
|---|---|---|---|
| Núcleo | `app.js` (489 KB), `media-session.js` 52 KB, `media-policy.js` 27 KB, `media-sfu.js` 28 KB (SFU está desligado no ar), `sounds.js` 22 KB, `icons.js`, `format.js` etc. | ~700 KB | Timers permanentes (ver 4.1), 2 MutationObservers no `body` inteiro, ResizeObservers |
| Mudae | `mudae.js`, `mudae-icones.js`, `mudae-troca.js`, `mudae-cristal.js`, `mudae-medalhas.js`, `mudae-forja.js`, `mudae-poderes.js`, `mudae-salao.js` | **312.737 bytes** (22% de todo o JS) | Só fábricas; as instâncias são criadas em `app.js:524-531` e não montam DOM até abrir um Salão. `music.js:47` cria e põe no `body` o `#dj-player` ao abrir |
| Novidades | `changelog.js` | 95.745 bytes | `changelog.js:5` monta o array com **todo o histórico** na abertura; só a versão (`:978`) é usada no início. **Estimativa ~0,5 MB** (texto em 2 bytes + objetos) |
| Clipar | `clip-buffer.js`, `clip-screen.js`, `clip-model.js`, `clip-render.js`, `clip-ui.js` | 56.755 bytes | `app.js:5686-5688` cria o anel e o rolo (vazios até a chamada) |
| DJ | `music.js` | 36.230 bytes | Cria `#dj-player` (`music.js:47`), `setInterval` de 500 ms (`:650`) e ouvinte de `resize` |
| Só celular/Android | `android-screen.js` 24 KB, `android.js` 7 KB, `mobile-stream.js` 17 KB | 48 KB | No Windows não fazem nada, mas são lidos |
| Só app de Windows | `desktop.js` 28 KB | | No navegador não faz nada; no app cria um `MutationObserver` no `<html>` (`desktop.js:55`) que lê `getComputedStyle` a cada troca de classe/estilo |
| Só página inicial | `landing.js` 13 KB | | No app a landing fica escondida, mas o código roda |
| Outros sob demanda | `sound-trimmer.js` 15 KB, `poll.js` 14 KB, `voice-fx.js` 12 KB, `lightbox.js`, `gif-picker.js`, `emoji-picker.js`, `feedback.js`, `photo-editor.js`, `voice-message.js` | ~110 KB | `poll.js:29` faz um `querySelectorAll` no documento todo a cada 1 s, para sempre |

Ideia (sem mudança visível): carregar sob demanda (`import()` ou `<script>` injetado na 1ª vez) os grupos Mudae (ao abrir um canal com `mudae: true`; as mensagens do bot só existem nos Salões), Clipar (ao entrar na chamada), DJ (quando a sala tem música), Novidades (ao abrir a janela; no começo basta a versão), recorte de som, Android e landing. Minificar no deploy tira os comentários (boa parte dos arquivos). Trocar os poucos caracteres fora do Latin-1 por `\u2014` etc. faz o texto do código cair pela metade.

### 1.2 CSS (`index.html:25-62`)

**Conta**: 38 folhas, 597.876 caracteres, 5.228 blocos `{`, 175 `@keyframes`. Mudae: `mudae-salao.css` 51 KB + `mudae-forja.css` 35 KB + `mudae-poderes.css` 24 KB + `mudae.css` 18 KB + `mudae-icones.css` 13 KB + `mudae-cristal.css` 8 KB = **149 KB (25% do CSS)**. Landing 29 KB, desktop 22 KB, música 20 KB, clips 15 KB.
**Estimativa**: 2–4 MB de regras na memória, e mais seletores deixam cada recálculo de estilo mais caro.
Ideia: as folhas do Mudae, do DJ, do Clipar e da landing entram junto com o JS delas.

### 1.3 `index.html` (78 KB): DOM que existe sempre

**Conta** (jsdom, `artifacts/memoria-ram-2026-11-11/laboratorio/cliente/dom.js`): **1.205 elementos**; **844 deles ficam dentro de blocos escondidos** desde a abertura. Os maiores: `#settings` com **523 elementos** (32 KB de HTML), `#landing` com 227 (escondida no app), `#app` 160, `#create-channel` 45, `#feedback` 36, `#reset-form` 21. Nenhum SVG no HTML; os ícones (`[data-icon]`) viram SVG na abertura (`app.js:325`).
Há um `<video id="camera-preview">` com `autoplay` (`index.html:919`), sem fonte até testar a câmera.
**Estimativa**: ~1–2 MB. É pouco perto do resto; montar `#settings` só ao abrir as configurações economizaria uns 0,5–1 MB.

### 1.4 Dados parseados na abertura
- `emoji-data.json` (252 KB, 1.870 emojis) **não** é baixado na abertura: só na 1ª vez que o seletor abre (`emoji-picker.js:35`). Depois fica para sempre (ver item 14).
- `changelog.js`: histórico inteiro como objetos (1.1).
- Nada de AudioContext, worker, canvas ou imagem grande criados na abertura no app de Windows (visto: todos os `new AudioContext` estão dentro de funções chamadas por uso; `landing.js:147` só no clique da landing).

---

## 2. Coleções que crescem sem limite numa sessão longa

### 2.1 Mensagens por canal — **confirmado: continua sem limite**
- `app.js:2612`: `state.messages[channel]?.push(msg)` — sem teto. O servidor guarda 300 (`server.js:45`, `server.js:470`).
- `app.js:1716-1726`: o 1º acesso a cada canal busca o histórico e **a lista fica** em `state.messages` mesmo depois de sair do canal (canais e conversas privadas).
- `app.js:713`: só uma **reconexão** zera tudo.
- `app.js:1736`/`:1829`: `msgNodes` guarda, para cada mensagem do canal aberto, o nó do DOM e `sig` = `JSON.stringify([msg, ...])` (`:1805`), ou seja, **uma segunda cópia da mensagem em texto**.
- O DOM do canal aberto tem **todas** as mensagens da lista (`app.js:1797-1838`), sem virtualização e sem `content-visibility` (nenhum uso no CSS).
- Cada mensagem já nasce com a barra de ações do hover montada (`app.js:1925-1934`): 1 div + 2 a 4 botões + 2 a 4 SVG com 2 traços cada = **9 a 17 elementos a mais por mensagem**, escondidos com `display:none` (`style.css:336-340`).
- O Mudae é 65% das mensagens (auditoria de 30/10). Cada roll traz carta com foto (`mudae.js:115`), botões e, no envio ao vivo, a lista de iscas da roleta (`server.js` `postMudae` manda `live`). A foto comprimida (30–150 KB) fica presa enquanto a mensagem existe.

**Estimativa** por mensagem no canal aberto: 10–20 KB (DOM ~20–40 elementos + objeto + `sig` + funções dos botões); com foto do Mudae, mais 30–150 KB comprimidos e 0,3–1,6 MB decodificados quando aparece na tela. Num Salão aberto por dias com centenas de rolls por dia, isso chega a **dezenas ou centenas de MB**, e cada redesenho (`renderMessages`) percorre a lista inteira.

Ideias:
1. Canais fora da tela: cortar para as últimas 300 (o que o servidor manda ao recarregar). **Sem mudança visível**.
2. Canal aberto: cortar para 300 quando a pessoa está no fim da lista (`stickToBottom`). **Muda**: quem rolar para cima depois de muitas horas não acha o que passou das 300 (igual a depois de recarregar).
3. Soltar a lista de canais não abertos há X minutos (busca de novo ao abrir).
4. Uma barra de ações só, movida para a mensagem sob o mouse (como o Discord). **Sem mudança visível**.
5. Trocar `sig` por um número de versão por mensagem (`msg.rev`), sem a cópia em texto.

### 2.2 Outros Maps e listas
| Onde | O que cresce | Limite | Peso |
|---|---|---|---|
| `mudae.js:189` (`pages`) e `mudae.js:253` (`lists`) | Uma entrada por mensagem de harém/$top já desenhada; `lists` guarda a página de personagens | **Nenhum** | Pequeno (KB), mas nunca sai |
| `mudae-salao.js:112-127` (`warm`) | Fotos pré-carregadas | 24 por fonte × 5 fontes = 120 | Grande (item 4); **não é limpo no `unmount`** (`:209-223`) |
| `mudae-salao.js:1240` (`profiles`) | Resumo do harém por pessoa | Nenhum (validade de 1 min, mas a entrada fica) | Pequeno |
| `sounds.js:108` (`bytes`) e `:109` (`decoded`) | MP3 e áudio decodificado dos sons prontos | Os 8 sons | Item 5 |
| `sounds.js:10` (`customBuffers`) | Sons do servidor decodificados | 32 | Item 5 |
| `voice-fx-chosen.mjs:2` (`buffers`) | Respostas de impulso por contexto | 6 arquivos | Item 12 |
| `gif-picker.js:7` (`cache`) | Páginas de busca de GIFs (5 min de validade, mas a entrada **não sai**) | Nenhum | Pequeno (só JSON) |
| `app.js:61` (`messageAuthors`) | Perfil público de quem escreveu | Nº de pessoas | Pequeno |
| `app.js:3153` (`callFloatSpoke`) | Uma entrada por `sid` (cada reconexão gera outro) | Nenhum | Pequeno |
| `app.js:1059` (`composerDrafts`) | Rascunho por canal, inclusive anexos pendentes (Blob + `createObjectURL`) | Nenhum | Só se a pessoa anexar e trocar de canal |
| `stream-zoom.js:12` (`views`) | Limpo quando o bloco sai (`:305`) | OK | — |
| `stream-preview.js:116` (`previews`) | Limpo em `prune` | OK | — |

### 2.3 `URL.createObjectURL`
Todos os usos têm `revokeObjectURL` correspondente (`app.js:2178/2275/7210/7235`, `photo-editor.js:101`, `sound-trimmer.js:262/297`, `sounds.js:368`, `stream-preview.js:133/135/141`). O único caso que segura por mais tempo é o anexo pendente em rascunho de outro canal (`app.js:2190`). **Sem vazamento relevante.**

---

## 3. Mídia

### 3.1 Contextos de áudio (quantos ao mesmo tempo)
| Contexto | Criado em | Taxa | Fecha/suspende? |
|---|---|---|---|
| `audioCtx` (falas, medidor, Clipar, saída única) | `app.js:5441` | do aparelho | **Nunca** |
| `noise.ctx` (microfone: IA de ruído + efeito de voz) | `app.js:5297` | 48 kHz | **Nunca** (só troca em `:6129-6148`) |
| `ctx` dos sons da interface e soundboard | `sounds.js:136/314/337/382` | do aparelho | **Nunca** |
| Áudio de aplicativos na transmissão (app Windows) | `desktop.js:110` | 48 kHz | Fecha no fim (`desktop.js:95`) |
| Tela do Android | `android-screen.js:142` | 48 kHz | Só Android |
| Mensagem de voz | `voice-message.js:42` | | Fecha (`:62`) |
| Mixagem do clipe | `clip-render.js:147` (Offline) | 48 kHz | Some sozinho |

**Visto**: não existe nenhum `suspend()` no código. Depois da 1ª chamada ficam **3 contextos rodando para sempre**, cada um com sua thread de áudio e sua saída aberta no serviço de áudio. **Estimativa**: 1–2 MB cada no renderer + CPU acordando a cada ~10 ms.
Ideia: suspender `audioCtx` e `noise.ctx` ao sair da chamada e retomar ao entrar (sem diferença no som); os sons da interface tocarem no `audioCtx` (o `sounds.js` já aceita uma saída de outro contexto, `callBus` em `sounds.js:5`).

### 3.2 AudioWorklets e WASM (memória contada a partir dos arquivos)
| O quê | Onde | Memória inicial do WASM (conta) | Quando |
|---|---|---|---|
| Supressão de ruído "IA avançada" (GTCRN, **padrão**, `app.js:98`) | `app.js:5284-5320` | 267 páginas = **16,7 MB** por microfone processado | Toda chamada com o padrão; teste de microfone durante a chamada cria outro |
| "IA leve" (RNNoise) | idem | 256 páginas = **16,0 MB** | Se escolhida (não economiza) |
| Autotalent (Autotune, Acordes, Coral) | `voice-fx-classic-worklet.mjs:122` | 256 páginas = **16,0 MB** | Só com esses efeitos |
| Signalsmith Stretch (Esquilo, Gigante) | `voice-fx.js:24` | não medido | Só com esses efeitos |
| Anel do Clipar | `clip-buffer-worklet.js` | 2,9 MB por pessoa (3.3) | Toda chamada |
| Remoção do som do próprio app (Windows 10) | `own-audio.js:14-15` | + 1 **Worker** (outro motor JS: **estimativa 3–6 MB**) | Só transmitindo com som do PC sem o recurso nativo |

`noise.wasm[mode]` (`app.js:5316`) guarda o binário (197 KB) para sempre: irrelevante.

### 3.3 Clipar: a conta
- **Áudio** (`clip-buffer-worklet.js:5`, `:42`): `Int16Array(sampleRate × 30)` por pessoa. A 48 kHz: 1.440.000 amostras × 2 bytes = **2,88 MB por pessoa**, eu inclusive. Teto de 12 pessoas (`clip-buffer.js:3`) = **34,6 MB**. Quem sai fica mais 30 s (`clip-buffer.js:22-24`). O histórico de estados (`clip-buffer.js:86-87`, a cada 100 ms, 300 entradas) é pequeno.
- **Tela** (`clip-screen.js:5-8`): 1280×720, 30 fps, **3 Mbit/s**, janela de 30 s com quadro-chave a cada 1 s. Bytes guardados ≈ 3.000.000 ÷ 8 × 31 s = **11,6 MB**. Mais `OffscreenCanvas` 1280×720×4 = **3,7 MB** (`:91`) e um `VideoEncoder` H.264 (`:92-101`) que fica na GPU (**estimativa 10–30 MB** de superfícies). Ele também lê **cada quadro** da transmissão assistida por um clone da trilha (`:102-103`).
- **Ao abrir o corte** (`clip-ui.js:173-195`, `clip-buffer.js:117-121`): cada pessoa vira `Float32Array` de 30 s = **5,76 MB por pessoa** (o dobro do anel), mais canvas 1280×720 (3,7 MB), quadros decodificados do rolo e, ao ouvir ou gerar, um `OfflineAudioContext` de 2 × 30 s × 48 kHz × 4 = **11,5 MB**. Pico **estimado** de 40–90 MB com 5 pessoas, só enquanto o corte está aberto.

Ideias: anel em Opus (item 7; muda pouco o som e precisa ser ouvido antes); o rolo de tela começar só depois de ~5 s assistindo; converter para Float32 só o trecho escolhido, na hora de mixar.

### 3.4 Vídeo por participante
- Remoto: `<audio>` por conexão (`app.js:6342`), `<video>` da câmera no bloco (`app.js:2856`), `<video>` da tela (`app.js:2787`) e, no cartão flutuante, outro `<video>` com a mesma tela (`app.js:3168`). Os quadros são compartilhados; o custo maior é a decodificação, que acontece mesmo com o bloco escondido.
- Câmera (`media-session.js:434`): 1280×720 a 30 fps. Em P2P (o SFU está desligado no ar), **cada conexão tem o seu próprio codificador VP8** (`media-session.js:117-121`, `preferCodec(..., ['video/VP8'])`), e a resolução é a mesma para todos (`media-session.js:276`, `media-policy.js:224-225`, até 1,2 Mbit/s por pessoa em `media-policy.js:111`).
- A câmera remota fica ligada no `<video>` do palco o tempo todo (`app.js:2863-2865`), inclusive quando a pessoa está no chat e o palco não aparece. As telas já têm "assistir/não assistir"; as câmeras não.

**Estimativa** (libvpx VP8 720p no renderer): 8–15 MB por codificador; 8–15 MB por câmera recebida (decodificador + fila de quadros) e 4–10 MB por câmera na GPU (quadros para desenhar). Numa sala de 5 com câmeras: ~4 codificadores + 4 decodificadores = **~65–120 MB no renderer** só de câmera.
Ideia (sem mudança visível): quem recebe informa se o bloco da câmera está na tela e o tamanho dele; quem envia desliga (`active:false`) para quem não vê e reduz (`scaleResolutionDownBy`) para bloco pequeno, como já é feito com as telas (`media-session.js:22-31`).

### 3.5 Soundboard (`sounds.js`)
Durações lidas com `ffprobe`: aplausos 5,5 s, badumtss 3,6, buzina 1,6 (mono), fail 4,85, grilo 4,6, suspense 5,5, trovão 5,0, vitória 3,8 (todos 48 kHz, estéreo salvo a buzina).
**Conta**: (32,85 s estéreo × 2 + 1,6 s mono) × 48.000 × 4 bytes = **12,9 MB** se todos tocarem; mais 560 KB de MP3 em `bytes` (pré-carregados ao entrar na chamada, `sounds.js:131`). Sons do servidor: até 8 s mono a 48 kHz (`sounds.js:405`) = **1,5 MB** cada, guardados até 32 (`sounds.js:342`) = **até 49 MB**.
O recorte de som (`sounds.js:377-401`) decodifica até 5 min: estéreo 48 kHz = **115 MB** + cópia mono **57,6 MB**, só enquanto a janela de recorte está aberta.

### 3.6 Efeitos de voz
`voice-fx-chosen.mjs:62-81` guarda as respostas de impulso decodificadas por contexto. Como `noise.ctx` nunca fecha, elas ficam até fechar o app. **Conta** (frames do `manifest.json`, float 4 bytes): caverna 1,94 MB, alien 1,94 MB, fantasma 1,96 MB, banheiro 1,07 MB, acordes 0,93 MB, coral 1,24 MB = **9,1 MB**. O `ConvolverNode` guarda também a versão transformada (**estimativa 2–4×** enquanto o efeito está ligado). Caverna clássica cria um impulso de 2,6 s mono na hora (`voice-fx.js:34-38`, 0,5 MB).

### 3.7 Imagens
- **Fotos do chat**: sempre o original (`app.js:2017`, `:2023`), mostrado em no máximo 400×300 (`style.css:361`). Upload até 50 MB (`server.js:47`). Não há miniatura no servidor.
- **Prévias de link**: `app.js:2050`, imagem do site no tamanho original (geralmente 1200×630 = **3 MB** decodificada), mostrada em até 440 px.
- **GIFs do KLIPY**: já vêm no tamanho médio (`gif-picker.js` `toMessageGif`) e com `width/height` (`app.js:2038`). OK.
- **Fotos de perfil**: PNG até 256 px (OK). **GIF até 1024 px e 200 quadros** (`server/avatar.js:87`), sempre animado em qualquer lugar.
- **Banner e fundo**: PNG até 640×256 e 480×600 (OK); **GIF até 1500 px e 500 quadros** (`server/avatar.js:37-39`, `:102-114`).
- **Overlay "sem animação"**: `app.js:7550-7559` congela a foto com um canvas no tamanho natural e guarda um `data:` PNG (para um GIF de 1024 px, um texto de 1–3 MB). Só nas configurações do overlay.
- **Salão**: item 4. As fotos do catálogo: AniList "large" (~230×345), IGDB `t_cover_big_2x` (528×748), wikis com `scale-to-width-down/400`, Comic Vine `scale_large`. **Conta**: 0,3 a 1,6 MB por foto decodificada.

### 3.8 Prévia da transmissão (`stream-preview.js`)
Quem transmite mantém um `<video>` fora da página tocando a própria captura (`:68-79`) o tempo todo em que alguém não assiste, para tirar 1 foto a cada 15 s (`:12`). A foto é 640×360 (OK). Quem recebe põe a mesma foto em duas `<img>` (`:170-173`); a de fundo leva `blur(24px)` (`call-stage.css:73`) no tamanho do bloco.

---

## 4. Vazamentos prováveis e trabalho contínuo

### 4.1 `setInterval` permanentes (nunca desligados; CPU e lixo, pouca memória presa)
| Linha | Período | O que faz |
|---|---|---|
| `app.js:5601` | 50 ms | Porta do microfone (`updateGate`) |
| `app.js:5779` | 100 ms | Anel verde de quem fala + amostra do Clipar; sai cedo sem chamada |
| `app.js:7085` | 2 s | `getStats()` de cada conexão (ping) |
| `media-session.js:794` | 1,5 s | **Outro** `getStats()` de cada conexão |
| `app.js:7979` | 100 ms | Medidor das configurações |
| `app.js:6158`, `:6163` | 30 min / periódico | Senha do TURN; vigia do microfone |
| `music.js:650` | 500 ms | DJ (sai cedo sem música) |
| `poll.js:29` | 1 s | `querySelectorAll('[data-poll-ends]')` no documento todo |

Os dois `getStats()` por conexão a cada 1,5–2 s criam relatórios com centenas de objetos: muito lixo para o coletor e picos maiores de memória. Ideia: um só `getStats()` por conexão a cada 2 s, usado pelos dois.

### 4.2 Observadores
- `app.js:332`: `MutationObserver` no `body` inteiro (`childList`, `subtree`): a cada nó novo (cada mensagem), procura `input[type=range]` dentro dele.
- `app.js:8049`: `MutationObserver` no `body` inteiro **incluindo toda troca de `class`**. O anel verde troca classes a cada 100 ms (`app.js:5807-5808`), então ele dispara o tempo todo durante a chamada e agenda um `requestAnimationFrame`.
- `app.js:8069-8070`: em qualquer mudança da lista de canais ou de membros, refaz `tabIndex`/`onkeydown` de **todas** as linhas (função nova por linha a cada vez).
- `desktop.js:55`: lê `getComputedStyle` a cada troca de classe/estilo do `<html>`.
- `app.js:3209`, `:1770`, `:2536`, `:7993`: ResizeObservers globais, criados uma vez (OK).
- `stream-zoom.js:289`: um ResizeObserver por bloco, nunca desligado; o bloco sai do mapa ao sumir (`:305`), então é liberado junto. OK.

Ideia: limitar o observador de `class` aos elementos que abrem camadas (menus, janelas), ou trocar por chamadas diretas nas funções que abrem/fecham.

### 4.3 Coisas que ficam vivas depois do uso
- Player do YouTube (item 1).
- `warm` do Salão (item 4).
- Seletor de emojis montado (item 14).
- Contextos de áudio (3.1).
- Cache de efeitos de voz (3.6) e do soundboard (3.5).
- `mudae.js` `pages`/`lists` (2.2).

### 4.4 `requestAnimationFrame` em laço
- `mudae-cristal.js:150-158`: só enquanto há cristal na tela. OK.
- `voice-message.js:107`: só tocando. OK.
- Não achei laço de `requestAnimationFrame` sem fim.
- Atenção: o app de Windows usa `backgroundThrottling: false` (`desktop/main.js:117`), então timers, animações CSS infinitas e laços continuam no ritmo cheio com a janela minimizada (fora de `public/`, mas o efeito é na página).

---

## 5. Custo na GPU causado pela página

- **Desfoques grandes** (cada um vira uma superfície do tamanho do elemento, mais passes): `music.css:51` blur 56 px num quadro 124% do bloco do DJ em destaque (1600×900 de bloco → ~2000×1100×4 = **8,8 MB** por superfície, **estimativa**); `call-stage.css:73` blur 24 px por transmissão não assistida visível; `mudae-salao.css:286` blur 32 px na vitrine; `mudae-salao.css:628` blur 18 px; `mudae-salao.css:338` blur nas fotos da roleta girando; `music.css:37` blur 2 px na capinha.
- **backdrop-filter**: 10 usos, todos no cartão de perfil com fundo e nas configurações de perfil (`profile.css:119-129`, `profile-media.css:250-278`, `poll.css:95`). Só com esses abertos.
- **Animações infinitas**: 49 no CSS. As que podem ficar rodando sem a pessoa olhar: medalhas da Forja (`mudae-forja.css:90-100`: raios girando 24 s, brilho, estrelas, borda) dentro de SVG com **sombra dupla** (`mudae-forja.css:77-81`) — aparecem no perfil, no ranking e no `$forja` do chat, e SVG animado com filtro é redesenhado a cada quadro; ícones dos poderes (`mudae-icones.css:98-107`); disco do DJ (`music.css:69/86/161/186`); toque de chamada (`dm-call.css:44/85/115`).
- **will-change**: só 5 usos, todos pontuais (OK).
- **Vídeos**: cada câmera e tela recebida desenhada na tela usa texturas na GPU; o mesmo vídeo no palco e no cartão flutuante são duas camadas.
- **Imagens decodificadas em tamanho cheio**: fotos do chat (3.7), GIFs de perfil (item 10), prévias de link (3.7), fotos do Salão com `img.decode()` (item 4; o cache de imagens decodificadas pode morar na GPU).
- **Nenhum canvas grande visível** fora do Clipar (prévia 1280×720 só com o corte aberto, `clip-ui.js:194`) e do minimapa do zoom (`stream-zoom.js:144`, pequeno, redesenhado a cada 150 ms só com zoom ligado).

---

## 6. Como confirmar ao vivo (para quem mede)

Pelo DevTools Protocol, na página do app (só lê, não muda nada):

```js
({
  dom: document.querySelectorAll('*').length,
  msgs: document.querySelectorAll('#messages .msg').length,
  msgActions: document.querySelectorAll('.msg-actions').length,
  emojiButtons: document.querySelectorAll('.ep-emoji').length,
  videos: [...document.querySelectorAll('video')].map((v) => ({ w: v.videoWidth, h: v.videoHeight, live: !!v.srcObject, visible: !!v.offsetParent })),
  iframes: [...document.querySelectorAll('iframe')].map((f) => f.src.slice(0, 60)),
  // limite superior do que as imagens carregadas ocupam decodificadas, em MB
  imgDecodedMB: [...document.images].filter((i) => i.complete).reduce((s, i) => s + i.naturalWidth * i.naturalHeight * 4, 0) / 1e6,
  bigImgs: [...document.images].filter((i) => i.naturalWidth * i.naturalHeight > 1e6).map((i) => [i.naturalWidth, i.naturalHeight, i.src.slice(-40)]),
})
```

Comparações que isolam cada item: câmera ligada × desligada com 1 e 2 pessoas (item 3); antes × depois de usar o DJ e tirar a música (item 1); antes × depois de abrir e sair do Salão (item 4); soundboard tocando todos os sons (item 5); chamada com a supressão "Desligada" × "IA avançada" (item 9).
