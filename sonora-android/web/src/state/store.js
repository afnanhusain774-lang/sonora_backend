export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    get() { return state; },
    update(patch) {
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state);
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export class SessionHub {
  constructor(onChange, onRemoteAction) {
    this.id = crypto.randomUUID?.() || String(Math.random());
    this.peers = new Map();
    this.onChange = onChange;
    this.onRemoteAction = onRemoteAction;
    this.channel = "BroadcastChannel" in window
      ? new BroadcastChannel("sonora-session")
      : null;
    if (this.channel) {
      this.channel.addEventListener("message", ({ data }) => this.receive(data));
      this.timer = window.setInterval(() => this.announce(), 2500);
      window.addEventListener("beforeunload", () => {
        this.send({ type: "leave", id: this.id });
        window.clearInterval(this.timer);
      }, { once: true });
      this.announce();
    }
  }
  send(message) {
    this.channel?.postMessage({ ...message, sender: this.id, sentAt: Date.now() });
  }
  announce(track = null) {
    this.send({ type: "presence", id: this.id, label: "This browser tab", track });
  }
  receive(message) {
    if (!message || message.sender === this.id || typeof message.type !== "string") return;
    if (message.type === "leave") this.peers.delete(message.id);
    if (message.type === "presence" && message.id) {
      this.peers.set(message.id, {
        id: message.id,
        label: message.label || "Sonora tab",
        track: message.track || null,
        lastSeen: message.sentAt || Date.now()
      });
    }
    if (message.type === "remote-action") this.onRemoteAction?.(message.action);
    this.onChange?.([...this.peers.values()]);
  }
  requestControl(action) {
    this.send({ type: "remote-action", action });
  }
  list() {
    const cutoff = Date.now() - 8000;
    for (const [id, peer] of this.peers) {
      if (peer.lastSeen < cutoff) this.peers.delete(id);
    }
    return [...this.peers.values()];
  }
}
