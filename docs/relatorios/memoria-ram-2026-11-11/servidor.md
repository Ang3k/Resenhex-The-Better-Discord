# Memória RAM do servidor do Resenhex (11/11/2026)

Medição do processo Node do servidor (`discord-clone/server.js`, branch `claude/memoria-ram`, versão 2.6.0) para achar o que ocupa memória e o que cresce com o uso. Nenhum arquivo do repositório foi mudado. Os scripts de medição estão em `artifacts/memoria-ram-2026-11-11/laboratorio/servidor/`, e os números brutos (JSON) em `artifacts/memoria-ram-2026-11-11/servidor/`.

## Resumo em uma frase

**Hoje, quase toda a memória do servidor é o catálogo do Mudae: 87 MB dos ~104 MB de heap (84%).** Os dados de verdade do site (122 contas, ~1.300 mensagens) ocupam ~1,5 MB. Com uso grande, quem cresce são as **mensagens** (~430 bytes cada, todas na memória) e as **conexões** (~37 KB de heap cada, dois terços disso são as ~190 funções criadas para cada conexão). Também pesa a **geração jovem do V8**, que sozinha chegou a 128 MB de RSS com 1.000 pessoas conectadas. Não achei vazamento: quando todos saem, o heap volta ao que era.

## Como medi

- **Onde:** neste PC (Windows 11, Node 24.4.1), com `--max-old-space-size=6144` como no serviço (`deploy/instalar-vps.sh:189`) e `--expose-gc`. O servidor de produção usa Node 22 no Linux ARM. Os números de **heap** valem para lá (os dois são 64 bits sem compressão de ponteiros). Os de **RSS** (memória do processo vista pelo sistema) são do Windows e servem para comparar um cenário com outro, não como valor exato do servidor.
- **Medidor:** um preload (`medir-preload.js`, carregado com `node -r`) abre uma porta de controle local que roda o coletor de lixo duas vezes e devolve `process.memoryUsage()`, os espaços do heap, o pico de RSS e o heap de cada worker (`worker.getHeapStatistics()`). Também grava fotos do heap (`v8.writeHeapSnapshot`).
- **Atribuição:** `analisar-heap.js` lê a foto do heap, calcula a árvore de dominadores (quanto cada objeto segura sozinho) e soma por tipo. `diff-tipos.js` compara duas fotos. Para as coleções do banco, `medir-colecoes.js` lê cada uma do `data.db` como o servidor lê (`JSON.parse` por pedaço) e mede o heap antes e depois.
- **Dados de teste** (gerados por `gerar-banco.js`, a partir de um cadastro de verdade):
  - **B1, parecido com o ar hoje:** 150 contas, 35 servidores, 210 participações, 222 amizades, 75 conversas privadas, 1.774 mensagens (750 do Mudae), 300 casamentos. Banco de 1,3 MB. (O ar em 30/10: 122 contas, 33 servidores, 1.309 mensagens, 286 casamentos num servidor.)
  - **B2, grande:** 5.000 contas, 20 servidores com Salão do Mudae, 9.682 participações, 3.488 amizades, 5.229 conversas, 102.450 mensagens (18.000 em canais com 300 cada, 6.000 do Mudae, 78.450 em conversas privadas), 40.000 casamentos e 9.682 registros de uso do Mudae. Banco de 54,7 MB.
  - **Pessoas conectadas:** clientes socket.io de verdade (`clientes.js`, num processo à parte), entrando com sessões do banco, metade numa sala de voz. Em atividade, cada pessoa age a cada ~20 s: "digitando" e mensagem, comando do Mudae no Salão (`$w`, `$h`, `$m`, `$mm`, `$tu`), mutar e trocar o status. Com 1.000 pessoas, foram ~10 mil avisos por segundo entregues.

**Medido** = saiu de uma medição feita aqui. **Estimado** = conta feita a partir de tamanhos medidos ou do código, dita como tal.

## Onde vai a memória

### Cenário A: recém-ligado e vazio (medido)

