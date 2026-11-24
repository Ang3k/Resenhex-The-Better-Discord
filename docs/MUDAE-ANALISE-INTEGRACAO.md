# Mudae do Resenhex: como funciona hoje (base para integrar com o Mudae original)

Documento gerado a partir da leitura do código em 23/11/2026. Tudo aqui foi conferido no código; onde algo é
suposição ou não pude verificar, está marcado com **[não verificado]**.

Caminhos são relativos a `discord-clone/`, salvo quando indicado.

---

## 0. Resumo em 12 linhas

- O Mudae do Resenhex **não é um bot do Discord**. É um módulo do próprio servidor Node (`server.js`), que roda dentro de
  canais de texto marcados com `mudae: true` (os "Salões").
- Os **personagens vêm de um arquivo estático**, `server/mudae-catalogo.json` (233.747 linhas, ~33 MB), gerado offline por
  `tools/mudae-catalogo.js` a partir de 5 fontes públicas: AniList, IGDB, Comic Vine, TMDB e wikis do Fandom.
- O servidor **nunca chama essas APIs**. Ele converte o JSON num SQLite (`mudae-catalogo.db`) e mantém só números na memória.
- **As imagens não são hospedadas por nós.** O card leva a URL original da fonte e o navegador carrega direto de lá.
- Um personagem é identificado por um **id de texto/número que vem da fonte** (`127691`, `g1832`, `d-simpsons-36238`,
  `s1399-22970`...). Casamentos, desejos, histórico e favoritos são guardados por esse id.
- **Raridade e valor não existem no catálogo**: são calculados na hora a partir da posição do personagem no ranking da
  própria fonte (campo "popularidade", coluna 6).
- 132.769 dos 233.747 estão ativos na roleta; os outros 100.978 estão "fora da roleta" (coluna 8 = 1), mas continuam no
  catálogo para quem já casou com eles.
- O estado do jogo (casamentos, kakera, desejos, medalhas, poderes) fica em `db.mudae` de **cada comunidade (servidor)**,
  persistido no SQLite `data.db`.
- Comandos usam o prefixo `$` (`$w`, `$h`, `$m`, `$mm`, `$im`, `$top`...), com os nomes do Mudae original, mais extras em português.
- Há uma camada de jogo própria que o Mudae original não tem (Forja de medalhas, 8 superpoderes, cristal errante, trocas
  por tela), mas tudo é desligável da integração porque só depende de `claims` e `kakera`.

---

## 1. Arquitetura e arquivos

### 1.1 Servidor (`server/`)

| Arquivo | Linhas | Papel |
|---|---|---|
| [mudae.js](../discord-clone/server/mudae.js) | 954 | Núcleo: parse de comandos, sorteio, limites, casamento, harém, desejos, trocas, rankings. |
| [mudae-catalogo-banco.js](../discord-clone/server/mudae-catalogo-banco.js) | 537 | Carrega o JSON → SQLite → arrays tipados. Lookup por id, busca por nome, cache de cartas. |
| [mudae-catalogo.json](../discord-clone/server/mudae-catalogo.json) | 233.749 | O catálogo. Uma linha de array por personagem. |
| [mudae-regras.js](../discord-clone/server/mudae-regras.js) | 94 | Todos os números da economia (medalhas, cristal, poderes, teto de divórcio). |
| [mudae-conta.js](../discord-clone/server/mudae-conta.js) | 54 | Kakera, contadores (`stats`), teto diário do divórcio, "dia do jogo" (vira à meia-noite de Brasília). |
| [mudae-forja.js](../discord-clone/server/mudae-forja.js) | 121 | Medalhas (7 × 4 níveis) e acabamentos. `perksOf()` alimenta o resto do jogo. |
| [mudae-poderes.js](../discord-clone/server/mudae-poderes.js) | 80 | Quais poderes a pessoa destravou, 3 espaços, recarga. |
| [mudae-cristal.js](../discord-clone/server/mudae-cristal.js) | 121 | Cristal errante (nascimento, quem pegou, quanto paga). Só memória. |

Ligação com o servidor HTTP/Socket em [server.js](../discord-clone/server.js):
- Instanciação: linhas ~946-960 (`createMudae`, `createForja`, `createPoderes`, `createCrystals`).
- Tick do cristal (`setInterval`) e aviso de "rolls voltaram": ~962-1017.
- Trocas (timers, mensagens): ~1019-1050.
- Comandos e eventos de socket: ~2256-2800.
- Roteamento do texto: em `chat:send`, `mudae.parse(text)` roda **antes** das regras de mensagem normal (~2820).

### 1.2 Cliente (`public/`)

