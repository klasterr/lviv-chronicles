import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { AVENUE_TINTS } from '../world/avenue/tints'
import { quad, wallFrame } from '../world/avenue/frame'
import type { AvenueData, Front } from '../world/avenue/types'
import { box, part, T } from '../world/props'
import { SHOPS, shopSpan, signCovered, type ShopKind, type ShopSpec } from './spec'

// Ground floors of the enterable shops, drawn like ground-front.ts: one 1024x1024 canvas atlas, a 1024x256 slot per shop (3.3 m storey x two bays, so ~155 px/m across and 78 px/m up;
// everything is drawn in isometric "virtual" pixels and the slot is squashed vertically). Stone and plaster use the building's tint so the quad blends into the wall around it.
export const GROUND_H = 3.3 // one storey (FLOOR_H in materials.ts)
const SW = 1024, SH = 256
const hex = (c: number, k = 1) => `rgb(${[16, 8, 0].map((s) => Math.min(255, Math.round(((c >> s) & 255) * k))).join(',')})`
const SERIF = 'Georgia, "Times New Roman", serif'

type P = ReturnType<typeof painter>
function painter(g: CanvasRenderingContext2D, wm: number) {
  const sx = SW / wm, X = (u: number) => u * sx, Y = (h: number) => (GROUND_H - h) * sx
  const rect = (u0: number, h0: number, u1: number, h1: number, fill: string | CanvasGradient) => { g.fillStyle = fill; g.fillRect(X(u0), Y(h1), X(u1) - X(u0), Y(h0) - Y(h1)) }
  const grad = (h0: number, h1: number, c0: string, c1: string) => { const k = g.createLinearGradient(0, Y(h1), 0, Y(h0)); k.addColorStop(0, c0); k.addColorStop(1, c1); return k }
  const text = (s: string, u0: number, u1: number, h: number, size: number, fill: string, font = 'Arial', style = 'bold', outline?: string) => {
    g.font = `${style} ${size * sx}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    const k = Math.min(1, (X(u1) - X(u0)) / g.measureText(s).width)
    g.save(); g.translate(X((u0 + u1) / 2), Y(h)); g.scale(k, 1)
    if (outline) { g.lineWidth = 4; g.strokeStyle = outline; g.lineJoin = 'round'; g.strokeText(s, 0, 0) }
    g.fillStyle = fill; g.fillText(s, 0, 0); g.restore()
  }
  const line = (u0: number, h0: number, u1: number, h1: number, w: number, col: string) => { g.strokeStyle = col; g.lineWidth = w * sx; g.beginPath(); g.moveTo(X(u0), Y(h0)); g.lineTo(X(u1), Y(h1)); g.stroke() }
  const disc = (u: number, h: number, r: number, fill: string) => { g.fillStyle = fill; g.beginPath(); g.arc(X(u), Y(h), r * sx, 0, 7); g.fill() }
  return { g, sx, X, Y, rect, grad, text, line, disc, wm }
}

/** Rusticated ashlar like the ground-floor tile of the walls around it (courses 0.41 m, blocks 1.6 m, staggered). */
function stone(p: P, tint: number) {
  p.rect(0, 0, p.wm, GROUND_H, hex(tint, 0.83))
  for (let r = 0; r * 0.4125 < GROUND_H; r++) {
    p.rect(0, r * 0.4125, p.wm, r * 0.4125 + 0.022, 'rgba(0,0,0,0.34)')
    for (let u = (r % 2) * 0.8 + 0.4; u < p.wm; u += 1.6) p.rect(u, r * 0.4125, u + 0.02, (r + 1) * 0.4125, 'rgba(0,0,0,0.26)')
  }
  p.rect(0, 0, p.wm, 0.1, 'rgba(0,0,0,0.3)') // shadow at the foot, like the neighbouring wall
  for (let i = 0; i < 2500; i++) { p.g.fillStyle = `rgba(${Math.random() < 0.5 ? '70,60,40' : '255,250,235'},${Math.random() * 0.05})`; p.g.fillRect(Math.random() * SW, Math.random() * SH * 3, 3, 2) }
}

/** Lit glazing: a vertical gradient with a dark frame. */
function glazing(p: P, u0: number, h0: number, u1: number, h1: number, frame: string, top: string, bottom: string) {
  const fr = 0.07, g = p.g
  p.rect(u0 - fr, h0 - fr * 0.6, u1 + fr, h1 + fr, frame)
  p.rect(u0, h0, u1, h1, p.grad(h0, h1, top, bottom))
}
const mullions = (p: P, u0: number, h0: number, u1: number, h1: number, n: number, col: string) => { for (let i = 1; i < n; i++) p.rect(u0 + ((u1 - u0) * i) / n - 0.015, h0, u0 + ((u1 - u0) * i) / n + 0.015, h1, col) }

/** Fascia board with a raised moulding. */
function fascia(p: P, u0: number, u1: number, h0: number, h1: number, fill: string, edge: string) {
  p.rect(u0 - 0.06, h0 - 0.06, u1 + 0.06, h1 + 0.06, edge); p.rect(u0, h0, u1, h1, fill)
  p.rect(u0, h1 - 0.03, u1, h1, 'rgba(255,255,255,0.18)'); p.rect(u0, h0, u1, h0 + 0.03, 'rgba(0,0,0,0.3)')
}

interface Ctx { p: P; w: number; door: number; dl: number; wl: number; wr: number }

/** Glass door with a framed transom; (u) centre. */
function door(p: P, u: number, frame: string, glass0: string, glass1: string, kick = '#2a2420') {
  p.rect(u - 0.6, 0, u + 0.6, 2.5, frame); p.rect(u - 0.5, 0.05, u + 0.5, 2.05, kick)
  p.rect(u - 0.45, 0.45, u + 0.45, 2.0, p.grad(0.45, 2.0, glass0, glass1)); p.rect(u - 0.015, 0.05, u + 0.015, 2.05, frame)
  p.rect(u - 0.5, 2.1, u + 0.5, 2.43, p.grad(2.1, 2.43, glass0, glass1)); p.rect(u - 0.5, 2.05, u + 0.5, 2.1, frame)
  p.rect(u + 0.28, 1.0, u + 0.32, 1.25, '#d9c27a'); p.rect(u - 0.32, 1.0, u - 0.28, 1.25, '#d9c27a') // pull handles
}

const rnd = (n: number) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1

const PAINT: Record<ShopKind, (c: Ctx) => void> = {
  books(c) { // charcoal fascia, yellow letter "Є", book-lined windows
    const { p, w } = c
    fascia(p, 0.3, w - 0.3, 2.62, 3.22, '#1d1d20', '#0d0d0f')
    p.text('Є', 0.45, 1.2, 2.93, 0.62, '#ffd21f', 'Arial', 'bold'); p.text('КНИГАРНЯ', 1.3, w - 0.5, 2.93, 0.3, '#ffffff', 'Arial', 'bold')
    for (const [a, b] of [[c.wl, c.wr]]) {
      glazing(p, a, 0.62, b, 2.42, '#18181a', '#fff0c8', '#c99a5a'); mullions(p, a, 0.62, b, 2.42, 3, '#18181a')
      for (let s = 0; s < 4; s++) { // shelves of colourful spines
        const h = 0.78 + s * 0.42
        for (let u = a + 0.05; u < b - 0.08; u += 0.06) { const r = rnd(u * 17 + s * 5); p.rect(u, h, u + 0.045, h + 0.22 + r * 0.14, ['#8a2a2a', '#2f5d8a', '#d8b64a', '#3f7a4f', '#e8e0d0', '#5a3a6a', '#c8612a'][Math.floor(r * 7)]) }
        p.rect(a, h - 0.03, b, h, '#3a2a1c')
      }
    }
    door(p, c.door, '#18181a', 'rgba(255,238,200,0.95)', 'rgba(200,150,90,0.95)')
    p.rect(c.door + 0.62, 1.4, c.door + 0.95, 1.85, '#f1ecdd'); p.text('Є', c.door + 0.62, c.door + 0.95, 1.62, 0.3, '#111')
  },
  coffee(c) { // dark roastery: espresso fascia with gold letters, warm windows with cans and lamps
    const { p, w } = c
    fascia(p, 0.2, w - 0.2, 2.6, 3.24, '#2a1810', '#6b4a1e')
    p.text('ЛЬВІВСЬКА МАНУФАКТУРА КАВИ', 0.4, w - 0.4, 2.93, 0.3, '#e0b95a', SERIF, 'bold')
    glazing(p, c.wl, 0.7, c.wr, 2.4, '#3d2616', '#ffe2a8', '#b0702e'); mullions(p, c.wl, 0.7, c.wr, 2.4, 2, '#3d2616')
    p.rect(c.wl, 1.5, c.wr, 1.54, '#3d2616')
    for (let u = c.wl + 0.12; u < c.wr - 0.15; u += 0.3) { p.rect(u, 1.54, u + 0.2, 1.84, ['#5a3a22', '#8a5a2a', '#e8d9b0'][Math.floor(rnd(u * 9) * 3)]); p.rect(u + 0.03, 1.62, u + 0.17, 1.75, '#e0b95a') } // coffee tins on the shelf
    for (const u of [c.wl + 0.5, (c.wl + c.wr) / 2, c.wr - 0.5]) { p.line(u, 2.4, u, 2.05, 0.012, '#222'); p.disc(u, 1.97, 0.1, '#ffe9a0') } // pendant lamps
    p.rect(c.wl, 0.7, c.wr, 1.05, 'rgba(60,35,15,0.9)') // counter seen through the glass
    door(p, c.door, '#3d2616', 'rgba(255,225,160,0.95)', 'rgba(190,120,50,0.95)')
    p.rect(c.door - 0.6, 0, c.door + 0.6, 0.12, '#2a1810')
  },
  pharmacy(c) { // white fascia, big green "D.S." and cross, stripe, product windows
    const { p, w } = c
    fascia(p, 0.25, w - 0.25, 2.55, 3.25, '#f6f6f2', '#2f8f4a')
    p.text('D.S.', 0.4, 2.6, 2.9, 0.58, '#1f9a46', 'Arial', 'bold'); p.text('АПТЕКА', 2.6, w - 1.0, 2.9, 0.34, '#1f9a46', 'Arial', 'bold')
    p.rect(w - 0.95, 2.66, w - 0.45, 3.16, '#1f9a46'); p.rect(w - 0.78, 2.78, w - 0.62, 3.04, '#fff'); p.rect(w - 0.87, 2.87, w - 0.53, 2.95, '#fff') // cross
    p.rect(0.25, 2.45, w - 0.25, 2.52, '#1f9a46')
    glazing(p, c.wl, 0.62, c.wr, 2.35, '#cfd6d2', '#f3fbff', '#cfe3ea'); mullions(p, c.wl, 0.62, c.wr, 2.35, 2, '#cfd6d2')
    for (let s = 0; s < 3; s++) { const h = 0.8 + s * 0.52; p.rect(c.wl, h - 0.03, c.wr, h, '#9aa7a2'); for (let u = c.wl + 0.06; u < c.wr - 0.15; u += 0.19) { const r = rnd(u * 13 + s); p.rect(u, h, u + 0.15, h + 0.17 + r * 0.14, ['#ffffff', '#2f9a55', '#e9eef0', '#e8782a', '#4a90d0'][Math.floor(r * 5)]) } }
    door(p, c.door, '#b9c2be', 'rgba(235,248,255,0.95)', 'rgba(190,220,230,0.95)', '#8d9894')
    p.rect(c.door + 0.62, 1.5, c.door + 0.95, 1.95, '#1f9a46'); p.rect(c.door + 0.75, 1.62, c.door + 0.82, 1.83, '#fff'); p.rect(c.door + 0.69, 1.69, c.door + 0.88, 1.75, '#fff')
  },
  cafe(c) { // bottle-green fascia, gold serif script, arched windows with lace curtains and cakes
    const { p, w } = c
    fascia(p, 0.2, w - 0.2, 2.6, 3.24, '#173a2c', '#c9a24a')
    p.text("Віденська кав'ярня", 0.4, w - 0.4, 2.93, 0.4, '#e6c875', SERIF, 'italic bold')
    glazing(p, c.wl, 0.7, c.wr, 2.2, '#2a1a12', '#ffe6b5', '#c88b4a'); mullions(p, c.wl, 0.7, c.wr, 2.2, 2, '#2a1a12')
    p.rect(c.wl, 1.85, c.wr, 2.2, 'rgba(255,248,235,0.9)') // lace café curtain over the top of the window
    for (let u = c.wl; u < c.wr; u += 0.12) p.disc(u + 0.06, 1.85, 0.06, 'rgba(255,248,235,0.9)')
    for (const [u, col] of [[c.wl + 0.45, '#7a3a24'], [(c.wl + c.wr) / 2, '#e9c27a'], [c.wr - 0.45, '#c84a5a']] as [number, string][]) { p.rect(u - 0.2, 1.3, u + 0.2, 1.33, '#d8d2c4'); p.rect(u - 0.12, 1.33, u + 0.12, 1.5, col); p.disc(u, 1.5, 0.05, '#c8282e') } // tiered cake stand
    p.rect(c.door - 0.6, 0, c.door + 0.6, 2.5, '#2a1a12'); glazing(p, c.door - 0.45, 0.45, c.door + 0.45, 2.0, '#2a1a12', '#ffe3ae', '#c88b4a')
    p.rect(c.door - 0.5, 0.05, c.door + 0.5, 0.45, '#3a2418'); p.rect(c.door - 0.015, 0.05, c.door + 0.015, 2.0, '#2a1a12')
    p.rect(c.door - 0.5, 2.1, c.door + 0.5, 2.43, p.grad(2.1, 2.43, '#ffe3ae', '#c88b4a')); p.rect(c.door - 0.5, 2.05, c.door + 0.5, 2.1, '#2a1a12')
    p.rect(c.door + 0.28, 1.0, c.door + 0.32, 1.25, '#d9c27a')
  },
}

/** 3D extras in front of the canvas: [solid, glow] geometry in wall-local coordinates (x along the wall, y up, z out of it). */
function trim(s: ShopSpec, c: Ctx): [THREE.BufferGeometry[], THREE.BufferGeometry[]] {
  const solid: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], w = c.w
  const lamp = (u: number) => { solid.push(box(0.03, 0.03, 0.4, 0x151515, u, 3.3, 0.2)); glow.push(box(0.2, 0.06, 0.1, 0xfff0c0, u, 3.28, 0.42)) } // gooseneck lamp over the fascia
  if (s.kind === 'books') { lamp(0.9); lamp(w - 0.9) }
  if (s.kind === 'coffee') { solid.push(box(0.04, 0.04, 0.55, 0x2a1810, w - 0.5, 2.3, 0.28), part(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16), 0xc9a24a, T(w - 0.5, 2.3, 0.58).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)))); lamp(1.2); lamp(w - 1.6) }
  if (s.kind === 'pharmacy') { const x = w - 0.3; glow.push(box(0.1, 0.5, 0.08, 0x22d65a, x, 1.7, 0.2), box(0.5, 0.1, 0.08, 0x22d65a, x, 1.7, 0.2)); solid.push(box(0.05, 0.05, 0.16, 0x444444, x, 1.7, 0.1)) }
  if (s.kind === 'cafe') { // awning over the window bay: sloped top and a scalloped valance of alternating stripes
    const a = c.wl - 0.15, b = c.wr + 0.15, n = Math.round((b - a) / 0.22), sw = (b - a) / n
    for (let i = 0; i < n; i++) { const col = i % 2 ? 0xf3ead2 : 0x8c1d26; solid.push(box(sw, 0.02, 0.8, col, a + (i + 0.5) * sw, 2.45, 0.4), box(sw, 0.2, 0.02, col, a + (i + 0.5) * sw, 2.34, 0.8)) }
  }
  return [solid, glow]
}

export const SHOP_TINT_DEFAULT = 0xd6cfb8

/** Hangs the shopfronts on their walls (3 draw calls: textured quads, solid trim, glowing trim). Returns a test for mapped signs that the new fronts would cover. */
export function addShopFronts(st: { fronts?: AvenueData['fronts'] }, parent: THREE.Object3D, shadows: boolean) {
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH * SHOPS.length
  const g = cv.getContext('2d')!
  const quads: THREE.BufferGeometry[] = [], solid: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = []
  const placed: { f: Front; u0: number; u1: number }[] = []
  SHOPS.forEach((s, i) => {
    const f = st.fronts?.[s.front]; if (!f) return
    const { u0, u1, door, bw } = shopSpan(f, s), wm = u1 - u0
    g.save(); g.translate(0, i * SH); g.beginPath(); g.rect(0, 0, SW, SH); g.clip()
    const sx = SW / wm; g.scale(1, SH / (GROUND_H * sx))
    const p = painter(g, wm)
    stone(p, AVENUE_TINTS[s.front] ?? SHOP_TINT_DEFAULT)
    const dl = door - u0, other = s.doorBay === 0 ? 1 : 0 // window = the other bay (two-bay shopfronts)
    const c: Ctx = { p, w: wm, door: dl, dl, wl: other * bw + 0.35, wr: (other + 1) * bw - 0.35 }
    PAINT[s.kind](c)
    g.restore()
    quads.push(quad(f, u0, u1, 0, GROUND_H, 0.04, [0.002, 1 - ((i + 1) * SH - 0.5) / cv.height, 0.998, 1 - (i * SH + 0.5) / cv.height]))
    const fr = wallFrame(f), m = new THREE.Matrix4().makeRotationY(Math.atan2(-fr.tz, fr.tx)).setPosition(fr.at(u0, 0, 0))
    const [so, gl] = trim(s, c)
    for (const geo of so) solid.push(geo.applyMatrix4(m))
    for (const geo of gl) glow.push(geo.applyMatrix4(m))
    placed.push({ f, u0, u1 })
  })
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
  const add = (geo: THREE.BufferGeometry[], mat: THREE.Material, cast: boolean) => { if (!geo.length) return; const m = new THREE.Mesh(mergeGeometries(geo)!, mat); m.castShadow = cast && shadows; m.receiveShadow = shadows; parent.add(m) }
  add(quads, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false)
  add(solid, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), true)
  add(glow, new THREE.MeshBasicMaterial({ vertexColors: true }), false)
  return {
    covers: ([sx, sz, , , w]: number[]) => placed.some(({ f, u0, u1 }) => {
      const tx = (f.b[0] - f.a[0]) / f.len, tz = (f.b[1] - f.a[1]) / f.len, dx = sx - f.a[0], dz = sz - f.a[1]
      return Math.abs(dx * f.n[0] + dz * f.n[1]) < 0.5 && signCovered(dx * tx + dz * tz, w, u0, u1)
    }),
  }
}
