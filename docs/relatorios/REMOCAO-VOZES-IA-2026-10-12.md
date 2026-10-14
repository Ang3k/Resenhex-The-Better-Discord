# Retirada das vozes de personagens — 12/10/2026

Por decisão do dono, as vozes de personagens por IA foram retiradas da versão ativa. O modificador oferece apenas os treze efeitos escolhidos e Rádio, que já havia sido preservado. Desligado continua disponível. A supressão de ruído do microfone é um recurso separado e conserva seu funcionamento.

## Alterações

- Catálogo dinâmico de personagens, opção `ai`, painel de download/configuração, retratos e ajustes de tom/semelhança removidos das configurações e do menu da chamada.
- `public/voice-ai.js`, `public/voice-ai-worklet.js` e toda a pasta pública `assets/voice-characters` retirados. O HTML não referencia esses scripts e o app não assina eventos ou consulta o motor. Aproximadamente 248 kB de retratos/metadados e 11 kB de scripts públicos foram removidos, além da lógica e estilos que os integravam.
- Preferências antigas `ai` e `ai:<personagem>` migram para `none` ao abrir o app. O servidor rejeita esses IDs no estado da call. Uma instalação Windows antiga que ainda exponha a ponte de IA não é consultada pela nova interface.
- Main/preload do Windows não importam, inicializam ou expõem o motor de IA. Os preparativos do instalador não executam os builders de runtime/modelos; `extraResources` não inclui `voice-engine`, e `lib/voice-*` é excluído dos arquivos empacotados.
- Downloads públicos passam a servir somente releases dos apps: instaladores, APKs, blockmaps, `latest.yml` e `android.json`. Modelos ONNX, índices, ZIPs de runtime e subpastas antigas são bloqueados, inclusive com o nome da pasta codificado na URL. Instaladores e atualização diferencial mantêm o comportamento existente.
- A documentação antiga está identificada como histórica. O feed do app deixou de anunciar instruções de uso das vozes removidas; o histórico completo de versões permanece no repositório.

As fontes de pesquisa do motor/catálogo em `desktop/lib`, ferramentas e documentos antigos permanecem no Git como material de desenvolvimento. Não entram no site pelo deploy, que exclui `desktop/`, e não entram no próximo instalador. Os arquivos removidos continuam recuperáveis no commit anterior, `5364bff`. Não houve push ao GitHub nesta etapa.

## Verificação essencial

- Dez testes focados de UI/call/servidor aprovados: catálogo escolhido, troca sem substituir captura, preview, mudo, push-to-talk, alteração de microfone, preferências antigas e rejeição dos IDs removidos.
- Oito testes de downloads aprovados, incluindo arquivos reais de modelo/runtime deixados em uma pasta temporária: resposta 404, sem quebrar EXE, APK, blockmap, redirects e ranges.
- Teste do preload aprovado: ponte padrão, push-to-talk e seus eventos continuam disponíveis; conversão e eventos de voz por IA não são expostos.
- `npm run check` e sintaxe de main/preload aprovados. Nenhum núcleo DSP ou IR dos efeitos escolhidos foi alterado nesta remoção.
- Navegador Chromium real no app local: catálogo com 15 escolhas (14 efeitos + desligado), global/painel de IA ausentes, preferência Naruto convertida para `none`, nenhum pedido automático para recursos de personagens. Scripts antigos, retrato Naruto e download de runtime responderam 404. Acordes, Coral, Alien, Esquilo, Gigante e Robô inicializaram e trocaram normalmente em contexto 48 kHz.

Resultado nativo: `C:/Games/project2/artifacts/voice-source-live/escolhidos-no-app-2026-10-12/actual-app-check.json`.
App local atualizado: http://127.0.0.1:38157/.

## Estado de publicação

Mudança implementada em `codex/efeitos-escolhidos`, na cópia isolada do projeto. Nenhum servidor de produção ou instalador publicado foi alterado nesta etapa. Arquivos de modelos eventualmente existentes no armazenamento remoto não foram apagados; o novo servidor bloqueia sua distribuição ao ser publicado. Não foram apagados modelos já baixados nos computadores dos usuários. O novo instalador ainda precisa ser gerado/publicado para substituir o executável antigo, embora a retirada da interface e dos downloads chegue pelo deploy do site.
