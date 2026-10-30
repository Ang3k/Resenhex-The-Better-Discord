# Novidades do Resenhex

Histórico de versões. A mesma lista aparece dentro do app em **Novidades** (menu do servidor ou rodapé das Configurações).
O Resenhex chegou à versão 1.0 em 4 de outubro de 2026.

## v2.3.0 — Transmissão mais fluida com jogo pesado e um visual mais leve e vivo

30 de outubro de 2026.

Com um jogo pesando a placa de vídeo, a transmissão pelo app do Windows fica com cerca do dobro de quadros por segundo. E o Resenhex ganhou movimento nos momentos certos, gasta bem menos durante a chamada e ficou mais fácil de ler. A transmissão mais fluida precisa do app do Windows 1.4.7, que se atualiza sozinho.

### Novidades

- Momentos: a sua mensagem sobe da caixa ao ser enviada, a reação cai no lugar, uma menção a você dá um cutucão, o amigo que fica online acende, quem entra na chamada chega com uma animação e aparecem os três pontinhos quando alguém está digitando.
- Ao abrir, o Resenhex mostra o logo enquanto conecta. Se demorar mais de 10 segundos, um aviso sugere conferir a internet.
- O começo de um canal novo mostra a marca do Resenhex e convida a mandar a primeira mensagem.

### Melhorias

- Transmissão com jogo pesado (app do Windows 1.4.7): quando o jogo ocupa toda a placa de vídeo, a transmissão caía para 20 a 30 fps, porque a captura esperava a placa terminar cada quadro. Agora ela não espera mais. Nos testes, com um jogo médio a transmissão subiu de 19 para 39 fps e com um pesado de 12 para 22 fps, com o mesmo atraso. Sem jogo pesado, nada muda. Para desligar, use "Captura sem esperar a placa (teste)" no ícone do Resenhex na bandeja.
- Chamada mais leve: com a chamada na tela, o Resenhex redesenhava tudo 60 vezes por segundo, mesmo sem ninguém mexer. Agora são 6, e o uso da placa de vídeo pela página caiu para um décimo. Com a janela minimizada ou em segundo plano, as animações param.
- Botões, menus e janelas se mexem com efeito de mola, e uns 25 ícones fazem um gesto quando o mouse passa por cima, como responder, reagir, editar e a lixeira que abre a tampa.
- Mais fácil de ler: hora das mensagens, membros offline e o botão Adicionar amigo com mais contraste, textos pequenos um pouco maiores e um destaque claro e único em volta do que está selecionado pelo teclado. No celular, as setinhas dos dispositivos na chamada ficaram maiores.

### Correções

- Quando a conexão voltava, o aviso aparecia duas vezes. Agora aparece "Conectado de novo", uma vez só.
- A roleta do Mudae agora respeita a opção Reduzir animações das Configurações.

## v2.2.0 — Jogando agora, mensagem de áudio e Sobre mim no perfil

30 de outubro de 2026.

O Resenhex mostra o jogo que a galera está jogando, o chat ganhou mensagem de áudio e o perfil ganhou um Sobre mim. O Jogando agora precisa do app do Windows 1.4.6, que se atualiza sozinho.

### Novidades

- Jogando agora: com o app do Windows aberto, o Resenhex reconhece o jogo na sua tela e mostra "Jogando" no seu perfil, na lista de membros, nos amigos e nas conversas privadas. Some quando você fecha o jogo ou fica invisível, e dá para desligar em Configurações > Jogos.
- Mensagem de áudio: toque no microfone ao lado do campo de mensagem, fale e mande. São até 5 minutos, com a onda do áudio no chat, velocidade de 1,5x ou 2x e clique em qualquer ponto da onda para pular até ali.
- Sobre mim: conte um pouco sobre você no perfil, com até 190 caracteres, links e emojis. Aparece no cartão do seu perfil para todo mundo.
- Quem cria a conta agora ganha uma boas-vindas com os primeiros passos: montar a turma, deixar o perfil com a sua cara e baixar o app.

### Melhorias

- A aba Overlay em jogos das Configurações virou Jogos, com o Jogando agora e o overlay no mesmo lugar.

### Correções

- App do Windows: com um jogo aberto como administrador na frente (vários jogos rodam assim), Ctrl+Shift+M e Ctrl+Shift+D não faziam nada, porque o Windows esconde do Resenhex as teclas desse jogo. Agora o app percebe esse jogo e, enquanto ele estiver na frente, pede os atalhos direto ao Windows. Segurar a tecla muta uma vez só.

## v2.0.0 — Resenhex 2.0: chamem seus amigos

25 de outubro de 2026.

Um recado do dev: refiz o Resenhex por dentro, e agora ele aguenta milhares de pessoas online ao mesmo tempo. Então o pedido é um só: chamem seus amigos. O time do jogo, a turma da faculdade, aquele grupo que ainda vive no Discord. Manda o convite no grupo e traz todo mundo pra call. O Resenhex está pronto.

### Novidades