| Arquivo | Linhas | Papel |
|---|---|---|
| `mudae.js` | 704 | Renderiza as respostas do bot no chat (cards, harém, `$im`, `$tu`, rankings). Define `MudaeFotos` (política de imagem). |
| `mudae-salao.js` | 1323 | Tela completa do Salão: roleta, Mesa ao vivo, álbum, Personagens, Ranking, "No salão". |
| `mudae-forja.js`, `mudae-medalhas.js`, `mudae-poderes.js`, `mudae-cristal.js`, `mudae-troca.js`, `mudae-icones.js` | — | UI dos subsistemas. |
| `gacha/*.mjs` | — | Cena 3D antiga (cápsula/máquina). **Retirada do Salão**, não carrega Three.js; fica só como referência. |
| `assets/mudae-frames/{common,rare,epic,legendary}.webp` | — | Molduras dos cards por raridade (únicos assets de imagem do Mudae hospedados por nós). |

O servidor decide tudo (sorteio, limites, quem casou primeiro). O cliente só desenha.

### 1.3 Ferramentas (`tools/`)

| Arquivo | Papel |
|---|---|
| [mudae-catalogo.js](../discord-clone/tools/mudae-catalogo.js) | Orquestrador do build do catálogo (ver §3). |
| `mudae-fontes/anilist.js, igdb.js, comicvine.js, tmdb.js, fandom.js` | Um coletor por fonte. |
| `mudae-fontes/coleta.js, comum.js, limite.js` | Utilitários: cache de consultas, retry, rate limit, validação. |
| `mudae-fontes/qualidade.js, pessoas-reais.js, pessoas-reais-revisadas.json` | Remove páginas auxiliares e biografias de pessoas reais. |
| `mudae-fontes/limpeza.js` | Marca "fora da roleta" (coluna 8). |
| [montar-catalogo-mudae.js](../discord-clone/tools/montar-catalogo-mudae.js) | Roda no `pretest`: monta o molde `server/mudae-catalogo.db` para os testes. |
| [mudae-economia.js](../discord-clone/tools/mudae-economia.js) | Simulador da economia (kakera/dia, tempo para medalhas). Sai com código 1 se os marcos saírem da faixa. |

### 1.4 Testes (`test/`)

~22 arquivos `mudae-*.test.js` (catálogo, comandos, conta, cristal, forja, poderes, regras, troca, limite, limpeza,
linhas, pessoas reais, qualidade, servidor, vantagens, efeitos...). `mudae-server.test.js` sobe o servidor com
`MUDAE_CATALOG` apontando para um catálogo pequeno. **Qualquer integração deve passar por esses testes.**

---

## 2. O catálogo de personagens

### 2.1 Formato de uma linha

Array posicional (sem chaves), um por linha no arquivo, dentro de um `[ ... ]` externo:

```
[ id, nome, obra, foto, gênero, popularidade, fonte, foraDaRoleta? ]
   0    1    2     3      4          5          6          7
```

| Col | Campo | Detalhe |
|---|---|---|
| 0 | `id` | Número (anime) **ou** texto. Ver §2.2. |
| 1 | `nome` | Nome exibido. |
| 2 | `obra` | Nome da obra/franquia (texto livre; é a chave do `$obra` e do `$top <obra>`). 3.220 obras distintas. |
| 3 | `foto` | URL completa, **exceto anime**, onde é só o final do caminho do CDN do AniList (ver §2.4). |
| 4 | `gênero` | `"M"`, `"F"` ou `""`. |
| 5 | `popularidade` | Número. **A escala muda por fonte** (ver §2.3). |
| 6 | `fonte` | Letra: `a` anime, `g` jogos, `c` quadrinhos, `d` desenhos, `s` séries. Ausente = `a` (linhas antigas). |
| 7 | `fora` | `1` = fora da roleta. Ausente/0 = ativo. Só existe em 100.978 linhas. |

Exemplos reais do arquivo:

```json
[127691,"Satoru Gojou","JUJUTSU KAISEN","b127691-9zqh1xpIubn7.png","M",39266,"a"]
["g1832","William Angio - Fame or Shame","Grand Theft Auto","https://images.igdb.com/igdb/image/upload/t_cover_big_2x/cm308.jpg","M",333333,"g"]
["c1443","Spider-Man","Marvel","https://comicvine.gamespot.com/a/uploads/scale_large/12/124259/....jpg","M",12818141,"c"]
["d-simpsons-36238","Homer Simpson","Os Simpsons","https://static.wikia.nocookie.net/simpsons/images/6/67/....png/revision/latest/scale-to-width-down/400?cb=20260201075614","M",1000000,"d"]
["s1399-22970","Tyrion 'The Halfman' Lannister","Game of Thrones","https://image.tmdb.org/t/p/w342/9CAd7wr8QZyIN0E7nm8v1B6WkGn.jpg","M",27861,"s"]
```

### 2.2 Formato dos ids (importante para integração)

| Fonte | Padrão do id | Origem |
|---|---|---|
| Anime/mangá | inteiro `127691` | ID do personagem no AniList |
| Jogos (IGDB) | `g<igdbId>` ex. `g1832` | ID do IGDB |
| Jogos (wikis) | `g-<wiki>-<pageId>` ex. `g-mario-178619` | ID da página no Fandom |
| Quadrinhos | `c<comicvineId>` ex. `c1443` | ID do Comic Vine |
| Desenhos | `d-<wiki>-<pageId>` ex. `d-simpsons-36238` | ID da página no Fandom |
| Séries | `s<tmdbShowId>-<tmdbPersonId>[-<hash12>]` | TMDB; o sufixo hash aparece quando um ator faz vários personagens |

