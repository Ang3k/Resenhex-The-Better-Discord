# Melhorias garantidas (16/10/2026)

Só entrou o que dava para provar com medição ou com um teste que falhava antes e passa depois. O que foi testado e não melhorou está no fim, com o motivo.

Laboratório: `discord-clone/tools/stream-lab`, com o código real do app (Electron 44, Chromium 152). Quedas e perda de pacotes são feitas com o nftables no UDP de quem transmite.

## 1. Chamadas voltam sozinhas depois de uma queda de rede

**O defeito.** Quando a conexão com alguém voltava sozinha de uma queda curta, o `public/app.js` cancelava o timer de recuperação, mas deixava ele guardado em `peer.recoveryTimer`. O `scheduleRecovery` desiste quando esse campo está preenchido, então nenhuma tentativa automática acontecia mais com aquela pessoa até o fim da chamada. Além disso, eram só 3 tentativas, a cada 5 s. Numa queda de mais de ~20 s elas acabavam antes de a rede voltar, e a conexão ficava em "failed" até alguém clicar em Reconectar.

**A correção** (`MediaSession.connectionChanged` e `scheduleRecovery`):
- Quando a conexão volta, a espera é apagada de verdade.
- O app segue tentando enquanto a pessoa estiver na chamada: a cada 5 s no primeiro minuto, depois a cada 15 s, por até 5 minutos. O aviso "Reconectar" continua aparecendo a partir da terceira tentativa.
- Quando o sistema avisa que a internet voltou (evento `online`), o app tenta na hora.

**Medição** (matriz `queda.cjs`: tela 1080p30, 1 espectador; "antes" é o commit `19dd1e7`):

| Cenário | Antes | Agora |
|---|---|---|
| Queda de 7 s que volta sozinha e, depois, queda de 45 s (a rede volta aos 75 s) | Nenhuma tentativa na segunda queda; "failed" aos 45 s; **imagem parada até o fim** (30 s depois de a rede voltar) | Tentativas a cada 5 s; reconecta **aos 75,0 s**, imagem de volta no mesmo segundo |
| Uma queda de 40 s (a rede volta aos 50 s) | 3 tentativas (20, 25 e 30 s) e desiste; "failed" aos 45 s; **imagem nunca volta** | Reconecta **aos 50,0 s**; imagem de volta em 2 s |

Teste: `test/media.test.js` cobre a sequência que disparava o defeito (cai, volta sozinha, falha de novo), a tentativa continuada e o evento `online`.

Evidências: [`melhorias-2026-10-16/quedas.jsonl`](melhorias-2026-10-16/quedas.jsonl), com os estados da conexão (`streamer.connection`) e os quadros por segundo de cada espectador.

## 2. Os padrões novos (Nitidez e 50 Mbps) não pioram quem tem menos internet

O perfil padrão passou a ser Nitidez · 1080p / 30 e o upload padrão, 50 Mbps. (Depois, a pedido, o perfil padrão passou a ser Movimento · 1080p / 60; o upload continuou em 50 Mbps.) O risco seria quem envia menos que isso, transmitindo para várias pessoas no P2P: o app planejaria mais banda do que a conexão comporta. O teste limitou o envio de verdade com `tc`:

| Envio real | Cenário | Declarando o valor real | Declarando 50 Mbps |
|---|---|---|---|
| 10 Mbps | jogo 60 fps, 3 espectadores | 8,1 Mbps enviados · 32,2 / 35,4 / 34,3 dB · 55–59 fps · 0 travadas | 7,9 Mbps · 32,8 / 34,1 / 33,9 dB · 55–59 fps · 0 travadas |
| 5 Mbps | texto (Nitidez), 3 espectadores | 2,0 Mbps · 46–50 dB · 26–29 fps | 2,0 Mbps · 42–50 dB · 26–28 fps |

O estimador de banda de cada conexão já se ajusta à internet de verdade: declarar 50 Mbps não piorou nada que desse para medir. A variação entre as duas colunas é da ordem da variação entre rodadas.

Nitidez × Automática com envio real de 5 Mbps e 3 espectadores, em texto: no bloco grande, Nitidez deu 48,8 dB, 27 fps e 21 travadas. Automática reduziu a resolução e ficou pior: 37,4 dB, 18 fps e 41 travadas, com 1,4 s de atraso. Nos blocos pequenos os dois perfis empataram.

Evidências: [`melhorias-2026-10-16/padroes.jsonl`](melhorias-2026-10-16/padroes.jsonl).

## 3. Testes que falhavam sem defeito no app

