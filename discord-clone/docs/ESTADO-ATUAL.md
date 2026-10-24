# Onde paramos (24/10/2026)

Resumo para retomar o trabalho em outra sessão do Claude sem depender da conversa anterior.

## O que estamos tentando fazer

Deixar o Resenhex aguentar **5 mil pessoas online ao mesmo tempo**, espalhadas em vários servidores, **sem gastar nada**: na mesma máquina grátis da Oracle.

- O plano completo, com medições, metas e 7 fases, está em [plano-5000-online.md](plano-5000-online.md).
- Nada do plano foi implementado ainda, a não ser o item 1 da Fase 1 (commit `9765b48`), que está pronto mas não foi publicado.

## O que está no ar

- **Site:** versão **1.9.0** em https://resenhex.com.br, publicada em 24/10 a partir do `main` local (`484c2f8`).
- **Painel "Chamadas agora":** só o dono vê, em Configurações. Mostra quem está online e em qual call.
- **GitHub:** o `main` de lá está 4 commits atrás do que está no ar (parou na 1.8.8). Ninguém enviou ainda.
- **Servidor:** Oracle ARM grátis (2 núcleos, 12 GB), IP `146.235.41.73`, usuário `ubuntu`, chave `~/.ssh/resenhex-oracle-ed25519`.
  - App em `/opt/resenhex`; dados em `/var/lib/resenhex/data.json` e `/var/lib/resenhex/uploads`.
  - Backups em `/var/backups/resenhex`.

## O que está pronto e não foi publicado

Tudo na branch `claude/chamada-atual` (pasta `.claude/worktrees/chamada-atual`), em cima do que está no ar:

| Commit | O quê |
|---|---|
| `fc81617` | Prévia com imagem ao colar o link do site ou de um convite (WhatsApp, Discord…) |
| `9765b48` | Avisos só para quem foi afetado (teto de ~400 online → muito mais) + publicação guarda só os 10 backups automáticos mais novos (apaga 43, libera 2,8 GB na próxima publicação) |
| este commit | Este resumo, o plano e a ferramenta `tools/carga-teste.js` |

O dono pediu para **publicar só quando ele mandar.**

## Urgente (já afeta quem usa hoje)

**O retransmissor de chamadas (coturn) tem só 41 portas** (`49160–49200`, definido em `deploy/instalar-vps.sh`).

- Na sexta, 23/10, entre 21h e 2h, ficou sem portas 435 vezes. Quem estava atrás de rede restrita não conseguia entrar na call.
- **Correção:** ampliar para `49152–65535` em três lugares: no `turnserver.conf`, no iptables do servidor e na lista de segurança da Oracle (a chave da API da Oracle está em `~/.oci` no PC).
- Reiniciar o coturn derruba as calls que passam por ele, então dá pra conferir quem está online antes.
- Detalhes no plano, Fase 1 item 2.

## Como publicar sem susto

1. Conferir quem está online: painel "Chamadas agora", ou `sudo ss -tn state established "( sport = :3000 )"` no servidor. Publicar reinicia tudo e derruba as calls por 1–2 s.
2. Se tiver gente em call, avisar o dono e deixar ele escolher a hora.
3. Rodar `deploy/atualizar-oracle.ps1` a partir da pasta da branch que vai ao ar. Ele faz backup dos dados antes.
4. Outras sessões do Claude trabalham em outras branches (`git worktree list`). Antes de publicar, ver se o que está no ar tem algo que a branch não tem.

## Como medir

- **`tools/carga-teste.js`:** simula N pessoas em N servidores e mede o custo de cada mudança. Instruções no começo do arquivo.
  - Criar servidor tem limite de 5 por minuto; o script já contorna isso.
- **Resultado de 24/10** (40 servidores de 20 pessoas, 800 online): uma mudança caiu de 206 ms, entregue a 800 pessoas, para ~20 ms, entregue a 21 (com o `9765b48`).
- O ARM é ~1,7× mais lento que o PC do dono nesse tipo de trabalho.

## Como o dono gosta de trabalhar

- Conversa em português, linguagem simples, sem jargão.
- **Não publicar nem enviar ao GitHub sem ele pedir.**
- Mudança simples: rodar só os testes dela, uma vez. Não rodar a suíte inteira sem motivo.
- Telas no nível de acabamento do Discord, sempre conferidas no navegador.
- Mais contexto na memória do Claude Code deste PC: `C:\Users\angej\.claude\projects\C--Games-project2\memory\`. A memória fica no PC, não na conta.
