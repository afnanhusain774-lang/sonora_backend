import { SpotifyClient } from "./api/spotify.js";
import { AudioEngine } from "./audio/engine.js";
import { DAILY_MIXES, DEMO_TRACKS } from "./data.js";
import { localDatabase } from "./storage/database.js";
import { createStore, SessionHub } from "./state/store.js";
import { renderActivityRail, renderDevices, renderPage } from "./ui/render.js";
import { LyricsView } from "./ui/lyrics.js";
import { escapeHtml, makeId, normalizeSpotifyTrack, parseLrc, trackKey } from "./utils.js";

const $ = (selector, root = document) => root.querySelector(selector);
const audio = new AudioEngine($("#audio-a"), $("#audio-b"));
const main = $("#main-content");
const modal = $("#modal");
const lyrics = new LyricsView(modal, closeModal);
const defaults = {
  crossfade: true,
  crossfadeSeconds: 1.5,
  preferredGenres: ["indie", "ambient", "chill"],
  excludedGenres: [],
  excludedTracks: [],
  maxHistory: 100
};
const safeArray = (value) => Array.isArray(value) ? value : [];
const readLocalLikes = () => {
  try { return new Set(JSON.parse(localStorage.getItem("sonora-likes") || "[]")); }
  catch { return new Set(); }
};
const store = createStore({
  page: "home",
  query: "",
  searching: false,
  searchResults: [],
  searchAlbums: [],
  searchArtists: [],
  currentTrack: DEMO_TRACKS[0],
  currentTime: 0,
  duration: DEMO_TRACKS[0].duration,
  playing: false,
  likes: readLocalLikes(),
  localTracks: [],
  allTracks: [...DEMO_TRACKS],
  history: [],
  settings: defaults,
  sort: "recent",
  spotifyPlaylists: [],
  selectedPlaylistId: "",
  playlistTracks: [],
  discoverTracks: [],
  mixTracks: [],
  activeMix: "",
  reelTracks: [],
  reelIndex: 0,
  spotifyProfile: null,
  spotifyConnected: false,
  spotifyDevice: "",
  clientId: localStorage.getItem("sonora-client-id") || "",
  installPrompt: null,
  peers: []
});

const spotify = new SpotifyClient(store.get().clientId, (playback) => {
  if (!playback) return;
  const current = store.get();
  store.update({
    playing: !playback.paused,
    currentTime: playback.position / 1000,
    duration: playback.duration / 1000,
    currentTrack: playback.track_window?.current_track
      ? normalizeSpotifyTrack(playback.track_window.current_track)
      : current.currentTrack
  });
  updateTimeline();
});
spotify.onDeviceError = (message) => toast(message || "Spotify playback is unavailable.");

let searchTimer = 0;
let shareTrack = null;
let pipWindow = null;
let objectUrls = new Map();
let spotifySearchEpoch = 0;
let lyricsReturnToNowPlaying = false;
let playerSwipe = null;
let suppressPlayerClickUntil = 0;

const sessionHub = new SessionHub((peers) => {
  store.update({ peers });
  renderDevices(peers, Boolean(store.get().spotifyDevice));
}, (action) => handleRemoteAction(action));

function toast(message) {
  const region = $("#toast-region");
  region.textContent = message;
  region.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => region.classList.remove("is-visible"), 3500);
}

function render() {
  const state = store.get();
  if (location.hash !== `#${state.page}`) {
    history.replaceState({ page: state.page }, "", `${location.pathname}${location.search}#${state.page}`);
  }
  main.innerHTML = renderPage(state);
  if (state.page === "reels") {
    const feed = $("#reel-feed");
    const cards = [...feed.querySelectorAll(".reel-card")];
    cards[state.reelIndex]?.scrollIntoView({ block: "start" });
    feed.addEventListener("scroll", () => {
      if (feed.reelScrollFrame) return;
      feed.reelScrollFrame = requestAnimationFrame(() => {
        feed.reelScrollFrame = 0;
        const index = Math.min(cards.length - 1, Math.max(0, Math.round(feed.scrollTop / feed.clientHeight)));
        const current = store.get();
        if (index !== current.reelIndex) {
          store.update({ reelIndex: index });
          playTrack(current.reelTracks[index] || buildReelTracks()[index], { preserveView: true }).catch((error) => {
            console.error("Could not play the selected Reel.", error);
            toast(error.message || "Could not play this Reel.");
          });
        }
      });
    }, { passive: true });
  }
  document.querySelectorAll("[data-page]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.page === state.page);
  });
  $("#connect-label").textContent = state.spotifyConnected ? "Spotify connected" : "Connect Spotify";
  renderActivityRail(state.history);
  renderDevices(state.peers, Boolean(state.spotifyDevice));
  updatePlayer();
}

function updatePlayer() {
  const state = store.get();
  const track = state.currentTrack;
  const cover = $("#player-cover");
  cover.className = `cover cover-${track?.color || "violet"}`;
  if (track?.image) {
    cover.innerHTML = `<img class="cover-image" src="${escapeHtml(track.image)}" alt="">`;
  } else {
    cover.textContent = track?.icon || "♫";
  }
  $("#player-title").textContent = track?.title || "Choose a track";
  $("#player-artist").textContent = track
    ? `${track.artist} · ${track.source === "spotify" ? "Spotify" : "Local audio"}`
    : "Sonora";
  const likeButton = $("[data-action='favorite']");
  const liked = track && state.likes.has(trackKey(track));
  likeButton.textContent = liked ? "♥" : "♡";
  likeButton.classList.toggle("is-liked", Boolean(liked));
  likeButton.setAttribute("aria-label", liked ? "Unlike current track" : "Like current track");
  document.querySelectorAll("[data-action='play-pause']").forEach((button) => {
    button.textContent = state.playing ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", state.playing ? "Pause" : "Play");
  });
  $("#duration").textContent = formatDuration(state.duration);
  updateTimeline();
  updateNowPlaying();
  updateMediaSession();
  sessionHub.announce(track ? { id: trackKey(track), title: track.title, artist: track.artist } : null);
}

function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function updateTimeline() {
  const state = store.get();
  $("#elapsed").textContent = formatDuration(state.currentTime);
  $("#duration").textContent = formatDuration(state.duration || state.currentTrack?.duration);
  $("#seek").value = String(state.duration ? Math.round((state.currentTime / state.duration) * 1000) : 0);
  const nowPlayingSeek = $("#now-playing-seek");
  if (nowPlayingSeek) {
    nowPlayingSeek.value = $("#seek").value;
    $("#now-playing-elapsed").textContent = formatDuration(state.currentTime);
    $("#now-playing-duration").textContent = formatDuration(state.duration || state.currentTrack?.duration);
  }
}

