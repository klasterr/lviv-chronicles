import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Colliders } from '../world/colliders'
import { part, box, cyl, T } from '../world/props'
import { buildFigure } from '../interiors/figure'
import { MENU } from './menu'
import { L } from './layout'

const BEIGE = 0xeadfc4, RED = 0x9e1b14, YELLOW = 0xffc72c, STEEL = 0xc4c9ce, DARK = 0x2a2d32, WOOD = 0xcfc3a8, WINDOW = 0xb9dcf5

// ---- canvas atlas: four menu boards (2x2), kiosk screen, big logo
const AW = 1024, AH = 1024, BW = 512, BH = 340
const KIOSK = [0, 680, 240, 344], LOGO = [256, 680, 640, 344] // x, y, w, h in px
function arches(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.lineCap = 'round'; g.lineWidth = s * 0.5; g.strokeStyle = YELLOW_CSS
  g.beginPath(); g.moveTo(x - s * 1.9, y + s * 1.8); g.lineTo(x - s * 1.9, y - s * 0.2); g.bezierCurveTo(x - s * 1.9, y - s * 2.6, x, y - s * 2.6, x, y + s * 0.6)
  g.bezierCurveTo(x, y - s * 2.6, x + s * 1.9, y - s * 2.6, x + s * 1.9, y - s * 0.2); g.lineTo(x + s * 1.9, y + s * 1.8); g.stroke()
}
const YELLOW_CSS = '#ffc72c'
function drawAtlas() {
  const c = document.createElement('canvas'); c.width = AW; c.height = AH
  const g = c.getContext('2d')!
  g.textBaseline = 'middle'
  MENU.forEach((cat, i) => {
    const x = (i % 2) * BW, y = Math.floor(i / 2) * BH
    g.fillStyle = '#1c1c1c'; g.fillRect(x, y, BW, BH)
    g.fillStyle = '#c8281e'; g.fillRect(x, y, BW, 52)
    g.fillStyle = '#fff'; g.font = 'bold 32px Arial'; g.textAlign = 'center'; g.fillText(cat.title, x + BW / 2, y + 27)
    g.font = '24px Arial'
    cat.items.forEach((it, j) => {
      const ly = y + 74 + j * 32
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(it.name, x + 16, ly)
      g.fillStyle = YELLOW_CSS; g.textAlign = 'right'; g.fillText(String(it.price), x + BW - 16, ly)
    })
  })
  { const [x, y, w, h] = KIOSK
    g.fillStyle = '#1b1b1b'; g.fillRect(x, y, w, h)
    g.fillStyle = '#c8281e'; g.fillRect(x, y, w, 70); arches(g, x + w / 2, y + 40, 9)
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 30px Arial'; g.fillText('Замовлення', x + w / 2, y + 130); g.fillText('тут', x + w / 2, y + 165)
    g.fillStyle = YELLOW_CSS; g.fillRect(x + 30, y + 215, w - 60, 54); g.fillStyle = '#222'; g.font = 'bold 22px Arial'; g.fillText('Торкніться', x + w / 2, y + 242)
    g.fillStyle = '#fff'; g.font = '16px Arial'; g.fillText('самообслуговування', x + w / 2, y + 310) }
  { const [x, y, w, h] = LOGO
    g.fillStyle = '#c8281e'; g.fillRect(x, y, w, h); arches(g, x + w / 2, y + 118, 46)
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 52px Arial'; g.fillText("McDonald's", x + w / 2, y + 290) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
/** Atlas rectangle (px) as a quad of w x h metres facing +z at the origin; uv per THREE's flipped canvas. */
function quad(w: number, h: number, [x, y, pw, ph]: number[]) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * pw) / AW, 1 - (y + (1 - uv.getY(i)) * ph) / AH)
  return g
}

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')!
  for (let i = 0; i < 4; i++) { g.fillStyle = (i % 3 === 0) ? '#b8a07c' : '#8a5a44'; g.fillRect((i % 2) * 64, Math.floor(i / 2) * 64, 64, 64) }
  g.strokeStyle = '#0004'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128); g.strokeRect(0, 0, 64, 64); g.strokeRect(64, 64, 64, 64)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2 * L.hw / 1.2, 2 * L.hd / 1.2); t.anisotropy = 8
  return t
}

/** Standing cashier (feet on the ground at the origin, face towards +z). The right arm swings forward when handing out an order. */
export const buildCashier = (shadows: boolean) => buildFigure({ shirt: 0x2d2d2d, yoke: RED, cap: RED, tag: YELLOW, long: true }, shadows)

