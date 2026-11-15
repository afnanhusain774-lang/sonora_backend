import { formatTime } from "../utils.js";

export class AudioEngine extends EventTarget {
  constructor(first, second) {
    super();
    this.players = [first, second];
    this.active = 0;
    this.crossfadeSeconds = 1.5;
    this.crossfadeEnabled = true;
    this.volume = 0.8;
    this.track = null;
    this.fading = false;
    this.crossfadeTriggered = false;
    this.fadeFrame = 0;
    this.players.forEach((audio, index) => {
      audio.volume = index === this.active ? this.volume : 0;
      audio.addEventListener("timeupdate", () => {
        if (index !== this.active) return;
        const duration = Number.isFinite(audio.duration) ? audio.duration : (this.track?.duration || 0);
        this.emit("time", { time: audio.currentTime, duration });
        if (this.crossfadeEnabled && !this.crossfadeTriggered && this.track?.source !== "spotify"
          && duration > this.crossfadeSeconds && duration - audio.currentTime <= this.crossfadeSeconds + 0.75) {
          this.crossfadeTriggered = true;
          this.emit("crossfade");
        }
      });
      audio.addEventListener("ended", () => {
        if (index === this.active) this.emit("ended");
      });
      audio.addEventListener("play", () => {
        if (index === this.active) this.emit("play");
      });
      audio.addEventListener("pause", () => {
        if (index === this.active) this.emit("pause");
      });
      audio.addEventListener("error", () => {
        if (index === this.active) this.emit("error", {
          message: "This audio file could not be decoded by this browser."
        });
      });
    });
  }

  get audio() {
    return this.players[this.active];
  }

  get isPlaying() {
    return !this.audio.paused;
  }

  get currentTime() {
    return this.audio.currentTime || 0;
  }

  async play(track, source) {
    if (!source) throw new Error("This track has no licensed local audio source.");
    const old = this.audio;
    const nextIndex = 1 - this.active;
    const next = this.players[nextIndex];
    this.cancelFade();
    next.pause();
    next.src = source;
    next.currentTime = 0;
    next.volume = 0;
    next.load();
    this.track = track;
    this.crossfadeTriggered = false;
    this.active = nextIndex;
    try {
      await next.play();
    } catch (error) {
      this.active = 1 - nextIndex;
      next.pause();
      next.removeAttribute("src");
      next.load();
      throw error;
    }
    this.emit("track", track);
    if (this.crossfadeEnabled && old.src && !old.paused && this.crossfadeSeconds > 0) {
      this.fade(old, next, this.crossfadeSeconds);
    } else {
      old.pause();
      old.currentTime = 0;
      next.volume = this.volume;
    }
    return track;
  }

  async playAgain() {
    if (!this.track) throw new Error("Choose a local track first.");
    this.audio.currentTime = 0;
    await this.audio.play();
  }

  toggle() {
    if (this.audio.paused) return this.audio.play();
    this.audio.pause();
    return Promise.resolve();
  }

  pause() {
    this.audio.pause();
  }

  seek(fraction) {
    if (!Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.min(1, Math.max(0, fraction)) * this.audio.duration;
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, value));
    if (!this.fading) this.audio.volume = this.volume;
    this.emit("volume", this.volume);
  }

  setCrossfade(enabled, seconds = this.crossfadeSeconds) {
    this.crossfadeEnabled = enabled;
    this.crossfadeSeconds = Math.max(0, Math.min(8, Number(seconds) || 0));
  }

  fadeOut() {
    const audio = this.audio;
    if (audio.paused) return;
    this.fade(audio, null, 0.75);
  }

  fade(from, to, seconds) {
    this.cancelFade();
    this.fading = true;
    const started = performance.now();
    const fromVolume = from.volume;
    const step = (now) => {
      const progress = Math.min(1, (now - started) / (seconds * 1000));
      const eased = progress * progress * (3 - 2 * progress);
      from.volume = Math.max(0, fromVolume * (1 - eased));
      if (to) to.volume = Math.min(this.volume, this.volume * eased);
      if (progress < 1) {
        this.fadeFrame = requestAnimationFrame(step);
        return;
      }
      from.pause();
      from.currentTime = 0;
      from.volume = 0;
      if (to) to.volume = this.volume;
      this.fading = false;
      this.fadeFrame = 0;
    };
    this.fadeFrame = requestAnimationFrame(step);
  }

  cancelFade() {
    if (this.fadeFrame) cancelAnimationFrame(this.fadeFrame);
    this.fadeFrame = 0;
    this.fading = false;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  snapshot() {
    return {
      track: this.track,
      playing: this.isPlaying,
      time: this.currentTime,
      duration: this.audio.duration || this.track?.duration || 0,
      timeLabel: formatTime(this.currentTime)
    };
  }
}
