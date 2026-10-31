# Onde paramos (25/10/2026)

Resumo para retomar o trabalho em outra sessão do Claude sem depender da conversa anterior.

> **Retrato de 25/10.** O plano de 5 mil descrito aqui foi ao ar inteiro na 2.0.0; as versões seguintes estão no [CHANGELOG](../discord-clone/CHANGELOG.md). Continuam valendo as seções "Como publicar sem susto" e "Como medir" e as notas de disco e rede, citadas nos e-mails de alarme do servidor. "Como voltar se algo der errado" foi escrita para voltar da 2.0.0 para a 1.9.0.

## O que estamos tentando fazer

Deixar o Resenhex aguentar **5 mil pessoas online ao mesmo tempo**, espalhadas em vários servidores, **sem gastar nada**: na mesma máquina grátis da Oracle.

- O plano completo, com medições, metas e 7 fases, está em [PLANO-5000-ONLINE-2026-10-24.md](planos/PLANO-5000-ONLINE-2026-10-24.md).
- Publicados juntos na **2.0.0, em 25/10** (veja "Publicação da 2.0.0", mais abaixo):
  - a Fase 0 (medidor de saúde e simulador);
  - a Fase 1 inteira (avisos só para quem foi afetado, portas do retransmissor, início rápido, gravação garantida, arquivos pelo Caddy, backups dos uploads);
  - a Fase 4a (índices em vez de percorrer o site inteiro);
  - a Fase 2 (banco SQLite gravado em pedaços). Veja "Fase 2: feita", logo abaixo;
  - a Fase 3 (avisos pequenos, entregues por sala). Veja "Fase 3: feita";
  - a Fase 4b (fotos num worker, prévias mais leves, limite de memória). Veja "Fase 4b: feita";
  - a Fase 5 (senha temporária e limites no retransmissor, teto de rede do mês). Veja "Fase 5: feita";
  - a Fase 7 (proteção e operação). Veja "Fase 7: feita".
- **O plano está no ar desde 25/10 (2.0.0).** Só a Fase 6 ficou de fora, e ela é só para quando aparecer um servidor grande.
- **Teto medido com o simulador:** era de 200 a 300 online (Fase 0). Com a Fase 4a, 1.500 online passaram com 15 mil contas.
  - Com a Fase 2, a gravação deixou de travar: com o banco da meta (50 mil contas, 1,35 milhão de mensagens), a pior gravação caiu de 70 ms para 2,8 ms, com 1.000 online.
  - Com a Fase 3, **5.000 online passaram** no banco da meta (50 mil contas): atraso p99 de 5 ms, processador de 29% e 0,66 ms por mudança no ARM, com ~2,6× menos rede que antes.
  - Com a Fase 4b, o custo por mudança ficou igual com 500 e com 5 mil online (0,70 e 0,61 ms no ARM).

## O que está no ar

- **Site:** versão **2.3.5** em https://resenhex.com.br, publicada em 31/10 às 02:50 (Brasília) a partir da branch `claude/catalogo-mudae` (`74d90a2`): limpeza do Mudae e o círculo verde de quem fala. O `main` local foi avançado para `74d90a2`. Antes estava a 2.3.0 (`cb81106`, 30/10). A 2.0.0, do plano de 5 mil, saiu em 25/10 de `claude/chamada-atual` (`68639d1`); as versões seguintes estão no `CHANGELOG.md`.
- **Painel "Chamadas agora":** só o dono vê, em Configurações. Mostra quem está online e em qual call.
- **GitHub:** o `main` de lá tem o mesmo código que está no ar (2.3.5), enviado em 31/10 a pedido do dono.
- **Servidor:** Oracle ARM grátis (2 núcleos, 12 GB), IP `146.235.41.73`, usuário `ubuntu`, chave `~/.ssh/resenhex-oracle-ed25519`.
  - App em `/opt/resenhex`; dados em `/var/lib/resenhex/data.db` (SQLite; o `data.json` da 1.9.0 ficou como `data.json.antes-do-sqlite`) e `/var/lib/resenhex/uploads`.
  - Backups em `/var/backups/resenhex`.

## O que entrou na 2.0.0

Tudo na branch `claude/chamada-atual` (pasta `.claude/worktrees/chamada-atual`), em cima da 1.9.0. Publicado em 25/10:

