import type { Colliders } from '../world/colliders'

/** Opera room, metres from the room's origin (+x east, +z south). You come in through the south door facing north: vestibule and foyer with the two stair flights,
 *  the upper foyer (a gallery over the north end), then the horseshoe auditorium straight ahead and the stage at the far end. Pure data and collision, no THREE (tested in npm test). */
export const OP = {
  hw: 22, hd: 32,
  door: { x: 0, z: 32 },
  arrive: { x: 0, z: 30.3 },
  foyer: { hw: 14, z0: 8, z1: 32, H: 12 },
  up: 4.5,                                                    // level of the upper foyer and of the first tier
  stair: { xIn: 9.5, xOut: 14, zBot: 30, zTop: 14, n: 28 },   // two flights along the side walls, rising to the north
  aud: { cz: -7, R: 14, zEnd: -18.5, H: 20, stageC: { x: 0, z: -19 } }, // horseshoe: straight sides to the proscenium wall, semicircle (centre cz) at the back
  doorHW: 1.6,                                                // the passage from the foyer into the auditorium (both levels)
  pit: { z: -13.6, y: 0.04 },                                 // same level as the parterre (the city's ground plane would hide a sunken floor), behind a 1.1 m parapet
  stage: { y: 1.1, hw: 20, z1: -32, open: 7.2, top: 10.6 },
  tiers: [{ y: 4.5, rf: 11.2 }, { y: 7.9, rf: 11.7 }, { y: 11.3, rf: 12.2 }, { y: 14.7, rf: 12.7 }], // floor level and radius of the front of each tier
  usher: { x: 5.6, z: 10.9 }, desk: { x: 5.6, z: 12.2 },
  seatW: 0.56, rowGap: 1.5,
}

export interface PathPt { x: number; z: number; tx: number; tz: number; nx: number; nz: number } // position, tangent, outward normal

/** The horseshoe at radius r with k steps on each straight side and m on the arc (same k, m = same sampling at another radius). Runs west side (north to south), arc, east side. */
export function horseshoeN(r: number, k: number, m: number): PathPt[] {
  const { cz, zEnd } = OP.aud, out: PathPt[] = []
  for (let i = 0; i < k; i++) out.push({ x: -r, z: zEnd + (i * (cz - zEnd)) / k, tx: 0, tz: 1, nx: -1, nz: 0 })
  for (let i = 0; i <= m; i++) { const t = (i * Math.PI) / m; out.push({ x: -r * Math.cos(t), z: cz + r * Math.sin(t), tx: Math.sin(t), tz: Math.cos(t), nx: -Math.cos(t), nz: Math.sin(t) }) }
  for (let i = 1; i <= k; i++) out.push({ x: r, z: cz - (i * (cz - zEnd)) / k, tx: 0, tz: -1, nx: 1, nz: 0 })
  return out
}
export const horseshoe = (r: number, ds: number) => horseshoeN(r, Math.ceil((OP.aud.cz - OP.aud.zEnd) / ds), Math.ceil((Math.PI * r) / ds))

export interface Seat { x: number; y: number; z: number; yaw: number; row: number }
const faceStage = (x: number, z: number) => Math.atan2(OP.aud.stageC.x - x, OP.aud.stageC.z - z) // object yaw with its +z towards the stage
const insideHall = (x: number, z: number, r: number) => (z <= OP.aud.cz ? Math.abs(x) <= r : x * x + (z - OP.aud.cz) ** 2 <= r * r)

/** Parterre: concentric rows around the stage, a central aisle, clipped by the walls and the orchestra pit. */
export function parterreSeats(): Seat[] {
  const { stageC } = OP.aud, out: Seat[] = []
  for (let row = 0; row < 13; row++) {
    const rho = 7 + row * OP.rowGap, dphi = OP.seatW / rho
    for (let s = -1; s <= 1; s += 2) for (let i = 0; ; i++) {
      const phi = s * (0.9 / rho + (i + 0.5) * dphi), x = rho * Math.sin(phi), z = stageC.z + rho * Math.cos(phi)
      if (Math.abs(phi) > 1.45 || z < OP.pit.z + 1.2) break
      if (insideHall(x, z, OP.aud.R - 0.9)) out.push({ x, y: 0, z, yaw: faceStage(x, z), row })
    }
  }
  return out
}

/** One row of seats on the first tier, along the balcony front (an aisle at the door). */
export function tierSeats(): Seat[] {
  const t = OP.tiers[0], out: Seat[] = []
  for (const p of horseshoeN(t.rf + 0.75, 19, 62)) if (Math.abs(p.x) > 1.9 && p.z > OP.aud.zEnd + 2) out.push({ x: p.x, y: t.y, z: p.z, yaw: Math.atan2(-p.nx, -p.nz), row: 0 })
  return out
}

/** Neighbouring seats of a row merged into benches that can be sat on (collider = bench). */
export function seatGroups(seats: Seat[], n: number) {
  const out: { x: number; y: number; z: number; yaw: number; hw: number }[] = []
  for (let i = 0; i < seats.length;) {
    let j = i + 1
    while (j < seats.length && j - i < n && seats[j].row === seats[i].row && seats[j].y === seats[i].y && Math.hypot(seats[j].x - seats[j - 1].x, seats[j].z - seats[j - 1].z) < OP.seatW * 1.5) j++
    const g = seats.slice(i, j)
    out.push({ x: g.reduce((a, s) => a + s.x, 0) / g.length, y: g[0].y, z: g.reduce((a, s) => a + s.z, 0) / g.length, hw: (g.length * OP.seatW) / 2,
      yaw: Math.atan2(g.reduce((a, s) => a + Math.sin(s.yaw), 0), g.reduce((a, s) => a + Math.cos(s.yaw), 0)) })
    i = j
  }
  return out
}

