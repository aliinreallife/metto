// SPDX-License-Identifier: ODbL-1.0 — part of metto's ODbL-1.0 adapted metro database. See DATA_LICENSE.md.
import { importedLines } from "./from-metto-data";

export const LINES = importedLines;

/** Legacy color lookup (kept for incremental migration of UI code). */
export const LINE_COLORS: Record<number, string> = Object.fromEntries(
  LINES.map((l) => [l.id, l.color]),
);

// Lines whose background is too light for white text (WCAG AA 4.5:1).
// Measured: L3 white 1.9, L4 white 1.3, L6 white 3.0 — all fail; dark text passes.
const DARK_TEXT_LINES = new Set([3, 4, 6]);

/**
 * Readable text color for content drawn on a line-color background.
 * Brand colors stay untouched — only the foreground flips to near-black
 * on light lines (#43 contrast audit).
 */
export function lineOnColor(lineId: number): string {
  return DARK_TEXT_LINES.has(lineId) ? "#18181b" : "#ffffff";
}
