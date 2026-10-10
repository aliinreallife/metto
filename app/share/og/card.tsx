// OG card element tree (host elements only — Satori-compatible).
// Rendered by app/share/og/route.ts via ImageResponse. Not a component:
// exported as a builder returning the element so the route handler stays
// JSX-free TypeScript.
//
// RTL note (verified against real renders): Satori implements no RTL
// *paragraph* order — neither dir="rtl" nor direction:"rtl" changes word
// order inside a text node. True RTL *visual* order is achieved structurally
// instead: every line is a flex row-reverse whose children are individual
// word nodes in logical order, so the first word lands rightmost. With real
// visual RTL restored, the metadata title form "مبدأ ← مقصد" is correct
// again (origin right, arrow pointing left at the destination) and the card
// matches the text title exactly.

import type { CSSProperties, ReactNode } from "react";
import type { ShareMapModel } from "./map";

const BRAND_RED = "#cc0e2d";

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

export function renderShareCard(
  originDisplay: string,
  destDisplay: string,
  timePhrase: string,
  map: ShareMapModel | null,
) {
  // Single-line route at 84px fits ~18 combined chars; step down for longer
  // names so typical pairs stay commanding while long pins shrink instead of
  // ellipsizing. Adversarial lengths still hit the builder cap + ellipsis.
  const combined = originDisplay.length + destDisplay.length;
  const routeSize = combined <= 18 ? 84 : combined <= 26 ? 68 : combined <= 36 ? 56 : 44;
  return (
    <div
      dir="rtl"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0a0a0a",
        color: "#fafafa",
        padding: "72px 84px 64px 84px",
        fontFamily: "Vazirmatn",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {map && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            // Required by Satori for multi-child nodes (children are all
            // absolutely positioned, so flex layout itself is a no-op).
            display: "flex",
          }}
        >
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
        </div>
      )}
      {/* Legibility scrim: keeps thin network lines behind the type quiet. */}
      {map && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            background: "rgba(10, 10, 10, 0.45)",
          }}
        />
      )}
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
      <RtlRow gap={18}>
        <div
          style={{
            width: "30px",
            height: "30px",
            borderRadius: "9px",
            background: BRAND_RED,
          }}
        />
        <div style={{ fontSize: 44, fontWeight: 700 }}>متو</div>
        <div style={{ fontSize: 32, color: "#a1a1aa" }}>metto.ir</div>
      </RtlRow>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "28px",
        }}
      >
        {/* Names split into word nodes: a multi-word name in ONE text node
            lays out LTR internally ("عبدل آباد" would scan as "اباد عبدل").
            Nested row-reverse sub-rows keep intra-name spacing tight while
            the outer row separates origin / arrow / destination. */}
        <RtlRow
          gap={28}
          style={{
            fontSize: routeSize,
            fontWeight: 700,
            lineHeight: 1.25,
            whiteSpace: "nowrap",
            overflow: "hidden",
            maxWidth: "100%",
          }}
        >
          <RtlRow gap={14} style={{ overflow: "hidden", minWidth: 0 }}>
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
          </RtlRow>
          <div style={{ flexShrink: 0 }}>←</div>
          <RtlRow gap={14} style={{ overflow: "hidden", minWidth: 0 }}>
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
        </RtlRow>
        {timePhrase !== "" && (
          <RtlRow gap={16}>
            {timePhrase.split(" ").map((w, i) => (
              <div
                key={i}
                style={{
                  fontSize: 50,
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
      <RtlRow gap={10}>
        {"نقشه و مسیریابی مترو".split(" ").map((w, i) => (
          <div key={i} style={{ fontSize: 30, color: "#8e8e96" }}>
            {w}
          </div>
        ))}
      </RtlRow>
    </div>
  );
}
