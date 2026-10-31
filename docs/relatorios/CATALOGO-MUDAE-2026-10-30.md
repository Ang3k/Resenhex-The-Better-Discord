# Conferência do catálogo do Mudae (30/10/2026)

Retrato do catálogo que está no ar (site 2.3.0, `discord-clone/server/mudae-catalogo.json`, gerado em 14/10). A conferência só mediu o problema e propôs regras. Em 31/10, com o OK do dono, os grupos A e B foram aplicados na branch, sem publicar (ver [Aplicado em 31/10](#aplicado-em-3110-grupos-a-e-b)).

Foram duas conferências no mesmo dia. A segunda veio depois do pedido do dono: **o catálogo tem que continuar grande, sem deixar passar casas e coisas, e sem tirar personagem de verdade** (o exemplo foi o T.V., filho do Jake em Hora de Aventura, que a primeira versão tirava). Os números abaixo já são os da segunda.

## Resumo

- O catálogo tem **233.747 personagens**, e não os 25 mil do começo. Ele cresceu em outubro, quando o gerador passou a puxar os elencos completos.
- **43% dos rolls do `$m` caem em algo que não deveria estar lá.** O maior culpado são as séries: 77 mil papéis de quem aparece em **um episódio só** ("Thug", "Brothel Girl", "Slot Machine Man"). Sozinhas, as séries são 45% do catálogo, e a roleta sorteia todos com a mesma chance.
- Nas wikis do Fandom entraram **lugares, armas, músicas, livros, golpes, tipos de inimigo e figurantes sem nome** como se fossem personagens. Zelda perde 75% das páginas, League of Legends 72% (são os contos de cada campeão), Sonic 45% e Honkai: Star Rail 41%.
- A "foto de imagem desconhecida" é a **foto-padrão das wikis** (silhueta, "No image available"). São 1.174 personagens, quase todos de Resident Evil, The Last of Us e Sonic. Em 21 deles a própria página tem outra foto com o nome do personagem (a Mrs. Krabs, por exemplo); esses vão para "dúvida" em vez de sair.
- O AniList (anime) e o Comic Vine (quadrinhos) estão limpos: só 3% e 0% sairiam.
- As regras tiram **100.978** personagens. **Ficam 132.769**, e outros **21.212** ficam em dúvida para o dono decidir (já contados nos que ficam). Se tirar também os em dúvida, ficam 111.557.
- **Cada regra foi conferida à mão** com amostras sorteadas: todas acertam 88% ou mais, e quase todas acertam 95% ou mais. Os erros achados viraram exceções.
- **Personagem já casado não pode sumir.** Hoje, se o ID sai do catálogo, ele some do harém sem aviso. A proposta mantém os casados fora da roleta, mas no álbum.

Exemplos com foto e nome lado a lado: `artifacts/catalogo-mudae-2026-10-30/exemplos.html` (abrir com `node servidor.js` na mesma pasta, ou pelo `catalogo-mudae-exemplos` do `.claude/launch.json`, em http://localhost:3221). A página tem botões "Concordo / Não concordo / Quero ver mais" em cada regra, um "Copiar respostas" para colar na conversa e, no fim, **o que mudou da primeira para a segunda conferência** (quem voltou e quem passou a sair, com fotos).

## Aplicado em 31/10 (grupos A e B)

O dono pediu "aplica os dois". Feito na branch `claude/catalogo-mudae`, sem publicar e sem enviar ao GitHub.

- **Ninguém foi apagado.** Os 100.978 que saem continuam no `mudae-catalogo.json` com `1` numa 8ª coluna ("fora da roleta"). O servidor (`server/mudae.js`) não sorteia esses, nem nas fotos que giram na roleta, mas quem já casou com um deles continua com ele no harém, no álbum, no ranking e no `$im`. Por isso não foi preciso ler o banco do ar.
- **Pontos e raridade de cada personagem não mudaram.** A posição de cada um continua contada com o catálogo inteiro (os pontos ficaram para depois, a pedido do dono). Nenhum casado perde valor.
- **O que muda para quem joga:** a roleta passa de 233.747 para 132.769 personagens. Os que saíram eram quase todos comuns, então cada roll tem mais chance de ser raro ou melhor:

| Raridade | Chance num roll hoje | Depois |
|---|---:|---:|
| Comum | 66,7% | 58,4% |
| Raro | 26,7% | 31,4% |
| Épico | 6,0% | 9,0% |
| Lendário | 0,67% (1 em 150) | 1,16% (1 em 86) |

- **As regras agora estão no gerador** (`discord-clone/tools/mudae-fontes/limpeza.js`), não só nos scripts da conferência: toda montagem nova marca de novo quem sai. `node tools/mudae-catalogo.js --limpar` refaz só a marca no catálogo publicado, sem consultar as fontes. Ele precisa do cache das wikis e do TMDB; numa worktree, `MUDAE_CACHE=` aponta para o cache da pasta principal. Conferido: o gerador marca exatamente os mesmos 100.978 da conferência e deixa os mesmos 21.212 em dúvida (esses continuam na roleta).
- **Testes:** `test/mudae-limpeza.test.js` (T.V., Chip and Dale, Ann Landers e Wattson ficam; revista, santuário, Ice Keese, foto-padrão e figurante de um episódio saem; Hitman, antologia e foto-padrão com outra foto ficam em dúvida) e um caso novo em `test/mudae.test.js`. Os 39 testes do Mudae passam. Em 20 mil rolls no catálogo novo, nenhum caiu em quem está fora.

## De onde vem o catálogo

`discord-clone/tools/mudae-catalogo.js` junta cinco fontes (código em `tools/mudae-fontes/`):

| Fonte | Letra | Origem | Personagens | Parte do `$m` |
|---|---|---|---:|---:|
| Anime | a | AniList (favoritos) | 43.340 | 19% |
| Jogos | g | IGDB (369) + 25 wikis do Fandom | 36.967 | 16% |
| Quadrinhos | c | Comic Vine + Wikidata | 7.270 | 3% |
| Desenhos | d | 26 wikis do Fandom | 40.628 | 17% |
| Séries | s | TMDB (foto do ator) | 105.542 | 45% |

Como o jogo usa o catálogo (`server/mudae.js`):

- **O roll é um sorteio simples**: todo personagem da lista tem a mesma chance. Por isso a cauda de figurantes pesa tanto.
- **Raridade e valor vêm da posição dentro da fonte**, proporcional ao tamanho dela (os 0,67% de cima são lendários). Se uma fonte encolhe, quem fica muda de posição relativa.
- **Casamentos guardam só o ID** (`server.mudae.claims[id]` de cada comunidade). O harém e o ranking ignoram IDs que não existem mais no catálogo.

## O que está errado, com números

Cada personagem pode ter mais de um motivo. A coluna "sai" conta as regras de corte; "dúvida" conta quem só tem motivos fracos ou é conhecido.

### Séries (TMDB): figurantes

O cache local do TMDB tem o número de episódios de cada papel. A distribuição dos 105.542:

| Episódios do papel | Personagens |
|---|---:|
| 1 | 78.512 (74%) |
| 2 a 3 | 12.411 |
| 4 a 9 | 7.937 |
| 10 a 24 | 3.814 |
| 25 ou mais | 2.868 |

Séries policiais e médicas dominam: *Lei & Ordem: SVU* sozinha tem 5.625 personagens, *NCIS* 3.292, *CSI* 2.838, *Grey's Anatomy* 2.274.

Outros sinais nas séries: 4.852 nomes que são só uma função ("Cop", "Clerk", "Paramedic", "Hot Dog Vendor"), 593 que são só parentesco ("Shannon's Mom"), e 1.118 papéis feitos pelo mesmo ator em outro papel da mesma série (como a foto é do ator, os dois ficam com a mesma cara).

### Wikis do Fandom: páginas que não são personagens

O gerador lê a categoria "Characters" de cada wiki e desce por todas as subcategorias. Em várias wikis isso traz o que não é personagem. O cache local (`tools/mudae-cache/consultas/`) tem, de cada página, a ficha, a primeira frase ("X is a song from…") e as categorias ("Locations in Breath of the Wild"), então dá para conferir sem baixar nada.

| O que é | Sai | Dúvida | Exemplos reais |
|---|---:|---:|---|
| Lugar | 1.001 | 80 | Korsh O'hu Shrine, Ordon Village, Hairy Shearers (barbearia dos Simpsons) |
| Objeto, arma ou veículo | 1.398 | 264 | Staff of Homa (arma de Genshin), Egg Hammer, Fake Emerald (Sonic) |
| Música, episódio, filme, revista ou jogo | 2.679 | 200 | Higitus Figitus, Royal Fun (mais de 2 mil músicas da Disney), "DC The Powerpuff Girls Issue 20", "Season 5" |
| Livro ou texto do jogo | 468 | 8 | Festive Culinary Guide (os "readables" de Honkai: Star Rail), contos do LoL |
| Missão, fase ou evento | 197 | 30 | missões do Sonic, fases de Zelda |
| Golpe, transformação ou termo | 547 | 352 | Radial Burst, Energy Ball, Super Ray (Sonic) |
| Sem descrição, mas a categoria da wiki diz que é coisa | 5.251 | 224 | páginas em "Locations", "Objects", "Songs", "Ships", "Ahri lore" |
| A ficha só tem campos de item ou lugar | 1.506 | 1.873 | Ancient Shield, Mighty Lynel Sword, Wii U |
| A foto é ícone de item | 15 | 12 | arquivos `Item_…`, `Weapon_…` sem ficha de personagem |
| Grupo ou espécie | 1.909 | 1.174 | Richwood High students, Salt Lake crew, times e facções |
| Tipo, espécie ou turma, falado no plural | 493 | 629 | "Ice Keese are recurring enemies", "Tusken Raiders are fictional creatures", "Star Lifts are objects" |
| Tipo de inimigo comum | 1.692 | 603 | Bazooka Shy Guy, Kura-Kura, Boomerang Boarblin |
| Figurante sem nome (a wiki marca "Unnamed" ou "Incidentals") | 2.363 | 474 | Paperboy, Monorail passenger, Incidental 44 (Bob Esponja) |
| Página de "pode se referir a" | 468 | | Charles, Angel |
| Relação ou lista | 266 | | "Interações entre Cameron e Lightning", "Enemies in Four Swords" |

Por wiki, a parte que sairia: Zelda 75% (5.494 de 7.320), League of Legends 72%, The Last of Us 47%, Total Drama 46%, Sonic 45%, Resident Evil 43%, Honkai: Star Rail 41%, Bob Esponja 39%, Simpsons 38%, Disney 33%. Final Fantasy, Mass Effect, Kingdom Hearts, Street Fighter e Looney Tunes ficam quase inteiras.

Os NPCs dos gachas (Genshin, Star Rail, Wuthering Waves) já estão com popularidade zero (só os jogáveis sobem). Eles são personagens de verdade e continuam; só saem os livros, as armas e os tipos de inimigo.

### Fotos

| Situação | Quantos | Observação |
|---|---:|---|
| Foto-padrão da wiki | 1.174 | `Actor_silhouette_-_Male/Female.png` (758, Resident Evil), `No_image_available.png` (180, The Last of Us), `No-image.png` (117, Sonic), `Mentioned.png` (Futurama), `Noimageperson.jpg` (Simpsons), `TBA.png` (Bob Esponja) |
| …e a página tem outra foto com o nome dele | 22 | Mrs. Krabs, Pua (Moana 2), Irina (Resident Evil). 21 vão para "dúvida" (a foto nova às vezes é cartaz ou cena escura); a Legion of Doom sai por ser grupo |
| …e a página tem outra foto, sem o nome | 349 | quase sempre cartaz, figurino ou foto de quem fala dele; não serve |
| Mesma foto em 3 ou mais personagens (fora séries) | 428 em dúvida | quase sempre livros do Star Rail ou páginas da mesma fase |
| Link quebrado | ~0 | navegador: 0 de 900 fotos de wiki e IGDB; HEAD: 0 de 150 AniList, 0 de 150 TMDB, 1 de 150 Comic Vine |
| Foto em formato de faixa (logo, banner) | ~0,6% | 5 de 900 na amostra |

O AniList já filtra a foto padrão dele (`default.jpg`) e o TMDB só aceita quem tem foto.

### Nomes

| Tipo | Sai | Dúvida | Exemplos |
|---|---:|---:|---|
| Só uma função | 6.426 | 875 | Kid 2, Photographer 2, Cop A, Seito B (aluno B), Tenin (atendente) |
| Só parentesco | 1.664 | 245 | Kallen no Haha (mãe da Kallen), Wirth no Chichi, Susan's Husband |
| Vazio ou só símbolos | 52 | 40 | |

Essas regras só valem fora do terço mais conhecido de cada fonte. Assim **ficam** em dúvida Senshi (Delicious in Dungeon), Guy (Street Fighter), The New Kid (South Park), Andy's Mom (Toy Story) e Shirogane no Chichi (Kaguya-sama). Nos quadrinhos o nome é codinome (Hitman, Night Man, Black Widow), então lá a regra nunca tira: só põe em dúvida.

### Repetidos

Só nas séries um nome repetido na mesma obra é o mesmo personagem: o mesmo papel com dois atores (Geralt com Cavill e com Hemsworth, Spartacus). São 14; fica o mais popular e o casamento passa para ele. No anime e nos quadrinhos, nome igual na mesma obra é personagem diferente (dois "Otto" em Magi, vários "Angel" em quadrinhos), então ninguém sai por isso. O mesmo personagem vindo de wikis diferentes (Bowser na wiki do Mario e na do Sonic) também fica: cada wiki mostra uma arte diferente.

## Segunda conferência: o que foi corrigido

A primeira versão tirava personagens de verdade em alguns casos. Cada regra foi conferida de novo com amostras sorteadas e lidas uma a uma, e os erros viraram exceções:

| O que voltou | Quantos | Exemplos |
|---|---:|---|
| Páginas em categoria de personagem que a ficha confundia com coisa | 664 | |
| Duplas e trios com nome próprio | 450 | Chip and Dale, Heebee & Jeebee, The Walrus and the Carpenter |
| "Repetidos" no anime e nos quadrinhos, que eram personagens diferentes | 198 | |
| Personagens descritos como carro ou brinquedo | 82 | os brinquedos de Toy Story, os carros de Carros |
| Codinomes e nomes próprios que pareciam função | 59 | KU-Repair, D-Man |
| NPCs que a frase chamava de "quest-exclusive NPC" | 10 | |
| NPCs com foto de ícone | 28 | |
| Com foto-padrão, mas com outra foto na página (agora em dúvida) | 21 | Mrs. Krabs, Pua |
| Outros (mídia, lugar, conceito, inimigo) | ~135 | |

Também ficam: T.V., Charlie, Kim Kil Whan, Viola e Jake Jr. (os filhos do Jake), Alphonse, Little Rose, Napstablook, Toriel, Knight Artorias, Sonya Blade, Chun-Li (a frase diz "martial artist", que não é profissão de pessoa real), a Wattson do Apex Legends (a foto dela é um ícone, mas a wiki diz "Controller Legend") e os aliens do Ben 10.

E passaram a sair coisas que a primeira versão deixava passar:

| O que passou a sair | Quantos |
|---|---:|
| Página sem descrição, mas com categoria de coisa | 2.097 |
| Figurante sem nome | 1.768 |
| Tipo de inimigo comum | 560 |
| Tipo, espécie ou turma falado no plural | 373 |
| Página de "pode se referir a" | 327 |
| Relação ou lista | 240 |
| Grupo ou espécie | 125 |
| Música, episódio, livro, objeto, golpe e lugar que a frase não pegava | ~420 |
| Nome que é só função | 50 |

### Quanto cada regra acerta

Amostras sorteadas, lidas uma a uma (o número é de cortes certos):

| Regra | Acerto | Regra | Acerto |
|---|---|---|---|
| Série com 1 episódio | 30 de 30 | Ficha de coisa | 57 de 60 |
| Nome que é função | 22 de 25 (os erros eram de quadrinhos, que agora só vão para dúvida) | Foto de ícone | 18 de 22 (os 4 já voltaram) |
| Nome de parentesco | 25 de 25 | Categoria de coisa | 89 de 90 |
| Lugar | 30 de 30 | Grupo ou espécie | 20 de 20 depois de devolver as duplas |
| Objeto, arma, veículo | 49 de 50 | Tipo no plural | 39 de 40 (o erro já voltou) |
| Música, episódio, filme | 22 de 22 | Tipo de inimigo | 47 de 50 |
| Livro ou texto | 22 de 22 | "Pode se referir a" | 30 de 30 |
| Missão ou evento | 20 de 22 (os 2 NPCs já voltaram) | Relação ou lista | 45 de 45 |
| Golpe ou termo | 30 de 30 | Figurante sem nome | 26 de 30 (os outros 4 têm apelido, mas a wiki diz sem nome) |

Quem fica também foi conferido: 75 de 75 personagens de verdade nas amostras de AniList, Comic Vine e IGDB; Zelda passou de 14 de 25 para 23 de 25; Disney 23 de 25; League of Legends caiu de 1.094 para 339 páginas, só com campeões e personagens.

### Teste final como a roleta (31/10)

Para ver o que o jogador vai encontrar, foram sorteados 100 personagens do catálogo limpo, todos com a mesma chance, como no `$m`, e lidos um a um. Depois, 100 dos que saem.

- **Dos 100 rolls do catálogo limpo, 97 são personagens de verdade.** Os outros 3: uma revista ("DC The Powerpuff Girls Issue 20"), um roteirista de verdade que já estava em dúvida (Aaron Sparrow, Disney) e um ET sem nome dos Simpsons ("Probe Alien"). A revista levou a uma regra nova pelo nome ("Issue 20", "Vol. 2", "Season 5", "Theme Song"), que tirou mais 72 páginas das Meninas Superpoderosas e de Steven Universo, sem pegar nenhum personagem.
- **Dos 100 que saem, 99 merecem sair**: 66 figurantes de série de um episódio, lugares de Zelda, músicas, comida, inimigos e figurantes sem nome. O único discutível é o Rickard Karstark (Game of Thrones), que o TMDB conta como 1 episódio.
- Na lista dos lendários de hoje que sairiam apareceu a Wattson (Apex Legends): a foto dela é um ícone, mas a wiki diz "Controller Legend". Ela agora fica, junto com os outros jogáveis do Apex.

## Proposta de regras

### Grupo A: alta certeza (85.658 saem)

1. **Foto-padrão** pelo nome do arquivo (lista fechada: silhueta, "no image", "Mentioned", "TBA", "placeholder"), menos quem tem outra foto com o nome na página.
2. **Séries: papel com um episódio só.** Exceção: séries de antologia (palavra-chave 9706 do TMDB: Black Mirror, Fargo, True Detective, American Horror Story, The White Lotus…), em que cada episódio tem protagonistas próprios. Esses 1.003 ficam em dúvida.
3. **Página de wiki que se descreve como lugar, objeto, música, livro, missão ou golpe.** A primeira frase manda: se ela diz "character", "NPC", "protagonist", "villain" etc., a página fica. Se a página também tem ficha ou categoria de personagem, vai para dúvida.
4. **"Pode se referir a"** e **relações ou listas**.
5. **Mesmo papel de série com dois atores** (o casamento passa para o que fica).
6. **Nome vazio.**

### Grupo B: média certeza (mais 15.320 saem)

7. Página sem descrição, mas com categoria de coisa e nenhuma de personagem (5.245).
8. Figurante sem nome, pela categoria da wiki (2.358).
9. Nome que é só função (1.865) ou parentesco (1.117), além dos já pegos no grupo A.
10. Grupo ou espécie (1.888) e tipo falado no plural (493). Dupla ou trio com nome próprio fica.
11. Tipo de inimigo comum (1.689).
12. Ficha só com campos de item ou lugar (1.500) e foto de ícone (15).

Todas as regras do grupo B poupam o terço mais conhecido da fonte (vai para dúvida), os jogáveis dos gachas e as páginas que se dizem personagem. As da wiki de Persona (Megami Tensei) também, porque a ficha dela não tem campo de gênero.

### Grupo C: em dúvida (21.212 ficam até o dono decidir)

- Séries com 2 ou 3 episódios: 12.119. Cortar deixaria as séries com 13.846 personagens (12% do `$m`).
- Mesmo ator em outro papel da mesma série: 1.118.
- Conhecidos que bateram em alguma regra: fichas estranhas (1.873), grupos (1.174), tipos no plural (629), inimigos (603), figurantes sem nome (474), nomes genéricos (875).
- Páginas de pessoas reais: 1.110. Misturam biografias de dubladores e roteiristas com participações especiais desenhadas (John Wayne nos Simpsons, os famosos de Family Guy) e personagens que são atores na história. A frase da wiki não separa bem uma coisa da outra.
- Mesma foto em 3 ou mais personagens: 428.
- Foto-padrão com outra foto na página: 21 (trocar a foto em vez de tirar).

### Como fica o catálogo

| Fonte | Hoje | Grupos A+B | Parte do `$m` depois | Se tirar também os em dúvida |
|---|---:|---:|---:|---:|
| Anime | 43.340 | 41.989 | 32% | 41.915 |
| Jogos | 36.967 | 24.829 | 19% | 21.986 |
| Quadrinhos | 7.270 | 7.270 | 5% | 7.200 |
| Desenhos | 40.628 | 31.001 | 23% | 26.610 |
| Séries | 105.542 | 27.680 | 21% | 13.846 |
| **Total** | **233.747** | **132.769** | | **111.557** |

## Efeito no jogo

### Na roleta

Hoje, de cada 100 rolls do `$m`, 43 caem em quem sairia e mais 9 em quem está em dúvida. Depois da limpeza, o anime passa de 19% para 32% dos rolls e as séries caem de 45% para 21%.

Mesmo limpo, o sorteio continua igual para todos: um personagem obscuro de anime sai tanto quanto o Gojo. Se a sensação de "não conheço ninguém" continuar, o próximo passo seria pesar o sorteio pela popularidade. Isso é uma mudança de regra do jogo, separada desta limpeza.

### Na raridade e no valor de quem fica

> Esta parte vale só se quem sai for apagado e a posição recontada. Na aplicação de 31/10 a posição continua contada com todos, então nada disto aconteceu: o valor de cada um ficou igual e a chance de raro ou melhor por roll subiu (tabela em "Aplicado em 31/10").

A porcentagem de cada raridade não muda, porque o jogo reparte cada fonte sempre na mesma proporção (`rarityOf` com `REF_SIZE` em `server/mudae.js`). O que muda é quantos existem:

| Raridade | Parte do catálogo (antes e depois) | Hoje | Depois (A+B) | Sem os em dúvida |
|---|---:|---:|---:|---:|
| Comum | 66,67% | 155.834 | 88.515 | 74.373 |
| Raro | 26,67% | 62.332 | 35.405 | 29.748 |
| Épico | 6,00% | 14.026 | 7.967 | 6.694 |
| Lendário | 0,67% | 1.555 | 882 | 742 |

Como o roll sorteia todos com a mesma chance, a chance de cada raridade num roll também fica igual: 2 em 3 comuns, 1 lendário a cada 150 rolls. Dos que saem, quase todos são comuns (78.348) ou raros (20.576); saem 2.035 épicos e 19 lendários. Os 19 lendários são 8 figurantes de série de um episódio ("Bartender" de The Mandalorian, "Jock" de Breaking Bad), o Geralt e o Spartacus repetidos (fica o outro ator) e páginas que não são personagem (Master Sword, Food, o jogo Ocarina of Time, filmes dos Jovens Titãs).

Como a raridade é proporcional ao tamanho da fonte, quem fica numa fonte que encolheu desce de faixa. Ninguém sobe. Dos 882 lendários que sobram, todos já eram lendários; 654 lendários de hoje viram épicos, 4.678 épicos viram raros e 11.029 raros viram comuns.

| Fonte | Descem uma faixa | Valor médio hoje → depois |
|---|---:|---|
| Séries | 10.169 de 27.680 | 214 → 128 |
| Desenhos | 2.924 | 144 → 128 |
| Jogos | 2.719 | 148 → 128 |
| Anime | 549 | 130 → 128 |
| Quadrinhos | 0 | 128 → 128 |

Lendários: séries de 703 para 184, jogos de 246 para 165, desenhos de 270 para 206, anime de 288 para 279, quadrinhos 48. Depois da limpeza, o valor médio fica igual em todas as fontes (128), o que deixa as fontes comparáveis entre si. Mas um jogador com um lendário de série que vira épico vê o harém valer menos.

### Nos casados

O banco do ar não foi lido para este relatório. Pela auditoria de 30/10, há pelo menos 286 casamentos num servidor só e um jogador com 192. O código de hoje (`owned()` em `server/mudae.js`) esconde do harém, do álbum e do ranking todo casamento cujo ID sumiu do catálogo, sem aviso. Por isso, nenhum ID casado pode simplesmente sair.

Plano proposto:

1. **Antes de gerar o catálogo novo**, tirar do banco a lista de IDs casados. O script só de leitura está pronto (`artifacts/catalogo-mudae-2026-10-30/contar-casados.js`): roda numa cópia do banco e devolve só IDs de personagem, sem nomes nem contas, como na auditoria. Com ela dá para dizer exatamente quantos casados cada regra pegaria.
2. **Casados que bateram numa regra viram "aposentados"**: continuam no catálogo com uma marca, aparecem no harém, no álbum, no ranking e no `$im`, mas saem da roleta. Isso pede uma mudança pequena no gerador (preservar os IDs casados) e no `server/mudae.js` (não pôr os aposentados nos sorteios).
3. **Repetidos de série**: o casamento passa para o ID que fica (o mapa está em `conferencia.json`, campo `destinoDosDuplicados`). Se a pessoa já tiver os dois, fica um só.
4. **Raridade**: escolher entre aceitar a queda (mais justo daqui para frente; avisar nas Novidades) ou guardar o valor de cada casamento no dia em que casou. A segunda opção muda o servidor e o ranking.

## Pontos e raridade: fazem sentido? (31/10)

Como o jogo calcula (`server/mudae.js`): cada fonte é ordenada pela popularidade; a posição vira uma "posição equivalente" numa fonte de 15 mil; o valor do card é `1200 / (1 + posição/250)^0,8` (mínimo 30) e a raridade sai da mesma posição. O valor do harém e o ranking somam os cards.

| Raridade | Parte de cada fonte | Pontos |
|---|---:|---|
| Lendário | 0,67% | ~920 a 1.200 |
| Épico | 6% | ~330 a 920 |
| Raro | 26,7% | ~105 a 330 |
| Comum | 66,7% | 30 a 105 |

A curva é boa: um lendário vale de 10 a 40 comuns, e quem junta muitos comuns não passa fácil quem tem lendários.

A popularidade de cada fonte:

- **Anime (favoritos no AniList), séries (votos da série dividido pela ordem no elenco) e quadrinhos (páginas na Wikidata): bem ordenados.** O topo é Gojo, Levi, Luffy, Killua e Eren; Tyrion, Joyce Byers, Walter White e Jon Snow; Homem-Aranha, Batman, Superman e Mulher-Maravilha. Detalhe pequeno: nas séries o mesmo personagem às vezes vem duas vezes com nomes diferentes (Seong Gi-hun e "Player 456"; Wanda Maximoff e "Scarlet Witch"), e os dois ficam lendários.
- **Jogos e desenhos: a divisão entre franquias não é justa.** O gerador ordena cada wiki pelo tamanho das páginas (com os jogáveis e os "âncoras" na frente) e depois intercala as wikis: o 1º de cada uma, depois o 2º de cada uma, e assim por diante. Cada franquia ganha uns 7 lendários e uns 65 épicos, seja ela pequena ou grande:

| Franquia | Personagens | Lendário ou épico hoje |
|---|---:|---:|
| Undertale, Deltarune, Free Fire | 42 a 61 | **100%** (até figurante) |
| Apex Legends | 68 | 97% |
| Hazbin Hotel, A Casa da Coruja | 130 a 141 | 56% a 62% |
| Mario, Zelda, Sonic | 1.800 a 3.300 | 2% a 4% |
| Simpsons, Genshin, Disney | 3.700 a 8.800 | 1% a 2% |

  Por isso a Kelly do Free Fire vale 1.134 (lendária) e o Napstablook 680 (épico), enquanto o Stitch e o Shadow são épicos.
- **IGDB (369 personagens de jogos sem wiki própria) não tem popularidade por personagem**, só a do jogo. Dentro do mesmo jogo a ordem é ao acaso: "William Angio - Fame or Shame" (GTA) fica em 3º, à frente do Arthur Morgan (18º); a Lara Croft vale 388 e o Master Chief 213. Somar os pontos de todos os jogos do personagem também não resolve (Athena e "Tommy" sobem para o topo).

### Proposta

1. **Dar a cada franquia vagas proporcionais à raiz do tamanho dela** (o nº k de uma franquia com N personagens recebe `√N / k`, em vez de `1 / k`). Simulado no catálogo limpo:

| | Hoje | Com a raiz |
|---|---|---|
| Undertale | 6 lendários, 36 épicos (100%) | 1 lendário (Sans), 15 épicos (38%) |
| Free Fire | 100% | 37% (Kelly vira épica) |
| Hazbin Hotel | 62% | 23% (Alastor continua lendário) |
| Mario | 6 lendários, 3% | 12 lendários, 6% |
| Disney | 8 lendários, 1% | 26 lendários, 3% (Stitch vira lendário) |
| Sonic | Shadow épico | Shadow lendário |

   Ninguém famoso perde: Mario, Link, Zelda, Homer, Mickey, Elsa, Woody, Bob Esponja, Sans, Susie, Alastor e Luz continuam lendários. Testei também pesos maiores: com o tamanho inteiro (`N / k`), Sans e Alastor viram épicos e o Master Chief vira comum, então a raiz é o meio-termo.
2. **Uma lista de "âncoras" para o IGDB**, como o gerador já tem para Genshin, LoL e Disney: Kratos, Arthur Morgan, Lara Croft, Master Chief, Geralt, Nathan Drake, Ellie, Joel, Ezio, Commander Shepard, GLaDOS, Solid Snake e Samus vão para a frente do IGDB. Sem isso, o topo do IGDB é sorteio entre o elenco dos jogos mais votados.

As duas mudanças são no gerador (`tools/mudae-fontes/coleta.js`, `qualidade.js`) e mudam o valor de quem já casou. Por isso entram junto com a limpeza e com a decisão da raridade dos casados. Arquivos: `artifacts/catalogo-mudae-2026-10-30/pontos-hoje.txt` (cada franquia e os famosos) e `pontos-simulacao.txt` (os pesos testados), feitos por `scripts/pontos.js` e `scripts/simula-pontos.js`.

## Como conferir as fotos sem baixar tudo de novo

- **Foto-padrão**: pelo nome do arquivo, como feito aqui. Não precisa de rede.
- **Foto substituta**: a API do Fandom (`api.php?action=query&prop=images`) lista as imagens de cada página e responde ao Node (só o servidor de imagens recusa script). O `fotos-substitutas.js` escolhe a que tem todas as palavras do nome no arquivo ("Briny-Buddies-Mrs-Krabs.jpg" serve para a Mrs. Krabs; "Mr-Krabs" não).
- **Link quebrado**: o servidor de imagens do Fandom recusa pedidos de script (responde 403 ao Node), mas abre no navegador. A conferência por amostra no navegador (900 fotos) e por `HEAD` nas outras fontes (750) não achou problema; não vale conferir as 169 mil.
- **Mesma imagem com nomes diferentes**: a API do MediaWiki devolve o SHA-1 e o tamanho de cada arquivo (`prop=imageinfo&iiprop=sha1|size`) sem baixar a imagem. Dá para pôr no gerador se aparecerem fotos-padrão com nomes novos.

## O que o dono precisa decidir

1. ~~Aplicar o **grupo A**? E o **grupo B**?~~ Aplicados em 31/10, na branch.
2. Cortar também as séries com **2 ou 3 episódios**?
3. ~~Pode rodar o **script dos casados** numa cópia do banco do ar?~~ Não precisa mais: nenhum ID sai do catálogo.
4. ~~Raridade dos casados: aceitar a queda ou guardar o valor do dia do casamento?~~ Não houve queda: a posição continua contada com todos. Volta a valer só se um dia a posição for recontada sem os que saíram.
5. Nos 21 com foto-padrão e outra foto na página: **trocar a foto** (conferindo uma a uma) ou tirar?
6. Pontos: dividir as vagas de lendário e épico entre as franquias **pela raiz do tamanho** e pôr as **âncoras do IGDB**?
7. **Publicar** a limpeza (junto com uma versão nova do site)?

## Como refazer a conferência

Tudo em `artifacts/catalogo-mudae-2026-10-30/` (fora do Git); só lê o catálogo e o cache local, menos o `fotos-substitutas.js`, que consulta a API do Fandom:

```bash
cd artifacts/catalogo-mudae-2026-10-30/scripts
node eps.js eps.json                       # episódios de cada papel, do cache do TMDB
node fandom-fichas.js fichas.json          # ficha, primeira frase e categorias de cada página das wikis
node fotos-substitutas.js ../conferencia.json ../fotos-substitutas.json   # depois de uma primeira conferência
node --max-old-space-size=10000 conferencia.js eps.json fichas.json .. > ../conferencia.txt
node efeito.js ../conferencia.json so-sai ../efeito.json > ../efeito.txt
node efeito.js ../conferencia.json com-revisar ../efeito-com-revisar.json > ../efeito-com-revisar.txt
node pagina.js ../conferencia.json fichas.json ../efeito.json ../exemplos.html ../conferencia-anterior.json ../fotos-substitutas.json
```

As regras ficam em `conferencia.js` (descrição e ficha), `categorias.js` (o que as categorias da wiki dizem) e `regras.js` (nomes e duplas). O catálogo lido é o da pasta principal (`C:/Games/project2/discord-clone/server/mudae-catalogo.json`; outro com `CAT=...`). Arquivos: `conferencia.json` (motivo de cada personagem marcado e o destino dos repetidos), `conferencia-anterior.json` (a primeira conferência, para a página mostrar o que mudou), `conferencia.txt` (a tabela por regra e por wiki), `efeito*.txt`, `fotos-substitutas.json`, `fotos-amostra.json`, `exemplos.html`. Os números pequenos estão em `docs/relatorios/catalogo-mudae-2026-10-30/`.

## Limites desta medição

- As regras foram conferidas com amostras de 20 a 90 por regra, lidas uma a uma. Deve sobrar algum erro; a página de exemplos serve para isso.
- Ainda passam, sem regra boa para pegar: páginas sem descrição e com categoria neutra (misturam personagens e coisas), algumas cartas do Legends of Runeterra, "Dilbert" em Family Guy (é a tirinha) e as variantes dos Pocket Mortys. Gente da equipe (storyboard, roteiro) cai em "pessoa real", em dúvida.
- "Conhecido" é o terço de cima da própria fonte, pela popularidade que o gerador já usa (favoritos no AniList, tamanho da página nas wikis, votos no TMDB).
- Os números de episódios vêm do cache do TMDB de 03/10.
