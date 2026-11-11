// Histórico de versões do Resenhex. É a fonte da janela "Novidades" dentro do app;
// o CHANGELOG.md na pasta do projeto é a mesma lista, para quem lê pelo GitHub.
// Para uma versão nova: adicione um item no começo da lista e atualize a versão no package.json.
// O título deve destacar as principais funcionalidades ou correções, com termos objetivos.
window.CHANGELOG = [
  {
    version: '2.6.0', date: '2026-11-11', name: 'Cristal errante, Forja de medalhas e superpoderes no Salão do Mudae',
    summary: 'O Salão do Mudae ganhou três coisas novas. De tempos em tempos, um cristal de kakera passa voando pela tela, e todo mundo que clicar a tempo ganha, não só o primeiro. Com o kakera, você forja medalhas na aba nova Forja: são 7, cada uma com 4 níveis, uma vantagem pequena no jogo e um acabamento sorteado que pode sair até galáxia. E, ao lado da carta, ficam 3 espaços para superpoderes, como o Cadeado, que tranca o seu roll, e o Laço, que casa com o roll de outra pessoa. Os poderes abrem aos poucos, conforme você joga. O divórcio continua devolvendo kakera, mas agora com um teto de 500 por dia.',
    sections: [
      { kind: 'new', items: [
        'Cristal errante: com alguém no Salão, um cristal aparece aos poucos, atravessa a tela e some depois de uns 10 segundos. Em média sai um a cada 5 a 15 minutos, no mesmo ritmo em servidor pequeno ou grande. Todo mundo no Salão vê o mesmo cristal ao mesmo tempo, e cada pessoa pode pegar uma vez.',
        'A cor do cristal é sorteada, e as mais raras valem mais: roxo, azul, ciano, verde, amarelo, laranja e vermelho, de 75 a 560 de kakera.',
        'Às vezes vem uma chuva de cristais: por uns 7 segundos caem muitos cristais pequenos, e cada clique vale um pouco. Outras vezes vem uma corrente: pegar um cristal faz aparecer outro, em outro lugar e valendo mais, até 5 seguidos, enquanto pelo menos uma pessoa pegar o anterior.',
        'Quando um roll cai num personagem que já tem dono, o cristal sai de dentro da carta e funciona igual aos outros: todo mundo que clicar a tempo ganha. Ele substitui o cristal antigo, em que só o primeiro levava. Cada pessoa que roda faz nascer no máximo um desses a cada 30 minutos.',
        'Quando o cristal some, o chat junta tudo numa linha só ("Ana, Caio e mais 3 pegaram o cristal laranja"). Essas linhas aparecem só para quem está no Salão e não ficam salvas, para não empurrar a conversa para fora do histórico.',
        'No modo simplificado, o cristal chega como uma mensagem do bot com o botão "Pegar" (na chuva, cada clique pega uma gota). Com "Reduzir animações", ele aparece parado, com um brilho suave, e continua dando para clicar.',
        'Forja: uma aba nova no Salão, com as 7 medalhas penduradas na parede: Bronze, Prata, Ouro, Safira, Rubi, Esmeralda e Diamante. Clicando numa, você vê o que ela dá, o próximo nível e o preço; as que você ainda não consegue pagar mostram quanto falta.',
        'Cada nível custa o preço da medalha vezes o nível: a Bronze sai por 500, 1.000, 1.500 e 2.000 de kakera, e a Diamante por 3.000, 6.000, 9.000 e 12.000. Para forjar o nível II é preciso ter o I, e assim por diante. Entre medalhas diferentes não tem ordem.',
        'O que cada medalha dá, do nível I ao IV: Bronze, de 1 a 4 vagas a mais na lista de desejos. Prata, os rolls que sobraram passam para a meia hora seguinte (até 1 a 4). Ouro, de 10% a 30% a mais nos cristais que você pega, e no IV o $dk vem em dobro. Safira, de 1 a 4 rolls a mais a cada meia hora. Rubi, de 0,5% a 2% de chance de o roll trazer um desejo seu. Esmeralda, um casamento de reserva para quando o seu já foi gasto, a cada 24, 18, 12 ou 6 horas. Diamante, os poderes recarregam mais rápido (20, 17, 14 ou 12 horas).',
        'Forjar é uma cena: os cristais voam para a forma, o martelo bate com faíscas e a medalha sai em brasa e vai esfriando. Cada nível deixa a medalha mais enfeitada: o II ganha fita, o III ganha louros e o IV ganha coroa e brilho.',
        'Ao esfriar, a medalha mostra o acabamento sorteado: metal (comum), esmalte (raro), holográfico (épico) ou galáxia (lendário). A cada nível novo a forja sorteia de novo, e você escolhe se fica com o acabamento antigo ou com o novo, então ninguém perde uma galáxia por subir de nível. Para sortear o acabamento de novo quando quiser, é só reforjar por 500 de kakera.',
        'Quando alguém leva uma medalha ao nível IV, a forja acende na tela de todo mundo no Salão, com uma faixa, e o chat ganha uma linha.',
        'No detalhe de cada medalha, "Mostrar no perfil" escolhe quais aparecem no seu cartão de perfil, com o nível e o acabamento.',
        'Superpoderes: 3 espaços no palco, à direita da carta (no celular, numa fileira embaixo dela). Os 8 poderes abrem aos poucos, conforme você joga, e depois de aberto o poder é seu para sempre.',
        'Vidência (abre ao forjar a 1ª medalha): mostra a raridade dos seus 3 próximos rolls, só para você. Cadeado (ao casar com 20 personagens): nos 45 segundos do seu roll, ninguém mais casa com ele. Amuleto (ao casar com o seu 1º lendário): o próximo roll tem bem mais chance de sair épico ou lendário, mas não é garantido. Chuva de cristais (ao pegar 40 cristais): chama uma chuva para todo mundo no Salão (cada gota dela vale menos que a de uma chuva que aparece sozinha).',
        'Chamar desejo (ao levar a Bronze ao nível II): o próximo roll tem 40% de chance de ser um desejo seu. Eco (ao casar com 60 personagens): traz de volta um personagem que passou sem dono nos últimos minutos, como se fosse um roll seu. Escolha dupla (ao rodar 500 vezes): o próximo roll abre duas cartas; você casa com uma e a outra fica livre para quem casar primeiro. Laço (ao ter as 7 medalhas no nível II): casa na hora com o roll de outra pessoa, sem esperar os 3 segundos dela, gastando o seu casamento. Se o roll estiver com Cadeado, o Laço bate no cadeado e não pega.',
        'Cada poder recarrega uma vez a cada 24 horas (menos com a Diamante), e um anel em volta dele mostra quanto falta. Com mais de 3 poderes, você escolhe quais leva no palco. Dá para trocar quando quiser, mas o poder que entra chega vazio e enche no tempo de uma recarga.',
        'Ganhar um poder é um momento: ele voa para um espaço com uma faixa, e o Salão fica sabendo. Usar também é público (o cadeado na carta, a corda do Laço, a estrela do desejo), menos a Vidência, que só você vê. Os poderes que ainda faltam, e quanto falta para cada um, ficam na Forja, embaixo da parede de medalhas.',
        'Quem já jogava não começa do zero: cada casamento que já está no seu harém conta para os poderes, e quem já tem um lendário já conta como "casou com o 1º lendário". Cristais pegos e número de rolls começam a contar agora.',
        'Tudo também tem comando, com botões na resposta do bot: $forja, $forjar bronze, $poderes e $poder cadeado.',
      ] },
      { kind: 'improved', items: [
        'O divórcio agora tem teto: ele continua devolvendo o valor do personagem em kakera, mas no máximo 200 a cada 24 horas. Passando disso, dá para divorciar normalmente, só não volta kakera, e a mensagem do bot avisa quando volta. O motivo: com medalhas para comprar, casar e divorciar sem parar virava uma fábrica de kakera, e quem tem um harém grande compraria a Forja inteira no primeiro dia. O kakera que você já tem continua valendo.',
        'Os cristais rendem o valor inteiro nos 15 primeiros que você pega no dia (o dia vira à meia-noite de Brasília). Depois disso eles continuam aparecendo e dando para quebrar, mas rendem bem pouco (2%). Uma chuva conta como dois cristais. Assim, quem deixa o Salão aberto o dia todo não passa muito na frente de quem joga um pouco.',
        'Se o Chamar desejo cai num comando em que o seu desejo não cabe (um desejo homem num $h, por exemplo), o poder não se perde: ele fica valendo para o próximo roll em que o desejo couber.',
        'Escrever $w, $dk ou outro comando inteiro e apertar Enter agora envia direto; antes, o Enter só completava o comando na lista de sugestões.',
        'Na call, a chave "Espelhar minha câmera" (em Voz e vídeo e na prévia antes de ligar) escolhe se você se vê como num espelho. Isso muda só a sua tela: quem assiste sempre vê do jeito certo.',
      ] },
    ],
  },
  {
    version: '2.5.0', date: '2026-11-08', name: 'Tela do celular na call, enquetes e mensagem direta para o dev',
    summary: 'Quem está no app do Android agora transmite a tela do celular na call, como no Discord: um jogo, um vídeo ou qualquer app, com o som dele e sem as vozes da call. Na chamada também dá para fazer enquetes: elas nascem no chat da sala e aparecem por cima da call, para todo mundo votar com um toque, e cada opção mostra a foto de quem votou. No Propor Melhorias, a sua ideia pode ir por e-mail ou como mensagem direta para o dev, com uma bolinha que mostra se ele está online. E o cartão flutuante da call no celular ficou igual à janelinha do Android, com setas para trocar de transmissão. A tela do celular precisa do app do Android 1.4.0; as setas na janelinha, do 1.4.1.',
    sections: [
      { kind: 'new', items: [
        'App do Android 1.4.0: o botão Compartilhar tela da call agora funciona no celular. O Android pergunta o que transmitir (a tela inteira ou, no Android 14 ou mais novo, um app só) e a transmissão começa.',
        'O som do celular vai junto: música, vídeos e jogos (Android 10 ou mais novo). As vozes da call nunca entram na transmissão, então ninguém se ouve com eco.',
        'Dois perfis próprios do celular: Padrão (720p, leve para a bateria e para a internet) e Nitidez (1080p). Dá para trocar com a transmissão rodando.',
        'Girar o celular gira a transmissão: deitado para jogos, em pé para apps, sem faixas pretas.',
        'Transmitindo um app só, se ele sai da tela a transmissão pausa e você vê o aviso; quando ele volta, a transmissão volta sozinha.',
        'Para parar: o botão Parar transmissão na tela da call ou o Parar na notificação do Android. A call continua.',
        'Enquetes na chamada: no chat de uma sala de voz, o + agora tem "Criar enquete". Escreva a pergunta, de 2 a 6 opções e a duração (1 min, 5 min ou até alguém encerrar).',
        'Enquanto a enquete está aberta, ela aparece num cartão no alto da chamada: um toque já vota, sem abrir o chat. Dá para encolher o cartão numa pílula com a pergunta e o tempo.',
        'Cada opção mostra a porcentagem e a foto de quem votou nela. Dá para trocar o voto enquanto ela está aberta, e tocar de novo na mesma opção tira o voto.',
        'Quando acaba, toca um somzinho, o cartão mostra a vencedora por alguns segundos e a mensagem no chat guarda o resultado. Quem criou (ou quem gerencia mensagens) pode encerrar antes.',
        'No celular, com a enquete aberta, o cartão flutuante da call mostra "Enquete: toque para votar"; o toque abre a chamada.',
        'No Propor Melhorias, a opção "Mensagem pro dev" manda a sua ideia direto para o dev, sem precisar ser amigo dele. O e-mail continua sendo o jeito padrão.',
        'A bolinha mostra se o dev está online agora (verde) ou não (cinza), ao lado da opção e no botão Propor Melhorias, embaixo da lista de membros. Ela muda sozinha e não mostra mais nada além disso.',
        'Depois de enviar, nada aparece nas suas mensagens. Se o dev responder, a conversa surge na sua lista e vocês conversam por ali, como numa conversa privada qualquer.',
        'No celular, o cartão da call que flutua dentro do Resenhex ficou com a cara da janelinha do Android: a transmissão ocupa o cartão inteiro e, sem transmissão, quem está falando aparece grande no meio. Um toque mostra os botões (voltar à call, esconder, microfone, fone e desligar), que somem sozinhos depois de 3 segundos.',
        'Com mais de uma transmissão na call, as setas ‹ › do cartão trocam qual delas aparece ali, mesmo que você ainda não esteja assistindo nenhuma. Quando você troca, a tela que as setas tinham aberto para de chegar, para não gastar a internet à toa.',
        'App do Android 1.4.1: as mesmas setas na janelinha do Android, quando você sai do app com mais de uma transmissão na call.',
      ] },
      { kind: 'improved', items: [
        'Se o celular não der conta (jogo pesado, pouca memória), a transmissão passa a mandar menos quadros por segundo em vez de atrasar, e volta aos 30 quadros sozinha quando o aperto passa.',
        'Enquanto você transmite a tela, a janelinha da call não abre ao sair do app (ela apareceria dentro da própria transmissão). Ela volta assim que a transmissão termina.',
        'Quem ainda está com o app antigo vê, no botão de compartilhar tela, como atualizar.',
        'O link de convite agora é sempre resenhex.com.br, também nos apps de Windows e Android, que ainda abriam pelo endereço antigo (resenhex.duckdns.org). Links antigos que alguém colar continuam funcionando.',
      ] },
      { kind: 'fixed', items: [
        'Em celulares com o navegador do sistema (WebView) desatualizado, como um Android 12 sem as atualizações da Play Store, o app ficava parado em "Entrando na resenha…". Agora ele abre normalmente, com as cores e o layout da call no lugar.',
      ] },
    ],
  },
  {
    version: '2.4.5', date: '2026-11-07', name: 'Mudae com troca de cartas e lista de desejos, e a janelinha da call com quem fala em destaque',
    summary: 'O Mudae ganhou os comandos que faltavam: trocar cartas e kakera com outra pessoa (só acontece quando os dois confirmam), o ranking dos personagens com filtro por obra, waifus e husbandos, a lista de desejos com aviso quando o personagem sair e o kakera de verdade, com $dk, $daily e o cristal dos personagens que já têm dono. A janelinha da call no Android e o cartão flutuante no celular ficaram mais parecidos com os do Discord: quem está falando aparece grande, a transmissão ocupa a janelinha no formato certo e, quando a conexão cai, os dois avisam que estão reconectando em vez de ficar vazios. O formato da tela e a opção de desligar a janelinha precisam do app do Android 1.3.4.',
    sections: [
      { kind: 'new', items: [
        'Troca de cartas: $trade @pessoa, ou o botão "Propor troca" no harem de alguém, abre uma janela com as ofertas dos dois. Cada um escolhe personagens do seu harem e, se quiser, kakera. A troca só acontece quando os dois confirmam, e se alguém muda a oferta as confirmações são desfeitas. Ninguém consegue oferecer uma carta que não é sua, e a troca fica aberta por 5 minutos.',
        'Aba Personagens no Salão e $top: o ranking dos personagens mais valiosos do catálogo, com o dono de cada um. Dá para filtrar por obra ($top Naruto), por waifus, husbandos, anime, jogos, quadrinhos, desenhos e séries, e ver quantos daquela obra você já tem. $obra Nome mostra todos os personagens de uma obra e $topserv mostra quem tem o harem mais valioso do servidor.',
        'Lista de desejos: $wish Nome, ou a estrela nas cartas, guarda até 10 personagens. Quando um deles sai no roll de outra pessoa, você recebe um aviso na hora. $wl mostra a lista e $wr Nome tira um. No seu harem aparece quem deseja cada carta, com um atalho para propor troca.',
        'Presentes: $give @pessoa Nome dá um personagem e $givek @pessoa 100 manda kakera. Os dois pedem confirmação antes.',
        'Kakera: $dk dá 250 kakera a cada 20 horas, $daily enche os rolls de novo uma vez por dia e $rolls compra os rolls de volta por 500 kakera (até 3 vezes por dia). Quando sai um personagem que já tem dono, aparece um cristal de kakera para pegar, com a vez primeiro de quem rodou. $k mostra o seu saldo.',
        'Na janelinha do Android, quem está falando aparece grande no meio, com o círculo verde e o nome, e os outros ficam pequenos embaixo. Numa call privada que ainda está tocando, aparece o seu amigo com "Chamando…".',
        'Um selo vermelho no canto da janelinha avisa quando o seu microfone ou o seu fone está desligado.',
        'App do Android 1.3.4: a janelinha segue o formato da transmissão que você está assistindo (larga, quadrada ou em pé, de celular), sem faixas pretas.',
        'App do Android 1.3.4: nova opção em Configurações > Voz e vídeo > Janelinha da call para não abrir a janelinha ao sair do app. A call continua do mesmo jeito, com o aviso na barra do Android.',
        'Para esconder o cartão flutuante sem sair da call, arraste-o até o X que aparece embaixo. Ele volta na próxima vez que você abrir a tela da chamada.',
        'O cartão pode ser arremessado: solte com um movimento rápido e ele vai para o canto para onde você jogou.',
      ] },
      { kind: 'improved', items: [
        '$im Nome mostra a história do personagem: de quem ele é, desde quando e como chegou (casamento, troca ou presente), e quem deseja ele.',
        '$mma, $mms e $mmr mostram o harem de A a Z, separado por obra ou pelos casamentos mais recentes. $fm Nome escolhe o favorito, que vira a foto de capa do harem.',
        '$tu mostra tudo de uma vez: rolls, casamento, $daily, $dk, kakera e as compras de rolls que sobram.',
        'Divorciar um personagem devolve o valor dele em kakera.',
        'O cartão mostra embaixo das fotos quem está falando ("Angel está falando") ou quantas pessoas estão na call.',
        'Fotos de quem está com o microfone ou o fone desligado ganham um ícone no canto, no cartão e na janelinha. Se foi o servidor que desligou, o ícone fica vermelho.',
        'Com uma transmissão no cartão ou na janelinha, a foto de quem está falando aparece no canto da imagem.',
        'Tocar no cartão abre a tela da chamada com uma animação: o cartão cresce até ocupar a tela.',
        'Numa call privada tocando, o cartão mostra a foto do amigo apagada ao lado da sua até ele atender.',
      ] },
      { kind: 'fixed', items: [
        'Quando a conexão caía durante a call, o cartão sumia e a janelinha do Android ficava vazia. Agora os dois mostram "Reconectando…" e voltam ao normal sozinhos quando a conexão volta.',
      ] },
    ],
  },
  {
    version: '2.4.0', date: '2026-11-07', name: 'Clipar com a tela de quem está transmitindo e a call flutuante no celular',
    summary: 'Agora o clipe mostra a transmissão: se você está assistindo à tela de alguém (ou transmitindo a sua), os últimos 30 segundos dela entram no clipe junto com o som da chamada. No celular, a call fica num cartão flutuante e, no app do Android, vira uma janelinha por cima dos outros apps. E o Propor Melhorias voltou a entregar as sugestões.',
    sections: [
      { kind: 'new', items: [
        'Clipar com a tela: o clipe mostra a tela que você está assistindo, grande, com as fotos de quem está na chamada embaixo e o círculo verde em quem fala. Se você mesmo está transmitindo, entra a sua tela. Com duas transmissões, entra a que estiver fixada. Sem transmissão, o clipe fica como antes.',
        'A prévia da janela Clipar já mostra a tela, e a linha "No clipe" avisa de quem é a tela que vai junto.',
        'No celular, a call ganhou um cartão flutuante, como no Discord: fora da tela da chamada (num canal de texto, nas mensagens diretas), ele mostra a sala, o tempo e quem está nela, com os botões de microfone, fone e desligar. Se você está assistindo a uma transmissão, ela aparece ao vivo no cartão, em miniatura. Dá para arrastar o cartão até qualquer canto, e um toque nele volta para a chamada.',
        'App do Android 1.3.3: durante a call, Home, Voltar ou o gesto de ir para a tela inicial transformam o Resenhex numa janelinha por cima dos outros apps, como no Discord. Ela mostra ao vivo a transmissão que você está assistindo ou, sem transmissão, a sala, o tempo e as fotos de quem está nela.',
        'Toque na janelinha para ver os botões de microfone, fone e desligar. O botão do meio abre o Resenhex de novo na call, e dá para arrastar a janelinha para qualquer canto ou fechar no X (a call continua).',
      ] },
      { kind: 'improved', items: [
        'A opção "Pode clipar meu áudio" virou "Pode clipar meu áudio e minha tela". Desligada, nem a sua voz nem a sua transmissão entram nos clipes dos outros.',
        'Funciona no app do Windows e no navegador do computador. A tela fica guardada só no seu aparelho, comprimida pela placa de vídeo, e só sai dele quando você solta o clipe.',
      ] },
      { kind: 'fixed', items: [
        'O Propor Melhorias dizia "Não foi possível enviar agora" e a sugestão não chegava. O serviço de fora que entregava as sugestões parou de aceitar depois que o site mudou de endereço. Agora elas vão pelo mesmo e-mail que manda o "Esqueci a senha", e, se a sua conta tem e-mail confirmado, dá para receber a resposta direto nele.',
        'O cartão flutuante da call no celular não troca mais de formato quando a imagem da transmissão para por um instante, e o vídeo não mostra mais um botão de play cinza enquanto muda de tamanho.',
      ] },
    ],
  },
  {
    version: '2.3.5', date: '2026-10-31', name: 'Mudae 2.0 e o círculo verde de quem fala mostrando o que os outros ouvem',
    summary: 'O Mudae ficou só com personagens: a roleta deixou de sortear cerca de 100 mil lugares, itens, tipos de inimigo e figurantes, e continuam mais de 130 mil personagens de anime, jogos, quadrinhos, desenhos e séries. E o círculo verde da chamada agora acende sempre que os outros estão ouvindo você, até com um som baixinho.',
    sections: [
      { kind: 'improved', items: [
        'Mudae 2.0: de cada 100 rolls, uns 43 caíam em algo que não é personagem: lugares (como os santuários de Zelda), itens, músicas, revistas, tipos de inimigo, figurantes de série que aparecem em um episódio só ("Thug", "Cop 2") e páginas com a foto de "imagem indisponível". Agora a roleta não sorteia mais esses. Ficam 132.769 personagens.',
        'Ninguém perde nada: quem já casou com um dos que saíram continua com ele no harém, no álbum e no ranking, com o mesmo valor. Como sobraram menos comuns, cada roll tem um pouco mais de chance de vir raro, épico ou lendário (o lendário passa de 1 a cada 150 rolls para 1 a cada 86).',
      ] },
      { kind: 'fixed', items: [
        'O círculo verde de quem fala só acendia com voz em volume normal. Sons mais baixos, como um barbeador ligado, a fala baixa ou a respiração perto do microfone, chegavam aos outros sem o verde acender. Agora ele acende sempre que chega um som que dá para ouvir, e todo mundo vê o mesmo verde: na sua tela, na dos amigos e no overlay dos jogos. Se o seu acender sem você falar, é porque os outros estão ouvindo algum barulho seu.',
      ] },
    ],
  },
  {
    version: '2.3.0', date: '2026-10-30', name: 'Transmissão mais fluida com jogo pesado e um visual mais leve e vivo',
    summary: 'Com um jogo pesando a placa de vídeo, a transmissão pelo app do Windows fica com cerca do dobro de quadros por segundo. E o Resenhex ganhou movimento nos momentos certos, gasta bem menos durante a chamada e ficou mais fácil de ler. A transmissão mais fluida precisa do app do Windows 1.4.7, que se atualiza sozinho.',
    sections: [
      { kind: 'new', items: [
        'Momentos: a sua mensagem sobe da caixa ao ser enviada, a reação cai no lugar, uma menção a você dá um cutucão, o amigo que fica online acende, quem entra na chamada chega com uma animação e aparecem os três pontinhos quando alguém está digitando.',
        'Ao abrir, o Resenhex mostra o logo enquanto conecta. Se demorar mais de 10 segundos, um aviso sugere conferir a internet.',
        'O começo de um canal novo mostra a marca do Resenhex e convida a mandar a primeira mensagem.',
      ] },
      { kind: 'improved', items: [
        'Transmissão com jogo pesado (app do Windows 1.4.7): quando o jogo ocupa toda a placa de vídeo, a transmissão caía para 20 a 30 fps, porque a captura esperava a placa terminar cada quadro. Agora ela não espera mais. Nos testes, com um jogo médio a transmissão subiu de 19 para 39 fps e com um pesado de 12 para 22 fps, com o mesmo atraso. Sem jogo pesado, nada muda. Para desligar, use "Captura sem esperar a placa (teste)" no ícone do Resenhex na bandeja.',
        'Chamada mais leve: com a chamada na tela, o Resenhex redesenhava tudo 60 vezes por segundo, mesmo sem ninguém mexer. Agora são 6, e o uso da placa de vídeo pela página caiu para um décimo. Com a janela minimizada ou em segundo plano, as animações param.',
        'Botões, menus e janelas se mexem com efeito de mola, e uns 25 ícones fazem um gesto quando o mouse passa por cima, como responder, reagir, editar e a lixeira que abre a tampa.',
        'Mais fácil de ler: hora das mensagens, membros offline e o botão Adicionar amigo com mais contraste, textos pequenos um pouco maiores e um destaque claro e único em volta do que está selecionado pelo teclado. No celular, as setinhas dos dispositivos na chamada ficaram maiores.',
      ] },
      { kind: 'fixed', items: [
        'Quando a conexão voltava, o aviso aparecia duas vezes. Agora aparece "Conectado de novo", uma vez só.',
        'A roleta do Mudae agora respeita a opção Reduzir animações das Configurações.',
      ] },
    ],
  },
  {
    version: '2.2.0', date: '2026-10-30', name: 'Jogando agora, mensagem de áudio e Sobre mim no perfil',
    summary: 'O Resenhex mostra o jogo que a galera está jogando, o chat ganhou mensagem de áudio e o perfil ganhou um Sobre mim. O Jogando agora precisa do app do Windows 1.4.6, que se atualiza sozinho.',
    sections: [
      { kind: 'new', items: [
        'Jogando agora: com o app do Windows aberto, o Resenhex reconhece o jogo na sua tela e mostra "Jogando" no seu perfil, na lista de membros, nos amigos e nas conversas privadas. Some quando você fecha o jogo ou fica invisível, e dá para desligar em Configurações > Jogos.',
        'Mensagem de áudio: toque no microfone ao lado do campo de mensagem, fale e mande. São até 5 minutos, com a onda do áudio no chat, velocidade de 1,5x ou 2x e clique em qualquer ponto da onda para pular até ali.',
        'Sobre mim: conte um pouco sobre você no perfil, com até 190 caracteres, links e emojis. Aparece no cartão do seu perfil para todo mundo.',
        'Quem cria a conta agora ganha uma boas-vindas com os primeiros passos: montar a turma, deixar o perfil com a sua cara e baixar o app.',
      ] },
      { kind: 'improved', items: [
        'A aba Overlay em jogos das Configurações virou Jogos, com o Jogando agora e o overlay no mesmo lugar.',
      ] },
      { kind: 'fixed', items: [
        'App do Windows: com um jogo aberto como administrador na frente (vários jogos rodam assim), Ctrl+Shift+M e Ctrl+Shift+D não faziam nada, porque o Windows esconde do Resenhex as teclas desse jogo. Agora o app percebe esse jogo e, enquanto ele estiver na frente, pede os atalhos direto ao Windows. Segurar a tecla muta uma vez só.',
      ] },
    ],
  },
  {
    version: '2.0.0', date: '2026-10-25', name: 'Resenhex 2.0: chamem seus amigos',
    celebrate: true,
    summary: 'Um recado do dev: refiz o Resenhex por dentro, e agora ele aguenta milhares de pessoas online ao mesmo tempo. Então o pedido é um só: chamem seus amigos. O time do jogo, a turma da faculdade, aquele grupo que ainda vive no Discord. Manda o convite no grupo e traz todo mundo pra call. O Resenhex está pronto.',
    sections: [
      { kind: 'new', items: [
        'Mandou o convite no WhatsApp ou no Discord? Agora ele aparece com imagem, o nome do servidor e quantos membros ele tem. O link do Resenhex também ganhou prévia.',
      ] },
      { kind: 'improved', items: [
        'Chamadas no horário cheio: o retransmissor, que conecta quem está numa rede restrita, tinha só 41 vagas e lotava à noite. Agora são milhares.',
        'Rede de escola ou de empresa que bloqueia parte da conexão: a chamada tenta outro caminho depois de 8 s, em vez de esperar até 30 s.',
        'O site abre mais rápido a partir da segunda visita, e a prévia da transmissão gasta menos internet.',
        'Por segurança, quem ficar 90 dias sem usar o Resenhex precisa entrar de novo com a senha.',
      ] },
      { kind: 'fixed', items: [
        'Duas pessoas que dependem do retransmissor não conseguiam se ouvir na mesma chamada. Agora conectam.',
      ] },
      { kind: 'inside', items: [
        'Antes, o Resenhex começava a travar com 200 a 300 pessoas online. Num simulador com 50 mil contas, agora 5 mil pessoas online passam com folga, na mesma máquina gratuita de sempre.',
        'Banco de dados novo (SQLite): antes, cada mudança regravava todos os dados do site num arquivo só. Agora só o pedaço que mudou é gravado, em menos de 3 milissegundos.',
        'Avisos sob medida: mutar, entrar numa sala ou mudar o status mandava o servidor inteiro para todo mundo. Agora vai um aviso pequeno, só para quem precisa. Num servidor com 500 pessoas online, cada aviso caiu de 177 KB para menos de 1 KB.',
        'Índices: o servidor não percorre mais todas as contas e conexões a cada ação. Ele vai direto em quem importa.',
        'Fotos, banners e emojis são processados em paralelo, sem segurar o resto do site.',
        'Retransmissor com senha temporária para cada pessoa, limite por conta e um teto de internet por mês, para o Resenhex continuar de graça.',
        'Atualizações sem derrubar todo mundo de uma vez: os apps voltam aos poucos, em até 30 segundos. E o site ganhou proteção contra abuso e alarmes que avisam o dev quando algo vai mal.',
      ] },
    ],
  },
  {
    version: '1.9.0', date: '2026-10-24', name: 'Ouvir a transmissão ensurdecido, voltar à chamada pelo painel e menus na tela cheia',
    summary: 'Ensurdecido, dá para ligar só o som da transmissão que você está assistindo. O nome da sala no painel Voz conectada leva de volta para a chamada, como no Discord. E, com a transmissão em tela cheia, o menu de qualidade volta a aceitar clique.',
    sections: [
      { kind: 'new', items: [
        'Ensurdecer continua calando tudo, mas o alto-falante da transmissão liga o som dela de novo: você ouve só a transmissão, com as vozes ainda caladas. Ao desligar a surdez, tudo volta ao normal. Na primeira vez, um aviso mostra onde fica o botão.',
      ] },
      { kind: 'improved', items: [
        'Painel Voz conectada: o nome da sala e do servidor virou link. Um clique leva de volta para a chamada de qualquer canal, servidor ou conversa, também no celular.',
      ] },
      { kind: 'fixed', items: [
        'Transmissão em tela cheia: dá para escolher a qualidade para assistir (e usar os outros menus, como o do clique direito). Antes o menu aparecia, mas o clique passava para a transmissão e só mexia no zoom.',
      ] },
    ],
  },
  {
    version: '1.8.8', date: '2026-10-18', name: 'Animações mais suaves e páginas do site com as cores do app',
    summary: 'Menus, janelas e telas entram e saem com o mesmo movimento suave. A página inicial, a de baixar e a de privacidade ganharam o preto com roxo do app, e baixar para Windows agora oferece o .exe ou a Microsoft Store.',
    sections: [
      { kind: 'new', items: [
        'Baixar para Windows: dois botões, o instalador .exe e a Microsoft Store. Antes do .exe, uma janela mostra o aviso que o Windows vai dar e sugere a Store para quem preferir instalar sem ele.',
      ] },
      { kind: 'improved', items: [
        'Página inicial, Baixar e Privacidade com as cores do app e da tela de entrar: fundo preto e o roxo do logo nos botões, nos destaques dos títulos e atrás da prévia do app.',
        'Menus, cartões de perfil, seletor de emoji, dicas e avisos agora também saem com animação, em vez de sumir de uma vez.',
        'Janelas de confirmação, criar canal, configurações e Novidades: o fundo escurece e o cartão sobe de leve ao abrir, e encolhe ao fechar.',
        'Trocar de canal faz a conversa entrar subindo de leve; num canal que ainda não foi aberto, ela espera as mensagens chegarem para não piscar vazia.',
        'Celular: as gavetas de canais e de membros deslizam ao abrir e ao fechar, e a folha de ações da mensagem desce ao sair.',
        'O volume de uma transmissão abre ao lado do botão sem empurrar os outros, e os interruptores, a pílula dos servidores e as barras de quem fala ficaram mais leves para o navegador.',
        '"Reduzir animações" (em Acessibilidade) e a mesma opção do sistema continuam desligando todo o movimento.',
      ] },
      { kind: 'fixed', items: [
        'Celular: o volume de cada transmissão fica sempre à mostra ao lado do botão de som, para abaixar uma transmissão sem abaixar as vozes junto.',
        'Tela cheia: o menu "Qualidade para assistir", os outros menus e as dicas dos botões aparecem por cima da transmissão. Antes eles abriam escondidos atrás dela.',
      ] },
    ],
  },
  {
    version: '1.8.5', date: '2026-10-18', name: 'Recorte de efeito sonoro e celular revisado',
    summary: 'Crie um efeito sonoro a partir de qualquer áudio ou vídeo e escolha o trecho na onda, como no Discord. No celular, a barra da chamada, os menus e várias telas foram acertados.',
    sections: [
      { kind: 'new', items: [
        'Adicionar efeito sonoro aceita áudio ou vídeo (MP3, WAV, OGG, M4A, MP4, WEBM, até 50 MB e 5 minutos). Escolha até 8 segundos arrastando as bordas na onda, arraste o trecho inteiro ou toque fora dele para começar ali. O play toca só o trecho, do jeito que vai soar na chamada.',
        'Arquivos com mais de 20 segundos ganham uma faixa com o arquivo inteiro embaixo da onda, para ir direto até a parte certa.',
      ] },
      { kind: 'improved', items: [
        'Celular: a barra da chamada cabe inteira com todos os botões, mesmo em telas estreitas, e os botões de quem está sozinho na sala ficam um embaixo do outro.',
        'Celular: os efeitos sonoros abrem numa folha que sobe de baixo, com o fundo escurecido. O cartão de perfil também escurece o fundo, e tocar fora só fecha, sem acionar o que estava atrás.',
        'Celular: os menus não passam mais da borda da tela, e os itens ficaram mais altos, fáceis de tocar.',
        'Celular: o topo do cartão de entrar ou criar conta sempre fica alcançável, o teclado não abre sozinho no login nem no DJ, e as dicas de passar o mouse não aparecem no toque.',
        'Celular: avisos mais largos e acima da caixa de mensagem, abas de Amigos em grade, a fileira de baixo das Configurações quebra linha em vez de rolar de lado e as legendas dos clipes não cortam mais o texto.',
      ] },
    ],
  },
  {
    version: '1.8.0', date: '2026-10-17', name: 'Clipar',
    summary: 'Pegue os últimos 30 segundos da chamada e solte um vídeo para a galera baixar.',
    sections: [
      { kind: 'new', items: [
        'Botão Clipar (claquete) na barra da chamada e atalho Alt+C, que funciona com o jogo aberto no app do Windows. A claquete bate fechando e abre de novo, como no cinema.',
        'Corte o trecho que quiser dentro dos últimos 30 segundos antes de soltar, com régua de tempo embaixo da onda e a duração do trecho em destaque.',
        'O clipe vira um vídeo com os perfis de quem estava na chamada, acendendo verde em quem fala, e só quem estava lá pode baixar.',
        'Os clipes da chamada ficam na aba Clipes da chamada, dentro da janela Clipar, por 24 horas. Sem poder clipar (fone desligado, por exemplo), a claquete abre direto neles.',
        'Nova opção Pode clipar meu áudio, em Voz e vídeo e na própria janela Clipar. Desligada, você some dos clipes.',
      ] },
    ],
  },
  {
    version: '1.7.0', date: '2026-10-17', name: 'Prévia da transmissão e paleta roxa',
    summary: 'Quem está na chamada sem assistir vê uma prévia da tela de quem transmite, como no Discord. O app todo ganhou o preto com roxo da tela de entrada.',
    sections: [
      { kind: 'new', items: [
        'Prévia da transmissão: quem está na chamada e ainda não clicou em assistir vê uma foto da tela de quem transmite, trocada a cada 8 s com um esmaecido, no lugar do bloco parado. Quem entra na sala já recebe a última foto. Ao parar de assistir, o último quadro visto fica como prévia até a próxima foto.',
      ] },
      { kind: 'improved', items: [
        'Paleta do tema Escuro: o preto com roxo da tela de entrada agora vale para o app todo. O roxo do logo fica no que é ação ou marca (botões, interruptores, menções, links e os títulos das Configurações), e seleções e fundos ficam neutros. Os temas Meia-noite e Alto contraste não mudam.',
        'Perfil: novo tom "Roxo Resenhex" entre as cores.',
        '"Conectando…", ao começar a assistir uma transmissão, ganhou um indicador girando.',
        'Nas miniaturas de transmissão, o botão diz só "Assistir" e fica acima do nome de quem transmite.',
      ] },
      { kind: 'fixed', items: [
        'As medições da transmissão (resolução, fps, internet) somem do bloco quando você para de assistir. Antes ficavam na tela com os últimos números.',
      ] },
    ],
  },
  {
    version: '1.6.2', date: '2026-10-16', name: 'Transmissão a 60 fps em monitores de 144 Hz',
    summary: 'No app do Windows, a transmissão em Movimento · 1080p / 60 passa de 48 para 59 fps em monitores de 144 Hz, e a imagem chega mais rápido para quem assiste. O H.264 passa a usar a placa de vídeo sempre que ela codifica.',
    sections: [
      { kind: 'improved', items: [
        'App do Windows 1.4.4: a captura de tela entregava no máximo 48 quadros por segundo em monitores de 144 Hz, por um limite do Windows que o app não ajustava. Agora o Movimento · 1080p / 60 chega a 59 fps, sem gastar mais processador. O app se atualiza sozinho.',
        'App do Windows 1.4.4: a transmissão sempre envia o quadro mais recente da tela. Nos perfis de 30 fps, a imagem chega cerca de 40 ms mais rápido para quem assiste.',
        'As estatísticas da sua transmissão mostram também quantos quadros a captura da tela entrega ("captura 59 fps"). Se esse número estiver baixo, o limite é a captura, e não a internet ou o codificador.',
        'Movimento · 1080p / 60: o H.264 usa primeiro os perfis que a placa de vídeo codifica (NVIDIA, AMD ou Intel). Antes, a transmissão podia cair no codificador do processador, com imagem pior e bem mais uso de CPU. Se a placa recusar um perfil, o app troca para outro sozinho, sem interromper.',
      ] },
      { kind: 'fixed', items: [
        'Em blocos estreitos, as estatísticas da transmissão não cobrem mais o selo AO VIVO.',
      ] },
    ],
  },
  {
    version: '1.6.1', date: '2026-10-16', name: '1080p a 60 fps por padrão e mais fluido',
    summary: 'No perfil de 60 fps, a resolução agora desce e sobe aos poucos para manter o jogo fluido, e volta para 1080p em segundos quando sobra folga. Quem ainda não escolheu começa a transmitir em Movimento · 1080p / 60, com limite de upload de 50 Mbps.',
    sections: [
      { kind: 'improved', items: [
        'Movimento · 1080p / 60: o 1080p é o alvo e fica o máximo possível. A resolução só desce quando a transmissão fica abaixo de 25 fps por uns 6 s: primeiro para 900p, que confere o resultado, e se ainda não der conta para 720p. Uma engasgada isolada ou uma oscilação curta da internet não trocam a resolução.',
        'Quando sobra folga, a resolução volta a subir em poucos segundos, assim que o app prevê pelo menos 35 fps no degrau de cima (tempo de codificação e banda). Uma tentativa que falha espera um pouco mais para a próxima. Antes, cada degrau levava pelo menos 20 s.',
        'Movimento · 1080p / 60 pelo servidor de mídia: a camada de 1080p agora também desce aos poucos (900p, 720p) quando os quadros caem, e volta sozinha. Antes ela ficava em 1080p a ~38 fps quando o computador não dava conta. Com o processador no limite, a camada das miniaturas passa antes para 30 fps, para o 1080p manter os quadros.',
        'Com várias pessoas assistindo pela conexão direta, quem está em tela cheia tem prioridade. Quando falta processador ou internet, as miniaturas baixam primeiro, e o 1080p é o primeiro a voltar.',
        'Quem assiste: a transmissão ganhou ~0,1 s de folga para absorver o quadro-chave do 1080p e a variação da internet, com menos engasgos. Antes isso valia só no celular.',
        'Movimento · 1080p / 60: até 8 Mbps por espectador, no lugar de 6, para a imagem ficar mais limpa em jogos com muito movimento. Os degraus de baixo acompanham (900p ~6,1 Mbps, 720p ~4,4 Mbps). Quem tem menos internet não perde nada: o navegador se ajusta à internet de verdade, e a volta para o 1080p continua pedindo só ~4,5 Mbps.',
        'Perfil padrão da transmissão: Movimento · 1080p / 60, no lugar de Automática. Para textos, código e apresentações, Nitidez · 1080p / 30 continua deixando as letras mais nítidas.',
        'Limite de upload padrão: 50 Mbps, no lugar de 10. Com várias pessoas assistindo, cada uma recebe mais banda. Se a sua internet envia menos que isso, escolha um valor menor em Configurações.',
        'Quem já tinha salvo um perfil ou um limite de upload continua com o seu.',
        'Conexão direta (P2P, sem o servidor de mídia): o som da tela agora chega em estéreo. Antes chegava mono, e jogo, música e vídeo perdiam o lado de cada som. A voz continua mono, e no servidor de mídia o som da tela já era estéreo.',
      ] },
      { kind: 'fixed', items: [
        'Chamadas voltam sozinhas depois de uma queda de rede. Antes, depois da primeira queda curta, a reconexão automática parava de funcionar com aquela pessoa, e uma queda de mais de uns 20 s só voltava clicando em Reconectar. Agora o app segue tentando enquanto a pessoa estiver na chamada, e a imagem volta em 1 a 2 s depois que a rede volta.',
        'Duas pessoas que entram na sala quase ao mesmo tempo agora se conectam. Antes, se a primeira tinha internet mais lenta (no celular, por exemplo), o pedido de conexão da segunda chegava antes de a chamada começar do lado dela e se perdia. As duas ficavam na sala sem se ouvir até alguém sair e entrar de novo. Isso podia acontecer, por exemplo, quando todo mundo volta junto depois de uma queda do servidor.',
        'Se o servidor de mídia falha logo depois da entrada e a chamada passa para conexão direta, a conexão com quem já estava na sala agora acontece. Antes, essas pessoas ficavam sem áudio até alguém sair e entrar de novo.',
        'Chamadas pelo servidor de mídia: as vozes saem no fone ou alto-falante escolhido em Configurações desde a entrada. Antes, iam para a saída padrão do sistema até a saída ser escolhida de novo.',
        'Trocar tela/aplicativo para uma fonte com som: quem não estava assistindo na hora da troca agora ouve o som quando volta a assistir.',
        'Quem começa a assistir no meio de uma troca de tela recebe a fonte nova. Antes, podia ficar com a imagem parada.',
        'Quem volta a assistir não faz mais a transmissão trocar para o codec mais leve, ou para o modo de movimento, por causa de um pico de um instante. A troca só acontece depois de 5 s seguidos de aperto, como já devia ser.',
        'Economia · 720p / 30: depois de um aperto longo, a imagem volta para 720p em 24 s, e não mais em 36 s. O app contava um degrau abaixo de 360p que não mudava nada.',
      ] },
    ],
  },
  {
    version: '1.6.0', date: '2026-10-15', name: 'E-mail de recuperação e Esqueci a senha',
    summary: 'Agora dá para cadastrar um e-mail, que é opcional, e criar uma senha nova por ele se você esquecer a sua. Quem não quiser colocar e-mail continua entrando só com usuário e senha.',
    sections: [
      { kind: 'new', items: [
        'Cadastro: campo de e-mail opcional. Sem e-mail, não dá para recuperar a conta se você esquecer a senha, e o aviso aparece logo abaixo do campo.',
        'Minha conta: seção E-mail de recuperação para adicionar, trocar ou remover o e-mail. O e-mail só vale depois de confirmado pelo link que chega na caixa de entrada.',
        'Esqueci a senha, na tela de login: digite o seu e-mail e receba um link para criar uma senha nova. O link vale por 1 hora e uma vez só, e os outros aparelhos saem da conta.',
        'Ninguém mais vê o seu e-mail, nem os membros dos servidores nem os amigos.',
      ] },
      { kind: 'improved', items: [
        'Minha conta: trocar a senha e o e-mail não pede mais a senha atual. Quem está conectado e esqueceu a senha consegue criar outra, e os outros aparelhos continuam saindo da conta.',
      ] },
      { kind: 'fixed', items: [
        'Entrar e criar conta: a tela usa sempre o roxo do Resenhex, e não mais um azul para quem chega por convite ou já tinha visitado o site. A cor de avatar sugerida também é roxa.',
        'Página inicial: os títulos trocaram de fonte. A nova é tão larga e forte quanto a anterior, mas com letras normais, sem as pontas curvas no G, no E e no B.',
      ] },
    ],
  },
  {
    version: '1.5.1', date: '2026-10-14', name: 'Transmissão a 60 fps segura o 1080p e Propor Melhorias no lugar certo',
    summary: 'No perfil Movimento · 1080p / 60, a transmissão só baixa a resolução quando cai abaixo de 30 fps, e volta sozinha quando melhora. O botão Propor Melhorias não ocupa mais espaço do chat.',
    sections: [
      { kind: 'improved', items: [
        'Movimento · 1080p / 60: a resolução fica enquanto a transmissão mantém pelo menos 30 fps. A 45 fps continua em 1080p; abaixo de 30 por alguns segundos desce para 720p tentando 60 de novo, e assim por diante até 360p para não travar.',
        'Quedas rápidas, como uma tela de carregamento, não baixam mais a resolução, e o aviso de internet ou processador do navegador sozinho também não.',
        'Quando melhora, a transmissão volta para a resolução de cima depois de uns 20 s perto de 60 fps. Se não segurar, espera mais antes de tentar de novo.',
        'Propor Melhorias: no computador, o botão fica no rodapé da lista de membros e some quando ela está escondida, como no chat da call. No celular, fica nas Configurações.',
      ] },
      { kind: 'fixed', items: [
        'Celular: o rodapé das Configurações (Propor Melhorias, Sair da conta e a versão) não aparecia. Agora fica numa fileira abaixo das abas.',
      ] },
    ],
  },
  {
    version: '1.5.0', date: '2026-10-14', name: 'Transmissão de tela mais nítida e chat mais leve',
    summary: 'Telas com texto chegam bem mais nítidas gastando menos internet, o perfil de 60 fps mantém o 1080p enquanto o computador aguenta, o chat trava menos durante as chamadas e a página abre mais rápido.',
    sections: [
      { kind: 'improved', items: [
        'Texto, código e planilhas bem mais nítidos: os perfis de texto usam AV1 com ferramentas de conteúdo de tela, com menos da metade da internet de envio.',
        'Blocos pequenos recebem a imagem inteira e o navegador de quem assiste reduz, o que deixa a letra legível. Jogos e vídeos continuam no tamanho do bloco.',
        'Se o processador não der conta do codec mais nítido, a transmissão passa para um mais leve sozinha, sem tela preta para quem assiste.',
        'Movimento · 1080p / 60: mantém 1080p e 60 fps, e só desce para 720p ou 540p quando os quadros começam a cair.',
        'Jogos em H.264 já começam na qualidade certa: antes, uma transmissão aberta no meio da chamada levava uns 20 segundos para ficar nítida.',
        'Servidor de mídia (SFU): camadas refeitas e começo em H.264 corrigido. Com três pessoas assistindo, texto a 30 fps e jogos sem travadas.',
        'Conexão e diagnóstico mostram o codificador, se é por hardware, se o processador está no limite e se o servidor de mídia está por UDP, TCP ou TURN.',
        'Chat mais leve durante as chamadas: quando alguém entra, sai ou muta na sala, as mensagens na tela são atualizadas com bem menos trabalho.',
        'A transmissão de tela atualiza a etiqueta "AO VIVO" só quando ela muda.',
        'O app abre mais rápido: a conexão com o servidor carrega menos código.',
        'Ícones e imagens do site e dos apps ocupam até 39% menos espaço, com a mesma qualidade.',
        'O servidor usa menos memória com o Mudae e volta mais rápido depois de cada atualização.',
        'Página inicial: títulos na fonte Unbounded, com "A galera já tá na call" e "Bora pra resenha?" em caixa alta.',
      ] },
    ],
  },
  {
    version: '1.4.5', date: '2026-10-13', name: 'Call no celular bloqueado sem perder o microfone e DJ como mídia',
    summary: 'Com o celular bloqueado, uma queda da conexão não deixa mais você mudo na call: o Resenhex volta sozinho para a sala com o mesmo microfone. No app de Android 1.3.2, a música do DJ sai como mídia, com qualidade de música, e não mais pelo som da ligação.',
    sections: [
      { kind: 'new', items: [
        'App de Android 1.3.2: a música do DJ toca como mídia, separada do som da call. Antes, com o microfone aberto, ela saía pela faixa da ligação, com qualidade de voz e no volume da chamada. O vídeo continua na tela, acompanhando o som.',
      ] },
      { kind: 'fixed', items: [
        'Celular bloqueado: depois de uma queda da conexão (internet oscilando ou atualização do servidor), a call voltava e você ouvia todo mundo, mas ninguém te ouvia. Agora a chamada fica guardada durante a queda e volta com o mesmo microfone.',
        'A sensibilidade de entrada não fecha mais o microfone quando não consegue medir a sua voz, como com a tela bloqueada ou o áudio pausado pelo sistema.',
      ] },
      { kind: 'improved', items: [
        'Microfone que para de captar (fone desconectado, captura silenciada pelo sistema) é reaberto sozinho. Se a supressão de ruído ou o efeito de voz travar, sua voz segue direto pelo microfone.',
        'App de Android 1.3.2: o serviço da call continua ligado entre a queda e a volta, recupera o microfone sempre que o app aparece na tela e avisa "Ninguém está te ouvindo" se o Android pausar o microfone. Atualize pelo botão Atualizar do app ou em resenhex.duckdns.org/baixar.',
        'App de Android 1.3.2: o Wi-Fi fica em modo de baixa latência também com a tela apagada (Android 10 a 13).',
      ] },
    ],
  },
  {
    version: '1.4.4', date: '2026-10-13', name: 'Propor Melhorias',
    summary: 'Tem uma ideia para o Resenhex? O botão discreto no canto inferior direito abre um espaço para compartilhar sua sugestão com a equipe, sem sair do app.',
    sections: [
      { kind: 'new', items: [
        'Propor Melhorias: escreva sua ideia no botão do canto inferior direito ou nas Configurações. As sugestões são enviadas por e-mail à equipe do Resenhex.',
      ] },
      { kind: 'improved', items: [
        'Se o envio falhar, sua sugestão continua no campo para você tentar novamente.',
      ] },
    ],
  },
  {
    version: '1.4.3', date: '2026-10-13', name: 'Compartilhamento mais rápido e som de vários aplicativos',
    summary: 'O app de Windows prepara as prévias antes de abrir a janela de transmitir e mostra os ícones enquanto as imagens carregam. No Windows 11, dá para combinar o som dos aplicativos que você escolher.',
    sections: [
      { kind: 'new', items: [
        'Windows 11: em Som da transmissão > Escolher aplicativos, marque até 8 aplicativos para transmitir apenas o som deles juntos.',
      ] },
      { kind: 'improved', items: [
        'A janela de transmitir abre de imediato, e a lista não precisa esperar todas as miniaturas.',
        'Prévias preparadas ao entrar na chamada e ao aproximar o mouse ou foco do botão de compartilhar. Os ícones dos aplicativos aparecem enquanto as imagens carregam.',
        'Prévias recentes são reaproveitadas e atualizadas sem perder a seleção de tela, qualidade ou som.',
      ] },
      { kind: 'fixed', items: [
        'Fechar ou cancelar a escolha de tela não mostra mais o aviso de compartilhamento não autorizado.',
        'A seleção automática do som da janela aguarda a identificação do aplicativo.',
      ] },
    ],
  },
  {
    version: '1.4.2', date: '2026-10-13', name: 'Janela de transmitir com a qualidade redesenhada',
    summary: 'No app de Windows, a escolha de qualidade da transmissão ganhou um seletor no estilo das abas, com ícones e a resolução de cada opção. O overlay em jogos voltou a funcionar no app 1.4.2.',
    sections: [
      { kind: 'improved', items: [
        'Qualidade da transmissão em um seletor único: o destaque desliza até a opção escolhida e as setas do teclado trocam entre elas.',
        'Qualidade e som da transmissão ficam alinhados, na mesma altura.',
      ] },
      { kind: 'fixed', items: [
        'App de Windows 1.4.2: some o erro "fromVoiceSite is not defined" e o overlay em jogos volta a funcionar.',
      ] },
    ],
  },
  {
    version: '1.4.1', date: '2026-10-13', name: 'Transmissão com o som de um app só (app de Windows)',
    summary: 'No app de Windows, dá para transmitir só o som de um app, como o jogo sem o Discord ou a música de fundo. A qualidade da transmissão agora fica na mesma janela em que você escolhe a tela.',
    sections: [
      { kind: 'new', items: [
        'Som de um app só: na janela de transmitir, escolha entre o som do computador inteiro, o som de um app específico ou sem som. Funciona também com apps da Microsoft Store.',
        'Ao escolher a janela de um app, o som daquele app já vem selecionado, até você trocar.',
      ] },
      { kind: 'improved', items: [
        'A qualidade da transmissão (resolução e FPS) é escolhida na própria janela de transmitir, sem um passo a mais.',
      ] },
    ],
  },
  {
    version: '1.4.0', date: '2026-10-12', name: 'Novos efeitos de voz para a resenha',
    summary: 'Os efeitos de voz da call foram refeitos e ganharam novas opções: Bêbado, Autotune, Voz em acordes, Coral e mais. Escolha na setinha do microfone ou em Configurações > Voz e vídeo e teste com Ouvir minha voz.',
    sections: [
      { kind: 'new', items: [
        'Telefone, Megafone e Banheiro, cada um com seu próprio som.',
        'Bêbado: a fala alterna entre arrastar e atropelar, com o tom e a articulação balançando.',
        'Autotune, Voz em acordes e Coral: transforme a fala em notas, acordes ou um grupo de cantores.',
      ] },
      { kind: 'improved', items: [
        'Robô, Caverna, Alien e Fantasma foram refeitos. Esquilo, Gigante e Rádio continuam com o som conhecido.',
        'Troca de efeitos com transição suave e proteção de picos. O mudo limpa os sons pendentes; se um efeito falhar, a voz volta ao normal.',
        'As vozes de personagens por IA foram retiradas do app, junto dos controles e downloads de modelos. Os efeitos padrão continuam disponíveis no navegador e no app.',
      ] },
    ],
  },
  {
    version: '1.3.8', date: '2026-10-12', name: 'Overlay de voz nos jogos (app de Windows)',
    summary: 'No app de Windows, a lista da call aparece por cima do jogo: quem está na sala, quem está falando e quem está mutado. Ele aparece sozinho quando você abre um jogo durante uma call, e você escolhe onde ele fica na tela.',
    sections: [
      { kind: 'new', items: [
        'Overlay em jogos: com o app de Windows, a lista da call aparece por cima do jogo, com o anel verde em quem está falando e os ícones de mutado e ensurdecido.',
        'Aparece sozinho quando você está numa call e abre um jogo, e some quando você sai do jogo.',
        'Reconhece qualquer jogo instalado pela Steam, Epic Games, Xbox/Game Pass, Riot, EA, Ubisoft, GOG e Amazon, inclusive os que acabaram de sair, além de mais de 10 mil jogos conhecidos. Launchers e ferramentas ficam de fora.',
        'Nova aba Overlay em jogos nas Configurações: ligue o overlay e arraste a lista para onde ela deve ficar na tela. Ela encaixa nos cantos, nas bordas e no centro, e o botão Testar mostra como fica.',
        'O overlay vem desligado e, quando ligado, começa no meio da tela, à esquerda. O clique passa direto para o jogo.',
        'Personalize o overlay na mesma aba: escolha quem aparece (todos, sem os mutados ou só quem está falando), esconda os nomes para ficar só com as fotos, deixe as fotos em GIF paradas e ajuste a opacidade. Quem está falando aparece sempre por inteiro.',
      ] },
      { kind: 'improved', items: [
        'O ícone do app na barra de tarefas do Windows ficou nítido em todos os tamanhos.',
      ] },
    ],
  },
  {
    version: '1.3.5', date: '2026-10-11', name: 'Minha conta: troca de senha nas Configurações',
    summary: 'As Configurações ganharam a aba Minha conta, onde dá para trocar a senha. Quem não é dono do servidor também deixa de ver um “null” perdido no menu das configurações do servidor.',
    sections: [
      { kind: 'new', items: [
        'Aba Minha conta nas Configurações: mostra seu nome de usuário e quando a conta foi criada, e deixa trocar a senha (pede a senha atual).',
        'Ao trocar a senha, os outros aparelhos conectados na sua conta saem e precisam entrar com a senha nova. O aparelho em que você trocou continua conectado.',
      ] },
      { kind: 'fixed', items: [
        'Quem não é dono do servidor via um “null” no menu das configurações do servidor, embaixo de Banimentos.',
        'A sala do DJ mostrava um “null” embaixo da fila quando não havia aviso da última música.',
      ] },
    ],
  },
  {
    version: '1.3.0', date: '2026-10-10', name: 'Personagens no catálogo do Mudae',
    summary: 'A roleta do Mudae passou a usar personagens do catálogo de desenhos, jogos e quadrinhos.',
    sections: [
      { kind: 'fixed', items: [
        'A roleta do Mudae gira com personagens de verdade em desenhos, jogos e quadrinhos, em vez de versos com dado.',
      ] },
    ],
  },
  {
    version: '1.2.5', date: '2026-10-10', name: 'App para Android e Resenhex redondo no celular',
    summary: 'O Resenhex agora tem app para Android, baixado direto da página do site, com a call funcionando de tela bloqueada. E o celular ficou com cara de app: o botão voltar fecha a janela aberta, abrir um link não tira você da call e o toque longo numa mensagem abre as ações, como no Discord.',
    sections: [
      { kind: 'new', items: [
        'App para Android: na página Baixar, quem abre pelo celular vê o botão “Baixar para Android”. O app fica na tela inicial e abre o Resenhex em tela cheia, já com a sua conta.',
        'A call continua com a tela bloqueada: o app mostra a notificação “Na call”, com os botões Silenciar e Sair da call, e pede para o Android não pausá-lo durante a chamada.',
        'Notificações de mensagens e de quem está ligando no Android, com a pessoa de fora do app.',
        'A página inicial mostra “Baixar para Android” para quem chega pelo celular.',
      ] },
      { kind: 'improved', items: [
        'O site pode ser instalado como app (ícone novo para a tela inicial), e o app instalado abre direto no Resenhex, sem passar pela página de apresentação.',
        'Toque longo numa mensagem abre uma folha de ações embaixo: reações rápidas, responder, copiar texto, editar e apagar.',
        'O botão voltar do celular fecha a gaveta de canais, a lista de membros, o chat da call, os seletores de emoji e GIF, o perfil, as Configurações, as Novidades, os menus e as janelas de confirmação, em vez de sair do app.',
        'O teclado não sobe mais sozinho ao abrir uma conversa, o chat da call ou os seletores de emoji e GIF. Quando você toca na caixa de texto, a última mensagem continua visível logo acima dela.',
        'Nos quadros da call, o nome fica embaixo à esquerda, sem encostar no avatar, no ícone de mudo nem no botão de fixar.',
        'Novidades e Configurações: as abas terminam antes do X e a aba escolhida fica sempre à vista.',
        'O aviso de "Tela" no celular abre como folha embaixo, sem vazar da gaveta.',
        'A prévia de vídeo do YouTube preenche o cartão, sem faixas pretas.',
        'Opções que só fazem sentido no computador (atalhos de teclado, apertar para falar e opções de envio da transmissão) ficam escondidas no celular, e os textos dizem "toque" e "aparelho".',
      ] },
      { kind: 'fixed', items: [
        'No celular, os botões da call quebravam em duas linhas e deixavam um espaço vazio antes do botão de desligar. Agora ficam numa linha só e se ajustam à largura da tela.',
        'No app de Android, tocar num link ou num vídeo do YouTube durante a call tirava você da sala.',
        'Barras de rolagem grossas de computador apareciam no celular, no chat, na gaveta, nos blocos de código e na página inicial.',
        'A estrelinha da etiqueta de versão aparecia como um quadrado roxo em celulares com o navegador desatualizado.',
        'O horário da mensagem quebrava em duas linhas em telas estreitas, o X do aviso de notificações caía numa linha sozinho e o divisor de data do chat da call tinha fundo de outra cor.',
        'A prévia do perfil mostrava um horário fixo em vez do horário atual.',
      ] },
    ],
  },
  {
    version: '1.2.4', date: '2026-10-10', name: 'Voz não some com a janela minimizada ou o celular bloqueado',
    summary: 'Com o navegador minimizado, atrás de um jogo ou com o celular bloqueado, sua voz continua chegando para a galera na call.',
    sections: [
      { kind: 'fixed', items: [
        'Com a janela do navegador minimizada, a aba em segundo plano ou o navegador atrás de um jogo em tela cheia, o corte de ruído deixava o microfone fechado e ninguém ouvia você. Agora a voz continua chegando.',
        'App de Android 1.3.0: a call não fica mais muda com o celular bloqueado na mesa, e o pedido para rodar em segundo plano aparece até ser liberado, com o passo extra de cada marca de celular.',
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