function updateNowPlaying() {
  const view = $(".now-playing");
  if (!view) return;
  const track = store.get().currentTrack;
  if (!track) return;
  const art = $("#now-playing-art");
  art.className = `now-playing-art cover-${track.color || "violet"}`;
  art.innerHTML = track.image
    ? `<img src="${escapeHtml(track.image)}" alt="">`
    : `<span>${escapeHtml(track.icon || "♫")}</span>`;
  $("#now-playing-title").textContent = track.title;
  $("#now-playing-artist").textContent = track.artist;
  $("#now-playing-album").textContent = `${track.album || "Sonora"} · ${track.source === "spotify" ? "Spotify" : "On this device"}`;
  const likeButton = $("[data-action='now-playing-favorite']");
  const liked = store.get().likes.has(trackKey(track));
  likeButton.textContent = liked ? "♥  Saved" : "♡  Save";
  likeButton.classList.toggle("is-liked", liked);
  likeButton.setAttribute("aria-label", liked ? "Remove from liked songs" : "Add to liked songs");
  $("[data-action='play-pause']", view).textContent = store.get().playing ? "Ⅱ" : "▶";
  $("[data-action='play-pause']", view).setAttribute("aria-label", store.get().playing ? "Pause" : "Play");
  $("#now-playing-seek").value = $("#seek").value;
  $("#now-playing-elapsed").textContent = formatDuration(store.get().currentTime);
  $("#now-playing-duration").textContent = formatDuration(store.get().duration || track.duration);
}

function openNowPlaying() {
  const track = store.get().currentTrack;
  if (!track) return;
  lyricsReturnToNowPlaying = false;
  modal.innerHTML = `
    <section class="now-playing" aria-label="Now playing">
      <header class="now-playing-header">
        <button class="icon-button" data-action="close-modal" aria-label="Close song details">⌄</button>
        <span>NOW PLAYING</span>
        <button class="icon-button" data-action="share" aria-label="Share this song">↗</button>
      </header>
      <div class="now-playing-content">
        <div class="now-playing-art" id="now-playing-art"></div>
        <div class="now-playing-info">
          <div class="now-playing-copy">
            <span class="eyebrow">PLAYING FROM ${track.source === "spotify" ? "SPOTIFY" : "YOUR LIBRARY"}</span>
            <h1 id="now-playing-title"></h1>
            <p id="now-playing-artist"></p>
            <small id="now-playing-album"></small>
          </div>
          <button class="now-playing-like" data-action="now-playing-favorite" aria-label="Add to liked songs">♡ Save</button>
        </div>
        <div class="now-playing-timeline">
          <input id="now-playing-seek" type="range" min="0" max="1000" value="0" aria-label="Seek through song">
          <div><span id="now-playing-elapsed">0:00</span><span id="now-playing-duration">0:00</span></div>
        </div>
        <div class="now-playing-controls">
          <button class="play-button large-play" data-action="play-pause" aria-label="Play">▶</button>
        </div>
        <div class="now-playing-actions">
          <button class="now-playing-action" data-action="now-playing-lyrics"><span>♫</span><strong>Lyrics</strong><small>See the words as you listen</small></button>
          ${track.source !== "spotify" ? `<button class="now-playing-action" data-action="import-lyrics"><span>＋</span><strong>Add lyrics</strong><small>Import a timed .lrc file</small></button>` : ""}
          <button class="now-playing-action" data-action="share"><span>↗</span><strong>Share song</strong><small>Send this track to someone</small></button>
        </div>
      </div>
    </section>`;
  updateNowPlaying();
  if (!modal.open) modal.showModal();
}

function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const track = store.get().currentTrack;
  if (!track) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || "Sonora",
    artwork: track.image ? [{ src: track.image }] : []
  });
  navigator.mediaSession.setActionHandler("play", () => togglePlayback());
  navigator.mediaSession.setActionHandler("pause", () => togglePlayback());
  navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack(1));
  navigator.mediaSession.setActionHandler("previoustrack", () => nextTrack(-1));
}

function trackIsExcluded(track) {
  const settings = store.get().settings;
  if (settings.excludedTracks.includes(trackKey(track))) return true;
  const metadata = `${track.title} ${track.artist} ${track.album || ""} ${(track.genres || []).join(" ")}`.toLowerCase();
  return settings.excludedGenres.some((genre) => genre && metadata.includes(genre.toLowerCase()));
}

function getLocalSource(track) {
  if (track.blob instanceof Blob) {
    if (!objectUrls.has(track.id)) objectUrls.set(track.id, URL.createObjectURL(track.blob));
    return objectUrls.get(track.id);
  }
  if (track.file) return `./assets/audio/${encodeURIComponent(track.file)}`;
  return null;
}

async function addHistory(track) {
  if (trackIsExcluded(track)) return;
  try {
    const historyTrack = { ...track };
    delete historyTrack.blob;
    const entry = await localDatabase.saveHistory(historyTrack);
    const history = [entry, ...store.get().history].slice(0, defaults.maxHistory);
    store.update({ history });
  } catch (error) {
    console.error("Could not save listening history.", error);
    toast("The track played, but Sonora could not save local history.");
  }
}

async function playTrack(track, { preserveView = false } = {}) {
  if (!track) return;
  if (trackIsExcluded(track)) {
    toast("This track is excluded in your taste profile.");
    return;
  }
  const previousTrack = store.get().currentTrack;
  store.update({ currentTrack: track, playing: true, currentTime: 0, duration: track.duration || 0 });
  if (preserveView) updatePlayer();
  else render();
  try {
    if (track.source === "spotify") {
      if (!store.get().spotifyConnected) throw new Error("Connect Spotify to play this track.");
      audio.fadeOut();
      const queue = visibleTracks().filter((item) => item.source === "spotify" && !trackIsExcluded(item));
      await spotify.playSpotifyTrack(track, queue);
      store.update({ spotifyDevice: spotify.deviceId });
    } else {
      if (previousTrack?.source === "spotify" && store.get().spotifyConnected) {
        try { await spotify.pauseSpotify(); }
        catch (error) {
          console.warn("Could not pause Spotify before local playback.", error);
          toast("Could not pause Spotify; local playback will still start.");
        }
      }
      await audio.play(track, getLocalSource(track));
    }
    await addHistory(track);
    store.update({ currentTrack: track, playing: true });
    if (preserveView) updatePlayer();
    else render();
  } catch (error) {
    store.update({ playing: false });
    if (preserveView) updatePlayer();
    else render();
    console.error("Track playback failed.", error);
    toast(error.message || "Could not play this track.");
  }
}

