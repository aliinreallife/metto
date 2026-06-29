import { STATIONS } from "./metro-data"

export type Point = { x: number; y: number }
export type Layout = {
  positions: Map<string, Point>
  width: number
  height: number
}

const VIEW = 1000 // logical canvas size
const PAD = 60

// Equirectangular projection scaled to the view box. At Tehran's latitude we
// scale longitude by cos(lat) so the city keeps its real proportions.
function project(): { lng2x: (lng: number) => number; lat2y: (lat: number) => number } {
  const lats = STATIONS.map((s) => s.lat)
  const lngs = STATIONS.map((s) => s.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const midLat = (minLat + maxLat) / 2
  const cos = Math.cos((midLat * Math.PI) / 180)

  const xMin = minLng * cos
  const xMax = maxLng * cos
  const spanX = xMax - xMin || 1
  const spanY = maxLat - minLat || 1
  const span = Math.max(spanX, spanY)

  const lng2x = (lng: number) => PAD + ((lng * cos - xMin) / span) * (VIEW - 2 * PAD)
  // invert Y (north up)
  const lat2y = (lat: number) => PAD + ((maxLat - lat) / span) * (VIEW - 2 * PAD)
  return { lng2x, lat2y }
}

export function geographicLayout(): Layout {
  const { lng2x, lat2y } = project()
  const positions = new Map<string, Point>()
  for (const s of STATIONS) {
    positions.set(s.id, { x: lng2x(s.lng), y: lat2y(s.lat) })
  }
  return { positions, width: VIEW, height: VIEW }
}

// Stylized schematic: keep each line's real geometry (so routes stay smooth,
// never zigzagged) but apply a radial "fisheye" expansion around the network
// centroid. This magnifies the dense city center where stations cram together,
// decluttering it into a cleaner transit-diagram feel while the outer reaches
// compress slightly. Angles from the centroid are preserved, so lines that are
// straight stay straight.
export function schematicLayout(): Layout {
  const geo = geographicLayout()
  const pts = [...geo.positions.values()]
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length
  const maxR = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) || 1

  // Exponent < 1 expands the center relative to the edge.
  const EXP = 0.62
  const positions = new Map<string, Point>()
  for (const [id, p] of geo.positions) {
    const dx = p.x - cx
    const dy = p.y - cy
    const r = Math.hypot(dx, dy)
    if (r < 1e-6) {
      positions.set(id, { x: cx, y: cy })
      continue
    }
    const rNorm = r / maxR
    const rNew = Math.pow(rNorm, EXP) * maxR
    const k = rNew / r
    positions.set(id, { x: cx + dx * k, y: cy + dy * k })
  }

  // Normalize back into the padded view box.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const span = Math.max(maxX - minX || 1, maxY - minY || 1)
  for (const [id, p] of positions) {
    positions.set(id, {
      x: PAD + ((p.x - minX) / span) * (VIEW - 2 * PAD),
      y: PAD + ((p.y - minY) / span) * (VIEW - 2 * PAD),
    })
  }

  return { positions, width: VIEW, height: VIEW }
}

// Edge building lives in ./graph so the map uses the same repaired adjacency
// (self-loops removed, line gaps bridged) as the routing engine.
export { buildLineEdges, type LineEdge } from "./graph"
