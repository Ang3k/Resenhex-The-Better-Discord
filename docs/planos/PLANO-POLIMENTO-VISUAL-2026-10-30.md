# Plano de polimento visual do Resenhex (30/10/2026)

Proposta da Fase 3, feita depois da auditoria ([`AUDITORIA-VISUAL-2026-10-30.md`](../relatorios/AUDITORIA-VISUAL-2026-10-30.md)) e da pesquisa (seção "Pesquisa", no fim). O trabalho é no ramo `visual-polish`, em ondas; cada onda é medida antes de seguir.

**Regra de ouro:** o Resenhex parado não se mexe. Toda luz e todo movimento vêm de uma pessoa fazendo alguma coisa.

## Direção criativa: "a sala acende quando a galera chega"

O Resenhex é uma sala escura de amigos: carvão, um roxo de neon e conversa. O polimento não troca a sala; ele muda **quando** e **como** ela acende.

- **Quieta em repouso.** Nada pisca, flutua ou gira sozinho. Hoje o app tem 37 animações infinitas e várias delas rodam com ninguém fazendo nada (o relógio da chamada pulsa a call inteira, o anel de quem fala repinta a cada quadro). Isso sai.
- **Viva quando alguém age.** Quem fala acende um anel; quem manda mensagem vê ela pousar; a reação cai no chip com um quique; quem entra na call chega com um "ping" de luz roxa; o amigo que ficou online acende a bolinha. Tudo isso é curto (um disparo, menos de meio segundo) e só usa `transform` e `opacity`.
- **Elástico curto.** O movimento tem a personalidade de uma cutucada de amigo: rápido, com um pouquinho de sobra (mola), nunca mole nem lento. Coisas que você toca (botões, ícones, chips) respondem com mola; coisas que aparecem (menus, janelas, mensagens) entram suaves e saem mais rápido do que entraram.
- **O degradê é luz, não papel de parede.** O `#6d5dfc → #c64cf0` da marca vira a luz dos momentos (o "ping" de quem chega, o brilho do momento de celebração, o anel do cartão do servidor), e não decoração parada.
- **Ícones com personalidade, sem mudar o que dizem.** O microfone continua balançando, a claquete batendo e o fone pulando; a mesma família ganha o resto dos controles do dia a dia (responder, reagir, editar, apagar, anexar, ligar, fechar, buscar…), cada um com um gesto que reforça a própria metáfora.

Referências (detalhes na pesquisa): a atualização visual do Discord de 2025 (fundo mais escuro e sinais de status mais claros, mas mudança de forma dos ícones mal recebida — por isso nenhuma forma muda aqui), o movimento do Windows 11 (83/167/250 ms; saída mais curta que a entrada), o Material 3 Expressive (molas "espaciais" para posição/escala e transições "de efeito" sem sobra para cor/opacidade) e as diretrizes de movimento da Apple (retorno curto, com propósito, e nada quando o sistema pede menos movimento).

## Orçamento aplicado

| Regra | Como fica |
|---|---|
| Animar só `transform` e `opacity` | Toda animação e transição nova usa só os dois. As transições existentes de `box-shadow`, `background`, `color`, `border-color`, `border-radius` e `filter` em elementos grandes viram troca instantânea de estado (como no Discord e no Windows) ou um pseudo-elemento que esmaece (`opacity`). Exceções documentadas: `stroke-dashoffset` do risco do microfone (pintura de um SVG de 20×20 px por 0,3 s) e `filter` em ícones pequenos. |
| App parado = zero repintura | Medido: 0 pinturas e 0 quadros por segundo com o app parado num canal (já era assim e continua). |
| Infinitas só para atividade real | Ficam só: quem fala (barrinhas), carregando (giros), digitando (pontinhos), chamada tocando, gravação de áudio, música do DJ tocando e a roleta do Mudae girando. Todas param com a janela sem foco ou escondida (`html.bg-window`, ver abaixo) e quando o elemento sai da tela (`display: none`/fora do palco). |
| `backdrop-filter` só em superfícies pequenas e temporárias | Sai dos fundos de tela cheia (configurações, Novidades, confirmações, criar canal, diálogos, imagem ampliada, Propor Melhorias) e de tudo que fica por cima de vídeo (barra de controles da chamada, selos do bloco, HUD do zoom, selo da prévia da câmera, barra do DJ). No lugar, superfícies sólidas translúcidas com borda fina e brilho de 1 px no topo, que dão a mesma "profundidade" sem desfoque. |
| Sem bibliotecas novas nem fontes novas | Nada novo. Molas com `linear()` (CSS puro); ícones continuam SVG inline do `icons.js`. A Archivo (já em `public/fonts/`, usada na página inicial) não entra no app: seriam 90 KB a mais no primeiro carregamento. |
| Reduzir animações desliga tudo | A regra global do `experience.css` continua valendo; a roleta do Mudae (feita em JavaScript) passa a respeitar também o "Reduzir animações" do app, não só o do sistema. |

### Janela em segundo plano (`html.bg-window`)

