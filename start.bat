@echo off
title Spotify Playlist MP3 Downloader
echo ========================================================
echo    Spotify Playlist to MP3 Downloader (React + Python)
echo ========================================================
echo.

:: 1. Verificar si existe el entorno virtual de Python
if not exist "backend\venv\Scripts\python.exe" (
    echo [INFO] No se encontro el entorno virtual de Python. Creando backend\venv...
    python -m venv backend\venv
    if errorlevel 1 (
        echo [ERROR] No se encontro Python en el sistema.
        echo Por favor instala Python 3.10 o superior desde https://www.python.org/
        pause
        exit /b 1
    )
    echo [INFO] Instalando dependencias de Python...
    backend\venv\Scripts\pip.exe install -r backend\requirements.txt
    echo [INFO] Inicializando binarios de FFmpeg...
    backend\venv\Scripts\python.exe -c "import static_ffmpeg; static_ffmpeg.add_paths()"
    echo.
)

:: 2. Verificar y compilar el frontend si no existe la carpeta dist
if not exist "frontend\dist\index.html" (
    echo [INFO] No se encontro el build de produccion de React (frontend\dist).
    echo [INFO] Verificando instalacion de Node.js y npm...
    where npm >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] No se encontro Node.js/npm en el sistema.
        echo Por favor instala Node.js (v18 o superior) desde https://nodejs.org/
        pause
        exit /b 1
    )
    echo [INFO] Instalando dependencias de frontend y compilando...
    cd frontend
    call npm install
    call npm run build
    cd ..
    echo [INFO] Compilacion completada con exito.
    echo.
)

echo Iniciando aplicacion en http://localhost:8000 ...
timeout /t 2 /nobreak >nul
start http://localhost:8000

cd backend
venv\Scripts\python.exe main.py
pause
