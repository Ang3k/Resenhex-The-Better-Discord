# Bateria de testes: fps da transmissão pelo celular

Anotado em 08/11/2026, depois que a 2.5.0 (APK 1.4.0) foi ao ar.

**Andamento (08/11, tarde):** o laboratório (os contadores do passo 1) está pronto na branch `claude/tela-celular`, testado de ponta a ponta no emulador, **sem publicar**. Só o site precisa ir ao ar (o APK 1.4.1 já serve). Depois, o dono roda a lista de "Como o dono roda a bateria" no celular dele, e um agente analisa os números (veja "Como analisar").

## O que o dono viu num celular de verdade

- **Tela inteira (o celular todo):** está ruim. O principal problema é o fps baixo. A qualidade também oscila um pouco.
- **Um app só:** fica melhor. O fps fica aceitável e a qualidade fica ok.

Objetivo: uma bateria de testes que encontre onde os quadros se perdem e melhore a experiência por inteiro, começando pela tela inteira.

Respostas do dono (08/11): quando ficou ruim, ele estava **mexendo no celular** (menus, rolar telas), um **PC assistia** e **todos estavam no Wi-Fi**. O celular não pôde ser ligado ao computador (sem adb). O modelo e a versão do Android saem sozinhos nas amostras do laboratório.

## Por onde o vídeo passa (onde pode perder quadro)

```
tela do celular ─► codificador H.264 do celular ─► página do Resenhex (WebView)
  ─► decodificador (VideoDecoder) ─► trilha da call ─► WebRTC codifica de novo ─► rede ─► quem assiste
```

Cada seta é um lugar para medir. O laboratório (abaixo) mede todas, uma vez por segundo.

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

## O laboratório (pronto, sem publicar)

Um interruptor do dono que faz cada página da call dele mandar ao servidor, a cada segundo, **só números** da transmissão. Nada de imagem, som ou texto.

- **Onde liga:** Configurações → **Laboratório**. Só a conta do dono vê, no celular e no PC. Desliga sozinho em 2 horas.
- **Quem manda números:** só as páginas que estão na mesma call que o dono, enquanto ele estiver nela. Todas mostram o selo "Laboratório ligado" no alto da call.
- **Nome do teste:** "O que foi transmitido" (tela inteira ou um app só) e "O que estava na tela" (mexendo, vídeo, jogo ou parada). Cada troca abre um teste novo (nº 1, 2, 3…), para comparar um com o outro.
- **Variações** (para comparar com o normal):
  - **Regra de atraso** ligada ou desligada (suspeita 2). Vale a partir da próxima transmissão.
  - **Codec da call:** automático, H.264 ou VP8 (suspeitas 4 e 5). Muda na hora.
  - **Captura do celular:** H.264 ou JPEG. Vale a partir da próxima transmissão.
  - O Padrão (720p) e a Nitidez (1080p) se escolhem no próprio botão de transmitir.
- **Onde grava:** no servidor, em `/var/lib/resenhex/lab/tela-AAAA-MM-DD.jsonl`. Uma linha por amostra, uma amostra por segundo por página, no máximo 64 MB por dia.

O que cada página manda:

| Quem | Números | Suspeitas |
| --- | --- | --- |
| Celular (o que chega do app) | quadros do codificador por segundo; intervalo entre quadros (mediana, 90%, maior); quadros decodificados; fila do decodificador; descartes; quedas da regra de atraso e o limite atual; codificador recriado; pausas do app transmitido; se o Resenhex está à vista; taxa da tela (Hz) | 1, 2, 3, 6 |
| Quem transmite (WebRTC) | fps enviado e da fonte; tamanho; taxa e alvo; motivo da limitação (processador ou banda); codificador (hardware ou software) e tempo por quadro; pedidos de quadro-chave; degrau da escada e limites aplicados; o que cada pessoa que assiste pediu | 4, 5 |
| Quem assiste | fps recebido e decodificado; tamanho; quadros descartados; pacotes perdidos; travadas e quanto tempo; espera no buffer; taxa | onde a imagem trava de verdade |

### Como o dono roda a bateria

Antes: o site precisa estar publicado com o laboratório. No PC que assiste, deixe a janela da call **à vista**: minimizada, ela pede menos quadros e confunde a medição.

