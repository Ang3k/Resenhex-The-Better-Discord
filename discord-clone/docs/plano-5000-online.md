# Plano: 5 mil pessoas online no Resenhex, sem gastar nada

Escrito em 24/10/2026 e revisado no mesmo dia, com a medição das varreduras (problemas 2 e 3). Meta: **5.000 pessoas online ao mesmo tempo, espalhadas em vários servidores**, sem travar e na mesma máquina grátis da Oracle (2 núcleos ARM, 12 GB de memória, 10 TB de rede por mês, até 200 GB de disco).

## Resumo

A máquina aguenta. O que impede hoje é o jeito como o código trabalha:

- ele mandava o estado inteiro para todo mundo a cada mudança (já corrigido, falta publicar);
- para montar o estado de cada pessoa, ele percorria todas as contas, amizades, conversas e servidores do site. Isso crescia com quantas contas existem, não com quantas estão online, e era o teto: **entre 200 e 300 online**, medido com o simulador (Fase 0). Já corrigido na Fase 4a (falta publicar): com 15 mil contas, 1.500 online passaram;
- ao ligar, ele percorre servidores × contas: na meta, cada publicação deixaria o site fora do ar por ~15 min;
- ele regravava o banco de dados inteiro a cada mudança. Depois da Fase 4a, era o próximo teto: com o banco da meta, cada gravação parava o servidor ~0,3 s (no PC). Já corrigido na Fase 2 (falta publicar): a pior gravação leva 2,8 ms;
- ele percorre todo mundo online para entregar cada mensagem.

Além da Fase 0, que cria o medidor e o simulador, o plano tem 7 fases (a 4 dividida em duas partes). Com o medidor e o simulador, cada mudança é medida antes e depois, e a meta só conta como batida quando o simulador mostrar 5 mil pessoas sem travar.

| Fase | O quê | Tamanho | Ganho |
|---|---|---|---|
| 0 | Medidor de saúde no servidor + simulador de 5 mil pessoas (pronto) | M | Saber, em vez de chutar |
| 1 | Consertos rápidos: avisos por servidor (pronto), portas das chamadas, início rápido, arquivos pelo Caddy, gravação garantida | P | Tira o teto de ~400 do estado inteiro e conserta falhas que já acontecem |
| 2 | Banco de dados SQLite, gravando só o que mudou (pronto) | G | Tira as travadas ao salvar (~0,2 s com um banco de 50 MB, ~1,3 s com 300 MB) |
| 3 | Avisos pequenos ("fulano mutou") entregues por sala | G | Processador e rede ~10–50× menores por mudança |
| 4a | Parar de percorrer o site inteiro: índices e o que roda em toda mudança (pronto) | M | Tira o teto de 200–300 online |
| 4b | Fotos em outro núcleo, prévias mais leves, memória | M | Custo por mudança não cresce com o total de pessoas |
| 5 | Chamadas e rede: senha temporária no retransmissor, medir e limitar o que passa pelo servidor | M | Não estourar os 10 TB grátis |
| 6 | Servidores grandes (só se aparecerem) | M | Comunidades com centenas online |
| 7 | Proteção e operação: reconexão em massa, alarmes, disco | P/M | Publicar sem derrubar todo mundo; dormir tranquilo |

P = horas, M = 1–2 dias, G = vários dias. Cada fase é testada sozinha com o simulador; a publicação fica para o fim, com tudo junto (pedido do dono em 24/10). A ordem de trabalho não segue os números: a Fase 4a vem antes da Fase 2, porque o teto dela chega primeiro (seção 4).

---

## 1. Onde estamos (medido em 24/10)

| O quê | Hoje |
|---|---|
| Contas / servidores | 88 contas, 21 servidores (o maior tem 15 membros) |
| Online no pico | 8–10 pessoas |
| Processador do Node | 0,05% de um núcleo |
| Memória do Node | 206 MB, de 12 GB |
| Rede | ~73 GB/mês enviados no total (13 KB/s só do site no pico) |
| Banco (data.json) | 545 KB: mensagens 64%, servidores 11%, contas 11%, clipes 7%, sessões 4% |
| Arquivos enviados (fotos, anexos) | 111 MB |
| Disco | 45 GB, 35 GB livres |
| Mensagens | 373 na última semana, de 19 pessoas; mais movimento às 18h e às 21h |
| Conexões abertas permitidas | 524.288 para o Node, 1.048.576 para o Caddy |

### Problemas encontrados

1. **Estado inteiro para todo mundo.** Cada mudança (mutar, entrar na call, conectar) mandava canais, cargos e a lista de membros para todas as pessoas online, inclusive de outros servidores.
   - Teto: ~300–400 online.
   - Já corrigido no commit `9765b48` (avisa só quem é afetado). Medido com 800 online: 206 ms → ~20 ms por mudança. **Falta publicar.**
   - Esse teste só tinha contas online, sem amizades nem conversas. Por isso não mostrou o problema 2.
