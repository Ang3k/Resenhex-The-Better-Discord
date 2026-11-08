# Transmitir a tela do celular (app de Android)

Pedido do dono em 08/11/2026: quem está no app de Android consegue transmitir a tela do celular na call, como no Discord, funcionando no maior número de celulares possível.

## Por que não é só ligar

O WebView do Android não tem `getDisplayMedia`: o site sozinho não consegue capturar a tela. Quem captura é o próprio app, com a captura de tela do Android (MediaProjection), e entrega as imagens ao site, que manda para a call como uma transmissão normal. Assim o resto (espectadores, qualidade por pessoa, LiveKit, Clipar) continua igual.

Medido no emulador (Android 14, WebView 113) antes de começar:

- O WebView tem `VideoDecoder` (H.264 por hardware), `MediaStreamTrackGenerator`, `VideoFrame` e `AudioWorklet`.
- Com o Resenhex em segundo plano e outro app na frente, durante a call, o WebView continuou decodificando H.264 e enviando pelo WebRTC a 29–30 fps. Então a transmissão não para quando a pessoa vai para o jogo.

## Como funciona

```
Android                                         Site (WebView)
MediaProjection ─► tela virtual ─► codificador ─► fetch('/__resenhex/tela/<chave>')
  (consentimento)                   H.264            │  (o app responde direto, sem rede)
AudioPlaybackCapture (Android 10+) ─► PCM ─────────┘
                                                     ▼
                                     VideoDecoder ─► gerador de trilha ─► WebRTC (igual ao PC)
                                     AudioWorklet ─► trilha de áudio
```

1. **App (APK 1.4.0):**
   - `ScreenService`: serviço em primeiro plano do tipo `mediaProjection`, com a notificação "Transmitindo a tela" e o botão Parar. Segura a captura, o codificador e o som.
   - Codificador H.264 do próprio celular, alimentado direto pela tela virtual (quase sem gastar processador). Se o codificador falhar, ou se o WebView não decodificar H.264, cai para JPEG (mais pesado, mas funciona em qualquer celular).
   - Som do celular no Android 10+ (`AudioPlaybackCapture`): pega o som de jogos e vídeos, nunca as vozes da call (o Android não deixa capturar o som de ligação, então não há eco). No Android 9 ou anterior, a transmissão vai sem som.
   - Girar o celular troca o tamanho da imagem na hora (deitado para jogos, em pé para apps).
   - Os pacotes chegam ao site por `shouldInterceptRequest`, num endereço do próprio site com uma chave nova a cada transmissão: sem rede, sem conteúdo misto e só a página do Resenhex consegue ler.
   - Durante a transmissão a janelinha da call não abre (ela apareceria dentro da própria transmissão).
2. **Site (2.5.0):**
   - `public/android-screen.js`: pede a captura, lê os pacotes, decodifica e monta a `MediaStream` com vídeo e som.
   - `media-session.js`: `captureScreen()` usa essa captura no app de Android; o resto da transmissão não muda.
   - Perfis próprios do celular: Padrão (720p · 30 fps) e Nitidez (1080p · 30 fps), em H.264/VP8, que os celulares codificam por hardware. A imagem cabe na caixa do perfil deitada ou em pé (em pé, 720p vira 400×720).
   - O app antigo (1.3.4 ou anterior) mostra "Atualize o app para transmitir a tela".
   - Celular sem folga (jogo pesado, pouca memória): se o vídeo atrasar mais de meio segundo, pula até o próximo quadro-chave; três vezes em 10 s, a captura cai para metade dos quadros (mínimo 10). Depois de 30 s sem atraso, dobra de novo até voltar aos 30 fps (cada nova queda dobra a espera, até 5 min).

## Compatibilidade

| Android | O que muda |
|---|---|
| 7 a 9 (API 24–28) | Sem som do celular. Serviço sem tipo. |
| 10 a 13 (API 29–33) | Com som. Serviço do tipo `mediaProjection` antes de abrir a captura. |
| 14+ (API 34+) | Consentimento a cada transmissão, callback registrado antes da tela virtual, opção de transmitir um app só (a transmissão pausa quando ele sai da tela). |

