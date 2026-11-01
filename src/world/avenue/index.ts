import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Colliders } from '../colliders'
import type { CityData } from '../city'
import type { System } from '../../game'
import { CulledInstances, SHADOW_KEEP } from '../instancing'
import { FACADE_ATLAS, FACADE_PANELS } from './facades.generated'
import { drawFront35, FRONT35 } from './ground-front'
import { buildSigns } from './signs'
import type { AvenueData, Front } from './types'

// vertex-coloured primitives (same idea as props.ts, kept local so the avenue layer is self-contained)
function part(geo: THREE.BufferGeometry, color: number, m = new THREE.Matrix4()) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.applyMatrix4(m); g.deleteAttribute('uv')
  const c = new THREE.Color(color), n = g.attributes.position.count, col: number[] = []
  for (let i = 0; i < n; i++) col.push(c.r, c.g, c.b)
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return g
}
const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)
const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => part(new THREE.BoxGeometry(w, h, d), color, T(x, y, z))
const cyl = (r0: number, r1: number, h: number, color: number, x: number, y: number, z: number, seg = 8) => part(new THREE.CylinderGeometry(r0, r1, h, seg), color, T(x, y, z))
const rnd = (n: number) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1
function blob(r: number, x: number, y: number, z: number) {
  const raw = new THREE.IcosahedronGeometry(r, 1); raw.deleteAttribute('normal'); raw.deleteAttribute('uv')
  const g = mergeVertices(raw), p = g.attributes.position
  for (let i = 0; i < p.count; i++) { const j = 1 + 0.16 * Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3) * Math.cos(p.getZ(i) * 2.7 + p.getX(i)); p.setXYZ(i, p.getX(i) * j + x, p.getY(i) * j + y, p.getZ(i) * j + z) }
  g.computeVertexNormals(); return g
}

/** Frame on a street-facing wall: u metres from its left end, h metres up, d metres out of the wall. x = along the wall to the right, z = outward. */
export const wallFrame = (f: Front) => {
  const tx = (f.b[0] - f.a[0]) / f.len, tz = (f.b[1] - f.a[1]) / f.len
  return { tx, tz, at: (u: number, h: number, d: number) => new THREE.Vector3(f.a[0] + tx * u + f.n[0] * (f.off + d), h, f.a[1] + tz * u + f.n[1] * (f.off + d)) }
}
const quad = (f: Front, u0: number, u1: number, h0: number, h1: number, d: number, uv: [number, number, number, number]) => {
  const fr = wallFrame(f), p = [fr.at(u0, h0, d), fr.at(u1, h0, d), fr.at(u1, h1, d), fr.at(u0, h1, d)]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.flatMap((v) => [v.x, v.y, v.z]), 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute([uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], 2))
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g
}

/**
 * Real-world layer of проспект Свободи (everything derived from OSM data, see scripts/layout-poi.ts, scripts/facade-config.ts):
 * photo facades of the main buildings, the McDonald's at no. 35, shop signs, mapped benches/bins/lamps/trees/bike racks/stops, zebra crossings, kerb bollards.
 */