2. **O site inteiro é percorrido a cada envio.**
   - Para montar o estado de cada pessoa que recebe um aviso, o servidor percorre todas as amizades e conversas do site (`socialFor`), todos os servidores (`communities.list`) e todas as conexões (`publicProfiles`).
   - Uma vez por envio, o `sharedState` percorre todas as contas do site. O `Object.values(db.accounts)` ainda cria um Proxy por conta.
   - O `notifyAccount` percorre todas as amizades, conversas, bloqueios e servidores a cada mudança de presença.
   - Medido no PC com o `communities.js` de verdade, com uma amizade e uma conversa por conta em média (`tools/varreduras.js`; o ARM é ~1,7× mais lento):

     | Banco | `socialFor` (por pessoa que recebe) | `sharedState` (por envio) | `notifyAccount` |
     |---|---|---|---|
     | 10 mil contas, 2 mil servidores | 8 ms | 7 ms | 8 ms |
     | 50 mil contas, 10 mil servidores (meta) | 66 ms | 42 ms | 56 ms |

   - Com ~1.000 online (~10 mil contas), uma mudança num servidor com 20 pessoas olhando custa ~0,3 s no ARM, e chegam ~8 mudanças por segundo.
   - **Teto medido com o simulador (Fase 0), já com o `9765b48`: entre 200 e 300 online**, com 10 contas cadastradas por pessoa online. A estimativa era de 400–600. Ele depende de quantas contas existem, não de quantas estão online: com o banco da meta (50 mil contas), nem 25 pessoas online passam nas metas.
3. **O início percorre servidores × contas.**
   - O laço que agenda o fim dos castigos (`scheduleTimeoutEnd`, no `server.js`) passa por todas as contas em cada servidor. Ele roda antes do `listen`: ninguém entra enquanto ele não termina.
   - Medido no PC: ~13 s com 2 mil servidores e 10 mil contas. Na meta (10 mil × 50 mil): **~9 min no PC, ~15 min no ARM, a cada publicação.**
4. **Banco num arquivo só, regravado inteiro.**
   - O servidor fica parado enquanto prepara o arquivo: ~0,2 s com 50 MB e ~1,3 s com 300 MB.
   - Na proporção de hoje (6,2 KB por conta, e os canais ainda longe do limite de 300 mensagens), 5 mil online dariam de 50 a 300 MB.
   - Tem também um defeito: o `save()` adia a gravação a cada mudança nova. **Com atividade sem pausa de 0,3 s ele não grava nunca**, e se o servidor cair, perde tudo desde a última pausa.
   - E duas gravações podem se atropelar no mesmo arquivo temporário. Aconteceu no simulador, com um banco de 34 MB: a segunda gravação falhou (`rename … ENOENT`).
   - Medido no simulador: com o banco da meta (57 MB), cada gravação deixa o servidor parado ~0,3 s no PC, ~0,5 s no ARM.
5. **Retransmissor de chamadas sem portas.**
   - O coturn (o servidor que passa as chamadas de quem está atrás de rede restrita) tem só **41 portas** (49160–49200), definidas em `deploy/instalar-vps.sh`.
   - O site oferece o TURN por UDP e por TCP, então cada conexão de chamada pede 2 portas.
   - Todo mundo pede portas, não só quem precisa do retransmissor: o navegador aloca ao montar cada conexão. Numa sala de n pessoas são n × (n − 1) × 2 portas. Uma sala de 5 pessoas chega a ocupar 40 das 41.
   - **Ficou sem portas 435 vezes na noite de sexta, 23/10, entre 21h e 2h, e mais 21 vezes no sábado à tarde.** Nessas horas, quem precisava do retransmissor não conseguia se conectar na call.
   - A senha do retransmissor é fixa e igual para todos (`user=` no `turnserver.conf`) e vai para toda conta logada. Qualquer um pode copiá-la e usar o retransmissor para outra coisa, gastando a rede grátis.
   - Quando as duas pontas usam o retransmissor, o coturn passa os pacotes pelo IP interno da máquina (`10.0.0.200`), que cai no bloqueio de IPs privados (`denied-peer-ip`). Foram 2.797 bloqueios em 7 dias: duas pessoas atrás de rede restrita não conectam entre si.
6. **Laços sobre todo mundo online.**
   - Para cada mensagem, o servidor passa por todas as conexões e confere a permissão uma a uma (`emitToViewers`). Há 26 trechos no `server.js` que percorrem todas as conexões.
   - Toda mudança, até uma troca de status, roda o `enforceVoice()` (confere a permissão de cada pessoa em call) e o `syncDjRooms()` (conta todo mundo online).
   - O `viewers` de cada pessoa em call percorre todas as conexões: o custo cresce com quem está em call × quem está online.
7. **Fotos de perfil processadas no mesmo núcleo do servidor.** O `pngjs` recodifica cada imagem e deixa o servidor parado:

   | Imagem | Tempo parado no servidor |
   |---|---|
   | 256 px | ~18 ms |
   | 512 px | ~57 ms |
   | 1024 px | ~220 ms |

8. **O Node serve arquivos.**
   - Páginas, scripts (1,5 MB, 0,4 MB comprimido), fotos e os instaladores do Windows (104 MB cada) passam pelo processo que também cuida do tempo real.
   - Os scripts não têm cache longo.
9. **Prévias das transmissões passam pelo servidor.**
   - É uma foto de 768×432 a cada 8 s, para todos na sala, mesmo quem já está assistindo.
   - Com 150 pessoas transmitindo, dá ~1–3 MB/s.
10. **Backups.** Cada publicação empacota o banco **e todos os uploads**. Hoje são 112 MB por publicação; com 50 mil contas, seriam dezenas de GB.
    - A retenção de só os 10 mais novos já está pronta no `9765b48`.

---

## 2. A meta em números

