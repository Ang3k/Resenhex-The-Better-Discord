# Consumo de memória RAM do Resenhex

Investigação de 11 e 12/11/2026, feita para a atualização de desempenho em RAM. Tudo o que está aqui foi medido, a não ser quando a linha diz **estimativa**.

## Resumo

- **O que mais pesa é transmitir a tela.** Com o app de Windows transmitindo, a soma dos processos chega a **1,1–1,2 GB**. Desse total, **420 a 600 MB são o rolo do Clipar**, que grava a tela em segundo plano para dar para clipar depois. Um protótipo que entrega o quadro da tela direto ao codificador levou a mesma transmissão de **1.205 para 609–673 MB**, e o clipe saiu certo (1280×720).
- **O DJ deixa 130 a 170 MB presos depois que a música para.** O player do YouTube nunca é fechado. Fechar o player no fim da fila devolveu **85 a 100 MB** (protótipo).
- **Fotos do chat em tamanho original:** num canal com 109 fotos, mostrar uma miniatura de até 800×600 devolveu **135 a 161 MB** (protótipo).
- **O Salão do Mudae deixa memória presa depois de sair dele.** Limpar o estoque de fotos do Salão **não devolveu nada** no teste: o que fica são caches do próprio Chromium. O que solta parte disso é pedir ao Chromium para limpar a memória (−30 a −50 MB).
- **As mensagens não saem da memória.** Cada mensagem que chega no canal aberto fica guardada até recarregar a página: 1.500 mensagens = +177 MB. O servidor guarda só 300 por canal; o app guarda todas.
- **A tabela "o que gasta × quanto dá para recuperar" está logo abaixo**, com cada número dizendo se foi medido com protótipo, medido sem protótipo ou só calculado.
- **O JavaScript não é o problema.** O heap do JS da página fica entre 3 e 6 MB. A memória está na placa de vídeo (imagens e vídeo), no desenho da página (DOM) e nos processos do Chromium.
- **No servidor, 84% do heap é o catálogo do Mudae** (87 de 104 MB). Os dados do site, no tamanho de hoje, ocupam ~1,5 MB.
- **Os cortes sem perda já estão programados** na branch `claude/memoria-ram` (sem publicar). O que cada um deu de verdade está na seção logo abaixo.

## O que foi feito (12/11) e quanto deu de verdade

Pedido do dono: cortar memória **sem perder nenhuma função nem qualidade**. A comparação usou duas cópias do app de Windows fazendo os mesmos passos ao mesmo tempo, uma com o site da 2.6.0 e a outra com o código novo. Foram duas rodadas, trocando as cópias de papel. Os números não contam o processo principal, porque ele carrega o histórico de cada cópia (uma delas tinha feito várias transmissões antes).

| Corte | Situação | Antes → depois (MB) | Ganho | O que foi conferido |
|---|---|---|---|---|
| **Clipar:** o quadro da tela vai direto ao codificador, sem passar por um canvas 2D | Transmitindo a tela | 951–955 → 579–593 (placa de vídeo 715–722 → 353–358) | **−362 a −372 MB** | O clipe sai igual com tela de qualquer formato (com faixas pretas quando o formato não é 16:9, como antes). O processador gasta o mesmo, e quem assiste segue a ~58 fps |
| **DJ:** o player do YouTube fecha depois de 1 minuto sem música | 75 s depois de `/parar` | 526–553 → 402–421 | **−124 a −132 MB** | A próxima música cria o player de novo e toca |
| **Áudio fora da chamada:** a supressão de ruído e os contextos de áudio parados fecham 30 s depois de sair | 45 s depois de sair da chamada | (só a página) −17 a −19 MB além do DJ | **−17 a −19 MB** | Voltar para a chamada: microfone, círculo verde e Clipar funcionando; sons da interface tocam. Nada fecha com som tocando |
| DJ + áudio juntos | Depois de usar o DJ e sair da chamada | 609–629 → 456–490 | **−139 a −153 MB** | — |
| **Fotos do chat:** miniatura com lado menor de 900 px, feita no aparelho de quem envia | Canal com 30 fotos (18 com miniatura) | 369–493 → 369–440 | **0 a −53 MB**, varia entre rodadas | Foto no chat do mesmo tamanho, girada certa e com a transparência; o visualizador abre a original; fotos antigas continuam como eram |
| **Seletor de emojis:** a grade sai da página ao fechar | Depois de abrir e fechar | — | **−5 a −6 MB** | Reabrir mostra os 1.897 emojis, as abas e a busca |
| **Sons:** o contexto próprio fecha quando a chamada assume a saída de som | Transmitindo com o som do computador | — | Um contexto de áudio parado a menos (não medido) | Testes de unidade |

**No servidor** (servidor inteiro, vazio, 10 s depois de ligar; detalhes em `artifacts/memoria-ram-2026-11-11/servidor/implementacao-servidor.md`):

