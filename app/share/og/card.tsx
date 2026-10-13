// Branded Metto route social-preview card (Satori-compatible host elements).
//
// Keep this a teaser, not a screenshot of the planner: the card shows route
// endpoints plus static topology facts (stops/transfers/derived line count).
// Exact timing, line instructions, the map, and the full journey stay behind
// the shared link.

import type { CSSProperties, ReactNode } from "react";

const BRAND_RED = "#cc0e2d";
const BG = "#080b10";
const PANEL = "#0f1319";
const TEXT = "#f8fafc";
const MUTED = "#8b949e";
const BORDER = "#252b33";
const SKYLINE = "#46505c";

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
  gap = 8,
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
      width="66"
      height="66"
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
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}
    >
      <MettoIcon />
      <div
        dir="ltr"
        style={{
          display: "flex",
          fontSize: 39,
          lineHeight: 1,
          fontWeight: 700,
          color: TEXT,
          letterSpacing: "-1.2px",
        }}
      >
        metto
      </div>
    </div>
  );
}

function Skyline() {
  return (
    <svg
      aria-hidden="true"
      width="500"
      height="170"
      viewBox="0 0 500 170"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: "absolute",
        left: 24,
        bottom: 18,
        display: "flex",
        opacity: 0.72,
      }}
    >
      <circle cx="183" cy="126" r="51" fill={BRAND_RED} opacity="0.82" />
      <path
        d="M0 154H38L58 144L74 149L96 137L117 144L137 128L155 139L172 126L191 138L210 145L230 133L249 140L264 133L280 139L296 126L310 135L326 129L344 140L362 136L378 142L396 134L412 143L430 138L446 147L464 142L480 151H500"
        stroke={SKYLINE}
        strokeWidth="2"
      />
      <path d="M309 150V68L315 55L321 68V150" stroke={SKYLINE} strokeWidth="2" />
      <path d="M306 87H324M308 101H322M310 116H320" stroke={SKYLINE} strokeWidth="2" />
      <path d="M315 55V35M312 35H318M315 35V22" stroke={SKYLINE} strokeWidth="2" />
      <path d="M405 151V114L427 86L449 114V151" stroke={SKYLINE} strokeWidth="2" />
      <path d="M412 114H442M418 103H436M427 86V151" stroke={SKYLINE} strokeWidth="2" />
      <path d="M50 151V122H74V151M86 151V111H108V151M119 151V128H139V151" stroke={SKYLINE} strokeWidth="2" />
    </svg>
  );
}

function stationFontSize(origin: string, destination: string): number {
  const longest = Math.max(origin.length, destination.length);
  if (longest <= 10) return 35;
  if (longest <= 18) return 31;
  if (longest <= 28) return 27;
  if (longest <= 38) return 24;
  return 21;
}

function Endpoint({
  label,
  name,
  fontSize,
}: {
  label: "مبدأ" | "مقصد";
  name: string;
  fontSize: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: MUTED,
          fontSize: 18,
          lineHeight: 1,
          marginBottom: "9px",
        }}
      >
        {label}
      </div>
      <RtlWords
        text={name}
        gap={6}
        style={{
          width: "100%",
          justifyContent: "center",
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
        width: "100%",
        height: "116px",
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
          background: BRAND_RED,
          flexShrink: 0,
          boxShadow: `0 0 0 5px ${PANEL}`,
        }}
      />
      <div
        style={{
          width: "4px",
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
          border: `4px solid ${BRAND_RED}`,
          background: PANEL,
          flexShrink: 0,
        }}
      />
    </div>
  );
}

