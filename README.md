<div align="center">

<img src="discord-clone/desktop/store/logo-1080.png" alt="Logo do Resenhex" width="96">

# Resenhex

Plataforma própria de chat, voz, vídeo e compartilhamento de tela em tempo real, inspirada no Discord.<br>
Roda no navegador, como app para Windows (publicado na Microsoft Store) e como app para Android, baixado do próprio site.

[![Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-Baixar-0078D4?style=for-the-badge&logo=microsoft&logoColor=white)](https://apps.microsoft.com/detail/9NG3QRZSB1LX)
![Versão](https://img.shields.io/badge/versão-1.1.0-7C3AED?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)

</div>

<p align="center">
  <img src="discord-clone/desktop/store/capturas/1-conversa.png" alt="Canal de texto do Resenhex com lista de canais, mensagens, reações e membros online" width="860">
</p>

## Sobre o projeto

O Resenhex é um produto completo, usado no dia a dia por um grupo de amigos: servidor próprio na nuvem, cliente web, app desktop com atualização automática e publicação na Microsoft Store. Foi construído do zero, do protocolo de tempo real à interface.

## Destaques técnicos

- **Tempo real:** mensagens, presença, digitação e estado das chamadas sincronizados via Socket.IO, com reconexão automática que recupera as mensagens perdidas e devolve o usuário à chamada.
- **Voz, câmera e tela:** chamadas WebRTC com conexão direta entre os participantes ou por servidor de mídia (LiveKit SFU), perfis de qualidade até 1080p 60 fps, áudio do sistema e supressão de ruído por IA rodando no próprio cliente.
- **App desktop:** casca em Electron com push-to-talk global (funciona dentro de jogos), bandeja do sistema, notificações e atualização automática. Versão empacotada em `.appx` para a Microsoft Store.
- **Comunidades:** vários servidores por conta, convites, cargos e permissões com hierarquia, canais privados e ferramentas de moderação.
- **Recursos sociais:** amigos e mensagens diretas, menções, reações, respostas, envio de arquivos, soundboard, música do YouTube sincronizada para toda a sala e um minijogo em 3D com Three.js.
- **Operação:** deploy automatizado por script em servidor ARM na Oracle Cloud, com proxy reverso, TURN para atravessar redes restritivas e testes automatizados com `node:test`.

<p align="center">
  <img src="discord-clone/desktop/store/capturas/2-chamada.png" alt="Chamada de voz com quatro participantes e controles de câmera, tela e música" width="860">
</p>

## Tecnologias

| Camada | Tecnologias |
|---|---|
| Servidor | Node.js, Express, Socket.IO |
| Mídia | WebRTC, LiveKit (SFU), coturn |
| Cliente | JavaScript, HTML e CSS sem framework, Three.js |
| Desktop | Electron, electron-builder, electron-updater |
| Infraestrutura | Oracle Cloud (ARM), Caddy, systemd |

## Estrutura

```
discord-clone/
├── server.js          # servidor HTTP e de tempo real
├── *.js               # módulos de domínio: canais, comunidades, DJ, soundboard, chamadas...
├── public/            # cliente web
├── desktop/           # app para Windows (Electron) e pacote da Microsoft Store
├── deploy/            # scripts de instalação, deploy e servidor de mídia
└── test/              # testes automatizados
```

## Como rodar

```bash
cd discord-clone
npm install
npm start
```

O servidor sobe em `http://localhost:3000`. O passo a passo completo, incluindo o app desktop e o deploy, está no [README do app](discord-clone/README.md). O histórico de versões fica no [CHANGELOG](discord-clone/CHANGELOG.md).
