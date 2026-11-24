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

Enquanto não houver resposta, o plano segue a recomendação.

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

### Fase 6: controle da roleta (disable e limroul)
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
