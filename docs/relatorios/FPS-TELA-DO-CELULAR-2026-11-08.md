# fps da tela do celular: antes e depois (08/11/2026)

Pedido do dono: testar várias configurações, mudar o que precisar e mostrar o fps médio antes e depois. Tudo foi medido no **emulador do Android com a placa de vídeo do PC** (o mais perto de um celular que dá para ter aqui), com a tela inteira transmitida, alguém **mexendo no celular** sem parar (rolando a lista dos Ajustes) e um PC assistindo. O número é **quantos quadros por segundo o PC que assiste recebeu e mostrou**, em média, em janelas de 70 s.

Nada foi publicado. O código está na branch `claude/tela-celular`.

## Resultado

**Média de todas as rodadas válidas: antes 2,4 fps → agora 9,1 fps (3,8 vezes mais).**
**Com o emulador folgado (recém-aberto, nada mais rodando): antes 6 fps → agora 13 fps.**

"Antes" é o código que está no ar (2.5.0, APK 1.4.1). "Agora" é a branch com as três mudanças abaixo e o APK 1.4.2.

| Rodada | Situação do emulador | Antes | Agora |
| --- | --- | --- | --- |
| Manhã, uma de cada | folgado | 6,6 | 14,5 |
| Dupla alternada | recém-aberto | 5,3 | 12,4 |
| Duplas alternadas | aberto há uns 10 min | 2,7 · 0,6 | 12,4 · 5,5 |
| Duplas alternadas | aberto há mais de 1 h, já lento | 1,4 · 1,5 · 0,6 · 0,3 | 6,0 · 7,3 · 5,6 |
| **Média** | | **2,4** (8 rodadas) | **9,1** (7 rodadas) |

O que muda no caminho, numa rodada folgada (a dupla de 5,3 × 12,4):

| Etapa | Antes | Agora |
| --- | --- | --- |
| Quadros que saem do celular por segundo | 17,1 | 23,8 |
| Quadros que a página decodifica por segundo | 15,9 | 23,4 |
| Quadros pulados pela regra de atraso (70 s) | 77 | 23 |
| Tempo do codificador da call por quadro | 152 ms | 42 ms |
| Limite que a regra de atraso deixou | 15 fps | 60 (não cortou) |
| PC recebe | 5,3 fps | 12,4 fps |

Ficaram de fora: rodadas em que a transmissão não chegou a começar ou o PC não estava assistindo, uma dupla em que duas séries de teste se misturaram por engano, e tudo depois das 14:28, quando o PC passou a rodar um jogo (que divide o processador e a placa de vídeo com o emulador).

## Onde os quadros se perdiam

O caminho é: tela do celular → codificador do celular → página do Resenhex (decodifica) → WebRTC codifica de novo → PC.

1. **A cópia de volta da placa de vídeo.** O WebView só decodifica H.264 pela placa de vídeo. Cada quadro decodificado fica lá, e o codificador da call precisa copiá-lo de volta para o processador antes de codificar. No emulador, isso fazia cada quadro levar de 118 a 238 ms (às vezes mais de 600 ms) para codificar, e a call ficava em poucos quadros por segundo.
2. **Captura sempre em 720p.** O celular capturava e decodificava 720p mesmo quando o PC via a tela num quadro pequeno (360p ou menos). O trabalho a mais não aparecia em lugar nenhum.
3. **O rolo do Clipar.** Enquanto você transmite, o Clipar grava os últimos 30 s da sua tela: uma segunda codificação em 1280×720 a 30 fps, com cada quadro desenhado numa tela intermediária. No emulador, o codificador do rolo aparecia com 24% do processador.

## O que mudou

