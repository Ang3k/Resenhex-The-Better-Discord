# Validação local de Voz por IA — 10/10/2026

A integração foi implementada e executada localmente, sem deploy: catálogo, downloads, runtime preparado, inferência ONNX, configurações, prévia, controles e saída para as chamadas. O teste real Electron → navegador entregou dois blocos convertidos ao AudioWorklet antes de recuperar a voz normal por CPU lenta. Isso valida o caminho e a recuperação, mas não certifica uso contínuo em tempo real, semelhança com personagens, GPU Windows ou o instalador final.

## Ambiente

Linux de nuvem, 5 vCPU AMD EPYC 9V74, aproximadamente 33 GiB RAM, sem GPU. Node 24.19.0, npm 11.9.0, Python 3.12.14, NumPy 2.2.6, SciPy 1.15.3, ONNX Runtime CPU 1.23.2. Electron 44.5.1/Chromium 152; receptor Chrome for Testing 146.0.7680.165. Interface Electron executada sob Xvfb. Áudio de entrada: fala sintética em português brasileiro, produzida para o teste; nenhum microfone pessoal foi gravado.

A pesquisa fornecida pelo usuário, `PESQUISA-EFEITOS-VOZ-2026-10-10.md`, orientou a escolha de RVC local e do w-okada como referência. Foram inspecionados o cliente w-okada no commit `d8ef15799470193f7c8176ef471245753a656626` e a implementação RVC original. O caminho de produção utiliza ONNX e comunicação binária local, com parte do exportador MIT dessas implementações apenas no build.

## Resultados

| Verificação | Resultado e alcance |
| --- | --- |
| Suíte Node completa, `node --test --test-concurrency=1` sob Xvfb | 249 passaram, 0 falhas, cancelamentos, ignorados ou pendentes; cerca de 104 s |
| `npm run check` e `git diff --check` | Passaram |
| Worker Python, `unittest` | 4 passaram: protocolo, limites/truncamento, configuração inválida e PCM/generation |
| Testes novos de download/IPC/gerenciamento/worklet | Integridade SHA/tamanho, reutilização, cancelamento sem arquivo parcial, mensagens fragmentadas, limite de sessões e fila, morte/reinício, descarte de época antiga, mute, fila/stale/NaN e troca do tamanho de bloco |
| Interface com chamadas simuladas | Prévia privada durante mute, troca IA/efeito anterior, PTT pressionado/solto e troca de microfone mutado passaram |
| Inferência real, quatro vozes | 25 blocos por voz, 100 no total, com tamanho correto, samples finitos e WAVs de saída |
| Exportação Kaede/Uzuki repetida | Checkpoints conferidos, carregamento `weights_only=True`, ONNX verificado e hashes idênticos ao catálogo |
| Runtime Windows | CPython, 11 wheels e redistribuível Microsoft baixados com hashes; recursos x64 montados, DLLs e avisos presentes; cerca de 288 MiB. Execução Windows não realizada |
| Teste real Electron + RVC + P2P + navegador | Passou no modo explícito `fallback`; inferência via preload/IPC real, dois blocos convertidos, conexão P2P, recepção de Opus, mute/unmute e retorno à voz normal, sem erros JavaScript |
| Instalador Windows | Não gerado: módulo nativo `uiohook-napi` exige build Windows; erro confirmado do node-gyp sobre ausência de cross-compilation |
| DirectML, GPU, fala humana e jogo simultâneo | Não executados: não há Windows, GPU ou microfone físico nesta máquina |

O teste Electron utilizou Kaede, CPU e **Menor atraso** (80 ms/320 ms). A prova separada via IPC retornou 3.840 samples finitos, inferência de 421,0 ms e RTF 5,26. Durante a chamada, dois blocos convertidos chegaram à saída, com p95 local de **523 ms**. O navegador recebeu **7.913 bytes** de áudio Opus. A recuperação foi: “Conversão lenta; tente GPU ou outra qualidade. Sua voz voltou ao normal.” A conexão e o controle da trilha de áudio continuaram funcionando após a recuperação.

Esses 523 ms foram medidos na integração, da captura à reprodução no AudioWorklet, numa amostra curta que falhou o requisito de tempo real. Não são latência estável prometida para Resenhex e não incluem atraso de rede/receptor. O teste não determina quanto dos bytes Opus recebidos corresponde aos dois blocos convertidos; prova separadamente saída convertida local, transporte conectado e recepção normal.

## Medidas do motor

Benchmark sequencial sem o navegador: quatro segundos de áudio por voz, blocos de 160 ms e contexto de 320 ms, CPU com quatro threads ORT. Essa combinação é diagnóstica e não corresponde a um preset da interface. Aquecimento e carregamento são medidos separadamente. Foram utilizados os encoders correspondentes a cada voz.

| Voz | Inferência mediana | Inferência p95 | RTF mediano | Carregamento/aquecimento |
| --- | ---: | ---: | ---: | ---: |
| Kaede | 386 ms | 444 ms | 2,41 | 2.456 ms |
| Uzuki | 386 ms | 433 ms | 2,41 | 1.120 ms |
| Voz feminina 1 | 440 ms | 494 ms | 2,75 | 1.763 ms |
| Voz feminina 2 | 428 ms | 482 ms | 2,68 | 1.357 ms |

Todas as saídas foram finitas; picos variaram entre 0,65 e 0,81. Esses resultados comprovam funcionamento numérico e transformação, mas a CPU é 2,4–2,8 vezes mais lenta que a duração do áudio. Não é adequada para uso contínuo nesta configuração. O aplicativo interrompe a transformação diante de conversões repetidamente lentas em vez de acumular fala atrasada.

