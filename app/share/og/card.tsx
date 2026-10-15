// Metto route social-preview card (Satori-compatible host elements).
//
// Geometry follows the approved 1200x630 browser mockup. The Tehran background
// is the exact SVG artwork from that mockup. Satori does not reliably perform
// Persian bidi word ordering, so multi-word Persian copy is laid out in visual
// right-to-left order explicitly.

import { Children, type CSSProperties, type ReactNode } from "react";

const BRAND_RED = "#DC1830";
const BG = "#0A1218";
const TEXT = "#FCFCFC";
const SENTENCE = "#D3D8DF";
const MUTED = "#C3C8CF";
const LABEL = "#A9AFB9";

export interface ShareCardData {
  originDisplay: string;
  destDisplay: string;
  durationMinutes: number | null;
  numTransfers: number | null;
  numStops: number | null;
  cityArtworkDataUri?: string;
}

function faNumber(value: number): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function PersianLine({
  text,
  gap = 7,
  style,
}: {
  text: string;
  gap?: number;
  style?: CSSProperties;
}) {
  const words = text.trim().split(/\s+/).filter(Boolean).reverse();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "baseline",
        gap,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {words.map((word, index) => (
        <div
          key={`${word}-${index}`}
          dir="rtl"
          style={{ display: "flex", whiteSpace: "nowrap" }}
        >
          {word}
        </div>
      ))}
    </div>
  );
}

// Satori keeps JSX child order visually left-to-right. Reverse logical Persian
// segments so the first logical segment lands on the visual right edge.
function VisualRtlRow({
  children,
  gap = 0,
  style,
}: {
  children: ReactNode;
  gap?: number;
  style?: CSSProperties;
}) {
  const visualChildren = Children.toArray(children).reverse();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "flex-end",
        alignItems: "center",
        gap,
        ...style,
      }}
    >
      {visualChildren}
    </div>
  );
}

// Keep the smaller station-name scale chosen in the final visual iteration,
// then progressively shrink long names instead of clipping them.
function stationFontSize(name: string): number {
  const length = name.length;
  if (length <= 16) return 42;
  if (length <= 24) return 38;
  if (length <= 32) return 34;
  if (length <= 42) return 30;
  return 26;
}

function stationLines(name: string): string[] {
  const clean = name.trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (clean.length <= 20 || words.length < 2) return [clean];

  let bestIndex = 1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(" ");
    const second = words.slice(index).join(" ");
    const score = Math.max(first.length, second.length) * 2 + Math.abs(first.length - second.length);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return [words.slice(0, bestIndex).join(" "), words.slice(bestIndex).join(" ")];
}

function StopChip({ numStops }: { numStops: number | null }) {
  if (numStops === null || numStops <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: 140,
        top: 0,
        display: "flex",
        padding: "2px 16px 4px",
        borderRadius: 999,
        border: "2px solid rgba(220,24,48,.65)",
        background: "rgba(220,24,48,.12)",
        color: TEXT,
        fontSize: 24,
        lineHeight: 1.35,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      <PersianLine text={`${faNumber(numStops)} ایستگاه`} gap={5} />
    </div>
  );
}

function StationBlock({
  label,
  name,
  top,
  numStops = null,
}: {
  label: "مبدأ" | "مقصد";
  name: string;
  top: number;
  numStops?: number | null;
}) {
  const lines = stationLines(name);
  const fontSize = stationFontSize(name);
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
        alignItems: "flex-end",
        paddingRight: 56,
        paddingLeft: 2,
        overflow: "hidden",
      }}
    >
      <div
        dir="rtl"
        style={{
          display: "flex",
          color: LABEL,
          fontSize: 26,
          lineHeight: 1.3,
          fontWeight: 700,
          marginBottom: 2,
          textAlign: "right",
        }}
      >
        {label}
      </div>
      {label === "مقصد" ? <StopChip numStops={numStops} /> : null}
      <div
        style={{
          width: "100%",
          maxHeight: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          overflow: "hidden",
          color: TEXT,
          fontSize,
          fontWeight: 800,
          lineHeight: 1.16,
        }}
      >
        {lines.map((line, index) => (
          <PersianLine key={`${line}-${index}`} text={line} gap={7} style={{ width: "100%" }} />
        ))}
      </div>
    </div>
  );
}

function RouteDot({
  top,
  destination = false,
}: {
  top: number;
  destination?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        right: 9,
        top,
        width: 22,
        height: 22,
        boxSizing: "border-box",
        borderRadius: "50%",
        background: destination ? BG : BRAND_RED,
        border: destination ? `5px solid ${BRAND_RED}` : "none",
        boxShadow: destination
          ? "none"
          : `0 0 0 7px ${BG}, 0 0 24px 5px rgba(220,24,48,.50)`,
        display: "flex",
      }}
    />
  );
}

