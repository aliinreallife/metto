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