| Corte | Antes | Depois | O que foi conferido |
|---|---|---|---|
| Catálogo do Mudae num banco SQLite ao lado do `data.db` (montado sozinho na primeira subida e quando o JSON muda); na memória ficam só números | RSS 175 MB, heap 102,7 MB, pico ao ligar 412 MB | **RSS 88 MB, heap 13 MB, pico 106 MB** (na subida que monta o banco, uma vez: pico 343 MB) | 273.888 comparações com o código antigo, nenhuma diferença. `$im` 7–8,5 → 1,15 ms; harém e álbum no mesmo tempo; uma carta ~1 → ~10 µs; `$obra` de obra grande num servidor com 5.300 cartas com dono 0,3 → 2,5 ms |
| Worker de imagens fecha depois de 60 s parado | — | −12,7 MB parado | A primeira foto depois da pausa sobe o worker de novo |
| `livekit-server-sdk` só com o SFU ligado | — | −3,5 MB de heap | Testes do SFU |
| `loginFailures` e `timeoutTimers` sem crescer para sempre | — | o ganho é não crescer | Quem erra a senha sem parar continua bloqueado como antes; a contagem só some depois de 24 h sem erro |
| `--max-semi-space-size=16` no serviço (entra no próximo deploy, pelo `instalar-vps.sh`) | — | −129 MB de RSS com 1.000 pessoas ativas (medido no Windows) | Falta conferir no servidor ARM |

O `npm test` agora monta antes um molde do banco (`server/mudae-catalogo.db`, fora do Git), para os testes não montarem um banco cada um. O deploy só leva arquivos do Git, então o molde não vai para o servidor.

**Por que as fotos deram menos que o protótipo (−135 a −161 MB):** o protótipo usava miniaturas de até 800×600 para todas as fotos. Na versão final, a miniatura tem 900 px no lado menor, para a foto continuar nítida em tela de alta densidade (o chat mostra até 400×300, que vira 1200×900 numa tela 3×). Além disso, fotos que já são quase do tamanho da miniatura, fotos com perfil de cor diferente de sRGB e animações ficam só com a original. E o Chromium já abre JPEG grande em tamanho reduzido por conta própria. O ganho de memória ficou menor, em troca de nenhuma perda de qualidade. A miniatura também deixa o canal carregar mais rápido: nas fotos do teste, ela tem 43 KB em média, contra ~500 KB da original.

**O que ficou de fora para não perder nada:**
- O teto de 300 mensagens na memória: o servidor só guarda 300 por canal, então as mensagens mais antigas da sessão sumiriam do histórico.
- A rede e o som do Chromium dentro do processo principal: se um deles travar, cai o app inteiro.
- O anel de quadros só com a placa cheia: pode perder fps em jogo pesado.
- A barra de título dentro da página e a limpeza de memória do Chromium (−28 MB e −30 a −50 MB): dependem de um app de Windows novo (1.4.8). Ficam para quando o dono decidir publicar um app novo.

**Achados novos, para investigar depois (acontecem igual na 2.6.0):**
- O processo principal do app de Windows cresce **40 a 45 MB a cada transmissão iniciada** e não volta (163 → 207 → 248 → 285 MB em quatro transmissões seguidas).
- O processo da placa de vídeo sobe **80 a 95 MB depois de sair da chamada** (184 → 278 MB), nas duas versões.

## O que gasta × quanto dá para recuperar

Os números são de memória privada no Windows (a do Gerenciador de Tarefas), em MB. Na coluna "Como sabemos":
- **Protótipo**: o corte foi programado de verdade numa cópia do app e comparado lado a lado com outra cópia sem ele, fazendo os mesmos passos ao mesmo tempo.
- **Medido**: o tamanho do que gasta foi medido, mas o corte não foi programado.
- **Conta**: calculado pelo código ou por uma foto da memória, sem medir no Windows.

### No app (Windows, site e celular)

