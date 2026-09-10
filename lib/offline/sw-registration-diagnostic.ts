// One-shot, console-only service-worker registration diagnostic.
// SerwistProvider owns registration; this probe never changes behavior:
// - `register()` with the same URL/scope is a no-op when registration
//   already succeeded, and REJECTS with the real error when it failed
//   (e.g. the SecurityError when /sw.js answers with a redirect, which the
//   SW spec forbids — the classic Vercel Deployment Protection symptom on
//   protected preview deployments).
// - A `redirect: "manual"` fetch of /sw.js distinguishes "redirected
//   script" from other failures without following the redirect.
// Runs once per session, online only, and logs ONLY on anomaly. Never UI.
let probed = false;

const PROBE_DELAY_MS = 8000;

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function probeRedirect(): Promise<"redirected" | "ok" | "unknown"> {
  try {
    const res = await fetch("/sw.js", { redirect: "manual" });
    // With redirect:"manual", a 301/302/307/308 surfaces as an
    // opaqueredirect response instead of being followed.
    if (res.type === "opaqueredirect") return "redirected";
    return res.ok ? "ok" : "unknown";
  } catch {
    return "unknown";
  }
}

async function runProbe(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    // Healthy (a worker already controls the page): stay silent — the
    // normal readiness transitions already cover this case.
    if (navigator.serviceWorker.controller) return;
    let registrationError: unknown = null;
    try {
      // Idempotent: resolves to the existing registration when the
      // provider already registered (e.g. still installing a large
      // precache — NOT a failure, stay silent below unless the script
      // itself is redirected).
      await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    } catch (err) {
      registrationError = err;
    }
    if (!registrationError && navigator.serviceWorker.controller) return;
    const redirect = await probeRedirect();
    // Report only on definitive signals: a thrown registration error, or a
    // redirected /sw.js. A resolving registration without a controller yet
    // (large precache still installing) is normal — stay silent.
    if (!registrationError && redirect !== "redirected") return;
    console.debug("[Metto Offline] service worker registration failed", {
      error:
        registrationError instanceof Error
          ? `${registrationError.name}: ${registrationError.message}`
          : registrationError,
      swScriptRedirected: redirect === "redirected" ? true : undefined,
      hint:
        redirect === "redirected"
          ? "GET /sw.js is behind a redirect (e.g. Vercel Deployment Protection on preview deployments). Service workers cannot register redirected scripts: disable preview protection for PWA testing or use an unprotected staging/custom domain."
          : "Check DevTools → Application → Service Workers and confirm /sw.js serves HTTP 200 with no redirect.",
    });
  } catch {
    // Diagnostics must never break the app.
  }
}

/** Schedule the one-shot probe (online only; deferred past first paint). */
export function scheduleRegistrationDiagnostic(): void {
  if (probed) return;
  probed = true;
  const schedule = () => window.setTimeout(() => void runProbe(), PROBE_DELAY_MS);
  if (isOnline()) {
    schedule();
    return;
  }
  const onOnline = () => {
    window.removeEventListener("online", onOnline);
    schedule();
  };
  window.addEventListener("online", onOnline);
}
