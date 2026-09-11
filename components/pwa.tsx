"use client"

import { useEffect, useState } from "react"
import { Download, Share } from "lucide-react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export type InstallOutcome = "accepted" | "dismissed"

/**
 * One-shot consumption of a deferred beforeinstallprompt event.
 * Returns the user choice outcome, or null when there is no event or
 * prompt()/userChoice throws/rejects (e.g. consumed event, lost gesture).
 * Never throws — callers can clear state unconditionally.
 */
export async function triggerDeferredInstall(
  deferred: BeforeInstallPromptEvent | null | undefined,
): Promise<InstallOutcome | null> {
  if (!deferred) return null
  try {
    await deferred.prompt()
    const choice = await deferred.userChoice
    return choice?.outcome ?? null
  } catch {
    return null
  }
}

/**
 * Pure iOS/iPadOS detection for testability. iPadOS 13+ reports platform
 * "MacIntel" with touch points, so treat Mac + touch as iOS.
 */
export function isIosDevice(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0,
): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true
  if (/^mac/i.test(platform) && maxTouchPoints > 1) return true
  return false
}

/**
 * Show the manual iOS hint only when the Chromium deferred prompt is NOT
 * available, the app is not installed/standalone, and we are on iOS.
 */
export function shouldShowIosInstallHint(opts: {
  installed: boolean
  hasDeferredPrompt: boolean
  isIos: boolean
  isStandalone: boolean
}): boolean {
  return (
    !opts.installed &&
    !opts.hasDeferredPrompt &&
    opts.isIos &&
    !opts.isStandalone
  )
}

// --- TEMPORARY dev/manual-preview override (delete this block to remove) ---
// Lets a developer preview the iOS hint on desktop via:
//   sessionStorage.setItem("metto:force-ios-install-hint", "1"); location.reload()
// Off via removeItem + reload. Session-scoped, no UI, normal users unaffected.
export const IOS_INSTALL_HINT_PREVIEW_FLAG = "metto:force-ios-install-hint"

export function isIosInstallHintPreviewForced(
  storage: Pick<Storage, "getItem"> | undefined | null,
): boolean {
  try {
    return storage?.getItem(IOS_INSTALL_HINT_PREVIEW_FLAG) === "1"
  } catch {
    return false
  }
}

/**
 * TEMPORARY render precedence for the forced preview. True only when the
 * session flag is set and the app is not installed. It deliberately takes no
 * deferred event: the caller renders the iOS hint INSTEAD of the Chromium
 * button WITHOUT prompting, clearing, or otherwise touching the stored
 * event, so removing the flag + reload restores the real install UI.
 */
export function shouldForceIosHintPreview(opts: {
  installed: boolean
  previewForced: boolean
}): boolean {
  return !opts.installed && opts.previewForced
}
// --- end TEMPORARY override ---

export function InstallButton({
  label,
  iosHintLabel,
  iosHintSteps,
}: {
  label: string
  iosHintLabel?: string
  iosHintSteps?: string
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isIosStandaloneHint, setIsIosStandaloneHint] = useState(false)
  // TEMPORARY dev preview flag (see block above; delete with it).
  const [isHintPreviewForced, setIsHintPreviewForced] = useState(false)

  useEffect(() => {
    // Service-worker registration lives in app/layout.tsx (SerwistProvider,
    // early + updateViaCache:"none"). This button only handles install UX.
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    // iOS Safari never fires beforeinstallprompt — detect a non-standalone
    // iOS/iPadOS environment once on mount for the manual hint.
    let standalone = false
    try {
      const nav = window.navigator
      const ua = nav.userAgent ?? ""
      const platform = (nav as Navigator & { platform?: string }).platform ?? ""
      const maxTouchPoints = nav.maxTouchPoints ?? 0
      const isIos = isIosDevice(ua, platform, maxTouchPoints)
      standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (nav as Navigator & { standalone?: boolean }).standalone === true
      setIsIosStandaloneHint(isIos && !standalone)
    } catch {
      setIsIosStandaloneHint(false)
    }
    // TEMPORARY dev preview override (delete this block to remove): bypasses
    // only the isIosDevice() check. installed/standalone gating stays intact.
    // Render precedence is handled below: the flag makes the hint win for
    // preview only, without touching the deferred event itself.
    try {
      setIsHintPreviewForced(
        !standalone &&
          isIosInstallHintPreviewForced(window.sessionStorage),
      )
    } catch {
      setIsHintPreviewForced(false)
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (installed) return null

  // TEMPORARY preview rendering only (delete this branch to remove): when the
  // session flag is set, the iOS hint wins over a deferred Chromium prompt
  // for visual/manual preview. The deferred event is deliberately left
  // untouched — no prompt(), no clear — so removing the flag + reload
  // restores the real install UI. Normal precedence (Chromium button first)
  // is unchanged when the flag is absent.
  if (
    iosHintLabel &&
    iosHintSteps &&
    shouldForceIosHintPreview({
      installed,
      previewForced: isHintPreviewForced,
    })
  ) {
    return (
      <span
        role="note"
        title={iosHintSteps}
        aria-label={iosHintSteps}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-sm font-medium text-primary-foreground"
      >
        <Share className="size-4" />
        <span className="hidden sm:inline">{iosHintLabel}</span>
      </span>
    )
  }

  if (deferred) {
    return (
      <button
        type="button"
        onClick={async () => {
          // beforeinstallprompt is one-shot: clear before awaiting so a
          // double-click or a dismissed outcome cannot reuse the event.
          const d = deferred
          setDeferred(null)
          await triggerDeferredInstall(d)
        }}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">{label}</span>
      </button>
    )
  }

  // iOS/iPadOS Safari never fires beforeinstallprompt: show a small manual
  // hint instead. Never shown when the Chromium deferred prompt is available
  // (handled above) or when already installed/standalone.
  if (
    iosHintLabel &&
    iosHintSteps &&
    shouldShowIosInstallHint({
      installed,
      hasDeferredPrompt: false,
      // TEMPORARY preview override: forced flag bypasses only isIosDevice().
      isIos: isIosStandaloneHint || isHintPreviewForced,
      isStandalone: false,
    })
  ) {
    return (
      <span
        role="note"
        title={iosHintSteps}
        aria-label={iosHintSteps}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-sm font-medium text-primary-foreground"
      >
        <Share className="size-4" />
        <span className="hidden sm:inline">{iosHintLabel}</span>
      </span>
    )
  }

  return null
}