function visibleTracks() {
  const state = store.get();
  if (state.page === "discover" && state.discoverTracks.length) return state.discoverTracks;
  if (state.page === "library" && state.selectedPlaylistId) return state.playlistTracks;
  if (state.page === "liked") return state.allTracks.filter((track) => state.likes.has(trackKey(track)));
  if (state.page === "search") return [...new Map([
    ...state.searchResults,
    ...state.allTracks.filter((track) =>
      `${track.title} ${track.artist} ${track.album || ""}`.toLowerCase().includes(state.query.toLowerCase()))
  ].map((track) => [trackKey(track), track])).values()];
  if (state.page === "mixes" && state.mixTracks.length) return state.mixTracks;
  if (state.page === "reels" && state.reelTracks.length) return state.reelTracks;
  return state.allTracks;
}

function currentPlaylistIndex(list) {
  const index = list.findIndex((track) => trackKey(track) === trackKey(store.get().currentTrack));
  return index < 0 ? 0 : index;
}

async function nextTrack(direction) {
  const state = store.get();
  if (state.currentTrack?.source === "spotify") {
    try {
      if (direction > 0) await spotify.nextSpotify();
      else await spotify.previousSpotify();
      return;
    } catch (error) { toast(error.message); return; }
  }
  if (state.page === "reels") {
    navigateReel(state.reelIndex + direction);
    return;
  }
  const list = visibleTracks().filter((track) => !trackIsExcluded(track));
  if (!list.length) return;
  const index = (currentPlaylistIndex(list) + direction + list.length) % list.length;
  await playTrack(list[index]);
}

async function togglePlayback() {
  const state = store.get();
  if (state.currentTrack?.source === "spotify" && state.spotifyConnected) {
    try {
      if (state.playing) await spotify.pauseSpotify();
      else await spotify.resumeSpotify();
      store.update({ playing: !state.playing });
      render();
    } catch (error) { toast(error.message); }
    return;
  }
  try {
    if (!audio.snapshot().track) await playTrack(state.currentTrack || DEMO_TRACKS[0]);
    else {
      await audio.toggle();
      store.update({ playing: audio.isPlaying });
      render();
    }
  } catch (error) {
    console.error("Playback could not start.", error);
    toast(error.message || "Playback could not start.");
  }
}

function updateLikes(track, liked) {
  const likes = new Set(store.get().likes);
  if (liked) likes.add(trackKey(track));
  else likes.delete(trackKey(track));
  localStorage.setItem("sonora-likes", JSON.stringify([...likes]));
  store.update({ likes });
}

async function toggleFavorite(track = store.get().currentTrack) {
  if (!track) return;
  let wasLiked = store.get().likes.has(trackKey(track));
  if (track.source === "spotify") {
    try {
      const isSaved = await spotify.isTrackSaved(track.id);
      wasLiked = isSaved;
      const method = isSaved ? "DELETE" : "PUT";
      await spotify.request(`me/tracks?ids=${encodeURIComponent(track.id)}`, { method });
    } catch (error) {
      console.error("Could not update Spotify saved tracks.", error);
      toast(error.message || "Could not update Spotify saved tracks.");
      return;
    }
  }
  updateLikes(track, !wasLiked);
  if (track.source === "spotify" && !wasLiked) {
    const allTracks = [...new Map([...store.get().allTracks, track].map((item) => [trackKey(item), item])).values()];
    store.update({ allTracks });
  }
  if (store.get().page === "library" || store.get().page === "liked") render();
  toast(wasLiked ? "Removed from Liked Songs" : "Added to Liked Songs");
}

async function loadLocalTracks() {
  try {
    const files = await localDatabase.all("files");
    const tracks = files.map((item) => ({ ...item, source: "local", duration: item.duration || 0 }));
    const spotifyTracks = store.get().allTracks.filter((track) => track.source === "spotify");
    store.update({
      localTracks: tracks,
      allTracks: [...new Map([...DEMO_TRACKS, ...tracks, ...spotifyTracks].map((track) => [trackKey(track), track])).values()]
    });
  } catch (error) {
    console.error("Could not load local audio.", error);
    toast("Local music storage is unavailable in this browser.");
  }
}

async function importAudio(files) {
  const audioFiles = [...files].filter((file) => file.type.startsWith("audio/") || /\.flac$/i.test(file.name));
  if (!audioFiles.length) {
    toast("Choose audio files such as MP3, WAV, M4A, OGG or FLAC.");
    return;
  }
  try {
    for (const file of audioFiles) {
      const id = `local-${makeId()}`;
      const track = {
        id,
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: "Your local files",
        album: "On this device",
        icon: "♫",
        color: ["violet", "green", "blue", "coral", "gold", "rose"][store.get().localTracks.length % 6],
        duration: 0,
        mimeType: file.type || "audio/flac",
        size: file.size,
        addedAt: Date.now(),
        blob: file
      };
      await localDatabase.put("files", track);
    }
    await loadLocalTracks();
    store.update({ page: "library" });
    render();
    toast(`${audioFiles.length} audio file${audioFiles.length === 1 ? "" : "s"} added. Files stay on this device.`);
  } catch (error) {
    console.error("Could not store imported audio.", error);
    toast("Could not save those files. Check this browser's available storage.");
  }
}

async function importLyrics(file) {
  const track = store.get().currentTrack;
  if (!track || track.source === "spotify") {
    toast("Choose a local track before importing synchronized lyrics.");
    return;
  }
  try {
    const lines = parseLrc(await file.text());
    if (!lines.length) throw new Error("This .lrc file contains no timestamped lyrics.");
    await localDatabase.put("lyrics", { id: trackKey(track), lines });
    lyricsReturnToNowPlaying = false;
    lyrics.setTrack(track, lines);
    if (!modal.open) modal.showModal();
    toast(`Loaded ${lines.length} timed lyric lines.`);
  } catch (error) {
    console.error("Could not load synchronized lyrics.", error);
    toast(error.message || "Could not read the .lrc file.");
  }
}