| | Com o catálogo do Mudae | Sem o catálogo (`MUDAE_CATALOG` vazio) | Diferença |
|---|---|---|---|
| heapUsed | 102,6 MB | 15,5 MB | **87,1 MB** |
| heapTotal | 107,2 MB | 18,9 MB | 88,3 MB |
| RSS depois de 10 s | 178,6 MB | 102,9 MB | 75,7 MB |
| **Pico de RSS ao ligar** | **416,6 MB** | 103,6 MB | **313 MB** |
| external / arrayBuffers | 2,3 / 0,02 MB | 2,3 / 0,02 MB | 0 |
| Tempo para ligar | 1,25 s | 0,56 s | 0,7 s |
| Worker do checkpoint (heap) | 6,2 usados de 10 MB | igual | 0 |

O pico ao ligar vem do `JSON.parse` do arquivo inteiro (`server.js:936`): o texto de 33 MB e o array cru de 233 mil linhas ficam vivos junto com os objetos montados. Num servidor ligado havia 10 s, o RSS ainda estava em 352 MB; ele só cai depois de algumas dezenas de segundos.

### Cenário B: banco cheio, ninguém conectado (medido)

| | B1 (como o ar) | B2 (grande) |
|---|---|---|
| heapUsed | 104,2 MB | 165,1 MB |
| RSS | 184 MB | 251 MB |
| Dados do site no heap | ~1,5 MB | ~62,5 MB |

Por coleção, no B2 (medido com `medir-colecoes.js` e `medir-mudae-store.js`):

| Coleção | MB | Por item |
|---|---|---|
| Mensagens: conversas privadas (78.450) | 31,7 | 424 B |
| Mensagens: canais (18.000) | 6,3 | 368 B |
| Mensagens: Salão do Mudae (6.000) | 3,8 | 664 B |
| Servidores (20), sendo: | 10,2 | — |
| · casamentos do Mudae (40.000) | 5,0 | 130 B |
| · uso do Mudae (9.682) | 2,2 | 223 B |
| · estatísticas e kakera do Mudae | 1,3 | — |
| · o resto (membros, canais, cargos) | 1,5 | — |
| Contas (5.000) | 4,1 | 858 B |
| Conversas privadas, registro (5.229) | 1,9 | 382 B |
| Sessões + último uso (5.001) | 0,9 | 190 B |
| Amizades (3.488) | 0,7 | 209 B |
| Índices `social.js` (amizades e conversas por conta) | 1,6 | — (foto do heap) |
| Índice `serversOf` (`communities.js`) | 0,9 | — (foto do heap) |

### O catálogo do Mudae por dentro (medido)

Foto do heap do servidor vazio menos a foto sem catálogo, mais `estimar-fotos.js` para dividir os textos:

| Parte | MB | Observação |
|---|---|---|
| Textos (941 mil) | 43,0 | fotos ~22 MB (endereço completo, média de 81 letras); nomes ~6,8; chave normalizada `key` ~6,8; ids em texto ("g1942", 190 mil) ~6,1; `String(id)` no `byId` ~1 |
| Objetos dos 233.747 personagens | 25,0 | 112 B cada (11 campos) |
| Arrays e tabelas | 15,2 | `byId` 8,0; listas de sorteio 3,2; `chars` 2,0; `bySeries` 1,7; `ativos` 1,3; `seriesKeys` 0,4 |
| Números (`eq`, fracionário) | 3,6 | 16 B cada |
| **Total** | **87,1** | |

Fatos que importam para cortar: 100.978 personagens (43%) estão fora da roleta (8ª coluna = 1) e só aparecem no harém, no álbum, no ranking e na busca do `$im`. Fontes: séries 105.542, anime 43.340, desenhos 40.628, jogos 36.967, quadrinhos 7.270.

### Cenário C: pessoas conectadas, banco B2 (medido)

