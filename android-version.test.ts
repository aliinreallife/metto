import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "android-version.mjs");

function versionOf(tag: string): { status: number; out: string } {
  try {
    const out = execFileSync("node", [SCRIPT, tag], { encoding: "utf8" });
    return { status: 0, out: String(out) };
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: unknown; message?: string };
    return { status: e.status ?? 1, out: String(e.stderr ?? e.message ?? "") };
  }
}

function parse(out: string): Record<string, string> {
  return Object.fromEntries(
    out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

describe("android-version.mjs (tag -> versionName/versionCode)", () => {
  it.each([
    ["v0.0.1", "0.0.1", "1"],
    ["v0.1.0", "0.1.0", "1000"],
    ["v0.1.1", "0.1.1", "1001"],
    ["v0.2.0", "0.2.0", "2000"],
    ["v1.0.0", "1.0.0", "1000000"],
    ["v1.12.34", "1.12.34", "1012034"],
    ["v12.34.56", "12.34.56", "12034056"],
    ["v1.999.999", "1.999.999", "1999999"],
    ["v2099.999.999", "2099.999.999", "2099999999"],
    ["v2100.0.0", "2100.0.0", "2100000000"],
  ])("%s -> %s / %s", (tag, name, code) => {
    const r = versionOf(tag);
    expect(r.status).toBe(0);
    const kv = parse(r.out);
    expect(kv.versionName).toBe(name);
    expect(kv.versionCode).toBe(code);
  });

  it.each([
    ["v0.0.0"],
    ["v1"],
    ["v1.0"],
    ["1.0.0"],
    ["v1.0.0-beta"],
    ["v1.0.0foo"],
    ["v1.1000.0"],
    ["v1.0.1000"],
    ["v2100.0.1"],
    ["latest"],
  ])("rejects %s", (tag) => {
    expect(versionOf(tag).status).not.toBe(0);
  });
});
