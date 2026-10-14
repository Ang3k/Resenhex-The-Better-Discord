# Transmissão de tela: investigação e melhorias (14/10/2026)

Investigação da transmissão de tela (P2P e SFU), com medições do código do próprio app antes (1.4.6, commit `15429b2`) e depois (1.4.7). Nada entrou sem medição. Onde o ganho não apareceu, o relatório diz.

## Resumo

- **Texto (Automática, Economia, Nitidez):** AV1 com as ferramentas de conteúdo de tela no lugar de VP8. Com três espectadores no P2P, a nitidez foi de **41–46 dB para 52–57 dB** gastando **42% menos envio**. No SFU, de **33–39 dB a 15–23 fps para 52–57 dB a 30 fps**, com **72% menos envio** (0,95 Mbps).
- **Movimento · 1080p / 60:** antes, o navegador baixava a resolução para manter o FPS e o jogo chegava a 270–540p. Agora mantém resolução e FPS (`maintain-framerate-and-resolution`) e só desce de 1080p para 720p quando os quadros caem. Ficou **+2,6 a +3,8 dB** mais nítido, a 55–58 fps (antes 59–60).
- **SFU (LiveKit):** a primeira tentativa rendeu pouco por causa da configuração, não da arquitetura. Eram camadas de 720p a 600 kbps/20 fps e 360p a 150 kbps/10 fps, VP8 para texto, corte de 25% na camada principal e, no H.264, um defeito de negociação que deixava a tela começando a 300 kbps. Corrigido isso, o SFU entrega a todos os espectadores a mesma qualidade que o P2P dá a um só.
- **Começo da transmissão:** numa chamada de verdade, a tela entra numa conexão que já levava o microfone. Em H.264, a estimativa de banda partia de ~300 kbps e levava 20–30 s para passar de 3 Mbps. Agora parte do valor certo, no P2P e no SFU. No SFU com três espectadores, os primeiros 15 s de um jogo foram de **8 fps e 28–29 dB para 31–40 fps e 32–38 dB**.
- **Processador:** quando o AV1/VP9 não dá conta, a transmissão troca para VP8 sem renegociar e sem tela preta para quem assiste.
- **Diagnóstico:** mostra o codificador (e se é por hardware), o limite por processador e, no SFU, se a mídia vai por UDP, TCP ou TURN.

## Como foi medido

Laboratório em [`discord-clone/tools/stream-lab`](../../discord-clone/tools/stream-lab/README.md). Usa o mesmo motor do app de Windows (Electron 44.5.1, Chromium 152), uma janela para quem transmite e uma para cada espectador, e LiveKit 1.13.8 local, a mesma versão do deploy.

- **A "tela"** é um clipe 1080p entregue pela câmera falsa do Chromium. Cada quadro leva um código de barras com o seu número, então cada espectador sabe exatamente qual quadro recebeu. São três clipes: `desktop30` (IDE, chat e planilha com rolagem), `game60` (texturas fractais com câmera em movimento) e `gamehard60` (ruído branco, o pior caso).
- **Qualidade:** PSNR e SSIM da luminância contra o quadro original, no tamanho em que o espectador vê o vídeo (o bloco de 720p é comparado em 720p).
- **Fluidez:** quadros diferentes entregues por segundo e travadas (mais de 100 ms sem quadro novo).
- **Atraso:** da captura até a exibição (`requestVideoFrameCallback`), só no P2P.
- **Código do app:** nos cenários marcados *antes × depois*, quem transmite roda o `MediaSession`, o `MediaPolicy`, o `preferCodec` e o `MediaSfu` de cada versão, carregados do git ou da árvore de trabalho.
- **Banda:** limites de envio com `tc` (HTB) no loopback, só no UDP do WebRTC de cada janela.

