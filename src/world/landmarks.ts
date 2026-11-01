import * as THREE from 'three'
import { FACADE_PANELS } from './avenue/facades.generated'
import { AVENUE_TINTS } from './avenue/tints'

type Pt = number[]
interface Ctx { group: THREE.Group; shadows: boolean }

/** Overrides for hand-modelled OSM buildings, keyed by OSM id. skipMesh = the model replaces the extruded walls/roof. */
export interface Landmark { groundH?: number; h?: number; floors?: number; roof?: number; tint?: number; style?: number; skipMesh?: boolean; model?: (ring: Pt[], ctx: Ctx) => void }

/** Minimum-area oriented bounding box: centre, size along the axis (w) and across it (d), axis angle a. */
function obb(ring: Pt[]) {
  let best = { area: Infinity, cx: 0, cz: 0, w: 0, d: 0, a: 0 }
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length]
    const a = Math.atan2(bz - az, bx - ax), c = Math.cos(a), s = Math.sin(a)
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9
    for (const [x, z] of ring) {
      const u = x * c + z * s, v = -x * s + z * c
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
    }
    const area = (u1 - u0) * (v1 - v0)
    if (area < best.area) {
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2
      best = { area, cx: mu * c - mv * s, cz: mu * s + mv * c, w: u1 - u0, d: v1 - v0, a }
    }
  }
  return best
}

const STONE = 0xd8cdb2, COPPER = 0x3f5e50, GOLD = 0xc9a24a
const mat = (color: number, extra: THREE.MeshStandardMaterial['userData'] = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra })

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!; draw(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

/** Warm limestone base with speckle and horizontal courses. */
function stoneBase(g: CanvasRenderingContext2D, w: number, h: number, course: number) {
  g.fillStyle = '#cdc1a2'; g.fillRect(0, 0, w, h)
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.07})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 2) }
  g.fillStyle = 'rgba(0,0,0,0.12)'
  for (let y = 0; y < h; y += course) g.fillRect(0, y, w, 1.5)
}

const place = (ctx: Ctx, m: THREE.Mesh, parent: THREE.Object3D, x: number, y: number, z: number) => {
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = ctx.shadows
  parent.add(m); return m
}
const box = (ctx: Ctx, p: THREE.Object3D, mt: THREE.Material | THREE.Material[], w: number, h: number, d: number, x: number, y: number, z: number) =>
  place(ctx, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mt), p, x, y + h / 2, z)

/** Dome (lathe) on a drum; returns the group top height. */
function dome(ctx: Ctx, p: THREE.Object3D, R: number, y: number, copper: THREE.Material, stone: THREE.Material, drumH: number) {
  const pts = Array.from({ length: 13 }, (_, i) => { const t = (i / 12) * Math.PI / 2; return new THREE.Vector2(Math.max(R * Math.cos(t), 0.001), R * 0.75 * Math.sin(t)) })
  place(ctx, new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, drumH, 24), stone), p, 0, y + drumH / 2, 0)
  place(ctx, new THREE.Mesh(new THREE.LatheGeometry(pts, 24), copper), p, 0, y + drumH, 0)
  const top = y + drumH + R * 0.75
  place(ctx, new THREE.Mesh(new THREE.CylinderGeometry(R * 0.14, R * 0.18, R * 0.35, 12), stone), p, 0, top + R * 0.17, 0)
  place(ctx, new THREE.Mesh(new THREE.SphereGeometry(R * 0.12, 12, 8), mat(GOLD, { metalness: 0.6, roughness: 0.4 })), p, 0, top + R * 0.45, 0)
  return top
}

const loader = new THREE.TextureLoader()
const photo = (url: string) => { const t = loader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t }
/** Photo-textured material; the photo already has baked light, so it is partly emissive to avoid double darkening. */
const photoMat = (map: THREE.Texture, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ map, roughness: 1, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.4, color: 0xdddddd, ...extra })