async function openLyrics({ returnToNowPlaying = false } = {}) {
  const track = store.get().currentTrack;
  let lines = [];
  if (track?.source !== "spotify") {
    try { lines = (await localDatabase.get("lyrics", trackKey(track)))?.lines || []; }
    catch (error) {
      console.error("Could not read local lyrics.", error);
      toast("Could not load saved lyrics.");
    }
  }
  lyricsReturnToNowPlaying = returnToNowPlaying;
  lyrics.setTrack(track, lines);
  if (!modal.open) modal.showModal();
  lyrics.updateTime(store.get().currentTime);
}

function closeModal() {
  if (!modal.open) return;
  if (lyricsReturnToNowPlaying) {
    openNowPlaying();
    return;
  }
  lyricsReturnToNowPlaying = false;
  modal.close();
}

document.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
  const surface = event.target.closest(".player-bar, .now-playing-art");
  if (!surface) return;
  const detailButton = event.target.closest(".player-track-details");
  if (event.target.closest("input, select, a, button") && !detailButton) return;
  playerSwipe = {
    pointerId: event.pointerId,
    surface,
    x: event.clientX,
    y: event.clientY,
    swiped: false
  };
});

document.addEventListener("pointermove", (event) => {
  if (!playerSwipe || event.pointerId !== playerSwipe.pointerId) return;
  const dx = event.clientX - playerSwipe.x;
  const dy = event.clientY - playerSwipe.y;
  if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
  playerSwipe.swiped = true;
  if (event.cancelable) event.preventDefault();
});