**Limites.** A máquina tem 4 núcleos e roda quem transmite e todos os espectadores; com três espectadores ela fica no limite, o que pesa contra os codecs mais caros. Não há codificador por hardware: o H.264 é o OpenH264 em software, enquanto no Windows ele costuma ir para a placa de vídeo. O loopback não tem atraso nem perda (o `tc` daqui não tem `netem`). Diferenças de até ~0,5 dB e de poucos FPS nos cenários com três espectadores estão dentro do ruído.

## Por que o SFU rendeu pouco

| Causa | Efeito medido |
|---|---|
| Camadas de 720p a 600 kbps/20 fps e 360p a 150 kbps/10 fps. O LiveKit entrega a menor camada que cobre o bloco, e quase todo bloco fora da tela cheia recebia a de 720p. | Texto com três espectadores: 39,3 / 34,3 / 33,1 dB a 23 / 15 / 15 fps, com 24–41 travadas em 24 s. O P2P dava 40,6–45,9 dB a 28 fps. |
| Corte de 25% na taxa da camada principal e VP8 para texto, o codec que menos preserva texto (ver Codecs). | A camada cheia ficava abaixo do P2P mesmo no bloco grande. |
| O padrão do SDK para AV1/VP9 em tela é SVC L1T3 e troca o `contentHint` para `motion`, o que tira as ferramentas de conteúdo de tela. | AV1 no padrão do SDK: 47–52 dB a 21 fps, 44 travadas. AV1 em camada única: 52–57 dB a 29 fps, 5–6 travadas e um terço do envio. |
| H.264: o SDK põe `x-google-start-bitrate` no primeiro H.264 da oferta (perfil 42001f), mas o LiveKit negocia o 42e01f. | A estimativa de banda começava em 0,3 Mbps e subia ~8%/s: 0,6 Mbps em 10 s e 2,9 Mbps em 30 s. A camada de 1080p ficava a 1–7 fps. Com o VP8, que tem um payload só, o mesmo caso chega a 6,2 Mbps em 2 s. |
| Possível em produção: UDP 7882 fechado na Oracle faz a mídia ir por TCP, onde perda vira atraso acumulado. | Não dá para medir aqui. Agora o diagnóstico mostra o caminho e o app avisa. |

## O que mudou

| Onde | Antes | Agora | Por quê |
|---|---|---|---|
| `media-policy.js`: codecs de texto | VP8 primeiro | AV1, VP9, VP8, H.264 (o espectador ainda indica o que decodifica por hardware) | AV1 a 1 Mbps (48,7 dB) supera VP8 a 4 Mbps (43,4 dB) no clipe de texto |
| `media-policy.js`: bloco pequeno com texto | Resolução do bloco | Imagem cheia (o navegador de quem assiste reduz), até o conteúdo se mostrar pesado | Texto reduzido no codificador perde legibilidade; reduzido na tela, não |
| `media-session.js`: conteúdo pesado num perfil de texto | — | Codificador perto do limite por 5 s (≥80% da taxa ou do tempo por quadro) → volta à resolução por bloco | Sem isso, um jogo no perfil Automática com três espectadores perdia FPS |
| `media-session.js`: processador no limite | Só reduzia resolução | AV1/VP9 → VP8 por `encodings[0].codec`, sem renegociar, depois de 5 s de limite | O AV1 em software custa 2–4× mais processador que o VP8 |
| `media-policy.js`: Movimento 1080p/60 | `maintain-framerate`, sem degraus | `maintain-framerate-and-resolution`, com degraus 1080p → 720p → 540p quando os quadros caem; `maintain-framerate` onde o valor não existe | Com `maintain-framerate` o Chrome descia para 270–540p mesmo com banda sobrando |
| `app.js` / `media-session.js`: começo da tela em H.264 (P2P) | Estimativa de banda a partir de ~300 kbps | `x-google-start-bitrate` (90% da taxa do espectador) na resposta remota, só nos payloads H.264 da tela, valor fixo por trilha; com a câmera ligada não muda nada | O Chrome só lê esse parâmetro da descrição remota. VP8 e AV1 sobem sozinhos |
| `media-sfu.js`: camadas | 1080p×0,75 + 720p/600 kbps/20 fps + 360p/150 kbps/10 fps | Texto: AV1 numa camada (`simulcast` + `L1T1`), VP8 de reserva. Movimento: H.264 1080p60 + 540p60. Câmera: 720p + 360p a 30 fps | Ver a tabela acima |
| `media-sfu.js`: publicação em H.264 | Ordem de codecs do navegador | Durante a publicação, o 42e01f vem primeiro entre os H.264 | A taxa inicial do SDK cai no codec que o LiveKit negocia |
| Diagnóstico | Sem codificador nem caminho do SFU | Codificador, "por hardware", "limitado pelo processador" e "SFU · UDP / TCP / TURN", com aviso | Distinguir problema de rede, de processador e de porta fechada |