- `test/recovery-server.test.js`, "cadastro, confirmação e senha nova pelo link": o teste entrava na conta sem senha, a sessão não existia e o aviso de senha trocada nunca chegava. Falhava sempre, também no `main`. Com a senha, passa e confirma que trocar a senha pelo link encerra as outras sessões.
- `test/recovery-server.test.js`, "a sessão fica sabendo se o link de confirmação saiu": o ouvinte do evento entrava depois do login, e com a suíte rodando em paralelo o evento chegava antes. O app registra os ouvintes antes, então só o teste tinha esse problema.
- `deploy/smoke-test.js`: apagava a pasta temporária enquanto o servidor ainda escrevia nela (ENOTEMPTY). Agora espera o servidor sair.

Com isso, `npm test` passou duas vezes seguidas com 337 de 338. A única falha é `desktop/test/lib.test.js`, que precisa do módulo nativo `uiohook-napi` (`npm install` em `desktop/`). Numa terceira rodada, `test/servers.test.js` ("moderation affects only that membership") falhou uma vez: sozinho, passou 5 de 5 vezes, também no `main`. É outra corrida de teste com a suíte em paralelo e ficou como estava.

Com os testes das seções 4 e 5, `npm test` fica em 347 de 348, com a mesma falha do `desktop/`.

## 4. Defeitos de chamada encontrados numa revisão do código

Uma revisão do código de chamada e transmissão levantou oito suspeitas. Cada uma só virou correção depois de reproduzida com o código real do app: o teste novo falha na versão anterior e passa com a correção. Os testes de `public/app.js` rodam a interface inteira no JSDOM, com o socket e as conexões simulados.

| Defeito | Quando acontecia | Correção | Teste |
|---|---|---|---|
| A oferta de conexão de quem entra logo depois de nós se perdia: as duas pessoas ficavam na sala sem se ouvir até alguém sair e entrar | O servidor já nos pôs na sala, mas a chamada ainda não começou aqui, porque falta a resposta do `voice:media`. Quem entra nessa janela já manda a oferta, e o `app.js` descartava sinais fora de chamada. A janela é maior quando a primeira pessoa tem internet lenta, como quando todo mundo volta junto depois de uma queda do servidor | Os sinais que chegam depois da resposta do `voice:join` ficam guardados e são aplicados quando a chamada começa, na mesma ordem. Os de quem sai antes disso são descartados | `server-ui.test.js`, "quem entra logo depois conecta". Antes: nenhuma conexão, nenhuma resposta. Agora: oferta aplicada, candidato aplicado e resposta enviada, e nenhuma conexão com quem já saiu |
| Depois de cair do servidor de mídia para conexão direta, ninguém que já estava na sala conectava | O SFU aceitava a sala e depois falhava (por exemplo, "publication of local track timed out"). As pessoas do SFU continuavam em `state.peers` com uma conexão de mentira, e o `getPeer` devolvia essa no lugar de criar uma de verdade | `MediaSfu.disconnect` tira as pessoas que vieram do SFU (`closePeer`) | `server-ui.test.js`, "servidor de mídia que falha depois de entrar". Antes: 0 conexões e "pc.setRemoteDescription is not a function" na oferta de quem estava lá. Agora: 1 conexão e oferta aplicada |
| No SFU, as vozes saíam na saída padrão do sistema, e não no fone escolhido | Sempre que a pessoa escolheu outra saída de áudio, até trocar a saída de novo durante a chamada. O `media-sfu.js` lia `state.outputDeviceId`, um campo que não existe; o app guarda a escolha em `state.speakerDeviceId` | O campo certo | `media-sfu-client.test.js`, "SFU voices play on the chosen speaker". Antes: nenhum `setSinkId`. Agora: `setSinkId('headset')` |
| Quem voltava a assistir depois de uma troca para uma fonte com som não recebia o som | A transmissão começou sem áudio (uma janela, por exemplo), a pessoa parou de assistir e a fonte trocada tinha som. A sincronização só adicionava trilhas quando não havia nenhuma | `addVideoTracks` adiciona as trilhas que ainda não têm envio naquela conexão | `media.test.js`, "comes back after a switch to a source with sound". Antes: só vídeo. Agora: vídeo e áudio da fonte nova |
| Quem começava a assistir no meio de uma troca de tela ficava com a fonte antiga, já parada | A troca percorre as conexões uma por uma. Quem começava a assistir depois de a troca ter passado por ele recebia as trilhas antigas, que a troca para logo em seguida | Ao fim da troca, todas as conexões são conferidas de novo com as trilhas novas | `media.test.js`, "someone who starts watching during a source switch". Antes: `video:ended` e `audio:ended`. Agora: as trilhas novas, ativas |
| Um pico de um instante, ao voltar a assistir, trocava a transmissão para o VP8 ou para o modo de movimento | As contagens de 5 s (processador no limite, conteúdo pesado) ficavam guardadas quando a pessoa parava de assistir. Na volta, a primeira amostra ruim somava o tempo em que ela não estava assistindo | Parar de assistir zera essas contagens e a medida do tempo de codificação | `media.test.js`, "a viewer who comes back starts the 5 s CPU and heavy-content counts over". Antes: VP8 na primeira amostra, dez minutos depois. Agora: só depois de 5 s seguidos |
| Em Automática e Economia, a volta da resolução demorava mais que o necessário | O nível descia até o 4º degrau mesmo quando o espectador já estava no menor tamanho, e cada degrau a mais custava 12 s na volta | O nível para no último degrau que ainda reduz a resolução daquele espectador (`MediaPolicy.stepHeights`) | `media.test.js`, "automatic quality stops at the last step". Economia depois de 30 s de aperto: volta para 720p em 24 s (antes, 36 s). Miniatura de 360p: não desce degraus que não existem |