### Premissas (pessimistas de propósito)

| Item | Valor usado | De onde veio |
|---|---|---|
| Pessoas online ao mesmo tempo | 5.000 | meta |
| Contas cadastradas | ~50.000 | hoje ~10% das contas ficam online no pico |
| Servidores | ~10.000; a maioria com 5–50 membros, alguns com 200–500 | hoje 1 servidor para cada 4 contas |
| Em chamada | ~1.000 pessoas em ~250 salas | estimativa (20%) |
| Transmitindo tela | ~150 | estimativa |
| Mudanças (call, mutar, status, assistir) | 1 por minuto por pessoa ≈ **83 por segundo** | hoje ~0,5 por minuto; usei o dobro |
| Mensagens | 1 a cada 3 min por pessoa ≈ **28 por segundo** | hoje bem menos; folga grande |
| "Digitando" | ≈ 55 por segundo | ~2 por mensagem |
| Trocar de servidor | 1 por minuto por pessoa ≈ 83 por segundo | só quem troca recebe o estado novo |
| Reconexão em massa | as 5.000 pessoas em 1 minuto | publicação ou queda |

### O que é "sem travar"

| Medida | Meta |
|---|---|
| Atraso do servidor (event loop), p99 | < 50 ms |
| Atraso máximo fora de publicação | < 250 ms |
| Processador do Node no pico | < 50% de um núcleo (folga de 2×) |
| Memória do Node | < 6 GB |
| Reconexão de 5.000 pessoas | todos de volta em < 2 min, sem travada > 1 s |
| Rede no mês | < 7 TB (margem antes dos 10 TB grátis) |
| Dados perdidos se o servidor cair | no máximo o último 1 s |

### A conta, depois do plano (estimativa, a confirmar na Fase 0)

- **Processador:**
  - Uma mudança custa ~0,2–0,5 ms (aviso pequeno, montado uma vez e entregue à sala). Isso conta com os índices da Fase 4a: sem eles, só o `socialFor` de uma pessoa custaria ~110 ms no ARM com 50 mil contas.
  - Juntando 83 mudanças/s, 28 mensagens/s, 55 "digitando"/s, 83 trocas de servidor/s, os pings do socket.io (200/s) e a gravação no SQLite: **~130 ms por segundo ≈ 13% de um núcleo**.
  - A meta é ficar abaixo de 50%.
- **Memória:**
  - 5.000 conexões × ~0,15 MB (medido: ~0,13 MB) ≈ 0,75 GB.
  - Dados em memória ≈ 1–1,5 GB.
  - **Total ~2,5 GB de 12 GB.**
- **Rede do site**, com as premissas pessimistas, no pico:

  | Origem | Tráfego |
  |---|---|
  | Avisos (~0,3 KB para ~30 pessoas) | ~0,75 MB/s |
  | Mensagens e "digitando" | ~0,7 MB/s |
  | Estado ao trocar de servidor | ~0,8 MB/s |
  | Prévias mais leves | ~1 MB/s |
  | **Total** | **~3 MB/s, ou ~2–4 TB por mês** |

- **Retransmissor de chamadas:** é o maior risco de rede.
  - Costuma-se estimar que 10–25% das conexões precisam dele.
  - Uma transmissão de tela retransmitida a 3 Mbps para 3 pessoas dá ~4 GB por hora.
  - Sem limite, ele sozinho poderia passar de 10 TB por mês.
  - Com a senha fixa de hoje, quem não é do Resenhex também pode gastar essa rede.
  - A Fase 5 troca a senha, mede e põe teto, para o site e o retransmissor juntos ficarem abaixo de 7 TB.
- **Disco:** 111 MB para 88 contas → ~60 GB para 50 mil. A Oracle dá até 200 GB grátis.
- **Conexões:** sobra (524 mil permitidas).
- **Portas do retransmissor:** ~16 mil depois da Fase 1, mas cada sala de n pessoas ocupa n × (n − 1) × 2.
  - ~250 salas de 4 pessoas: ~6 mil portas. Uma sala de 8 ocupa 112.
  - Sem o TURN por TCP na primeira tentativa (Fase 1), cai pela metade.

---

## 3. As fases

### Fase 0 — Medir antes de mexer (M)

Sem isso, cada mudança é fé. Vem primeiro.

**0.1 Medidor de saúde no servidor**
- Coleta, a cada 10 s:
  - atraso do event loop (`perf_hooks.monitorEventLoopDelay`: p50, p99, máximo);
  - processador e memória do Node (heap e RSS);
  - conexões abertas;
  - mudanças por segundo;
  - bytes enviados por segundo;
  - tempo de cada gravação do banco;
  - portas do retransmissor em uso.
- Mostra num cartão **"Saúde do servidor"** no painel do dono (ao lado de "Chamadas agora") e grava uma linha por minuto no log.