## Validação

- Testes automáticos do leitor de pacotes, do codec tirado do SPS e do tamanho da captura.
- Emuladores Android 14 (já instalado), 16 e 12 (baixados um de cada vez, com o OK do dono): transmitir, ir para outro app, girar, parar pela notificação, sair da call, sem som e com som, e ver do outro lado (navegador do PC) se a imagem chega e anda.
- Medir o uso de processador do app transmitindo.
- Celular de verdade: não há um ligado a este PC. Fica para o dono testar antes de publicar.

## Resultado nos emuladores (08/11)

Do outro lado, o PC assistiu pelo navegador do painel. Os emuladores não têm placa de vídeo: tudo é codificado por software, então a taxa que chega ao PC (6 a 12 fps) é limite do emulador (o WebRTC do celular gasta 50 a 165 ms por quadro em VP8 por software). Num celular de verdade o H.264 vai pelo hardware.

| Emulador | WebView | Caminho | O que passou |
|---|---|---|---|
| Android 14 (API 34) | 113 | H.264 + `VideoDecoder` | Transmitir com Fotos na frente (30 quadros/s no celular), som do celular no PC (tom de 440 Hz), girar (vira 1280×720), trocar para Nitidez com a transmissão rodando (592×1072), JPEG forçado, parar pela notificação (a call continua), cancelar o consentimento, sem janelinha durante a transmissão, sair da call e recarregar a página param os serviços. |
| Android 16 (API 36) | 133 | H.264 + `VideoDecoder` | Consentimento "um app só" com o seletor de apps, imagem 400×720 e som (439 Hz) no PC, pausa quando o app sai da tela e volta quando ele volta, parar pela tela da call, janelinha volta depois de parar. Com 2,5 GB de memória e tudo por software, o decodificador engasgava: a regra de atraso desceu para 10 fps e subiu sozinha para 20 e 30. |
| Android 12 (API 31) | 91 | JPEG + `canvas.captureStream` | Sem `VideoDecoder` nem gerador de trilha: o caminho reserva entrou sozinho. Imagem 400×720 e som (439 Hz) no PC, parar pela notificação. |

Achado no caminho: o site inteiro não abria em WebView anterior ao 93 (`Object.hasOwn` em `voice-fx.js` e outros recursos novos em vários arquivos; ficava em "Entrando na resenha…"). Celulares com a Play Store atualizam o WebView sozinhos, então isso só pegava quem está sem atualização.

Corrigido na mesma versão com `public/compat.js`, o primeiro script da página, que só age quando falta o recurso:

- JavaScript: `Object.hasOwn`, `.at()`, `findLast`/`findLastIndex`, `structuredClone` e `replaceChildren` (Chrome 86).
- CSS (relido do cache e posto no lugar da folha original, na mesma ordem): `color-mix()` vira a cor calculada com as variáveis da raiz (variável só de um elemento, como a cor de cada pessoa no bloco da call, fica com a cor que pesa mais); `@container` vira `@media` e `cqw` vira `vw` (no celular a call ocupa a largura toda); seletores com `:has()` saem das listas para o resto da regra valer (o modo imersivo e o cinema do DJ dependiam disso); `dvh` vira `vh`; `inset` vira `top/right/bottom/left` no Chrome 85–86.
- Testado no emulador Android 12 (WebView 91), sem nada injetado: abre, sem erro no console, chat, gaveta de canais, call, configurações e transmissão da tela funcionando. Num navegador novo nada muda. O que segue diferente no WebView antigo: os blocos da call ficam todos na mesma cor, e regras que só funcionam com `:has()` (esconder o cartão da call com a gaveta aberta, por exemplo) não valem.
- Mínimo: Chrome/WebView 85 (o site usa `??=`, que é do 85). Abaixo disso a página nem é lida.
