import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { part } from './props'
import type { Colliders } from './colliders'
import { STEPS, STELE, addMonumentColliders, arcPt, steleTop, type MonumentSpec } from './monument-layout'

/** Shevchenko monument (Lviv, prosp. Svobody; sculptors V. and A. Sukhorski, 1992/96): bronze figure on a stepped granite pedestal,
 *  12 m bronze "Wave of National Revival" stele with Oranta on top, flowers at the foot. Hand-built, ~3k triangles, 4 draw calls (bronze, stone, stele canvas, plaque canvas). */
const V3 = THREE.Vector3, M4 = THREE.Matrix4
type G = THREE.BufferGeometry
const rnd = (n: number) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1
const HS = 10.4 // metres of bronze wall painted on the canvas (base 1 m .. top)
const Y0 = 3.0 // feet of the figure above the ground: steps + pedestal 2.9 m + bronze pad 0.1 m

const P = (g: G, color: number, m?: THREE.Matrix4) => { g.deleteAttribute('uv'); return part(g, color, m) }
const xf = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1) =>
  new M4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(s, s, s))
const box = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => P(new THREE.BoxGeometry(w, h, d), c, xf(x, y, z, rx, ry, rz))
const limb = (a: number[], b: number[], r0: number, r1: number, c: number, seg = 7) => {
  const A = new V3(...a), B = new V3(...b), d = B.clone().sub(A), len = d.length()
  return P(new THREE.CylinderGeometry(r1, r0, len, seg), c, new M4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()), new V3(1, 1, 1)))
}

interface Ring { y: number; cx?: number; cz?: number; rx: number; rz: number; k?: number }
/** Elliptic rings lofted into a closed smooth shell; k scales the vertical pleats (fold) of that ring. */
function loft(rings: Ring[], seg: number, fold = 0, phase = 0): G {
  const pos: number[] = [], idx: number[] = []
  for (const r of rings) for (let j = 0; j < seg; j++) {
    const t = (j / seg) * Math.PI * 2, f = 1 + fold * (r.k ?? 1) * Math.sin(5 * t + r.y * 2.1 + phase)
    pos.push((r.cx ?? 0) + r.rx * f * Math.sin(t), r.y, (r.cz ?? 0) + r.rz * f * Math.cos(t))
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, b = i * seg + ((j + 1) % seg); idx.push(a, b, a + seg, b, b + seg, a + seg)
  }
  const top = rings.length - 1, last = rings[top], c = pos.length / 3
  pos.push(last.cx ?? 0, last.y, last.cz ?? 0)
  for (let j = 0; j < seg; j++) idx.push(c, top * seg + j, top * seg + ((j + 1) % seg))
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
  return g
}

/** Flat-shaded triangle soup builder; quads are wound to face `want`. */
class Soup {
  pos: number[] = []; uv: number[] = []
  quad(a: number[], b: number[], c: number[], d: number[], want: number[], uvs?: number[][]) {
    const e1 = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), e2 = new V3(c[0] - a[0], c[1] - a[1], c[2] - a[2])
    const flip = e1.cross(e2).dot(new V3(...want)) < 0, q = [a, b, c, d], u = uvs ?? [[0, 0], [0, 0], [0, 0], [0, 0]]
    for (const [i, j, k] of flip ? [[0, 2, 1], [0, 3, 2]] : [[0, 1, 2], [0, 2, 3]]) for (const n of [i, j, k]) { this.pos.push(...q[n]); this.uv.push(...u[n]) }
  }
  geo(uv: boolean): G {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.computeVertexNormals(); return g
  }
}