**0.2 Simulador de carga v2** (evolução do `carga-teste.js` usado em 24/10)
- Cria contas e servidores direto no banco de teste: muitos servidores pequenos, alguns médios e um ou dois de 500.
- **O banco de teste precisa ter o tamanho do site, não só de quem está online:** ~10 contas cadastradas para cada pessoa online (50 mil para 5 mil), com amizades, conversas e bloqueios. O teste de 24/10 só criava contas online e sem amigos, e por isso não viu os problemas 2 e 3.
- Cada pessoa simulada segue o roteiro das premissas: conversa, digita, entra e sai de call, muta, troca de servidor, muda status e reconecta.
- Tem um modo de **reconexão em massa** (todo mundo cai e volta em 1 minuto).
- Roda em vários processos, porque um só não aguenta 5 mil conexões. Gera um relatório com as metas da tabela acima: passou ou não passou.
- **Onde roda:**
  - No PC, para comparar antes e depois (multiplicando por ~1,7 para o servidor ARM).
  - Ao fim de cada fase, uma rodada no próprio servidor ARM de madrugada: numa cópia separada (outra porta, dados de teste, sem tocar no Resenhex de verdade), com o gerador no PC.
- **Armadilha conhecida:** criar servidor tem limite de 5 por minuto. Os servidores de teste precisam ser criados direto no banco, senão o teste mede outra coisa.

**Pronto quando:** o simulador reproduz os números de 24/10, mostra onde está o teto atual (esperado: as varreduras do problema 2) e mede quanto o servidor leva para ligar com o banco da meta.

**Feito em 24/10 (falta publicar):**
- `server/health.js` mede tudo da lista acima. A aba **"Saúde do servidor"** fica nas Configurações, só para o dono, ao lado de "Chamadas agora": um cartão por medida, com a linha dos últimos 10 minutos e o estado em relação à meta. O log ganha uma linha `[saúde]` por minuto.
- `tools/simulador.js` faz o que a lista acima pede, lendo os números do próprio medidor. Uso e opções no começo do arquivo.
- Primeira rodada, no PC, com o código desta branch (já com os avisos só para quem foi afetado e o início rápido). O atraso no ARM é a estimativa (PC × 1,7):

  | Banco | Online | Atraso p99 no ARM | Processador no ARM | Resultado |
  |---|---|---|---|---|
  | 2 mil contas | 200 | 16 ms | 17% | passou |
  | 3 mil contas | 300 | 72 ms | 33% | não passou (atraso) |
  | 4 mil contas | 400 | 104 ms | 52% | não passou |
  | 6 mil contas | 600 | 606 ms | 141% | não passou: muita gente não conseguiu nem conectar |
  | 30 mil contas | 500 | 783 ms | 142% | não passou: só 96 de 500 entraram em 5 min |
  | 50 mil contas (meta) | 25 | 709 ms | 73% | não passou: cada gravação para o servidor ~0,5 s |

- **Teto atual: entre 200 e 300 online** (com 10 contas por pessoa online), abaixo da estimativa de 400–600. Com o banco da meta, as varreduras (problema 2) e a gravação (problema 4) travam o servidor mesmo com pouca gente online.
- Com o banco da meta, o servidor liga em 1,5 s (era o problema 3, já resolvido).

### Fase 1 — Consertos rápidos (P cada)

1. **Publicar "avisar só quem é afetado"** (`9765b48`, pronto). Antes, conferir quem está online, porque a publicação derruba as calls.
2. **Portas do retransmissor de chamadas** (já falha hoje; pronto, falta publicar; o passo a passo está no `ESTADO-ATUAL.md`):
   - Ampliar de 49160–49200 (41 portas) para 49152–65535 (~16 mil).
   - Liberar o IP interno da máquina (`allowed-peer-ip`), para quem usa o retransmissor dos dois lados conectar. Com `no-tcp-relay`, esse IP só fica alcançável por UDP.
   - **Mudar em `deploy/instalar-vps.sh`** (`TURN_MIN_PORT` e `TURN_MAX_PORT`). Cada publicação reescreve o `turnserver.conf`, o iptables e o ufw a partir dali, então uma edição feita só no servidor some na publicação seguinte.
   - Liberar também na lista de segurança da Oracle (`deploy/oracle-portas-turn.py`, pela API, com a chave que já existe). Essa o instalador não toca.
   - Ligar o log de uso do coturn (`verbose`), para medir quanto tráfego passa por ele.
   - Tirar o TURN por TCP da primeira tentativa, porque ele dobra as portas por conexão. O app oferece o TCP só se a conexão falhar com UDP (reinício do ICE), para não deixar de fora quem está numa rede que só passa TCP.
   - Reiniciar o coturn derruba as calls que passam por ele. Se a senha temporária (Fase 5, item 2) já estiver pronta, entra no mesmo reinício.
3. **Início rápido** (pronto, falta publicar).
   - O laço do `scheduleTimeoutEnd` passa a percorrer só os membros de cada servidor que têm castigo (`timeoutUntil`), em vez de servidores × contas (problema 3).
   - Medido no PC: com 10 mil contas e 2 mil servidores, de 20 s para 1 s; com 50 mil contas e 10 mil servidores, 1,3 s.
4. **Gravação garantida** (pronto, falta publicar). Até a Fase 2 chegar:
   - O `save()` grava no máximo a cada 2 s, mesmo com atividade sem pausa.
   - Uma gravação nunca começa antes da anterior terminar.
5. **Arquivos pelo Caddy, não pelo Node** (pronto, falta publicar; testado com o Caddy 2.11.7 do servidor, numa instância temporária):
   - Páginas, scripts, estilos, sons e imagens do `public/` saem direto do disco, com compressão (zstd + gzip).
   - A página inicial continua no Node: ela põe a marca do conteúdo de cada script e estilo no endereço (`app.js?v=1a2b3c4d5e`). Os marcados ficam 1 ano no cache; os outros são conferidos a cada uso (ETag).
   - Fotos, emojis e sons enviados pelas pessoas continuam no Node, porque ele confere se o arquivo ainda está em uso. Eles já tinham cache de 1 ano.
   - O Node fica com o tempo real, a página inicial e as rotas que precisam de login ou consulta ao banco.
   - A pasta de dados passa a deixar o Caddy atravessar até os instaladores (751); o banco e os uploads continuam só do serviço (`UMask=0027` e leitura tirada de outros).
