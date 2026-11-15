export const DEMO_TRACKS = [
  { id: "demo-moonlit-drive", title: "Moonlit Drive", artist: "Mira Sol", album: "Sonora Demos", icon: "☾", color: "violet", file: "moonlit_drive.wav", genres: ["ambient", "chill"], duration: 24 },
  { id: "demo-small-hours", title: "Small Hours", artist: "The Paper Moons", album: "Sonora Demos", icon: "✳", color: "coral", file: "small_hours.wav", genres: ["indie", "dream pop"], duration: 24 },
  { id: "demo-blue-window", title: "Blue Window", artist: "Juniper Lane", album: "Sonora Demos", icon: "≈", color: "blue", file: "blue_window.wav", genres: ["ambient", "jazz"], duration: 24 },
  { id: "demo-sunday-light", title: "Sunday Light", artist: "Owen Vale", album: "Sonora Demos", icon: "☼", color: "gold", file: "sunday_light.wav", genres: ["indie", "folk"], duration: 24 },
  { id: "demo-quiet-bloom", title: "Quiet Bloom", artist: "Nia Rowan", album: "Sonora Demos", icon: "❋", color: "green", file: "quiet_bloom.wav", genres: ["ambient", "acoustic"], duration: 24 },
  { id: "demo-soft-landing", title: "Soft Landing", artist: "Cleo North", album: "Sonora Demos", icon: "✦", color: "rose", file: "soft_landing.wav", genres: ["indie", "chill"], duration: 24 }
].map((track) => ({ ...track, source: "local", uri: null }));

const mixVibes = [
  ["Pop", "pop"], ["Indie", "indie"], ["Chill", "chill"], ["Focus", "ambient"],
  ["Jazz", "jazz"], ["Acoustic", "acoustic"], ["Electronic", "electronic"], ["Rock", "rock"],
  ["R&B", "r-n-b"], ["Soul", "soul"], ["Classical", "classical"], ["Folk", "folk"],
  ["Dance", "dance"], ["Dream Pop", "dream pop"], ["Lo-fi", "lo-fi"], ["Piano", "piano"],
  ["Alternative", "alternative"], ["Hip-Hop", "hip-hop"], ["House", "house"], ["Latin", "latin"],
  ["Country", "country"], ["Ambient", "ambient"], ["Metal", "metal"], ["Reggae", "reggae"],
  ["World", "world"], ["Sleep", "sleep"], ["Upbeat", "upbeat"], ["Instrumental", "instrumental"],
  ["New Finds", "new indie"], ["Feel Good", "feel good"]
];

export const DAILY_MIXES = mixVibes.map(([name, query], index) => ({
  id: `daily-mix-${index + 1}`,
  name: `Daily Mix ${index + 1}`,
  vibe: name,
  query,
  color: DEMO_TRACKS[index % DEMO_TRACKS.length].color,
  icon: DEMO_TRACKS[index % DEMO_TRACKS.length].icon
}));

export const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-playback-state",
  "user-modify-playback-state",
  "streaming"
].join(" ");
