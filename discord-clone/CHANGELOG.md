# Novidades do Resenhex

Histórico de versões. A mesma lista aparece dentro do app em **Novidades** (menu do servidor ou rodapé das Configurações).
O Resenhex chegou à versão 1.0 em 4 de outubro de 2026.

## v1.1.0 — Calls por servidor de mídia e palco de transmissões novo

7 de outubro de 2026. As calls agora passam por um servidor de mídia (LiveKit): cada pessoa envia a tela uma vez só, não importa quantos assistam.

### Novo
- Servidor de mídia (SFU) para voz, câmera e telas, com qualidade por espectador e captura a 5 FPS sem ninguém assistindo.
- Palco de transmissões com grade e destaque.
- Diagnóstico do codificador de vídeo e da GPU no app para Windows.
- Botão direito na lista de canais: criar canal, criar grupo de canais e convidar; botão “Criar grupo de canais” no fim da lista.

### Melhorado
- Queda do servidor de mídia ou rede bloqueada: a call passa sozinha para conexão direta.
- Queda da conexão de mídia: reconexão automática à call.
- Ligar a câmera durante a transmissão não faz mais a tela piscar.
- Salão do Mudae: carta sem quadro preto e giro sem esperar fotos lentas.

### Corrigido
- Login aberto por link de convite com as cores do app, sem o roxo azulado, e aviso do convite em roxo.

## v1.0.0 — Resenhex 1.0 🎉
_04/10/2026 · junta as versões 0.99.14 a 0.99.16_

Chegamos na 1.0! Valeu a todo mundo que testou, reclamou e ficou na call até tarde.

- Clique no selo **AO VIVO** na lista de canais de voz para ir direto à tela transmitida.
- Arquivos de até **50 MB** no chat (antes 25 MB).
- **Chamada no privado**: os botões de chamada de voz e de vídeo no topo da conversa ligam para o amigo. A chamada fica em cima do chat; arraste a borda para mudar a altura ou amplie para a tela toda.
- **Toque**: quem recebe vê "está ligando…" com **Atender**, **Atender com vídeo** e **Recusar**, em qualquer tela, com som e notificação do sistema. Sem resposta em 30 segundos, o toque para e dá para **Ligar de novo**.
- Microfone, fone, câmera, transmissão de tela e efeitos sonoros nativos funcionam na chamada privada, e o chat registra a chamada ("iniciou uma chamada que durou 12 minutos", "Você perdeu uma chamada de…").
- **GIFs**: botão **GIF** na caixa de mensagem, ao lado do emoji, com os GIFs em alta e uma busca. Clicou, o GIF vai na hora, nos canais e no privado. Os GIFs vêm do KLIPY.
- **Som de notificação** novo: um "plim" de sino em duas notas, mais suave.
- **Uma chamada por conta**: dava para entrar com a mesma conta duas vezes na mesma chamada, abrindo outra aba. Agora entrar por outra aba, navegador ou pelo app tira a sessão anterior da chamada, com um aviso.
- **App para Windows (1.0.6)**: os atalhos globais escutavam também o mouse do sistema inteiro, e em jogos guiados pelo cursor, como Baldur's Gate 3, o mouse podia atrasar durante a transmissão. Agora o app escuta só o teclado; push-to-talk e atalhos continuam iguais.

## v0.99.13 — Salão do Mudae em 3D e Meu perfil redesenhado
_01/10/2026 a 04/10/2026 · junta as versões 0.99.9 a 0.99.13_