/** Slab along the stele arc between radii r0 (front) and r1 (back), from y0 up to top(u). Faces: front, back, top, two ends. */
function arcSlab(s: Soup, N: number, r0: number, r1: number, y0: number, top: (u: number) => number, uvOf?: (u: number, y: number, back: boolean) => number[]) {
  const p = (u: number, r: number, y: number) => { const [x, z] = arcPt(u, r); return [x, y, z] }
  const uvf = (u: number, y: number, back = false) => uvOf?.(u, y, back) ?? [0, 0]
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N, t0 = top(u0), t1 = top(u1), a0 = (u0 + u1 - 1) * STELE.len / STELE.R / 2
    const nIn = [-Math.sin(a0), 0, Math.cos(a0)] // towards the arc centre = front normal
    s.quad(p(u0, r0, y0), p(u1, r0, y0), p(u1, r0, t1), p(u0, r0, t0), nIn, [uvf(u0, y0), uvf(u1, y0), uvf(u1, t1), uvf(u0, t0)])
    s.quad(p(u0, r1, y0), p(u1, r1, y0), p(u1, r1, t1), p(u0, r1, t0), nIn.map((v) => -v), [uvf(u0, y0, true), uvf(u1, y0, true), uvf(u1, t1, true), uvf(u0, t0, true)])
    s.quad(p(u0, r0, t0), p(u1, r0, t1), p(u1, r1, t1), p(u0, r1, t0), [0, 1, 0], [uvf(u0, t0), uvf(u1, t1), uvf(u1, t1), uvf(u0, t0)])
  }
  for (const [u, sg] of [[0, -1], [1, 1]]) {
    const a = (u - 0.5) * STELE.len / STELE.R, n = [Math.cos(a) * sg, 0, Math.sin(a) * sg]
    s.quad(p(u, r0, y0), p(u, r1, y0), p(u, r1, top(u)), p(u, r0, top(u)), n, [uvf(u, y0), uvf(u, y0), uvf(u, top(u)), uvf(u, top(u))])
  }
}

/** Verdigris on upward faces and as vertical streaks running down from them; undersides darker. */
function patina(g: G) {
  const p = g.attributes.position, n = g.attributes.normal, col = g.attributes.color, green = new THREE.Color(0x4f8a70), c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), up = Math.max(0, n.getY(i))
    const streak = Math.max(0, Math.sin(x * 17 + z * 13 + Math.sin(y * 2 + x * 5) * 1.5)) ** 3
    c.fromBufferAttribute(col, i).lerp(green, Math.min(0.75, up * 0.55 + streak * 0.3 * (0.25 + y / 12))).multiplyScalar(1 - 0.3 * Math.max(0, -n.getY(i)))
    col.setXYZ(i, c.r, c.g, c.b)
  }
}

const BR = 0x5a4a33, BR_L = 0x75613f, BR_D = 0x382d20, SK = 0x6d5a3d // bronze, lighter, darker, "skin"

/** The poet: standing in a long belted coat with a fur collar, cloak falling behind, lambskin cap, moustache; right hand on the chest, left holds the cloak.
 *  Pose is a guess: the sources describe only height (4.45 m), material and the Argentine casting, not the posture. */