| Commit | O quê |
|---|---|
| `fc81617` | Prévia com imagem ao colar o link do site ou de um convite (WhatsApp, Discord…) |
| `9765b48` | Avisos só para quem foi afetado (teto de ~400 online → muito mais) + publicação guarda só os 10 backups automáticos mais novos (apaga 43, libera 2,8 GB na próxima publicação) |
| `e3a850c` | Este resumo, o plano e a ferramenta `tools/carga-teste.js` |
| `6253ba0` | Plano revisado: varreduras no site inteiro (o próximo teto, ~400–600 online), início lento, senha fixa do TURN; ferramenta `tools/varreduras.js` |
| `455edc0` | Fase 1, itens 2 e 3: portas e ajustes do retransmissor, TURN por TCP só na segunda tentativa, início rápido |
| `f023dc0` | Fase 0: medidor de saúde (aba "Saúde do servidor" do dono) e simulador v2 com o banco do tamanho da meta; primeira medição do teto |
| `ca9127a` | Fase 1, itens 4 a 7: gravação garantida, arquivos e instaladores pelo Caddy, backups dos uploads só com os novos |
| `801d5ce` | Fase 4a: índices de conexões, relações entre contas, servidores de cada conta, nomes, fotos e emojis (`server/online.js`, `server/social.js`) |
| `77d633a` | Fase 2 (em andamento): banco SQLite gravado em pedaços (`server/store.js`) |
| `ffcebe6` | Fase 2 pronta: checkpoint do WAL numa worker_thread, mensagens antigas carregadas depois de abrir, backup do banco pela publicação |
| `8803bf3` | Fase 3: avisos pequenos por sala (`public/state-patch.js`), entregues de uma vez a quem precisa |
| `96b88bc` | Fase 4b: fotos num worker, prévias de transmissão mais leves, limite de memória, socket.io mais leve por conexão |
| `60d21db` | Fase 5: senha temporária e limites no retransmissor, teto de rede do mês, transmissão retransmitida em 720p, `tools/uso-retransmissor.js` |
| `16c33f5` | Fase 7: volta espalhada depois de publicar, limites contra abuso, cota de envio, alarmes por e-mail, cartão do disco, sessões de 90 dias |
| `d704aa0` | Conferência antes de publicar: volta de versão segura (`deploy/voltar-versao.ps1`, `tools/banco-para-json.js`), "null" no painel Chamadas agora |
| `e09fadf` | Versão **2.0.0** com item nas Novidades; chamada que não fecha em 8 s tenta de novo já com o TURN por TCP |
| `705afd4` | Novidades da 2.0.0: recado do dev chamando a galera, com o confete da 1.0 |
| `22253aa` | Novidades da 2.0.0: seção "Por dentro" |
| `f7fe0ab` | Correções da revisão do GPT 6.1 (seção "Revisão do GPT 6.1") |
| `d5811b6` | Corte final de rede: com 9,5 TB no mês, o site sai do ar até o mês virar |

## Conferência antes de publicar (25/10)

- **Suíte inteira:** 457 de 462 passaram, 1 foi pulado e 4 falharam:
  - 3 por porta reservada do Windows (`listen EACCES`), que passaram ao repetir;
  - 1 do app de Windows (`uiohook-napi` não instalado neste PC; o app não muda nesta versão).
- **Navegador, com duas contas criadas na 1.9.0 e migradas:** mensagens antigas e novas, sala de voz (entrar, ensurdecer, sair, visto na hora pelo outro), conversa privada, Saúde do servidor, Chamadas agora e Novidades da 2.0.0. Sem erros no console.
- **Dados reais, no servidor, numa pasta temporária e numa porta separada** (o site não foi tocado):
  - a versão nova importou o `data.json` de verdade (89 contas, 22 servidores, 240 sessões, 932 mensagens) com tudo idêntico e ligou em 1,9 s;
  - a 1.9.0 instalada abriu o `data.json` gravado pela ferramenta de volta, com os mesmos números;
  - a pasta foi apagada no fim.
- **Volta ensaiada:** seção "Como voltar se algo der errado".

### Revisão do GPT 6.1 (25/10)

