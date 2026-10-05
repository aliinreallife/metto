import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = (props: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

/** metto mark — a front-on metro car. */
export function TrainIcon(props: P) {
  return (
    <svg {...base({ strokeWidth: 1.8, ...props })}>
      <rect x="4.5" y="3" width="15" height="12.5" rx="3" />
      <path d="M4.5 10.5h15" />
      <circle cx="8.6" cy="13.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="13.2" r="0.9" fill="currentColor" stroke="none" />
      <path d="M7 15.5 5.2 20.5M17 15.5l1.8 5M6.4 19h11.2" />
    </svg>
  );
}

export function RouteIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <path d="M8 18.5h5a3.5 3.5 0 0 0 0-7h-2a3.5 3.5 0 0 1 0-7h5" />
    </svg>
  );
}

export function SwapIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M7 4 4 7.5 7 11" />
      <path d="M4 7.5h13a3 3 0 0 1 3 3v1" />
      <path d="m17 20 3-3.5L17 13" />
      <path d="M20 16.5H7a3 3 0 0 1-3-3v-1" />
    </svg>
  );
}

export function ClockIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.4l3.4 2" />
    </svg>
  );
}

export function StationListIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18" />
      <circle cx="12" cy="7" r="2.2" fill="var(--background)" />
      <circle cx="12" cy="17" r="2.2" fill="var(--background)" />
      <path d="M16 7h5M16 12h4M16 17h5" />
    </svg>
  );
}

export function MapIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="m3 6.5 6-2.5 6 2.5 6-2.5v13L15 19.5 9 17l-6 2.5z" />
      <path d="M9 4v13M15 6.5v13" />
    </svg>
  );
}

export function PinIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

export function OfflineIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v9" />
      <path d="m8 8.5 4 3.8 4-3.8" />
      <path d="M4 14.5v3.2A2.3 2.3 0 0 0 6.3 20h11.4a2.3 2.3 0 0 0 2.3-2.3v-3.2" />
    </svg>
  );
}

export function SearchIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m15.8 15.8 4.2 4.2" />
    </svg>
  );
}

export function ArrowIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M4 12h15" />
      <path d="m13.5 6.5 6 5.5-6 5.5" />
    </svg>
  );
}

export function ChevronIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CopyIcon(props: P) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2.2" />
      <path d="M15 5.8A2.3 2.3 0 0 0 12.7 3.5H5.8A2.3 2.3 0 0 0 3.5 5.8v6.9A2.3 2.3 0 0 0 5.8 15" />
    </svg>
  );
}

export function CheckIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="m4.5 12.5 4.8 4.8L19.5 7" />
    </svg>
  );
}

export function ElevatorIcon(props: P) {
  return (
    <svg {...base(props)}>
      <rect x="4.5" y="3" width="15" height="18" rx="2" />
      <path d="M9.5 9 12 6.5 14.5 9M9.5 15l2.5 2.5 2.5-2.5" />
    </svg>
  );
}

export function RestroomIcon(props: P) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="4.6" r="1.8" />
      <path d="M8 7.6c-2 0-3.3 1.3-3.5 3.3l-.4 4.1h2l.2 5.4h3.4l.2-5.4h2l-.4-4.1c-.2-2-1.5-3.3-3.5-3.3Z" />
      <circle cx="17" cy="4.6" r="1.8" />
      <path d="m17 7.6-3 6.4h1.8l-.4 6.4h3.2l-.4-6.4h1.8Z" />
    </svg>
  );
}

export function AtmIcon(props: P) {
  return (
    <svg {...base(props)}>
      <rect x="2.8" y="5.2" width="18.4" height="13.6" rx="2.2" />
      <path d="M2.8 10h18.4M6.4 14.6h3.2" />
    </svg>
  );
}