| Momento | heapUsed | heapTotal | RSS |
|---|---|---|---|
| Sem ninguém | 165,0 MB | 188 MB | 267 MB |
| 100 conectados, parados | 169,8 | 256 | 322 |
| 500 conectados, parados | 182,2 | 333 | 503 |
| 1.000 conectados, parados | 198,8 | 352 | 598 |
| 1.000 em atividade, 30 / 60 / 90 s | 199,6 / 200,1 / 200,3 | 342–344 | 448–462 |
| Todos saíram | 168,4 | 312 | 463 |
| Todos saíram + 25 s | 166,5 | 187 | 464 |

- **Por conexão (medido):** 33,7 KB de heapUsed (diferença do cenário) e 37 KB pela comparação das fotos do heap. O que é:
  - ~192 funções (10,8 KB), ~100 contextos de função (5,2 KB) e as tabelas de eventos e arrays (9,4 KB): é o padrão de `io.on('connection', …)` criar de novo, para cada conexão, as ~87 chamadas `on(evento, …)` (cada uma com duas funções) e as ~47 funções auxiliares (`server.js:1795–3520`). **Cerca de 24 KB, ou 65% do custo da conexão.**
  - Objetos do socket.io, do engine.io e do `ws` (Socket, WebSocket, Receiver, Sender, buffers): ~4 KB.
  - Índice `online` (`server/online.js`): ~1,6 KB por sessão (6 funções `get`/`set` por sessão, criadas por `Object.defineProperty`).
- **RSS por conexão:** de 0,17 a 0,33 MB no Windows, conforme o momento. Quase tudo é folga do heap (heapTotal foi de 188 para 352 MB) e não objeto vivo.
- **Atividade:** em 90 s com ~10 mil avisos por segundo, o heap vivo ficou parado em ~200 MB. Quem sobe é o lixo de curta duração: a geração jovem (`new_space`) foi a 64 MB e depois a 128 MB.
- **Vazamento:** nenhum. Todos saíram e o heap voltou a +1,3 a +3,4 MB do início. A diferença é código compilado pelo JIT (1,6 MB) e as mensagens novas. Os 25 s seguintes não mudaram nada.
- **Geração jovem menor** (`--max-semi-space-size=4`, mesmo teste): heapTotal 228 MB em vez de 352 com 1.000 parados, e ~216 MB em vez de ~343 em atividade. RSS 419 MB em vez de 598 (parados) e ~350 MB em vez de ~455 em atividade. O heap vivo é o mesmo. O cenário E compara 4, 16 e o padrão, com o processador.

### Cenário E: tamanho da geração jovem × processador (medido)

Banco B2, 1.000 pessoas entrando de uma vez e depois 60 s de atividade. Uma rodada de cada, no Windows: o processador tem ruído de alguns por cento.

| `--max-semi-space-size` | Geração jovem em atividade | heapTotal | RSS médio em atividade | Processador do servidor em 60 s | Avisos entregues | Respostas atrasadas (> 15 s) na entrada em massa |
|---|---|---|---|---|---|---|
| padrão (Node 24 com 6 GB: chegou a 64 MB por semiespaço) | 128 MB | 341 MB | **461 MB** | 42,9 s | 635.652 | 0 |
| 16 | 32 MB | 240 MB | **332 MB (−129 MB, −28%)** | 37,8 s | 639.175 | 1 `voice:join` |
| 4 | 8 MB | 235 MB | 391 MB (−70 MB) | 38,9 s | 639.713 | 38 `voice:join` |

O heap vivo foi o mesmo nos três (~200 MB). Com 16 MB, o RSS caiu ~130 MB sem gastar mais processador nesta medição. Com 4 MB, a entrada de 1.000 pessoas de uma vez deixou 38 pedidos sem resposta em 15 s, então **16 é o valor seguro**. Antes de adotar, vale confirmar no ARM, com o Node 22 e o simulador: o padrão do V8 muda com a versão.

### Cenário D: envio de arquivos (medido)

Banco B1, `POST /upload` de 45 MB com a sessão do dono, amostrando a memória a cada ~30 ms.

| Envios ao mesmo tempo | Pico de `external` | Pico de RSS amostrado | Pico de RSS (maxRSS) | Depois |
|---|---|---|---|---|
| 1 | 47 MB (era 2,3) | 230 MB (era 185) | — | volta a 185 MB |
| 4 | **182 MB** | 366 MB | **548 MB** | volta a 187 MB |

