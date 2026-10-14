# Otimizações sem perda de qualidade (14/10/2026)

Pente-fino no servidor, no cliente web, no app de Windows e nos arquivos de imagem atrás de ganhos de CPU, memória e espaço que **não mudam nada do que se vê ou se ouve**. Só entrou o que dava para provar idêntico.

## O que mudou

| # | Onde | O que era | O que ficou | Ganho medido |
|---|---|---|---|---|
| 1 | `public/app.js` (`renderMessages`) | A cada estado novo (alguém muta, entra na sala, troca de status), cada uma das até 300 mensagens do canal re-serializava, dentro da própria assinatura, o bloco comum de membros, cargos e permissões. | O bloco comum é comparado à parte, uma vez por mensagem. A regra de quando uma mensagem é redesenhada é exatamente a mesma. | **7,5 ms → 0,35 ms** por redesenho e **2,4 MB → 68 KB** de lixo de memória por atualização (300 mensagens, 15 membros). Em celular e PC fraco o ganho é proporcionalmente maior: menos travadinhas durante a chamada. |
| 2 | `public/app.js` (`renderStage`) | A etiqueta da transmissão de tela ("AO VIVO · Tela de …") era refeita a cada estado novo. | Refeita só quando o texto muda, como já acontecia no bloco de cada pessoa. | Menos trabalho de DOM no palco enquanto alguém transmite. |
| 3 | `public/index.html` | Carregava `socket.io.js` (versão de desenvolvimento, 153 KB, com rastreamento de depuração em cada pacote). | Carrega `socket.io.min.js`: a versão de produção da mesma biblioteca, na mesma versão, servida pelo mesmo servidor. | **37 KB → 15 KB** transferidos (gzip) e um terço do código para o navegador ler ao abrir o app. |
| 4 | `server/mudae.js` | As 18 listas de sorteio eram montadas com 18 varreduras dos 233 mil personagens; cada nome de obra ficava repetido na memória; dois campos eram acrescentados depois da criação de cada personagem. | Uma passada só (mesma ordem), uma cópia de cada nome de obra e os campos já nascem no objeto. | **−15 MB de RAM** no servidor (114,7 → 99,6 MB de heap) e carga do catálogo ~13% mais rápida no início do servidor. |
| 5 | PNGs do app (64 arquivos) | Ícones, logos e capturas sem compressão máxima. | Recomprimidos sem perda (oxipng): **os mesmos pixels**, com os metadados de cor (sRGB, gAMA) preservados. | **3,0 MB → 1,8 MB (−39%)**: site −133 KB, app de Windows −968 KB, app Android −77 KB. |

## Como foi verificado

- **Mudae:** o módulo antigo e o novo rodaram lado a lado com o mesmo sorteio (semente fixa) e o mesmo relógio: 4.000 rolls de todos os tipos, casamentos, `$im`, harem, álbum, ranking, favoritos e divórcio, no catálogo completo, num catálogo pequeno com casos de borda e num vazio. **7,6 MB de saídas comparados, todos idênticos.**
- **Mensagens:** a condição nova de redesenho é equivalente à antiga (o JSON da assinatura antiga só era igual quando a parte da mensagem e o bloco comum eram iguais). Teste no Chromium: um estado sem relação não reconstrói as mensagens, e trocar a cor do perfil reconstrói, como antes.
- **PNGs:** cada imagem foi decodificada antes e depois e comparada pixel a pixel (RGBA), sem nenhuma diferença. O `tools/marca/resenhax-logo.png` ficou como estava, porque traz credenciais de conteúdo (chunk `caBX`) que não devem ser alteradas.
- **Testes:** `npm run check` OK em 60 arquivos; `npm test` com 284 de 285 aprovados. A única falha é `desktop/test/lib.test.js`, que precisa do módulo nativo `uiohook-napi` (exige `npm install` em `desktop/`, como diz o guia) e não tem relação com estas mudanças.

## Ficou de fora de propósito

Itens que mexeriam no comportamento ou na aparência, mesmo que pouco:

- **Mensagens acumuladas na sessão:** o navegador guarda toda mensagem que chega desde que o canal foi aberto, sem o limite de 300 do servidor. Num app aberto por dias, num canal movimentado, a memória e o tempo de redesenho crescem. Limitar a 300 resolveria, mas some do histórico rolável o que passou desse limite (depois de recarregar a página já é assim).
- **Cache longo dos arquivos do site:** hoje o navegador confere cada arquivo a cada abertura (resposta 304, barata). Cache longo exigiria versionar os nomes dos arquivos, e a convenção do repositório é não mexer nos caminhos de `public/`.
- **Animações infinitas no CSS** (brilho de quem fala, disco do DJ, pulsos): mexer nelas muda o visual.
- **Compressão do Socket.IO (permessage-deflate):** economizaria rede, mas gasta CPU e memória no servidor; não é ganho claro.
- **Arquivos WAV dos efeitos de voz:** são respostas de impulso em ponto flutuante, conferidas por hash no `manifest.json`, e só baixam quando o efeito é escolhido.

## Observação para quem regenerar os ícones

`tools/icones-app.js` e `desktop/tools/render-icons.js` geram os PNGs de novo sem a compressão máxima. Depois de rodar, vale recomprimir sem perda (por exemplo, `oxipng -o 6`).