Corrigido, com teste para cada um:
- `data.json` estragado ao lado do banco: o servidor não liga e não mexe no banco (antes, o banco ia para o lado e o site podia abrir vazio).
- Primeira importação gravada com `synchronous = FULL` antes de renomear o `data.json`: uma queda da máquina nesse meio-tempo não deixa o banco vazio.
- Ao desligar, uma gravação que falha tenta de novo por até 5 s antes de sair.
- `tools/banco-para-json.js`: grava o arquivo inteiro (`writeFileSync`) e confere o tamanho antes de trocar.
- `deploy/voltar-versao.ps1`: a preparação entrou na proteção, e a volta guarda o servidor antes de mexer (seção "Como voltar").
- Instalador: confere se o Node abre o `node:sqlite` (22.13 ou mais novo); antes aceitava o Node 20. `engines` no `package.json` também.
- Rede do mês: sem o arquivo do mês (primeira publicação, arquivo estragado), começa do contador da placa, não do zero. Ligada antes do mês, a parte do mês é estimada pelo tempo.
- O estado do retransmissor (`parado`/`ligado`) que não conseguiu ser gravado tenta de novo a cada leitura (10 s).
- Cota diária de envios: o tamanho fica reservado na entrada. Envios ao mesmo tempo não passam juntos da cota, e envio recusado devolve a reserva.
- Foto, banner, fundo ou emoji recusado depois de gravado (recorte inválido, nome repetido, permissão retirada no meio) não deixa arquivo sobrando. Emoji confere de novo a permissão e o nome depois de processar a imagem.
- A troca para TCP conta os 8 s a partir de quando a conexão começa a tentar ("connecting"), não de quando ela nasce.

Pedido do dono depois da revisão: **corte final de 9,5 TB**. Antes, o teto só parava o coturn, e downloads e anexos podiam passar dos 10 TB (ver "Teto de rede do mês").

## Fase 2: feita

O banco virou `data.db` (node:sqlite, WAL), gravado em pedaços. Detalhes e medições na Fase 2 do [plano](planos/PLANO-5000-ONLINE-2026-10-24.md).

- Cada conta, servidor, sessão, amizade, conversa, bloqueio, envio, clipe e token de e-mail é uma linha; cada mensagem também.
- Quem muda algo marca o pedaço com `save('accounts/<id>')` e afins. Uma gravação a cada 250 ms grava só o que foi marcado.
  - Uma conferência lenta (2 ms por segundo) grava o que mudou sem marca e avisa no log: `faltou marcar`.
  - Com `STORE_VERIFY=<arquivo>`, a conferência só anota no arquivo o que ficou sem marca (modo dos testes).
- O checkpoint do WAL roda numa `worker_thread` (`server/store-checkpoint.js`), a cada 1 s. Se ela morrer, volta o checkpoint automático e o log avisa.
- No início, o servidor lê tudo menos as mensagens antigas e abre. As mensagens chegam depois, 8 ms por vez; um canal pedido antes disso é lido na hora, só ele. O log avisa quando terminou: `[banco] mensagens antigas carregadas em …`.
- No primeiro início, o servidor importa o `data.json` e o renomeia para `data.json.antes-do-sqlite`.
- A publicação faz o backup com `deploy/backup-banco.sh`: cópia do `data.db` com o site ligado (`VACUUM INTO`, pelo node), comprimida em `/var/backups/resenhex/data-before-<data>.db.gz`. Na primeira publicação ainda não há `data.db`: vai o `data.json`, como antes.
- O `node:sqlite` foi conferido no Node do servidor (22.23.3, SQLite 3.51.3), inclusive dentro de uma `worker_thread`.
- Medido com o simulador (`ACCOUNTS=50000 STEPS=1000 MESSAGES=12`, banco de 581 MB, 1,35 milhão de mensagens): a pior gravação caiu de 70 ms para 2,8 ms, e o início caiu de 10 s para 2,8 s no PC (~4,7 s no ARM).

## Fase 3: feita

As mudanças frequentes viraram avisos pequenos (`state:patch`). Detalhes e medições na Fase 3 do [plano](planos/PLANO-5000-ONLINE-2026-10-24.md).

