import type { ReactNode } from "react";

// Standalone landing layout: no app header or bottom tab bar — the page
// brings its own header, footer and mobile CTA (including its <main>).
export default function LandingLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