document.addEventListener("pointerup", (event) => {
  if (!playerSwipe || event.pointerId !== playerSwipe.pointerId) return;
  const swipe = playerSwipe;
  playerSwipe = null;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  if (!swipe.swiped || Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
  suppressPlayerClickUntil = performance.now() + 400;
  nextTrack(dx < 0 ? 1 : -1).catch((error) => {
    console.error("Could not change tracks after a swipe.", error);
    toast(error.message || "Could not change tracks.");
  });
});

document.addEventListener("pointercancel", (event) => {
  if (playerSwipe?.pointerId === event.pointerId) playerSwipe = null;
});

async function connectSpotify() {
  try {
    if (!spotify.clientId) {
      store.update({ page: "settings" });
      render();
      toast("Add your Spotify client ID in Settings to connect.");
      return;
    }
    await spotify.login();
  } catch (error) { toast(error.message); }
}

async function refreshSpotifyProfile() {
  if (!spotify.connected) return;
  try {
    const profile = await spotify.profile();
    const [tracks, playlists] = await Promise.all([
      spotify.savedTracks(),
      spotify.playlists().catch((error) => {
        console.warn("Could not load Spotify playlists.", error);
        toast(error.message || "Could not load Spotify playlists.");
        return [];
      })
    ]);
    const likes = new Set(store.get().likes);
    tracks.forEach((track) => likes.add(trackKey(track)));
    localStorage.setItem("sonora-likes", JSON.stringify([...likes]));
    store.update({
      spotifyConnected: true,
      spotifyProfile: profile,
      likes,
      spotifyPlaylists: playlists,
      allTracks: [...new Map([...store.get().allTracks, ...tracks].map((track) => [trackKey(track), track])).values()],
      searchResults: [],
      page: store.get().page
    });
    try {
      await spotify.connectPlayer((device) => {
        store.update({ spotifyDevice: device });
        renderDevices(store.get().peers, Boolean(device));
      });
    } catch (error) {
      console.warn("Spotify account connected; Web Playback SDK is not ready.", error);
      toast(error.message);
    }

    async function openSpotifyPlaylist(id) {
      try {
        const playlistTracks = await spotify.playlistTracks(id);
        store.update({
          page: "library",
          selectedPlaylistId: id,
          playlistTracks: playlistTracks.filter((track) => !trackIsExcluded(track))
        });
        render();
      } catch (error) {
        console.error("Could not load Spotify playlist tracks.", error);
        toast(error.message || "Could not load this playlist.");
      }
    }
  } catch (error) {
    console.error("Spotify account setup failed.", error);
    store.update({ spotifyConnected: false });
    toast(error.message || "Could not load the Spotify account.");
  }
}

function spotifySearch(query, limit = 20) {
  const epoch = ++spotifySearchEpoch;
  if (!spotify.connected || !query.trim()) {
    store.update({ searchResults: [], searchAlbums: [], searchArtists: [], searching: false });
    render();
    return;
  }
  store.update({ searching: true });
  render();
  spotify.search(query, ["track", "album", "artist"], limit).then((result) => {
    if (epoch !== spotifySearchEpoch) return;
    const excluded = result.tracks.filter((track) => !trackIsExcluded(track));
    store.update({ searchResults: excluded, searchAlbums: result.albums, searchArtists: result.artists, searching: false });
    render();
  }).catch((error) => {
    if (epoch !== spotifySearchEpoch) return;
    store.update({ searchResults: [], searchAlbums: [], searchArtists: [], searching: false });
    render();
    console.error("Spotify search failed.", error);
    toast(error.message || "Spotify search failed.");
  });
}

function prioritizeByTaste(tracks) {
  const state = store.get();
  const listenedArtists = new Map();
  for (const item of state.history) {
    const artist = item.track.artist.toLowerCase();
    listenedArtists.set(artist, (listenedArtists.get(artist) || 0) + 1);
  }
  const likedArtists = new Set([...state.likes].map((id) =>
    state.allTracks.find((track) => trackKey(track) === id)?.artist?.toLowerCase()).filter(Boolean));
  const genreHints = state.settings.preferredGenres.map((value) => value.toLowerCase());
  return [...new Map(tracks.filter((track) => !trackIsExcluded(track))
    .map((track) => [trackKey(track), track])).values()].sort((left, right) => {
    const rank = (track) => {
      const artist = track.artist.toLowerCase();
      return (likedArtists.has(artist) ? 4 : 0)
        + (listenedArtists.get(artist) ? 2 : 0)
        + (genreHints.some((genre) => `${track.title} ${track.album}`.toLowerCase().includes(genre)) ? 1 : 0);
    };
    return rank(right) - rank(left);
  }).slice(0, 50);
}

async function refreshDiscover() {
  if (!spotify.connected) {
    store.update({ page: "settings" });
    render();
    toast("Connect Spotify to find 50 tracks from its official catalog.");
    return;
  }
  toast("Finding tracks across your preferred genres…");
  const { preferredGenres, excludedGenres } = store.get().settings;
  const genres = preferredGenres.filter((genre) =>
    !excludedGenres.some((excluded) => genre.toLowerCase().includes(excluded.toLowerCase()))
  ).slice(0, 5);
  const queries = [...new Set([...genres, "new releases"]).values()];
  try {
    const results = [];
    for (const genre of queries) {
      const query = genre === "new releases" ? `year:${new Date().getFullYear()}` : `genre:"${genre}"`;
      const result = await spotify.search(query, ["track"], 50);
      results.push(...result.tracks);
      if (results.length >= 100) break;
    }
    const tracks = prioritizeByTaste(results);
    store.update({ discoverTracks: tracks, page: "discover" });
    render();
    toast(`Loaded ${tracks.length} unique Spotify tracks using your current genre preferences.`);
  } catch (error) {
    console.error("Could not build Discover Weekly.", error);
    toast(error.message || "Could not build Discover Weekly.");
  }
}

async function selectMix(id) {
  const mix = DAILY_MIXES.find((item) => item.id === id);
  if (!mix) return;
  store.update({ activeMix: id, mixTracks: [], page: "mixes" });
  render();
  if (store.get().settings.excludedGenres.some((genre) =>
    `${mix.name} ${mix.vibe} ${mix.query}`.toLowerCase().includes(genre.toLowerCase())
  )) {
    toast("This mix matches a genre excluded in your taste profile.");
    return;
  }
  if (!spotify.connected) {
    store.update({ page: "settings" });
    render();
    toast("Connect Spotify to load this mix's tracks.");
    return;
  }
  try {
    const result = await spotify.search(`genre:"${mix.query}"`, ["track"], 30);
    store.update({ activeMix: id, mixTracks: result.tracks.filter((track) => !trackIsExcluded(track)), page: "mixes" });
    render();
  } catch (error) {
    console.error("Could not load Daily Mix.", error);
    toast(error.message);
  }
}

async function openMix(id = store.get().activeMix) {
  if (!id) id = DAILY_MIXES[0].id;
  await selectMix(id);
}

function buildReelTracks() {
  const state = store.get();
  const list = state.discoverTracks.length ? state.discoverTracks : state.allTracks;
  return list.filter((track) => !trackIsExcluded(track));
}

async function navigateReel(index) {
  const tracks = buildReelTracks();
  if (!tracks.length) return;
  const normalizedIndex = (index + tracks.length) % tracks.length;
  const alreadyOnReels = store.get().page === "reels";
  store.update({ page: "reels", reelTracks: tracks, reelIndex: normalizedIndex });
  if (!alreadyOnReels) render();
  else {
    const card = $("#reel-feed .reel-card:nth-child(" + (normalizedIndex + 1) + ")");
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
    await playTrack(tracks[normalizedIndex], { preserveView: true });
  }
}

async function shareCurrent() {
  const track = shareTrack || store.get().currentTrack;
  if (!track) return;
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  if (track.playlistUrl) {
    url.href = track.playlistUrl;
  } else if (track.playlist) {
    url.searchParams.set("playlist", "discover");
  } else if (track.source === "spotify") {
    url.href = `https://open.spotify.com/track/${encodeURIComponent(track.id)}`;
  } else {
    url.searchParams.set("track", trackKey(track));
    url.searchParams.set("title", track.title);
    url.searchParams.set("artist", track.artist);
    url.searchParams.set("source", track.source || "local");
  }
  const share = {
    title: `${track.title} · Sonora`,
    text: track.playlist
      ? "Explore this Sonora Discover Weekly mix."
      : `Listen to ${track.title} by ${track.artist} on Sonora.`,
    url: url.href
  };
  try {
    if (navigator.share) await navigator.share(share);
    else {
      await navigator.clipboard.writeText(share.url);
      toast("Share link copied.");
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("Could not share track.", error);
      toast("Could not share this track.");
    }
  }
}

async function openDevices() {
  const peers = sessionHub.list();
  let spotifyDevices = [];
  if (spotify.connected) {
    try { spotifyDevices = await spotify.devices(); }
    catch (error) {
      console.error("Could not list Spotify devices.", error);
      toast(error.message || "Could not load Spotify devices.");
    }
  }
  modal.innerHTML = `<div class="modal-head"><h2>Connected devices</h2><button class="icon-button" data-action="close-modal" aria-label="Close">×</button></div>
    <p>Spotify devices are managed through your official account. Sonora tab controls work only in other tabs on this browser.</p>
    <div class="device-modal-list">${spotifyDevices.map((device) => `<button class="device-item" data-action="spotify-device" data-device-id="${escapeHtml(device.id)}"><span class="device-glyph">●</span><span><strong>${escapeHtml(device.name)}</strong><small>${escapeHtml(device.type)}${device.is_active ? " · Active" : ""}</small></span><span class="device-state"></span></button>`).join("")}
    ${peers.length ? peers.map((peer) => `<div class="device-item"><span class="device-glyph">▣</span><span><strong>${escapeHtml(peer.label)}</strong><small>${escapeHtml(peer.track?.title || "Ready")}</small></span><span class="device-actions"><button class="icon-button" data-action="peer-previous" data-peer-id="${escapeHtml(peer.id)}" aria-label="Previous on ${escapeHtml(peer.label)}">|◀</button><button class="icon-button" data-action="peer-toggle" data-peer-id="${escapeHtml(peer.id)}" aria-label="Play or pause on ${escapeHtml(peer.label)}">▶</button><button class="icon-button" data-action="peer-next" data-peer-id="${escapeHtml(peer.id)}" aria-label="Next on ${escapeHtml(peer.label)}">▶|</button></span></div>`).join("") : `<p>No other Sonora tabs are online.</p>`}</div>`;
  modal.showModal();
}

function handleRemoteAction(action) {
  if (!action || (action.target && action.target !== sessionHub.id)) return;
  if (action.type === "next") nextTrack(1);
  else if (action.type === "previous") nextTrack(-1);
  else if (action.type === "toggle") togglePlayback();
  else if (action.type === "play" && action.track) {
    const match = store.get().allTracks.find((track) => trackKey(track) === action.track.id)
      || (String(action.track.id).startsWith("spotify:track:")
        ? {
          id: action.track.id.slice("spotify:track:".length),
          uri: action.track.id,
          source: "spotify",
          title: action.track.title,
          artist: action.track.artist,
          album: "Spotify"
        }
        : null);
    if (match) playTrack(match);
  }
}

function showCompanionWindow() {
  if (!("documentPictureInPicture" in window)) {
    toast("Picture-in-Picture companion is not supported in this browser. Use the sticky player or a second Sonora tab.");
    return;
  }
  documentPictureInPicture.requestWindow({ width: 310, height: 170 }).then((windowRef) => {
    pipWindow = windowRef;
    const styles = document.createElement("style");
    styles.textContent = `body{margin:0;padding:16px;background:#121212;color:#fff;font:14px system-ui}main{display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:12px}.cover{width:52px;height:52px;border-radius:8px;background:#1db954;display:grid;place-items:center;font-size:26px}small{display:block;color:#aaa;margin-top:5px}button{border:0;border-radius:20px;padding:10px;background:#1db954;color:#111;font-weight:700}footer{display:flex;justify-content:center;gap:16px;margin-top:18px}`;
    windowRef.document.head.append(styles);
    windowRef.document.body.innerHTML = `<main><div class="cover" id="pip-cover">♫</div><div><strong id="pip-title"></strong><small id="pip-artist"></small></div><button id="pip-close">×</button></main><footer><button id="pip-prev">|◀</button><button id="pip-play">▶</button><button id="pip-next">▶|</button></footer>`;
    const update = () => {
      const track = store.get().currentTrack;
      windowRef.document.querySelector("#pip-title").textContent = track?.title || "Sonora";
      windowRef.document.querySelector("#pip-artist").textContent = track?.artist || "Choose music";
      windowRef.document.querySelector("#pip-cover").textContent = track?.icon || "♫";
      windowRef.document.querySelector("#pip-play").textContent = store.get().playing ? "Ⅱ" : "▶";
    };
    const unsubscribe = store.subscribe(update);
    windowRef.addEventListener("pagehide", unsubscribe, { once: true });
    windowRef.document.querySelector("#pip-close").onclick = () => windowRef.close();
    windowRef.document.querySelector("#pip-prev").onclick = () => nextTrack(-1);
    windowRef.document.querySelector("#pip-next").onclick = () => nextTrack(1);
    windowRef.document.querySelector("#pip-play").onclick = () => togglePlayback();
    update();
  }).catch((error) => {
    console.error("Could not open companion player.", error);
    toast(error.message || "Could not open the companion player.");
  });
}

function updateExcludedTracks(track) {
  const state = store.get();
  const excludedTracks = state.settings.excludedTracks.includes(trackKey(track))
    ? state.settings.excludedTracks.filter((id) => id !== trackKey(track))
    : [...state.settings.excludedTracks, trackKey(track)];
  const settings = { ...state.settings, excludedTracks };
  store.update({ settings });
  localDatabase.saveSetting("preferences", settings).catch((error) => {
    console.error("Could not save taste exclusions.", error);
    toast("Could not save your exclusions.");
  });
  render();
}

async function handleAction(action, target) {
  const state = store.get();
  const trackId = target.dataset.trackId;
  const track = [
    ...state.allTracks,
    ...state.searchResults,
    ...state.discoverTracks,
    ...state.mixTracks,
    ...state.playlistTracks,
    ...state.reelTracks
  ].find((item) => trackKey(item) === trackId);
  switch (action) {
    case "open-now-playing":
      openNowPlaying();
      break;
    case "now-playing-favorite":
      await toggleFavorite();
      updatePlayer();
      break;
    case "now-playing-lyrics":
      await openLyrics({ returnToNowPlaying: true });
      break;
    case "play-track":
      if (track) await playTrack(track);
      break;
    case "favorite":
      await toggleFavorite();
      break;
    case "favorite-track":
      if (track) await toggleFavorite(track);
      break;
    case "play-pause":
      await togglePlayback();
      break;
    case "next":
      await nextTrack(1);
      break;
    case "previous":
      await nextTrack(-1);
      break;
    case "shuffle": {
      const list = visibleTracks().filter((item) => !trackIsExcluded(item));
      if (list.length) await playTrack(list[Math.floor(Math.random() * list.length)]);
      break;
    }
    case "lyrics":
      await openLyrics();
      break;
    case "open-library":
      store.update({ page: "library", selectedPlaylistId: "", playlistTracks: [] }); render();
      break;
    case "open-liked":
      store.update({ page: "liked", selectedPlaylistId: "", playlistTracks: [] }); render();
      break;
    case "open-discover":
      store.update({ page: "discover" }); render();
      break;
    case "open-mixes":
      store.update({ page: "mixes" }); render();
      break;
    case "import-audio":
      $("#audio-import").click();
      break;
    case "import-lyrics":
      $("#lyrics-import").click();
      break;
    case "play-collection": {
      const tracks = visibleTracks();
      if (tracks.length) await playTrack(tracks[0]);
      else toast("Add tracks to this collection first.");
      break;
    }
    case "sort-library":
      store.update({ sort: state.sort === "title" ? "recent" : "title" });
      render();
      break;
    case "open-playlist":
      await openSpotifyPlaylist(target.dataset.playlistId);
      break;
    case "share-playlist": {
      const playlist = state.spotifyPlaylists.find((item) => item.id === state.selectedPlaylistId);
      if (playlist) {
        shareTrack = {
          id: playlist.id,
          title: playlist.name,
          artist: playlist.owner?.display_name || "Spotify",
          playlist: true,
          playlistUrl: playlist.external_urls?.spotify
        };
        await shareCurrent();
        shareTrack = null;
      }
      break;
    }
    case "refresh-discover":
      await refreshDiscover();
      break;
    case "share-discover":
      shareTrack = { id: "discover-weekly", title: "Discover Weekly", artist: "Sonora", playlist: true };
      await shareCurrent();
      shareTrack = null;
      break;
    case "select-mix":
      await selectMix(target.dataset.mix);
      break;
    case "refresh-mix":
      await openMix();
      break;
    case "play-reel": {
      const reel = buildReelTracks()[Number(target.dataset.index)] || DEMO_TRACKS[0];
      await playTrack(reel);
      break;
    }
    case "exclude-track":
      if (track) updateExcludedTracks(track);
      break;
    case "reel-next":
      await navigateReel(state.reelIndex + 1);
      break;
    case "reel-prev":
      await navigateReel(state.reelIndex - 1);
      break;
    case "search-genre":
      store.update({ page: "search", query: target.dataset.query });
      render();
      spotifySearch(target.dataset.query);
      break;
    case "open-album":
    case "open-artist": {
      const results = action === "open-album"
        ? await spotify.albumTracks(target.dataset.id)
        : await spotify.artistTopTracks(target.dataset.id);
      store.update({ searchResults: results.filter((item) => !trackIsExcluded(item)), searchAlbums: [], searchArtists: [] });
      render();
      break;
    }
    case "spotify-connect":
      await connectSpotify();
      break;
    case "spotify-disconnect":
      spotify.disconnect();
      audio.pause();
      store.update({
        spotifyConnected: false,
        spotifyProfile: null,
        spotifyDevice: "",
        spotifyPlaylists: [],
        selectedPlaylistId: "",
        playlistTracks: [],
        currentTrack: state.currentTrack?.source === "spotify" ? DEMO_TRACKS[0] : state.currentTrack,
        playing: false
      });
      render();
      toast("Spotify disconnected. Your local library is unchanged.");
      break;
    case "save-client-id": {
      const clientId = $("#spotify-client-id").value.trim();
      localStorage.setItem("sonora-client-id", clientId);
      spotify.setClientId(clientId);
      store.update({ clientId });
      toast("Spotify client ID saved on this device.");
      break;
    }
    case "save-exclusions": {
      const excludedGenres = $("#excluded-genres").value.split(",").map((value) => value.trim()).filter(Boolean);
      const settings = { ...state.settings, excludedGenres };
      store.update({ settings });
      await localDatabase.saveSetting("preferences", settings);
      render();
      toast("Taste profile exclusions saved.");
      break;
    }
    case "save-preferences": {
      const preferredGenres = $("#preferred-genres").value.split(",").map((value) => value.trim()).filter(Boolean);
      const settings = { ...state.settings, preferredGenres };
      store.update({ settings });
      await localDatabase.saveSetting("preferences", settings);
      render();
      toast("Your preferred genres were saved.");
      break;
    }
    case "remove-exclusion": {
      const settings = { ...state.settings, excludedTracks: state.settings.excludedTracks.filter((id) => id !== trackId) };
      store.update({ settings });
      await localDatabase.saveSetting("preferences", settings);
      render();
      break;
    }
    case "device-picker":
      openDevices();
      break;
    case "control-peer": {
      const peer = sessionHub.list()[Number(target.dataset.peerIndex)];
      if (peer?.track) sessionHub.requestControl({ type: "play", track: peer.track });
      closeModal();
      toast("Playback controls are shared with connected Sonora tabs.");
      break;
    }
    case "spotify-device":
      try { await spotify.transferToSpotifyDevice(target.dataset.deviceId); closeModal(); }
      catch (error) { toast(error.message); }
      break;
    case "peer-toggle":
    case "peer-next":
    case "peer-previous":
      sessionHub.requestControl({
        type: action === "peer-toggle" ? "toggle" : action === "peer-next" ? "next" : "previous",
        target: target.dataset.peerId
      });
      toast("Playback control sent to the selected Sonora tab.");
      break;
    case "pip":
      showCompanionWindow();
      break;
    case "mobile-volume": {
      const playerBar = $(".player-bar");
      const isOpen = playerBar.classList.toggle("is-volume-open");
      target.setAttribute("aria-expanded", String(isOpen));
      break;
    }
    case "share":
      await shareCurrent();
      break;
    case "storage-usage": {
      const estimate = await navigator.storage?.estimate?.();
      toast(estimate ? `${formatBytes(estimate.usage)} of ${formatBytes(estimate.quota)} browser storage used.` : "Storage estimates are unavailable.");
      break;
    }
    case "install-app":
      if (state.installPrompt) {
        await state.installPrompt.prompt();
        store.update({ installPrompt: null });
      } else {
        toast("Use your browser’s Install App option to add Sonora to your device.");
      }
      break;
    case "close-modal":
      closeModal();
      break;
    case "back":
      history.back();
      break;
    case "forward":
      history.forward();
      break;
    case "quality":
      toast("Local files play at their original encoding. Spotify streaming quality is managed by Spotify.");
      break;
    case "profile":
      store.update({ page: "settings" }); render();
      break;
    default:
      break;
  }
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value.toFixed(1)} ${units[index]}`;
}

document.addEventListener("click", async (event) => {
  if (performance.now() < suppressPlayerClickUntil && event.target.closest(".player-bar")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  const pageLink = event.target.closest("[data-page]");
  if (pageLink) {
    const page = pageLink.dataset.page;
    store.update({
      page,
      query: "",
      ...(page === "library" ? { selectedPlaylistId: "", playlistTracks: [] } : {}),
      ...(page === "reels" ? { reelTracks: buildReelTracks(), reelIndex: 0 } : {})
    });
    history.pushState({ page: pageLink.dataset.page }, "", `#${pageLink.dataset.page}`);
    render();
    return;
  }
  const target = event.target.closest("[data-action]");
  if (target) {
    try { await handleAction(target.dataset.action, target); }
    catch (error) {
      console.error(`Action failed: ${target.dataset.action}`, error);
      toast(error.message || "That action could not be completed.");
    }
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "global-query" || event.target.id === "page-search") {
    const query = event.target.value.trim();
    store.update({ query, page: "search" });
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => spotifySearch(query), 250);
    if (event.target.id === "global-query") render();
    return;
  }
  if (event.target.id === "seek" || event.target.id === "now-playing-seek") {
    if (store.get().currentTrack?.source === "spotify" && spotify.playerReady) {
      Promise.resolve(spotify.player.seek(Number(event.target.value) / 1000 * store.get().duration * 1000))
        .catch((error) => {
          console.error("Could not seek Spotify playback.", error);
          toast(error.message || "Could not seek Spotify playback.");
        });
    } else {
      audio.seek(Number(event.target.value) / 1000);
    }
    return;
  }
  if (event.target.id === "volume") {
    const volume = Number(event.target.value) / 100;
    audio.setVolume(volume);
    if (store.get().currentTrack?.source === "spotify") {
      Promise.resolve(spotify.setSpotifyVolume(volume)).catch((error) => {
        console.error("Could not change Spotify volume.", error);
        toast(error.message || "Could not change Spotify volume.");
      });
    }
    return;
  }
  if (event.target.dataset.setting) {
    const key = event.target.dataset.setting;
    const value = event.target.type === "checkbox" ? event.target.checked
      : event.target.type === "range" ? Number(event.target.value)
        : event.target.value;
    const settings = { ...store.get().settings, [key]: value };
    store.update({ settings });
    audio.setCrossfade(settings.crossfade, settings.crossfadeSeconds);
    localDatabase.saveSetting("preferences", settings).catch((error) => {
      console.error("Could not save settings.", error);
      toast("Could not save your settings.");
    });
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "audio-import") {
    await importAudio(event.target.files || []);
    event.target.value = "";
  }
  if (event.target.id === "lyrics-import") {
    const file = event.target.files?.[0];
    if (file) await importLyrics(file);
    event.target.value = "";
  }
  if (event.target.dataset.setting === "crossfade") {
    const key = event.target.dataset.setting;
    const settings = { ...store.get().settings, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value };
    store.update({ settings });
    audio.setCrossfade(settings.crossfade, settings.crossfadeSeconds);
    await localDatabase.saveSetting("preferences", settings);
  }
});

