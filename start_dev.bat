@echo off
title Spotify Downloader - Dev Mode
echo Iniciando Backend (FastAPI) y Frontend (Vite) en modo desarrollo...
set PATH=C:\Users\pc\AppData\Roaming\nvm\v20.19.0;%PATH%
start "Backend FastAPI (Puerto 8000)" cmd /k "cd backend && venv\Scripts\python.exe main.py"
start "Frontend Vite (Puerto 5173)" cmd /k "cd frontend && npm run dev"
timeout /t 3 /nobreak >nul
start http://localhost:5173

