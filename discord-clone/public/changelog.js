// Histórico de versões do Resenhex. É a fonte da janela "Novidades" dentro do app;
// o CHANGELOG.md na pasta do projeto é a mesma lista, para quem lê pelo GitHub.
// Para uma versão nova: adicione um item no começo da lista e atualize a versão no package.json.
// O título deve destacar as principais funcionalidades ou correções, com termos objetivos.
window.CHANGELOG = [
  {
    version: '1.3.0', date: '2026-10-09', name: 'Minecraft dentro do Resenhex, com a call na tela',
    summary: 'Jogue Minecraft 1.8.8 (Eaglercraft) sem sair do Resenhex. A call continua em cima do jogo, a sala vê quem está jogando e quem ainda não abriu entra com um clique.',
    sections: [
      { kind: 'new', items: [
        'Minecraft na lateral: abre o jogo na área principal. Cada pessoa joga o seu, com mundos salvos no próprio navegador; para jogar junto, use o compartilhamento de mundo do próprio jogo.',
        'Numa call, ela fica em cima do jogo com os botões de microfone, som, câmera, tela e desligar. Arraste o divisor para mudar o tamanho.',
        'Quem está jogando aparece com um bloquinho verde no quadro da call e na lista da sala, e quem está na call vê “Entrar no Minecraft” para abrir com um clique.',
        'Trocar de canal deixa o jogo rodando; “Minecraft · Jogando” na lateral leva de volta. Fechar o jogo lembra de salvar o mundo e não derruba a call.',
      ] },
    ],
  },
  {
    version: '1.2.1', date: '2026-10-09', name: 'Teste de voz, menu de áudio e ajustes no chat da call',
    summary: 'Ouça os efeitos na sua própria voz direto na call. O menu de áudio ficou mais organizado, o aviso de efeito ficou discreto e o campo de mensagem do chat da sala agora mostra o texto inteiro.',
    sections: [
      { kind: 'new', items: [
        '“Ouvir minha voz” no menu do microfone da call: teste os efeitos com retorno no seu fone. Durante o teste, seu microfone fica mudo para as outras pessoas; fechar o menu ou sair da chamada encerra a escuta.',
      ] },
      { kind: 'improved', items: [
        'Menu de áudio mais compacto: microfone e saída de áudio em seletores, volume da chamada acessível e efeitos de voz numa seção que você pode abrir quando precisar.',
        'Efeito ativo indicado por um “FX” pequeno e cinza no canto superior direito do bloco da pessoa na call. Passe o mouse para ver o efeito escolhido.',
      ] },
      { kind: 'fixed', items: [
        'O campo de mensagem do chat da call cortava o texto quando o nome da sala ou a mensagem ocupava mais de uma linha. A altura agora acompanha o conteúdo e a largura disponível.',
        'Trocar o efeito, o microfone ou a saída durante a escuta mantém o teste atualizado e libera a captura ao terminar.',
      ] },
    ],
  },
  {
    version: '1.2.0', date: '2026-10-09', name: 'Modificador de voz, chat nas salas de voz e status',
    summary: 'Mude sua voz na call (esquilo, gigante, robô e mais), converse no chat da própria sala de voz e mostre se está ausente ou ocupado. Também chegaram o seletor de emojis novo, emojis do servidor e prévia de links no chat.',
    sections: [
      { kind: 'new', items: [
        'Modificador de voz: Esquilo, Gigante, Robô, Rádio, Caverna e Alien. Escolha em Configurações > Voz e vídeo (com “Ouvir minha voz” para testar) ou na setinha do microfone durante a call. Quem está com efeito aparece com o emoji dele no bloco e na lista da sala.',
        'Chat nas salas de voz: o balão no topo da call abre o chat da sala ao lado do palco, e o balão na lista de canais abre sem entrar na call. Uma bolinha avisa quando chega mensagem com o chat fechado.',
        'Setinha no microfone e na câmera da call (ou clique direito nos botões): troque microfone, saída de áudio e câmera sem sair da call, e ajuste o volume da chamada.',
        'Status: Disponível, Ausente, Não perturbe e Invisível, mais uma frase de status. Clique no seu cartão, embaixo à esquerda. Em Não perturbe, menções não tocam som nem mostram aviso.',
        'Seletor de emojis novo, com busca em português, categorias e os seus mais usados.',
        'Emojis do servidor: até 50 emojis próprios em Configurações do servidor > Emojis, para usar no chat e nas reações.',
        'Prévia de links no chat, com título, descrição e imagem (vídeos do YouTube também). Quem escreveu pode remover a prévia.',
        'Prévia da câmera antes de ligar: confira o enquadramento antes de todo mundo ver (dá para desligar em Voz e vídeo).',
        'Sozinho na sala de voz: o palco mostra atalhos para convidar pessoas, compartilhar a tela ou abrir o chat da sala.',
      ] },
      { kind: 'improved', items: [
        'Várias imagens numa mensagem viram um mosaico. O visualizador novo amplia (roda do mouse, duplo clique ou + e -), passa entre as fotos do canal e baixa o arquivo.',
        'Blocos da call mostram selos de microfone e fone desligados e de AO VIVO, barras quando a pessoa fala e “(você)” no seu bloco.',
        'Efeitos sonoros da call com gravações reais: grilo, trovão, aplausos, ba-dum-tss, buzina, fail, vitória e suspense.',
      ] },
      { kind: 'fixed', items: [
        'O menu de status aberto pelo perfil na lista de membros aparecia solto no pé da tela. Agora ele abre ao lado do perfil.',
      ] },
    ],
  },
  {
    version: '1.1.0', date: '2026-10-07', name: 'Calls por servidor de mídia e palco de transmissões novo',
    summary: 'As calls agora passam por um servidor de mídia: cada pessoa envia a tela uma vez só, não importa quantos assistam. O palco de transmissões ganhou grade e destaque.',
    sections: [
      { kind: 'new', items: [
        'Servidor de mídia (SFU): voz, câmera e telas vão uma vez para o servidor, que entrega a cada espectador. Transmitir para muita gente pesa bem menos na sua internet e no seu PC.',
        'Cada espectador recebe a qualidade do tamanho em que está vendo: miniatura em baixa, destaque em alta. Sem ninguém assistindo, a sua captura cai para 5 FPS.',
        'Palco de transmissões novo: várias telas dividem o palco em grade, ou uma fica em destaque com as outras numa faixa embaixo. Os botões Grade e Destaque ficam no topo do palco.',
        'Diagnóstico mostra se o codificador de vídeo usa a placa de vídeo e o status da GPU no app para Windows.',
        'Clique com o botão direito no espaço vazio da lista de canais para criar canal, criar grupo de canais ou convidar para o servidor. Quem gerencia canais também tem o botão “Criar grupo de canais” no fim da lista.',
      ] },
      { kind: 'improved', items: [
        'Se o servidor de mídia cair ou a sua rede não alcançá-lo, a call passa sozinha para conexão direta e continua.',
        'Se a conexão de mídia cair, o Resenhex entra de novo na call sozinho, sem você precisar sair e entrar.',
        'Ligar ou desligar a câmera enquanto transmite não faz mais a tela piscar para quem assiste.',
        'Salão do Mudae: a carta só aparece com a foto já carregada, sem quadro preto, e o giro não espera fotos lentas.',
        'Salão do Mudae: a mesa ao vivo fica sempre inteira na tela; a carta do palco se ajusta ao espaço que sobra, e em telas baixas o botão de casar vai para o lado dela.',
        'Salão do Mudae: molduras novas e mais discretas para comum, raro, épico e lendário.',
      ] },
      { kind: 'fixed', items: [
        'A tela de login aberta por um link de convite usava um roxo azulado diferente do resto do app. Agora ela segue as cores do Resenhex, e o aviso do convite aparece em roxo, não em amarelo de alerta.',
      ] },
    ],
  },
  {
    version: '1.0.0', date: '2026-10-04', name: 'Resenhex 1.0',
    celebrate: true,
    summary: 'Chegamos na 1.0! Esta versão junta a 0.99.14 a 0.99.16 (4 de outubro): chamada no privado, GIFs no chat, uma chamada por conta e mouse sem atraso nos jogos. Valeu a todo mundo que testou, reclamou e ficou na call até tarde.',
    sections: [
      { kind: 'new', items: [
        'Clique no selo AO VIVO na lista de canais de voz para ir direto à tela transmitida: você entra na chamada, se precisar, e a tela abre em destaque.',
        'Arquivos de até 50 MB no chat (antes 25 MB).',
        'Chamada de voz e vídeo no privado: os botões no topo da conversa ligam para o amigo. A chamada aparece em cima do chat, que continua embaixo; arraste a borda para mudar a altura ou amplie para a tela toda.',
        'Quem recebe vê a janela “está ligando…” com Atender, Atender com vídeo e Recusar, em qualquer tela do Resenhex, com toque e notificação do sistema. Sem resposta em 30 segundos, o toque para, e quem ligou pode ligar de novo.',
        'Na chamada privada funcionam microfone, fone, câmera, transmissão de tela (com zoom e qualidade) e os efeitos sonoros nativos. O chat registra a chamada (“Ana iniciou uma chamada que durou 12 minutos” ou “Você perdeu uma chamada de Ana”), com um botão para entrar enquanto ela acontece.',
        'GIFs: o botão GIF na caixa de mensagem, ao lado do emoji, abre os GIFs em alta e uma busca. Clicou, o GIF vai na hora, nos canais e nas conversas privadas. Os GIFs vêm do KLIPY.',
      ] },
      { kind: 'improved', items: [
        'Som de notificação novo para menções e mensagens diretas: um “plim” de sino em duas notas, mais suave, no lugar dos dois bipes secos.',
      ] },
      { kind: 'fixed', items: [
        'Dava para entrar com a mesma conta duas vezes na mesma chamada, abrindo outra aba. Agora cada conta fica em uma chamada só: entrar por outra aba, navegador ou pelo app tira a sessão anterior da chamada, com um aviso.',
        'No app para Windows (1.0.6), os atalhos globais escutavam também o mouse do sistema inteiro, e em jogos guiados pelo cursor, como Baldur’s Gate 3, o mouse podia atrasar durante a transmissão. Agora o app escuta só o teclado, e o push-to-talk e os atalhos continuam iguais.',
      ] },
    ],
  },
  {
    version: '0.99.13', date: '2026-10-04', name: 'Salão do Mudae em 3D e Meu perfil redesenhado',
    summary: 'Junta as versões 0.99.9 a 0.99.13 (1 a 4 de outubro): o canal Salão do Mudae com máquina de cápsulas 3D, o Meu perfil novo e vários ajustes visuais.',
    sections: [
      { kind: 'new', items: [
        'Salão do Mudae: crie um canal desse tipo e rode personagens com $w (waifu), $h (husbando) e $m (qualquer um). Todo mundo no Salão vê o roll ao mesmo tempo, e a Mesa ao vivo mostra os rolls de todos.',
        'O palco é uma lojinha de gashapon em 3D: a cápsula cai da máquina, balança mudando de cor e abre com a carta do personagem saindo de dentro. Cada raridade (comum, raro, épico e lendário) abre do seu jeito, e o lendário deixa a loja inteira dourada.',
        'Clique em Casar em até 45 segundos. Quem rodou tem 3 segundos só dele; depois, qualquer um pode roubar, e o chat conta o roubo. Casou? Corações sobem na loja (roxos, se foi roubo).',
        'Cada pessoa tem 10 rolls por hora e pode casar uma vez a cada 30 minutos. Clicar na máquina do meio repete o tipo do seu último roll.',
        'São 25 mil personagens de anime, jogos, quadrinhos, desenhos e séries. $wa, $wg, $wc, $wd e $ws (e o mesmo com $h e $m) rodam só de uma fonte, com a mesma chance de lendário em todas.',
        'Meu harem é um álbum de cards com busca, filtros e um favorito que aparece no perfil. Há também um ranking do servidor pelo valor do harem e o mural dos lendários.',
        'Reações rápidas (😱 🔥 💖 😂 💀) flutuam no palco. O Modo simplificado mostra o Salão como um chat comum, e a permissão “Usar o Mudae” nos cargos libera ou bloqueia o jogo.',
      ] },
      { kind: 'improved', items: [
        'Meu perfil mostra foto, banner e fundo numa lista só, cada um com Trocar, Ajustar e Remover à vista. Passar o mouse numa imagem destaca onde ela aparece na prévia, e clicar na prévia também troca.',
        'O tempo de chamada aparece no cabeçalho da chamada e no botão Em chamada.',
        'Perfis, menus, presença, anexos, áudio, código e reações acompanham melhor as cores do tema. Entrada, cadastro, download, Novidades e a barra de título do app têm a marca e a fonte atuais.',
        'A mesa do Salão tem fundo em gradiente nas cores do tema, e o catálogo ficou só com personagens: saíram cerca de 6 mil fichas de pessoas reais.',
        'Em computadores sem aceleração 3D, o Salão usa uma roleta de fotos. Em máquinas mais fracas, a cena reduz os efeitos sozinha.',
      ] },
      { kind: 'fixed', items: [
        'Controles da chamada se organizam em duas fileiras quando falta espaço, e o seletor de emojis cabe nas telas menores.',
        'Apagar uma mensagem abre a confirmação do próprio aplicativo, com opção de cancelar.',
      ] },
    ],
  },
  {
    version: '0.99.8', date: '2026-10-01', name: 'DJ da sala, fundo do perfil e zoom na transmissão',
    summary: 'Junta as versões 0.99.5 a 0.99.8 (30 de setembro e 1º de outubro): música do YouTube na chamada, fundo do perfil com imagem ou GIF e zoom na tela compartilhada.',
    sections: [
      { kind: 'new', items: [
        'DJ da sala: na chamada, o botão do disco busca no YouTube ou aceita um link, e a música entra na fila. Todo mundo ouve a mesma música no mesmo ponto. Também dá para usar /play, /pausar, /continuar, /pular, /parar e /fila em qualquer chat.',
        'O volume da música é só seu e separado das vozes. A permissão Usar o DJ controla quem pode pedir, pausar e pular.',
        'Clique no bloco do DJ para colocá-lo em destaque, com o que está tocando, os controles e a fila. Clique duplo abre o modo cinema.',
        'Zoom na transmissão de tela: role o mouse (ou faça a pinça) para aproximar onde está o cursor, arraste para mover, e Shift + arrastar amplia uma área. Um minimapa mostra a parte que você está vendo, e quem transmite manda mais resolução para o texto ficar nítido.',
        'Fundo do perfil: em Meu perfil, escolha uma imagem de até 8 MB ou um GIF animado de até 5 MB para a parte abaixo do banner, com enquadramento e zoom.',
      ] },
      { kind: 'improved', items: [
        'Membro desde e Cargos aparecem direto sobre o fundo do perfil, sem o painel retangular atrás.',
      ] },
    ],
  },
  {
    version: '0.99.4', date: '2026-09-30', name: 'Transmissão sem eco, atalhos e apelidos por servidor',
    summary: 'Junta as versões 0.99 a 0.99.4 (30 de setembro): transmissão sem as vozes da chamada, atalhos de teclado do Discord e um nome diferente em cada servidor.',
    sections: [
      { kind: 'new', items: [
        'Atalhos de teclado com os padrões do Discord (Ctrl+Shift+M muta, Ctrl+Shift+D ensurdece, Ctrl+/ mostra a lista), todos configuráveis em Acessibilidade e atalhos. No app para Windows, mutar e ensurdecer funcionam também no meio do jogo.',
        'Trocar de servidor não tira mais você da chamada, e o servidor da chamada ganha um alto-falante na barra lateral.',
        'Apelidos por servidor: “Editar nome no servidor”, no menu do servidor, escolhe um nome de até 32 caracteres só para aquele servidor. Login, amigos e mensagens diretas continuam com o nome de usuário.',
        'Ao escolher um banner, abre o editor com zoom e posição, e “Ajustar banner” reabre o enquadramento. GIFs continuam animados.',
        'Quando sai uma versão nova do Resenhex, aparece um aviso no topo com o botão Atualizar.',
      ] },
      { kind: 'fixed', items: [
        'Ao transmitir a tela com o som do computador, as vozes da chamada iam junto e quem assistia se ouvia de volta. Agora o som leva só o jogo, o vídeo ou a música: no app para Windows (Windows 10 22H2 ou mais novo) e no Chrome e Edge do Windows 11 o próprio sistema tira as vozes; nos outros casos, um filtro do Resenhex faz isso.',
        'Quem transmite vê como o som do computador está indo (sem as vozes, com as vozes tiradas pelo filtro ou com as vozes junto) e o que fazer. O mesmo aparece em Conexão e diagnóstico.',
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
