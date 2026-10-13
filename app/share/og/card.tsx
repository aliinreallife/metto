// Branded Metto route social-preview card (Satori-compatible host elements).
//
// Keep this a teaser, not a screenshot of the planner: the card shows route
// endpoints plus static topology facts (stops/transfers). Exact timing, line
// instructions, the map, and the full journey stay behind the shared link.

import type { CSSProperties, ReactNode } from "react";

const BRAND_RED = "#cc0e2d";
const BG = "#0b0b0d";
const PANEL = "#141416";
const PANEL_SOFT = "#19191c";
const TEXT = "#fafafa";
const MUTED = "#a1a1aa";
const BORDER = "#29292d";

export interface ShareCardData {
  originDisplay: string;
  destDisplay: string;
  numStops: number | null;
  numTransfers: number | null;
}

function faNumber(value: number): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

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
        flexDirection: "row",
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
  gap = 10,
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

function MettoIcon() {
  return (
    <svg
      aria-hidden="true"
      width="72"
      height="72"
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "flex", flexShrink: 0 }}
    >
      <rect width="512" height="512" rx="102" fill={BRAND_RED} />
      <g
        transform="translate(96 96) scale(13.333333)"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 3.1V7a4 4 0 0 0 8 0V3.1" />
        <path d="m9 15-1-1" />
        <path d="m15 15 1-1" />
        <path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z" />
        <path d="m8 19-2 3" />
        <path d="m16 19 2 3" />
      </g>
    </svg>
  );
}

function Brand() {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <RtlRow gap={18}>
        <MettoIcon />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "8px",
          }}
        >
          <div
            style={{
              fontSize: 43,
              lineHeight: 1,
              fontWeight: 700,
              color: TEXT,
            }}
          >
            متو
          </div>
          <div
            dir="rtl"
            style={{
              fontSize: 24,
              lineHeight: 1,
              color: MUTED,
              whiteSpace: "nowrap",
            }}
          >
            تو مترو گم شدی؟ ما هم شده بودیم
          </div>
        </div>
      </RtlRow>

      <div
        dir="ltr"
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid ${BORDER}`,
          borderRadius: "999px",
          background: PANEL_SOFT,
          padding: "11px 18px",
          fontSize: 23,
          lineHeight: 1,
          color: MUTED,
          letterSpacing: "0.2px",
        }}
      >
        metto.ir
      </div>
    </div>
  );
}

function stationFontSize(origin: string, destination: string): number {
  const longest = Math.max(origin.length, destination.length);
  if (longest <= 10) return 58;
  if (longest <= 18) return 52;
  if (longest <= 28) return 45;
  if (longest <= 38) return 39;
  return 34;
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
          color: BRAND_RED,
          fontSize: 22,
          lineHeight: 1,
          fontWeight: 700,
          marginBottom: "9px",
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
          lineHeight: 1.1,
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
        height: "215px",
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
          background: PANEL,
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

function Metric({ text }: { text: string }) {
  return (
    <div
      dir="rtl"
      style={{
        display: "flex",
        alignItems: "center",
        background: PANEL_SOFT,
        border: `1px solid ${BORDER}`,
        borderRadius: "999px",
        padding: "10px 16px",
        color: TEXT,
        fontSize: 21,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

function RouteFacts({
  numStops,
  numTransfers,
}: Pick<ShareCardData, "numStops" | "numTransfers">) {
  if (numStops === null && numTransfers === null) return null;

  return (
    <RtlRow gap={10}>
      {numStops !== null ? <Metric text={`${faNumber(numStops)} ایستگاه`} /> : null}
      {numTransfers !== null ? (
        <Metric
          text={
            numTransfers === 0
              ? "بدون تعویض خط"
              : `${faNumber(numTransfers)} تعویض خط`
          }
        />
      ) : null}
    </RtlRow>
  );
}

export function renderShareCard({
  originDisplay,
  destDisplay,
  numStops,
  numTransfers,
}: ShareCardData) {
  const nameSize = stationFontSize(originDisplay, destDisplay);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(145deg, ${BG} 0%, #111114 100%)`,
        color: TEXT,
        fontFamily: "Vazirmatn",
        position: "relative",
        overflow: "hidden",
        padding: "48px 62px 46px",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "8px",
          background: BRAND_RED,
          display: "flex",
        }}
      />

      <Brand />

      <div style={{ height: "30px", display: "flex", flexShrink: 0 }} />

      <div
        dir="rtl"
        style={{
          width: "100%",
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${BORDER}`,
          borderRadius: "30px",
          background: PANEL,
          padding: "28px 36px 24px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "28px",
            minHeight: "220px",
          }}
        >
          <RouteRail />
          <div
            style={{
              minWidth: 0,
              flexGrow: 1,
              height: "215px",
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

        <div
          style={{
            width: "100%",
            height: "1px",
            background: BORDER,
            display: "flex",
            flexShrink: 0,
            marginTop: "18px",
          }}
        />

        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "18px",
          }}
        >
          <RouteFacts numStops={numStops} numTransfers={numTransfers} />
          <div
            dir="rtl"
            style={{
              display: "flex",
              alignItems: "center",
              color: MUTED,
              fontSize: 21,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            زمان‌بندی و جزئیات کامل داخل متو
          </div>
        </div>
      </div>
    </div>
  );
}