function statue(out: G[]) {
  const F = (g: G, c: number, m = new M4()) => P(g, c, xf(0, Y0, 0).multiply(m))
  const L = (a: number[], b: number[], r0: number, r1: number, c: number, seg = 7) => { out.push(limb([a[0], a[1] + Y0, a[2]], [b[0], b[1] + Y0, b[2]], r0, r1, c, seg)) }
  out.push(box(1.5, 0.1, 1.3, BR_D, 0, Y0 - 0.05, 0))
  out.push(F(loft([
    { y: 0, cz: 0.02, rx: 0.64, rz: 0.5 }, { y: 0.35, cz: 0.02, rx: 0.6, rz: 0.47 }, { y: 1.1, rx: 0.54, rz: 0.4 }, { y: 1.9, rx: 0.5, rz: 0.36, k: 0.8 },
    { y: 2.45, rx: 0.43, rz: 0.31, k: 0.4 }, { y: 2.95, cz: 0.03, rx: 0.5, rz: 0.34, k: 0.3 }, { y: 3.3, cz: 0.02, rx: 0.6, rz: 0.34, k: 0.2 }, { y: 3.55, rx: 0.5, rz: 0.28, k: 0 },
    { y: 3.68, rx: 0.24, rz: 0.21, k: 0 }, { y: 3.8, rx: 0.17, rz: 0.16, k: 0 }], 18, 0.045), BR))
  out.push(F(loft([{ y: 3.5, cx: -0.1, cz: -0.28, rx: 0.5, rz: 0.1 }, { y: 2.4, cx: -0.2, cz: -0.4, rx: 0.58, rz: 0.15 }, { y: 1.2, cx: -0.2, cz: -0.45, rx: 0.62, rz: 0.2 }, { y: 0.05, cx: -0.15, cz: -0.46, rx: 0.66, rz: 0.22 }], 12, 0.14), BR_L))
  out.push(F(loft([{ y: 2.45, cx: -0.72, cz: 0.1, rx: 0.15, rz: 0.12 }, { y: 1.95, cx: -0.74, cz: 0.15, rx: 0.19, rz: 0.16 }, { y: 1.35, cx: -0.72, cz: 0.12, rx: 0.19, rz: 0.15 }], 12, 0.1, 2), BR_L))
  out.push(F(loft([{ y: 2.3, rx: 0.5, rz: 0.39 }, { y: 2.58, rx: 0.49, rz: 0.37 }], 18), BR_D)) // belt
  out.push(F(new THREE.TorusGeometry(0.27, 0.09, 5, 12), BR_D, xf(0, 3.66, 0.02, Math.PI / 2))) // fur collar
  for (const [a, b] of [[[0, 3.5, 0.3], [0, 2.45, 0.31]], [[0, 2.45, 0.31], [0, 1.1, 0.41]], [[0, 1.1, 0.41], [0, 0.05, 0.52]]]) L(a, b, 0.02, 0.02, BR_D, 5) // placket
  for (const sx of [-1, 1]) out.push(box(0.2, 0.12, 0.42, BR_D, sx * 0.2, Y0 + 0.06, 0.4)) // boots
  // arms: +x holds the lapel at the chest, -x hangs with the cloak over the forearm
  L([0.6, 3.35, 0], [0.72, 2.7, 0.1], 0.15, 0.12, BR); L([0.72, 2.7, 0.1], [0.22, 3.05, 0.34], 0.12, 0.09, BR)
  out.push(box(0.15, 0.1, 0.17, SK, 0.16, Y0 + 3.08, 0.38, 0.2, 0.5, 0))
  for (let i = 0; i < 3; i++) out.push(box(0.035, 0.035, 0.12, SK, 0.1 + i * 0.045, Y0 + 3.1, 0.47, 0.1, 0.5, 0))
  L([-0.6, 3.35, 0], [-0.68, 2.65, 0.06], 0.15, 0.12, BR); L([-0.68, 2.65, 0.06], [-0.66, 2.02, 0.24], 0.12, 0.1, BR)
  out.push(box(0.14, 0.12, 0.15, SK, -0.66, Y0 + 1.95, 0.27))
  // head
  out.push(F(new THREE.SphereGeometry(1, 10, 8), SK, xf(0, 4, 0.05).multiply(new M4().makeScale(0.21, 0.27, 0.24))))
  out.push(F(new THREE.SphereGeometry(1, 8, 6), BR_D, xf(0, 3.98, -0.12).multiply(new M4().makeScale(0.23, 0.26, 0.2))))
  const f = (w: number, h: number, d: number, c: number, x: number, y: number, z: number, rx = 0, rz = 0) => out.push(box(w, h, d, c, x, Y0 + y, z, rx, 0, rz))
  f(0.07, 0.15, 0.1, SK, 0, 3.97, 0.28, 0.25); f(0.36, 0.05, 0.1, SK, 0, 4.09, 0.24); f(0.13, 0.1, 0.1, SK, 0, 3.78, 0.22)
  for (const sx of [-1, 1]) {
    f(0.08, 0.025, 0.03, BR_D, sx * 0.08, 4.05, 0.265); f(0.17, 0.05, 0.08, BR_D, sx * 0.09, 3.9, 0.26, 0, -sx * 0.35); f(0.1, 0.045, 0.06, BR_D, sx * 0.2, 3.84, 0.22, 0, -sx * 0.9)
    f(0.1, 0.28, 0.22, BR_D, sx * 0.22, 3.98, -0.02); f(0.04, 0.1, 0.06, SK, sx * 0.215, 3.96, 0.04)
  }
  out.push(F(new THREE.CylinderGeometry(0.27, 0.29, 0.15, 10), 0x4a3b2a, xf(0, 4.22, 0.04)))
  out.push(F(new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), BR_D, xf(0, 4.295, 0.04).multiply(new M4().makeScale(0.27, 0.1, 0.27))))
}

