#!/usr/bin/env node
// Retained as an explicit failure for old contributor commands. The legacy
// generator must never overwrite the pinned-data runtime export.
console.error("generate:stations is retired. Update network facts in metto-data, then run pnpm metro-data:import --source-dir ../metto-data --revision <reviewed-40-character-SHA>.");
process.exitCode = 1;