- Quatro tipos:
  - `voice`: a sala de voz inteira;
  - `member`: o perfil de alguém num servidor;
  - `person`: o perfil para amigos e conversas;
  - `music`: o DJ de uma sala.
- O app aplica com `public/state-patch.js`, e os testes usam o mesmo arquivo.
- Quem entrou ou saiu da sala recebe o estado inteiro (a chamada dele mudou). Quem só mutou, ensurdeceu ou começou a assistir uma transmissão recebe o aviso, como os outros. O aviso é montado uma vez e entregue a todos de uma vez.
- Páginas abertas antes da publicação (mandam a versão no login, mas não `patches: 1`) recebem o estado inteiro no lugar dos avisos, até recarregar.
- O estado inteiro continua ao entrar, ao trocar de servidor, ao reconectar, nas chamadas privadas, no apelido e nas mudanças raras (cargos, canais, emojis…).
- A sala de voz privada só chega a quem pode ver a sala (teste em `test/channels.test.js`).
- A música que pausa sozinha com a sala vazia agora avisa o servidor. Antes, isso pegava carona no estado inteiro.
- Conferido no navegador com duas contas: entrar, ensurdecer e sair da sala, e o status "Não perturbe" na lista de membros.
- `tools/carga-teste.js` agora conta os avisos pequenos e mostra quanto chega a cada pessoa.
- O medidor de saúde mostra quanto custa cada mudança ("ms por mudança" na aba "Saúde do servidor"; coluna própria no simulador).
- Num servidor com 500 online, cada mudança mandava 177 KB para cada um e levava 0,7 s; agora manda 0,37 KB e chega em 24 ms.

## Fase 4b: feita

Detalhes e medições na Fase 4b do [plano](planos/PLANO-5000-ONLINE-2026-10-24.md).

- Fotos de perfil, banners, fundos, ícones e emojis passam por um worker (`server/images.js`, `server/image-worker.js`). O pior caso parava o servidor ~70 ms no ARM; agora não para.
- Prévias da transmissão: 640 px em WebP (JPEG no Safari), a cada 15 s, e só para quem está na sala sem assistir. Quem para de assistir recebe a última guardada. ~5× menos rede.
- O serviço sobe com `--max-old-space-size=6144`. O painel do dono mostra quanto do limite do JavaScript está em uso e avisa a partir de 70%.
- Cada conexão do socket.io solta a requisição HTTP do começo; a compressão por mensagem segue desligada.

## Fase 5: feita

Detalhes, testes e a previsão de rede na Fase 5 do [plano](planos/PLANO-5000-ONLINE-2026-10-24.md).

- **Senha temporária no retransmissor** (`server/turn.js`): o coturn usa `use-auth-secret`. O segredo (`TURN_SECRET`) fica só no servidor. Cada conta recebe uma senha própria, que vale de 24 a 30 h e chega no login e a cada entrada em chamada. Numa chamada longa, o app pede outra antes de vencer.
- **Limites:** 60 alocações por conta, 13 mil no total, 5 Mbps por sessão.
- **Teto de rede do mês** (`server/health.js`): o site soma o que a máquina mandou no mês (`/var/lib/resenhex/rede-do-mes.json`) e gasta num ritmo que fecha o mês em 7 TB.
  - Acima do ritmo, o retransmissor não recebe gente nova.
  - Se passar 1 TB do ritmo (abuso), o site escreve `parado` em `/var/lib/resenhex/retransmissor.estado`, e o systemd para o coturn até a rede voltar ao ritmo. Pior caso: ~8 TB, abaixo dos 10 TB grátis.
  - Cartão "Rede no mês" na aba "Saúde do servidor".
  - **Corte final:** o resto do site (anexos, instaladores, prévias, avisos) não tem ritmo, e alguém baixando um anexo sem parar (até ~2 Gbps) passaria dos 10 TB em menos de um dia. Com 9,5 TB no mês, seja do que for, o site escreve `fora` no mesmo arquivo, e o systemd para o Caddy e o coturn: **o site inteiro sai do ar até o mês virar** (dia 1, 0 h UTC), quando volta sozinho.
    - Alarmes por e-mail: "rede do mês perto do corte final" com 9 TB, e "site fora do ar pelo teto de rede" na hora do corte (outro quando volta).
    - A publicação religa o Caddy, e o site, ao subir, grava o estado de novo: no meio do corte, ele para outra vez (e a verificação da publicação pode acusar erro).
    - Para religar antes do mês virar, é preciso aceitar pagar a rede além dos 10 TB: `sudo systemctl disable --now resenhex-retransmissor.path && sudo systemctl start caddy coturn` (a próxima publicação liga a trava de novo).
    - O contador vê só esta máquina. A micro antiga (168.138.227.230) ainda roda coturn e Caddy, e a saída dela conta nos mesmos 10 TB da conta; hoje ninguém usa.
    - A volta para a 1.9.0 desliga a trava (a 1.9.0 não a conhece).