| # | O que gasta (X) | Correção | Podemos recuperar (Y) | Como sabemos | Muda algo para quem usa? |
|---|---|---|---|---|---|
| 1 | Rolo do Clipar em quem transmite: cada quadro passa por um canvas 2D, e isso enche dois caches da placa de vídeo | Entregar o quadro da tela direto ao codificador, que já muda o tamanho | **−530 a −600 MB** enquanto transmite (1.205 → 609–673) | Protótipo; o clipe saiu em 1280×720, certo | Não. Falta conferir fps e qualidade no laboratório de transmissão |
| 2 | Fotos do chat abertas no tamanho original (até 12 MP) | Miniatura de até 800×600 feita no envio; a original só no visualizador | **−135 a −161 MB** num canal com 109 fotos; **−80 MB** que ficavam presos depois de sair do canal | Protótipo, com miniaturas WebP de verdade | Não; a foto no chat fica igual |
| 3 | Player do YouTube do DJ, que nunca fecha | Fechar o player 20–30 s depois da fila acabar | **−85 a −100 MB** depois de usar o DJ (hoje ficam +130 MB presos; com o corte, +40 a +50) | Protótipo | ~1 s a mais na primeira música depois de uma pausa |
| 4 | Caches do Chromium que ele não solta sozinho com memória sobrando | Pedir ao Chromium para limpar a memória depois de uma chamada, de uma transmissão e com o app minimizado | **−32 a −52 MB** (quase tudo da placa de vídeo), em 4 de 6 rodadas; com o DJ tocando, nada | Medido (pedido pelo DevTools) | Não; os caches enchem de novo se precisar. O app de Windows precisa pedir pelo `webContents.debugger`, que é uma via experimental |
| 5 | Barra de título num processo só dela | Desenhar a barra dentro da página (app 1.4.8) | **−28 MB sempre** (459 → 431) | Medido, fechando o processo da barra | Não, se a barra ficar igual |
| 6 | Supressão de ruído e contextos de áudio que ficam depois da chamada | Fechar tudo 3 s depois de sair da chamada | **−27 MB** depois da chamada (página 115 → 88) | Protótipo | Não; voltam ao entrar de novo |
| 7 | Seletor de emojis, montado para sempre depois de abrir uma vez | Desmontar ao fechar | **até −20 MB** (é o que fica depois de abrir e fechar: 439 → 459) | Medido o que fica; quanto volta não foi medido | Não; reabrir leva poucos ms |
| 8 | Captura da tela no processo principal (anel de quadros) | Ligar o anel só com a placa cheia | **−15 MB** enquanto transmite | Medido, ligando e desligando o anel | Pode perder fps em jogo pesado |
| 9 | Serviço de som do Chromium num processo separado | Rodar dentro do processo principal | **−11 a −13 MB** depois da primeira chamada | Medido | Se o som travar, cai o app inteiro |
| 10 | Serviço de rede do Chromium num processo separado | Rodar dentro do processo principal | **−11 MB sempre** | Medido | Se a rede travar, cai o app inteiro |
| 11 | Mensagens sem teto na memória | Guardar só 300 por canal | Heap do JS **21 → 5 MB** e mensagens na página **1.801 → 300**; no total do Windows, só **−16 MB** logo depois (−30 depois da limpeza do item 4) | Protótipo, com uma enxurrada de 1.500 mensagens | Rolar para cima busca o histórico, como depois de recarregar |
| 12 | Sons do soundboard guardados já decodificados | Decodificar na hora de tocar | **−13 MB** (8 sons prontos) a **−49 MB** (32 sons do servidor) | Conta | Não |
| 13 | Efeitos de voz guardados depois de desligar | Soltar ao desligar o efeito | **até −9 MB** | Conta | Não |
| 14 | Código do Mudae carregado na abertura, mesmo sem abrir o Salão | Carregar só ao abrir um Salão | **~−2 MB** | Conta (foto da memória) | Não |
| 15 | Ícones em SVG dentro de cada mensagem | Ícones em CSS | **~−1,4 MB** a cada 300 mensagens | Conta (foto da memória) | Não |
| 16 | Fotos do Salão do Mudae guardadas depois de sair | Limpar o estoque ao sair e decodificar só 8 por vez | **Nada medido**: depois de sair, a página ficou igual com e sem o corte (129 × 130 MB) | Protótipo | — |

Sobre a linha 11: na primeira enxurrada, a página cresceu igual com e sem o teto (+104 × +118 MB), porque o Chromium não devolve ao Windows o pico que já usou. O teto serve para o app **parar de crescer** quando fica aberto por dias; esse ganho só aparece com uma segunda enxurrada, que ainda não foi medida.

### No servidor

| # | O que gasta (X) | Correção | Podemos recuperar (Y) | Como sabemos | Muda algo? |
|---|---|---|---|---|---|
| 1 | Catálogo do Mudae inteiro no heap (87 MB) | Catálogo compacto no SQLite, com só números na memória | **−86 MB de heap, −83 MB de RSS**, e o pico ao ligar cai **−302 MB** (386 → 84) | Protótipo; as 233.747 cartas e 1.010 buscas do `$im` saem iguais | O `$im` fica mais rápido; harém de 300 cartas 0,08 → 4,3 ms; álbum de 5.000 2 → 79 ms |
| 1b | O mesmo, versão leve | Tirar `key` e `score`, encurtar o endereço das fotos | **−31 MB de heap, −28 MB de RSS** | Protótipo | Não |
| 2 | Geração jovem grande do Node | `--max-semi-space-size=16` no serviço | **−129 MB de RSS** com 1.000 pessoas ativas | Medido no Windows; falta conferir no ARM | Não; o processador não subiu |
| 3 | ~190 funções criadas para cada conexão | Registrar os eventos do socket uma vez só | **−24 KB por conexão**: −0,7 MB com 30 online, −24 MB com 1.000, −120 MB com 5.000 | Medido | Não |
| 4 | Envios guardados inteiros na memória | Gravar direto no disco | **−45 MB de pico** por envio de 45 MB em andamento | Medido | Não |
| 5 | Worker de imagens que nunca fecha | Fechar depois de 60 s parado | **−12,7 MB** | Medido | A primeira foto depois da pausa leva ~30–50 ms a mais |
| 6 | Dois workers (checkpoint e imagens) | Um worker só | **−11 MB** | Medido | Não |
| 7 | Leitura do catálogo inteiro de uma vez ao ligar | Ler linha a linha (só se o item 1 não for feito) | **−65 MB** de pico ao ligar | Medido | Não |
| 8 | Biblioteca do LiveKit carregada com o SFU desligado | Carregar só com o SFU ligado | **−3,5 MB de heap** | Medido | Liga ~0,2 s mais rápido |
| 9 | `loginFailures` e `timeoutTimers` sem limpeza | Limpar | **0,7 MB** com 1.000 ativos; o ganho é não crescer num ataque de senha | Medido | Não |

