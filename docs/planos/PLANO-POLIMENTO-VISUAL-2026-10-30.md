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

O mapa completo dos 88 ícones (atual → novo) está no fim deste plano.

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