Regras que o código impõe:
- O id é guardado e comparado **como texto** (`String(id)`), mas ids numéricos têm índice próprio (busca binária por valor).
- **Ids não podem se repetir** (`validateRows` lança erro). Se repetissem, valeria o último na ordem.
- Ids publicados **nunca podem sumir** entre montagens do catálogo (o build aborta com `A montagem perderia IDs de
  personagens publicados`), porque casamentos antigos dependem deles.
- Há limite de 64 caracteres para ids vindos do cliente (`charKey`).

### 2.3 Popularidade, posição, raridade e valor

A coluna 5 **não é comparável entre fontes**:

| Fonte | O que é a "popularidade" | Escala observada |
|---|---|---|
| a | `favourites` do AniList | 39.266 no topo |
| g (IGDB) | `total_rating_count` do jogo | ex. 333.333 |
| g/d (wikis) | `1e6/(posição+1)` ou tamanho do artigo | até 1.000.000 |
| c | nº de sitelinks Wikidata × 100.000 + aparições em edições | até 12.818.141 |
| s | `vote_count` da série ÷ (ordem no elenco) | 27.861 no topo |

Por isso o servidor **ignora o valor absoluto** e faz assim (`montar()` em `mudae-catalogo-banco.js`):

1. Dentro de cada fonte, ordena por score decrescente → `pos` (1 = o mais popular da fonte).
2. Posição equivalente: `eq = pos × 15000 / tamanhoDaFonte`. (`REF_SIZE = 15000`; fontes menores "esticam" a escala,
   de modo que a chance de lendário é igual em todas.)
3. O personagem global `k` é o índice na lista de todos ordenados por `eq` (empate: ordem de aparição da fonte).

Daí tudo é derivado em tempo de execução (nada disso está no JSON):

| Derivado | Fórmula |
|---|---|
| Raridade | `eq ≤ 100` lendário · `≤ 1000` épico · `≤ 5000` raro · senão comum |
| Valor (kakera) | `max(30, round(1200 / (1 + (eq-1)/250)^0.8))` → nº1 vale 1200, o 15.000º uns 45 |
| Rank mostrado | `pos` (posição dentro da própria fonte) |

> **Consequência para a integração:** um personagem novo só entra na escala se tiver um número em "popularidade"
> comparável aos da sua fonte. A posição de **todos** muda quando entra gente nova (as raridades são relativas).

### 2.4 Imagens

- O catálogo guarda **só a URL**. Não há download, cache local nem proxy de imagem para os personagens.
- Anime: a coluna guarda só `b127691-9zqh1xpIubn7.png`; o servidor prefixa
  `https://s4.anilist.co/file/anilistcdn/character/large/` (`imageOf()` em `mudae.js`). Qualquer valor que comece com
  `http(s)://` é usado como veio.
- Hosts atuais: `s4.anilist.co`, `images.igdb.com`, `comicvine.gamespot.com`, `image.tmdb.org`, `static.wikia.nocookie.net`
  (~45 wikis).
- Miniaturas (isca da roleta) trocam o tamanho na URL (`thumbOf`): Fandom 400→200, Comic Vine `scale_large`→`scale_small`,
  IGDB `t_cover_big_2x`→`t_cover_big`, TMDB `w342`→`w185`. **Qualquer host novo que queira miniatura precisa de regra aqui.**
- **Referer:** o Fandom devolve um 404 falso com figura cinza (300×171) quando recebe Referer. O cliente carrega tudo com
  `referrerPolicy: 'no-referrer'`, detecta a figura cinza (`MudaeFotos.isPlaceholder`) e tenta de novo com `?resenhex=1`.
  Qualquer host externo novo vai precisar de teste de hotlink.
- No SQLite as URLs são comprimidas por prefixo (`fotoCurta`/`fotoInteira`): os 4 prefixos mais comuns viram um byte de
  controle. A volta é exata para qualquer texto. Um prefixo novo exige mexer em `PREFIXOS` **e** subir `FORMATO`.

### 2.5 Números atuais

| Fonte | Total | Ativos na roleta | Sem gênero |
|---|---:|---:|---:|
| a anime | 43.340 | 41.989 | 15.444 |
| g jogos | 36.967 | 24.829 | 18.950 |
| c quadrinhos | 7.270 | 7.270 | 324 |
| d desenhos | 40.628 | 31.001 | 11.778 |
| s séries | 105.542 | 27.680 | 4.874 |
| **Total** | **233.747** | **132.769** | 51.370 |

Gênero: M 116.422 · F 65.955 · vazio 51.370. Obras distintas: 3.220.

---

## 3. Como o catálogo é construído (offline)

Comando: `node tools/mudae-catalogo.js [fontes...] [--retomar] [--juntar] [--limpar] [--anime-paginas=N] [--series-populares=N] [--quadrinhos-paginas=N]`