- **Salão do Mudae**: um tipo novo de canal. Rode personagens com `$w` (waifu), `$h` (husbando) e `$m` (qualquer um); todo mundo no Salão vê o roll ao mesmo tempo, e a **Mesa ao vivo** mostra os rolls de todos.
- **Lojinha de gashapon em 3D**: a cápsula cai da máquina, balança mudando de cor e abre com a carta saindo de dentro. Cada raridade (comum, raro, épico, lendário) abre do seu jeito, e o lendário deixa a loja inteira dourada.
- **Casar** em até 45 segundos. Quem rodou tem 3 segundos só dele; depois, qualquer um pode **roubar**. Corações sobem na loja (roxos, se foi roubo).
- **10 rolls por hora** e **1 casamento a cada 30 minutos**. Clicar na máquina do meio repete o tipo do último roll.
- **25 mil personagens** de anime, jogos, quadrinhos, desenhos e séries. `$wa`, `$wg`, `$wc`, `$wd` e `$ws` (e o mesmo com `$h` e `$m`) rodam só de uma fonte. O catálogo tem só personagens, sem fichas de pessoas reais.
- **Meu harem** é um álbum de cards com busca, filtros e um favorito no perfil; o **Ranking** mostra o valor de cada harem e o mural dos lendários. Reações rápidas flutuam no palco, o **Modo simplificado** mostra o Salão como chat comum, e a permissão **Usar o Mudae** controla quem joga.
- **Meu perfil** mostra foto, banner e fundo numa lista só, com **Trocar**, **Ajustar** e **Remover** à vista. Passar o mouse numa imagem destaca onde ela aparece na prévia.
- **Tempo de chamada** no cabeçalho da chamada e no botão **Em chamada**.
- **Acabamento visual**: temas mais consistentes em perfis, menus, anexos e reações; entrada, cadastro, download e a barra de título do app com a marca e a fonte atuais; controles da chamada e seletor de emojis cabem nas telas menores; apagar mensagem pede confirmação no próprio app.

## v0.99.8 — DJ da sala, fundo do perfil e zoom na transmissão
_30/09/2026 a 01/10/2026 · junta as versões 0.99.5 a 0.99.8_

- **DJ da sala**: o botão do disco na chamada busca no YouTube ou aceita um link, e todo mundo ouve a mesma música no mesmo ponto. Comandos `/play`, `/pausar`, `/continuar`, `/pular`, `/parar` e `/fila` em qualquer chat; a permissão **Usar o DJ** controla quem pede.
- O volume da música é só seu e separado das vozes. Clique no bloco do DJ para colocá-lo em destaque, com os controles e a fila; clique duplo abre o **modo cinema**.
- **Zoom na transmissão de tela**: role o mouse (ou faça a pinça) para aproximar onde está o cursor, arraste para mover e use **Shift + arrastar** para ampliar uma área. Um **minimapa** mostra a parte visível, e quem transmite manda mais resolução para o texto ficar nítido.
- **Fundo do perfil**: em Meu perfil, uma imagem de até 8 MB ou um GIF animado de até 5 MB para a parte abaixo do banner, com enquadramento e zoom. **Membro desde** e **Cargos** aparecem direto sobre ele.

## v0.99.4 — Transmissão sem eco, atalhos e apelidos por servidor
_30/09/2026 · junta as versões 0.99 a 0.99.4_

- **Transmissão sem eco**: o som do computador na transmissão não leva mais as vozes da chamada. No app para Windows (Windows 10 22H2 ou mais novo) e no Chrome e Edge do Windows 11, o próprio sistema tira as vozes; nos outros casos, um filtro do Resenhex faz isso. Quem transmite vê como o som está indo e o que fazer.
- **Atalhos de teclado** com os padrões do Discord (Ctrl+Shift+M muta, Ctrl+Shift+D ensurdece, Ctrl+/ mostra a lista), configuráveis em **Acessibilidade e atalhos**. No app para Windows, mutar e ensurdecer funcionam no meio do jogo.
- Trocar de servidor não tira mais você da chamada.
- **Apelidos por servidor**: **Editar nome no servidor** escolhe um nome de até 32 caracteres só para aquele servidor; login, amigos e mensagens diretas continuam com o nome de usuário.
- **Ajustar banner**: zoom e posição para o banner do perfil, com GIFs continuando animados.
- **Aviso de versão nova** no topo, com o botão Atualizar.