- Mandou o convite no WhatsApp ou no Discord? Agora ele aparece com imagem, o nome do servidor e quantos membros ele tem. O link do Resenhex também ganhou prévia.

### Melhorias

- Chamadas no horário cheio: o retransmissor, que conecta quem está numa rede restrita, tinha só 41 vagas e lotava à noite. Agora são milhares.
- Rede de escola ou de empresa que bloqueia parte da conexão: a chamada tenta outro caminho depois de 8 s, em vez de esperar até 30 s.
- O site abre mais rápido a partir da segunda visita, e a prévia da transmissão gasta menos internet.
- Por segurança, quem ficar 90 dias sem usar o Resenhex precisa entrar de novo com a senha.

### Correções

- Duas pessoas que dependem do retransmissor não conseguiam se ouvir na mesma chamada. Agora conectam.

### Por dentro

- Antes, o Resenhex começava a travar com 200 a 300 pessoas online. Num simulador com 50 mil contas, agora 5 mil pessoas online passam com folga, na mesma máquina gratuita de sempre.
- Banco de dados novo (SQLite): antes, cada mudança regravava todos os dados do site num arquivo só. Agora só o pedaço que mudou é gravado, em menos de 3 milissegundos.
- Avisos sob medida: mutar, entrar numa sala ou mudar o status mandava o servidor inteiro para todo mundo. Agora vai um aviso pequeno, só para quem precisa. Num servidor com 500 pessoas online, cada aviso caiu de 177 KB para menos de 1 KB.
- Índices: o servidor não percorre mais todas as contas e conexões a cada ação. Ele vai direto em quem importa.
- Fotos, banners e emojis são processados em paralelo, sem segurar o resto do site.
- Retransmissor com senha temporária para cada pessoa, limite por conta e um teto de internet por mês, para o Resenhex continuar de graça.
- Atualizações sem derrubar todo mundo de uma vez: os apps voltam aos poucos, em até 30 segundos. E o site ganhou proteção contra abuso e alarmes que avisam o dev quando algo vai mal.

## v1.9.0 — Ouvir a transmissão ensurdecido, voltar à chamada pelo painel e menus na tela cheia

24 de outubro de 2026.

Ensurdecido, dá para ligar só o som da transmissão que você está assistindo. O nome da sala no painel Voz conectada leva de volta para a chamada, como no Discord. E, com a transmissão em tela cheia, o menu de qualidade volta a aceitar clique.

### Novidades

- Ensurdecer continua calando tudo, mas o alto-falante da transmissão liga o som dela de novo: você ouve só a transmissão, com as vozes ainda caladas. Ao desligar a surdez, tudo volta ao normal. Na primeira vez, um aviso mostra onde fica o botão.

### Melhorias

- Painel Voz conectada: o nome da sala e do servidor virou link. Um clique leva de volta para a chamada de qualquer canal, servidor ou conversa, também no celular.

### Correções

- Transmissão em tela cheia: dá para escolher a qualidade para assistir (e usar os outros menus, como o do clique direito). Antes o menu aparecia, mas o clique passava para a transmissão e só mexia no zoom.

## v1.8.8 — Animações mais suaves e páginas do site com as cores do app

18 de outubro de 2026.

Menus, janelas e telas entram e saem com o mesmo movimento suave. A página inicial, a de baixar e a de privacidade ganharam o preto com roxo do app, e baixar para Windows agora oferece o .exe ou a Microsoft Store.

### Novidades

- Baixar para Windows: dois botões, o instalador .exe e a Microsoft Store. Antes do .exe, uma janela mostra o aviso que o Windows vai dar e sugere a Store para quem preferir instalar sem ele.

### Melhorias

- Página inicial, Baixar e Privacidade com as cores do app e da tela de entrar: fundo preto e o roxo do logo nos botões, nos destaques dos títulos e atrás da prévia do app.
- Menus, cartões de perfil, seletor de emoji, dicas e avisos agora também saem com animação, em vez de sumir de uma vez.
- Janelas de confirmação, criar canal, configurações e Novidades: o fundo escurece e o cartão sobe de leve ao abrir, e encolhe ao fechar.
- Trocar de canal faz a conversa entrar subindo de leve; num canal que ainda não foi aberto, ela espera as mensagens chegarem para não piscar vazia.
- Celular: as gavetas de canais e de membros deslizam ao abrir e ao fechar, e a folha de ações da mensagem desce ao sair.
- O volume de uma transmissão abre ao lado do botão sem empurrar os outros, e os interruptores, a pílula dos servidores e as barras de quem fala ficaram mais leves para o navegador.
- "Reduzir animações" (em Acessibilidade) e a mesma opção do sistema continuam desligando todo o movimento.

### Correções

- Celular: o volume de cada transmissão fica sempre à mostra ao lado do botão de som, para abaixar uma transmissão sem abaixar as vozes junto.
- Tela cheia: o menu "Qualidade para assistir", os outros menus e as dicas dos botões aparecem por cima da transmissão. Antes eles abriam escondidos atrás dela.

## v1.8.5 — Recorte de efeito sonoro e celular revisado

