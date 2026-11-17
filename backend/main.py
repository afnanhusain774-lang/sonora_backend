#!/usr/bin/env python3
"""Backend API for Sonora - Handles authentication and user data."""

import os
import logging
import asyncio
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials, initialize_app, firestore as firebase_firestore
from firebase_admin.firestore import SERVER_TIMESTAMP
from ytmusicapi import YTMusic
from yt_dlp import YoutubeDL
from dotenv import load_dotenv
import httpx
import imageio_ffmpeg

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------- Firebase Admin ----------
FIREBASE_CRED_PATH = os.getenv("FIREBASE_CRED_PATH")
if FIREBASE_CRED_PATH and os.path.exists(FIREBASE_CRED_PATH):
    firebase_cred = credentials.cert(FIREBASE_CRED_PATH)
    firebase_app = initialize_app(firebase_cred)
    logger.info("Firebase Admin initialized with service account credentials.")
else:
    # Fallback to default credentials (application default)
    try:
        firebase_app = initialize_app()
        logger.info("Firebase Admin initialized with default credentials.")
    except Exception as e:
        logger.warning(f"Could not initialize Firebase Admin: {e}")
        firebase_app = None

db = None
if firebase_app:
    try:
        db = firebase_firestore.client()
        logger.info("Firestore client initialized.")
    except Exception as e:
        logger.error(f"Firestore client init failed: {e}")

ytmusic = YTMusic()
AUDIO_CACHE_DIR = Path(os.getenv("SONORA_AUDIO_CACHE_DIR", "/tmp/sonora-audio"))
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ---------- Security ----------
FIREBASE_WEB_API_KEY = os.getenv("FIREBASE_WEB_API_KEY")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")

# ---------- Models ----------
class UserCreate(BaseModel):
    email: str = Field(..., min_length=1, max_length=254)
    password: str = Field(..., min_length=6)
    display_name: Optional[str] = Field(None, max_length=50)

    @validator("email")
    def validate_email(cls, v):
        if "@" not in v:
            raise ValueError("Invalid email format")
        return v.lower().strip()


class UserLogin(BaseModel):
    email: str = Field(..., min_length=1, max_length=254)
    password: str = Field(..., min_length=6)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserProfile(BaseModel):
    uid: str
    email: str
    display_name: Optional[str] = None
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


def youtube_track(result: dict) -> dict:
    thumbnails = result.get("thumbnails") or []
    return {
        "id": result.get("videoId"),
        "title": result.get("title") or "Unknown title",
        "artist": ", ".join(artist.get("name", "") for artist in result.get("artists") or []),
        "album": (result.get("album") or {}).get("name") or "YouTube Music",
        "duration": result.get("duration") or "0:00",
        "durationSeconds": result.get("duration_seconds") or 0,
        "thumbnail": thumbnails[-1].get("url", "") if thumbnails else "",
        "source": "youtube_music",
    }


# ---------- FastAPI App ----------
app = FastAPI(
    title="Sonora Backend API",
    version="0.1.0",
    description="Backend API for the Sonora music app with Firebase authentication",
)

# CORS - allow all origins so mobile clients and web browsers can connect freely
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    """Root welcome endpoint to verify the service is up."""
    return {"status": "online", "service": "Sonora Backend API"}


@app.get("/api/search")
def search_music(query: str = Query(..., alias="q"), limit: int = 20) -> list[dict]:
    """Search the public YouTube Music catalog using ytmusicapi."""
    query = query.strip()
    if not query:
        return []
    results = ytmusic.search(query, filter="songs", limit=max(1, min(limit, 50)))
    return [youtube_track(result) for result in results if result.get("videoId")]


@app.get("/api/stream/{video_id}")
def stream_music(video_id: str) -> dict:
    """Return metadata for the backend-proxied audio stream."""
    options = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "skip_download": True,
    }
    with YoutubeDL(options) as downloader:
        info = downloader.extract_info(f"https://music.youtube.com/watch?v={video_id}", download=False)
    return {
        "url": f"/api/audio/{video_id}",
        "title": info.get("title") or "Unknown title",
        "duration": info.get("duration") or 0,
        "mimeType": info.get("mime_type") or "",
    }


