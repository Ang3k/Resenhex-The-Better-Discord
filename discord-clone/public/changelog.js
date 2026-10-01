// Histórico de versões do Resenhex. É a fonte da janela "Novidades" dentro do app;
// o CHANGELOG.md na pasta do projeto é a mesma lista, para quem lê pelo GitHub.
// Para uma versão nova: adicione um item no começo da lista e atualize a versão no package.json.
// O título deve destacar as principais funcionalidades ou correções, com termos objetivos.
window.CHANGELOG = [
  {
    version: '0.99.8', date: '2026-10-01', name: 'Zoom na transmissão de tela e DJ em destaque',
    summary: 'Aproxime qualquer parte da tela compartilhada, e o vídeo do DJ pode ocupar o palco da chamada num layout próprio de música.',
    sections: [
      { kind: 'new', items: [
        'Zoom na transmissão de tela em destaque ou em tela cheia: role o mouse (ou faça a pinça no trackpad) para aproximar exatamente onde está o cursor, e arraste para mover a imagem.',
        'Shift + arrastar marca uma área e amplia só ela. Clique duplo amplia onde clicou e, ampliado, volta ao tamanho original. Também dá para usar + / − / 0 e as setas.',
        'Com zoom, um minimapa mostra a tela inteira e a parte que você está vendo; arraste nele para navegar. A barra de zoom aparece ao mexer o mouse.',
        'Aproximar pede mais resolução a quem transmite, para o texto ficar nítido.',
        'Clique no bloco do DJ na chamada para colocá-lo em destaque: o vídeo fica grande no meio, com a capa desfocada ao fundo.',
        'Em destaque aparecem o que está tocando, quem pediu, o progresso, os controles, o seu volume e as próximas músicas da fila.',
        'Clique duplo ou o botão de tela cheia abre o modo cinema, com o DJ cobrindo a janela toda. Esc volta.',
      ] },
    ],
  },
  {
    version: '0.99.7', date: '2026-10-01', name: 'Informações direto no fundo do perfil',
    summary: 'Membro desde e Cargos aparecem direto sobre o fundo do perfil.',
    sections: [
      { kind: 'fixed', items: [
        'Removido o painel retangular atrás das informações do perfil. O escurecimento do fundo e a sombra no texto mantêm a leitura.',
      ] },
    ],
  },
  {
    version: '0.99.6', date: '2026-10-01', name: 'Fundo do perfil com imagem ou GIF',
    summary: 'Personalize a parte abaixo do banner com uma imagem ou GIF animado, mantendo o nome e as informações legíveis.',
    sections: [
      { kind: 'new', items: [
        'Em Configurações → Meu perfil, use Mudar fundo para escolher uma imagem PNG, JPG ou WebP de até 8 MB, ou um GIF animado de até 5 MB.',
        'Arraste a imagem e ajuste o zoom antes de salvar. Ajustar fundo reabre o enquadramento e Remover fundo restaura o fundo padrão.',
        'O fundo recebe escurecimento e painéis desfocados para preservar a leitura. GIFs mantêm a animação e o enquadramento.',
      ] },
    ],
  },
  {
    version: '0.99.5', date: '2026-09-30', name: 'DJ da sala: músicas do YouTube na chamada',
    summary: 'Peça uma música do YouTube e todo mundo na sala de voz ouve junto, no mesmo ponto, cada um no próprio volume.',
    sections: [
      { kind: 'new', items: [
        'Na chamada, o botão do disco abre o DJ: busque no YouTube ou cole um link, e a música entra na fila da sala. Também dá para digitar /play e o nome da música em qualquer chat.',
        'Todo mundo na sala ouve a mesma música no mesmo ponto. Quem entra no meio já começa de onde a música está.',
        'Pausar, pular e parar valem para a sala toda (/pausar, /continuar, /pular, /parar e /fila no chat). Quem pode usar o DJ é a permissão nova Usar o DJ, ligada para todos.',
        'O volume da música é só seu e separado das vozes. Dá para silenciar a música só para você, e ensurdecer também silencia a música.',
        'O vídeo aparece num bloco do palco, e o que está tocando aparece no painel da chamada e na lista de canais. Lives do YouTube também tocam.',
        'Se a sala esvazia, a música espera no ponto em que parou por 5 minutos. Se um clipe não pode tocar fora do YouTube, o DJ toca outra versão da mesma busca.',
      ] },
    ],
  },
  {
    version: '0.99.4', date: '2026-09-30', name: 'Atalhos de teclado e chamada que continua ao trocar de servidor',
    summary: 'Atalhos do Discord para mutar, ensurdecer e navegar, configuráveis, e no app para Windows eles funcionam com o jogo aberto.',
    sections: [
      { kind: 'new', items: [
        'Atalhos de teclado com os padrões do Discord: Ctrl+Shift+M muta, Ctrl+Shift+D ensurdece, Ctrl+Alt+A volta para a chamada, Alt+↑/↓ troca de canal, Alt+Shift+↑/↓ vai para o canal não lido, Ctrl+Alt+↑/↓ troca de servidor, Ctrl+/ mostra a lista.',
        'Em Acessibilidade e atalhos dá para trocar qualquer atalho apertando a combinação nova, tirar o atalho, voltar ao padrão e definir atalhos para câmera, tela, supressão de ruído e sair da chamada.',
        'No app para Windows (1.0.4), mutar e ensurdecer funcionam também com o Resenhex em segundo plano, por exemplo no meio do jogo.',
        'Trocar de servidor não tira mais você da chamada: dá para olhar os outros servidores e voltar, e o servidor da chamada ganha um alto-falante na barra lateral.',
      ] },
    ],
  },
  {
    version: '0.99.3', date: '2026-09-30', name: 'Filtro de eco mais forte e aviso de versão nova',
    summary: 'As vozes da chamada saem do som da transmissão também nos PCs com som espacial ou equalização de volume, e uma versão nova do Resenhex agora avisa.',
    sections: [
      { kind: 'fixed', items: [
        'O filtro que tira as vozes da chamada do som da transmissão ficou bem mais forte nos PCs com som espacial, surround virtual ou equalização de volume ligados, onde antes sobrava uma voz abafada.',
        'No app para Windows, a exclusão do som do Resenhex pelo próprio Windows passa a valer a partir do Windows 10 22H2. Em versões anteriores ela não funciona direito, e o filtro do Resenhex entra no lugar.',
      ] },
      { kind: 'new', items: [
        'Quem transmite fica sabendo como o som do computador está indo: sem as vozes da chamada, com as vozes tiradas pelo filtro ou com as vozes junto, e o que fazer. O mesmo aparece em Conexão e diagnóstico.',
        'Quando sai uma versão nova do Resenhex, aparece um aviso no topo com o botão Atualizar.',
      ] },
    ],
  },
  {
    version: '0.99.2', date: '2026-09-30', name: 'Transmissão sem eco das vozes da chamada',
    summary: 'O som do computador na transmissão de tela não leva mais junto as vozes de quem está na chamada.',
    sections: [
      { kind: 'fixed', items: [
        'Ao transmitir a tela com o som do computador, as vozes da chamada iam junto e quem assistia se ouvia de volta. Agora o som da transmissão leva só o jogo, o vídeo ou a música.',
        'No app para Windows, o próprio Windows deixa o som do Resenhex de fora da captura (Windows 10 versão 2004 ou mais novo).',
        'No navegador, o Chrome e o Edge fazem isso sozinhos no Windows 11. No Windows 10, o Resenhex tira as vozes e os efeitos sonoros da captura; nos primeiros segundos de conversa ele ainda está aprendendo e um pouco pode escapar.',
      ] },
    ],
  },
  {
    version: '0.99.1', date: '2026-09-30', name: 'Ajuste do banner do perfil',
    summary: 'Enquadre o banner do perfil com zoom e posição, do mesmo jeito que a foto.',
    sections: [
      { kind: 'new', items: [
        'Ao escolher um banner, abre o editor: arraste a imagem e ajuste o zoom na proporção em que ele aparece no perfil.',
        'O botão “Ajustar banner”, em Meu perfil, reabre o enquadramento a qualquer momento.',
        'GIFs animados também podem ser enquadrados e continuam animados.',
      ] },
    ],
  },
  {
    version: '0.99', date: '2026-09-30', name: 'Apelidos por servidor',
    summary: 'Escolha um nome diferente em cada servidor, mantendo o nome de usuário da sua conta.',
    sections: [
      { kind: 'new', items: [
        'No menu do servidor, “Editar nome no servidor” abre uma janela com prévia. A opção também está em Meu perfil e no menu do seu próprio membro.',
        'O apelido aparece no chat, nas menções, na lista de membros e nas chamadas daquele servidor. Até 32 caracteres; deixe em branco para voltar ao nome de usuário.',
        'Cada servidor guarda seu próprio apelido. O login, os amigos e as mensagens diretas continuam usando seu nome de usuário.',
      ] },
    ],
  },
  {
    version: '0.98', date: '2026-09-30', name: 'GIF animado e ajuste da foto de perfil',
    summary: 'Enquadre sua foto, use GIF no perfil e adicione efeitos sonoros às chamadas.',
    sections: [
      { kind: 'new', items: [
        'Meu perfil: arraste a foto, ajuste o zoom e confira a prévia circular antes de salvar. Também dá para ajustar uma foto que você já está usando.',
        'GIF animado como foto de perfil, com enquadramento preservado no chat, nas chamadas e no cartão de perfil. Até 5 MB e 1024 pixels por lado.',
        'No painel de efeitos da chamada, “Adicionar efeito sonoro” abre uma janela com seleção do áudio, nome e pré-escuta. Até 8 segundos e 32 efeitos por servidor.',
        'A permissão “Gerenciar efeitos sonoros” permite adicionar e remover sons do servidor. Eles também aparecem nas configurações do servidor.',
      ] },
      { kind: 'improved', items: [
        'Efeitos sonoros com controle de picos, timbres mais suaves e pré-escuta individual. Os áudios enviados têm volume ajustado e transições curtas nas pontas para evitar estalos.',
        'A reprodução anterior para ao tocar outro efeito, silenciar os efeitos, ensurdecer ou sair da chamada.',
      ] },
    ],
  },
  {
    version: '0.97',
    date: '2026-09-30',
    name: 'App para Windows',
    summary: 'O Resenhex virou app de computador: baixe uma vez e ele se atualiza sozinho.',
    sections: [
      { kind: 'new', items: [
        'App para Windows: baixe pelo botão verde de download na barra de servidores ou em /baixar. É o mesmo Resenhex do site, com sua conta, seus servidores e suas chamadas.',
        'Push-to-talk com o app em segundo plano: a tecla de falar funciona mesmo com um jogo ou outro programa em primeiro plano.',
        'Ao compartilhar a tela no app, escolha um aplicativo ou a tela inteira pelas miniaturas. O som do computador vai sem as vozes da chamada, então ninguém ouve eco.',
        'O ícone da barra de tarefas mostra quantas menções chegaram e pisca quando alguém chama você. O app fica na bandeja e pode abrir junto com o Windows.',
      ] },
      { kind: 'improved', items: [
        'As novidades do site aparecem no app assim que são publicadas. Versões novas do próprio app são baixadas sozinhas, só com as partes que mudaram, e entram quando você clica em “Reiniciar para atualizar”.',
        'Sem internet, o app mostra uma tela de reconexão e volta sozinho quando o servidor responde.',
      ] },
    ],
  },
  {
    version: '0.96',
    date: '2026-09-30',
    name: 'Tela cheia e zoom em transmissões no celular',
    summary: 'Assistir a uma transmissão de tela no celular ficou nítido, fluido e confortável.',
    sections: [
      { kind: 'new', items: [
        'No celular, toque na transmissão para abrir a tela cheia. Ela gira sozinha para acompanhar a imagem, e o botão Voltar fecha sem sair da chamada.',
        'Pince para aproximar até 5× e arraste para ler detalhes. Um toque duplo amplia no ponto tocado e outro volta ao normal. Ao aproximar, a transmissão manda mais resolução.',
        'Controles por toque: som, qualidade e janela flutuante aparecem com um toque e somem sozinhos. A tela do celular não apaga enquanto você assiste.',
      ] },
      { kind: 'improved', items: [
        'O celular informa quais formatos de vídeo decodifica por hardware, e quem transmite passa a usar um deles. A imagem fica mais fluida e o aparelho esquenta menos.',
        'Um pequeno buffer no celular absorve as oscilações do Wi-Fi e do 4G, com menos engasgos na transmissão.',
        'Quando a conexão aperta, a transmissão reduz a resolução em degraus (720p, 540p, 360p) e mantém o FPS. Ela volta a subir quando a conexão permite.',
        'Em telas de toque, os botões dos blocos da chamada ficam sempre visíveis e maiores.',
      ] },
      { kind: 'fixed', items: [
        'No celular, “Compartilhar tela” explica que o navegador não permite transmitir e oferece ligar a câmera, em vez de falhar sem aviso.',
      ] },
    ],
  },
  {
    version: '0.95',
    date: '2026-09-29',
    name: 'Criação de servidores e convites',
    summary: 'Crie seus próprios servidores e chame seus amigos com um convite simples.',
    sections: [
      { kind: 'new', items: [
        'Use o botão + na barra lateral para criar um servidor ou entrar com um link de convite. No celular, abra “Seus servidores” na lista de canais.',
        'O dono pode excluir o servidor pelo menu ou pelas configurações. Confirme digitando seu nome; os canais, mensagens, anexos e convites são removidos permanentemente.',
        'Cada servidor tem canais, grupos, cargos, membros e chamadas próprios. Seu perfil, seus amigos e suas mensagens diretas acompanham você.',
        'Convidar amigos abre um link exclusivo do servidor. Quem recebe vê o nome e a quantidade de membros antes de aceitar.',
        'Cadastro com nome de usuário, senha e confirmação de senha, sem e-mail nem senha compartilhada do servidor.',
      ] },
      { kind: 'improved', items: [
        'O servidor existente mantém seu nome, seus canais, históricos e permissões. A atualização guarda uma cópia permanente dos dados anteriores.',
        'Banimentos, castigos e silenciamentos valem somente no servidor em que foram aplicados.',
        'Administradores podem revogar o convite e gerar outro. Quem já entrou permanece no servidor.',
        'Trocar de servidor encerra a chamada atual e restaura seus rascunhos por canal. O último servidor usado volta ao entrar novamente.',
        'Visual renovado: nova fonte, janelas de criar, entrar, convidar e excluir servidor redesenhadas, e interruptores, listas, controles deslizantes e seletor de cor com o mesmo acabamento em todos os temas.',
        'Ícones animados: microfone, fone e engrenagem reagem ao passar o mouse, e o risco aparece desenhado ao silenciar ou ensurdecer. Mensagens novas, menus e avisos entram com suavidade; “Reduzir animações” desliga tudo.',
      ] },
      { kind: 'fixed', items: [
        '“Excluir servidor” aberto pelas configurações do servidor aparece na frente da janela, e os avisos não cobrem mais os controles da chamada.',
      ] },
    ],
  },
  {
    version: '0.9',
    date: '2026-09-29',
    name: 'Grupos de canais e qualidade de transmissão',
    summary: 'Organize o servidor em grupos de canais e transmita com qualidade adaptada a cada espectador.',
    sections: [
      { kind: 'new', items: [
        'Grupos de canais: crie pelo menu do servidor ou em Configurações do servidor → Canais. Renomeie, recolha ou expanda cada grupo.',
        'Arraste canais entre grupos e ordene grupos e canais. No celular ou pelo teclado, use o menu ⋯ para mover, subir ou descer.',
        'Duplique um canal copiando tipo, descrição e permissões. A cópia começa sem mensagens, arquivos ou participantes da chamada.',
        'Adicione uma descrição para explicar o assunto do canal. Ela aparece no cabeçalho do chat e ao passar o mouse sobre o canal.',
        'Quem assiste pode escolher Automática, Economia ou Mais nitidez, sem alterar a qualidade dos demais.',
      ] },
      { kind: 'improved', items: [
        'Excluir um grupo coloca seus canais em “Sem grupo”, preservando mensagens, arquivos, permissões e chamadas.',
        'O recolhimento é uma preferência pessoal: o canal aberto, a sala da chamada e canais com atividade pendente continuam acessíveis.',
        'Transmissão considera o tamanho do vídeo e a conexão de cada espectador. Banda não utilizada por vídeos pequenos ou conexões limitadas fica disponível para os demais.',
        'Captura reduz resolução e FPS quando não há espectadores ou quando todos precisam de menos qualidade. Em segundo plano, o vídeo economiza recursos e o áudio continua; janela flutuante permanece ativa.',
        'Reserva de banda e prioridade para voz e áudio da tela, com recuperação gradual após dificuldades de rede ou processamento.',
      ] },
      { kind: 'fixed', items: [
        'Canais privados sem cargos selecionados agora ficam acessíveis somente a administradores. Remover o último cargo autorizado não torna o canal público.',
        'Ajustes de qualidade recebidos durante outro ajuste são reaplicados. Estatísticas antigas de perda e telas estáticas não provocam reduções sucessivas indevidas.',
      ] },
    ],
  },
  {
    version: '0.8',
    date: '2026-09-28',
    name: 'Banner de perfil com imagens e GIFs',
    summary: 'Troque a faixa colorida do seu cartão de perfil por uma imagem ou um GIF animado.',
    sections: [
      { kind: 'new', items: [
        'Banner do perfil: em Configurações → Meu perfil, clique em "Mudar banner" e escolha uma imagem PNG, JPG ou WebP, ou um GIF animado de até 5 MB.',
        'A prévia nas configurações tem o mesmo tamanho do cartão de perfil, então você vê exatamente o que os outros vão ver.',
        '"Remover banner" volta para a faixa colorida, que usa a cor do seu avatar.',
      ] },
      { kind: 'improved', items: [
        'Imagens comuns são recortadas no centro na proporção do banner; GIFs são enviados inteiros para não perder a animação (até 1500 × 1500 px).',
      ] },
    ],
  },
  {
    version: '0.7',
    date: '2026-09-28',
    name: 'Amigos e mensagens diretas',
    summary: 'Amigos e mensagens diretas, como no Discord: agora dá para conversar em particular com quem você adicionou.',
    sections: [
      { kind: 'new', items: [
        'Botão Início na faixa da esquerda: lista de mensagens diretas e a tela de Amigos, com as abas Online, Todos, Pendentes, Bloqueados e Adicionar amigo.',
        'Adicione amigos pelo nome de usuário ou clicando em alguém (lista de membros, nome numa mensagem ou menção) e escolhendo "Adicionar amigo". Se a outra pessoa também tinha pedido a sua amizade, vocês viram amigos na hora.',
        'Mensagens diretas entre amigos, com tudo do chat: formatação, arquivos e prints, responder, reagir, editar, apagar e "fulano está digitando…".',
        'Bolinha vermelha no Início com as mensagens novas e os pedidos de amizade, negrito nas conversas não lidas, som e notificação na área de trabalho.',
        'Bloquear: desfaz a amizade e impede pedidos e mensagens privadas. Dá para desbloquear na aba Bloqueados.',
      ] },
      { kind: 'improved', items: [
        'O cartão de perfil e o menu do clique direito ganharam Enviar mensagem, Adicionar amigo, Remover amigo e Bloquear.',
        'Só você e a outra pessoa veem a conversa no app: nem quem administra o servidor lê ou apaga mensagens diretas dos outros.',
        'Fechar uma conversa (x na lista) só a esconde; o histórico fica salvo e ela volta quando chegar mensagem nova.',
      ] },
    ],
  },
  {
    version: '0.6',
    date: '2026-09-28',
    name: 'Ícone do servidor e cartões de perfil',
    summary: 'O servidor ganhou cara própria e clicar em alguém agora mostra um perfil de verdade.',
    sections: [
      { kind: 'new', items: [
        'Ícone do servidor: envie uma imagem em Configurações do servidor → Visão geral. Ela aparece na faixa de servidores e na aba do navegador.',
        'Cartão de perfil ao clicar em alguém (na lista de membros, no nome de uma mensagem ou numa menção): foto, status, "membro desde" e cargos.',
        'Dar e tirar cargos direto no cartão de perfil, com o botão + e o × em cada cargo.',
        'Em chamada, o cartão tem o volume da pessoa e "Mutar para mim".',
      ] },
      { kind: 'improved', items: [
        'Menu do clique direito redesenhado, com ícones, marcação de ligado/desligado e submenus para Castigar, Mover e Cargos.',
        'Expulsar e banir pedem confirmação dentro do app.',
      ] },
    ],
  },
  {
    version: '0.5',
    date: '2026-09-28',
    name: 'Configurações de servidor, cargos e canais',
    summary: 'Uma rodada inteira de acabamento: telas de administração no estilo do Discord, paleta neutra e cada detalhe da conversa revisado.',
    sections: [
      { kind: 'new', items: [
        'Configurações do servidor em tela cheia: Visão geral, Cargos, Canais, Membros e Banimentos.',
        'Editor de cargo com abas de Exibição, Permissões e Gerenciar membros, paleta de cores e prévia do nome.',
        'Engrenagem do canal abre as configurações dele: nome, canal privado e escolha de cargos.',
        'Dá para renomear o servidor (Visão geral, só administradores).',
        'Painel de voz e perfil unificado, atravessando a faixa dos servidores e dos canais.',
        'Esta janela de Novidades.',
      ] },
      { kind: 'improved', items: [
        'Tema escuro em tons de carvão; o roxo ficou só nas ações e nos estados ativos.',
        'Barra de "alterações não salvas" que não deixa sair sem salvar, e confirmações dentro do app.',
        'Caixa de mensagem sem borda fixa, com destaque só enquanto você escreve.',
        'Canais mais compactos, nomes e horários das mensagens com pesos bem definidos.',
        'Lista de membros acompanha o chat; quem está offline fica mais discreto.',
        'Aviso de notificações compacto e controles padronizados (mudo e surdo em vermelho, conexão em verde).',
        'Para o servidor: trocar o endereço do site com um comando (ex.: resenhex.duckdns.org).',
      ] },
      { kind: 'fixed', items: [
        'A engrenagem de um canal abria a lista geral em vez do próprio canal.',
        'Quem só podia expulsar ou castigar não conseguia abrir a administração do servidor.',
      ] },
    ],
  },
  {
    version: '0.4',
    date: '2026-09-28',
    name: 'Efeitos sonoros e central de configurações',
    summary: 'Efeitos sonoros, uma central de configurações e transmissão que só gasta internet com quem está assistindo.',
    sections: [
      { kind: 'new', items: [
        'Efeitos sonoros na chamada: grilo 🦗, trovão ⛈️, aplausos, ba dum tss e mais, com opção de silenciar e volume próprio.',
        'Botão de ensurdecer na barra da chamada.',
        'Sensibilidade do microfone automática ou manual, com o corte visível no medidor.',
        'Trocar a tela ou o aplicativo transmitido sem parar a transmissão.',
        'Central de configurações com seções: Perfil, Voz e vídeo, Transmissão, Aparência, Notificações, Atalhos e Diagnóstico.',
        'Foto de perfil, recortada e conferida no servidor.',
        'Temas Grafite, Meia-noite e Alto contraste.',
      ] },
      { kind: 'improved', items: [
        'Transmissão só é enviada para quem clica em "Assistir"; "Parar de assistir" corta o envio de verdade.',
        'Qualidade ajustada para cada espectador conforme a internet e o computador dele.',
        'Durante o teste de microfone você fica mudo na chamada, e o som volta sozinho.',
        'Resolução, FPS, taxa e codec de volta sobre a transmissão.',
      ] },
    ],
  },
  {
    version: '0.3',
    date: '2026-09-27',
    name: 'Qualidade de transmissão e supressão de ruído',
    summary: 'Nome novo, visual novo e transmissão de tela levada a sério. E o servidor passou a ficar online 24 horas.',
    sections: [
      { kind: 'new', items: [
        'O projeto virou Resenhex, com o servidor padrão "Resenha" e uma interface no estilo do Discord.',
        'Perfis de transmissão: 720p 30 fps, 1080p 30 fps e 1080p 60 fps.',
        'Controles da transmissão: volume, silenciar, fixar, janela flutuante, tela cheia e parar de assistir.',
        'Supressão de ruído por IA, no estilo do Krisp, com botão rápido e teste de microfone.',
        'Instalação em servidor na nuvem (Oracle Cloud) com HTTPS e servidor de voz próprio, no ar 24 horas.',
      ] },
      { kind: 'improved', items: [
        'Codecs escolhidos por tipo de conteúdo e internet dividida entre quem assiste.',
        'Reconexão sem recarregar a página, voz mais resistente a perda de pacotes e limites contra abuso.',
      ] },
      { kind: 'fixed', items: [
        'Transmissão travava quando a pessoa minimizava o programa compartilhado; agora avisa e volta sozinha.',
        'A supressão de ruído deixava a voz mais baixa em microfones estéreo.',
      ] },
    ],
  },
  {
    version: '0.2',
    date: '2026-09-27',
    name: 'Contas, cargos e moderação',
    summary: 'Contas, cargos, moderação e tudo aquilo que faz o chat parecer casa.',
    sections: [
      { kind: 'new', items: [
        'Contas com senha, cargos com hierarquia e permissões.',
        'Moderação: silenciar e ensurdecer no servidor, castigo, mover, expulsar e banir.',
        'Canais privados por cargo.',
        'Imagens e arquivos (inclusive Ctrl+V de print), menções com @, respostas e reações.',
        'Formatação: negrito, itálico, código, citação e spoiler.',
        'Mensagens não lidas, notificações e sons de entrar, sair e mutar.',
        'Pressionar para falar e câmera.',
      ] },
    ],
  },
  {
    version: '0.1',
    date: '2026-09-27',
    name: 'Chat, chamadas de voz e compartilhamento de tela',
    summary: 'O começo: a turma perdeu o servidor antigo e resolveu fazer o próprio.',
    sections: [
      { kind: 'new', items: [
        'Chat de texto em canais, com histórico.',
        'Salas de voz e compartilhamento de tela.',
        'Scripts de um clique para abrir o servidor e mandar o link para os amigos.',
      ] },
    ],
  },
];
window.APP_VERSION = window.CHANGELOG[0].version;
