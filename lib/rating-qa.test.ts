import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RATING_QA_DEST,
  RATING_QA_ORIGIN,
  isRatingQaOverrideActive,
  noteRatingQaNavigation,
} from "./rating-qa";

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function setLocation(pathname: string, search = "") {
  vi.stubGlobal("window", {
    location: { pathname, search },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rating QA sequence", () => {
  it("arms only after the full tab sequence on the chosen route", () => {
    const s = memStorage();
    const query = `?from=${RATING_QA_ORIGIN}&to=${RATING_QA_DEST}`;

    setLocation("/route", query);
    noteRatingQaNavigation("/route", s);
    setLocation("/stations", query);
    noteRatingQaNavigation("/stations", s);
    setLocation("/nearby", query);
    noteRatingQaNavigation("/nearby", s);
    setLocation("/map", query);
    noteRatingQaNavigation("/map", s);

    expect(isRatingQaOverrideActive(s)).toBe(false);

    setLocation("/route", query);
    noteRatingQaNavigation("/route", s);
    expect(isRatingQaOverrideActive(s)).toBe(true);
  });

  it("does not activate for another route", () => {
    const s = memStorage();
    const query = "?from=tajrish&to=tehran-sadeghiyeh";

    for (const path of ["/route", "/stations", "/nearby", "/map", "/route"]) {
      setLocation(path, query);
      noteRatingQaNavigation(path, s);
    }

    setLocation("/route", query);
    expect(isRatingQaOverrideActive(s)).toBe(false);
  });

  it("resets when the page order is broken", () => {
    const s = memStorage();
    const query = `?from=${RATING_QA_ORIGIN}&to=${RATING_QA_DEST}`;

    setLocation("/route", query);
    noteRatingQaNavigation("/route", s);
    setLocation("/map", query);
    noteRatingQaNavigation("/map", s);
    setLocation("/route", query);
    noteRatingQaNavigation("/route", s);

    expect(isRatingQaOverrideActive(s)).toBe(false);
  });
});
