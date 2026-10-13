// Structural contract for the minimal share card. Satori PNG bytes are not a
// stable snapshot target, so these tests pin the useful copy and intentionally
// small visual vocabulary instead.
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

const tree = () => renderShareCard("تجریش", "تئاتر شهر");

describe("minimal share card", () => {
  it("shows Metto identity and the route endpoints in order", () => {
    const all = texts(tree());
    for (const s of [
      "متو",
      "مسیریاب مترو تهران",
      "metto.ir",
      "از",
      "تجریش",
      "به",
      "تئاتر",
      "شهر",
    ]) {
      expect(all).toContain(s);
    }
    expect(all.indexOf("از")).toBeLessThan(all.indexOf("تجریش"));
    expect(all.indexOf("تجریش")).toBeLessThan(all.indexOf("به"));
    expect(all.indexOf("به")).toBeLessThan(all.indexOf("تئاتر"));
  });

  it("uses the app red as the only strong accent", () => {
    const colors = backgrounds(tree());
    expect(colors.filter((c) => c === "#be1228").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps route-map and timetable detail out of the teaser", () => {
    const all = texts(tree()).join(" ");
    for (const s of [
      "ایستگاه",
      "تعویض",
      "رسیدن",
      "حرکت",
      "دقیقه",
      "نقشه",
      "خط ۱",
      "خط ۲",
    ]) {
      expect(all).not.toContain(s);
    }
  });
});
