# Laboratório de transmissão de tela

Mede a qualidade real da transmissão de tela do Resenhex, com o mesmo motor do app de Windows (Electron 44, Chromium 152), codificadores e decodificadores em software e o código de mídia do próprio app. Foi com ele que saíram os números de [`docs/relatorios/TRANSMISSAO-2026-10-14.md`](../../../docs/relatorios/TRANSMISSAO-2026-10-14.md).

## O que mede

Cada cenário abre uma janela para quem transmite e uma para cada espectador. A "tela" é um clipe sintético entregue pela câmera falsa do Chromium; cada quadro leva um código de barras com o seu número, então quem assiste sabe exatamente qual quadro recebeu.

- **Qualidade:** PSNR e SSIM da luminância contra o quadro original, no tamanho em que o espectador vê o vídeo (o bloco de 720p é comparado em 720p). Duas amostras por segundo, calculadas num worker.
- **Fluidez:** quadros diferentes entregues por segundo, travadas (intervalos acima de 100 ms entre quadros novos), congelamentos e quadros perdidos do WebRTC.
- **Atraso:** da captura até a exibição (`requestVideoFrameCallback`), e o buffer de jitter.
- **Custo:** tempo de codificação e decodificação por quadro, CPU de cada janela e banda enviada.

## Requisitos

- Linux com `xvfb-run` e `ffmpeg`.
- Electron do app de Windows: `npm install` em `desktop/` (ou `ELECTRON_PATH` apontando para um Electron 44).
- `npm install` na raiz do `discord-clone/` (LiveKit SDK e Three.js).
- Para limitar a banda (`net` nos cenários): root, porque usa `tc` (HTB) no loopback. Só o UDP do WebRTC de cada janela passa pelos limites.
- Para perder pacotes ou derrubar a rede (`loss`, ou `netEvents` com `loss`, em %; 100 = nenhum pacote passa): root, porque usa o `nftables`. Vale para o UDP de quem transmite, nos dois sentidos.
- Cenários com SFU baixam o LiveKit 1.13.8 (o mesmo do `deploy/instalar-sfu.sh`) na primeira vez, conferindo o checksum.

Clipes, resultados e o LiveKit ficam em `~/.cache/resenhex-stream-lab` (ou em `STREAM_LAB_DIR`).

## Como usar

```bash
node tools/stream-lab/clips.cjs desktop30 game60          # ~1 GB cada; gamehard60 é o pior caso
node tools/stream-lab/run.cjs tools/stream-lab/matrices/validacao.cjs
node tools/stream-lab/report.cjs ~/.cache/resenhex-stream-lab/results/validacao-*.jsonl
```

O terceiro argumento do `run.cjs` filtra cenários pelo nome (expressão regular). Matrizes:

| Matriz | Pergunta |
|---|---|
| `matrices/codecs.cjs` | Qual codec e qual modo de degradação rendem mais, para texto e para jogo? |
| `matrices/sfu.cjs` | P2P × SFU com três espectadores, incluindo a configuração antiga do SFU |
| `matrices/validacao.cjs` | O código do app antes (commit `15429b2`, versão 1.4.6) × agora, com e sem limite de banda |
| `matrices/inicio.cjs` | Os primeiros 15 s de uma transmissão que começa no meio da chamada (`audioFirst`: a conexão leva só o microfone antes) |
| `matrices/queda.cjs` | Quedas de rede de quem transmite: a transmissão volta quando a rede volta? (estados da conexão em `streamer.connection`) |
| `matrices/escada.cjs` | A escada de resolução do 1080p/60 com o processador no limite, e se ela volta para 1080p quando sobra folga (evento `demand`) |

Nos cenários com `app`, quem transmite roda o `MediaSession`, o `MediaPolicy`, o `preferCodec` e o `MediaSfu` daquela versão, carregados do git ou da árvore de trabalho (`working`). Com `audioFirst` (ms), a conexão nasce só com o microfone, como numa chamada de verdade, e a medição começa quando a tela entra; cada espectador traz também `perSecond` (quadros entregues, PSNR e altura em cada segundo). Em `events`, `{ at, type: 'demand', viewers, demand }` muda o pedido de espectadores no meio da medição (por exemplo, `{ background: true }`).

## Limites

- Sem aceleração por hardware: no Windows o H.264 costuma ir para a placa de vídeo e custa bem menos processador do que aqui.
- A máquina de teste tem 4 núcleos e roda quem transmite e todos os espectadores ao mesmo tempo; com três espectadores ela fica no limite, o que exagera o custo de processador.
- O loopback não tem atraso: o `tc` desta máquina não tem `netem`. Os limites de banda são reais (HTB com fila) e a perda também (`nftables`), mas o tempo de ida e volta é quase zero, então reenvios de pacote perdidos (NACK) saem melhores do que numa rede de verdade.
- Os clipes são sintéticos. O de jogo usa texturas fractais; `gamehard60` usa ruído branco, bem mais difícil de comprimir do que um jogo de verdade.
