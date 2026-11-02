import os
import re
import hashlib
import requests
from pathlib import Path
from typing import Optional, Dict, Any
import yt_dlp
import mutagen
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, ID3NoHeaderError

# Ensure static ffmpeg is configured if installed
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception as e:
    print(f"static_ffmpeg notification: {e}")

DOWNLOAD_DIR = Path(__file__).resolve().parent / "downloads"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

def sanitize_filename(name: str) -> str:
    """Sanitizes filename for Windows/Unix systems."""
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()

class DownloaderService:
    def __init__(self):
        self.download_dir = DOWNLOAD_DIR

    def search_and_download(
        self, 
        title: str, 
        artist: str, 
        album: str = "", 
        cover_url: str = "", 
        spotify_id: str = "",
        force_redownload: bool = False
    ) -> Dict[str, Any]:
        """
        Searches YouTube Music/YouTube for the song and downloads it as an MP3.
        Uses a unique identifier (spotify_id or hash) to completely prevent
        file collisions and cross-song caching bugs.
        """
        clean_title = sanitize_filename(title)
        clean_artist = sanitize_filename(artist)
        
        base_name = f"{clean_artist} - {clean_title}" if clean_artist else clean_title
        if not base_name:
            base_name = "song"

        # Unique identifier to avoid collision when two songs have the same title or same artist
        unique_id = sanitize_filename(spotify_id) if spotify_id else ""
        if not unique_id:
            unique_id = hashlib.md5(f"{artist}_{title}_{album}".encode("utf-8")).hexdigest()[:10]

        unique_filename = f"{base_name} [{unique_id}].mp3"
        display_name = f"{base_name}.mp3"
        expected_file = self.download_dir / unique_filename

        # Return cached file only if it exists and has valid size and not forced
        if not force_redownload and expected_file.exists() and expected_file.stat().st_size > 100_000:
            return {
                "status": "ready",
                "filename": expected_file.name,
                "display_name": display_name,
                "file_path": str(expected_file),
                "title": title,
                "artist": artist
            }

        # Build accurate search query
        search_terms = []
        if artist and artist not in ["Artista Desconocido", "Unknown Artist"]:
            search_terms.append(artist)
        search_terms.append(title)
        
        # Include album if specific
        if album and album.lower() != title.lower() and not any(k in album.lower() for k in ["playlist", "top", "hits", "spotify"]):
            search_terms.append(album)
        search_terms.append("audio")
        
        search_query = f"ytsearch1:{' '.join(search_terms)}"

        out_template = str(self.download_dir / f"{base_name} [{unique_id}].%(ext)s")

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': out_template,
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            }],
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([search_query])
        except Exception as e:
            print(f"Error during yt-dlp download: {e}")
            raise RuntimeError(f"Download failed: {str(e)}")

        final_mp3 = self.download_dir / unique_filename
        if not final_mp3.exists():
            # Check if downloaded as another audio format (e.g. .m4a or .webm)
            for f in self.download_dir.glob(f"{base_name} [{unique_id}].*"):
                if f.is_file():
                    final_mp3 = f
                    break

        if not final_mp3.exists():
            raise FileNotFoundError(f"File {unique_filename} was not created.")

        # Embed ID3 tags and album cover art
        if final_mp3.suffix.lower() == ".mp3":
            self._embed_metadata(final_mp3, title, artist, album, cover_url)

        return {
            "status": "ready",
            "filename": final_mp3.name,
            "display_name": display_name,
            "file_path": str(final_mp3),
            "title": title,
            "artist": artist
        }

    def _embed_metadata(self, file_path: Path, title: str, artist: str, album: str, cover_url: str):
        """Injects ID3 metadata tags (Title, Artist, Album, Cover Art) into MP3."""
        try:
            try:
                audio = ID3(str(file_path))
            except ID3NoHeaderError:
                audio = ID3()

            if title:
                audio.add(TIT2(encoding=3, text=title))
            if artist:
                audio.add(TPE1(encoding=3, text=artist))
            if album:
                audio.add(TALB(encoding=3, text=album))

            # Fetch and inject cover image
            if cover_url:
                try:
                    resp = requests.get(cover_url, timeout=10)
                    if resp.status_code == 200:
                        mime = "image/jpeg" if cover_url.lower().endswith(".jpg") or "jpeg" in resp.headers.get("Content-Type", "") else "image/png"
                        audio.add(APIC(
                            encoding=3,
                            mime=mime,
                            type=3,  # Front cover
                            desc="Cover",
                            data=resp.content
                        ))
                except Exception as img_err:
                    print(f"Could not inject cover art: {img_err}")

            audio.save(str(file_path))
        except Exception as e:
            print(f"Warning: Failed to set ID3 tags on {file_path}: {e}")

downloader_service = DownloaderService()
