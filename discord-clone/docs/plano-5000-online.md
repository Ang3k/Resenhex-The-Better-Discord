# Plano: 5 mil pessoas online no Resenhex, sem gastar nada

Escrito em 24/10/2026. Meta: **5.000 pessoas online ao mesmo tempo, espalhadas em vários servidores**, sem travar e na mesma máquina grátis da Oracle (2 núcleos ARM, 12 GB de memória, 10 TB de rede por mês, até 200 GB de disco).

## Resumo

A máquina aguenta. O que impede hoje é o jeito como o código trabalha:

- ele mandava o estado inteiro para todo mundo a cada mudança (já corrigido, falta publicar);
- ele regrava o banco de dados inteiro a cada mudança;
- ele percorre todo mundo online para entregar cada mensagem.

O plano tem 7 fases. A Fase 0 cria o medidor e o simulador. Com eles, cada mudança é medida antes e depois, e a meta só conta como batida quando o simulador mostrar 5 mil pessoas sem travar.

| Fase | O quê | Tamanho | Ganho |
|---|---|---|---|
| 0 | Medidor de saúde no servidor + simulador de 5 mil pessoas | M | Saber, em vez de chutar |
| 1 | Consertos rápidos: avisos por servidor (pronto), portas das chamadas, arquivos pelo Caddy, gravação garantida | P | Tira o teto de ~400 e conserta falhas que já acontecem |
| 2 | Banco de dados SQLite, gravando só o que mudou | G | Tira o teto de ~1.000 (travadas ao salvar) |
| 3 | Avisos pequenos ("fulano mutou") entregues por sala | G | Processador e rede ~10–50× menores por mudança |
| 4 | Tirar do caminho o que trava: índices, fotos em outro núcleo, prévias mais leves | M | Custo por mudança não cresce com o total de pessoas |
| 5 | Chamadas e rede: medir e limitar o que passa pelo servidor | M | Não estourar os 10 TB grátis |
| 6 | Servidores grandes (só se aparecerem) | M | Comunidades com centenas online |
| 7 | Proteção e operação: reconexão em massa, alarmes, disco | P/M | Publicar sem derrubar todo mundo; dormir tranquilo |

P = horas, M = 1–2 dias, G = vários dias. Cada fase é testada e publicada sozinha.

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
2. **Banco num arquivo só, regravado inteiro.**
   - O servidor fica parado enquanto prepara o arquivo: ~0,2 s com 50 MB e ~1,3 s com 300 MB.
   - Na proporção de hoje (6,2 KB por conta, e os canais ainda longe do limite de 300 mensagens), 5 mil online dariam de 50 a 300 MB.
   - Tem também um defeito: o `save()` adia a gravação a cada mudança nova. **Com atividade sem pausa de 0,3 s ele não grava nunca**, e se o servidor cair, perde tudo desde a última pausa.
   - E duas gravações podem se atropelar no mesmo arquivo temporário.
3. **Retransmissor de chamadas sem portas.**
   - O coturn (o servidor que passa as chamadas de quem está atrás de rede restrita) tem só **41 portas** (49160–49200).
   - Cada conexão de chamada pede 2 portas (UDP e TCP). Uma sala de 5 pessoas pode ocupar as 41 sozinha.
   - **Ficou sem portas 435 vezes na noite de sexta, 23/10, entre 21h e 2h, e mais 21 vezes no sábado à tarde.** Nessas horas, quem precisava do retransmissor não conseguia se conectar na call.
4. **Mensagens e "digitando" percorrem todo mundo online.** Para cada mensagem, o servidor passa por todas as conexões e confere a permissão uma a uma (`emitToViewers`). Há 16 laços assim no `server.js`.
5. **Fotos de perfil processadas no mesmo núcleo do servidor.** O `pngjs` recodifica cada imagem e deixa o servidor parado:

   | Imagem | Tempo parado no servidor |
   |---|---|
   | 256 px | ~18 ms |
   | 512 px | ~57 ms |
   | 1024 px | ~220 ms |

6. **O Node serve arquivos.**
   - Páginas, scripts (1,5 MB, 0,4 MB comprimido), fotos e os instaladores do Windows (104 MB cada) passam pelo processo que também cuida do tempo real.
   - Os scripts não têm cache longo.
7. **Prévias das transmissões passam pelo servidor.**
   - É uma foto de 768×432 a cada 8 s, para todos na sala, mesmo quem já está assistindo.
   - Com 150 pessoas transmitindo, dá ~1–3 MB/s.
8. **Backups.** Cada publicação empacota o banco **e todos os uploads**. Hoje são 112 MB por publicação; com 50 mil contas, seriam dezenas de GB.
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
  - Uma mudança custa ~0,2–0,5 ms (aviso pequeno, montado uma vez e entregue à sala).
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
  - A Fase 5 mede e põe teto, para o site e o retransmissor juntos ficarem abaixo de 7 TB.
- **Disco:** 111 MB para 88 contas → ~60 GB para 50 mil. A Oracle dá até 200 GB grátis.
- **Conexões:** sobra (524 mil permitidas; 16 mil portas no retransmissor depois da Fase 1).

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
- Cada pessoa simulada segue o roteiro das premissas: conversa, digita, entra e sai de call, muta, troca de servidor, muda status e reconecta.
- Tem um modo de **reconexão em massa** (todo mundo cai e volta em 1 minuto).
- Roda em vários processos, porque um só não aguenta 5 mil conexões. Gera um relatório com as metas da tabela acima: passou ou não passou.
- **Onde roda:**
  - No PC, para comparar antes e depois (multiplicando por ~1,7 para o servidor ARM).
  - Ao fim de cada fase, uma rodada no próprio servidor ARM de madrugada: numa cópia separada (outra porta, dados de teste, sem tocar no Resenhex de verdade), com o gerador no PC.