- **Transmissão retransmitida:** até 720p e 1,5 Mbps para quem a recebe pelo retransmissor.
- **Ponto em aberto:** com as premissas do plano (150 transmissões), o retransmissor pediria mais rede do que sobra. O teto segura o custo em zero, mas quem depende dele pode ficar sem chamadas com gente nova nos horários cheios. Falta medir quantas ligações passam por ele (`tools/uso-retransmissor.js`, depois de publicar). Se for muito, a transmissão retransmitida pode cair para 480p.

## Fase 7: feita

Detalhes e testes na Fase 7 do [plano](planos/PLANO-5000-ONLINE-2026-10-24.md).

- **Publicar sem derrubar todos de uma vez:** antes de desligar, o servidor avisa os apps para espalhar a volta em até 30 s (5 mil online → 30 s). O app conecta direto por websocket.
- **Limites:** 50 conexões abertas por endereço, 300 pedidos de folga por conexão (quem inunda cai), trocar de servidor 20 vezes a cada 10 s, envio de arquivos de 2 GB por dia por conta (5 GB por endereço).
- **Alarmes por e-mail:** servidor lento, memória alta, disco > 80%, rede do mês acima do ritmo, portas do retransmissor. Vão para o e-mail confirmado da conta dona do site (ou `ALERT_EMAIL`), no máximo um a cada 6 h por alarme.
- **Disco:** cartão "Disco" na aba "Saúde do servidor". Se o alarme do disco tocar, aumentar o disco no painel da Oracle (até 200 GB grátis).
- **Sessões** sem uso há 90 dias são apagadas.
- Cloudflare na frente ficou de fora (opcional, acima de ~1.000 online).

O dono pediu para **publicar só quando ele mandar, e só com o plano inteiro pronto** (24/10): nada de publicar fase por fase. Ele mandou em 25/10, e tudo foi junto na 2.0.0.

## Publicação da 2.0.0 (25/10, 01:49)

Havia 7 pessoas em duas calls (duas transmitindo a tela), e o dono mandou publicar mesmo assim. Em 2 minutos 6 delas estavam de volta nas calls, e uma transmitindo de novo.

Conferido depois de publicar (lista "Para publicar", logo abaixo):
- Portas da Oracle: a lista de segurança passou de UDP `49160–49200` para `49152–65535`.
- coturn (itens 3 e 9): `49152`, `65535` e `10.0.0.200` no `turnserver.conf`; as 5 linhas de senha e limites; nenhum `user=`.
  - Nos 2 primeiros minutos, 82 sessões no retransmissor com `username=<número:conta>`.
  - Nenhum `10.0.0.200 denied`. Os 45 `denied` foram de IPs `192.168.x` (rede de casa de quem está na call), o que é o bloqueio de IPs privados funcionando.
  - Os `438 Wrong nonce` com o usuário antigo `resenhex` vêm de páginas abertas antes da publicação, com a senha fixa que deixou de valer. Elas pegam a senha nova ao reconectar.