6. **Instaladores do Windows (104 MB)** (pronto, falta publicar): servidos pelo Caddy, que atende pedidos de várias faixas, na ordem pedida. As atualizações em partes (blockmap) continuam funcionando. O `latest.yml`, o `android.json` e os links fixos (`Resenhex-Setup.exe`) continuam no Node.
7. **Backups dos uploads** (pronto, falta publicar):
   - A publicação empacota só o banco. Os uploads vão para `/var/backups/resenhex/uploads` por cópia incremental (rsync): só os novos viajam.
   - A cópia guarda também os arquivos que o site apagou. Só o root lê os backups.

**Pronto quando:**
- o coturn não registra mais falta de portas;
- o servidor liga em menos de 5 s com o banco simulado da meta;
- o simulador mostra o teto que sobra. Medido na Fase 0: o das varreduras, 200–300 online, que a Fase 4a tira.

### Fase 2 — Banco de dados sem travar (G)

O Node 22.23 do servidor já traz SQLite embutido (`node:sqlite`, sem instalar nada). Em duas etapas, para não reescrever o servidor todo:

**2a. SQLite como "cofre de pedaços"**
- Os dados continuam em memória como hoje. Muda só a gravação.
- Cada pedaço vira uma linha numa tabela: as mensagens de um canal, um servidor (canais, cargos, emojis), uma conta, as sessões de uma conta, uma conversa privada.
- O código marca o pedaço como alterado. A cada ~1 s, uma transação grava só as linhas alteradas.
- Configuração: modo WAL (leitura não bloqueia gravação) e `synchronous=NORMAL`.
- Na primeira subida, migra do `data.json` sozinho e guarda o arquivo antigo como backup.
- O backup passa a ser `VACUUM INTO` (cópia consistente com o servidor rodando).

**2b. Mensagens fora da memória** (só se a memória apertar)
- Tabela `messages` com índice por canal e hora; a memória guarda só as últimas ~50 de cada canal.
- Também abre caminho para mais de 300 mensagens por canal.

**Risco: o `node:sqlite` ainda é "experimental" no Node 22** (virou "release candidate" no Node 25.7).
- Isolar tudo num módulo pequeno (`server/store.js`), com testes próprios.
- Se der problema, trocar por `better-sqlite3`, que é maduro mas é um módulo nativo que precisa de compilação para ARM.

**Pronto quando:** com um banco simulado de 300 MB, nenhuma gravação trava o servidor por mais de 5 ms, e derrubar o processo no meio perde no máximo 1 s.

**Feito em 24/10 (falta publicar):**
- `server/store.js`: o banco é o `data.db`, com os dados ainda em memória. Cada conta, servidor, sessão, amizade, conversa, bloqueio, envio, clipe, token de e-mail e mensagem é uma linha.
  - Quem muda algo marca o pedaço; uma transação a cada 250 ms grava só os marcados. Derrubar o processo perde no máximo esses 250 ms.
  - Uma conferência lenta (2 ms por segundo) grava o que escapou sem marca e avisa no log. Nos testes (`STORE_VERIFY`), ela só anota a falta.
  - Na primeira subida, importa o `data.json` e guarda o arquivo como `data.json.antes-do-sqlite`.
- **O checkpoint do WAL roda numa `worker_thread`** (`server/store-checkpoint.js`, com conexão própria, a cada 1 s, modo PASSIVE). O automático rodava dentro da gravação a cada ~4 MB e parava o servidor ~150 ms esperando o disco. Se a worker morrer, o automático volta e o log avisa. O `-wal` volta a ter no máximo 32 MB depois de cada checkpoint completo.
- **Início rápido:**
  - as mensagens antigas não entram no início: chegam aos poucos depois que o site abre, 8 ms por vez, e um canal pedido antes é lido na hora, só ele;
  - o SQLite junta as mensagens de cada canal numa lista só (`group_concat`, com um índice por canal que já sai na ordem em que entraram);
  - a conferência do início olha só o root e os servidores, os únicos pedaços que as migrações mexem. O resto fica com a conferência lenta.
- Backup da publicação (`deploy/backup-banco.sh`): `VACUUM INTO` com o site ligado, comprimido. O `node:sqlite` funciona no Node do servidor (22.23.3, SQLite 3.51.3), inclusive numa `worker_thread`.
- A Fase 2b (mensagens fora da memória) não foi necessária: com 1,35 milhão de mensagens, o servidor usou ~950 MB.
- Medido no PC; o ARM é a estimativa (PC × 1,7):

  | Medida | Antes (data.json) | SQLite, 1ª versão | Agora |
  |---|---|---|---|
  | Pior gravação, banco de 50 MB (15 mil contas) | 70–130 ms | — | — |
  | Pior gravação, banco da meta com mensagens (581 MB) | — | 70 ms | **2,8 ms** |
  | Gravações acima de 5 ms (`bench-flush`, 30 s de escrita contínua) | — | 5 de 115, até 152 ms | 1 de 120 (8 ms, a primeira depois da importação) |
  | Início, banco da meta com 1,35 milhão de mensagens | — | 10 s | **2,8 s** (~4,7 s no ARM); as mensagens terminam de chegar ~3 s depois |
  | Memória do Node, 1.000 online nesse banco | — | 980 MB | 941 MB |

