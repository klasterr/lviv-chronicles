import * as THREE from 'three'
import type { Front } from './types'

/** Frame on a street-facing wall: u metres from its left end, h metres up, d metres out of the wall. x = along the wall to the right, z = outward. */
export const wallFrame = (f: Front) => {
  const tx = (f.b[0] - f.a[0]) / f.len, tz = (f.b[1] - f.a[1]) / f.len
  return { tx, tz, at: (u: number, h: number, d: number) => new THREE.Vector3(f.a[0] + tx * u + f.n[0] * (f.off + d), h, f.a[1] + tz * u + f.n[1] * (f.off + d)) }
}

/** Textured rectangle hung on a street wall (u0..u1 along it, h0..h1 up, d out of the wall); uv = [left, bottom, right, top] of the texture. */
export const quad = (f: Front, u0: number, u1: number, h0: number, h1: number, d: number, uv: [number, number, number, number]) => {
  const fr = wallFrame(f), p = [fr.at(u0, h0, d), fr.at(u1, h0, d), fr.at(u1, h1, d), fr.at(u0, h1, d)]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.flatMap((v) => [v.x, v.y, v.z]), 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], 2))
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g
}