export function WifiIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M2.6 9.2a13.5 13.5 0 0 1 18.8 0M5.9 12.8a8.8 8.8 0 0 1 12.2 0M9.2 16.4a4.1 4.1 0 0 1 5.6 0" />
      <circle cx="12" cy="19.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function HeartIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="M12 20s-7.2-4.6-9.3-9A5.3 5.3 0 0 1 12 6.6 5.3 5.3 0 0 1 21.3 11c-2.1 4.4-9.3 9-9.3 9Z" />
    </svg>
  );
}

export function StarIcon(props: P) {
  return (
    <svg {...base(props)}>
      <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8Z" />
    </svg>
  );
}

/** Direct download — an arrow landing in a tray. */
export function DownloadIcon(props: P) {
  return (
    <svg {...base({ strokeWidth: 1.7, ...props })}>
      <path d="M12 3.75v10.5" />
      <path d="m7.75 10 4.25 4.25L16.25 10" />
      <path d="M4.75 16.5v1.75a2 2 0 0 0 2 2h10.5a2 2 0 0 0 2-2V16.5" />
    </svg>
  );
}

/** Shopping bag — used for Myket. */
export function BagIcon(props: P) {
  return (
    <svg {...base({ strokeWidth: 1.7, ...props })}>
      <path d="M4.9 8.25h14.2l-1.05 11.2a2 2 0 0 1-2 1.8H7.95a2 2 0 0 1-2-1.8Z" />
      <path d="M9.25 10.5V6.9a2.75 2.75 0 0 1 5.5 0v3.6" />
    </svg>
  );
}

/** Storefront with an awning — used for Cafe Bazaar. */
export function StoreIcon(props: P) {
  return (
    <svg {...base({ strokeWidth: 1.7, ...props })}>
      <path d="M5 10.4v8.35a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10.4" />
      <path d="M3.2 7.4 4.6 4.1A1.6 1.6 0 0 1 6.1 3.1h11.8a1.6 1.6 0 0 1 1.5 1l1.4 3.3a2.6 2.6 0 0 1-4.6 2.3 2.6 2.6 0 0 1-4.2 0 2.6 2.6 0 0 1-4.2 0A2.6 2.6 0 0 1 3.2 7.4Z" />
    </svg>
  );
}

/** Play triangle — used for Google Play. */
export function PlayIcon(props: P) {
  return (
    <svg {...base({ strokeWidth: 1.7, ...props })}>
      <path d="M8 5.1a.9.9 0 0 1 1.36-.78l10.1 6.1a.9.9 0 0 1 0 1.54l-10.1 6.1A.9.9 0 0 1 8 17.3Z" />
    </svg>
  );
}

export function PhoneIcon(props: P) {
  return (
    <svg {...base(props)}>
      <rect x="6" y="2.4" width="12" height="19.2" rx="2.6" />
      <path d="M10.4 5.2h3.2" />
      <circle cx="12" cy="18.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GithubIcon(props: P) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 1.8a10.2 10.2 0 0 0-3.23 19.88c.51.1.7-.22.7-.49l-.01-1.9c-2.6.51-3.25-.63-3.46-1.21-.12-.3-.63-1.22-1.08-1.47-.37-.2-.9-.68-.02-.7.83-.01 1.42.76 1.62 1.08.95 1.6 2.47 1.15 3.07.88.1-.68.37-1.15.67-1.42-2.3-.26-4.71-1.15-4.71-5.12 0-1.13.4-2.06 1.06-2.79-.1-.26-.46-1.32.1-2.75 0 0 .87-.28 2.85 1.07a9.5 9.5 0 0 1 5.2 0c1.98-1.35 2.85-1.07 2.85-1.07.57 1.43.21 2.49.1 2.75.67.73 1.07 1.66 1.07 2.79 0 3.98-2.42 4.86-4.72 5.12.37.32.7.95.7 1.92l-.01 2.85c0 .27.19.6.7.49A10.2 10.2 0 0 0 12 1.8Z" />
    </svg>
  );
}