- Simulador com o banco da meta e 1.000 online: passou, com atraso p99 de 10 ms e máximo de 71 ms no ARM, e 5,4% de processador.

### Fase 3 — Avisos pequenos, entregues por sala (G)

1. **Salas do socket.io por servidor e por chamada.**
   - Quem está vendo o servidor X fica na sala "servidor X"; quem está numa call fica na sala da call.
   - As salas de call já existem (`voice:<canal>`, usadas para conectar as chamadas e para as prévias). Faltam as salas por servidor e por canal de texto.
   - Conferido no código do socket.io instalado (`socket.io-adapter` 2.5.8): mandar para uma sala **monta a mensagem uma vez** e entrega a todos.
   - Hoje o `flushBroadcast` monta uma mensagem por pessoa.
2. **Mandar só o que mudou:**
   - Eventos pequenos: `voice:update`, `member:update`, `presence:update`, `music:update`.
   - Cada servidor tem um número de versão. O estado inteiro só vai ao entrar, ao trocar de servidor, ao reconectar, ou quando o cliente percebe que pulou uma versão e pede de novo.
   - Mudanças raras (cargos, canais) podem continuar mandando o estado do servidor, mas só para a sala dele.
3. **Canais privados:** a mudança numa sala de voz privada só vai para quem pode ver o canal. Precisa de teste específico, porque é aqui que um descuido vaza informação.
4. **Cliente:** aplica o pedaço no estado local e redesenha só o que mudou (lista de membros, sala de voz). Também deixa o celular mais leve.
5. **Mensagens e "digitando" por sala do canal.**
   - Fim do laço que percorre todo mundo online.
   - A permissão de cada pessoa em cada canal fica guardada até mudar algum cargo ou canal.

**Pronto quando:**
- uma mudança custa < 1 ms com 5 mil online simuladas;
- os bytes por mudança ficam em ~0,3 KB × quem precisa ver;
- os testes de privacidade de canal passam.

### Fase 4a — Parar de percorrer o site inteiro (M)

Vem logo depois da Fase 1, antes do banco: é o teto que chega primeiro (problema 2).

1. **Índices em vez de varreduras:**
   - conexões por conta e por servidor;
   - amizades e conversas por conta;
   - membros por servidor;
   - servidores por conta.
   - Hoje `socialFor`, `communities.list`, `publicProfiles`, `sharedState` e `notifyAccount` percorrem todas as contas, amizades, conversas, servidores ou conexões a cada aviso. Isso cresce com o tamanho do site, não com o tamanho do servidor.
   - O `sharedState` passa a ler os membros do próprio servidor (`server.members`), sem criar um Proxy para cada conta do site.
2. **O que roda em toda mudança:**
   - O `enforceVoice()` passa a rodar só quando muda cargo, canal ou castigo, e o `syncDjRooms()` só quando alguém entra ou sai de uma call.
   - Quem assiste cada transmissão (`viewers`) vem de um índice, em vez de percorrer todas as conexões para cada pessoa em call.

**Pronto quando:** com 50 mil contas e 10 mil servidores no banco simulado, montar o estado de uma pessoa custa menos de 1 ms, e uma mudança custa o mesmo com 5 mil e com 50 mil contas.

**Feito em 24/10 (falta publicar):**
- `server/online.js`: as conexões, com índices por conta, por servidor aberto na tela, por servidor da chamada e por sala de voz. Os campos `serverId`, `voice` e `voiceServerId` atualizam os índices sozinhos quando mudam.
- `server/social.js`: amizades, pedidos, conversas privadas e bloqueios, com índices por conta. Toda mudança nessas relações passa por ele, para o banco e os índices nunca ficarem diferentes.
- `server/communities.js`: os servidores de cada conta, na ordem de criação. Excluir um servidor tira ele dos índices.
- Pelos índices, sem percorrer o site:
  - `socialFor`, `notifyAccount`, `publicProfiles` e `sharedState` (este lê só os membros do próprio servidor);
  - o envio do estado, "digitando", os avisos de canal, o DJ, quem assiste cada transmissão e o Salão do Mudae.
- O `enforceVoice()` confere só as conexões atingidas pela mudança. Todas, só quando muda cargo, canal ou castigo.
- O `syncDjRooms()` continua em todo envio, mas agora só conta as salas que têm DJ.
- Entrar e adicionar amigo pelo nome usam um índice de nomes.
- As fotos e os emojis usam uma lista montada uma vez e refeita só quando alguma imagem muda.
- Medido no PC com o simulador; o ARM é a estimativa (PC × 1,7). Mesmo banco, 15 mil contas:

  | Código | Online | Atraso p99 no ARM | Atraso máx. no ARM | Processador no ARM | Resultado |
  |---|---|---|---|---|---|
  | antes | 300 | 423 ms | 827 ms | 116% | não passou: 75 s para todos conectarem, 249 erros |
  | antes | 600 | — | — | — | não passou: só ~200 de 600 conseguiram ficar conectados |
  | depois | 600 | 128 ms | 160 ms | 29% | não passou (atraso p99) |
  | depois | 1.000 | 23 ms | 269 ms | 23% | não passou (atraso máx.) |
  | depois | 1.500 | 25 ms | 184 ms | 22% | passou |