### Somando, por situação

| Situação | Hoje | Com os cortes medidos | De onde vem |
|---|---|---|---|
| Transmitindo a tela | 1.205 | **~580–645** | app 1 + 5 |
| Num canal com muitas fotos | 454–518 | **~290–330** | app 2 + 5 |
| Depois de usar o DJ | 630–636 | **~510–520** | app 3 + 5 |
| Depois de uma chamada | 367–371 | **~315** | app 6 + 5 |
| Parado no chat | 289–310 | **~250–270** | app 5 + 10 |
| Assistindo uma transmissão | ~600 | **~520–570** | app 5 + 4 (o rolo de quem assiste não muda com o corte 1) |
| Servidor com 1.000 pessoas ativas | 450–600 RSS | **~190–340 RSS** (estimativa: soma de 1 + 2 + 3 + 5 + 6) | servidor |

Cada linha soma cortes medidos separadamente; o número junto só se sabe medindo depois de programar.

## Como foi medido

- **App de Windows 1.4.7, o mesmo instalado no PC do pessoal.** Cada cópia de teste tinha perfil próprio e foi aberta na sessão do Windows do dono, para usar a placa de vídeo de verdade (RTX 4060 Ti; aceleração ligada em tudo). As cópias apontavam para um servidor local com dados de teste: 20 contas (15 com foto), 9 canais, ~1.150 mensagens (1 em 6 com foto, algumas com link) e 80 rolls do Mudae.
- **Duas réguas, em cada cenário:**
  - A memória privada de cada processo vista pelo Windows, que é o número do Gerenciador de Tarefas. As tabelas usam esta.
  - O raio-X do próprio Chromium (o "memory dump" do `chrome://tracing`, categoria memory-infra). Ele diz o que é cada pedaço: cache de imagens da placa, DOM, heap do JS, mídia etc. Na página, também o heap do JS, os nós do DOM e as imagens carregadas.
- **Câmera e microfone falsos do Chromium** nas cópias de teste, para não abrir o microfone do dono. A tela transmitida era a de verdade, com a captura nativa do app (`captura.node`).
- **Experimentos A/B, primeira rodada (11/11):** o recurso foi desligado por fora (um script injetado pelo DevTools), sem mudar o código, com a cópia reaberta do zero antes de cada rodada.
- **Experimentos A/B, segunda rodada (12/11):** os cortes foram programados de verdade, cada um ligado por uma chave guardada no navegador da cópia de teste. Duas a três cópias, cada uma com uma conta diferente, faziam os mesmos passos ao mesmo tempo: uma com os cortes e outra sem. O código dos protótipos foi tirado da worktree e guardado em `artifacts/memoria-ram-2026-11-11/prototipos-memlab.patch`. Os números de cada rodada estão em [`memoria-ram-2026-11-11/medidas-ab-2026-11-12.json`](memoria-ram-2026-11-11/medidas-ab-2026-11-12.json).
- **Armadilha achada na segunda rodada:** uma janela coberta por outra para de desenhar no Windows, e aí as fotos e o Salão não carregam e a medida sai baixa. As cópias de teste passaram a abrir com `--disable-features=CalculateNativeWinOcclusion`. O Salão e as fotos, que tinham sido medidos com a janela coberta na rodada e1, foram refeitos com essa opção (rodada e5).
- **O app de verdade do dono:** um registro, que só lê, anotou a memória de cada processo a cada minuto por 80 minutos (11/11, 20:43–22:04).
- **Servidor:** medido localmente por um agente ajudante, com Node 24 e `--max-old-space-size=6144`, em três tamanhos de dados e com até 1.000 clientes conectados. Os números de heap valem para o ARM; os de RSS são do Windows.
- **Não medido:** o app de Android e o servidor de produção. O Android abre o mesmo site, então os achados do site valem para ele, mas os números não foram conferidos no celular.

As medidas brutas, os scripts e os relatórios dos dois agentes ajudantes estão em `artifacts/memoria-ram-2026-11-11/` (local). A pasta [`memoria-ram-2026-11-11/`](memoria-ram-2026-11-11/) tem a tabela resumida e os dois relatórios.

## O app em números

Memória privada somada de todos os processos do app de Windows (sem o processo do próprio medidor), em MB. "Página" é o processo do site; "barra" é o processo separado da barra de título.

