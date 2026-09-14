// SHA-256 integrity verification for downloaded metro data.
//
// download → hash → compare → accept only if valid. Uses the browser Web
// Crypto API (no heavy dependency); falls back to node:crypto outside the
// browser (SSR/tests). Never throws: any failure resolves to null/false and
// callers keep the last-known-good dataset.

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function toHex(digest: ArrayBuffer): string {
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hex SHA-256 of UTF-8 text, or null when hashing is unavailable. */
export async function sha256Hex(text: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = await subtle.digest("SHA-256", toBytes(text));
      return toHex(digest);
    }
  } catch {
    // Fall through to the node fallback below.
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto") as typeof import("node:crypto");
    return nodeCrypto.createHash("sha256").update(toBytes(text)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * True only when `text` hashes to `expectedHex` (case-insensitive).
 * False when hashing is unavailable — fail closed, never accept blindly.
 */
export async function verifySha256(text: string, expectedHex: string): Promise<boolean> {
  if (!expectedHex || !/^[0-9a-fA-F]+$/.test(expectedHex)) return false;
  const actual = await sha256Hex(text);
  if (!actual) return false;
  if (actual.length !== expectedHex.length) return false;
  // Constant-time-ish comparison to avoid shortcutting on prefix matches.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHex.toLowerCase().charCodeAt(i);
  }
  return diff === 0;
}

/** UTF-8 byte size of text (manifest `size` comparison). */
export function utf8Size(text: string): number {
  return toBytes(text).length;
}
