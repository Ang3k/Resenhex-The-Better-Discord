# Resenhex

**Versão 0.99** · veja o que mudou em cada versão no [CHANGELOG.md](CHANGELOG.md) ou em **Novidades**, dentro do app.

Plataforma própria de chat e voz para você e seus amigos, inspirada no Discord. Vem com o servidor **Resenha** pronto para usar, com:

- **Página inicial** para quem visita pela primeira vez, com apresentação dos recursos, download para Windows e acesso pelo navegador. Sessões existentes entram automaticamente; convites e o app de desktop continuam abrindo direto no login. Os links `/#entrar` e `/#criar-conta` abrem cada formulário diretamente.
- **Contas** com nome de usuário, senha e confirmação da senha, sem e-mail (login automático depois da primeira vez)
- **Vários servidores**: criar e alternar pela barra lateral, entrar por convite e copiar um link exclusivo para seus amigos. Canais, grupos, cargos e chamadas independentes.
- **Apelidos por servidor**: abra **Editar nome no servidor** no menu do servidor ou em Meu perfil. Escolha até 32 caracteres ou restaure seu nome de usuário; login, amigos e mensagens diretas usam a identidade da conta.
- **Reconexão automática**: se a internet ou o servidor cair, o app volta sozinho, sem recarregar a página, busca as mensagens perdidas e te coloca de volta na chamada
- **Chat de texto** em canais, com histórico salvo, "fulano está digitando…", **editar** (✏️ ou seta ↑) e **apagar** mensagens
- **Imagens e arquivos**: botão ＋, **Ctrl+V** para colar um print, ou arrastar para o chat. Imagens e vídeos aparecem no chat.
- **Menções** `@nome`, `@cargo` e `@everyone`, com autocompletar ao digitar `@`
- **Não lidas**: canal em negrito, bolinha vermelha com o número de menções, contador no título da aba e **notificação na área de trabalho**
- **Responder** mensagens (↩️) e **reagir** com emoji (😀)
- **Formatação**: `**negrito**`, `*itálico*`, `__sublinhado__`, `~~riscado~~`, `` `código` ``, blocos ```` ``` ````, `> citação` e `||spoiler||`
- **Amigos e mensagens diretas**: botão Início na faixa da esquerda. Adicione amigos pelo nome de usuário (ou pelo cartão de perfil), aceite pedidos na aba Pendentes e converse em particular com o mesmo chat dos canais: formatação, arquivos, responder, reagir, editar e apagar. Também dá **bloquear** alguém. Mensagens diretas só existem entre amigos e, pelo app, ninguém mais as lê ou apaga, nem a administração (elas ficam no arquivo de dados de quem hospeda o servidor, sem criptografia)
- **Banner do perfil**: em ⚙️ Configurações → Meu perfil você troca a faixa colorida do cartão de perfil por uma imagem (PNG, JPG ou WebP, recortada no centro) ou por um **GIF animado** de até 5 MB
- **Fundo do perfil**: em **Meu perfil → Mudar fundo**, escolha uma imagem (PNG, JPG ou WebP de até 8 MB) ou um GIF animado de até 5 MB. Ajuste o enquadramento e salve para preencher a parte abaixo do banner. As informações aparecem direto sobre o fundo, com escurecimento e sombra no texto para manter a leitura; **Remover fundo** restaura o fundo padrão.
- **Chamadas de voz** em salas, com indicador verde de quem está falando e **sons** de entrar e sair
- **Câmera** e **compartilhamento de tela** com perfis de qualidade (720p 30 fps, 1080p 30 fps e 1080p 60 fps), áudio do sistema e estatísticas ao vivo; dá para usar câmera e tela ao mesmo tempo; clique na tela para abrir em tela cheia
- **Foto de perfil ajustável**, com arraste, zoom e prévia circular, incluindo GIF animado de até 5 MB e 1024 pixels por lado. Em **Meu perfil**, use **Mudar foto** ou **Ajustar foto** e salve as alterações.
- **Efeitos sonoros (soundboard)**: botão 🎵 na chamada reúne sons prontos e até 32 sons personalizados por servidor, com pré-escuta. **Adicionar efeito sonoro** abre o envio de um áudio de até 8 segundos e 5 MB. A permissão **Gerenciar efeitos sonoros** controla o envio e a remoção; **Usar efeitos sonoros** controla a reprodução na sala, com limite contra spam. Volume e silenciamento continuam independentes.
- **Salão do Mudae**: um canal com tela própria onde a turma roda personagens de anime numa roleta ao vivo, casa (ou rouba) e monta um álbum (veja [Mudae](#mudae))
- **DJ da sala (músicas do YouTube)**: botão do disco na chamada, ou `/play nome da música` em qualquer chat. A música toca para todo mundo da sala de voz, no mesmo ponto, com fila, pausar, pular e parar para todos e volume só seu (veja [DJ da sala](#dj-da-sala-músicas-do-youtube))
- **Mutar / ensurdecer** (botões na barra da chamada e no painel do usuário, também pelos atalhos `Ctrl+Shift+M` / `Ctrl+Shift+D`) e **push-to-talk** (apertar uma tecla para falar)
- **Volume individual** e **mutar para mim** (só afeta o que você ouve)
- **Cargos e permissões** estilo Discord, com hierarquia
- **Moderação**: silenciar e ensurdecer no servidor, mover e desconectar da voz, castigo (timeout), expulsar e banir
- **Grupos de canais** com texto e voz juntos: criar, renomear, recolher, ordenar e mover por arraste ou pelo menu ⋯. Excluir um grupo mantém seus canais em “Sem grupo”.
- **Canais privados** por cargo ou somente para administradores, descrição do canal e duplicação de configurações com histórico vazio
- Escolha de **microfone e saída de áudio**, com supressão de ruído
- Lista de membros agrupada por cargo, com online e offline (dá para esconder pelo botão no topo)
- Interface no estilo Discord: ícones vetoriais, dicas ao passar o mouse, categorias recolhíveis, divisores de data, menu do servidor (clique em "Resenha") e controles da chamada na parte de baixo da tela
- **App para Windows** que se atualiza sozinho, com push-to-talk em segundo plano, bandeja e menções na barra de tarefas (veja abaixo)

## App para Windows

Mande para os amigos o link **`https://seu-dominio/baixar`**. Lá tem o botão de download e o passo a passo. No site, quem usa Windows também vê um botão verde de download na barra de servidores.