| Cenário | Total | Placa de vídeo | Página | Barra | Principal | Câmera | Rede + som |
|---|---|---|---|---|---|---|---|
| Tela de entrada, sem conta | 233 | 81 | 45 | 29 | 64 | — | 15 |
| Parado no #geral (300 mensagens) | 265 | 80 | 76 | 30 | 64 | — | 15 |
| Mesmo canal, depois das fotos do chat carregarem | 333 | 140 | 87 | 26 | 65 | — | 15 |
| Chamada só de voz, 2 pessoas | 418 | 155 | 134 | 27 | 75 | — | 27 |
| + recebendo a câmera de alguém | 430 | 155 | 145 | 26 | 77 | — | 27 |
| + a minha câmera ligada | 532 | 156 | 179 | 26 | 74 | 69 | 27 |
| Assistindo uma transmissão | 641 | 334 | 180 | 28 | 71 | — | 28 |
| Assistindo, sem o rolo do Clipar | 576 | 279 | 169 | 29 | 71 | — | 28 |
| **Transmitindo a tela** | **1.120** | **699** | 199 | 29 | 166 | — | 28 |
| Transmitindo, sem o rolo do Clipar | 700 | 301 | 178 | 31 | 162 | — | 27 |
| Transmitindo, sem o rolo e sem o anel da captura | 685 | 298 | 183 | 29 | 147 | — | 28 |
| Antes do DJ (na chamada) | 478 | 180 | 168 | 29 | 74 | — | 28 |
| DJ tocando (+85 MB do processo do YouTube) | 650 | 241 | 188 + 85 | 29 | 78 | — | 30 |
| DJ parado há 1 minuto | 645 | 247 | 177 + 84 | 29 | 78 | — | 30 |
| + 1.500 mensagens chegaram no canal aberto | 828 | 245 | 354 + 91 | 29 | 79 | — | 30 |
| Parado no #geral (outra cópia, outra rodada) | 308 | 111 | 96 | 26 | 62 | — | 15 |
| Salão do Mudae, depois de 36 rolls | 451 | 204 | 133 | 27 | 63 | — | 25 |
| De volta ao #geral, saindo do Salão | 462 | 216 | 132 | 27 | 63 | — | 25 |

**O app de verdade do dono** (11/11, 20:43–22:04, numa chamada com a câmera ligada): de 1,12 a 1,25 GB no total. A placa de vídeo ficou entre 486 e 678 MB, a página entre 269 e 341 MB e o processo principal parado em 180 MB. O processo principal em 180 MB é a marca de quem está transmitindo a tela (165 MB na cópia de teste transmitindo; 64–79 MB em todos os outros cenários).

## Os maiores consumidores

### 1. Rolo do Clipar em quem transmite: 420 a 600 MB

- **Medido:** a mesma transmissão, com a cópia reaberta do zero nas duas rodadas, dá 1.120 MB com o rolo e 700 MB sem ele. A diferença está na placa de vídeo: 699 → 301 MB.
- **Por quê:** `public/clip-screen.js:91-125` desenha cada quadro da tela num `OffscreenCanvas` 2D (30 por segundo) e cria um `VideoFrame` desse canvas para o codificador H.264. O Chromium trata cada quadro desenhado no canvas como uma imagem nova e guarda as imagens em dois caches da placa de vídeo até cada um chegar ao teto. O raio-X mostra o cache de transferência em 254,6 MB e o cache de texturas do Skia em 296 MB, os dois cheios.
- **Em quem assiste, o custo é menor:** ~65 MB (641 × 576). O vídeo recebido já mora na placa, então ele não passa por esses caches.
- **Como cortar sem mudar o clipe:** entregar ao codificador os quadros da própria trilha, sem passar por um canvas 2D. O WebCodecs aceita `VideoFrame` direto da `MediaStreamTrackProcessor`, e a mudança de tamanho pode ser feita pelo próprio codificador. Outra opção é um canvas WebGL com uma textura só, reaproveitada. Precisa conferir que o clipe sai igual, inclusive as barras pretas quando a tela não é 16:9.
- **Protótipo (12/11):** com o quadro indo direto ao codificador, a transmissão ficou em **609 MB** (673 MB depois de 2 minutos), contra **1.205 MB** de hoje. Os dois caches da placa de vídeo ficaram em 0. O clipe lido do rolo saiu em 1280×720, com imagem. Em quem assiste, nada mudou (592 × 595 MB), porque o vídeo recebido já não passava pelos caches. Falta conferir a tela que não é 16:9 (o codificador muda o tamanho sem pôr barras pretas, então a imagem pode esticar) e o fps no laboratório de transmissão.

### 2. DJ: 130 a 170 MB presos depois que a música para

- **Medido:** 478 MB antes do DJ, 650 MB tocando e **645 MB um minuto depois de `/parar`**. O processo do YouTube (84 MB) continua aberto, e a placa de vídeo não devolve a memória do vídeo.
- **Por quê:** o player é criado uma vez (`public/music.js:96`) e, quando a música acaba, só recebe `stopVideo()` (`music.js:139-144`). O iframe do youtube.com nunca é destruído.
- **Como cortar:** chamar `player.destroy()` e tirar o iframe uns 30 s depois que a fila acaba; criar de novo na próxima música, como já é feito na primeira vez. A pessoa não vê diferença, a não ser ~1 s a mais para a primeira música depois de uma pausa longa.
- **Protótipo (12/11):** antes do DJ, 501 × 497 MB. Depois de `/parar`, a cópia de hoje ficou em **630–636 MB** e a do protótipo em **538–547 MB**: **−85 a −100 MB**. O processo do YouTube (72 MB) some, e a placa de vídeo solta ~20 MB. Ainda ficam +40 a +50 MB na placa de vídeo, que só a limpeza do Chromium solta.

