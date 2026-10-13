// Structural contract for the branded route teaser. Satori PNG bytes are not a
// stable snapshot target, so these tests pin the useful copy, icon presence,
// route facts, and the deliberate boundary around full journey details.
import { describe, expect, it } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { renderShareCard } from "./card";

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

function resolve(node: ReactNode): ReactNode {
  const el = asEl(node);
  if (el && typeof el.type === "function") {
    return resolve((el.type as (props: ElProps) => ReactNode)(el.props));
  }
  return node;
}

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

function types(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n) => types(n, out));
    return out;
  }
  node = resolve(node);
  if (Array.isArray(node)) {
    node.forEach((n) => types(n, out));
    return out;
  }
  const el = asEl(node);
  if (!el) return out;
  if (typeof el.type === "string") out.push(el.type);
  types(el.props.children, out);
  return out;
}

function backgrounds(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n) => backgrounds(n, out));
    return out;
  }
  node = resolve(node);
  if (Array.isArray(node)) {
    node.forEach((n) => backgrounds(n, out));
    return out;
  }
  const el = asEl(node);
  if (!el) return out;
  if (typeof el.props.style?.background === "string") {
    out.push(el.props.style.background);
  }
  backgrounds(el.props.children, out);
  return out;
}

const tree = () =>
  renderShareCard({
    originDisplay: "تجریش",
    destDisplay: "تئاتر شهر",
    numStops: 14,
    numTransfers: 1,
  });

describe("branded share card", () => {
  it("uses the real Metto identity, slogan, and route endpoints", () => {
    const all = texts(tree());
    for (const s of [
      "متو",
      "تو مترو گم شدی؟ ما هم شده بودیم",
      "metto.ir",
      "از",
      "تجریش",
      "به",
      "تئاتر",
      "شهر",
    ]) {
      expect(all).toContain(s);
    }
    expect(types(tree())).toContain("svg");
    expect(all).not.toContain("مسیریاب مترو تهران");
  });

  it("shows useful teaser facts and points to the full journey", () => {
    const all = texts(tree()).join(" ");
    expect(all).toContain("۱۴ ایستگاه");
    expect(all).toContain("۱ تعویض خط");
    expect(all).toContain("زمان‌بندی و جزئیات کامل داخل متو");
  });

  it("handles a direct route without an awkward zero-transfer chip", () => {
    const all = texts(
      renderShareCard({
        originDisplay: "تجریش",
        destDisplay: "شهید بهشتی",
        numStops: 7,
        numTransfers: 0,
      }),
    ).join(" ");
    expect(all).toContain("بدون تعویض خط");
    expect(all).not.toContain("۰ تعویض خط");
  });

  it("uses the canonical Metto red", () => {
    const colors = backgrounds(tree());
    expect(colors.filter((c) => c === "#cc0e2d").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps exact timing, line instructions, and map detail out of the teaser", () => {
    const all = texts(tree()).join(" ");
    for (const s of [
      "رسیدن تا",
      "حرکت در",
      "دقیقه",
      "نقشه",
      "خط ۱",
      "خط ۲",
      "۱۳:۳۵",
    ]) {
      expect(all).not.toContain(s);
    }
  });
});
