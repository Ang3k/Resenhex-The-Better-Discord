# Plano de evolução do Resenhex

Data: 28/09/2026. Escopo: mapear melhorias estéticas e funcionais antes de implementar.

## 1. Diagnóstico e base da análise

O Resenhex já tem uma base funcional considerável. O maior salto de qualidade agora é transformar recursos isolados em experiências completas: configurar sem procurar numa lista enorme, entrar numa chamada e entender seu estado, assistir sem desperdiçar conexão e conversar confortavelmente no celular.

A prioridade recomendada é **transmissão confiável + central de configurações + navegação responsiva**, sustentadas por proteção dos dados e uma versão única de trabalho. Busca, organização das conversas e perfis completam a próxima camada de produto.

### O que foi verificado

- Inspeção da interface publicada em desktop de 1280 × 720 e viewport móvel de 390 × 844, incluindo abertura das configurações pessoais.
- Leitura da cópia mais completa em `C:/Users/angej/.codex/worktrees/resenhex-vps/project2`, revisão `87457e1`.
- Comparação do conteúdo publicado de `index.html`, `app.js` e `style.css` com essa cópia: correspondem após normalizar quebras de linha.
- Conferência do relatório anterior e nova leitura das partes relevantes de transmissão, configurações, chat, permissões e persistência.
- Consulta à documentação oficial do Discord e às APIs de mídia do navegador para fundamentar as propostas.

A pasta aberta `C:/Games/project2` está na revisão antiga `e0a4a6c` e possui uma alteração local em `package-lock.json`. Ela não deve servir de base para implementar este plano sem primeiro reconciliar as versões e preservar essa alteração.

**Limites:** não houve teste de carga, captura de áudio/tela, entrada em chamada real, medição de latência entre dispositivos nem nova inspeção do servidor remoto. A correspondência atual foi verificada para os três arquivos de interface; a versão do backend publicado é informação do relatório anterior, não uma nova confirmação. As metas abaixo são propostas de aceite, não resultados já atingidos.

Premissa inicial: um servidor para um grupo de amigos. Validar com 2, 4, 6 e 8 participantes; esses números são cenários de teste, não uma capacidade garantida.

## 2. Inventário: preservar, melhorar e acrescentar

| Área | Já existe na versão inspecionada | Principal evolução |
| --- | --- | --- |
| Chat | Canais, histórico, editar/apagar, respostas, reações, menções, anexos, digitação e não lidas | Busca, mensagens fixadas, rascunhos por canal e envio com estado/retentativa |
| Voz | Salas, mute, ensurdecer, volume por pessoa, supressão de ruído, sensibilidade, teste de microfone e pressionar para falar | Diagnóstico claro, recuperação previsível e troca de dispositivos mais robusta |
| Vídeo e tela | Câmera, perfis 720p/30, 1080p/30 e 1080p/60, troca de fonte, estatísticas, tela cheia, fixação e PiP quando suportado | Espectadores reais, adaptação de qualidade e tratamento de falhas |
| Configurações pessoais | Cor do avatar, áudio, upload, atalhos de fala, sons e notificações | Central com seções e regras de salvamento consistentes |
| Administração | Cargos, permissões, canais privados, criação/edição de canais, banimentos e moderação | Melhor navegação, categorias personalizadas, convites controlados e auditoria |
| Identidade | Conta, nome, avatar com inicial/cor, online/offline | Foto, nome de exibição, perfil, status e gerenciamento da conta |
| Interface | Tema escuro coerente, ícones, dicas, menus e palco de chamada | Hierarquia, estados, acessibilidade e layout móvel próprio |

Recursos existentes não devem aparecer no backlog como se precisassem ser criados do zero. Fixar uma transmissão, por exemplo, já existe; fixar uma mensagem no canal é uma funcionalidade diferente e não foi encontrada.

## 3. Transmissão de tela: prioridade máxima de experiência

### Achados concretos