- O que sobra de travada é a gravação do banco: 70–130 ms a cada 2 s com 17 MB (problema 4, Fase 2). O atraso p99 de 600 online é ela: com pouca gente, as gravações pesam mais na conta.
- **Mesma conta com o banco da meta** (50 mil contas, 12.500 servidores), 1.000 online: atraso p99 de 25 ms no ARM, mas máximo de 585 ms e processador de 52%, porque cada gravação leva 271 ms.
- **Sem a gravação** (numa cópia temporária do servidor que não grava o banco grande), 1.000 online custam o mesmo com 15 mil e com 50 mil contas: 6,4% de processador e 12 ms de atraso p99 no ARM. A meta da fase foi cumprida, e a gravação é ~80% do processador que sobra.
- Testes: `test/indexes.test.js` (novo) confere os índices contra os dados. A suíte inteira passou (431 de 434), com três ressalvas:
  - o teste do app do Windows não roda nesta pasta, porque falta o módulo nativo `uiohook-napi`;
  - um teste de conversas privadas falhou uma vez com a máquina carregada e passou depois;
  - o de convites falhou duas vezes rodando junto com outros arquivos ("Server exited: 1") e passou nas cinco rodadas seguintes.

### Fase 4b — Fotos, prévias e memória (M)

1. **Trabalho pesado no segundo núcleo** (`worker_threads`): recodificar fotos e banners, e qualquer outra coisa que leve mais de ~10 ms. Hoje o segundo núcleo fica quase parado.
2. **Prévias de transmissão:**
   - Só para quem está na sala e **não** está assistindo.
   - A cada 15 s em vez de 8 s.
   - Menores (~480 px, WebP).
   - Deve cortar a rede delas em ~4×.
3. **Memória do Node:** definir `--max-old-space-size` (ex.: 6 GB) no serviço, com alarme acima de 70%.
4. **Ajustes do socket.io recomendados na documentação:**
   - soltar a requisição HTTP inicial guardada em cada conexão (`rawSocket.request = null`, depois de conferir que o login não depende dela);
   - manter a compressão por mensagem desligada (custa processador e memória por conexão).

**Pronto quando:** nenhuma foto trava o servidor por mais de 5 ms, e o custo por mudança é o mesmo com 500 e com 5.000 online simuladas.

### Fase 5 — Chamadas e rede (M)

1. **Medir o retransmissor** com o log ligado na Fase 1: quantas conexões passam por ele e quantos GB por dia.
2. **Senha temporária no retransmissor** (P; pode ir junto com a Fase 1, item 2):
   - Hoje a senha é fixa e igual para todos (problema 5).
   - Trocar por `use-auth-secret` + `static-auth-secret`: a cada login, o servidor gera um usuário e uma senha que valem algumas horas. O app pede novos ao entrar numa call, se os seus já venceram.
   - Limitar alocações por usuário e no total (`user-quota`, `total-quota`).
3. **Teto de banda no coturn** (`bps-capacity` / `max-bps`), calculado para o mês nunca passar de ~7 TB somando tudo. Passar dos 10 TB custa dinheiro.
4. **Transmissão retransmitida mais leve.** Quando o app detecta que a ligação passa pelo servidor (candidato `relay` no `getStats`), a transmissão cai para 720p, ~1,5 Mbps. Quem conecta direto continua com a qualidade cheia.
5. **Salas grandes.** Na malha P2P de hoje, cada pessoa envia para cada outra. Acima de ~5–6 pessoas com câmera ou transmissão, quem pesa é a internet de quem está na sala, não o servidor.
   - Fora da meta (que é de pessoas espalhadas).
   - Se virar problema, as opções são limitar quantos transmitem por sala ou religar o SFU só para salas grandes. O SFU gasta banda do servidor: é uma decisão separada.

**Pronto quando:** a previsão de rede do mês, com 5 mil online, fica abaixo de 7 TB com folga, e há um teto que impede passar disso.

### Fase 6 — Servidores grandes, só se aparecerem (M)

Igual ao Discord:
- **Lista de membros sob demanda acima de ~250 membros:** chegam os online, e o resto vem em páginas ao rolar.
- **Presença dos outros:** só para quem está olhando a lista.

Quem não está olhando um servidor não recebe nada dele (o Discord chama isso de conexão passiva). Isso já sai das Fases 1 e 3.

**Pronto quando:** um servidor de teste com 2.000 membros e 500 online passa nas metas.

### Fase 7 — Proteção e operação (P/M)

1. **Publicar sem derrubar todos de uma vez.**
   - O cliente espera um tempo aleatório (0–30 s) antes de reconectar quando o servidor some.
   - O cliente conecta direto por websocket (`transports: ['websocket']` com `tryAllTransports`, que volta ao modo de requisições HTTP se o websocket falhar). Hoje ele começa por requisições HTTP repetidas e só depois troca, o que dobra as requisições na volta em massa.
   - O servidor aceita as entradas sem travar: o simulador testa com 5 mil voltando juntas.
2. **Limites contra abuso:**
   - conexões por IP;
   - cadastros por IP;
   - revisar os limites que já existem (`allow`).