Cada envio em andamento segura o arquivo inteiro na memória (`express.raw`), e a cota diária limita bytes por dia, não envios simultâneos. Dez envios de 50 MB ao mesmo tempo passariam de 0,5 GB (estimado). Gravando direto no disco, o pico seria de alguns KB por envio (estimado).

### Workers (medido sozinho, `medir-workers.js`)

| Worker | Custo | Quando existe |
|---|---|---|
| Checkpoint do banco (`server/store-checkpoint.js`, aberto em `store.js:95`) | +11,0 MB de RSS (heap 6,2 usados de 10 MB, 3 MB external) | Sempre |
| Imagens (`server/image-worker.js`, aberto em `images.js:46`) | +12,7 MB de RSS | Da primeira foto enviada até o servidor desligar: nunca é fechado |

### Outros itens

| Item | MB | Medido ou estimado |
|---|---|---|
| Código carregado (tipo `code` na foto) | 3,8 | medido |
| `livekit-server-sdk` (`media-sfu.js:2`), carregado mesmo com o SFU desligado | 3,5 de heap e ~150–190 ms ao ligar | medido (heap antes e depois do `require`) |
| `nodemailer` (`mailer.js`) | 1,3 | medido (usado no ar) |
| `express` / `socket.io` | 1,9–2,4 / 2,7 | medido |
| Mapa `hits` dos limites contra abuso (`server.js:303`) | 0,73 com 1.000 em atividade | medido (foto do heap) |
| SQLite: cache de páginas | ≤ 2 MB por conexão × 2 (principal e checkpoint) | estimado (padrão `cache_size = -2000`; o `node:sqlite` não informa o uso) |
| SQLite: arquivo `-wal` | 0 na memória do processo (fica no disco, com até 32 MB) | código (`store.js:38`) |
| Prévias de links (`link-preview.js:16`) | até 500 prévias em cache, cada uma com centenas de bytes: < 0,5 MB | estimado |
| Buscas do DJ (`youtube.js:70–71`) | até 300 buscas e 2.000 vídeos: ~1 MB no máximo | estimado |
| Lista de jogos (`games.js:65`) | o JSON enxuto em texto, ~1 MB; ao atualizar (a cada `maxAge`), a lista inteira do Discord passa pela memória por alguns segundos | estimado (não baixei a lista) |
| Histórico do medidor (`health.js:84`) | 60 amostras: < 0,1 MB | código |

### Tabela geral: onde vai a memória

| Item | Vazio | B1 (como o ar) | B2 parado | B2 + 1.000 conectados |
|---|---|---|---|---|
| Catálogo do Mudae (heap) | 87,1 | 87,1 | 87,1 | 87,1 |
| Mensagens | 0 | ~0,7 (est.) | 41,8 | 41,8 |
| Servidores, com o Mudae dos servidores | ~0 | ~0,3 | 10,2 | 10,2 |
| Contas, sessões, amizades e conversas | ~0 | ~0,5 | 7,6 | 7,6 |
| Índices (`social`, `serversOf`, `accountIdByName`, `online`) | ~0 | ~0,1 | 2,5 | 4,1 |
| Conexões (socket.io e funções por conexão) | 0 | ~1 com 30 online (est.) | 0 | 33,7 |
| Código, bibliotecas e o resto do Node | 15,5 | 15,5 | 15,5 | 15,5 |
| **heapUsed** | **102,6** | **104,2** | **165,1** | **198,8** |
| Folga do heap (heapTotal − heapUsed) | 4,6 | 3,8 | 3,7 | 153 |
| Worker do checkpoint (RSS) | ~11 | ~11 | ~11 | ~11 |
| Worker de imagens (RSS, depois da 1ª foto) | +12,7 | +12,7 | +12,7 | +12,7 |
| **RSS (Windows)** | **179** (pico ao ligar 417) | **184** | **251** | **450–600** (332 com `--max-semi-space-size=16`) |