Chaves de API em `tools/mudae-chaves.json` (fora do Git): `igdbClientId`, `igdbClientSecret`, `comicVineKey`, `tmdbKey`.
Cache de consultas e relatórios em `tools/mudae-cache/` (fora do Git).

### 3.1 Fluxo do `main()`

1. Lê o catálogo publicado (`previous`), tira a coluna 8 e faz **backup** em `tools/mudae-cache/backups/<data>.json`.
2. `--limpar`: só refaz a marca "fora da roleta" e termina.
3. Para cada fonte (em paralelo, `Promise.all`): chama o coletor, valida (`validateRows`), mescla com o anterior
   (`preserveRows`: **ids antigos são mantidos mesmo que a fonte não os devolva mais**) e salva em `mudae-cache/<fonte>.json`.
4. Junta as 5 fontes → `correctCatalog()` (qualidade) → confere que nenhum id publicado sumiu.
5. `marcarForaDaRoleta()` (limpeza) e grava `server/mudae-catalogo.json` (um personagem por linha, escrita atômica via `.tmp`).
6. Gera `tools/mudae-cache/relatorio.json` com contagens e status (`complete`/`partial`; parcial sai com código 1).

### 3.2 Coletor por fonte

| Fonte | API | Como seleciona | Limites |
|---|---|---|---|
| **AniList** (`anilist.js`) | GraphQL `graphql.anilist.co` | Obras já no catálogo + 8 páginas × 25 das obras mais populares de ANIME e de MANGA; para cada obra pagina o elenco inteiro por `FAVOURITES_DESC` (8 obras por pedido). Gênero: `Female`→F, `Male`→M. Popularidade = `favourites`. Descarta sem nome/imagem/foto padrão (`default.jpg`). | 1 pedido a cada 2,1 s |
| **IGDB** (`igdb.js`) | `api.igdb.com/v4/characters` via login Twitch | Todos os personagens com `mug_shot`, 500 por página. Obra = franquia do jogo; popularidade = `total_rating_count` do melhor jogo. | 1 pedido a cada 0,3 s |
| **Comic Vine** (`comicvine.js`) | `comicvine.gamespot.com/api/characters` | 50 páginas de 100 "nativas" + todos os ids mapeados no Wikidata (SPARQL, P5905). Exclui editoras de mangá/jogos (`SKIP_PUBLISHER`) e humanos reais (Wikidata P31=Q5). Popularidade = sitelinks×100.000 + aparições. | **200 pedidos/h** (`hourlyPacer`), então demora |
| **TMDB** (`tmdb.js`) | `api.themoviedb.org/3` (pt-BR) | Séries já presentes + as 340 mais votadas, sem gêneros de animação/reality/talk. Cada papel nomeado com foto do ator vira personagem (**a foto é a do ator**). Filtra papéis genéricos ("Cop #2", "Self"). Popularidade = `vote_count / (ordem+1)`. | 1 pedido a cada 0,12 s |
| **Fandom** (`fandom.js`) | `<wiki>.fandom.com/api.php` (MediaWiki) | **Não há API de personagens**: percorre a categoria `Characters` (e subcategorias) de ~25 wikis de desenho e ~25 de jogos; foto = `pageimages` original redimensionada para 400 px; gênero da infobox, ou pelos pronomes da descrição; popularidade = tamanho do artigo. Disney/Pixar/DreamWorks usam o filme da infobox como obra. | 1 pedido a cada 150 ms, 3 wikis em paralelo |

Jogos = IGDB + 25 wikis de jogo, mesclados por `mergeByRank` (dedupe por **nome + obra**).

### 3.3 Qualidade e limpeza (o que impede lixo na roleta)

- `qualidade.js`: remove páginas auxiliares (`relationships`, `list of`, `disambiguation`...), **biografias de pessoas reais**
  (`pessoas-reais.js` + lista revisada à mão com 6.162 linhas) e rebaixa NPCs nos gachas (Genshin, Star Rail, Wuthering Waves)
  usando a categoria de "jogáveis". Há âncoras revisadas por franquia (`ANCHORS`) para garantir que Elsa, Mickey, Jinx etc.
  fiquem no topo.
- `limpeza.js` (368 linhas): marca `1` na coluna 8 para o que não é personagem: lugares, itens, músicas, tipos de inimigo,
  figurantes de um episódio só, fotos-padrão, nomes de função ("Cop 2"). **Quem sai continua no catálogo**, o servidor só
  não sorteia; casamentos antigos permanecem no harém, álbum, ranking e `$im`. Posição/valor/raridade contam com todos.
- Dedupe sempre por **nome normalizado + obra**, para manter homônimos de franquias diferentes.

### 3.4 Detalhes que quebram fácil

- O JSON é lido **linha a linha** (`lerCatalogo`): precisa ter um personagem por linha, `[` e `]` sozinhos. Se alguma
  linha fugir disso, cai para `JSON.parse` do arquivo inteiro (mais memória).
