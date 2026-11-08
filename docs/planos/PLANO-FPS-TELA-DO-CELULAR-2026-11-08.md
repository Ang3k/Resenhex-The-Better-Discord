# Bateria de testes: fps da transmissão pelo celular

Anotado em 08/11/2026, depois que a 2.5.0 (APK 1.4.0) foi ao ar. **Ainda não começou**: o dono pediu só para deixar registrado e fazer depois.

## O que o dono viu num celular de verdade

- **Tela inteira (o celular todo):** está ruim. O principal problema é o fps baixo. A qualidade também oscila um pouco.
- **Um app só:** fica melhor. O fps fica aceitável e a qualidade fica ok.

Objetivo: uma bateria de testes que encontre onde os quadros se perdem e melhore a experiência por inteiro, começando pela tela inteira.

Antes de começar, perguntar ao dono o modelo do celular, a versão do Android e se estava no Wi-Fi ou no 4G/5G.

## Por onde o vídeo passa (onde pode perder quadro)

```
tela do celular ─► codificador H.264 do celular ─► página do Resenhex (WebView)
  ─► decodificador (VideoDecoder) ─► trilha da call ─► WebRTC codifica de novo ─► rede ─► quem assiste
```

Cada seta é um lugar para medir. Hoje não existe nenhum contador ligado (os de depuração saíram antes de publicar).

## Suspeitas a conferir (nenhuma foi provada)

1. **Tela de 90/120 Hz:** o `KEY_MAX_FPS_TO_ENCODER` (Android 10+) deveria descartar o excesso antes do codificador, mas alguns fabricantes ignoram. Se o codificador recebe 120 quadros/s, ele atrasa.
2. **A regra de atraso derrubando o fps:** se o decodificador da página atrasa mais de meio segundo três vezes em 10 s, a captura cai para metade (até 10 fps), e só sobe de novo depois de 30 s sem atraso (espera que dobra a cada queda, até 5 min). Na tela inteira pode estar ficando presa embaixo.
3. **Tela inteira custa mais para o celular:** o espelho da tela inteira passa por uma composição extra da placa de vídeo (barra de status, navegação e o jogo na resolução cheia), disputando com o jogo. No "um app só" o Android desenha só a janela do app.
4. **Codificação dupla:** o WebRTC codifica de novo o que o celular já codificou. Se o WebView desse celular codifica por software, o processador vira o limite, ainda mais com um jogo aberto.
5. **A escada de qualidade da página:** os perfis do celular (`phone720`/`phone1080`) pedem ao WebRTC para manter o fps (`maintain-framerate`) e são adaptativos: quando o WebRTC diz que está apertado, a página desce a resolução um degrau e sobe de novo depois (`MediaPolicy.adapt`, chamado em `media-session.js`). Isso pode ser a qualidade oscilando. Se o WebView desse celular codificar H.264 por software, `escapeSoftwareH264` troca o codec no meio da transmissão, o que também mexe na imagem. E o celular pode não respeitar o "manter o fps" e cortar quadros mesmo assim.
6. **Página do Resenhex em segundo plano:** o Android pode dar menos prioridade ao WebView quando outro app está na frente.

## A bateria de testes

1. **Contadores em cada etapa**, ligados por um modo de laboratório escondido (não aparece para quem usa):
   - celular: quadros que saem do codificador por segundo, tamanho médio deles, quedas da regra de atraso;
   - página: pacotes recebidos, quadros decodificados, fila do decodificador;
   - WebRTC de quem transmite (`getStats`): fps enviado, motivo da limitação (`qualityLimitationReason`), codificador usado (`encoderImplementation`, para saber se é hardware), taxa de bits;
   - quem assiste: fps recebido, quadros descartados, travadas.
2. **Comparações**, cada uma por 1–2 min com os mesmos contadores:
   - tela inteira × um app só, com o mesmo jogo ou vídeo na frente;
   - jogo pesado × vídeo × tela parada;
   - Padrão (720p) × Nitidez (1080p);
   - H.264 do celular × JPEG;
   - WebRTC em H.264 × VP8;
   - regra de atraso ligada × desligada;
   - Wi-Fi × dados móveis;
   - tela a 60 Hz × 120 Hz, se o celular deixar escolher.
3. **Celulares:** pelo menos o do dono e, se der, um mais simples. O emulador não serve para medir fps: não tem placa de vídeo, e tudo vira software.
4. **Meta a combinar com o dono:** por exemplo, tela inteira a 30 fps estáveis no Padrão, sem a qualidade oscilando, num celular médio.

## Onde está o código

- `discord-clone/android/app/src/main/java/org/duckdns/resenhex/ScreenService.java`: captura, tamanho, codificador (`format()`), som.
- `discord-clone/android/app/src/main/java/org/duckdns/resenhex/ScreenFeed.java`: entrega dos pacotes à página.
- `discord-clone/public/android-screen.js`: leitura, decodificação, regra de atraso (`decoderBehind`, `speedBackUp`).
- `discord-clone/public/media-policy.js`: perfis do celular (`phone720`, `phone1080`) e a escada de qualidade (`screenTarget`, `adapt`).
- `discord-clone/public/media-session.js`: leitura do `getStats` de quem transmite e decisão de descer ou subir degrau.
- Como funciona tudo: [PLANO-TELA-DO-CELULAR-2026-11-08.md](PLANO-TELA-DO-CELULAR-2026-11-08.md).
- Medições parecidas já feitas no PC: [docs/relatorios/CAPTURA-60FPS-2026-10-16.md](../relatorios/CAPTURA-60FPS-2026-10-16.md).
