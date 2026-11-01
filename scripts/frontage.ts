// Finds the street-facing frontage of a building footprint: the longest run of (nearly collinear) walls whose outward
// normal looks at the nearest avenue carriageway. All numbers come from the GeoJSON geometry.
type Pt = number[]
export interface Front { a: Pt; b: Pt; n: Pt; len: number; off: number; dist: number } // a = left end seen from the street, b = right end; off = how far the real wall bulges out of the chord

const area = (r: Pt[]) => r.reduce((s, p, i) => s + (p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1]), 0) / 2

function nearest(p: Pt, lines: Pt[][]) {
  let best = { d: Infinity, q: [0, 0] }
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
    const [ax, az] = l[i], [bx, bz] = l[i + 1], dx = bx - ax, dz = bz - az
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / (dx * dx + dz * dz || 1)))
    const q = [ax + dx * t, az + dz * t], d = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (d < best.d) best = { d, q }
  }
  return best
}

/** Frontage along an explicit wall: from footprint vertex i0 to vertex i1 (indices into the OSM ring), facing the nearest carriageway. */
export function frontFromVerts(outer: Pt[], i0: number, i1: number, lines: Pt[][]): Front {
  const p0 = outer[i0], p1 = outer[i1], dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz)
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], nr = nearest(mid, lines)
  let n = [dz / len, -dx / len]
  if (n[0] * (nr.q[0] - mid[0]) + n[1] * (nr.q[1] - mid[1]) < 0) n = [-n[0], -n[1]]
  // seen from the street (looking along -n) the right-hand direction is (nz, -nx); a is the left end
  const [a, b] = dx * n[1] - dz * n[0] > 0 ? [p0, p1] : [p1, p0]
  let off = 0
  for (let k = Math.min(i0, i1); k <= Math.max(i0, i1); k++) off = Math.max(off, (outer[k][0] - p0[0]) * n[0] + (outer[k][1] - p0[1]) * n[1])
  return { a, b, n: n.map((v) => +v.toFixed(3)), len: +len.toFixed(2), off: +off.toFixed(2), dist: +nr.d.toFixed(1) }
}

export function findFront(outer: Pt[], lines: Pt[][], maxDist = 30): Front | null {
  const ring = area(outer) > 0 ? outer : [...outer].reverse()
  const N = ring.length, E: { i: number; ok: boolean; len: number; ang: number }[] = []
  for (let i = 0; i < N; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % N], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz)
    const n = [dz / len, -dx / len], mid = [(ax + bx) / 2, (az + bz) / 2], nr = nearest(mid, lines)
    const dir = [(nr.q[0] - mid[0]) / (nr.d || 1), (nr.q[1] - mid[1]) / (nr.d || 1)]
    E.push({ i, ok: len > 1.5 && nr.d < maxDist && n[0] * dir[0] + n[1] * dir[1] > 0.8, len, ang: Math.atan2(dz, dx) })
  }
  // runs of consecutive ok edges whose direction changes < 15 degrees per step; start after a non-ok/kinked edge
  let best: { s: number; e: number; chord: number } | null = null
  const start = E.findIndex((e) => !e.ok)
  const order = start < 0 ? [...E.keys()] : [...E.keys()].map((k) => (k + start) % N)
  let run: number[] = []
  const flush = () => {
    if (run.length) {
      const a = ring[run[0]], b = ring[(run[run.length - 1] + 1) % N], chord = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (chord > (best?.chord ?? 0)) best = { s: run[0], e: run[run.length - 1], chord }
    }
    run = []
  }
  for (const k of order) {
    const e = E[k]
    if (!e.ok) { flush(); continue }
    if (run.length) { const d = Math.abs(Math.atan2(Math.sin(e.ang - E[run[run.length - 1]].ang), Math.cos(e.ang - E[run[run.length - 1]].ang))); if (d > 0.26) flush() }
    run.push(k)
  }
  flush()
  const bb = best as { s: number; e: number; chord: number } | null
  if (!bb || bb.chord < 5) return null
  const p0 = ring[bb.s], p1 = ring[(bb.e + 1) % N], dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz)
  const n = [dz / len, -dx / len]
  let off = 0
  for (let k = bb.s; ; k = (k + 1) % N) { const p = ring[k]; off = Math.max(off, (p[0] - p0[0]) * n[0] + (p[1] - p0[1]) * n[1]); if (k === bb.e) break }
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
  // traversal runs right-to-left as seen from outside: swap so that a is the left end
  return { a: p1.map((v) => +v.toFixed(2)), b: p0.map((v) => +v.toFixed(2)), n: n.map((v) => +v.toFixed(3)), len: +len.toFixed(2), off: +off.toFixed(2), dist: +nearest(mid, lines).d.toFixed(1) }
}