### 3. Mensagens que nunca saem da memória: ~118 KB por mensagem

- **Medido:** 1.500 mensagens chegando no canal aberto levaram a página de 177 para 354 MB. O DOM foi de 13 mil para 49 mil nós, e o heap do JS de 4,5 para 22 MB. Ficaram 1.802 mensagens no DOM, e o servidor guarda só 300.
- **Por quê:** o app faz `push` de cada mensagem nova sem teto (`public/app.js:2612`), e todo canal aberto uma vez continua guardado (`app.js:1716-1726`). Só uma reconexão zera. `msgNodes` guarda uma segunda cópia de cada mensagem em texto (`app.js:1805`), e cada mensagem já nasce com a barra de ações do mouse (9 a 17 elementos a mais, `app.js:1925-1934`).
- **Onde dói:** num Salão do Mudae movimentado com o app aberto por dias. O Mudae é 65% das mensagens do site (auditoria de 30/10).
- **Como cortar:**
  - Nos canais fora da tela, guardar só as 300 últimas, como o servidor. Não muda nada que se veja.
  - No canal aberto, cortar o excesso quando a pessoa está no fim da lista. Quem rola para cima vê o histórico como depois de recarregar a página, que já é assim hoje.
  - Usar uma barra de ações só, que vai até a mensagem embaixo do mouse.

### 4. Captura da tela no processo principal: +75 a +90 MB

- **Medido:** o processo principal sobe de 72 para 162–166 MB ao transmitir a tela de verdade.
  - Sem o anel da captura (`RESENHEX_CAPTURA_ANEL=0`), fica em 147 MB.
  - Com a captura padrão do Chromium (`RESENHEX_CAPTURA_PADRAO=1`), também 147 MB.
  - Ou seja: o anel custa ~15 MB, e os outros ~75 MB são da captura do próprio Chromium (cópias dos quadros 1080p na memória do processo).
- **Como cortar:** pouco a fazer sem perder fps. O anel foi feito para dobrar os quadros com a placa cheia (relatório de 30/10). Dá para ligar o anel só quando a placa estiver cheia, se valer os 15 MB.

### 5. Fotos do chat em tamanho original: 70 a 160 MB num canal com fotos

- **Medido, com ressalva:** no mesmo canal de 300 mensagens, a placa de vídeo foi de 80 para 140 MB e a página de 76 para 87 MB. Na primeira rodada, 231 imagens tinham carregado (15 milhões de pixels); na segunda, as 301 (76 milhões de pixels). As fotos de teste tinham até 1080×1920.
- **Por quê:**
  - O chat mostra o arquivo original (`public/app.js:2016` e `:2022`) num espaço de no máximo 400×300 (`style.css:361`). Uma foto de celular de 12 MP ocupa 48 MB ao ser decodificada (conta).
  - As imagens não têm largura nem altura antes de carregar. Por isso todas ficam "perto da tela" e o `loading="lazy"` acaba carregando todas.
- **Como cortar:** o servidor gera uma miniatura de ~800 px no envio (já existe um worker de imagens, `server/images.js`), e o chat mostra a miniatura com largura e altura. O original abre só no visualizador. A foto no chat fica igual, e o visualizador continua com a original.
- **Protótipo (12/11):** um canal com 109 fotos, 10 delas de 12 MP. As miniaturas WebP de até 800×600 foram feitas de verdade e o chat passou a mostrá-las. Ao abrir o canal: 454 → 319 MB (**−135**). Depois de rolar por todas as fotos: 518 → 357 MB (**−161**). Depois de voltar ao #geral: 436 → 356 MB (**−80** que ficavam presos). As fotos baixadas caíram de 16 para 0,8 MB.

### 6. Salão do Mudae: ~150 MB que ficam depois de sair

- **Medido:** abrir o Salão e fazer 36 rolls levou o app de 308 para 451 MB. Ao voltar para o #geral, ficou em **462 MB**, e nada foi devolvido.
  - Na placa de vídeo, +105 MB. A maior parte é memória de imagens (`malloc` do processo da placa: 33 → 91 MB, e 87 MB depois de sair).
  - Na página, +36 MB. As fotos decodificadas guardadas (`discardable`) foram de 0 para 24 MB e continuaram em 24 MB fora do Salão.
  - O serviço de áudio do Chromium (10,5 MB) aparece com os sons dos rolls e continua aberto.
- **Por quê:**
  - Para a roleta girar sem engasgar, o Salão guarda até 24 fotos por fonte, de 5 fontes, já decodificadas (`public/mudae-salao.js:112-127`, `img.decode()` em `:99`).
  - Sair do Salão (`unmount`, `mudae-salao.js:209`) não limpa esse estoque.
  - A carta de cada roll mostra a foto no tamanho grande do site de origem (`server/mudae.js:151`), até 530×1280 nas fotos do Comic Vine. A roleta já usa o tamanho menor (`thumbOf`, `server/mudae.js:153`).
