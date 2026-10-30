# Auditoria visual do Resenhex (30/10/2026)

Auditoria do app inteiro, tela por tela, feita no `main` (commit `5681fd5`, site 2.2.0) antes de qualquer mudança. O plano que sai daqui está em [`docs/planos/PLANO-POLIMENTO-VISUAL-2026-10-30.md`](../planos/PLANO-POLIMENTO-VISUAL-2026-10-30.md); a implementação, no ramo `visual-polish`. O antes × depois fica no fim deste relatório.

Evidências em [`auditoria-visual-2026-10-30/`](auditoria-visual-2026-10-30/): capturas (`antes/`, `depois/`), medições em JSON (`medicoes/`), o inventário completo (`inventario.md`) e os scripts usados (`ferramentas/`).

## Resultado em uma olhada

Detalhes, tabelas e capturas lado a lado em [Antes × depois](#antes--depois).

- **Chamada:** o palco parado desenha 6,2 quadros/s em vez de 60,6 e pinta 1,6 vezes por segundo em vez de 49,9 (CPU 4×); sem lentidão, GPU 43,3 → 4,3 ms/s e thread principal 218 → 25 ms/s. Sem foco e com a aba escondida, o mesmo (antes, 58–59 quadros/s).
- **Parado continua em zero** (0 quadros, 0 pinturas), e as respostas a clique ficaram iguais às do `main` (A/B com 16 a 24 cliques por ação).
- **Acessibilidade:** 27 falhas de contraste e 6 de alvo de toque → 0 nas 15 telas medidas; um anel de foco só.
- **Vida:** abertura com o logo, chegada na call, quem fala acende, o voo, o pouso, o cutucão, amigo que acende, digitando, conectou e "Conectado de novo"; ~25 ícones com gesto e traço ótico nos pequenos.

## Resumo (antes)

- **O app parado já é leve:** num canal de texto, 0 quadros e 0 pinturas por segundo, 13 ms/s de CPU no processo da página. O problema não é o repouso.
- **A chamada é que pesa.** Com o palco aberto, a página repinta ~48 vezes por segundo e desenha ~36–60 quadros/s mesmo sem ninguém interagindo; são ~180 ms/s de CPU a mais no processo da página e ~37 ms/s a mais na GPU do que a mesma chamada com o chat na frente. Os culpados são animações infinitas de `box-shadow` (quem fala, o ponto do relógio da call) e o `backdrop-filter` da barra de controles por cima dos blocos.
- **Nada para em segundo plano.** Com a janela sem foco (o jeito como o app de Windows minimizado aparece para o site) ou escondida, o custo é o mesmo da chamada na frente: 59 quadros/s, 47 pinturas/s.
- **Respostas a clique acima de 100 ms** (com a CPU 4× mais lenta): abrir o seletor de emoji (~570 ms), as configurações (~580 ms) e trocar para um canal com 220 mensagens (~1,4 s).
- **Acessibilidade:** quatro falhas de contraste AA (horário das mensagens, membros offline, botão "Adicionar amigo", resposta citada sobre menção), dois botões de 22×22 px na barra da chamada e a roleta do Mudae ignorando o "Reduzir animações" do app.
- **Visual:** o app é bem cuidado (configurações, cartão de perfil, diálogos e seletor de emoji têm acabamento). O que falta é vida nos momentos certos (mandar mensagem, reagir, alguém entrar na call, amigo ficar online), estados vazios e de carregamento com personalidade e coerência de ícones e tokens.

## Como foi feito

- **App local:** `npm install` e `npm start` em `discord-clone/` (Node 22.22), dados em pasta temporária. Três contas (Ana, dona; Bruno, ausente; Caio, não perturbe), o servidor "Resenha dos Amigos" com os canais padrão mais `#memes` e um Salão do Mudae, 221 mensagens em `#geral` (respostas, menções, `@everyone`, citação, código, spoiler, reações, imagem, arquivo e prévia de link do YouTube), uma conversa privada Ana ↔ Bruno, um pedido de amizade pendente e mais dois servidores na faixa. Script: `ferramentas/seed.js`.
- **Capturas:** Playwright com o Chromium 153 já instalado (headless), 1440×900 (mouse) e 390×844 (toque, `deviceScaleFactor` 2, reduzido a 1× no WebP), fuso de São Paulo. Chamadas com 3 pessoas em contextos separados usando o microfone e a câmera falsos do Chromium (o microfone falso apita, então "quem fala" acende sozinho); a transmissão usa a captura de tela falsa. 121 capturas em `antes/`. Script: `ferramentas/shots.js`.
- **Desempenho:** Chrome DevTools Protocol com a CPU 4× mais lenta (`Emulation.setCPUThrottlingRate`). Por cenário, 3 rodadas (mediana): trace (`PipelineReporter` = quadros, `Paint`, `TimerFire`), `Performance.getMetrics` (tempo de thread principal, estilo, layout), `long-animation-frame`, `longtask` e Event Timing (tempo do clique até a pintura). O navegador medido só tem a página da Ana; Bruno e Caio ficam em outro navegador. Script: `ferramentas/perf.js`.
  - A lentidão artificial do CDP gasta CPU por conta própria (~880 ms/s no processo da página até com o app parado), então **CPU dos processos** foi medida numa rodada à parte **sem** a lentidão (`desempenho-antes-cpu1x.json`). Quadros, pinturas, tarefas longas e respostas vêm da rodada com 4×.
  - "Janela minimizada" no app de Windows: o Electron documenta que, com `backgroundThrottling: false` (o que o `desktop/main.js` usa), a página continua `visible` minimizada e os quadros continuam sendo desenhados. O site só percebe a perda de foco. Por isso o cenário "chamada sem foco" (foco emulado desligado + evento `blur`) é o que representa o app minimizado; "chamada escondida" (`visibilityState = hidden`) representa a aba escondida no navegador.
- **Acessibilidade:** axe-core 4.10 (regras `color-contrast` e `target-size`, WCAG 2.2 AA) em 9 telas nos dois tamanhos; 45 Tabs nas telas de chat e configurações conferindo se o elemento focado tem contorno ou sombra. Script: `ferramentas/a11y.js`.
- **Inventário:** um leitor de CSS (sem dependências) passou pelos 34 arquivos `.css` de `public/`. Saída completa em [`inventario.md`](auditoria-visual-2026-10-30/inventario.md).

Limites: headless desenha com GPU em software (SwiftShader), então os números absolutos são maiores que numa máquina com placa de vídeo; o que vale é a comparação antes × depois na mesma máquina. Não houve Electron nem Android reais rodando; a barra de título do app de Windows e a página de "sem conexão" foram abertas como arquivos, e o overlay de jogos pelo modo `?demo`.

## Capturas (antes)

Todas em [`auditoria-visual-2026-10-30/antes/`](auditoria-visual-2026-10-30/antes/). `-desk` = 1440×900, `-cel` = 390×844.

| Área | Telas |
|---|---|
| Entrada | `landing`, `landing-recursos`, `login`, `login-erro`, `cadastro`, `carregando` |
| Servidores e canais | `chat-geral`, `gaveta-canais`, `menu-servidor`, `menu-grupo`, `menu-canal`, `criar-canal`, `adicionar-servidor`, `dica-faixa` |
| Conversa | `chat-hover`, `chat-topo`, `chat-vazio`, `responder`, `autocomplete`, `composer-texto`, `folha-mensagem`, `emoji`, `lightbox`, `confirmar`, `aviso-erro`, `aviso-info` |
| Membros e perfis | `membros`, `menu-membro`, `perfil-cartao`, `perfil-cartao-proprio`, `menu-status` |
| Amigos e DMs | `amigos`, `amigos-pendentes`, `amigos-vazio`, `dm` |
| Chamadas | `chamada-voz`, `chamada-camera`, `chat-em-chamada`, `menu-transmitir`, `transmissao`, `transmissao-assistindo`, `transmissao-foco`, `transmissao-zoom`, `chamada-privada-chamando`, `chamada-privada-recebendo`, `chamada-privada` |
| DJ, sons, clipes, Mudae | `dj`, `soundboard`, `clipes`, `salao` |
| Janelas | `config-perfil`, `config-conta`, `config-voz`, `config-aparencia`, `config-acessibilidade`, `config-notificacoes`, `config-servidor` (+ `-1`, `-2`, `-3`), `novidades`, `propor-melhorias` |
| Conexão | `desconectado`, `reconectado` |
| Windows e jogos | `barra-titulo`, `barra-titulo-atualizar`, `app-sem-conexao`, `overlay-jogo` |
| Site | `baixar` |

Não capturadas: o seletor de GIF (sem `KLIPY_KEY` local o botão não aparece), a câmera ligada (o Bruno abriu a prévia da câmera em vez de ligá-la direto) e o painel do DJ tocando (exige YouTube); os estilos dessas telas foram lidos no CSS.

## Inventário (resumo)

Detalhes, com arquivo e linha de cada item, em [`inventario.md`](auditoria-visual-2026-10-30/inventario.md).

| Item | Hoje |
|---|---|
| Tokens de cor | três camadas para o tema padrão (`style.css` com as cores do Discord → `experience.css` → `polish.css`, carvão + roxo `#8e2fd8`), mais tokens próprios na tela de entrar e na página de baixar |
| Cores fora dos tokens | 222 cores literais diferentes, 695 usos; restos do Discord escritos à mão: `#80848e` (offline), `#4e5058` (curva da resposta), `#1e1f22` (base dos blocos), `#313338` (botão branco da chamada), `#5865f2` |
| Tamanhos de fonte | 49 valores, com frações (11,5 · 12,5 · 13,5 · 14,5 · 15,5 px) e textos de 8–9,5 px |
| Raios | 47 valores |
| Sombras | 178 valores de `box-shadow` |
| Ícones | 86 no `icons.js` (base Lucide, traço 2 px em 24×24), desenhados de 14 a 22 px; 1 SVG solto (anel do tempo do Mudae); emojis como ícone nos efeitos sonoros, efeitos de voz, fontes do Mudae e abas do seletor de emoji |
| Ícones animados | 12 (microfone, fone, claquete, engrenagem, desligar, câmera, compartilhar, ruído, notas, membros, anexar, emoji) |
| Animações | 119 declarações, 37 infinitas; 15 keyframes animam algo além de transform/opacity (`box-shadow` em 8, `filter`, uma propriedade personalizada, `background`, `stroke-dashoffset`) |
| Transições | 237 declarações; 164 transicionam algo além de transform/opacity (`background` 112×, `box-shadow` 41×, `color` 60×, `border-color` 29×, `border-radius`, `filter`, `height`) |
| Desfoque | 24 `backdrop-filter`: 7 em fundos de tela cheia, 6 por cima de vídeo ou do palco, 2 sobre miniaturas e 9 em selos pequenos do cartão de perfil e da prévia do perfil; mais 7 `filter: blur()` em imagens (prévia da transmissão, arte do DJ, retrato do Mudae) |
| "Reduzir animações" | regra global (`animation/transition: none !important`) cobre todo o CSS; a roleta do Mudae (Web Animations API) só confere a preferência do sistema |

## Linha de base de desempenho

**Com a CPU 4× mais lenta** (mediana de 3 rodadas; `desempenho-antes-cpu4x.json`):

| Métrica | Parado no canal | Chamada (palco) | Chamada (no chat) | Chamada sem foco | Chamada escondida | Rolagem (221 msgs) | Menus e janelas |
|---|---|---|---|---|---|---|---|
| Quadros/s | 0 | 60,6 | 10,5 | 58,9 | 57,8 | 58,8 | 56,3 |
| Pinturas/s | 0 | 49,9 | 1,6 | 46,9 | 46,2 | 315,2 | 9,6 |
| Recálculos de estilo/s | 0 | 59 | 1 | 57 | 57 | 14 | 15 |
| Thread principal (ms/s) | 22,8 | 593,9 | 164,4 | 686,4 | 675,7 | 455,7 | 589,2 |
| Timers/s | 43,6 | 27,6 | 36,4 | 26,3 | 26,1 | 31,2 | 23,7 |
| Tarefas > 50 ms | 0 | 1 | 9 | 3 | 2 | 32 | 47 |
| Maior tarefa (ms) | 0 | 50 | 109 | 61 | 64 | 94 | 1773 |
| Quadros longos (LoAF) | 0 | 0 | 7 | 3 | 2 | 5 | 67 |
| Maior resposta a clique (ms) | — | — | — | — | — | — | 1896 |
| Respostas > 100 ms | — | — | — | — | — | — | 49 |
| Quadros atrasados (rAF) | — | — | — | — | — | 22,2 % | 12 % |

**Resposta por ação** (maior resposta, 2 rodadas; `respostas-por-acao-antes.json`):

| Ação | Resposta (ms, CPU 4×) |
|---|---|
| Menu do membro (botão direito) | 136 |
| Seletor de emoji | 552–592 |
| Menu do servidor | 96–128 |
| Cartão de perfil | 136–168 |
| Configurações | 512–648 |
| Trocar para `#memes` (2 mensagens) | 328–336 |
| Voltar para `#geral` (221 mensagens) | 1368–1504 |
| Trocar de servidor | 64–176 |

**CPU dos processos, sem lentidão** (mediana de 2 rodadas; `desempenho-antes-cpu1x.json`):

| Cenário | Página (ms/s) | GPU (ms/s) | Navegador (ms/s) | Áudio/rede (ms/s) | Thread principal (ms/s) | Quadros/s | Pinturas/s |
|---|---|---|---|---|---|---|---|
| Parado no canal | 12,8 | 2,0 | 3,0 | 6,9 | 6,9 | 0 | 0 |
| Chamada (palco) | 603 | 43,3 | 58,7 | 353,6 | 218,2 | 35,8 | 47,2 |
| Chamada (no chat) | 406,9 | 6,5 | 27,7 | 228,7 | 33,1 | 5,9 | 1,6 |
| Chamada sem foco | 593,7 | 43,1 | 58,0 | 356,9 | 212,3 | 37,1 | 47,0 |

A diferença entre "palco" e "no chat" (~196 ms/s na página, ~37 ms/s na GPU, ~31 ms/s no navegador, ~185 ms/s de thread principal) é o custo visual do palco. O resto da chamada (áudio, supressão de ruído por IA, WebRTC) não é visual e não muda com este trabalho.

## Achados

Severidade: **Alta** (custa desempenho na call ou quebra acessibilidade AA), **Média** (inconsistência ou estado faltando que se nota), **Baixa** (acabamento).

| # | Área | Achado | Sev. | Evidência |
|---|---|---|---|---|
| 1 | Desempenho | Animações infinitas de `box-shadow` repintam a cada quadro durante a chamada inteira: o anel de quem fala (`speak-glow`, em cada avatar que fala) e o ponto do relógio da call (`call-clock-pulse`, no cabeçalho do palco). Resultado: ~59 recálculos de estilo e ~48 pinturas por segundo com o palco aberto. | Alta | `chamada-voz-desk`, tabela acima, `motion.css:132`, `style.css:284` |
| 2 | Desempenho | `backdrop-filter` por cima de vídeo: barra de controles da chamada (`blur(12px)`), selos dos blocos, HUD do zoom, selo da prévia da câmera e barra do DJ. Cada quadro do vídeo obriga a refazer o desfoque da área. | Alta | `transmissao-assistindo-desk`, `transmissao-zoom-desk`, `style.css:507`, `call-stage.css:112`, `stream-zoom.css:10` |
| 3 | Desempenho | `backdrop-filter` em fundos de tela cheia: configurações (`blur(8px)` atrás de um véu 88 % opaco, onde o desfoque quase não aparece), Novidades, confirmações, criar canal, diálogos de servidor, imagem ampliada e Propor Melhorias. Com uma chamada com vídeo atrás, o desfoque da tela inteira é refeito a cada quadro. | Alta | `config-perfil-desk`, `novidades-desk`, `criar-canal-desk` |
| 4 | Desempenho | Nada para em segundo plano. Sem foco ou escondida, a chamada desenha 58–59 quadros/s e 46–47 pinturas/s, igual à chamada na frente. No app de Windows o site nunca recebe "escondido" (`backgroundThrottling: false`). | Alta | cenários "sem foco" e "escondida" |
| 5 | Desempenho | Animações infinitas sem atividade real: `float` no ícone de amigos vazio, brilho do card lendário do Mudae (`salon-sheen`, propriedade personalizada = repintura), ponto "prévia ao vivo" do perfil, e as que rodam sem parar enquanto o mouse está em cima (`eq`, `dj-spin`, `mudae-beat`, setas de baixar). Na página inicial, o jogo de exemplo e a "fala" dos avatares também não param. | Média | `amigos-vazio-desk`, inventário |
| 6 | Desempenho | 164 transições de propriedades que repintam (`background`, `color`, `box-shadow`, `border-color`, `border-radius`, `filter`) e uma de `height` (medidor da gravação de áudio). Cada hover e cada troca de estado repinta por 100–200 ms. | Média | `inventario.md` (Transições) |
| 7 | Resposta | Clique → pintura acima de 100 ms (CPU 4×): seletor de emoji ~570 ms, configurações ~580 ms, troca para canal com 221 mensagens ~1,4 s, cartão de perfil ~150 ms, menu do membro ~136 ms. | Alta | tabela "Resposta por ação" |
| 8 | Contraste | Horário das mensagens (`.msg-time`, 11,5 px com opacidade .85): 4,1:1 no fundo do chat e 3,6:1 numa mensagem que menciona você. | Alta | `chat-geral-desk` |
| 9 | Contraste | Membros offline com opacidade .5: nome em 3,1:1. | Alta | `membros-desk` |
| 10 | Contraste | Botão "Adicionar amigo": branco sobre `#3fbf85`, 2,3:1. | Alta | `amigos-desk` |
| 11 | Contraste | Trecho da mensagem respondida sobre o fundo de menção: 4,4:1. | Baixa | `chat-hover-desk` |
| 12 | Alvos | Setinhas de dispositivo do microfone e da câmera na barra da chamada: 22×22 px (mínimo AA: 24×24); no celular elas cobrem parte dos botões vizinhos. | Média | `chamada-voz-desk`, `chamada-voz-cel` |
| 13 | Foco | O foco é visível em todo lugar testado, mas com duas cores: o anel claro (`--brand-text`, ~8:1) e o roxo escuro (`--brand`, ~2,7:1 sobre a lateral) nos canais, grupos e na barra da chamada. | Baixa | `a11y` (Tab) |
| 14 | Movimento | A roleta do Mudae (Web Animations API) ignora o "Reduzir animações" do app; só respeita o do sistema. | Média | `mudae-salao.js:13` |
| 15 | Estados | Carregando = tela preta com uma linha roxa no topo enquanto o app conecta (2,5 s em rede lenta). Parece travado. | Alta | `carregando-desk` |
| 16 | Estados | Estados vazios sem vida: canal novo (um `#` num círculo cinza), lista de DMs vazia (só texto), painel do DJ vazio. | Média | `chat-vazio-desk`, `amigos-vazio-desk`, `dj-desk` |
| 17 | Estados | Queda de conexão: faixa amarela sem ícone, que só some quando volta; não há confirmação de "conectado de novo". | Baixa | `desconectado-desk`, `reconectado-desk` |
| 18 | Vida | Os momentos sociais não têm resposta própria: a sua mensagem entra igual à dos outros, a reação não "cai", quem entra na call aparece seco, o amigo que fica online não acende, e "digitando…" é só texto. | Média | `chat-geral-desk`, `chamada-voz-desk` |
| 19 | Ícones | O mesmo traço de 2 unidades desenhado de 14 a 22 px dá traços visíveis de 1,17 a 1,83 px: ícones pequenos (selos do bloco, cadeado, bandeiras da lista de voz) ficam mais finos e borrados que os do cabeçalho. | Média | `chamada-voz-desk` (lista de voz), `membros-desk` |
| 20 | Ícones | Só 12 dos 86 ícones têm gesto; os mais usados no dia a dia (responder, reagir, editar, apagar, GIF, mensagem de áudio, ligar e vídeo na DM, aceitar/recusar amigo, fechar, buscar) não reagem, e trocas como play/pausa, olho/olho riscado e fixar/desafixar são secas. | Baixa | `chat-hover-desk` |
| 21 | Consistência | Tokens espalhados em três camadas e cores do Discord escritas à mão que não acompanham os temas (Meia-noite e Alto contraste herdam o cinza `#80848e` do offline, a base `#1e1f22` dos blocos etc.). | Média | `inventario.md` |
| 22 | Consistência | 49 tamanhos de fonte, 47 raios e 178 sombras; textos de 8–9,5 px ainda lidos ("ESC", "PRÉVIA", marca das configurações). | Baixa | `config-perfil-desk` |
| 23 | Consistência | O botão "Reiniciar para atualizar" da barra de título do app de Windows usa `#8277fa`, o roxo antigo; o app usa `#8e2fd8`. | Baixa | `barra-titulo-atualizar-desk` |
| 24 | Consistência | As mesmas peças definidas em mais de um arquivo (`.confirm-card` em `admin.css` e `controls.css`; `.menu-item` em `style.css` e `profile.css`): a última vence, e mudar uma não muda a outra. | Baixa | inventário |
| 25 | Não visual | Com o app parado, ~44 timers por segundo acordam a página (medidor do microfone a cada 50 ms e verificação de quem fala a cada 100 ms, mesmo fora de chamada). Custa pouco CPU (7 ms/s), mas impede o processador de descansar. Fora do escopo visual; registrado. | Baixa | trace "parado" |
| 26 | Contraste | (Achado na Fase 4, fora das telas medidas, que usam o tema padrão.) Nos temas Meia-noite e Alto contraste, os botões principais têm texto branco sobre a cor da marca do tema: 2,6:1 (`#829bf9`) e 2,5:1 (`#a39afa`). | Alta | cálculo de contraste (WCAG 2.x) |
| 27 | Carregamento | (Achado na Fase 4; não visual.) Com rede lenta simulada (1,5 s de latência, 200 KB/s), a página leva ~25 s para aparecer: as 32 folhas de estilo no `<head>` bloqueiam o script de abertura e o resto da página, nas duas versões. | Média | `ferramentas/probe-bootcel.js`, `carregando-conectando-*` |

### O que já está bom (e fica)

- A paleta carvão + roxo, a hierarquia do chat e a densidade estão no ponto; o app parado não repinta nada.
- `motion.css` já tem tokens de duração/curva, saídas animadas com `allow-discrete` e regra global de "Reduzir animações".
- Configurações, cartão de perfil, diálogos de servidor e seletor de emoji têm acabamento cuidadoso (gradiente da marca no herói, brilho suave, botões com sombra da cor).
- Os gestos dos ícones de voz (microfone que balança, claquete que bate, fone que pula) são a personalidade certa — o polimento estende essa linguagem.
- Foco visível em 100 % dos 99 elementos percorridos com Tab.

## Antes × depois

Ramo `visual-polish`: 23 commits no app sobre o `main` `5681fd5`, em 6 ondas, mais os commits de documentação. Mesma máquina, mesmos dados (o banco foi restaurado da cópia tirada logo depois de popular o app), mesmos scripts e mesmo Chromium 153. Capturas "depois" em [`depois/`](auditoria-visual-2026-10-30/depois/); medições em `medicoes/*-depois*.json`.

### Desempenho

**Com a CPU 4× mais lenta** (mediana de 3 rodadas; `medicoes/desempenho-antes-cpu4x.json` → `medicoes/desempenho-depois-cpu4x.json`):

| Métrica | Parado no canal | Chamada (palco) | Chamada (no chat) | Chamada sem foco | Chamada escondida | Rolagem (221 msgs) | Menus e janelas |
|---|---|---|---|---|---|---|---|
| Quadros/s | 0 → 0 | 60,6 → 6,2 | 10,5 → 10,6 | 58,9 → 6,4 | 57,8 → 6,4 | 58,8 → 60,4 | 56,3 → 56,2 |
| Pinturas/s | 0 → 0 | 49,9 → 1,6 | 1,6 → 1,6 | 46,9 → 1,7 | 46,2 → 1,7 | 315,2 → 310,7 | 9,6 → 8,2 |
| Thread principal (ms/s) | 22,8 → 25,6 | 593,9 → 116,2 | 164,4 → 148,5 | 686,4 → 118,5 | 675,7 → 115,7 | 455,7 → 419,5 | 589,2 → 568 |
| Estilo (ms/s) | 0 → 0 | 56,3 → 14,1 | 26,1 → 23,9 | 62,9 → 14,8 | 62,8 → 17,3 | 44,6 → 40,3 | 87,3 → 89,6 |
| Timers/s | 43,6 → 43,8 | 27,6 → 37,8 | 36,4 → 37 | 26,3 → 39,4 | 26,1 → 39,1 | 31,2 → 31,4 | 23,7 → 24,4 |
| Tarefas > 50 ms | 0 → 0 | 1 → 1 | 9 → 8 | 3 → 0 | 2 → 1 | 32 → 26 | 47 → 47 |
| Maior tarefa (ms) | 0 → 0 | 50 → 54 | 109 → 72 | 61 → 0 | 64 → 50 | 94 → 85 | 1773 → 1593 |
| Quadros longos (LoAF) | 0 → 0 | 0 → 0 | 7 → 5 | 3 → 0 | 2 → 0 | 5 → 1 | 67 → 44 |
| % quadros atrasados (rAF) | — | — | — | — | — | 22,2 → 19,5 | 12 → 10,6 |
| FPS médio (rAF) | — | — | — | — | — | 38,6 → 41,1 | 28,8 → 34,3 |
| Maior resposta a clique (ms) | — | — | — | — | — | — | 1896 → 1696 |
| Respostas > 100 ms | — | — | — | — | — | — | 49 → 51 |

**CPU dos processos, sem lentidão** (mediana de 2 rodadas; `desempenho-antes-cpu1x.json` → `desempenho-depois-cpu1x.json`):

| Cenário | Página (ms/s) | GPU (ms/s) | Navegador (ms/s) | Outros processos¹ (ms/s) | Thread principal (ms/s) | Quadros/s | Pinturas/s |
|---|---|---|---|---|---|---|---|
| Parado no canal | 12,8 → 11,8 | 2 → 1 | 3 → 2 | 6,9 → 5,9 | 6,9 → 7,2 | 0 → 0 | 0 → 0 |
| Chamada (palco) | 603 → 348,2 | 43,3 → 4,3 | 58,7 → 19,8 | 353,6 → 191,7 | 218,2 → 24,8 | 35,8 → 3,1 | 47,2 → 1,7 |
| Chamada (no chat) | 406,9 → 367,2 | 6,5 → 6,7 | 27,7 → 22,5 | 228,7 → 214,4 | 33,1 → 30,3 | 5,9 → 7,7 | 1,6 → 1,7 |
| Chamada sem foco | 593,7 → 345,3 | 43,1 → 2,6 | 58 → 20,5 | 356,9 → 194 | 212,3 → 23,4 | 37,1 → 3,3 | 47 → 1,7 |

¹ Processos utilitários do Chromium (rede, áudio, captura de mídia). Variam bastante entre medições: no cenário "no chat", em que o visual quase não mudou, foram de 214 a 257 ms/s ao longo do dia (antes, Onda 1 e depois). Não atribuo ao polimento a queda deles no palco.

**Resposta por ação, A/B intercalado** (CPU 4×; as duas versões servidas alternadamente na mesma máquina, com os mesmos dados; maior evento de cada clique pela Event Timing API; `ferramentas/probe-acao.js` e `ferramentas/ab-acoes.sh`):

| Ação | `main` (mediana, ms) | `visual-polish` (mediana, ms) | Cliques acima de 100 ms | Amostras |
|---|---|---|---|---|
| Menu do membro (botão direito) | 64 | 60 | 1 → 1 | 24 + 24 |
| Menu do servidor | 84 | 80 | 1 → 2 | 16 + 16 |
| Cartão de perfil | 72 | 76 | 2 → 4 | 16 + 16 |
| Configurações | 392 | 344 | 16 → 16 | 16 + 16 |
| Abrir o seletor de emoji | 456 | 452 | 16 → 16 | 16 + 16 |
| Trocar para `#memes` (2 mensagens) | 268 | 268 | 16 → 16 | 16 + 16 |
| Voltar para `#geral` (221 mensagens) | 1384 | 1376 | 16 → 16 | 16 + 16 |
| Trocar de servidor (ida) | 104 | 88 | 8 → 1 | 16 + 16 |
| Trocar de servidor (volta) | 48 | 48 | 0 → 0 | 16 + 16 |

Saídas: `medicoes/respostas-16-cliques-main-x-visual-polish.txt`, `respostas-ab-menus.jsonl`, `respostas-menu-do-membro-24-cliques.txt` e `respostas-ab-por-acao.jsonl` (uma terceira rodada com todas as ações, que coincidiu em parte com outros testes e por isso fica só como conferência: mesmas conclusões, |z| < 1,7).

A medida por ação do `perf.js` (o maior de 2 cliques por rodada, 3 rodadas) chegou a sugerir piora no seletor de emoji e em `#memes`; repetida com 16 a 24 cliques por ação, alternando as versões, a diferença some (teste de Mann-Whitney com |z| < 2 em todas as ações). O trace do menu do membro mostra menos pintura e rasterização no `visual-polish` (300–351 ms × 530–572 ms somados em 12 aberturas) e um pouco mais de composição (340–373 × 218–228 ms). Também conferi à parte se as molas `linear()` passadas por `var()` pesam no estilo de milhares de botões: não há custo mensurável (`medicoes/custo-var-linear.txt`).

**Leitura:**

- **A chamada ficou leve.** Com o palco aberto e ninguém mexendo, a página desenha 6,2 quadros/s em vez de 60,6 e pinta 1,6 vezes por segundo em vez de 49,9 (CPU 4×). Sem lentidão, a GPU cai de 43,3 para 4,3 ms/s, a thread principal de 218 para 25 ms/s e o processo da página de 603 para 348 ms/s. O custo visual do palco (palco − chat na mesma medição) era ~196 ms/s de página; agora o palco custa o mesmo que o chat (348 × 367 ms/s).
- **Janela sem foco e aba escondida param.** Antes elas custavam o mesmo que a chamada na frente (58–59 quadros/s); agora 6,4 quadros/s e 1,7 pinturas/s, igual ao palco em repouso, e a GPU fica em 2,6 ms/s sem foco.
- **Parado continua zero:** 0 quadros e 0 pinturas por segundo no canal, antes e depois.
- **Rolagem e menus:** iguais dentro da variação. A rolagem pinta o conteúdo que entra na tela (~311 pinturas/s nas duas versões); caíram um pouco as tarefas longas (32 → 26), os quadros longos (5 → 1) e os quadros atrasados (22,2 → 19,5 %).
- **Os timers sobem na chamada (27,6 → 37,8/s) porque a página respira.** O app agenda ~44 timers por segundo (o mesmo número do app parado); com a thread principal ocupada pela repintura, eles atrasavam e se juntavam. Não é trabalho novo.
- **Metas do orçamento (CPU 4×):** nenhum quadro longo (LoAF) nos cenários de chamada (0 → 0 no palco, 3 → 0 sem foco, 2 → 0 escondida); a tarefa de 50–54 ms que sobra por rodada no palco existe igual no `main` e não segura quadro. As respostas a clique acima de 100 ms continuam (abrir o seletor de emoji, as configurações, trocar de canal): o A/B acima mostra que são iguais no `main`, ou seja, vêm do JavaScript que monta a tela no clique, não do visual. O "60 fps" vale para o que o polimento anima (só `transform`/`opacity`, no compositor); a rolagem com a CPU 4× e a GPU em software fica abaixo disso nas duas versões (38,6 → 41,1 fps medidos por `requestAnimationFrame`).

### Acessibilidade

| Verificação (axe-core 4.10, WCAG 2.2 AA, 15 telas) | Antes | Depois |
|---|---|---|
| Contraste (`color-contrast`) | 27 nós em 8 telas: hora das mensagens (4,1 e 3,6:1), nomes offline (3,1:1), resposta citada sobre menção (4,4:1), "Adicionar amigo" (2,3:1) | 0 |
| Tamanho de alvo (`target-size`) | 6 nós em 2 telas: setinhas de dispositivo (22×22) e, no celular, microfone e câmera cobertos por elas | 0 |
| Foco visível (45 Tabs em 2 telas + entrar) | 99 de 99 com indicador, em três cores (anel claro, roxo escuro de ~2,7:1 e branco nas amostras de cor) | 99 de 99, em duas: o anel claro (~8:1) em tudo e o branco só nas amostras de cor, que são coloridas |
| "Reduzir animações" | regra global no CSS; a roleta do Mudae só olhava a preferência do sistema | regra global vale para tudo o que foi criado; a roleta do Mudae também olha a opção do app |

Saídas completas: `medicoes/acessibilidade-antes.json` e `medicoes/acessibilidade-depois.json`.

### Capturas lado a lado

Todas as 120 capturas estão em `antes/` e `depois/` com o mesmo nome. Uma seleção:

| Tela | Antes | Depois |
|---|---|---|
| Abrindo o app com sessão, rede lenta (o app ainda conecta)<br>`carregando-conectando-desk` | ![antes](auditoria-visual-2026-10-30/antes/carregando-conectando-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/carregando-conectando-desk.webp) |
| Abrindo o app no celular, rede lenta<br>`carregando-conectando-cel` | ![antes](auditoria-visual-2026-10-30/antes/carregando-conectando-cel.webp) | ![depois](auditoria-visual-2026-10-30/depois/carregando-conectando-cel.webp) |
| Chat: hora das mensagens, membros offline legíveis<br>`chat-geral-desk` | ![antes](auditoria-visual-2026-10-30/antes/chat-geral-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/chat-geral-desk.webp) |
| Mensagem com o mouse em cima (barra de ações com elevação)<br>`chat-hover-desk` | ![antes](auditoria-visual-2026-10-30/antes/chat-hover-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/chat-hover-desk.webp) |
| Canal novo<br>`chat-vazio-desk` | ![antes](auditoria-visual-2026-10-30/antes/chat-vazio-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/chat-vazio-desk.webp) |
| Lista de membros<br>`membros-desk` | ![antes](auditoria-visual-2026-10-30/antes/membros-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/membros-desk.webp) |
| Amigos (botão Adicionar amigo em verde forte)<br>`amigos-desk` | ![antes](auditoria-visual-2026-10-30/antes/amigos-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/amigos-desk.webp) |
| Chamada (palco)<br>`chamada-voz-desk` | ![antes](auditoria-visual-2026-10-30/antes/chamada-voz-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/chamada-voz-desk.webp) |
| Chamada no celular (setinhas de 24 px)<br>`chamada-voz-cel` | ![antes](auditoria-visual-2026-10-30/antes/chamada-voz-cel.webp) | ![depois](auditoria-visual-2026-10-30/depois/chamada-voz-cel.webp) |
| Chat com a call ativa (painel de voz)<br>`chat-em-chamada-desk` | ![antes](auditoria-visual-2026-10-30/antes/chat-em-chamada-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/chat-em-chamada-desk.webp) |
| Menu do membro<br>`menu-membro-desk` | ![antes](auditoria-visual-2026-10-30/antes/menu-membro-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/menu-membro-desk.webp) |
| Seletor de emoji<br>`emoji-desk` | ![antes](auditoria-visual-2026-10-30/antes/emoji-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/emoji-desk.webp) |
| Aviso de erro<br>`aviso-erro-desk` | ![antes](auditoria-visual-2026-10-30/antes/aviso-erro-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/aviso-erro-desk.webp) |
| Conexão perdida<br>`desconectado-desk` | ![antes](auditoria-visual-2026-10-30/antes/desconectado-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/desconectado-desk.webp) |
| Conexão de volta<br>`reconectado-desk` | ![antes](auditoria-visual-2026-10-30/antes/reconectado-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/reconectado-desk.webp) |
| Configurações (marca e ESC em 10 px)<br>`config-perfil-desk` | ![antes](auditoria-visual-2026-10-30/antes/config-perfil-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/config-perfil-desk.webp) |
| Aparência (prévia dos temas)<br>`config-aparencia-desk` | ![antes](auditoria-visual-2026-10-30/antes/config-aparencia-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/config-aparencia-desk.webp) |
| Chat no celular<br>`chat-geral-cel` | ![antes](auditoria-visual-2026-10-30/antes/chat-geral-cel.webp) | ![depois](auditoria-visual-2026-10-30/depois/chat-geral-cel.webp) |
| Conversa privada no celular<br>`dm-cel` | ![antes](auditoria-visual-2026-10-30/antes/dm-cel.webp) | ![depois](auditoria-visual-2026-10-30/depois/dm-cel.webp) |
| Salão do Mudae<br>`salao-desk` | ![antes](auditoria-visual-2026-10-30/antes/salao-desk.webp) | ![depois](auditoria-visual-2026-10-30/depois/salao-desk.webp) |

A cena "carregando" do tour fotografa aos 2,5 s; na rede lenta simulada (1,5 s de latência, 200 KB/s) a página ainda não terminou de baixar as 32 folhas de estilo nesse instante, nas duas versões, e a foto não mostra o estado de "conectando". Por isso a comparação acima usa `carregando-conectando-*`: as duas versões fotografadas do mesmo jeito, logo depois de a página carregar (≈25 s nessa rede) e com o app ainda conectando (`ferramentas/shot-carregando.js`). Os `carregando-*` originais continuam nas duas pastas.

### Momentos (novos)

Fotos tiradas no meio da animação, com o app de verdade e outra pessoa do outro lado (`ferramentas/moments.js`). O tempo é do evento chegar até a classe da animação aparecer na tela.

| Momento | Foto | Do evento até a animação começar (ms) |
|---|---|---|
| Acendeu: o Caio fica online | ![momento-acendeu](auditoria-visual-2026-10-30/depois/momento-acendeu.webp) | 17 |
| Digitando: os três pontinhos | ![momento-digitando](auditoria-visual-2026-10-30/depois/momento-digitando.webp) | 4 |
| Mensagem dos outros chegando | ![momento-mensagem-chega](auditoria-visual-2026-10-30/depois/momento-mensagem-chega.webp) | 124 |
| O pouso: a reação do Bruno cai no chip | ![momento-pouso](auditoria-visual-2026-10-30/depois/momento-pouso.webp) | 5 |
| O cutucão: mensagem que menciona você | ![momento-cutucao](auditoria-visual-2026-10-30/depois/momento-cutucao.webp) | 5 |
| O voo: a sua mensagem sobe da caixa | ![momento-voo](auditoria-visual-2026-10-30/depois/momento-voo.webp) | 33 |
| Conectou: você entra na call | ![momento-conectou](auditoria-visual-2026-10-30/depois/momento-conectou.webp) | 246 |
| A chegada: o Bruno entra na call | ![momento-chegada](auditoria-visual-2026-10-30/depois/momento-chegada.webp) | 94 |
| A voz: quem fala acende | ![momento-chamada-falando](auditoria-visual-2026-10-30/depois/momento-chamada-falando.webp) | — |
| Reconectando: o servidor caiu | ![momento-reconectando](auditoria-visual-2026-10-30/depois/momento-reconectando.webp) | 115 |
| Conectado de novo | ![momento-reconectado](auditoria-visual-2026-10-30/depois/momento-reconectado.webp) | 886¹ |

¹ Inclui o servidor subir de novo e o app reconectar. Os tempos são do script (consulta a cada 25 ms), do evento chegar à página até a classe da animação aparecer.

### O que mudou, onda por onda

1. **Leveza** (6 commits): `html.bg-window` pausa as animações contínuas com a janela escondida ou sem foco; sem `backdrop-filter` em fundos de tela cheia e por cima do vídeo (véu sólido + brilho de 1 px); as animações infinitas caíram de 37 para 20, e as 20 que ficaram são de atividade real (quem fala, carregando, digitando, gravando, DJ tocando, chamada tocando, roleta do Mudae, esperando a tecla do atalho), todas pausadas com `bg-window`; nenhum `box-shadow` animado sobrou (anel de quem fala, ponto do relógio da call, chamada tocando, página inicial, Mudae); 161 transições de `background`/`color`/`border`/`box-shadow` viraram troca instantânea; medidor da mensagem de áudio com `transform`; roleta do Mudae respeitando o "Reduzir animações" do app.
2. **Movimento** (1): tokens com molas `linear()` (e curva de reserva onde não há suporte), clique que afunda rápido e solta com mola, menus, janelas e avisos com as curvas novas.
3. **Ícones** (2): traço ótico de pelo menos ~1,5 px nos ícones abaixo de 18 px; ~25 gestos novos no hover (responder, reagir, editar, lixeira com tampa, fechar, ligar, buscar, GIF, mensagem de áudio…); sinal que sobe ao conectar.
4. **Momentos** (3): a chegada na call, o amigo que acende, o voo, o pouso, o cutucão, os pontinhos de "digitando", o reconectando com ícone.
5. **Estados** (4): abertura com o logo enquanto conecta (e aviso de internet depois de 10 s), "Conectado de novo" em verde no lugar do aviso duplicado, anel de foco único, começo do canal com a marca.
6. **Cor** (7): cinza dos textos e hora em AA, membros offline legíveis, verde forte onde há branco em cima, setinhas de 24 px, restos do Discord em tokens do tema, elevação em três níveis com brilho de 1 px, textos de 9 px que ainda são lidos em 10 px.

### Testes

Rodados no fim, nas duas versões, na mesma máquina (`medicoes/testes-finais.txt`):

| | `main` (`5681fd5`) | `visual-polish` |
|---|---|---|
| `npm run check` | — | sintaxe OK em 85 arquivos |
| `npm test` (479 testes) | 476 passam, 2 falham, 1 pulado | 476 passam, 2 falham, 1 pulado |
| Falha 1 | `desktop/test/lib.test.js` | `desktop/test/lib.test.js` |
| Falha 2 | inundação do servidor ("a connection that floods…") | um dos dois "teste de voz" |

A falha 1 é do ambiente: o `desktop/` não tem as dependências instaladas aqui (`MODULE_NOT_FOUND` em `desktop/lib/ptt-keys.js`). A falha 2 é instável e muda de rodada para rodada. Para separar instabilidade de regressão, os dois testes de voz rodaram 5 vezes em cada versão, alternando: falharam 5 de 10 execuções no `main` e 5 de 10 no `visual-polish`. O teste de inundação, rodado sozinho, passa nas duas versões; só cai com a máquina carregada.

### O que deu errado no caminho

- **A abertura escondia a página inteira.** A primeira versão punha a classe `boot-slow` no `<html>` depois de 10 s para mostrar "Está demorando…"; a mesma classe já era a do texto (`.boot-slow { display: none }`), então a página toda sumia. Pego na conferência visual antes do commit; a classe do `<html>` virou `boot-late` e só entra enquanto o app ainda está abrindo.
- **Economizar no JS sem foco quebrou um teste.** Na Onda 1, com `bg-window` o JS deixava de redesenhar o relógio da call; o jsdom dos testes nunca tem foco, e o teste do tempo da call falhou. Voltou atrás: o JS só economiza com a janela realmente escondida (`micInBackground()`), e o CSS continua pausando as animações sem foco.
- **Divisão em commits.** Separar o diff com zero linhas de contexto pôs pedaços no lugar errado num commit intermediário da Onda 4; refeito com 3 linhas de contexto e cada commit conferido com `node --check`.

### O que ficou de fora e por quê

- **Respostas lentas ao clique** (seletor de emoji, configurações, voltar para `#geral`). Com a CPU 4×, abrir o seletor de emoji leva ~450 ms, as configurações ~350–400 ms e voltar para `#geral` ~1,4 s, iguais no `main` (A/B acima). O tempo é do JavaScript que monta essas telas no clique (centenas de botões de emoji, as 221 mensagens), não do visual; resolver pede mudar como o `app.js` desenha (montar sob demanda, reaproveitar a lista), fora do escopo visual. Fica registrado com as medidas.
- **Contraste dos botões no Meia-noite e no Alto contraste.** Branco sobre a cor da marca desses temas dá 2,6:1 (`#829bf9`) e 2,5:1 (`#a39afa`). Corrigir pede texto escuro nos botões ou uma cor de marca mais escura nesses temas: muda o visual deles, então fica para o dono. A medição de acessibilidade cobriu o tema padrão.
- **Trocas animadas novas de ícone** (câmera, olho, fixar, play do DJ). Esses botões são recriados a cada renderização, e a animação dispararia a cada mensagem nova, não só na troca. Pede mudar como o `app.js` desenha esses botões.
- **Peças duplicadas e a escala de 49 tamanhos de fonte, 47 raios e 178 sombras** (achados 22 e 24). Consolidar mexe em dezenas de regras espalhadas em arquivos em que a última vence, com risco alto de regressão para pouco ganho visível. Os tokens novos (elevação, linhas, verdes) são a base para isso.
- **Barra de título do app de Windows** (`#8277fa`, achado 23) e o sinal exato de minimizar por IPC. O que está em `desktop/` só chega aos usuários com o app publicado, e publicar está fora do escopo.
- **Timers com o app parado** (achado 25). Não é visual; registrado com a medida.
- **As 10 ideias ousadas** do plano (anel de voz pelo volume real, tema "Brasa", View Transitions na troca de canal, mascote, sons, vibração no Android…): mudam a essência ou o orçamento.
- **Telas não capturadas**: seletor de GIF (sem `KLIPY_KEY` local), câmera ligada e DJ tocando (exige YouTube), as mesmas que ficaram de fora no "antes".