- O instalador tem cerca de 107 MB, instala em segundos (sem pedir administrador) e já abre o app. Na primeira vez, o Windows pode mostrar **“O Windows protegeu o computador”**, porque o app não tem assinatura paga: é só clicar em **Mais informações** e depois em **Executar assim mesmo**.
- O app é uma janela que abre o seu site. Por isso, **toda mudança no site chega no app com o deploy normal** (`deploy/atualizar-oracle.ps1`), sem ninguém baixar nada.
- A “casca” do app (pasta `desktop/`: janela, bandeja, push-to-talk global, escolha de tela) só muda quando você mexe nela. Para publicar uma versão nova dela, aumente `version` em `desktop/package.json` e rode, na pasta do projeto:

  ```powershell
  powershell -ExecutionPolicy Bypass -File discord-clone\deploy\publicar-app.ps1
  ```

  O script gera o instalador, testa, envia para o servidor e confere a versão publicada. O app dos amigos encontra a versão nova sozinho (na abertura e a cada 2 horas), baixa só o que mudou e mostra **Reiniciar para atualizar** na barra de título. Se a pessoa não clicar, a atualização entra quando ela fechar o app.
- O que o app faz a mais que o navegador: push-to-talk com o app em segundo plano (inclusive em jogos), escolha de aplicativo ou tela com miniaturas e som do computador sem eco, selo de menções na barra de tarefas, bandeja com **Iniciar com o Windows** e **Fechar para a bandeja**, corretor em português e tela de reconexão automática.
- **Versão da Microsoft Store (sem o aviso do Windows):** `npm run dist:store`, na pasta `desktop/`, gera `desktop/dist/Resenhex-<versão>.appx` para enviar no Partner Center. Textos, capturas e respostas para a loja estão em [`desktop/store/LOJA.md`](desktop/store/LOJA.md). Na versão da loja, quem atualiza a casca é a Microsoft Store; o site continua chegando pelo deploy normal. Depois que a loja aprovar, coloque `MS_STORE_ID=<ID da loja>` em `/etc/resenhex.env` e reinicie o serviço: o botão da página `/baixar` passa a baixar o instalador oficial da Microsoft, e o `.exe` fica como opção.
- A política de privacidade fica em **`https://seu-dominio/privacidade`** (a loja pede esse link).

### App para Android

O app de Android (pasta `android/`, em Java, sem bibliotecas) é um WebView que abre o site, então **toda mudança no site chega nele com o deploy normal**. O APK fica na própria página `/baixar` (quem abre pelo Android vê o botão **Baixar para Android**) e em `https://seu-dominio/download/Resenhex.apk`, que sempre aponta para a versão mais nova.

- **Call com a tela bloqueada:** ao entrar numa call, o app liga um serviço em primeiro plano (a notificação fixa "Na call", com **Silenciar** e **Sair da call**), segura o processador e o Wi-Fi acordados e mantém o site rodando. Na primeira call, ele explica e pede para o Android não pausar o app (otimização de bateria).
- **Permissões:** notificações na primeira abertura (Android 13+); microfone e câmera só quando o site pede (entrar na call, ligar a câmera).
- **Notificações:** o site usa `new Notification()` normalmente; `public/android.js` troca essa API pela notificação do Android. Elas chegam enquanto o app está aberto ou em segundo plano; com o app fechado de vez, não (isso exigiria push pelo Firebase).
- A ponte entre o site e o app é `window.ResenhexAndroid` (Java, em `MainActivity`) e `window.AndroidApp` (site, em `public/android.js`).
- `/.well-known/assetlinks.json` faz os links do Resenhex (convites) abrirem direto no app.
- Para testar no emulador, a versão de depuração (`gradlew assembleDebug`) instala ao lado da oficial e abre `http://localhost:3124/` (use `adb reverse tcp:3124 tcp:3124`), com o DevTools do Chrome liberado.
- A chave fica em `%USERPROFILE%\.resenhex-android\` (`resenhex.keystore` e `senha.txt`), fora do repositório. **Faça backup dessas duas**: sem elas não dá para publicar uma atualização que instale por cima da versão dos amigos.
- O JDK 17 e o SDK do Android ficam em `%USERPROFILE%\.bubblewrap\`.
- Só é preciso publicar o APK de novo quando algo na pasta `android/` mudar. Aumente `versionCode` e `versionName` em `android/app/build.gradle` e rode, na pasta do projeto:

  ```powershell
  powershell -ExecutionPolicy Bypass -File discord-clone\deploy\publicar-android.ps1
  ```

  O script gera e assina o APK, confere a assinatura com o `assetlinks.json`, envia para o servidor e confere a versão publicada.
- Os ícones do app (`public/icons/`) saem do `public/resenhax-logo.png` com `node tools/icones-app.js`.
- O Android pede para permitir instalar apps desta fonte na primeira vez, porque o APK não vem da Play Store. Compartilhar a tela não funciona no celular; assistir às transmissões funciona.
- Para rodar a casca no seu PC durante o desenvolvimento: `cd discord-clone/desktop`, `npm install` e `npm start` (use `RESENHEX_URL=http://localhost:3000/` para apontar para o servidor local). Os problemas de atualização ficam registrados em `%APPDATA%\Resenhex\resenhex.log`.