No app de Windows o site **não** sabe que foi minimizado: com `backgroundThrottling: false` a documentação do Electron confirma que `document.visibilityState` fica `visible` mesmo minimizado, e os quadros continuam sendo desenhados. O sinal que sobra (sem publicar app novo) é o foco da janela: minimizada ou com o jogo na frente, a janela do Resenhex não tem foco.

- `motion.js` liga `html.bg-window` quando `document.hidden`, quando a janela perde o foco (`blur` + `document.hasFocus()` — foco dentro de um iframe do próprio app não conta como perda) ou quando o app de Android diz que está em segundo plano (`AndroidApp.backgrounded`).
- Com `bg-window`, todas as animações infinitas que sobraram ficam com `animation-play-state: paused` (lista explícita no `motion.css`, para o navegador não recalcular estilo da página inteira).
- O que **informa** continua funcionando sem foco (quem está falando continua com o anel aceso numa segunda tela); só o que **balança** para.

## Tokens de movimento

O `motion.css` já tem tokens bons (`--motion-fast/base/slow/large/exit`, `--ease-enter/exit`). Os nomes ficam (outros arquivos usam); os valores mudam pouco e entram molas.

| Token | Valor | Uso |
|---|---|---|
| `--motion-fast` | 140 ms | hover, dicas, chips |
| `--motion-base` | 200 ms | menus, cartões, seletores |
| `--motion-slow` | 280 ms | janelas, folhas, gavetas, troca de tela |
| `--motion-large` | 380 ms | telas cheias (configurações, Novidades) |
| `--motion-exit` | 120 ms | qualquer saída (sempre mais curta que a entrada) |
| `--ease-enter` | `cubic-bezier(.22, 1, .36, 1)` | entradas (desacelera) |
| `--ease-exit` | `cubic-bezier(.4, 0, 1, 1)` | saídas (acelera, mais seca que `ease-in`) |
| `--spring-pop` | `linear()` de mola ζ=0,5 · 410 ms · sobra 16 % | chips, selos, ícones que "pulam" (reação, bolinha que acende, selo novo) |
| `--spring-snappy` | `linear()` ζ=0,62 · 330 ms · sobra 8 % | botões soltando depois do clique, controles da chamada |
| `--spring-soft` | `linear()` ζ=0,78 · 355 ms · sobra 2 % | menus, mensagens, blocos da chamada chegando |
| `--press` / `--press-icon` | .97 / .92 | quanto o botão afunda ao clicar (continuam) |

Plano B para WebView antigo: os tokens de mola são declarados primeiro como `cubic-bezier` (a mola atual, `cubic-bezier(.34, 1.56, .64, 1)`, e variações) e trocados por `linear()` dentro de `@supports (transition-timing-function: linear(0, 1))`. Sem suporte, a animação continua, só sem a curva exata.

## Ícones

**Decisão:** manter o Lucide (ISC, compatível com a AGPL-3.0) como base e refinar, em vez de trocar de conjunto. O traço de 24/2 px já combina com o resto do app; trocar a família (Tabler, Phosphor) mudaria o desenho de todos os botões e quebraria o "usuário que volta". O Tabler usa a mesma grade e fica como reserva para ícones que faltarem.

1. **Peso ótico.** Hoje o mesmo `stroke-width="2"` é desenhado de 14 a 22 px, então o traço visível varia de 1,17 a 1,83 px: os ícones pequenos (selos da chamada, cadeado, bandeiras da lista de voz) parecem mais finos e borrados que os do cabeçalho. O `Icon()` passa a calcular o traço para nunca ficar abaixo de 1,5 px na tela (`max(2, 1,5 × 24 / tamanho)`): 14 px → 2,57; 16 px → 2,25; 18 px ou mais → 2.
2. **Trocas de estado animadas.** Onde o ícone troca por outro (microfone/fone já fazem), a troca ganha o mesmo "pulo" (`ico-swap`): câmera ↔ câmera desligada, olho ↔ olho riscado, fixar ↔ desafixar, play ↔ pausa do DJ.
3. **Gestos no hover** (só com mouse, um disparo, `transform` no SVG inteiro sempre que possível):

| Ícone | Gesto | Por quê |
|---|---|---|
| `reply` | a seta recua e volta | "voltar" à mensagem |
| `smilePlus` | dá um pulo | reagir é festa |
| `pencil` | risca para o lado | escrever |
| `trash` | a tampa levanta (caminho separado `lid`) | jogar fora |
| `plus` / `plusCircle` | gira um quarto | adicionar (o de anexar já gira) |
| `x` (fechar) | gira um quarto | já existe no diálogo do servidor; vira padrão em todo "fechar" |
| `phone` (ligar) | treme como telefone tocando | já existe no "desconectar"; entra no ligar da DM |
| `camera` | flash (já existe na barra) | entra também no botão de vídeo da DM |
| `message` | balão quica | abrir o chat da sala |
| `gif` | balança | GIF |
| `search` | lupa inclina | procurar |
| `check` (aceitar) | pulo | confirmar |
| `download` / `upload` | seta desce / sobe | baixar / enviar |
| `link`, `copy` | desloca de leve | copiar convite |
| `eye` | pisca (escala vertical) | ver |
| `pin` | espeta | fixar |
| `refresh` | meia volta | atualizar |
| `sparkles` | as estrelinhas cintilam (uma vez) | Novidades |
| `disc` | uma volta no hover (hoje gira sem parar enquanto o mouse está em cima) | DJ |
| `waves` | equalizador por dois ciclos (hoje infinito no hover) | supressão de ruído |
| `dice` | rola | Mudae |
| `heart` | uma batida (hoje infinita no hover) | casar no Mudae |
| `crown` | inclina | dono |
| `gamepad` | sacode | jogando agora |

