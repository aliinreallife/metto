// SPDX-License-Identifier: ODbL-1.0 — part of metto's ODbL-1.0 adapted metro database. See DATA_LICENSE.md.
import type { MetroLine } from "./types";

// Line metadata. Colors preserved from the legacy LINE_COLORS map.
export const LINES: MetroLine[] = [
  { id: 1, name: { fa: "خط ۱", en: "Line 1" }, color: "#E0001F" },
  { id: 2, name: { fa: "خط ۲", en: "Line 2" }, color: "#2F4389" },
  { id: 3, name: { fa: "خط ۳", en: "Line 3" }, color: "#67C5F5" },
  { id: 4, name: { fa: "خط ۴", en: "Line 4" }, color: "#F8E100" },
  { id: 5, name: { fa: "خط ۵", en: "Line 5" }, color: "#007E46" },
  { id: 6, name: { fa: "خط ۶", en: "Line 6" }, color: "#EF639F" },
  { id: 7, name: { fa: "خط ۷", en: "Line 7" }, color: "#7F0B74" },
];

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
