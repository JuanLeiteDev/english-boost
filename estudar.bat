@echo off
rem Abre a app English Boost no browser. Opcoes: --port 8765 --no-browser
cd /d "%~dp0"
where py >nul 2>nul && (py -3 app\server.py %*) || (python app\server.py %*)
