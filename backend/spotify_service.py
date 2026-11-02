import os
import re
import json
import base64
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

    def get_playlist_data(
        self, 
        url_or_id: str, 
        client_id: Optional[str] = None, 
        client_secret: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetches playlist/album/track metadata.
        If Spotify API credentials are provided (via params or environment),
        it uses the official Spotify Web API to paginate and fetch ALL tracks (> 100).
        Otherwise, it falls back to the public embed scraper (capped at 100 by Spotify).
        """
        parsed = self.parse_spotify_url(url_or_id)
        if not parsed:
            parsed = {"type": "playlist", "id": url_or_id.strip()}

        # Check for credentials in params or environment
        c_id = (client_id or os.getenv("SPOTIFY_CLIENT_ID", "")).strip()
        c_secret = (client_secret or os.getenv("SPOTIFY_CLIENT_SECRET", "")).strip()

        if c_id and c_secret:
            try:
                return self._fetch_via_api(parsed["type"], parsed["id"], c_id, c_secret)
            except Exception as e:
                print(f"Spotify Web API error, falling back to embed: {e}")

        # Default fallback: Embed scraper
        return self._fetch_via_embed(parsed["type"], parsed["id"])

    def _fetch_via_api(self, entity_type: str, entity_id: str, client_id: str, client_secret: str) -> Dict[str, Any]:
        """Fetches full playlist with pagination (> 100 tracks) using official Spotify Web API."""
        # 1. Get access token
        auth_resp = self.session.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            auth=(client_id, client_secret),
            timeout=10
        )
        auth_resp.raise_for_status()
        token = auth_resp.json().get("access_token")
        headers = {
            "Authorization": f"Bearer {token}",
            "User-Agent": self.session.headers["User-Agent"]
        }

        # 2. Fetch entity
        if entity_type == "track":
            res = self.session.get(f"https://api.spotify.com/v1/tracks/{entity_id}", headers=headers, timeout=12)
            res.raise_for_status()
            t = res.json()
            artists = ", ".join([a["name"] for a in t.get("artists", [])])
            d_ms = t.get("duration_ms", 0)
            d_s = int(d_ms / 1000)
            formatted = f"{d_s // 60}:{d_s % 60:02d}"
            cover = t.get("album", {}).get("images", [{}])[0].get("url", "")
            return {
                "id": entity_id,
                "type": "track",
                "title": t.get("name", "Pista"),
                "subtitle": artists,
                "image": cover,
                "total_tracks": 1,
                "loaded_tracks": 1,
                "is_limited": False,
                "tracks": [{
                    "id": entity_id,
                    "title": t.get("name", "Pista"),
                    "artist": artists,
                    "album": t.get("album", {}).get("name", ""),
                    "cover_url": cover,
                    "duration_ms": d_ms,
                    "duration_formatted": formatted,
                    "preview_url": t.get("preview_url")
                }]
            }

        endpoint = "playlists" if entity_type == "playlist" else "albums"
        res = self.session.get(f"https://api.spotify.com/v1/{endpoint}/{entity_id}", headers=headers, timeout=12)
        res.raise_for_status()
        data = res.json()

        cover = data.get("images", [{}])[0].get("url", "") if data.get("images") else ""
        title = data.get("name", "Spotify Playlist")
        owner = data.get("owner", {}).get("display_name", "") if entity_type == "playlist" else ", ".join([a["name"] for a in data.get("artists", [])])
        total_in_spotify = data.get("tracks", {}).get("total", 0)

        # 3. Paginate through all tracks (up to 1000 tracks)
        tracks: List[Dict[str, Any]] = []
        tracks_url = f"https://api.spotify.com/v1/{endpoint}/{entity_id}/tracks?limit=100&offset=0"

        while tracks_url and len(tracks) < 1500:
            tr_res = self.session.get(tracks_url, headers=headers, timeout=15)
            if tr_res.status_code != 200:
                break
            tr_data = tr_res.json()
            items = tr_data.get("items", [])
            for item in items:
                t = item.get("track") if entity_type == "playlist" else item
                if not t:
                    continue
                artists = ", ".join([a["name"] for a in t.get("artists", [])])
                d_ms = t.get("duration_ms", 0)
                d_s = int(d_ms / 1000)
                formatted = f"{d_s // 60}:{d_s % 60:02d}"
                
                track_cover = cover
                album_imgs = t.get("album", {}).get("images", [])
                if album_imgs:
                    track_cover = album_imgs[0].get("url", cover)

                tracks.append({
                    "id": t.get("id") or f"{artists}-{t.get('name')}",
                    "title": t.get("name", "Canción"),
                    "artist": artists or "Artista Desconocido",
                    "album": t.get("album", {}).get("name", title),
                    "cover_url": track_cover,
                    "duration_ms": d_ms,
                    "duration_formatted": formatted,
                    "preview_url": t.get("preview_url")
                })
            tracks_url = tr_data.get("next")

        return {
            "id": entity_id,
            "type": entity_type,
            "title": title,
            "subtitle": owner,
            "image": cover,
            "total_tracks": total_in_spotify or len(tracks),
            "loaded_tracks": len(tracks),
            "is_limited": False,
            "tracks": tracks
        }

    def _fetch_via_embed(self, entity_type: str, entity_id: str) -> Dict[str, Any]:
        """Extracts playlist metadata from Spotify embed. Capped by Spotify at 100 tracks."""
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

        # Extract artists accurately
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
                    cover_url = imgs[-1].get("url", "")

        tracks: List[Dict[str, Any]] = []

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

        # Check if capped at 100
        is_limited = len(tracks) >= 100

        return {
            "id": entity_id,
            "type": entity_type,
            "title": title,
            "subtitle": final_artist or subtitle_str,
            "image": cover_url,
            "total_tracks": len(tracks),
            "loaded_tracks": len(tracks),
            "is_limited": is_limited,
            "tracks": tracks
        }

spotify_service = SpotifyService()
