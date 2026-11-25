# Plano: conquistas e marcos do Mudae (por servidor, com recompensa)

Data: 24/11/2026. Complementa [PLANO-MUDAE-PARIDADE-2026-11-24.md](PLANO-MUDAE-PARIDADE-2026-11-24.md) (é a Fase 9 dele).
O original tem "badges" e "mudapins" de evento. Aqui as conquistas são **do Resenhex**: seguem o que a pessoa faz no Salão e dão algo que combina com a Forja e os poderes.

## 1. Regras de projeto

1. **Por servidor.** Moram em `store.achievements[conta]` (o `db.mudae` da comunidade), como casamentos e kakera. Mesma pessoa, outro servidor, outro quadro de conquistas.
2. **Tudo vem de contadores que já existem** (`store.stats`: `claims`, `rolls`, `crystals`, `legendary`) mais alguns novos (§4). Nada de conquista que dependa de dado que o servidor não guarda.
3. **Conquista nunca tira nada**, nunca expira, e não é refeita se o dado cair depois (divorciar não "desconquista").
4. **A recompensa não substitui a Forja nem os poderes.** O total de kakera de todas as conquistas fica em **cerca de 10% do custo da Forja inteira** (a Forja custa 112.500). Ver §5.
5. **Aviso igual ao dos poderes:** a conquista voa na tela com faixa, e o chat ganha uma linha só (`kind: 'achievement'`), visível a quem está no Salão. As de início de jornada avisam só a própria pessoa, para não encher o chat.
6. **Sem corrida nem escassez** (nada de "primeiro do servidor leva"). Exceção opcional: a categoria **Do servidor** (§3, última linha) tem conquistas coletivas.
7. **Um lugar para ver tudo:** aba **Conquistas** no Salão, com progresso (barra) de cada uma e o que ela dá. Também aparece no `$conquistas` e no perfil.

## 2. Estrutura de uma conquista

```js
{ key: 'casar-25', cat: 'colecao', name: 'Colecionador', tier: 1,       // tier 1 a 3 (bronze, prata, ouro)
  count: 'claims', need: 25,                                             // contador e meta
  reward: { kakera: 100 },                                               // ver §5
  hidden: false }                                                        // as ocultas só aparecem depois de abertas
```

- Conquistas em **trilhas** (mesma `trail`, 3 tiers): a trilha mostra só o tier seguinte, com os anteriores marcados. Isso mantém a lista curta.
- Tudo em `server/mudae-conquistas.js` (regras e contas), com números em `mudae-regras.js` (`ACHIEVEMENTS`).
- `refresh(store, accountId, ctx)` igual ao dos poderes: abre o que chegou à meta, devolve `{ unlocked, fresh, first }`. Rodado no mesmo `afterProgress` do `server.js`. No primeiro cálculo, vale o histórico (backfill) **sem aviso público** e **sem kakera** (ver §6).

## 3. Catálogo inicial (≈ 40 conquistas, 14 trilhas)

Os contadores marcados com ★ já existem hoje; os outros nascem na Fase 9.0 (§4). Fase = quando a conquista pode ligar.