- **Ressalva:** o Chromium pode soltar parte desse cache sozinho se o Windows ficar sem memória. Com memória sobrando, ele fica preso e aparece no Gerenciador de Tarefas.
- **Protótipo (12/11): não deu ganho.** Limpar o estoque ao sair e guardar só 8 fotos por fonte, em vez de 24, deixou a página igual depois de sair do Salão (129 × 130 MB). O que fica preso são os caches do próprio Chromium (imagens decodificadas e memória da placa de vídeo), e não o estoque do Salão.
- **O que ajuda:** pedir ao Chromium para limpar a memória (linha 4 da tabela do começo), que solta 30 a 50 MB da placa de vídeo. Mostrar a carta na foto de tamanho médio pode diminuir o que entra nos caches, mas não foi testado.

### 7. Chamada de voz: +75 a +85 MB

- **Medido:** 333 → 418 MB ao entrar numa chamada de 2 pessoas, só com voz. A página sobe 48 MB, o principal 10 MB, e o serviço de áudio do Chromium (12 MB) aparece.
- **De onde vem (pelo código):**
  - O WebRTC (malloc +15 MB no raio-X).
  - A supressão de ruído por IA (GTCRN, o padrão "IA avançada"): 16,7 MB de WASM por microfone. Não dá para cortar sem mudar o som.
  - O rolo de áudio do Clipar: 2,9 MB por pessoa na chamada (`clip-buffer-worklet.js`).
  - Três `AudioContext` que nunca são suspensos depois da primeira chamada: `audioCtx`, `noise.ctx` e o dos sons. O código não tem nenhum `suspend()`.
- **Como cortar:** suspender e fechar os contextos de áudio ao sair da chamada, e tocar os sons da interface no contexto da chamada. Ganho pequeno durante a chamada, mas a memória volta depois dela.
- **Protótipo (12/11):** fechar a supressão de ruído e os contextos de áudio 3 s depois de sair da chamada levou a página de 115 para 88 MB: **−27 MB** depois da chamada. O serviço de áudio do Chromium (11 MB) continua aberto; só sai rodando o som dentro do processo principal (linha 9 da tabela do começo).

### 8. Barra de título num processo separado: ~28 MB fixos

- **Medido:** em todos os cenários, um processo de 26 a 31 MB só para a barra de título de 30 pixels (`desktop/main.js:96-112`, `titlebar.html`). Fechando esse processo numa cópia de teste, o total foi de 459 para 431 MB (**−28 MB**), e nenhum outro processo cresceu.
- **Como cortar:** desenhar a barra dentro da página do site. O site já sabe que está no app (`public/desktop.js`). Precisa de uma versão nova do app de Windows (1.4.8) e de cuidado com a área de arrastar a janela e com os botões nativos do Windows.

### 9. Câmera ligada: +100 MB

- **Medido:** 430 → 532 MB. O processo de captura de vídeo do Chromium tem 69 MB, e a página sobe 35 MB (o codificador VP8 720p de cada conexão).
- **Como cortar:** pouco. Em chamadas P2P maiores, cada conexão tem o próprio codificador (`media-session.js:121`, `:434`). Mandar uma resolução menor para quem vê a câmera pequena economiza memória e rede, mas é mudança de mídia: precisa do laboratório de transmissão.

### 10. Outros, menores (pelo código, sem medida separada)

- **Sons do soundboard decodificados:** 12,9 MB para os 8 sons prontos (conta); até 49 MB com os sons do servidor (`sounds.js:108-128`). Dá para guardar só os bytes e decodificar ao tocar.
- **Seletor de emojis:** fica montado depois da primeira abertura, com 1.870 botões. Medido em 12/11: abrir e fechar o seletor deixa **+20 MB** no app (439 → 459; a página +12 MB e o principal +5 MB).
- **Efeitos de voz:** guardam 9,1 MB de respostas de impulso que nunca são soltas (`voice-fx-chosen.mjs:62-81`).
- **Ícones em SVG em cada mensagem:** 1.129 SVGs e 2.220 caminhos no DOM com 300 mensagens (foto do heap).
- **Janela do overlay de jogos:** escondida, mas nunca destruída (`desktop/lib/overlay.js:34`).
- **Fotos de perfil, banners e fundos em GIF:** animados em tamanho cheio, até 1024 px na foto e 1500 px no banner (`server/avatar.js:87`, `:102-114`).

## O que não é problema

- **Heap do JavaScript:** 3 a 6 MB em uso normal. Só passa disso com milhares de mensagens (item 3). Minificar o código ajuda pouco na RAM.
- **Processo principal parado:** 61 a 64 MB, normal para o Electron. O ajuste antigo do pool de threads (`UV_THREADPOOL_SIZE=1`) continua valendo.
- **Vazamento de objetos do JS:** a foto do heap depois de um passeio pelo app tinha só 174 objetos de DOM soltos (30 KB).
- **`URL.createObjectURL`:** todos têm o `revoke` correspondente.

## Servidor

Medido pelo agente ajudante (relatório completo em [`memoria-ram-2026-11-11/servidor.md`](memoria-ram-2026-11-11/servidor.md)). B1 tem o tamanho de hoje (150 contas, 35 servidores, 1.774 mensagens). B2 é grande: 5.000 contas e 102 mil mensagens.