## v0.98 — GIF animado e ajuste da foto de perfil
_30/09/2026_

- Ajuste da foto de perfil com arraste, zoom, posições horizontal e vertical e prévia circular antes de salvar. O botão **Ajustar foto** também abre a foto atual.
- GIF animado como foto de perfil: até 5 MB e 1024 pixels por lado, com enquadramento mantido no chat, na chamada e no cartão de perfil.
- **Adicionar efeito sonoro** no painel de efeitos da chamada abre uma janela dedicada com seleção de arquivo, nome, duração e pré-escuta. Até 8 segundos e 32 sons personalizados por servidor; formatos suportados pelo navegador, como MP3, WAV, OGG e M4A, são preparados para reprodução.
- Permissão **Gerenciar efeitos sonoros** para adicionar e remover sons do servidor. A seção **Efeitos sonoros** nas configurações reúne os arquivos e permite ouvi-los e removê-los.
- Efeitos prontos com controle de picos e timbres mais suaves; pré-escuta só para você. Sons enviados têm volume ajustado e transições nas pontas para evitar estalos. Tocar outro efeito, silenciar, ensurdecer ou sair da chamada encerra a reprodução anterior.

## v0.97 — App para Windows
_30/09/2026_

- App para Windows (pasta `desktop/`): uma janela própria que abre o site, com barra de título no tema escolhido. Baixe pelo botão verde de download na barra de servidores ou em `/baixar`.
- As mudanças do site chegam no app com o deploy normal. Versões novas do app (a casca de Windows) são publicadas com `deploy/publicar-app.ps1`, baixadas sozinhas em segundo plano (só os blocos que mudaram, cerca de 1 MB em vez de 107 MB) e instaladas com “Reiniciar para atualizar”.
- Push-to-talk global: com o app em segundo plano, a tecla configurada continua funcionando (inclusive em jogos). Só a tecla escolhida é observada.
- Escolha de tela no app: aplicativos e telas com miniaturas e ícones, e som do computador sem as vozes da própria chamada (sem eco para quem assiste).
- Selo de menções na barra de tarefas, piscar ao ser mencionado, bandeja com “Iniciar com o Windows” e “Fechar para a bandeja”, corretor ortográfico em português e menu de copiar/colar.
- Tela de reconexão quando o servidor não responde, com nova tentativa automática.
- Servidor: rota `/download` (instalador, `latest.yml` e respostas com várias faixas de bytes para a atualização diferencial), link fixo `/download/Resenhex-Setup.exe` e página `/baixar`.
- Microsoft Store: pacote MSIX (`npm run dist:store`), página `/privacidade` e `MS_STORE_ID`, que faz a página `/baixar` entregar o instalador oficial da Microsoft, sem o aviso do Windows. Na versão da loja, a própria Store atualiza o app, e “Iniciar com o Windows” abre a tela de inicialização do Windows.

## v0.96 — Tela cheia e zoom em transmissões no celular
_30/09/2026_

- Transmissão de tela no celular: toque abre uma tela cheia imersiva que gira para acompanhar a imagem. O botão Voltar fecha sem sair da chamada.
- Pinça para aproximar até 5×, arrastar com inércia e toque duplo para ampliar no ponto tocado. A resolução pedida a quem transmite acompanha o zoom.
- Controles por toque (som, qualidade, janela flutuante) que aparecem com um toque e somem sozinhos. Tela sempre acesa enquanto assiste (Wake Lock).
- Codec por espectador: o celular informa os codecs que decodifica por hardware (Media Capabilities), e quem transmite prioriza um deles para aquele espectador.
- Buffer de reprodução de 120 ms para a tela recebida no celular, com menos engasgos em Wi-Fi e 4G.
- Política de transmissão: sob aperto, a resolução desce em degraus fixos (720/540/360p) e o FPS é mantido. A estimativa de banda do navegador não limita mais o codificador.
- Em telas de toque, os controles dos blocos ficam sempre visíveis. Em navegadores sem captura de tela, “Compartilhar tela” explica isso e oferece a câmera.