// ---- Ратуша, tower (65 m). Reference: Commons photos of the real tower: plain white-grey square shaft, arched windows at the bottom,
// balcony with iron railing, black gold-numeral clocks, heavy cornice, flat dark roof and a flagpole. No spire.
// The middle part uses a real photo (CC BY-SA, see public/photos/CREDITS.txt) on all four faces.
function ratushaTower(ring: Pt[], ctx: Ctx) {
  const o = obb(ring), W = o.w, D = o.d
  const g = new THREE.Group(); g.position.set(o.cx, 0, o.cz); g.rotation.y = -o.a; ctx.group.add(g)
  const stone = mat(0xd9d5cb), dark = mat(0x4a4d52, { roughness: 0.6, metalness: 0.3 })
  const BASE = 13, CROWN = 7, MID = 65 - CROWN - BASE

  const baseTex = canvasTex(256, 256, (c) => { // plain rusticated masonry; mostly hidden inside the main block
    c.fillStyle = '#d5d1c6'; c.fillRect(0, 0, 256, 256)
    c.fillStyle = 'rgba(0,0,0,0.14)'; for (let y = 0; y < 256; y += 16) c.fillRect(0, y, 256, 2)
  })
  box(ctx, g, mat(0xffffff, { map: baseTex }), W, BASE, D, 0, 0, 0)
  box(ctx, g, photoMat(photo('photos/tower_mid.webp')), W, MID, D, 0, BASE, 0)
  const y = BASE + MID
  box(ctx, g, stone, W + 1.6, 1.3, D + 1.6, 0, y, 0)                  // heavy cornice
  box(ctx, g, dark, W + 0.4, 1.1, D + 0.4, 0, y + 1.3, 0)             // dark parapet / roof
  const mastH = CROWN - 2.4
  place(ctx, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, mastH, 8), dark), g, 0, y + 2.4 + mastH / 2, 0)
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), new THREE.MeshBasicMaterial({ // Ukrainian flag
    map: canvasTex(2, 2, (c) => { c.fillStyle = '#0057b7'; c.fillRect(0, 0, 2, 1); c.fillStyle = '#ffd700'; c.fillRect(0, 1, 2, 1) }), side: THREE.DoubleSide }))
  place(ctx, flag, g, 0.95, y + CROWN - 0.7, 0).castShadow = false
}

// ---- Оперний театр: the real facade photo (CC BY-SA, see public/photos/CREDITS.txt) as an alpha-cut panel on the front,
// plus the broad dark-green copper dome seen behind the pediment in aerial photos.
function opera(ring: Pt[], ctx: Ctx, H: number) {
  const o = obb(ring), ux = Math.cos(o.a), uz = Math.sin(o.a), vx = -uz, vz = ux
  // front = the box side facing south (+z), where Svobody avenue lies
  const sides = [[ux, uz, o.w / 2], [-ux, -uz, o.w / 2], [vx, vz, o.d / 2], [-vx, -vz, o.d / 2]]
  const [nx, nz, half] = sides.reduce((b, s) => (s[1] > b[1] ? s : b))

  const PH = 48, PW = PH * 2048 / 1565 // panel height / width (photo aspect)
  const tex = photo('photos/opera_front.webp')
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), photoMat(tex, { alphaTest: 0.5 }))
  panel.position.set(o.cx + nx * (half + 0.2), PH / 2, o.cz + nz * (half + 0.2)); panel.rotation.y = Math.atan2(nx, nz)
  panel.receiveShadow = ctx.shadows
  ctx.group.add(panel)

  const d = new THREE.Group(); d.position.set(o.cx, 0, o.cz); ctx.group.add(d)
  dome(ctx, d, Math.min(o.w, o.d) * 0.26, H, mat(COPPER, { metalness: 0.2, roughness: 0.6 }), mat(0xcfc6b0), 5)
}

export const LANDMARKS: Record<string, Landmark> = {
  'way/683613329': { skipMesh: true, model: ratushaTower },                                  // Вежа Ратуші
  'relation/3578153': { h: 21, floors: 4, tint: 0xf0da88, style: 0, roof: 1 },               // Ратуша (корпус): yellow with grey metal roof
  'way/459807007': { h: 25, floors: 4, tint: 0xd8cdb0, style: 1, roof: 1, model: (r, c) => opera(r, c, 25) }, // Театр опери та балету
}

// Buildings with a photo facade (see avenue/facades.ts, scripts/facade-config.ts): wall up to the cornice, shop level of groundH metres, plaster tint from the photo
for (const [id, p] of Object.entries(FACADE_PANELS)) LANDMARKS[id] = { h: p.groundH + p.eaveM, floors: 4, tint: p.tint, groundH: p.groundH, roof: 1, ...LANDMARKS[id] }
for (const [id, tint] of Object.entries(AVENUE_TINTS)) LANDMARKS[id] = { tint, ...LANDMARKS[id] }
