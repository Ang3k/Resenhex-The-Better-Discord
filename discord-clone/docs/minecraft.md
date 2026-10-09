# Minecraft no Resenhex

O botão **Minecraft** abre o EaglercraftX 1.8.8 u53 na área principal do Resenhex. Numa chamada, ela fica em cima do jogo (mesmo layout dividido da chamada privada), e a sala vê quem está jogando (`game: 'minecraft'` no `voice:state`), com “Entrar no Minecraft” para quem ainda não abriu. Cada jogador escolhe seu mundo ou servidor no menu do jogo; esta integração não hospeda um servidor multiplayer.

Prepare os arquivos com `npm run setup:minecraft`. O script baixa a [distribuição web publicada](https://eaglercraft.com/news/eaglercraftx-u53), confere o SHA-256 e extrai apenas os arquivos do cliente. Também aceita `node tools/prepare-minecraft.js --archive caminho/do/u53_web.zip`. Os arquivos grandes são ignorados pelo Git. Os scripts e assets do jogo permanecem como publicados, com os créditos do cliente.

O carregador usa WASM quando JSPI está disponível e JavaScript nos demais navegadores. Ambos usam os mesmos bancos de mundos e configurações. Os mundos ficam no navegador do jogador, vinculados à origem do jogo. Não sincronizam com a conta do Resenhex.

Para produção, `minecraft.SEUDOMINIO` deve apontar para o mesmo servidor (no DuckDNS, subdomínios já apontam). Se o download do cliente falhar no deploy, o instalador avisa e segue. O instalador configura HTTPS e permite somente `/games/minecraft/*` nessa origem, sem expor o Socket.IO ou a aplicação. Em desenvolvimento, `localhost` e `127.0.0.1` usam a mesma porta e origens distintas. A separação de origem impede que o iframe leia o token da aplicação. O iframe permite scripts, armazenamento local, download de mundos e captura do ponteiro, sem acesso ao microfone ou navegação da página principal.

Fontes: [cliente e opções de integração do autor](https://gitflic.ru/project/lax1dude/eaglercraft-1_8), [distribuição web u53](https://eaglercraft.com/news/eaglercraftx-u53). Eaglercraft é um projeto independente; Minecraft pertence à Mojang/Microsoft.
