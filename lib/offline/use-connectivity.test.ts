import { describe, expect, it } from "vitest";
import { isPrecachedTabUrl, shouldInterceptOfflineNav } from "./use-connectivity";

describe("isPrecachedTabUrl", () => {
  it("matches the four precached static tabs", () => {
    expect(isPrecachedTabUrl("/")).toBe(true);
    expect(isPrecachedTabUrl("/stations")).toBe(true);
    expect(isPrecachedTabUrl("/nearby")).toBe(true);
    expect(isPrecachedTabUrl("/map")).toBe(true);
  });

  it("ignores query strings and hashes (route state is preserved)", () => {
    expect(isPrecachedTabUrl("/?from=ahang&to=aliabad")).toBe(true);
    expect(isPrecachedTabUrl("/map?from=ahang")).toBe(true);
    expect(isPrecachedTabUrl("/stations#list")).toBe(true);
  });

  it("rejects dynamic, API, and external URLs", () => {
    expect(isPrecachedTabUrl("/api/route")).toBe(false);
    expect(isPrecachedTabUrl("/stations/123")).toBe(false);
    expect(isPrecachedTabUrl("/map/extra/path")).toBe(false);
    expect(isPrecachedTabUrl("https://metto.ir/map")).toBe(false);
    expect(isPrecachedTabUrl("https://github.com/aliinreallife")).toBe(false);
    expect(isPrecachedTabUrl("")).toBe(false);
    expect(isPrecachedTabUrl("/MAP")).toBe(false);
  });
});

describe("shouldInterceptOfflineNav", () => {
  const plain = {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
  };

  it("allows an ordinary same-tab primary click", () => {
    expect(shouldInterceptOfflineNav(plain)).toBe(true);
    expect(shouldInterceptOfflineNav({ ...plain, target: "_self" })).toBe(true);
    expect(shouldInterceptOfflineNav({ ...plain, target: null })).toBe(true);
  });

  it("never intercepts modifier, middle-click, or new-tab navigation", () => {
    expect(shouldInterceptOfflineNav({ ...plain, button: 1 })).toBe(false);
    expect(shouldInterceptOfflineNav({ ...plain, button: 2 })).toBe(false);
    expect(
      shouldInterceptOfflineNav({ ...plain, ctrlKey: true }),
    ).toBe(false);
    expect(
      shouldInterceptOfflineNav({ ...plain, metaKey: true }),
    ).toBe(false);
    expect(
      shouldInterceptOfflineNav({ ...plain, shiftKey: true }),
    ).toBe(false);
    expect(shouldInterceptOfflineNav({ ...plain, altKey: true })).toBe(false);
    expect(
      shouldInterceptOfflineNav({ ...plain, target: "_blank" }),
    ).toBe(false);
  });
});