- `validateRows` exige exatamente **7 colunas** nas fontes; o 8º campo só é posto na última etapa.
- `isSource` no servidor só aceita letras de `SOURCES` (`a g c d s`). **Linha com outra letra é descartada em silêncio.**

---

## 4. Como o servidor carrega e usa o catálogo (runtime)

`createMudae({ catalogFile, catalogDb })` → `openCatalog()` em `mudae-catalogo-banco.js`:

1. **Decide qual banco usar**: `data.db`-vizinho `mudae-catalogo.db` se servir (mesmo `FORMATO`, `refSize`, tamanho e
   hash do JSON); senão o molde `server/mudae-catalogo.db` (testes); senão **monta de novo** (log
   `[mudae] catálogo montado em ... (N ms)`). Montagem em arquivo `.gerando` e `rename` no fim.
2. **Duas passadas** sobre o JSON: a 1ª só guarda nota/fonte/gênero/fora/obra para ordenar; a 2ª grava
   `c(idx, id, name, img)` em ordem de `k`.
3. **Na memória** (arrays tipados, ~1 a 4 bytes por personagem): `src`, `gen` (0/1/2), `fora`, `pos`, `sid` (obra),
   mais índice de ids (numéricos por valor, textos por hash FNV-1a) e as **chaves de busca** (nome normalizado) num único
   Buffer fora do heap.
4. **Listas de sorteio** (`pools`): `m` (todos ativos), `w`, `h`, e uma por fonte (`ma`, `wg`, `hs`...), cada uma um
   `Int32Array` de `k` ordenado do mais para o menos popular. Nunca mudam depois de prontas.
5. **Texto (id, nome, foto)** vem do SQLite sob demanda, com cache de duas gerações (2 × 6.000 cartas).
6. Ao iniciar, `mudae.preload(ids com dono)` já aquece o cache.

**Normalização de nome** (`normalize`): NFD, tira acentos, minúsculas, tudo que não for letra/número vira espaço.
É a base de `$im`, `$wish`, `$wr`, `$give`, `$fm`, `$divorce` e do `$obra`.

**Busca** (`search`): igual > começa com > contém, o primeiro por `k` (o mais popular). Primeiro só entre ativos,
depois entre todos (por isso `$im` acha personagens "fora da roleta").

> Por ser tudo por `k` (índice na ordem de popularidade), **o `k` não é estável entre montagens**. O que é estável é o
> **id**. Nada persistido usa `k`.

---

## 5. Comandos

Parse: `^\$(\S+)(?:\s+(.*))?$`, nome em minúsculas, procurado em `COMMANDS`. O que não casa **vira mensagem normal**.
Só funcionam dentro de um Salão; fora dele o bot responde com um redirecionamento para o Salão.
Rate limit: 8 comandos / 5 s por conta.

| Comando (apelidos) | O que faz | Regras principais |
|---|---|---|
| `$w` `$waifu` / `$h` `$husbando` / `$m` `$marry` | Roda um personagem F / M / qualquer | Consome 1 roll. |
| `$wa $wg $wc $wd $ws`, `$ha…`, `$ma…` | Mesmo, filtrado por fonte (anime/jogos/quadrinhos/desenhos/séries) | Sem personagens daquele gênero, vale a fonte; sem a fonte, vale tudo. |
| `$mm` `$harem` [@pessoa] | Harém (até 300 cartas) | Ordem: valor. `$mma` A–Z · `$mms` por obra · `$mmr` mais recentes. |
| `$im` `$info` nome | Card + dono, desde quando, como (claim/give/trade), nº de donos, quem deseja | Busca em todo o catálogo. |
| `$divorce` `$divorciar` nome | Solta o personagem | Devolve o valor em kakera, **teto 200 / 24 h**. |
| `$tu` | Status: rolls, janela de casamento, kakera, `$daily`, `$dk`, poderes prontos | Resposta só para quem pediu (não é gravada). |
| `$k` `$kakera` | Saldo e cristais do dia | Idem. |
| `$dk` `$dailykakera` | +250 kakera (500 com Ouro IV) | A cada **20 h**. |
| `$daily` | Devolve todos os rolls na hora | A cada 20 h; não gasta se ainda tem todos. |
| `$rolls` | Compra os rolls de volta por 500 kakera | Até **3 vezes / 24 h**. |
| `$givek` `$givekakera` @pessoa n | Dá kakera | |
| `$give` `$dar` @pessoa nome | Dá um personagem do seu harém | Só quem dá confirma. |
| `$wish` `$desejar` nome / `$wr` `$wishremove` nome / `$wl` `$wishlist` [@pessoa] | Lista de desejos | **10 vagas** (+Bronze). Aviso ao vivo quando alguém roda um desejo seu. |
| `$fm` `$favorito` nome | Escolhe o favorito do perfil | |
| `$top [filtro]` | Ranking de personagens, até 1.000 | Filtros combináveis: `waifus`/`husbandos`/`outros` + `anime`/`jogos`/`quadrinhos`/`desenhos`/`series`; ou nome de obra. 15 por página. |
| `$obra nome` | Lista inteira de uma obra, com quantos têm dono | |
| `$topserv` | Top 10 de haréns da comunidade | |
| `$trade` `$trocar` @pessoa | Abre janela de troca | Ver §6.6. |
| `$forja`, `$forjar medalha`, `$poderes`, `$poder nome` | Medalhas e superpoderes | Ver §7. |

