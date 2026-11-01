import * as THREE from 'three'
import type { AvenueData } from './types'

const PALETTE: [string, string][] = [ // [background, text]: typical fascia colours of the avenue's shops
  ['#151515', '#ffffff'], ['#1d2b3a', '#ffffff'], ['#23382c', '#f2ead0'], ['#4a1f26', '#f5e6c8'], ['#efe6d0', '#2a2118'],
  ['#e7b82a', '#1b1b1b'], ['#3a2a1d', '#f0d9a8'], ['#2d2d33', '#d9e6f2'],
]
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }
export const SIGN_H = 0.56, SIGN_Y = 3.05, PXM = 64 // sign height (m), bottom edge above the pavement (m), atlas pixels per metre

/** One mesh (one draw call, one 1024x1024 atlas) with all shop fascia signs of the avenue: text from OSM `name`, size from the text length, placed on the street-facing wall. */
export function buildSigns(d: AvenueData, skip: (sign: number[]) => boolean = () => false): THREE.Mesh | null {
  if (!d.signs?.length) return null
  const A = 1024, cv = document.createElement('canvas'); cv.width = cv.height = A
  const g = cv.getContext('2d')!, ch = Math.round(SIGN_H * PXM)
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  let x = 0, y = 0
  for (const [sx, sz, nx, nz, w, ti] of d.signs.filter((s) => !skip(s))) {
    const text = d.signTexts[ti], cw = Math.round(w * PXM)
    if (x + cw > A) { x = 0; y += ch }
    if (y + ch > A) break // atlas full (never at the current ~100 signs)
    const [bg, fg] = PALETTE[hash(text) % PALETTE.length]
    g.fillStyle = bg; g.fillRect(x, y, cw, ch)
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, cw - 2, ch - 2)
    g.font = 'bold 24px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg
    const k = Math.min(1, (cw - 10) / g.measureText(text).width)
    g.save(); g.translate(x + cw / 2, y + ch / 2 + 1); g.scale(k, 1); g.fillText(text, 0, 0); g.restore()
    // quad on the wall: viewer looks along -n, right-hand direction = (nz, -nx)
    const rx = nz, rz = -nx, px = sx + nx * 0.06, pz = sz + nz * 0.06, i = pos.length / 3
    for (const [s, h] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) pos.push(px + rx * s * w / 2, SIGN_Y + h * SIGN_H, pz + rz * s * w / 2)
    const u0 = (x + 1) / A, u1 = (x + cw - 1) / A, v0 = 1 - (y + ch - 1) / A, v1 = 1 - (y + 1) / A
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1)
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3)
    x += cw
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere()
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: 0xe8e8e8 }))
  mesh.receiveShadow = false; mesh.castShadow = false
  return mesh
}