## Servidores e convites

1. Crie sua conta com nome de usuário, senha e confirmação de senha. Se já tem conta, basta entrar normalmente.
2. Clique no **+** da barra de servidores → **Criar meu servidor**, dê um nome e confirme. O novo servidor já tem canais de texto e voz e você é o dono.
3. No menu do nome do servidor, escolha **Convidar amigos** → **Copiar link**. O link é específico daquele servidor (`https://seu-dominio/?invite=...`).
4. Seu amigo abre o link, entra ou cria sua conta, vê a prévia do servidor e clica em **Entrar no servidor**. Também pode colar o convite em **+ → Entrar em um servidor**.

Clique nos ícones da barra lateral para trocar de servidor. No celular, abra a lista de canais e use **Seus servidores**. A troca encerra a chamada atual. Rascunhos são mantidos por canal durante a sessão; nome, ícone, cargos, canais, históricos e participação ficam salvos no banco.

Novas contas ficam fora dos servidores até aceitar um convite ou criar um servidor. Em uma instalação vazia, a primeira conta inicializa o servidor Resenha. Instalações existentes preservam o nome atual (inclusive **Santuário Letárgico**), os membros, canais, grupos, cargos, banimentos e históricos. O perfil, os amigos e as mensagens diretas são da conta; castigos e banimentos são da participação em cada servidor.

O convite é persistente, sem prazo ou limite de usos. Todos os membros podem copiá-lo; administradores podem **Revogar este link e gerar outro**. O anterior deixa de aceitar entradas, sem expulsar quem já entrou. Limites atuais: 100 participações e 20 servidores próprios por conta. Quem sair precisa de convite para voltar; o dono permanece no servidor.