- **Armadilha conhecida:** criar servidor tem limite de 5 por minuto. Os servidores de teste precisam ser criados direto no banco, senão o teste mede outra coisa.

**Pronto quando:** o simulador reproduz os números de 24/10 e mostra onde está o teto atual.

### Fase 1 — Consertos rápidos (P cada)

1. **Publicar "avisar só quem é afetado"** (`9765b48`, pronto). Antes, conferir quem está online, porque a publicação derruba as calls.
2. **Portas do retransmissor de chamadas** (já falha hoje):
   - Ampliar de 49160–49200 (41 portas) para 49152–65535 (~16 mil).
   - Liberar na regra do iptables do servidor e na lista de segurança da Oracle (pela API, com a chave que já existe).
   - Ligar o log de uso do coturn, para medir quanto tráfego passa por ele.
   - Avaliar se o TURN por TCP precisa ser oferecido sempre, porque ele dobra as portas por conexão.
3. **Gravação garantida.** Até a Fase 2 chegar:
   - O `save()` grava no máximo a cada 2 s, mesmo com atividade sem pausa.
   - Uma gravação nunca começa antes da anterior terminar.
4. **Arquivos pelo Caddy, não pelo Node:**
   - Páginas, scripts, fotos, emojis, sons e instaladores saem direto do disco, com compressão (gzip + zstd).
   - As fotos já têm nome de hash, então podem ter cache de 1 ano.
   - Scripts e CSS levam a versão no endereço (`?v=1.9.0`) e também podem ter cache longo.
   - O Node fica só com o tempo real e as rotas que precisam de login.
5. **Instaladores do Windows (104 MB):** servidos pelo Caddy, ou pelo GitHub Releases (rede grátis e ilimitada) se o repositório for público. Manter as atualizações em partes (blockmap), para quem já tem o app baixar só o que mudou.
6. **Backups dos uploads:**
   - Parar de empacotar todos os arquivos a cada publicação.
   - Como o nome é o hash, uma cópia incremental (rsync) só leva os novos.
   - O banco continua com cópia a cada publicação.

**Pronto quando:** o simulador passa de ~400 online sem travar e o coturn não registra mais falta de portas.

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

### Fase 3 — Avisos pequenos, entregues por sala (G)

1. **Salas do socket.io por servidor e por chamada.**
   - Quem está vendo o servidor X fica na sala "servidor X"; quem está numa call fica na sala da call.
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

### Fase 4 — Tirar do caminho o que trava (M)

1. **Índices em vez de varreduras:**
   - conexões por conta e por servidor;
   - amizades e conversas por conta;
   - membros por servidor.
   - Hoje `notifyAccount`, `socialFor`, `sharedState` e `publicProfiles` percorrem todas as contas, amizades ou conexões a cada aviso, e isso cresce com o tamanho do site, não com o tamanho do servidor.
2. **Trabalho pesado no segundo núcleo** (`worker_threads`): recodificar fotos e banners, e qualquer outra coisa que leve mais de ~10 ms. Hoje o segundo núcleo fica quase parado.
3. **Prévias de transmissão:**
   - Só para quem está na sala e **não** está assistindo.
   - A cada 15 s em vez de 8 s.
   - Menores (~480 px, WebP).
   - Deve cortar a rede delas em ~4×.
4. **Memória do Node:** definir `--max-old-space-size` (ex.: 6 GB) no serviço, com alarme acima de 70%.
5. **Ajustes do socket.io recomendados na documentação:**
   - soltar a requisição HTTP inicial guardada em cada conexão (`rawSocket.request = null`, depois de conferir que o login não depende dela);
   - manter a compressão por mensagem desligada (custa processador e memória por conexão).

**Pronto quando:** o custo por mudança é o mesmo com 500 e com 5.000 online simuladas.

### Fase 5 — Chamadas e rede (M)

1. **Medir o retransmissor** com o log ligado na Fase 1: quantas conexões passam por ele e quantos GB por dia.
2. **Teto de banda no coturn** (`bps-capacity` / `max-bps`), calculado para o mês nunca passar de ~7 TB somando tudo. Passar dos 10 TB custa dinheiro.
3. **Transmissão retransmitida mais leve.** Quando o app detecta que a ligação passa pelo servidor (candidato `relay` no `getStats`), a transmissão cai para 720p, ~1,5 Mbps. Quem conecta direto continua com a qualidade cheia.
4. **Salas grandes.** Na malha P2P de hoje, cada pessoa envia para cada outra. Acima de ~5–6 pessoas com câmera ou transmissão, quem pesa é a internet de quem está na sala, não o servidor.
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

1. Fase 1, itens 1 e 2 (avisos por servidor e portas das chamadas): já resolvem problemas de hoje.
2. Fase 0 (medidor + simulador).
3. Fase 1, o resto.
4. Fase 2 (banco).
5. Fase 3 (avisos pequenos).
6. Fase 4.
7. Fase 5.
8. Fase 7.
9. Fase 6 só quando aparecer um servidor grande.

Depois de cada fase: simulador, publicação em horário calmo (conferindo quem está online antes), e uma rodada do simulador no servidor ARM de madrugada.

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