audio.addEventListener("time", ({ detail }) => {
  if (store.get().currentTrack?.source === "spotify") return;
  store.update({ currentTime: detail.time, duration: detail.duration || store.get().currentTrack?.duration || 0 });
  updateTimeline();
  lyrics.updateTime(detail.time);
});
audio.addEventListener("track", ({ detail }) => {
  store.update({ currentTrack: detail, playing: true });
  render();
});
audio.addEventListener("play", () => {
  if (store.get().currentTrack?.source === "spotify") return;
  store.update({ playing: true });
  updatePlayer();
});
audio.addEventListener("pause", () => {
  if (store.get().currentTrack?.source === "spotify") return;
  store.update({ playing: false });
  updatePlayer();
});
audio.addEventListener("ended", () => {
  if (store.get().currentTrack?.source === "spotify") return;
  if (store.get().page === "reels") navigateReel(store.get().reelIndex + 1);
  else nextTrack(1);
});
audio.addEventListener("crossfade", () => {
  if (store.get().page === "reels") {
    navigateReel(store.get().reelIndex + 1);
    return;
  }
  const next = visibleTracks().filter((track) => !trackIsExcluded(track));
  if (!next.length || next.some((track) => track.source === "spotify")) return;
  const index = (currentPlaylistIndex(next) + 1) % next.length;
  playTrack(next[index]).catch((error) => {
    console.error("Could not crossfade to the next track.", error);
    toast(error.message || "Could not crossfade to the next track.");
  });
});
audio.addEventListener("error", ({ detail }) => {
  if (store.get().currentTrack?.source !== "spotify") toast(detail.message);
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("#global-query").focus();
  }
  if (event.key === "Escape" && modal.open) {
    event.preventDefault();
    closeModal();
  }
  if (store.get().page === "reels" && ["ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    navigateReel(store.get().reelIndex + (event.key === "ArrowDown" ? 1 : -1));
  }
});

