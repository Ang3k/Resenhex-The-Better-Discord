# Resultados: wiki do Mudae × nosso catálogo, e protótipo da VNDB

Executado em 23–24/11/2026. Segue o plano de [MUDAE-ALTERNATIVAS-DATABASE.md](MUDAE-ALTERNATIVAS-DATABASE.md) §7.
**Nada do catálogo publicado foi alterado** (`server/mudae-catalogo.json` e os caches das fontes ficaram como estavam).

> **Correção.** No documento anterior eu disse que a VNDB "fecha a maior parte" da diferença com o Mudae. Os números abaixo **não sustentam
> isso**: a VNDB aumenta bastante a largura (8 mil obras novas), mas cobre quase nada do que a wiki mostra que falta. Leia §3.

## 1. O que foi criado

| Arquivo | O que faz |
|---|---|
| [tools/mudae-comparar-wiki.js](../discord-clone/tools/mudae-comparar-wiki.js) | Baixa as fichas da wiki do Mudae (API MediaWiki, ~85 pedidos, 40 s) e casa com o nosso catálogo. Só lê. |
| [tools/mudae-fontes/vndb.js](../discord-clone/tools/mudae-fontes/vndb.js) | Protótipo do coletor: lê o dump da VNDB e gera linhas de 7 colunas. **Não está ligado ao `tools/mudae-catalogo.js`.** |
| [test/mudae-vndb.test.js](../discord-clone/test/mudae-vndb.test.js) | 8 testes (regras do coletor e do parser da wiki). Passam; `npm run check` OK. |

Saídas (fora do Git, em `tools/mudae-cache/`): `wiki-mudae/{wiki,comparacao}.json`, `wiki-mudae/relatorio.md`, `prototipos/vndb.json`, `prototipos/vndb-relatorio.json`.

Reexecutar:
```bash
node tools/mudae-comparar-wiki.js --baixar          # wiki (sem --baixar usa o cache)
node tools/mudae-fontes/vndb.js --baixar            # baixa o dump (~195 MB) e gera o protótipo, ~6 s
node tools/mudae-fontes/vndb.js --dump arquivo.tar.zst --incluir-adulto --fonte=g   # variações
```

## 2. Wiki do Mudae × catálogo

4.201 páginas em `Category:Characters`, **4.100 com ficha** de personagem.

| | Personagens | % |
|---|---:|---:|
| Nome **e** obra batem | 622 | 15,2 % |
| Nome bate numa obra nossa equivalente à da wiki (por votação, ver abaixo) | 599 | 14,6 % |
| Só o nome bate, em obra sem relação (provável homônimo) | 810 | 19,8 % |
| **Não achados** | **2.069** | **50,5 %** |
| Achados, mas só "fora da roleta" | 97 | — |

- **Como ler:** cerca de **30 %** da wiki está de fato no nosso catálogo (15 + 15), **~50 % não está**, e os ~20 % restantes são ambíguos.
- **Por roleta:** Animanga ≈ 38 % cobertos; Games ≈ 23 %; "ambas" ≈ 26 %. **Jogos é onde mais falta.**
- **Onde foi achado:** anime 972 · jogos 406 · quadrinhos 241 · séries 212 · desenhos 200.
- **Séries:** 624 na wiki; **375 sem nenhum personagem nosso** e 68 com menos da metade.
- **Método:** nome normalizado (sem acento, minúsculas), com sufixo de desambiguação removido (`Maya (AL)` → `Maya`), aliases e palavras em
  ordem alfabética. Como o Mudae chama as séries de outro jeito, uma série da wiki é ligada à obra nossa que recebe mais votos dos seus
  personagens (mínimo 2). Arquivo completo: `tools/mudae-cache/wiki-mudae/relatorio.md`.

### Onde estão as lacunas (maiores séries da wiki)
| Tipo | Exemplos (personagens na wiki / achados) |
|---|---|
| Gacha e jogos de celular | **Azur Lane 316/81**, Flower Knight Girl 78/5, Fire Emblem (cada jogo separado), Mist Train Girls, Ash Arms |
| Pokémon | **Pokédex 240/5**, e cada geração/anime como série própria (5–7 achados de ~35) |
| Touhou | cada jogo é uma "série" (`Touhou 11…17`), 0 achados |
| Quadrinhos/ocidente | Star Wars, DC, Marvel, Power Rangers 23/0, Miraculous 56/0, Homestuck |
| Jogos indie e meme | Wizard101, Yandere Simulator, Hatoful Boyfriend, Papers Please, FNAF, Meme Girls |
| Anime/mangá | poucos: Hataraku Saibou, Death Note 17/8, One Punch Man 25/11, Hetalia 48/15 |

### Limites desta medição (importante)
1. A wiki é **~3 % do Mudae** e foi escrita por voluntários: tende a ter muito jogo de nicho, meme e ocidental. **Não representa o Mudae inteiro.**
2. O Mudae divide séries com muito mais granularidade que nós (Pokémon e Touhou por jogo; Fire Emblem por título). Isso **infla o número de
   "séries sem personagem"**: o personagem pode até estar no nosso catálogo, só numa obra com outro nome.
3. Homônimos (`Aether`, `Alice`) fazem "só o nome bate" ser pouco confiável; por isso separei os 3 níveis em vez de somar tudo.

## 3. Protótipo da VNDB

Dump de 23/11/2026 (194 MB), lido com `zlib.createZstdDecompress` do Node 22 (sem dependência nova). Licença do dump: **ODbL + DbCL**.