## v0.95 — Criação de servidores e convites
_29/09/2026_

- Criar servidores e entrar por convite usando o botão **+**. Alternar pela barra lateral ou por **Seus servidores**, inclusive no celular.
- O dono pode excluir um servidor pelo menu ou pelas configurações, confirmando seu nome. A exclusão remove os canais, históricos, anexos e convites e encerra as chamadas daquele servidor.
- Canais, grupos, cargos, membros, moderação e chamadas isolados por servidor. Conta, perfil, amigos e DMs compartilhados.
- Link exclusivo do servidor, com prévia do nome e quantidade de membros antes da entrada. Administradores podem revogar o link e gerar outro.
- Cadastro com nome de usuário, senha e confirmação de senha, sem e-mail ou senha compartilhada. Novas contas não entram automaticamente no servidor existente.
- Migração preserva o servidor atual, incluindo nome, histórico, canais e permissões; mantém `data.json.pre-0.9.1.bak` como backup permanente do formato anterior.
- Troca de servidor encerra a chamada atual. Rascunhos e anexos ficam separados por canal; o último servidor escolhido é lembrado.
- Banimentos e castigos afetam apenas a participação naquele servidor e mantêm a conta e as conversas privadas.
- Visual renovado: fonte Figtree servida pelo próprio app, janelas de servidor redesenhadas e controles de formulário (interruptores, listas, controles deslizantes, seletor de cor) com o mesmo acabamento em todos os temas.
- Ícones animados no estilo do Discord (microfone, fone, engrenagem, câmera, tela, efeitos sonoros), risco desenhado ao silenciar ou ensurdecer e entradas suaves de mensagens, menus e avisos. “Reduzir animações” desliga tudo.
- Correção: “Excluir servidor” aberto pelas configurações do servidor ficava atrás da janela; avisos não cobrem mais os controles da chamada.

## v0.9 — Grupos de canais e qualidade de transmissão
_29/09/2026_

Organize o servidor em grupos de canais e transmita com qualidade adaptada a cada espectador.

### Novidades

- Criar, renomear, recolher e expandir grupos pelo menu do servidor ou pela administração.
- Arrastar para ordenar grupos e canais ou mover canais entre grupos. O menu ⋯ também permite mover, subir e descer pelo teclado e no celular.
- Duplicar tipo, descrição e permissões de um canal, com histórico vazio e sem copiar arquivos ou participantes da chamada.
- Descrição do canal no cabeçalho do chat e ao passar o mouse sobre o canal.
- Quem assiste pode escolher Automática, Economia ou Mais nitidez, sem alterar a qualidade dos demais.

### Melhorias

- Excluir grupo move seus canais para “Sem grupo” e preserva mensagens, arquivos, permissões e chamadas.
- Recolhimento pessoal por conta/navegador, mantendo acessíveis o canal ativo, a chamada e canais com atividade pendente.
- Migração dos grupos iniciais de texto e voz sem alterar IDs nem pontos de leitura.
- Transmissão considera o tamanho da reprodução e a conexão de cada espectador. Banda não utilizada por vídeos pequenos ou conexões limitadas fica disponível para os demais.
- Captura reduz resolução e FPS quando não há espectadores ou quando todos precisam de menos qualidade. Em segundo plano, o vídeo economiza recursos e o áudio continua; janela flutuante permanece ativa.
- Reserva de banda e prioridade para voz e áudio da tela, com recuperação gradual de qualidade após dificuldades de rede ou processamento.

### Correções

- Privado sem cargos agora permite acesso somente a administradores. Remover o último cargo autorizado mantém o canal privado.
- Ajustes de qualidade que chegam durante outro ajuste são reaplicados. Estatísticas antigas de perda e telas estáticas não provocam reduções sucessivas indevidas.

