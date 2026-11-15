export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function trackKey(track) {
  return track.uri || track.id;
}

export function normalizeSpotifyTrack(track) {
  return {
    id: track.id,
    uri: track.uri,
    source: "spotify",
    title: track.name,
    artist: track.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: track.album?.name || "Spotify",
    duration: Math.round((track.duration_ms || 0) / 1000),
    image: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || "",
    genres: [],
    previewUrl: track.preview_url || null
  };
}

export function makeId() {
  return globalThis.crypto?.randomUUID?.() || `sonora-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseLrc(text) {
  const lines = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const lyric = rawLine.replace(/(?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])+/g, "").trim();
    if (!lyric) continue;
    for (const match of matches) {
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, "0")}`) : 0;
      lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text: lyric });
    }
  }
  return lines.sort((left, right) => left.time - right.time);
}
