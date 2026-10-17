import { describe, expect, it } from "vitest";
import { resolveInstallHeaderAction } from "./install-nav-button";

describe("resolveInstallHeaderAction", () => {
  it("routes non-iOS users to the landing install section", () => {
    expect(resolveInstallHeaderAction(false)).toBe("landing-install");
  });

  it("opens the iOS install guide for iPhone/iPad users", () => {
    expect(resolveInstallHeaderAction(true)).toBe("ios-guide");
  });
});
