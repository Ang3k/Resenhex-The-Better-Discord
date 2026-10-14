# Publicação 1.4.0 — efeitos de voz escolhidos

Publicação autorizada pelo dono em 12/10/2026, após avaliar o app local.

- Site: https://resenhex.duckdns.org/ — versão 1.4.0.
- Código publicado: `b54f5425927544ee4dddcd75e17c5e20d3c9179f`, branch `codex/efeitos-escolhidos`, enviada ao GitHub.
- Instalador Windows: `Resenhex-Setup-1.4.0.exe`, 104.368.345 bytes; feed `latest.yml` publicado após o instalador. A Microsoft Store não foi atualizada nesta entrega.
- Android: APK 1.3.1 preservado; os efeitos chegam pelo site carregado pelo WebView. Não há aparelho físico disponível para medir o desempenho móvel.
- Emojis mantidos; imagens geradas e vozes de personagens por IA ausentes do cliente publicado e do novo instalador.

## Preparação e preservação

Os 291 arquivos da base 1.3.8 (`f92a334`) foram comparados com a instalação real, normalizando apenas finais de linha dos arquivos de texto. Nenhuma diferença foi encontrada. Não houve sobrescrita das alterações não commitadas da árvore original nem de outras sessões.

Havia inicialmente três pessoas conectadas, sem call. Na segunda conferência havia cinco conexões, com duas pessoas em uma call. Foi enviado o aviso de manutenção previsto no plano, com um minuto de antecedência. Apenas o serviço `resenhex` foi reiniciado; Caddy, TURN, configurações e dependências do servidor foram preservados.

Foram instalados 54 arquivos adicionados/modificados, removidos 14 arquivos aposentados e verificados os hashes dos arquivos instalados. Backup no servidor:

`/var/backups/resenhex/release-1.4.0-20261012-211520/`

O backup contém as fontes anteriores, dados e uploads, configurações privadas e feed Windows anterior. O hash do banco não mudou durante a aplicação dos arquivos. Os instaladores anteriores foram mantidos. A cópia nova não depende de instalar pacotes ou alterar a infraestrutura.

## Verificação

- Sintaxe do app e dos módulos de efeitos aprovada.
- 12 testes do motor/downloads; quatro de interface/contrato da call; um de entrada/navegação; 19 do desktop: todos passaram.
- Instalador conferido: versão correta, binários de Koffi e uiohook presentes; motor/arquivos de vozes por IA ausentes. A API Windows do overlay também inicializou.
- Feed e download HTTPS do instalador: versão 1.4.0, tamanho correto, HTTP 200. SHA-512 conferido no servidor antes de ativar o feed.
- Navegador nativo no site HTTPS: versão 1.4.0, 15 opções (14 efeitos e Desligado), inicialização/troca dos 14 efeitos em 48 kHz sem degradação. Reprodução silenciada e nenhuma captura de microfone.
- Arquivos `voice-ai.js`, `voice-ai-worklet.js`, retrato do Naruto e download antigo de runtime retornaram 404. Nenhuma requisição automática de IA.
- Serviços `resenhex`, `caddy` e `coturn` ativos; `/config` HTTPS respondeu após a inicialização. A porta de inspeção temporária ficou fechada.

Provas locais: `C:/Games/project2/artifacts/release-1.4.0/`, incluindo manifesto/hashes, ferramentas de aplicação e `online-browser-check.json`.

## Limites preservados

A fonte e atribuição do IR Banheiro continuam registradas em `public/voice-fx-assets/NOTICE.md`: o autor apresenta a biblioteca como aberta, mas não foi localizado texto formal das condições de redistribuição. A publicação autorizada não resolve essa incerteza e nenhum contato foi enviado ao autor. Fontes, flags e licenças do Autotalent acompanham o WASM publicado. As limitações de latência/medição do relatório de integração continuam válidas.
