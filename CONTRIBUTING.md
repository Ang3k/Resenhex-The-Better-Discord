# Como contribuir

Valeu por querer ajudar o Resenhex! Qualquer pessoa pode propor mudanças; o mantenedor revisa cada pull request e decide se entra ou não.

## Passo a passo

1. Faça um fork do repositório e crie uma branch a partir da `main` (`git checkout -b minha-melhoria`).
2. Rode o projeto localmente:
   ```bash
   cd discord-clone
   npm install
   npm start
   ```
   O servidor sobe em `http://localhost:3000`.
3. Faça a mudança e rode os testes com `npm test` dentro de `discord-clone`.
4. Abra um pull request para a `main` explicando o que mudou e por quê. Prints ou vídeos ajudam muito em mudanças visuais.

## O que ajuda o PR a ser aceito

- Uma mudança por PR, pequena e focada.
- Seguir o jeito do código ao redor (JavaScript puro no cliente, sem frameworks novos).
- Textos da interface em português do Brasil.
- Testes passando, e um teste novo quando corrigir um bug ou criar uma função.
- Nada de senhas, chaves, tokens ou dados de usuários nos commits.

Para ideias maiores, abra uma issue antes para conversar, assim ninguém perde tempo com algo que não vai entrar.

## Licença

O Resenhex é distribuído sob a [GNU AGPL-3.0](LICENSE). Ao enviar um pull request, você concorda que sua contribuição seja distribuída sob a mesma licença.