18 de outubro de 2026.

Crie um efeito sonoro a partir de qualquer áudio ou vídeo e escolha o trecho na onda, como no Discord. No celular, a barra da chamada, os menus e várias telas foram acertados.

### Novidades

- Adicionar efeito sonoro aceita áudio ou vídeo (MP3, WAV, OGG, M4A, MP4, WEBM, até 50 MB e 5 minutos). Escolha até 8 segundos arrastando as bordas na onda, arraste o trecho inteiro ou toque fora dele para começar ali. O play toca só o trecho, do jeito que vai soar na chamada.
- Arquivos com mais de 20 segundos ganham uma faixa com o arquivo inteiro embaixo da onda, para ir direto até a parte certa.

### Melhorias

- Celular: a barra da chamada cabe inteira com todos os botões, mesmo em telas estreitas, e os botões de quem está sozinho na sala ficam um embaixo do outro.
- Celular: os efeitos sonoros abrem numa folha que sobe de baixo, com o fundo escurecido. O cartão de perfil também escurece o fundo, e tocar fora só fecha, sem acionar o que estava atrás.
- Celular: os menus não passam mais da borda da tela, e os itens ficaram mais altos, fáceis de tocar.
- Celular: o topo do cartão de entrar ou criar conta sempre fica alcançável, o teclado não abre sozinho no login nem no DJ, e as dicas de passar o mouse não aparecem no toque.
- Celular: avisos mais largos e acima da caixa de mensagem, abas de Amigos em grade, a fileira de baixo das Configurações quebra linha em vez de rolar de lado e as legendas dos clipes não cortam mais o texto.

## v1.8.0 — Clipar

17 de outubro de 2026.

Pegue os últimos 30 segundos da chamada e solte um vídeo para a galera baixar.

### Novidades

- Botão Clipar (claquete) na barra da chamada e atalho Alt+C, que funciona com o jogo aberto no app do Windows. A claquete bate fechando e abre de novo, como no cinema.
- Corte o trecho que quiser dentro dos últimos 30 segundos antes de soltar, com régua de tempo embaixo da onda e a duração do trecho em destaque.
- O clipe vira um vídeo com os perfis de quem estava na chamada, acendendo verde em quem fala, e só quem estava lá pode baixar.
- Os clipes da chamada ficam na aba Clipes da chamada, dentro da janela Clipar, por 24 horas. Sem poder clipar (fone desligado, por exemplo), a claquete abre direto neles.
- Nova opção Pode clipar meu áudio, em Voz e vídeo e na própria janela Clipar. Desligada, você some dos clipes.

## v1.7.0 — Prévia da transmissão e paleta roxa

17 de outubro de 2026.

Quem está na chamada sem assistir vê uma prévia da tela de quem transmite, como no Discord. O app todo ganhou o preto com roxo da tela de entrada.

### Novidades

- Prévia da transmissão: quem está na chamada e ainda não clicou em assistir vê uma foto da tela de quem transmite, trocada a cada 8 s com um esmaecido, no lugar do bloco parado. Quem entra na sala já recebe a última foto. Ao parar de assistir, o último quadro visto fica como prévia até a próxima foto.

### Melhorias

- Paleta do tema Escuro: o preto com roxo da tela de entrada agora vale para o app todo. O roxo do logo fica no que é ação ou marca (botões, interruptores, menções, links e os títulos das Configurações), e seleções e fundos ficam neutros. Os temas Meia-noite e Alto contraste não mudam.
- Perfil: novo tom "Roxo Resenhex" entre as cores.
- "Conectando…", ao começar a assistir uma transmissão, ganhou um indicador girando.
- Nas miniaturas de transmissão, o botão diz só "Assistir" e fica acima do nome de quem transmite.

### Correções

- As medições da transmissão (resolução, fps, internet) somem do bloco quando você para de assistir. Antes ficavam na tela com os últimos números.

## v1.6.2 — Transmissão a 60 fps em monitores de 144 Hz

16 de outubro de 2026.

No app do Windows, a transmissão em Movimento · 1080p / 60 passa de 48 para 59 fps em monitores de 144 Hz, e a imagem chega mais rápido para quem assiste. O H.264 passa a usar a placa de vídeo sempre que ela codifica.

### Melhorias

- App do Windows 1.4.4: a captura de tela entregava no máximo 48 quadros por segundo em monitores de 144 Hz, por um limite do Windows que o app não ajustava. Agora o Movimento · 1080p / 60 chega a 59 fps, sem gastar mais processador. O app se atualiza sozinho.
- App do Windows 1.4.4: a transmissão sempre envia o quadro mais recente da tela. Nos perfis de 30 fps, a imagem chega cerca de 40 ms mais rápido para quem assiste.
- As estatísticas da sua transmissão mostram também quantos quadros a captura da tela entrega ("captura 59 fps"). Se esse número estiver baixo, o limite é a captura, e não a internet ou o codificador.
- Movimento · 1080p / 60: o H.264 usa primeiro os perfis que a placa de vídeo codifica (NVIDIA, AMD ou Intel). Antes, a transmissão podia cair no codificador do processador, com imagem pior e bem mais uso de CPU. Se a placa recusar um perfil, o app troca para outro sozinho, sem interromper.

