# Guia para agentes de IA

Leia este guia antes de mexer no código. Ele diz onde cada coisa fica, como validar uma mudança e o que não pode quebrar. O manual completo do produto (recursos, deploy, variáveis de ambiente) está em [`discord-clone/README.md`](../discord-clone/README.md).

## O que é

O Resenhex é uma plataforma de chat, voz, vídeo e compartilhamento de tela inspirada no Discord, usada por um grupo de amigos e hospedada em uma VPS da Oracle.

- **Servidor:** Node.js (≥ 18; produção usa 22), Express 5 e Socket.IO, em CommonJS. Os dados ficam em um único arquivo JSON (`DATA_FILE`), sem banco de dados.
- **Cliente web:** HTML, CSS e JavaScript puros, sem framework e sem bundler. Os scripts entram por `<script>` no `public/index.html` e conversam por variáveis globais em `window`.
- **Apps:** o de Windows (Electron, em `desktop/`) e o de Android (WebView em Java, em `android/`) apenas abrem o site, então mudanças no site chegam a eles pelo deploy normal.
- **Idioma:** português do Brasil na interface, na documentação, no CHANGELOG e nas mensagens de commit. Os nomes no código são, na maioria, em inglês.

## Mapa do repositório

```
/
├── README.md               # apresentação do projeto
├── docs/                   # documentação que não vai para o servidor de produção
│   ├── GUIA-AGENTES.md     # este guia
│   ├── ROADMAP.md          # ideias e próximos passos
│   ├── VOZ-IA.md           # vozes de personagens por IA (retiradas do app na 1.4.0; ficou o histórico)
│   ├── planos/             # planos de trabalho datados
│   └── relatorios/         # relatórios datados; as evidências (JSON/PNG) ficam na pasta de mesmo nome
└── discord-clone/          # o aplicativo: tudo o que é publicado sai daqui
    ├── server.js           # ponto de entrada do servidor (rotas, sockets, persistência, permissões)
    ├── server/             # módulos do servidor, ligados pelo server.js
    ├── public/             # cliente web, servido como arquivos estáticos
    ├── test/               # testes (node:test)
    ├── tools/              # geradores e ferramentas de desenvolvimento
    ├── deploy/             # instalação na VPS, atualização da Oracle e publicação dos apps
    ├── desktop/            # app de Windows (Electron), com package.json e testes próprios
    ├── android/            # app de Android (Gradle)
    ├── CHANGELOG.md        # histórico de versões (o mesmo conteúdo de public/changelog.js)
    └── README.md           # manual completo
```

## Onde mexer em cada assunto

Caminhos relativos a `discord-clone/`.

| Assunto | Servidor | Cliente | Testes |
|---|---|---|---|
| Contas, login e senha | `server.js` (`auth`, `account:password`) | `public/app.js`, `public/landing.js` | `test/account-password.test.js` |
| Servidores, convites, cargos e moderação | `server/communities.js`, `server/channels.js`, `server.js` | `public/app.js`, `public/channel-navigation.js`, `public/settings.js` | `test/servers.test.js`, `test/communities.test.js`, `test/channels.test.js`, `test/server-settings.test.js` |
| Amigos e mensagens diretas | `server.js` | `public/app.js` | `test/friends-dm.test.js` |
| Chamadas privadas | `server/dm-calls.js` | `public/dm-call.js` | `test/dm-call.test.js`, `test/dm-calls.test.js` |
| Voz, câmera e tela (P2P) | `server.js` (sinalização) | `public/app.js`, `public/media-policy.js`, `public/media-session.js` | `test/media.test.js` |
| Servidor de mídia LiveKit (SFU) | `server/media-sfu.js`, `deploy/instalar-sfu.sh` | `public/media-sfu.js` | `test/media-sfu.test.js`, `test/media-sfu-server.test.js` |
| Som do computador na transmissão | — | `public/own-audio*.js` | `test/own-audio.test.js` |
| Efeitos de voz | — | `public/voice-fx.js`, `public/voice-fx-*.mjs`, `public/voice-fx-assets/`, `public/vendor/autotalent/` | `test/voice-chosen.test.js` |
| DJ (YouTube) | `server/dj.js`, `server/youtube.js` | `public/music.js` | `test/dj.test.js`, `test/dj-server.test.js` |
| Mudae | `server/mudae.js`, `server/mudae-catalogo.json` | `public/mudae.js`, `public/mudae-salao.js` | `test/mudae*.test.js` |
| Soundboard | `server/soundboard.js` | `public/sounds.js`, `public/sfx/` | `test/profile-media.test.js` |
| Foto, banner e fundo do perfil | `server/avatar.js` | `public/photo-editor.js`, `public/profile*.css` | `test/avatar.test.js`, `test/banner.test.js`, `test/profile-*.test.js` |
| Prévias de links | `server/link-preview.js` | `public/app.js` | — |
| GIFs (KLIPY) | `server/gifs.js` | `public/gif-picker.js` | `test/gifs.test.js` |
| Jogos detectados e overlay | `server/games.js` | `desktop/lib/game-detect.js`, `public/overlay.js` | `test/games.test.js` |
| Downloads e atualização dos apps | `server/downloads.js` | `public/download.js`, `public/baixar.html` | `test/downloads.test.js` |
| Propor Melhorias | `server/feedback.js` | `public/feedback.js` | `test/feedback.test.js` |
| Novidades (changelog no app) | — | `public/changelog.js` | — |

`server.js` (~2.200 linhas) e `public/app.js` (~6.500 linhas) são grandes: procure pelo nome do evento ou da função antes de ler.

