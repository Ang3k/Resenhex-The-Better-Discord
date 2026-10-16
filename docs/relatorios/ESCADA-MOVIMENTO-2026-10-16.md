# Escada de resolução do Movimento · 1080p / 60 (16/10/2026)

O perfil de 60 fps tinha só quatro degraus (1080p, 720p, 540p, 360p). Ele só descia quando a média ficava abaixo de 30 fps por 5 s, e para subir esperava 20 s perto de 60 fps. Cada subida que falhava dobrava a espera, até 160 s. Na prática, 1080p a 40–45 fps ficava parado em 1080p, e de 720p era difícil voltar.

## Como ficou (`MediaPolicy.ladder`)

O alvo é 1080p a 45–60 fps, com 3 a 5 espectadores. Os degraus de baixo só entram quando faltam.

- **Degraus:** 1080p, 900p e 720p.
- **Fluidez primeiro.** A cada ~1,5 s, o app compara os quadros enviados com os que o jogo entrega:
  - Enquanto a transmissão faz 45 fps ou mais (75% de 60), o 1080p fica.
  - Abaixo disso em três amostras seguidas (~4,5 s), desce um degrau, para 900p, e confere de novo. Se o 900p ainda não der conta, vai para 720p. Um degrau por vez; uma ou duas amostras ruins não bastam.
  - Depois de cada troca, espera ~3 s para assentar.
- **Subida com previsão:** fluido (90% ou mais) por ~8 s, sobe um degrau se ele cabe.
  - O tempo de codificação previsto para o degrau de cima precisa manter pelo menos 52 fps, com folga sobre os 45 fps. A previsão usa pixels^0,6, porque o tempo cresce menos que os pixels: no H.264 em software foram 11 ms em 720p, 13 ms em 900p e 15–16 ms em 1080p.
  - A banda estimada precisa comportar 75% da taxa do degrau de cima.
  - Só um espectador tenta subir por vez, porque o processador é um só.
- **Vários espectadores:** o processador e a internet de envio são de todos. Quando vários engasgam juntos, desce um de cada vez, com ~3 s entre uma descida e outra. Sem isso, no começo de uma transmissão com três espectadores os três desciam juntos, e os blocos pequenos perdiam 4 dB à toa.
  - A primeira versão baixava primeiro o bloco de maior resolução. Agora o bloco menor desce primeiro e o maior volta primeiro: a prioridade é o 1080p de quem assiste em tela cheia manter os quadros. Quem está em segundo plano ou com a tela parada não segura a volta dos outros.
- **Subida que falha:** se engasga em até 10 s, volta. Aquele degrau espera 15, 30, 60 e até 120 s para a próxima tentativa, para não ficar trocando de resolução. A espera cai quando a folga melhora (codificação 25% mais rápida ou banda 30% maior).
- **Blocos sem degraus** (720p ou menos, no P2P): quando o 1080p de alguém engasga, eles passam antes a 30 fps, e só depois o 1080p desce. Voltam a 60 fps com todos no seu tamanho e 30 s sem aperto.
- Jogo rodando abaixo de 60 fps, tela parada e o aviso de banda/processador do navegador, sozinhos, não mexem na resolução.

## Medições (laboratório, código real do app)

As medições abaixo são da primeira versão da escada: descida abaixo de 85% em duas amostras, até dois degraus de uma vez e cinco degraus (1080p a 360p). A versão atual segura o 1080p até 45 fps e desce um degrau por vez; ela não foi medida de novo no laboratório.

`tools/stream-lab`, matriz `escada.cjs`: Electron 44, H.264 em software, 4 núcleos. "Antes" é a 1.6.0 (commit `83b3a38`). Bloco grande = espectador em 1080p.

| Cenário | Antes | Agora |
|---|---|---|
| 1 espectador, sem aperto | 1080p · 36,2 dB · 56,7 fps | 1080p · 36,0 dB · 56,9 fps (igual) |
| 3 espectadores, processador no limite: bloco grande | 1080p · 33,4 dB · **42,7 fps** (28–56 fps a cada segundo) | 900p · 32,3 dB · **54,2 fps**, sem trocas de degrau em 30 s |
| 3 espectadores, os outros dois blocos | 720p e 540p · 56,8–57,6 fps | 720p e 540p · 58,1–59,0 fps |
| 3 espectadores; aos 20 s, dois vão para segundo plano | 1080p o tempo todo: 34–52 fps no aperto, 55–60 fps depois | 900p a 43–61 fps no aperto; **volta para 1080p em 3 s** e fica em 49–60 fps |

No aperto, o bloco grande trocou ~1 dB de nitidez por 12 fps a mais e bem menos variação. Sem aperto, nada muda. Quando a folga volta, ele sobe de novo: a versão anterior levaria pelo menos 20 s por degrau.

**Começo de transmissão no meio da chamada** (o microfone já conectado havia 12 s; primeiros 20 s; média de 3 rodadas de cada):

| Bloco | Antes | Agora |
|---|---|---|
| Grande (1080) | 33,4 dB · **40,8 fps** | 32,2 dB · **54,1 fps** (720p em ~2 s, depois 900p) |
| Médio (720) | 35,2 dB · 57,7 fps | 35,1 dB · 55,6 fps |
| Pequeno (540) | 34,2 dB · 59,1 fps | 34,2 dB · 58,3 fps |

O custo: na troca de resolução do bloco grande, o codificador recomeça com um quadro-chave, e o pico de processamento derrubou o bloco médio para ~30 fps por 1–2 s em duas das três rodadas. Depois disso ele fica igual ao de antes, e o bloco grande segue 13 fps mais fluido.

Os testes `test/media.test.js` simulam um codificador no limite e cobrem descer, subir, falhar e esperar, e também dois espectadores engasgando juntos (só o de 1080p desce; sem a coordenação, o teste falha).

## No servidor de mídia (SFU) e para quem assiste

- **A camada de 1080p60 do SFU** segue a mesma escada (`climbTopLayer` no `public/media-sfu.js`): 1080p, 900p e 720p. A camada de 540p, que é a das miniaturas e de quem tem pouca banda, não muda de tamanho. Antes, a de cima ficava fixa em 1080p, e o laboratório mediu 38 fps num codificador que não dava conta das duas camadas.
- **Processador no limite:** no codificador em software, as duas camadas dividem o tempo de cada quadro (~15,5 ms do 1080p mais ~6,5 ms do 540p, para 16,7 ms a 60 fps). Por isso, antes de baixar o 1080p, a camada de 540p passa a 30 fps. Ela volta a 60 fps com o 1080p de volta e folga para as duas camadas (o tempo previsto cabe em 90% do quadro, depois de pelo menos 10 s).
- **Quem assiste:** a tela recebida ganhou uma folga de reprodução de 120 ms em qualquer aparelho, no P2P e no SFU (antes, só no celular e só no P2P). O quadro-chave do 1080p e a variação da internet chegam dentro dela, em vez de virar engasgo. O custo é ~0,1 s a mais de atraso.

Essas três mudanças não foram medidas no laboratório: ele não tem atraso nem variação de rede, e a escada do SFU depende do codificador de cada máquina.

## Limites

- Medido com H.264 em software. Com codificação na placa de vídeo, o tempo por quadro é bem menor, e a previsão deixa subir mais cedo.
- No SFU, o LiveKit continua escolhendo a camada de cada espectador (1080p ou 540p). A escada muda só o tamanho da de cima.

Evidências: [`escada-movimento-2026-10-16/resultados.jsonl`](escada-movimento-2026-10-16/resultados.jsonl), com FPS, PSNR e altura por segundo de cada espectador.
