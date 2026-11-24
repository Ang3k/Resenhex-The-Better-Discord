@echo off
rem Roda (ou retoma) a coleta de personagens do Mudae. Pode fechar e abrir de novo a qualquer hora.
cd /d "%~dp0.."
node tools\mudae-coletar-tudo.js
pause