| Categoria | Trilha (tier 1 → 3) | Contador | Metas | Fase |
|---|---|---|---|---|
| **Roleta** | Giro (Girador → Roleteiro → Sem freio) | `rolls` ★ | 50 · 500 · 5.000 | já |
| | Sorte de principiante: casar no 1º roll da janela | `firstRollClaims` | 1 · 10 · 50 | já |
| **Coleção** | Casamenteiro | `claims` ★ | 10 · 50 · 200 | já |
| | Harém cheio (tamanho atual do harém) | `haremSize` | 25 · 100 · 250 (limite 300) | já |
| | Fiel a uma obra: personagens da mesma obra | `bestSeries` | 5 · 15 · 30 | já |
| | Obra completa: ter **todos** os personagens ativos de uma obra pequena (até 12) | `seriesComplete` | 1 · 3 · 10 | já |
| | Cosmopolita: fontes diferentes no harém (anime, jogos, quadrinhos, desenhos, séries, VN) | `sourcesOwned` | 3 · 5 · 6 | já |
| **Raridade** | Brilho (lendários casados) | `legendary` ★ | 1 · 5 · 20 | já |
| | Faro (épicos casados) | `epic` | 5 · 25 · 100 | já |
| | Garimpeiro: casar um personagem **acima da posição 50.000** do catálogo | `deepClaims` | 1 · 10 · 50 | já |
| **Kakera** | Cristaleiro | `crystals` ★ | 20 · 200 · 1.000 | já |
| | Cofre (kakera guardado de uma vez) | `kakeraPeak` | 1.000 · 10.000 · 50.000 | já |
| | Rendimento (kakera ganho no total) | `kakeraEarned` | 2.000 · 20.000 · 100.000 | já |
| **Forja** | Ferreiro (medalhas forjadas) | `forged` ★ | 1 · 7 · 28 | já |
| | Acabamento raro (um acabamento holográfico ou galáxia) | `finishRare` | 1 · 3 · 7 | já |
| | Mestre dos poderes (poderes abertos) | `powersOpen` | 3 · 6 · 8 | já |
| **Social** | Generoso (presentes dados, `$give`) | `gifts` | 1 · 10 · 50 | já |
| | Negociante (trocas fechadas) | `trades` | 1 · 10 · 50 | já |
| | Mão aberta (kakera dado, `$givek`, total) | `kakeraGiven` | 500 · 5.000 · 25.000 | já |
| **Desejos** | Realizador (desejo casado) | `wishClaims` | 1 · 10 · 50 | já |
| | Dedo no gatilho: casar um desejo em menos de 5 s | `fastWish` | 1 · 5 · 20 | já |
| **Constância** | Frequentador (dias diferentes jogando) | `daysPlayed` | 3 · 14 · 60 | já |
| | Sequência (dias seguidos com `$dk`) | `dkStreak` | 3 · 7 · 30 | já |
| **Harém e conta** (Lote A) | Cuidador (notas escritas, `$note`) | `notes` | 5 · 25 · 100 | Lote A |
| | Organizado (uso do `$sortmarry` e favorito definido) | `organized` | 1 · 3 · 5 | Lote A |
| | Faxina (divórcios, com o aviso do teto) | `divorces` | 5 · 25 · 100 | já |
| **Chaves** | Soldado de chaves (nível mais alto de chave) | `maxKey` | 3 · 6 · 10 | Fase 1 |
| | Alma gêmea (soulmates) | `soulmates` | 1 · 5 · 15 | Fase 1 |
| **Kakera nos casados** | Reflexo (kakera pego em carta de dono) | `cardKakera` | 10 · 100 · 500 | Fase 2 |
| | Arco-íris (cor rara) | `rareColors` | 1 · 5 · 20 | Fase 2 |
| **Ocultas** | Madrugada: 1 casamento entre 3h e 5h (Brasília) | `night` | 1 | já |
| | Quase: perder um personagem por <1 s (outro casou antes) | `closeCall` | 1 | já |
| | Seu próprio rival: casar com o personagem que você mesmo havia divorciado | `remarried` | 1 | já |
| | Dia perfeito: 15 cristais + `$dk` + `$daily` no mesmo dia | `perfectDay` | 1 | já |
| **Do servidor** (coletivas) | Todos juntos: o servidor passa de 100 · 1.000 · 10.000 casados | `serverClaims` | 3 metas | já |

Notas:
- As ocultas valem **só tier único** e não mostram dica na aba.
- "Do servidor" dá a recompensa **a todos** que jogaram no último mês, uma vez por meta; guardada em `store.achievements._server`.

## 4. Contadores novos (Fase 9.0, pequena, sem mudar nada do jogo)

Em `mudae-conta.js` (`statsOf`/`bumpStat`), com valor 0 por padrão: `epic`, `deepClaims`, `firstRollClaims`, `wishClaims`, `fastWish`, `gifts`, `trades`, `kakeraGiven`, `kakeraEarned`, `kakeraPeak`, `divorces`, `notes`, `organized`, `night`, `closeCall`, `remarried`, `perfectDay`, `daysPlayed`, `dkStreak` (+ `lastDay`).
Derivados na hora (sem guardar): `haremSize`, `bestSeries`, `seriesComplete`, `sourcesOwned`, `powersOpen`, `finishRare`.

O simulador (`tools/mudae-economia.js`) ganha uma linha: **kakera vindo de conquistas por dia**, para o relatório mostrar que não mexe nas faixas.

## 5. Recompensas

Quatro tipos. **Kakera** é só uma parte; o resto é o que dá graça.

| Tipo | Exemplos | Regra |
|---|---|---|
| **Kakera (uma vez)** | tier 1: 50–100 · tier 2: 250–500 · tier 3: 1.000–2.000 | Soma total de todas as conquistas ≈ **11.000** (≈ 10% da Forja). Valores na tabela de `mudae-regras.js`. Não passa pelo teto do divórcio (é de uso único), mas **conta no teto diário de entrada**: no máximo 1.500 por dia de conquistas, o resto fica na fila para o dia seguinte (impede estourar a economia no primeiro dia de quem tem histórico). |
| **Título** | "Girador", "Colecionador", "Ferreiro", "Alma gêmea" | A pessoa escolhe **1 título** para exibir no perfil, no harém e no ranking. Trilhas dão um título por tier. |
| **Moldura de perfil e de carta** | metal, esmalte, holográfico, galáxia (as mesmas da Forja) | **Só visual.** A moldura de carta é a do *personagem favorito* (`$fm`). Não substitui o acabamento da medalha. |
| **Vantagem pequena e permanente** | +1 vaga de desejo (3 conquistas de tier 3 dão até +3), +1 roll guardado, −10% no preço do `$rolls` | **Teto total de 3 vantagens**, escolhidas (não acumula tudo). Entram no `perksOf` junto com as medalhas e ficam separadas na tela para a pessoa ver de onde vem. |