1. Entre na call com o celular e com o PC. Ligue o laboratório (Configurações → Laboratório).
2. Em cada teste da lista, **escolha o nome antes de transmitir**. Transmita por **2 minutos** fazendo a mesma coisa, pare a transmissão e passe para o próximo.

| Nº | O que foi transmitido | O que estava na tela | Variação | Perfil |
| --- | --- | --- | --- | --- |
| 1 | Tela inteira | Mexendo no celular | nenhuma | Padrão 720p |
| 2 | Um app só (o mesmo app do teste 1) | Mexendo no celular | nenhuma | Padrão 720p |
| 3 | Tela inteira | Vídeo (o mesmo, em tela cheia) | nenhuma | Padrão 720p |
| 4 | Um app só | Vídeo (o mesmo) | nenhuma | Padrão 720p |
| 5 | Tela inteira | Mexendo no celular | regra de atraso **desligada** | Padrão 720p |
| 6 | Tela inteira | Mexendo no celular | codec da call **VP8** | Padrão 720p |
| 7 | Tela inteira | Mexendo no celular | captura **JPEG** | Padrão 720p |
| 8 | Tela inteira | Mexendo no celular | nenhuma | **Nitidez 1080p** |
| 9 | Tela inteira | Jogo | nenhuma | Padrão 720p |

Volte a variação para o normal antes do teste seguinte. Se o Android deixar escolher a taxa da tela (60 ou 120 Hz), repetir o teste 1 a 60 Hz prova ou descarta a suspeita 1. No fim, desligue o laboratório e avise o agente.

### Como analisar (agente)

1. Copiar o arquivo do servidor. A pasta é do usuário `resenhex`: primeiro `sudo cp` do arquivo para `/tmp` com `chmod 644`, depois `scp` para `artifacts/fps-celular-AAAA-MM-DD/`. A chave e o endereço estão no cabeçalho de `discord-clone/tools/lab-tela.js`.
2. `node discord-clone/tools/lab-tela.js arquivo.jsonl` resume cada teste: aparelho, quadros em cada etapa, descartes, regra de atraso, o envio para cada pessoa que assiste e o que cada uma recebeu.
3. `node discord-clone/tools/lab-tela.js arquivo.jsonl --teste N` mostra o teste N segundo a segundo.
4. Onde o número de quadros cai de uma etapa para a próxima é onde está o problema. Comparar com as suspeitas e escrever o relatório em `docs/relatorios/`.

### O que o emulador já mostrou (não vale para o celular de verdade)

No emulador, sem placa de vídeo e com tudo por software, o caminho inteiro funcionou. Dois pontos para olhar no celular de verdade:

- Quando a regra de atraso corta o fps pela metade, o codificador do celular é **recriado** e manda um quadro-chave novo, que pesa mais. Se isso se repete no celular, a regra pode piorar o que tenta resolver.
- Quem assiste com a janela escondida pede só 5 fps. É o esperado, mas tem que ficar fora da medição.

## Onde está o código

- `discord-clone/android/app/src/main/java/org/duckdns/resenhex/ScreenService.java`: captura, tamanho, codificador (`format()`), som.
- `discord-clone/android/app/src/main/java/org/duckdns/resenhex/ScreenFeed.java`: entrega dos pacotes à página.
- `discord-clone/public/android-screen.js`: leitura, decodificação, regra de atraso (`decoderBehind`, `speedBackUp`).
- `discord-clone/public/media-policy.js`: perfis do celular (`phone720`, `phone1080`) e a escada de qualidade (`screenTarget`, `adapt`).
- `discord-clone/public/media-session.js`: leitura do `getStats` de quem transmite e decisão de descer ou subir degrau.
- Laboratório: `discord-clone/server/lab.js` (liga, nome do teste, grava), `discord-clone/public/lab-tela.js` (painel e envio dos números), `labTake()` em `android-screen.js`, `labStats()` em `media-session.js`, `discord-clone/tools/lab-tela.js` (resumo). Testes: `test/lab.test.js` e o fim de `test/android-screen.test.js`.
- Como funciona tudo: [PLANO-TELA-DO-CELULAR-2026-11-08.md](PLANO-TELA-DO-CELULAR-2026-11-08.md).
- Medições parecidas já feitas no PC: [docs/relatorios/CAPTURA-60FPS-2026-10-16.md](../relatorios/CAPTURA-60FPS-2026-10-16.md).
