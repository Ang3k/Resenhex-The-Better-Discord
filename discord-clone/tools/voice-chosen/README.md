# Reproduzir e verificar os efeitos escolhidos

O app executa as receitas locais com Web Audio, AudioWorklet e Autotalent WASM. Os WAVs de favoritos e a frase usada para comparar ficam em artefatos locais, fora do pacote público. O documento [`docs/planos/PLANO-EFEITOS-ESCOLHIDOS-2026-10-12.md`](../../../docs/planos/PLANO-EFEITOS-ESCOLHIDOS-2026-10-12.md) é o contrato da seleção; o relatório em [`docs/relatorios/`](../../../docs/relatorios/) registra as medições e exceções.

## Verificação essencial

Na pasta `discord-clone`:

```powershell
npm run check
npm run check:voice-chosen
npm run test:voice-chosen
node --test --test-name-pattern='chosen' test/server-ui.test.js test/servers.test.js
```

Os testes de servidor criam seus próprios dados temporários. Não é necessário usar a base de contas do app.

## Comparação com o navegador real

```powershell
node tools/voice-chosen/lab-server.cjs FAVORITOS RESULTADOS INPUT_F32
$env:ELECTRON_BINARY = 'CAMINHO/DO/electron.exe'
node tools/voice-chosen/render-check.cjs RESULTADOS
node tools/voice-chosen/loopback-check.cjs RESULTADOS
node tools/voice-chosen/page-check.cjs RESULTADOS
```

Substituir os três diretórios/caminhos pelos artefatos da seleção. `FAVORITOS` deve conter `original.wav` e os treze favoritos nomeados no plano. `INPUT_F32` é a entrada mono float32 little-endian, 48 kHz, usada nos renders nativos aprovados. `RESULTADOS` deve existir. O servidor só escuta em `127.0.0.1:38156` por padrão.

Executar cada verificador quando sua área mudar. `render-check` aceita uma lista opcional de IDs após a pasta de saída para refazer apenas os efeitos alterados. `loopback-check` aceita `--failure-only` para conferir somente a recuperação de erro. Esquilo/Gigante recebem o mesmo PCM16 da prova publicada; os outros recebem a entrada float32 original, porque a detecção de pitch pode mudar com quantização.

O teste de loopback usa dois `RTCPeerConnection` nativos e Opus locais, com reprodução silenciada. Confere entrega, troca, reset e ausência de fala antiga ao reabrir o mudo; injeta uma falha no módulo via interceptação somente no navegador de teste para validar o retorno à voz normal. Não modifica arquivos do app. A medição `mutedRms` imediatamente após o mudo pode conter áudio já em trânsito no codec/analisador; o teste de histórico usa uma janela posterior com a fonte silenciosa e compara também a saída local.

Esses scripts não medem desempenho de Android físico. A página abre sem autoplay, começa com volume de 25% e pausa o outro player durante a comparação.

## Recompilar Autotalent

```powershell
./tools/voice-chosen/build-wasm.ps1 -EmsdkPath CAMINHO/DO/emsdk
```

Usar Emscripten 6.0.12, ativado no próprio diretório do SDK, para reproduzir esta compilação. Não são necessárias configurações globais nem imports de JS no WASM. Fontes e licenças acompanham o binário em `public/vendor/autotalent`.

## Regenerar respostas acústicas

```powershell
python tools/voice-chosen/prepare-assets.py --reference-build PROVA_CLASSICOS --round2-build PROVA_BEBADO_MUSICA
```

Dependências usadas: Python 3.11, NumPy 1.26.4, SciPy 1.13.1 e SoX 14.4.2. A prova clássica contém `input.f32`, `components/bathroom-stereo.wav` e `components/sox/sox-14.4.2/sox.exe`; a prova musical contém os `stems3/*.f32`. O script opera sem rede, gera os seis IRs, coeficientes e níveis musicais iniciais. O manifesto permite conferir os hashes; os níveis iniciais são adaptados lentamente à fala ao vivo.
