# Imagens próprias dos efeitos de voz

Coleção criada para o Resenhex com o gerador integrado `image_gen`, em 12/10/2026: quatorze efeitos padrão e a voz normal. Cada imagem foi gerada individualmente, com fundo transparente, em uma direção comum de miniaturas de argila/cerâmica.

O app usa apenas os WebP de largura 192 px, proporção original e alpha preservado. Total dos quinze arquivos: **105 074 bytes**. As imagens são decorativas; os nomes dos efeitos e os rótulos acessíveis continuam no HTML. Em uma falha de carregamento, o app conserva um ícone neutro de microfone e o nome do efeito.

`manifest.json` registra tamanho, hashes, dimensões e transparência dos originais, além dos parâmetros de exportação. Os prompts finais estão em `tools/voice-chosen/art-prompts.json`. Não foram usados arquivos de emoji ou retratos do catálogo de personagens.

Os PNGs originais estão arquivados em `C:/Games/project2/artifacts/voice-effects-art-2026-10-12/originals`, fora do pacote público. A exportação usa libwebp/cwebp 1.6.0, qualidade 86 e qualidade alpha 100, pelo script `tools/voice-chosen/import-art.cjs`. O gerador criou as ilustrações; essa etapa somente prepara as versões pequenas para o site.
