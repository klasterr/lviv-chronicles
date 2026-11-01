import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { part, box, cyl, T } from '../world/props'
import { OP, horseshoe, horseshoeN, parterreSeats, tierSeats, stairSteps, type Seat } from './layout'
import { buildUsher } from './usher'
import { RECT, drawAtlas, drawMarble, quad, type Rect } from './atlas'

const MARBLE = 0xeee8dc, ROSE = 0xcfa89a, GOLD = 0xd9ae3e, CREAM = 0xeadfc4, RED = 0xa5141f, DRED = 0x6e0f18, WOOD = 0x6a4a30, DARK = 0x2a2326, CARPET = 0x8a1522
type G = THREE.BufferGeometry
/** Draw a little in front of whatever is at the same depth: the room's floor lies 2 cm above the city's ground plane (drawn later), which wins depth ties at a distance. */
const pull = (n: number) => ({ polygonOffset: true, polygonOffsetFactor: -n, polygonOffsetUnits: -n })
const Rx = (a: number) => new THREE.Matrix4().makeRotationX(a), Ry = (a: number) => new THREE.Matrix4().makeRotationY(a)

/** Flat horizontal strip between the horseshoes rIn and rOut at height y (same sampling, so the quads line up). */
function ringGeo(rIn: number, rOut: number, y: number, color: number, up: boolean) {
  const A = horseshoeN(rIn, 12, 40), B = horseshoeN(rOut, 12, 40), p: number[] = []
  for (let i = 0; i < A.length - 1; i++) {
    const [a0, a1, b0, b1] = [A[i], A[i + 1], B[i], B[i + 1]], v = (q: typeof a0) => [q.x, y, q.z]
    p.push(...(up ? [...v(a0), ...v(b0), ...v(a1), ...v(a1), ...v(b0), ...v(b1)] : [...v(a0), ...v(a1), ...v(b0), ...v(a1), ...v(b1), ...v(b0)]))
  }
  return flat(p, color)
}
/** Fan from (cx, cz) over the points (a closed convex outline) at height y. */
function fanGeo(pts: { x: number; z: number }[], cx: number, cz: number, y: number, color: number, up: boolean) {
  const p: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    p.push(cx, y, cz, ...(up ? [a.x, y, a.z, b.x, y, b.z] : [b.x, y, b.z, a.x, y, a.z]))
  }
  return flat(p, color)
}
function flat(p: number[], color: number) {
  const g = new THREE.BufferGeometry(), c = new THREE.Color(color), n = p.length / 3
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n * 2).fill(0), 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3))
  g.computeVertexNormals()
  return g
}

