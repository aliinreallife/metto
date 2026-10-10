// Minimal route social-preview card (Satori-compatible host elements only).
//
// The 1200x630 canvas is intentionally split 720/480:
// - 720px live route map on the left (full-height, divider drawn inside it
//   so the canvas math stays exact: 720 + 480 = 1200)
// - 480px RTL route summary on the right
//
// Social previews answer only the glanceable questions: where from, where
// to, and which lines. Stops/transfers/timing/strip/slogan stay in Metto —
// the image is a teaser, and the share URL still carries the full state.
//
// RTL note: Satori does not reliably reorder Persian paragraphs. Multi-word
// Persian is therefore rendered as explicit word nodes inside row-reverse
// flex containers, preserving visual RTL without browser bidi assumptions.

import type { CSSProperties, ReactNode } from "react";
import { OG_PANEL, type ShareLineLeg, type ShareMapModel } from "./map";

const BRAND_RED = "#cc0e2d";
const INFO_W = 480;
const INFO_PAD_X = 48;
const DIM_TRACK_OPACITY = 0.35;

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
        <div
          key={`${word}-${i}`}
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minWidth: 0,
          }}
        >
          {word}
        </div>
      ))}
    </RtlRow>
  );
}

function BrandRow() {
  return (
    <RtlRow gap={12} style={{ width: "100%" }}>
      <div
        style={{
          width: "30px",
          height: "30px",
          borderRadius: "9px",
          background: BRAND_RED,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          lineHeight: 1,
          color: "#fafafa",
        }}
      >
        متو
      </div>
      <div
        style={{
          width: "1px",
          height: "24px",
          background: "#34343a",
          flexShrink: 0,
          marginLeft: "3px",
          marginRight: "3px",
        }}
      />
      <div
        dir="ltr"
        style={{
          fontSize: 24,
          lineHeight: 1,
          color: "#a1a1aa",
          whiteSpace: "nowrap",
        }}
      >
        metto.ir
      </div>
    </RtlRow>
  );
}

function StationBlock({
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
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
      }}
    >
      <RtlRow style={{ width: "100%" }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 400,
            color: "#8d8d97",
          }}
        >
          {label}
        </div>
      </RtlRow>
      <RtlWords
        text={name}
        gap={10}
        style={{
          width: "100%",
          fontSize,
          fontWeight: 700,
          lineHeight: 1.17,
          color: "#fafafa",
          whiteSpace: "nowrap",
          overflow: "hidden",
          maxWidth: "100%",
        }}
      />
    </div>
  );
}

// Box-only down arrow: avoids relying on arrow glyphs that may be absent
// from the embedded Vazirmatn fonts in the production ImageResponse
// runtime. Shaft + two rotated caps, all muted so it stays subtle.
function DownArrow() {
  return (
    <div
      style={{
        width: "30px",
        height: "42px",
        position: "relative",
        display: "flex",
        alignSelf: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "13px",
          top: 0,
          width: "4px",
          height: "29px",
          borderRadius: "2px",
          background: "#71717a",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "7px",
          top: "23px",
          width: "4px",
          height: "16px",
          borderRadius: "2px",
          background: "#71717a",
          transform: "rotate(-45deg)",
          transformOrigin: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "19px",
          top: "23px",
          width: "4px",
          height: "16px",
          borderRadius: "2px",
          background: "#71717a",
          transform: "rotate(45deg)",
          transformOrigin: "center",
        }}
      />
    </div>
  );
}

// Compact line legend in travel order, straight from the map model's legs
// (line/label/color — no topology logic duplicated here). Dots only, never
// pills.
function LineLegend({ legs }: { legs: ShareLineLeg[] }) {
  if (legs.length === 0) return null;
  return (
    <RtlRow
      gap={18}
      style={{
        width: "100%",
        minHeight: "34px",
      }}
    >
      {legs.map((leg) => (
        <RtlRow key={leg.line} gap={9}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 400,
              color: "#d4d4d8",
              whiteSpace: "nowrap",
            }}
          >
            {leg.label}
          </div>
          <div
            style={{
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: leg.color,
              flexShrink: 0,
            }}
          />
        </RtlRow>
      ))}
    </RtlRow>
  );
}

function stationFontSize(origin: string, destination: string): number {
  const longest = Math.max(origin.length, destination.length);
  // Tiers verified against renders: 14-char names (e.g. تهران (صادقیه))
  // already overflow 384px at 55px, so the 55px tier stops at 12 chars.
  if (longest <= 9) return 62;
  if (longest <= 12) return 55;
  if (longest <= 20) return 47;
  return 39;
}

export function renderShareCard(
  originDisplay: string,
  destDisplay: string,
  map: ShareMapModel | null,
) {
  const nameSize = stationFontSize(originDisplay, destDisplay);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        direction: "ltr",
        background: "#08090b",
        color: "#fafafa",
        fontFamily: "Vazirmatn",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Full-height live map: the route is the visual hook in social feeds. */}
      <div
        style={{
          width: `${OG_PANEL.w}px`,
          height: `${OG_PANEL.h}px`,
          position: "relative",
          display: "flex",
          background: "#0d0e11",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {map && (
          <div style={{ display: "flex" }}>
            {map.edges.map((e, i) => (
              <div
                key={`e${i}`}
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
                  transformOrigin: "center",
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
                  transformOrigin: "center",
                }}
              />
            ))}
            {map.dimJoints.map((d, i) => (
              <div
                key={`w${i}`}
                style={{
                  position: "absolute",
                  left: d.x - d.r,
                  top: d.y - d.r,
                  width: d.r * 2,
                  height: d.r * 2,
                  borderRadius: "50%",
                  background: d.fill,
                  opacity: DIM_TRACK_OPACITY,
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
                }}
              />
            ))}
          </div>
        )}
        {/* Divider drawn INSIDE the map panel so the canvas math stays
            exact (720 map + 480 info = 1200); a border would add width. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "1px",
            background: "#191a1f",
          }}
        />
      </div>

      {/* Minimal route summary: details are intentionally deferred to Metto. */}
      <div
        dir="rtl"
        style={{
          width: `${INFO_W}px`,
          height: "630px",
          display: "flex",
          flexDirection: "column",
          padding: `44px ${INFO_PAD_X}px 42px`,
          background: "#08090b",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <BrandRow />

        <div style={{ height: "58px", flexShrink: 0 }} />

        <StationBlock label="از" name={originDisplay} fontSize={nameSize} />

        <div style={{ height: "18px", flexShrink: 0 }} />
        <DownArrow />
        <div style={{ height: "12px", flexShrink: 0 }} />

        <StationBlock label="به" name={destDisplay} fontSize={nameSize} />

        <div style={{ flexGrow: 1, display: "flex" }} />

        {map && <LineLegend legs={map.legs} />}
      </div>
    </div>
  );
}
