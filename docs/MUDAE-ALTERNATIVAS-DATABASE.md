# Alternativas para replicar a database do Mudae original

> **Atualização (24/11/2026):** a comparação com a wiki e o protótipo da VNDB foram executados. O resultado **corrige** o item 4 do resumo: a VNDB aumenta a largura (57,8 mil personagens em 8,4 mil obras, já sem conteúdo adulto) mas cobre pouco do que a wiki mostra que falta (gacha, Pokémon, Touhou, Fire Emblem, ocidental). Veja [MUDAE-RESULTADOS-WIKI-VNDB.md](MUDAE-RESULTADOS-WIKI-VNDB.md).

Pesquisa feita em 23/11/2026. Complementa [MUDAE-ANALISE-INTEGRACAO.md](MUDAE-ANALISE-INTEGRACAO.md) (como o nosso Mudae funciona).
Cada afirmação tem a origem: **[testado]** = consultei a fonte agora, **[código]** = li no nosso repositório,
**[não verificado]** = não consegui confirmar.

---

## 1. Resumo e recomendação

1. **Não existe, que eu tenha encontrado, nenhuma forma pública e oficial de baixar a base do Mudae.** Sem API, sem dump, sem dataset
   nos repositórios do GitHub que procurei. A base é proprietária e cresce com contribuições da comunidade.
2. **O que dá para "copiar" legitimamente é pouco:** a wiki da comunidade tem ~4.200 personagens (≈3 % do total).
3. **Raspar a base pelo próprio bot não é viável**: viola termos, e a conta de coleta mostra que levaria meses/anos mesmo ignorando isso (§3.3).
4. **A saída realista é reconstruir um universo equivalente a partir de fontes abertas.** O Mudae tem 128 mil personagens em 14 mil séries
   (números de 2022 [testado]); já temos 132 mil ativos, mas em apenas 3.220 obras. **A diferença é largura (número de séries), não
   quantidade de personagens.** A VNDB (174 mil personagens, dump aberto) e os personagens que o AniList ainda não cobre no nosso coletor
   fecham a maior parte disso.
5. A wiki do Mudae serve como **régua de comparação** (quais séries/personagens o original considera relevantes), não como fonte de dados em massa.

**Recomendação:** caminho C (§4.3) + D (§4.4) para os dados, usando a wiki (B) só para calibrar e preencher lacunas. Evitar A e E.

---

## 2. O que sabemos do Mudae original

| Fato | Valor | Origem |
|---|---|---|
| Personagens no bot (sem Legacy) | **128.125** | wiki, `Template:Pool`, **desatualizado (jul/2022)** [testado] |
| + conteúdo Legacy | 1.129 (total 129.254) | idem |
| Roleta Animanga (`$wa/$ha/$ma`) | 82.451 (waifus 32.084 · husbandos 43.195) | idem |
| Roleta Games (`$wg/$hg/$mg`) | 53.257 (waifus 30.819 · husbandos 26.529) | idem |
| Séries | **14.028** (marcado "outdated") | idem |
| Pacotes ("bundles") | 3.682 (marcado "outdated") | idem |
| Média | ~9,1 personagens por série | wiki [testado] |
| Duas roletas apenas | **Animanga** = tudo menos jogos (anime, mangá, livros, séries, YouTubers, pessoas reais) · **Games** | wiki, página `Characters` [testado] |
| Cada personagem tem 1 série | Sim; séries agrupadas em bundles | idem |
| Dados por personagem | nome, série, gênero, roleta, aliases, tags, até 275 imagens (250 estáticas + 25 gifs), *claim rank*, *like rank* | idem |
| Quem alimenta a base | usuários, no servidor "Mudae World" (sugestões) | wiki [testado] |
| Harém máximo | 12.000 | wiki [testado] |
| Dono / bot | Saya; Mudae#0807, id `432610292342587392`, verificado | wiki + Discord API pública [testado] |
| Site oficial | `mudae.net` atrás de Cloudflare (403 para `curl`; termos de uso inacessíveis para mim) | [testado] |

**Pontos importantes:**
- *claim rank* e *like rank* são **internos ao bot** (posição no top 10 dos harens e nº de `$like`). Não há como obtê-los fora do Discord.
- Mudae mistura **pessoas reais** (músicos, atletas, YouTubers) em Animanga. O nosso catálogo **exclui** pessoas reais de propósito
  (`pessoas-reais.js`). Uma cópia fiel teria que decidir isso de novo.
