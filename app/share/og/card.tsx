// OG card element tree (host elements only — Satori-compatible).
// Rendered by app/share/og/route.ts via ImageResponse. Not a component:
// exported as a builder returning the element so the route handler stays
// JSX-free TypeScript.
//
// Layout: horizontal split — text column on the right (RTL leading side),
// dedicated map panel on the left. The map NEVER sits behind text: each
// section owns its box (text 520px, gap 48px, panel 512x534 — see OG_PANEL).
//
// RTL note (verified against real renders): Satori implements no RTL
// *paragraph* order — neither dir="rtl" nor direction:"rtl" changes word
// order inside a text node. True RTL *visual* order is achieved structurally
// instead: every line is a flex row-reverse whose children are individual
// word nodes in logical order, so the first word lands rightmost. The outer
// split itself is explicit LTR row order [map, text] so the section
// placement never depends on Satori's direction handling.

import type { CSSProperties, ReactNode } from "react";
import { persianDigits } from "@/lib/i18n";
import { OG_PANEL, type ShareLineLeg, type ShareMapModel } from "./map";

const BRAND_RED = "#cc0e2d";
const TEXT_COL_W = 520;

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

// Schematic strip: ONE continuous line — butt-jointed line-colored bars
// (exact fill, rounding drift absorbed by the longest bar) with the origin,
// interchange and destination dots overlaid on top. Dots in flow always
// risk hairline gaps from flex packing/rounding, which reads as "not
// connected". Travel order reads right-to-left, mirroring the names above.
function LineStrip({ legs, width }: { legs: ShareLineLeg[]; width: number }) {
  if (legs.length === 0) return null;
  const total = legs.reduce((a, l) => a + Math.max(l.stops, 1), 0);
  const raw = legs.map((l) => (width * Math.max(l.stops, 1)) / total);
  const longest = raw.indexOf(Math.max(...raw));
  const floored = raw.map((w) => Math.max(12, w));
  const drift = width - floored.reduce((a, w) => a + w, 0);
  floored[longest] = Math.max(12, floored[longest] + drift);
  const widths = floored.map((w) => Math.max(0, Math.round(w)));
  // Re-balance rounding drift onto the longest bar so bars butt-joint
  // exactly with no hairline gaps.
  widths[longest] += width - widths.reduce((a, w) => a + w, 0);
  const barH = 6;
  const stripH = 16;
  const bars: ReactNode[] = legs.map((leg, i) => (
    <div
      key={`b${i}`}
      style={{
        width: `${widths[i]}px`,
        height: `${barH}px`,
        background: leg.color,
        flexShrink: 0,
      }}
    />
  ));
  // Joint positions from the FINAL widths (right edge = travel origin).
  const joints: number[] = [];
  widths.slice(0, -1).reduce((cumRight, w) => {
    const next = cumRight + w;
    joints.push(width - next);
    return next;
  }, 0);
  const dots: ReactNode[] = [
    <div
      key="o"
      style={{
        position: "absolute",
        left: `${width - 14}px`,
        top: `${(stripH - 14) / 2}px`,
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: BRAND_RED,
      }}
    />,
    ...joints.map((x, i) => (
      <div
        key={`x${i}`}
        style={{
          position: "absolute",
          left: `${Math.round(x - 5)}px`,
          top: `${(stripH - 10) / 2}px`,
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: "#e4e4e7",
        }}
      />
    )),
    <div
      key="d"
      style={{
        position: "absolute",
        left: "0px",
        top: `${(stripH - 14) / 2}px`,
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: BRAND_RED,
      }}
    />,
  ];
  return (
    <div
      style={{
        width: `${width}px`,
        height: `${stripH}px`,
        position: "relative",
        // Required by Satori for multi-child nodes.
        display: "flex",
      }}
    >
      <RtlRow style={{ width: `${width}px`, height: `${stripH}px` }}>
        {bars}
      </RtlRow>
      {dots}
    </div>
  );
}