## v0.8 — Banner de perfil com imagens e GIFs
_28/09/2026_

Troque a faixa colorida do seu cartão de perfil por uma imagem ou um GIF animado.

### Novidades
- Banner do perfil: em Configurações → Meu perfil, clique em "Mudar banner" e escolha uma imagem PNG, JPG ou WebP, ou um GIF animado de até 5 MB.
- A prévia nas configurações tem o mesmo tamanho do cartão de perfil, então você vê exatamente o que os outros vão ver.
- "Remover banner" volta para a faixa colorida, que usa a cor do seu avatar.

### Melhorias
- Imagens comuns são recortadas no centro na proporção do banner; GIFs são enviados inteiros para não perder a animação (até 1500 × 1500 px).

## v0.7 — Amigos e mensagens diretas
_28/09/2026_

Amigos e mensagens diretas, como no Discord: agora dá para conversar em particular com quem você adicionou.

### Novidades
- Botão Início na faixa da esquerda: lista de mensagens diretas e a tela de Amigos, com as abas Online, Todos, Pendentes, Bloqueados e Adicionar amigo.
- Adicione amigos pelo nome de usuário ou clicando em alguém (lista de membros, nome numa mensagem ou menção) e escolhendo "Adicionar amigo". Se a outra pessoa também tinha pedido a sua amizade, vocês viram amigos na hora.
- Mensagens diretas entre amigos, com tudo do chat: formatação, arquivos e prints, responder, reagir, editar, apagar e "fulano está digitando…".
- Bolinha vermelha no Início com as mensagens novas e os pedidos de amizade, negrito nas conversas não lidas, som e notificação na área de trabalho.
- Bloquear: desfaz a amizade e impede pedidos e mensagens privadas. Dá para desbloquear na aba Bloqueados.

### Melhorias
- O cartão de perfil e o menu do clique direito ganharam Enviar mensagem, Adicionar amigo, Remover amigo e Bloquear.
- Só você e a outra pessoa veem a conversa no app: nem quem administra o servidor lê ou apaga mensagens diretas dos outros.
- Fechar uma conversa (x na lista) só a esconde; o histórico fica salvo e ela volta quando chegar mensagem nova.

## v0.6 — Ícone do servidor e cartões de perfil
_28/09/2026_

O servidor ganhou cara própria e clicar em alguém agora mostra um perfil de verdade.

### Novidades
- Ícone do servidor: envie uma imagem em Configurações do servidor → Visão geral. Ela aparece na faixa de servidores e na aba do navegador.
- Cartão de perfil ao clicar em alguém (na lista de membros, no nome de uma mensagem ou numa menção): foto, status, "membro desde" e cargos.
- Dar e tirar cargos direto no cartão de perfil, com o botão + e o × em cada cargo.
- Em chamada, o cartão tem o volume da pessoa e "Mutar para mim".

### Melhorias
- Menu do clique direito redesenhado, com ícones, marcação de ligado/desligado e submenus para Castigar, Mover e Cargos.
- Expulsar e banir pedem confirmação dentro do app.

## v0.5 — Configurações de servidor, cargos e canais
_28/09/2026_

Uma rodada inteira de acabamento: telas de administração no estilo do Discord, paleta neutra e cada detalhe da conversa revisado.

### Novidades
- Configurações do servidor em tela cheia: Visão geral, Cargos, Canais, Membros e Banimentos.
- Editor de cargo com abas de Exibição, Permissões e Gerenciar membros, paleta de cores e prévia do nome.
- Engrenagem do canal abre as configurações dele: nome, canal privado e escolha de cargos.
- Dá para renomear o servidor (Visão geral, só administradores).
- Painel de voz e perfil unificado, atravessando a faixa dos servidores e dos canais.
- Esta janela de Novidades.

