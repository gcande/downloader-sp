import re
import json
import requests
from typing import Dict, Any, List, Optional

class SpotifyService:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        })

    def parse_spotify_url(self, url: str) -> Optional[Dict[str, str]]:
        """
        Parses Spotify playlist, album, or track URLs.
        Returns a dict with 'type' and 'id'.
        """
        clean_url = url.strip()
        match = re.search(r"(playlist|album|track)[/:]([a-zA-Z0-9]{22})", clean_url)
        if match:
            return {"type": match.group(1), "id": match.group(2)}
        return None

    def get_playlist_data(self, url_or_id: str) -> Dict[str, Any]:
        """
        Extracts playlist/album/track metadata directly from Spotify's embed endpoint.
        No developer API credentials required.
        """
        parsed = self.parse_spotify_url(url_or_id)
        if not parsed:
            # Assume it's a playlist ID if raw ID was passed
            parsed = {"type": "playlist", "id": url_or_id.strip()}

        entity_type = parsed["type"]
        entity_id = parsed["id"]
        embed_url = f"https://open.spotify.com/embed/{entity_type}/{entity_id}"

        response = self.session.get(embed_url, timeout=12)
        if response.status_code != 200:
            raise RuntimeError(f"Error {response.status_code} al consultar Spotify. Comprueba que el enlace sea público.")

        match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', response.text)
        if not match:
            raise RuntimeError("No se pudo extraer la información de Spotify. La página no devolvió los metadatos esperados.")

        try:
            data = json.loads(match.group(1))
        except Exception as e:
            raise RuntimeError(f"Error al parsear datos de Spotify: {e}")

        page_props = data.get("props", {}).get("pageProps", {})
        entity = page_props.get("state", {}).get("data", {}).get("entity", {})
        if not entity:
            entity = page_props.get("entity", {})

        title = entity.get("title") or entity.get("name") or "Spotify Playlist"
        
        # Extract artists accurately across playlists, albums, and tracks
        track_artist = ""
        entity_artists = entity.get("artists")
        if entity_artists and isinstance(entity_artists, list):
            artist_names = [a.get("name", "") if isinstance(a, dict) else str(a) for a in entity_artists]
            track_artist = ", ".join(filter(None, artist_names))

        subtitle = entity.get("subtitle") or entity.get("authors") or ""
        if isinstance(subtitle, list):
            subtitle_str = ", ".join([a.get("name", "") if isinstance(a, dict) else str(a) for a in subtitle])
        else:
            subtitle_str = str(subtitle) if subtitle else ""

        final_artist = track_artist or subtitle_str or ""

        # Extract Cover Art
        cover_url = ""
        cover_art = entity.get("coverArt", {})
        if cover_art and isinstance(cover_art, dict):
            sources = cover_art.get("sources", [])
            if sources:
                cover_url = sources[0].get("url", "")
        if not cover_url:
            visual_id = entity.get("visualIdentity", {})
            if visual_id and isinstance(visual_id, dict):
                imgs = visual_id.get("image", [])
                if imgs:
                    # Pick largest image
                    cover_url = imgs[-1].get("url", "")

        tracks: List[Dict[str, Any]] = []

        # If it's a single track
        if entity_type == "track":
            duration_ms = entity.get("duration", 0)
            duration_s = int(duration_ms / 1000)
            formatted = f"{duration_s // 60}:{duration_s % 60:02d}"
            preview_info = entity.get("audioPreview", {})
            preview_url = preview_info.get("url") if isinstance(preview_info, dict) else None

            tracks.append({
                "id": entity.get("id") or entity_id,
                "title": title,
                "artist": final_artist or "Artista Desconocido",
                "album": "",
                "cover_url": cover_url,
                "duration_ms": duration_ms,
                "duration_formatted": formatted,
                "preview_url": preview_url
            })
        else:
            raw_tracklist = entity.get("trackList", [])
            for item in raw_tracklist:
                t_title = item.get("title", "Canción Desconocida")
                t_artist = item.get("subtitle") or item.get("artists") or subtitle_str or "Artista Desconocido"
                if isinstance(t_artist, list):
                    t_artist = ", ".join([a.get("name", "") if isinstance(a, dict) else str(a) for a in t_artist])
                d_ms = item.get("duration", 0)
                d_s = int(d_ms / 1000)
                d_formatted = f"{d_s // 60}:{d_s % 60:02d}"
                
                audio_preview = item.get("audioPreview", {})
                p_url = audio_preview.get("url") if isinstance(audio_preview, dict) else None
                uri = item.get("uri", "")
                t_id = uri.split(":")[-1] if ":" in uri else item.get("uid", f"{t_artist}-{t_title}")

                tracks.append({
                    "id": t_id,
                    "title": t_title,
                    "artist": t_artist,
                    "album": title if entity_type == "album" else "",
                    "cover_url": cover_url,
                    "duration_ms": d_ms,
                    "duration_formatted": d_formatted,
                    "preview_url": p_url
                })

        return {
            "id": entity_id,
            "type": entity_type,
            "title": title,
            "subtitle": final_artist or subtitle_str,
            "image": cover_url,
            "total_tracks": len(tracks),
            "tracks": tracks
        }

spotify_service = SpotifyService()
