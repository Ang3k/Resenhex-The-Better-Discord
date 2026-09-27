# Resenha: um clone do Discord

Servidor próprio para você e seus amigos, com:

- **Chat de texto** em canais (`#geral`, `#jogos`, `#links`), histórico salvo, links clicáveis e aviso de "fulano está digitando…"
- **Chamadas de voz** em salas (`Sala 1`, `Sala 2`, `AFK`), com indicador verde de quem está falando
- **Compartilhamento de tela** (até 1080p/30fps, com áudio da aba/sistema quando o navegador permite); clique na tela para abrir em tela cheia
- **Mutar / ensurdecer** (também pelos atalhos `Ctrl+Shift+M` / `Ctrl+Shift+D`)
- Escolha de **microfone e saída de áudio**, com supressão de ruído
- Lista de quem está online e em qual sala
- **Senha de acesso** opcional

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

Em qualquer caso, **defina uma senha** para ninguém de fora entrar:

```bash
ACCESS_PASSWORD=minhasenha npm start
```

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `PORT` | Porta HTTP (padrão `3000`) |
| `ACCESS_PASSWORD` | Senha exigida na entrada (padrão: sem senha) |
| `DATA_FILE` | Onde salvar o histórico do chat (padrão `data.json`) |
| `TURN_URL` | Servidor(es) TURN, separados por vírgula, ex.: `turn:meu-turn.com:3478` |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Credenciais do TURN |

### Voz não conecta para alguém? Configure um TURN

Na maioria das redes domésticas o WebRTC conecta direto usando só o STUN do Google (já configurado). Em algumas redes (4G, redes de faculdade/empresa, NAT simétrico) a conexão direta falha, e aí é preciso um servidor **TURN** para retransmitir. Opções:

- Instalar o [coturn](https://github.com/coturn/coturn) numa VPS
- Usar um serviço pronto (ex.: Metered, Twilio, Cloudflare Calls TURN)

Depois é só preencher `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`.

## Personalizando

- Nomes dos canais: `TEXT_CHANNELS` e `VOICE_CHANNELS` no topo de `server.js`
- Nome do servidor ("Resenha") e cores: `public/index.html` e `public/style.css`

## Estrutura

```
discord-clone/
├── server.js          # Express + Socket.IO: chat, presença e sinalização WebRTC
└── public/
    ├── index.html     # layout (servidores, canais, chat, palco de voz, membros)
    ├── style.css      # tema escuro estilo Discord
    └── app.js         # lógica do cliente: chat, WebRTC (voz/tela), dispositivos
```

## Limitações conhecidas

- Não há contas: cada pessoa escolhe um nome ao entrar (a senha do servidor é compartilhada)
- Um único servidor com canais fixos (não dá para criar canais pela interface)
- Sem envio de arquivos/imagens, reações ou mensagens diretas
- Chamada em malha P2P: boa para grupos pequenos (até ~6 a 8 pessoas por sala)