/** The restaurant room, built at world position (ox, oz) on the ground. Every wall and piece of furniture is registered in `colliders`. */
export function buildInterior(ox: number, oz: number, colliders: Colliders, shadows: boolean) {
  const solid: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], atlas: THREE.BufferGeometry[] = []
  const { hw, hd, H, mezz } = L
  const b = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => solid.push(box(w, h, d, c, x, y, z))
  const g = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => glow.push(box(w, h, d, c, x, y, z))
  const wall = (ax: number, az: number, bx: number, bz: number) => colliders.add(ox + ax, oz + az, ox + bx, oz + bz)
  const rect = (x: number, z: number, w: number, d: number, top: number, lo?: number) => colliders.addRect(ox + x, oz + z, w, d, 0, top, lo)

  // ---- shell: beige walls on a red plinth, ceiling, south wall with the door gap (x -1..1)
  b(18.6, H, 0.3, BEIGE, 0, H / 2, -8.15); b(18.6, 1, 0.34, RED, 0, 0.5, -8.15)
  for (const s of [-1, 1]) { b(0.3, H, 16.6, BEIGE, s * 9.15, H / 2, 0); b(0.34, 1, 16.6, RED, s * 9.15, 0.5, 0) }
  for (const s of [-1, 1]) { b(8.3, H, 0.3, BEIGE, s * 5.15, H / 2, 8.15); b(8.3, 1, 0.34, RED, s * 5.15, 0.5, 8.15) }
  b(2, H - 2.6, 0.3, BEIGE, 0, (H + 2.6) / 2, 8.15)
  b(0.12, 2.6, 0.36, 0x3a2418, -1.06, 1.3, 8.15); b(0.12, 2.6, 0.36, 0x3a2418, 1.06, 1.3, 8.15); b(2.24, 0.12, 0.36, 0x3a2418, 0, 2.66, 8.15)
  g(2, 2.55, 0.05, 0xd8ecff, 0, 1.275, 8.15); b(0.05, 2.55, 0.07, 0x3a2418, 0, 1.275, 8.1)  // the door itself: a bright pane
  b(18.6, 0.3, 16.6, 0xf2f2f2, 0, H + 0.15, 0)
  wall(-hw, hd, hw, hd); wall(hw, -hd, hw, hd); wall(-hw, -hd, -hw, hd); wall(-hw, -hd, hw, -hd)

  // ---- windows are bright panes (nothing is outside this room): glow quad inside a dark frame; wx = wall plane, s = inward direction
  const win = (axis: 'x' | 'z', plane: number, s: number, c: number, y: number, len: number, h: number) => {
    const pane = (t: number, grow: number, col: number, into: number, list: THREE.BufferGeometry[]) => list.push(
      axis === 'x' ? box(t, h + grow, len + grow, col, plane + s * into, y, c) : box(len + grow, h + grow, t, col, c, y, plane + s * into))
    pane(0.05, 0.1, 0x5a4a3a, 0.025, solid); pane(0.04, 0, WINDOW, 0.04, glow)
  }
  for (const z of [4, 1]) win('x', hw, -1, z, 1.9, 2.4, 1.5)
  for (const x of [-5, 6.2]) win('z', hd, -1, x, 2.9, 3.4, 1.4)
  for (const z of [-3, -6.2]) win('x', -hw, 1, z, 4.9, 2.2, 1.4)

  // ---- lights: ceiling strips over the kitchen, pendant lamps over the booths, panels under the mezzanine (all glow only, the scene has no extra lights)
  for (const x of [-1, 3, 7]) g(2, 0.04, 0.4, 0xfff6dc, x, H - 0.03, -5)
  for (const x of [-4.8, -2.5, 3.4, 5.8]) for (const z of [3.8, 2]) { g(0.02, H - 3.0, 0.02, 0x222222, x, (H + 3) / 2, z); glow.push(cyl(0.2, 0.12, 0.15, 0xffc15a, x, 2.95, z, 10)) }
  for (const z of [-2.5, -5.5]) g(1.4, 0.04, 0.4, 0xfff6dc, -6, mezz - 0.32, z)

  // ---- second floor over the west third; stairs rise along the west wall from z = 6 up to the slab edge at z = 0.5
  b(6, 0.3, 8.5, WOOD, -6, mezz - 0.15, -3.75)
  colliders.addFloor(ox - hw, oz - hd, ox - 3, oz + 0.5, mezz)
  const N = 19, run = 5.5 / N, rise = mezz / N, x0 = -hw, x1 = -7.4
  for (let i = 0; i < N; i++) { const top = (i + 1) * rise; b(x1 - x0, top, run, i % 2 ? 0x9a8a72 : 0xa89880, (x0 + x1) / 2, top / 2, 6 - (i + 0.5) * run) }
  colliders.addFloor(ox + x0, oz + 0.5, ox + x1, oz + 0.8, mezz)         // top landing (the highest step)
  colliders.addFloor(ox + x0, oz + 0.8, ox + x1, oz + 6, mezz, rise)     // ramp through the tread nosings
  const rail = (ax: number, az: number, bx: number, bz: number, y: number) => { // straight railing on the mezzanine edge: posts, two bars, collider only above the lower floor
    const len = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2, alongX = Math.abs(bx - ax) > Math.abs(bz - az)
    const bar = (h: number, col: number) => alongX ? b(len, 0.06, 0.06, col, cx, y + h, cz) : b(0.06, 0.06, len, col, cx, y + h, cz)
    bar(1.0, RED); bar(0.5, 0x8a8f95)
    for (let k = 0; k <= Math.ceil(len); k++) { const t = k / Math.ceil(len); b(0.05, 1.0, 0.05, 0x8a8f95, ax + (bx - ax) * t, y + 0.5, az + (bz - az) * t) }
    colliders.add(ox + ax, oz + az, ox + bx, oz + bz, y + 1.7, y)
  }
  rail(-7.4, 0.5, -3, 0.5, mezz); rail(-3, 0.5, -3, -1.4, mezz)
  { // stair side rail: sloped handrail, solid below
    const a = Math.atan2(mezz - rise, 5.2), len = Math.hypot(5.2, mezz - rise)
    solid.push(part(new THREE.BoxGeometry(0.06, 0.06, len), RED, T(x1 - 0.03, (mezz + rise) / 2 + 0.95, 3.4).multiply(new THREE.Matrix4().makeRotationX(a))))
    b(0.05, 1.0, 0.05, 0x8a8f95, x1 - 0.03, mezz + 0.5, 0.65); b(0.05, 1.0, 0.05, 0x8a8f95, x1 - 0.03, rise + 0.5, 6)
    wall(-7.4, 0.5, -7.4, 6)
  }
  for (const z of [0.2, -4]) { b(0.35, mezz - 0.3, 0.35, 0xdddddd, -3.1, (mezz - 0.3) / 2, z); rect(-3.1, z, 0.18, 0.18, mezz) }

  // ---- kitchen behind the counter (x -3..9): partition, steel benches, fryers, grill, hood, prep island, shelves
  b(0.2, H, 5.7, BEIGE, -3, H / 2, -5.15); wall(-3, -8, -3, -2.3)
  b(11, 0.9, 0.8, STEEL, 3, 0.45, -7.5)
  for (const x of [0.2, 1, 1.8]) { b(0.6, 0.35, 0.7, DARK, x, 1.075, -7.5); b(0.1, 0.04, 0.2, YELLOW, x, 1.28, -7.1) } // fryers with yellow basket handles
  b(2, 0.15, 0.7, 0x1a1a1a, 5, 0.975, -7.5); b(1.4, 0.12, 0.5, 0x8f949a, 7.5, 0.96, -7.5)
  b(6, 0.6, 1.0, STEEL, 2.5, 2.9, -7.5)                                                                       // wall-mounted extractor hood
  b(5, 0.9, 0.9, STEEL, 4.5, 0.45, -4.8); for (const x of [2.5, 3.5, 4.5, 5.5]) b(0.5, 0.06, 0.4, [0xc62828, YELLOW, 0xf5c542, 0xb08a5a][x - 2.5], x, 0.93, -4.8)
  for (const z of [-6.05, -3.95]) b(0.06, 2.0, 0.06, 0x8a8f95, 8.4, 1, z)                                    // shelf of carton boxes
  for (const y of [0.35, 0.85, 1.35, 1.85]) b(0.45, 0.35, 2.0, 0xb08a5a, 8.6, y, -5)
  b(0.6, 0.6, 0.5, 0xeeeeee, 5.4, 1.41, -1.8); b(0.6, 0.12, 0.5, RED, 5.4, 1.77, -1.8); b(0.1, 0.25, 0.1, STEEL, 5.4, 1.2, -1.55) // soda fountain on the counter

  // ---- counter straight ahead of the door: red front, pale top, two POS terminals; the collider is taller than a jump
  b(12, 1.05, 1, RED, 3, 0.525, L.counterZ); b(12.1, 0.06, 1.1, 0xf4efe6, 3, 1.08, L.counterZ)
  for (const x of [-1.1, 3]) { b(0.36, 0.3, 0.3, DARK, x, 1.26, -2.0); g(0.28, 0.2, 0.02, 0x9ad8ff, x, 1.28, -1.84) }
  rect(3, L.counterZ, 6, 0.5, 1.7)
  const boards = MENU.map((_, i) => { const x = -1.35 + i * 2.9; b(2.7, 1.83, 0.06, DARK, x, 4.27, -7.97); return quad(2.6, 1.73, [(i % 2) * BW, Math.floor(i / 2) * BH, BW, BH]).translate(x, 4.27, -7.935) })
  atlas.push(...boards)

  // ---- self-service kiosks on the south wall at the entrance (screens face north)
  for (const x of L.kiosks) {
    b(0.75, 1.75, 0.45, DARK, x, 0.875, L.kioskZ); b(0.78, 0.1, 0.48, RED, x, 1.8, L.kioskZ); g(0.12, 0.05, 0.04, 0x3ad17a, x + 0.2, 0.78, L.kioskZ - 0.26)
    atlas.push(quad(0.6, 0.85, KIOSK).rotateY(Math.PI).translate(x, 1.3, L.kioskZ - 0.265))
    rect(x, L.kioskZ, 0.375, 0.225, 1.8)
  }
  atlas.push(quad(2.2, 1.18, LOGO).rotateY(-Math.PI / 2).translate(hw - 0.03, 4.6, 2.5))

  // ---- booths: a table between two benches that face each other; the benches can be sat on like the street ones. y = floor level
  const booth = (x: number, z: number, y: number) => {
    b(0.75, 0.05, 1.3, 0xe9e1d0, x, y + 0.74, z); cyl(0.05, 0.05, 0.7, 0x3a3a3a, x, y + 0.37, z); solid.push(cyl(0.28, 0.28, 0.03, 0x3a3a3a, x, y + 0.015, z))
    rect(x, z, 0.375, 0.65, y + 0.78, y || undefined)
    for (const s of [-1, 1]) {
      const bx = x + s * 0.62
      b(0.4, 0.06, 1.3, 0xc62828, bx, y + 0.45, z); b(0.06, 0.5, 1.3, 0x6b1a14, bx + s * 0.2, y + 0.7, z); b(0.34, 0.42, 1.2, 0x2a2a2a, bx, y + 0.21, z)
      colliders.addBench(ox + bx, oz + z, s < 0 ? Math.PI / 2 : -Math.PI / 2, 0.65, 0.2, 0.5, y) // local +z (the way you face when seated) points at the table
    }
  }
  for (const x of [-4.8, -2.5, 3.4, 5.8]) for (const z of [3.8, 2]) booth(x, z, 0)
  for (const z of [-1.5, -3.2, -4.9, -6.6]) { booth(-6, z, 0); booth(-6, z, mezz) }
  b(0.5, 1, 0.5, 0x4a4f55, 8.5, 0.5, 5.8); b(0.52, 0.06, 0.52, YELLOW, 8.5, 1.03, 5.8); rect(8.5, 5.8, 0.26, 0.26, 1.1)

  // ---- meshes
  const group = new THREE.Group()
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = false) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast && shadows; m.receiveShadow = shadows; group.add(m); return m }
  mesh(mergeGeometries(solid)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, color: new THREE.Color().setScalar(1.6) }), true) // brighter than outdoors: the room only gets the sky light
  mesh(mergeGeometries(glow)!, new THREE.MeshBasicMaterial({ vertexColors: true }))
  mesh(mergeGeometries(atlas)!, new THREE.MeshBasicMaterial({ map: drawAtlas() })) // lit signage
  mesh(new THREE.PlaneGeometry(2 * hw, 2 * hd).rotateX(-Math.PI / 2).translate(0, 0.02, 0), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.6 }))
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2).translate(L.door.x, 0.05, L.door.z - 0.65), new THREE.MeshBasicMaterial({ color: YELLOW, transparent: true, opacity: 0.85, depthWrite: false })) // "walk here to leave"
  group.add(ring)
  group.position.set(ox, 0, oz)

  const cashier = buildCashier(shadows); cashier.group.position.set(L.cashier.x, 0, L.cashier.z); group.add(cashier.group)
  return { group, cashier }
}
