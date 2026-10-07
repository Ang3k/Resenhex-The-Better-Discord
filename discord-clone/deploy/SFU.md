# Calls com LiveKit

A branch integra o SFU à UI de voz, câmera, transmissões e chamadas privadas. Cada fonte é publicada uma vez. As versões de vídeo em simulcast atendem aos pedidos de resolução dos espectadores; dynacast suspende camadas sem consumidores. Tela em segundo plano suspende o vídeo recebido e mantém o áudio. Sem espectadores, a captura de tela desce para 5 FPS.

O SDK é carregado somente quando uma call usa SFU. Os controles de volume, microfone, supressão de ruído e filtro de áudio da própria call continuam no cliente. A aceleração do Electron permanece habilitada; o diagnóstico mostra a disponibilidade da GPU e a implementação do codificador quando o navegador a informa. O perfil de movimento prefere H.264 quando suportado. A presença de GPU disponível não confirma, sozinha, que uma transmissão a está usando.

## Ativação na versão 1.1

Não houve publicação do app ou mudança de versão nesta implementação. Para ativar no lançamento, adicionar os novos arquivos ao Git e executar:

```powershell
.\deploy\atualizar-oracle.ps1 -EnableSfu
```

Ou, na VPS, `sudo RESENHEX_ENABLE_SFU=1 bash deploy/instalar-vps.sh --oracle`.

O instalador baixa LiveKit 1.13.8 para ARM64 ou AMD64, verifica o checksum oficial e cria o serviço `resenhex-livekit`. As credenciais persistem em `/etc/resenhex-livekit.env`, com leitura restrita. O serviço do app lê esse arquivo; atualizações seguintes preservam e mantêm o SFU. O WebSocket `/rtc*` usa o mesmo HTTPS do site, e a API administrativa fica em localhost. O coturn existente continua como alternativa para redes restritas.

Na lista de segurança ou NSG da Oracle, liberar **TCP 7881** e **UDP 7882** além das portas já usadas pelo site e pelo TURN. O instalador libera essas portas no firewall do Linux; ele não altera regras da conta Oracle. Validar depois do lançamento duas pessoas transmitindo, espectadores em redes diferentes e o perfil de 1080p/60 em um Windows com GPU. O teste sintético valida transporte e comportamento, mas não mede a capacidade máxima do servidor nem o ganho de CPU em jogos.

## Permissões e recuperação

`voice:media` emite tokens de um minuto somente para o socket autenticado que já entrou na call. A sala é derivada do servidor e do canal; o cliente não escolhe identidade nem sala do token. Chamadas privadas usam um espaço separado. Tokens limitam as fontes publicáveis. A moderação também atualiza as permissões no LiveKit, silencia fontes existentes e remove quem saiu. Webhooks assinados rejeitam reconexões cuja participação no Resenhex já terminou. Clientes antigos recebem uma mensagem para recarregar, em vez de tentar P2P contra participantes SFU.

## Queda do LiveKit

O servidor consulta o LiveKit a cada 10 s e também detecta falha ao abrir a sala. Se ele cair, as salas ocupadas que usavam o SFU recebem `media:switch` e reconectam em P2P (a call some por alguns segundos; transmissões precisam ser religadas). Calls novas também começam em P2P enquanto ele estiver fora. Quando o LiveKit volta, cada sala só retorna ao SFU depois de esvaziar, para não derrubar ninguém de novo. P2P é malha: aguenta bem poucas pessoas transmitindo, então é plano B, não substituto.

Se a mídia do LiveKit cair só para uma pessoa, o app dela reconecta sozinho (até 3 vezes por minuto). A moderação só muta pelo servidor; quem desmuta é o próprio app quando a permissão volta, porque o LiveKit recusa desmute remoto por padrão.

Para retornar a P2P permanentemente: guardar `/etc/resenhex-livekit.env` em um arquivo de backup com outro nome e reiniciar `resenhex`. Recarregar os clientes para reentrar nas calls. Sem `LIVEKIT_URL` o servidor escolhe P2P explicitamente. Não apagar as credenciais; elas permitem reativar o mesmo serviço depois.

## Validação reproduzível

`node --test test/media-sfu.test.js test/media-sfu-server.test.js` cobre autenticação, isolamento de salas, restrição de fontes, moderação, assinatura de webhooks e a ordenação de saída/reentrada. Os testes de mídia, áudio próprio, desktop e chamadas privadas também foram executados.

O teste visual usa `node tools/sfu-preview.cjs` e um LiveKit real acessível por `ws://127.0.0.1:17880`. `tools/sfu-staging.sh` cria uma instância temporária e independente na VPS. As chaves `qa-only` pertencem somente ao teste, com a sinalização presa a localhost. Nunca usar essa configuração como serviço público de produção. `tools/sfu-qa-inspect.cjs moderation` verifica a moderação apenas na sala sintética.