- Caddy (item 4): `server: Caddy` sem `x-powered-by`, 69 `?v=` na página inicial, `max-age=31536000, immutable` no `app.js?v=x`, o download redireciona para o instalador 1.4.4 (200, servido pelo Caddy), pasta `drwxr-x--x` e `data.db` com `-wal`/`-shm` em `-rw-r-----`. O websocket abre pelo Caddy.
- Banco (item 5): o `data.json` virou `data.json.antes-do-sqlite`. Contagens iguais entre o json e o banco: 89 contas, 22 servidores, 932 mensagens. Nenhum erro no journal.
- Backup (item 6): o primeiro copiou os uploads (104 MB) para `/var/backups/resenhex/uploads`. O dos dados da 1.9.0 é `data-before-20261025-014918.tar.gz`.
- Fase 4b (item 8): `--max-old-space-size=6144`; nenhum `worker parou` no journal.
- Fase 5 (item 9): `resenhex-retransmissor.path` ligada, `retransmissor.estado` = `ligado`, `rede-do-mes.json` criado no primeiro minuto. O mês já tinha 53,4 GB de saída quando o site novo subiu (o ritmo do dia 25 permite ~5,5 TB).
- Fase 7 (item 10): o cartão "Disco" tem número no registro de saúde (16,1%).

Ficou para o dono conferir:
- **Os alarmes ainda não têm para onde mandar e-mail.** A conta dona do site não tem e-mail confirmado e não existe `ALERT_EMAIL`. Até isso mudar, os alarmes só vão para o journal.
- Com duas contas (precisa entrar no site):
  - item 7: mutar e a outra conta ver na hora;
  - item 8: trocar a foto e o banner, e a prévia da transmissão sem assistir.
- A aba "Saúde do servidor" no navegador (cartões "Rede no mês" e "Disco"). Os números já aparecem no registro do servidor.
- Medir o retransmissor alguns dias depois (`tools/uso-retransmissor.js`, item 9).

## Urgente (afetava quem usava): publicado na 2.0.0

**O retransmissor de chamadas (coturn) tem só 41 portas** (`49160–49200`). Na sexta, 23/10, entre 21h e 2h, ficou sem portas 435 vezes: quem estava atrás de rede restrita não conseguia entrar na call.

**E ele barra a ligação quando as duas pontas usam o retransmissor.** O coturn passa esses pacotes pelo IP interno da máquina (`10.0.0.200`), e esse IP cai no bloqueio de IPs privados: foram 2.797 bloqueios em 7 dias (até 24/10). Quem está atrás de rede restrita não conecta com outra pessoa na mesma situação.

O que já está no código (este commit):
- `deploy/instalar-vps.sh`: portas `49152–65535` no `turnserver.conf`, no iptables e no ufw; `allowed-peer-ip` com o IP interno; `no-tcp-relay`; `verbose` (registra os bytes de cada sessão no journal).
- App: a conexão nasce só com o TURN por UDP; o TCP entra no primeiro reinício da conexão. Assim cada conexão ocupa uma porta, não duas.
- `deploy/oracle-portas-turn.py`: libera as portas na lista de segurança da Oracle, que o instalador não toca. Sem argumentos só mostra o que mudaria; em 24/10 a lista tinha UDP `49160–49200`.

**Para publicar:**
1. `py deploy/oracle-portas-turn.py --aplicar` (antes da publicação; abrir as portas antes não atrapalha nada).
2. Publicar como de costume (seção abaixo). A publicação reinicia o coturn e derruba as calls que passam por ele.
3. Conferir no servidor:
   - `sudo grep -E "min-port|max-port|allowed-peer" /etc/turnserver.conf` mostra `49152`, `65535` e `10.0.0.200`;
   - depois de uma call, `sudo journalctl -u coturn --since -1h | grep -c usage` passa de 0;
   - `sudo journalctl -u coturn --since -1h | grep -c "10.0.0.200 denied"` fica em 0.
4. Conferir os arquivos pelo Caddy (Fase 1, itens 5 e 6):
   - `curl -sI https://resenhex.com.br/style.css` responde com `server: Caddy` e sem `x-powered-by: Express`;
   - a página inicial traz os scripts com `?v=` (`curl -s https://resenhex.com.br/ | grep -c '?v='` passa de 60), e `curl -sI "https://resenhex.com.br/app.js?v=x"` mostra `max-age=31536000`;
   - `curl -sI https://resenhex.com.br/download/Resenhex-Setup.exe` redireciona para o instalador da versão, e esse responde 200 com `server: Caddy`;
   - `sudo ls -l /var/lib/resenhex` mostra `drwxr-x--x` na pasta e o `data.db` (com `-wal` e `-shm`) sem leitura para outros (`-rw-r-----`).
