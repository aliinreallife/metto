// Structural contract for the minimal share card (no pixels: Satori byte
// output is unstable, so this pins hierarchy + copy instead).
// Covers: از/به heading order, box-drawn DownArrow (no handmade LeftArrow),
// line chips in travel order, and teaser compliance (no stops/transfers/
// timing/strip/slogan anywhere in the tree).
import { describe, expect, it } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { renderShareCard } from "./card";
import type { ShareMapModel } from "./map";

function fakeMap(): ShareMapModel {
  return {
    edges: [],
    dots: [],
    pins: [],
    connectors: [],
    legs: [
      { line: 1, label: "۱ خط", color: "#E0001F", stops: 9 },
      { line: 3, label: "۳ خط", color: "#67C5F5", stops: 4 },
    ],
    numStops: 13,
    numTransfers: 1,
    interchangeIds: ["shahid-beheshti"],
    joints: [],
    dimJoints: [],
  };
}

interface ElProps {
  children?: ReactNode;
  style?: Record<string, unknown>;
}

function asEl(node: ReactNode): ReactElement<ElProps> | null {
  if (node && typeof node === "object" && "props" in node) {
    return node as ReactElement<ElProps>;
  }
  return null;
}

/** Expand a hookless function component (RtlRow/RtlWords/BrandRow and co.
//  are all pure output — safe to call directly for structural inspection). */
function resolve(node: ReactNode): ReactNode {
  const el = asEl(node);
  if (el && typeof el.type === "function") {
    return resolve((el.type as (props: ElProps) => ReactNode)(el.props));
  }
  return node;
}

/** All string leaves of an element tree, in render order. */
function texts(node: ReactNode, out: string[] = []): string[] {
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => texts(n, out));
    return out;
  }
  node = resolve(node);
  if (Array.isArray(node)) {
    node.forEach((n) => texts(n, out));
    return out;
  }
  const el = asEl(node);
  if (el) texts(el.props.children, out);
  return out;
}

/** True when any element in the tree is a function component called `name`. */
function usesComponent(node: ReactNode, name: string): boolean {
  if (Array.isArray(node)) return node.some((n) => usesComponent(n, name));
  const el = asEl(node);
  if (!el) return false;
  if (typeof el.type === "function" && el.type.name === name) return true;
  return usesComponent(el.props.children, name);
}

/** Backgrounds of 14px circle divs (line-legend dots), in render order. */
function legendColors(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n) => legendColors(n, out));
    return out;
  }
  node = resolve(node);
  if (Array.isArray(node)) {
    node.forEach((n) => legendColors(n, out));
    return out;
  }
  const el = asEl(node);
  if (!el) return out;
  const style = el.props.style;
  if (
    style?.width === "14px" &&
    style?.borderRadius === "50%" &&
    typeof style.background === "string"
  ) {
    out.push(style.background);
  }
  legendColors(el.props.children, out);
  return out;
}

const tree = () => renderShareCard("تجریش", "تئاتر شهر", fakeMap());

describe("minimal share card", () => {
  it("orders brand, از/origin, arrow, به/destination, line legend", () => {
    const all = texts(tree());
    for (const s of [
      "متو",
      "metto.ir",
      "از",
      "تجریش",
      "به",
      "تئاتر",
      "شهر",
      "۱ خط",
      "۳ خط",
    ]) {
      expect(all).toContain(s);
    }
    expect(all.indexOf("از")).toBeLessThan(all.indexOf("تجریش"));
    expect(all.indexOf("تجریش")).toBeLessThan(all.indexOf("به"));
    expect(all.indexOf("به")).toBeLessThan(all.indexOf("تئاتر"));
    expect(all.indexOf("تئاتر")).toBeLessThan(all.indexOf("۱ خط"));
  });

  it("draws a box-only direction arrow, never the handmade one", () => {
    expect(usesComponent(tree(), "DownArrow")).toBe(true);
    expect(usesComponent(tree(), "LeftArrow")).toBe(false);
  });

  it("shows leg-colored line dots in travel order", () => {
    expect(legendColors(tree())).toEqual(["#E0001F", "#67C5F5"]);
    const all = texts(tree());
    expect(all.indexOf("۱ خط")).toBeLessThan(all.indexOf("۳ خط"));
  });

  it("renders teaser-only copy (no meta/timing/strip/slogan)", () => {
    const all = texts(tree());
    for (const s of [
      "ایستگاه",
      "تعویض",
      "بدون",
      "رسیدن",
      "حرکت",
      "منتظر",
      "گیج",
      "نقشه",
      "مسیریابی",
    ]) {
      expect(all).not.toContain(s);
    }
  });
});