- Os números de 2022 provavelmente subestimam o total atual **[não verificado]**.

### Comparação com o nosso catálogo [código]

| | Mudae (2022) | Resenhex hoje |
|---|---:|---:|
| Personagens totais | 128.125 | 233.747 |
| Personagens **ativos na roleta** | 128.125 | 132.769 |
| Séries/obras | **14.028** | **3.220** |
| Personagens por série | ~9 | ~73 (todas as linhas) |
| Roletas | 2 (Animanga, Games) | 5 (anime, jogos, quadrinhos, desenhos, séries) |
| Imagens por personagem | até 275 | 1 |
| Rank de popularidade | claim/like rank internos | `favourites` / rating / tamanho de artigo, por fonte |

Leitura: **nosso catálogo é fundo em poucas franquias** (elencos completos do TMDB e do Disney) **e o Mudae é largo em muitas séries
pequenas** (visual novels, jogos de nicho, mangás obscuros). Para parecer com o original falta largura.

---

## 3. Alternativas para obter os dados do Mudae em si

### A. API ou exportação oficial
- Não encontrei. `mudae.net/api` responde 403, o site está protegido por Cloudflare, e as páginas de termos não abriram para mim [testado].
- **O que fazer:** perguntar ao dono/suporte do Mudae (servidor oficial). Se houver parceria ou autorização, é de longe o melhor caminho.
  **[não verificado]** se isso existe.

### B. Wiki do Mudae no Fandom (`mudae.fandom.com`)
- **API MediaWiki aberta e funcionando** [testado]: 5.200 artigos, 61.743 páginas, 46.257 imagens, licença **CC-BY-SA**.
- **4.201 páginas em `Category:Characters`** (3.885 segundo a própria tabela da wiki, 2022). Categorias por roleta: `$wa rolls` 1.393 ·
  `$ha rolls` 1.430 · `$wg rolls` 1.584 · `$hg rolls` 1.211.
- Cada página de personagem usa o template `{{Character Info}}` com `name`, `series`, `gender`, `roulette`, `aliases`, `images` (galeria),
  mais tags (dublador, papel, espécie, aparência). Exemplo testado: `2B` → série *NieR: Automata*, gênero Female, roleta "Game & Animanga".
- **Já temos o coletor pronto para esse tipo de fonte**: `tools/mudae-fontes/fandom.js` raspa categorias de wikis do Fandom
  (3 em paralelo, 150 ms entre pedidos, `pageimages` e infobox). Só falta apontar para `mudae` e ler o `Character Info`.
- **Limites:** só ~3 % da base; as imagens são **uploads dos usuários da wiki** (direitos de terceiros, CC-BY-SA exige atribuição e que
  derivados mantenham a licença); não tem ranking; a wiki é manual e fica desatualizada.
- **Serve para:** (1) lista de quais séries o Mudae trata como importantes; (2) aliases e tags para melhorar nossa busca; (3) conjunto de
  validação ("os 4 mil que a comunidade documentou estão no nosso catálogo?").

### C. Projetos open source que "falam" com o Mudae
Encontrados com `gh search` [testado]. **Nenhum traz dataset de personagens**: todos leem mensagens do bot dentro do Discord.

| Repositório | O que faz | Licença | Relevância |
|---|---|---|---|
| `marsn3/mudaetracker` | Registra o Top 1000 do `$top` periodicamente (CSV `name,rank,date,series`); consulta personagens com `$im`. Usa Selenium **com login de usuário em texto puro** | GPL-3.0 | Mostra que o único acesso a "claim/like rank" é rodando comandos no bot |
| `vivinano/MudaeAutoBot`, `JasonYuan869/AutoWaifuClaimerV3`, `MudaRemote`, `AutoMudaeExt`… | Auto-roll/auto-claim (muitos usam conta de usuário, "self-bot") | vários | Risco de banimento; não geram base |
| `Znunu/EzMudae` | Biblioteca Python que *parseia* as mensagens do Mudae (regex de `$im`) | — | Útil só para entender o formato das respostas |
| `LieutenantCrunch/mudae-ranker`, `Arczeus/mudae-noter` | Ferramentas para organizar o **seu próprio** harém | MIT | Mostram o formato de exportação do `$mm`, não a base |
| `ker0olos/fable` | **Bot de gacha open source "alternativa ao Mudae"**, dados vindos do AniList | MIT | **Referência de arquitetura** de um catálogo aberto (ver §4.3) |