Eventos de socket usados pela UI (além do `chat:send` com `$`): `mudae:presence`, `mudae:claim`, `mudae:harem`,
`mudae:ranking`, `mudae:profile`, `mudae:list`, `mudae:filter`, `mudae:wishlist`, `mudae:wish`, `mudae:favorite`,
`mudae:divorce`, `mudae:status`, `mudae:react`, `mudae:eco:list`, `mudae:power:use`, `mudae:powers:get/equip`,
`mudae:forja:get/forge/finish/reforge/show`, `mudae:trade:open/get/offer/confirm/cancel`, `mudae:crystal:take`.
Eventos que o servidor empurra: `mudae:presence`, `mudae:crystal`, `mudae:crystal:end`, `mudae:wish`, `mudae:trade`,
`mudae:rolls-back`, `mudae:unlock`, `mudae:forge`, `mudae:power`, `mudae:reaction`.

Permissão exigida: `MUDAE` (ligada para `@everyone` por padrão, inclusive em servidores antigos). Quem está de castigo não usa.

---

## 6. Regras de jogo (o que o servidor garante)

### 6.1 Rolls
- **10 rolls por janela de 30 min**, janelas alinhadas ao relógio (`Math.floor(now / 30min)`): voltam na hora cheia e na meia hora.
  Nenhum timer por pessoa; tudo é calculado pelo relógio. (Existe 1 timer global que avisa quem zerou na janela anterior.)
- Teto da janela = `10 + Safira (1–4) + guardados pela Prata (1–4, vindos da sobra da janela anterior)`.

### 6.2 Como o sorteio escolhe
`drawFor()`: sem previsão e sem poder armado, é `pick(lista)` uniforme na lista `w/h/m(+fonte)` (por isso a raridade de um
roll reflete a proporção de cada faixa na lista). **Rubi** faz, com uma chance de 0,5–2 %, o roll virar um desejo seu sem
dono. Com Vidência/Amuleto/Chamar desejo/Escolha dupla armados, sorteia primeiro a raridade (Amuleto multiplica lendário ×5 e
épico ×3) e depois alguém dentro da faixa.

### 6.3 Revelação e casamento
- O servidor sorteia na hora e devolve `revealAt = agora + REVEAL_MS[raridade]` (comum 1,95 s · raro 2,4 · épico 2,85 · lendário 3,85).
  O cliente mostra uma roleta com 8 fotos-isca (`decoys`) e para no resultado.
- **Janela de casamento**: 1 casamento a cada 30 min (também por relógio). A **Esmeralda** dá uma reserva (a cada 24/18/12/6 h).
- O card fica disponível por **45 s** (`CLAIM_WINDOW_MS`). Antes de `revealAt` ninguém casa. Nos **3 s** seguintes só quem rodou
  casa (`PRIORITY_MS`); depois, qualquer um (roubo, que o chat anuncia). O **Laço** ignora a prioridade; o **Cadeado**
  tranca a carta para quem rodou.
- O servidor processa um evento de cada vez, então "quem chamar primeiro leva".
- Personagem já casado ainda aparece no roll (com o dono). Rolar um personagem que já tem dono pode soltar um **cristal da carta**.

### 6.4 Kakera
Ganha: `$dk`, cristais, divórcio (valor da carta, teto 200/dia), `$givek`/troca recebida. Gasta: `$rolls` (500), forja
(base × nível), reforja (500), troca, `$givek`.

### 6.5 Estados guardados por pessoa (dentro de `store`, ver §8)
`kakera`, `usage` (rolls da janela, carry, `lastClaim`, `reserveAt`, `daily`, `dk`, `buys`, `refunds`, `crystalDay`,
`future` da Vidência, `armed`), `stats` (`claims`, `rolls`, `crystals`, `legendary`), `wishes`, `favorites`, `hist`.

### 6.6 Trocas
Só em memória (um reinício do servidor cancela todas sem mexer em ninguém). Uma por pessoa, 5 min após a última mudança, até 20
cartas + kakera de cada lado. Cada mudança zera as duas confirmações e incrementa `rev`; a confirmação só vale para a `rev`
vista. Na hora de trocar, **tudo é reconferido** (dono atual, saldo, membro do servidor) e a troca é tudo-ou-nada.

### 6.7 Histórico
`store.hist[id] = { n, last: [[ownerId, 'claim'|'give'|'trade', ts] ...5] }` — quantos donos o personagem já teve.

---

## 7. Camada de jogo própria (inexistente no Mudae original)

