import { SPOTIFY_SCOPES } from "../data.js";
import { normalizeSpotifyTrack } from "../utils.js";

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
const SDK_URL = "https://sdk.scdn.co/spotify-player.js";

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export class SpotifyClient {
  constructor(clientId = "", onPlayback = () => {}) {
    this.clientId = clientId.trim();
    this.accessToken = sessionStorage.getItem("sonora-spotify-access");
    this.refreshToken = localStorage.getItem("sonora-spotify-refresh");
    this.expiresAt = Number(sessionStorage.getItem("sonora-spotify-expires") || 0);
    this.player = null;
    this.deviceId = "";
    this.onPlayback = onPlayback;
    this.onDevice = () => {};
    this.playerReady = false;
  }

  setClientId(clientId) {
    this.clientId = clientId.trim();
  }

  get connected() {
    return Boolean(this.accessToken && this.clientId);
  }

  async login() {
    if (!this.clientId) throw new Error("Add your Spotify client ID in Settings first.");
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
    const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
    sessionStorage.setItem("sonora-spotify-verifier", verifier);
    sessionStorage.setItem("sonora-spotify-state", state);
    const query = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: location.origin + location.pathname,
      code_challenge_method: "S256",
      code_challenge: await pkceChallenge(verifier),
      state
    });
    location.assign(`${AUTH_URL}?${query}`);
  }

  async handleCallback() {
    const url = new URL(location.href);
    const code = url.searchParams.get("code");
    if (!code) return;
    const returnedState = url.searchParams.get("state");
    const storedState = sessionStorage.getItem("sonora-spotify-state");
    const verifier = sessionStorage.getItem("sonora-spotify-verifier");
    history.replaceState({}, "", url.origin + url.pathname);
    sessionStorage.removeItem("sonora-spotify-state");
    sessionStorage.removeItem("sonora-spotify-verifier");
    if (!returnedState || returnedState !== storedState || !verifier) {
      throw new Error("Spotify sign-in could not be verified. Please try again.");
    }
    await this.exchangeToken(new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      code,
      redirect_uri: location.origin + location.pathname,
      code_verifier: verifier
    }));
  }

  async exchangeToken(parameters) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: parameters
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error_description || payload.error || "Spotify sign-in failed.");
    this.accessToken = payload.access_token;
    this.expiresAt = Date.now() + payload.expires_in * 1000;
    sessionStorage.setItem("sonora-spotify-access", this.accessToken);
    sessionStorage.setItem("sonora-spotify-expires", String(this.expiresAt));
    if (payload.refresh_token) {
      this.refreshToken = payload.refresh_token;
      localStorage.setItem("sonora-spotify-refresh", payload.refresh_token);
    }
  }

  async token() {
    if (!this.accessToken) throw new Error("Connect your Spotify account to search its catalog.");
    if (this.expiresAt > Date.now() + 60_000) return this.accessToken;
    if (!this.refreshToken) throw new Error("Spotify session expired. Connect again.");
    await this.exchangeToken(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.clientId,
      refresh_token: this.refreshToken
    }));
    return this.accessToken;
  }

  async request(path, options = {}, retry = true) {
    const token = await this.token();
    const response = await fetch(`${API_URL}/${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
    if (response.status === 401 && retry && this.refreshToken) {
      this.expiresAt = 0;
      await this.token();
      return this.request(path, options, false);
    }
    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch { /* use the HTTP status below */ }
      throw new Error(payload.error?.message || `Spotify API request failed (${response.status}).`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async search(query, types = ["track", "album", "artist"], limit = 20) {
    const params = new URLSearchParams({
      q: query,
      type: types.join(","),
      limit: String(Math.max(1, Math.min(50, limit)))
    });
    const result = await this.request(`search?${params}`);
    return {
      tracks: (result.tracks?.items || []).map(normalizeSpotifyTrack),
      albums: result.albums?.items || [],
      artists: result.artists?.items || []
    };
  }

  async savedTracks(limit = 50) {
    const pageSize = Math.max(1, Math.min(50, limit));
    const tracks = [];
    for (let offset = 0, total = Infinity; offset < total;) {
      const result = await this.request(`me/tracks?limit=${pageSize}&offset=${offset}`);
      const items = result.items || [];
      tracks.push(...items.map((item) => normalizeSpotifyTrack(item.track)));
      total = result.total || 0;
      if (!items.length) break;
      offset += items.length;
    }
    return tracks;
  }

  async isTrackSaved(trackId) {
    if (!trackId) return false;
    const result = await this.request(`me/tracks/contains?ids=${encodeURIComponent(trackId)}`);
    return Boolean(result?.[0]);
  }

  async playlists() {
    const playlists = [];
    for (let offset = 0, total = Infinity; offset < total;) {
      const result = await this.request(`me/playlists?limit=50&offset=${offset}`);
      const items = result.items || [];
      playlists.push(...items);
      total = result.total || 0;
      if (!items.length) break;
      offset += items.length;
    }
    return playlists;
  }

  async playlistTracks(playlistId) {
    if (!playlistId) throw new Error("Choose a Spotify playlist first.");
    const tracks = [];
    for (let offset = 0, total = Infinity; offset < total;) {
      const result = await this.request(`playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&offset=${offset}`);
      const items = result.items || [];
      tracks.push(...items.filter((item) => item.track).map((item) => normalizeSpotifyTrack(item.track)));
      total = result.total || 0;
      if (!items.length) break;
      offset += items.length;
    }
    return tracks;
  }

  async albumTracks(albumId) {
    if (!albumId) throw new Error("Choose an album first.");
    const album = await this.request(`albums/${encodeURIComponent(albumId)}`);
    const result = await this.request(`albums/${encodeURIComponent(albumId)}/tracks?limit=50`);
    return (result.items || []).map((track) => normalizeSpotifyTrack({
      ...track,
      album: { name: album.name, images: album.images }
    }));
  }

  async artistTopTracks(artistId) {
    if (!artistId) throw new Error("Choose an artist first.");
    const result = await this.request(`artists/${encodeURIComponent(artistId)}/top-tracks?market=from_token`);
    return (result.tracks || []).map(normalizeSpotifyTrack);
  }

  async devices() {
    const result = await this.request("me/player/devices");
    return result?.devices || [];
  }

  async profile() {
    return this.request("me");
  }

  async currentPlayback() {
    try { return await this.request("me/player"); }
    catch (error) {
      if (String(error.message).includes("(204)")) return null;
      throw error;
    }
  }

  async loadSdk() {
    if (this.playerReady) return;
    if (this.sdkPromise) return this.sdkPromise;
    this.sdkPromise = new Promise((resolve, reject) => {
      const previousCallback = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        previousCallback?.();
        resolve();
      };
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.onerror = () => reject(new Error("Spotify’s official playback SDK could not be loaded."));
      document.head.append(script);
    });
    return this.sdkPromise;
  }

  async connectPlayer(onDevice = () => {}) {
    if (!this.connected) throw new Error("Connect Spotify first.");
    if (this.playerReady) return this.player;
    await this.loadSdk();
    this.onDevice = onDevice;
    this.player = new window.Spotify.Player({
      name: "Sonora Web Player",
      getOAuthToken: async (callback) => callback(await this.token()),
      volume: 0.8
    });
    this.player.addListener("ready", ({ device_id: deviceId }) => {
      this.deviceId = deviceId;
      this.playerReady = true;
      this.onDevice(deviceId);
    });
    this.player.addListener("not_ready", () => {
      this.deviceId = "";
      this.playerReady = false;
      this.onDevice("");
    });
    this.player.addListener("player_state_changed", (state) => this.onPlayback(state));
    this.player.addListener("initialization_error", ({ message }) => this.onDeviceError?.(message));
    this.player.addListener("authentication_error", ({ message }) => this.onDeviceError?.(message));
    this.player.addListener("account_error", ({ message }) => this.onDeviceError?.(message));
    const connected = await this.player.connect();
    if (!connected) throw new Error("Spotify playback could not connect. A Premium account is required.");
    return this.player;
  }

  async playSpotifyTrack(track, queue = []) {
    if (!track?.uri) throw new Error("This Spotify result has no playable track URI.");
    if (!this.playerReady) await this.connectPlayer();
    const uris = queue.filter((item) => item?.uri).map((item) => item.uri);
    await this.request(`me/player/play?device_id=${encodeURIComponent(this.deviceId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uris: uris.length > 1 ? uris : [track.uri],
        ...(uris.length > 1 ? { offset: { uri: track.uri } } : {})
      })
    });
  }

  async transferToSpotifyDevice(deviceId) {
    if (!deviceId) throw new Error("Choose a Spotify device first.");
    await this.request("me/player", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_ids: [deviceId], play: false })
    });
  }

  async pauseSpotify() {
    if (this.playerReady) return this.player.pause();
    return this.request("me/player/pause", { method: "PUT" });
  }

  async resumeSpotify() {
    if (this.playerReady) return this.player.resume();
    return this.request("me/player/play", { method: "PUT" });
  }

  async nextSpotify() {
    if (this.playerReady) return this.player.nextTrack();
    return this.request("me/player/next", { method: "POST" });
  }

  async previousSpotify() {
    if (this.playerReady) return this.player.previousTrack();
    return this.request("me/player/previous", { method: "POST" });
  }

  async setSpotifyVolume(volume) {
    const normalized = Math.min(1, Math.max(0, volume));
    if (this.playerReady) return this.player.setVolume(normalized);
  }

  disconnect() {
    this.player?.disconnect();
    this.player = null;
    this.playerReady = false;
    this.deviceId = "";
    this.accessToken = "";
    this.refreshToken = "";
    this.expiresAt = 0;
    sessionStorage.removeItem("sonora-spotify-access");
    sessionStorage.removeItem("sonora-spotify-expires");
    localStorage.removeItem("sonora-spotify-refresh");
  }
}
