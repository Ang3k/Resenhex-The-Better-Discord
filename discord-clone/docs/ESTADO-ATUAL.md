# Onde paramos (24/10/2026)

Resumo para retomar o trabalho em outra sessão do Claude sem depender da conversa anterior.

## O que estamos tentando fazer

Deixar o Resenhex aguentar **5 mil pessoas online ao mesmo tempo**, espalhadas em vários servidores, **sem gastar nada**: na mesma máquina grátis da Oracle.

- O plano completo, com medições, metas e 7 fases, está em [plano-5000-online.md](plano-5000-online.md).
- Prontos e não publicados: os itens 1, 2 e 3 da Fase 1 (avisos só para quem foi afetado, portas do retransmissor, início rápido). O resto do plano não começou.

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
| `e3a850c` | Este resumo, o plano e a ferramenta `tools/carga-teste.js` |
| `6253ba0` | Plano revisado: varreduras no site inteiro (o próximo teto, ~400–600 online), início lento, senha fixa do TURN; ferramenta `tools/varreduras.js` |
| este commit | Fase 1, itens 2 e 3: portas e ajustes do retransmissor, TURN por TCP só na segunda tentativa, início rápido |

O dono pediu para **publicar só quando ele mandar.**

## Urgente (já afeta quem usa hoje): pronto, falta publicar

**O retransmissor de chamadas (coturn) tem só 41 portas** (`49160–49200`). Na sexta, 23/10, entre 21h e 2h, ficou sem portas 435 vezes: quem estava atrás de rede restrita não conseguia entrar na call.

**E ele barra a ligação quando as duas pontas usam o retransmissor.** O coturn passa esses pacotes pelo IP interno da máquina (`10.0.0.200`), e esse IP cai no bloqueio de IPs privados: foram 2.797 bloqueios em 7 dias (até 24/10). Quem está atrás de rede restrita não conecta com outra pessoa na mesma situação.

O que já está no código (este commit):
- `deploy/instalar-vps.sh`: portas `49152–65535` no `turnserver.conf`, no iptables e no ufw; `allowed-peer-ip` com o IP interno; `no-tcp-relay`; `verbose` (registra os bytes de cada sessão no journal).
- App: a conexão nasce só com o TURN por UDP; o TCP entra no primeiro reinício da conexão. Assim cada conexão ocupa uma porta, não duas.
- `deploy/oracle-portas-turn.py`: libera as portas na lista de segurança da Oracle, que o instalador não toca. Sem argumentos só mostra o que mudaria; em 24/10 a lista tinha UDP `49160–49200`.

**Para publicar:**
1. `py deploy/oracle-portas-turn.py --aplicar` (antes da publicação; abrir as portas antes não atrapalha nada).
2. Publicar como de costume (seção abaixo). A publicação reinicia o coturn e derruba as calls que passam por ele.
3. Conferir no servidor:
   - `sudo grep -E "min-port|max-port|allowed-peer" /etc/turnserver.conf` mostra `49152`, `65535` e `10.0.0.200`;
   - depois de uma call, `sudo journalctl -u coturn --since -1h | grep -c usage` passa de 0;
   - `sudo journalctl -u coturn --since -1h | grep -c "10.0.0.200 denied"` fica em 0.

## Como publicar sem susto

1. Conferir quem está online: painel "Chamadas agora", ou `sudo ss -tn state established "( sport = :3000 )"` no servidor. Publicar reinicia tudo e derruba as calls por 1–2 s.
2. Se tiver gente em call, avisar o dono e deixar ele escolher a hora.
3. Rodar `deploy/atualizar-oracle.ps1` a partir da pasta da branch que vai ao ar. Ele faz backup dos dados antes.
4. Outras sessões do Claude trabalham em outras branches (`git worktree list`). Antes de publicar, ver se o que está no ar tem algo que a branch não tem.

## Como medir

- **`tools/carga-teste.js`:** simula N pessoas em N servidores e mede o custo de cada mudança. Instruções no começo do arquivo.
  - Criar servidor tem limite de 5 por minuto; o script já contorna isso.
- **Resultado de 24/10** (40 servidores de 20 pessoas, 800 online): uma mudança caiu de 206 ms, entregue a 800 pessoas, para ~20 ms, entregue a 21 (com o `9765b48`).
- **`tools/varreduras.js`:** mede, sem subir o servidor, as varreduras que crescem com o número de contas (o teste acima não as pega, porque só cria contas online).
- **Início do servidor** com 10 mil contas e 2 mil servidores: 20 s antes do início rápido, 1 s depois. Com 50 mil contas e 10 mil servidores: 1,3 s (no PC).
- O ARM é ~1,7× mais lento que o PC do dono nesse tipo de trabalho.

## Como o dono gosta de trabalhar

- Conversa em português, linguagem simples, sem jargão.
- **Não publicar nem enviar ao GitHub sem ele pedir.**
- Mudança simples: rodar só os testes dela, uma vez. Não rodar a suíte inteira sem motivo.
- Telas no nível de acabamento do Discord, sempre conferidas no navegador.
- Mais contexto na memória do Claude Code deste PC: `C:\Users\angej\.claude\projects\C--Games-project2\memory\`. A memória fica no PC, não na conta.