### Correções

- Em blocos estreitos, as estatísticas da transmissão não cobrem mais o selo AO VIVO.

## v1.6.1 — 1080p a 60 fps por padrão e mais fluido

16 de outubro de 2026.

No perfil de 60 fps, a resolução agora desce e sobe aos poucos para manter o jogo fluido, e volta para 1080p em segundos quando sobra folga. Quem ainda não escolheu começa a transmitir em Movimento · 1080p / 60, com limite de upload de 50 Mbps.

### Melhorias

- Movimento · 1080p / 60: o 1080p é o alvo e fica o máximo possível. A resolução só desce quando a transmissão fica abaixo de 25 fps por uns 6 s: primeiro para 900p, que confere o resultado, e se ainda não der conta para 720p. Uma engasgada isolada ou uma oscilação curta da internet não trocam a resolução.
- Quando sobra folga, a resolução volta a subir em poucos segundos, assim que o app prevê pelo menos 35 fps no degrau de cima (tempo de codificação e banda). Uma tentativa que falha espera um pouco mais para a próxima. Antes, cada degrau levava pelo menos 20 s.
- Movimento · 1080p / 60 pelo servidor de mídia: a camada de 1080p agora também desce aos poucos (900p, 720p) quando os quadros caem, e volta sozinha. Antes ela ficava em 1080p a ~38 fps quando o computador não dava conta. Com o processador no limite, a camada das miniaturas passa antes para 30 fps, para o 1080p manter os quadros.
- Com várias pessoas assistindo pela conexão direta, quem está em tela cheia tem prioridade. Quando falta processador ou internet, as miniaturas baixam primeiro, e o 1080p é o primeiro a voltar.
- Quem assiste: a transmissão ganhou ~0,1 s de folga para absorver o quadro-chave do 1080p e a variação da internet, com menos engasgos. Antes isso valia só no celular.
- Movimento · 1080p / 60: até 8 Mbps por espectador, no lugar de 6, para a imagem ficar mais limpa em jogos com muito movimento. Os degraus de baixo acompanham (900p ~6,1 Mbps, 720p ~4,4 Mbps). Quem tem menos internet não perde nada: o navegador se ajusta à internet de verdade, e a volta para o 1080p continua pedindo só ~4,5 Mbps.
- Perfil padrão da transmissão: Movimento · 1080p / 60, no lugar de Automática. Para textos, código e apresentações, Nitidez · 1080p / 30 continua deixando as letras mais nítidas.
- Limite de upload padrão: 50 Mbps, no lugar de 10. Com várias pessoas assistindo, cada uma recebe mais banda. Se a sua internet envia menos que isso, escolha um valor menor em Configurações.
- Quem já tinha salvo um perfil ou um limite de upload continua com o seu.
- Conexão direta (P2P, sem o servidor de mídia): o som da tela agora chega em estéreo. Antes chegava mono, e jogo, música e vídeo perdiam o lado de cada som. A voz continua mono, e no servidor de mídia o som da tela já era estéreo.

### Correções

- Chamadas voltam sozinhas depois de uma queda de rede. Antes, depois da primeira queda curta, a reconexão automática parava de funcionar com aquela pessoa, e uma queda de mais de uns 20 s só voltava clicando em Reconectar. Agora o app segue tentando enquanto a pessoa estiver na chamada, e a imagem volta em 1 a 2 s depois que a rede volta.
- Duas pessoas que entram na sala quase ao mesmo tempo agora se conectam. Antes, se a primeira tinha internet mais lenta (no celular, por exemplo), o pedido de conexão da segunda chegava antes de a chamada começar do lado dela e se perdia. As duas ficavam na sala sem se ouvir até alguém sair e entrar de novo. Isso podia acontecer, por exemplo, quando todo mundo volta junto depois de uma queda do servidor.
- Se o servidor de mídia falha logo depois da entrada e a chamada passa para conexão direta, a conexão com quem já estava na sala agora acontece. Antes, essas pessoas ficavam sem áudio até alguém sair e entrar de novo.
- Chamadas pelo servidor de mídia: as vozes saem no fone ou alto-falante escolhido em Configurações desde a entrada. Antes, iam para a saída padrão do sistema até a saída ser escolhida de novo.
- Trocar tela/aplicativo para uma fonte com som: quem não estava assistindo na hora da troca agora ouve o som quando volta a assistir.
- Quem começa a assistir no meio de uma troca de tela recebe a fonte nova. Antes, podia ficar com a imagem parada.
- Quem volta a assistir não faz mais a transmissão trocar para o codec mais leve, ou para o modo de movimento, por causa de um pico de um instante. A troca só acontece depois de 5 s seguidos de aperto, como já devia ser.
- Economia · 720p / 30: depois de um aperto longo, a imagem volta para 720p em 24 s, e não mais em 36 s. O app contava um degrau abaixo de 360p que não mudava nada.