Foram comparadas durações de contexto e número de threads. Encurtar apenas o contexto da síntese reduziu custo, mas prejudicou articulação de palavras no teste em português; a versão entregue conserva contexto no encoder e no sintetizador. Também há alinhamento SOLA limitado a 10 ms e crossfade de 20 ms entre blocos. Os resultados não fornecem um mínimo de CPU/GPU certificado.

## Qualidade e catálogo

Os quatro modelos aceitam fala em português e alteram timbre, mas a qualidade de articulação variou. Uma comparação auxiliar com Whisper tiny/int8 recuperou boa parte da frase e também trocou ou juntou palavras nas saídas. Esse diagnóstico automático com uma frase sintética curta não substitui avaliação humana nem permite afirmar semelhança artística.

Não foi encontrado, nas origens avaliadas, modelo de LoL ou voz treinada para português brasileiro com distribuição e disponibilidade verificáveis suficientes para inclusão. Kaede/Uzuki preservam o nome original de modelos comunitários; identidade específica, treinamento e idioma não estão documentados. O catálogo registra essas condições na interface. Samples do w-okada com restrição ao VCClient foram excluídos. Não há índice de recuperação RVC/Faiss nesta versão.

Fontes e condições declaradas estão em `desktop/lib/voice-catalog.json` e `desktop/voice-engine/THIRD-PARTY-NOTICES.md`. Não houve consulta paga, servidor GPU, implantação ou publicação de modelos.

## Problemas diagnosticados durante a validação

- A suíte existente apresentou uma corrida de entrega de estado num teste de moderação e uma saída de servidor de teste na inicialização, em execuções com concorrência maior. Os casos passaram isoladamente e a suíte final inteira passou com concorrência 1. A causa exata da saída de inicialização não foi certificada.
- Chromium 151 do sistema não gerou candidatos ICE, inclusive num PeerConnection isolado. Chrome for Testing 146 gerou candidatos e completou o P2P com Electron. Nenhuma alteração de transporte do aplicativo foi feita para contornar essa diferença do navegador de teste.
- O harness de vídeo já existente no onboarding falhou aguardando captura com altura ≤360, embora o código reduza resolução no codificador, e apresentou ausência de quadros/conexão. Ele não constitui validação de vídeo desta entrega; não foi alterado para produzir um resultado positivo.
- A tentativa de `npm run dist -- --dir --x64`, com recursos Windows preparados, terminou com `node-gyp does not support cross-compiling native modules from source`. O rebuild do gancho nativo não foi desativado. Por isso não há `.exe`/`.appx` entregue ou validado nesta máquina.

## Evidências e reprodução

[Medidas do motor](voz-ia-2026-10-10/measurements.json), [resultado Electron](voz-ia-2026-10-10/electron-smoke.json), [diagnóstico de articulação](voz-ia-2026-10-10/intelligibility.json) e [captura do catálogo](voz-ia-2026-10-10/catalog.png) acompanham este relatório. Os WAVs sintéticos e logs completos permanecem em `/workspace/.local/share/resenhex/voice-validation` e `/tmp/resenhex-voice-*.log` no ambiente atual. Pesos e recursos grandes são gerados/baixados e estão ignorados pelo Git.

Os comandos e variáveis necessários estão em [VOZ-IA.md](../VOZ-IA.md). O smoke usa contas e dados temporários e os remove ao encerrar. Seu modo padrão `realtime` exige conversão contínua; o resultado CPU acima usa explicitamente `RESENHEX_VOICE_TEST_EXPECT=fallback` e `RESENHEX_VOICE_TEST_BACKEND=cpu`.

## Validação que permanece necessária no Windows

Gerar e instalar `.exe`/`.appx` num Windows 10/11 x64 sem Python pré-instalado; confirmar inicialização e encerramento do motor, download/cancelamento/remoção e preferências após reinício. Executar o smoke `realtime` com DirectML e cada voz, medir p95 durante jogos e observar CPU, RAM e VRAM. Avaliar voz humana em português, inteligibilidade e timbre por audição. Exercitar push-to-talk global em segundo plano, mute/moderação, troca física de microfone, redução de ruído, reconexão e chamada longa. SFU e receptor móvel não foram exercitados fisicamente; o ponto de integração conserva a trilha de microfone compartilhada pelas chamadas existentes.

Até essas etapas passarem, a implementação está disponível para desenvolvimento local e teste Windows, com recuperação segura em CPU lenta; a entrega não deve ser descrita como totalmente validada no alvo Windows/GPU.

## Expansão posterior do catálogo

Após esta validação inicial, a pedido do usuário, Braum, Zed, Pantheon e Ahri foram acrescentados ao catálogo ativo. Kratos foi convertido e testado num diretório externo de pesquisa. Os resultados e condições desta etapa estão em [MODELOS-PERSONAGENS-JOGOS-2026-10-10.md](MODELOS-PERSONAGENS-JOGOS-2026-10-10.md); as medidas e o catálogo de quatro vozes descritos acima preservam a validação inicial.


## Otimização posterior nesta tarefa

O [relatório de desempenho](DESEMPENHO-VOZ-IA-2026-10-10.md) registra os novos grafos, comparações antes/depois, silêncio, seleção com retratos e teste Electron. Os números anteriores acima descrevem a implementação anterior, não o desempenho dos grafos atuais.