function MetricIcon({ kind }: { kind: "stops" | "transfer" | "lines" }) {
  if (kind === "transfer") {
    return (
      <svg aria-hidden="true" width="34" height="34" viewBox="0 0 34 34" fill="none" style={{ display: "flex" }}>
        <path d="M5 11H27M27 11L22 6M27 11L22 16M29 23H7M7 23L12 18M7 23L12 28" stroke={BRAND_RED} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === "lines") {
    return (
      <svg aria-hidden="true" width="34" height="34" viewBox="0 0 34 34" fill="none" style={{ display: "flex" }}>
        <circle cx="9" cy="10" r="4" stroke={BRAND_RED} strokeWidth="3" />
        <circle cx="25" cy="24" r="4" stroke={BRAND_RED} strokeWidth="3" />
        <path d="M12 13L22 21" stroke={BRAND_RED} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" width="34" height="34" viewBox="0 0 34 34" fill="none" style={{ display: "flex" }}>
      <rect x="7" y="5" width="20" height="22" rx="6" stroke={BRAND_RED} strokeWidth="3" />
      <path d="M10 14H24M11 27L8 31M23 27L26 31" stroke={BRAND_RED} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Metric({
  kind,
  value,
  label,
}: {
  kind: "stops" | "transfer" | "lines";
  value: string;
  label: string;
}) {
  return (
    <div
      dir="rtl"
      style={{
        width: "100%",
        minHeight: "96px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: `1px solid ${BORDER}`,
        padding: "12px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "7px",
          minWidth: 0,
        }}
      >
        <RtlWords
          text={value}
          gap={5}
          style={{
            color: TEXT,
            fontSize: 27,
            fontWeight: 700,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        />
        <RtlWords
          text={label}
          gap={4}
          style={{
            color: MUTED,
            fontSize: 17,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        />
      </div>
      <MetricIcon kind={kind} />
    </div>
  );
}

function RouteFacts({
  numStops,
  numTransfers,
}: Pick<ShareCardData, "numStops" | "numTransfers">) {
  const lineCount = numTransfers === null ? null : numTransfers + 1;

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {numStops !== null ? (
        <Metric kind="stops" value={`${faNumber(numStops)} ایستگاه`} label="تعداد ایستگاه" />
      ) : null}
      {numTransfers !== null ? (
        <Metric
          kind="transfer"
          value={
            numTransfers === 0
              ? "بدون تعویض خط"
              : `${faNumber(numTransfers)} تعویض خط`
          }
          label={numTransfers === 0 ? "مسیر مستقیم" : "تغییر مسیر"}
        />
      ) : null}
      {lineCount !== null ? (
        <Metric kind="lines" value={`${faNumber(lineCount)} خط`} label="در مسیر" />
      ) : null}
    </div>
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
        background: `linear-gradient(145deg, ${BG} 0%, #0a0e14 58%, #0d1117 100%)`,
        color: TEXT,
        fontFamily: "Vazirmatn",
        position: "relative",
        overflow: "hidden",
        padding: "46px 54px 40px",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -90,
          bottom: -170,
          width: "470px",
          height: "470px",
          borderRadius: "50%",
          background: "rgba(204, 14, 45, 0.08)",
          display: "flex",
        }}
      />

      <Skyline />

      <div
        style={{
          width: "41%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          paddingRight: "42px",
          zIndex: 2,
        }}
      >
        <Brand />

        <div style={{ height: "34px", display: "flex", flexShrink: 0 }} />

        <div
          dir="rtl"
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "12px",
          }}
        >
          <RtlWords
            text="تو مترو گم شدی؟"
            gap={8}
            style={{
              color: TEXT,
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          />
          <RtlWords
            text="ما هم شده بودیم"
            gap={8}
            style={{
              color: BRAND_RED,
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          />
        </div>

        <div style={{ flexGrow: 1, display: "flex" }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "2px",
            position: "relative",
            zIndex: 3,
          }}
        >
          <div
            dir="ltr"
            style={{
              display: "flex",
              color: BRAND_RED,
              fontSize: 25,
              lineHeight: 1,
              fontWeight: 700,
            }}
          >
            metto.ir
          </div>
          <RtlWords
            text="جزئیات کامل مسیر داخل متو"
            gap={5}
            style={{
              color: MUTED,
              fontSize: 17,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          />
        </div>
      </div>

      <div
        style={{
          width: "1px",
          height: "100%",
          background: BORDER,
          display: "flex",
          flexShrink: 0,
        }}
      />

      <div
        style={{
          width: "34%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px 42px",
        }}
      >
        <Endpoint label="مبدأ" name={originDisplay} fontSize={nameSize} />
        <div style={{ height: "22px", display: "flex", flexShrink: 0 }} />
        <RouteRail />
        <div style={{ height: "22px", display: "flex", flexShrink: 0 }} />
        <Endpoint label="مقصد" name={destDisplay} fontSize={nameSize} />
      </div>

      <div
        style={{
          width: "1px",
          height: "100%",
          background: BORDER,
          display: "flex",
          flexShrink: 0,
        }}
      />

      <div
        style={{
          width: "25%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: "34px",
        }}
      >
        <RouteFacts numStops={numStops} numTransfers={numTransfers} />
      </div>
    </div>
  );
}