| Mudança | Onde | O que faz |
| --- | --- | --- |
| Captura em **VP8** | APK 1.4.2 (`ScreenService.java`, `ScreenFeed.java`, `MainActivity.java`) e `android-screen.js` | O celular codifica a tela em VP8 e a página decodifica por software (libvpx). O quadro já sai na memória do processador, sem a cópia de volta da placa de vídeo. Se o VP8 falhar (no celular ou na página), volta sozinho para o H.264, e depois para o JPEG. Celular com APK antigo continua no H.264. |
| Captura **no tamanho que se assiste** | `media-session.js` (`phoneCapture`) | O celular captura no maior tamanho que alguém está vendo (até o do perfil). Quando alguém abre a tela grande, a captura cresce. |
| **Rolo leve do Clipar** para a sua tela do celular | `clip-screen.js` (`recordLight`), `app.js` (`clipScreenSync`), `clip-render.js` | Grava o quadro como chega, no tamanho da captura, a 15 fps, sem tela intermediária. No clipe, a tela em pé aparece inteira no meio, sem esticar. |
| Laboratório | `server/lab.js`, `lab-tela.js`, `index.html` | A "Captura do celular" ganhou automática (padrão) e VP8. |

## O que mais foi testado

Todas no emulador com a placa de vídeo, mexendo no celular, em rodadas de 70 s:

| Teste | PC recebe | Resultado |
| --- | --- | --- |
| Código no ar (H.264 do celular, captura em 720p) | 6,6 fps | ponto de partida |
| VP8 do celular + captura no tamanho que se assiste | 11,3 fps | entrou |
| + rolo leve do Clipar | 14,5 fps | entrou |
| + captura a 20 fps em vez de 30 | 12,1 fps | não ajudou: o celular mandou 18/s, mas a call continuou em 15; ficou nos 30 |
| Regra de atraso desligada (antes das mudanças) | pior | ficou ligada: decodificar quadros que a call vai jogar fora só gasta processador |
| H.264 decodificado por software na página | não abre | o WebView diz que aceita, mas recusa na hora de configurar; por isso o VP8 |
| Emulador sem placa de vídeo (tudo por software) | 3,6 → 5,5 fps | também melhora |

O que sobrou de gargalo, mesmo agora: o codificador da call. O celular entrega 23 a 25 quadros por segundo e a call manda 12 a 15. No emulador o codificador é o VP8 por software do WebView (libvpx); num celular de verdade ele divide o processador com o jogo.

## Cuidados

- São números do **emulador**. Num celular de verdade o processador e a placa de vídeo são outros, e os números absolutos mudam. A comparação antes × depois, nas mesmas condições, é o que vale.
- O emulador varia muito e fica mais lento quanto mais tempo fica aberto (a mesma versão deu 14,5 de manhã e 6,0 uma hora depois). Por isso as rodadas finais foram **alternadas** (antes, depois, antes, depois…), com a página recarregada a cada uma, e a tabela separa as rodadas pela situação do emulador. Em todas as situações, o "agora" ganhou.
- A parte do VP8 só vale com o **APK 1.4.2**. Com o 1.4.1, o celular continua no H.264 e ganha só o tamanho certo e o rolo leve.
- O gargalo que sobrou é o próprio codificador da call (VP8 por software no WebView). Num celular com codificador de hardware para a call, deve sobrar mais.

## Como repetir

Os scripts e as amostras do laboratório (todas as rodadas do dia) estão em `artifacts/fps-celular-2026-11-08/`, fora do git; `medir.js` tira a média de um trecho. A receita:

1. Emulador com `-gpu host`, aberto por uma tarefa agendada na sessão do usuário. O shell do agente não tem placa de vídeo.
2. Site local na porta 3124, laboratório ligado pelo dono, o app de teste (debug) na Sala 1, e um Chrome sem janela assistindo pela porta de depuração 9333.
3. Carga: `monkey -p com.android.settings --pct-motion 100 -s 42 400` em laço (um processo só, porque o `input swipe` abre um Java por arrasto e pesa mais que a transmissão).
4. Medida: média de `in[0].dec` (quadros decodificados por segundo no PC) nas amostras do laboratório. O `framesPerSecond` do navegador dá picos falsos depois de travadas.
