// Final Metto route social-preview card (Satori-compatible host elements).
//
// The visual layout intentionally mirrors the approved 1200x630 HTML mockup.
// The Tehran background is supplied as the exact SVG artwork from that mockup;
// Persian word order is laid out explicitly because Satori's bidi behavior can
// differ from browsers.

import type { CSSProperties, ReactNode } from "react";

const BRAND_RED = "#DC1830";
const BG = "#0A1218";
const TEXT = "#FCFCFC";
const MUTED = "#B6BBC2";
const LABEL = "#8A9099";

export interface ShareCardData {
  originDisplay: string;
  destDisplay: string;
  durationMinutes: number | null;
  numTransfers: number | null;
  cityArtworkDataUri?: string;
}

function faNumber(value: number): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

// Do not rely on dir=rtl to reorder flex children. Put the first logical Persian
// segment at the visual right edge explicitly and keep each text node RTL.
function VisualRtlRow({
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
      style={{
        display: "flex",
        flexDirection: "row-reverse",
        justifyContent: "flex-start",
        alignItems: "center",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

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
    <VisualRtlRow
      gap={gap}
      style={{
        flexWrap: "wrap",
        alignContent: "flex-start",
        ...style,
      }}
    >
      {text
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word, i) => (
          <div
            key={`${word}-${i}`}
            dir="rtl"
            style={{ display: "flex", whiteSpace: "nowrap" }}
          >
            {word}
          </div>
        ))}
    </VisualRtlRow>
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
          fontSize: 18,
          lineHeight: 1.3,
          fontWeight: 700,
          marginBottom: 4,
          textAlign: "right",
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
      dir="rtl"
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
        top: 300,
        width: 500,
        height: 80,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        gap: 3,
        color: "#C9CED6",
        fontSize: 28,
        lineHeight: 1.42,
        fontWeight: 600,
      }}
    >
      {durationMinutes !== null ? (
        <VisualRtlRow gap={7} style={{ width: "100%" }}>
          <RtlText>مسیرت</RtlText>
          <Effect>{`${faNumber(durationMinutes)} دقیقه`}</Effect>
          <RtlText>طول می‌کشه</RtlText>
        </VisualRtlRow>
      ) : null}
      {transferCore !== null ? (
        <VisualRtlRow gap={7} style={{ width: "100%" }}>
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
  cityArtworkDataUri,
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
          alignItems: "flex-start",
          fontSize: 82,
          lineHeight: 1.3,
          fontWeight: 900,
          letterSpacing: 0,
        }}
      >
        <div dir="rtl" style={{ display: "flex", color: TEXT, whiteSpace: "nowrap" }}>
          تو مترو گم شدی؟
        </div>
        <div
          dir="rtl"
          style={{ display: "flex", color: BRAND_RED, whiteSpace: "nowrap" }}
        >
          ما هم شده بودیم
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: 64,
          top: 36,
          width: 470,
          height: 380,
          display: "flex",
        }}
      >
        {/* Exact connector geometry from the approved HTML pseudo-elements. */}
        <div
          style={{
            position: "absolute",
            right: 18,
            top: 60,
            width: 4,
            height: 104,
            background: BRAND_RED,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 18,
            top: 126,
            width: 4,
            height: 60,
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
          width: 520,
          height: 64,
          borderRadius: 32,
          background:
            "linear-gradient(90deg, rgba(10,18,24,.96) 0%, rgba(10,18,24,.93) 28%, rgba(10,18,24,.82) 50%, rgba(10,18,24,.50) 72%, rgba(10,18,24,.16) 90%, rgba(10,18,24,0) 100%)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 534,
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
