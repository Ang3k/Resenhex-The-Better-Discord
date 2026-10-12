# Plano: levar os efeitos de voz escolhidos para o Resenhex

Data: 12/10/2026. Origem: rodadas de escuta com o dono do projeto (sessão de laboratório de voz).

### Decisão de volume durante a integração

Na medição de 12/10, o Robô favorito apresentou cerca de +5,7 dB em relação ao original pelo peso de 100 Hz. O dono escolheu explicitamente **manter o volume do Robô favorito e abrir essa exceção** à regra geral de ±1 dB. A proteção de pico permanece. Esquilo e Gigante continuam no caminho publicado, como solicitado; esse caminho também excede ±1 dB na frase de prova. Não serão nivelados silenciosamente, pois isso contrariaria a decisão específica de preservá-los.

## Objetivo

Implementar no modificador de voz do Resenhex (call ao vivo, `public/voice-fx.js` e o que mais for preciso) **exatamente** os efeitos aprovados abaixo. Os áudios de referência são o contrato: o resultado na call deve soar como eles.

- **Página de referência:** `artifacts/voice-source-live/prova-bebado-magic-2026-10-12/favoritos/index.html`. Para ouvir, servir com `node artifacts/voice-results-build-2026-10-12/serve-results.cjs` e abrir `http://127.0.0.1:38155/prova-bebado-magic-2026-10-12/favoritos/`.
- **Entrada comum:** todos os WAVs usam a mesma frase de 18,62 s (`favoritos/original.wav`; float32 em `artifacts/voice-results-build-2026-10-12/input.f32`), 48 kHz.
- **Decisões resumidas:** `favoritos/DECISOES.txt`.

## Regras gerais (valem para todos)

1. **Sem atraso acumulado.** Nenhum efeito pode ir ficando para trás durante a conversa. O único efeito que mexe no ritmo é o Bêbado, e ele tem atraso limitado (ver abaixo).
2. **Volume:** cada efeito fica a ±1 dB da voz sem efeito e com pico abaixo de −1 dBFS. A exceção é o Fantasma, que fica cerca de 3 dB abaixo de propósito. Medição usada nas provas: energia ativa com passa-altas de 100 Hz, só nos quadros de fala acima de −45 dB.
3. **Latência:** manter a latência atual dos efeitos com tom (~70 ms do Signalsmith Stretch) como teto razoável. Efeitos musicais podem ter um pouco mais, se for medido e documentado.
4. **Celular:** medir CPU no Android (app WebView) para Coral e Acordes, que rodam muitas camadas.
5. **Removidos:** Walkie-talkie e Robô musical **não** entram. O Monstro foi substituído pelo Gigante. O slot "Rádio" atual não foi avaliado nesta rodada; não remover sem perguntar.

## Os efeitos

### Já no ar: não alterar

| Efeito | Como está | Referência |
|---|---|---|
| **Esquilo** | `voice-fx.js` do site: Signalsmith Stretch +8 semitons, sem compensação de formante, limitador final | `favoritos/esquilo.wav` (renderizado com o código do site, `favoritos/online/`) |
| **Gigante** | `voice-fx.js` do site: −7 semitons + lowshelf 180 Hz +4 dB, limitador final | `favoritos/gigante.wav` |

O dono pediu explicitamente que esses dois fiquem **iguais ao que está no site**. Não mexer em tom, ritmo nem timbre.

### Simples: nós nativos de Web Audio

| Efeito | Receita aprovada | Referência |
|---|---|---|
| **Telefone** | Passa-baixas 2000 Hz ×2 → passa-altas 500 Hz ×2 (Q=1) → compressor | `favoritos/telefone.wav` |
| **Megafone** | Filtros do Telefone → waveshaper com curva publicada k=30 (8193 pontos, oversample 4×) → compressor. Fonte: voicechanger.io `megaphone.js` | `favoritos/megafone.wav` |
| **Banheiro** | Convolução com IR estéreo real de banheiro azulejado (2,79 s, `artifacts/voice-results-build-2026-10-12/components/bathroom-stereo.wav`, licença em The Impulse Factory). Seco 0,65, molhado 0,55, pré-delay 8 ms, IR normalizado por energia L2 média. O IR precisa ser servido junto com o app. | `favoritos/banheiro.wav` |
| **Caverna** | Receita SoX `reverb 80` + `echo 0.6 0.6 120 0.3`: reverberação longa e eco de 120 ms. **É diferente da Caverna atual do site.** Reproduzir a da página. | `favoritos/caverna.wav` |
| **Alien** | Receita SoX `pitch 400` (+4 semitons) + `echo 0.8 0.6 80 0.5` + `reverb 40`. Diferente do Alien atual do site; reproduzir a da página. O tom pode usar o Signalsmith Stretch já carregado. | `favoritos/alien.wav` |