function Effect({ children }: { children: ReactNode }) {
  return (
    <div
      dir="rtl"
      style={{
        display: "flex",
        position: "relative",
        isolation: "isolate",
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
          bottom: 5,
          height: 8,
          borderRadius: 999,
          background: BRAND_RED,
          opacity: 0.72,
          transform: "skewX(-8deg)",
          display: "flex",
        }}
      />
      <div style={{ display: "flex", position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function RtlText({ children }: { children: ReactNode }) {
  return (
    <div dir="rtl" style={{ display: "flex", whiteSpace: "nowrap" }}>
      {children}
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
      style={{
        position: "absolute",
        right: 0,
        top: 312,
        width: 380,
        height: 96,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        color: SENTENCE,
        fontSize: 24,
        lineHeight: 1.42,
        fontWeight: 600,
        overflow: "hidden",
      }}
    >
      {durationMinutes !== null ? (
        <VisualRtlRow gap={4} style={{ width: "100%" }}>
          <RtlText>مسیرت</RtlText>
          <Effect>{`${faNumber(durationMinutes)} دقیقه`}</Effect>
          <RtlText>طول می‌کشه</RtlText>
        </VisualRtlRow>
      ) : null}
      {transferCore !== null ? (
        <VisualRtlRow gap={4} style={{ width: "100%" }}>
          <RtlText>و</RtlText>
          <Effect>{transferCore}</Effect>
          <RtlText>{numTransfers === 0 ? "خط می‌ری." : "خط داری."}</RtlText>
        </VisualRtlRow>
      ) : null}
    </div>
  );
}

export function renderShareCard({
  originDisplay,
  destDisplay,
  durationMinutes,
  numTransfers,
  numStops,
  cityArtworkDataUri,
}: ShareCardData) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background:
          "radial-gradient(900px 520px at 78% 8%,rgba(220,24,48,.10),rgba(220,24,48,0) 62%), radial-gradient(700px 420px at 12% 100%,rgba(70,110,150,.10),rgba(70,110,150,0) 70%), #0A1218",
        color: TEXT,
        fontFamily: "Vazirmatn",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {cityArtworkDataUri ? (
        <img
          aria-hidden="true"
          alt=""
          src={cityArtworkDataUri}
          width={1200}
          height={630}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1200,
            height: 630,
            display: "flex",
          }}
        />
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 64,
          top: 104,
          width: 620,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          fontSize: 84,
          lineHeight: 1.3,
          fontWeight: 900,
          letterSpacing: 0,
        }}
      >
        <PersianLine text="تو مترو گم شدی؟" gap={16} style={{ width: "100%", color: TEXT }} />
        <PersianLine text="ما هم شده بودیم" gap={16} style={{ width: "100%", color: BRAND_RED }} />
      </div>

      <div
        style={{
          position: "absolute",
          right: 64,
          top: 30,
          width: 470,
          height: 410,
          display: "flex",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: 18,
            top: 64,
            width: 4,
            height: 104,
            background:
              "linear-gradient(180deg,#DC1830,rgba(220,24,48,.55))",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 18,
            top: 126,
            width: 4,
            height: 66,
            background:
              "linear-gradient(180deg,rgba(220,24,48,.55),#DC1830)",
            display: "flex",
          }}
        />
        <RouteDot top={44} />
        <RouteDot top={188} destination />
        <StationBlock label="مبدأ" name={originDisplay} top={0} />
        <StationBlock label="مقصد" name={destDisplay} top={144} numStops={numStops} />
        <TripSentence
          durationMinutes={durationMinutes}
          numTransfers={numTransfers}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 46,
          top: 514,
          width: 640,
          height: 76,
          borderRadius: 38,
          background:
            "linear-gradient(90deg, rgba(10,18,24,.96) 0%, rgba(10,18,24,.93) 28%, rgba(10,18,24,.82) 50%, rgba(10,18,24,.50) 72%, rgba(10,18,24,.16) 90%, rgba(10,18,24,0) 100%)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 540,
          display: "flex",
          flexDirection: "row",
          alignItems: "baseline",
          gap: 16,
        }}
      >
        <div
          dir="ltr"
          style={{
            display: "flex",
            color: BRAND_RED,
            fontSize: 46,
            lineHeight: 1,
            fontWeight: 800,
          }}
        >
          metto.ir
        </div>
        <PersianLine
          text="جزئیات کامل مسیر در"
          gap={8}
          style={{
            color: MUTED,
            fontSize: 34,
            lineHeight: 1,
            fontWeight: 600,
          }}
        />
      </div>
    </div>
  );
}