5. Conferir o banco novo (Fase 2):
   - `sudo journalctl -u resenhex --since -10min | grep banco` não mostra `faltou marcar` nem `checkpoint em segundo plano parou`. A linha `mensagens antigas carregadas` só aparece da segunda subida em diante: na primeira, a importação do `data.json` não escreve nada no journal;
   - o `data.json` virou `data.json.antes-do-sqlite`, e o backup da publicação seguinte é um `data-before-….db.gz`.
6. Na primeira publicação, o backup copia todos os uploads (~111 MB) para `/var/backups/resenhex/uploads`; nas seguintes, só os novos.
7. Conferir os avisos pequenos (Fase 3): com duas contas, uma entra numa sala e muta; a outra vê na hora, sem recarregar. Quem estava com a página aberta antes da publicação continua vendo tudo (recebe o estado inteiro até recarregar).
8. Conferir a Fase 4b:
   - `systemctl cat resenhex | grep max-old-space` mostra `--max-old-space-size=6144`;
   - trocar a foto de perfil e o banner funciona, e `sudo journalctl -u resenhex --since -10min | grep imagens` não mostra `worker parou`;
   - com duas contas numa sala, uma transmite e a outra vê a prévia sem assistir; ao assistir e parar, a prévia volta.
9. Conferir a Fase 5 (a publicação reinicia o coturn, e a senha fixa antiga deixa de valer):
   - `sudo grep -cE "^(use-auth-secret|static-auth-secret|user-quota|total-quota|max-bps)" /etc/turnserver.conf` dá 5, e `sudo grep -c "^user=" /etc/turnserver.conf` dá 0;
   - `systemctl is-enabled resenhex-retransmissor.path` responde `enabled`, e `cat /var/lib/resenhex/retransmissor.estado` mostra `ligado`;
   - depois de 1 minuto, existe `/var/lib/resenhex/rede-do-mes.json`, e a aba "Saúde do servidor" mostra o cartão "Rede no mês" com número;
   - uma call entre duas pessoas funciona, e depois dela `sudo journalctl -u coturn --since -1h | grep usage` mostra `username=<número>:<conta>`;
   - para medir o retransmissor (alguns dias depois): `sudo journalctl -u coturn --since "7 days ago" -o short-iso | node /opt/resenhex/tools/uso-retransmissor.js`.
10. Conferir a Fase 7:
   - a conta dona do site tem o e-mail confirmado (ou existe `ALERT_EMAIL` num drop-in do systemd, como o `mail.conf`); sem isso, os alarmes só vão para o journal;
   - a aba "Saúde do servidor" mostra o cartão "Disco" com número;
   - no navegador (F12 → Rede), a conexão do socket.io é `websocket`, sem `transport=polling`;
   - na publicação seguinte, os apps abertos voltam sozinhos em até 30 s, sem todos ao mesmo tempo;
   - `sudo journalctl -u resenhex --since -1h | grep -E "alarme|limites|sessões"` mostra só o esperado (na primeira subida, `[sessões]` só aparece se houver sessão velha para apagar).

## Como publicar sem susto

1. Conferir quem está online: painel "Chamadas agora", ou `sudo ss -tn state established "( sport = :3000 )"` no servidor. Publicar reinicia tudo e derruba as calls por 1–2 s.
2. Se tiver gente em call, avisar o dono e deixar ele escolher a hora.
3. Rodar `deploy/atualizar-oracle.ps1` a partir da pasta da branch que vai ao ar. Ele faz backup dos dados antes.
4. Outras sessões do Claude trabalham em outras branches (`git worktree list`). Antes de publicar, ver se o que está no ar tem algo que a branch não tem.

## Como voltar se algo der errado

`deploy/voltar-versao.ps1 -Commit <versão>` volta o site sem perder o que as pessoas fizeram depois da publicação. Para a 1.9.0 (o que estava no ar antes da 2.0.0): `-Commit 484c2f8`. Com `-ValidateOnly`, só mostra o que faria e não envia nada.

- A 1.9.0 só lê o `data.json`, e a versão nova o renomeia na primeira subida. Por isso o script:
  1. desliga o site e grava o `data.db` como `data.json` (`tools/banco-para-json.js`). Ele recusa um banco vazio e não sobrescreve um `data.json` que exista;
  2. troca a senha do retransmissor por uma fixa, porque o instalador da 1.9.0 recusaria a senha nova e pararia no meio;
  3. publica a 1.9.0 com o `atualizar-oracle.ps1` dela, que faz o backup e reinstala o site, o Caddy e o coturn (as 41 portas antigas voltam).