export function addAvenue(data: CityData, parent: THREE.Object3D, colliders: Colliders, shadows: boolean): System {
  const st = data.street
  if (!st?.fronts || !st.osm) return { update() {} }
  const group = new THREE.Group(); group.name = 'avenue'; parent.add(group)
  const free = (x: number, z: number) => colliders.groundAt(x, z) === 0
  const culled: CulledInstances[] = [], dummy = new THREE.Object3D()
  const vmat = (extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...extra })
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, items: number[][], place: (it: number[], o: THREE.Object3D) => void, opts: { maxDist?: number; cast?: boolean; color?: (it: number[]) => THREE.Color } = {}) => {
    if (!items.length) return
    const ci = new CulledInstances(group, geo, mat, items.length, { maxDist: opts.maxDist ?? 250 }, (opts.cast ?? true) && shadows, shadows)
    for (const it of items) { dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); place(it, dummy); dummy.updateMatrix(); ci.push(dummy.matrix, opts.color?.(it)) }
    culled.push(ci)
  }
  const at = (it: number[], o: THREE.Object3D) => { o.position.set(it[0], 0, it[1]); o.rotation.y = it[2] ?? 0 }

  // ---- photo facades: one atlas (rectified Commons photos, scripts/prepare-photos.ts) on the street-facing walls of the OSM footprints
  const atlas = new THREE.TextureLoader().load(FACADE_ATLAS.url); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8
  const photoMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 1, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.35, color: 0xdddddd, alphaTest: 0.5 })
  const panelGeos: THREE.BufferGeometry[] = []
  for (const [id, p] of Object.entries(FACADE_PANELS)) {
    const f = st.fronts[id]; if (!f) continue
    const e = 0.5 // half texel inset against bleeding
    panelGeos.push(quad(f, 0, f.len, p.groundH, p.groundH + p.hm, 0.03, [(p.x + e) / FACADE_ATLAS.w, 1 - (p.y + p.h - e) / FACADE_ATLAS.h, (p.x + p.w - e) / FACADE_ATLAS.w, 1 - (p.y + e) / FACADE_ATLAS.h]))
  }
  if (panelGeos.length) { const m = new THREE.Mesh(mergeGeometries(panelGeos)!, photoMat); m.receiveShadow = shadows; group.add(m) }

  // ---- Svobody 35 (Feller Passage): hand-drawn ground floor with McDonald's, Appleroom, the passage arch; awning as geometry
  const f35 = st.fronts['way/171080874']
  if (f35) {
    const gh = FACADE_PANELS['way/171080874']?.groundH ?? 5
    const tex = new THREE.CanvasTexture(drawFront35(f35.len, gh)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
    const m = new THREE.Mesh(quad(f35, 0, f35.len, 0, gh, 0.04, [0, 0, 1, 1]), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 }))
    m.receiveShadow = shadows; group.add(m)
    const fr = wallFrame(f35), mc = FRONT35.mcd, aw = new THREE.Mesh(new THREE.BoxGeometry(mc.awningTo - mc.u0, 0.1, 0.8), new THREE.MeshStandardMaterial({ color: 0xf2ad1d, roughness: 0.7 }))
    const c = fr.at((mc.u0 + mc.awningTo) / 2, 2.32, 0.4)
    aw.position.copy(c); aw.rotation.y = Math.atan2(-fr.tz, fr.tx); aw.castShadow = shadows; aw.receiveShadow = shadows; group.add(aw)
  }

  // ---- shop signs (OSM names)
  const signs = buildSigns(st as AvenueData); if (signs) group.add(signs)

  // ---- mapped street furniture
  const benchGeo = mergeGeometries([box(1.8, 0.06, 0.45, 0x6a4a2a, 0, 0.46, 0), box(1.8, 0.4, 0.05, 0x6a4a2a, 0, 0.74, -0.2), box(0.07, 0.46, 0.45, 0x1d1f22, -0.8, 0.23, 0), box(0.07, 0.46, 0.45, 0x1d1f22, 0.8, 0.23, 0), box(0.07, 0.6, 0.06, 0x1d1f22, -0.8, 0.7, -0.2), box(0.07, 0.6, 0.06, 0x1d1f22, 0.8, 0.7, -0.2)])!
  const benches = st.osm.benches.filter(([x, z]) => free(x, z))
  instanced(benchGeo, vmat({ roughness: 0.7 }), benches, at, { maxDist: 150 })
  benches.forEach(([x, z, yaw]) => colliders.addBench(x, z, yaw, 0.95, 0.3, 0.85))
  const bins = st.osm.bins.filter(([x, z]) => free(x, z))
  instanced(mergeGeometries([box(0.46, 0.85, 0.46, 0x2f6b45, 0, 0.425, 0), box(0.5, 0.06, 0.5, 0x1d1f22, 0, 0.88, 0)])!, vmat(), bins, at, { maxDist: 120 })
  bins.forEach(([x, z]) => colliders.addBox(x, z, 0.25, 0.9))
  const hoop = (z: number) => [box(0.05, 0.8, 0.05, 0x8a8d91, 0, 0.4, z - 0.25), box(0.05, 0.8, 0.05, 0x8a8d91, 0, 0.4, z + 0.25), box(0.05, 0.05, 0.55, 0x8a8d91, 0, 0.8, z)]
  const bikes = st.osm.bikes.filter(([x, z]) => free(x, z))
  instanced(mergeGeometries([0, 0.6, 1.2].flatMap((z) => hoop(z)))!, vmat({ metalness: 0.5 }), bikes, at, { maxDist: 100 })
  const lamps = st.osm.lamps.filter(([x, z]) => free(x, z))
  instanced(mergeGeometries([cyl(0.12, 0.17, 0.6, 0x24272a, 0, 0.3, 0), cyl(0.05, 0.08, 4.4, 0x24272a, 0, 2.6, 0), box(0.05, 0.05, 0.9, 0x24272a, 0, 4.7, 0.4), box(0.3, 0.4, 0.3, 0xf2e2b0, 0, 4.55, 0.85)])!, vmat({ metalness: 0.4 }), lamps, at, { maxDist: 220 })
  lamps.forEach(([x, z]) => colliders.addBox(x, z, 0.15, Infinity))
  const stops = st.osm.stops.filter(([x, z]) => free(x, z))
  instanced(mergeGeometries([cyl(0.04, 0.04, 3, 0x6c7075, 0, 1.5, 0), box(0.5, 0.55, 0.04, 0x1d5fa8, 0, 2.7, 0)])!, vmat(), stops, at, { maxDist: 150 })

  // trees mapped in OSM (the boulevard rows themselves come from layout-avenue.ts): low-poly crowns, late-October colours
  const trees = st.osm.trees.filter(([x, z]) => free(x, z))
  const PAL = [0x8fae45, 0xa2b84a, 0xb9c05a, 0xc2b24a, 0x6b9a3c, 0xb8a032, 0xc8742a]
  instanced(mergeGeometries([blob(4.2, 0, 8, 0), blob(3, 2.2, 7, 1.1), blob(3.2, -2.2, 7.4, -1.2)].map((g) => part(g, 0xffffff)))!, vmat(), trees,
    (it, o) => { const v = 0.8 + 0.4 * rnd(it[2]); o.position.set(it[0], 0, it[1]); o.rotation.y = it[2] * 2.4; o.scale.set(0.7 * v, 0.95 * v, 0.7 * v) },
    { maxDist: 420, color: (it) => new THREE.Color(PAL[Math.floor(rnd(it[2] * 7) * PAL.length)]).multiplyScalar(0.8 + 0.3 * rnd(it[2] + 3)) })
  instanced(cyl(0.25, 0.38, 5.2, 0x4a3a2c, 0, 2.6, 0, 6), vmat(), trees, (it, o) => { o.position.set(it[0], 0, it[1]); const v = 0.8 + 0.4 * rnd(it[2]); o.scale.set(v, v, v) }, { maxDist: 200 })
  trees.forEach(([x, z]) => colliders.addBox(x, z, 0.4, Infinity))

  // grey granite hemispheres along the building-side kerbs
  const sph = new THREE.SphereGeometry(0.21, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); sph.scale(1, 1.1, 1)
  instanced(part(sph, 0x7c7f84), vmat({ roughness: 0.6 }), st.bollards!.filter(([x, z]) => free(x, z)), (it, o) => o.position.set(it[0], 0, it[1]), { maxDist: 120, cast: false })

  // ---- zebra crossings: muted pale stripes (they are barely visible on the avenue's cobbles)
  const stripes: THREE.BufferGeometry[] = []
  for (const [x, z, yaw, w] of st.crossings!) {
    const dx = Math.sin(yaw), dz = Math.cos(yaw), px = dz, pz = -dx // d = along the road, p = across it (walking direction)
    for (let k = -Math.floor(w / 2 / 0.9); k <= Math.floor(w / 2 / 0.9); k++) {
      const cx = x + px * k * 0.9, cz = z + pz * k * 0.9, L = 1.5, W = 0.22
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + dx * a * L + px * b * W, cz + dz * a * L + pz * b * W])
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(c.flatMap(([a, b]) => [a, 0.03, b]), 3))
      g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); stripes.push(g)
    }
  }
  for (const line of st.laneMarks ?? []) { // dashed centre lines (3 m dash, 6 m gap)
    let acc = 0
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1], len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len
      for (let s = (9 - (acc % 9)) % 9; s + 3 < len; s += 9) {
        const c = [[0, -1], [3, -1], [3, 1], [0, 1]].map(([l, w]) => [ax + dx * (s + l) - dz * w * 0.07, az + dz * (s + l) + dx * w * 0.07])
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(c.flatMap(([x, z]) => [x, 0.03, z]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); stripes.push(g)
      }
      acc += len
    }
  }
  if (stripes.length) {
    const m = new THREE.Mesh(mergeGeometries(stripes)!, new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.9, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -12, polygonOffsetUnits: -12 }))
    m.receiveShadow = shadows; group.add(m)
  }

  return { update() {}, preRender: (cam) => culled.forEach((c) => c.cull(cam, shadows ? SHADOW_KEEP : 0)) }
}
