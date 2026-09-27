# Resenha: um clone do Discord

Servidor próprio para você e seus amigos, com:

- **Contas** com usuário e senha (login automático depois da primeira vez)
- **Chat de texto** em canais, com histórico salvo, "fulano está digitando…", **editar** (✏️ ou seta ↑) e **apagar** mensagens
- **Imagens e arquivos**: botão ＋, **Ctrl+V** para colar um print, ou arrastar para o chat. Imagens e vídeos aparecem no chat.
- **Menções** `@nome`, `@cargo` e `@everyone`, com autocompletar ao digitar `@`
- **Não lidas**: canal em negrito, bolinha vermelha com o número de menções, contador no título da aba e **notificação na área de trabalho**
- **Responder** mensagens (↩️) e **reagir** com emoji (😀)
- **Formatação**: `**negrito**`, `*itálico*`, `__sublinhado__`, `~~riscado~~`, `` `código` ``, blocos ```` ``` ````, `> citação` e `||spoiler||`
- **Chamadas de voz** em salas, com indicador verde de quem está falando e **sons** de entrar e sair
- **Câmera** e **compartilhamento de tela** (até 1080p/30fps, com áudio da aba/sistema quando o navegador permite), dá para usar os dois ao mesmo tempo; clique na tela para abrir em tela cheia
- **Mutar / ensurdecer** (também pelos atalhos `Ctrl+Shift+M` / `Ctrl+Shift+D`) e **push-to-talk** (apertar uma tecla para falar)
- **Volume individual** e **mutar para mim** (só afeta o que você ouve)
- **Cargos e permissões** estilo Discord, com hierarquia
- **Moderação**: silenciar e ensurdecer no servidor, mover e desconectar da voz, castigo (timeout), expulsar e banir
- **Canais privados** (visíveis só para certos cargos), além de criar, renomear e apagar canais
- Escolha de **microfone e saída de áudio**, com supressão de ruído
- Lista de membros agrupada por cargo, com online e offline

## Cargos e moderação

- **A primeira conta criada vira a dona do servidor 👑.** A dona tem todas as permissões e ninguém pode agir contra ela. Por isso, crie a sua conta antes de mandar o link para os amigos.
- Clique (ou clique com o botão direito) em qualquer membro, na lista da direita, nos canais de voz ou no nome numa mensagem, para abrir o menu com as ações que você tem permissão de usar.
- A **⚙️ ao lado do nome do servidor** abre as configurações do servidor. Ela só aparece para quem pode gerenciar cargos, canais ou banimentos:
  - **Cargos:** criar, renomear, escolher cor, "mostrar separado na lista", marcar permissões e subir ou descer na hierarquia
  - **Canais:** criar canais de texto ou voz, renomear, apagar e tornar privado para certos cargos
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
- **Expulsar:** a pessoa é desconectada e precisa entrar de novo. **Banir:** ela não consegue mais entrar até ser desbanida.

Tudo isso é verificado **no servidor**, então ninguém burla mexendo no navegador. A única exceção é o silêncio na voz: como o áudio vai direto entre os navegadores, quem foi silenciado ainda envia áudio se modificar o próprio navegador, mas os navegadores dos outros deixam de tocar esse áudio.

## Como funciona

```
Navegador ──Socket.IO──► server.js (chat + sinalização)
    │
    └──── WebRTC direto (voz e tela) ────► navegador dos amigos
```

O servidor só repassa as mensagens de texto e a "sinalização" (quem entrou na sala, ofertas e respostas WebRTC). O áudio e o vídeo vão **direto entre os navegadores** (malha P2P). Por isso o servidor pode ser pequeno e barato. O limite prático fica em torno de **6 a 8 pessoas por sala** (cada pessoa envia o áudio/tela para cada uma das outras). Para mais gente do que isso seria preciso um SFU (ex.: LiveKit ou mediasoup).

## Rodando localmente

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
cd discord-clone
npm install
npm start
```

Abra <http://localhost:3000> em duas abas (ou dois navegadores) para testar.

## Colocando online para os amigos

Navegadores **só liberam microfone e captura de tela em HTTPS** (ou em `localhost`). Então, para os amigos acessarem, o servidor precisa estar em HTTPS. Algumas opções:

1. **Rápido, rodando no seu PC:** deixe `npm start` rodando e exponha com um túnel HTTPS:
   - [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/): `cloudflared tunnel --url http://localhost:3000`
   - ou [ngrok](https://ngrok.com): `ngrok http 3000`

   Mande o link `https://…` gerado para os amigos.

2. **Sempre online:** hospede em um serviço que roda Node.js e já dá HTTPS (Render, Railway, Fly.io) ou numa VPS com Caddy/Nginx na frente. Comando de start: `npm start`. A porta vem da variável `PORT`.

Em qualquer caso, **defina uma senha do servidor**. Ela é pedida na hora de criar conta, para ninguém de fora entrar:

```bash
ACCESS_PASSWORD=minhasenha npm start
```

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `PORT` | Porta HTTP (padrão `3000`) |
| `ACCESS_PASSWORD` | Senha exigida para criar conta (padrão: sem senha) |
| `DATA_FILE` | Onde salvar contas, cargos, canais e mensagens (padrão `data.json`) |
| `UPLOAD_DIR` | Pasta dos arquivos enviados no chat (padrão `uploads/`) |
| `MAX_UPLOAD_MB` | Tamanho máximo de cada arquivo (padrão `25`) |
| `TURN_URL` | Servidor(es) TURN, separados por vírgula, ex.: `turn:meu-turn.com:3478` |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Credenciais do TURN |

### Voz não conecta para alguém? Configure um TURN

Na maioria das redes domésticas o WebRTC conecta direto usando só o STUN do Google (já configurado). Em algumas redes (4G, redes de faculdade/empresa, NAT simétrico) a conexão direta falha, e aí é preciso um servidor **TURN** para retransmitir. Opções:

- Instalar o [coturn](https://github.com/coturn/coturn) numa VPS
- Usar um serviço pronto (ex.: Metered, Twilio, Cloudflare Calls TURN)

Depois é só preencher `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`.

## Personalizando

- Canais e cargos: pela ⚙️ de configurações do servidor, direto no app
- Nome do servidor ("Resenha") e cores do tema: `public/index.html` e `public/style.css`
- **Backup:** tudo fica em `data.json`, e os arquivos enviados ficam na pasta `uploads/`. Copie os dois para guardar. Se você apagar o `data.json`, o servidor começa do zero e a próxima conta criada vira a dona.

## Estrutura

```
discord-clone/
├── server.js          # Express + Socket.IO: contas, cargos/permissões, moderação, chat e sinalização WebRTC
└── public/
    ├── index.html     # layout (servidores, canais, chat, palco de voz, membros)
    ├── style.css      # tema escuro estilo Discord
    └── app.js         # lógica do cliente: chat, menus de moderação, configurações, WebRTC (voz/tela)
```

## Limitações conhecidas

- Um único servidor (dá para ter vários canais, mas não vários "servidores")
- Sem mensagens diretas (DM), fotos de perfil ou status ("jogando X")
- Push-to-talk só funciona com a janela do Resenha em foco (limite do navegador)
- Quem tiver o link de um arquivo enviado consegue abri-lo, mesmo que o arquivo esteja num canal privado. Os links são aleatórios e impossíveis de adivinhar.
- O servidor guarda as últimas 300 mensagens de cada canal. As mais antigas, e os arquivos delas, são apagadas.
- Não dá para trocar senha nem nome pela interface
- Chamada em malha P2P: boa para grupos pequenos (até ~6 a 8 pessoas por sala)
