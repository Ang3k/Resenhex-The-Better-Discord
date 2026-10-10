# Componentes de Voz por IA

O áudio é convertido num processo Python separado, através de stdin/stdout. Os componentes abaixo têm suas próprias licenças, distintas do Resenhex.

| Componente | Origem | Licença |
| --- | --- | --- |
| CPython 3.12.10 embeddable x64 | https://www.python.org/downloads/release/python-31210/ | PSF; licença incluída no runtime |
| ONNX Runtime DirectML 1.23.0 | https://github.com/microsoft/onnxruntime | MIT; avisos no wheel distribuído |
| Microsoft Visual C++ 2022 runtime x64 14.44.35211 | https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist | Termos Microsoft; DLLs redistribuíveis em modo app-local e licença incluída |
| NumPy 2.2.6 / SciPy 1.15.3 | https://numpy.org/ / https://scipy.org/ | BSD; bibliotecas nativas e seus avisos incluídos nos wheels |
| Encoder RVC 768/layer12 | https://huggingface.co/ozada/onnx_rvc | MIT declarada no model card; ONNX originais sem alteração |
| RMVPE ONNX | https://huggingface.co/wok000/weights_gpl | GPL-3.0, conforme declaração do distribuidor; pesos baixados separadamente, sem alteração |
| Braum — League of Legends | https://huggingface.co/AzathothSeven | MIT declarada nos model cards. ZIP, checkpoint e ONNX fixados por SHA-256; cards originais em licenses/models |
| Veigar / Tristana / Kled (dublagem BR) — League of Legends | https://huggingface.co/Messeraicovers | OpenRAIL / OpenRAIL++ declaradas nos model cards. ZIP, checkpoint e ONNX fixados por SHA-256; cards originais em licenses/models |
| Naruto / Akali / Reyna (dublagem BR) | https://huggingface.co/RafaG | OpenRAIL declarada no model card. ZIP, checkpoint e ONNX fixados por SHA-256; cards originais em licenses/models |
| Draven (dublagem BR) — League of Legends | https://huggingface.co/AlbinoSenpai | OpenRAIL declarada nos model cards. ZIP, checkpoint e ONNX fixados por SHA-256 |
| Sett (dublagem BR) — League of Legends | https://huggingface.co/Viniciaao | Licença não declarada pelo distribuidor. ZIP, checkpoint e ONNX fixados por SHA-256 |
| Exportador RVC utilizado apenas no build | https://github.com/w-okada/voice-changer/tree/d8ef15799470193f7c8176ef471245753a656626 | MIT; fontes e licenças em desktop/tools/rvc-export. Modificações locais adicionam síntese limitada pelo campo receptivo das convoluções, preservando atenção, flow e fase do oscilador |
| Retratos Braum / Veigar / Tristana / Kled / Sett / Akali / Reyna / Draven (Naruto: AniList; ver SOURCES.json) | https://ddragon.leagueoflegends.com/ | Riot Games; Data Dragon 16.20.1, uso de identificação em projeto de fã conforme https://www.riotgames.com/en/legal. URLs e hashes em public/assets/voice-characters/SOURCES.json; imagens não estão sob a licença dos modelos |

O catálogo `desktop/lib/voice-catalog.json` registra URLs imutáveis, hashes, tamanho, idioma informado e condições declaradas. Não há afiliação oficial com obras ou personagens. A origem do treinamento das vozes não está documentada pelos distribuidores; nenhum modelo é apresentado como verificado para português brasileiro. A validação técnica de inferência não certifica semelhança artística ou a origem dos dados.

O catálogo exclui os samples RVC do w-okada que limitam o uso ao VCClient. O modelo de Jinx citado na pesquisa estava indisponível na data da implementação e não integra esta distribuição.

Kratos foi avaliado apenas no diretório externo de pesquisa: o mesmo ZIP aparece como Apache-2.0 em LukeAndarilhoCeu/kratos e OpenRAIL em EuSouBrocha/Kratos, sem esclarecimento da divergência. Não integra os recursos distribuídos nem o catálogo ativo. A pesquisa complementar de modelos conhecidos está em docs/relatorios/MODELOS-PERSONAGENS-JOGOS-2026-10-10.md.

O instalador mantém os avisos de cada dependência nos diretórios `.dist-info` do runtime. O exportador preserva separadamente as licenças originais RVC e w-okada. O texto GPL-3.0 acompanha estes avisos em `licenses/GPL-3.0.txt`; as fontes/origem dos pesos são os links acima.