/** The opera room built at world position (ox, oz): one merged lit mesh, one glow mesh, one lit atlas mesh, the marble floor, the seats (instanced). Collision is in layout.ts. */
export function buildHall(ox: number, oz: number, shadows: boolean) {
  const solid: G[] = [], glow: G[] = [], atl: G[] = []
  const b = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => solid.push(box(w, h, d, c, x, y, z))
  const gl = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => glow.push(box(w, h, d, c, x, y, z))
  const rb = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, yaw: number, list = solid) => list.push(part(new THREE.BoxGeometry(w, h, d), c, T(x, y, z).multiply(Ry(yaw))))
  /** Panel from the atlas: facing yaw (local +z = (sin, cos)), or ceiling = facing down. */
  const panel = (w: number, h: number, r: Rect, x: number, y: number, z: number, yaw = 0) => atl.push(quad(w, h, r).rotateY(yaw).translate(x, y, z))
  const { foyer: F, up, stair: S, aud: A, tiers: TI, stage: ST, doorHW: D } = OP, H = F.H, R = A.R
  const pts = (r: number, ds = 1.4) => horseshoe(r, ds)
  /** A band along the horseshoe at radius r: height h centred on y, thickness t. */
  const band = (r: number, y: number, h: number, t: number, c: number, skip = 0, ds = 1.4) => {
    const p = pts(r, ds)
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], q = p[i + 1], dx = q.x - a.x, dz = q.z - a.z
      if (skip && Math.abs((a.x + q.x) / 2) < skip && a.z > A.cz) continue
      rb(Math.hypot(dx, dz) + 0.03, h, t, c, (a.x + q.x) / 2, y, (a.z + q.z) / 2, Math.atan2(-dz, dx))
    }
  }

  // ======================= foyer shell: marble hall, 12 m high, gilded pilasters, skylight
  b(0.4, H, 24, CREAM, -14.2, H / 2, 20); b(0.4, H, 24, CREAM, 14.2, H / 2, 20)                 // side walls
  b(12.4, H, 0.4, CREAM, -7.8, H / 2, 32.2); b(12.4, H, 0.4, CREAM, 7.8, H / 2, 32.2)           // south wall with the door gap
  b(3.2, H - 3.9, 0.4, CREAM, 0, (H + 3.9) / 2, 32.2)
  b(12.4, H, 0.4, CREAM, -7.8, H / 2, 7.8); b(12.4, H, 0.4, CREAM, 7.8, H / 2, 7.8)              // north wall with the auditorium doorway
  b(28.8, 0.4, 24.4, CREAM, 0, H + 0.2, 20)                                                     // ceiling
  for (const s of [-1, 1]) {
    b(0.1, 1.3, 24, ROSE, s * 13.95, 0.65, 20); b(0.14, 0.12, 24, GOLD, s * 13.93, 1.3, 20)       // marble dado
    b(0.5, 0.5, 24, GOLD, s * 13.9, H - 0.3, 20)                                                 // cornice
    for (const z of [9, 13, 17, 21, 25, 29]) { b(0.3, H - 1.4, 0.5, MARBLE, s * 13.9, 0.7 + (H - 1.4) / 2, z); b(0.4, 0.3, 0.7, GOLD, s * 13.88, H - 0.8, z); b(0.4, 0.3, 0.7, GOLD, s * 13.88, 0.8, z) }
    for (const z of [15, 19, 23, 27]) { // tall arched-style windows above the stairs (bright panes: nothing outside)
      b(0.12, 4.3, 3, GOLD, s * 13.93, 8.2, z); gl(0.05, 3.9, 2.6, 0xd6e8fa, s * 13.84, 8.2, z); b(0.07, 3.9, 0.07, GOLD, s * 13.82, 8.2, z); b(0.07, 0.07, 2.6, GOLD, s * 13.82, 8.5, z); b(0.07, 0.07, 2.6, GOLD, s * 13.82, 7.0, z)
    }
  }
  b(28.4, 0.5, 0.5, GOLD, 0, H - 0.3, 31.9); b(28.4, 0.5, 0.5, GOLD, 0, H - 0.3, 8.1)
  for (const x of [-12, -9, -6, 6, 9, 12]) { b(0.5, H - 1.4, 0.3, MARBLE, x, 0.7 + (H - 1.4) / 2, 31.9); b(0.7, 0.3, 0.4, GOLD, x, H - 0.8, 31.9); b(0.7, 0.3, 0.4, GOLD, x, 0.8, 31.9) }
  b(0.3, 3.9, 0.5, GOLD, -1.7, 1.95, 31.95); b(0.3, 3.9, 0.5, GOLD, 1.7, 1.95, 31.95); b(3.7, 0.3, 0.5, GOLD, 0, 3.95, 31.95) // door frame
  gl(3.1, 3.8, 0.05, 0xe4f1ff, 0, 1.9, 32.0); b(0.06, 3.8, 0.08, GOLD, 0, 1.9, 31.95)            // the door: a bright pane
  b(6.6, 4.6, 0.12, GOLD, 0, 8.4, 31.95); gl(6.2, 4.2, 0.05, 0xd6e8fa, 0, 8.4, 31.85); b(0.08, 4.2, 0.06, GOLD, 0, 8.4, 31.82); b(6.2, 0.08, 0.06, GOLD, 0, 8.4, 31.82)            // big window over the door
  gl(10, 0.05, 14, 0xfff0cc, 0, H - 0.03, 22.5); for (const z of [16, 19, 22, 25, 28]) b(10.4, 0.12, 0.2, GOLD, 0, H - 0.1, z); for (const x of [-5, 0, 5]) b(0.2, 0.12, 14.4, GOLD, x, H - 0.1, 22.5) // skylight
  b(3.6, 0.03, 24, CARPET, 0, 0.035, 20); b(0.14, 0.032, 24, GOLD, -1.87, 0.036, 20); b(0.14, 0.032, 24, GOLD, 1.87, 0.036, 20)

  // upper foyer ("Mirror hall"): gallery slab at 4.5 over the north end, balustrade, mirrors, painted ceiling panels
  b(28.4, 0.3, 6, ROSE, 0, up - 0.15, 11); b(28.4, 0.12, 0.3, GOLD, 0, up - 0.34, 14.1)
  b(3.2, 0.3, 1.1, ROSE, 0, up - 0.15, 7.45)
  b(19, 0.1, 0.14, MARBLE, 0, up + 0.1, S.zTop); b(19, 0.08, 0.2, GOLD, 0, up + 1.0, S.zTop)
  for (let x = -9.5; x <= 9.51; x += 0.5) b(0.07, 0.95, 0.07, MARBLE, x, up + 0.475, S.zTop)
  for (const x of [-6.4, -3, 3, 6.4]) { b(0.55, 0.3, 0.55, GOLD, x, 0.15, S.zTop); cyl(0.4, 0.42, up - 0.9, MARBLE, x, 0.3 + (up - 0.9) / 2, S.zTop, 12); b(0.7, 0.3, 0.7, GOLD, x, up - 0.45, S.zTop) }
  for (const x of [-11.2, -7.9, -4.6, 4.6, 7.9, 11.2]) { b(2.5, 3.7, 0.06, GOLD, x, up + 2.5, 8.03); panel(2.2, 3.4, RECT.mirror, x, up + 2.5, 8.07) }
  for (let i = 0; i < 3; i++) { const [px, py, pw, ph] = RECT.paintings; atl.push(quad(7.4, 5.55, [px + i * (pw / 3), py, pw / 3, ph]).rotateX(Math.PI / 2).translate((i - 1) * 8.6, H - 0.02, 11)) }
  for (const i of [-1, 0, 1]) { // gold frames round the paintings
    const x = i * 8.6; b(8, 0.1, 0.2, GOLD, x, H - 0.06, 8.1); b(8, 0.1, 0.2, GOLD, x, H - 0.06, 13.9); b(0.2, 0.1, 5.8, GOLD, x - 3.9, H - 0.06, 11); b(0.2, 0.1, 5.8, GOLD, x + 3.9, H - 0.06, 11) }
  for (const x of [-6, 0, 6]) gl(2.6, 0.04, 0.8, 0xfff0cc, x, up - 0.32, 11)                         // light panels under the gallery

  // ======================= passage to the auditorium (two storeys high) and its frame
  b(1.2, 8.4, 1.5, CREAM, -2.2, 4.2, 7.6); b(1.2, 8.4, 1.5, CREAM, 2.2, 4.2, 7.6); b(5.6, H - 8.4, 1.5, CREAM, 0, (H + 8.4) / 2, 7.6)
  b(0.3, 8.4, 0.5, GOLD, -1.7, 4.2, 8.15); b(0.3, 8.4, 0.5, GOLD, 1.7, 4.2, 8.15); b(3.7, 0.3, 0.5, GOLD, 0, 8.55, 8.15)
  b(5.2, 20 - 8.4, 0.7, CREAM, 0, 14.2, 7.0)                                                      // wall above and around the doorway on the hall side
  panel(2.4, 1.2, RECT.parter, 0, 3.55, 8.2); panel(2.4, 1.2, RECT.tiers, 0, up + 3.4, 8.2)

  // ======================= stairs: two long marble flights with a red runner, balustrade on the inside, up to the upper foyer
  const steps = stairSteps(), run = (S.zBot - S.zTop) / S.n, rise = up / S.n, w = S.xOut - S.xIn
  for (const s of [-1, 1]) {
    steps.forEach((st, i) => {
      const cz = (st.z0 + st.z1) / 2
      b(w, st.top, run, i % 2 ? 0xe9e1d2 : 0xf1ebdf, s * (S.xIn + w / 2), st.top / 2, cz); b(2.6, 0.025, run * 0.96, CARPET, s * (S.xIn + w / 2), st.top + 0.012, cz)
      if (i % 2 === 0) b(0.08, 0.95, 0.08, MARBLE, s * (S.xIn + 0.1), st.top + 0.475, st.z1 - run / 2)
    })
    const len = Math.hypot(S.zBot - S.zTop, up), a = Math.atan2(up - rise, S.zBot - S.zTop - run)
    solid.push(part(new THREE.BoxGeometry(0.14, 0.08, len), GOLD, T(s * (S.xIn + 0.1), (up + rise) / 2 + 0.98, (S.zBot + S.zTop) / 2).multiply(Rx(a))))
    solid.push(part(new THREE.BoxGeometry(0.2, 0.1, len), MARBLE, T(s * (S.xIn + 0.1), (up + rise) / 2 + 0.05, (S.zBot + S.zTop) / 2).multiply(Rx(a))))
    b(0.5, 1.4, 0.5, MARBLE, s * (S.xIn + 0.1), 0.7, S.zBot + 0.7); b(0.6, 0.15, 0.6, GOLD, s * (S.xIn + 0.1), 1.45, S.zBot + 0.7)  // newel post at the foot
    glow.push(part(new THREE.IcosahedronGeometry(0.22, 1), 0xfff0b8, T(s * (S.xIn + 0.1), 1.75, S.zBot + 0.7)))
  }

  // ======================= vestibule: box-office windows, cloakroom with coats, usher's desk, statues, posters
  for (const x of [-6.5, 6.5]) {
    b(2.4, 1.2, 0.7, WOOD, x, 0.6, 31.35); b(2.5, 0.06, 0.8, GOLD, x, 1.22, 31.35); b(2.4, 0.15, 0.1, GOLD, x, 2.45, 31.9); b(0.12, 1.3, 0.1, GOLD, x - 1.1, 1.8, 31.9); b(0.12, 1.3, 0.1, GOLD, x + 1.1, 1.8, 31.9)
    gl(2.0, 1.05, 0.04, 0xd9ecf5, x, 1.8, 31.94); panel(2, 1, RECT.kasa, x, 3.1, 31.95, Math.PI)
  }
  b(9.7, 1.3, 1, WOOD, -8.85, 0.65, 9.6); b(9.9, 0.07, 1.2, GOLD, -8.85, 1.33, 9.6)                // cloakroom counter, coat rail behind it
  b(9.6, 0.05, 0.05, 0x8a8f95, -8.85, 2.4, 8.7); panel(3, 1.5, RECT.garderob, -8.85, 3.3, 8.2)
  const coats = [0x2d2d38, 0x6b4a36, 0x8a1f2a, 0x3f5a4a, 0x4a4a55, 0xb09a7a, 0x1f2a44]
  for (let i = 0; i < 18; i++) b(0.3, 1.1 + (i % 3) * 0.1, 0.14, coats[(i * 5) % coats.length], -13 + i * 0.52, 2.3 - 0.55 - (i % 3) * 0.05, 8.7)
  b(1.8, 0.95, 0.7, WOOD, OP.desk.x, 0.475, OP.desk.z); b(1.9, 0.05, 0.8, 0xa8814f, OP.desk.x, 0.97, OP.desk.z)
  panel(1.6, 1.6, RECT.poster, 9.3, 2.3, 8.2)
  for (const s of [-1, 1]) { // muse statues on pedestals flanking the axis
    const x = s * 3.4, z = 19
    b(1.0, 1.1, 1.0, MARBLE, x, 0.55, z); b(1.2, 0.15, 1.2, GOLD, x, 1.18, z)
    solid.push(cyl(0.2, 0.34, 1.3, 0xf6f2ea, x, 1.9, z, 10), part(new THREE.SphereGeometry(0.15, 10, 8), 0xf6f2ea, T(x, 2.7, z)))
    rb(0.1, 0.8, 0.1, 0xf6f2ea, x + s * 0.1, 2.35, z + 0.1, 0); rb(0.1, 0.7, 0.1, 0xf6f2ea, x - s * 0.25, 2.3, z, 0)
    glow.push(part(new THREE.IcosahedronGeometry(0.16, 1), 0xfff0b8, T(x, 3.15, z)))
  }

  // ======================= auditorium: horseshoe walls, floor, boxes on four tiers, ceiling with the painted plafond
  const wallPath = pts(R + 0.2)
  for (let i = 0; i < wallPath.length - 1; i++) {
    const a = wallPath[i], q = wallPath[i + 1]
    if (Math.abs(a.x + q.x) / 2 < 1.9 && a.z > A.cz) continue
    rb(Math.hypot(q.x - a.x, q.z - a.z) + 0.05, A.H, 0.4, CREAM, (a.x + q.x) / 2, A.H / 2, (a.z + q.z) / 2, Math.atan2(-(q.z - a.z), q.x - a.x))
  }
  band(R - 0.05, 0.7, 1.4, 0.1, DRED, 2); band(R - 0.1, 1.45, 0.1, 0.16, GOLD, 2)                // red dado and a gilded rail on the ground-floor wall
  const wp = pts(R - 0.15, 2.8)
  for (const p of wp) if (!(Math.abs(p.x) < 2.6 && p.z > A.cz) && p.z > A.zEnd + 0.8) { // pilasters with wall lamps
    rb(0.34, 4.0, 0.22, GOLD, p.x, 2.2, p.z, Math.atan2(p.nx, p.nz) + Math.PI)
    glow.push(part(new THREE.IcosahedronGeometry(0.13, 0), 0xffe9b0, T(p.x - p.nx * 0.28, 2.7, p.z - p.nz * 0.28)))
  }
  b(28.4, 0.04, 6.6, WOOD, 0, 0, -10.3)                                                          // parterre floor: wood behind the pit rail, carpet runner on the aisle
  solid.push(fanGeo(horseshoeN(R, 0, 40), 0, A.cz, 0.02, 0x5c3b28, true))
  b(1.5, 0.03, 20, CARPET, 0, 0.035, -3)
  solid.push(fanGeo(horseshoe(R + 0.2, 1.4), 0, A.cz, A.H, 0xe6dcc0, false))                      // ceiling
  band(R - 0.6, A.H - 0.45, 0.9, 0.5, CREAM); band(R - 1.1, A.H - 0.95, 0.14, 0.6, GOLD)
  band(10.2, A.H - 0.07, 0.14, 0.25, GOLD)
  atl.push(new THREE.CircleGeometry(9, 48).rotateX(Math.PI / 2))
  quad(18, 18, RECT.plafond, atl[atl.length - 1]); atl[atl.length - 1].translate(0, A.H - 0.1, A.cz + 1)
  for (let r = 9.1; r < 9.5; r += 0.3) { solid.push(part(new THREE.TorusGeometry(r, 0.12, 5, 40), GOLD, T(0, A.H - 0.12, A.cz + 1).multiply(Rx(Math.PI / 2)))) }

  TI.forEach((t, k) => {
    const y = t.y, rf = t.rf, nxt = TI[k + 1]?.rf ?? R - 0.8
    solid.push(ringGeo(rf, R, y, k === 0 ? 0x7a1620 : 0x5a3a2c, true), ringGeo(rf, R + 0.1, y - 0.3, CREAM, false))
    const ds = k === 0 ? 1.4 : 2.2 // the upper tiers are far away: coarser polygon
    band(rf, y - 0.15, 0.3, 0.3, CREAM, 0, ds)                                                   // slab edge
    band(rf, y + 0.5, 1.0, 0.26, 0xf1e8d2, 0, ds); band(rf, y + 0.04, 0.14, 0.34, GOLD, 0, ds)   // parapet and plinth
    band(rf, y + 0.55, 0.3, 0.3, GOLD, 0, ds); band(rf, y + 1.07, 0.16, 0.42, DRED, 0, ds); band(rf, y + 1.19, 0.05, 0.46, GOLD, 0, ds) // garland, velvet top, gilded cap
    band(R - 0.1, y + 1.9, 1.8, 0.1, DRED, 2.3, ds)                                                // red drapes at the back of the boxes
    const p = pts(rf, ds)
    p.forEach((q, i) => {
      if (i % 2 === 0) {
        const yaw = Math.atan2(q.nx, q.nz)
        rb(0.5, 0.5, 0.16, GOLD, q.x + q.nx * 0.14, y + 0.55, q.z + q.nz * 0.14, yaw)            // cartouche on the parapet
        glow.push(part(new THREE.IcosahedronGeometry(0.075, 0), 0xfff0b8, T(q.x, y + 1.3, q.z)))  // box lamp
        const dr = nxt - rf - 0.15, top = (TI[k + 1]?.y ?? A.H - 1.2) - 0.3, h = top - (y + 1.2)
        if (h > 0.3 && k > 0) solid.push(part(new THREE.CylinderGeometry(0.1, 0.1, h, 6), GOLD, T(q.x + q.nx * dr, y + 1.2 + h / 2, q.z + q.nz * dr)))
        if (k > 0) rb(0.07, 1.0, R - rf - 0.3, 0xe8dcc0, q.x + q.nx * ((R - rf - 0.3) / 2 + 0.2), y + 0.5, q.z + q.nz * ((R - rf - 0.3) / 2 + 0.2), yaw) // partitions between the boxes
      }
    })
  })

  // ======================= pit, proscenium, stage with the curtain and a few set pieces
  b(28.4, 0.2, 4.9, DARK, 0, OP.pit.y - 0.1, -16.05); b(28.4, 1.0, 0.3, 0x3a2418, 0, 0.5, OP.pit.z); b(28.4, 0.14, 0.4, GOLD, 0, 1.0, OP.pit.z); b(28.4, 0.2, 0.46, DRED, 0, 1.12, OP.pit.z)
  for (let x = -13.5; x <= 13.6; x += 1.5) b(0.07, 1.0, 0.07, GOLD, x, 0.5, OP.pit.z)
  b(1.4, 0.5, 1.4, DRED, 0, OP.pit.y + 0.25, -15)                                                // conductor's podium
  for (let i = 0; i < 18; i++) { // orchestra chairs and music stands
    const x = (i % 9 - 4) * 1.5, z = -16.2 - Math.floor(i / 9) * 1.4 + (Math.abs(i % 9 - 4) > 2 ? 0.0 : 0), y = OP.pit.y
    b(0.4, 0.05, 0.4, DARK, x, y + 0.45, z); b(0.4, 0.4, 0.04, DARK, x, y + 0.65, z - 0.2); b(0.03, 0.9, 0.03, 0x555555, x, y + 0.45, z + 0.55); b(0.5, 0.3, 0.02, 0xf4f1ea, x, y + 1.0, z + 0.55)
  }
  const fz = A.zEnd - 0.3
  b(7.0, 20, 0.6, CREAM, -10.7, 10, fz); b(7.0, 20, 0.6, CREAM, 10.7, 10, fz); b(14.4, 20 - ST.top, 0.6, CREAM, 0, (20 + ST.top) / 2, fz) // proscenium wall with the stage opening
  for (const s of [-1, 1]) { b(0.9, ST.top, 0.6, GOLD, s * 7.55, ST.top / 2, fz + 0.15); cyl(0.4, 0.4, ST.top - 1.2, MARBLE, s * 6.8, ST.top / 2, fz + 0.45, 12) }
  b(16.4, 1.0, 0.8, GOLD, 0, ST.top + 0.5, fz + 0.2); b(16.8, 0.3, 1, GOLD, 0, ST.top + 1.15, fz + 0.2)
  b(1.7, 2.1, 0.3, GOLD, 0, ST.top + 2.4, fz + 0.5); b(1.3, 1.7, 0.1, 0x8a1f2a, 0, ST.top + 2.4, fz + 0.68) // the crest of Lviv held by two angels
  for (const s of [-1, 1]) { solid.push(part(new THREE.ConeGeometry(0.35, 1.6, 8), GOLD, T(s * 1.6, ST.top + 2.2, fz + 0.5)), part(new THREE.SphereGeometry(0.25, 8, 6), GOLD, T(s * 1.6, ST.top + 3.2, fz + 0.5))); rb(1.2, 0.08, 0.5, GOLD, s * 2.3, ST.top + 2.9, fz + 0.5, 0.0) }
  b(40, ST.y, 13.5, WOOD, 0, ST.y / 2, -25.25); b(40.8, 22, 0.4, DARK, 0, 11, ST.z1 - 0.2); b(0.4, 22, 13.5, DARK, -20.2, 11, -25.25); b(0.4, 22, 13.5, DARK, 20.2, 11, -25.25); b(40.8, 0.4, 14, DARK, 0, 22.2, -25.25)
  const sky = [0xf0b58a, 0xe8a07c, 0xc98a96, 0x9f86ab, 0x6f78b0, 0x46549a, 0x2f3c80, 0x232d66]
  sky.forEach((c, i) => gl(38, 2.65, 0.1, c, 0, ST.y + 1.3 + i * 2.65, ST.z1 + 0.1))               // painted backdrop
  glow.push(part(new THREE.CylinderGeometry(2.1, 2.1, 0.1, 24), 0xfff3d2, T(5, 12, ST.z1 + 0.25).multiply(Rx(Math.PI / 2))))
  for (const s of [-1, 1]) { cyl(0.55, 0.62, 7.4, 0xe9e0cc, s * 5.8, ST.y + 3.7, -26, 12); b(1.5, 0.35, 1.5, 0xd9cfb8, s * 5.8, ST.y + 7.55, -26) }
  b(3.2, 0.9, 3.2, 0xd9cfb8, -9, ST.y + 0.45, -22); cyl(0.5, 0.58, 2.2, 0xe9e0cc, -9, ST.y + 2.0, -22, 10)  // a broken column on a plinth
  for (let i = 0; i < 6; i++) b(8 - i * 0.9, (i + 1) * 0.22, 1.1, 0xe3d9c3, 0, ST.y + (i + 1) * 0.11, -23 - i * 1.0)  // steps up to a platform with a throne
  b(5, 1.32, 3.2, 0xe3d9c3, 0, ST.y + 0.66, -29.6); b(1.1, 0.35, 0.9, GOLD, 0, ST.y + 1.5, -29.6); b(1.1, 1.6, 0.15, GOLD, 0, ST.y + 2.4, -30.1); b(0.9, 0.08, 0.7, DRED, 0, ST.y + 1.72, -29.6)
  for (const x of [-12, 12, -15, 15]) solid.push(part(new THREE.ConeGeometry(1.6, 5.5, 7), 0x2f5a3a, T(x, ST.y + 2.75, -23 - Math.abs(x) * 0.2)))
  gl(14, 0.15, 0.3, 0xfff1d0, 0, ST.top - 0.4, -20.2); gl(10, 0.08, 0.1, 0xfff1d0, 0, ST.y + 0.05, A.zEnd - 0.05)
  { // the curtain, drawn back to the sides, with the valance across the top
    const h = ST.top - ST.y
    atl.push(quad(4.2, h, RECT.curtain).translate(-5.1, ST.y + h / 2, fz + 0.4), quad(4.2, h, RECT.curtain).translate(5.1, ST.y + h / 2, fz + 0.4))
    atl.push(quad(14.4, 2.0, [512, 0, 512, 200]).translate(0, ST.top - 1.0, fz + 0.42))
  }

  // ======================= chandeliers (glow lamps and crystal drops on gold rings)
  const chandelier = (cx: number, cy: number, cz: number, s: number, rings: number, ceilY: number) => {
    solid.push(part(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, ceilY - cy, 5), GOLD, T(cx, (ceilY + cy) / 2, cz)), part(new THREE.CylinderGeometry(0.07 * s, 0.05 * s, 1.1 * s, 8), GOLD, T(cx, cy - 0.1 * s, cz)))
    for (let k = 0; k < rings; k++) {
      const r = (0.45 + 0.42 * k) * s, y = cy - 0.12 * s * k - 0.1 * s, n = 6 + 6 * k
      solid.push(part(new THREE.TorusGeometry(r, 0.035 * s, 4, 18), GOLD, T(cx, y, cz).multiply(Rx(Math.PI / 2))))
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + k, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r
        glow.push(part(new THREE.IcosahedronGeometry(0.075 * s, 0), 0xfff0b8, T(x, y + 0.14 * s, z)), part(new THREE.ConeGeometry(0.035 * s, 0.32 * s, 4).rotateX(Math.PI), 0xe8f2ff, T(x, y - 0.2 * s, z)))
      }
    }
    glow.push(part(new THREE.IcosahedronGeometry(0.16 * s, 1), 0xe8f2ff, T(cx, cy - 0.12 * s * rings - 0.35 * s, cz)))
  }
  chandelier(0, 15.2, A.cz + 1, 1.8, 4, A.H)
  for (const z of [26, 20.5]) chandelier(0, 8.0, z, 1.15, 3, H)
  for (const x of [-6, 6]) chandelier(x, 3.35, 11, 0.55, 2, up - 0.3)

  // ======================= audience: a few silhouettes among the seats and heads over the box parapets (the full house is implied)
  const seats: Seat[] = [...parterreSeats(), ...tierSeats()]
  const tones = [0x2b2b35, 0x4a3b3b, 0x1f2a44, 0x6b5a4a, 0x3b4a3b, 0x7a2a3a, 0x555566], heads = [0xa87f60, 0x8f6648, 0xb88c6c, 0x6b4a34]
  seats.forEach((s, i) => {
    if (s.y === 0 ? (s.row < 3 || (i * 7) % 5 !== 0) : (i * 5) % 7 !== 0) return
    const bx = s.x - Math.sin(s.yaw) * 0.05, bz = s.z - Math.cos(s.yaw) * 0.05, h = 0.95 + ((i * 13) % 5) * 0.03
    rb(0.4, 0.5, 0.2, tones[i % tones.length], bx, s.y + 0.8, bz - Math.cos(s.yaw) * 0.12, s.yaw); solid.push(part(new THREE.IcosahedronGeometry(0.1, 0), heads[i % heads.length], T(bx, s.y + h + 0.3, bz - Math.cos(s.yaw) * 0.1)))
  })
  TI.slice(1).forEach((t, k) => pts(t.rf + 0.7, 1.5).forEach((q, i) => {
    if ((i + k) % 3 === 0 || q.z < A.zEnd + 2) return
    rb(0.42, 0.3, 0.2, tones[(i * 3 + k) % tones.length], q.x + q.nx * 0.2, t.y + 1.0, q.z + q.nz * 0.2, Math.atan2(q.nx, q.nz)); solid.push(part(new THREE.IcosahedronGeometry(0.1, 0), heads[(i + k) % heads.length], T(q.x + q.nx * 0.2, t.y + 1.3, q.z + q.nz * 0.2)))
  }))

  // ======================= meshes
  const group = new THREE.Group()
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = false) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast && shadows; m.receiveShadow = shadows; group.add(m); return m }
  mesh(mergeGeometries(solid)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, color: new THREE.Color().setScalar(1.55), emissive: 0x3a2e22, ...pull(1) }), true)
  mesh(mergeGeometries(glow)!, new THREE.MeshBasicMaterial({ vertexColors: true, ...pull(1) }))
  mesh(mergeGeometries(atl)!, new THREE.MeshBasicMaterial({ map: drawAtlas(), side: THREE.DoubleSide, color: 0xdddddd, ...pull(2) })) // lit paintings, curtain, mirrors, signs
  mesh(new THREE.PlaneGeometry(28, 24).rotateX(-Math.PI / 2).translate(0, 0.02, 20), new THREE.MeshStandardMaterial({ map: drawMarble(7, 6), roughness: 0.35, emissive: 0x2a2620, ...pull(3) })) // marble foyer floor
  { // seats: one instanced red velvet seat (cushion, back, base), facing the stage
    const geo = mergeGeometries([box(0.5, 0.1, 0.48, RED, 0, 0.42, 0.04), box(0.5, 0.52, 0.08, RED, 0, 0.75, -0.2), box(0.1, 0.4, 0.3, DARK, 0, 0.2, -0.02)])!
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, color: new THREE.Color().setScalar(1.5), emissive: 0x2a0a0c, ...pull(1) }), seats.length), m = new THREE.Matrix4()
    seats.forEach((s, i) => im.setMatrixAt(i, m.makeRotationY(s.yaw).setPosition(s.x, s.y, s.z)))
    im.receiveShadow = shadows; group.add(im)
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2).translate(OP.door.x, 0.06, OP.door.z - 0.65), new THREE.MeshBasicMaterial({ color: 0xffc72c, transparent: true, opacity: 0.85, depthWrite: false }))
  group.add(ring)
  group.position.set(ox, 0, oz)

  const usher = buildUsher(shadows); usher.group.position.set(OP.usher.x, 0, OP.usher.z); group.add(usher.group)
  return { group, usher }
}
