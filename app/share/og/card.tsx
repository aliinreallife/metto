// Minimal Metto route social-preview card (Satori-compatible host elements).
//
// The preview deliberately avoids route-map geometry and timetable detail.
// It answers one thing at a glance — where the shared trip starts and ends —
// using the same dark neutrals + red accent as the app. The opened share URL
// remains the source of truth for the full route, timing, transfers, and map.

import type { CSSProperties, ReactNode } from "react";

const BRAND_RED = "#be1228";
const BG = "#0b0b0d";
const PANEL = "#141416";
const TEXT = "#fafafa";
const MUTED = "#a1a1aa";
const BORDER = "#27272a";

function RtlRow({
  children,
  gap = 0,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      dir="rtl"
      style={{
        display: "flex",
        flexDirection: "row-reverse",
        alignItems: "center",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Satori's bidi handling can differ from browsers. Render Persian labels as
// explicit RTL word nodes so long multi-word station names stay predictable.
function RtlWords({
  text,
  gap = 11,
  style,
}: {
  text: string;
  gap?: number;
  style?: CSSProperties;
}) {
  return (
    <RtlRow gap={gap} style={style}>
      {text.split(" ").map((word, i) => (
        <div key={`${word}-${i}`} style={{ whiteSpace: "nowrap" }}>
          {word}
        </div>
      ))}
    </RtlRow>
  );
}

function Brand() {
  return (
    <RtlRow gap={14} style={{ width: "100%" }}>
      <div
        style={{
          width: "42px",
          height: "42px",
          borderRadius: "13px",
          background: BRAND_RED,
          display: "flex",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontSize: 40,
          lineHeight: 1,
          fontWeight: 700,
          color: TEXT,
        }}
      >
        متو
      </div>
      <div
        style={{
          fontSize: 25,
          lineHeight: 1,
          color: MUTED,
          marginRight: "4px",
        }}
      >
        مسیریاب مترو تهران
      </div>
      <div style={{ flexGrow: 1, display: "flex" }} />
      <div
        dir="ltr"
        style={{
          fontSize: 24,
          color: MUTED,
          letterSpacing: "0.2px",
        }}
      >
        metto.ir
      </div>
    </RtlRow>
  );
}

function stationFontSize(origin: string, destination: string): number {
  const longest = Math.max(origin.length, destination.length);
  if (longest <= 10) return 64;
  if (longest <= 18) return 56;
  if (longest <= 28) return 47;
  return 39;
}

function Endpoint({
  label,
  name,
  fontSize,
}: {
  label: "از" | "به";
  name: string;
  fontSize: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        width: "100%",
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: MUTED,
          fontSize: 23,
          lineHeight: 1,
          marginBottom: "10px",
        }}
      >
        {label}
      </div>
      <RtlWords
        text={name}
        style={{
          width: "100%",
          justifyContent: "flex-start",
          color: TEXT,
          fontSize,
          fontWeight: 700,
          lineHeight: 1.16,
          overflow: "hidden",
        }}
      />
    </div>
  );
}

function RouteRail() {
  return (
    <div
      style={{
        width: "34px",
        height: "244px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          border: `5px solid ${BRAND_RED}`,
          background: BG,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          width: "5px",
          flexGrow: 1,
          background: BRAND_RED,
          borderRadius: "999px",
        }}
      />
      <div
        style={{
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          background: BRAND_RED,
          flexShrink: 0,
        }}
      />
    </div>
  );
}

export function renderShareCard(originDisplay: string, destDisplay: string) {
  const nameSize = stationFontSize(originDisplay, destDisplay);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: BG,
        color: TEXT,
        fontFamily: "Vazirmatn",
        position: "relative",
        overflow: "hidden",
        padding: "54px 64px 58px",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "10px",
          background: BRAND_RED,
          display: "flex",
        }}
      />

      <Brand />

      <div style={{ height: "42px", display: "flex", flexShrink: 0 }} />

      <div
        dir="rtl"
        style={{
          width: "100%",
          flexGrow: 1,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "30px",
          border: `1px solid ${BORDER}`,
          borderRadius: "28px",
          background: PANEL,
          padding: "34px 42px",
          overflow: "hidden",
        }}
      >
        <RouteRail />
        <div
          style={{
            minWidth: 0,
            flexGrow: 1,
            height: "244px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <Endpoint label="از" name={originDisplay} fontSize={nameSize} />
          <div
            style={{
              width: "100%",
              height: "1px",
              background: BORDER,
              display: "flex",
              flexShrink: 0,
            }}
          />
          <Endpoint label="به" name={destDisplay} fontSize={nameSize} />
        </div>
      </div>
    </div>
  );
}
