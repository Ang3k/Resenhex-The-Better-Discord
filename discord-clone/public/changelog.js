// Histórico de versões do Resenhex. É a fonte da janela "Novidades" dentro do app;
// o CHANGELOG.md na pasta do projeto é a mesma lista, para quem lê pelo GitHub.
// Para uma versão nova: adicione um item no começo da lista e atualize a versão no package.json.
window.CHANGELOG = [
  {
    version: '0.96',
    date: '2026-09-30',
    name: 'Tela no bolso',
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
    name: 'Uma casa para cada turma',
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
    name: 'Cada assunto no seu lugar',
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
    name: 'Banner do perfil',
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
    name: 'Papo reservado',
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
    name: 'Do seu jeito',
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
    name: 'Cara de app de verdade',
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
    name: 'Chamada completa',
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
    name: 'Nasce o Resenhex',
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
    name: 'Cara de Discord',
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
    name: 'Primeira chamada',
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
