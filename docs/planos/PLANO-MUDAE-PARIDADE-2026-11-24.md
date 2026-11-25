# Plano: aproximar o Mudae do Resenhex do Mudae original, sem perder a identidade

Data: 24/11/2026. Origem: comparação da wiki do Mudae (mudae.fandom.com) com o código atual, feita na sessão de 24/11.
Base de referência: [MUDAE-ANALISE-INTEGRACAO.md](../MUDAE-ANALISE-INTEGRACAO.md) (como funciona hoje) e [MUDAE-ECONOMIA-2026-11-09.md](../relatorios/MUDAE-ECONOMIA-2026-11-09.md) (economia calibrada).

## 1. Objetivo e limites

Trazer as mecânicas do original que fazem falta (chaves, kakera colorido nos casados, likelist, notas, filtros, desejos melhores, controle de roleta) **e** melhorar o que já existe, mantendo o que torna o Resenhex diferente:

**Identidade que não se mexe** (cada fase deve provar que continua valendo):
1. **Salão ao vivo:** todo mundo vê o roll ao mesmo tempo, Mesa ao vivo, álbum, Modo simplificado.
2. **Forja de medalhas e os 8 superpoderes** continuam sendo a progressão principal. O que vem do original entra *ao lado*, nunca no lugar.
3. **Cristal errante** continua existindo e com o mesmo ritmo.
4. **Economia calibrada:** nada entra sem passar por `tools/mudae-economia.js` (teto do divórcio, 15 cristais/dia, faixas de kakera/dia).
5. **Estado por servidor** (`db.mudae` de cada comunidade) e **servidor decide tudo**; o cliente só desenha.
6. **Interface em português** e os comandos em português já existentes (`$desejar`, `$trocar`…) continuam como apelidos.

**Fora de escopo:** Premium e Patreon, Mudae World, Waifu Arena, Pokéslot, minigames de palavras (teas, quiz), `$vote`, troca de idioma e prefixo, copiar harém entre servidores, eventos sazonais. Podem virar um plano próprio depois.

## 2. Decisões que dependem do dono (travam fases)

| # | Pergunta | Recomendação | Trava |
|---|---|---|---|
| D1 | Rolls e claim: manter 10 rolls/30 min e claim de 30 min, ou ir para o ritmo do original (rolls por hora, claim de 3 h)? | **Manter.** O ritmo curto é parte do jeito de jogar do grupo; a wiki mesmo deixa cada servidor ajustar. Virar configuração do servidor na Fase 7. | Fase 7 |
| D2 | Chaves e Forja: convivem ou a chave substitui alguma medalha? | **Convivem.** Chave é progressão *do personagem*; medalha é progressão *da pessoa*. | Fase 1 |
| D3 | Nome na interface: "chaves" como no original ou algo próprio (ex.: "selos")? | Usar os **nomes do original** (bronze, prata, ouro, caos) para quem vem do Mudae reconhecer. | Fase 1 |
| D4 | Likes entram no valor do personagem? O original usa ranking de claim e de likes. | **Só claim + chaves.** Likes de servidor pequeno distorcem o valor. A likelist fica como lista pessoal. | Fase 3 |
| D5 | Janela para casar: 45 s (hoje) ou 30 s (original)? E prioridade de 3 s para quem rodou? | **Manter 45 s e 3 s**, configuráveis na Fase 7. | Fase 7 |

**Respondidas em 24/11/2026 pelo dono:** D1 manter o ritmo atual · D2 convivem · D3 nomes do original · D4 só claim e chaves, sem likes · D5 manter 45 s e 3 s. Soulmates ficam na conta, sem copiar personagem entre servidores. Lote A autorizado. Conquistas planejadas em [PLANO-MUDAE-CONQUISTAS-2026-11-24.md](PLANO-MUDAE-CONQUISTAS-2026-11-24.md) (Fase 9).

## 3. Princípios técnicos (valem para todas as fases)

- **Um parser de flags só** (Fase 0). Hoje cada lista tem filtros próprios (`FILTER_WORDS`). Tudo novo usa o mesmo parser, e os filtros antigos continuam funcionando.
- **Estado novo mora em `store`** (o `db.mudae` do servidor), com migração vazia por padrão: quem já joga não perde nada e nenhum campo novo é obrigatório.
- **Cada regra numérica vai para [mudae-regras.js](../../discord-clone/server/mudae-regras.js)**, nunca solta no código. O simulador e os testes leem de lá.
- **Cada fase fecha com:** testes novos em `test/mudae-*.test.js`, `npm run check` verde, simulador de economia dentro da faixa, entrada no CHANGELOG e nas Novidades.
- **Cada comando novo nasce com tela:** resposta no chat (`public/mudae.js`) e, quando fizer sentido, lugar no Salão (`public/mudae-salao.js`). Comando sem tela só se for utilitário.
- **Publicação por fase**, não tudo de uma vez (ver §9).

## 4. Fases

### Fase 0: fundações (sem mudança visível)
Prepara o terreno para as outras fases não se atropelarem.

