# Integração da atualização de 10/10/2026

A branch local `work` foi atualizada de `f9737d5` para `1d5c66d`, incorporando os oito commits novos de `codex/interface-transmissoes`, conforme a escolha do usuário. A `main` remota ainda apontava para `f9737d5` na consulta. Esta validação foi concluída antes do commit de voz por IA. Posteriormente, o usuário solicitou o envio das alterações para a mesma branch no GitHub. Não houve deploy.

## Resultado

As melhorias Android/celular e a roleta do Mudae foram combinadas com o catálogo, os retratos, a seleção de personagens nos dois seletores, o motor RVC e as otimizações existentes. Os 97 arquivos do trabalho local foram recuperados: 91 conservaram o SHA-256 anterior, e seis receberam as alterações da atualização. O worker Python, o catálogo, o controlador, o AudioWorklet e o protocolo binário permaneceram idênticos à versão já comparada numericamente.

O único conflito foi no comando `check` do `package.json`; a resolução conserva as verificações de `public/android.js`, `public/voice-ai.js` e `public/voice-ai-worklet.js`. Os dois campos de versão do `package-lock.json` foram alinhados a `1.2.5`, sem mudar dependências.

## Verificações

| Verificação | Resultado |
| --- | --- |
| Suíte Node completa sob Xvfb, concorrência 1 | 259 passaram; zero falhas, cancelamentos ou ignorados; 116,8 s |
| Worker Python | 15 passaram |
| `npm run check`, checagens desktop e compilação Python | Passaram |
| `git diff --check` e arquivos com conflitos não resolvidos | Passaram; nenhum conflito pendente |
| Chamada real Electron → navegador | Passou no modo explícito `fallback`, com Braum, CPU e perfil Menor atraso |

Na chamada, a prova de inferência real via IPC produziu 3.840 samples finitos em 138,8 ms (RTF 1,74). Dois blocos convertidos chegaram ao AudioWorklet; o p95 local dessa amostra curta foi 261,3 ms. O navegador recebeu 9.429 bytes de Opus. Retratos nos seletores, mute/desmute e recuperação da voz normal funcionaram, sem erros JavaScript. Os bytes recebidos também incluem o período de áudio normal após a recuperação.

Esses números verificam a integração e a recuperação em CPU lenta; não certificam fala convertida contínua. Windows/GPU, instalador e comportamento físico do Android permanecem sem validação nesta máquina Linux. As medidas de desempenho anteriores continuam nos relatórios específicos; esta execução verifica a integração dos commits, não mede um novo ganho de velocidade.

## Evidências e recuperação

[Resumo da execução](integracao-2026-10-10/summary.json) e [resultado Electron](integracao-2026-10-10/electron-smoke.json).

Backup completo e logs estão em `/workspace/.local/share/resenhex/integrations/20261010T170120`. O stash `56c6316dfaef10b052746c9f1d0eeb67cafa1e5c` foi aplicado e mantido para recuperação; o diretório contém o arquivo tar, o patch binário e os hashes anteriores. Não reaplique esse stash sobre a integração já concluída.
