import { STATIONS, type Station } from "./metro-data"
import { ROUTE_ADJ as ADJ, STATION_BY_ID } from "./graph"

export const STATION_MAP: Map<string, Station> = STATION_BY_ID

// Cost model for "fewest stops + fewest transfers".
// Each hop between adjacent stations costs RIDE_COST.
// Each line change costs TRANSFER_PENALTY (≈ several stops of inconvenience).
const RIDE_COST = 1
const TRANSFER_PENALTY = 5

// Rough time estimate for the UI only.
const SECONDS_PER_STOP = 110
const SECONDS_PER_TRANSFER = 240

type Hop = { from: string; to: string; line: number }

export type RouteSegment = {
  line: number
  stations: string[] // ordered station ids, inclusive of board & alight
}

export type RouteResult = {
  hops: Hop[]
  segments: RouteSegment[]
  path: string[] // ordered station ids
  numStops: number
  numTransfers: number
  estimatedSeconds: number
}

type StateKey = string // `${stationId}|${line}`

function key(station: string, line: number): StateKey {
  return `${station}|${line}`
}

// Dijkstra over (station, current line) states so we can charge transfer cost.
export function findRoute(originId: string, destId: string): RouteResult | null {
  if (originId === destId) return null
  if (!STATION_MAP.has(originId) || !STATION_MAP.has(destId)) return null

  const dist = new Map<StateKey, number>()
  const prev = new Map<StateKey, { state: StateKey; hop: Hop } | null>()

  // Simple binary-heap-free priority via array; graph is small (150 nodes).
  const pq: { cost: number; state: StateKey }[] = []
  const push = (cost: number, state: StateKey) => {
    pq.push({ cost, state })
    let i = pq.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (pq[p].cost <= pq[i].cost) break
      ;[pq[p], pq[i]] = [pq[i], pq[p]]
      i = p
    }
  }
  const pop = () => {
    const top = pq[0]
    const last = pq.pop()!
    if (pq.length) {
      pq[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let m = i
        if (l < pq.length && pq[l].cost < pq[m].cost) m = l
        if (r < pq.length && pq[r].cost < pq[m].cost) m = r
        if (m === i) break
        ;[pq[m], pq[i]] = [pq[i], pq[m]]
        i = m
      }
    }
    return top
  }

  const origin = STATION_MAP.get(originId)!
  for (const line of origin.lines) {
    const k = key(originId, line)
    dist.set(k, 0)
    prev.set(k, null)
    push(0, k)
  }

  let best: { cost: number; state: StateKey } | null = null

  while (pq.length) {
    const { cost, state } = pop()
    if (cost > (dist.get(state) ?? Infinity)) continue
    const [stationId, lineStr] = state.split("|")
    const curLine = Number(lineStr)

    if (stationId === destId) {
      if (!best || cost < best.cost) best = { cost, state }
      continue
    }

    for (const edge of ADJ.get(stationId) ?? []) {
      for (const line of edge.lines) {
        const transferred = line !== curLine
        const nextCost = cost + RIDE_COST + (transferred ? TRANSFER_PENALTY : 0)
        const nk = key(edge.to, line)
        if (nextCost < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nextCost)
          prev.set(nk, { state, hop: { from: stationId, to: edge.to, line } })
          push(nextCost, nk)
        }
      }
    }
  }

  if (!best) return null

  // Reconstruct hops.
  const hops: Hop[] = []
  let cur: StateKey | null = best.state
  while (cur) {
    const entry = prev.get(cur)
    if (!entry) break
    hops.unshift(entry.hop)
    cur = entry.state
  }

  if (!hops.length) return null

  // Build ordered path.
  const path: string[] = [hops[0].from]
  for (const h of hops) path.push(h.to)

  // Group hops into segments by line.
  const segments: RouteSegment[] = []
  for (const h of hops) {
    const last = segments[segments.length - 1]
    if (last && last.line === h.line) {
      last.stations.push(h.to)
    } else {
      segments.push({ line: h.line, stations: [h.from, h.to] })
    }
  }

  const numStops = hops.length
  const numTransfers = Math.max(0, segments.length - 1)
  const estimatedSeconds = numStops * SECONDS_PER_STOP + numTransfers * SECONDS_PER_TRANSFER

  return { hops, segments, path, numStops, numTransfers, estimatedSeconds }
}

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/\u200c/g, " ")
    .replace(/[ك]/g, "ک")
    .replace(/[ي]/g, "ی")
    .trim()
}

export function searchStations(query: string, limit = 30): Station[] {
  const q = normalize(query)
  if (!q) return STATIONS.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit)
  const scored: { s: Station; score: number }[] = []
  for (const s of STATIONS) {
    const en = normalize(s.name)
    const fa = normalize(s.fa)
    let score = -1
    if (en.startsWith(q) || fa.startsWith(q)) score = 0
    else if (en.includes(q) || fa.includes(q)) score = 1
    if (score >= 0) scored.push({ s, score })
  }
  scored.sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name))
  return scored.slice(0, limit).map((x) => x.s)
}
