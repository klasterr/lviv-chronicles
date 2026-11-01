/** Wall segments (with heights) and building footprints in a uniform grid.
 *  resolve() pushes a circle out of walls taller than the player's feet; groundAt() gives the roof height under a point. */
const CELL = 20
const HEAD = 1.7 // a wall that starts above the head (a mezzanine railing seen from the floor below) does not block
const STEP = 0.6 // highest step up onto an interior floor / stair
const key = (cx: number, cz: number) => (cx + 32768) * 65536 + cz + 32768 // numeric key: no string allocation per query

type Pt = number[]

export class Colliders {
  private grid = new Map<number, number[]>()
  private segs: number[] = [] // ax, az, bx, bz, h (top), lo (bottom) ...
  private fgrid = new Map<number, number[]>()
  private floors: { x0: number; z0: number; x1: number; z1: number; hA: number; hB: number }[] = []
  private bgrid = new Map<number, number[]>()
  private blds: { rings: Pt[][]; h: number }[] = []

  private cells(x0: number, z0: number, x1: number, z1: number, fn: (k: number) => void) {
    for (let cx = Math.floor(Math.min(x0, x1) / CELL); cx <= Math.floor(Math.max(x0, x1) / CELL); cx++)
      for (let cz = Math.floor(Math.min(z0, z1) / CELL); cz <= Math.floor(Math.max(z0, z1) / CELL); cz++) fn(key(cx, cz))
  }

  add(ax: number, az: number, bx: number, bz: number, h = Infinity, lo = -Infinity) {
    const i = this.segs.length / 6
    this.segs.push(ax, az, bx, bz, h, lo)
    this.cells(ax, az, bx, bz, (k) => { const l = this.grid.get(k); l ? l.push(i) : this.grid.set(k, [i]) })
  }

  /** Small axis-aligned obstacle (tree trunk, bench). */
  addBox(cx: number, cz: number, r: number, h: number) {
    this.add(cx - r, cz - r, cx + r, cz - r, h); this.add(cx + r, cz - r, cx + r, cz + r, h)
    this.add(cx + r, cz + r, cx - r, cz + r, h); this.add(cx - r, cz + r, cx - r, cz - r, h)
  }

  /** Interior floor (mezzanine, stairs): a rectangle whose height runs linearly from hA at z0 to hB at z1. groundAt() only offers it to feet at most STEP below it. */
  addFloor(x0: number, z0: number, x1: number, z1: number, hA: number, hB = hA) {
    const i = this.floors.length
    this.floors.push({ x0, z0, x1, z1, hA, hB })
    this.cells(x0, z0, x1, z1, (k) => { const l = this.fgrid.get(k); l ? l.push(i) : this.fgrid.set(k, [i]) })
  }

  /** Rotated rectangle obstacle (bench, table): half-sizes hw along local x, hd along local z, yaw as THREE rotation.y. h = top, lo = bottom (absolute heights). */
  addRect(cx: number, cz: number, hw: number, hd: number, yaw: number, h: number, lo = -Infinity) {
    const c = Math.cos(yaw), s = Math.sin(yaw) // local x -> (c, -s), local z -> (s, c)
    const pt = (lx: number, lz: number) => [cx + lx * c + lz * s, cz - lx * s + lz * c]
    const q = [pt(-hw, -hd), pt(hw, -hd), pt(hw, hd), pt(-hw, hd)]
    for (let i = 0; i < 4; i++) this.add(q[i][0], q[i][1], q[(i + 1) % 4][0], q[(i + 1) % 4][1], h, lo)
  }

  /** Benches are obstacles you can also sit on: registered here so the sitting logic can ray-pick them. */
  readonly benches: { x: number; z: number; yaw: number; hw: number; hd: number; h: number; y0: number }[] = []
  /** h = height above the bench's own floor y0 (0 outdoors, 3.2 on the restaurant's mezzanine). */
  addBench(x: number, z: number, yaw: number, hw: number, hd: number, h: number, y0 = 0) {
    this.benches.push({ x, z, yaw, hw, hd, h, y0 })
    this.addRect(x, z, hw, hd, yaw, y0 + h, y0 > 0 ? y0 : -Infinity)
  }