## Resultados

### Codecs (um espectador, sem limite de rede)

Texto (`desktop30`, 1080p30), PSNR por taxa máxima:

| Codec | 1 Mbps | 2,5 Mbps | 4 Mbps |
|---|---|---|---|
| VP8 | 38,7 dB · 19 fps | 42,1 dB · 27 fps | 43,4 dB · 30 fps |
| H.264 | 40,2 dB · 27 fps | 42,3 dB · 30 fps | 42,5 dB · 30 fps |
| VP9 | 40,3 dB · 29 fps | 47,2 dB · 30 fps | 49,2 dB · 30 fps |
| **AV1** | **48,7 dB · 30 fps** | **52,3 dB · 30 fps** | **52,3 dB · 30 fps** |

Camadas temporais em texto: o AV1 L1T3 gasta 72% a mais (1491 × 869 kbps) com a mesma nitidez, e o VP9 L1T3 cai de 48,8 para 40,5 dB. Por isso o SFU publica `L1T1`.

Jogo a 60 fps (`game60`, até 6 Mbps):

| Codec | `maintain-framerate` | `maintain-framerate-and-resolution` |
|---|---|---|
| H.264 | 32,4 dB · 60 fps (resolução reduzida) | **36,0 dB · 56 fps** |
| VP8 | 33,0 dB · 60 fps | 36,2 dB · 48 fps |
| AV1 | 35,5 dB · 36 fps | 36,9 dB · 35 fps |

O AV1 em software não aguenta 60 fps nesta máquina, e o H.264 é o que costuma ter codificador por hardware. Em `balanced`, o VP8 caiu para 18 fps com 29 travadas, contra 30 fps sem travadas em `maintain-framerate`.

### App antes × depois, P2P (10–12 s de aquecimento, 24–30 s de medição)

| Cenário | 1.4.6 | 1.4.7 |
|---|---|---|
| Texto, 3 espectadores (blocos de 1080/720/540) | 42,5 / 40,8 / 46,2 dB · 29–30 fps · 4,7 Mbps de envio · 95–120 ms | **52,2 / 55,8 / 56,5 dB** · 26–28 fps · **2,7 Mbps** · 83–103 ms |
| Jogo 60 fps, 1 espectador | 32,4 dB · 60 fps | **36,2 dB** · 55 fps (repetição: 36,0 dB · 50 fps) |
| Jogo 60 fps, 3 espectadores | 29,6 / 32,3 / 31,9 dB · 59 fps | **32,2 / 35,4 / 34,4 dB** · 56–58 fps |
| Jogo 60 fps, envio limitado a 3 Mbps | 29,5 dB · 60 fps | **31,7 dB** · 58 fps |
| Jogo no perfil Automática, 1 espectador | 37,4 dB · 30 fps · 0 travadas | 37,3 dB · 30 fps · 0 travadas (igual) |
| Jogo no perfil Automática, 3 espectadores | 34,7 / 36,9 / 35,7 dB · 20 / 28 / 29 fps | 36,9 / 37,1 / 35,8 dB · 20 / 23 / 26 fps |

