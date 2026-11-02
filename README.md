# 🎵 Spotify Playlist to MP3 Downloader (React + Python)

Una aplicación web completa, rápida y moderna para descargar playlists, álbumes y canciones públicas de Spotify en formato **MP3 a 320 kbps**, con carátulas originales de alta resolución y etiquetas ID3 oficiales.

---

## 📋 Requisitos Previos Obligatorios (¿Qué debes instalar antes?)

Para clonar y correr este proyecto desde cero en tu computadora necesitas tener instalados estos dos entornos:

### 1. **Python (Versión 3.10 o superior)**
- Descárgalo gratis desde [python.org](https://www.python.org/downloads/).
- ⚠️ **PASO CRÍTICO:** En la primera pantalla del instalador de Python, asegúrate de marcar la casilla:  
  **`☑ Add python.exe to PATH`** (o *"Agregar Python al PATH"*).  
  *Si no la marcas, la consola de Windows no reconocerá el comando `python`.*

### 2. **Node.js (Versión 18 LTS o 20+ recomendada)**
- Descárgalo gratis desde [nodejs.org](https://nodejs.org/).
- Es **obligatorio** para instalar las dependencias del frontend (`npm install`) y compilar la interfaz de React con Vite.
- Durante la instalación, presiona "Siguiente" con las opciones predeterminadas (incluye `npm`).

### 3. **Conexión a Internet**
- Para consultar la metadata de Spotify y resolver las pistas de audio en alta fidelidad.

> ℹ️ **Nota sobre FFmpeg:** **No** tienes que instalar ni configurar FFmpeg manualmente. La librería `static-ffmpeg` de Python descarga y configura los binarios oficiales para Windows de forma automática en la primera ejecución.

---

## 🚀 Cómo Ejecutar la Aplicación

### Método 1: Inicio Rápido con 1 Clic (Recomendado)
Haz doble clic en:
```bash
start.bat
```
**¿Qué hace este script automáticamente?**
1. Revisa si existe el entorno virtual de Python (`backend/venv`). Si falta, lo crea e instala automáticamente las dependencias de `requirements.txt`.
2. Verifica si la carpeta `frontend/dist` está compilada. Si es un clon nuevo de Git sin el build, ejecuta automáticamente `npm install` y `npm run build`.
3. Descarga y enlaza FFmpeg de forma transparente.
4. Levanta el servidor FastAPI en el puerto `8000` y abre automáticamente tu navegador en **`http://localhost:8000`**.

---

### Método 2: Instalación y Ejecución Manual (Paso a Paso)

Si prefieres realizar el proceso manualmente por consola (PowerShell o CMD):

```bash
# 1. Clona o entra a la carpeta del proyecto
cd downloader

# 2. Configura el Backend (Python)
python -m venv backend/venv

# Activa el entorno virtual:
# En Windows (PowerShell):
backend\venv\Scripts\Activate.ps1
# O en Windows (CMD):
backend\venv\Scripts\activate.bat

# Instala dependencias de Python:
pip install -r backend/requirements.txt

# Inicializa FFmpeg (solo la primera vez):
python -c "import static_ffmpeg; static_ffmpeg.add_paths()"

# 3. Configura y compila el Frontend (React + Node.js)
cd frontend
npm install
npm run build
cd ..

# 4. Inicia el servidor web
python backend/main.py
```
Abre tu navegador en: **`http://localhost:8000`**

---

### Método 3: Modo Desarrollo con Hot-Reload (React + FastAPI)

Si deseas modificar componentes de React, estilos CSS o la lógica del frontend y ver los cambios en vivo sin recompilar:

1. Ejecuta el archivo:
   ```bash
   start_dev.bat
   ```
   *O bien en dos consolas separadas:*
   - Terminal 1 (Backend): `cd backend && venv\Scripts\python.exe main.py` (corre en el puerto `8000`).
   - Terminal 2 (Frontend): `cd frontend && npm install && npm run dev` (corre en el puerto `5173`).
2. Abre tu navegador en **`http://localhost:5173`**.
3. Cuando estés satisfecho con tus cambios, vuelve a generar el build con:
   ```bash
   cd frontend && npm run build
   ```

---

## 💡 Consideraciones Importantes

- **Playlists Públicas:**  
  La aplicación funciona exclusivamente con enlaces públicos de Spotify (Playlists, Álbumes o Canciones). Las playlists privadas no pueden ser consultadas externamente.
  - Ejemplos válidos:
    - `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M`
    - `https://open.spotify.com/album/4m2880jivSbbyEGAKfITCa`
    - `https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT`

- **Descargas en Lote y Formato ZIP:**  
  Puedes seleccionar un grupo de canciones específicas mediante sus casillas de verificación o usar los botones de acceso rápido (*Todas*, *Primeras 10*, *Primeras 25*) y descargarlas comprimidas en un solo archivo `.zip`.  
  *¿Por qué ZIP y no RAR?* ZIP es un estándar universal de código abierto compatible nativamente con Windows, macOS, Linux, iOS y Android sin requerir licencias ni programas de pago como WinRAR.

- **Pausa y Reanudar:**  
  Durante descargas largas de listas completas, puedes hacer clic en **Pausar** en la barra flotante inferior en cualquier momento. El proceso esperará a finalizar la pista actual y podrás reanudarlo cuando desees sin perder el avance ni duplicar pistas.

- **Prevención de Colisiones de Nombres:**  
  El backend identifica internamente cada canción por su ID único de Spotify. Dos pistas con el mismo nombre (ej. versiones remasterizadas, en vivo o de distintos artistas) se descargan de forma independiente sin sobreescribirse ni quedar en cola.

- **Espacio en Disco:**  
  Cada canción en MP3 a 320 kbps pesa entre 8 MB y 15 MB. Asegúrate de tener espacio disponible si descargas listas de más de 100 canciones.

---

## 🛠️ Solución de Problemas Comunes

| Problema | Causa probable | Solución |
| :--- | :--- | :--- |
| **`'python' no se reconoce como un comando interno o externo`** | Python no se marcó en el PATH al instalarse. | Reinstala Python asegurándote de marcar la casilla *"Add python.exe to PATH"*, o agrégalo en las Variables de Entorno del sistema. |
| **`'npm' o 'node' no se reconoce como un comando interno o externo`** | Node.js no está instalado o no se reinició la consola tras instalarlo. | Descarga e instala Node.js LTS desde [nodejs.org](https://nodejs.org/) y reinicia la consola/terminal. |
| **`No se pudo cargar la playlist / Error 500`** | El enlace es incorrecto o la playlist es privada. | Verifica que el enlace provenga de Spotify web y que sea accesible en modo incógnito sin iniciar sesión. |
| **`Fallo en la descarga de alguna canción específica`** | Restricción temporal de YouTube o audio bloqueado en tu región. | Haz clic en el botón rojo **Reintentar** al lado de la canción afectada; la aplicación buscará una fuente de audio alternativa. |
| **`Permiso denegado al ejecutar scripts (.ps1) en PowerShell`** | Política de ejecución de Windows. | Ejecuta PowerShell como administrador y escribe: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, o simplemente haz doble clic en `start.bat`. |

---

## 📂 Estructura del Repositorio

```
downloader/
├── .gitignore                # Reglas para ignorar venv, node_modules, dist y descargas
├── backend/
│   ├── downloads/            # Almacén temporal donde se generan los MP3 y ZIPs (.gitkeep)
│   ├── venv/                 # Entorno virtual de Python (ignorado en Git)
│   ├── main.py               # API REST con FastAPI (sirve la API y el frontend)
│   ├── spotify_service.py    # Extractor de metadatos de Spotify (sin necesidad de API keys)
│   ├── downloader_service.py # Motor yt-dlp + FFmpeg + inyección de tags ID3
│   └── requirements.txt      # Dependencias de Python necesarias
├── frontend/
│   ├── dist/                 # Build compilado de producción (ignorado en Git)
│   ├── node_modules/         # Paquetes de Node.js (ignorado en Git)
│   ├── src/
│   │   ├── App.jsx           # Interfaz React (Dark mode, Previews, Pausa, ZIP)
│   │   ├── index.css         # Estilos y animaciones
│   │   └── main.jsx          # Entrada de React
│   ├── package.json          # Dependencias y scripts de Node.js
│   └── vite.config.js        # Configuración del bundler Vite
├── start.bat                 # Ejecutable 1-clic autogestionado para producción
├── start_dev.bat             # Ejecutable para desarrolladores (React + Python)
└── README.md                 # Esta documentación
```
