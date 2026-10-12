# Integração dos efeitos escolhidos — 12/10/2026

Os treze efeitos do plano escolhido estão integrados ao menu e ao caminho de áudio da chamada. Rádio permanece como no site, totalizando quatorze opções padrão. Walkie-talkie, Robô musical e Monstro não foram incluídos. A conversão por IA existente foi preservada; estes efeitos novos não dependem de IA nem de serviços externos de conversão.

## Base e entrega local

- Branch: `codex/efeitos-escolhidos`.
- Worktree: `C:/Users/angej/.codex/worktrees/efeitos-escolhidos/project2/discord-clone`.
- Base: `f92a334d5092cf2efa8383dfa549c22736838222`, versão 1.3.8. Foi conferida por leitura do servidor publicado e comparação dos arquivos relevantes; `origin/main` e o checkout original estavam em versões diferentes.
- A árvore original com alterações de Android, ícones e experimentos de voz não foi sobrescrita. A versão do app não foi alterada e não houve deploy, reinício de produção ou aviso a outros usuários.
- App de teste: http://127.0.0.1:38157/ — dados e uploads próprios em `artifacts/voice-source-live/escolhidos-no-app-2026-10-12/app-sandbox`, sem a base de contas real.
- Comparação: http://127.0.0.1:38156/ — treze pares favorito/resultado do código integrado, mesma frase, com atraso fixo removido somente do WAV de comparação.

## Arquitetura implementada

`public/voice-fx.js` mantém entrada e saída estáveis. Carrega o próximo grafo antes de trocar, faz transição de 25 ms, descarta preparações vencidas e libera o anterior. Esquilo, Gigante e Rádio usam o caminho legado; os parâmetros publicados de Stretch, filtros e compressor foram preservados.

`public/voice-fx-chosen.mjs` monta os novos grafos e mantém caches por contexto de worklets e respostas acústicas. O WASM é compilado somente quando um dos efeitos musicais precisa dele. `public/voice-fx-classic-core.mjs` contém filtros, FFT, vocoder, sussurro espectral e WSOLA causal. `public/voice-fx-classic-worklet.mjs` liga esses núcleos ao navegador, executa as camadas musicais e controla níveis/picos.

Telefone e Megafone usam os filtros e a curva da referência. Banheiro usa a resposta estéreo medida escolhida. As cadeias lineares SoX de Caverna, Alien e Fantasma foram convertidas em respostas de convolução pela receita exata, sem normalização adicional; Alien usa o Stretch +4 permitido pelo plano. Robô usa quarenta bandas e portadora fixa, sem voz original por baixo. Fantasma conserva a magnitude espectral e troca a fase aleatoriamente.

Bêbado usa a janela 1536, salto 384 e busca ±384 do preset `bebado-oscila`, com os mesmos intervalos de velocidade, deriva de tom e amolecimento de articulação. A implementação é causal: inclui 48 ms de análise no orçamento, controla a idade das amostras efetivamente usadas, força recuperação acima do atraso escolhido e esvazia a fila nas pausas. A correlação foi implementada com FFT para evitar o custo de uma busca quadrática a cada salto. Não foram usados eco, Chido ou Seed-VC.

Autotune usa Autotalent 0.2 na escala pentatônica de dó, correção máxima, suavidade zero e a dobra estéreo aprovada. Acordes e Coral usam dez instâncias cada, com os pans, atrasos, notas, formantes e vibratos do plano. A progressão C → G → Am → F usa o relógio do áudio, inclusive durante o silêncio. A voz tratada por cima mantém os alvos de +0,75 dB nos Acordes e +0,25 dB no Coral; as salas sintéticas e os ganhos iniciais vêm da prova aprovada.

O host C preserva o DSP do Autotalent, zera as alocações, congela a memória em 16 MiB e restaura snapshots ao silenciar. O WASM não tem imports. A compilação usa Emscripten 6.0.12, `-O2 -fno-strict-aliasing -ffp-contract=off`; as fontes, flags e licenças acompanham o resultado.

## Troca, silêncio e recuperação

O mudo bloqueia entrada e saída e limpa os históricos dos worklets. Os nós nativos com memória são recriados para limpar filtros, atrasos e convoluções. No caminho legado, a saída segura a liberação até a latência pendente escoar. O controle de sensibilidade segura a janela por até quatro segundos adicionais conforme o efeito, permitindo que sílabas do Bêbado e caudas de sala cheguem ao receptor. Mudo explícito e push-to-talk bloqueiam imediatamente na origem do grafo.