/** Stair treads of one flight, from the bottom (south) to the top: z range and height of the top. */
export function stairSteps() {
  const { zBot, zTop, n } = OP.stair, run = (zBot - zTop) / n, rise = OP.up / n
  return Array.from({ length: n }, (_, i) => ({ z0: zBot - (i + 1) * run, z1: zBot - i * run, top: (i + 1) * rise }))
}

/** Rectangles covering the walkable ring of a tier between its front (rf) and the wall, as thin strips (the floors are rectangles, the hall is round). */
export function tierStrips(rf: number, w = 0.8) {
  const { cz, R, zEnd } = OP.aud, out: number[][] = []
  const edges = (a: number, b: number) => { const n = Math.ceil((b - a) / w); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n) }
  const outer = (x: number) => cz + Math.sqrt(Math.max(0, R * R - x * x))
  for (const [a, b, inner] of [[0, rf, true], [rf, R, false]] as const) {
    const e = edges(a, b)
    for (let i = 0; i < e.length - 1; i++) {
      const z0 = inner ? cz + Math.sqrt(rf * rf - e[i] * e[i]) : zEnd, z1 = outer(e[i + 1])
      if (z1 > z0 + 0.05) for (const s of [-1, 1]) out.push([Math.min(s * e[i], s * e[i + 1]), z0, Math.max(s * e[i], s * e[i + 1]), z1])
    }
  }
  return out
}

/** Everything solid in the room: walls, railings (they only block on the level they guard), stairs, furniture, seats. Origin (ox, oz) is the room centre in the world. */
export function addOperaColliders(c: Colliders, ox: number, oz: number) {
  const wall = (ax: number, az: number, bx: number, bz: number, h?: number, lo?: number) => c.add(ox + ax, oz + az, ox + bx, oz + bz, h, lo)
  const rect = (x: number, z: number, w: number, d: number, h: number) => c.addRect(ox + x, oz + z, w / 2, d / 2, 0, h)
  const { foyer: F, up, stair: S, aud: A, doorHW: D } = OP

  // foyer shell
  wall(-F.hw, F.z1, F.hw, F.z1); wall(-F.hw, F.z0, -F.hw, F.z1); wall(F.hw, F.z0, F.hw, F.z1)
  wall(-F.hw, F.z0, -D, F.z0); wall(D, F.z0, F.hw, F.z0)
  // passage to the auditorium, the auditorium's own wall (without the doorway), the proscenium wall, the pit
  const pz = A.cz + Math.sqrt(A.R * A.R - D * D)
  wall(-D, F.z0, -D, pz); wall(D, F.z0, D, pz)
  const hall = horseshoe(A.R + 0.2, 1.2)
  for (let i = 0; i < hall.length - 1; i++) { const a = hall[i], b = hall[i + 1]; if (Math.abs((a.x + b.x) / 2) > D + 0.1) wall(a.x, a.z, b.x, b.z) }
  wall(-A.R - 0.2, A.zEnd, A.R + 0.2, A.zEnd); wall(-A.R - 0.2, OP.pit.z, A.R + 0.2, OP.pit.z)

  // stairs: two flights along the side walls, solid below; the inner railing is a wall, the top joins the upper foyer
  const st = stairSteps(), rise = up / S.n
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -S.xOut : S.xIn, x1 = s < 0 ? -S.xIn : S.xOut
    c.addFloor(ox + x0, oz + S.zTop, ox + x1, oz + S.zBot, up, rise)
    wall(s * S.xIn, S.zTop, s * S.xIn, S.zBot)
  }
  c.addFloor(ox - F.hw, oz + F.z0, ox + F.hw, oz + S.zTop, up)       // upper foyer slab
  c.addFloor(ox - D, oz + pz - 0.5, ox + D, oz + F.z0, up) // passage floor
  wall(-S.xIn, S.zTop, S.xIn, S.zTop, up + 1.7, up)                   // balustrade of the upper foyer: only blocks up there
  for (const x of [-6.4, -3, 3, 6.4]) c.addBox(ox + x, oz + S.zTop, 0.45, up - 0.1) // columns under its edge

  // first tier: floor strips and the balcony railing along the horseshoe
  const t1 = OP.tiers[0]
  for (const [x0, z0, x1, z1] of tierStrips(t1.rf)) c.addFloor(ox + x0, oz + z0, ox + x1, oz + z1, t1.y)
  const rail = horseshoe(t1.rf, 1.2)
  for (let i = 0; i < rail.length - 1; i++) wall(rail[i].x, rail[i].z, rail[i + 1].x, rail[i + 1].z, t1.y + 1.7, t1.y)

  // furniture: cloakroom and box-office counters, usher's desk, statues, pedestals
  rect(-8.85, 9.6, 9.7, 1, 1.3); rect(-6.5, 31.35, 2.4, 0.7, 1.2); rect(6.5, 31.35, 2.4, 0.7, 1.2); rect(OP.desk.x, OP.desk.z, 1.8, 0.7, 1)
  for (const x of [-3.4, 3.4]) c.addBox(ox + x, oz + 19, 0.6, 2.4)
  // seats: groups of five are benches (click to sit); on the first tier too
  for (const g of [...seatGroups(parterreSeats(), 5), ...seatGroups(tierSeats(), 4)]) c.addBench(ox + g.x, oz + g.z, g.yaw, g.hw, 0.15, 0.5, g.y)
}
