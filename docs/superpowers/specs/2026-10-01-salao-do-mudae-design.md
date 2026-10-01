# Salão do Mudae — design

Data: 2026-10-01. Base: Mudae v1 (v0.99.9, branch `claude/mudae`): `$w/$h/$m`, botão Casar, `$mm/$im/$divorce/$tu`, 15 mil personagens do AniList em `mudae-catalogo.json`.

Objetivo: tirar o Mudae do chat e dar a ele um lugar próprio, como o DJ ganhou o palco da chamada. Uma roleta com plateia: todo mundo vê os rolls dos outros ao vivo e pode roubar.

## 1. Encaixe

- O Salão é um **canal de texto com `mudae: true`**, não um tipo novo. Herda permissões, privacidade, não lidas e histórico. Só a tela muda.
- "Criar canal" ganha a opção **🎰 Salão do Mudae** (nome padrão `salão-mudae`). Nenhum Salão é criado sozinho.
- `$w/$h/$m/$im/$divorce/$tu` só funcionam dentro de um Salão. Fora dele, resposta efêmera: "🎰 O Mudae agora mora no #salão-mudae" com botão para ir (ou como criar um, se não houver).
- Casamentos, limites e favoritos são **por servidor**; vários Salões dividem tudo.
- Os rolls continuam sendo mensagens do bot no canal. A mesa ao vivo é montada a partir delas (últimos 12 rolls).
- Presença: o servidor guarda quem está com um Salão aberto e envia `mudae:presence` (pessoas, rolls restantes, se podem casar) para quem está nele.

## 2. Tela

- Topo: `🎰 salão-mudae`, abas **Mesa / Meu harem / Ranking**, pílula de status ("7/10 rolls · casamento disponível 💍" ou contagem).
- **Mesa:** palco com o card grande, botão Casar com anel de contagem e aviso de prioridade, reações flutuando. Palco parado mostra o último lendário do servidor ou o seu favorito ("Rode para começar"). Botões `$w Waifu`, `$h Husbando`, `$m Qualquer um`. Faixa "Mesa ao vivo" com os últimos 12 rolls (avatar de quem rodou, moldura, contagem / "Casado com X" / "Tempo esgotado"); clicar leva ao palco.
- **Coluna direita** (no lugar da lista de membros): abas **Chat** (mensagens do canal; eventos viram linhas compactas do bot; `$w` funciona) e **No salão** (avatar, 10 bolinhas de rolls, 💍 se pode casar).
- Janela < ~1000 px e celular: coluna direita vira botão "💬 Chat · No salão" que abre por cima; palco, botões e mesa empilhados.

## 3. Roleta, raridade, snipe

| Raridade | Ranking | Chance ($m) |
|---|---|---|
| Lendário | 1–100 | 1/150 |
| Épico | 101–1000 | 1/17 |
| Raro | 1001–5000 | ~1/4 |
| Comum | resto | ~2/3 |

- Servidor sorteia na hora e manda o resultado + 8 fotos-isca. Giro de ~1,6 s (até +1 s esperando a foto). Épico/lendário desaceleram mais e vazam luz da cor da raridade antes de parar. `prefers-reduced-motion`: fade, sem roleta.
- `revealAt = ts + giro`; os 45 s contam a partir do `revealAt`; o servidor recusa claim antes dele.
- **Prioridade:** 3 s depois do `revealAt` só quem rodou casa. Depois, qualquer um. Roubo vira linha no chat: "😈 Caio roubou a Shizuka do roll de Duda".
- **Palco híbrido:** seu roll sempre toma o palco. Roll de amigo toma o palco só se ele estiver livre (sem giro e sem card ainda casável); senão entra na mesa com animação. Lendário de qualquer um toma o palco de todos (depois do seu giro, se houver) com banner "🔥 ANA TIROU UM LENDÁRIO!", flash e fanfarra. Épico de amigo: brilho mais forte e som curto na mesa.
- Reações 😱 🔥 💖 😂 💀 no palco: transmitidas a quem está no Salão, não gravadas, com limite.
- Sons gerados no navegador (giro, revelação por raridade, casamento, fanfarra), respeitando volume/mudo dos efeitos.

## 4. Álbum, favorito, ranking

- **Meu harem:** faixa com avatar, total, valor e o favorito em destaque; busca (nome/obra), filtros por raridade, ordenar (valor, recentes, obra, nome); grade responsiva, imagens lazy, 60 por vez. Hover: inclinação 3D + holográfico em épico/lendário, ações ⭐ Favoritar e 💔 Divorciar (confirmação). Álbum de outra pessoa: só leitura (abre pelo "No salão", Ranking ou `$mm @pessoa`). `$mm` no Salão abre a aba em vez de postar. Dados via `mudae:harem` sob demanda; sem limite de 300.
- **Favorito:** um por pessoa por servidor; divorciar limpa. Sem favorito, vale o mais valioso. Aparece no popup de perfil (card + "42 personagens · 18.900 💎") se a pessoa tiver personagens naquele servidor; clicar abre o álbum.
- **Ranking:** por valor total; medalhas no top 3, avatar, nome, nº de personagens, valor, miniatura do favorito; sua linha destacada mesmo fora do topo. Faixa "Lendários do servidor" com todos os lendários com dono. Calculado ao abrir a aba.

## Fora do escopo (depois)

Wishlist, kakera, trocas, bônus diário, "Quem é esse personagem?", bloco no palco da chamada.

## Testes

- `test/mudae.test.js`: raridade, prioridade/janela com `revealAt`, favorito, ranking, divórcio por id.
- `test/mudae-server.test.js`: comandos só no Salão (redirect fora), roll com `revealAt`/iscas, prioridade e roubo, presença, harem/ranking/favorito, criação do canal.
- `test/server-ui.test.js`: tela do Salão monta, palco/mesa recebem roll, abas.
- Validação visual no navegador (desktop, janela estreita, celular, temas), com duas contas.
