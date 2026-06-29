"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function InstallButton({ label }: { label: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Register the service worker.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }

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
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (installed || !deferred) return null

  return (
    <button
      type="button"
      onClick={async () => {
        await deferred.prompt()
        const choice = await deferred.userChoice
        if (choice.outcome === "accepted") setDeferred(null)
      }}
      className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
    >
      <Download className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
