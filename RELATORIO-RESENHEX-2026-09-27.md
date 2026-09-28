# Relatório de qualidade do Resenhex — 27/09/2026

## Resumo executivo

O Resenhex já é uma versão funcional para um grupo pequeno: chat, anexos, menções, cargos, moderação, voz, câmera, transmissão de tela, supressão de ruído, sensibilidade do microfone e soundboard estão implementados. O desktop tem um visual coerente e o servidor valida a maior parte das permissões. A versão publicada na Oracle corresponde aos arquivos centrais da versão nova do código.

O próximo ganho de qualidade vem de **proteger os dados**, **fechar lacunas de privacidade dos anexos**, **reformular a experiência móvel** e **testar chamadas reais com vários navegadores e participantes**. A arquitetura de voz em malha atende ao grupo atual, mas a própria documentação do projeto estima limite prático de seis a oito pessoas por sala; no momento da inspeção visual havia seis pessoas numa sala.

**Diagnóstico:** beta funcional para uso entre amigos; ainda não é uma base robusta para crescimento ou para depender do histórico como arquivo permanente.

## Escopo e evidências

- Código auditado: versão 87457e1 da pasta C:\Users\angej\.codex\worktrees\resenhex-vps\project2. Os hashes SHA-256 de server.js, app.js, style.css, index.html, format.js, icons.js e sounds.js coincidem com os arquivos em /opt/resenhex na Oracle.
- Site: [Resenhex publicado](https://168-138-227-230.sslip.io/), servido diretamente pela Oracle via Caddy e endereço sslip.io.
- Verificações: página e /config responderam HTTP 200; serviços resenhex, caddy e coturn ativos; serviço da aplicação com zero reinícios desde a última subida; 954 MB de RAM, 2 GB de swap, cerca de 41 GB livres em disco na medição. O processo Node usava aproximadamente 73 MB de memória residente. O diretório de dados tinha cerca de 24 KB e nenhum arquivo enviado. Esses números são uma fotografia, não um teste de pico.
- Testes existentes executados com êxito: verificação de sintaxe dos arquivos JavaScript e deploy/smoke-test.js (inicialização, senha de cadastro e autenticação). A auditoria de dependências de produção informou zero avisos conhecidos naquele momento. Isso não cobre falhas no código da aplicação.
- Inspeção visual: desktop e largura de 390 px. Não executei chamada real entre dispositivos diferentes nem teste de carga.

## Qualidade por área

| Área | Avaliação atual | Motivo |
| --- | --- | --- |
| Recursos e uso no desktop | Boa para o público atual | Interface consistente; chat, permissões e controles de chamada amplos. |
| Voz e transmissão | Boa base, capacidade pouco comprovada | WebRTC em malha, TURN, limites de banda e estatísticas existem; faltam testes multicliente e alertas para falhas de ajuste. |
| Desempenho atual | Adequado na fotografia observada | Node com baixo uso de memória e página estática compacta; não há medição em pico. |
| Dados e recuperação | Frágil | Backup apenas no mesmo servidor e possibilidade de iniciar uma base vazia após corrupção. |
| Privacidade e segurança | Mista | Permissões centrais no servidor, hash de senha e limites contra spam são bons; anexos e sessões precisam de reforço. |
| Celular e acessibilidade | Fraca | Chat fica estreito em 390 px; canais clicáveis não são acessíveis pelo teclado. |
| Manutenção e publicação | Frágil | Poucos testes e duas cópias locais divergentes do projeto. |

## O que já está bem resolvido

1. **Permissões no servidor.** Canais de texto e voz são verificados antes de histórico, envio ou entrada; hierarquia de cargos e moderação também são tratadas no backend (server.js, linhas 225–247, 558–565 e 670–682).
2. **Tratamento de texto.** O cliente usa nós de texto para conteúdo dos usuários, reduzindo o risco de HTML executável em mensagens (public/app.js, linhas 101–113; public/format.js).
3. **Recursos de chamada.** Há reconexão automática, TURN para redes restritas, troca de dispositivo, quatro modos de supressão de ruído, controle de upload por pessoa, estatísticas de transmissão e ajustes de qualidade sem derrubar a live (public/app.js, linhas 282–381, 1804–1948 e 2271–2548).
4. **Proteções operacionais básicas.** HTTPS, conta de serviço própria, serviço que reinicia, permissões do diretório de dados, firewall, backup pré-atualização e checagem de saúde estão no instalador (deploy/instalar-vps.sh). A publicação usa pacote dos arquivos rastreados no Git (deploy/atualizar-oracle.ps1).
5. **Entrega leve.** O app.js tem cerca de 135 KB no disco e foi transferido com aproximadamente 39 KB em gzip; o CSS, com aproximadamente 10 KB. Isso não aponta para um problema urgente de tamanho inicial.

## Melhorias em ordem de importância para este caso

### P0 — proteger dados e definir recuperação

**Evidência.** server.js, linhas 104–124, guarda uma cópia data.json.bak na mesma máquina. Se tanto o principal quanto a cópia estiverem inválidos, o servidor começa uma base nova. As gravações usam um arquivo temporário compartilhado sem fila de escrita (linhas 137–157). A publicação cria um arquivo em /var/backups/resenhex no mesmo disco (deploy/atualizar-oracle.ps1, linhas 66–69); havia um backup desse tipo no momento da inspeção. O histórico é limitado a 300 mensagens por canal e mensagens antigas e seus anexos são removidos automaticamente (server.js, linhas 14 e 575–599).

**Consequência.** Falha de disco, exclusão da instância ou corrupção dupla pode perder contas e mensagens. O limite de 300 torna o histórico temporário, embora a documentação o apresente como salvo. Com dados maiores ou disco lento, escritas assíncronas sobre o mesmo arquivo temporário também podem competir; essa condição foi identificada no código, sem reprodução em produção.

**Fazer.** Gerar backup automático diário de data.json e uploads fora da máquina, com retenção e restauração ensaiada; considerar a política de backup do volume da Oracle e uma cópia independente. Fazer o processo falhar com aviso quando não houver base válida, em vez de servir uma base vazia. Serializar gravações e manter substituição atômica. Definir claramente a política de retenção do chat antes de remover o limite de 300; migrar para SQLite com paginação se o objetivo for histórico durável. A [Oracle documenta backups agendados do volume de boot](https://docs.oracle.com/en-us/iaas/Content/Block/Tasks/create-bv-boot-volume-backup.htm), e o [SQLite oferece API de backup consistente com a base em uso](https://www.sqlite.org/backup.html).

**Aceite.** Recuperar contas, mensagens e anexos num servidor limpo; corrupção de principal e backup impede início da aplicação; restauração recente é comprovada periodicamente.

### P0 — unificar a versão editada e a publicada

**Evidência.** O site usa a versão 87457e1 na pasta de trabalho atualizada. A pasta que está aberta como projeto, C:\Games\project2, está na versão antiga e0a4a6c; seu ramo local também aparece vinte commits atrás da própria origem e tem uma alteração local em package-lock.json. O server.js e app.js dessa pasta têm hashes diferentes dos publicados, e nela não existe deploy/atualizar-oracle.ps1.

**Consequência.** Editar a pasta antiga pode produzir a impressão de que o site foi atualizado quando não foi; publicar manualmente a cópia errada pode retirar recursos recentes.

**Fazer.** Preservar a alteração local de package-lock.json, escolher uma única pasta/ramo como origem oficial e trazer o projeto aberto até a versão publicada. Registrar um identificador de versão visível no site ou em um endpoint de saúde. Publicar por commit identificado, com opção de voltar ao anterior.

**Aceite.** A mesma revisão aparece na pasta usada para editar, no pacote publicado e no servidor; o procedimento de atualização parte sempre dessa revisão.

### P1 — fechar acesso a anexos privados e limitar consumo de recursos

**Evidência.** O envio exige sessão e permissão, mas GET /uploads/:file não exige login nem verifica canal (server.js, linhas 293–332). O nome aleatório de 128 bits dificulta descoberta, porém qualquer pessoa com o link consegue abrir o arquivo. O corpo de até 25 MB é carregado em memória antes da validação da sessão. O limite atual é de 20 uploads por minuto por conta, sem cota total de espaço ou controle global de simultaneidade.

**Consequência.** Um link de canal privado que seja compartilhado mantém o arquivo acessível fora do canal. Múltiplos envios podem pressionar a VM de aproximadamente 1 GB de RAM ou preencher o disco. A [OWASP recomenda autorizar o acesso ao arquivo e limitar capacidade de armazenamento e requisições](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

**Fazer.** Associar cada anexo ao canal, exigir sessão e canView na leitura ou usar URLs assinadas curtas; decidir explicitamente se arquivos de canais públicos também serão acessíveis por link. Autenticar antes de receber o corpo sempre que possível, enviar dados em fluxo para disco, limitar simultaneidade e cota por conta/servidor e monitorar espaço livre.

**Aceite.** Pessoa sem login recebe 401; pessoa sem cargo recebe 403; membro autorizado recebe 200; anexo apagado não abre; carga paralela respeita limite de memória e espaço.

### P1 — preservar a privacidade dos canais de voz

**Evidência.** A lista de canais é filtrada por cargo, mas o estado enviado a cada cliente inclui todas as entradas de voz, inclusive as de canais ocultos (server.js, linhas 362–397). O evento de digitação também não verifica se quem o envia pode ver o canal indicado (linhas 661–667).

**Consequência.** Um usuário autenticado pode receber identificadores e presença de pessoas em salas que não aparecem na sua interface. Isso não entrega áudio ou mensagens, mas contradiz a expectativa de privacidade do canal.

**Fazer.** Filtrar as entradas de voz pelo mesmo canView aplicado aos canais; rejeitar digitação em canal sem permissão. Testar esses casos com duas contas e cargos diferentes. A [OWASP recomenda validar autorização também em recursos e dados retornados](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

**Aceite.** A resposta de estado de uma conta sem cargo não contém sala privada nem sua presença; enviar digitação para ela não produz evento.

### P1 — refazer o layout de celular e o acesso por teclado

**Evidência.** Em 390 px, a coluna fixa de canais ocupa 190 px e deixa cerca de 200 px para chat (public/style.css, linhas 630–635). A inspeção visual mostrou mensagens quebradas em muitas linhas e a barra de envio comprimida. Canais de texto são elementos li com clique; canais de voz e membros também têm interações em div/li sem papel ou navegação por teclado (public/app.js, linhas 472–509). Não há estilo geral de foco visível nem opção para reduzir animação. A cor vermelha padrão do cargo Admin (#e74c3c) contra o fundo principal (#313338) dá contraste calculado de aproximadamente 3,31:1 para nomes pequenos.

**Fazer.** No celular, mostrar o chat em largura total e abrir canais/membros em painéis; manter envio e controles da chamada visíveis. Usar botões para canais e ações interativas, foco visível, nomes acessíveis e anúncio de erros/notificações. Ajustar cores de cargos quando usadas como texto, visando ao menos 4,5:1 para texto normal, e respeitar preferência de movimento reduzido. As orientações [W3C para reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow), [teclado](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) e [contraste](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) fundamentam estes critérios.

**Aceite.** Chat legível e envio utilizável em 320, 390, 768 px e desktop; todas as ações principais funcionam com Tab/Enter/Espaço; foco e erros são perceptíveis.

### P1 — medir a qualidade da voz e preparar o limite da malha

**Evidência.** Cada participante cria uma conexão para cada outro (public/app.js, linhas 1–3 e 2111–2183). Com seis pessoas, isso representa quinze conexões entre pares. A qualidade 1080p/60 é um pedido ao navegador, não garantia: o upload padrão de 10 Mbps é dividido entre espectadores (linhas 14–17 e 2314–2324). Com cinco espectadores e apenas uma tela ativa, o teto calculado é cerca de 1,7 Mbps por espectador. Erros de setParameters e applyConstraints são ignorados (linhas 2339 e 2360). A [MDN documenta diferenças de implementação entre navegadores](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/setParameters).

**Fazer.** Testar chamadas com 2, 4, 6 e 8 pessoas em Chrome, Edge, Firefox e um celular, incluindo câmera, tela, áudio do sistema, reconexão, troca de tela e redes diferentes. Registrar taxa real de conexão, FPS, perda de pacotes, CPU e uso de TURN, sem gravar conteúdo das chamadas. Mostrar quando o perfil solicitado não foi atingido e oferecer redução automática para 720p. Planejar um servidor de mídia (SFU) apenas se o grupo superar regularmente a capacidade medida da malha.

**Aceite.** Metas explícitas de conexão e qualidade para o grupo atual; falhas de ajuste visíveis; decisão de escalar baseada em medições reais.

### P1 — ampliar testes e tornar a publicação reversível

**Evidência.** package.json define somente o comando de iniciar. O teste deploy/smoke-test.js cobre inicialização e senha de cadastro, sem chat, cargos, canais privados, anexos, moderação, persistência, reconexão ou voz. O instalador copia arquivos sobre a instalação ativa, executa npm ci e reinicia serviços; a verificação pós-publicação consulta /config, mas não há retorno automático à versão anterior (deploy/instalar-vps.sh, linhas 129–169 e 246–261; deploy/atualizar-oracle.ps1, linhas 60–75).

**Fazer.** Criar testes de integração com base temporária para as regras de acesso e o fluxo de mensagem/anexo; automatizar a execução antes de publicar. Preparar uma nova versão em diretório separado, verificar seu início, alternar a aplicação e voltar ao anterior se a verificação falhar. Fazer um teste rápido do chat após publicação, além do /config.

**Aceite.** Um erro conhecido de permissão ou persistência bloqueia a publicação; uma versão com falha volta à anterior sem apagar dados.

### P2 — sessões, endurecimento e confiabilidade da interface

**Evidência.** Senhas de conta aceitam quatro caracteres (server.js, linha 516). Tokens aleatórios são guardados em localStorage e não expiram no servidor (server.js, linhas 213–217; public/app.js, linhas 284–335). Não há controle de dispositivos/sessões. A página principal não devolveu Content-Security-Policy nos cabeçalhos HTTP, embora uploads recebam uma política restritiva. Preferências de áudio e interface são lidas com JSON.parse sem tratamento de erro logo ao iniciar (public/app.js, linhas 57–73); um valor inválido pode impedir a interface de abrir. As chamadas com confirmação não têm prazo máximo (linhas 88–99), de modo que uma ação pode aguardar indefinidamente em falha de conexão.

**Fazer.** Exigir senha mais forte e oferecer troca de senha e encerramento de todas as sessões; usar prazo de validade e revogação no servidor. Considerar cookie HttpOnly/SameSite e política de conteúdo depois de revisar fluxos de mídia. Ler preferências com valores de recuperação. Definir prazo para confirmações Socket.IO e mensagem clara de tentativa novamente; a [documentação do Socket.IO tem esse recurso](https://socket.io/docs/v4/emitting-events/#with-timeout). A [OWASP trata expiração de sessão no servidor](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

**Aceite.** Sessão revogada deixa de autenticar; preferência inválida não deixa tela em branco; operações sem resposta terminam com erro compreensível.

### P2 — desempenho e organização do código ao crescer

**Evidência.** Backend concentra cerca de 900 linhas em server.js; frontend, aproximadamente 2.800 em public/app.js. Mudanças de presença/voz enviam o estado completo a cada cliente (server.js, linhas 362–447), e o cliente serializa partes desse estado para decidir o que redesenhar (public/app.js, linhas 399–428). Hoje o grupo e a base são pequenos; não há prova de gargalo atual.

**Fazer.** Separar módulos por responsabilidade (auth, chat, permissões, voz, mídia e UI) ao tocar nessas áreas. Quando houver crescimento, enviar atualizações menores de presença/voz, medir tempo de renderização e adicionar paginação/virtualização ao histórico. Preservar o ganho já existente de carga sob demanda de mensagens.

**Aceite.** Tempo de interação e uso de CPU conhecidos com número alvo de membros, canais e mensagens; regressões detectadas antes de publicar.

### P2 — clareza da experiência e próximos recursos

**Evidência.** O visual desktop é consistente e os controles têm rótulos na maioria dos botões de ícone. A faixa de pedido de notificações ocupa espaço considerável no celular. As configurações misturam opções aplicadas imediatamente com outras aplicadas ao clicar em “Salvar” (public/app.js, linhas 2636–2770). As notificações de mensagens usam a API do navegador enquanto a página está aberta (linhas 1051–1065); não há um serviço de envio quando a aba está fechada. O projeto ainda não oferece busca no histórico, troca/recuperação de senha ou mensagens diretas.

**Fazer.** Mostrar claramente quais opções são aplicadas na hora, dar retorno visível quando áudio/vídeo ou perfil de transmissão não puderem ser alterados e reduzir a faixa de notificação no celular. Diferenciar “notificação com a página aberta” de aviso mesmo com navegador fechado. Depois de resolver dados e acesso móvel, decidir com os usuários se busca, mensagens diretas e notificações fora do navegador realmente agregam valor ao grupo; não precisam vir antes das correções acima.

**Aceite.** Estado e erro de cada controle são compreensíveis; a descrição das notificações corresponde ao que o aplicativo entrega.

## Sequência sugerida

1. **Antes da próxima atualização grande:** backup fora da VM + restauração comprovada; impedir inicialização com dados inválidos; unificar a pasta de edição e o código publicado.
2. **Próxima versão:** autorização de anexos, limites globais de upload e layout de celular; testes de permissão/persistência e publicação com retorno à versão anterior.
3. **Após estabilizar:** testes multicliente de voz, ajustes de qualidade observáveis, sessões e acessibilidade completa.
4. **Quando houver crescimento real:** histórico durável com paginação, módulos menores e eventual SFU conforme medições.

## Limites desta avaliação

As falhas de acesso, persistência e interface foram identificadas no código ou observadas no navegador. Os riscos de concorrência de escrita e de escala da malha são projeções técnicas, não incidentes reproduzidos. O servidor estava saudável na medição pontual, mas isso não demonstra disponibilidade contínua nem qualidade da chamada em horários de pico.
