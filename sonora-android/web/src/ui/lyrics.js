import { escapeHtml } from "../utils.js";

export class LyricsView {
  constructor(root, onClose) {
    this.root = root;
    this.onClose = onClose;
    this.track = null;
    this.lines = [];
    this.active = -1;
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-action='close-lyrics']")) this.onClose();
    });
  }

  setTrack(track, lines = []) {
    this.track = track;
    this.lines = lines;
    this.active = -1;
    this.render();
  }

  render() {
    const track = this.track;
    this.root.innerHTML = `
      <header class="lyrics-top">
        <button class="icon-button" data-action="close-lyrics" aria-label="Close lyrics">⌄</button>
        <h2>LYRICS</h2>
        <span class="lyrics-top-spacer"></span>
      </header>
      <div class="lyrics-layout">
        <div class="lyrics-scroll" id="lyrics-lines" aria-live="polite">
          ${this.lines.length
            ? this.lines.map((line, index) => `<p class="lyric-line${index === this.active ? " is-active" : ""}" data-line="${index}">${escapeHtml(line.text)}</p>`).join("")
            : `<p class="lyric-note">♪ &nbsp; ${track?.source === "local" ? "Original instrumental" : "Lyrics are not provided for this track"}</p>
               <p class="lyric-line is-active">${track?.source === "local" ? "No sung lyrics available" : "No synchronized lyrics available"}</p>
               <p class="lyric-status">${track?.source === "local" ? "This track is instrumental and contains no vocals or lyrics." : "Import a timed .lrc file for local playback, or enjoy the track in Spotify."}</p>`}
        </div>
        <aside class="lyrics-sidebar" aria-label="Track details">
          ${track?.image
            ? `<img class="lyrics-cover-image" src="${escapeHtml(track.image)}" alt="">`
            : `<span class="cover cover-${escapeHtml(track?.color || "violet")}">${escapeHtml(track?.icon || "♫")}</span>`}
          <span class="lyrics-sidebar-copy"><b>${escapeHtml(track?.title || "Choose a track")}</b><span>${escapeHtml(track?.artist || "Sonora")}</span></span>
          <span class="lyrics-credit"><span>Source</span><strong>${track?.source === "spotify" ? "Spotify · stream in Spotify" : "Local audio · stays on device"}</strong></span>
        </aside>
      </div>`;
  }

  updateTime(seconds) {
    if (!this.lines.length) return;
    let active = -1;
    for (let index = 0; index < this.lines.length; index++) {
      if (this.lines[index].time <= seconds) active = index;
      else break;
    }
    if (active < 0 || active === this.active) return;
    this.active = active;
    const container = this.root.querySelector("#lyrics-lines");
    container?.querySelector(".is-active")?.classList.remove("is-active");
    const current = container?.querySelector(`[data-line="${active}"]`);
    current?.classList.add("is-active");
    current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}
