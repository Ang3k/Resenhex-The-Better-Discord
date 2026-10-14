# Desempenho e seletor de personagens — 2026-10-10

Implementação local, sem deploy. Os seis modelos de personagem foram reexportados com síntese limitada ao trecho necessário. Braum, Zed, Pantheon e Ahri agora aparecem junto de Esquilo, Gigante, Robô, Rádio, Caverna e Alien, nas configurações e no menu da chamada, com retratos locais oficiais do Data Dragon 16.20.1. Vozes sem retrato verificado usam um símbolo de reserva. Escolher uma voz inicia sua instalação quando necessário; o painel de IA mantém progresso, remoção, idioma e origem.

A [segunda rodada de desempenho](DESEMPENHO-VOZ-IA-RODADA-2-2026-10-10.md) mede as otimizações posteriores de inferência paralela, reamostragem e protocolo, com equivalência de samples e validação atualizada. Os números abaixo registram a primeira rodada.

## Comparação real na CPU

Mesma máquina Linux, cinco vCPUs AMD EPYC 9V74, aproximadamente 33 GiB RAM, sem GPU; Python 3.12.14, ONNX Runtime CPU 1.23.2, NumPy 2.2.6 e SciPy 1.15.3. Mesmo WAV sintético em português, quatro segundos, 25 blocos de 160 ms e contexto de 320 ms por voz. As execuções foram consecutivas, com os grafos antigos preservados para comparação. Números dependem da carga da máquina e não representam Windows ou jogo em execução.

| Voz | Mediana antes | Mediana depois | Redução | p95 depois | RTF depois |
| --- | ---: | ---: | ---: | ---: | ---: |
| braum | 432.8 ms | 218.8 ms | 49.4% | 236.2 ms | 1.37 |
| zed | 476.7 ms | 223.1 ms | 53.2% | 246.0 ms | 1.39 |
| pantheon | 460.8 ms | 224.1 ms | 51.4% | 237.5 ms | 1.40 |
| ahri | 444.5 ms | 229.5 ms | 48.4% | 246.1 ms | 1.43 |
| kaede | 412.1 ms | 218.9 ms | 46.9% | 241.4 ms | 1.37 |
| uzuki | 413.4 ms | 206.5 ms | 50.0% | 242.6 ms | 1.29 |
| woman-1 | 416.9 ms | 370.3 ms | 11.2% | 409.1 ms | 2.31 |
| woman-2 | 448.9 ms | 352.8 ms | 21.4% | 380.4 ms | 2.20 |

Foram convertidos 200 blocos em cada versão, todos com tamanho correto e valores finitos. As seis vozes reexportadas reduziram o tempo mediano em aproximadamente 47–53%. As duas vozes femininas mantêm o ONNX original e recebem as otimizações comuns do worker. RTF continua superior a 1 nesta CPU: **esses ganhos ainda não certificam conversão contínua em tempo real**. O watchdog recupera o microfone normal quando o computador não acompanha.

Medições completas: [antes](desempenho-voz-2026-10-10/before.json), [depois](desempenho-voz-2026-10-10/after.json) e [hashes dos novos exports](desempenho-voz-2026-10-10/exports.json). Os checkpoints, encoders e RMVPE são os mesmos; mudaram apenas os grafos derivados das seis vozes.

## Mudanças que reduzem o trabalho

- Os pools ONNX descansam quando ociosos. Antes, threads de ContentVec, RMVPE e voz competiam entre si enquanto o próximo grafo rodava. Essa mudança isolada reduziu a mediana inicial de Braum de 440 para 322 ms. Mantivemos até quatro threads: dois e três foram mais lentos nesta máquina; isso não é calibração universal de hardware.
- O vocoder calcula somente o áudio novo, com as margens exatas de convolução em cada taxa intermediária. Atenção linguística, flow, contexto de ContentVec/RMVPE e fase completa do oscilador são preservados. As margens desses modelos são 9, 12, 48 e 33 amostras nas respectivas entradas das quatro camadas. Não há redução da janela linguística nem mudança de precisão dos pesos.
- A reamostragem processa apenas a janela que será ouvida, com margem FIR e fase alinhada. A normalização SOLA usa energia acumulada e reutiliza a rampa de transição.
- O worker dispensa os três grafos quando todo o histórico e bloco estão abaixo de −80 dBFS. Isso ocorre depois de drenar o contexto da fala; início/fim de palavras não são cortados por um teste apenas no bloco atual. Mute e PTT reiniciam a época e removem histórico antigo. O aquecimento inicial força inferência real, mesmo com silêncio.
- Mudanças de tom e perfil reutilizam grafos já carregados e verificados. Novos grafos e reinicializações continuam exigindo SHA-256 completo. Mudanças de formato aquecem os grafos antes de receber o microfone; alterações só de tom não repetem o aquecimento.
- O AudioWorklet copia por trechos e limita a captura a um bloco em processamento. Durante sobrecarga ele conta descartes sem transferir PCM que seria jogado fora. Créditos de processamento são vinculados à sequência e à época, impedindo respostas antigas de reabrirem a captura após mute/PTT.
- Estatísticas atualizam a interface no máximo quatro vezes por segundo; ativação e erros continuam imediatos. O seletor não reconstrói cartões nem altera atributos quando o estado visual é o mesmo.
- O perfil **Menor consumo** utiliza blocos de 160 ms e contexto de 320 ms, com menos inferências por segundo. É uma opção com maior espera de captura; não substitui a necessidade de uma máquina capaz.

