const DB_NAME = "sonora-library";
const DB_VERSION = 1;
const STORES = ["files", "lyrics", "settings", "history"];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of STORES) {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the local music library."));
  });
}

async function request(storeName, mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const requestResult = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => {
      database.close();
      resolve(requestResult?.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error(`Could not update ${storeName}.`));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error(`The ${storeName} update was aborted.`));
    };
  });
}

export const localDatabase = {
  put(store, value) {
    return request(store, "readwrite", (objectStore) => objectStore.put(value));
  },
  get(store, id) {
    return request(store, "readonly", (objectStore) => objectStore.get(id));
  },
  all(store) {
    return request(store, "readonly", (objectStore) => objectStore.getAll());
  },
  remove(store, id) {
    return request(store, "readwrite", (objectStore) => objectStore.delete(id));
  },
  async saveSetting(key, value) {
    return this.put("settings", { id: key, value });
  },
  async readSetting(key, fallback) {
    return (await this.get("settings", key))?.value ?? fallback;
  },
  async saveHistory(track) {
    const history = await this.all("history");
    const entry = { id: `${Date.now()}-${Math.random()}`, track, playedAt: Date.now() };
    await this.put("history", entry);
    const excess = history.sort((a, b) => b.playedAt - a.playedAt).slice(99);
    await Promise.all(excess.map(({ id }) => this.remove("history", id)));
    return entry;
  }
};