1. **Parser de flags unificado** (novo `server/mudae-flags.js`): letras do original (`w h g r l a b t…`, ver [Flags](https://mudae.fandom.com/wiki/Flags)) mais as palavras atuais (`anime`, `jogos`, `waifus`…). Devolve um filtro único que `$mm`, `$top`, `$wl`, `$im` e as listas novas usam.
2. **Registro de comandos por tabela:** hoje `server.js` tem um `if/else` de ~100 linhas. Mover para uma tabela `{ cmd, handler }` em módulo próprio, para as fases seguintes só acrescentarem linhas. Comportamento idêntico (os testes atuais são a prova).
3. **Simulador de economia** (`tools/mudae-economia.js`): aceitar entradas novas (chaves, reação de kakera) para já medir antes de implementar.

*Pronto quando:* todos os testes atuais passam sem alteração e `$mm w anime` e `$mm w g-` dão a mesma lista.

### Fase 1: chaves e soulmates (maior lacuna)
No original, rolar um personagem **seu** sobe o nível da chave dele; com 10 viram soulmates ([Keys](https://mudae.fandom.com/wiki/Keys)).

**O que entra**
- `claims[id].keys` (nível) e `soulkeys` (as que a própria pessoa rolou). Rolar o personagem que você já casou conta uma chave, **dentro do limite de rolls existente**.
- Cores: bronze (1–2), prata (3–5), ouro (6–9), caos (10+). Mostradas na carta, no harém, no `$im` e na Mesa ao vivo.
- Bônus de valor por nível, como na [tabela de valor](https://mudae.fandom.com/wiki/Kakera/Values) (+10% em 2, 4, 5, 7, 8, 9 etc.), aplicado em `valueOf` do personagem.
- **Nível 6: rolar o personagem rende o valor dele em kakera.** No original o teto é 4.500 a cada 3 h, valor que quebraria a nossa economia. Aqui entra no **mesmo teto diário do divórcio** (`DIVORCE_CAP`), valor inicial 200/dia, a calibrar no simulador.
- Soulmates (10 soulkeys): lista global da conta (`$sl`), `$infokeys` e `$removekeys`.
- Chave **fica com o personagem**, não com o dono (igual ao original: não zera ao divorciar ou trocar).

**Como casa com a identidade**
- A Forja ganha uma vantagem *opcional* de Esmeralda ligada a chaves, em vez de criar medalha nova (decisão D2).
- Poder novo **"Chave mestra"** (fica no fim da árvore de poderes): o próximo roll de um personagem seu vale 2 chaves. Dá uso aos 3 espaços de poder sem mexer nos outros oito.
- Eco e Escolha dupla passam a contar para chave quando repetem um personagem seu.

**Arquivos:** `server/mudae-chaves.js` (novo), `mudae.js` (valor, roll), `mudae-conta.js`, `public/mudae.js`, `public/mudae-salao.js`, `public/mudae-icones.js`.
**Testes:** nível por quantidade, cores, bônus de valor, teto diário, soulkeys não vão para quem recebe por troca, chave sobrevive a divórcio e troca.
**Risco:** inflar o valor e, com isso, o kakera do divórcio. Mitigação: o teto diário já existe; simular antes de ligar.

### Fase 2: kakera colorido nos personagens que já têm dono
No original, abaixo de um personagem casado pode nascer um kakera colorido; quem clicar primeiro leva ([Reactions](https://mudae.fandom.com/wiki/Kakera/Reactions)).

**Proposta:** **não criar um segundo sistema**; evoluir o cristal da carta, que já tem 7 cores (roxo → vermelho) e valores.
- Aparece sob roll de personagem com dono, com chance maior quando o personagem tem chave.
- Cores seguem o original: com chave prata ou mais, ciano e verde viram laranja; roxo não gasta "poder de reação" (grátis).
- **Poder de reação:** contador pessoal que enche com o tempo e gasta ao pegar kakera (menos roxo). Mostrado no `$tu` e no `$ku`.
- Cores novas só se a Forja pedir: **arco-íris** (valor aleatório) e **claro** (quebra em vários). Entram como raridade acima do vermelho, com peso baixo.
- `$kakerareact` (trocar o emoji de cada cor) vira escolha de **ícone** por cor, em `mudae-icones.js`.
- O cristal errante da Mesa continua igual e **soma** ao poder de reação, não consome.
- Ratio de claimed do original: simplificar para a chance de nascer = f(proporção de casados no pool), com o piso de 1 em 5 do original.

**Arquivos:** `mudae-cristal.js` (servidor e cliente), `mudae-regras.js`, `mudae.js`.
**Testes:** cores por chave, roxo grátis, poder de reação, teto diário de cristais continua valendo (15 inteiros, depois 2%).
**Risco:** dobrar o kakera/dia. O simulador precisa fechar a faixa antes; se estourar, reduzir o peso das cores caras, **não** o teto.

### Fase 3: valor do personagem mais fiel
- Valor passa a ter três partes: posição (como hoje), bônus de chave (Fase 1) e **fator do servidor** (quanto mais casados, mais vale, como na [wiki](https://mudae.fandom.com/wiki/Kakera)), limitado a +/- 20% para não desorganizar o ranking.
- Likes ficam de fora (decisão D4).
- `$togglerolls` para mostrar ou esconder valor, rank e chave durante os rolls.
- `$topserv` ganha variantes do original: por valor do harém (`tsv`), por kakera total (`tsk`), por chaves (`tsy`), por nº de casados (`ts nbr`) e data do último casamento (`ts lc`).

**Testes:** valor cai e sobe com o fator, nunca fora da faixa; ranking estável entre cartas.

### Fase 4: likelist e desejos melhores
**Likelist** ([Commands](https://mudae.fandom.com/wiki/List_of_Commands)): `$like`, `$likelist` (`$ll`), `$likeremove`, `$likepos`, `$likeclear`, `$likedm`, `$renamelikelist`.
- Lista pessoal e ordenável. **Com 5 ou mais, destrava o 2º `$daily` do dia (recarga de 20 h empilhada)**, como no original. Teste de economia: não pode virar rolls infinitos.
- Mostra na Mesa um coraçãozinho quando alguém rola um personagem da likelist de quem está olhando.

**Desejos:**
- `$starwish` (`$sw`): desejo com ⭐ que o poder "Chamar desejo" e o Rubi favorecem. 1 vaga no começo; mais vagas trocando vagas de desejo (como o original) ou na Forja.
- `$wishseries` (`$ws`): desejar uma obra inteira (limite de 1 obra no começo; mais com a Forja).
- `$wishdm`: escolher quem recebe aviso (menção, DM, nada).
- `$wishk`: desejo que paga kakera quando **outra pessoa** casa com o personagem (200 por padrão, valor em `mudae-regras.js`). Dá motivo para desejar sem querer casar.
- Proteção de desejo (`$wp`): o desejo de outra pessoa **não pode ser casado por quem não desejou** por X segundos depois de rolar. Parente do Cadeado; precisa decidir se vira nível de medalha ou poder (ver §7).
- `$wish` com vários nomes separados por `$`, `$wishsort` e `$wishpurge` (remove desejos já casados).

**Testes:** limites, vagas, DM, kakera do `wishk` só quando outra pessoa casa, `ws` não ultrapassa o limite.

### Fase 5: harém, notas e personalização
O que o original tem para cuidar do harém e o Resenhex ainda não.

| Comando | O que faz | Observação |
|---|---|---|
| `$note`, `$noteseries`, `$notepage` | anotação por personagem, obra ou página | máximo de 200 caracteres |
| `$fn` (`$fnall`) | procura nas anotações | usa o parser de flags |
| `$sortmarry` (`$sm`) | ordena e guarda a ordem do harém | `abc`, obra, nota, `reverse`; ordem manual por `$smpos` |
| `$divorceseries`, `$divorcepage`, `$divorceall`, `$divorceallbut` | divórcio em lote | **pede confirmação com o número e o kakera**; respeita o teto diário; mostra quanto *não* voltou |
| `$changeimg`, `$addimg`, `$randomimg` | imagem principal, imagens extras, imagem aleatória nos rolls | fotos extras só por link `https`; limite de 12; sem upload |
| `$alias`, `$alias2` | trocar o nome exibido | aliases vêm do catálogo quando existirem |
| `$colormm`, `$colorpr`, `$renameharem`, `$renameclaim`, `$renamedivorce` | cor e textos personalizados | cor só dentro do tema do Resenhex |
| `$profile` (`$pr`) | perfil com medalhas da Forja, favorito, soulmates | já há o "Meu perfil"; só liga os dados |

- No cliente, o **álbum** ganha as notas, a ordem manual (arrastar) e as flags como atalhos de filtro. Dá para fazer tudo no Salão sem digitar comando.
- **Segurança:** links de imagem passam pela mesma regra de hosts permitidos do `MudaeFotos`; nota e nome são texto puro, com limite de tamanho.

**Testes:** notas por escopo, divórcio em lote com teto, ordem persistente, limite de imagens, rejeição de link inválido.

### Fase 6: controle da roleta (disable e limroul) — REMOVIDA em 24/11/2026

> **Removida a pedido do dono ("não faz sentido para o nosso").** Foram feitos e depois retirados: `$disable`, `$disablelist`, `$antidisable`, `$limroul`, `$togglewestern` e `$toggleirl`. Ficou só o filtro **do servidor** (`$serverdisable`), que é administração e não escolha pessoal. O texto abaixo é o plano original, mantido só como histórico.
- `$disable`, `$disablelist`, `$antidisable`: tirar obras da **sua** roleta. O pool de sorteio é por conta, derivado do pool global menos as obras tiradas.
- `$limroul`: limitar a roleta às N mais populares de cada fonte (o "gamemode 2" do original), com piso para não esvaziar fontes pequenas (visual novels, desenhos).
- `$togglewestern` e `$toggleirl`: atalhos para tirar obras ocidentais ou com pessoas reais, usando a coluna de fonte do catálogo.
- Desejo e `antidisable` sempre entram na roleta, como no original.
- Efeito colateral: **muda a chance de sair lendário e de casar com desejo**. Medir no simulador; se necessário, o pool filtrado mantém a mesma proporção de raridades (a regra de `REF_SIZE` já faz isso por fonte).

**Risco:** custo de memória. Pools por conta **não podem** copiar arrays de 130 mil itens; usar máscara de bits ou índice sobre o pool global (o catálogo já é de tipos numéricos). Medir RAM antes e depois.

### Fase 7: configuração do servidor e moderação
Usa o sistema de cargos e permissões que já existe (a permissão "Usar o Mudae").

- `$settings`: mostra tudo o que dá para ajustar e o valor de cada um.
- Ajustes por servidor: tempo de claim, intervalo de rolls, rolls por janela, **janela para casar e prioridade de quem rodou** (D1 e D5), limite do harém, ligar e desligar snipe, kakera de outros e cristal.
- `$togglehentai`, `$toggledisturbing`: filtro de conteúdo do servidor inteiro. **Padrão ligado**, a pedido de segurança do app (Microsoft Store).
- `$serverdisable`: tirar personagem ou obra do servidor.
- Moderação: `$forcedivorce`, `$userdivorce`, `$restorelist` e `$restore` (desfaz divórcio de moderação). Cada ação gera linha no log do canal.
- Estatística: `$left` (quantos personagens ainda estão livres no servidor).

**Testes:** só quem tem a permissão altera; ação de moderação é auditada; configuração inválida é recusada; restaurar devolve o dono certo.

### Fase 9: conquistas e marcos
Ver [PLANO-MUDAE-CONQUISTAS-2026-11-24.md](PLANO-MUDAE-CONQUISTAS-2026-11-24.md). Por servidor, com títulos, molduras, vantagens pequenas e kakera limitado. Os contadores novos da Fase 9.0 podem entrar já no Lote A (notas, organização, divórcios).

### Fase 8: acabamento e melhorias do que já existe
Itens pequenos que melhoram o jogo atual:
- `$mu` (tempo até casar), `$ru` (rolls até o reset), `$ta` (organizar o que o `$tu` mostra), `$overview` e `$bonus` (suas vantagens em uma tela só: Forja, chaves, poderes).
- `$im` ganha as variantes do original: `$ime` (ver tags), `$imq!` (devolver lista), `$ims` (imagens por DM), e fotos paginadas.
- Mensagens de erro do bot sempre dizem **quando volta** (rolls, claim, `$dk`, poderes) em um padrão só.
- **`$dk` aleatório em 4 faixas** como no original, mantendo a média atual (250) para não mexer na economia. É só variedade.
- Trocas: aceitar `1000 ka` na linha da oferta (kakera), troca desigual e confirmação de presente (`$give`) com a janela de 12 h livre do original, sem "gastar o claim".
- Kakera Loots do original (`$kl`): **não portar**. A Forja e o cristal já ocupam esse papel; o desejo de lootbox pode virar um poder no futuro, se pedirem.

## 5. Ordem e dependências

```
Fase 0 ──► Fase 1 (chaves) ──► Fase 2 (kakera nos casados) ──► Fase 3 (valor)
   │                │
   │                └──────────► Fase 4 (likelist e desejos)  (usa chave nos desejos)
   ├──► Fase 5 (harém e notas)         (independente)
   ├──► Fase 6 (disable / limroul)     (independente; medir RAM)
   └──► Fase 7 (servidor e moderação)  (depois de 5 e 6, pois configura os dois)
                                         Fase 8 (acabamento) por último
```

Ordem sugerida de publicação, em lotes pequenos:
1. **Lote A:** 0 + 5 (baixo risco, grande ganho de uso).
2. **Lote B:** 1 + 3 (chaves e valor).
3. **Lote C:** 2 + 4 (kakera nos casados, likelist e desejos).
4. **Lote D:** 6 + 7 + 8.

## 6. Validação de identidade e economia (por fase)

- [ ] `npm run check` e a suíte de `mudae-*.test.js` verdes, sem editar teste antigo para passar (se um teste antigo muda, registrar o porquê).
- [ ] `node tools/mudae-economia.js` sai com código 0 (kakera/dia e tempo para as medalhas dentro da faixa).
- [ ] O Salão continua abrindo com Modo simplificado e Reduzir animações respeitados.
- [ ] Memória do servidor com catálogo carregado: não passa de **+15 MB** sobre os 88 MB de hoje (Fase 6 é a mais perigosa).
- [ ] Nenhuma tela nova no celular que estoure a largura (`mudae-salao.css` tem os pontos de quebra).
- [ ] Comando novo funciona com o nome do original **e** tem apelido em português quando já existe um.

## 7. Questões em aberto (resolver durante a execução)

1. **Proteção de desejo:** nível de medalha ou poder? Recomendação: poder, porque combina com o Cadeado e não pesa na Forja.
2. **Soulmates globais:** a lista é da conta, mas o estado do jogo é por servidor. Recomendação: guardar na conta, sem copiar personagem entre servidores (a cópia fica de fora do escopo).
3. **Aliases:** o catálogo não tem aliases hoje. Se a fonte (AniList) trouxer os apelidos, a próxima montagem do catálogo precisa de uma coluna nova; isso é uma mudança do formato de 7 colunas e **precisa de plano à parte**.
4. **Likes por servidor** (descartados na D4): reabrir só se o valor ficar muito achatado depois da Fase 3.

## 8. O que este plano **não** resolve

- A diferença de **cobertura de personagens** em relação ao Mudae (só ~30% da wiki está no catálogo) continua no plano de [MUDAE-ALTERNATIVAS-DATABASE.md](../MUDAE-ALTERNATIVAS-DATABASE.md) e em [MUDAE-RESULTADOS-WIKI-VNDB.md](../MUDAE-RESULTADOS-WIKI-VNDB.md).
- Premium, minigames e eventos (ver §1).

## 9. Publicação

Seguir [ESTADO-ATUAL.md](../ESTADO-ATUAL.md) (backup do banco antes, publicar por script, conferir número de pessoas online antes e depois). Cada lote vira uma versão com seção própria no CHANGELOG e em `public/changelog.js`. Migração de dados é sempre **aditiva**: campos novos com valor padrão, nada renomeado nem apagado, para o `voltar-versao` funcionar sem perda.

## 10. Andamento

### Lote A (iniciado em 24/11/2026)

**Feito** (código e testes; ainda **não publicado**, sem entrada no CHANGELOG nem versão nova):
- `server/mudae-flags.js`: parser de flags (gênero, fonte, ordem, `inverso`, `g-`). Hoje só o `$mm` usa; o `$top` mantém o parser dele.
- `server/mudae-harem.js`: `$note`/`$n`, `$noteseries`, `$notepage`, `$noteremoveall`, `$fn`, `$fnall`, `$sortmarry`/`$sm`/`$organizar` (ordem guardada, vale no `$mm` e no álbum), `$divorceseries`, `$divorcepage`, `$divorceall`, `$divorceallbut` com `$confirmar`/`$cancelar` (1 minuto, respeita o teto diário de kakera).
- `$mm` aceita flags (`$mm w anime`, `$mm abc inverso`, `$mm Naruto`); o harém do chat mostra a nota e "N de M" quando filtrado.
- Notas somem quando a carta sai do harém (divórcio, presente, troca). Contadores novos para as conquistas: `notes`, `organized`, `divorces`.
- Testes: `test/mudae-harem.test.js` (15). Os 248 testes `mudae-*` passam.

**Feito depois (mesma data):**
- Álbum do Salão: nota em cada carta (lápis para editar, Enter salva), ordem "Minha ordem" com arrastar e soltar e botão "mover para o início" (só sem filtro ativo), ordenar por nota, filtros por gênero e "Com nota", e busca que também olha as notas. Quem já arrumou o harém abre o álbum na própria ordem.
- `server/mudae-visual.js`: `$addimg`/`$ai` (com `remove` e `removeall`), `$changeimg`, `$randomimg 0|1`, `$renameharem`, `$colormm`, `$renameclaim`, `$renamedivorce` e `$profile`/`$pr`/`$perfil`.
- Regras das imagens: só link direto do `i.imgur.com` (o navegador carrega direto da fonte; outro endereço expõe o IP de quem abre o harém), até 12 extras por personagem, e elas saem quando o personagem muda de dono (divórcio, presente, troca). Os textos de casamento e divórcio aceitam só {personagem} e {usuario}, e o cliente os mostra como texto puro.
- Testes: `test/mudae-visual.test.js` (8), `test/mudae-harem-server.test.js` (sobe o servidor de verdade) e os 15 de antes. Os 257 testes `mudae-*` passam.

**Lote A fechado (24/11/2026):**
- A tabela de comandos existe: `server/mudae-comandos.js`. Cada comando é uma função `(contexto) => resposta`; o `server.js` consulta a tabela primeiro e, se o comando não está nela (ou devolve `undefined`), cai nos comandos antigos do `if/else`. Os comandos do Lote A e do Lote B moram nela. **Os comandos antigos (`$w`, `$mm`, `$wish`, `$trade`…) ainda estão no `if/else`**: migrar é trabalho mecânico, mas sem ganho para o jogador, então fica para quando alguém mexer neles.
- O simulador de economia (`tools/mudae-economia.js`) ganhou o bloco das chaves e 3 conferências novas.

**Ficou fora do Lote A, de propósito:**
- `$alias` e `$alias2` (o catálogo não tem aliases; ver §7), as variantes de `$randomimg` com gif e imagens custom, e `$swap` e `$arrange` das imagens.
- `$divorce` e `$note` com flags de harém (`$divorce$mmh`).
- Título e cor do harém só aparecem no chat e no álbum; ainda não no perfil do Salão nem no ranking.

### Lote B: chaves e valor (24/11/2026)

**Feito** (código e testes; ainda **não publicado**, sem entrada no CHANGELOG nem versão nova):
- `server/mudae-chaves.js`: a chave sobe quando você rola um personagem **seu** (bronze 1–2, prata 3–5, ouro 6–9, caos 10+; máximo 100). Fica com o personagem: sobrevive a divórcio, presente e troca. As `soulkeys` (só as que **você** rolou) levam a soulmate com 10.
- Como a chave anda: cerca de 2% dos rolls sem poder armado caem num personagem seu que cabe no comando (`KEYS.ownChance`, ligada no `server.js`; o `createMudae` começa com 0 para os testes não dependerem de sorte). Normal ~0,8 chave por dia; viciado ~3,2.
- Valor do personagem: base × fator do servidor (+5% a cada 500 casamentos, até +20%) com os bônus da wiki (+10% nos níveis 2, 4, 5, 7, 8 e 9; +15 no 10; +5% no 11; fixos nos níveis marcados). Vale no álbum, no harém, no `$im`, no ranking, no divórcio e no valor do harém. A lista do `$top` e a da lista de desejos seguem com o valor base.
- Prêmio do nível 6: rolar um personagem de chave 6+ devolve o valor dele em kakera, **até 100 por 24 h** (no original são 4.500 a cada 3 h, que quebraria a economia).
- Comandos: `$infokeys` (`$keys`, `$chaves`), `$sl` (soulmates), `$removekeys nome $ n` e os rankings `$topserv k`, `y`, `nbr` e `lc` (também `$tsk`, `$tsy`, `$tsn`, `$tslc`).
- Cliente: selo da chave no nome do personagem (chat e Salão), linha "Chave nível N" no roll (com o kakera do prêmio e o aviso de soulmate), `$profile` com chaves e soulmates, e o ranking com título e unidade.
- Testes: `test/mudae-chaves.test.js` (15). O simulador confere que o prêmio diário é no máximo 10% da meta de kakera por dia.

**Ficou fora do Lote B, de propósito:**
- Poder **Chave mestra** (rolar um personagem seu com 2 chaves): exige ícone, animação e texto novos na tela de poderes, e os testes e a interface assumem 8 poderes. Entra depois, com os outros poderes.
- Vantagem de Esmeralda ligada a chaves (D2 do plano): a Forja ficou intacta.
- `$togglerolls` e o ranking por likes (decisão D4).
- Os soulmates ficam no servidor onde foram ganhos (o estado do jogo é por servidor); não há cópia entre servidores.

### Tabela oficial das chaves × o que o Resenhex faz (conferida em 24/11/2026)

A tabela é a da página Keys da wiki do Mudae (colada pelo dono). "+5% no 11+" vale **uma vez** a partir do nível 11: a wiki escreve "Every N levels" onde o bônus se repete (35–60, 70–300) e só "11+" aqui.

| Nível | Efeito no original | Resenhex |
|---|---|---|
| 1 | libera `$embedcolor` (cor do personagem) | **feito**: `$embedcolor nome $ #cor` (`$ec`), a cor fica com o personagem e aparece na carta |
| 2, 4, 5, 7, 8, 9 | +10% de valor cada | **feito** |
| 3 | kakera ciano e verde viram laranja neste personagem | **feito (Lote C)**, no cristal da carta |
| 6 | rolar o personagem rende o valor dele em kakera | **feito**, com teto de 100 por 24 h |
| 10 | reações de kakera custam metade do poder do dono | **feito (Lote C)**: o poder de reação gasta metade |
| 11+ | +5% de valor | **feito** (uma vez) |
| 25, 100, 300, 500 | chance de um segundo kakera sob o personagem (25%, 50%, 75%, 100%) | **feito (Lote C)**: um segundo cristal logo depois do primeiro |
| 50, 200, 400 | kakera roxo, vermelho e arco-íris dão +75%, +75% (150% no total) e +100% (250% no total) | **feito (Lote C)** |
| 10, 15, 20–30, 35–60, 70–300 | bônus fixos de valor (página Kakera/Values) | **feito** |

O nível máximo da chave subiu de 100 para 500 (o último degrau da tabela). Com o Lote C, todos os degraus da tabela têm efeito.

### Lote C: kakera nos casados, likelist e desejos (24/11/2026)

**Feito** (código e testes; ainda **não publicado**):
- **Cristal da carta** (`server/mudae-cristal.js`): o cristal que nasce de um roll de personagem com dono agora depende da chave dele. Prata (3) ou mais troca ciano e verde por laranja; chaves 25, 100, 300 e 500 dão 25%, 50%, 75% e 100% de chance de um **segundo cristal**; as chaves 50, 200 e 400 dão +75%, +150% e +250% nos cristais roxo, vermelho e **arco-íris** (cor nova, só na carta, valor sorteado de 250 a 900, 3% de chance).
- **Poder de reação** (`mudae-conta.js`): pessoal, de 100, volta 50 por hora. Cada cristal da carta gasta (roxo 0, azul 15, ciano 20, verde 25, amarelo 30, laranja 35, vermelho 45, arco-íris 50; **metade** com chave 10 ou mais). Sem poder, o cristal é recusado sem gastar o teto do dia. O cristal errante e a chuva **não** gastam. O `$tu` mostra o poder.
- **Likelist**: `$like` (vários com `$`), `$likelist`/`$ll`, `$likeremove`/`$lr`, `$likepos`, `$likeclear sim`, `$likedm`, `$renamelikelist`/`$rll`. Máximo de 100. **Com 5 ou mais, o `$daily` guarda 2 usos** (recarga de 20 h empilhada); o `$tu` mostra quantos você tem.
- **Desejos**: `$starwish`/`$sw` (1 vaga; `$starslot` troca 2, 4, 6... vagas de desejo por mais uma; a starwish pesa 3x quando o Rubi e o Chamar desejo escolhem), `$starremove`/`$swr`, `$wishk` (desejo quieto: sem aviso, paga 100 de kakera quando **outra** pessoa casa, até 300 por 24 h), `$wishseries` (avisa por qualquer personagem da obra; 1 obra, mais 1 a cada 2 vagas de desejo da Bronze; sai com `$wr obra`), `$wishdm 1` (lista privada: some para os outros, mas o aviso continua chegando), `$wishsort`, `$wishpurge` e `$wish a $ b` com vários nomes.
- Testes: `test/mudae-lote-c.test.js` (18).

**Ficou fora do Lote C, de propósito:**
- **`$ws` como atalho de `$wishseries`**: no Resenhex `$ws` já é o roll de "waifu de séries", então o desejo de obra é só `$wishseries`.
- **Proteção de desejo (`$wp`)**: pede decisão de desenho (nível de medalha ou poder). Fica para depois, junto com o poder Chave mestra.
- **Coração na Mesa** quando alguém rola um personagem da sua likelist, e `$kakerareact` (trocar o ícone de cada cor): não feitos.
- **Chance maior de cristal para personagem com chave**: o limite de 1 cristal de carta a cada 30 min por quem rodou continua valendo.
- O bônus da starwish já casada do original (+1 reação garantida, +10% de kakera) não foi feito.
- O simulador de economia **não modela** o cristal da carta (só o errante); o arco-íris e o segundo cristal não entraram nas contas.

### Fim do Lote C e Lote D (24/11/2026)

**Fechado do Lote C** (pedido do dono):
- **Coração na Mesa**: quando alguém rola um personagem da sua likelist, a Mesa mostra "Na sua likelist" na legenda da carta e um aviso curto de 7 s, sem som (o aviso de desejo continua com som e tem prioridade: quem recebeu o de desejo não recebe o coração).
- **`$kakerareact cor forma`**: gema, coração, estrela, gota ou losango para cada cor (roxo, azul, ciano, verde, amarelo, laranja, vermelho, arco-íris), só na tela de quem escolheu. `list` mostra e `reset` volta tudo.
- **Curtidas dentro de Desejos**: a aba Desejos do Salão ganhou duas abas internas, "Desejos" e "Curtidas". Nas curtidas dá para tirar e mover para o início; cada carta de Personagens ganhou o botão de coração.

**Lote D, feito** (código e testes; ainda **não publicado**):
- **Roleta pessoal** (Fase 6): `$disable obra` (`$d`; sem nome mostra a lista), `$disablelist` (`$dl`), `$antidisable` (`$ad`: devolve uma obra ou libera um personagem), `$limroul N` (mínimo 500; só os N mais populares de cada lista), `$togglewestern` (`$tw`: tira quadrinhos e desenhos) e `$toggleirl` (tira as séries com atores). Nada é copiado por pessoa: o limroul é um pedaço da lista (as listas estão em ordem de popularidade) e o resto é sorteio com recusa (40 tentativas, depois uma varredura). **Desejos, poderes armados e o próprio `$antidisable` passam por cima do filtro pessoal.** Se o filtro deixar a lista vazia, o roll sai normal.
- **Ajustes do servidor** (Fase 7, só para quem tem "Gerenciar o Mudae"): `$settings` (qualquer um vê), `$settimer` (15 a 120 s para casar), `$setrolls` (2 a 10 por janela, antes das medalhas), `$haremlimit` (10 a 5.000, 0 = sem limite; agora é um limite de verdade), `$togglesnipe` (sem snipe só quem rodou casa; o poder Laço passa), `$togglecrystals` (desliga todos os cristais do servidor), `$serverdisable` (tira obra ou personagem da roleta de todo mundo; **não dá para passar por cima**).
- **Moderação**: `$forcedivorce nome` (sem kakera), `$userdivorce @pessoa` (pede `sim` para confirmar), `$restorelist` (`$rl`) e `$restore nome` (devolve ao dono anterior se ele ainda está no servidor e o personagem continua livre; guarda os 200 mais recentes). Cada ação gera uma linha pública no Salão.
- **Utilidades** (Fase 8): `$mu` (quando casa de novo), `$ru` (rolls e volta), `$bonus` (Forja, chaves e likelist), `$overview` (suas configurações), `$left` (quantos estão livres).
- Testes: `test/mudae-lote-d.test.js` (21).

**Ficou fora do Lote D, de propósito:**
- **`$togglehentai` e `$toggledisturbing`** (padrão ligado, pedido de segurança do plano): o catálogo **não tem etiqueta** de conteúdo, então não há como filtrar. Fazer direito exige dados novos no catálogo (mudança do formato de 7 colunas, plano à parte). Hoje o que existe é a limpeza de "fora da roleta" (colunas 8) e as pessoas reais removidas.
- **`$setclaim` e `$setinterval`** (intervalo de casamento e dos rolls): as duas janelas de 30 min são constantes usadas pelo servidor, pelos testes e pelo aviso de "rolls voltaram". Mexer nelas pede um plano à parte.
- **`$dk` aleatório em 4 faixas** e **`1000 ka` nas trocas**: não feitos (o `$dk` continua em 250 fixos).
- **`$ime`, `$imq!`, `$ims`** e o `$tuarrange`: não feitos.
- O `$disable` não é aplicado quando um poder está armado (Vidência, Amuleto, Chamar desejo, Escolha dupla): esses sorteiam por raridade e ignoram o filtro pessoal.

### Fase 9: conquistas (24/11/2026)

Plano completo em [PLANO-MUDAE-CONQUISTAS-2026-11-24.md](PLANO-MUDAE-CONQUISTAS-2026-11-24.md). Decisões abertas resolvidas pelas recomendações do plano: teto de 11.000 de kakera no total e 1.500 por dia, vantagens permanentes liberadas, conquistas coletivas ("Do servidor") **só depois**, comando `$conquistas` (também `$marcos`).

**Feito** (código e testes; ainda **não publicado**):
- `server/mudae-conquistas.js`: **30 trilhas de 3 níveis (bronze, prata, ouro), 4 escondidas e 3 coletivas = 97 conquistas**, por servidor (`store.achievements[conta]`). Roleta, constância (dias jogados e sequência do `$dk`), coleção (casamentos, tamanho do harém, mais personagens da mesma obra, obra completa, fontes diferentes), raridade, kakera (cristais, maior saldo, kakera ganho), Forja e poderes, social (presentes, trocas, kakera dado), desejos, harém (notas, ordem, divórcios), chaves (chaves rolladas e soulmates) e kakera nos casados (cristais da carta e cores raras). Escondidas: **Madrugada** (casar entre 3h e 5h de Brasília) e **Reencontro** (casar de novo com um personagem que já foi seu).
- **Recompensas**: kakera uma vez (18, 72 e 260 por nível; 100 nas escondidas; 50, 100 e 200 nas coletivas; **soma exata de 11.250**, que é 10% da Forja inteira), um **título** por conquista (escolhido com `$titulo nome` ou na aba, aparece ao lado do nome no harém, no álbum e no `$profile`) e 3 **vantagens permanentes** dadas pelo ouro de Casamenteiro (+1 vaga de desejo), Obra completa (+1 roll guardado) e Sequência do `$dk` (-10% no `$rolls`).
- **Fila de kakera**: as conquistas pagam no máximo 1.500 por dia (o dia vira à meia-noite de Brasília); o excedente espera e entra nos dias seguintes. O prêmio não conta como "kakera ganho" (senão alimentaria a trilha Rendimento).
- **Histórico**: a primeira avaliação de cada pessoa abre o que ela já tinha feito **sem aviso e sem kakera** (título e vantagem entram). Como a avaliação começa no primeiro roll, quem já joga pode ver conquistas de contadores antigos abrirem de uma vez no começo.
- **Avisos**: toque para quem ganhou, em qualquer canal do servidor; as de prata, ouro e escondidas viram também uma linha no Salão.
- **Telas**: aba **Conquistas** no Salão (por categoria, com barra de progresso, o que cada uma paga, escolha do título e quanto kakera está na fila), `$conquistas` e `$titulo` no chat.
- **Contadores novos**: `epic`, `deepClaims` (personagem acima da posição 50.000), `wishClaims`, `remarried`, `night`, `gifts`, `trades`, `kakeraGiven`, `daysPlayed`, `dkStreak`, `cardKakera`, `rareColors`, e por conta `earned` (kakera ganho, sem presente nem troca) e `peak` (maior saldo).
- **Anti-abuso**: presentes, kakera dado e trocas entre as mesmas duas contas contam no máximo 3 vezes por dia; conquista nunca é tirada; tudo é validado no servidor.
- Testes: `test/mudae-conquistas.test.js` (16) e o teste de ponta a ponta. O simulador confere o orçamento (≤ 10% da Forja, teto diário ≤ 2% da Forja, no máximo 3 vantagens).

**Ficou fora da Fase 9, de propósito:**
- ~~Conquistas "Do servidor"~~: feitas na parte 2.
- **Molduras de perfil e de carta** como recompensa: só visuais e exigem arte e CSS que ainda não existem; no lugar, ficaram os títulos.
- ~~Sorte de principiante, Dedo no gatilho, Quase, Dia perfeito e Acabamento raro~~: feitas na parte 2.
- As conquistas do **Lote B e C só contam do dia em diante**: o histórico anterior dos contadores novos (por exemplo `epic`) começa em 0.

### Fase 9, parte 2: conquistas coletivas e as que faltavam, e a Ajuda (24/11/2026)

**Conquistas que antes estavam de fora, agora feitas:**
- **Do servidor** (coletivas): quando o servidor inteiro chega a **100, 1.000 e 10.000 casamentos**, quem jogou nos últimos 30 dias (com pelo menos 10 rolls) ganha a conquista (50, 100 e 200 de kakera e um título). A lista de quem recebe é guardada **no instante da meta**, então quem chegou depois não leva a meta que já passou (a aba explica por que). O aviso público sai **uma vez**, na hora da meta, não por pessoa. A contagem de casamentos do servidor só é refeita quando o harém muda, para não pesar nos rolls.
- **Sorte de principiante** (casar o personagem que saiu no 1º roll da sua janela de 30 min), **Dedo no gatilho** (casar um desejo em menos de 5 s da carta aparecer), **Acabamento raro** (medalhas com acabamento holográfico ou galáxia), e as escondidas **Quase** (chegar menos de 1 s depois de quem casou) e **Dia perfeito** (no mesmo dia: os 15 cristais inteiros, o `$dk` e o `$daily`).
- O catálogo passou de 83 para **97** conquistas. Para o total continuar em exatamente 10% da Forja (11.250), o kakera por nível das trilhas caiu de 20, 80 e 300 para **18, 72 e 260**.
- Correção de desenho: **"Obra completa" só vale obra de 3 a 12 personagens** (antes uma obra de 1 ou 2 personagens se completava sem querer).

**Ajuda** (pedido do dono):
- Botão **Ajuda** na barra de cima do Salão, que abre um **popup** com busca. São 12 assuntos (como o Mudae funciona, rolar e casar, harém, kakera e cristais, chaves, desejos e curtidas, sua roleta, personalizar, Forja e poderes, conquistas, servidor e moderação, ajuda) e as explicações de **todos os comandos**, com os números reais do jogo. Fecha com Esc, com o × ou clicando fora; o foco fica preso na janela e volta ao botão ao fechar; no celular vira tela cheia.
- **`$ajuda`** (também `$help` e `$comandos`) no chat: sozinho lista os assuntos; `$ajuda limroul` explica um comando e `$ajuda chaves` um assunto.
- O texto mora num arquivo só (`public/mudae-ajuda.js`), usado pelo popup e pelo `$ajuda`. **Dois testes impedem que ele envelheça**: um confere que todo comando do servidor tem explicação e que nenhuma explicação cita um comando que não existe; outro confere que os números do texto (rolls, tempos, tetos, limites) batem com as regras do jogo. Quem criar um comando novo sem explicá-lo vê o teste falhar.
- Testes: `test/mudae-conquistas-extra.test.js` (9) e `test/mudae-ajuda.test.js` (13).

**Ficou de fora, de propósito:**
- **Molduras de perfil e de carta** como recompensa (precisam de arte, que foi deixada de lado).
- A aba Ajuda não tem versão para o modo simplificado (chat): lá vale o `$ajuda`.

### Remoção da roleta pessoal (24/11/2026)

A pedido do dono, a "Sua roleta" saiu do Mudae: **`$disable` (`$d`), `$disablelist` (`$dl`), `$antidisable` (`$ad`), `$limroul`, `$togglewestern` (`$tw`) e `$toggleirl`**. Saíram os comandos, as funções do servidor, a seção da Ajuda, as sugestões do chat, a linha do `$overview` e os testes; os limites `limroulMin` e `disabledMax` saíram das regras. O sorteio agora só respeita o que o **servidor** tirou com `$serverdisable`. Há um teste de guarda (`test/mudae-lote-d.test.js`) garantindo que esses comandos não existem mais. Se algum teste local tiver gravado `disabled`, `limroul`, `antidisabled` ou as preferências `noWestern`/`noIrl` no banco, esses campos ficam parados e não são lidos por nada (nada disso foi publicado).

### Ainda não feito no Lote A (resto)
- Nada disso foi aberto no navegador: o cliente só passou na checagem de sintaxe.
- CHANGELOG, Novidades (`public/changelog.js`) e publicação.
