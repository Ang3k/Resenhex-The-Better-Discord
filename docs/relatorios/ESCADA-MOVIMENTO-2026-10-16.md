# Escada de resolução do Movimento · 1080p / 60 (16/10/2026)

O perfil de 60 fps tinha só quatro degraus (1080p, 720p, 540p, 360p). Ele só descia quando a média ficava abaixo de 30 fps por 5 s, e para subir esperava 20 s perto de 60 fps. Cada subida que falhava dobrava a espera, até 160 s. Na prática, 1080p a 40–45 fps ficava parado em 1080p, e de 720p era difícil voltar.

## Como ficou (`MediaPolicy.ladder`)

- **Degraus finos:** 1080p, 900p, 720p, 540p e 360p. Cada um tem cerca de 30–45% menos pixels que o anterior.
- **Fluidez primeiro.** A cada ~1,5 s, o app compara os quadros enviados com os que o jogo entrega:
  - Abaixo de 85% em duas amostras seguidas (~3 s), desce um degrau.
  - Desce dois de uma vez só quando a conta dos pixels mostra que um não basta. Por exemplo, 25 fps em 1080p vai direto para 720p.
  - Depois de cada troca, espera ~3 s e confere de novo.
- **Subida com previsão:** fluido (90% ou mais) por ~6 s, sobe um degrau se ele cabe.
  - O tempo de codificação previsto não passa do tempo de um quadro. A previsão usa pixels^0,6, porque o tempo cresce menos que os pixels: no H.264 em software foram 11 ms em 720p, 13 ms em 900p e 15–16 ms em 1080p.
  - A banda estimada precisa comportar 75% da taxa do degrau de cima.
  - Só um espectador tenta subir por vez, porque o processador é um só.
- **Subida que falha:** se engasga em até 10 s, volta. Aquele degrau espera 10, 20, 40 e até 60 s para a próxima tentativa. A espera cai quando a folga melhora (codificação 25% mais rápida ou banda 30% maior).
- Jogo rodando abaixo de 60 fps, tela parada e o aviso de banda/processador do navegador, sozinhos, não mexem na resolução.

## Medições (laboratório, código real do app)

`tools/stream-lab`, matriz `escada.cjs`: Electron 44, H.264 em software, 4 núcleos. "Antes" é a 1.6.0 (commit `83b3a38`). Bloco grande = espectador em 1080p.

| Cenário | Antes | Agora |
|---|---|---|
| 1 espectador, sem aperto | 1080p · 36,2 dB · 56,7 fps | 1080p · 36,0 dB · 55,8 fps (igual) |
| 3 espectadores, processador no limite: bloco grande | 1080p · 33,4 dB · **42,7 fps** (28–56 fps a cada segundo) | 900p · 32,2 dB · **54,6 fps** (46–61), sem trocas de degrau em 30 s |
| 3 espectadores, os outros dois blocos | 720p e 540p · 56,8–57,6 fps | 720p e 540p · 58,5–59,3 fps |
| 3 espectadores; aos 20 s, dois vão para segundo plano | 1080p o tempo todo: 34–52 fps no aperto, 55–60 fps depois | 720–900p a 55–60 fps no aperto; **volta para 1080p em 5 s** e fica em 54–60 fps |

No aperto, o bloco grande trocou 1,2 dB de nitidez por 12 fps a mais e bem menos variação. Sem aperto, nada muda. Quando a folga volta, ele sobe de novo: a versão anterior levaria pelo menos 20 s por degrau.

Os testes `test/media.test.js` simulam um codificador no limite e cobrem descer, subir, falhar e esperar.

## Limites

- Medido com H.264 em software. Com codificação na placa de vídeo, o tempo por quadro é bem menor, e a previsão deixa subir mais cedo.
- O SFU continua com as duas camadas (1080p e 540p) e o LiveKit escolhe entre elas. A escada vale para o P2P.

Evidências: [`escada-movimento-2026-10-16/resultados.jsonl`](escada-movimento-2026-10-16/resultados.jsonl), com FPS, PSNR e altura por segundo de cada espectador.