## v1.6.0 — E-mail de recuperação e Esqueci a senha

15 de outubro de 2026.

Agora dá para cadastrar um e-mail, que é opcional, e criar uma senha nova por ele se você esquecer a sua. Quem não quiser colocar e-mail continua entrando só com usuário e senha.

### Novidades

- Cadastro: campo de e-mail opcional. Sem e-mail, não dá para recuperar a conta se você esquecer a senha, e o aviso aparece logo abaixo do campo.
- Minha conta: seção E-mail de recuperação para adicionar, trocar ou remover o e-mail. O e-mail só vale depois de confirmado pelo link que chega na caixa de entrada.
- Esqueci a senha, na tela de login: digite o seu e-mail e receba um link para criar uma senha nova. O link vale por 1 hora e uma vez só, e os outros aparelhos saem da conta.
- Ninguém mais vê o seu e-mail, nem os membros dos servidores nem os amigos.

### Melhorias

- Minha conta: trocar a senha e o e-mail não pede mais a senha atual. Quem está conectado e esqueceu a senha consegue criar outra, e os outros aparelhos continuam saindo da conta.

### Correções

- Entrar e criar conta: a tela usa sempre o roxo do Resenhex, e não mais um azul para quem chega por convite ou já tinha visitado o site. A cor de avatar sugerida também é roxa.
- Página inicial: os títulos trocaram de fonte. A nova é tão larga e forte quanto a anterior, mas com letras normais, sem as pontas curvas no G, no E e no B.

## v1.5.1 — Transmissão a 60 fps segura o 1080p e Propor Melhorias no lugar certo

14 de outubro de 2026.

No perfil Movimento · 1080p / 60, a transmissão só baixa a resolução quando cai abaixo de 30 fps, e volta sozinha quando melhora. O botão Propor Melhorias não ocupa mais espaço do chat.

### Melhorias

- Movimento · 1080p / 60: a resolução fica enquanto a transmissão mantém pelo menos 30 fps. A 45 fps continua em 1080p; abaixo de 30 por alguns segundos desce para 720p tentando 60 de novo, e assim por diante até 360p para não travar.
- Quedas rápidas, como uma tela de carregamento, não baixam mais a resolução, e o aviso de internet ou processador do navegador sozinho também não.
- Quando melhora, a transmissão volta para a resolução de cima depois de uns 20 s perto de 60 fps. Se não segurar, espera mais antes de tentar de novo.
- Propor Melhorias: no computador, o botão fica no rodapé da lista de membros e some quando ela está escondida, como no chat da call. No celular, fica nas Configurações.

### Correções

- Celular: o rodapé das Configurações (Propor Melhorias, Sair da conta e a versão) não aparecia. Agora fica numa fileira abaixo das abas.

## v1.5.0 — Transmissão de tela mais nítida e chat mais leve

14 de outubro de 2026.

Telas com texto chegam bem mais nítidas gastando menos internet, o perfil de 60 fps mantém o 1080p enquanto o computador aguenta, o chat trava menos durante as chamadas e a página abre mais rápido.

### Melhorias
- Texto, código e planilhas bem mais nítidos: os perfis de texto usam AV1 com ferramentas de conteúdo de tela, com menos da metade da internet de envio.
- Blocos pequenos recebem a imagem inteira e o navegador de quem assiste reduz, o que deixa a letra legível. Jogos e vídeos continuam no tamanho do bloco.
- Se o processador não der conta do codec mais nítido, a transmissão passa para um mais leve sozinha, sem tela preta para quem assiste.
- Movimento · 1080p / 60: mantém 1080p e 60 fps, e só desce para 720p ou 540p quando os quadros começam a cair.
- Jogos em H.264 já começam na qualidade certa: antes, uma transmissão aberta no meio da chamada levava uns 20 segundos para ficar nítida.
- Servidor de mídia (SFU): camadas refeitas e começo em H.264 corrigido. Com três pessoas assistindo, texto a 30 fps e jogos sem travadas.
- Conexão e diagnóstico mostram o codificador, se é por hardware, se o processador está no limite e se o servidor de mídia está por UDP, TCP ou TURN.
- Chat mais leve durante as chamadas: quando alguém entra, sai ou muta na sala, as mensagens na tela são atualizadas com bem menos trabalho.
- A transmissão de tela atualiza a etiqueta "AO VIVO" só quando ela muda.
- O app abre mais rápido: a conexão com o servidor carrega menos código.
- Ícones e imagens do site e dos apps ocupam até 39% menos espaço, com a mesma qualidade.
- O servidor usa menos memória com o Mudae e volta mais rápido depois de cada atualização.
- Página inicial: títulos na fonte Unbounded, com "A galera já tá na call" e "Bora pra resenha?" em caixa alta.

## v1.4.5 — Call no celular bloqueado sem perder o microfone e DJ como mídia

13 de outubro de 2026.