Origem das receitas SoX: `marmalade-tts/effects.py` (link em `artifacts/voice-source-live/resultados-classicos-2026-10-12/recipes.json`).

### Médios: precisam de AudioWorklet próprio

**Robô** (`favoritos/robo.wav`)
- Vocoder de 40 bandas (100–10 000 Hz, largura 0,5 da banda, passa-banda de ordem 3) com portadora dente de serra fixa em 92 Hz e envelope de 50 Hz.
- Depois, modulação em anel de 40 Hz (0,75 seco, 0,25 modulado). Base: exemplo `battle_droid.py` do voicebox.
- Depois, **+6 dB**: passa-altas de 1ª ordem em 250 Hz, +5 dB, limitador suave `tanh` (`tanh(1.1·x)/tanh(1.1)·0.89`) e mais +2,5 dB. Pico final ~−2 dBFS.
- O dono achou a versão original baixa demais; a versão com a voz por baixo foi **rejeitada**.
- É diferente do Robô atual do site; reproduzir o da página.

**Fantasma** (`favoritos/fantasma.wav`)
- Voz sussurrada: FFT de magnitude com fase aleatória, janela 512, salto 64, sobreposição e soma.
- Depois, SoX `echo 0.9 0.7 200 0.6` + `reverb 60` + `vol 0.7`.
- Fica cerca de 3 dB abaixo do original, de propósito.

**Bêbado** (`favoritos/bebado-oscila.wav`; receita `artifacts/voice-bebado-magic-build-2026-10-12/rodada2/render.py`, preset `bebado-oscila`)
- **Ritmo:** esticamento WSOLA (janela 1536, passo de saída 384, busca ±384 amostras) com velocidade variável a cada 8 ms.
  - Sorteia trechos de 0,45–1,2 s entre *arrastar* (0,50–0,68×), *normal* (0,90–1,05×) e *atropelar* (1,30–1,55×).
  - Suavização de 90 ms.
- **Atraso:** nunca negativo (não dá para adiantar a fala), máximo de 0,7 s.
  - Acima de 0,6×0,7 s de atraso, força o modo atropelar.
  - Nas pausas, sem fala, a velocidade vai a 1,9× até zerar o atraso.
  - Com atraso zero, nunca acelera.
- **Tom:**
  - Deriva lenta: soma de senos de 0,23, 0,61 e 1,37 Hz, ±45 cents.
  - Mais (velocidade − 1)×60 cents: desce quando arrasta, sobe quando atropela.
  - Aplicado por reamostragem compensada no WSOLA.
- **Articulação mole:** nos trechos lentos, mistura até 55% de um passa-baixas de 2,6 kHz.
- **Volume:** balança ±1,5 dB acompanhando a deriva de tom.
- **Sem eco e sem IA.**
- **Rejeitados:** o preset Chido FX `drunk-guy` e o Seed-VC.
- **Atenção:** a voz de quem fala é a referência de tempo. Testar numa call real que o atraso fica abaixo de 0,7 s e volta a zero nas pausas.

### Difíceis: Autotalent em WebAssembly

Acordes, Coral e Autotune usam o **Autotalent 0.2** (C, GPL; fonte em `artifacts/voice-results-build-2026-10-12/components/autotalent-0.2/`). Ele precisa ser compilado para WASM e rodar num AudioWorklet, uma instância por camada.

**Armadilhas conhecidas na compilação:**
- O Autotalent lê memória de `malloc` antes de inicializar. Sem zerar, o volume das camadas varia até 10× de uma execução para outra. Forçar `calloc` (ver `rodada2/zero-alloc.h`).
- Usar `-fno-strict-aliasing -ffp-contract=off`; com `-O2` puro o resultado muda.
- Latência própria do Autotalent: 2047 amostras (~43 ms).
- Host de referência, com todos os controles usados: `rodada2/at-host.c`. Ele reproduz byte a byte as provas anteriores.

**Voz em acordes** (`favoritos/acordes-voz-0-75db.wav`; receita `rodada2/render3.py` função `acordes(rhythm=False)` + `rodada2/render4.py` com 0,75 dB)
- **Progressão:** C → G → Am → F, 80 BPM, troca a cada 1,5 s, glissando de 90 ms, em loop.
- **Cinco vozes, cada uma presa a uma nota fixa** (Autotalent com *pull* 1, todas as notas habilitadas):

  | Voz | Notas MIDI | Pan | Ganho | Atraso | Vibrato (amp, Hz) | Formante |
  |---|---|---|---|---|---|---|
  | 1 | 48, 43, 45, 41 | 0 | 0,40 | 0 ms | 0,04, 4,6 Hz | −0,12 |
  | 2 | 55, 55, 57, 57 | −0,55 | 0,38 | 7 ms | 0,07, 5,2 Hz | 0 |
  | 3 | 60, 59, 60, 60 | 0,55 | 0,38 | 12 ms | 0,07, 5,6 Hz | 0 |
  | 4 | 64, 62, 64, 65 | −0,25 | 0,40 | 16 ms | 0,08, 5,0 Hz | 0,08 |
  | 5 | 67, 67, 69, 69 | 0,30 | 0,34 | 21 ms | 0,08, 5,9 Hz | 0,12 |

