import { DAILY_MIXES, DEMO_TRACKS } from "../data.js";
import { escapeHtml, formatTime, trackKey } from "../utils.js";

function cover(track, large = false) {
  return track.image
    ? `<img class="cover-image${large ? " cover-image-large" : ""}" src="${escapeHtml(track.image)}" alt="" loading="lazy">`
    : `<span class="cover cover-${escapeHtml(track.color || "violet")}${large ? " cover-large" : ""}">${escapeHtml(track.icon || "♫")}</span>`;
}

function trackCard(track, index, state, dense = false) {
  const liked = state.likes.has(trackKey(track));
  const excluded = state.settings.excludedTracks.includes(trackKey(track));
  return `<div class="track-row${dense ? " track-row-dense" : ""}${state.currentTrack && trackKey(state.currentTrack) === trackKey(track) ? " is-playing" : ""}" role="group" aria-label="${escapeHtml(track.title)} by ${escapeHtml(track.artist)}">
    <span class="track-number">${index + 1}</span>${cover(track)}
    <button class="track-details track-play-button" data-action="play-track" data-track-id="${escapeHtml(trackKey(track))}" aria-label="Play ${escapeHtml(track.title)} by ${escapeHtml(track.artist)}"><strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · ${escapeHtml(track.album || "Local file")}</small></button>
    ${dense ? "" : `<span class="track-album">${escapeHtml(track.album || "Local file")}</span>`}
    <span class="track-duration">${formatTime(track.duration || 0)}</span>
    <button class="icon-button row-like${liked ? " is-liked" : ""}" data-action="favorite-track" data-track-id="${escapeHtml(trackKey(track))}" aria-label="${liked ? "Unlike" : "Like"} ${escapeHtml(track.title)}">${liked ? "♥" : "♡"}</button>
    <button class="icon-button row-exclude${excluded ? " is-excluded" : ""}" data-action="exclude-track" data-track-id="${escapeHtml(trackKey(track))}" aria-label="${excluded ? "Remove exclusion for" : "Exclude"} ${escapeHtml(track.title)}">${excluded ? "⊘" : "−"}</button>
  </div>`;
}

function sectionHeader(title, detail = "", action = "") {
  return `<div class="section-header"><div><h2>${escapeHtml(title)}</h2>${detail ? `<p>${escapeHtml(detail)}</p>` : ""}</div>${action}</div>`;
}

function playlistCard(title, subtitle, icon, color, action, extra = "") {
  return `<button class="playlist-card" data-action="${action}">
    <span class="cover cover-${color}">${icon}</span><span class="playlist-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>${extra || '<span class="card-arrow">›</span>'}
  </button>`;
}

function renderHome(state) {
  const featured = DEMO_TRACKS[0];
  const recent = state.history.slice(0, 6);
  return `<div class="greeting"><p class="eyebrow">${state.spotifyProfile ? `Good to see you, ${escapeHtml(state.spotifyProfile.display_name || "music fan")}` : "YOUR MUSIC, YOUR WAY"}</p><h1>Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}</h1></div>
    <div class="quick-grid">
      ${playlistCard("Liked Songs", `${state.likes.size} tracks saved`, "♥", "green", "open-liked")}
      ${playlistCard("Discover Weekly", "50 picks, shaped by your taste", "✦", "violet", "open-discover")}
      ${playlistCard("Daily Mixes", "30 genre & mood mixes", "◉", "blue", "open-mixes")}
      ${playlistCard("Local music", `${state.localTracks.length} files on this device`, "♫", "coral", "import-audio")}
    </div>
    ${sectionHeader("Hot for you", "A Sonora original, ready to play")}
    <button class="featured-pick" data-action="play-track" data-track-id="${featured.id}">
      <span class="featured-cover">${cover(featured, true)}</span>
      <span class="featured-copy"><small>SONORA SESSION</small><strong>${escapeHtml(featured.title)}</strong><span>${escapeHtml(featured.artist)} · Original instrumental</span></span>
      <span class="featured-play" aria-hidden="true">▶</span>
    </button>
    ${sectionHeader("Made for your mood", "Original demos, ready offline", `<button class="text-button" data-page="library">See all</button>`)}
    <div class="card-row">${DEMO_TRACKS.slice(0, 4).map((track) => `<button class="album-card" data-action="play-track" data-track-id="${track.id}">${cover(track, true)}<strong>${escapeHtml(track.title)}</strong><small>${escapeHtml(track.artist)} · original instrumental</small></button>`).join("")}</div>
    ${sectionHeader("Recently played", "Saved privately on this device")}
    ${recent.length
      ? `<div class="track-table">${recent.map((item, index) => trackCard(item.track, index, state, true)).join("")}</div>`
      : `<div class="empty-card"><span>◷</span><strong>Your listening starts here</strong><p>Play a demo or import music to build a private listening history.</p></div>`}
    <div class="disclaimer"><strong>Stream with permission.</strong> Sonora plays original demos and audio files you choose. Spotify metadata and playback require your own account and Spotify’s official tools.</div>`;
}