## O que cresce com o tempo

Procurei no código coleções sem limite, caches sem validade e relógios por conexão que não são limpos.

| O quê | Onde | Cresce com | Limite hoje | Peso |
|---|---|---|---|---|
| **Mensagens de todos os canais e conversas, sempre na memória** | `store.js:257` (`loadMessages` carrega tudo), `server.js:45` (`MAX_MESSAGES = 300`), `server.js:467` (`pushMessage`) | cada canal e cada conversa privada nova: até 300 × ~430 B ≈ 125 KB cada | 300 por canal, sem limite de canais | **Alto.** Hoje ~0,5 MB; no plano de 5 mil (1,35 milhão de mensagens) o próprio plano mediu ~950 MB |
| Falhas de login por IP e nome | `server.js:321` (`loginFailures`) | cada par IP+nome que errou a senha | nenhum: só sai ao acertar a senha ou redefini-la (`server.js:672`, `1990`) | Pequeno, mas um ataque de força bruta com nomes inventados aumenta sem parar (~150 B por par) |
| Limites contra abuso | `server.js:303` (`hits`) | uma lista de horários por ação e por conta ou conexão; chaves com `socket.id` (`select:`, `voice-media:`, `screen-quality:`, `screen-preview:`, `music-report:`) nascem a cada conexão | limpa a chave 1 h depois do último uso (`server.js:315`) | 0,73 MB com 1.000 em atividade; com reconexões em massa, ~1 h de chaves velhas |
| Relógios de castigo | `server.js:1709` (`timeoutTimers`) | uma entrada por castigo aplicado; o relógio que dispara não sai do mapa | só sai ao excluir o servidor (`server.js:1895`) | Mínimo |
| `lastRead` das contas | `server.js:775`, `2169`, `2749`, `2879` | um item por canal ou conversa lida | sai ao excluir o servidor (`server.js:1906`), não ao apagar um canal | Pequeno |
| Uso, estatísticas e kakera do Mudae de quem saiu do servidor | `mudae.js:161`, `mudae-conta.js` | cada conta que já usou o Mudae num servidor | nenhum | ~350 B por conta e servidor |
| Pausa dos cristais por servidor | `mudae-cristal.js:11` (`paused`) | servidor cujo Salão esvaziou | sai quando o Salão volta a ter gente | Mínimo |
| Worker de imagens | `images.js:46` | — | nunca fecha depois do primeiro uso | 12,7 MB fixos |
| Envios de arquivo inteiros na memória | `server.js:1101` (`/upload`, 50 MB), `1156` (`/clips`), `786` e `1030` (fotos) com `express.raw` | envios ao mesmo tempo | só o limite de tamanho de cada rota | Ver o cenário D |
| Imagem das prévias de link inteira na memória | `link-preview.js:65–72` (`fetchLimited` junta até 8 MB por imagem num Buffer; usado pelo proxy em `link-preview.js:188`) | pedidos ao mesmo tempo | 8 MB por pedido, sem limite de pedidos simultâneos | Pico, não acumula |
| Funções por conexão | `server.js:1795–3520` | cada conexão aberta | sai ao desconectar (sem vazamento) | 24 KB por conexão |

Conferidos e sem problema: `transfers` (`server.js:610`, limpo a cada uso), `uploaded` (`server.js:1075`, limpo de hora em hora), `activities` (sai no `disconnect`), DJ (`dj.js`, a sala some 5 min depois de esvaziar), trocas do Mudae (`tradeTimers`, `server.js:982`), tokens dos clipes (`clip-store.js:54`), e-mails enviados (`recovery.js:179`), cache das prévias (`link-preview.js:161`, 500 itens), buscas do YouTube (`youtube.js`, 300 e 2.000 itens), cristais (`mudae-cristal.js:74`). O `cardCrystalAt` (`server.js:2193`) fica dentro da conexão e não cresce, mas por isso a regra de "1 cristal de carta a cada 30 min" recomeça a cada reconexão. Isso é comportamento, não memória.

