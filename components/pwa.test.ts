import { describe, expect, it, vi } from "vitest"
import {
  IOS_INSTALL_HINT_PREVIEW_FLAG,
  isIosDevice,
  isIosInstallHintPreviewForced,
  shouldForceIosHintPreview,
  shouldShowIosInstallHint,
  triggerDeferredInstall,
} from "./pwa"

function mockDeferred(outcome: "accepted" | "dismissed") {
  return {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  } as unknown as Exclude<
    Parameters<typeof triggerDeferredInstall>[0],
    null | undefined
  >
}

describe("triggerDeferredInstall", () => {
  it("calls prompt() once and returns the accepted outcome", async () => {
    const deferred = mockDeferred("accepted")
    await expect(triggerDeferredInstall(deferred)).resolves.toBe("accepted")
    expect(deferred.prompt).toHaveBeenCalledTimes(1)
  })

  it("returns the dismissed outcome so the caller can clear it too", async () => {
    const deferred = mockDeferred("dismissed")
    await expect(triggerDeferredInstall(deferred)).resolves.toBe("dismissed")
    expect(deferred.prompt).toHaveBeenCalledTimes(1)
  })

  it("returns null instead of throwing when prompt() rejects", async () => {
    const deferred = {
      prompt: vi.fn(async () => {
        throw new Error("InvalidStateError")
      }),
      userChoice: Promise.resolve({ outcome: "accepted" }),
    } as unknown as Exclude<
      Parameters<typeof triggerDeferredInstall>[0],
      null | undefined
    >
    await expect(triggerDeferredInstall(deferred)).resolves.toBeNull()
  })

  it("returns null instead of throwing when userChoice rejects", async () => {
    const deferred = {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.reject(new Error("no choice")),
    } as unknown as Exclude<
      Parameters<typeof triggerDeferredInstall>[0],
      null | undefined
    >
    await expect(triggerDeferredInstall(deferred)).resolves.toBeNull()
  })

  it("is a no-op returning null when no deferred prompt is available", async () => {
    await expect(triggerDeferredInstall(null)).resolves.toBeNull()
    await expect(triggerDeferredInstall(undefined)).resolves.toBeNull()
  })
})

describe("isIosDevice", () => {
  it("detects iPhone/iPad/iPod user agents", () => {
    expect(
      isIosDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        "iPhone",
        5,
      ),
    ).toBe(true)
    expect(
      isIosDevice(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
        "iPad",
        5,
      ),
    ).toBe(true)
  })

  it("detects iPadOS reporting as Mac with touch points", () => {
    expect(
      isIosDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
        "MacIntel",
        5,
      ),
    ).toBe(true)
  })

  it("does not flag desktop Chrome/Windows or Mac without touch", () => {
    expect(
      isIosDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
        "Win32",
        0,
      ),
    ).toBe(false)
    expect(
      isIosDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/120",
        "MacIntel",
        0,
      ),
    ).toBe(false)
    expect(isIosDevice("", "", 0)).toBe(false)
  })
})

describe("shouldShowIosInstallHint", () => {
  const base = {
    installed: false,
    hasDeferredPrompt: false,
    isIos: true,
    isStandalone: false,
  }

  it("shows the hint on non-standalone iOS with no deferred prompt", () => {
    expect(shouldShowIosInstallHint(base)).toBe(true)
  })

  it("hides when the Chromium prompt is available, installed, or standalone", () => {
    expect(
      shouldShowIosInstallHint({ ...base, hasDeferredPrompt: true }),
    ).toBe(false)
    expect(shouldShowIosInstallHint({ ...base, installed: true })).toBe(false)
    expect(shouldShowIosInstallHint({ ...base, isStandalone: true })).toBe(
      false,
    )
  })

  it("hides on non-iOS devices", () => {
    expect(shouldShowIosInstallHint({ ...base, isIos: false })).toBe(false)
  })

  it("forced desktop preview still flows through the same gating", () => {
    // The sessionStorage override bypasses only isIosDevice(): a forced
    // non-iOS desktop still shows via isIos=true, and installed/standalone
    // gating stays intact.
    expect(
      shouldShowIosInstallHint({ ...base, isIos: true }),
    ).toBe(true)
    expect(
      shouldShowIosInstallHint({ ...base, isIos: true, isStandalone: true }),
    ).toBe(false)
    expect(
      shouldShowIosInstallHint({ ...base, isIos: true, installed: true }),
    ).toBe(false)
  })
})

describe("isIosInstallHintPreviewForced (TEMPORARY dev override)", () => {
  it("reads the exact session flag value", () => {
    expect(
      isIosInstallHintPreviewForced({
        getItem: () => "1",
      }),
    ).toBe(true)
    expect(
      isIosInstallHintPreviewForced({
        getItem: () => null,
      }),
    ).toBe(false)
    expect(
      isIosInstallHintPreviewForced({
        getItem: () => "0",
      }),
    ).toBe(false)
  })

  it("uses the exact flag key and tolerates missing/throwing storage", () => {
    expect(IOS_INSTALL_HINT_PREVIEW_FLAG).toBe(
      "metto:force-ios-install-hint",
    )
    expect(isIosInstallHintPreviewForced(null)).toBe(false)
    expect(isIosInstallHintPreviewForced(undefined)).toBe(false)
    expect(
      isIosInstallHintPreviewForced({
        getItem: () => {
          throw new Error("denied")
        },
      }),
    ).toBe(false)
  })

  it("forced preview wins over a deferred Chromium prompt without touching it", () => {
    // The helper takes no deferred event by design: the caller renders the
    // hint branch first, leaving a stored beforeinstallprompt event alone
    // (no prompt(), no clear) so flag removal + reload restores the real UI.
    const deferred = mockDeferred("accepted")
    expect(
      shouldForceIosHintPreview({ installed: false, previewForced: true }),
    ).toBe(true)
    expect(deferred.prompt).not.toHaveBeenCalled()
  })

  it("never fires for normal users or when installed", () => {
    expect(
      shouldForceIosHintPreview({ installed: false, previewForced: false }),
    ).toBe(false)
    expect(
      shouldForceIosHintPreview({ installed: true, previewForced: true }),
    ).toBe(false)
  })
})