Uma falha real de `process()` do AudioWorklet dispara retorno à voz normal, aviso no app e atualização do estado da call, sem ignorar o mudo. O servidor aceita os novos IDs e continua rejeitando nomes arbitrários. As rotas existentes de Stretch e LiveKit foram ajustadas para `sendFile` com nome relativo e `root` explícito: o caminho absoluto do worktree contém `.codex`, que antes fazia essas dependências falharem ao servir a cópia de teste. Os arquivos e a política de cache permanecem os mesmos.

## Medições do código integrado

Entrada de 18,6158 s, mono, 48 kHz. Novos efeitos receberam a entrada float32 original das provas nativas. Esquilo/Gigante receberam o mesmo PCM16 da prova online publicada, para permitir a verificação de preservação. Energia ativa: quadros de 20 ms acima de −45 dB, passa-altas Butterworth de 100 Hz, mistura mono dos canais. Picos medidos após reamostragem 4× no navegador; não constituem uma garantia de pico para todos os microfones.

| Efeito | Atraso fixo do grafo | Nível vs. original | Pico 4× | Observação |
|---|---:|---:|---:|---|
| Esquilo | 70,0 ms | +3,04 dB | −3,77 dBFS | Caminho publicado preservado |
| Gigante | 70,0 ms | +3,92 dB | −4,47 dBFS | Caminho publicado preservado |
| Telefone | 9,0 ms | +0,95 dB | −5,39 dBFS | Filtros e compressor |
| Megafone | 9,0 ms | +0,21 dB | −10,83 dBFS | Distorção escolhida |
| Banheiro | 3,0 ms | −0,39 dB | −5,39 dBFS | Reflexões molhadas começam depois do pré-atraso |
| Caverna | 3,0 ms | −0,85 dB | −6,13 dBFS | Receita SoX aprovada |
| Alien | 73,0 ms | −0,43 dB | −7,93 dBFS | Stretch 70 ms + proteção 3 ms |
| Robô | 3,0 ms | +5,80 dB | −2,27 dBFS | Exceção de volume escolhida pelo usuário |
| Fantasma | 13,7 ms | −3,71 dB | −11,44 dBFS | Intencionalmente mais baixo |
| Bêbado | 51,0 ms | +0,72 dB | −3,66 dBFS | Há também atraso variável de ritmo, limitado |
| Autotune | 45,6 ms | +0,19 dB | −5,79 dBFS | Autotalent + proteção |
| Voz em acordes | 45,6 ms | −0,02 dB | −4,00 dBFS | Camadas com atrasos adicionais até 21 ms |
| Coral | 45,6 ms | −0,14 dB | −3,21 dBFS | Camadas com atrasos adicionais até 58 ms |

Os atrasos acima não incluem captura do dispositivo, Opus, rede, jitter buffer ou reprodução. No Coral, a camada mais tardia chega cerca de 104 ms após a entrada do grafo; os reflexos de sala chegam ainda depois. Alien excede os ~70 ms em 3 ms pela proteção de pico. As janelas de cauda enviadas após a fala ficam em até quatro segundos; os IRs de Caverna/Alien/Fantasma contêm dez segundos da resposta para preservar a convolução durante fala contínua.

Os novos efeitos comuns ficaram dentro de ±1 dB nesta frase. Fantasma conserva a exceção de cerca de −3 dB. O usuário escolheu explicitamente manter o Robô favorito mais alto: o novo render ficou apenas +0,13 dB acima desse favorito. Esquilo e Gigante não foram silenciosamente nivelados, pois a instrução específica era preservar o som publicado. Rádio permaneceu fora desta rodada de nivelamento.

## Fidelidade e limites da comparação

- Esquilo e Gigante: prefixo PCM16 da comparação idêntico amostra por amostra à prova do caminho publicado, correlação 1 e ganho relativo 0 dB.
- Autotalent WASM: primeira camada dos Acordes idêntica ao stem C nativo aprovado; diferença máxima zero, latência 2047 amostras, saída silenciosa zero após reset.
- Render completo: correlação mono com os favoritos de 0,99835 para Autotune, 0,99449 para Acordes e 0,98758 para Coral. O balanceamento gradual de volume, a proteção de pico e as diferenças entre filtros do navegador e SciPy impedem afirmar igualdade integral dos WAVs.
- Bêbado usa um gerador determinístico xorshift e detecção causal de pausas; a prova offline usava o PCG do NumPy e podia olhar quadros futuros. A receita e os limites foram mantidos, mas os trechos sorteados e a forma de onda não são idênticos. Fantasma também usa outro gerador de fase.