  /** Ray (unit direction) against the benches' boxes; nearest hit within `max` metres, with the hit's position along the bench (local x). */
  rayBench(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) {
    let best: { bench: Colliders['benches'][number]; t: number; lx: number } | null = null
    for (const b of this.benches) {
      if (Math.abs(b.x - ox) > max + b.hw || Math.abs(b.z - oz) > max + b.hw) continue // cheap reject before the slab test
      if (b.y0 > oy || b.y0 < oy - 3) continue // another storey (looking up through the mezzanine)
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw), px = ox - b.x, pz = oz - b.z
      const o = [px * c - pz * s, oy, px * s + pz * c], d = [dx * c - dz * s, dy, dx * s + dz * c] // world -> bench-local
      const lo = [-b.hw - 0.15, b.y0, -b.hd - 0.15], hi = [b.hw + 0.15, b.y0 + b.h + 0.1, b.hd + 0.15] // a little padding: easier to aim
      let t0 = 0, t1 = max
      for (let a = 0; a < 3 && t0 <= t1; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) t1 = -1; continue }
        let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a]
        if (ta > tb) [ta, tb] = [tb, ta]
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb)
      }
      if (t0 <= t1 && (!best || t0 < best.t)) best = { bench: b, t: t0, lx: o[0] + d[0] * t0 }
    }
    return best
  }

  addBuilding(rings: Pt[][], h: number) {
    const i = this.blds.length
    this.blds.push({ rings, h })
    const xs = rings[0].map((p) => p[0]), zs = rings[0].map((p) => p[1])
    this.cells(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), (k) => { const l = this.bgrid.get(k); l ? l.push(i) : this.bgrid.set(k, [i]) })
  }

  /** Height of the highest roof under (x, z); 0 = street level. Even-odd over all rings, so courtyards stay open.
   *  Interior floors count only when they are at most STEP above `y` (feet), so the floor under a mezzanine stays reachable. */
  groundAt(x: number, z: number, y = Infinity) {
    let top = 0
    for (const i of this.bgrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const b = this.blds[i]
      if (b.h <= top) continue
      let inside = false
      for (const ring of b.rings) for (let a = 0, c = ring.length - 1; a < ring.length; c = a++) {
        const [ax, az] = ring[a], [cx, cz] = ring[c]
        if ((az > z) !== (cz > z) && x < ((cx - ax) * (z - az)) / (cz - az) + ax) inside = !inside
      }
      if (inside) top = b.h
    }
    for (const i of this.fgrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const f = this.floors[i]
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue
      const h = f.hA + ((f.hB - f.hA) * (z - f.z0)) / (f.z1 - f.z0 || 1)
      if (h > top && h <= y + STEP) top = h
    }
    return top
  }

  /** Mutates p; y = feet height (walls lower than that don't block). */
  resolve(p: { x: number; z: number }, r: number, y = 0) {
    const s = this.segs
    for (let pass = 0; pass < 2; pass++) {
      this.cells(p.x - r, p.z - r, p.x + r, p.z + r, (k) => {
        for (const i of this.grid.get(k) ?? []) {
          if (y >= s[i * 6 + 4] - 0.05 || y + HEAD <= s[i * 6 + 5]) continue
          const ax = s[i * 6], az = s[i * 6 + 1], dx = s[i * 6 + 2] - ax, dz = s[i * 6 + 3] - az
          const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz || 1)))
          const qx = p.x - (ax + t * dx), qz = p.z - (az + t * dz), d = Math.hypot(qx, qz)
          if (d < r && d > 1e-6) { p.x += (qx / d) * (r - d); p.z += (qz / d) * (r - d) }
        }
      })
    }
    return p
  }
}
