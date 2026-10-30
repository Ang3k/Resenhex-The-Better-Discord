# Progresso — auditoria visual e polimento (2026-10-30)

Registro de trabalho para retomar de onde parou depois de uma interrupção. Leia de cima para baixo; a última seção "Próximo passo" diz o que fazer agora.

## Regras fixas (resumo)

- Ramo de trabalho: `visual-polish` (criado de `origin/main` em 5681fd5, sem upstream apontando para `main`; `push.default=current`). Nunca enviar nada para `main`.
- Sem PR, sem versão nova, sem entrada nova no `CHANGELOG.md`/`public/changelog.js`, sem scripts de `deploy/`, sem publicar apps.
- Orçamento: animar só `transform`/`opacity` (e `filter` em elementos pequenos); app parado = zero repintura contínua; `infinite` só para atividade real e parando com a janela escondida; `backdrop-filter` só em superfícies pequenas e temporárias; sem bibliotecas novas nem fontes novas.
- Relatórios e capturas só em `docs/`, nunca em `discord-clone/`.

## Ambiente de trabalho (scratchpad desta sessão; some se a sessão reiniciar)

- Ferramentas em `$SP/tools/` (`SP=/tmp/claude-0/-home-user-Resenhex-The-Better-Discord/42cdefbc-e31e-54b4-9e95-db8465c8646a/scratchpad`):
  `seed.js` (contas Ana/Bruno/Caio, servidor "Resenha dos Amigos", 220+ mensagens, DM), `tidy.js` (categorias padrão),
  `shots.js` (tour de capturas), `perf.js` (medições com CPU 4×), `a11y.js` (axe-core: contraste e alvos; foco), `cssinv.js`/`anim-report.js`/`token-report.js` (inventário do CSS), `srv.sh` (sobe/para servidor).
- Servidor "antes": `srv.sh start main 3000` (dados em `$SP/srv-main`, cópia em `$SP/seed-snapshot`). Árvore de `main` intacta em `$SP/main-wt` (git worktree destacado) para medir o "antes" depois que o código mudar.
- Se o scratchpad sumiu: recrie as ferramentas a partir das descrições no relatório (seção Metodologia) e rode o seed de novo.

## Feito

- [x] Li `docs/GUIA-AGENTES.md`.
- [x] Criei o ramo `visual-polish` a partir de `origin/main`.
- [x] App local rodando, contas e servidor de teste populados.
- [x] Inventário automático do CSS (37 animações infinitas, 41 transições de box-shadow, ~35 blur/backdrop-filter, 222 cores literais, 49 tamanhos de fonte, 47 raios, 178 sombras).
- [x] Pesquisa: ~25 fontes primárias levantadas (Electron, Chrome for Developers, web.dev, W3C/WCAG, MDN, Lucide, Fluent, Apple HIG).

## Fase 1 — Auditoria

- [x] Subir o app local, criar contas e servidor de teste
- [x] Capturas "antes" em 1440×900 e 390×844 (121, em `antes/`)
- [x] Inventário (`inventario.md`)
- [x] Achados com severidade (25, no relatório)
- [x] Linha de base de desempenho (`medicoes/desempenho-antes-*.json`, `respostas-por-acao-antes.json`)
- [x] Acessibilidade (`medicoes/acessibilidade-antes.json`)

## Fase 2 — Pesquisa

- [x] 12+ fontes (ver lista no plano)

## Fase 3 — Proposta

- [x] `docs/planos/PLANO-POLIMENTO-VISUAL-2026-10-30.md` (direção, tokens, ícones, momentos, estados, cor, ondas, ideias fora do escopo, decisões, pesquisa, mapa de ícones)

## Fase 4 — Implementação

- [ ] Ondas, uma por vez, com `npm run check`, `npm test` e nova medição

## Fase 4 — ondas

- [x] Onda 1 — Leveza (6 commits). Medido: palco da call 60,6 → 6,2 quadros/s e 49,9 → 1,6 pinturas/s (CPU 4×); sem lentidão, página 603 → 426 ms/s, GPU 43 → 3 ms/s, thread principal 218 → 31 ms/s. Testes: iguais ao `main` (falham só os 2 testes de voz que já falham no `main`, `desktop/test/lib.test.js` sem `npm install` e o smoke-test por tempo).
- [x] Onda 2 — Movimento (tokens com molas `linear()` + plano B, clique que solta com mola, entradas com mola suave)
- [x] Onda 3 — Ícones (peso ótico abaixo de 18 px, ~25 gestos de hover, sinal que sobe ao conectar). Trocas animadas além das que o app já faz ficaram de fora (os botões são recriados a cada renderização).
- [x] Onda 4 — Momentos (chegada, voz, pouso, voo, cutucão, acendeu, digitando, conectou, reconectou; conferidos com `ferramentas/moments.js`)
- [x] Onda 5 — Estados (abertura com logo, começo do canal, foco único, reconectado). Achado no caminho: a classe `boot-slow` no `<html>` escondia a página inteira depois de 10 s; corrigido antes do commit (`boot-late`).
- [x] Onda 6 — Cor (7 commits: tokens, contraste AA, verde forte, setinhas de 24 px, restos do Discord em tokens, elevação, textos de 10 px). Conferido com `ferramentas/a11y.js`: 0 falhas de contraste e 0 de alvo nas 15 telas (antes 27 e 6). Achado fora da tela medida: no Meia-noite e no Alto contraste o branco sobre a cor da marca fica em 2,6:1 e 2,5:1 (botões principais); registrado no relatório, não corrigido (muda o visual desses temas).
- [x] Medição final: CPU 4× (3 rodadas, 7 cenários) e sem lentidão (2 rodadas, 4 cenários); acessibilidade (0 falhas de contraste e de alvo).
- [x] A/B de respostas por ação `main` × `visual-polish` (16 a 24 cliques por ação, alternando as versões): sem diferença. A primeira medida por ação do `perf.js` (máximo de 2 cliques por rodada) sugeria piora no emoji; era ruído do método.
- [x] Capturas "depois" (120, as mesmas do "antes"), abertura comparada com o app ainda conectando (`carregando-conectando-*`, as duas versões) e 11 fotos dos momentos.
- [ ] Antes × depois no relatório, testes completos nas duas versões, resumo final

## Próximo passo

Antes × depois no relatório (rascunho pronto), testes completos nas duas versões, remover a cópia de trabalho do `main` e resumo final.
