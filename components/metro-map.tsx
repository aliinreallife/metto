"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Minus, Plus, Locate } from "lucide-react"
import { LINE_COLORS, STATIONS } from "@/lib/metro-data"
import { buildLineEdges, geographicLayout, schematicLayout, type Point } from "@/lib/layout"
import { STATION_MAP, type RouteResult } from "@/lib/route"
import { type Lang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Props = {
  mode: "geographic" | "schematic"
  lang: Lang
  route: RouteResult | null
  originId: string | null
  destId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}

type Transform = { scale: number; tx: number; ty: number }

const MIN_SCALE = 0.6
const MAX_SCALE = 9

export function MetroMap({ mode, lang, route, originId, destId, selectedId, onSelect }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const geo = useMemo(() => geographicLayout(), [])
  const sch = useMemo(() => schematicLayout(), [])
  const edges = useMemo(() => buildLineEdges(), [])
  const layout = mode === "geographic" ? geo : sch
  const positions = layout.positions

  const [t, setT] = useState<Transform>({ scale: 1, tx: 0, ty: 0 })
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null)
  // Active pointers (for multi-touch pinch) and the last pinch distance.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchDist = useRef<number | null>(null)

  const routeEdgeKeys = useMemo(() => {
    const set = new Set<string>()
    if (route) for (const h of route.hops) set.add([h.from, h.to].sort().join("|") + "|" + h.line)
    return set
  }, [route])

  const routeStations = useMemo(() => new Set(route?.path ?? []), [route])
  const hasRoute = !!route

  function clientToView(clientX: number, clientY: number): Point {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const p = pt.matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  function zoomAt(viewPt: Point, factor: number) {
    setT((prev) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))
      const f = scale / prev.scale
      return {
        scale,
        tx: viewPt.x - (viewPt.x - prev.tx) * f,
        ty: viewPt.y - (viewPt.y - prev.ty) * f,
      }
    })
  }

  // Non-passive wheel listener so we can prevent page scroll.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = clientToView(e.clientX, e.clientY)
      zoomAt(p, e.deltaY < 0 ? 1.15 : 1 / 1.15)
    }
    svg.addEventListener("wheel", onWheel, { passive: false })
    return () => svg.removeEventListener("wheel", onWheel)
  }, [])

  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      // A second finger landed: switch from panning to pinch-zoom.
      drag.current = null
      pinchDist.current = null
    } else {
      drag.current = { x: e.clientX, y: e.clientY, tx: t.tx, ty: t.ty, moved: false }
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = pointers.current.get(e.pointerId)
    if (p) {
      p.x = e.clientX
      p.y = e.clientY
    }

    // Two fingers → pinch to zoom around the gesture midpoint.
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchDist.current && pinchDist.current > 0 && dist > 0) {
        const mid = clientToView((a.x + b.x) / 2, (a.y + b.y) / 2)
        zoomAt(mid, dist / pinchDist.current)
      }
      pinchDist.current = dist
      return
    }

    // One finger → pan.
    const d = drag.current
    const svg = svgRef.current
    if (!d || !svg) return
    const ctm = svg.getScreenCTM()
    if (!ctm || !ctm.a || !ctm.d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    const vx = dx / ctm.a
    const vy = dy / ctm.d
    setT((prev) => ({ ...prev, tx: d.tx + vx, ty: d.ty + vy }))
  }
  function onPointerUp(e?: React.PointerEvent) {
    if (e) {
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
      pointers.current.delete(e.pointerId)
    } else {
      pointers.current.clear()
    }
    if (pointers.current.size < 2) pinchDist.current = null
    if (pointers.current.size === 0) {
      drag.current = null
    } else if (pointers.current.size === 1) {
      // Resume panning with the remaining finger.
      const [only] = [...pointers.current.values()]
      drag.current = { x: only.x, y: only.y, tx: t.tx, ty: t.ty, moved: true }
    }
  }

  function reset() {
    setT({ scale: 1, tx: 0, ty: 0 })
  }

  // Focus the view on the active route when it changes.
  useEffect(() => {
    if (!route || route.path.length === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of route.path) {
      const p = positions.get(id)
      if (!p) continue
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    const pad = 90
    const w = maxX - minX + pad * 2
    const h = maxY - minY + pad * 2
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(1000 / w, 1000 / h)))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setT({ scale, tx: 500 - cx * scale, ty: 500 - cy * scale })
  }, [route, mode, positions])

  const isFa = lang === "fa"
  const baseStroke = mode === "schematic" ? 6 : 4.5
  const lineWidth = baseStroke / Math.sqrt(t.scale)
  // Labels are sized in view units so that, after the transform's scale is
  // applied, they stay a constant ~13px on screen at any zoom — much easier to
  // read than letting them shrink/grow with the map.
  const labelFont = 13 / t.scale
  const labelHalo = 3.5 / t.scale

  function showLabel(id: string): boolean {
    if (routeStations.has(id)) return true
    if (id === originId || id === destId || id === selectedId) return true
    const s = STATION_MAP.get(id)
    if (s && s.lines.length > 1 && t.scale >= 2.2) return true
    return t.scale >= 3.4
  }

  return (
    <div className="relative size-full overflow-hidden rounded-xl border border-border bg-card">
      <svg
        ref={svgRef}
        viewBox="0 0 1000 1000"
        className="size-full touch-none select-none"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={() => {
          if (!drag.current?.moved) onSelect(null)
        }}
        role="img"
        aria-label="Tehran metro network map"
      >
        <g transform={`translate(${t.tx} ${t.ty}) scale(${t.scale})`}>
          {/* edges */}
          {edges.map((e, i) => {
            const a = positions.get(e.a)
            const b = positions.get(e.b)
            if (!a || !b) return null
            const inRoute = routeEdgeKeys.has([e.a, e.b].sort().join("|") + "|" + e.line)
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={LINE_COLORS[e.line]}
                strokeWidth={inRoute ? lineWidth * 1.7 : lineWidth}
                strokeLinecap="round"
                opacity={hasRoute ? (inRoute ? 1 : 0.18) : 0.85}
              />
            )
          })}

          {/* stations */}
          {STATIONS.map((s) => {
            const p = positions.get(s.id)
            if (!p) return null
            const interchange = s.lines.length > 1
            const onRoute = routeStations.has(s.id)
            const dim = hasRoute && !onRoute
            const isEndpoint = s.id === originId || s.id === destId
            const r = (interchange ? 5.5 : 3.8) / Math.sqrt(t.scale) * (isEndpoint ? 1.6 : 1)
            const stroke = interchange ? "var(--foreground)" : LINE_COLORS[s.lines[0]]
            return (
              <g
                key={s.id}
                opacity={dim ? 0.25 : 1}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!drag.current?.moved) onSelect(s.id)
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={interchange ? "var(--card)" : LINE_COLORS[s.lines[0]]}
                  stroke={stroke}
                  strokeWidth={(interchange ? 2.4 : 1.4) / Math.sqrt(t.scale)}
                />
                {isEndpoint && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 4 / Math.sqrt(t.scale)}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={2 / Math.sqrt(t.scale)}
                  />
                )}
                {showLabel(s.id) && (
                  <text
                    x={p.x + r + labelFont * 0.5}
                    y={p.y - r - labelFont * 0.3}
                    fontSize={labelFont}
                    className="pointer-events-none"
                    fill="var(--foreground)"
                    style={{
                      paintOrder: "stroke",
                      stroke: "var(--background)",
                      strokeWidth: labelHalo,
                      strokeLinejoin: "round",
                      fontWeight: onRoute || isEndpoint ? 800 : 600,
                    }}
                  >
                    {isFa ? s.fa : s.name}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <MapBtn label="Zoom in" onClick={() => zoomAt({ x: 500, y: 500 }, 1.3)}>
          <Plus className="size-4" />
        </MapBtn>
        <MapBtn label="Zoom out" onClick={() => zoomAt({ x: 500, y: 500 }, 1 / 1.3)}>
          <Minus className="size-4" />
        </MapBtn>
        <MapBtn label="Reset view" onClick={reset}>
          <Locate className="size-4" />
        </MapBtn>
      </div>
    </div>
  )
}

function MapBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-lg border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent",
      )}
    >
      {children}
    </button>
  )
}