O que **não** se dá: kakera por conquista repetível, rolls extras grátis por hora, poder novo, valor do personagem. Isso é da Forja.

### Exemplo de tabela de recompensas (primeira versão)

| Conquista | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Giro | 50 kakera | 250 · título | 1.000 · moldura metal |
| Casamenteiro | 100 | 400 · título | 1.500 · +1 vaga de desejo |
| Brilho (lendário) | 100 · título | 500 | 2.000 · moldura galáxia |
| Cristaleiro | 75 | 300 | 1.000 · título |
| Ferreiro | 100 · título | 500 | 2.000 · moldura holo |
| Obra completa | 150 · título | 600 | 2.000 · +1 roll guardado |
| Constância (Sequência) | 100 | 400 · título | 1.500 · −10% no `$rolls` |
| Ocultas | 200 e título cada | | |

## 6. Histórico (quem já joga)

- **Primeira avaliação = crédito do histórico** (igual aos poderes). As conquistas já cumpridas abrem **de uma vez, sem faixa pública**, e sem kakera (evita pagar quem jogou muito, o que desbalancearia a Forja de quem começou agora). Títulos, molduras e vantagens **entram** normalmente.
- Os contadores novos começam em 0 e **não** são reconstruídos (o servidor não tem como saber), exceto os derivados (§4) e `epic`, `haremSize` e `deepClaims`, que dá para tirar do harém atual.
- Mensagem de boas-vindas única no Salão: "Suas conquistas anteriores foram contadas".

## 7. Telas

- **Aba Conquistas no Salão:** grade por categoria, cada trilha com 3 selos e barra de progresso; as ocultas aparecem como "???" até abrirem. Filtro: todas, abertas, perto de abrir (≥ 80%).
- **Faixa ao abrir** igual à dos poderes (sem outro som novo; reaproveita o da Forja).
- **Perfil e harém:** título escolhido ao lado do nome; moldura no avatar do Salão.
- **`$conquistas`** (ou `$marcos`): lista curta no chat, com as 5 mais próximas.
- **Reduzir animações** é respeitado; no modo simplificado, só texto.

## 8. Anti-abuso

- Conquista só conta quando **o servidor** valida o evento (casamento, troca, presente). Nada vem do cliente.
- **Trocas e presentes entre as mesmas duas contas** contam no máximo 3 vezes por dia para a trilha Social (evita farmar trocando carta de um lado para o outro).
- **Divórcio e casamento do mesmo personagem** não conta para Faxina nem para Casamenteiro mais de uma vez por personagem (`claims[id].everClaimedBy`).
- A categoria "Do servidor" ignora contas com menos de 10 rolls (contas criadas só para inflar).
- Ações em lote do Lote A (`$divorceall`) contam **cada** divórcio uma vez, mas o `divorces` tem teto de +50 por dia.

## 9. Fases e testes

| Fase | Entrega | Testes |
|---|---|---|
| 9.0 | Contadores novos e simulador | contadores sobem só em evento válido, backfill do `epic`, `haremSize` |
| 9.1 | `mudae-conquistas.js`: catálogo, `refresh`, fila de kakera, títulos | abre na meta, não reabre, histórico sem kakera, teto de 1.500/dia, trilha mostra só o próximo tier |
| 9.2 | Ligar ao `afterProgress` e à faixa pública | aviso público só para `fresh`, não para o histórico |
| 9.3 | Aba Conquistas, `$conquistas`, título e moldura | render no celular, modo simplificado |
| 9.4 | Vantagens (`perksOf`) e "Do servidor" | teto de 3 vantagens, coletiva paga uma vez |

Pronto quando: simulador dentro da faixa (kakera de conquistas ≤ 10% da Forja), todos os testes verdes, e o Salão com a aba nova sem aumentar o tempo de abertura (medir antes e depois).

## 10. Decisões pedidas ao dono

1. **Teto de kakera por conquistas:** 11.000 no total e 1.500/dia (recomendado) ou mais generoso?
2. **Vantagens permanentes:** liberar as 3 (vaga de desejo, roll guardado, desconto no `$rolls`) ou só títulos e molduras? Recomendo liberar, porque dá motivo real para jogar.
3. **"Do servidor" (coletivas):** ligar já ou deixar para depois? Recomendo depois: é a parte que mais depende do tamanho do servidor.
4. **Nome do comando:** `$conquistas` ou `$marcos`.
