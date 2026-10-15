// Final Metto route social-preview card (Satori-compatible host elements).
//
// This deliberately stays a teaser: origin, destination, an inexpensive static
// travel-time estimate, and transfer count. Exact timetable timing, line-by-line
// instructions, and the interactive map remain inside the shared link.

import type { CSSProperties, ReactNode } from "react";

const BRAND_RED = "#DC1830";
const BG = "#0A1218";
const TEXT = "#FCFCFC";
const MUTED = "#AEB5BF";
const LABEL = "#8A9099";

export interface ShareCardData {
  originDisplay: string;
  destDisplay: string;
  durationMinutes: number | null;
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

// Satori's bidi handling can differ from browsers. Explicit RTL word nodes keep
// Persian station names predictable and let long names wrap inside their own
// reserved boxes instead of colliding with the Tehran artwork.
function RtlWords({
  text,
  gap = 7,
  style,
}: {
  text: string;
  gap?: number;
  style?: CSSProperties;
}) {
  return (
    <RtlRow
      gap={gap}
      style={{
        flexWrap: "wrap",
        alignContent: "flex-start",
        ...style,
      }}
    >
      {text.split(" ").map((word, i) => (
        <div key={`${word}-${i}`} style={{ whiteSpace: "nowrap" }}>
          {word}
        </div>
      ))}
    </RtlRow>
  );
}

function CityArtwork() {
  return (
    <svg
      aria-hidden="true"
      width="1200"
      height="630"
      viewBox="0 0 1200 630"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: "absolute", inset: 0, display: "flex" }}
    >
      <circle cx="348" cy="390" r="46" fill={BRAND_RED} opacity="0.95" />
      <path
        d="M0 414L74 380L130 397L196 350L254 378L320 326L382 372L448 340L510 374L568 330L626 368L684 344L742 377L806 352L868 380L930 356L996 386L1062 364L1128 392L1200 370"
        stroke="white"
        strokeOpacity="0.22"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M0 454H70V438H102V454H142V425H178V454H214V440H246V454H286V420H324V454H360V433H392V454H426V410H462V454H496V436H528V454H566V427H602V454H1200"
        stroke="white"
        strokeOpacity="0.20"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      <g
        transform="translate(545 232)"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M54 0H55L57 76H52L54 0Z"
          fill="white"
          fillOpacity="0.42"
          stroke="none"
        />
        <path d="M50 82C50 75 60 75 60 82" strokeOpacity="0.52" />
        <path d="M45 86H65M45 86L30 102M65 86L80 102" strokeOpacity="0.54" />
        <path
          d="M30 102C46 108 64 108 80 102L66 128H44L30 102Z"
          strokeOpacity="0.52"
        />
        <path d="M45 128L41 215M65 128L69 215" strokeOpacity="0.52" />
        <path
          d="M40 215C41 224 27 229 20 232M70 215C69 224 83 229 90 232"
          strokeOpacity="0.52"
        />
        <path d="M20 232H90V238H20V232Z" strokeOpacity="0.52" />
      </g>

      <g
        transform="translate(370 354)"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M0 100L48 57V25H58V22H82V25H92V57L140 100"
          strokeOpacity="0.46"
        />
        <path d="M48 57H92M55 25V58M85 25V58" strokeOpacity="0.34" />
        <path
          d="M34 100C38 77 60 62 70 52C80 62 102 77 106 100"
          strokeOpacity="0.48"
        />
        <path
          d="M24 100C31 70 58 50 70 39C82 50 109 70 116 100"
          strokeOpacity="0.32"
        />
        <path d="M0 100H140" strokeOpacity="0.52" />
      </g>

      <path d="M0 454H1200V630H0Z" fill="url(#cityFade)" />
      <defs>
        <linearGradient
          id="cityFade"
          x1="600"
          y1="454"
          x2="600"
          y2="630"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={BG} stopOpacity="0.02" />
          <stop offset="1" stopColor={BG} stopOpacity="0.94" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function stationFontSize(name: string): number {
  const length = name.length;
  if (length <= 16) return 42;
  if (length <= 24) return 38;
  if (length <= 32) return 34;
  if (length <= 42) return 30;
  return 26;
}

function StationBlock({
  label,
  name,
  top,
}: {
  label: "مبدأ" | "مقصد";
  name: string;
  top: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        right: 0,
        width: "100%",
        height: 136,
        display: "flex",
        flexDirection: "column",
        paddingRight: 56,
        paddingLeft: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          color: LABEL,
          fontSize: 18,
          lineHeight: 1.3,
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <RtlWords
        text={name}
        gap={7}
        style={{
          width: "100%",
          maxHeight: 100,
          justifyContent: "flex-start",
          color: TEXT,
          fontSize: stationFontSize(name),
          fontWeight: 700,
          lineHeight: 1.18,
          overflow: "hidden",
        }}
      />
    </div>
  );
}

function RouteDot({ top }: { top: number }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 9,
        top,
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: BRAND_RED,
        boxShadow: `0 0 0 7px ${BG}`,
        display: "flex",
      }}
    />
  );
}