Os dados de teste que eu gerei puseram `buys: {}` no uso do Mudae (o certo é uma lista), e por isso alguns comandos responderam `(u.buys || []).filter is not a function` no cenário C. O erro é dos meus dados, não do servidor.

## As 10 maiores oportunidades de corte

Ordem pelo ganho no tamanho de hoje, e depois no do plano de 5 mil.

| # | O quê | Onde | Ganho | Muda algo para quem usa? |
|---|---|---|---|---|
| 1 | **Catálogo do Mudae compacto.** Versão completa: os textos (nome, obra, foto, chave de busca) numa tabela do SQLite ou num arquivo binário, lidos só quando uma carta aparece. Na memória ficam só números: posição, gênero, fonte, "fora da roleta" e as listas de sorteio como `Int32Array` de índices. `pos` e `eq` saem da posição na lista. Versão leve, sem mudar a estrutura: tirar `key` e `score` dos objetos, guardar a foto sem o começo repetido do endereço, `byId` com o id original e as listas como índices. | `server/mudae.js:107–149`, `server.js:936` | Completa: **−75 a −80 MB de heap** (estimado: sobram ~5–10 MB de arrays numéricos) e o pico ao ligar cai de 417 para ~110 MB. Leve: ~−22 MB (estimado: foto −8,6; `key` −6,8; `eq` −3,6; `score` −1,9; `String(id)` −1). | Nada visível. Os rolls, o harém e os rankings saem iguais. Abrir um harém de 300 cartas faria 300 leituras no banco (~1–2 ms no total, estimado). O `$im` passaria a buscar num texto único ou no banco. |
| 2 | **Mensagens antigas fora da memória** (a Fase 2b do plano): só as últimas ~50 por canal ficam na memória; o resto se lê do SQLite quando alguém rola para cima. Junto, gravar a mensagem sem `mentions` vazio e, nas conversas privadas, sem a menção que é sempre "o outro". | `server/store.js:257`, `server.js:45`, `server.js:467`, `chat:history` em `server.js:2155` | Hoje ~0,5 MB. No B2, de 41,8 para ~7 MB (estimado: 50 de 300). No plano de 5 mil, de ~950 MB para ~160 MB (estimado na mesma proporção). Formato: −120 B por mensagem de canal (medido: 368 → ~248 B). | Rolar o histórico além das 50 últimas traz a página do banco (alguns ms). |
| 3 | **Registrar os eventos do socket uma vez só**: uma tabela de handlers no nível do módulo, recebendo `(socket, conta, dados)`, e um despachante por conexão em vez das ~190 funções criadas em cada `io.on('connection')`. | `server.js:1795–3520` (o `on` em `1820`) | −24 KB por conexão (medido: 65% dos 37 KB). 30 online: −0,7 MB; 1.000: −24 MB; 5.000: −120 MB. | Nada. |
| 4 | **Geração jovem menor**: `--max-semi-space-size` no serviço (4 a 16 MB, ver o cenário E). | `deploy/instalar-vps.sh:189` | Com 16 MB: −129 MB de RSS (−28%) com 1.000 em atividade, sem mais processador (medido, cenário E). No Linux, `MALLOC_ARENA_MAX=2` no serviço também costuma reduzir o RSS das partes nativas (estimado, não medido aqui). | Nada visível. Com 4 MB, a entrada em massa atrasou respostas, então 16 é o valor seguro. |
| 5 | **Fechar o worker de imagens depois de ~60 s parado.** | `server/images.js:46` (o `start` e o `unref` em `21`) | −12,7 MB de RSS, quase sempre (medido). | A primeira foto depois de um tempo parado leva ~30–50 ms a mais (estimado: subir o worker). |
| 6 | **Um worker só para o checkpoint e as imagens**, ou o checkpoint com `resourceLimits` pequeno. O checkpoint passaria de `Atomics.wait` para um relógio dentro da mesma worker. | `server/store.js:95`, `server/store-checkpoint.js`, `server/images.js:33` | −11 MB de RSS (medido: o custo de um isolate a mais). | Nada. Uma foto pode esperar um checkpoint em andamento (até ~150 ms, pelo plano). |
| 7 | **Envios direto para o disco** (stream com limite de bytes), em vez de `express.raw` com o arquivo inteiro na memória. O mesmo vale para a imagem das prévias (`pipe` em vez de juntar até 8 MB). | `server.js:1101`, `1156`, `786`, `1030`; `server/link-preview.js:65–72` e `188` | −45 MB de pico por envio de 45 MB em andamento (medido: 4 envios = +180 MB de `external` e pico de RSS de 548 MB). | Nada. |
| 8 | **Ler o catálogo linha a linha** (se o item 1 não for feito): sem o texto de 33 MB nem o array cru inteiros na memória ao mesmo tempo. | `server.js:936` | Pico de RSS ao ligar −65 MB (medido isolado: 392 → 327 MB); heap final igual (86,9 MB). | Nada. |
| 9 | **Carregar o `livekit-server-sdk` só com o SFU ligado** (`require` dentro de `mediaSfu`, quando há `LIVEKIT_URL`). No ar o SFU está desligado. | `server/media-sfu.js:2` | −3,5 MB de heap e ~150–190 ms a menos para ligar (medido). | Nada. |
| 10 | **Limpar o `loginFailures` e trocar as listas de horários do `hits` por contadores** (balde: dois números por chave); tirar do `timeoutTimers` o relógio que já disparou. | `server.js:303–331`, `server.js:1709–1716` | Pequeno hoje (0,73 MB com 1.000 em atividade, medido). Tira o crescimento sem limite que um ataque de senha provoca. | Nada. |

