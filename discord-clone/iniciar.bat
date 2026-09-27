@echo off
chcp 65001 >nul
title Resenhex
cd /d "%~dp0"

echo ============================================
echo   Resenhex - servidor Resenha
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha no npm install.
    pause
    exit /b 1
  )
)

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo Instalando cloudflared...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;C:\Program Files (x86)\cloudflared;C:\Program Files\cloudflared"
)

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Nao consegui instalar o cloudflared.
  echo Feche esta janela e rode o arquivo de novo. Se continuar, baixe em:
  echo https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)

echo.
set /p ACCESS_PASSWORD=Escolha a senha do servidor (seus amigos usam para criar conta): 
if "%ACCESS_PASSWORD%"=="" (
  echo [ERRO] A senha nao pode ser vazia.
  pause
  exit /b 1
)

echo.
echo Iniciando o servidor em outra janela...
start "Resenhex - servidor (NAO FECHE)" cmd /k npm start
timeout /t 3 >nul

echo.
echo ============================================
echo  Procure abaixo um link terminado em
echo  .trycloudflare.com e mande para os amigos
echo  junto com a senha do servidor: %ACCESS_PASSWORD%
echo.
echo  Crie SUA conta primeiro: a primeira conta vira dona do servidor.
echo.
echo  Voce mesmo pode entrar por http://localhost:3000
echo  NAO feche esta janela nem a do servidor.
echo ============================================
echo.
cloudflared tunnel --url http://localhost:3000
pause