- **Forja** (`mudae-forja.js`): 7 medalhas (Bronze, Prata, Ouro, Safira, Rubi, Esmeralda, Diamante) × 4 níveis. Preço = base × nível
  (500…3.000). Cada nível sorteia um acabamento (metal 60 % · esmalte 28 % · holo 10 % · galáxia 2 %) e a pessoa escolhe entre o
  atual e o novo. Dão vantagens (desejos, rolls guardados/extra, bônus de cristal, chance de desejo, reserva de casamento, recarga).
- **8 poderes** abertos por conquista (`POWERS` em `mudae-regras.js`): Vidência, Cadeado, Amuleto, Chuva de cristais,
  Chamar desejo, Eco, Escolha dupla, Laço. 3 espaços equipados, recarga de 24 h (12–20 h com Diamante).
- **Cristal errante** (`mudae-cristal.js`): relógio global olha a cada 5 s; com alguém no Salão, nasce um cristal a cada 5–10 min,
  vive 10 s (+1,5 s de folga). Cores de 75 a 560 kakera, "chuva" (16 gotas) e "corrente" (até 5 elos) raras. Os 15 primeiros do
  dia (meia-noite de Brasília) valem inteiros; depois, **2 %**.
- Contadores de conquistas têm *backfill*: no primeiro acesso, o harém atual vira crédito de casamentos/lendários.

> O README descreve alguns números antigos (cristal "3 a 7 min", "10 % depois do teto", "chuva 7 s"). **O código manda**:
> 5–10 min, 2 %, 10 s. `mudae-regras.js` é a fonte da verdade.

---

## 8. Persistência (onde fica o estado)

- O estado vive em `db.mudae` **por comunidade/servidor** (`server.mudae`, campo permitido em `SERVER_FIELDS` de
  `server/communities.js`). Cada servidor tem seu próprio mundo: o mesmo personagem pode ter donos diferentes em servidores
  diferentes.
- Gravado como pedaço `servers/<id>` na tabela `chunks` do `data.db` (SQLite via `node:sqlite`, flush a cada 250 ms).
  Mensagens do bot ficam na tabela de mensagens do canal.
- Formato:

```js
db.mudae = {
  claims:   { "<charId>": { ownerId, at } },       // QUEM TEM O QUÊ  ← chave é o id do catálogo (texto)
  usage:    { "<accountId>": { rollWindow, rolls, carry, lastClaim, reserveAt, daily, dk, buys[], refunds[], crystalDay, future[], armed } },
  kakera:   { "<accountId>": n },
  stats:    { "<accountId>": { claims, rolls, crystals, legendary } },
  wishes:   { "<accountId>": ["<charId>", ...] },
  favorites:{ "<accountId>": "<charId>" },
  hist:     { "<charId>": { n, last: [[ownerId, how, ts] ...] } },
  medals:   { "<accountId>": { bronze: { level, finish, offer?, announced? } ... } },
  medalsShown: { "<accountId>": ["bronze", ...] },
  powers:   { "<accountId>": { unlocked[], slots[3], readyAt{} } },
}
```

- Em memória apenas (somem ao reiniciar): trocas abertas, cristais ativos, relógio do cristal, `cardCrystalAt`.
- As mensagens de roll guardam o **card inteiro** (`{ id, name, series, image, value, rank, rarity, source }`) dentro da
  mensagem. Ou seja, mensagens antigas carregam o nome e a URL da imagem **como eram quando saíram**.
- O banco atual `data.db` do repositório está praticamente vazio (24 KB): é ambiente de desenvolvimento, não produção.

---

## 9. O que muda (ou quebra) ao integrar com o Mudae original

### 9.1 O que eu NÃO sei e precisa ser verificado antes de qualquer decisão
Nada abaixo foi pesquisado nesta análise; só li o código do Resenhex.

- **[não verificado]** Se o Mudae original expõe **qualquer API pública** de personagens, ou exportação de dados. Não conheço uma API
  oficial; o bot é fechado.
- **[não verificado]** De onde saem as imagens do original (hospedagem própria, imgur, outro CDN) e se podem ser usadas por link direto.
- **[não verificado]** Termos de uso do bot e do Discord. Ler o bot por conta de usuário (self-bot) ou raspar mensagens
  **viola os termos do Discord** e arrisca banimento de conta; é preciso decidir isso antes de qualquer estratégia técnica.
- **[não verificado]** Tamanho real da base do original e como ela mede popularidade ("Likes"/"Claim rank"/"Like rank").

### 9.2 Contrato mínimo que um personagem novo precisa cumprir
Para entrar no jogo sem mexer no servidor, uma linha só precisa de:

| Requisito | Por quê |
|---|---|
| **id único, estável, texto ou número, ≤ 64 chars, sem colidir com os ids atuais** | Chave de `claims`, `wishes`, `hist`, `favorites`. Mudar um id depois = personagem some de quem casou. |
| nome | Busca (`$im`, `$wish`...) e exibição. |
| obra (texto consistente) | Agrupa em `$obra`/`$top`. Grafias diferentes da mesma obra viram obras diferentes. |
| URL de foto acessível pelo navegador **sem Referer** | Não temos proxy nem hospedagem de imagem. |
| gênero `M`/`F`/`""` | Entra nas listas `w`/`h`. Vazio só aparece em `$m`. |
| score numérico comparável **dentro da sua fonte** | Define raridade e valor. |
| letra de fonte em `a g c d s` | Qualquer outra é descartada em silêncio. |

