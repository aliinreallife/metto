import {
  createConnectivityMachine,
  type ConnectivityMachine,
  type ConnectivitySnapshot,
} from "./connectivity-machine";

export type {
  ConnectivitySnapshot,
  ConnectivityState,
} from "./connectivity-machine";

async function fetchConnectivity(signal: AbortSignal): Promise<boolean> {
  const res = await fetch("/api/connectivity", {
    cache: "no-store",
    signal,
  });
  return res.status === 204;
}

const SERVER_SNAPSHOT: ConnectivitySnapshot = {
  state: "checking",
  navigatorOnline: true,
  reachabilityVerified: false,
};

// Module-level singleton: exactly one machine, one listener set, one
// in-flight probe and one retry timer per page, no matter how many
// components subscribe. Created lazily on first client use so server
// rendering never touches browser globals.
let machine: ConnectivityMachine | null = null;
let machineSnapshot: ConnectivitySnapshot = SERVER_SNAPSHOT;
const machineListeners = new Set<() => void>();

function readLink(): boolean {
  try {
    return typeof navigator === "undefined"
      ? true
      : navigator.onLine !== false;
  } catch {
    return true;
  }
}

function readVisible(): boolean {
  try {
    return typeof document === "undefined" ? true : !document.hidden;
  } catch {
    return true;
  }
}

export function ensureConnectivityStore(): ConnectivityMachine {
  if (machine) return machine;
  const created = createConnectivityMachine({
    getNavigatorOnline: readLink,
    isDocumentVisible: readVisible,
    probe: fetchConnectivity,
    onChange: (snapshot) => {
      machineSnapshot = snapshot;
      machineListeners.forEach((listener) => {
        try {
          listener();
        } catch {
          // A broken listener must not break the others.
        }
      });
    },
  });
  machine = created;
  if (typeof window !== "undefined") {
    const onOnline = () => created.handleOnlineEvent();
    const onOffline = () => created.handleOfflineEvent();
    const onShow = () => created.handleResync();
    const onVisibility = () => {
      try {
        if (!document.hidden) created.handleResync();
      } catch {
        // Ignore.
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisibility);
    // Listeners live for the page lifetime by design (single set); the
    // machine itself is never disposed — it IS the page's connectivity.
    created.handleMount();
  }
  return created;
}

export function subscribeConnectivity(listener: () => void): () => void {
  ensureConnectivityStore();
  machineListeners.add(listener);
  return () => {
    machineListeners.delete(listener);
  };
}

export function getConnectivitySnapshot(): ConnectivitySnapshot {
  ensureConnectivityStore();
  return machineSnapshot;
}

export function getServerConnectivitySnapshot(): ConnectivitySnapshot {
  return SERVER_SNAPSHOT;
}

/** Test-only: drop the singleton so tests start isolated. */
export function __resetConnectivityStoreForTests(): void {
  try {
    machine?.dispose();
  } catch {
    // Ignore.
  }
  machine = null;
  machineSnapshot = SERVER_SNAPSHOT;
  machineListeners.clear();
}