window.addEventListener("popstate", () => {
  const page = location.hash.slice(1);
  store.update({ page: ["home", "search", "library", "liked", "discover", "mixes", "reels", "activity", "settings"].includes(page) ? page : "home" });
  if (page === "reels") store.update({ reelTracks: buildReelTracks(), reelIndex: 0 });
  render();
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  store.update({ installPrompt: event });
});

async function initialize() {
  store.update({
    page: ["home", "search", "library", "liked", "discover", "mixes", "reels", "activity", "settings"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "home"
  });
  if (store.get().page === "reels") store.update({ reelTracks: buildReelTracks(), reelIndex: 0 });
  try {
    const [files, historyEntries, settings, lyricsEntries] = await Promise.all([
      localDatabase.all("files"),
      localDatabase.all("history"),
      localDatabase.readSetting("preferences", defaults),
      localDatabase.all("lyrics")
    ]);
    const localTracks = files.map((track) => ({ ...track, source: "local", duration: track.duration || 0 }));
    const orderedHistory = historyEntries.sort((a, b) => b.playedAt - a.playedAt);
    const lyricsEntriesById = new Map(lyricsEntries.map((item) => [item.id, item.lines]));
    const merged = [...DEMO_TRACKS, ...localTracks];
    const currentTrack = store.get().currentTrack;
    store.update({
      localTracks,
      allTracks: merged,
      history: orderedHistory,
      settings: { ...defaults, ...settings, excludedGenres: safeArray(settings.excludedGenres), excludedTracks: safeArray(settings.excludedTracks) },
      currentTrack
    });
    store.update({ history: orderedHistory.filter((item) => !trackIsExcluded(item.track)) });
    audio.setCrossfade(settings.crossfade ?? defaults.crossfade, settings.crossfadeSeconds ?? defaults.crossfadeSeconds);
    lyrics.setTrack(currentTrack, lyricsEntriesById.get(trackKey(currentTrack)) || []);
  } catch (error) {
    console.error("Sonora initialization encountered a storage error.", error);
    toast("Local storage could not be initialized. Some offline features may be unavailable.");
  }
  render();
  try {
    await spotify.handleCallback();
    if (spotify.connected) await refreshSpotifyProfile();
  } catch (error) {
    console.error("Spotify sign-in callback failed.", error);
    toast(error.message || "Spotify sign-in failed.");
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Offline app shell could not be registered.", error);
      toast("Offline app-shell caching is unavailable in this browser.");
    });
  }
  const sharedUrl = new URL(location.href);
  if (sharedUrl.searchParams.get("playlist") === "discover") {
    store.update({ page: "discover" });
    render();
    toast("Open Discover Weekly and connect Spotify to build this shared mix.");
  }
  const sharedId = sharedUrl.searchParams.get("track");
  if (sharedId) {
    let track = store.get().allTracks.find((item) => trackKey(item) === sharedId);
    if (!track && sharedUrl.searchParams.get("title")) {
      track = {
        id: sharedId,
        title: sharedUrl.searchParams.get("title"),
        artist: sharedUrl.searchParams.get("artist") || "Unknown artist",
        source: "local",
        album: "Shared track"
      };
      store.update({ allTracks: [...store.get().allTracks, track] });
    }
    if (track) {
      store.update({ page: "home" });
      render();
      toast(track.blob || track.file
        ? `Shared track: ${track.title}. Press play to start.`
        : `Shared track: ${track.title}. Add the audio file on this device to play it.`);
    }
  }
}

await initialize();
