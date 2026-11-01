// Lays out the street furniture of проспект Свободи from the GeoJSON geometry (carriageways, opera, monument plaza).
// The textual description only supplies *what* goes where (zones, spacing, object sizes); lengths and widths come from the data.
type Pt = number[]
type Carriageway = { k: string; p: Pt[]; w: number }

const LEN_DESC = 430 // length of the described section; zone boundaries are scaled by actual length / LEN_DESC
const ZONES = [85, 220, 350, 430] // end of: opera plaza, north boulevard, middle boulevard (chess), monument plaza
// cross-section of the boulevard as fractions of its clear width (description: 3.5 | 5.5 | 9 | 5.5 | 3.5 of 27 m)
const F_CENTRE = 4.5 / 27, F_GREEN = 10 / 27
const r2 = (v: number) => +v.toFixed(2)

export function layoutAvenue(avenue: Carriageway[], opera: Pt[], monument: Pt[]) {
  const xAt = (poly: Pt[], z: number) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[i + 1]
      if (az !== bz && (az - z) * (bz - z) <= 0) return ax + ((bx - ax) * (z - az)) / (bz - az)
    }
    return NaN
  }
  const car = (k: string, z: number) => { for (const r of avenue) if (r.k === k) { const x = xAt(r.p, z); if (!isNaN(x)) return x } return NaN }

  const halfW = (avenue.find((r) => r.k === 'primary')!.w + avenue.find((r) => r.k === 'secondary')!.w) / 2 // the two carriageways' half widths (OSM lanes x 3.1 m)
  const zStart = Math.max(...opera.map((q) => q[1])) // front of the opera (it faces south)
  const mx = monument.reduce((a, q) => a + q[0], 0) / monument.length, mz = monument.reduce((a, q) => a + q[1], 0) / monument.length

  // sample the promenade axis (midway between the carriageways) by z, with arc length s from the opera front
  const S: { z: number; s: number; cx: number; wp: number }[] = []
  let s = 0, prev: { cx: number; z: number } | null = null
  for (let z = zStart; z <= mz; z += 0.25) {
    const w = car('primary', z), e = car('secondary', z)
    if (isNaN(w) || isNaN(e)) throw new Error(`avenue carriageways not found at z=${z}`)
    const cx = (w + e) / 2
    if (prev) s += Math.hypot(cx - prev.cx, z - prev.z)
    const slope = (car('primary', z + 0.5) + car('secondary', z + 0.5)) / 2 - cx
    const nx = 1 / Math.hypot(slope / 0.5, 1)
    S.push({ z, s, cx, wp: (e - w) * nx - halfW }) // clear width: centre-to-centre distance minus the two half-carriageways
    prev = { cx, z }
  }
  const L = S[S.length - 1].s, f = L / LEN_DESC
  const zoneEnd = ZONES.map((v) => v * f)

  const at = (sv: number) => { // frame at arc length sv
    let i = 0
    while (i < S.length - 2 && S[i + 1].s < sv) i++
    const a = S[i], b = S[Math.min(i + 1, S.length - 1)]
    const t = b.s > a.s ? (sv - a.s) / (b.s - a.s) : 0
    const cx = a.cx + (b.cx - a.cx) * t, z = a.z + (b.z - a.z) * t, wp = a.wp + (b.wp - a.wp) * t
    const dx = b.cx - a.cx, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
    const tx = dx / l, tz = dz / l // tangent: towards the south-east
    return { cx, z, wp, tx, tz, nx: tz, nz: -tx } // normal points east
  }
  const P = (sv: number, u: number) => { const a = at(sv); return { x: a.cx + a.nx * u, z: a.z + a.nz * u, a } }
  const facing = (a: ReturnType<typeof at>, side: number) => r2(Math.atan2(-a.nx * side, -a.nz * side)) // yaw looking at the axis from `side`

  const trees: number[][] = [], benches: number[][] = [], lamps: number[][] = []
  const BENCH_PARK = 0, BENCH_LONG = 1, BENCH_ARC = 2

  // zone 1: opera plaza
  const fs = Math.min(32 + 12.5, zoneEnd[0] - 14) // fountain centre: 32 m from the steps + half its length
  const F = P(fs, 0)
  const fountain = { x: r2(F.x), z: r2(F.z), yaw: r2(Math.atan2(F.a.tx, F.a.tz)), len: 25, wid: 11 }
  for (const side of [-1, 1]) for (const ds of [-13.5, -4.5, 4.5, 13.5]) { // 8 long benches, 8 m from the water
    const p = P(fs + ds, side * (5.5 + 8 + 0.4))
    benches.push([r2(p.x), r2(p.z), facing(p.a, side), BENCH_LONG])
  }
  for (let sv = 3.75, n = 0; sv < zoneEnd[0] - 2; sv += 7.5, n++) for (const side of [-1, 1]) { // maples in grates along the plaza edges
    const p = P(sv, side * (at(sv).wp / 2 - 3)); trees.push([r2(p.x), r2(p.z), n, 1])
  }

  // zones 2-3: four rows of chestnuts / lindens, benches facing the central promenade, lamps on the outer edge of the green strips
  for (let sv = zoneEnd[0] + 3, n = 0; sv < zoneEnd[3] - 12; sv += 7.5, n++) for (const side of [-1, 1]) {
    const a = at(sv), inner = P(sv, side * (F_CENTRE + 0.2 * (F_GREEN - F_CENTRE)) * a.wp), outer = P(sv + 3.75, side * (F_CENTRE + 0.75 * (F_GREEN - F_CENTRE)) * a.wp)
    trees.push([r2(inner.x), r2(inner.z), n, n % 4 === 3 ? 2 : 0], [r2(outer.x), r2(outer.z), n + 50, (n + 2) % 4 === 3 ? 2 : 0])
  }
  const benchSteps: [number, number, number][] = [[zoneEnd[0] + 8, zoneEnd[1], 15], [zoneEnd[1] + 5, zoneEnd[3] - 12, 11]]
  for (const [from, to, step] of benchSteps) for (let sv = from; sv < to; sv += step) for (const side of [-1, 1]) {
    const a = at(sv), p = P(sv, side * (F_CENTRE + 0.02) * a.wp)
    benches.push([r2(p.x), r2(p.z), facing(a, side), BENCH_PARK])
  }
  for (let sv = 9; sv < zoneEnd[3] - 10; sv += 18) for (const side of [-1, 1]) {
    const p = P(sv, side * F_GREEN * at(sv).wp); lamps.push([r2(p.x), r2(p.z), r2(Math.atan2(p.a.tx, p.a.tz))]) // arms across the street
  }

  // chess corner in the east green strip (zone 3) and a drinking fountain at ~260 m (scaled) on the strip edge
  const cs = zoneEnd[1] + 0.4 * (zoneEnd[2] - zoneEnd[1]), cu = (F_CENTRE + 0.5 * (F_GREEN - F_CENTRE)) * at(cs).wp
  const chess: number[][] = []
  for (const ds of [-4.5, 0, 4.5]) for (const du of [-2, 2]) {
    const p = P(cs + ds, cu + du), a = p.a
    chess.push([r2(p.x), r2(p.z), r2(Math.atan2(a.tx, a.tz))])
    for (const bs of [-1.35, 1.35]) { const b = P(cs + ds + bs, cu + du); benches.push([r2(b.x), r2(b.z), r2(Math.atan2(-bs * a.tx, -bs * a.tz)), BENCH_PARK]) }
  }
  const dp = P(260 * f, F_GREEN * at(260 * f).wp)
  const drinking = { x: r2(dp.x), z: r2(dp.z) }

  // zone 4: monument plaza (the GeoJSON pedestrian area): Shevchenko, "Wave" stele, two sector lawns, 12 arc benches
  const a4 = at(L), yaw = r2(Math.atan2(-a4.tx, -a4.tz)) // the poet faces up the avenue, towards the opera
  const stele = { x: r2(mx + a4.tx * 4 - a4.nx * 5.5), z: r2(mz + a4.tz * 4 - a4.nz * 5.5) }
  const steleYaw = r2(Math.atan2(mx - stele.x, mz - stele.z))
  const beds = [{ ang: Math.atan2(a4.tx, a4.tz) }, { ang: Math.atan2(a4.nx, a4.nz) }].map((b) => ({ x: r2(mx), z: r2(mz), r0: 3.5, r1: 12, ang: r2(b.ang), span: r2(1.25) }))
  const stAng = Math.atan2(stele.x - mx, stele.z - mz)
  for (let i = 0, n = 0; i < 16 && n < 12; i++) {
    const ang = (i / 16) * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(ang - stAng), Math.cos(ang - stAng))) < 0.6) continue // keep the stele side clear
    benches.push([r2(mx + Math.sin(ang) * 13.4), r2(mz + Math.cos(ang) * 13.4), r2(ang + Math.PI), BENCH_ARC]); n++
  }

  // ground strips: light granite over the whole opera plaza and the central 9 m promenade, lawns in the green strips; the
  // 3.5 m buffers next to the carriageways stay cobbles. The monument plaza itself is the GeoJSON pedestrian area.
  const ribbons: { kind: string; l: number[][]; r: number[][] }[] = []
  const ribbon = (kind: string, s0: number, s1: number, f0: number, f1: number) => {
    const l: number[][] = [], r: number[][] = []
    for (let sv = s0; sv < s1 + 4; sv += 4) {
      const t = Math.min(sv, s1), w = at(t).wp, a = P(t, f0 * w), b = P(t, f1 * w)
      l.push([r2(a.x), r2(a.z)]); r.push([r2(b.x), r2(b.z)])
    }
    ribbons.push({ kind, l, r })
  }
  ribbon('granite', 0, zoneEnd[0], -0.5, 0.5)
  const sEnd = L - 33 // the oval plaza begins here
  ribbon('granite', zoneEnd[0], sEnd, -F_CENTRE, F_CENTRE)
  ribbon('grass', zoneEnd[0], sEnd, -F_GREEN, -F_CENTRE)
  ribbon('grass', zoneEnd[0], sEnd, F_CENTRE, F_GREEN)

  const sp = P(zoneEnd[0] + 2, 0) // spawn: start of the boulevard on the central promenade, looking back at the opera
  const spawn = { x: r2(sp.x), z: r2(sp.z), yaw: r2(Math.atan2(sp.a.tx, sp.a.tz)) } // camera forward = (-sin yaw, -cos yaw), i.e. against the avenue's direction

  return {
    spawn, trees, benches, lamps, fountain, chess, drinking, beds, ribbons, plaza: monument.map((q) => [r2(q[0]), r2(q[1])]),
    monument: { x: r2(mx), z: r2(mz), yaw, stele, steleYaw },
    stats: { lengthM: Math.round(L), widthM: Math.round(S[0].wp) + '..' + Math.round(S[S.length - 1].wp), zones: zoneEnd.map(Math.round), trees: trees.length, benches: benches.length, lamps: lamps.length },
  }
}
