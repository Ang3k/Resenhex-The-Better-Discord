# Imagens próprias dos efeitos — 12/10/2026

Quinze ilustrações foram criadas individualmente com o **gerador integrado `image_gen`**, com fundo transparente: os treze efeitos escolhidos, Rádio e a voz normal. Não foi usado o modo CLI/API para gerar as imagens. Os prompts finais estão em [art-prompts.json](../../tools/voice-chosen/art-prompts.json).

A coleção segue uma direção comum de miniaturas de argila/cerâmica, com cores creme, violeta, terracota e turquesa. Esquilo e Gigante têm proporções distintas; Banheiro e Caverna representam seus ambientes; Robô, Alien e Fantasma têm silhuetas próprias. Bêbado é um microfone torto e tonto. Autotune mostra níveis de afinação, Acordes mostra notas simultâneas sobre teclas e Coral mostra três pessoas cantando, para diferenciar os três efeitos musicais.

## Integração

Os emojis saíram do catálogo `VoiceFx.PRESETS`. As imagens entram nos cartões das configurações, no menu rápido, na indicação do efeito atual e no canto do participante da chamada. Os nomes e rótulos acessíveis permanecem; as imagens são decorativas, com `alt` vazio. A interface reserva os tamanhos antes de carregar, usa decodificação assíncrona e carregamento sob demanda. Se uma imagem falhar, o ícone neutro de microfone preserva a leitura do botão.

A página de áudio em `http://127.0.0.1:38156/` também usa as imagens. A coleção completa pode ser vista em **http://127.0.0.1:38156/arte/**. O app local está em `http://127.0.0.1:38157/`.

## Arquivos finais e peso

- Imagens do site: `C:/Users/angej/.codex/worktrees/efeitos-escolhidos/project2/discord-clone/public/assets/voice-effects/*.webp`.
- Manifesto de tamanhos, hashes e transparência: [manifest.json](../../public/assets/voice-effects/manifest.json).
- Prompts finais por imagem: [art-prompts.json](../../tools/voice-chosen/art-prompts.json).
- PNGs originais copiados para o workspace: `C:/Games/project2/artifacts/voice-effects-art-2026-10-12/originals/`.

As quinze versões públicas somam **105 074 bytes**, cerca de 103 KiB. Cada WebP tem largura 192 px, conserva a proporção e a transparência. A preparação para o site usa cwebp 1.6.0, qualidade 86, alpha 100, pelo script [import-art.cjs](../../tools/voice-chosen/import-art.cjs). Os PNGs grandes ficam fora do pacote público. O app só entrega imagens estáticas; não há geração de imagens em tempo de uso.

## Verificação proporcional

Três testes focados de UI passaram: imagens no menu, seleção/troca dos efeitos com a mesma captura, fallback de imagem, retirada das vozes de personagens e atualização da imagem no participante ao trocar de efeito. As imagens correspondem a todos os quinze IDs do catálogo; seus hashes conferem com o manifesto.

No Chromium real, a coleção carregou os quinze WebP, com largura nativa de 192 px, em desktop e largura móvel 390 px, sem overflow horizontal. As capturas foram inspecionadas visualmente. A comparação de áudio também passou sua verificação de 26 players, volume, reprodução exclusiva e parada. Os núcleos DSP e os áudios dos efeitos não foram modificados.

Capturas e resultado do navegador: `C:/Games/project2/artifacts/voice-effects-art-2026-10-12/collection-desktop.png`, `collection-mobile.png` e `browser-check.json`. Implementação na branch `codex/efeitos-escolhidos`; sem deploy de produção nesta etapa.
