import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const GEN = join(REPO, "scripts", "generate-assetlinks.mjs");
const VAL = join(REPO, "scripts", "validate-assetlinks.mjs");

// Obviously synthetic fixtures (never production keys).
const FP1 = Array(32).fill("AB").join(":");
const FP2 = Array(32).fill("CD").join(":");

function run(nodeArgs: string[], opts?: { env?: NodeJS.ProcessEnv }): { status: number; out: string } {
  try {
    const out = execFileSync("node", nodeArgs, {
      encoding: "utf8",
      env: { ...process.env, ...opts?.env },
    });
    return { status: 0, out: String(out) };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: unknown; stderr?: unknown; message?: string };
    const out = [e.stdout, e.stderr].filter(Boolean).join("\n") || e.message || "";
    return { status: e.status ?? 1, out: String(out) };
  }
}

describe("generate-assetlinks.mjs", () => {
  it("emits the expected TWA structure for a single fingerprint", () => {
    const dir = mkdtempSync(join(tmpdir(), "metto-al-"));
    const dest = join(dir, "assetlinks.json");
    const r = run([GEN, "--fingerprint", FP1, "--output", dest]);
    expect(r.status).toBe(0);
    const data = JSON.parse(readFileSync(dest, "utf8"));
    expect(data).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "ir.metto.app",
          sha256_cert_fingerprints: [FP1],
        },
      },
    ]);
  });

  it("supports multiple fingerprints (upload + Play signing)", () => {
    const dir = mkdtempSync(join(tmpdir(), "metto-al-"));
    const dest = join(dir, "assetlinks.json");
    const r = run([GEN, "--fingerprint", FP1, "--fingerprint", FP2, "--output", dest]);
    expect(r.status).toBe(0);
    const data = JSON.parse(readFileSync(dest, "utf8"));
    expect(data[0].target.sha256_cert_fingerprints).toEqual([FP1, FP2]);
  });

  it("rejects malformed fingerprints", () => {
    const dir = mkdtempSync(join(tmpdir(), "metto-al-"));
    const r = run([GEN, "--fingerprint", "NOT-A-FINGERPRINT", "--output", join(dir, "a.json")]);
    expect(r.status).not.toBe(0);
  });

  it("rejects placeholder fingerprints", () => {
    const dir = mkdtempSync(join(tmpdir(), "metto-al-"));
    const placeholder = Array(32).fill("00").join(":");
    const r = run([GEN, "--fingerprint", placeholder, "--output", join(dir, "a.json")]);
    expect(r.status).not.toBe(0);
  });
});

describe("validate-assetlinks.mjs", () => {
  it("accepts a valid multi-fingerprint file", () => {
    const dir = mkdtempSync(join(tmpdir(), "metto-al-"));
    const f = join(dir, "assetlinks.json");
    writeFileSync(
      f,
      JSON.stringify([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "ir.metto.app",
            sha256_cert_fingerprints: [FP1, FP2],
          },
        },
      ]),
    );
    expect(run([VAL, "--file", f]).status).toBe(0);
  });

  it("rejects a wrong package name", () => {
    const dir = mkdtempSync(join(tmpdir(), "metto-al-"));
    const f = join(dir, "assetlinks.json");
    writeFileSync(
      f,
      JSON.stringify([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "com.example.wrong",
            sha256_cert_fingerprints: [FP1],
          },
        },
      ]),
    );
    const r = run([VAL, "--file", f]);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/package_name/);
  });

  it("rejects a wrong relation", () => {
    const dir = mkdtempSync(join(tmpdir(), "metto-al-"));
    const f = join(dir, "assetlinks.json");
    writeFileSync(
      f,
      JSON.stringify([
        {
          relation: ["delegate_permission/common.not_this"],
          target: {
            namespace: "android_app",
            package_name: "ir.metto.app",
            sha256_cert_fingerprints: [FP1],
          },
        },
      ]),
    );
    const r = run([VAL, "--file", f]);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/relation/);
  });

  it("rejects a malformed fingerprint", () => {
    const dir = mkdtempSync(join(tmpdir(), "metto-al-"));
    const f = join(dir, "assetlinks.json");
    writeFileSync(
      f,
      JSON.stringify([
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "ir.metto.app",
            sha256_cert_fingerprints: ["ZZ:ZZ"],
          },
        },
      ]),
    );
    expect(run([VAL, "--file", f]).status).not.toBe(0);
  });

  it("treats an explicitly requested but missing file as a failure", () => {
    const r = run([VAL, "--file", join(tmpdir(), "metto-al-definitely-missing-12345.json")]);
    expect(r.status).not.toBe(0);
  });

  it("reports pending (not failure) when production Asset Links do not exist yet", () => {
    // Default-path run: exit 0 either way — PENDING before the real upload
    // key exists, OK afterwards. It must never fail merely for being absent.
    const r = run([VAL]);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/PENDING|OK/);
  });
});