### D. Ler o bot dentro do Discord (rolls, `$im`, `$top`, `$mm`)
Quatro variações, com problemas diferentes:

| Variante | Como | Problema |
|---|---|---|
| D1. Conta de usuário (self-bot) | Automatizar uma conta pessoal | **Proibido pelos termos do Discord**, risco de banir a conta; é o que a maior parte dos repositórios acima faz |
| D2. Bot próprio num servidor onde o Mudae está | Ler embeds das respostas (precisa da *Message Content intent*) | Tecnicamente permitido pelo Discord, mas os termos do Mudae não consegui ler **[não verificado]** |
| D3. Rolar aleatoriamente | Rolls ao acaso até cobrir a base | Ver conta abaixo |
| D4. `$im nome` para cada nome conhecido | Consultar uma lista de nomes | Cobertura só do que já conhecemos; mesmo problema de volume |

**Conta de volume (estimativa minha, não medição):** com N = 128.125 personagens e sorteio uniforme, ver 90 % deles exige ~2,3 × N ≈ **295 mil rolls**.
Cada conta tem ~10 rolls a cada 30 min (≈480/dia, mais compras/`$daily`), ou seja ≈ **600 contas-dia**, só para os nomes. A roleta é ponderada
(populares saem mais), então a cauda longa leva muito mais. E ainda faltaria a imagem em boa resolução e o ranking.
**Conclusão: não é viável nem recomendável.**

### E. Pedir os dados aos usuários (importar o harém)
- Usuários exportam o próprio `$mm` (já existe parser em `Znunu/EzMudae` e `mudae-noter`), e nós **importamos** os personagens que eles têm.
- Dá uma amostra do que a comunidade usa de verdade, mas é cobertura enviesada e depende da boa vontade das pessoas.
- **Útil como funcionalidade** ("traga seu harém") e como **sinal de prioridade** (quais séries faltam no nosso catálogo), não como base.

---

## 4. Alternativas para reconstruir um universo equivalente

### 4.1 Cobertura por fonte aberta [testado]

| Fonte | Tamanho verificado | Acesso | Licença/termos | Hoje no catálogo? |
|---|---|---|---|---|
| **VNDB** (visual novels) | **174.344 personagens**, 68.332 VNs | API (`api.vndb.org/kana`) **e dumps diários** (`dl.vndb.org/dump`) | **ODbL + DbCL** nos dumps; imagens têm licença própria | **Não** |
| **Kitsu** | 105.907 personagens | API JSON (`kitsu.io/api/edge`) | termos de API | Não |
| **AniList** | `pageInfo.total` trava em 5.000 (limite do GraphQL), então não deu para medir | GraphQL (já usamos) | termos de API | Sim, 43.340 (8 páginas × 25 obras populares por tipo) |
| **MyAnimeList via Jikan** | Não consegui medir (a chamada ao Jikan falhou no teste) | API não oficial | **[não verificado]** | Não |
| **IGDB** | já usado | API (Twitch) | termos de API | Sim (369 com retrato) |
| **Wikidata** | milhões de itens | SPARQL | CC0 | Parcial (só no Comic Vine, para ranquear) |

> VNDB é a lacuna mais óbvia: o Mudae é famoso por ter muito material de visual novel e otome, e nosso catálogo tem **zero**.

### 4.2 Estratégia: aumentar a largura, não a profundidade
O coletor atual de anime pega as 8 × 25 obras mais populares de anime **e** de mangá e o elenco completo de cada uma. Para ir de 3,2 mil para
perto de 14 mil séries:
- subir `--anime-paginas` (hoje 8; o código aceita) para centenas de páginas de obras, e **limitar personagens por obra** (por exemplo, os 20 mais
  favoritados) em vez de elenco completo — isso imita a média de ~9 do Mudae e evita figurantes;
- adicionar VNDB, e depois Kitsu/MAL só para o que o AniList não tem;
- manter a limpeza `limpeza.js` (ela já tira lugares, itens e figurantes).

### 4.3 Caminho C — expandir o pipeline atual (recomendado)
Plugar novos coletores em `tools/mudae-fontes/` com o contrato já existente: `async ({ keys, previous, collection }) => rows[]`
com linhas de 7 colunas. O `main()` cuida de merge, backup, qualidade e do bloqueio de perda de ids [código].
- **VNDB:** letra nova (ex. `v`) ou entra em `a`/`g`? Decisão de produto. Ids como `v-c33`. O dump evita milhares de chamadas.
- **AniList:** mais páginas e teto por obra.
- **Reaproveita:** deduplicação por nome+obra, cache de consultas e retomada (`--retomar`).
- Atenção às armadilhas já mapeadas (§9 do documento anterior): adicionar personagens **muda a raridade e o valor de todos** (as faixas são
  relativas), e uma letra de fonte nova exige mexer em `SOURCES`, filtros, validador e front.
