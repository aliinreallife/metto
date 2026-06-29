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

// Stylized schematic: snap the geographic positions onto a coarse grid so the
// dense city center declutters, then resolve collisions. This keeps the overall
// shape recognizable while giving a cleaner transit-diagram feel.
export function schematicLayout(): Layout {
  const geo = geographicLayout()
  const GRID = 26 // grid spacing in logical units
  const occupied = new Map<string, string>() // cell -> stationId
  const positions = new Map<string, Point>()

  const cellKey = (cx: number, cy: number) => `${cx},${cy}`

  // Place denser/lower-degree-first is unnecessary; iterate in stable order.
  const ordered = STATIONS.slice().sort((a, b) => {
    const pa = geo.positions.get(a.id)!
    const pb = geo.positions.get(b.id)!
    return pa.y - pb.y || pa.x - pb.x
  })

  for (const s of ordered) {
    const p = geo.positions.get(s.id)!
    let cx = Math.round(p.x / GRID)
    let cy = Math.round(p.y / GRID)
    // spiral out to nearest free cell on collision
    if (occupied.has(cellKey(cx, cy))) {
      let found = false
      for (let radius = 1; radius < 40 && !found; radius++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          for (let dy = -radius; dy <= radius && !found; dy++) {
            if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
            if (!occupied.has(cellKey(cx + dx, cy + dy))) {
              cx += dx
              cy += dy
              found = true
            }
          }
        }
      }
    }
    occupied.set(cellKey(cx, cy), s.id)
    positions.set(s.id, { x: cx * GRID, y: cy * GRID })
  }

  // Normalize to padded view box.
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
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1
  const span = Math.max(spanX, spanY)
  for (const [id, p] of positions) {
    positions.set(id, {
      x: PAD + ((p.x - minX) / span) * (VIEW - 2 * PAD),
      y: PAD + ((p.y - minY) / span) * (VIEW - 2 * PAD),
    })
  }

  return { positions, width: VIEW, height: VIEW }
}

export type LineEdge = { a: string; b: string; line: number }

// Unique undirected edges with the line they belong to (one entry per line
// between a connected pair) for drawing the network.
export function buildLineEdges(): LineEdge[] {
  const seen = new Set<string>()
  const edges: LineEdge[] = []
  const byId = new Map(STATIONS.map((s) => [s.id, s]))
  for (const s of STATIONS) {
    for (const relId of s.relations) {
      const rel = byId.get(relId)
      if (!rel) continue
      const shared = s.lines.filter((l) => rel.lines.includes(l))
      const lines = shared.length ? shared : s.lines
      for (const line of lines) {
        const k = [s.id, relId].sort().join("|") + "|" + line
        if (seen.has(k)) continue
        seen.add(k)
        edges.push({ a: s.id, b: relId, line })
      }
    }
  }
  return edges
}