| Item | Vazio | B1 (como o ar) | B2 parado | B2 + 1.000 conectados |
|---|---|---|---|---|
| Catálogo do Mudae | 87,1 | 87,1 | 87,1 | 87,1 |
| Mensagens | 0 | ~0,7 | 41,8 | 41,8 |
| Servidores, Mudae deles, contas, sessões, índices | ~0 | ~0,9 | 20,3 | 21,9 |
| Conexões | 0 | ~1 | 0 | 33,7 |
| Código, bibliotecas e o resto | 15,5 | 15,5 | 15,5 | 15,5 |
| **Heap usado** | **102,6** | **104,2** | **165,1** | **198,8** |
| Workers (checkpoint + imagens), RSS | ~24 | ~24 | ~24 | ~24 |
| **RSS no Windows** | 179 (pico ao ligar: 417) | 184 | 251 | 450–600 |

O agente não achou vazamento: quando todos saem, o heap volta ao valor de antes. O que cresce sem limite:
- As mensagens: até 300 por canal e por conversa, com qualquer número de canais.
- `loginFailures` (`server.js:321`), que nunca é limpo.
- `timeoutTimers` (`server.js:1709`).

Maiores cortes no servidor:
- **Catálogo do Mudae compacto** (`server/mudae.js:107-149`): os textos no SQLite, e na memória só números e as chaves do `$im` num Buffer. **Protótipo medido (12/11): −86 MB de heap e −83 MB de RSS**, e o pico ao ligar do catálogo cai de 386 para 84 MB. Todas as 233.747 cartas, as listas de sorteio e 1.010 buscas do `$im` saem iguais às de hoje. Uma versão leve (tirar `key` e `score`, encurtar o endereço das fotos) corta 31 MB de heap. Detalhes em `artifacts/memoria-ram-2026-11-11/servidor/catalogo-prototipo.md` (local).
- **`--max-semi-space-size=16` no serviço:** −129 MB de RSS com 1.000 pessoas ativas, sem gastar mais processador (medido no Windows; precisa conferir no ARM).
- **Registrar os eventos do socket uma vez só**, em vez de ~190 funções por conexão: −24 KB por conexão (120 MB com 5.000 online).
- **Fechar o worker de imagens quando parado** (−12,7 MB) e juntar os dois workers (−11 MB).
- **Envios gravados direto no disco**, em vez de guardados inteiros na memória (`express.raw`): −45 MB de pico por envio de 45 MB.

## Plano proposto para a atualização

Em ordem de ganho. "Visível?" diz se quem usa nota alguma diferença.

| # | Corte | Onde | Ganho | Visível? |
|---|---|---|---|---|
| 1 | Rolo do Clipar sem canvas 2D | site | −530 a −600 MB transmitindo (protótipo) | Não; conferir telas que não são 16:9 e o fps |
| 2 | Miniatura das fotos do chat feita no servidor, com largura e altura | site + servidor | −135 a −161 MB num canal com fotos (protótipo) | Não; o visualizador abre a original |
| 3 | Fechar o player do DJ ~30 s depois da fila acabar | site | −85 a −100 MB depois de usar o DJ (protótipo) | ~1 s a mais na primeira música depois de uma pausa |
| 4 | Pedir ao Chromium para limpar a memória depois de chamada e transmissão, e com o app minimizado | app de Windows | −30 a −50 MB (medido) | Não |
| 5 | Barra de título dentro da página | app de Windows 1.4.8 | −28 MB sempre (medido) | Não, se a barra ficar igual |
| 6 | Fechar a supressão de ruído e os contextos de áudio depois da chamada; sons do soundboard decodificados na hora | site | −27 MB depois da chamada (protótipo) + até −13 a −49 MB do soundboard (conta) | Não |
| 7 | Limite de 300 mensagens por canal na memória e no DOM; uma barra de ações só | site | para de crescer com o app aberto por dias (o ganho no total ainda não foi medido) | Rolar para cima busca o histórico, como depois de recarregar |
| 8 | Catálogo do Mudae compacto | servidor | −86 MB de heap, −83 MB de RSS, pico ao ligar −302 MB (protótipo) | Não |
| 9 | `--max-semi-space-size=16`, eventos do socket registrados uma vez, worker de imagens que fecha, envios direto no disco | servidor | −129 MB de RSS com 1.000 ativos, −24 KB por conexão, −12,7 MB parado (medido no Windows) | Não |

Itens menores, para o fim: seletor de emojis desmontado ao fechar (até −20 MB), serviços de som e de rede dentro do processo principal (−11 MB cada, com risco), cache dos efeitos de voz solto ao desligar, código do Mudae carregado só no Salão, ícones das mensagens em CSS em vez de SVG, overlay destruído quando não usado, limpeza do `loginFailures` e do `timeoutTimers`.

Saiu do plano: limpar o estoque de fotos do Salão ao sair. O protótipo não devolveu nada (item 6 acima).

**O que esperar**: ver "Somando, por situação", na tabela do começo.

**Como conferir:** os mesmos cenários, com o laboratório de `artifacts/memoria-ram-2026-11-11/laboratorio/`, antes e depois de cada corte. O item 1 também precisa do laboratório de transmissão (`discord-clone/tools/stream-lab/`) para provar que o fps e a qualidade não mudaram.
