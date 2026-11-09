# Economia do Mudae: simulação (09/11/2026)

Para repetir: dentro de `discord-clone/`, rode `node tools/mudae-economia.js`. Ele não sobe o servidor nem mexe em nenhum arquivo de dados. Sempre dá o mesmo resultado (semente fixa 12345, média de 40 comunidades por perfil). Opções: `--dias 200`, `--semente N`, `--repeticoes N`, `--md` (tabelas prontas para colar), `--escala X` (multiplica os valores dos cristais, só para testar) e `--divorcio-no-limite` (veja "Dúvidas" abaixo).

## O que foi simulado

- 200 dias, três perfis, cada um em servidores de 1, 5 e 20 pessoas (todas do mesmo perfil).
  - **Joga pouco:** 1 visita de 20 min, 10 rolls, 1 casamento, `$dk`.
  - **Normal:** 2 visitas de 20 min, 20 rolls, 3 casamentos, `$dk`.
  - **Viciado:** Salão aberto 8 h, 160 rolls, 16 casamentos (um por meia hora), divorcia o que vale menos que a mediana e pega todos os cristais.
- O cristal nasce a cada 5 a 15 min (média 10) **só enquanto alguém está no Salão**: a contagem para quando o Salão está vazio. É isso que dá o mesmo ritmo em servidor de 1 e de 20 pessoas.
- Quem joga pouco ou normal pega 90% / 95% dos cristais quando está no Salão; o viciado pega todos.
- Teto de 15 cristais por dia (depois rendem 10%), divórcio devolvendo no máximo 500 por dia, `$dk` de 250 (500 com a Ouro IV) e vantagens que mexem em kakera ou rolls (Ouro, Safira, Esmeralda).
- Compra: o nível I de todas as medalhas (da mais barata à mais cara), depois o II de todas, e assim por diante.
- O cristal antigo (só em roll de personagem com dono) não conta.
- Só o viciado divorcia. Quem joga pouco ou normal e enche o harem (300) para de casar.

## Cristais escolhidos

| Cor | Valor | Peso (%) |
|---|---|---|
| Roxo | 75 | 30 |
| Azul | 100 | 28 |
| Ciano | 130 | 18 |
| Verde | 175 | 12 |
| Amarelo | 235 | 7 |
| Laranja | 340 | 3,5 |
| Vermelho | 560 | 1,5 |

- **Chuva:** 4% dos cristais; 16 cristais pequenos, cada um vale 25% do valor da cor; conta como um cristal no teto do dia.
- **Corrente:** 4% dos cristais; os elos seguintes valem 40, 75, 140, 280 e 560; cada elo conta como um cristal no teto.

## Tempos (em dias)

| Perfil | Servidor | kakera/dia (30 primeiros dias) | kakera/dia (até todas no IV) | cristais/dia | 1ª medalha | Todas no I | Todas no IV |
|---|---|---|---|---|---|---|---|
| Joga pouco | 1 | 584 | 684 | 2,0 | 1,7 | 20,2 | 165,7 |
| Joga pouco | 5 | 567 | 673 | 2,0 | 1,6 | 20,6 | 167,8 |
| Joga pouco | 20 | 573 | 681 | 2,0 | 1,6 | 20,3 | 166,0 |
| Normal | 1 | 997 | 1.117 | 4,2 | 1,1 | 12,1 | 101,7 |
| Normal | 5 | 971 | 1.107 | 4,2 | 1,1 | 12,8 | 102,4 |
| Normal | 20 | 986 | 1.126 | 4,3 | 1,1 | 12,5 | 100,6 |
| Viciado | 1 | 4.424 | 4.385 | 54,8 | 1,0 | 3,4 | 26,2 |
| Viciado | 5 | 4.428 | 4.379 | 54,9 | 1,0 | 3,5 | 26,2 |
| Viciado | 20 | 4.432 | 4.385 | 54,9 | 1,0 | 3,5 | 26,2 |

Dia em que cada poder abre:

| Perfil | Servidor | Vidência | Cadeado | Amuleto | Chuva de cristais | Chamar desejo | Eco | Escolha dupla | Laço |
|---|---|---|---|---|---|---|---|---|---|
| Joga pouco | 5 | 1,6 | 17,9 | 14,9 | 20,9 | 60,8 | 37,9 | 45,6 | 58,2 |
| Normal | 1 | 1,1 | 7,0 | 8,3 | 9,9 | 35,7 | 17,7 | 22,5 | 34,2 |
| Normal | 5 | 1,1 | 7,0 | 7,8 | 10,1 | 36,7 | 17,8 | 22,6 | 35,2 |
| Normal | 20 | 1,1 | 7,0 | 6,9 | 9,9 | 36,1 | 17,7 | 22,6 | 34,7 |
| Viciado | 5 | 1,0 | 2,0 | 1,5 | 1,0 | 9,3 | 4,0 | 3,7 | 9,0 |

## Conferência com a spec (jogador normal)

| Meta | Resultado |
|---|---|
| Uns 1.000 de kakera por dia (850 a 1.150) | 971 a 997 nos primeiros 30 dias: ok |
| 1ª medalha no dia 1 | média de 1,1 dia (na maioria das comunidades é no dia 1): ok |
| Todas no I entre os dias 9 e 13 | 12,1 a 12,8: ok |
| Todas no IV entre os dias 100 e 135 | 100,6 a 102,4: ok, na beirada de baixo |
| Viciado no máximo 4 vezes mais rápido | 3,9 vezes (servidor de 5): ok, na beirada |
| Servidor de 1 e de 20 pessoas com até 10% de diferença | 3% no "todas I" e 1% no "todas IV": ok |

## Dúvidas e cuidados

- **As duas metas de tempo quase não têm folga.** Do "todas no I" ao "todas no IV" o tempo só aumenta uns 8 vezes, porque a renda sobe com as próprias medalhas (a Ouro e o `$dk` em dobro). Para o "todas I" ficar até o dia 13 e o "todas IV" passar do dia 100, os valores dos cristais ficam numa faixa estreita: 5% a mais ou a menos nos valores já estoura uma das duas metas.
- **Divórcio de quem enche o harem.** Se quem joga pouco ou normal também divorciar (em vez de parar de casar) quando chega a 300 personagens, o "todas no IV" do normal cai para uns 94 dias (rodando com `--divorcio-no-limite`), abaixo da meta. Isso só acontece depois de uns 60 dias de jogo. Se isso importar, o ajuste fica fora dos cristais: seria preciso mexer no teto do divórcio, nos preços ou nas vantagens, o que esta leva não faz.
- **Corrente e chuva na contagem do teto.** A simulação conta cada elo da corrente como um cristal para o teto de 15, e a chuva inteira como um. Se a regra de verdade contar a corrente inteira como um só, quem joga pouco ganha um pouco mais e os números mudam levemente; vale rodar de novo.
- O `REF_SIZE` não é exportado pelo `server/mudae.js` hoje; o script usa 15.000 (o mesmo valor do arquivo).