O mapa completo dos 86 ícones (atual → novo) está no fim deste plano.

## Momentos assinatura

Todos com `transform`/`opacity`, um disparo, e desligados por "Reduzir animações".

1. **A chegada.** Quem entra na call chega no palco: o bloco cresce de 94 % para 100 % com a mola suave e um anel com o degradê da marca se abre e some (o "ping"). Quando *você* entra, os blocos de quem já estava chegam em sequência (40 ms entre um e outro): a sala te recebe.
2. **A voz.** O anel de quem fala deixa de "respirar" com `box-shadow` animado (repintura a cada quadro, a call inteira) e passa a acender e apagar junto com a fala — como no Discord, instantâneo e legível. As barrinhas ao lado do nome continuam, só enquanto a pessoa fala e paradas com a janela em segundo plano.
3. **O pouso.** A reação que você dá (ou que chega de alguém) cai no chip: o chip dá um pulo com a mola e o emoji quica.
4. **O voo.** A sua mensagem sai da caixa e sobe para o lugar dela com a mola suave (as dos outros continuam entrando com o deslize atual).
5. **O cutucão.** Mensagem nova que menciona você: a barra amarela da esquerda se desenha de cima para baixo.
6. **Acendeu.** Amigo que fica online: a bolinha de status acende com um pulo e um anel verde que se abre, na lista de membros.
7. **Digitando.** "Fulano está digitando…" ganha os três pontinhos da página inicial (infinitos só enquanto alguém digita).
8. **Conectou.** Ao entrar na call, o painel de voz sobe no dock e as barrinhas do sinal sobem uma a uma; o ponto do relógio da call pisca uma vez (e para de pulsar a call inteira).
9. **Reconectou.** A faixa de "Conexão perdida" ganha ícone e, quando a conexão volta, vira por 2 s um "Conectado de novo" verde antes de sumir.

## Estados

| Estado | Hoje | Proposta |
|---|---|---|
| Hover | fundos que esmaecem em 100–150 ms (repintura) | troca instantânea de fundo/cor (mais rápida e sem custo); gestos dos ícones |
| Pressionado | afunda (.92/.97) e volta com a mesma curva | afunda rápido (60 ms) e solta com a mola `--spring-snappy` |
| Foco | contorno de 2 px na maioria; fraco no seletor de emoji (só fundo 8 %) | anel de foco único (`--focus-ring`, 2 px, afastado 2 px); por dentro onde o recorte cortaria |
| Carregando | tela preta com uma linha roxa enquanto conecta | tela de abertura com o logo e um brilho que corre (só enquanto carrega) |
| Vazio | canal novo, amigos, DMs: ícone cinza num círculo | cartões com o degradê da marca, ícone com gesto de entrada e texto com personalidade |
| Erro | aviso vermelho que sobe | o aviso de erro dá uma sacudida curta; o de conexão ganha ícone |
| Sucesso | aviso roxo de "info" | o mesmo aviso, com o ícone pulando |

## Cor e tipografia

Sem trocar a identidade: carvão + roxo `#8e2fd8` no tema padrão, azul no Meia-noite, o degradê `#6d5dfc → #c64cf0` e a Figtree.

1. **Contraste (WCAG AA).** Corrigir o que o axe-core apontou na auditoria: nomes de membros offline (opacidade .5), textos apagados por opacidade (.75–.85) e o cinza `--text-muted` onde cai abaixo de 4,5:1. Em vez de opacidade, cores sólidas que passam.
2. **Restos do Discord.** `#80848e` (offline), `#4e5058` (curva da resposta, pílula pausada), `#1e1f22` (base dos blocos), `#313338` (botão branco da chamada) e `#5865f2` (cor padrão de perfil) viram tokens que acompanham o tema.
3. **Profundidade.** Três níveis de elevação (`--elev-1/2/3`) e um brilho de 1 px no topo das superfícies flutuantes (menus, cartões, diálogos, avisos, barra da chamada): a mesma "lâmina de vidro" que o blur dava, sem o custo.
4. **Tipografia.** A escala continua a mesma na leitura (16 px no chat); só sobem para 10–11 px os textos de 8–9,5 px que ainda são lidos (rótulos da prévia de tema, "ESC", marca das configurações).

## Ondas

Ganho visual × esforço × risco. Cada onda: `npm run check`, `npm test`, medição dos cenários principais, commit e push.