function oranta(out: G[], m: THREE.Matrix4) {
  const O = (g: G, c: number, l = new M4()) => out.push(P(g, c, m.clone().multiply(l)))
  O(loft([{ y: 0, rx: 0.6, rz: 0.36 }, { y: 0.8, rx: 0.4, rz: 0.26 }, { y: 1.5, rx: 0.26, rz: 0.2 }, { y: 1.68, rx: 0.1, rz: 0.1 }], 10, 0.08), BR_L)
  O(new THREE.SphereGeometry(0.14, 8, 6), BR_L, xf(0, 1.85, 0)); O(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16), 0x7a6a3a, xf(0, 1.9, -0.12, Math.PI / 2))
  for (const sx of [-1, 1]) {
    out.push(limb(new V3(sx * 0.22, 1.4, 0).applyMatrix4(m).toArray(), new V3(sx * 0.68, 1.85, 0.05).applyMatrix4(m).toArray(), 0.11, 0.08, BR_L, 6))
    O(new THREE.BoxGeometry(0.1, 0.12, 0.05), SK, xf(sx * 0.7, 1.92, 0.05))
  }
  O(new THREE.BoxGeometry(1.1, 0.3, 0.6), BR, xf(0, -0.15, 0))
}

/** Dark bronze with raised-looking figures. Front (top half) and back (bottom half) of the wall, painted in metres. */
function steleCanvas() {
  const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 512 }), g = cv.getContext('2d')!, W = STELE.len, sx = 512 / W, sy = 256 / HS
  let seed = 11; const r = () => rnd(seed++)
  const TONES = ['#8a7345', '#7a6340', '#9a8250', '#6f5a38', '#a38b57']
  for (const back of [false, true]) {
    const oy = back ? 256 : 0, vis = (x: number) => steleTop(Math.min(1, Math.max(0, x / W))) - STELE.base
    const bg = g.createLinearGradient(0, oy, 0, oy + 256); bg.addColorStop(0, '#5e4a31'); bg.addColorStop(1, '#3a2d1d'); g.fillStyle = bg; g.fillRect(0, oy, 512, 256)
    g.save(); g.beginPath(); g.rect(0, oy, 512, 256); g.clip(); g.translate(0, oy + 256); g.scale(sx, -sy)
    const shape = (path: () => void, tone: string) => {
      for (const [dx, dy, col] of [[0.07, -0.06, 'rgba(10,6,2,.7)'], [0, 0, tone], [-0.03, 0.03, 'rgba(210,180,120,.2)']] as const) {
        g.save(); g.translate(dx, dy); g.fillStyle = col; g.beginPath(); path(); g.fill(); g.restore()
      }
    }
    const fig = (x: number, y: number, h: number, tone = TONES[Math.floor(r() * 5)]) => {
      const w = 0.2 + r() * 0.1, arm = r(), dir = r() < 0.5 ? -1 : 1
      shape(() => { g.moveTo(x - w * h, y); g.lineTo(x - 0.15 * h, y + 0.58 * h); g.lineTo(x - 0.18 * h, y + 0.7 * h); g.lineTo(x + 0.18 * h, y + 0.7 * h); g.lineTo(x + 0.15 * h, y + 0.58 * h); g.lineTo(x + w * h, y); g.closePath() }, tone)
      shape(() => g.arc(x + dir * 0.02 * h, y + 0.82 * h, 0.13 * h, 0, 7), tone)
      if (arm < 0.55) bar(x + dir * 0.17 * h, y + 0.66 * h, x + dir * (0.3 + arm * 0.2) * h, y + (arm < 0.3 ? 0.98 : 0.5) * h, 0.1 * h, tone) // raised or open arm
    }
    const ell = (x: number, y: number, rx: number, ry: number, tone: string) => shape(() => g.ellipse(x, y, rx, ry, 0, 0, 7), tone)
    const bar = (x0: number, y0: number, x1: number, y1: number, w: number, tone: string) => { g.strokeStyle = tone; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke() }
    const txt = (s: string, x: number, y: number, m: number, col: string) => { g.save(); g.translate(x, y); g.scale(0.01, -0.01); g.font = `bold ${m * 100}px serif`; g.textAlign = 'center'; g.fillStyle = col; g.fillText(s, 0, 0); g.restore() }
    for (let k = 0; k < 7; k++) { // the "wave": long lighter swells rising to the right
      g.strokeStyle = k % 2 ? 'rgba(150,120,70,.16)' : 'rgba(10,6,2,.22)'; g.lineWidth = 0.5; g.beginPath()
      for (let x = 0; x <= W; x += 0.5) { const y = 0.8 + k * 1.4 + x * 0.12 + 0.7 * Math.sin(x * 0.5 + k * 1.3); x ? g.lineTo(x, y) : g.moveTo(x, y) }
      g.stroke()
    }
    const free = (x: number, y: number, h: number) => y + h < vis(x) - 0.15 && !(x > 5.2 && x < 9.2 && y > 3 && y < 7.4) && !(x > 1.4 && x < 4.6 && y < 2.6) && !(back && x > 9.5 && y < 4.4)
    for (let y = 0.4; y < 9; y += 1.1) for (let x = 0.4 + r() * 0.5; x < W - 0.3; x += 0.6 + r() * 0.5) { const h = 1.2 + r() * 0.6, yy = y + r() * 0.3; if (free(x, yy, h)) fig(x, yy, h) }
    if (!back) {
      ell(7.2, 5.2, 1.5, 0.7, '#74603c'); for (const dx of [-1, -0.5, 0.6, 1.1]) bar(7.2 + dx, 4.9, 7.2 + dx * 1.05, 3.6, 0.22, '#6e5a3a')
      bar(8.4, 5.5, 8.9, 6.4, 0.35, '#74603c'); ell(9, 6.5, 0.28, 0.2, '#74603c'); fig(7.2, 5.6, 1.9, '#86703f'); bar(7.8, 5.9, 8, 7.6, 0.08, '#a58a52')
      fig(3, 0.5, 2.1, '#7a6340'); fig(4, 0.5, 1.1, '#6b5638'); ell(2.4, 1.1, 0.35, 0.3, '#8a7243')
    } else {
      shape(() => g.arc(11.7, 2.6, 1.7, 0, 7), '#5c4930'); shape(() => g.arc(11.7, 2.6, 0.3, 0, 7), '#3a2e20')
      ;['1918–22', '1932–33', '1941–45', '1986'].forEach((s, i) => txt(s, 11.7, 3.45 - i * 0.55 - (i > 2 ? 0.1 : 0), 0.5, '#c8aa70'))
      bar(2.8, 0.4, 2.8, 5.5, 0.5, '#5c4930'); bar(2.8, 5, 1.2, 6.4, 0.25, '#5c4930'); bar(2.8, 5.2, 4.4, 6.6, 0.25, '#5c4930'); bar(2.8, 3.5, 3.6, 3.5, 0.08, '#a58a52'); bar(3.2, 3.9, 3.2, 3, 0.08, '#a58a52')
      for (const x of [0.6, 1.4, 2.1, 3.5, 4.2, 5]) { bar(x, 0.3, 2.8, 0.7, 0.14, '#5c4930'); shape(() => g.arc(x, 0.3, 0.22, 0, 7), '#86703f') }
      fig(6.4, 0.5, 2.7, '#7a6340'); fig(7.2, 0.5, 1.2, '#6b5638')
      for (let x = 1; x < 4; x += 0.45) bar(x, 6.6, x, 9, 0.07, '#a58a52')
      shape(() => g.arc(9.6, 7.6, 0.6, 0, 7), '#74603c')
    }
    for (let i = 0; i < 60; i++) { // verdigris running down from the crest and from ledges
      const x = r() * W, top = vis(x) - r() * 3, len = 0.8 + r() * 4, w = 0.05 + r() * 0.12, gr = g.createLinearGradient(0, top, 0, top - len)
      gr.addColorStop(0, 'rgba(90,160,125,.2)'); gr.addColorStop(1, 'rgba(90,160,125,0)'); g.fillStyle = gr; g.fillRect(x, top - len, w, len)
    }
    g.restore()
  }
  for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.09)' : 'rgba(220,190,130,.06)'; g.fillRect(r() * 512, r() * 512, 1, 1) }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