Com o celular bloqueado, uma queda da conexão não deixa mais você mudo na call: o Resenhex volta sozinho para a sala com o mesmo microfone. No app de Android 1.3.2, a música do DJ sai como mídia, com qualidade de música, e não mais pelo som da ligação.

### Novidades
- **App de Android 1.3.2:** a música do DJ toca como mídia, separada do som da call. Antes, com o microfone aberto, ela saía pela faixa da ligação, com qualidade de voz e no volume da chamada. O vídeo continua na tela, acompanhando o som.

### Correções
- **Celular bloqueado:** depois de uma queda da conexão (internet oscilando ou atualização do servidor), a call voltava e você ouvia todo mundo, mas ninguém te ouvia. Agora a chamada fica guardada durante a queda e volta com o mesmo microfone.
- A sensibilidade de entrada não fecha mais o microfone quando não consegue medir a sua voz, como com a tela bloqueada ou o áudio pausado pelo sistema.

### Melhorias
- Microfone que para de captar (fone desconectado, captura silenciada pelo sistema) é reaberto sozinho. Se a supressão de ruído ou o efeito de voz travar, sua voz segue direto pelo microfone.
- **App de Android 1.3.2:** o serviço da call continua ligado entre a queda e a volta, recupera o microfone sempre que o app aparece na tela e avisa "Ninguém está te ouvindo" se o Android pausar o microfone. Atualize pelo botão **Atualizar** do app ou em resenhex.duckdns.org/baixar.
- **App de Android 1.3.2:** o Wi-Fi fica em modo de baixa latência também com a tela apagada (Android 10 a 13).

## v1.4.4 — Propor Melhorias

13 de outubro de 2026.

Tem uma ideia para o Resenhex? O botão discreto no canto inferior direito abre um espaço para compartilhar sua sugestão com a equipe, sem sair do app.

### Novidades
- **Propor Melhorias:** escreva sua ideia no botão do canto inferior direito ou nas Configurações. As sugestões são enviadas por e-mail à equipe do Resenhex.

### Melhorias
- Se o envio falhar, sua sugestão continua no campo para você tentar novamente.

## v1.4.3 — Compartilhamento mais rápido e som de vários aplicativos

13 de outubro de 2026.

O app de Windows prepara as prévias antes de abrir a janela de transmitir e mostra os ícones enquanto as imagens carregam. No Windows 11, dá para combinar o som dos aplicativos que você escolher.

### Novidades
- Windows 11: em **Som da transmissão > Escolher aplicativos**, marque até 8 aplicativos para transmitir apenas o som deles juntos.

### Melhorias
- A janela de transmitir abre de imediato, e a lista não precisa esperar todas as miniaturas.
- Prévias preparadas ao entrar na chamada e ao aproximar o mouse ou foco do botão de compartilhar. Os ícones dos aplicativos aparecem enquanto as imagens carregam.
- Prévias recentes são reaproveitadas e atualizadas sem perder a seleção de tela, qualidade ou som.

### Correções
- Fechar ou cancelar a escolha de tela não mostra mais o aviso de compartilhamento não autorizado.
- A seleção automática do som da janela aguarda a identificação do aplicativo.

## v1.4.2 — Janela de transmitir com a qualidade redesenhada

13 de outubro de 2026.

No app de Windows, a escolha de qualidade da transmissão ganhou um seletor no estilo das abas, com ícones e a resolução de cada opção. O overlay em jogos voltou a funcionar no app 1.4.2.

### Melhorias
- Qualidade da transmissão em um seletor único: o destaque desliza até a opção escolhida e as setas do teclado trocam entre elas.
- Qualidade e som da transmissão ficam alinhados, na mesma altura.

### Correções
- App de Windows 1.4.2: some o erro "fromVoiceSite is not defined" e o overlay em jogos volta a funcionar.

## v1.4.1 — Transmissão com o som de um app só (app de Windows)

13 de outubro de 2026.

No app de Windows, dá para transmitir só o som de um app, como o jogo sem o Discord ou a música de fundo. A qualidade da transmissão agora fica na mesma janela em que você escolhe a tela.

### Novidades
- Som de um app só: na janela de transmitir, escolha entre o som do computador inteiro, o som de um app específico ou sem som. Funciona também com apps da Microsoft Store.
- Ao escolher a janela de um app, o som daquele app já vem selecionado, até você trocar.

### Melhorias
- A qualidade da transmissão (resolução e FPS) é escolhida na própria janela de transmitir, sem um passo a mais.

## v1.4.0 — Novos efeitos de voz para a resenha

12 de outubro de 2026.

Os efeitos de voz da call foram refeitos e ganharam novas opções. Escolha na setinha do microfone ou em Configurações > Voz e vídeo e teste com Ouvir minha voz.

### Novidades
- Telefone, Megafone e Banheiro, cada um com seu próprio som.
- Bêbado: a fala alterna entre arrastar e atropelar, com o tom e a articulação balançando.
- Autotune, Voz em acordes e Coral: transforme a fala em notas, acordes ou um grupo de cantores.