| Onda | Conteúdo | Ganho | Esforço | Risco |
|---|---|---|---|---|
| 1. Leveza | `bg-window`; blur fora dos fundos grandes e de cima do vídeo; animações infinitas viram estado ou disparo único; transições caras viram troca instantânea; Mudae respeita "Reduzir animações" | alto (desempenho na call) | médio | baixo |
| 2. Movimento | tokens com molas; clique que solta com mola; menus/janelas/avisos com as curvas novas | médio | baixo | baixo |
| 3. Ícones | peso ótico; trocas animadas; gestos de hover | alto (personalidade) | médio | baixo |
| 4. Momentos | chegada, voz, pouso, voo, cutucão, acendeu, digitando, conectou, reconectou | alto | médio | médio (mexe no `app.js`) |
| 5. Estados | abertura, vazios, erro/sucesso, foco único | médio | médio | baixo |
| 6. Cor | contraste, tokens no lugar dos restos do Discord, elevação | médio | médio | baixo |

## Tabela de animações (depois do polimento)

Todas: "Reduzir animações" e `prefers-reduced-motion` desligam (regra global). "Pausa" = para com `html.bg-window`.

| Animação | Gatilho | Propriedades | Duração | Curva | Infinita? |
|---|---|---|---|---|---|
| Menus, cartão de perfil, seletores (entrada) | abrir | opacity, transform (translate + scale .97) | 200 ms | `--ease-enter` | não |
| Menus etc. (saída) | fechar | opacity, transform (scale .98) | 120 ms | `--ease-exit` | não |
| Janelas (fundo / cartão) | abrir | opacity / opacity + transform | 200 / 280 ms | `--ease-enter` | não |
| Telas cheias (configurações, Novidades) | abrir | opacity + transform | 380 ms | `--ease-enter` | não |
| Gavetas do celular | abrir/fechar | transform (translateX) | 280 / 120 ms | enter / exit | não |
| Troca de canal (lista) | trocar | opacity + transform (rise) | 280 ms | `--ease-enter` | não |
| Clique (afundar / soltar) | pressionar / soltar | transform (scale) | 60 ms / 330 ms | `ease-out` / `--spring-snappy` | não |
| Dica (tooltip) | hover | opacity + transform | 140 ms | `--ease-enter` | não |
| Aviso (toast) | aparecer | opacity + transform; ícone com pulo | 280 ms; 410 ms | enter; `--spring-pop` | não |
| Aviso de erro | aparecer | transform (sacudida curta no ícone) | 400 ms | `ease-in-out` | não |
| Faixa de conexão | cair / voltar | transform (desce) / troca de cor instantânea | 280 ms | `--ease-enter` | não |
| A chegada (bloco da call) | alguém entra | opacity + transform (scale .94→1); anel com o degradê (scale + opacity) | 355 ms; 600 ms | `--spring-soft`; `ease-out` | não |
| A voz (anel de quem fala) | começar/parar de falar | troca instantânea do anel (sem transição) | — | — | não |
| Barrinhas de fala | enquanto fala | transform (scaleY) | 900 ms | `ease-in-out` | **sim** (atividade real; pausa) |
| O pouso (reação) | reação nova num chip | transform (scale .6→1 com sobra; emoji quica) | 410 ms | `--spring-pop` | não |
| O voo (sua mensagem) | enviar | opacity + transform (sobe 14 px, scale .985) | 355 ms | `--spring-soft` | não |
| Mensagem dos outros | chegar | opacity + transform (sobe 6 px) | 280 ms | `--ease-enter` | não |
| O cutucão (menção) | chegar mensagem que menciona você | transform (scaleY da barra amarela) | 400 ms | `--ease-enter` | não |
| Acendeu (amigo online) | ficar online | transform (scale com sobra) + anel (scale + opacity) | 410 / 600 ms | `--spring-pop` / `ease-out` | não |
| Digitando | alguém digita | transform + opacity (3 pontinhos) | 1,2 s | `ease-in-out` | **sim** (atividade real; pausa) |
| Conectou (painel de voz) | entrar na call | opacity + transform (sobe); barras do sinal sobem | 280 ms; 4 × 60 ms | `--ease-enter` | não |
| Ponto do relógio da call | entrar na call | anel que se abre uma vez (scale + opacity) | 900 ms | `ease-out` | não (antes: infinito com `box-shadow`) |
| Gestos dos ícones | hover | transform (no SVG inteiro; em partes só onde a metáfora pede) | 350–600 ms | molas / `ease-in-out` | não |
| Troca de ícone (mudo, câmera, fixar…) | trocar estado | transform + opacity; risco com `stroke-dashoffset` (SVG de 20 px) | 380 ms; 320 ms | `--spring-pop`; `ease-out` | não |
| Carregando (abertura, giros) | carregando | transform (giro) / opacity (brilho) | 800 ms / 1,4 s | linear / `ease-in-out` | **sim** (atividade real; pausa) |
| Chamada tocando | receber/fazer ligação | transform (sacudida) + anel (scale + opacity) | 1,3 s / 1,6 s | `ease-in-out` / `ease-out` | **sim** (atividade real; pausa) |
| Gravação de áudio | gravando | opacity (ponto) + transform (barras do medidor) | 1,2 s / 50 ms | `ease-in-out` / linear | **sim** (atividade real; pausa) |
| DJ tocando | música tocando | transform (disco gira, equalizador) | 2,4 s / 1 s | linear / `ease-in-out` | **sim** (atividade real; pausa) |
| Roleta do Mudae | rodar | transform (Web Animations API); brilho de raridade com opacity | duração do roll | — | só enquanto roda |
| Página inicial (jogo, conversa de exemplo) | ver a página | transform/opacity | — | — | **não** (para depois de alguns ciclos) |