A organização da criação e dos convites segue os fluxos descritos na documentação oficial do Discord: [criar um servidor](https://support.discord.com/hc/en-us/articles/204849977-How-do-I-create-a-server) e [convidar amigos](https://support.discord.com/hc/en-us/articles/204155938-How-do-I-invite-friends-to-my-server).

### Atualização de instalações existentes

Antes de migrar o banco para vários servidores, a atualização cria `data.json.pre-0.9.1.bak`. Essa cópia do formato anterior permanece intacta nos próximos reinícios, além do backup rotativo `data.json.bak`. Mantenha também sua cópia da pasta de uploads. Atualizar os arquivos e reiniciar o serviço aplica a migração; não é necessário recriar o servidor nem as contas.

As variáveis antigas `ACCESS_PASSWORD` e `ACCESS_PASSWORD_B64` deixaram de restringir o cadastro: cada pessoa usa sua própria senha, e o convite controla a entrada no servidor. Cadastros têm limites por IP; canais e permissões são verificados no servidor. Prévia pública de convite mostra apenas nome, ícone e quantidade de membros.

## Cargos e moderação

- **A primeira conta criada vira a dona do servidor 👑.** A dona tem todas as permissões e ninguém pode agir contra ela. Por isso, crie a sua conta antes de mandar o link para os amigos.
- Clique (ou clique com o botão direito) em qualquer membro, na lista da direita, nos canais de voz ou no nome numa mensagem, para abrir o menu com as ações que você tem permissão de usar.
- A **⚙️ ao lado do nome do servidor** abre as configurações do servidor. Ela só aparece para quem pode gerenciar cargos, canais ou banimentos:
  - **Cargos:** criar, renomear, escolher cor, "mostrar separado na lista", marcar permissões e subir ou descer na hierarquia
  - **Canais:** criar grupos com texto e voz, mover e ordenar canais, renomear, duplicar, descrever, apagar e controlar quem pode acessar
  - **Banidos:** desbanir

Cargos que já vêm criados:

| Cargo | Permissões |
|---|---|
| Admin | Todas |
| Moderador | Expulsar, castigar, silenciar e ensurdecer, mover e desconectar da voz, apagar mensagens |
| @everyone (todos) | Enviar mensagens, entrar na voz, falar, compartilhar tela |

Regras da hierarquia (iguais às do Discord):
- Você só pode moderar quem tem o cargo mais alto **abaixo** do seu.
- Você só pode dar, tirar ou editar cargos **abaixo** do seu, e não pode dar a um cargo uma permissão que você não tem.
- Tirar uma permissão do **@everyone** restringe todo mundo que não tem outro cargo com ela. Por exemplo, tire "Enviar mensagens" e dê essa permissão só a um cargo "Membro".
- **Castigo:** a pessoa não escreve, não fala e não compartilha tela até o tempo acabar.
- **Expulsar:** remove a pessoa daquele servidor; ela pode voltar por convite. **Banir:** impede a entrada naquele servidor até ser desbanida. Ambas mantêm sua conta, seus outros servidores e suas DMs.

Tudo isso é verificado **no servidor**, então ninguém burla mexendo no navegador. A única exceção é o silêncio na voz: como o áudio vai direto entre os navegadores, quem foi silenciado ainda envia áudio se modificar o próprio navegador, mas os navegadores dos outros deixam de tocar esse áudio.

## Como funciona

```
Navegador ──Socket.IO──► server.js (chat + sinalização)
    │
    └──── WebRTC direto (voz e tela) ────► navegador dos amigos
```

O servidor só repassa as mensagens de texto e a "sinalização" (quem entrou na sala, ofertas e respostas WebRTC). O áudio e o vídeo vão **direto entre os navegadores** (malha P2P). Por isso o servidor pode ser pequeno e barato. O limite prático fica em torno de **6 a 8 pessoas por sala** (cada pessoa envia o áudio/tela para cada uma das outras). Para mais gente do que isso seria preciso um SFU (ex.: LiveKit ou mediasoup).

## DJ da sala (músicas do YouTube)

Na chamada, o botão do disco abre o DJ: busque no YouTube ou cole um link (vídeo, shorts, live, youtu.be ou YouTube Music). No chat, os comandos são `/play <música ou link>`, `/pular`, `/pausar`, `/continuar`, `/parar` e `/fila`; eles valem para a sala de voz em que você está e não viram mensagem.

**Como funciona:** o servidor não toca nem baixa áudio. Ele guarda a fila de cada sala e o instante em que a música começou. Cada pessoa toca o vídeo no **player oficial do YouTube**, no próprio navegador, e o `public/music.js` mantém o player no mesmo ponto que o resto da sala (corrige quando passa de 1,5 s de diferença). Por isso não há bloqueio de IP do servidor, não gasta banda da VPS e o volume da música é separado das vozes.

- **Busca:** `youtube.js` usa a mesma API interna que o site do YouTube usa para pesquisar (sem chave e sem cota). Só dá para tocar o que veio de uma busca feita pelo servidor, então ninguém inventa título ou duração.
- **Fila:** `dj.js`, até 50 músicas por sala. A música acaba sozinha no servidor pelo tempo (com 2,5 s de folga) ou quando os players avisam. Sala vazia: a música espera 5 minutos no ponto em que parou e volta sozinha se alguém entrar; depois a fila é esquecida. Reiniciar o servidor também limpa as filas.
- **Clipe bloqueado:** alguns clipes de gravadora não tocam fora do YouTube. Quando a maior parte da sala avisa, o DJ toca outra versão da mesma busca (ou pula). Se só um aparelho não consegue (país, idade), só ele fica sem a música.
- **Permissão:** **Usar o DJ** (ligada para o @everyone, inclusive nos servidores existentes) controla pedir, pausar, pular, parar e tirar da fila. É preciso estar na sala.
- **Limites:** 20 buscas por minuto e 12 comandos do DJ a cada 20 segundos por pessoa.
- **Pelos termos do YouTube** o player não pode ficar escondido: o vídeo aparece no bloco do DJ no palco ou na capinha do painel da chamada.
- Para testar a busca sem internet, `YOUTUBE_ORIGIN` aponta para um YouTube de mentira (é o que `test/dj-server.test.js` faz).

## Mudae

O Mudae mora no **Salão do Mudae**, um canal de texto com `mudae: true` (crie em **Criar canal → Salão do Mudae**). Ele abre uma tela própria: **Mesa** (palco com fundo preto em gradiente, roleta de fotos e botões de roll e a Mesa ao vivo com os rolls de todo mundo), **Meu harem** (álbum) e **Ranking**. À direita ficam o chat do canal e a aba **No salão**.

| Comando | O que faz |
|---|---|
| `$w` / `$h` / `$m` | roda uma waifu, um husbando ou qualquer personagem (também pelos botões) |
| `$wa` `$wg` `$wc` `$wd` `$ws` (e o mesmo com `$h` e `$m`) | só de uma fonte: **a**nime, **g**ames (jogos), **c**omics (quadrinhos), **d**esenhos ou **s**éries. No Salão, os botões de fonte fazem o mesmo |
| `$mm` / `$mm @pessoa` | abre o seu álbum ou o de outra pessoa |
| `$im nome` | mostra um personagem, a posição no ranking e quem casou com ele |
| `$divorce nome` | solta um personagem do seu harem (pede confirmação; também pelo álbum) |
| `$tu` | rolls restantes e quando dá para casar de novo (só você vê) |

- **Só no Salão:** em outro canal, os comandos respondem (só para quem pediu) com o caminho até o Salão.
- **Modo simplificado** (botão no topo do Salão, guardado no navegador de cada pessoa): o canal aparece como chat comum, com os cards completos e o botão Casar no chat, como no Mudae original. Os rolls, casamentos e limites são os mesmos de quem está na roleta; o botão do card espera o giro e a vez de quem rodou. **Abrir o Salão**, no topo, volta para a tela da roleta.
- **Roleta de fotos:** o servidor sorteia na hora e manda o resultado com o `revealAt` (de 1,95 s no comum a 3,85 s no lendário, `REVEAL_MS` em `mudae.js`). O palco usa a roleta com 8 fotos-isca sobre um fundo preto em gradiente; ninguém casa antes da revelação. A cena 3D foi retirada do Salão e não carrega Three.js nem cria um contexto WebGL. O código anterior permanece separado em `public/gacha/` para referência.
- **Regras:** 10 rolls e 1 casamento a cada 30 minutos por pessoa, contados pelo relógio (ambos renovam na hora cheia e aos 30 minutos). Depois que o card aparece, quem rodou tem 3 s de prioridade; depois, qualquer um casa (e o chat conta o roubo). A janela total é de 45 s. Cada personagem tem um só dono por servidor.
- **Raridade** pela posição dentro da própria fonte, em proporção: os 0,67% mais populares são lendários, até 6,7% épicos, até 33% raros, o resto comum (numa fonte de 15 mil: 1–100, até 1.000, até 5.000). Assim a chance de lendário não muda com o tamanho da fonte. Lendário toma o palco de todos, com banner, flash e fanfarra.
- **Palco:** o seu roll sempre vai para o palco; o de um amigo só se o palco estiver livre (senão entra na Mesa ao vivo); lendário de qualquer um sempre.
- **Personagens:** `mudae-catalogo.json`, gerado no seu computador por `node tools/mudae-catalogo.js` (um módulo por fonte em `tools/mudae-fontes/`, cada uma com cache em `tools/mudae-cache/`). O servidor lê o arquivo uma vez e nunca chama essas APIs: um roll é só um sorteio na memória. As fotos vão direto do site de cada fonte para o navegador.

  | Fonte | Cobertura | De onde | Popularidade | Chave |
  |---|---|---|---|---|
  | 🎌 Anime | Obras atuais + 200 animes e 200 mangás populares; elencos paginados sem teto de personagens | AniList | favoritos | não precisa |
  | 🎮 Jogos | Todos os personagens IGDB com retrato + categorias completas de 25 wikis, incluindo NPCs | IGDB + Fandom (Genshin, Star Rail, LoL, Zelda, Mario, Final Fantasy…) | nota do jogo / posição dentro da franquia | `igdbClientId` e `igdbClientSecret` |
  | 🦸 Quadrinhos | IDs Wikidata sem mínimo de sitelinks + 50 páginas diretas do Comic Vine (aceita fichas sem Wikidata) | Comic Vine: sem mangá, pessoas reais, figuras religiosas e gibis licenciados de outras mídias | sitelinks e aparições | `comicVineKey` |
  | 📺 Desenhos | Categorias completas das 26 wikis, com subcategorias e sem cotas por franquia | Fandom (Simpsons, Hora de Aventura, Disney, Pixar…) | posição dentro da franquia | não precisa |
  | 🎬 Séries | Séries atuais + 340 mais votadas; todos os papéis nomeados com foto, sem limite de 12 | TMDB; sem animação, reality e séries sobre gente real; foto do ator | votos da série e posição nos créditos | `tmdbKey` |

  As chaves ficam em `tools/mudae-chaves.json`, fora do Git: `{ "igdbClientId": "…", "igdbClientSecret": "…", "comicVineKey": "…", "tmdbKey": "…" }`. O comando padrão atualiza todas as fontes; `node tools/mudae-catalogo.js jogos series` atualiza só as indicadas. `--retomar` reutiliza consultas salvas de uma execução interrompida; `--juntar` monta com os caches. Os IDs de personagens anteriores são preservados, com backup em `tools/mudae-cache/backups/`; páginas auxiliares reconhecidas pela revisão de qualidade são retiradas mesmo se já estiverem em um cache. A deduplicação considera nome **e obra**, para preservar homônimos de franquias diferentes.

  A montagem aplica `tools/mudae-fontes/qualidade.js`: remove listas, bestiários, páginas de relacionamentos e fichas biográficas confirmadas de profissionais reais. A coleta Fandom distingue os dados de elenco/equipe dos campos de personagem; a lista de IDs revisados em `tools/mudae-fontes/pessoas-reais-revisadas.json` também impede que essas biografias voltem pelos caches. Personagens fictícios humanos, fotos de intérpretes e casos ambíguos são preservados. A revisão promove os protagonistas revisados e usa as categorias de jogáveis dos três gachas para impedir que NPCs com diálogos longos dominem o ranking. Personagens fora dessas categorias permanecem no catálogo com pontuação baixa, exceto as âncoras revisadas. Sem dados completos da categoria, não há esse rebaixamento. As faixas percentuais de raridade continuam calculadas por fonte; os ajustes e IDs retirados ficam em `tools/mudae-cache/relatorios/qualidade.json`.

  `tools/mudae-cache/relatorio.json` contém as quantidades atuais e o estado da atualização; `relatorios/` registra o escopo, os descartes, a paginação e as falhas de cada fonte. Uma coleta parcial preserva os dados anteriores, publica os acréscimos válidos e termina com código 1. O escopo popular pode ser ajustado com `--anime-paginas=N` (25 obras por página/tipo), `--series-populares=N` e `--quadrinhos-paginas=N`. A coleta não é um espelho integral das APIs: imagens ausentes, papéis genéricos e mídias fora do escopo continuam excluídos. Comic Vine respeita 200 pedidos/hora, então sua atualização pode demorar. O Ranking do Salão mostra os créditos das fontes (o TMDB pede o aviso).
- **Dados:** cada servidor guarda quem casou com quem, os favoritos e os horários de uso de cada pessoa. Os rolls são mensagens do bot no canal (entram no limite de 300), sem as fotos-isca. Presença e reações não são gravadas.
- **Permissão:** **Usar o Mudae** (ligada para o @everyone, inclusive nos servidores existentes).
- Para testar com outros personagens, `MUDAE_CATALOG` aponta para outro catálogo (é o que `test/mudae-server.test.js` faz).

## Rodando localmente

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
cd discord-clone
npm install
npm start
```

Abra <http://localhost:3000> em duas abas (ou dois navegadores) para testar.

## Supressão de ruído por IA (estilo Krisp)

Seu microfone passa por uma rede neural **antes** de ir para a chamada: barulho de teclado, ventilador, obra, cachorro e trânsito somem, e fica só a sua voz. Tudo roda no seu computador; nenhum áudio sai para outro servidor.

- Ligue ou desligue pelo **botão de ondas** no painel "Voz conectada" (verde = ligado).
- Em ⚙️ Configurações → **Supressão de ruído** você escolhe o modo:
  - **IA avançada** (padrão): usa o modelo [GTCRN](https://github.com/Xiaobin-Rong/gtcrn);
  - **IA leve**: usa o [RNNoise](https://github.com/xiph/rnnoise), para computadores mais fracos;
  - **Padrão do navegador**;
  - **Desligada**.
- **Testar microfone** (nas configurações): você se ouve já com a supressão e vê o nível do som. Use fone. Durante o teste você fica mudo na chamada, e o microfone volta sozinho ao parar.
- **Sensibilidade de entrada**: com "Ajustar automaticamente" o microfone só abre acima do ruído de fundo. Desmarcando, você arrasta a barra e vê no medidor onde fica o corte (no mínimo, o microfone fica sempre aberto).
- O cancelamento de eco é uma opção separada. Deixe ligado se você não usa fone.

Medido nos testes, com um áudio de chiado mais zumbido de ventilador: a IA avançada reduziu o ruído em cerca de **46 dB** (vira silêncio) e manteve o volume da voz igual. A IA leve ajuda bem menos com ruído forte.

Modelos: pacote [`@sapphi-red/web-noise-suppressor`](https://github.com/sapphi-red/web-noise-suppressor) (licença MIT).

## Compartilhamento de tela: qualidade e problemas comuns

Ao clicar em 🖥️, você escolhe um perfil. Dá para trocar a qualidade no meio da transmissão, clicando em 🖥️ de novo ou no botão ⚙️ da sua própria transmissão. No mesmo menu, **Trocar tela/aplicativo** escolhe outro monitor, janela ou aba sem parar a live: quem assiste continua vendo, sem cair.

| Perfil | Para quê |
|---|---|
| Automática (padrão) | Até 1080p · 30 fps, adaptada a cada espectador |
| 720p · 30 fps | Leve, bom para internet fraca |
| 1080p · 30 fps | Textos, trabalho e apresentações |
| 1080p · 60 fps | Fluido, para jogos (usa mais internet; H.264) |

**Controles da transmissão** (como no Discord). Passe o mouse sobre uma transmissão para ver:

- 🔊 **volume próprio da transmissão**, separado da voz da pessoa, e botão para silenciá-la;
- 📌 **fixar**, que deixa o bloco em destaque e os outros em miniatura (funciona também com a câmera ou o avatar de qualquer pessoa);
- **janela flutuante** (picture-in-picture), para continuar vendo enquanto usa outro programa;
- **tela cheia**;
- **qualidade para assistir**: Automática acompanha o tamanho do vídeo; Economia limita a 720p/15 fps; Mais nitidez solicita a resolução da fonte. Cada escolha afeta somente você, respeitando a banda disponível;
- **parar de assistir**, que desliga o vídeo só para você e economiza processamento. Para voltar, use "Assistir transmissão".

Atalhos: **clique** fixa ou solta, **clique duplo** abre em tela cheia e o **clique direito** mostra todas as opções num menu.

No canto da transmissão aparecem **resolução, fps, taxa e codec**. Para quem transmite aparece também quantas pessoas estão assistindo e se a qualidade foi adaptada. São medidas reais do envio/recebimento, não apenas o perfil escolhido.

Na 0.9 a transmissão usa um controlador por espectador: considera o tamanho da imagem exibida, a conexão e o limite de upload. Uma miniatura ou conexão lenta libera banda para os demais; voz e áudio da tela têm uma reserva antes do vídeo. A captura acompanha a maior necessidade dos espectadores e reduz o trabalho quando não há ninguém assistindo. Textos priorizam nitidez; jogos priorizam movimento.

Ao abrir outra aba ou voltar ao chat, o vídeo passa para até 360p/5 fps e o áudio continua. Ao voltar à reprodução, a qualidade é restaurada; uma janela flutuante ativa continua solicitando qualidade para seu tamanho. Navegadores sem suporte a redução de resolução por espectador mantêm os limites de banda/FPS e mostram essa limitação no diagnóstico.

**A transmissão trava ou congela quando troco de programa.**
Você está compartilhando **uma janela** e ela foi minimizada: o navegador para de capturar janelas minimizadas. Quando isso acontece, quem assiste vê "⏸ Transmissão pausada", e a imagem volta sozinha quando a janela é restaurada. Para poder trocar de programa à vontade, escolha **"Tela inteira"** na janela do navegador que pede o que compartilhar.

**Jogo aparece preto ou travado.**
Jogos em *tela cheia exclusiva* não podem ser capturados como janela. Coloque o jogo em **"janela sem bordas"** (borderless) e compartilhe a **Tela inteira**.

**Trava quando mais gente assiste.**
Como a chamada é direta entre os navegadores, quem transmite envia **uma cópia para cada pessoa**. Em ⚙️ Configurações, escolha em **"Upload da sua internet"** o valor do seu teste de velocidade. O app distribui a banda entre os espectadores conforme suas necessidades e recupera qualidade gradualmente. Esse valor continua sendo um teto configurado, não um teste de velocidade automático. Se ainda travar, use o perfil **720p · 30 fps**, que gasta menos.

**Aparece "limitado pelo processador".**
Use o perfil **720p · 30 fps**, que exige menos do processador. Fechar outros programas pesados também ajuda.

**Validação das transmissões (desenvolvimento).**
`npm test` cobre o controlador e as regras do servidor. `npm run test:media-browser` abre um teste em `http://127.0.0.1:37914/`: clique em Executar para transmitir canvas/áudio sintéticos entre duas conexões WebRTC reais, conferir resize, modo Economia e parar/retomar. Não acessa câmera, microfone ou tela. Encerre pelo botão e pare o servidor com Ctrl+C. Análise e referências: [transmissões na 0.9](../ANALISE-TRANSMISSOES-0.9.md).

## Online 24h, sem depender do seu PC (recomendado)

O jeito mais estável é alugar um **VPS**: um computador Linux na nuvem, ligado o tempo todo. Um de US$ 4–6 por mês aguenta tranquilo um grupo de amigos (Hetzner, DigitalOcean, Contabo, Vultr…). Escolha **Ubuntu 24.04**.

O script `deploy/instalar-vps.sh` faz tudo sozinho:

- instala o Node.js;
- coloca o Resenhex para ligar sozinho e voltar se cair;
- configura **HTTPS automático**, com um endereço gratuito se você não tiver domínio;
- instala um **servidor TURN**, para a voz conectar até em 4G e em redes de faculdade;
- configura o firewall.

**Passo a passo (do Windows):**

1. Crie o VPS e anote o **IP** e a **senha do root** (o provedor mostra os dois).
2. No GitHub, baixe o projeto em **Code → Download ZIP** e extraia.
3. Abra o **PowerShell** dentro da pasta extraída, onde fica a pasta `discord-clone`, e envie ela para o VPS:
   ```powershell
   scp -r discord-clone root@SEU_IP:/root/resenhex
   ```
4. Entre no VPS e rode o instalador:
   ```powershell
   ssh root@SEU_IP
   ```
   ```bash
   cd /root/resenhex && bash deploy/instalar-vps.sh
   ```
5. O script pede um **domínio**. Se não tiver domínio, aperte Enter: ele usa um endereço gratuito, tipo `https://203-0-113-10.sslip.io`.
6. No fim aparece o endereço do site. Crie sua conta primeiro e mande aos amigos o **convite do seu servidor**, pelo menu **Convidar amigos**.

**Levar contas e mensagens que já existem no seu PC:** pare o servidor no PC durante a cópia, para não perder mensagens enviadas nesse intervalo. Se você usou o link Cloudflare configurado neste PC, os dados estão em `ResenhaCloudflare` dentro de `AppData\Local`, e não na pasta do projeto. No PowerShell, rode:
```powershell
scp "$env:LOCALAPPDATA\ResenhaCloudflare\data.json" root@SEU_IP:/var/lib/resenhex/
scp -r "$env:LOCALAPPDATA\ResenhaCloudflare\uploads" root@SEU_IP:/var/lib/resenhex/
ssh root@SEU_IP "chown -R resenhex:resenhex /var/lib/resenhex && systemctl restart resenhex"
```
Se você rodou `npm start` diretamente, copie o `data.json` e a pasta `uploads` daquela instalação em vez dos caminhos acima.

**Atualizar para uma versão nova:** repita os passos 2 a 4. O script detecta a instalação existente e mantém contas, servidores, mensagens e configurações.

**Se não abrir:** alguns provedores (Hetzner Cloud Firewall, Oracle, AWS) têm um firewall próprio no painel. Libere nele: TCP 80 e 443, TCP/UDP 3478 e UDP 49160–49200.

### Oracle Cloud Free Tier (Ubuntu)

Crie uma instância **Always Free Eligible** com Ubuntu 24.04, IPv4 público e sua chave SSH pública. A imagem Ubuntu da Oracle usa o usuário `ubuntu` e não permite SSH direto como `root`. Envie a pasta para `/home/ubuntu/resenhex` e execute:

```bash
sudo bash /home/ubuntu/resenhex/deploy/instalar-vps.sh --oracle
```

**Atualizar esta instalação pela máquina Windows:** depois de editar o código nesta pasta, execute no PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\atualizar-oracle.ps1
```

O script envia os arquivos do aplicativo para a instância `168.138.227.230`, salva uma cópia dos dados no servidor, executa a atualização e confere o site. Contas, mensagens, arquivos enviados e senha continuam no servidor. Ele inclui alterações em arquivos já conhecidos pelo Git; se você criou arquivos novos, adicione-os ao Git antes de executar. Para outra instância Oracle, passe `-Server NOVO_IP` e `-KeyPath CAMINHO_DA_CHAVE`.

O modo `--oracle` mantém as regras `iptables` da imagem, necessárias para os volumes de disco. **Não ative UFW nessa imagem**: a Oracle alerta que isso pode impedir o reinício da máquina. Além do firewall do sistema, libere no painel da Oracle as regras de entrada TCP 80/443, TCP/UDP 3478 e UDP 49160–49200 (e mantenha TCP 22 para SSH). Ao copiar contas e mensagens, use `ubuntu@SEU_IP` e depois `sudo chown -R resenhex:resenhex /var/lib/resenhex && sudo systemctl restart resenhex` via SSH.

Na primeira instalação, o script também aceita `RESENHEX_PASSWORD_FILE=/caminho/privado` para reutilizar a senha de cadastro de uma instalação anterior sem digitá-la no terminal. O arquivo deve ser legível apenas pelo administrador do servidor.

## Colocando online a partir do seu PC

Navegadores **só liberam microfone e captura de tela em HTTPS** (ou em `localhost`). Então, para os amigos acessarem, o servidor precisa estar em HTTPS. Algumas opções:

1. **Rápido, rodando no seu PC:** deixe `npm start` rodando e exponha com um túnel HTTPS:
   - [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/): `cloudflared tunnel --url http://localhost:3000`
   - ou [ngrok](https://ngrok.com): `ngrok http 3000`

   Mande o link `https://…` gerado para os amigos.

2. **Sempre online:** hospede em um serviço que roda Node.js e já dá HTTPS (Render, Railway, Fly.io) ou numa VPS com Caddy/Nginx na frente. Comando de start: `npm start`. A porta vem da variável `PORT`.

Depois de criar sua conta, mande aos amigos o **link de convite do servidor**, disponível no menu do nome → **Convidar amigos**. O endereço do site sozinho permite criar uma conta, mas não concede acesso aos seus servidores.

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `PORT` | Porta HTTP (padrão `3000`) |
| `HOST` | Endereço de escuta do servidor (padrão `0.0.0.0`; no VPS, `127.0.0.1` atrás do Caddy) |
| `DATA_FILE` | Onde salvar contas, cargos, canais e mensagens (padrão `data.json`) |
| `UPLOAD_DIR` | Pasta dos arquivos enviados no chat (padrão `uploads/`) |
| `MAX_UPLOAD_MB` | Tamanho máximo de cada arquivo (padrão `50`) |
| `TRUST_PROXY` | `1` quando roda atrás de um proxy HTTPS (Caddy, Nginx), para ler o IP real de quem conecta. O instalador do VPS já define |
| `TURN_URL` | Servidor(es) TURN, separados por vírgula, ex.: `turn:meu-turn.com:3478` |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Credenciais do TURN |
| `DOWNLOAD_DIR` | Pasta com o instalador do app para Windows e o `latest.yml` (padrão `downloads/`; o instalador do VPS já define) |
| `MS_STORE_ID` | ID do app na Microsoft Store (ex.: `9NBLGGH4R32N`). Com ele, a página `/baixar` entrega o instalador oficial da Microsoft |
| `KLIPY_KEY` | Chave da API de GIFs do [KLIPY](https://partner.klipy.com/api-keys). Com ela aparece o botão de GIF no chat; a busca sai do navegador de quem usa (regra do KLIPY), então a chave chega aos clientes logados. A chave de teste faz 100 buscas por hora; peça a de produção no painel deles |

### Voz não conecta para alguém? Configure um TURN

Na maioria das redes domésticas o WebRTC conecta direto usando só o STUN do Google (já configurado). Em algumas redes (4G, redes de faculdade/empresa, NAT simétrico) a conexão direta falha, e aí é preciso um servidor **TURN** para retransmitir. Opções:

- Instalar o [coturn](https://github.com/coturn/coturn) numa VPS
- Usar um serviço pronto (ex.: Metered, Twilio, Cloudflare Calls TURN)

Depois é só preencher `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`.

## Personalizando

- Canais e cargos: pela ⚙️ de configurações do servidor, direto no app
- Nome e ícone de cada servidor: menu do nome → **Configurações do servidor**. Cores do tema: `public/style.css` (as cores ficam no topo do CSS, em `:root`)
- **Backup:** tudo fica em `data.json`, e os arquivos enviados ficam na pasta `uploads/`. Copie os dois para guardar. A cada início o servidor também guarda uma cópia em `data.json.bak`. Se o `data.json` estiver corrompido (ex.: o PC desligou enquanto salvava), ele é guardado como `data.json.corrompido-…` e os dados são recuperados dessa cópia automaticamente. Se você apagar o `data.json`, o servidor começa do zero e a próxima conta criada vira a dona.

## Proteções

- **Força bruta:** depois de 5 senhas erradas seguidas, aquele nome fica bloqueado por 30 segundos para aquele IP. O tempo dobra a cada nova tentativa errada, até 10 minutos.
- **Flood:** no máximo 10 mensagens a cada 5 segundos por pessoa, 20 reações a cada 5 segundos e 20 arquivos por minuto.
- **Cadastros:** no máximo 20 contas por hora vindas do mesmo IP.
- **Voz em primeiro lugar:** quando a internet aperta, o vídeo e a tela perdem qualidade antes da voz. A voz também usa redundância (RED), então não "picota" quando se perdem pacotes.

## Estrutura

```
discord-clone/
├── server.js          # Express + Socket.IO: contas, cargos/permissões, moderação, chat e sinalização WebRTC
├── downloads.js       # /download (instalador e atualizações do app de Windows) e o link fixo do instalador
├── dj.js              # DJ de cada sala de voz: fila, música atual e o relógio que sincroniza todo mundo
├── youtube.js         # busca no YouTube para o DJ (o áudio toca no player oficial de cada pessoa)
├── mudae.js           # Mudae: sorteio, limites de rolls e casamentos, harem (personagens em mudae-catalogo.json)
├── desktop/           # app para Windows (Electron): janela, bandeja, push-to-talk global, escolha de tela, atualização
└── public/
    ├── index.html     # layout (servidores, canais, chat, palco de voz, membros)
    ├── icons.js       # ícones SVG e o logo do Resenhex
    ├── style.css      # tema escuro estilo Discord
    ├── music.js       # DJ na chamada: player do YouTube sincronizado, painel de busca e fila, comandos /play
    ├── mudae.js       # respostas do Mudae no chat: cards, linhas compactas do Salão, $im e $tu
    ├── mudae-salao.js # tela do Salão do Mudae: roleta, Mesa ao vivo, álbum, ranking e presença
    └── app.js         # lógica do cliente: chat, menus de moderação, configurações, WebRTC (voz/tela)
```

## Limitações conhecidas

- Um único servidor (dá para ter vários canais, mas não vários "servidores")
- Sem mensagens diretas (DM), fotos de perfil ou status ("jogando X")
- No navegador, o push-to-talk só funciona com a janela do Resenhex em foco. No app para Windows ele funciona em segundo plano.
- Quem tiver o link de um arquivo enviado consegue abri-lo, mesmo que o arquivo esteja num canal privado. Os links são aleatórios e impossíveis de adivinhar.
- O servidor guarda as últimas 300 mensagens de cada canal. As mais antigas, e os arquivos delas, são apagadas.
- Não dá para trocar senha nem nome pela interface
- Chamada em malha P2P: boa para grupos pequenos (até ~6 a 8 pessoas por sala)
- DJ: no celular, com a tela bloqueada, o navegador costuma pausar o player do YouTube. Às vezes o YouTube mostra um anúncio para alguém; essa pessoa fica uns segundos atrás e depois volta para o ponto certo. Quem usa caixa de som em vez de fone pode deixar a música vazar pelo microfone.