function renderLibrary(state) {
  const liked = state.page === "liked";
  const selectedPlaylist = liked ? null : state.spotifyPlaylists.find((item) => item.id === state.selectedPlaylistId);
  const tracks = !liked && state.selectedPlaylistId
    ? [...state.playlistTracks]
    : liked
      ? state.allTracks.filter((track) => state.likes.has(trackKey(track)))
      : [...state.allTracks];
  tracks.sort(state.sort === "title"
    ? (left, right) => left.title.localeCompare(right.title)
    : (left, right) => (right.addedAt || 0) - (left.addedAt || 0));
  const spotifyPlaylists = !liked && !state.selectedPlaylistId && state.spotifyPlaylists.length
    ? `<section class="spotify-playlists"><div class="section-header"><div><h2>Your Spotify playlists</h2><p>Official playlist metadata from your account</p></div></div><div class="playlist-grid">${state.spotifyPlaylists.map((playlist) => `<button class="spotify-playlist-card" data-action="open-playlist" data-playlist-id="${escapeHtml(playlist.id)}">${playlist.images?.[0]?.url ? `<img src="${escapeHtml(playlist.images[0].url)}" alt="" loading="lazy">` : `<span class="cover cover-green">♫</span>`}<span><strong>${escapeHtml(playlist.name)}</strong><small>${escapeHtml(playlist.owner?.display_name || "Spotify")} · ${playlist.tracks?.total || 0} tracks</small></span></button>`).join("")}</div></section>`
    : "";
  return `<p class="eyebrow">YOUR COLLECTION</p><h1>${liked ? "Liked Songs" : escapeHtml(selectedPlaylist?.name || "Your Library")}</h1>
    <div class="library-hero">
      <div class="liked-art">${selectedPlaylist?.images?.[0]?.url ? `<img src="${escapeHtml(selectedPlaylist.images[0].url)}" alt="">` : "♥"}</div><div class="library-hero-copy"><span>${selectedPlaylist ? "SPOTIFY PLAYLIST" : "PLAYLIST"}</span><h2>${liked ? "Liked Songs" : escapeHtml(selectedPlaylist?.name || "Your Library")}</h2><p>${tracks.length} ${tracks.length === 1 ? "track" : "tracks"}${selectedPlaylist ? " · From Spotify" : " · Saved on this device"}</p></div>
      <button class="play-button large-play" data-action="play-collection" aria-label="Play collection">▶</button>
    </div>
    <div class="library-toolbar">
      <button class="primary-button" data-action="import-audio">＋ Add local audio</button>
      ${selectedPlaylist ? `<button class="secondary-button" data-action="open-library">‹ All music</button><button class="secondary-button" data-action="share-playlist">↗ Share playlist</button>` : `<button class="secondary-button" data-page="liked">♥ Liked songs</button>`}
      <button class="secondary-button" data-action="sort-library">↕ ${state.sort === "title" ? "Title A–Z" : "Recently added"}</button>
      <span class="muted">${tracks.length} tracks</span>
    </div>
    ${spotifyPlaylists}
    ${tracks.length
      ? `<div class="track-table"><div class="track-table-header"><span>#</span><span></span><span>Title</span><span class="track-album">Album</span><span>Duration</span><span></span><span></span></div>${tracks.map((track, index) => trackCard(track, index, state)).join("")}</div>`
      : `<div class="empty-card"><span>♡</span><strong>${liked ? "Nothing liked just yet" : selectedPlaylist ? "No tracks available" : "Your library is ready"}</strong><p>${liked ? "Tap the heart beside a track to add it to this playlist." : selectedPlaylist ? "This playlist has no playable Spotify tracks." : "Import audio files to listen offline. Files stay in this browser."}</p><button class="primary-button" data-action="${liked || selectedPlaylist ? "open-library" : "import-audio"}">${liked || selectedPlaylist ? "Browse all music" : "Choose audio files"}</button></div>`}`;
}

function renderSearch(state) {
  const results = [...new Map([
    ...state.searchResults,
    ...state.allTracks.filter((track) =>
      `${track.title} ${track.artist} ${track.album || ""}`.toLowerCase().includes(state.query.toLowerCase()))
  ].map((track) => [trackKey(track), track])).values()];
  const entities = `${state.searchAlbums.length || state.searchArtists.length ? `<div class="search-entities">
      ${state.searchAlbums.length ? `<section><h2>Albums</h2><div class="entity-row">${state.searchAlbums.map((album) => `<button class="entity-card" data-action="open-album" data-id="${escapeHtml(album.id)}">${album.images?.[0]?.url ? `<img src="${escapeHtml(album.images[0].url)}" alt="">` : `<span class="cover cover-violet">▤</span>`}<strong>${escapeHtml(album.name)}</strong><small>${escapeHtml(album.artists?.map((artist) => artist.name).join(", "))}</small></button>`).join("")}</div></section>` : ""}
      ${state.searchArtists.length ? `<section><h2>Artists</h2><div class="entity-row">${state.searchArtists.map((artist) => `<button class="entity-card" data-action="open-artist" data-id="${escapeHtml(artist.id)}">${artist.images?.[0]?.url ? `<img class="artist-image" src="${escapeHtml(artist.images[0].url)}" alt="">` : `<span class="cover cover-blue">♫</span>`}<strong>${escapeHtml(artist.name)}</strong><small>${escapeHtml(artist.genres?.slice(0, 2).join(" · ") || "Spotify artist")}</small></button>`).join("")}</div></section>` : ""}
    </div>` : ""}`;
  return `<p class="eyebrow">FIND YOUR NEXT FAVORITE</p><h1>Search</h1>
    <label class="search-field"><span>⌕</span><input id="page-search" type="search" value="${escapeHtml(state.query)}" placeholder="Songs, artists, albums" autocomplete="off"></label>
    ${state.searching ? `<div class="empty-card"><span class="spinner"></span><p>Searching your library and Spotify…</p></div>` : ""}
    ${entities}
    ${state.query ? (results.length || state.searchAlbums.length || state.searchArtists.length)
      ? `<div class="track-table">${results.map((track, index) => trackCard(track, index, state, true)).join("")}</div>`
      : `<div class="empty-card"><strong>No matches</strong><p>Try a different title or artist.</p></div>`
      : `<div class="browse-tiles"><button data-action="search-genre" data-query="genre:indie"><span class="tile-violet">Indie & alternative</span></button><button data-action="search-genre" data-query="genre:ambient"><span class="tile-blue">Focus & ambient</span></button><button data-action="search-genre" data-query="genre:jazz"><span class="tile-coral">Jazz & soul</span></button><button data-action="search-genre" data-query="genre:electronic"><span class="tile-green">Electronic</span></button></div><p class="muted">Connect Spotify for official catalog search. Search results are metadata; Spotify playback requires Premium.</p>`}`;
}

function renderDiscover(state) {
  return `<div class="feature-hero discover-hero">
    <div class="feature-art">✦</div><div><p class="eyebrow">YOUR WEEKLY DISCOVERY</p><h1>Discover Weekly</h1><p>${state.discoverTracks.length ? `${state.discoverTracks.length} track picks based on your chosen genres and liked artists.` : "A 50-track mix, shaped by your listening and taste settings."}</p></div>
  </div>
  <div class="feature-actions"><button class="play-button large-play" data-action="play-discover" aria-label="Play Discover Weekly">▶</button><button class="secondary-button" data-action="refresh-discover">↻ Refresh picks</button><button class="secondary-button" data-action="share-discover">↗ Share playlist</button><span class="muted">${state.discoverTracks.length}/50 loaded</span></div>
  ${state.discoverTracks.length
    ? `<div class="track-table"><div class="track-table-header"><span>#</span><span></span><span>Title</span><span class="track-album">Album</span><span>Duration</span><span></span><span></span></div>${state.discoverTracks.map((track, index) => trackCard(track, index, state)).join("")}</div>`
    : `<div class="empty-card"><span>✦</span><strong>Connect Spotify to discover</strong><p>Sonora searches Spotify’s official catalog for 50 unique tracks, ranks them against your liked tracks and selected genres, then applies your exclusions. Spotify playback requires Premium.</p><button class="primary-button" data-action="refresh-discover">Build my 50 tracks</button></div>`}`;
}

function renderMixes(state) {
  const active = DAILY_MIXES.find((mix) => mix.id === state.activeMix);
  return `${sectionHeader("Daily Mixes", "30 mixes for genres, moods and listening rituals", `<button class="secondary-button" data-action="refresh-mix">↻ Update mix</button>`)}
    <div class="mix-grid">${DAILY_MIXES.map((mix) => `<button class="mix-card${mix.id === state.activeMix ? " is-selected" : ""}" data-action="select-mix" data-mix="${mix.id}"><span class="mix-art cover-${mix.color}">${mix.icon}</span><strong>${escapeHtml(mix.name)}</strong><small>${escapeHtml(mix.vibe)} · updates from Spotify search</small></button>`).join("")}</div>
    ${active ? `${sectionHeader(`${active.name} · ${active.vibe}`, state.mixTracks.length ? `${state.mixTracks.length} Spotify search results` : "Connect Spotify to load this mix")}<div class="track-table">${state.mixTracks.map((track, index) => trackCard(track, index, state, true)).join("")}</div>` : ""}`;
}

function renderReels(state) {
  const tracks = state.reelTracks.length ? state.reelTracks : DEMO_TRACKS;
  return `<div class="reels-layout">
    <div class="reel-feed" id="reel-feed" aria-label="Vertical music discovery feed">${tracks.map((track, index) => `<article class="reel-stage reel-card" data-reel-index="${index}" data-track-id="${escapeHtml(trackKey(track))}" tabindex="0">
      <div class="reel-visualizer reel-${escapeHtml(track.color || "violet")}">${track.image ? `<img class="visualizer-art" src="${escapeHtml(track.image)}" alt="">` : ""}<span class="visualizer-orbit"></span><span class="visualizer-glyph">${escapeHtml(track.icon || "♫")}</span><span class="visualizer-bars"><i></i><i></i><i></i><i></i><i></i></span></div>
      <div class="reel-overlay"><p class="eyebrow">SONORA REELS · ${track.source === "spotify" ? "SPOTIFY PLAYER" : "LOCAL DEMO"}</p><h1>${escapeHtml(track.title)}</h1><p>${escapeHtml(track.artist)}</p><button class="play-button large-play" data-action="play-reel" data-index="${index}">▶ Listen</button></div>
      <div class="reel-controls"><button class="icon-button" data-action="reel-prev" aria-label="Previous reel">⌃</button><button class="icon-button" data-action="reel-next" aria-label="Next reel">⌄</button></div>
    </article>`).join("")}</div>
    <aside class="reels-info"><p class="eyebrow">DISCOVER</p><h2>One song at a time</h2><p>Scroll or swipe vertically to browse. Original Sonora clips play locally; Spotify tracks open in Spotify’s licensed Web Playback SDK.</p><button class="secondary-button" data-action="refresh-discover">Find more music</button></aside>
  </div>`;
}

function renderActivity(state) {
  return `<p class="eyebrow">YOUR LISTENING</p><h1>Listening activity</h1>
    ${state.history.length
      ? `<div class="track-table">${state.history.map((item, index) => `<div class="history-row">${cover(item.track)}<span class="track-details"><strong>${escapeHtml(item.track.title)}</strong><small>${escapeHtml(item.track.artist)} · ${new Date(item.playedAt).toLocaleString()}</small></span></div>`).join("")}</div>`
      : `<div class="empty-card"><span>◷</span><strong>History is private</strong><p>Your recent listening appears here and stays on this device. Enable taste-profile exclusions in Settings for tracks you don't want used in future recommendations.</p></div>`}
    <div class="privacy-card"><strong>Friend activity &amp; sync</strong><p>Live sharing with friends needs a server and consent-based accounts. Sonora currently syncs local tabs and can control Spotify devices through your official account.</p><button class="secondary-button" data-action="device-picker">See connected tabs</button></div>`;
}

function renderSettings(state) {
  return `<p class="eyebrow">MAKE IT YOURS</p><h1>Settings</h1>
    <section class="settings-section"><h2>Spotify Web API</h2><p>Use your own Spotify developer application. Sonora uses PKCE and official Spotify endpoints. No client secret is needed or accepted in this browser app.</p>
      <label class="setting-field">Client ID<input id="spotify-client-id" type="text" value="${escapeHtml(state.clientId)}" placeholder="Your Spotify application client ID" autocomplete="off"></label>
      <div class="settings-actions"><button class="primary-button" data-action="save-client-id">Save client ID</button><button class="secondary-button" data-action="spotify-connect">${state.spotifyConnected ? "Reconnect Spotify" : "Connect Spotify"}</button><button class="secondary-button" data-action="spotify-disconnect">Disconnect</button></div>
      <p class="setting-hint">Add this page's exact origin and path to your app's Spotify Redirect URIs. The Spotify Web Playback SDK requires Premium. Metadata/API quotas depend on Spotify policy.</p>
    </section>
    <section class="settings-section"><h2>Local audio &amp; offline</h2><p>Choose audio files to keep in this browser's private IndexedDB. FLAC playback depends on browser codec support. No file is uploaded.</p>
      <div class="settings-actions"><button class="primary-button" data-action="import-audio">＋ Import audio files</button><button class="secondary-button" data-action="import-lyrics">Import timed .lrc lyrics</button><button class="secondary-button" data-action="storage-usage">Check storage</button></div>
      <label class="setting-row"><span><strong>Crossfade</strong><small>Fade between local audio files.</small></span><input type="checkbox" data-setting="crossfade" ${state.settings.crossfade ? "checked" : ""}></label>
      <label class="setting-row"><span><strong>Crossfade length</strong><small>Spotify playback follows Spotify's own settings.</small></span><input type="range" min="0" max="8" value="${state.settings.crossfadeSeconds}" data-setting="crossfadeSeconds"></label>
      <div class="setting-row"><span><strong>Audio quality</strong><small>Local files play at their original encoding. Change Spotify stream quality in Spotify; Sonora cannot override it.</small></span><span class="quality-badge">Original file</span></div>
    </section>
    <section class="settings-section"><h2>Taste profile exclusions</h2><p>Exclude a specific local or Spotify track, or add genres such as sleep sounds. Excluded items are skipped by the discovery picker and don't add new history.</p>
      <label class="setting-field">Preferred genres<input id="preferred-genres" type="text" value="${escapeHtml(state.settings.preferredGenres.join(", "))}" placeholder="indie, ambient, jazz"></label>
      <button class="secondary-button" data-action="save-preferences">Save preferred genres</button>
      <label class="setting-field">Genres to exclude<input id="excluded-genres" type="text" value="${escapeHtml(state.settings.excludedGenres.join(", "))}" placeholder="sleep, meditation"></label>
      <button class="secondary-button" data-action="save-exclusions">Save excluded genres</button>
      <div class="exclusion-list">${state.settings.excludedTracks.map((id) => {
        const track = state.allTracks.find((candidate) => trackKey(candidate) === id);
        return `<div><span>${escapeHtml(track?.title || id)}</span><button class="text-button" data-action="remove-exclusion" data-track-id="${escapeHtml(id)}">Remove</button></div>`;
      }).join("")}</div>
    </section>
    <section class="settings-section"><h2>App &amp; offline access</h2><p>The app shell and original demos are cached for offline use. Your imported files and .lrc lyrics remain on this device.</p><button class="secondary-button" data-action="install-app">Install Sonora</button></section>`;
}

export function renderPage(state) {
  switch (state.page) {
    case "library":
    case "liked": return renderLibrary(state);
    case "search": return renderSearch(state);
    case "discover": return renderDiscover(state);
    case "mixes": return renderMixes(state);
    case "reels": return renderReels(state);
    case "activity": return renderActivity(state);
    case "settings": return renderSettings(state);
    default: return renderHome(state);
  }
}

export function renderActivityRail(history) {
  const feed = document.querySelector("#activity-feed");
  feed.innerHTML = history.slice(0, 5).map((item) => `<div class="activity-item">${cover(item.track)}<span><strong>You played ${escapeHtml(item.track.title)}</strong><small>${escapeHtml(item.track.artist)} · ${new Date(item.playedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span></div>`).join("")
    || `<p class="rail-note">Your recent tracks will show here.</p>`;
}

export function renderDevices(peers, spotifyReady) {
  const list = document.querySelector("#device-list");
  const entries = peers.map((peer) => `<div class="device-item"><span class="device-glyph">▣</span><span><strong>${escapeHtml(peer.label)}</strong><small>${escapeHtml(peer.track?.title || "Ready")}</small></span><span class="device-state"></span></div>`);
  if (spotifyReady) entries.unshift(`<div class="device-item"><span class="device-glyph">●</span><span><strong>Spotify Web Player</strong><small>Official account device</small></span><span class="device-state"></span></div>`);
  list.innerHTML = entries.join("") || `<p class="rail-note">No other Sonora tabs connected.</p>`;
}

export { DEMO_TRACKS, DAILY_MIXES };
