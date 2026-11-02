import os
import re
import urllib.parse
import zipfile
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from spotify_service import spotify_service
from downloader_service import downloader_service, DOWNLOAD_DIR, sanitize_filename

app = FastAPI(title="Spotify Playlist MP3 Downloader API", version="1.0.0")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PlaylistRequest(BaseModel):
    url: str

class TrackDownloadRequest(BaseModel):
    title: str
    artist: str
    album: Optional[str] = ""
    cover_url: Optional[str] = ""
    spotify_id: Optional[str] = ""
    force_redownload: Optional[bool] = False

class BatchZipRequest(BaseModel):
    filenames: List[str]
    playlist_name: Optional[str] = "playlist"

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Spotify Downloader API"}

@app.post("/api/playlist/info")
def get_playlist_info(req: PlaylistRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="Debes proporcionar una URL de playlist de Spotify.")
    
    try:
        data = spotify_service.get_playlist_data(req.url.strip())
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo cargar la playlist: {str(e)}")

@app.post("/api/download/track")
def download_track(req: TrackDownloadRequest):
    if not req.title:
        raise HTTPException(status_code=400, detail="El título de la canción es obligatorio.")
    
    try:
        result = downloader_service.search_and_download(
            title=req.title,
            artist=req.artist,
            album=req.album or "",
            cover_url=req.cover_url or "",
            spotify_id=req.spotify_id or "",
            force_redownload=bool(req.force_redownload)
        )
        display_name = result.get("display_name", result["filename"])
        encoded_display = urllib.parse.quote(display_name)
        return {
            "success": True,
            "filename": result["filename"],
            "display_name": display_name,
            "download_url": f"/api/download/file/{result['filename']}?display_name={encoded_display}",
            "title": req.title,
            "artist": req.artist
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al descargar la pista: {str(e)}")

@app.get("/api/download/file/{filename}")
def get_download_file(filename: str, display_name: Optional[str] = None):
    file_path = DOWNLOAD_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")
    
    media_type = "application/zip" if filename.lower().endswith(".zip") else "audio/mpeg"
    out_filename = display_name if display_name else filename
    if not out_filename.endswith(".mp3") and not out_filename.endswith(".zip"):
        out_filename += ".mp3"

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=out_filename
    )

@app.post("/api/download/zip")
def create_zip(req: BatchZipRequest):
    if not req.filenames:
        raise HTTPException(status_code=400, detail="No se indicaron canciones para comprimir.")
    
    clean_title = sanitize_filename(req.playlist_name or "playlist")
    if not clean_title:
        clean_title = "playlist"
    zip_name = f"{clean_title}.zip"
    zip_path = DOWNLOAD_DIR / zip_name

    added_names = set()
    added_count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for fname in req.filenames:
            fpath = DOWNLOAD_DIR / fname
            if fpath.exists() and fpath.is_file():
                # Clean up arcname inside ZIP: remove the unique [id] suffix
                clean_arcname = re.sub(r'\s*\[[a-zA-Z0-9_-]+\]\.mp3$', '.mp3', fpath.name)
                base = clean_arcname[:-4] if clean_arcname.endswith(".mp3") else clean_arcname
                suffix = ".mp3" if clean_arcname.endswith(".mp3") else ""
                
                final_arcname = clean_arcname
                counter = 1
                while final_arcname in added_names:
                    final_arcname = f"{base} ({counter}){suffix}"
                    counter += 1
                
                added_names.add(final_arcname)
                zip_file.write(fpath, arcname=final_arcname)
                added_count += 1

    if added_count == 0:
        raise HTTPException(status_code=404, detail="No se encontraron los archivos MP3 para empaquetar en el ZIP.")

    return {
        "success": True,
        "filename": zip_name,
        "download_url": f"/api/download/file/{zip_name}",
        "total_files": added_count
    }

# Mount frontend production build if available
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