1. **Parar de assistir não interrompe o envio pela rede.** O cliente remove o vídeo do elemento visual, mas não comunica ao transmissor uma assinatura/desassinatura. O envio continua para os participantes da sala.
2. **Participantes são contados como espectadores.** O cálculo de banda e a indicação de quantas pessoas assistem usam `state.peers.size`.
3. **A banda configurada é manual.** O teto é dividido pelo número de pares. Há controle de congestionamento do próprio WebRTC e preferências de degradação, mas não foi encontrado um controlador da aplicação que use a qualidade observada para escolher um perfil automaticamente.
4. **As estatísticas do transmissor representam apenas um par.** A interface pode mostrar uma conexão saudável sem revelar que outro espectador recebe mal.
5. **Falhas de ajuste são ocultadas.** Há erros ignorados em `setParameters`, `applyConstraints` e `replaceTrack`. A troca pode informar sucesso sem confirmar sucesso para todos os pares.
6. **O início de captura não diferencia bem cancelamento e erro.** O cancelamento deve ser silencioso; falta de permissão, recurso indisponível ou falha de captura precisam de orientação.
7. **Pausa é atribuída diretamente à minimização.** Um evento de mídia interrompida não basta para afirmar a causa em todos os navegadores; a mensagem deve refletir o que foi detectado.

Esses achados são oportunidades de melhoria verificadas no código. Não demonstram qual delas causou cada travamento percebido pelo usuário.

### Plano de melhoria

| ID | Entrega | Critério de conclusão | Esforço relativo |
| --- | --- | --- | --- |
| T1 | Medir conexão e transmissão por espectador: primeiro quadro, bitrate, resolução, FPS, perdas, RTT, congelamentos e caminho direto/TURN, conforme suporte | Relatório reproduzível com cenário, navegador, rede e resultados; sem gravar conteúdo da chamada | Médio |
| T2 | Criar controle real de quem assiste, validado pelo servidor; interromper vídeo e áudio da tela para quem saiu, preservando voz | Parar de assistir reduz o tráfego de mídia daquela tela para próximo de zero após estabilização; contagem acompanha quem assiste | Médio/alto |
| T3 | Qualidade automática com perfis “Automática”, “Texto e trabalho”, “Jogos e movimento” e “Economia”; opção avançada manual | Redução gradual em rede/CPU insuficiente e recuperação sem alternância constante; voz preservada | Alto |
| T4 | Tratar falhas de ajuste/troca, limitar tentativas e confirmar estado realmente aplicado | Sem aviso de sucesso falso; trocar fonte, cancelar seletor ou terminar captura não deixa tile travado | Médio |
| T5 | Recuperação de conexão com estado visível, tentativa limitada e ação manual | Queda simulada recupera ou apresenta erro acionável; não permanece indefinidamente em “Conectando” | Médio |
| T6 | Melhorar a experiência do espectador: cartão “Assistir”, foco, galeria, miniatura e chat ao lado | Assistir e parar têm efeito real; conversar não exige abandonar visualmente a transmissão | Médio |
| T7 | Separar qualidade solicitada da entregue; detalhes técnicos sob “Diagnóstico” | Usuário vê “Qualidade reduzida para manter a fluidez” e pode consultar dados por conexão | Pequeno/médio |