function Effect({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        color: TEXT,
        fontWeight: 900,
        whiteSpace: "nowrap",
        padding: "0 2px",
      }}
    >
      <div
        style={{
          position: "absolute",
          zIndex: 0,
          left: -1,
          right: -1,
          bottom: 4,
          height: 8,
          borderRadius: 999,
          background: BRAND_RED,
          opacity: 0.72,
          display: "flex",
        }}
      />
      <div style={{ display: "flex", position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function TripSentence({
  durationMinutes,
  numTransfers,
}: Pick<ShareCardData, "durationMinutes" | "numTransfers">) {
  if (durationMinutes === null && numTransfers === null) return null;

  const transferCore =
    numTransfers === null
      ? null
      : numTransfers === 0
        ? "بدون تعویض"
        : numTransfers === 1
          ? "یه تعویض"
          : `${faNumber(numTransfers)} تعویض`;

  return (
    <div
      dir="rtl"
      style={{
        position: "absolute",
        right: 0,
        top: 300,
        width: 500,
        height: 82,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        gap: 3,
        color: "#C9CED6",
        fontSize: 28,
        lineHeight: 1.42,
        fontWeight: 600,
      }}
    >
      {durationMinutes !== null ? (
        <RtlRow gap={7} style={{ width: "100%", justifyContent: "flex-start" }}>
          <div style={{ display: "flex", whiteSpace: "nowrap" }}>مسیرت</div>
          <Effect>{`${faNumber(durationMinutes)} دقیقه`}</Effect>
          <div style={{ display: "flex", whiteSpace: "nowrap" }}>طول می‌کشه</div>
        </RtlRow>
      ) : null}
      {transferCore !== null ? (
        <RtlRow gap={7} style={{ width: "100%", justifyContent: "flex-start" }}>
          <div style={{ display: "flex", whiteSpace: "nowrap" }}>و</div>
          <Effect>{transferCore}</Effect>
          <div style={{ display: "flex", whiteSpace: "nowrap" }}>
            {numTransfers === 0 ? "خط می‌ری." : "خط داری."}
          </div>
        </RtlRow>
      ) : null}
    </div>
  );
}

export function renderShareCard({
  originDisplay,
  destDisplay,
  durationMinutes,
  numTransfers,
}: ShareCardData) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: BG,
        color: TEXT,
        fontFamily: "Vazirmatn",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <CityArtwork />

      <div
        dir="rtl"
        style={{
          position: "absolute",
          left: 64,
          top: 104,
          width: 620,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          fontSize: 82,
          lineHeight: 1.3,
          fontWeight: 900,
          letterSpacing: 0,
        }}
      >
        <div style={{ display: "flex", color: TEXT, whiteSpace: "nowrap" }}>
          تو مترو گم شدی؟
        </div>
        <div style={{ display: "flex", color: BRAND_RED, whiteSpace: "nowrap" }}>
          ما هم شده بودیم
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 64,
          top: 36,
          width: 470,
          height: 382,
          display: "flex",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: 18,
            top: 60,
            width: 4,
            height: 136,
            borderRadius: 999,
            background: BRAND_RED,
            display: "flex",
          }}
        />
        <RouteDot top={40} />
        <RouteDot top={184} />
        <StationBlock label="مبدأ" name={originDisplay} top={0} />
        <StationBlock label="مقصد" name={destDisplay} top={144} />
        <TripSentence
          durationMinutes={durationMinutes}
          numTransfers={numTransfers}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 46,
          top: 522,
          width: 535,
          height: 74,
          borderRadius: 37,
          background:
            "linear-gradient(90deg, rgba(10,18,24,.98) 0%, rgba(10,18,24,.94) 36%, rgba(10,18,24,.80) 62%, rgba(10,18,24,0) 100%)",
          display: "flex",
        }}
      />
      <div
        dir="ltr"
        style={{
          position: "absolute",
          left: 64,
          top: 534,
          display: "flex",
          alignItems: "baseline",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            color: BRAND_RED,
            fontSize: 38,
            lineHeight: 1,
            fontWeight: 800,
          }}
        >
          metto.ir
        </div>
        <div
          dir="rtl"
          style={{
            display: "flex",
            color: MUTED,
            fontSize: 28,
            lineHeight: 1,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          جزئیات کامل مسیر در
        </div>
      </div>
    </div>
  );
}