// Trip meta: boardable-stop and physical-transfer counts from the static
// topology (never times or ETAs). Zero transfers reads as "بدون تعویض".
function TripMeta({
  numStops,
  numTransfers,
}: {
  numStops: number;
  numTransfers: number;
}) {
  const words: string[] = [
    ...`${persianDigits(numStops, "fa")} ایستگاه`.split(" "),
    "•",
    ...(numTransfers === 0
      ? ["بدون", "تعویض"]
      : `${persianDigits(numTransfers, "fa")} تعویض`.split(" ")),
  ];
  return (
    // Wide gaps: at card scale a tight "• ۱" merges into a "۱۰" lookalike.
    <RtlRow gap={18}>
      {words.map((w, i) => (
        <div key={i} style={{ fontSize: 28, color: "#a1a1aa" }}>
          {w}
        </div>
      ))}
    </RtlRow>
  );
}

// Left-pointing arrow drawn from boxes, not a glyph: Vazirmatn ships no
// arrow codepoints (U+2190 etc. are absent from both weights), so a "←"
// character only renders via system-font fallback — which exists on dev
// machines but NOT on the production function runtime. An SVG data-URI
// <img> was tried first for extra crispness, but Satori silently drops it
// (verified blank on real renders). Head is a 45°-rotated square inside an
// overflow-hidden box, so only its left half (a triangle) shows. (The
// classic zero-size border-triangle trick does NOT work in Satori either —
// it paints a solid square.) Rotation + overflow-hidden are the same
// primitives the map panel already relies on.
function LeftArrow({ size }: { size: number }) {
  const r1 = (n: number): number => Math.round(n * 10) / 10;
  const barH = Math.max(6, Math.round(size * 0.15));
  const barW = Math.round(size * 0.55);
  const headH = Math.max(8, Math.round(size * 0.22));
  const headW = headH * 2;
  const sq = headH * Math.SQRT2;
  const sqOff = headH - sq / 2;
  return (
    <RtlRow style={{ flexShrink: 0 }}>
      <div
        style={{
          width: `${barW}px`,
          height: `${barH}px`,
          background: "#fafafa",
          borderRadius: `${r1(barH / 2)}px`,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          width: `${headW}px`,
          height: `${headH * 2}px`,
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${r1(sqOff)}px`,
            top: `${r1(sqOff)}px`,
            width: `${r1(sq)}px`,
            height: `${r1(sq)}px`,
            background: "#fafafa",
            transform: "rotate(45deg)",
          }}
        />
      </div>
    </RtlRow>
  );
}

export function renderShareCard(
  originDisplay: string,
  destDisplay: string,
  timePhrase: string,
  map: ShareMapModel | null,
) {
  // ONE consistent layout for every pair: origin (+ arrow, pointing at
  // the line below) stacked over the destination, sized by the longest
  // line. Single-line mode is gone — fitting two names beside the arrow
  // needed per-pair size juggling that clipped ("شهر" lost its ر) and made
  // long names look like a different card entirely. Adversarial lengths
  // still hit the builder cap + ellipsis as a backstop.
  const maxLine = Math.max(originDisplay.length, destDisplay.length);
  const stackSize = maxLine <= 10 ? 56 : maxLine <= 16 ? 46 : 38;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        direction: "ltr",
        background: "#0a0a0a",
        color: "#fafafa",
        padding: "48px 60px",
        gap: "48px",
        fontFamily: "Vazirmatn",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Map panel: its own section (left). All geometry is panel-local
          (see buildShareMap viewport) — nothing here can cover the text. */}
      <div
        style={{
          width: `${OG_PANEL.w}px`,
          height: `${OG_PANEL.h}px`,
          position: "relative",
          // Required by Satori for multi-child nodes (children are all
          // absolutely positioned, so flex layout itself is a no-op).
          display: "flex",
          background: "#131316",
          borderRadius: "24px",
          borderWidth: "2px",
          borderStyle: "solid",
          borderColor: "#26262b",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {map && (
          <div style={{ display: "flex" }}>
            {map.edges.map((e, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: e.cx - e.len / 2,
                  top: e.cy - e.thick / 2,
                  width: e.len,
                  height: e.thick,
                  background: e.color,
                  opacity: e.opacity,
                  borderRadius: e.thick / 2,
                  transform: `rotate(${e.deg}deg)`,
                  ...(e.glow ? { boxShadow: e.glow } : {}),
                }}
              />
            ))}
            {map.connectors.map((e, i) => (
              <div
                key={`c${i}`}
                style={{
                  position: "absolute",
                  left: e.cx - e.len / 2,
                  top: e.cy - e.thick / 2,
                  width: e.len,
                  height: e.thick,
                  background: e.color,
                  opacity: e.opacity,
                  borderRadius: e.thick / 2,
                  transform: `rotate(${e.deg}deg)`,
                }}
              />
            ))}
            {map.dots.map((d, i) => (
              <div
                key={`d${i}`}
                style={{
                  position: "absolute",
                  left: d.x - d.r,
                  top: d.y - d.r,
                  width: d.r * 2,
                  height: d.r * 2,
                  borderRadius: "50%",
                  background: d.fill,
                  ...(d.glow ? { boxShadow: d.glow } : {}),
                }}
              />
            ))}
            {map.joints.map((d, i) => (
              <div
                key={`j${i}`}
                style={{
                  position: "absolute",
                  left: d.x - d.r,
                  top: d.y - d.r,
                  width: d.r * 2,
                  height: d.r * 2,
                  borderRadius: "50%",
                  background: d.fill,
                }}
              />
            ))}
            {map.pins.map((d, i) => (
              <div
                key={`p${i}`}
                style={{
                  position: "absolute",
                  left: d.x - d.r,
                  top: d.y - d.r,
                  width: d.r * 2,
                  height: d.r * 2,
                  borderRadius: "50%",
                  background: d.fill,
                  ...(d.glow ? { boxShadow: d.glow } : {}),
                }}
              />
            ))}
          </div>
        )}
      </div>
      {/* Text column (right = RTL leading side). */}
      <div
        dir="rtl"
        style={{
          width: `${TEXT_COL_W}px`,
          height: `${OG_PANEL.h}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <RtlRow gap={14}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: BRAND_RED,
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 700 }}>متو</div>
          <div style={{ fontSize: 28, color: "#a1a1aa" }}>metto.ir</div>
        </RtlRow>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          {/* Names split into word nodes: a multi-word name in ONE text node
              lays out LTR internally ("عبدل آباد" would scan as "اباد عبدل").
              Origin (+ arrow, pointing at the line below) on line 1,
              destination on line 2 — the same arrangement for every pair. */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <RtlRow
              gap={12}
              style={{
                fontSize: stackSize,
                fontWeight: 700,
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                maxWidth: "100%",
              }}
            >
              {originDisplay.split(" ").map((w, i) => (
                <div
                  key={i}
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                >
                  {w}
                </div>
              ))}
              <LeftArrow size={stackSize} />
            </RtlRow>
            <RtlRow
              gap={12}
              style={{
                fontSize: stackSize,
                fontWeight: 700,
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                maxWidth: "100%",
              }}
            >
              {destDisplay.split(" ").map((w, i) => (
                <div
                  key={i}
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                >
                  {w}
                </div>
              ))}
            </RtlRow>
          </div>
          {/* Brand underline: anchors the route block to the RTL edge. */}
          <RtlRow>
            <div
              style={{
                width: "72px",
                height: "8px",
                borderRadius: "4px",
                background: BRAND_RED,
              }}
            />
          </RtlRow>
          {/* Journey substance: schematic strip plus stop/transfer counts —
              all static topology from the map model. Skipped when
              unroutable (legs empty): the card falls back to names + time. */}
          {map && map.legs.length > 0 && (
            <LineStrip legs={map.legs} width={TEXT_COL_W} />
          )}
          {map && map.legs.length > 0 && (
            <TripMeta
              numStops={map.numStops}
              numTransfers={map.numTransfers}
            />
          )}
          {timePhrase !== "" && (
            <RtlRow gap={14}>
              {timePhrase.split(" ").map((w, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 40,
                    fontWeight: 700,
                    color: "#f4a3b2",
                    whiteSpace: "nowrap",
                  }}
                >
                  {w}
                </div>
              ))}
            </RtlRow>
          )}
        </div>
        <RtlRow gap={6}>
          {"نقشه و مسیریابی مترو".split(" ").map((w, i) => (
            <div key={i} style={{ fontSize: 28, color: "#8e8e96" }}>
              {w}
            </div>
          ))}
        </RtlRow>
      </div>
      {/* Leading-edge accent (right edge in RTL reading). */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: "12px",
          background: BRAND_RED,
        }}
      />
    </div>
  );
}