- Referência: `ker0olos/fable` (MIT) para ver como um projeto aberto estrutura um catálogo vindo do AniList.

### 4.4 Caminho D — calibrar com a wiki do Mudae
Usar `mudae.fandom.com` (CC-BY-SA, API aberta) para **medir** a distância até o original:
1. Baixar os 4.201 nomes + série + gênero + roleta.
2. Casar com o nosso catálogo por nome normalizado + obra (já temos `normalize`).
3. Medir quantos já existem e **quais séries faltam**; priorizar a coleta pelas séries de maior ausência.
4. Importar `aliases` e `tags` como metadado de busca (precisa de coluna nova e respeitar a atribuição CC-BY-SA).
Isso transforma a wiki em uma **lista de prioridades** em vez de uma fonte de dados.

### 4.5 O que a integração com o Mudae original exigiria no nosso formato (resumo)
Para um personagem "tipo Mudae" caber no nosso modelo: id estável e único, nome, obra consistente, URL de foto sem Referer, gênero, score por fonte e
uma letra de fonte. **Falta modelar:** múltiplas imagens por personagem (o Mudae tem até 275, nós 1), aliases, tags e a distinção de roleta
Animanga/Games (que pode ser derivada das nossas fontes).

---

## 5. Comparação das alternativas

| Alternativa | Cobertura do original | Legalidade/risco | Esforço | Mantém atualizado | Veredito |
|---|---|---|---|---|---|
| A. API/parceria oficial | 100 % | Seguro, se autorizada | Baixo (se existir) | Sim | **Perguntar primeiro** |
| B. Wiki do Mudae | ~3 % | CC-BY-SA (atribuição, compartilhamento igual) | Baixo (coletor Fandom já existe) | Fracamente | Usar como régua e metadado |
| C. Repos open source | 0 % (sem dataset) | MIT/GPL, depende do uso | — | — | Só para referência |
| D1. Self-bot | Baixa | **Viola Discord**, risco de ban | Alto | — | **Não** |
| D2. Bot lendo respostas | Muito baixa | Termos do Mudae desconhecidos | Muito alto | — | **Não** |
| E. Importar harém dos usuários | Enviesada | Consentimento do usuário | Médio | Sim | Feature, não base |
| F. Fontes abertas (VNDB, AniList, Kitsu, MAL) | Alta em conteúdo, **sem os ranks do Mudae** | Termos de cada API/ODbL | Médio | Sim | **Recomendado** |

---

## 6. Limites e perguntas em aberto

- **Termos de uso do Mudae**: não consegui abrir `mudae.net/terms.html` (403). Antes de qualquer coleta que envolva o bot, ler os termos
  e, se possível, falar com o dono.
- **Número atual de personagens do Mudae**: os 128.125 são de julho/2022. Pode ser bem maior hoje.
- **Jikan/MAL**: o teste falhou; cobertura e termos não medidos.
- **Tamanho real do AniList**: o GraphQL limita `total` a 5.000, então não deu para contar sem varrer.
- **O que o Mudae considera "personagem"**: inclui pessoas reais e figuras de livros/séries. Decidir se queremos isso (hoje excluímos pessoas reais).
- **Imagens**: as do Mudae são do próprio bot/uploads da comunidade; as nossas hoje vêm direto de AniList/IGDB/TMDB/wikis.
  Se um dia quisermos mais de uma imagem por personagem, é um modelo novo.
- **Mudar a raridade de personagens já casados** ao ampliar o catálogo é uma decisão de produto, não técnica.

## 7. Próximos passos sugeridos
1. Decidir a política: **ter todos os personagens do Mudae** (precisa de parceria ou aceitar que não será idêntico) ou **ter cobertura
   equivalente** (fontes abertas).
2. Se for cobertura equivalente: rodar o comparativo da wiki (§4.4) para medir a lacuna real em séries e personagens.
3. Prototipar o coletor VNDB a partir do dump (ODbL) sem tocar no catálogo publicado, e medir quantos personagens passam pelos filtros de qualidade.
4. Antes de publicar: simular o impacto na economia (`tools/mudae-economia.js`) e decidir a regra de raridade para fontes grandes novas.