O fluxo proposto é: **escolher perfil → selecionar tela/janela no seletor do navegador → mostrar estado de início → confirmar transmissão → ajustar ou trocar fonte sem sair da chamada**. A presença de áudio deve ser confirmada pela trilha capturada, com aviso quando a fonte vier sem som. O seletor e as permissões continuam sob controle do navegador; suporte a áudio varia por plataforma. [Referência da API de captura](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

O Discord oferece referências úteis de foco, galeria, tela cheia, janela separada e ajustes durante a transmissão. No Resenhex, parte disso já existe; o trabalho é completar e tornar os fluxos mais claros, respeitando o suporte do navegador. [Referência oficial de Go Live](https://support.discord.com/hc/en-us/articles/360040816151-Go-Live-and-Screen-Share).

### Como decidir sobre um servidor de mídia

A arquitetura atual envia uma cópia por participante. Exemplo calculado do código: upload configurado em 10 Mbps × 85% de orçamento ÷ 5 pares = **1,7 Mbps de teto por par**, com apenas tela ativa. Isso não é uma medição da internet nem uma garantia de 1080p.

Primeiro implementar T1/T2 e medir. Se a transmissão continuar limitada pelo número de espectadores, comparar uma solução SFU, que recebe o envio e o distribui aos espectadores. Avaliar capacidade, custo de tráfego, localização, operação, autenticação e suporte a camadas de qualidade. TURN resolve situações de conectividade; não elimina a multiplicação de envios da malha.

**Gatilho para avaliar migração:** os cenários habituais de uso continuam descumprindo as metas abaixo após retirar envios desnecessários e ajustar qualidade. Evitar escolher infraestrutura apenas por um número genérico de participantes.

### Metas iniciais propostas para a primeira versão de mídia

Usar conteúdo com movimento para avaliar FPS/congelamento e texto para avaliar nitidez. Medir separadamente conexão direta e retransmitida, com rede estável e degradada.

- Em rede de referência estável, primeiro quadro em até 3 segundos no percentil 95, contado **depois** da seleção/permissão de captura e da solicitação de assistir.
- Pelo menos 95% das tentativas de assistir no conjunto de testes devem completar sem recarregar a página; ampliar amostra antes de tratar como indicador de produção.
- Numa sessão de 30 minutos em rede estável, não apresentar congelamento contínuo acima de 2 segundos após estabilização.
- Recuperar até 10 segundos após a rede voltar, quando tecnicamente possível; caso contrário, mostrar ação de reconectar e motivo compreensível.
- Com rede insuficiente, reduzir vídeo antes de comprometer voz; não exigir 1080p/60 de todo dispositivo.
- Comparar CPU e upload antes/depois com o mesmo hardware, conteúdo e número de espectadores. Definir o orçamento de CPU a partir dessa linha de base.

Essas metas devem ser calibradas após T1. A API `getStats()` oferece a base da medição, enquanto a aplicação precisa lidar com compatibilidade e rejeições ao alterar parâmetros. [Estatísticas WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats) e [ajustes de envio](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters).

## 4. Uma central de configurações de verdade

O problema principal não é o título “Configurações de usuário”: é a ausência de uma navegação clara. Hoje há um modal de até 520 px com uma lista longa, misturando conta, dispositivos, transmissão e sons. Algumas mudanças valem imediatamente, outras somente ao salvar; Escape e clique no fundo também acionam salvamento.

### Estrutura proposta

Abrir uma área ampla, com navegação lateral, título da seção, descrição curta, conteúdo e fechamento visível. No celular, lista de seções seguida da página escolhida, com botão Voltar.

| Seção pessoal | Conteúdo | Quando entregar |
| --- | --- | --- |
| Perfil | Cor existente; depois foto, nome de exibição, biografia e prévia | Estrutura agora; novos campos na etapa de perfis |
| Conta e segurança | Identificação, trocar senha, sessões e sair | Estrutura e melhorias de conta junto ao backend |
| Voz e vídeo | Microfone, saída, câmera com prévia, sensibilidade, eco, supressão e testes | Primeira central |
| Transmissão | Qualidade padrão, perfis, áudio capturado, uso de banda e diagnóstico | Primeira central, evoluindo com T1–T7 |
| Notificações | Menções, mensagens, sons, volume e permissões do navegador | Migrar controles atuais; depois preferências por canal |
| Aparência | Densidade confortável/compacta, tamanho de texto, tema e contraste | Primeira revisão visual, de forma incremental |
| Acessibilidade e atalhos | Movimento reduzido, foco, atalhos e pressionar para falar | Primeira revisão de acessibilidade |
| Sobre e diagnóstico | Versão, conexão e ajuda contextual | Primeira central |

Não exibir seções vazias ou opções que ainda não funcionam. A primeira entrega reorganiza os controles existentes; novas capacidades entram quando houver implementação completa.

**Administração do servidor permanece identificada separadamente**, acessível pelo nome do servidor e por um atalho para quem tem permissão. Organizar em Visão geral, Canais e categorias, Cargos e permissões, Membros, Convites, Moderação e Registro de ações, entregues progressivamente. Hoje só há abas Cargos, Canais e Banidos nessa área.

### Regras de interação

- Preferências locais de aparência e som: aplicação imediata com retorno discreto e restauração do padrão.
- Perfil, conta e administração: “Salvar alterações” e “Descartar”, indicação de pendência e tratamento de erro.
- Fechar/Escape não pode significar implicitamente “Salvar” numa tela com alterações pendentes.
- Mudanças em dispositivos durante uma chamada devem preservar a conexão e informar falha ou retorno ao dispositivo anterior.
- Preferências da conta sincronizadas no servidor; escolha de microfone, saída e restrições do dispositivo permanecem locais.
- Navegação por teclado, foco contido quando houver diálogo, retorno de foco ao fechar e links diretos para seções.

**Aceite:** encontrar Voz e vídeo em até dois acionamentos a partir da engrenagem; trocar de seção sem perder a chamada; salvar/descartar previsíveis; fluxo utilizável por teclado e em 390 px.

## 5. Aparência, navegação e celular

Manter a familiaridade de canais à esquerda, conversa ao centro e membros à direita, mas dar ao Resenhex uma identidade própria. O visual atual já é coerente no desktop; a revisão deve melhorar legibilidade e hierarquia, sem depender de efeitos pesados.

| ID | Melhoria | Critério de conclusão |
| --- | --- | --- |
| V1 | Definir cores semânticas, escala de espaçamento, tipografia, botões, campos, menus e diálogos consistentes | Mesma ação e mesmo estado têm apresentação consistente em todo o app |
| V2 | Melhorar contraste de nomes/cargos e estados offline; separar seleção, hover, foco, não lidas e menção | Informação legível e não dependente só de cor; contraste de texto e controles conferido |
| V3 | Rever densidade: painel pessoal, cabeçalho, mensagens, indicadores e espaçamentos | Mais área útil de conversa; ações frequentes fáceis de encontrar |
| V4 | Adicionar estados de carregamento, vazio, desconexão, falha e retentativa | Nenhuma ação fica aparentemente inerte; erros mantêm o contexto do usuário |
| V5 | Reestruturar celular: chat em largura total, canais/membros em painéis e controles de chamada acessíveis | Usável em 320, 390, 768 px e desktop; teclado virtual não encobre envio |
| V6 | Reduzir a faixa de notificações e ajustar a apresentação de início do canal | Avisos não dominam o chat em telas pequenas |
| V7 | Melhorar acessibilidade de canais, membros, menus e controles da chamada | Ações principais com Tab/Enter/Espaço, foco visível, rótulos e movimento reduzido |
| V8 | Palco com modos galeria/foco e conversa lateral; miniatura ao navegar | Voz e vídeo mantêm continuidade ao consultar mensagens |

**Evidência móvel:** em 390 px, a barra de canais mantém 190 px, deixando aproximadamente 200 px para o restante; a observação confirmou mensagens, boas-vindas e campo de envio comprimidos. Isso exige mudar a navegação, não apenas diminuir fontes.

Entregáveis de design: telas de chat desktop/móvel, central de configurações, chamada com transmissão e seus estados de erro; componentes comuns extraídos dessas telas. Validar com conversas longas, nomes compridos, mensagens com anexos e várias transmissões.

## 6. Funcionalidades que mais completam o produto

### Prioridade alta após a base e os fluxos principais

| ID | Recurso | Escopo e aceite | Dependência |
| --- | --- | --- | --- |
| F1 | Histórico durável e busca | Paginação e pesquisa por texto, autor, canal e data, com salto para o contexto; respeitar permissões | Persistência e política de retenção |
| F2 | Mensagens fixadas | Fixar/desafixar com permissão, painel do canal e acesso à mensagem original | Histórico durável |
| F3 | Rascunhos e envio confiável | Rascunho por canal; estados enviando/enviado/falhou; retentar sem duplicar; preservar texto na queda | Confirmações com prazo e deduplicação no servidor |
| F4 | Caixa de menções e não lidas | Central para menções/respostas, retorno ao último ponto lido e marcar como lido | Modelo atual de leitura e histórico |
| F5 | Notificações por canal | Todas, só menções, nenhuma; silenciar por período; preferência de sons | Central de configurações |
| F6 | Perfil e presença | Foto, nome de exibição, perfil público básico, ausente/não perturbe/invisível com regras definidas | Modelo de conta, armazenamento e privacidade |
| F7 | Canais mais organizados | Categorias reais, ordenação, tópico/descrição e permissões compreensíveis | Administração e migração dos canais atuais |
| F8 | Conta recuperável | Trocar senha, revogar sessões e fluxo de recuperação adequado ao grupo | Autenticação e persistência; recuperação deve definir meio de comprovar identidade |

O histórico atual tem limite de 300 mensagens por canal e remove mensagens antigas com seus anexos. Buscar e fixar mensagens precisam de uma política de retenção explícita; não basta acrescentar uma lupa ao cabeçalho.

### Segunda camada, conforme uso do grupo

| ID | Recurso | Benefício e cuidado de escopo |
| --- | --- | --- |
| F9 | Mensagens diretas e amigos | Conversas privadas com permissões, bloquear usuário, limites contra abuso e notificações próprias |
| F10 | Threads | Conversas paralelas sem poluir o canal; dependem de histórico, leitura e notificações consistentes |
| F11 | Convites controlados | Tokens com expiração, limite de usos e revogação; hoje o convite copia apenas a URL do site |
| F12 | Moderação com registro | Motivo, responsável e data das ações, limites de spam configuráveis e consulta de auditoria |
| F13 | Melhorias de anexos | Progresso real, cancelamento, retentativa, visualização acessível e limites claros |
| F14 | Emojis personalizados | Busca e categorias, permissões de envio, limite de tamanho e armazenamento |
| F15 | Navegação rápida | Atalho para canais e conversas, busca de canais e atalhos configuráveis |

### Expansões que precisam de uma decisão de produto

- **Aplicativo instalável/PWA e notificações com a página fechada:** avaliar suporte e necessidade; notificações atuais dependem da página. Instalar um PWA, sozinho, não fornece envio push.
- **Aplicativo desktop e atalhos globais:** avaliar quando pressionar para falar fora de foco, integração com jogos ou captura específica forem requisitos. O atalho atual explicita que funciona com a janela em foco.
- **Múltiplos servidores:** hoje a estrutura é de um único servidor. Exige separar dados, membros, cargos, convites e permissões por comunidade.
- **Eventos, bots, integrações e atividades:** posteriores aos fluxos essenciais; priorizar só com casos de uso claros.
- **4K, gravação de chamadas e personalização extensa:** não são condição para resolver a qualidade atual; envolvem capacidade e, no caso de gravação, consentimento e retenção próprios.

## 7. Base de confiabilidade que acompanha o plano

São problemas concretos do código de referência, relevantes para entregar os recursos acima com segurança e sem perda de dados.

| ID | Trabalho | Motivo e aceite |
| --- | --- | --- |
| B1 | Definir a cópia oficial de trabalho e identificar a versão publicada | Evitar implementar sobre a versão antiga; manter mudanças locais e comprovar revisão de cada entrega |
| B2 | Backup independente, restauração e escrita consistente | Corrupção de principal e backup não pode abrir silenciosamente uma base vazia; restauração de contas/mensagens/anexos demonstrada |
| B3 | Persistência com paginação e retenção explícita | Preparar busca, fixados e crescimento; avaliar SQLite inicialmente, sem simplesmente aumentar o limite do JSON |
| B4 | Autorizar leitura de anexos e limitar uploads | A rota de leitura atual não verifica sessão/canal; pessoa sem acesso não obtém arquivo privado, e uso simultâneo respeita memória/disco |
| B5 | Privacidade de presença e digitação | Estado de voz não deve expor sala oculta; emissor de digitação deve ter acesso ao canal |
| B6 | Sessões com expiração/revogação e preferências resilientes | Sessão encerrada deixa de autenticar; preferência local inválida não impede abrir o aplicativo |
| B7 | Confirmações com prazo, erros acionáveis e testes de fluxos | Falha de rede não deixa ação pendente para sempre; cobrir chat, acesso, persistência e reconexão |
| B8 | Publicação verificável e reversível | Testar antes de publicar, conferir versão/saúde depois e manter retorno à versão anterior |
| B9 | Separar responsabilidades do código conforme as entregas | Isolar mídia, configurações, chat e permissões para reduzir regressões; evitar reescrita geral sem necessidade |

Os detalhes da auditoria prévia estão no [relatório de qualidade](C:/Games/project2/RELATORIO-RESENHEX-2026-09-27.md). Operação remota, custos e estado atual de backups devem ser revalidados antes de implementar mudanças de infraestrutura.

## 8. Ordem recomendada de execução

Os tamanhos abaixo são relativos, não prazos. Pequeno = mudança localizada; médio = fluxo com integração; alto = estado distribuído, persistência ou mídia. Datas só devem ser estimadas após escolher a base oficial e medir a transmissão.

| Etapa | Entrega verificável | Principais itens | Porte |
| --- | --- | --- | --- |
| 0 — Base | Versão correta identificada; dados recuperáveis; ambiente de teste separado | B1, B2; iniciar B4/B5 e B8 | Médio |
| 1 — Medição e desenho | Linha de base da transmissão; telas propostas de configurações/chat/chamada; componentes visuais definidos | T1, V1 e desenho de V5/V8 | Médio |
| 2 — Primeira melhoria perceptível | Central organizada, salvamento claro, chat móvel confortável e interrupção real de transmissão não assistida | T2, T4, T7; configurações atuais; V2–V7; B7 | Alto |
| 3 — Chamadas consistentes | Qualidade automática, reconexão, testes de dispositivos e conversa junto à transmissão | T3, T5, T6, V8; decisão sobre SFU baseada nas medições | Alto |
| 4 — Conversa completa | Histórico durável, busca, fixados, rascunhos e caixa de menções | B3, F1–F5 | Alto |
| 5 — Identidade e administração | Perfil, conta, categorias, convites e registro de moderação | F6–F8, F11–F12, B6 | Médio/alto |
| 6 — Expansão escolhida | DMs, threads, instalação/desktop ou múltiplos servidores conforme demanda | F9–F10 e decisões de produto | Variável/alto |

B4/B5 são correções prioritárias antes de ampliar uso de canais privados. A proteção dos dados não deve esperar a etapa de busca. O trabalho visual e a instrumentação podem avançar como frentes independentes depois de identificar a base oficial.

**Primeiro pacote recomendado:** central de configurações com os controles já existentes, navegação móvel, transmissão apenas para espectadores reais, erros de mídia compreensíveis e diagnóstico por conexão. Esse pacote ataca diretamente as duas queixas iniciais e um problema visual confirmado.

## 9. Validação de cada entrega

- **Interface:** desktop e larguras 320/390/768 px, zoom, nomes longos, menus perto das bordas, navegação por teclado e foco.
- **Configurações:** abrir durante chamada; salvar/descartar; dispositivo desconectado; permissão negada; restauração de padrões e persistência no escopo correto.
- **Mídia:** 2/4/6/8 participantes, redes distintas e TURN, Chrome/Edge/Firefox e celular onde cada recurso for suportado; uma e duas telas simultâneas, câmera junto, minimizar, trocar fonte, parar/retomar, desconectar e reconectar.
- **Chat:** envio sob rede lenta, retentativa sem duplicação, anexos, busca com paginação, mensagem original removida, leitura e notificações.
- **Acesso:** usuário comum, administrador e conta sem acesso ao canal; validar no servidor, incluindo anexos e estado de voz.
- **Operação:** restaurar backup, iniciar versão nova com dados existentes e executar retorno à anterior sem destruir dados.

Uma funcionalidade estará concluída quando tiver fluxo principal, estados de erro, permissões, comportamento móvel pertinente e critérios de aceite verificados. Adicionar um botão isolado não encerra o item.

## 10. Pontos de referência no código inspecionado

Links apontam para a cópia analisada na revisão `87457e1`; linhas podem mudar em implementações futuras.

- [Modal pessoal e estrutura da página](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/public/index.html).
- [Remoção apenas visual da transmissão](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/public/app.js:1159).
- [Conexões entre participantes](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/public/app.js:2111).
- [Orçamento de banda e ajuste de envio](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/public/app.js:2316).
- [Troca de fonte](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/public/app.js:2428).
- [Estatísticas da transmissão](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/public/app.js:2515).
- [Abertura e aplicação de configurações](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/public/app.js:2668).
- [Layout de telas menores](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/public/style.css:622).
- [Persistência e recuperação](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/server.js:104).
- [Uploads e leitura de anexos](C:/Users/angej/.codex/worktrees/resenhex-vps/project2/discord-clone/server.js:293).

Este documento é o plano inicial de execução. Nenhuma alteração no código do aplicativo ou publicação foi realizada nesta etapa.