No texto, o FPS caiu 2–4 quadros porque o AV1 em software pesa nesta máquina com quatro janelas. Se o processador não der conta por 5 s, o app passa para o VP8 sozinho. No jogo com três espectadores, a máquina estava saturada e os resultados se misturam: mais nitidez, menos FPS para dois blocos. Ficou registrado como dentro do ruído, não como ganho.

A primeira rodada com o código novo mostrou uma regressão: um jogo no perfil Automática com um espectador caiu para 25 fps. A causa era a imagem cheia para blocos pequenos aplicada a conteúdo pesado. Daí veio a detecção de conteúdo pesado; a linha acima já é a repetição depois da correção.

### App antes × depois, SFU (3 espectadores)

| Cenário | 1.4.6 | 1.4.7 |
|---|---|---|
| Texto | 39,1 / 34,6 / 33,3 dB · 23 / 15 / 15 fps · 24–42 travadas · 3,4 Mbps | **52,5 / 56,1 / 56,7 dB · 30 fps** · 4 travadas · **0,95 Mbps** |

No jogo, a camada de 1080p ficou a 38 fps porque o H.264 em software desta máquina não faz duas camadas a 60 fps; quem assiste em bloco pequeno recebe a de 540p. Os 30–32 dB do bloco de 540p são dessa camada.
| Jogo 60 fps | 32,2 / 32,9 / 32,8 dB · **12 fps · 78–81 travadas** (estimativa de banda presa em 1,9 Mbps) | **35,9 / 38,0 / 31,6 dB · 38 / 38 / 33 fps** · 0–1 travada (8,6 Mbps) |

### Começo da transmissão no meio da chamada

A conexão leva só o microfone por 12 s e então a tela entra. A medição cobre os primeiros 15 s (matriz `inicio.cjs`).

| Cenário | 1.4.6 | 1.4.7 |
|---|---|---|
| P2P, texto, 1 espectador | 42,9 dB · 28 fps · 8 travadas · 2,1 Mbps | **50,7 dB · 31 fps** · 2 travadas · 0,94 Mbps |
| P2P, jogo 60 fps, 1 espectador | 30,0 dB · 59 fps (270–360p o tempo todo) | **32,5 dB** · 47 fps: 1080p a ~29 fps por 7 s (processador), depois 720p a 60 fps |
| SFU, texto, 3 espectadores | 35,4 / 33,3 / 32,6 dB · 21 / 14 / 14 fps · 18–26 travadas | **51,6 / 55,3 / 55,8 dB · 30 fps** · 3 travadas |
| SFU, jogo 60 fps, 3 espectadores | 27,8 / 29,0 / 28,9 dB · **8 fps · 65–68 travadas** | **35,5 / 37,6 / 31,7 dB · 40 / 40 / 31 fps** · 0–1 travada |

No P2P a 60 fps, a versão antiga parecia fluida porque mandava 270p. A nova começa em 1080p, mas o H.264 em software desta máquina não chega a 60 fps em 1080p, e o app desce para 720p depois de 7 s. Com codificação por hardware isso não deve acontecer, mas precisa ser conferido num Windows com GPU.

Por que a taxa inicial importa (experimento à parte, `estimativa-banda.jsonl`): H.264 1080p60 sem perder resolução, a tela entrando 15 s depois do microfone.

| Caso | Estimativa de banda em 2 s / 5 s / 10 s / 20 s | FPS nos primeiros 10 s |
|---|---|---|
| P2P, H.264, sem taxa inicial | 0,4 / 1,0 / 1,4 / 3,1 Mbps | 0–7 |
| P2P, H.264, taxa inicial na resposta remota | 4,8–6,2 Mbps desde 2 s | 26–60 a partir de 2–3 s |
| P2P, VP8 ou AV1, sem taxa inicial | 4,0–6,2 Mbps desde 2 s | normal |
| P2P, H.264, com a câmera já ligada | 5,6 Mbps desde 2 s | normal |
| SFU, H.264, como o SDK negociava | 0,3 / 0,4 / 0,6 / 1,3 Mbps (2,9 Mbps em 30 s) | 1–7, na camada de 540p |
| SFU, H.264, 42e01f primeiro | 7,0 / 9,0 / 10,4 / 10,7 Mbps | 48–57, em 1080p |

