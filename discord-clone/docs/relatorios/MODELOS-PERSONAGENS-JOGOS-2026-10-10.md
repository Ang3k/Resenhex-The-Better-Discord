# Modelos de personagens de jogos conhecidos

Pesquisa complementar solicitada para priorizar personagens reconhecíveis de League of Legends, God of War e outros jogos famosos. Foram encontrados modelos disponíveis para essas franquias e para GTA, Halo, Portal, Mario, Red Dead Redemption e The Witcher. Quatro modelos de LoL/Ruined King foram incorporados ao catálogo local; Kratos foi convertido e testado separadamente. Não houve deploy ou publicação.

## Catálogo ativo

| Personagem | Jogo | Idioma informado na origem | Licença declarada | Fonte |
| --- | --- | --- | --- | --- |
| Braum | League of Legends | Inglês, indicado por `EN` no nome do repositório | MIT | [AzathothSeven/Braum-League_Of_Legends-EN](https://huggingface.co/AzathothSeven/Braum-League_Of_Legends-EN) |
| Zed | League of Legends | Inglês, indicado por `EN` no nome do repositório | MIT | [AzathothSeven/Zed-League_Of_Legends-EN](https://huggingface.co/AzathothSeven/Zed-League_Of_Legends-EN) |
| Pantheon | League of Legends | Inglês, indicado por `EN` no nome do repositório | MIT | [AzathothSeven/Pantheon-League_Of_Legends-EN](https://huggingface.co/AzathothSeven/Pantheon-League_Of_Legends-EN) |
| Ahri | League of Legends / Ruined King | Não informado | WTFPL | [Igniszath/AhriRuinedKing](https://huggingface.co/Igniszath/AhriRuinedKing) |

Os quatro são RVC v2 de 40 kHz, com pitch e encoder de 768 características. Os nomes dos personagens são as identificações fornecidas pelos distribuidores. Dados de treinamento e autoria original não são documentados nos model cards mínimos. A licença é uma declaração do distribuidor, sem certificação independente de direitos sobre gravações ou obras. Nenhum modelo é apresentado como oficial ou certificado para português brasileiro.

O catálogo registra personagem, jogo, idioma, fonte imutável, condições e hashes de ZIP, checkpoint e ONNX. A interface os apresenta primeiro e os identifica como vozes experimentais. As quatro vozes anteriores continuam disponíveis. O aplicativo inclui seis modelos de personagem como recursos ONNX, aproximadamente 635 MiB; pesos grandes são ignorados pelo Git e reproduzidos pelo build. Runtime Windows permanece com aproximadamente 288 MiB, além dos encoders/RMVPE baixados no primeiro uso.

## Verificação técnica

Os ZIPs foram baixados de revisões fixadas e conferidos com os hashes SHA-256 publicados no Git LFS. Cada checkpoint interno teve tamanho e hash registrados e foi carregado com `torch.load(weights_only=True)`. Os ONNX foram verificados e a exportação repetida com o script de build do aplicativo produziu os mesmos hashes para as seis vozes incluídas. O build mantém os ZIPs fora dos recursos distribuídos e lê somente o membro `.pth` fixado, sem extrair caminhos do ZIP.

Inferência real com fala sintética em português: 25 blocos de 160 ms por voz, contexto de 320 ms, CPU, 4 segundos. Essa configuração é diagnóstica, não um preset da interface. Mesmo ambiente Linux sem GPU da validação inicial.

| Voz | Inferência mediana | Inferência p95 | RTF mediano | PCM |
| --- | ---: | ---: | ---: | --- |
| Braum | 417 ms | 482 ms | 2,60 | 25 blocos válidos |
| Zed | 445 ms | 483 ms | 2,78 | 25 blocos válidos |
| Pantheon | 423 ms | 452 ms | 2,65 | 25 blocos válidos |
| Ahri | 413 ms | 480 ms | 2,58 | 25 blocos válidos |
| Kratos, somente pesquisa | 427 ms | 491 ms | 2,67 | 25 blocos válidos |

São 125 blocos válidos no total, com samples finitos e tamanho correto. A CPU não sustenta áudio contínuo; esses resultados não são uma promessa de baixa latência.

O teste real com **Braum** confirmou oito cartões no catálogo, instalação com cópia do ONNX e verificação dos componentes via IPC, inferência real, saída no AudioWorklet e chamada P2P com um receptor Chrome. Dois blocos convertidos atingiram a saída, p95 local **552 ms**, antes da recuperação da voz normal por CPU lenta. O navegador recebeu **8.625 bytes** Opus; mute/unmute continuou funcionando. O modo executado foi explicitamente `fallback`, não o teste de conversão contínua `realtime`. Os bytes recebidos não separam áudio transformado e áudio após recuperação.

Testes Python: **7 passaram**, incluindo os três novos casos de leitura do ZIP, integridade do membro, preservação do checkpoint anterior e remoção de arquivo parcial. A suíte Node completa permaneceu com **249 testes passando**; o script `voice:models` validou a reutilização dos seis ONNX pelo hash. `npm run check` e `git diff --check` passaram.

## Qualidade

Os modelos transformam áudio em português, mas isso não os torna modelos treinados para português. Whisper tiny/int8 reconheceu parte da frase e trocou palavras em todas as saídas; Zed recuperou a primeira parte da frase com maior clareza neste diagnóstico curto. O teste automático não distingue sozinho artefatos de síntese de limitações do reconhecedor. Não houve avaliação humana de timbre, comparação com falas originais ou teste com microfone físico.

Portanto, as vozes são **experimentais**: use a prévia para avaliar compreensão antes de ativar na chamada. Não houve certificação de semelhança com o personagem. Índices `.index` que acompanham alguns ZIPs não são utilizados pelo motor atual; a ausência dessa recuperação pode afetar fidelidade. DirectML, comportamento durante jogos e qualidade sustentada continuam exigindo teste num Windows com GPU.

## Kratos e God of War

O ZIP `Kratos(720 epochs, 128 crepe).zip` está disponível em [LukeAndarilhoCeu/kratos](https://huggingface.co/LukeAndarilhoCeu/kratos), com Apache-2.0 declarada, e em [EuSouBrocha/Kratos](https://huggingface.co/EuSouBrocha/Kratos), com OpenRAIL declarada. Ambos têm exatamente o SHA-256 `efdb99c0c1fb527617da7f95f13801da5005b01a82bb94dbd27a976815cc04ca`.

O checkpoint é RVC v2/40 kHz e foi convertido com sucesso. O ONNX experimental tem SHA-256 `a75a0581b84a7f2358bc9ddaaa057eac53c72096467aec7266ecfbc46780d00c`. Checkpoint, ONNX, WAV e medidas estão no diretório externo de pesquisa, sem entrar no catálogo nem nos recursos do aplicativo. O idioma não está documentado e não foi inferido a partir dos nomes dos publicadores.

As fontes não esclarecem se houve mudança autorizada de licença ou um espelhamento com metadados divergentes. A inclusão pública desse arquivo depende de esclarecer qual conjunto de condições se aplica. Também foi encontrado [Homiebear/KratosGoWR](https://huggingface.co/Homiebear/KratosGoWR), identificado como God of War Ragnarök, com somente o rótulo OpenRAIL no card. [Homiebear/ATREUS](https://huggingface.co/Homiebear/ATREUS) e [TheGreasyGamer/Mimir](https://huggingface.co/TheGreasyGamer/Mimir) são outros candidatos da franquia, sem teste de compatibilidade nesta etapa.

## Outros candidatos encontrados

Esta tabela registra arquivos acessíveis ou listados publicamente e as declarações na origem. Ela não representa aprovação técnica ou inclusão no catálogo. A licença OpenRAIL é uma família de licenças; um rótulo genérico sem texto/variante não permitiu registrar condições completas de distribuição.

| Personagem | Jogo | Fonte | Estado |
| --- | --- | --- | --- |
| Jinx | League of Legends | [menhguin/JinxLeague](https://huggingface.co/menhguin/JinxLeague) | ZIP disponível; OpenRAIL no card; variante/texto não fornecidos; não convertido |
| Ahri, possível versão brasileira | League of Legends | [Messeraicovers/ahribr](https://huggingface.co/Messeraicovers/ahribr) | ZIP disponível; `br` somente no nome, idioma não certificado; OpenRAIL++ sem texto completo; não convertido |
| Yasuo | League of Legends | [b0nateur/YasuoRVCModel](https://huggingface.co/b0nateur/YasuoRVCModel) | ZIP listado; OpenRAIL; não convertido |
| Mario | Super Mario | [Narufan/Super_Mario_By_Mboisuper_450_Epochs](https://huggingface.co/Narufan/Super_Mario_By_Mboisuper_450_Epochs) | ZIP disponível; OpenRAIL; não convertido |
| Master Chief | Halo | [Homiebear/MasterChief](https://huggingface.co/Homiebear/MasterChief) | ZIP disponível; OpenRAIL; não convertido |
| GLaDOS | Portal | [Homiebear/GLaDOSV4](https://huggingface.co/Homiebear/GLaDOSV4) | ZIP disponível; OpenRAIL; não convertido. Modelos Piper/TTS encontrados separadamente não são RVC |
| Arthur Morgan | Red Dead Redemption 2 | [Homiebear/ArthurMorgan](https://huggingface.co/Homiebear/ArthurMorgan) | ZIP disponível; OpenRAIL; não convertido |
| Trevor Philips | GTA V | [Homiebear/TrevorPhilipsV3](https://huggingface.co/Homiebear/TrevorPhilipsV3) | ZIP listado; OpenRAIL; não convertido |
| CJ, Big Smoke e outros | GTA San Andreas / GTA V | [grandtheftauto/gta5characters](https://huggingface.co/grandtheftauto/gta5characters) | Vários ZIPs listados; OpenRAIL; não convertidos |
| Geralt | The Witcher 3 | [Astarossa/GeraltWitcher3](https://huggingface.co/Astarossa/GeraltWitcher3) | Apache-2.0 declarada; configuração inspecionada identifica So-VITS 4.0, não compatível com o motor RVC atual |

Os candidatos de outras franquias ficaram documentados para expansão com validação de formato, idioma, voz e termos. Não foram baixados ou incluídos automaticamente com base apenas no nome do personagem. Os quatro modelos ativos têm suas declarações preservadas em `desktop/voice-engine/licenses/models` e os textos MIT/WTFPL acompanham os avisos.

## Evidências e reprodução

[Fontes e revisões consultadas](modelos-jogos-2026-10-10/sources.json), [medidas](modelos-jogos-2026-10-10/measurements.json), [Electron/P2P](modelos-jogos-2026-10-10/electron-smoke.json), [diagnóstico de articulação](modelos-jogos-2026-10-10/intelligibility.json) e [catálogo na interface](modelos-jogos-2026-10-10/catalog-games.png).

O diretório externo `/workspace/.cache/resenhex/voice/game-model-research` preserva consultas, arquivos de origem verificados e o ONNX experimental de Kratos. Os modelos ativos estão em `desktop/voice-engine/models`. O benchmark aceita `--voice braum --voice zed` para selecionar vozes; `--catalog` permite verificar um catálogo de pesquisa separado. O smoke permite `RESENHEX_VOICE_TEST_MODEL=braum`. Consulte [VOZ-IA.md](../VOZ-IA.md) para instalação, build e demais requisitos.


## Otimização posterior

Os seis ONNX de personagem foram reexportados com vocoder limitado pelo campo receptivo das convoluções. Checkpoints e licenças permanecem os mesmos; os hashes anteriores deste relatório pertencem à exportação original. Hashes atuais, medições comparativas e retratos no seletor estão no [relatório de desempenho](DESEMPENHO-VOZ-IA-2026-10-10.md).
