import { MAX_SAVED_WALKS, validWalkingRoute, type WalkingRoute } from "./route";

export interface WalkStorage {
  read(key: string): Promise<unknown>;
  write(key: string, route: WalkingRoute): Promise<void>;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) { db?.close(); return; }
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => finish(null), 1500);
    try {
      const request = indexedDB.open("metto-walking", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("routes");
      request.onsuccess = () => finish(request.result);
      request.onerror = request.onblocked = () => finish(null);
    } catch { finish(null); }
  });
}

export const walkStorage: WalkStorage = {
  async read(key) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction("routes", "readonly");
        const request = tx.objectStore("routes").get(key);
        request.onsuccess = () => resolve(request.result?.route ?? null);
        request.onerror = () => resolve(null);
        tx.oncomplete = () => db.close();
        tx.onabort = tx.onerror = () => { db.close(); resolve(null); };
      } catch { db.close(); resolve(null); }
    });
  },
  async write(key, route) {
    const db = await openDb();
    if (!db) return;
    return new Promise<void>((resolve) => {
      try {
        const tx = db.transaction("routes", "readwrite");
        const store = tx.objectStore("routes");
        store.put({ key, route }, key);
        const all = store.getAll();
        all.onsuccess = () => {
          const entries = (all.result as { key: string; route: WalkingRoute }[])
            .filter((entry) => entry && typeof entry.key === "string" && validWalkingRoute(entry.route));
          entries.sort((a, b) => b.route.savedAt - a.route.savedAt);
          for (const old of entries.slice(MAX_SAVED_WALKS)) store.delete(old.key);
        };
        tx.oncomplete = tx.onabort = tx.onerror = () => { db.close(); resolve(); };
      } catch { db.close(); resolve(); }
    });
  },
};