### Melhorias
- Robô, Caverna, Alien e Fantasma foram refeitos. Esquilo, Gigante e Rádio continuam com o som conhecido.
- Troca de efeitos com transição suave e proteção de picos. O mudo limpa os sons pendentes; se um efeito falhar, a voz volta ao normal.

### Removidos
- As vozes de personagens por IA foram retiradas do app, junto dos controles e downloads de modelos. Os efeitos padrão continuam disponíveis no navegador e no app.

## v1.3.8 — Overlay de voz nos jogos (app de Windows)

12 de outubro de 2026.

No app de Windows, a lista da call aparece por cima do jogo: quem está na sala, quem está falando e quem está mutado. Ele aparece sozinho quando você abre um jogo durante uma call, e você escolhe onde ele fica na tela.

### Novidades
- Overlay em jogos: com o app de Windows, a lista da call aparece por cima do jogo, com o anel verde em quem está falando e os ícones de mutado e ensurdecido.
- Aparece sozinho quando você está numa call e abre um jogo, e some quando você sai do jogo.
- Reconhece qualquer jogo instalado pela Steam, Epic Games, Xbox/Game Pass, Riot, EA, Ubisoft, GOG e Amazon, inclusive os que acabaram de sair, além de mais de 10 mil jogos conhecidos. Launchers e ferramentas ficam de fora.
- Nova aba Overlay em jogos nas Configurações: ligue o overlay e arraste a lista para onde ela deve ficar na tela. Ela encaixa nos cantos, nas bordas e no centro, e o botão Testar mostra como fica.
- O overlay vem desligado e, quando ligado, começa no meio da tela, à esquerda. O clique passa direto para o jogo.
- Personalize o overlay na mesma aba: escolha quem aparece (todos, sem os mutados ou só quem está falando), esconda os nomes para ficar só com as fotos, deixe as fotos em GIF paradas e ajuste a opacidade. Quem está falando aparece sempre por inteiro.

### Melhorias
- O ícone do app na barra de tarefas do Windows ficou nítido em todos os tamanhos.

## v1.3.5 — Minha conta: troca de senha nas Configurações

11 de outubro de 2026.

As Configurações ganharam a aba Minha conta, onde dá para trocar a senha. Quem não é dono do servidor também deixa de ver um “null” perdido no menu das configurações do servidor.

### Novidades
- Aba Minha conta nas Configurações: mostra seu nome de usuário e quando a conta foi criada, e deixa trocar a senha (pede a senha atual).
- Ao trocar a senha, os outros aparelhos conectados na sua conta saem e precisam entrar com a senha nova. O aparelho em que você trocou continua conectado.

### Melhorias
- Entrar numa call com voz por IA não espera mais o personagem carregar. A voz por IA começa desligada e você liga pelo menu de áudio, já dentro da call.

### Correções
- Quem não é dono do servidor via um “null” no menu das configurações do servidor, embaixo de Banimentos.
- A sala do DJ mostrava um “null” embaixo da fila quando não havia aviso da última música.

## v1.3.0 — Voz de personagem por IA na call

10 de outubro de 2026.

No app de Windows, sua voz pode virar a de um personagem na call: Braum, Kled, Tristana, Veigar, Naruto, Akali, Sett, Reyna e Draven, quase todos com a dublagem brasileira. Cada um já começa no tom certo, e a atualização do app ficou bem mais leve.

### Novidades
- Voz por IA no app de Windows: escolha um personagem em Efeitos de voz (no menu de áudio da call ou nas Configurações) e fale com a voz dele. A conversão roda no seu computador, de preferência na placa de vídeo, e quem ouve não precisa instalar nada.
- Nove personagens: Braum, Kled, Tristana, Veigar, Sett, Akali e Draven (League of Legends), Reyna (Valorant) e Naruto. Quase todos com a dublagem brasileira.
- Tom da voz direto no menu da call, com um anel pontilhado mostrando o tom original de cada personagem.
- “Semelhança com o personagem”: puxa a fala para o jeito dele. Em 0% fica só o timbre.

### Melhorias
- Cada personagem já começa no tom que combina com ele.
- Os personagens são baixados só quando você escolhe um, então a atualização do app ficou muito menor.
- O motor de voz ficou com menos da metade do tamanho, sem mudar o som.

### Correções
- A roleta do Mudae gira com personagens de verdade em desenhos, jogos e quadrinhos, em vez de versos com dado.

## v1.2.5 — App para Android e Resenhex redondo no celular

10 de outubro de 2026.

O Resenhex agora tem app para Android, baixado direto da página do site, com a call funcionando de tela bloqueada. E o celular ficou com cara de app: o botão voltar fecha a janela aberta, abrir um link não tira você da call e o toque longo numa mensagem abre as ações, como no Discord.

### Novidades
- App para Android: na página Baixar, quem abre pelo celular vê o botão “Baixar para Android”. O app fica na tela inicial e abre o Resenhex em tela cheia, já com a sua conta.
- A call continua com a tela bloqueada: o app mostra a notificação “Na call”, com os botões Silenciar e Sair da call, e pede para o Android não pausá-lo durante a chamada.
- Notificações de mensagens e de quem está ligando no Android, com a pessoa de fora do app.
- A página inicial mostra “Baixar para Android” para quem chega pelo celular.