### Resultado
| | Sem filtro adulto | **Padrão (filtra 18+)** |
|---|---:|---:|
| Personagens na VNDB | 174.319 | 174.319 |
| Variantes descartadas (campo `main`) | 8.518 | 8.518 |
| Sem imagem | 12.938 | 12.938 |
| Imagem explícita/violenta (nota > 50 de 200) | 7.224 | 7.224 |
| Só em VN **adulta** | — | **87.878** |
| **Linhas geradas** | **145.637** | **57.759** |
| Obras distintas | 23.782 | **8.377** |
| Gênero F / M / sem | 91.723 / 51.170 / 2.744 | 28.813 / 27.330 / 1.616 |

- Passa no `validateRows` do nosso pipeline; **0 colisões de id** com o catálogo (`vndb<número>`).
- **Qualidade da cauda:** 49.274 têm score > 0; 29.739 ≥ 10; **10.775 ≥ 100**; 2.147 ≥ 1.000. Ou seja, **~10 mil** são de VNs realmente conhecidas.
- **Sobreposição com o catálogo atual:** só 85 por nome **e** obra; 13.615 têm o mesmo nome em outra obra (homônimos, p. ex. personagens de
  Fate que também existem no AniList sob outro título). Praticamente tudo é conteúdo novo.
- Imagens: `https://t.vndb.org/ch/<2 dígitos>/<número>.jpg` carregam **com e sem Referer** (testado).

### O que a VNDB cobre do que falta na wiki do Mudae
**Muito pouco.** Dos 2.069 personagens da wiki que não achamos, **167 têm o mesmo nome na VNDB, e só 38 numa obra equivalente**
(ex.: Hatoful Boyfriend, Homestuck, Sakura Dungeon). Dos 375 séries sem personagem nosso, só 11 existem na VNDB com título igual.
As lacunas da wiki são gacha, Pokémon, Touhou, Fire Emblem e ocidental, e a VNDB não tem isso.

**Leitura honesta:** a VNDB é uma boa fonte **nova** (largura e conteúdo que não temos), mas **não é o que a amostra da wiki aponta como
prioridade**. Se o Mudae completo tem muito visual novel, a VNDB ajuda; **[não verificado]** — a wiki não é amostra confiável disso.

### Limitações do protótipo (todas conhecidas, nenhuma resolvida)
1. **Sem popularidade por personagem.** A VNDB não tem "favoritos". O score é `peso do papel × votos da VN`, então todos os protagonistas de
   uma VN empatam (Saber, Rin, Sakura e Kirei têm 19.543). Alternativas: contar aparições em outras VNs ou usar o AniList quando o personagem existir lá.
2. **Obra = a VN de maior peso.** Franquias com várias VNs (Fate, Muv-Luv) viram obras separadas; `vn_relations` do dump poderia agrupar.
3. **Filtro adulto é heurístico:** VN cujas releases com idade conhecida são todas 18+. VNs sem idade em nenhuma release passam, e a
   classificação é de quem contribui para a VNDB. Convém **revisar uma amostra** antes de publicar.
4. **Nota da imagem** (`c_sexual_avg`) cobre a foto, não o personagem nem a VN. Limite atual: 50 de 200.
5. **Descrições dos personagens** (`desc`) no dump têm licença própria (o README do dump avisa); o protótipo **não as usa**.
6. **ODbL é share-alike:** se publicarmos um banco derivado da VNDB, ele precisa de atribuição e da mesma licença. Isso afeta como distribuímos o catálogo (**decisão jurídica, não técnica**).

### Para ligar ao pipeline (não feito de propósito)
- Letra de fonte nova **`v`** (padrão do protótipo): registrar em `SOURCES`, `FILTER_WORDS`, `SOURCE_OF` (`server/mudae.js`), `SOURCES` de
  `tools/mudae-catalogo.js` e na UI. O servidor **descarta em silêncio** linhas com fonte desconhecida.
- Usar `g` misturaria a escala de votos da VNDB com a do IGDB e distorceria a raridade dos jogos atuais (o servidor usa a posição dentro da fonte).
- `mergeGames` em `tools/mudae-catalogo.js` supõe ids de wiki (`g-<wiki>-<id>`); `vndb<n>` não tem esse formato.
- `limpeza.js`/`qualidade.js` hoje só conhecem ids de wiki: avaliar se a cauda de score 0 deve entrar como "fora da roleta".
- Adicionar `t.vndb.org` a `PREFIXOS` em `server/mudae-catalogo-banco.js` economiza espaço (e exige subir `FORMATO`).
- Rodar `tools/mudae-economia.js` antes de publicar: +58 mil personagens muda a raridade relativa **dentro da nova fonte**, não das outras.

## 4. Próximos passos sugeridos
1. **Decidir o escopo de produto:** só VN com público grande (score ≥ 100 → ~10,8 mil) ou tudo (57,8 mil)? Os 10 mil já dão ~2,6× a largura em obras com pouco risco.
2. **Ir atrás das lacunas reais da wiki.** Pelo método da §2, as maiores são **jogos de celular/gacha** (Azur Lane, FKG, Fire Emblem), **Pokémon**,
   **Touhou** e **quadrinhos/ocidente**. Fontes a avaliar: wikis do Fandom que já usamos (`GAME_FRANCHISES`: faltam Azur Lane, Pokémon, Touhou, Fire Emblem),
   ampliar o Comic Vine, e Kitsu/MAL para o anime que falta.
3. **Resolver os nomes de obra** (série do Mudae ↔ obra nossa) antes de qualquer meta de cobertura: sem isso a métrica "séries faltando" é ruidosa.
4. **Revisar manualmente** uma amostra de 200 linhas do protótipo (adulto, nomes, gênero) antes de ligar ao pipeline.