Menores, para quando mexer por perto:
- `online.js:31`: os campos vigiados como acessores na classe, em vez de `Object.defineProperty` por sessão: ~1 KB por conexão (estimado a partir dos 1,6 KB medidos).
- Limpar o uso, as estatísticas e o kakera do Mudae e o `lastRead` de quem saiu, ao sair do servidor ou ao apagar o canal.
- Guardar o mesmo texto de `authorId` uma vez só ao carregar as mensagens: −28 B por mensagem (medido: 409 → 381 B).

## Ordem sugerida

1. Itens 9, 5, 10 e 8: pequenos, sem risco e sem mudança visível.
2. Item 1 (catálogo): sozinho, leva o heap de ~104 para ~25–30 MB no tamanho de hoje.
3. Item 4 (`--max-semi-space-size=16`): é uma linha no serviço, mas medir no ARM antes, com o simulador (`tools/simulador.js`), olhando processador e atraso.
4. Itens 3 e 2: fazem diferença quando houver centenas a milhares de pessoas online. São refatorações maiores do `server.js` e do `store.js`.

## Arquivos

- Números: `artifacts/memoria-ram-2026-11-11/servidor/`
  - `cenario-a-vazio.json`, `cenario-b-b1.json`, `cenario-b-b2.json`
  - `cenario-c-c-b2-limpo.json`, `cenario-c-c-b2-semi4.json`, `cenario-c-c-b2.json` (este com fotos do heap no meio: o pico de RSS dele é das fotos)
  - `cenario-c-e-padrao.json`, `cenario-c-e-semi16.json`, `cenario-c-e-semi4.json`, `cenario-d-envios.json`
  - `colecoes-b2.json`, `mudae-store-b2.json`, `catalogo-mudae.jsonl`, `catalogo-fotos-estimativa.json`, `mensagens-formato.jsonl`, `workers.json`
  - `heap-diff-por-conexao.txt`: o que cada conexão acrescenta no heap, por tipo
  - `heap-*.txt`: resumos das fotos do heap (tipos e árvore de dominadores). As fotos inteiras (160–320 MB) não foram guardadas.
- Scripts: `artifacts/memoria-ram-2026-11-11/laboratorio/servidor/` (`medir-preload.js`, `rodar.js`, `gerar-banco.js`, `cenario-a.js` a `cenario-d.js`, `clientes.js`, `analisar-heap.js`, `diff-tipos.js`, `medir-*.js`, `estimar-fotos.js`)