### O que para de animar

- `speak-glow` (anel que "respira" com `box-shadow`) → anel fixo, instantâneo.
- `call-clock-pulse` (ponto do relógio da call, `box-shadow` a call inteira) → um anel único ao conectar.
- `profile-live` ("prévia ao vivo" nas configurações) → ponto fixo.
- `float` do ícone de amigos vazio → entrada única.
- `salon-sheen` (brilho do lendário, propriedade personalizada) → brilho que passa uma vez (transform) ao aparecer e no hover.
- `salon-tease`, `salon-open` (`box-shadow`) e `salon-wobble` (`filter`) → mesma ideia com `opacity`, só enquanto a roleta/a mesa está ativa.
- `call-pulse` (anel da chamada tocando, `box-shadow`) → anel com `transform`/`opacity`.
- `ld-speak`, `ld-speak-tile` (página inicial, `box-shadow`) → anel com `opacity`, por alguns ciclos.
- `flash` (mensagem destacada ao pular para ela, `background`) → camada com `opacity`.
- Hover infinito (`eq`, `dj-spin`, `mudae-beat`, setas de baixar) → um ou dois ciclos.
- Todas as transições de `background`, `color`, `border-color`, `box-shadow`, `border-radius` e `filter` em elementos grandes → troca instantânea (ou camada com `opacity` onde a suavidade importa).

## Mudanças × custo

| Mudança | Antes | Depois | Por que é melhor | Custo de desempenho (estimado; medido nas ondas) |
|---|---|---|---|---|
| Blur fora de fundos grandes e de cima do vídeo | desfoque refeito a cada quadro do vídeo | véu sólido translúcido + brilho de 1 px | mesma profundidade, sem custo de GPU; vídeo atrás de menus deixa de pesar | **economiza** GPU e composição na call e ao abrir janelas |
| Fim das infinitas sem atividade | repintura contínua na call (~48 pinturas/s) | zero repintura com ninguém falando | o app fica leve enquanto você joga | **economiza** ~180 ms/s de CPU da página no palco (meta) |
| `bg-window` | nada para minimizado/sem foco | barrinhas, giros, DJ e chamada tocando param | "o programa mais leve da máquina" | **economiza**; custa 1 recálculo de estilo localizado por troca de foco |
| Transições instantâneas | hover repinta por 100–200 ms | troca na hora | mais rápido ao olho e sem custo | **economiza** pequenas repinturas |
| Molas no clique e nos chips | curva única de saída | afunda rápido, solta com mola | "tátil", com personalidade | igual (transform) |
| Gestos de ícones | 12 ícones | ~40 ícones | personalidade e retorno | só no hover; SVG de 20 px; desprezível |
| Momentos assinatura | — | chegada, pouso, voo, cutucão, acendeu, digitando, conectou | o app reage às pessoas | disparos de 0,3–0,6 s, compositor |
| Abertura e vazios | tela preta / ícone cinza | logo + brilho; cartões com a marca | o app parece pronto e vivo | brilho só enquanto carrega |
| Contraste e tokens | 4 falhas AA, restos do Discord | AA nas telas medidas, tokens por tema | leitura e temas coerentes | nenhum |
| Peso ótico dos ícones | traço 1,17–1,83 px | ≥ 1,5 px | ícones pequenos nítidos | nenhum |

## Ideias ousadas (fora do escopo)

Não entram neste ramo porque mudam a essência ou o orçamento. Ficam para o dono decidir.

1. **Anel de voz pelo volume real.** O anel e as barrinhas acompanham o volume de verdade de cada pessoa (o app já mede 10×/s). Lindo, mas atualiza estilo 10 vezes por segundo por pessoa falando.
2. **Ícones de servidor em "squircle" que respiram com a conversa.** Mudar a forma dos ícones foi o que mais irritou no Discord de 2025.
3. **Tema "Brasa" (claro-escuro quente).** Um quarto tema com a mesma marca.
4. **Troca de canal com View Transitions.** O nome do canal "voa" da lista para o cabeçalho. Funciona no Chromium 111+, mas tira foto da página inteira a cada troca: custo de captura e memória maior que o deslize atual.
5. **Mascote "Hex".** Um bichinho em SVG nos estados vazios e nos erros, reagindo ao que acontece.
6. **Sons de interface.** Um "plim" curto ao mandar mensagem e ao alguém entrar na call (fora do escopo visual).
7. **Vibração no Android** nos momentos assinatura (ponte `AndroidApp`).
8. **Luz ambiente do palco:** os blocos de vídeo tingem de leve o fundo com a cor média da imagem. Exige ler pixels do vídeo; caro.
9. **Modo jogo:** com um jogo detectado, a janela do Resenhex entra num modo ultracompacto e sem nenhum movimento.
10. **Sinal de janela do app de Windows:** o `main.js` avisaria o site de `minimize`/`restore` por IPC. O `blur` já cobre o caso de forma conservadora; o sinal exato exige publicar o app 1.4.7, o que este trabalho não faz.

