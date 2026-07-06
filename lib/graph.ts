import { STATIONS, type Station } from "./metro-data"

// The upstream dataset has a few integrity issues (self-loops and a missing
// link that splits Line 1 into a disconnected island). This module produces a
// repaired, symmetric, self-loop-free adjacency that both the routing engine
// and the map rendering build on, so any fix applies everywhere at once.

export const STATION_BY_ID: Map<string, Station> = new Map(STATIONS.map((s) => [s.id, s]))

function dist(a: Station, b: Station): number {
  // Equirectangular distance is fine for nearest-neighbor comparisons here.
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const dx = (a.lng - b.lng) * cos
  const dy = a.lat - b.lat
  return Math.hypot(dx, dy)
}

function sharedLines(a: Station, b: Station): number[] {
  return a.lines.filter((l) => b.lines.includes(l))
}

// stationId -> set of neighbor stationIds (undirected, no self-loops).
const ADJACENCY: Map<string, Set<string>> = (() => {
  const adj = new Map<string, Set<string>>()
  for (const s of STATIONS) adj.set(s.id, new Set())

  const link = (a: string, b: string) => {
    if (a === b) return // drop self-loops
    if (!STATION_BY_ID.has(a) || !STATION_BY_ID.has(b)) return
    if (STATION_BY_ID.get(a)?.disabled || STATION_BY_ID.get(b)?.disabled) return
    adj.get(a)!.add(b)
    adj.get(b)!.add(a) // enforce symmetry
  }

  // 1) Seed from the dataset's declared relations.
  for (const s of STATIONS) {
    for (const rel of s.relations) link(s.id, rel)
  }

  // 2) Repair each metro line: the stations on a line must form one connected
  //    chain. Where the data leaves gaps, bridge the closest stations on that
  //    same line until the line is a single connected component.
  const allLines = [...new Set(STATIONS.flatMap((s) => s.lines))]
  for (const line of allLines) {
    const onLine = STATIONS.filter((s) => s.lines.includes(line) && !s.disabled)
    if (onLine.length < 2) continue

    // Components within this line using only same-line edges.
    const components = (): string[][] => {
      const seen = new Set<string>()
      const comps: string[][] = []
      for (const s of onLine) {
        if (seen.has(s.id)) continue
        const stack = [s.id]
        seen.add(s.id)
        const comp: string[] = []
        while (stack.length) {
          const cur = stack.pop()!
          comp.push(cur)
          for (const n of adj.get(cur)!) {
            const ns = STATION_BY_ID.get(n)!
            if (ns.lines.includes(line) && !seen.has(n)) {
              seen.add(n)
              stack.push(n)
            }
          }
        }
        comps.push(comp)
      }
      return comps
    }

    let comps = components()
    let guard = 0
    while (comps.length > 1 && guard++ < onLine.length) {
      // Merge component 0 with its nearest other component.
      const base = comps[0]
      let best: { a: string; b: string; d: number } | null = null
      for (const aId of base) {
        const a = STATION_BY_ID.get(aId)!
        for (let ci = 1; ci < comps.length; ci++) {
          for (const bId of comps[ci]) {
            const d = dist(a, STATION_BY_ID.get(bId)!)
            if (!best || d < best.d) best = { a: aId, b: bId, d }
          }
        }
      }
      if (!best) break
      link(best.a, best.b)
      comps = components()
    }
  }

  return adj
})()

export type Edge = { to: string; lines: number[] }

// Routing adjacency: for each neighbor, the lines you can actually ride.
export const ROUTE_ADJ: Map<string, Edge[]> = (() => {
  const out = new Map<string, Edge[]>()
  for (const [id, neighbors] of ADJACENCY) {
    const s = STATION_BY_ID.get(id)!
    const edges: Edge[] = []
    for (const to of neighbors) {
      const rel = STATION_BY_ID.get(to)!
      const shared = sharedLines(s, rel)
      edges.push({ to, lines: shared.length ? shared : s.lines })
    }
    out.set(id, edges)
  }
  return out
})()

export type LineEdge = { a: string; b: string; line: number }

// Unique undirected edges with the line they belong to, for drawing the map.
export function buildLineEdges(): LineEdge[] {
  const seen = new Set<string>()
  const edges: LineEdge[] = []
  for (const [id, neighbors] of ADJACENCY) {
    const s = STATION_BY_ID.get(id)!
    for (const to of neighbors) {
      const rel = STATION_BY_ID.get(to)!
      const shared = sharedLines(s, rel)
      const lines = shared.length ? shared : s.lines
      for (const line of lines) {
        const k = [id, to].sort().join("|") + "|" + line
        if (seen.has(k)) continue
        seen.add(k)
        edges.push({ a: id, b: to, line })
      }
    }
  }
  return edges
}
