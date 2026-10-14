// Structural contract for the branded route teaser. Satori PNG bytes are not a
// stable snapshot target, so these tests pin useful copy, icon/skyline presence,
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
  it("uses Metto identity, slogan, skyline treatment, and route endpoints", () => {
    const all = texts(tree());
    for (const s of ["metto", "metto.ir", "مبدأ", "تجریش", "مقصد", "تئاتر", "شهر"]) {
      expect(all).toContain(s);
    }
    const copy = all.join(" ");
    expect(copy).toContain("تو مترو گم شدی؟ ما هم شده بودیم");
    expect(types(tree()).filter((type) => type === "svg").length).toBeGreaterThanOrEqual(4);
    expect(copy).not.toContain("مسیریاب مترو تهران");
  });

  it("shows useful teaser facts without a derived line count", () => {
    const all = texts(tree()).join(" ");
    expect(all).toContain("۱۴ ایستگاه");
    expect(all).toContain("۱ تعویض خط");
    expect(all).toContain("تغییر خط");
    expect(all).toContain("جزئیات کامل مسیر در");
    expect(all).not.toContain("۲ خط");
  });

  it("handles a direct route without an awkward zero-transfer stat", () => {
    const all = texts(
      renderShareCard({
        originDisplay: "تجریش",
        destDisplay: "شهید بهشتی",
        numStops: 7,
        numTransfers: 0,
      }),
    ).join(" ");
    expect(all).toContain("بدون تعویض");
    expect(all).toContain("تغییر خط");
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
