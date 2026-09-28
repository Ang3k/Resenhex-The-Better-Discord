# Resenhex

**Versão 0.6** · veja o que mudou em cada versão no [CHANGELOG.md](CHANGELOG.md) ou em **Novidades**, dentro do app.

Plataforma própria de chat e voz para você e seus amigos, inspirada no Discord. Vem com o servidor **Resenha** pronto para usar, com:

- **Contas** com usuário e senha (login automático depois da primeira vez)
- **Reconexão automática**: se a internet ou o servidor cair, o app volta sozinho, sem recarregar a página, busca as mensagens perdidas e te coloca de volta na chamada
- **Chat de texto** em canais, com histórico salvo, "fulano está digitando…", **editar** (✏️ ou seta ↑) e **apagar** mensagens
- **Imagens e arquivos**: botão ＋, **Ctrl+V** para colar um print, ou arrastar para o chat. Imagens e vídeos aparecem no chat.
- **Menções** `@nome`, `@cargo` e `@everyone`, com autocompletar ao digitar `@`
- **Não lidas**: canal em negrito, bolinha vermelha com o número de menções, contador no título da aba e **notificação na área de trabalho**
- **Responder** mensagens (↩️) e **reagir** com emoji (😀)
- **Formatação**: `**negrito**`, `*itálico*`, `__sublinhado__`, `~~riscado~~`, `` `código` ``, blocos ```` ``` ````, `> citação` e `||spoiler||`
- **Chamadas de voz** em salas, com indicador verde de quem está falando e **sons** de entrar e sair
- **Câmera** e **compartilhamento de tela** com perfis de qualidade (720p 30 fps, 1080p 30 fps e 1080p 60 fps), áudio do sistema e estatísticas ao vivo; dá para usar câmera e tela ao mesmo tempo; clique na tela para abrir em tela cheia
- **Efeitos sonoros (soundboard)**: botão 🎵 na barra da chamada toca grilo 🦗, trovão ⛈️, aplausos, ba dum tss e outros para todos da sala. Tem permissão própria ("Usar efeitos sonoros") e limite contra spam. Quem não quiser ouvir silencia no menu do 🎵 ou em ⚙️ Configurações, onde também ajusta o volume
- **Mutar / ensurdecer** (botões na barra da chamada e no painel do usuário, também pelos atalhos `Ctrl+Shift+M` / `Ctrl+Shift+D`) e **push-to-talk** (apertar uma tecla para falar)
- **Volume individual** e **mutar para mim** (só afeta o que você ouve)
- **Cargos e permissões** estilo Discord, com hierarquia
- **Moderação**: silenciar e ensurdecer no servidor, mover e desconectar da voz, castigo (timeout), expulsar e banir
- **Canais privados** (visíveis só para certos cargos), além de criar, renomear e apagar canais
- Escolha de **microfone e saída de áudio**, com supressão de ruído
- Lista de membros agrupada por cargo, com online e offline (dá para esconder pelo botão no topo)
- Interface no estilo Discord: ícones vetoriais, dicas ao passar o mouse, categorias recolhíveis, divisores de data, menu do servidor (clique em "Resenha") e controles da chamada na parte de baixo da tela

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
| 720p · 30 fps | Leve, bom para internet fraca |
| 1080p · 30 fps | Nítido, uso geral (padrão) |
| 1080p · 60 fps | Fluido, para jogos (usa mais internet; H.264) |

**Controles da transmissão** (como no Discord). Passe o mouse sobre uma transmissão para ver:

- 🔊 **volume próprio da transmissão**, separado da voz da pessoa, e botão para silenciá-la;
- 📌 **fixar**, que deixa o bloco em destaque e os outros em miniatura (funciona também com a câmera ou o avatar de qualquer pessoa);
- **janela flutuante** (picture-in-picture), para continuar vendo enquanto usa outro programa;
- **tela cheia**;
- **parar de assistir**, que desliga o vídeo só para você e economiza processamento. Para voltar, use "Assistir transmissão".

Atalhos: **clique** fixa ou solta, **clique duplo** abre em tela cheia e o **clique direito** mostra todas as opções num menu.

No canto da transmissão aparecem **resolução, fps, taxa e codec**. Para quem transmite aparece também quantas pessoas estão assistindo. Se o problema durar alguns segundos, aparece ⚠️ *limitado pela internet* ou ⚠️ *limitado pelo processador*.

**A transmissão trava ou congela quando troco de programa.**
Você está compartilhando **uma janela** e ela foi minimizada: o navegador para de capturar janelas minimizadas. Quando isso acontece, quem assiste vê "⏸ Transmissão pausada", e a imagem volta sozinha quando a janela é restaurada. Para poder trocar de programa à vontade, escolha **"Tela inteira"** na janela do navegador que pede o que compartilhar.

**Jogo aparece preto ou travado.**
Jogos em *tela cheia exclusiva* não podem ser capturados como janela. Coloque o jogo em **"janela sem bordas"** (borderless) e compartilhe a **Tela inteira**.

**Trava quando mais gente assiste.**
Como a chamada é direta entre os navegadores, quem transmite envia **uma cópia para cada pessoa**. Em ⚙️ Configurações, escolha em **"Upload da sua internet"** o valor do seu teste de velocidade. O app divide a qualidade entre quem assiste para não estourar sua internet. Se ainda travar, use o perfil **720p · 30 fps**, que gasta menos.

**Aparece "limitado pelo processador".**
Use o perfil **720p · 30 fps**, que exige menos do processador. Fechar outros programas pesados também ajuda.

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
5. O script pede a **senha do servidor** e um **domínio**. Se não tiver domínio, aperte Enter: ele usa um endereço gratuito, tipo `https://203-0-113-10.sslip.io`.
6. No fim aparece o **link** para mandar aos amigos.

