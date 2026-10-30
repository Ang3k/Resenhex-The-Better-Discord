# Auditoria visual do Resenhex (30/10/2026)

Auditoria do app inteiro, tela por tela, feita no `main` (commit `5681fd5`, site 2.2.0) antes de qualquer mudança. O plano que sai daqui está em [`docs/planos/PLANO-POLIMENTO-VISUAL-2026-10-30.md`](../planos/PLANO-POLIMENTO-VISUAL-2026-10-30.md); a implementação, no ramo `visual-polish`. O antes × depois fica no fim deste relatório.

Evidências em [`auditoria-visual-2026-10-30/`](auditoria-visual-2026-10-30/): capturas (`antes/`, `depois/`), medições em JSON (`medicoes/`), o inventário completo (`inventario.md`) e os scripts usados (`ferramentas/`).

## Resumo

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

(Preenchido na Fase 4.)