## Decisões tomadas sem o dono

| Decisão | Por quê |
|---|---|
| Ramo `visual-polish` criado de `origin/main`, sem upstream e com `push.default=current` | o prompt pede esse ramo; sem upstream um `git push` sem argumentos nunca vai para `main`. O ambiente desta sessão também designava o ramo `claude/vibrant-gates-ee1jxl`; ele recebe os mesmos commits para o ambiente não perder o trabalho. |
| Ler "animar só transform e opacity" de forma estrita, também para as transições de hover | é regra dura; troca instantânea de cor é o comportamento do Discord e do Windows e custa zero. Onde a suavidade importa, pseudo-elemento com `opacity`. |
| `bg-window` pausa ao perder o foco, não só ao esconder | no Electron com `backgroundThrottling: false` a janela minimizada continua "visível" para o site; o foco é o único sinal disponível sem publicar app. Custo: numa segunda tela, sem foco, as barrinhas param (o anel de quem fala continua). |
| Não usar a Archivo no app | já está em `public/fonts/`, mas o app nunca a baixou: seriam 90 KB a mais. |
| Não mexer em `desktop/` | mudanças lá só chegam com app novo publicado, e publicar está fora do escopo. |
| Cenário "janela minimizada" medido como "chamada sem foco" | o Chromium headless não minimiza; e no Electron, como dito, a página minimizada se comporta como visível sem foco. |
| CPU dos processos medida também sem a lentidão de 4× | a lentidão artificial do CDP gasta CPU por conta própria; para "quanto o app consome" vale a medida sem ela, e para quadros/tarefas longas/resposta, a com 4×. |

## Pesquisa (Fase 2)

Fontes primárias primeiro. "Suporte" foi conferido contra o Chromium 152 do Electron 44 e contra o WebView do Android (atualizado pela Play Store desde o Android 5; no Android 7 a 9 é o próprio Chrome, a partir do 10 é o "Android System WebView", com a mesma versão do Chrome). WebView antigo e sem atualização é tratado como "navegador sem o recurso": tudo abaixo tem plano B que só tira o enfeite.

### Plataforma (o que o app roda)

