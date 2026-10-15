// Structural contract for the final route teaser. Satori PNG bytes are not a
// stable snapshot target, so these tests pin useful copy, endpoint layout,
// duration/transfer wording, and the deliberate boundary around exact timing.
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
    originDisplay: "نمایشگاه شهر آفتاب",
    destDisplay: "اقدسیه",
    durationMinutes: 32,
    numTransfers: 1,
    numStops: 12,
  });

describe("final branded share card", () => {
  it("uses Metto identity, slogan, CTA, and route endpoints", () => {
    const all = texts(tree());
    for (const s of [
      "metto.ir",
      "مبدأ",
      "مقصد",
      "نمایشگاه",
      "شهر",
      "آفتاب",
      "اقدسیه",
      "تو",
      "مترو",
      "گم",
      "شدی؟",
      "ما",
      "هم",
      "شده",
      "بودیم",
      "جزئیات",
      "کامل",
      "مسیر",
      "در",
    ]) {
      expect(all).toContain(s);
    }
    expect(all.join(" ")).not.toContain("مسیریاب مترو تهران");
  });

  it("contains the natural two-line duration and transfer sentence", () => {
    const all = texts(tree());
    for (const s of [
      "مسیرت",
      "۳۲ دقیقه",
      "طول می‌کشه",
      "و",
      "یه تعویض",
      "خط داری.",
      "۱۲",
      "ایستگاه",
    ]) {
      expect(all).toContain(s);
    }
    expect(all.join(" ")).not.toContain("تعداد ایستگاه");
  });

  it("handles a direct route without awkward zero-transfer wording", () => {
    const all = texts(
      renderShareCard({
        originDisplay: "تجریش",
        destDisplay: "شهید بهشتی",
        durationMinutes: 18,
        numTransfers: 0,
        numStops: 5,
      }),
    );
    expect(all).toContain("بدون تعویض");
    expect(all).toContain("خط می‌ری.");
    expect(all.join(" ")).not.toContain("۰ تعویض");
  });

  it("uses the final design red", () => {
    const colors = backgrounds(tree());
    expect(colors.filter((c) => c === "#DC1830").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps exact timetable details and line instructions out of the teaser", () => {
    const all = texts(tree()).join(" ");
    for (const s of ["رسیدن تا", "حرکت در", "نقشه", "خط ۱", "خط ۲", "۱۳:۳۵"]) {
      expect(all).not.toContain(s);
    }
  });
});