### 9.3 Decisões de modelagem que a integração obriga a tomar
1. **Fonte nova ou fonte existente?** Para ter uma letra nova (ex. `o`) é preciso: `SOURCES` em `mudae.js`, `FILTER_WORDS`,
   `SOURCE_OF`, `COMMANDS` (gerado em loop), o validador do build (`validateRows`/`SOURCES` em `tools/mudae-catalogo.js`),
   o front (`COMMANDS`/filtros em `public/mudae*.js`) e provavelmente o `thumbOf`.
2. **Colisão com o catálogo atual.** Os mesmos personagens (Naruto, Goku...) já existem via AniList. Dedupe por
   `nome normalizado + obra` já é a regra do build (`identity()`); a obra do original pode ter grafia diferente.
   Precisa de uma tabela de equivalência (original ↔ AniList id) se quisermos preservar casamentos existentes.
3. **Raridade relativa.** Adicionar milhares de personagens muda `eq` de **todos** (raridade e valor de personagens já casados
   mudam). Isso afeta o `valor` de harém, ranking, divórcio e `value` de cartas já postadas. Decidir se isso é aceitável
   ou se a fonte nova entra com escala fixa.
4. **Estado do jogador.** O original tem seus próprios dados por usuário (harém, kakera). O Resenhex guarda por conta + por
   comunidade. Importar o harém de alguém do original é só inserir em `claims`/`stats`, mas é preciso **autenticar** que o usuário é
   dono daquele harém (**[não verificado]** como).
5. **Imagens.** Se as do original não puderem ser linkadas, será necessário hospedar/proxyar (hoje não existe esse caminho; só uploads de chat).
6. **Escala do build.** O JSON é lido inteiro duas vezes e vira SQLite; 233 mil linhas → ~2 s de montagem e 27 MB de banco.
   Dobrar ou triplicar é viável pela arquitetura (arrays tipados), mas `FORMATO`, `PREFIXOS` e `LINHA_A_LINHA_BYTES` merecem revisão.
7. **Consistência com o "fora da roleta".** Qualquer fonte nova precisa passar pela mesma limpeza (figurantes, lugares, fotos-padrão),
   ou aparecerá lixo na roleta.

### 9.4 Pontos de extensão já existentes (onde plugar)
- `tools/mudae-fontes/<nome>.js`: um coletor devolve `rows` no formato de 7 colunas e o `main()` já cuida de merge, backup, qualidade,
  limpeza e publicação. **É o lugar natural para uma fonte "original" offline.** O contrato do coletor é
  `async ({ keys, previous, collection, ... }) => rows[]`.
- `createMudae({ catalog })` aceita um array de linhas (testes); `MUDAE_CATALOG` aponta o servidor para outro JSON.
- `preserveRows` + o check de ids garantem que uma troca de fonte **não perde casamentos**.
- Camada de jogo (forja/poderes/cristal) só depende de `claims`, `kakera`, `stats` e `wishes`; não conhece o catálogo.

### 9.5 Riscos e armadilhas já conhecidas no código
- `k` muda a cada montagem: **nunca persistir `k`**.
- Id duplicado ou removido entre montagens corrompe donos; o build bloqueia, mas só se passar pelo `tools/mudae-catalogo.js`.
- Linhas com `source` fora de `a g c d s` somem sem erro.
- Linhas do JSON precisam ser uma por linha (`lerCatalogo`), ou a montagem usa muito mais memória.
- `REF_SIZE` (15.000) está acoplado às faixas de raridade (100/1000/5000) e ao valor (`valueOf`); mudar uma sem a outra distorce a economia (`tools/mudae-economia.js` valida).
- Imagens de terceiros podem sumir/mudar (Fandom já devolve 404 falso por Referer). Não há verificação periódica de links.
- As mensagens antigas guardam o card (nome e URL) como eram; se a URL mudar, mensagens antigas ficam com imagem quebrada.
- `$top` mostra só 1.000, e `$obra` lista a obra inteira (Disney tem ~5.900 → trata-se do pior caso de paginação).
- O README tem números desatualizados (ver §7); o `mudae-regras.js` é o que vale.

---

## 10. Como rodar/validar hoje

```bash
cd discord-clone
node tools/mudae-catalogo.js --juntar        # remonta o catálogo só com os caches, sem chamar API
node tools/mudae-catalogo.js jogos series    # atualiza só essas fontes (precisa das chaves)
node tools/mudae-economia.js                  # simula a economia; código 1 se os marcos saírem da faixa
npm test                                      # pretest monta o molde do catálogo e roda os testes do Mudae
```

Variáveis: `MUDAE_CATALOG` (outro JSON), `MUDAE_CACHE` (outro cache de coleta), `MUDAE_CRYSTAL_MS=min,max` (cristal rápido para teste).
