# Novidades do Resenhex

Histórico de versões. A mesma lista aparece dentro do app em **Novidades** (menu do servidor ou rodapé das Configurações).
O Resenhex ainda está antes da 1.0.

## v0.96 — Tela no bolso
_30/09/2026_

- Transmissão de tela no celular: toque abre uma tela cheia imersiva que gira para acompanhar a imagem. O botão Voltar fecha sem sair da chamada.
- Pinça para aproximar até 5×, arrastar com inércia e toque duplo para ampliar no ponto tocado. A resolução pedida a quem transmite acompanha o zoom.
- Controles por toque (som, qualidade, janela flutuante) que aparecem com um toque e somem sozinhos. Tela sempre acesa enquanto assiste (Wake Lock).
- Codec por espectador: o celular informa os codecs que decodifica por hardware (Media Capabilities), e quem transmite prioriza um deles para aquele espectador.
- Buffer de reprodução de 120 ms para a tela recebida no celular, com menos engasgos em Wi-Fi e 4G.
- Política de transmissão: sob aperto, a resolução desce em degraus fixos (720/540/360p) e o FPS é mantido. A estimativa de banda do navegador não limita mais o codificador.
- Em telas de toque, os controles dos blocos ficam sempre visíveis. Em navegadores sem captura de tela, “Compartilhar tela” explica isso e oferece a câmera.

## v0.95 — Uma casa para cada turma
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

## v0.9 — Cada assunto no seu lugar
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

## v0.8 — Banner do perfil
_28/09/2026_

Troque a faixa colorida do seu cartão de perfil por uma imagem ou um GIF animado.

### Novidades
- Banner do perfil: em Configurações → Meu perfil, clique em "Mudar banner" e escolha uma imagem PNG, JPG ou WebP, ou um GIF animado de até 5 MB.
- A prévia nas configurações tem o mesmo tamanho do cartão de perfil, então você vê exatamente o que os outros vão ver.
- "Remover banner" volta para a faixa colorida, que usa a cor do seu avatar.

### Melhorias
- Imagens comuns são recortadas no centro na proporção do banner; GIFs são enviados inteiros para não perder a animação (até 1500 × 1500 px).

## v0.7 — Papo reservado
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

## v0.6 — Do seu jeito
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

## v0.5 — Cara de app de verdade
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

## v0.4 — Chamada completa
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

## v0.3 — Nasce o Resenhex
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

## v0.2 — Cara de Discord
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

## v0.1 — Primeira chamada
_27/09/2026_

O começo: a turma perdeu o servidor antigo e resolveu fazer o próprio.

### Novidades
- Chat de texto em canais, com histórico.
- Salas de voz e compartilhamento de tela.
- Scripts de um clique para abrir o servidor e mandar o link para os amigos.