@app.get("/api/audio/{video_id}")
async def proxy_audio(video_id: str):
    """Transcode and serve a seekable browser-safe MP3 response."""
    cached_audio = AUDIO_CACHE_DIR / f"{video_id}.mp3"
    if cached_audio.is_file() and cached_audio.stat().st_size > 0:
        return FileResponse(
            cached_audio,
            media_type="audio/mpeg",
            filename=f"{video_id}.mp3",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    options = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "skip_download": True,
    }
    with YoutubeDL(options) as downloader:
        info = downloader.extract_info(
            f"https://music.youtube.com/watch?v={video_id}",
            download=False,
        )

    upstream_url = info.get("url")
    if not upstream_url:
        raise HTTPException(status_code=502, detail="No playable audio source was returned.")

    temporary_audio = cached_audio.with_suffix(".part")
    process = await asyncio.create_subprocess_exec(
        imageio_ffmpeg.get_ffmpeg_exe(),
        "-hide_banner",
        "-loglevel",
        "error",
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-i",
        upstream_url,
        "-vn",
        "-f",
        "mp3",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "128k",
        "-y",
        str(temporary_audio),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode:
        temporary_audio.unlink(missing_ok=True)
        error = stderr.decode(errors="replace").strip()
        logger.error("Audio transcoding failed for %s: %s", video_id, error)
        raise HTTPException(status_code=502, detail="Audio transcoding failed.")

    temporary_audio.replace(cached_audio)
    return FileResponse(
        cached_audio,
        media_type="audio/mpeg",
        filename=f"{video_id}.mp3",
        headers={"Cache-Control": "public, max-age=3600"},
    )

# ---------- Auth Dependencies ----------
async def get_current_user(token: str = Depends(oauth2_scheme)) -> UserProfile:
    """Verify a Firebase ID token and return the associated profile."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        decoded = firebase_auth.verify_id_token(token)
        user_id = decoded["uid"]
    except (ValueError, KeyError, firebase_admin.exceptions.FirebaseError) as error:
        logger.warning("Firebase ID token verification failed: %s", error)
        raise credentials_exception

    # Fetch user from Firestore
    if db:
        try:
            doc = db.collection("users").document(user_id).get()
            if doc.exists:
                data = doc.to_dict()
                return UserProfile(
                    uid=user_id,
                    email=data.get("email", ""),
                    display_name=data.get("display_name"),
                    created_at=data.get("created_at"),
                    last_login=data.get("last_login"),
                )
        except Exception as e:
            logger.warning(f"Could not fetch user from Firestore: {e}")

    # Fallback: create minimal profile
    return UserProfile(
        uid=user_id,
        email=decoded.get("email", ""),
        display_name=decoded.get("name"),
    )


# ---------- API Routes ----------
@app.post("/api/token", response_model=Token)
async def login_for_access_token(form_data: UserLogin) -> Token:
    """Login with email/password and get JWT token."""
    if not FIREBASE_WEB_API_KEY:
        raise HTTPException(status_code=503, detail="Firebase web API key is not configured.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
                params={"key": FIREBASE_WEB_API_KEY},
                json={
                    "email": form_data.email,
                    "password": form_data.password,
                    "returnSecureToken": True,
                },
            )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        logger.warning("Firebase password sign-in failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=payload["idToken"])


@app.post("/api/signup", response_model=Token)
async def signup(user: UserCreate) -> Token:
    """Create a new user account."""
    if not FIREBASE_WEB_API_KEY:
        raise HTTPException(status_code=503, detail="Firebase web API key is not configured.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://identitytoolkit.googleapis.com/v1/accounts:signUp",
                params={"key": FIREBASE_WEB_API_KEY},
                json={
                    "email": user.email,
                    "password": user.password,
                    "returnSecureToken": True,
                },
            )
        response.raise_for_status()
        payload = response.json()
        firebase_user = firebase_auth.get_user(payload["localId"])
        # Update profile with display name if provided
        if user.display_name:
            firebase_auth.update_user(firebase_user.uid, display_name=user.display_name)
    except (httpx.HTTPError, ValueError, KeyError, firebase_admin.exceptions.FirebaseError) as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not create user: {error}",
        )

    # Save user profile to Firestore
    if db:
        try:
            db.collection("users").document(firebase_user.uid).set({
                "email": firebase_user.email,
                "display_name": user.display_name,
                "created_at": SERVER_TIMESTAMP,
                "last_login": None,
            })
        except Exception as e:
            logger.warning(f"Could not save user profile: {e}")

    return Token(access_token=payload["idToken"])


@app.get("/api/me", response_model=UserProfile)
async def get_me(current_user: UserProfile = Depends(get_current_user)) -> UserProfile:
    """Get current user profile."""
    return current_user


@app.post("/api/signout")
async def sign_out(current_user: UserProfile = Depends(get_current_user)) -> dict:
    """Sign out the current user."""
    try:
        firebase_auth.revoke_refresh_tokens(current_user.uid)
    except firebase_admin.exceptions.FirebaseError as error:
        logger.warning("Could not revoke Firebase refresh tokens: %s", error)
    return {"message": "Signed out successfully"}


# Health check
@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}
