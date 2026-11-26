// Ajuda do Mudae: o texto que explica o jogo e os comandos, o popup que o Salão abre e a busca do $ajuda no chat.
// Um arquivo só serve aos dois lados: o navegador usa window.MudaeAjuda e o servidor faz require (server/mudae-comandos.js),
// então o popup e o $ajuda nunca contam coisas diferentes. Um teste (test/mudae-ajuda.test.js) confere que todo comando do
// servidor tem uma explicação aqui e que nenhuma explicação fala de um comando que não existe.
//
// Cada item: { cmds: ['w', 'h'], title: 'Nome' (opcional), text: '...' }. Os cmds levam todos os apelidos, sem o "$".
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MudaeAjuda = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SECTIONS = [
    {
      id: 'basico', title: 'Como o Mudae funciona', words: 'comecar basico regras salao mesa rolls casar valor raridade kakera',
      intro: 'O Mudae é um jogo de colecionar personagens: você roda, casa com quem gostar, forma o seu harem e junta kakera.',
      items: [
        { title: 'O Salão e a Mesa', text: 'O Mudae mora num canal especial, o Salão. Os rolls de todo mundo aparecem ao mesmo tempo na Mesa, e quem tem a permissão "Usar o Mudae" joga. O Modo simplificado transforma o Salão num chat comum, com os cards no chat. Os comandos começam com $ e valem no Salão e no chat.' },
        { title: 'Rolls', text: 'Você tem 10 rolls a cada 30 minutos (a janela vira na hora cheia e na meia hora). A Forja (Safira e Prata) e o $daily mudam isso. Quando os rolls acabam, o Resenhex avisa quando eles voltarem.' },
        { title: 'Casar', text: 'Cada pessoa casa com 1 personagem por janela de 30 minutos (a reserva da medalha Esmeralda dá mais um de tempos em tempos). A carta fica disponível por 45 segundos. Nos 3 primeiros segundos depois que ela aparece, só quem rodou pode casar; depois qualquer um pode, e isso é roubar o roll. Os poderes Cadeado e Laço mexem nessa regra.' },
        { title: 'Valor e raridade', text: 'O valor de um personagem vai de uns 30 a 1.200 de kakera e depende de quão popular ele é, das chaves que ele tem e do tamanho do servidor (até +20%). A raridade (comum, rara, épica e lendária) também vem da popularidade: só os cerca de 100 mais populares de cada fonte são lendários.' },
        { title: 'Kakera', text: 'É a moeda do Mudae. Vem dos cristais, do $dk, do divórcio, das chaves e das conquistas, e é gasto na Forja, no $rolls e nas trocas.' },
      ],
    },
    {
      id: 'rolar', title: 'Rolar e casar', words: 'roll rolar waifu husbando fonte anime jogos daily dk tempo',
      intro: 'Os comandos para rodar personagens e ver quanto falta para tudo voltar.',
      items: [
        { cmds: ['w', 'waifu', 'h', 'husbando', 'm', 'marry', 'o'], text: 'Roda uma waifu ($w), um husbando ($h), qualquer personagem ($m) ou um personagem sem gênero definido ($o). Se não houver ninguém do gênero pedido, sai qualquer um.' },
        { cmds: ['wa', 'wg', 'wc', 'wd', 'ws', 'wv', 'ha', 'hg', 'ma', 'mg'], title: 'Por fonte', text: 'Some a letra da fonte: a anime e mangá, g jogos, c quadrinhos, d desenhos, s séries e v visual novels. Por exemplo, $wg é uma waifu de jogo e $ha é um husbando de anime.' },
        { cmds: ['tu'], text: 'Mostra tudo de uma vez: rolls, casamento, reserva, kakera, cristais do dia, energia, $daily e $dk.' },
        { cmds: ['mu', 'marryup'], text: 'Quanto falta para você casar de novo.' },
        { cmds: ['ru', 'rollsup'], text: 'Quantos rolls você tem e quando eles voltam.' },
        { cmds: ['daily'], text: 'Enche os rolls na hora, uma vez a cada 20 horas (só gasta se faltar roll). Com 5 ou mais personagens na likelist, ele guarda 2 usos.' },
        { cmds: ['rolls'], text: 'Compra os rolls de volta por 500 de kakera, até 3 vezes em 24 horas.' },
        { cmds: ['dk', 'dailykakera'], text: 'Dá 250 de kakera a cada 20 horas (em dobro com a medalha Ouro IV).' },
        { cmds: ['k', 'kakera'], text: 'Seu saldo de kakera e os cristais do dia.' },
      ],
    },
    {
      id: 'harem', title: 'Seu harem', words: 'harem mm info perfil ranking top obra nota ordenar divorcio favorito',
      intro: 'Tudo para ver, organizar e cuidar dos personagens que você casou. O álbum do Salão (Meu harem) faz o mesmo com cliques.',
      items: [
        { cmds: ['mm', 'harem', 'mma', 'mms', 'mmr'], text: 'Mostra o harem, o seu ou o de @pessoa. $mma põe de A a Z, $mms por obra e $mmr dos mais recentes. Aceita filtros: $mm w anime, $mm husbandos jogos, $mm Naruto, $mm abc inverso.' },
        { cmds: ['im', 'info'], text: 'Mostra a ficha de um personagem: quem é o dono, quem deseja, a chave, o valor e o histórico.' },
        { cmds: ['top', 'obra'], text: '$top lista os personagens mais valiosos (filtre com waifus, husbandos, anime, jogos... ou o nome de uma obra). $obra mostra todos de uma obra e quantos são seus.' },
        { cmds: ['topserv', 'ts', 'topservv', 'tsv', 'topservk', 'tsk', 'topservy', 'tsy', 'topservn', 'tsn', 'topservlc', 'tslc'], title: 'Rankings do servidor', text: '$topserv mostra os haréns mais valiosos. As variantes ordenam por kakera guardado ($tsk), soma das chaves ($tsy), número de personagens ($tsn) e data do último casamento ($tslc).' },
        { cmds: ['topservu', 'tsu', 'azarados'], title: 'Ranking dos azarados', text: '$tsu mostra quem mais rolou personagem que já tinha dono. A cada 15 desses rolls, o próximo vem livre e de raridade alta (pity), e se o personagem for lendário o roll volta e você ganha metade do valor em kakera. Os títulos de azarado saem em $conquistas.' },
        { cmds: ['inveja', 'envy'], text: '$inveja nome avisa, com uma frase de provocação, o dono do personagem. Dá para usar a cada 30 minutos.' },
        { cmds: ['fm', 'favorito'], text: 'Escolhe o seu favorito, que aparece em destaque no harem e no perfil.' },
        { cmds: ['note', 'n', 'noteseries', 'notepage', 'noteremoveall', 'fn', 'fnall'], title: 'Notas', text: '$note nome $ texto anota algo no personagem (texto vazio apaga). $noteseries faz o mesmo para uma obra inteira e $notepage para uma página do harem. $fn procura nas suas notas e $fnall nas de todo mundo. No álbum do Salão dá para editar pelo lápis.' },
        { cmds: ['sortmarry', 'sm', 'organizar'], text: 'Ordena o harem e guarda a ordem: $sm abc, obra, recentes, nota, inverso e valor (volta ao padrão). No álbum, escolha "Minha ordem" e arraste as cartas.' },
        { cmds: ['divorce', 'divorciar', 'divorcio', 'dt'], text: '$divorce nome solta o personagem e devolve o valor dele em kakera (no máximo 200 por 24 horas; passando disso o divórcio continua, só não devolve). $divorcio mostra quanto ainda devolve.' },
        { cmds: ['divorceseries', 'divorcepage', 'divorceall', 'divorceallbut', 'confirmar', 'confirm', 'cancelar'], title: 'Divórcio em lote', text: '$divorceseries obra, $divorcepage 2, $divorceall e $divorceallbut nome $ nome mostram o que vai acontecer e só soltam quando você digita $confirmar, em até 1 minuto. $cancelar desiste.' },
        { cmds: ['profile', 'pr', 'perfil'], text: 'Mostra o resumo de uma pessoa: personagens, valor, favorito, contadores e título.' },
        { cmds: ['left'], text: 'Quantos personagens ainda estão livres neste servidor.' },
      ],
    },
    {
      id: 'kakera', title: 'Kakera e cristais', words: 'kakera cristal cristais poder reacao presente troca arco-iris cor',
      intro: 'De onde vem o kakera, os cristais e como dar ou trocar.',
      items: [
        { title: 'Cristais', text: 'O cristal errante aparece a cada 5 a 10 minutos com gente no Salão, e todo mundo que clicar a tempo leva (uma vez cada). Os 15 primeiros cristais do dia valem inteiro; depois rendem só 2%. Quando alguém rola um personagem que já tem dono, nasce também o cristal da carta: a cor e o bônus dependem da chave do personagem, e ele pode vir arco-íris. A chuva e a corrente são raras.' },
        { title: 'Energia', text: 'Só o cristal da carta gasta energia: você tem até 100 e ganha 50 por hora. O roxo é de graça; os outros gastam de 15 a 50 (a metade se o personagem tem chave 10 ou mais). Ela fica no topo do Salão, do lado dos cristais, e o $tu também mostra.' },
        { cmds: ['kakerareact'], text: 'Escolhe a forma do cristal de cada cor na sua tela (gema, coração, estrela, gota ou losango): $kakerareact roxo estrela. $kakerareact list mostra e reset volta tudo.' },
        { cmds: ['give', 'dar'], text: 'Dá um personagem seu de presente: $give @pessoa nome.' },
        { cmds: ['givek', 'givekakera'], text: 'Dá kakera para alguém: $givek @pessoa 100.' },
        { cmds: ['trade', 'trocar', 'troca'], text: 'Abre uma troca de cartas e kakera com @pessoa. Cada um escolhe o que oferece, e só acontece quando os dois confirmam (a troca fica aberta por 5 minutos).' },
      ],
    },
    {
      id: 'chaves', title: 'Chaves e soulmates', words: 'chave chaves soulmate nivel bronze prata ouro caos cor embed',
      intro: 'A chave é o quanto você já rolou um personagem que é seu. Ela fica com o personagem, mesmo se ele mudar de dono.',
      items: [
        { title: 'Como a chave sobe', text: 'Quando você rola um personagem que já é seu, a chave dele sobe um nível (uns 2% dos seus rolls caem num personagem seu). As cores são bronze (1 e 2), prata (3 a 5), ouro (6 a 9) e caos (10 ou mais), e o máximo é 500.' },
        { title: 'O que cada nível faz', text: 'Nível 1: cor própria do personagem. 2, 4, 5, 7, 8 e 9: +10% de valor cada. 3: ciano e verde viram laranja nos cristais dele. 6: rolar o personagem devolve o valor dele em kakera (até 100 por 24 horas). 10: o cristal dele gasta metade do poder e vale +15 de kakera. 11 em diante: +5% de valor. 25, 100, 300 e 500: 25%, 50%, 75% e 100% de chance de um segundo cristal. 50, 200 e 400: roxo, vermelho e arco-íris rendem +75%, +150% e +250%.' },
        { cmds: ['infokeys', 'keys', 'chaves'], text: 'Resume as regras e mostra os seus personagens com mais chaves e o quanto ainda pode pegar do prêmio do dia.' },
        { cmds: ['sl', 'soulmates'], text: 'Seus soulmates: personagens em que você mesmo rolou 10 chaves.' },
        { cmds: ['removekeys', 'rk'], text: 'Tira chaves de um personagem seu: $removekeys nome $ 2. As soulkeys continuam contando.' },
        { cmds: ['embedcolor', 'ec'], text: 'Muda a cor do personagem (precisa de chave nível 1): $embedcolor nome $ #ff4d94. none volta ao padrão.' },
      ],
    },
    {
      id: 'desejos', title: 'Desejos e curtidas', words: 'desejo desejos wish like curtir likelist starwish wishk obra aviso privado',
      intro: 'Desejos avisam quando o personagem sai; curtidas são a sua lista de favoritos. As duas ficam na aba Desejos do Salão.',
      items: [
        { cmds: ['wish', 'desejar', 'wl', 'wishlist', 'wr', 'wishremove'], text: '$wish nome põe na lista de desejos (vários de uma vez com $: $wish a $ b), $wl mostra e $wr tira. Você tem 10 vagas, mais as da medalha Bronze, e é avisado quando alguém rolar um deles.' },
        { cmds: ['starwish', 'sw', 'starremove', 'swr', 'starslot'], text: 'A starwish é um desejo com estrela: o Rubi e o poder Chamar desejo escolhem ela 3 vezes mais. Você tem 1 vaga; $starslot troca vagas de desejo por mais uma (a primeira extra custa 2, a segunda 4, e assim por diante).' },
        { cmds: ['wishk'], text: 'Um desejo quieto: sem aviso, mas você ganha 100 de kakera quando outra pessoa casa com o personagem (até 300 por 24 horas).' },
        { cmds: ['wishseries'], text: 'Avisa quando qualquer personagem de uma obra sair (1 obra, mais 1 a cada 2 vagas de desejo da Bronze). Tira com $wr obra.' },
        { cmds: ['wishdm', 'wishsort', 'wishpurge'], text: '$wishdm 1 esconde a sua lista dos outros (você continua sendo avisado). $wishsort põe em ordem alfabética e $wishpurge tira quem já tem dono.' },
        { cmds: ['like', 'likeremove', 'lr', 'likepos', 'likeclear', 'likelist', 'll', 'likedm', 'renamelikelist', 'rll'], title: 'Curtidas', text: '$like nome (ou vários com $) curte um personagem, $likelist mostra, $likeremove tira, $likepos muda o lugar, $likeclear sim limpa, $likedm 1 esconde dos outros e $renamelikelist muda o título. Até 100. Quando alguém rola um personagem curtido, aparece um coração na Mesa. Com 5 ou mais, o $daily guarda 2 usos.' },
      ],
    },
    {
      id: 'personalizar', title: 'Personalizar', words: 'imagem imgur titulo cor nome texto mensagem casamento overview bonus',
      intro: 'O jeito de ver e de contar o seu harem.',
      items: [
        { cmds: ['addimg', 'ai'], text: 'Adiciona imagens extras a um personagem seu: $addimg nome $ link. Só links diretos do imgur (i.imgur.com), até 12 por personagem. As imagens saem quando o personagem muda de dono. $addimg remove nome $ 2 tira uma e $addimg removeall nome tira todas.' },
        { cmds: ['changeimg'], text: 'Escolhe qual imagem aparece primeiro: $changeimg nome $ 2 (a 1 é a original).' },
        { cmds: ['randomimg'], text: '$randomimg 1 sorteia a imagem entre a original e as extras nos seus rolls. 0 desliga.' },
        { cmds: ['renameharem', 'rh', 'colormm'], text: '$renameharem muda o título do seu harem e $colormm #ff4d94 muda a cor dele. none volta ao padrão.' },
        { cmds: ['renameclaim', 'rc', 'renamedivorce', 'rd'], text: 'Muda a mensagem do seu casamento ou divórcio, com {personagem} (obrigatório) e {usuario}: $renameclaim {usuario} ama {personagem}!' },
        { cmds: ['overview'], text: 'Mostra as suas configurações do Mudae num lugar só.' },
        { cmds: ['bonus'], text: 'Mostra os seus bônus: Forja, chaves, curtidas e o que as conquistas deram.' },
      ],
    },
    {
      id: 'forja', title: 'Forja e poderes', words: 'forja medalha poder poderes vidente cadeado amuleto chuva eco laco dupla',
      intro: 'A Forja e os poderes são a progressão da pessoa. Ficam nas abas Forja e Poderes do Salão.',
      items: [
        { cmds: ['forja', 'badges', 'forjar'], text: 'Com kakera você forja 7 medalhas, cada uma com 4 níveis e uma vantagem: Bronze (vagas de desejo), Prata (guarda rolls), Ouro (mais kakera nos cristais e $dk em dobro no IV), Safira (mais rolls), Rubi (chance de o roll trazer um desejo), Esmeralda (um casamento de reserva) e Diamante (poderes recarregam mais rápido). A forja sorteia um acabamento (metal, esmalte, holográfico ou galáxia). $forjar bronze forja o próximo nível.' },
        { cmds: ['poderes', 'poder'], text: 'Os 8 poderes abrem conforme você joga, e você equipa 3 por vez: Vidência (mostra a raridade dos próximos rolls), Cadeado (ninguém mais casa com o seu roll), Amuleto (mais chance de épico e lendário), Chuva de cristais, Chamar desejo, Eco (traz de volta um personagem que passou sem dono), Escolha dupla (duas cartas no roll) e Laço (casa com o roll de outra pessoa). $poder nome usa um.' },
      ],
    },
    {
      id: 'conquistas', title: 'Conquistas', words: 'conquista conquistas marcos titulo titulos vantagem recompensa servidor',
      intro: 'As conquistas são por servidor e premiam o que você faz. Ficam na aba Conquistas do Salão.',
      items: [
        { title: 'Como funcionam', text: 'São trilhas de 3 níveis (bronze, prata e ouro) e algumas escondidas. Cada conquista paga kakera uma vez e dá um título. O kakera das conquistas entra até 1.500 por dia; o resto espera na fila. Nunca se perde conquista.' },
        { title: 'Vantagens permanentes', text: 'O ouro de Casamenteiro dá +1 vaga de desejo, o de Obra completa dá +1 roll guardado e o de Sequência do $dk dá -10% no $rolls.' },
        { title: 'Do servidor', text: 'Quando o servidor inteiro chega a 100, 1.000 e 10.000 casamentos, quem jogou nos últimos 30 dias ganha a conquista.' },
        { cmds: ['conquistas', 'marcos'], text: 'Resume as suas conquistas, o kakera na fila e as mais perto de abrir.' },
        { cmds: ['titulo', 'title'], text: 'Escolhe o título (uma conquista aberta) que aparece ao lado do seu nome: $titulo nome. $titulo sozinho lista e none tira.' },
      ],
    },
    {
      id: 'servidor', title: 'Servidor e moderação', words: 'servidor gerente moderacao configurar limite snipe cristais restore ajustes',
      intro: 'Estes comandos precisam da permissão "Gerenciar o Mudae" (menos $settings, que todos veem).',
      items: [
        { cmds: ['settings'], text: 'Mostra os ajustes do Mudae neste servidor e o que mudou do padrão.' },
        { cmds: ['settimer', 'setrolls', 'haremlimit'], text: '$settimer 60 muda o tempo para casar (15 a 120 segundos), $setrolls 6 muda os rolls por janela (2 a 10) e $haremlimit 100 limita o harem (10 a 5.000; 0 tira o limite).' },
        { cmds: ['togglesnipe', 'togglecrystals'], text: '$togglesnipe liga ou desliga casar com o roll de outra pessoa (desligado, só quem rodou casa). $togglecrystals liga ou desliga todos os cristais.' },
        { cmds: ['serverdisable', 'sd'], text: 'Tira uma obra ou um personagem da roleta de todo mundo, e ninguém passa por cima disso. Repetir o comando devolve. Sem nome, mostra o que está fora.' },
        { cmds: ['forcedivorce', 'userdivorce'], text: '$forcedivorce nome tira o personagem do dono, sem kakera. $userdivorce @pessoa sim tira o harem inteiro. As duas ações aparecem no Salão.' },
        { cmds: ['restorelist', 'rl', 'restore'], text: '$restorelist mostra o que foi tirado pela moderação e $restore nome devolve ao dono anterior (se ele ainda está no servidor e o personagem continua livre).' },
      ],
    },
    {
      id: 'ajuda', title: 'Ajuda', words: 'ajuda help comandos duvida',
      intro: 'Precisa lembrar de um comando?',
      items: [
        { cmds: ['ajuda', 'help', 'comandos'], text: '$ajuda lista os assuntos. $ajuda nome-do-comando (por exemplo $ajuda sortmarry) ou $ajuda uma palavra (por exemplo $ajuda chaves) explica na hora. No Salão, o botão Ajuda abre tudo isto numa janela com busca.' },
      ],
    },
  ];

  const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}$ ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const labelOf = (item) => (item.cmds?.length ? item.cmds.map((c) => '$' + c).join(' ') : item.title);
  const headOf = (item) => (item.title && item.cmds?.length ? item.title : item.cmds?.length ? '$' + item.cmds[0] : item.title);

  // Procura no que está escrito: o nome de um comando (com ou sem $), o assunto de uma seção ou palavras soltas.
  // Devolve { sections: [{ section, items }] } com o que combina, ou lista vazia.
  function find(query) {
    const q = norm(query).replace(/^\$/, '');
    if (!q) return { sections: SECTIONS.map((section) => ({ section, items: section.items })) };
    // 1) O nome de um assunto ("chaves", "forja") traz o assunto inteiro, que já inclui o comando de mesmo nome.
    const bySection = (match) => SECTIONS.filter(match).map((section) => ({ section, items: section.items }));
    const titled = bySection((s) => norm(s.id) === q || norm(s.title).split(' ').includes(q));
    if (titled.length) return { sections: titled, topic: true };
    // 2) O nome (ou apelido) de um comando traz só a explicação dele.
    const byCommand = [];
    for (const section of SECTIONS) for (const item of section.items) if (item.cmds?.includes(q)) byCommand.push({ section, items: [item] });
    if (byCommand.length) return { sections: byCommand, exact: true };
    // 3) Uma palavra-chave do assunto ("cristal", "imgur").
    const keyword = bySection((s) => norm(s.words).split(' ').includes(q));
    if (keyword.length) return { sections: keyword, topic: true };
    const words = q.split(' ');
    const out = [];
    for (const section of SECTIONS) {
      const items = section.items.filter((item) => {
        const hay = norm([item.title, item.text, (item.cmds || []).join(' ')].join(' '));
        return words.every((w) => hay.includes(w));
      });
      if (items.length) out.push({ section, items });
    }
    return { sections: out };
  }

  // O texto que o $ajuda manda no chat (já em markdown do Resenhex), com no máximo `max` caracteres.
  function chatText(query, max = 1800) {
    const r = find(query);
    if (!String(query || '').trim()) {
      const lines = ['**Ajuda do Mudae**. Escolha um assunto com **$ajuda assunto**, ou um comando com **$ajuda comando**:'];
      for (const s of SECTIONS) lines.push(`• **${s.title}**: $ajuda ${s.id}`);
      lines.push('No Salão, o botão **Ajuda** abre tudo numa janela com busca.');
      return lines.join('\n');
    }
    if (!r.sections.length) return `Não achei nada sobre **${String(query).slice(0, 40)}**. Veja os assuntos com **$ajuda**.`;
    const lines = [];
    for (const { section, items } of r.sections) {
      if (r.topic) lines.push(`**${section.title}.** ${section.intro}`);
      for (const item of items) lines.push(`• **${labelOf(item)}**${item.title && item.cmds ? ` (${item.title})` : ''}: ${item.text}`);
    }
    let text = lines.join('\n');
    if (text.length > max) text = text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
    return text;
  }

  // ---------- o popup do Salão ----------
  let lastFocus = null;
  function open({ section = null, query = '' } = {}) {
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return null;
    const existing = doc.querySelector('#mudae-help:not(.leaving)');
    if (existing) { existing.querySelector('input')?.focus(); return existing; }
    const h = (tag, props = {}, ...kids) => {
      const node = doc.createElement(tag);
      for (const [k, v] of Object.entries(props)) {
        if (k === 'class') node.className = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (k.startsWith('aria')) node.setAttribute(k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), v);
        else node[k] = v;
      }
      node.append(...kids.flat().filter((k) => k != null && k !== false));
      return node;
    };
    lastFocus = doc.activeElement;
    const input = h('input', { type: 'search', class: 'mudae-help-search', placeholder: 'Buscar um comando ou assunto (ex.: sortmarry, chaves, divórcio)', ariaLabel: 'Buscar na ajuda', value: query });
    const content = h('div', { class: 'mudae-help-content', tabIndex: -1 });
    const nav = h('nav', { class: 'mudae-help-nav', ariaLabel: 'Assuntos da ajuda' });
    const win = doc.defaultView || {};
    const close = () => {
      doc.removeEventListener('keydown', onKey, true);
      // Sai como as outras janelas do app (motion.css), sem sumir de uma vez.
      if (win.Motion?.leave) win.Motion.leave(overlay); else overlay.remove();
      if (lastFocus?.isConnected) lastFocus.focus();
    };
    // Os símbolos do próprio Mudae (mudae-icones.js) onde ele tem um; o resto vem do Icon() do app.
    const ICONS = { basico: 'info', rolar: 'dice', harem: 'heart', kakera: 'kakera', chaves: 'key', desejos: 'wish', personalizar: 'pencil', forja: 'medal', conquistas: 'trophy', servidor: 'settings', ajuda: 'message' };
    const icon = (name, size) => (typeof win.MudaeIcon === 'function' ? win.MudaeIcon(name, size) : typeof win.Icon === 'function' ? win.Icon(name, size) : null);
    const iconOf = (id, size = 16) => (ICONS[id] ? icon(ICONS[id], size) : null);
    // Os comandos citados no texto ($mm, $sm...) viram uma pílula, para saltarem aos olhos (tudo texto, nunca HTML).
    const richText = (text) => String(text).split(/(\$[A-Za-z0-9]+)/).map((part, i) => (i % 2 ? h('code', { class: 'mudae-help-inline' }, part) : part));
    // Até 4 apelidos em pílulas; o resto fica no "+N" (com a lista na dica).
    const SHOWN = 4;
    const cmdChips = (item) => {
      const shown = item.cmds.slice(0, SHOWN);
      const more = item.cmds.slice(SHOWN);
      return [...shown.map((c, i) => h('code', { class: 'mudae-help-cmd' + (i ? '' : ' primary') }, '$' + c)),
        more.length ? h('span', { class: 'mudae-help-more', title: more.map((c) => '$' + c).join('  ') }, '+' + more.length) : null];
    };
    const itemNode = (item) => h('div', { class: 'mudae-help-item' },
      h('div', { class: 'mudae-help-head' },
        item.cmds?.length ? h('span', { class: 'mudae-help-cmds' }, cmdChips(item)) : null,
        item.title ? h('strong', { class: 'mudae-help-name' }, item.title) : null),
      h('p', {}, richText(item.text)));
    const render = () => {
      const result = find(input.value);
      content.replaceChildren();
      nav.replaceChildren();
      if (!result.sections.length) { content.append(h('p', { class: 'mudae-help-empty' }, 'Nada encontrado. Tente outra palavra, ou o nome de um comando como sortmarry ou wishk.')); return; }
      const merged = new Map();
      for (const { section, items } of result.sections) { if (!merged.has(section.id)) merged.set(section.id, { section, items: [] }); merged.get(section.id).items.push(...items); }
      for (const { section, items } of merged.values()) {
        const id = 'mudae-help-' + section.id;
        nav.append(h('button', { type: 'button', class: 'mudae-help-link', onclick: () => doc.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' }) },
          h('span', { class: 'mudae-help-ico' }, iconOf(section.id)), h('span', { class: 'mudae-help-link-text' }, section.title), h('span', { class: 'mudae-help-count' }, String(items.length))));
        content.append(h('section', { id, class: 'mudae-help-section' },
          h('div', { class: 'mudae-help-sechead' }, h('span', { class: 'mudae-help-ico big' }, iconOf(section.id, 18)), h('h3', {}, section.title)),
          items === section.items || items.length === section.items.length ? h('p', { class: 'mudae-help-intro' }, section.intro) : null,
          h('div', { class: 'mudae-help-items' }, items.map(itemNode))));
      }
      spy();
    };
    // Destaca no menu a seção que está no topo da leitura.
    const spy = () => {
      const links = [...nav.children];
      const sections = [...content.querySelectorAll('.mudae-help-section')];
      if (!sections.length) return;
      const top = content.getBoundingClientRect().top + 24;
      let current = 0;
      sections.forEach((sec, i) => { if (sec.getBoundingClientRect().top <= top) current = i; });
      links.forEach((l, i) => l.classList.toggle('active', i === current));
    };
    content.addEventListener('scroll', spy, { passive: true });
    input.addEventListener('input', render);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const focusable = [...overlay.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const panel = h('div', { class: 'mudae-help-panel' },
      h('div', { class: 'mudae-help-top' }, h('h2', { id: 'mudae-help-title' }, 'Ajuda do Mudae'),
        h('div', { class: 'mudae-help-searchbox' }, h('span', { class: 'mudae-help-searchico' }, typeof win.Icon === 'function' ? win.Icon('search', 16) : null), input),
        h('button', { type: 'button', class: 'mudae-help-close', ariaLabel: 'Fechar a ajuda', title: 'Fechar (Esc)', onclick: close }, typeof win.Icon === 'function' ? win.Icon('x', 18) : '×')),
      h('div', { class: 'mudae-help-body' }, nav, content));
    const overlay = h('div', { id: 'mudae-help', class: 'mudae-help-overlay', role: 'dialog', ariaModal: 'true', ariaLabelledby: 'mudae-help-title',
      onclick: (e) => { if (e.target === overlay) close(); } }, panel);
    doc.body.append(overlay);
    doc.addEventListener('keydown', onKey, true);
    render();
    if (section) doc.getElementById('mudae-help-' + section)?.scrollIntoView({ block: 'start' });
    input.focus();
    return overlay;
  }

  return { SECTIONS, find, chatText, labelOf, headOf, norm, open };
});