## Preservação do áudio e dos controles

A comparação determinística do vocoder usa o checkpoint Braum verificado por hash, os mesmos latentes, pitch, fase, ruído e pesos, e compara o caminho completo com o limitado. Os nove pares de contexto 320/480/640 ms e bloco 80/120/160 ms passaram; erro absoluto máximo 0,000000641. O teste inclui transições entre fala vozeada e não vozeada. [Evidência](desempenho-voz-2026-10-10/vocoder-equivalence.json).

Testes do worker comparam reamostragem completa e por janela nas taxas 16/32/40/48 kHz, verificam que silêncio não chama grafos ou reproduz caudas antigas, confirmam preservação de contexto até ficar quieto e validam reutilização/aquecimento dos modelos. Testes JavaScript verificam limites de captura/reprodução, créditos de época, descarte de áudio velho, morte/reinício do worker, hashes, download/cancelamento, seleção de personagem com instalação automática, fallback de retrato, mute e push-to-talk.

A equivalência numérica verifica a otimização do vocoder. Não certifica semelhança com a atuação original dos personagens nem inteligibilidade humana em português; as vozes continuam experimentais. O próprio modelo original pode gerar artefatos.

## Pausas e teste real da chamada

Com um WAV de silêncio de quatro segundos, a mediana por bloco caiu de **401,87 ms para 0,223 ms**; p95 do RPC foi 0,64 ms e a saída ficou exatamente silenciosa. O carregamento ainda executou os grafos reais no aquecimento. Isso verifica a economia durante pausas após todo o contexto ficar quieto, sem inferir capacidade para fala contínua. [Antes](desempenho-voz-2026-10-10/silence-before.json) e [depois](desempenho-voz-2026-10-10/silence-after.json).

O smoke Electron real instalou Braum, produziu 3.840 amostras finitas via IPC, abriu P2P com Chrome for Testing 146 e recebeu 7.108 bytes Opus no navegador. Mute/desmute passaram, os oito modelos apareceram e os quatro retratos carregaram nas configurações e no menu da chamada. A inferência da prova isolada durou 162 ms; nos dois blocos reproduzidos antes da recuperação, p95 local foi **291 ms**, ante **552 ms** na execução anterior documentada. É uma amostra curta, seguida de fallback por CPU lenta; não mede latência da rede ou do receptor nem estabilidade em tempo real. [Resultado](desempenho-voz-2026-10-10/electron-smoke.json), [configurações](desempenho-voz-2026-10-10/effects-characters.png) e [menu da chamada](desempenho-voz-2026-10-10/call-menu-characters.png).

A suíte completa sob Xvfb passou com **254 testes Node**, sem falhas, cancelamentos ou testes ignorados; **11 testes Python** passaram. `npm run check`, `git diff --check` e as verificações de hash passaram. O smoke final também confirmou que o erro e a ação de recuperação ficam próximos do seletor, acima do catálogo de gerenciamento.

O build normal foi repetido e preservou os seis SHA-256 dos novos grafos; `voice:models` confirmou sua reutilização. Os componentes compartilhados e o runtime Windows mantiveram as versões fixadas anteriormente.

## Reprodução

```bash
/workspace/.venvs/resenhex-voice/bin/python desktop/tools/benchmark-voice.py \
  /workspace/.cache/resenhex/voice/test-pt-br-48k.wav \
  --models /workspace/.local/share/resenhex/voice-validation/performance/models-bounded \
  --output /workspace/.local/share/resenhex/voice-validation/performance/retest \
  --backend cpu --block-ms 160 --context-ms 320 --profile
```

O script também aceita `--engine` e `--catalog` para comparação com a versão anterior preservada no diretório externo `voice-validation/performance`. `desktop/tools/check-streaming-vocoder.py` verifica a equivalência no build com um checkpoint fixado no catálogo; o runtime não inclui Torch. Novos exports podem ser gerados em diretório separado com `build-character-voices.py --review-output`, medidos e revisados antes de alterar hashes. O build normal rejeita diferenças e substitui o ONNX somente depois da verificação.

## Limites restantes

Windows 10/11, DirectML, consumo de VRAM, desempenho durante jogos e instalação sem Python ainda precisam de teste físico. As otimizações de convolução e fluxo de áudio não dependem de uma GPU específica, mas o ganho de GPU não foi medido aqui. Não há garantia de que toda máquina possa executar RVC em tempo real. A montagem do instalador Windows continua dependendo do build nativo existente de push-to-talk no Windows, conforme [VOZ-IA.md](../VOZ-IA.md).