3. **Disco:** aumentar de 47 GB para até 200 GB (grátis) quando os uploads passarem de ~25 GB; avaliar limite de upload por pessoa.
4. **Alarmes por e-mail** (o envio de e-mail já existe):
   - atraso p99 > 100 ms por 5 min;
   - memória > 70%;
   - disco > 80%;
   - rede do mês > 7 TB;
   - portas do retransmissor > 80%.
5. **Cloudflare grátis na frente** (opcional, acima de ~1.000 online): protege contra ataques e serve os arquivos de cache. Cuidados:
   - uploads até 100 MB;
   - conexão parada cai em ~100 s (o ping do socket.io a cada 25 s resolve);
   - o retransmissor de chamadas (UDP) fica fora e precisa de um endereço sem Cloudflare.
6. **Sessões antigas:** apagar as que estão sem uso há 90 dias. Hoje nunca são apagadas.

---

## 4. Ordem sugerida

1. Fase 1, itens 1, 2 e 3 (avisos por servidor, portas das chamadas, início rápido): resolvem problemas de hoje ou são de poucas linhas. Se der, a senha temporária do retransmissor (Fase 5, item 2) vai junto, para reiniciar o coturn uma vez só. **Prontos.**
2. Fase 0 (medidor + simulador, com o banco do tamanho da meta). **Pronta.**
3. Fase 1, o resto. **Pronto.**
4. Fase 4a (parar de percorrer o site inteiro): era o teto, 200–300 online (medido na Fase 0). **Pronta**: com 15 mil contas, 1.500 online passaram.
5. Fase 2 (banco): era o próximo teto. Com o banco da meta, cada gravação parava o servidor ~0,3 s. **Pronta**: a pior gravação leva 2,8 ms.
6. Fase 3 (avisos pequenos).
7. Fase 4b.
8. Fase 5, o resto.
9. Fase 7.
10. Fase 6 só quando aparecer um servidor grande.

Depois de cada fase: simulador no PC. A publicação é uma só, no fim, com tudo junto (pedido do dono em 24/10): em horário calmo, conferindo quem está online antes, e com uma rodada do simulador no servidor ARM de madrugada.

## 5. Como vamos saber que chegou

O teste final no servidor ARM, numa cópia separada e de madrugada:

1. **Subida:** 5.000 pessoas simuladas entram aos poucos em 10 minutos.
2. **Uso normal:** 30 minutos no ritmo das premissas, mais uma "hora do rush" de 5 minutos com o dobro.
3. **Queda:** derrubar o servidor e medir a volta das 5.000.
4. **Resultado:** o relatório compara com a tabela "O que é sem travar". Se alguma meta falhar, o medidor mostra onde, e isso vira a próxima tarefa.

## 6. Riscos e o que fica de fora

- **Um servidor com milhares de pessoas online ao mesmo tempo** (comunidade pública gigante) exige a Fase 6 e talvez mais.
- **Calls grandes** dependem da internet de quem está nelas (P2P), não do servidor.
- **O `node:sqlite` é experimental no Node 22:** a mitigação está na Fase 2.
- **O gerador de carga num PC de casa** pode não aguentar 5 mil conexões, por causa do roteador e das portas. Se for o caso, dividir entre o PC e o próprio servidor, sabendo que a parte no servidor rouba processador da medição.
- **Os tetos deste plano são estimativas** feitas a partir de medições de partes isoladas (o estado inteiro, as varreduras, a gravação). A Fase 0 confirma cada um com o simulador.
- **As premissas de uso vêm de 8–19 pessoas reais.** O medidor da Fase 0 em produção vai mostrando o ritmo real conforme o site cresce, e o plano se ajusta.
- **A Oracle já cortou o plano grátis uma vez** (junho de 2026: de 4 para 2 núcleos). Se cortar de novo, o plano continua valendo, mas a folga diminui.

## Fontes

- Socket.IO: [ajuste de desempenho](https://socket.io/docs/v4/performance-tuning/), [uso de memória](https://Socket.IO/docs/v4/memory-usage/), [teste de carga](https://socket.io/docs/v4/load-testing/), [salas](https://socket.io/docs/v4/rooms/)
- Node.js: [`node:sqlite`](https://nodejs.org/download/release/v26.3.1/docs/api/sqlite.html)
- SQLite em produção com WAL: [victoria.dev](https://victoria.dev/sqlite-in-production-with-wal), [benchmarks da Forward Email](https://github.com/forwardemail/sqlite-benchmarks)
- Discord: [como serve milhões num servidor (ByteByteGo)](https://blog.bytebytego.com/p/how-discord-serves-15-million-users), [escalando com Elixir](https://medium.com/discord-engineering/scaling-elixir-f9b8e1e7c29b)
- Oracle: [recursos Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm), [corte do plano grátis (InfoQ)](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/), [formatos de máquina](https://docs.cloud.oracle.com/iaas/Content/Compute/References/computeshapes.htm)
- WebRTC/TURN: [quanto precisa de TURN (Metered)](https://www.metered.ca/blog/what-is-a-turn-server/), [No Jitter](https://www.nojitter.com/video-conferencing/know-where-to-turn-when-deploying-webrtc), [Cloudflare Realtime: preços](https://developers.cloudflare.com/realtime/sfu/pricing)
- Cloudflare: [limites de upload](https://fast.io/resources/cloudflare-upload-limit/), [tempo limite de WebSocket](https://community.cloudflare.com/t/cloudflare-websocket-timeout/5865)
