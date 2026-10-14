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

## Qualidade das transmissões (1.4.7)

A primeira versão publicava a tela com três camadas: 1080p com 75% da taxa, 720p a 600 kbps/20 fps e 360p a 150 kbps/10 fps. O LiveKit entrega a cada espectador a menor camada que cobre o tamanho do bloco, então quase todo bloco fora da tela cheia recebia a de 720p. No laboratório (`tools/stream-lab`, matriz `sfu.cjs`), com três espectadores, os blocos de 720p e 540p ficaram em 33–34 dB e 15 fps, com cerca de 40 travadas em 24 s, enquanto o P2P entregava 41–46 dB a 29 fps. Desde a 1.4.7:

- **Tela com texto** (Automática, Economia, Nitidez): uma camada só, em AV1 com as ferramentas de conteúdo de tela, publicada como camada única por envio (`simulcast` com `L1T1`). Assim o SDK não usa SVC nem troca o `contentHint` para `motion`, o que tiraria essas ferramentas. Quem não decodifica AV1 recebe uma versão VP8 (`backupCodec`). Com três espectadores, todos receberam 1080p a 29 fps com 52–56 dB, usando 0,94 Mbps de envio. Exige LiveKit 1.13.7 ou mais novo; com servidor antigo a tela vai em VP8, numa camada.
- **Movimento · 1080p / 60**: H.264 (VP8 sem H.264) com a camada cheia e uma de 540p no mesmo FPS, mantendo resolução e FPS (`maintain-framerate-and-resolution`; navegadores que não conhecem esse valor ficam com `maintain-framerate`). Na publicação, o perfil H.264 42e01f vem primeiro: o SDK põe a taxa inicial da estimativa de banda (`x-google-start-bitrate`) no primeiro H.264 da oferta, e o LiveKit negocia o 42e01f. Antes a tela em H.264 começava a ~300 kbps e passava 30 s abaixo de 3 Mbps; com três espectadores, o jogo chegava a 12 fps com ~80 travadas. Agora são 33–38 fps sem travadas (o H.264 em software do laboratório não passa disso em duas camadas).
- **Câmera**: 720p e 360p a 30 fps; antes a camada de miniatura tinha ~90 kbps a 10 fps.
- Sem o corte de 25% na taxa da camada principal.

**Conferir depois de ativar.** Em Configurações → Conexão e diagnóstico, cada participante aparece como "Servidor de mídia (SFU) · UDP". "TCP, mais lento" ou "via TURN" quer dizer que a mídia não chegou pela porta UDP 7882 (geralmente a regra da lista de segurança da Oracle), e o app também avisa na hora. Por TCP, qualquer perda vira atraso acumulado e a transmissão trava.

## Permissões e recuperação

`voice:media` emite tokens de um minuto somente para o socket autenticado que já entrou na call. A sala é derivada do servidor e do canal; o cliente não escolhe identidade nem sala do token. Chamadas privadas usam um espaço separado. Tokens limitam as fontes publicáveis. A moderação também atualiza as permissões no LiveKit, silencia fontes existentes e remove quem saiu. Webhooks assinados rejeitam reconexões cuja participação no Resenhex já terminou. Clientes antigos recebem uma mensagem para recarregar, em vez de tentar P2P contra participantes SFU.

## Queda do LiveKit

O servidor consulta o LiveKit a cada 10 s e também detecta falha ao abrir a sala. Se ele cair, as salas ocupadas que usavam o SFU recebem `media:switch` e reconectam em P2P (a call some por alguns segundos; transmissões precisam ser religadas). Calls novas também começam em P2P enquanto ele estiver fora. Quando o LiveKit volta, cada sala só retorna ao SFU depois de esvaziar, para não derrubar ninguém de novo. P2P é malha: aguenta bem poucas pessoas transmitindo, então é plano B, não substituto.

Se a mídia do LiveKit cair só para uma pessoa, o app dela reconecta sozinho (até 3 vezes por minuto). A moderação só muta pelo servidor; quem desmuta é o próprio app quando a permissão volta, porque o LiveKit recusa desmute remoto por padrão.

Para retornar a P2P permanentemente: guardar `/etc/resenhex-livekit.env` em um arquivo de backup com outro nome e reiniciar `resenhex`. Recarregar os clientes para reentrar nas calls. Sem `LIVEKIT_URL` o servidor escolhe P2P explicitamente. Não apagar as credenciais; elas permitem reativar o mesmo serviço depois.

## Validação reproduzível

`node --test test/media-sfu.test.js test/media-sfu-server.test.js` cobre autenticação, isolamento de salas, restrição de fontes, moderação, assinatura de webhooks e a ordenação de saída/reentrada. Os testes de mídia, áudio próprio, desktop e chamadas privadas também foram executados.

O teste visual usa `node tools/sfu-preview.cjs` e um LiveKit real acessível por `ws://127.0.0.1:17880`. `tools/sfu-staging.sh` cria uma instância temporária e independente na VPS. As chaves `qa-only` pertencem somente ao teste, com a sinalização presa a localhost. Nunca usar essa configuração como serviço público de produção. `tools/sfu-qa-inspect.cjs moderation` verifica a moderação apenas na sala sintética.