- **Dobra:** cada voz soma 2 cópias (×0,62), a segunda com vibrato 1,13× mais rápido. LFO em forma senoidal. Total: 10 instâncias.
- **Sala:** IR sintético estéreo de 2,4 s, pré-delay 28 ms, amortecimento 3200 Hz, molhado 0,42.
- **Voz de quem fala por cima, 0,75 dB acima do acorde** (medido por energia ativa ponderada):
  - Voz: passa-altas 90 Hz, pico +3,5 dB em 3 kHz (Q 0,9), −2 dB em 250 Hz, reflexões curtas de 19/31/47/71 ms.
  - Acorde: −4 dB em 2,5 kHz (Q 0,7), para abrir espaço para a fala.
- O dono ajustou esse nível em passos: 4 → 2,5 → 1,5 → **0,75 dB**. Manter 0,75.
- **Na call:** a progressão roda no relógio do áudio, independente da fala.

**Coral** (`favoritos/coral-voz-0-25db.wav`; receita `rodada2/render3.py` função `coral(octave_soprano=False)` + `rodada2/render5.py` com 0,25 dB)
- **Base:** quatro naipes que **seguem a entonação da fala**. Autotalent em modo escala de dó maior, correção 1, suavidade 0,18, vibrato 0,09.

  | Naipe | Passos de escala | Formante | Cantores (pan, atraso, vibrato) | Ganho |
  |---|---|---|---|---|
  | Baixo | −7 (uma oitava abaixo) | −0,30 | (−0,2, 24 ms, 4,7 Hz), (0,25, 41 ms, 5,1 Hz) | 0,34 |
  | Tenor | 0 | −0,05 | (−0,45, 0 ms, 5,4 Hz), (0,4, 29 ms, 4,9 Hz) | 0,30 |
  | Contralto | +2 | +0,15 | (−0,7, 13 ms, 5,6 Hz), (0,15, 37 ms, 5,0 Hz), (0,6, 52 ms, 5,9 Hz) | 0,26 |
  | Soprano | +4 | +0,30 | (0,7, 9 ms, 6,0 Hz), (−0,15, 33 ms, 5,5 Hz), (0,35, 58 ms, 6,3 Hz) | 0,24 |

- **Total:** 10 instâncias.
- **Depois:** passa-baixas 7 kHz e sala sintética de 3,2 s (pré-delay 35 ms, amortecimento 2600 Hz, molhado 0,55).
- **Voz de quem fala por cima, 0,25 dB acima do coral**, com o mesmo tratamento dos Acordes (realce em 3 kHz na voz, −4 dB em 2,5 kHz no coral). O dono escolheu 0,25 dB depois de testar 0,75.

**Autotune escrachado** (`favoritos/autotune.wav`; receita `rodada2/render6.py`)
- Autotalent em escala **dó pentatônica** (C D E G A), correção 1, **suavidade 0**: a voz pula seco entre as notas.
- Dobra: cópia atrasada 18 ms a 35%, estéreo (o lado direito com mais 211 amostras de atraso).

## Ordem sugerida

1. **Primeiro pacote** (rápido): Telefone, Megafone, Banheiro, Caverna e Alien em nós nativos. Esquilo e Gigante ficam como estão.
2. Robô, Fantasma e Bêbado em AudioWorklets próprios.
3. Autotalent → WASM, depois Autotune, Acordes e Coral. Medir CPU no PC e no Android.

Para cada efeito: renderizar a frase de referência com o código novo (OfflineAudioContext, como faz `rodada2/render-online.cjs`) e comparar com o WAV da página: volume, duração da fala, escuta lado a lado.

## Cuidados de deploy

- **Deploy derruba todas as calls:** reinicia node, coturn e caddy. Conferir quem está online e avisar antes.
- **Outras sessões fazem deploy de outras branches:** conferir a versão e o feed do app no ar e juntar as mudanças antes de subir.
- **A branch de trabalho atual (`codex/prototipo-fonte-voz`) tem muitas mudanças não commitadas** (Android, ícones etc.). Fazer os efeitos numa branch limpa a partir do que está no ar.
- **Licenças:** Autotalent é GPL (o código vai para o cliente). O IR do banheiro tem licença própria. Registrar ambos.