function plaqueCanvas() {
  const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 256 }), g = cv.getContext('2d')!
  g.fillStyle = '#26292d'; g.fillRect(0, 0, 512, 256)
  for (let i = 0; i < 2500; i++) { g.fillStyle = rnd(i) < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.2)'; g.fillRect(rnd(i + 5000) * 512, rnd(i + 9000) * 256, 2, 2) }
  g.strokeStyle = '#b8913a'; g.lineWidth = 6; g.strokeRect(14, 14, 484, 228); g.lineWidth = 2; g.strokeRect(26, 26, 460, 204)
  const gold = g.createLinearGradient(0, 80, 0, 190); gold.addColorStop(0, '#e6c76a'); gold.addColorStop(1, '#a8812f')
  g.fillStyle = gold; g.textAlign = 'center'; g.font = 'bold 56px serif'; g.fillText('Т. Г. ШЕВЧЕНКО', 256, 125); g.font = '44px serif'; g.fillText('1814 – 1861', 256, 195)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

export function addMonument(M: MonumentSpec, group: THREE.Object3D, colliders: Colliders, shadows: boolean) {
  const mg = new THREE.Group(); mg.position.set(M.x, 0, M.z); mg.rotation.y = M.yaw; group.add(mg)
  const bz: G[] = [], stone: G[] = []
  statue(bz)

  // ---- steps, pedestal, ground inlay (the first step is a walkable kerb; collider starts at the second)
  STEPS.forEach((s, i) => {
    const h0 = i ? STEPS[i - 1].h : 0
    stone.push(box(s.half * 2, s.h - h0, s.half * 2, [0x7d7f82, 0x8d8f93, 0x9a9ca0][i], 0, (s.h + h0) / 2, 0))
    stone.push(box(s.half * 2 + 0.04, 0.03, s.half * 2 + 0.04, 0x6c6e72, 0, s.h - 0.015, 0)) // nosing
  })
  for (const [w, d, y0, y1, c] of [[2.3, 2.1, 0.5, 0.95, 0x9a9ca0], [2.44, 2.24, 0.95, 1.02, 0x85878b], [2, 1.76, 1.02, 2.55, 0x40444a], [2.4, 2.16, 2.55, 2.72, 0x85878b], [2.24, 2, 2.72, 2.9, 0x9a9ca0]])
    stone.push(box(w, y1 - y0, d, c, 0, (y0 + y1) / 2, 0))
  const flat = (g: G, c: number, y: number) => stone.push(P(g.rotateX(-Math.PI / 2), c, xf(0, y, 0)))
  flat(new THREE.CircleGeometry(3.2, 56), 0xa4a5a1, 0.03); flat(new THREE.RingGeometry(2.85, 3.08, 56), 0x3f4247, 0.04); flat(new THREE.RingGeometry(3.13, 3.2, 56), 0x56595d, 0.04)

  // ---- flowers, candles, wreaths on the second step's ledge (inside the collider, so never walked through)
  const COL = [0xc0282d, 0xf0c030, 0xeeeeee, 0x3a6fd0, 0xd96aa0]
  const ledge = (i: number) => { // i-th spot along the 4 sides of the ledge, [x, z, yaw]
    const side = [0, 0, 0, 0, 0, 1, 1, 2, 2, 3][i % 10], t = rnd(i + 3) * 2 - 1, d = 1.6, hw = 1.35
    return side === 0 ? [t * hw, d, 0] : side === 1 ? [d, t * hw, Math.PI / 2] : side === 2 ? [-d, t * hw, -Math.PI / 2] : [t * hw, -d, Math.PI]
  }
  for (let i = 0; i < 10; i++) {
    const [x, z, yaw] = ledge(i), m = xf(x, 0.26, z, 0, yaw, 0)
    stone.push(P(new THREE.ConeGeometry(0.1, 0.34, 6), i % 2 ? 0xd9d2c0 : 0x5a7a3a, m.clone().multiply(xf(0, 0.17, -0.05, -0.5))))
    stone.push(P(new THREE.IcosahedronGeometry(0.12, 0), 0x3f6a2c, m.clone().multiply(xf(0, 0.36, 0.06))))
    for (let k = 0; k < 4; k++) stone.push(P(new THREE.OctahedronGeometry(0.06, 0), COL[Math.floor(rnd(i * 7 + k) * 5)], m.clone().multiply(xf((k % 2 - 0.5) * 0.12, 0.42 + (k >> 1) * 0.05, 0.06 + (k >> 1) * 0.06))))
  }
  for (let i = 0; i < 8; i++) { // grave lamps along the front of the ledge
    const x = ((i % 4) - 1.5) * 0.3 + (i > 3 ? 0.15 : 0), z = i > 3 ? 1.72 : 1.58
    stone.push(P(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 5), 0xb3201a, xf(x, 0.33, z))); stone.push(P(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 4), 0xffd45a, xf(x, 0.41, z)))
  }
  const wreath = (m: THREE.Matrix4) => {
    stone.push(P(new THREE.TorusGeometry(0.34, 0.07, 5, 14), 0x2c5a2a, m))
    for (const [c, dx] of [[0x2a5db0, -0.05], [0xf2c230, 0.05]] as const) stone.push(P(new THREE.BoxGeometry(0.08, 0.5, 0.012), c, m.clone().multiply(xf(dx * 1.6, -0.55, 0.02, 0, 0, dx * 2))))
    for (let k = 0; k < 5; k++) stone.push(P(new THREE.OctahedronGeometry(0.05, 0), COL[k], m.clone().multiply(xf(0.34 * Math.cos(k * 1.3), 0.34 * Math.sin(k * 1.3), 0.06))))
  }
  for (const x of [-0.55, 0.55]) wreath(xf(x, 0.9, 1.25, -0.3))
  for (const sg of [-1, 1]) wreath(xf(sg * 1.27, 0.9, 0.1, 0, sg * Math.PI / 2).multiply(xf(0, 0, 0, -0.3)))

  // ---- stele (stele frame -> monument frame)
  const c = Math.cos(M.yaw), s = Math.sin(M.yaw), dx = M.stele.x - M.x, dz = M.stele.z - M.z
  const ST = xf(dx * c - dz * s, 0, dx * s + dz * c, 0, M.steleYaw - M.yaw, 0)
  const plinth = new Soup(); arcSlab(plinth, 24, STELE.R - STELE.plinthFront, STELE.R + STELE.plinthBack, 0, () => STELE.base)
  stone.push(P(plinth.geo(false), 0x6f7176, ST))
  const wall = new Soup(), HSm = HS
  arcSlab(wall, 48, STELE.R, STELE.R + STELE.thick, STELE.base, steleTop, (u, y, back) => back ? [1 - u, (0.5 * (y - STELE.base)) / HSm] : [u, 0.5 + (0.5 * (y - STELE.base)) / HSm])
  const wallGeo = wall.geo(true); wallGeo.applyMatrix4(ST)
  const au = 0.9, [ox, oz] = arcPt(au, STELE.R + STELE.thick / 2)
  oranta(bz, ST.clone().multiply(xf(ox, steleTop(au) + 0.3, oz, 0, -(au - 0.5) * STELE.len / STELE.R, 0, 1.4)))

  const bronzeGeo = mergeGeometries(bz)!; patina(bronzeGeo)
  const mk = (geo: G, mat: THREE.Material) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadows; m.receiveShadow = shadows; mg.add(m); return m }
  mk(bronzeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.5, emissive: 0x1e170e }))
  mk(mergeGeometries(stone)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }))
  mk(wallGeo, new THREE.MeshStandardMaterial({ map: steleCanvas(), emissive: 0x2e2417, metalness: 0.25, roughness: 0.55 }))
  mk(new THREE.PlaneGeometry(1.5, 0.75).translate(0, 1.8, 0.88 + 0.012), new THREE.MeshStandardMaterial({ map: plaqueCanvas(), roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })).castShadow = false
  addMonumentColliders(colliders, M)
}