### Melhorias
- O site pode ser instalado como app (ícone novo para a tela inicial), e o app instalado abre direto no Resenhex, sem passar pela página de apresentação.
- Toque longo numa mensagem abre uma folha de ações embaixo: reações rápidas, responder, copiar texto, editar e apagar.
- O botão voltar do celular fecha a gaveta de canais, a lista de membros, o chat da call, os seletores de emoji e GIF, o perfil, as Configurações, as Novidades, os menus e as janelas de confirmação, em vez de sair do app.
- O teclado não sobe mais sozinho ao abrir uma conversa, o chat da call ou os seletores de emoji e GIF. Quando você toca na caixa de texto, a última mensagem continua visível logo acima dela.
- Nos quadros da call, o nome fica embaixo à esquerda, sem encostar no avatar, no ícone de mudo nem no botão de fixar.
- Novidades e Configurações: as abas terminam antes do X e a aba escolhida fica sempre à vista.
- O aviso de "Tela" no celular abre como folha embaixo, sem vazar da gaveta.
- A prévia de vídeo do YouTube preenche o cartão, sem faixas pretas.
- Opções que só fazem sentido no computador (atalhos de teclado, apertar para falar e opções de envio da transmissão) ficam escondidas no celular, e os textos dizem "toque" e "aparelho".

### Correções
- No celular, os botões da call quebravam em duas linhas e deixavam um espaço vazio antes do botão de desligar. Agora ficam numa linha só e se ajustam à largura da tela.
- No app de Android, tocar num link ou num vídeo do YouTube durante a call tirava você da sala.
- Barras de rolagem grossas de computador apareciam no celular, no chat, na gaveta, nos blocos de código e na página inicial.
- A estrelinha da etiqueta de versão aparecia como um quadrado roxo em celulares com o navegador desatualizado.
- O horário da mensagem quebrava em duas linhas em telas estreitas, o X do aviso de notificações caía numa linha sozinho e o divisor de data do chat da call tinha fundo de outra cor.
- A prévia do perfil mostrava um horário fixo em vez do horário atual.

## v1.2.4 — Voz não some com a janela minimizada ou o celular bloqueado

10 de outubro de 2026.

### Correções
- Com a janela do navegador minimizada, a aba em segundo plano ou o navegador atrás de um jogo em tela cheia, o corte de ruído deixava o microfone fechado e ninguém ouvia você. Agora a voz continua chegando.
- App de Android 1.3.0: a call não fica mais muda com o celular bloqueado na mesa, e o pedido para rodar em segundo plano aparece até ser liberado, com o passo extra de cada marca de celular.

## v1.2.1 — Teste de voz, menu de áudio e ajustes no chat da call

9 de outubro de 2026. Ouça os efeitos na sua própria voz direto na call, com um menu de áudio mais organizado e o campo de mensagem sem cortes.

### Novo
- “Ouvir minha voz” no menu do microfone da call, com retorno no fone. Durante o teste, seu microfone fica mudo para as outras pessoas; fechar o menu ou sair da chamada encerra a escuta.

### Melhorado
- Microfone e saída de áudio em seletores compactos, volume da chamada acessível e efeitos de voz numa seção expansível.
- “FX” pequeno e cinza no canto superior direito do bloco da pessoa na call; passe o mouse para ver qual efeito está ativo.

### Corrigido
- Campo de mensagem do chat da call cortando nomes de salas ou mensagens com mais de uma linha. A altura agora acompanha o conteúdo e a largura disponível.
- Escuta dos efeitos acompanha a troca de efeito, microfone e saída de áudio, com liberação da captura ao terminar.

## v1.2.0 — Modificador de voz, chat nas salas de voz e status

9 de outubro de 2026. Mude sua voz na call, converse no chat da própria sala de voz e mostre se está ausente ou ocupado.

### Novo
- Modificador de voz com Esquilo, Gigante, Robô, Rádio, Caverna e Alien, nas Configurações e na setinha do microfone; selo com o emoji do efeito para os outros.
- Chat nas salas de voz, ao lado do palco da call ou pela lista de canais, com aviso de mensagem nova.
- Troca de microfone, saída de áudio e câmera durante a call, mais o volume da chamada.
- Status Ausente, Não perturbe e Invisível, com frase de status.
- Seletor de emojis com busca, categorias e mais usados; até 50 emojis próprios por servidor.
- Prévia de links no chat (YouTube incluído).
- Prévia da câmera antes de ligar.
- Atalhos no palco quando você está sozinho na sala.

### Melhorado
- Mosaico de imagens e visualizador com zoom, navegação e download.
- Selos de microfone, fone e AO VIVO nos blocos da call, barras de fala e “(você)”.
- Efeitos sonoros da call com gravações reais.

### Corrigido
- Menu de status aberto pelo perfil na lista de membros aparecia solto no pé da tela.

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
