@echo off
title Sequenc - Controle de Treinos
cd /d "%~dp0"
set "PATH=%USERPROFILE%\tools\nodejs;%PATH%"
echo.
echo   Iniciando o Sequenc... O navegador vai abrir em instantes.
echo   Para parar o app, feche esta janela (ou Ctrl+C).
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3000"
node server.js
pause
