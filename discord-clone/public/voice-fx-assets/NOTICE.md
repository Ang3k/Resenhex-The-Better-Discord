# Respostas acústicas dos efeitos escolhidos

`manifest.json` registra receitas, taxa de 48 kHz, tamanho e SHA-256 dos arquivos efetivamente usados pelo app. Nenhum áudio de usuário ou de comparação está nesta pasta.

## Banheiro

Resposta medida **Tiled Bathroom / Stereo**, de **Calum Farquharson / The Impulse Factory**:
https://theimpulsefactory.wordpress.com/room-impulse-responses/room-reverberations/tiled-bathroom/

SHA-256 do WAV original arquivado: `7b286618913dcad17a7d0df3f8a5063c1e8d64bb045700e047d2209600ed77bb`.
Adaptação local: reamostragem a 48 kHz e normalização pela média da energia L2 dos canais; combinação seca 0,65 / molhada 0,55, pré-atraso de 8 ms no grafo do app.

O site apresenta a coleção como uma biblioteca de impulso aberta. A inspeção das páginas públicas não encontrou um texto formal de licença que confirme as condições de redistribuição desse WAV. O arquivo não foi rotulado como CC, MIT ou domínio público. Esta pendência está registrada para a publicação; a cópia de desenvolvimento conserva a referência que o usuário escolheu. Nenhum contato com o autor foi enviado.

## Caverna, Alien e Fantasma

Respostas numéricas geradas localmente com SoX 14.4.2, pelas cadeias de reverb/echo da seleção aprovada. O binário SoX não é distribuído no cliente. Os parâmetros completos, o impulso inicial de 0,01 e a ausência de normalização estão no manifesto. A convolução usa dez segundos da resposta, incluindo a extensão do echo; o envio após o fim da fala é limitado pela janela do gate documentada no relatório.

SoX: https://sox.sourceforge.net/

## Voz em acordes e Coral

Salas sintéticas reproduzidas pela função `hall()` da prova aprovada: sementes 7 e 11, tempos 2,4 s / 3,2 s, pré-atrasos 28 ms / 35 ms, amortecimento 3200 Hz / 2600 Hz. Geração e normalização estão em `tools/voice-chosen/prepare-assets.py`.