A correlação é evidência de reprodução do processamento, não substitui a avaliação auditiva e não prova equivalência perceptual com Voicemod. A página mostra as diferenças restantes diretamente, usando o código que está integrado ao app.

## Verificação realizada

- `npm run check` e `npm run check:voice-chosen`: sintaxe aprovada. Checagem adicional de sintaxe dos scripts de laboratório e das rotas ajustadas também passou.
- Quatro testes essenciais do motor: catálogo; WSOLA causal/limitado/reset; finitude e reset de Robô/Fantasma; dez instâncias WASM, sem imports, sem crescimento da memória e com reset determinístico.
- Doze testes focados existentes de voz/áudio/call: preview, mudo, push-to-talk, alterações de dispositivo e conversão por IA. Os testes novos de menu e contrato do servidor também passaram, incluindo Acordes → Coral sem substituir a captura.
- Render nativo dos treze efeitos: amostras finitas, nenhum erro de console do render, picos abaixo de −1 dBFS na frase comum.
- Loopback nativo `RTCPeerConnection`/Opus: quatorze opções entregaram áudio, 1481 pacotes / 83089 bytes, sem degradação. Saída local após reabrir o mudo com fonte silenciosa: máximo RMS de `3,26e−11`; saída Opus: máximo `2,61e−6`, abaixo da tolerância de `1e−5`. O RMS capturado imediatamente após o mudo pode conter áudio já em trânsito; não foi confundido com ausência de limpeza do DSP.
- Bêbado: teste sustentado de quarenta segundos teve idade máxima real de 497,5 ms e mínima de 48 ms; fila zerada após a pausa. No loopback com fala real, máxima 363,3 ms e mínima 47,9 ms; fila zerada após 1,3 s de pausa. Limite exigido: 700 ms, sem leitura futura.
- Falha injetada exclusivamente por interceptação no navegador de teste: erro real do worklet voltou a `none`, manteve voz normal audível e ficou em RMS zero no mudo. Nenhuma injeção foi salva nos arquivos de produção.
- App real em `38157`: dependências HTTP 200 com MIME apropriado, inicialização e troca nativas de Acordes, Coral, Alien, Esquilo, Gigante e Robô em contexto 48 kHz.
- Página de comparação: 26 players com metadata/duração carregadas, sem autoplay, volume inicial 25%, reprodução exclusiva, botão de parada e controle de volume funcionando, sem overflow horizontal em desktop e largura 390 px. A reprodução de verificação foi silenciada. Capturas foram inspecionadas visualmente.

Resultados brutos, WAVs e capturas: `C:/Games/project2/artifacts/voice-source-live/escolhidos-no-app-2026-10-12/`. Arquivos principais: `metrics.json`, `proof-comparison.json`, `wasm-parity.json`, `loopback.json`, `failure-recovery.json`, `actual-app-check.json`, `gallery-check.json`.

## Desempenho e pendências de publicação

Acordes e Coral renderizaram cerca de 29,6 s de áudio offline em aproximadamente 6,0 / 6,2 s no PC usado, com Electron 44.5.1 / Chromium 152. Isso é tempo de render offline e não equivale a percentual de CPU em call nem a cumprimento de cada prazo de 128 amostras. O loopback ao vivo passou no PC. Não há medição em Android/WebView físico: o usuário informou que não tem aparelho disponível. Não se declarou aprovação de desempenho móvel com base no desktop.

Autotalent, fontes do host, FFT e cabeçalho LADSPA acompanham o WASM com seus avisos e textos GPL/LGPL/BSD. Os IRs gerados têm receitas e hashes. O Banheiro usa o arquivo externo escolhido, com autoria e fonte registradas; a inspeção das páginas públicas do The Impulse Factory não localizou termos formais de redistribuição. Essa confirmação permanece pendente antes da publicação do asset. Não houve mensagem enviada ao autor.

Para publicar, também é necessário seguir os cuidados do plano: conferir a versão e outras branches no servidor, preservar trabalho concorrente e tratar o impacto do reinício nas calls. Esta entrega conclui a implementação e a prova local; esses passos de produção não foram executados.
