# Resenhex na Microsoft Store

Guia para preencher o envio no [Partner Center](https://partner.microsoft.com/dashboard/apps-and-games/overview). Cada seção abaixo corresponde a uma página do envio.

## Identidade do pacote

Já estão em `desktop/package.json` (`build.appx`). Os valores vêm de **Gerenciamento de produto → Identidade do produto**.

| Campo | Valor |
|---|---|
| Package/Identity/Name | `AngelD.Mansilla.Resenhex` |
| Package/Identity/Publisher | `CN=4BC4D576-D0B2-432B-9D0E-7075FE88F1BE` |
| Package/Properties/PublisherDisplayName | `Angel D. Mansilla` |

Para gerar o pacote, rode na pasta `desktop/`:

```powershell
npm run dist:store
```

O pacote sai em `desktop/dist/Resenhex-<versão>.appx`. Ele não precisa de assinatura, porque a Microsoft assina na publicação. Em cada envio novo, aumente `version` em `desktop/package.json`: a loja recusa um pacote com a mesma versão de um envio anterior.

## Preço e disponibilidade

- **Mercados:** todos (ou só o Brasil, se preferir).
- **Visibilidade:** *Público, disponível e pesquisável na Store*. Essa opção garante que o instalador pelo site (Store Web Installer) funcione. A outra opção, "disponível, mas não pesquisável", esconde o app da busca, mas pode limitar o instalador pelo site.
- **Preço:** gratuito.

## Propriedades

- **Categoria:** Social
- **Política de privacidade:** `https://resenhex.duckdns.org/privacidade`
- **Site:** `https://resenhex.duckdns.org/baixar`
- **Contato de suporte:** o seu e-mail
- **Requisitos do sistema:** marque *Microfone* como recomendado. Ele não é obrigatório, porque dá para usar só o chat de texto.
- **Declarações do produto:** marque que o app usa a internet para funcionar.

## Classificação etária (questionário IARC)

- Tipo de app: **Rede social ou comunicação**.
- Os usuários podem conversar entre si e compartilhar conteúdo: **sim** (texto, voz, vídeo e imagens).
- Compartilha a localização do usuário: **não**.
- Compras digitais: **não**.
- Violência, sexo, drogas ou apostas no próprio app: **não**. O conteúdo é gerado pelos usuários.

## Pacotes

- Envie `desktop/dist/Resenhex-1.0.0.appx`.
- **Família de dispositivos:** apenas *Windows 10/11 Desktop*.

### Capacidade restrita `runFullTrust`

A loja pede uma justificativa. Cole este texto:

> Resenhex is an Electron desktop app (Win32 packaged as MSIX), so it requires runFullTrust to run. It uses full trust for: a global push-to-talk key that works while a game is focused (only the key chosen by the user is observed), a system tray icon, taskbar badges for mentions, and a screen/window picker for screen sharing with system audio.

## Página na loja (idioma: Português do Brasil)

**Nome:** Resenhex

**Descrição:**

> O Resenhex é o lugar da sua galera: chat de texto, chamadas de voz, câmera e transmissão de tela, tudo num só app.
>
> Crie o seu servidor, convide os amigos com um link e organize tudo em canais de texto e de voz. Entre numa sala para conversar e transmita um jogo ou a tela inteira para quem está na chamada, com o som do computador junto.
>
> Feito para quem joga:
> • Push-to-talk que funciona com o jogo aberto, sem precisar voltar para o app
> • Supressão de ruído com IA, que tira o barulho do teclado, do ventilador e da rua
> • Transmissão de tela com escolha de janela ou monitor e som do computador sem eco
> • Menções na barra de tarefas e o app na bandeja, sem ocupar espaço
>
> E tudo o que um chat precisa: mensagens diretas, amigos, reações, respostas, imagens e arquivos, cargos e permissões, moderação, temas e muito mais.
>
> É o mesmo Resenhex do site, com a mesma conta. As novidades chegam sozinhas.

**Novidades desta versão:**

> Primeira versão na Microsoft Store: instalação sem avisos e atualizações automáticas pela loja.

**Recursos do produto** (um por linha):

- Chat de texto com canais, mensagens diretas, reações e respostas
- Chamadas de voz com supressão de ruído por IA
- Câmera e transmissão de tela com som do computador
- Push-to-talk com o app em segundo plano, inclusive em jogos
- Servidores com convites, cargos e moderação
- Menções na barra de tarefas e app na bandeja

**Descrição curta:** Chat, voz e transmissão de tela para você e seus amigos.

**Palavras-chave** (até 7): chat, voz, amigos, jogos, push-to-talk, transmissão de tela, servidor

**Capturas de tela** (pasta `desktop/store/capturas/`, na ordem):

1. `1-conversa.png`: Converse com a galera em canais de texto.
2. `2-chamada.png`: Chamadas de voz com todo mundo junto.
3. `3-voz-e-video.png`: Supressão de ruído com IA e ajustes de voz.

**Logotipo da loja (1:1):** `desktop/store/logo-1080.png`

**Direitos autorais:** © 2026 Angel D. Mansilla

## Opções de envio: notas para a certificação

Os testadores da Microsoft leem em inglês. Cole este texto:

> Resenhex is a desktop client for a chat/voice service hosted at https://resenhex.duckdns.org.
> To test: click "Registre-se" (Sign up) on the login screen and create any username and password. A new account starts without servers, so click the green "+" in the left server bar → "Criar meu servidor" (Create my server) to get text and voice channels. Voice channels need a microphone.
> The app is a single window that loads the service's web UI. Desktop-only features: global push-to-talk (Settings → Acessibilidade e atalhos → Modo de entrada), a screen/window picker when sharing the screen, a tray icon, and taskbar badges for mentions. "Start with Windows" is a StartupTask that is off by default and can be turned on in Settings → Apps → Startup.

## Depois da aprovação

1. Copie o **ID da Store** (12 caracteres, começa com `9`). Ele aparece em **Gerenciamento de produto → Identidade do produto**.
2. No servidor, adicione `MS_STORE_ID=<ID>` em `/etc/resenhex.env` e reinicie o serviço (`sudo systemctl restart resenhex`).
3. A página `/baixar` passa a baixar o instalador oficial da Microsoft, sem o aviso do Windows. O `.exe` continua disponível como opção.
