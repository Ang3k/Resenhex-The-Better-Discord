# Voz por IA: segunda rodada de desempenho — 2026-10-10

Melhorias locais, sem deploy, comparadas com a versão que já tinha vocoder limitado, bypass de silêncio e pools ONNX sem spinning. O tempo mediano dos quatro personagens de LoL caiu mais **7–17%** nesta CPU. A comparação real das oito vozes nos quatro perfis produziu **samples idênticos**. Pesos, precisão, contexto, pitch e filtros mantêm o comportamento anterior.

## Mudanças incorporadas

ContentVec e RMVPE são independentes e agora executam juntos, em sessões distintas, antes da síntese. A CPU utiliza esse caminho a partir de quatro processadores lógicos; CPUs menores mantêm execução sequencial. GPU usa as sessões independentes, conforme a [documentação do DirectML](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html#api): chamadas simultâneas a `Run` são permitidas em sessões diferentes. Há apenas um trabalho de pitch pendente, sem paralelismo de síntese ou crescimento da fila. Um erro do encoder aguarda o término do pitch antes de aceitar outro RPC ou troca de modelo. A execução física em GPU permanece pendente.

Os coeficientes FIR Kaiser da SciPy são calculados uma vez por razão de reamostragem e tipo numérico. São os mesmos coeficientes usados anteriormente, com a mesma fase e margens. Arrays float32 já compatíveis dispensam cópias adicionais. A reamostragem isolada de mil blocos caiu de 174,7 para 119,4 ms em 48→16 kHz e de 189,2 para 117,7 ms em 40→48 kHz: redução de aproximadamente 32–38%, com resultados exatamente iguais. Esse custo era uma pequena parte da conversão total. [Medições](desempenho-voz-2026-10-10/round2/resampling.json).

O protocolo binário recebe o corpo de um pacote completo diretamente e aloca apenas uma vez quando há fragmentação. Cada fragmento é copiado uma vez; a versão anterior recopiava todos os fragmentos anteriores a cada evento. O PCM continua pertencendo ao receptor, sem depender da reutilização do chunk original. Pacotes máximos, JSON máximo, alinhamento, validação e ordem são preservados. Em microbenchmark sintético, 5.000 pacotes completos caíram de 51,1 para 26,3 ms; 500 pacotes fragmentados em 256 bytes, de 169,2 para 5,6 ms. São custos do decoder, não latência da chamada. [Medições e repetições](desempenho-voz-2026-10-10/round2/transport.json).

## Comparação da conversão completa

Linux, cinco vCPUs AMD EPYC 9V74, aproximadamente 33 GiB RAM, sem GPU; Python 3.12.14, ONNX Runtime CPU 1.23.2, NumPy 2.2.6 e SciPy 1.15.3. Mesmo WAV sintético em português, quatro segundos, 25 blocos de 160 ms, contexto de 320 ms. Execuções consecutivas, com o worker anterior preservado fora do repositório. Nenhum modelo ONNX foi reexportado nesta rodada.

| Voz | Mediana anterior | Mediana atual | Redução | p95 anterior | p95 atual | RTF atual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Braum | 217,1 ms | 189,8 ms | 12,6% | 236,0 ms | 220,6 ms | 1,19 |
| Zed | 221,5 ms | 183,5 ms | 17,2% | 270,4 ms | 206,9 ms | 1,15 |
| Pantheon | 205,2 ms | 190,4 ms | 7,2% | 232,0 ms | 206,6 ms | 1,19 |
| Ahri | 221,6 ms | 189,9 ms | 14,3% | 245,4 ms | 203,8 ms | 1,19 |
| Kaede | 184,8 ms | 182,0 ms | 1,5% | 208,1 ms | 213,1 ms | 1,14 |
| Uzuki | 196,5 ms | 173,6 ms | 11,6% | 231,4 ms | 193,0 ms | 1,09 |
| woman-1 | 317,5 ms | 332,0 ms | −4,6% | 339,2 ms | 375,2 ms | 2,08 |
| woman-2 | 330,8 ms | 304,5 ms | 8,0% | 366,0 ms | 332,5 ms | 1,90 |

[Anterior](desempenho-voz-2026-10-10/round2/before.json), [atual](desempenho-voz-2026-10-10/round2/after.json) e [primeira execução atual](desempenho-voz-2026-10-10/round2/after-first.json). Foram 200 blocos por execução, todos finitos e com tamanho correto. O resultado varia com carga e hardware: woman-1 regrediu nesta execução e, numa repetição, passou de 358,8 para 350,3 ms, enquanto seu p95 subiu de 380,8 para 403,4 ms. Não há ganho consistente demonstrado para essa voz. [Repetição anterior](desempenho-voz-2026-10-10/round2/woman1-before.json) e [atual](desempenho-voz-2026-10-10/round2/woman1-after.json).

Em Braum, as medianas separadas de encoder e pitch somavam aproximadamente 90 ms; a etapa conjunta passou a aproximadamente 68 ms. O profiling usa `encoderPitch` para essa duração conjunta, pois os dois tempos sobrepostos não devem ser somados. Os números representam inferência/RPC, não atraso completo de captura, rede e reprodução.

Uma medição adicional somou o tempo de CPU de todos os threads do worker, excluindo carregamento e aquecimento. Nos 25 blocos de Braum, esse tempo passou de 16.600 para 16.990 ms (+2,3%), enquanto a mediana de inferência caiu de 227,6 para 197,6 ms. O paralelismo reduz a espera usando mais cores simultaneamente; esse ensaio não demonstra redução do trabalho total de CPU de Braum. Em woman-1, a amostra adicional passou de 30.210 para 25.590 ms de CPU, com mediana de 382,6 para 304,7 ms; a variação entre execuções reforça a necessidade de validar no hardware final. [Tempo de CPU anterior](desempenho-voz-2026-10-10/round2/cpu-before.json) e [atual](desempenho-voz-2026-10-10/round2/cpu-after.json). Consumo de energia e impacto num jogo não foram medidos.

## Preservação do áudio

`desktop/tools/check-voice-equivalence.py` inicia dois workers reais com sementes iguais somente nos processos de teste. Compara três blocos consecutivos por cenário, incluindo histórico e SOLA, e depois altera a época de mute/PTT e exige saída exatamente silenciosa. As oito vozes e quatro perfis passaram: 32 cenários, 96 blocos de fala por versão e 64 blocos adicionais de silêncio. **Erro absoluto máximo: 0.** O relatório inclui os hashes dos workers. O app mantém sua aleatoriedade normal e não grava o microfone. [Evidência](desempenho-voz-2026-10-10/round2/audio-equivalence.json).

Os testes também comparam os filtros reutilizados com a SciPy original em float32/float64 e nas razões suportadas, verificam drenagem do trabalho paralelo após erro, execução sequencial em CPU pequena e descarte de blocos com tamanho incompatível. O transporte foi exercitado com pacotes consecutivos, fragmentos de 1/7/256 bytes, buffers reutilizados, mensagens sem PCM e PCM de tamanhos reais. O AudioWorklet preservou todos os samples sob variação de chegada, com reprodução inicial imediata e limpeza no mute. Isso verifica ausência de degradação introduzida por essas mudanças; não certifica a qualidade artística original dos modelos em português.

## Experimentos descartados

- Outra distribuição de threads, chunk dinâmico do ONNX e convoluções representadas em 2D não produziram melhora consistente nesta máquina. Cinco threads tiveram p95 maior e utilizariam mais capacidade do computador.
- Tamanhos fixos de entrada são recomendados para DirectML, mas a comparação em CPU do grafo especializado apresentou diferença máxima de aproximadamente 0,0000753 e falhou no critério estrito de equivalência. Esse ajuste foi retirado. Não há mudança de shapes, pesos ou hashes dos modelos distribuídos.
- Uma reserva adaptativa de reprodução reduziu a frequência de interrupções num cenário com atrasos crescentes, mas aumentou a espera total. Com atrasos alternados, a pausa passou de 18,7 para 34,7 ms, sem reduzir sua frequência. Foi retirada; o AudioWorklet mantém reprodução imediata e sua fila limitada. [Experimento](desempenho-voz-2026-10-10/round2/jitter-rejected.json).

Os tempos dos protótipos e o limite de equivalência que rejeitou a especialização estão no [registro de experimentos](desempenho-voz-2026-10-10/round2/experiments.json). São ensaios exploratórios; seus números isolados não representam ganho validado do aplicativo.

## Integração e verificações

Passaram **256 testes Node** sob Xvfb, sem falhas/cancelamentos/ignorados, e **15 testes Python**. `npm run check` passou. A chamada real Electron → Chrome for Testing 146 verificou catálogo, retratos, inferência via IPC, recepção Opus, mute/desmute e recuperação de CPU lenta. Braum produziu 3.840 samples finitos na prova isolada, com inferência de 146,5 ms; o navegador recebeu 7.699 bytes Opus. Dois blocos foram reproduzidos antes da recuperação automática, com p95 local de 282,7 ms. [Resultado](desempenho-voz-2026-10-10/round2/electron-smoke.json).

Esse smoke verifica explicitamente o modo de recuperação. Não certifica conversão contínua: esta CPU ainda apresenta RTF maior que 1, inclusive no perfil de menor consumo. O tráfego recebido inclui o período com a voz normal recuperada. A medição local exclui rede, jitter e dispositivo do receptor. Ganho e uso de VRAM na GPU, estabilidade durante jogos, Windows 10/11 e instalador continuam exigindo validação física.

## Reprodução

As referências anteriores estão em `/workspace/.local/share/resenhex/voice-validation/performance/round2`; os modelos usados permanecem no diretório `performance/models-bounded` da primeira rodada. Para repetir a equivalência neste workspace:

```bash
/workspace/.venvs/resenhex-voice/bin/python desktop/tools/check-voice-equivalence.py \
  /workspace/.cache/resenhex/voice/test-pt-br.wav \
  --models /workspace/.local/share/resenhex/voice-validation/performance/models-bounded \
  --reference-engine /workspace/.local/share/resenhex/voice-validation/performance/round2/engine-before.py \
  --output /tmp/resenhex-voice-equivalence.json
```

`benchmark-voice.py` continua aceitando `--engine`, `--voice` e `--profile`. Em Linux registra também tempo de CPU somado dos threads do worker, excluindo carregamento/aquecimento; esse valor não mede o consumo de energia nem impacto sobre um jogo. `benchmark-voice-transport.js --reference caminho-do-protocolo-anterior --output arquivo.json` repete os ensaios sintéticos, alternando a ordem das versões e descartando o aquecimento.
