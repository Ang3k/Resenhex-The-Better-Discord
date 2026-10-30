# Organização do repositório

Onde cada coisa fica e onde guardar o que for criado. Vale para pessoas e para agentes de IA. Quem criar, mover ou apagar uma pasta atualiza este arquivo no mesmo commit.

Para mexer no código, o guia é o [`docs/GUIA-AGENTES.md`](docs/GUIA-AGENTES.md): ele diz em qual arquivo está cada assunto, quais comandos rodar e o que não pode quebrar.

## Regras

1. **Esta pasta é só do Resenhex.** Trabalho de outros assuntos fica fora dela.
2. **Nada solto na raiz.** Todo arquivo novo entra numa das pastas abaixo.
3. **O que não vai para o Git tem pasta própria** (marcadas como *local* abaixo). Saídas de teste, gravações, builds e provas grandes vão para `artifacts/`, nunca para a raiz nem para `discord-clone/`.
4. **Nada de senhas, chaves, tokens ou dados de usuários no repositório.** No servidor, eles ficam em arquivos do systemd, fora do Git.
5. **Sem lugar certo?** Crie a pasta seguindo os nomes abaixo e registre aqui.

## Mapa

*Local* quer dizer fora do Git: a pasta só existe neste PC e o `.gitignore` a esconde.

```
/
├── README.md               apresentação do projeto (página do GitHub)
├── ORGANIZACAO.md          este arquivo
├── CONTRIBUTING.md         como contribuir
├── LICENSE                 AGPL-3.0
├── .gitignore
│
├── docs/                   documentação; nada daqui vai para o servidor
│   ├── GUIA-AGENTES.md     como mexer no código (comece por ele)
│   ├── ESTADO-ATUAL.md     como publicar sem susto, como medir; retrato do plano de 5 mil
│   ├── ROADMAP.md          ideias e próximos passos
│   ├── VOZ-IA.md           histórico das vozes por IA (retiradas na 1.4.0)
│   ├── planos/             PLANO-ASSUNTO-AAAA-MM-DD.md
│   ├── relatorios/         ASSUNTO-AAAA-MM-DD.md e a pasta assunto-aaaa-mm-dd/ com as evidências
│   └── superpowers/        local: specs e planos das skills superpowers
│
├── discord-clone/          o aplicativo; tudo o que é publicado sai daqui
│   ├── server.js, server/  servidor
│   ├── public/             cliente web
│   ├── test/               testes
│   ├── tools/              ferramentas e laboratórios de desenvolvimento
│   ├── deploy/             instalação e publicação
│   ├── desktop/            app de Windows (Electron) e pacote da Microsoft Store
│   ├── android/            app de Android
│   ├── CHANGELOG.md        histórico de versões
│   ├── README.md           manual completo do produto
│   └── marketing/          local: divulgação (vídeos, artes, posts), uma pasta por peça
│
├── artifacts/              local: laboratórios, builds, gravações e saídas de teste
├── .claude/                local: launch.json e worktrees/ das sessões do Claude Code
├── .superpowers/           local: rascunhos do brainstorm
├── AGENTS.md, CLAUDE.md    local: instruções para agentes que valem só neste PC
└── .git/
```

O mapa por dentro de `discord-clone/` (qual arquivo cuida de cada assunto) está no [guia para agentes](docs/GUIA-AGENTES.md).

## Onde guardar cada coisa

| O que | Onde | No Git? |
|---|---|---|
| Código do servidor | um módulo em `discord-clone/server/`, ligado no `server.js` | sim |
| Código do cliente | `discord-clone/public/` (não renomeie nem mova o que já existe: são URLs) | sim |
| Teste | `discord-clone/test/assunto.test.js` | sim |
| Ferramenta ou laboratório de desenvolvimento | `discord-clone/tools/` (laboratório grande: `tools/nome/` com README) | sim |
| Script de instalação ou publicação | `discord-clone/deploy/` | sim |
| Plano de trabalho | `docs/planos/PLANO-ASSUNTO-AAAA-MM-DD.md` | sim |
| Relatório, medição, auditoria | `docs/relatorios/ASSUNTO-AAAA-MM-DD.md`; evidências pequenas (JSON, PNG) em `docs/relatorios/assunto-aaaa-mm-dd/` | sim |
| Evidência grande, build, gravação, `.tap`, `.log`, resultado de laboratório | `artifacts/assunto-aaaa-mm-dd/` | não |
| Vídeo, arte ou post de divulgação | `discord-clone/marketing/nome-da-peca/`, com um `CONTINUAR.md` dizendo como refazer | não |
| Rascunho de uma sessão de agente | a pasta temporária da própria sessão | não |
| Assunto que não é do Resenhex | fora desta pasta | não |

Não crie `discord-clone/docs/`: o que o Git conhece em `discord-clone/` (menos `desktop/`) vai para o servidor de produção na publicação.

## Nomes

- Pastas e arquivos em português, minúsculas, com hífen: `fluidez-lab-2026-10-30`.
- Data no fim, no formato `AAAA-MM-DD`, em tudo o que é retrato de um momento (planos, relatórios, laboratórios, builds).
- Planos e relatórios em maiúsculas: `docs/relatorios/CAPTURA-60FPS-2026-10-16.md`.
- Testes: `assunto.test.js` (ou `.test.mjs`).
- Ao mover um arquivo, procure quem o cita (`git grep nome-do-arquivo`) e corrija os links.

## Branches e worktrees

- A **`main`** acompanha o que está no ar. A pasta principal do repositório fica sempre na `main`, sem mudanças pendentes.
- **Cada tarefa tem a sua branch e a sua worktree.** O Claude Code cria `claude/assunto` em `.claude/worktrees/assunto/`; o Codex cria `codex/assunto` na pasta de worktrees dele.
- **Versão nova:** uma branch `claude/vX.Y` junta as branches prontas, vai ao ar e a `main` avança até ela. Antes de publicar, siga "Como publicar sem susto" em [`docs/ESTADO-ATUAL.md`](docs/ESTADO-ATUAL.md).
- **Material local não mora dentro de uma worktree.** Ele some quando a worktree é apagada. Guarde em `artifacts/` ou `discord-clone/marketing/` da pasta principal.
- Para ver o que está em andamento:
  ```bash
  git worktree list
  git branch --no-merged main
  ```
- Uma worktree cuja branch já entrou na `main` pode ser apagada com `git worktree remove .claude/worktrees/nome`, com o OK do dono.

## Ao terminar uma tarefa

- `git status` na pasta principal não mostra nada solto.
- Saídas de teste e provas estão em `artifacts/`, com data no nome.
- Pasta nova ou movida está registrada neste arquivo.
- Documento que ficou velho foi atualizado ou ganhou uma nota com a data do retrato.