**Examinado e sem mudança:** um `media:switch` (o servidor de mídia caiu) que chega enquanto a pessoa ainda entra é ignorado. Mas, nesse caso, a entrada pelo SFU falha e já cai para a conexão direta sozinha, então não deu para montar um caso em que a pessoa ficasse sem chamada.

## 5. Som da tela em estéreo no P2P

**O defeito.** Na conexão direta (P2P, o modo sem o LiveKit e o modo de reserva quando ele cai), o som da tela chegava mono: jogo, música e vídeo perdiam o lado de cada som. O Chrome só decodifica Opus em estéreo quando a descrição **local** de quem recebe pede (`stereo=1`), e só codifica em estéreo quando a descrição **remota** de quem envia pede. O app não pedia em nenhuma das duas. No SFU, o SDK do LiveKit já pede (`forceStereo`), e lá o som chegava estéreo.

**Como foi medido** (`tools/stream-lab/estereo.cjs`, Electron 44): 440 Hz só no canal esquerdo e 1000 Hz só no direito. Quem recebe separa os canais e mede cada tom. Em mono, os dois canais trazem os dois tons.

| Onde está `stereo=1` | Canal esquerdo (440 / 1000 Hz) | Canal direito (440 / 1000 Hz) | Resultado |
|---|---|---|---|
| Em nenhum lugar (como era) | −32 / −32 dB | −32 / −32 dB | mono |
| Só na descrição remota de quem envia | −32 / −32 dB | −32 / −32 dB | mono |
| Só na descrição local de quem recebe | −32 / −32 dB | −32 / −32 dB | mono |
| Só nas duas descrições remotas | −32 / −32 dB | −32 / −32 dB | mono |
| Na local de quem recebe e na remota de quem envia | −26 / −128 dB | −82 / −30 dB | **estéreo** |
| SFU (LiveKit 1.13.8, opções do `media-sfu.js`) | −26 / −121 dB | −82 / −30 dB | estéreo |

A taxa ficou em ~96 kbps nos dois modos, o limite que o app já põe no som da tela.

**A correção** (`applyLocalDescription` no `public/app.js`, `MediaPolicy.audioMids` e `opusStereo`): quem assiste pede `stereo=1` na própria descrição local, só nas seções de áudio que trazem a transmissão da outra pessoa (pelo id da transmissão no `a=msid`). Essa descrição vai pela sinalização e vira a remota de quem transmite, então um pedido cobre os dois lados. A voz continua mono. Sem som de tela chegando, a negociação segue como antes. Um navegador que não aceite a descrição alterada segue em mono, como antes.

**Medição com o código do app** (P2P, conexão aberta pela pessoa que entra, depois a tela com som):

| Momento | Antes | Agora |
|---|---|---|
| A tela com som entra | mono (−32 / −32 · −32 / −32) | estéreo (−26 / −118 · −84 / −26) |
| Quem assiste liga a câmera (a renegociação é dele) | mono | estéreo (−26 / −115 · −76 / −26) |
| Quem assiste reinicia o ICE (recuperação) | mono | estéreo (−26 / −115 · −76 / −30) |
| Voz | mono | mono |

A conexão ficou conectada do começo ao fim nos dois casos. Testes: `test/media.test.js` ("screen audio asks for Opus stereo only in its own section") e `test/server-ui.test.js` ("som da tela de quem transmite em estéreo", com a resposta enviada, a renegociação própria, a conexão sem tela e o navegador que recusa a descrição alterada). Sem a mudança no `app.js`, o teste de interface falha.

Evidências: [`melhorias-2026-10-16/estereo.jsonl`](melhorias-2026-10-16/estereo.jsonl).

## Testado e descartado

- **Reiniciar o ICE quando a conexão volta sozinha**, para a estimativa de banda recomeçar alta. Depois de uma queda curta, a imagem passa ~7 s a 1–8 fps porque a estimativa cai para ~450 kbps. A reinicialização aconteceu, mas a rota de rede continua a mesma e o navegador não refaz a estimativa: 1–5 fps nos mesmos ~7 s. Sem ganho, não entrou.
