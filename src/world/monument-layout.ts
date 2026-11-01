import type { Colliders } from './colliders'

/** Shevchenko monument layout (pure, no THREE): steps, pedestal and the "Wave" stele. Local frame: +z is the way the poet faces. */
export interface MonumentSpec { x: number; z: number; yaw: number; stele: { x: number; z: number }; steleYaw: number }

/** Steps from the outside in: the apron (half-width of the square, top height) is a walkable kerb-high platform, the others are solid. */
export const STEPS = [{ half: 2.1, h: 0.1 }, { half: 1.8, h: 0.26 }, { half: 1.4, h: 0.5 }]
export const SOLID_HALF = STEPS[1].half // collider: everything inside the second step

/** Stele: wall concave towards +z, radius R of the front face, `len` metres of arc, granite plinth then bronze up to a wavy crest (7.4 -> 10.4 m, the Oranta on top makes it 12). */
export const STELE = { R: 9, len: 14, base: 1, thick: 0.5, plinthFront: 0.2, plinthBack: 0.7 }
export const steleTop = (u: number) => 7.4 + 2.9 * u ** 1.4 + 0.3 * Math.sin(u * Math.PI * 4.5) * (1 - 0.5 * u)
/** Point at arc parameter u (0..1) and radial offset r from the arc centre (0, R) in the stele frame. */
export const arcPt = (u: number, r: number): [number, number] => {
  const a = (u - 0.5) * STELE.len / STELE.R
  return [r * Math.sin(a), STELE.R - r * Math.cos(a)]
}

const toWorld = (px: number, pz: number, yaw: number, lx: number, lz: number): [number, number] =>
  [px + lx * Math.cos(yaw) + lz * Math.sin(yaw), pz - lx * Math.sin(yaw) + lz * Math.cos(yaw)]

/** Statue stands in a rotated square (not the old axis-aligned box); the stele gets both faces of the slab and its ends, 24 segments. */
export function addMonumentColliders(c: Colliders, M: MonumentSpec) {
  c.addRect(M.x, M.z, SOLID_HALF, SOLID_HALF, M.yaw, Infinity)
  const N = 24, S = STELE, ring = (r: number) => Array.from({ length: N + 1 }, (_, i) => toWorld(M.stele.x, M.stele.z, M.steleYaw, ...arcPt(i / N, r)))
  const f = ring(S.R - S.plinthFront), b = ring(S.R + S.plinthBack)
  for (let i = 0; i < N; i++) { c.add(...f[i], ...f[i + 1]); c.add(...b[i], ...b[i + 1]) }
  c.add(...f[0], ...b[0]); c.add(...f[N], ...b[N])
}
