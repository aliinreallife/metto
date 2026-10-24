// Bundle the production estimator, rather than copying its formula into a benchmark.
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = await mkdtemp(join(tmpdir(), "metto-estimates-"));
try {
  const outfile = join(dir, "evaluate.cjs");
  await build({ entryPoints: ["scripts/evaluate-route-estimates.ts"], outfile, bundle: true,
    platform: "node", format: "cjs", logLevel: "warning" });
  await import(pathToFileURL(outfile).href);
} finally {
  await rm(dir, { recursive: true, force: true });
}