**Levar contas e mensagens que já existem no seu PC:** pare o servidor no PC durante a cópia, para não perder mensagens enviadas nesse intervalo. Se você usou o link Cloudflare configurado neste PC, os dados estão em `ResenhaCloudflare` dentro de `AppData\Local`, e não na pasta do projeto. No PowerShell, rode:
```powershell
scp "$env:LOCALAPPDATA\ResenhaCloudflare\data.json" root@SEU_IP:/var/lib/resenhex/
scp -r "$env:LOCALAPPDATA\ResenhaCloudflare\uploads" root@SEU_IP:/var/lib/resenhex/
ssh root@SEU_IP "chown -R resenhex:resenhex /var/lib/resenhex && systemctl restart resenhex"
```
Se você rodou `npm start` diretamente, copie o `data.json` e a pasta `uploads` daquela instalação em vez dos caminhos acima.

**Atualizar para uma versão nova:** repita os passos 2 a 4. O script detecta a instalação existente e mantém contas, mensagens e senha.

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

Em qualquer caso, **defina uma senha do servidor**. Ela é pedida na hora de criar conta, para ninguém de fora entrar:

```bash
ACCESS_PASSWORD=minhasenha npm start
```

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `PORT` | Porta HTTP (padrão `3000`) |
| `ACCESS_PASSWORD` | Senha exigida para criar conta (padrão: sem senha) |
| `ACCESS_PASSWORD_B64` | Senha codificada usada pelo instalador do VPS; tem prioridade sobre `ACCESS_PASSWORD` |
| `HOST` | Endereço de escuta do servidor (padrão `0.0.0.0`; no VPS, `127.0.0.1` atrás do Caddy) |
| `DATA_FILE` | Onde salvar contas, cargos, canais e mensagens (padrão `data.json`) |
| `UPLOAD_DIR` | Pasta dos arquivos enviados no chat (padrão `uploads/`) |
| `MAX_UPLOAD_MB` | Tamanho máximo de cada arquivo (padrão `25`) |
| `TRUST_PROXY` | `1` quando roda atrás de um proxy HTTPS (Caddy, Nginx), para ler o IP real de quem conecta. O instalador do VPS já define |
| `TURN_URL` | Servidor(es) TURN, separados por vírgula, ex.: `turn:meu-turn.com:3478` |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Credenciais do TURN |

### Voz não conecta para alguém? Configure um TURN

Na maioria das redes domésticas o WebRTC conecta direto usando só o STUN do Google (já configurado). Em algumas redes (4G, redes de faculdade/empresa, NAT simétrico) a conexão direta falha, e aí é preciso um servidor **TURN** para retransmitir. Opções:

- Instalar o [coturn](https://github.com/coturn/coturn) numa VPS
- Usar um serviço pronto (ex.: Metered, Twilio, Cloudflare Calls TURN)

Depois é só preencher `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`.

## Personalizando

- Canais e cargos: pela ⚙️ de configurações do servidor, direto no app
- Nome do servidor ("Resenha") e cores do tema: `public/index.html` e `public/style.css` (as cores ficam no topo do CSS, em `:root`)
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
└── public/
    ├── index.html     # layout (servidores, canais, chat, palco de voz, membros)
    ├── icons.js       # ícones SVG e o logo do Resenhex
    ├── style.css      # tema escuro estilo Discord
    └── app.js         # lógica do cliente: chat, menus de moderação, configurações, WebRTC (voz/tela)
```

## Limitações conhecidas

- Um único servidor (dá para ter vários canais, mas não vários "servidores")
- Sem mensagens diretas (DM), fotos de perfil ou status ("jogando X")
- Push-to-talk só funciona com a janela do Resenhex em foco (limite do navegador)
- Quem tiver o link de um arquivo enviado consegue abri-lo, mesmo que o arquivo esteja num canal privado. Os links são aleatórios e impossíveis de adivinhar.
- O servidor guarda as últimas 300 mensagens de cada canal. As mais antigas, e os arquivos delas, são apagadas.
- Não dá para trocar senha nem nome pela interface
- Chamada em malha P2P: boa para grupos pequenos (até ~6 a 8 pessoas por sala)