| # | Fonte | O que confirmou |
|---|---|---|
| 1 | [Electron 44.0.0 — release](https://releases.electronjs.org/release/v44.0.0) | Electron 44 = Chromium 152.0.7977.54, Node 24.18.1, V8 15.2. |
| 2 | [Electron — `webPreferences.backgroundThrottling`](https://www.electronjs.org/docs/latest/api/structures/web-preferences) | Com o throttling desligado, "frames will be drawn and swapped for the whole window" e a Page Visibility API é afetada. |
| 3 | [Electron — BrowserWindow, visibilidade da página](https://www.electronjs.org/docs/latest/api/browser-window) | "If `backgroundThrottling` is disabled, the visibility state will remain `visible` even if the window is minimized." → no app de Windows o site **não** sabe que foi minimizado por `document.hidden`; o sinal que sobra é o foco da janela (`blur`/`focus`, `document.hasFocus()`). |
| 4 | [Chrome Releases — Android WebView](https://chromereleases.googleblog.com/search/label/Android%20WebView) | O WebView acompanha as versões do Chrome. |

### Movimento barato

| # | Fonte | O que confirmou |
|---|---|---|
| 5 | [web.dev — Stick to compositor-only properties and manage layer count](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count) | Só `transform` e `opacity` mudam sem layout nem pintura; promover camadas demais custa memória. |
| 6 | [web.dev — Measure performance with the RAIL model](https://web.dev/articles/rail) | Resposta visual a uma ação em até 100 ms (processar o evento em até 50 ms); cada quadro de animação em até 10 ms de trabalho. |
| 7 | [web.dev — Interaction to Next Paint](https://web.dev/articles/inp) | INP bom ≤ 200 ms; o nosso alvo de 100 ms é mais duro, de propósito. |
| 8 | [Chrome for Developers — Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames) | LoAF (Chrome 123+): quadros acima de 50 ms com `blockingDuration`; usado na medição. |
| 9 | [Chrome for Developers — `linear()` easing](https://developer.chrome.com/docs/css-ui/css-linear-easing-function) | Molas e quiques em CSS puro; Chrome/Edge 113, Firefox 112, Safari 17.2. Navegador que não entende ignora a declaração e fica com a anterior (plano B). |
| 10 | [Chrome for Developers — Entry/exit animations (`@starting-style`, `transition-behavior: allow-discrete`, `overlay`)](https://developer.chrome.com/blog/entry-exit-animations) | Chrome 116/117. O app já usa `allow-discrete`; sem suporte, o painel só some (como antes). |
| 11 | [Chrome for Developers — Same-document View Transitions](https://developer.chrome.com/docs/web-platform/view-transitions/same-document) | Chrome 111+. Tira foto da página inteira antes e depois — custo de captura alto para troca de canal; ficou nas ideias fora do escopo. |
| 12 | [Chrome for Developers — Scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations) | Chrome 115; rodam fora da thread principal. Sem uso necessário hoje. |
| 13 | [web.dev — `content-visibility`](https://web.dev/articles/content-visibility) | Chrome 85+; pula renderização fora da tela; precisa de `contain-intrinsic-size` para a barra de rolagem não pular. |
| 14 | [MDN — `will-change`](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change) | "Last resort": não espalhar; o Chromium já promove o elemento durante a animação. |
| 15 | [MDN — `animation-play-state`](https://developer.mozilla.org/en-US/docs/Web/CSS/animation-play-state) | `paused` congela no ponto atual e retoma dali; disponível em todos os navegadores desde 2015. |
| 16 | [Efeitos no compositor do Chromium (resumo técnico)](https://grida.co/docs/wg/research/chromium/effect-optimizations) | `backdrop-filter` sempre vai pelo caminho caro (saveLayer); um blur que lê pixels vizinhos expande a área danificada para a superfície inteira quando o que está atrás muda — por isso blur sobre vídeo refaz o desfoque a cada quadro do vídeo. |

### Acessibilidade

| # | Fonte | O que confirmou |
|---|---|---|
| 17 | [W3C — Understanding SC 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide) | Movimento automático que dura mais de 5 s em paralelo com outro conteúdo precisa poder parar (ou parar sozinho). |
| 18 | [W3C — Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | AA: alvo de 24×24 px (ou espaçamento equivalente); 44×44 é o nível AAA (2.5.5). |
| 19 | [MDN — `prefers-contrast`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast) | `more`/`less`/`custom`; disponível desde 2022. |
| 20 | [Chrome for Developers — `prefers-reduced-transparency`](https://developer.chrome.com/blog/css-prefers-reduced-transparency) | Chrome 118: pedido do sistema para menos transparência. |
| 21 | [Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/motion) | Movimento com propósito; retorno curto e preciso; com "Reduzir movimento", tirar ou minimizar. |

### Ícones

| # | Fonte | O que confirmou |
|---|---|---|
| 22 | [Lucide — Icon design principles](https://lucide.dev/contribute/icons/design-principles) e [especificação](https://lucide.dev/contribute/icons/specification) | Quadro 24×24, traço 2 px, pontas e junções redondas, 1 px de respiro na borda. |
| 23 | [Lucide — LICENSE](https://github.com/lucide-icons/lucide/blob/main/LICENSE) | ISC; os ícones herdados do Feather são MIT. Ambas compatíveis com AGPL-3.0. |
| 24 | [Comparação Lucide × Tabler × Phosphor](https://dev.to/svgicons/lucide-vs-tabler-vs-phosphor-which-free-icon-set-fits-your-ui-4ocl) | Tabler usa o mesmo quadro 24/2 px (mistura sem choque); Phosphor é outro grid (256) com 6 pesos. |
| 25 | [lottie-web — tamanho do pacote (issue #1184)](https://github.com/airbnb/lottie-web/issues/1184) e [dotlottie-web](https://www.npmjs.com/package/@lottiefiles/dotlottie-web) | lottie-web ≈ 240–300 KB minificado (60–75 KB gzip); a versão "light" ≈ 144 KB; dotlottie-web ≈ 320 KB minificado + WASM. Para ícones de 20 px não compensa. |

### Referências de movimento e de produto

| # | Fonte | O que pegamos |
|---|---|---|
| 26 | [Microsoft — Timing and easing (WinUI / Windows 11)](https://learn.microsoft.com/en-us/windows/apps/design/motion/timing-and-easing) | Durações nomeadas de 83/167/250 ms; entrada "fast out, slow in"; saída mais curta que a entrada. |
| 27 | [Fluent 2 — Motion](https://fluent2.microsoft.design/motion) | Movimento "funcional, natural e consistente"; linear só para rotação constante. |
| 28 | [Atualização visual do Discord (mar/2025) — PC Gamer](https://pcgamer.com/software/discord-drops-big-update-with-completely-new-in-game-overlay-and-new-dark-themes-for-the-desktop-client) | Temas mais escuros (Onyx), controles de voz centralizados, sinais de cor mais claros (microfone mutado em vermelho, câmera em verde), overlay em widgets. A reação ruim às mudanças de forma (ícones quadrados) reforça a regra do "usuário que volta". |
| 29 | Material 3 Expressive (implementações públicas, p. ex. [pub.dev/expressive_m3](https://pub.dev/packages/expressive_m3)) | Separar molas "espaciais" (posição/escala, com um pouco de sobra) de molas de "efeito" (cor/opacidade, sem sobra). |


## Mapa de ícones (atual → novo)

Todos os 86 ícones do `icons.js` mantêm o desenho e o significado; todos ganham o peso ótico (traço visível ≥ 1,5 px). "Hoje" é o movimento atual; "Novo" é o que muda.

| Ícone | Onde | Hoje | Novo |
|---|---|---|---|
| `menu` | abrir canais (celular) | estático | — |
| `hash` | canal de texto, cabeçalho | estático | — |
| `volume` | canal de voz, som | estático | — |
| `volumeX` | mudo para mim, sons | notas dançam (hover) | (mantém) |
| `lock` | canal privado, banimentos | estático | — |
| `mic` | microfone | balança (hover) | (mantém) |
| `micOff` | microfone desligado | balança (hover); risco desenhado ao trocar | (mantém) |
| `headphones` | fone | pulinho (hover) | (mantém) |
| `headphonesOff` | ensurdecido | pulinho; risco desenhado | (mantém) |
| `settings` | configurações | gira 120° (hover) | (mantém) |
| `screen` | tela/transmissão | estático | — |
| `screenShare` | compartilhar tela | seta sai e volta (hover) | (mantém) |
| `camera` | câmera | flash (hover) | flash também no vídeo da DM |
| `cameraOff` | câmera desligada | flash (hover) | troca animada (pulo + risco) |
| `phone` | ligar/desligar | treme no "desconectar" | treme também ao ligar (DM) |
| `plus` | adicionar | estático | gira 90° |
| `upload` | enviar imagem | estático | seta sobe |
| `plusCircle` | anexar | gira 90° (anexar) | (mantém) |
| `gif` | GIF | estático | balança |
| `smile` | emoji | piscadinha (emoji) | (mantém) |
| `smilePlus` | reagir | estático | pulo |
| `reply` | responder | estático | seta recua e volta |
| `send` | enviar (celular) | estático | — |
| `pencil` | editar | estático | risca para o lado |
| `trash` | apagar | estático | tampa levanta (caminho `lid` separado) |
| `users` | membros, amigos | pulinho no botão de membros | (mantém) |
| `chevronDown` | abrir/recolher | estático | empurra para baixo |
| `chevronRight` | submenu | estático | empurra para a direita |
| `chevronLeft` | voltar | estático | empurra para a esquerda |
| `logout` | sair da conta | seta anda | (mantém) |
| `alert` | aviso de erro | estático | sacode no aviso de erro |
| `info` | aviso de info | estático | pulo no aviso |
| `copy` | copiar | estático | folha se desloca |
| `x` | fechar | estático | gira 90° em todo "fechar" |
| `crown` | dono | estático | inclina |
| `file` | arquivo | estático | — |
| `music` | efeitos sonoros | notas dançam (hover) | (mantém) |
| `download` | baixar | estático | seta desce |
| `signal` | voz conectada, diagnóstico | estático | barras sobem uma a uma ao conectar |
| `link` | convite | estático | elos se deslocam |
| `userCog` | perfil (config.) | estático | — |
| `pause` | pausado | estático | — |
| `play` | tocar (DJ) | estático | troca animada com pausa |
| `clapperboard` | clipar | claquete bate (hover) | (mantém) |
| `pauseBars` | pausar (DJ) | estático | troca animada com play |
| `skip` | pular (DJ) | estático | empurra |
| `stop` | parar (DJ) | estático | — |
| `disc` | DJ | gira sem parar (hover e tocando) | uma volta no hover; gira tocando, parado em segundo plano |
| `listMusic` | fila do DJ | estático | — |
| `refresh` | tentar de novo | estático | meia volta |
| `waves` | supressão de ruído | equalizador infinito no hover | equalizador por 2 ciclos |
| `pin` | fixar transmissão | estático | espeta |
| `pinOff` | desafixar | estático | troca animada |
| `maximize` | tela cheia | estático | cantos abrem |
| `minimize` | sair da tela cheia | estático | cantos fecham |
| `pip` | janela flutuante | estático | — |
| `eye` | assistir | estático | pisca |
| `eyeOff` | parar de assistir | estático | troca animada |
| `sparkles` | Novidades | estático | estrelinhas cintilam (uma vez) |
| `moreHorizontal` | mais opções | estático | — |
| `message` | chat da sala, DMs | estático | balão quica |
| `check` | aceitar, salvar | estático | pulo; desenha o traço ao confirmar |
| `userPlus` | adicionar amigo | estático | o "+" pula |
| `userMinus` | remover amigo | estático | — |
| `ban` | banir | estático | — |
| `search` | buscar | estático | lupa inclina |
| `zoomIn` | aproximar | estático | cresce |
| `zoomOut` | afastar | estático | encolhe |
| `crop` | ajustar foto | estático | — |
| `image` | imagem | estático | — |
| `panelTop` | banner | estático | — |
| `layers` | fundo do perfil | estático | — |
| `scan` | enquadrar | estático | — |
| `shrink` | reduzir | estático | — |
| `heart` | casar (Mudae) | bate sem parar no hover (Mudae) | uma batida |
| `dice` | Mudae | estático | rola |
| `gem` | valor (Mudae) | estático | — |
| `at` | menções, notificações | estático | gira |
| `clock` | castigo, horário | estático | — |
| `activity` | saúde do servidor | estático | — |
| `star` | favorito (Mudae) | estático | gira |
| `gamepad` | jogando agora | estático | sacode |
| `grid` | grade do palco | estático | — |
| `externalLink` | abrir fora | estático | seta sai |
| `store` | Microsoft Store | estático | — |
| `shieldAlert` | aviso de segurança | estático | — |