A mesma taxa inicial posta na *oferta* local, ou na resposta casada pelo id da trilha, não teve efeito: o Chrome só a lê da descrição remota. Renegociar depois, com ou sem o parâmetro, não gerou quadro-chave nem queda de FPS.

### Internet de envio limitada (P2P, 3 espectadores, envio de 2,5 Mbps)

| | 1.4.6 | 1.4.7 |
|---|---|---|
| Texto | 28,7 / 32,8 / 38,5 dB · 14–30 fps · 8–72 travadas · 222–953 ms | 41,2–46,7 dB · 15–29 fps · 20–46 travadas · 216–404 ms |

Ficou mais nítido e com menos atraso, mas continua travando. No P2P, quem transmite manda uma cópia para cada espectador, e 2,5 Mbps divididos por três não sustentam nenhum codec sem travadas. Nesse caso a saída é o SFU, que envia uma vez só.

## O que não foi resolvido

- **P2P com envio fraco e vários espectadores** continua travando. É o limite da malha, não de configuração.
- **1080p60 em H.264 por software** fica limitado pelo processador; o app desce para 720p. Não foi testado com codificador de GPU.
- **Rede real:** sem atraso e perda simulados, a recuperação de perdas (NACK, PLI) não foi exercitada. Por TCP (UDP 7882 fechado), o SFU deve piorar, e isso agora aparece no diagnóstico.
- **Jogo no perfil Automática com três espectadores:** sem ganho mensurável nesta máquina.

## Recomendações

1. **Ativar o SFU para chamadas com três ou mais espectadores** (`deploy/SFU.md`, seção 1.4.7). Antes, liberar TCP 7881 e UDP 7882 na Oracle. Depois de ativar, cada participante deve aparecer em Conexão e diagnóstico como "Servidor de mídia (SFU) · UDP".
2. **Conferir num Windows com GPU:** 1080p60 em H.264 por hardware (o diagnóstico mostra "Codificação por hardware") e AV1 nos espectadores (decodificação por hardware nas placas a partir de 2020; nas mais antigas, o espectador recebe VP9/VP8).
3. **Pedir para quem transmite informar o upload real** em Configurações. O app reparte a banda com base nesse valor.

## Evidências

Pasta [`transmissao-2026-10-14/`](transmissao-2026-10-14/), uma linha JSON por cenário, com a configuração, as camadas enviadas, o CPU por janela e as métricas de cada espectador (as séries por amostra foram retiradas):

- `codecs.jsonl`: codecs, taxas, modos de degradação e camadas temporais (um espectador).
- `p2p-sfu.jsonl`: P2P × SFU com três espectadores, incluindo a configuração antiga do SFU e o padrão do SDK.
- `validacao.jsonl`: o código do app antes × depois (P2P e SFU), com e sem limite de banda.
- `sfu-app.jsonl`: `MediaSfu` antes × depois contra o LiveKit.
- `inicio.jsonl`: os primeiros 15 s de uma transmissão que começa no meio da chamada, com FPS e PSNR por segundo.
- `estimativa-banda.jsonl`: estimativa de banda, FPS e quadros-chave por segundo nos experimentos da taxa inicial.

Para repetir: `node tools/stream-lab/run.cjs tools/stream-lab/matrices/<matriz>.cjs`, com as matrizes `codecs`, `sfu`, `validacao` e `inicio`.

Testes: `npm run check` OK em 60 arquivos. `npm test`: 296 de 297 aprovados. A falha é `desktop/test/lib.test.js`, que precisa do módulo nativo `uiohook-napi` (`npm install` em `desktop/`) e não tem relação com estas mudanças.