### Melhorias
- Tema escuro em tons de carvão; o roxo ficou só nas ações e nos estados ativos.
- Barra de "alterações não salvas" que não deixa sair sem salvar, e confirmações dentro do app.
- Caixa de mensagem sem borda fixa, com destaque só enquanto você escreve.
- Canais mais compactos, nomes e horários das mensagens com pesos bem definidos.
- Lista de membros acompanha o chat; quem está offline fica mais discreto.
- Aviso de notificações compacto e controles padronizados (mudo e surdo em vermelho, conexão em verde).
- Para o servidor: trocar o endereço do site com um comando (ex.: resenhex.duckdns.org).

### Correções
- A engrenagem de um canal abria a lista geral em vez do próprio canal.
- Quem só podia expulsar ou castigar não conseguia abrir a administração do servidor.

## v0.4 — Efeitos sonoros e central de configurações
_28/09/2026_

Efeitos sonoros, uma central de configurações e transmissão que só gasta internet com quem está assistindo.

### Novidades
- Efeitos sonoros na chamada: grilo 🦗, trovão ⛈️, aplausos, ba dum tss e mais, com opção de silenciar e volume próprio.
- Botão de ensurdecer na barra da chamada.
- Sensibilidade do microfone automática ou manual, com o corte visível no medidor.
- Trocar a tela ou o aplicativo transmitido sem parar a transmissão.
- Central de configurações com seções: Perfil, Voz e vídeo, Transmissão, Aparência, Notificações, Atalhos e Diagnóstico.
- Foto de perfil, recortada e conferida no servidor.
- Temas Grafite, Meia-noite e Alto contraste.

### Melhorias
- Transmissão só é enviada para quem clica em "Assistir"; "Parar de assistir" corta o envio de verdade.
- Qualidade ajustada para cada espectador conforme a internet e o computador dele.
- Durante o teste de microfone você fica mudo na chamada, e o som volta sozinho.
- Resolução, FPS, taxa e codec de volta sobre a transmissão.

## v0.3 — Qualidade de transmissão e supressão de ruído
_27/09/2026_

Nome novo, visual novo e transmissão de tela levada a sério. E o servidor passou a ficar online 24 horas.

### Novidades
- O projeto virou Resenhex, com o servidor padrão "Resenha" e uma interface no estilo do Discord.
- Perfis de transmissão: 720p 30 fps, 1080p 30 fps e 1080p 60 fps.
- Controles da transmissão: volume, silenciar, fixar, janela flutuante, tela cheia e parar de assistir.
- Supressão de ruído por IA, no estilo do Krisp, com botão rápido e teste de microfone.
- Instalação em servidor na nuvem (Oracle Cloud) com HTTPS e servidor de voz próprio, no ar 24 horas.

### Melhorias
- Codecs escolhidos por tipo de conteúdo e internet dividida entre quem assiste.
- Reconexão sem recarregar a página, voz mais resistente a perda de pacotes e limites contra abuso.

### Correções
- Transmissão travava quando a pessoa minimizava o programa compartilhado; agora avisa e volta sozinha.
- A supressão de ruído deixava a voz mais baixa em microfones estéreo.

## v0.2 — Contas, cargos e moderação
_27/09/2026_

Contas, cargos, moderação e tudo aquilo que faz o chat parecer casa.

### Novidades
- Contas com senha, cargos com hierarquia e permissões.
- Moderação: silenciar e ensurdecer no servidor, castigo, mover, expulsar e banir.
- Canais privados por cargo.
- Imagens e arquivos (inclusive Ctrl+V de print), menções com @, respostas e reações.
- Formatação: negrito, itálico, código, citação e spoiler.
- Mensagens não lidas, notificações e sons de entrar, sair e mutar.
- Pressionar para falar e câmera.

## v0.1 — Chat, chamadas de voz e compartilhamento de tela
_27/09/2026_

O começo: a turma perdeu o servidor antigo e resolveu fazer o próprio.

### Novidades
- Chat de texto em canais, com histórico.
- Salas de voz e compartilhamento de tela.
- Scripts de um clique para abrir o servidor e mandar o link para os amigos.
