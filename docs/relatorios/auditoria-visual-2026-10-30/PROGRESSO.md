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
- [x] Capturas "antes" em 1440×900 e 390×844 (123, em `antes/`)
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

- [ ] Onda 1 — Leveza (bg-window, blur, infinitas, transições, Mudae + reduzir animações, medidor de áudio)
- [ ] Onda 2 — Movimento (tokens com molas, clique)
- [ ] Onda 3 — Ícones (peso ótico, trocas, gestos)
- [ ] Onda 4 — Momentos assinatura
- [ ] Onda 5 — Estados (abertura, vazios, erro/sucesso, foco)
- [ ] Onda 6 — Cor (contraste, tokens, elevação)
- [ ] Capturas "depois", medição final, antes × depois no relatório, resumo final

## Próximo passo

Começar a Onda 1 no ramo `visual-polish` (servidor "antes" pode ser subido de `$SP/main-wt/discord-clone`).
