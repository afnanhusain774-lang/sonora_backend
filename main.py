import os
import logging
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from ytmusicapi import YTMusic
from yt_dlp import YoutubeDL
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ytmusic = YTMusic()

app = FastAPI(
    title="Sonora Backend API",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/search")
def search_music(query: str = Query(..., alias="q"), limit: int = 20) -> list[dict]:
    """Search public YouTube Music catalog."""
    query = query.strip()
    if not query:
        return []
    try:
        results = ytmusic.search(query, filter="songs", limit=max(1, min(limit, 50)))
        tracks = []
        for result in results:
            video_id = result.get("videoId")
            if not video_id:
                continue
            thumbnails = result.get("thumbnails") or []
            tracks.append({
                "id": video_id,
                "title": result.get("title") or "Unknown title",
                "artist": ", ".join(artist.get("name", "") for artist in result.get("artists") or []),
                "album": (result.get("album") or {}).get("name") or "YouTube Music",
                "duration": result.get("duration") or "0:00",
                "thumbnail": thumbnails[-1].get("url", "") if thumbnails else "",
                "url": f"https://sonora-mocx.onrender.com/api/audio/{video_id}"
            })
        return tracks
    except Exception as e:
        logger.error(f"Search error: {e}")
        return []

@app.get("/api/audio/{video_id}")
def proxy_audio(video_id: str):
    """Extract direct playable stream URL using yt-dlp with Android client spoofing."""
    try:
        ydl_opts = {
            "format": "bestaudio/best",
            "noplaylist": True,
            "quiet": True,
            "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
        }
        with YoutubeDL(ydl_opts) as downloader:
            info = downloader.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            audio_url = info.get("url")
            if not audio_url:
                for f in info.get("formats", []):
                    if f.get("acodec") != "none" and f.get("vcodec") == "none":
                        audio_url = f.get("url")
                        break
            if audio_url:
                return RedirectResponse(url=audio_url)
        raise HTTPException(status_code=404, detail="Audio stream not found")
    except Exception as e:
        logger.error(f"Stream extraction failed for {video_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))

@app.get("/api/health")
async def health():
    return {"status": "ok"}