## Comandos

Rode dentro de `discord-clone/`.

| Comando | Para quê |
|---|---|
| `npm install` | Dependências do servidor e dos testes |
| `npm start` | Servidor em `http://localhost:3000`. Cria `data.json` e `uploads/` na pasta (ignorados pelo Git) |
| `npm run check` | `node --check` em `server.js`, `server/` e `public/`. Arquivos novos entram sozinhos |
| `npm test` | Todos os testes (`node --test`), cerca de 2 minutos |
| `node --test test/mudae.test.js` | Um arquivo de teste só |
| `npm run test:voice-chosen` | Testes dos efeitos de voz |
| `npm run test:media-browser` | Teste interativo de transmissão no navegador (abre uma página e espera um clique) |

O `npm test` usa a descoberta padrão do Node, então também roda `desktop/test/` e `deploy/smoke-test.js`. Falhas que não indicam erro no seu código:

- `desktop/test/lib.test.js` precisa de `npm install` dentro de `desktop/` (módulo nativo `uiohook-napi`).
- `deploy/smoke-test.js` pode estourar o tempo com a máquina carregada pelos outros testes; isolado (`node deploy/smoke-test.js`), ele passa.
- Os testes que sobem o servidor sorteiam a porta e, raramente, colidem (`EADDRINUSE`). Rode o arquivo de novo.

App de Windows, em `desktop/`: `npm install`, `npm start` (use `RESENHEX_URL=http://localhost:3000/` para o servidor local) e `npm test`.

## Convenções

- **Não renomeie nem mova arquivos de `public/`.** Os caminhos são URLs usadas pelo `index.html`, pelos apps de Windows e Android já instalados e pelo cache dos navegadores.
- **Script novo no cliente:** inclua no `public/index.html` na ordem certa. Se o app depende dele ao abrir, acrescente-o também à lista de arquivos de `test/server-ui.test.js`, que monta a página no jsdom.
- **Módulo novo no servidor:** crie em `server/`, exporte uma função de fábrica (como `createDj` e `createMudae`) e ligue-o no `server.js`. Os testes importam o módulo direto ou sobem o `server.js` com `DATA_FILE`, `UPLOAD_DIR` e `PORT` temporários.
- **Permissões e limites são verificados no servidor.** O cliente só esconde botões.
- **Poucas dependências:** prefira os módulos nativos do Node.
- **Commits:** em português, com o assunto no formato `v1.4.5: resumo` quando há versão nova.

## Versão nova do site

1. Aumente `version` em `discord-clone/package.json` e `discord-clone/package-lock.json` (as duas ocorrências do topo).
2. Acrescente a versão no começo de `discord-clone/CHANGELOG.md` e de `discord-clone/public/changelog.js`, com o mesmo conteúdo.
3. Atualize o selo de versão do `README.md` da raiz.
4. Publicação: `deploy/atualizar-oracle.ps1`, que roda no Windows do mantenedor com a chave SSH dele. **Não rode scripts de deploy ou publicação sem pedido explícito.** O script envia só os arquivos de `discord-clone/` conhecidos pelo Git (menos `desktop/`) e recusa arquivos novos fora do Git.

Os apps têm versões próprias e só precisam ser publicados quando suas pastas mudam: `desktop/package.json` com `deploy/publicar-app.ps1` e `android/app/build.gradle` (`versionCode`/`versionName`) com `deploy/publicar-android.ps1`.

## Armadilhas

- **`server/mudae-catalogo.json` tem cerca de 33 MB** (um personagem por linha). Não abra o arquivo inteiro; busque com limite de resultados. Ele é gerado por `tools/mudae-catalogo.js`; as chaves das APIs (`tools/mudae-chaves.json`) e o cache (`tools/mudae-cache/`) ficam fora do Git.
- `public/emoji-data.json` é gerado por `tools/emoji-data.js`, e os ícones dos apps por `tools/icones-app.js`.
- **Tudo em `discord-clone/` (menos `desktop/`) vai para o servidor de produção.** Relatórios, planos e evidências ficam em `docs/`, na raiz.
- `public/gacha/` é a cena 3D antiga do Salão do Mudae. Ela não é mais carregada, mas continua testada (`test/gacha-*.test.mjs`) e serve de referência.
- As vozes de personagens por IA foram retiradas na 1.4.0. `desktop/voice-engine/`, os scripts de voz de `desktop/tools/` e `docs/VOZ-IA.md` guardam o experimento, e o pacote do app exclui `lib/voice-*`.
- O `.gitignore` da raiz mantém `AGENTS.md`, `CLAUDE.md`, `.claude/` e `.codex/` locais. Não os versione.

## Outros documentos

- [`discord-clone/README.md`](../discord-clone/README.md): recursos, deploy na VPS/Oracle, variáveis de ambiente e solução de problemas.
- [`discord-clone/CHANGELOG.md`](../discord-clone/CHANGELOG.md): o que mudou em cada versão.
- [`discord-clone/deploy/SFU.md`](../discord-clone/deploy/SFU.md): ativação do LiveKit.
- [`discord-clone/desktop/store/LOJA.md`](../discord-clone/desktop/store/LOJA.md): textos e respostas da Microsoft Store.
- [`discord-clone/tools/voice-chosen/README.md`](../discord-clone/tools/voice-chosen/README.md): laboratório dos efeitos de voz.
- [`ROADMAP.md`](ROADMAP.md), [`planos/`](planos/) e [`relatorios/`](relatorios/): planejamento e histórico.