- Antes de mexer em qualquer coisa, o script guarda o servidor em `/var/backups/resenhex/volta-<data>`: o site instalado (`/opt/resenhex`), a configuração que os instaladores reescrevem (`resenhex.env`, coturn, Caddy, unidades do systemd), as permissões da pasta de dados e se a trava do teto de rede está ligada.
- O site fica fora do ar ~2 min e as calls caem.
- **Se qualquer passo falhar** (inclusive o instalador antigo parando no meio, com parte da configuração já reescrita), o script põe de volta o que guardou (`preparar-volta.sh --restaurar`) e religa o site, sem depender da internet. A versão restaurada vê o `data.json` e importa de novo. Ensaiado no Ubuntu do WSL com uma raiz falsa.
- **Publicar a versão nova de novo depois da volta é seguro.** Ela vê o `data.json` ao lado do `data.db`, guarda o banco como `data.db.antes-da-volta-<hora>` e importa o `data.json`, com o que mudou durante a volta. O `data.json.antes-do-sqlite` da primeira importação continua intacto.
- Ensaiado no PC em 25/10, com o servidor da 1.9.0 de verdade: 1.9.0 → nova → volta → nova. Nenhuma mensagem se perdeu e as sessões continuaram valendo. Teste automático em `test/servers.test.js` ("a version rollback…").
- Não ensaiado: o instalador antigo rodando na máquina da Oracle depois do novo. As diferenças conhecidas (senha do retransmissor e trava do teto de rede) já são tratadas pelo `deploy/preparar-volta.sh`.

## Como medir

- **`tools/simulador.js`** (o principal): monta um banco do tamanho do site, sobe uma cópia do servidor e põe pessoas online em degraus, no ritmo das premissas do plano. Diz se cada degrau passou nas metas, já com a estimativa do ARM.
  - Exemplos: `STEPS=200 node tools/simulador.js` (2 mil contas) e `ACCOUNTS=50000 STEPS=25,50 node tools/simulador.js` (banco da meta).
  - Cada degrau leva ~2 min; um que trava espera até 5 min pelas conexões.
  - Resultados de 24/10 nas Fases 0 e 4a do plano.
  - Para medir sem a gravação, use uma cópia do `server.js` na mesma pasta com o `writeData()` desligado e `SERVER_JS=<cópia>`. Apague a cópia depois.
- **Medidor de saúde** (`server/health.js`): aba "Saúde do servidor" nas Configurações do dono e uma linha `[saúde]` por minuto no log (`sudo journalctl -u resenhex | grep saúde`).
- **`tools/carga-teste.js`:** simula N pessoas em N servidores e mede o custo de cada mudança. Instruções no começo do arquivo.
  - Criar servidor tem limite de 5 por minuto; o script já contorna isso.
- **Resultado de 24/10** (40 servidores de 20 pessoas, 800 online): uma mudança caiu de 206 ms, entregue a 800 pessoas, para ~20 ms, entregue a 21 (com o `9765b48`).
- **`tools/varreduras.js`:** mede, sem subir o servidor, as varreduras que crescem com o número de contas (o teste acima não as pega, porque só cria contas online).
- **Início do servidor** com 10 mil contas e 2 mil servidores: 20 s antes do início rápido, 1 s depois. Com 50 mil contas e 10 mil servidores: 1,3 s (no PC).
- O ARM é ~1,7× mais lento que o PC do dono nesse tipo de trabalho.

## Como o dono gosta de trabalhar

- Conversa em português, linguagem simples, sem jargão.
- **Não publicar nem enviar ao GitHub sem ele pedir.**
- Mudança simples: rodar só os testes dela, uma vez. Não rodar a suíte inteira sem motivo.
- Telas no nível de acabamento do Discord, sempre conferidas no navegador.
- Mais contexto na memória do Claude Code deste PC: `C:\Users\angej\.claude\projects\C--Games-project2\memory\`. A memória fica no PC, não na conta.
