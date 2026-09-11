@echo off
cd /d "%~dp0"
echo.
echo ==========================================
echo       VIDEO MULTIPLIER AI
 echo ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale o Node.js 20 ou superior e execute este arquivo novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias na primeira execucao...
  call npm install
  if errorlevel 1 (
    echo.
    echo Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)
echo.
echo Abrindo em http://localhost:3000
echo Nao feche esta janela enquanto estiver usando o site.
start "" http://localhost:3000
call npm start
pause
