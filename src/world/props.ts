import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Colliders } from './colliders'
import type { CityData } from './city'
import type { Mats } from './materials'
import type { System } from '../game'
import { CulledInstances, SHADOW_KEEP, type CulledOpts } from './instancing'

/** Geometry piece with a flat vertex colour (optionally shaded by height + speckle for cheap foliage lighting). */
export function part(geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4 = new THREE.Matrix4(), foliage = false) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.applyMatrix4(m)
  const c = new THREE.Color(color), pos = g.attributes.position, col: number[] = []
  let y0 = Infinity, y1 = -Infinity
  for (let i = 0; i < pos.count; i++) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)) }
  for (let i = 0; i < pos.count; i++) {
    const speckle = 0.9 + 0.2 * (Math.abs(Math.sin(pos.getX(i) * 91.7 + pos.getZ(i) * 47.3 + pos.getY(i) * 13.1) * 43758.5) % 1)
    const k = foliage ? (0.7 + 0.3 * ((pos.getY(i) - y0) / (y1 - y0 || 1))) * speckle : 1
    col.push(c.r * k, c.g * k, c.b * k)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return g
}
export const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z)
export const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number) => part(new THREE.BoxGeometry(w, h, d), color, T(x, y, z))
export const cyl = (r0: number, r1: number, h: number, color: number, x: number, y: number, z: number, seg = 8) => part(new THREE.CylinderGeometry(r0, r1, h, seg), color, T(x, y, z))

/** Lumpy foliage blob: icosphere welded into one smooth vertex set, with deterministic jitter. */
function blob(r: number, x: number, y: number, z: number, detail = 2) {
  const raw = new THREE.IcosahedronGeometry(r, detail)
  raw.deleteAttribute('normal'); raw.deleteAttribute('uv')
  const g = mergeVertices(raw), p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const j = 1 + 0.16 * Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3) * Math.cos(p.getZ(i) * 2.7 + p.getX(i))
    p.setXYZ(i, p.getX(i) * j + x, p.getY(i) * j + y, p.getZ(i) * j + z)
  }
  g.computeVertexNormals()
  return g
}

const PALETTES: number[][] = [
  [0x6b9a3c, 0x7da03a, 0x9aa23a, 0xb8a032, 0x6a8f3a, 0xa8832c], // chestnut: late-October mix
  [0xc8742a, 0xd9962f, 0xb85a2a, 0xa8832c],                      // maple: autumn orange
  [0x8fae45, 0xa2b84a, 0xb9c05a, 0xc2b24a],                      // linden
]
const TREE_SCALE: [number, number][] = [[0.75, 1.1], [0.5, 0.55], [0.7, 1.05]] // [horizontal, vertical] per kind: described crown 5-7 m, trunk+crown 14-18 m

const rnd = (n: number) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1
const world = (px: number, pz: number, yaw: number, lx: number, lz: number) => [px + lx * Math.cos(yaw) + lz * Math.sin(yaw), pz - lx * Math.sin(yaw) + lz * Math.cos(yaw)]

/** Violin-shaped half-width along t in 0..1 (lower bout wider than the upper one, narrow waist). */
const violin = (t: number) => 5.5 * Math.pow(Math.sin(Math.PI * t), 0.45) * (t < 0.5 ? 1 : 0.84) * (1 - 0.4 * Math.exp(-(((t - 0.5) / 0.09) ** 2)))

/** Everything on проспект Свободи: ground strips, trees, benches, lamps, chess corner, fountains, Shevchenko monument. Returns a per-frame System (fountain jets). */
export function addProps(data: CityData, parent: THREE.Object3D, colliders: Colliders, mats: Mats, shadows: boolean): System {
  const st = data.street
  if (!st) return { update() {} }
  const free = (x: number, z: number) => colliders.groundAt(x, z) === 0 // drop anything that landed inside a building
  const group = new THREE.Group(); parent.add(group)
  const put = <O extends THREE.Object3D>(o: O, cast = true) => {
    o.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = cast && shadows; m.receiveShadow = shadows } })
    group.add(o); return o
  }
  const vmat = (extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...extra })
  const dummy = new THREE.Object3D()
  // Instanced props are culled per instance (frustum + distance + optional LOD geometry) in preRender: always 1-2 draws per type.
  // opts.maxDist defaults to 350 m, opts.lod = cheaper geometry beyond a distance; color(it, i) = per-instance tint.
  const culled: CulledInstances[] = []
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, items: number[][], place: (it: number[], o: THREE.Object3D, i: number) => void, cast = true, opts: CulledOpts = {}, color?: (it: number[], i: number) => THREE.Color) => {
    const ci = new CulledInstances(group, geo, mat, items.length, { maxDist: 350, ...opts }, cast && shadows, shadows)
    items.forEach((it, i) => { dummy.position.set(0, 0, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); place(it, dummy, i); dummy.updateMatrix(); ci.push(dummy.matrix, color?.(it, i)) })
    culled.push(ci)
    return ci
  }

  // ---- ground: granite over the opera plaza and the central promenade, lawns in the green strips, granite on the monument plaza
  // flat ground pieces are collected and merged into one mesh per material at the end of addProps (1 draw call instead of one per piece)
  const lawnGeos: THREE.BufferGeometry[] = [], graniteGeos: THREE.BufferGeometry[] = [], curbGeos: THREE.BufferGeometry[] = []
  for (const rb of st.ribbons) {
    const pos: number[] = [], idx: number[] = []
    rb.l.forEach((l, i) => { pos.push(l[0], 0, l[1], rb.r[i][0], 0, rb.r[i][1]); if (i) { const a = i * 2; idx.push(a - 2, a, a - 1, a - 1, a, a + 1) } })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.filter((_, i) => i % 3 !== 1), 2)) // UVs in metres
    g.setIndex(idx); g.computeVertexNormals()
    ;(rb.kind === 'grass' ? lawnGeos : graniteGeos).push(g)
  }
  {
    const plaza = new THREE.ShapeGeometry(new THREE.Shape(st.plaza.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2)
    graniteGeos.push(plaza)
  }

  // ---- trees (chestnut / linden along the boulevard, maples in grates on the opera plaza)
  const trees = st.trees.filter(([x, z]) => free(x, z))
  const crownGeo = mergeGeometries([
    part(blob(4.4, 0, 8, 0), 0xffffff, undefined, true), part(blob(3.2, 2.4, 7, 1.2), 0xffffff, undefined, true),
    part(blob(3.4, -2.4, 7.4, -1.4), 0xffffff, undefined, true), part(blob(3, 0.4, 10.2, 0.6), 0xffffff, undefined, true),
  ])!
  const treeAt = (it: number[], o: THREE.Object3D) => {
    const [x, z, seed, kind] = it, [sh, sv] = TREE_SCALE[kind], v = 0.9 + 0.25 * rnd(seed + x)
    o.position.set(x, 0, z); o.rotation.y = seed * 2.4; o.scale.set(sh * v, sv * v, sh * v)
  }
  const crownLod = mergeGeometries([ // beyond 70 m: same silhouette, 320 instead of 720 triangles
    part(blob(4.4, 0, 8, 0, 1), 0xffffff, undefined, true), part(blob(3.2, 2.4, 7, 1.2, 1), 0xffffff, undefined, true),
    part(blob(3.4, -2.4, 7.4, -1.4, 1), 0xffffff, undefined, true), part(blob(3, 0.4, 10.2, 0.6, 1), 0xffffff, undefined, true),
  ])!
  const crownFar = mergeGeometries([part(blob(4.6, 0, 8.4, 0, 1), 0xffffff, undefined, true), part(blob(3.4, 0.4, 10.2, 0.6, 1), 0xffffff, undefined, true)])! // beyond 200 m: 160
  instanced(crownGeo, vmat(), trees, treeAt, true, { maxDist: 650, lods: [{ geo: crownLod, dist: 70 }, { geo: crownFar, dist: 200 }] },
    (it) => { const pal = PALETTES[it[3]]; return new THREE.Color(pal[Math.floor(rnd(it[2] * 7 + it[0]) * pal.length)]) })
  instanced(cyl(0.28, 0.4, 5.5, 0x4a3a2c, 0, 2.75, 0, 7), vmat(), trees, treeAt)
  instanced(cyl(0.75, 0.75, 0.04, 0x26292c, 0, 0.02, 0, 14), vmat({ metalness: 0.5 }), trees.filter((t) => t[3] === 1), (it, o) => o.position.set(it[0], 0, it[1]), false) // cast-iron grates
  trees.forEach(([x, z]) => colliders.addBox(x, z, 0.45, Infinity))

  // ---- benches: park (cast iron + dark slats), long plaza (concrete + timber), arc (around the monument)
  const BENCH = [
    { geo: mergeGeometries([box(2.1, 0.06, 0.5, 0x3a2a1c, 0, 0.46, 0), part(new THREE.BoxGeometry(2.1, 0.4, 0.05), 0x3a2a1c, T(0, 0.78, -0.22).multiply(new THREE.Matrix4().makeRotationX(-0.2))),
      box(0.07, 0.46, 0.5, 0x1d1f22, -0.95, 0.23, 0), box(0.07, 0.46, 0.5, 0x1d1f22, 0.95, 0.23, 0), box(0.07, 0.6, 0.06, 0x1d1f22, -0.95, 0.76, -0.2), box(0.07, 0.6, 0.06, 0x1d1f22, 0.95, 0.76, -0.2)])!, hw: 1.05, hd: 0.3, h: 0.85 },
    { geo: mergeGeometries([box(6.8, 0.42, 0.7, 0x9b9a96, 0, 0.21, 0), box(7, 0.07, 0.85, 0xb58a55, 0, 0.455, 0)])!, hw: 3.5, hd: 0.42, h: 0.5 },
    { geo: mergeGeometries([box(3, 0.42, 0.5, 0x9b9a96, 0, 0.21, 0), box(3.1, 0.07, 0.6, 0xb58a55, 0, 0.455, 0)])!, hw: 1.55, hd: 0.3, h: 0.5 },
  ]
  BENCH.forEach((b, k) => {
    const items = st.benches.filter((it) => it[3] === k && free(it[0], it[1]))
    instanced(b.geo, vmat({ roughness: 0.7 }), items, (it, o) => { o.position.set(it[0], 0, it[1]); o.rotation.y = it[2] })
    items.forEach((it) => colliders.addBench(it[0], it[1], it[2], b.hw, b.hd, b.h)) // low enough to jump over; also sit-able
  })

  // ---- cast-iron two-arm lamps
  const lamps = st.lamps.filter(([x, z]) => free(x, z))
  instanced(mergeGeometries([cyl(0.2, 0.26, 0.7, 0x1d1f22, 0, 0.35, 0), cyl(0.07, 0.12, 3.9, 0x1d1f22, 0, 2.6, 0), box(1.8, 0.05, 0.05, 0x1d1f22, 0, 4.1, 0)])!, vmat({ metalness: 0.4 }), lamps, (it, o) => { o.position.set(it[0], 0, it[1]); o.rotation.y = it[2] })
  instanced(new THREE.BoxGeometry(0.28, 0.42, 0.28), new THREE.MeshStandardMaterial({ color: 0x3a3320, emissive: 0xffd9a0, emissiveIntensity: 1.1 }),
    lamps.flatMap((l) => [[...l, -0.9], [...l, 0.9]]), (it, o) => { const [x, z] = world(it[0], it[1], it[2], it[3], 0); o.position.set(x, 4.0, z) }, false)
  lamps.forEach(([x, z]) => colliders.addBox(x, z, 0.2, Infinity))

  // ---- chess corner (tables with a checkerboard top) and a drinking fountain
  const checker = new THREE.CanvasTexture(Object.assign(document.createElement('canvas'), { width: 256, height: 256 }))
  { const g = checker.image.getContext('2d')!; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#3b2d20' : '#d9c9a4'; g.fillRect(i * 32, j * 32, 32, 32) } checker.colorSpace = THREE.SRGBColorSpace; checker.needsUpdate = true }
  instanced(new THREE.BoxGeometry(0.9, 0.06, 0.9), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.6 }), st.chess, (it, o) => { o.position.set(it[0], 0.75, it[1]); o.rotation.y = it[2] })
  instanced(mergeGeometries([cyl(0.07, 0.07, 0.72, 0x1d1f22, 0, 0.36, 0), cyl(0.3, 0.3, 0.04, 0x1d1f22, 0, 0.02, 0)])!, vmat(), st.chess, (it, o) => o.position.set(it[0], 0, it[1]))
  st.chess.forEach(([x, z, yaw]) => colliders.addRect(x, z, 0.5, 0.5, yaw, 0.8))
  const dr = new THREE.Mesh(mergeGeometries([cyl(0.13, 0.17, 0.85, 0x7a5a30, 0, 0.425, 0), cyl(0.3, 0.12, 0.1, 0x7a5a30, 0, 0.88, 0)])!, vmat({ metalness: 0.15, roughness: 0.5 }))
  dr.position.set(st.drinking.x, 0, st.drinking.z); put(dr)
  colliders.addBox(st.drinking.x, st.drinking.z, 0.3, Infinity)

  // ---- dry fountain: violin-shaped dark inlay flush with the plaza + 72 animated jets (0.5-3 m). Walkable.
  const fg = new THREE.Group(); fg.position.set(st.fountain.x, 0, st.fountain.z); fg.rotation.y = st.fountain.yaw; group.add(fg)
  const L = st.fountain.len, outline: THREE.Vector2[] = []
  for (let i = 0; i <= 40; i++) { const t = i / 40; outline.push(new THREE.Vector2(violin(t) * (st.fountain.wid / 11), (t - 0.5) * L)) }
  for (let i = 40; i >= 0; i--) { const t = i / 40; outline.push(new THREE.Vector2(-violin(t) * (st.fountain.wid / 11), (t - 0.5) * L)) }
  const inlay = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(outline)).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x575c63, roughness: 0.3, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }))
  inlay.position.y = 0.01; inlay.receiveShadow = shadows; fg.add(inlay)
  const spots: [number, number][] = []
  for (let v = -L / 2 + 1; v < L / 2; v += 1.3) for (let u = -6; u <= 6; u += 1.3) {
    const t = (v + L / 2) / L
    if (Math.abs(u) < violin(t) * 0.85) spots.push([u, v])
  }
  spots.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1])); spots.length = Math.min(72, spots.length)
  const jets = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.07, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0xdff1ff, transparent: true, opacity: 0.5, roughness: 0.1, emissive: 0x6aa0c8, emissiveIntensity: 0.25, depthWrite: false }), spots.length)
  jets.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), L / 2 + 3); fg.add(jets) // local sphere: culled when out of view

  // ---- Shevchenko monument: granite stylobate, bronze figure, "Wave of National Revival" stele, two sector lawns
  const M = st.monument, mg = new THREE.Group(); mg.position.set(M.x, 0, M.z); mg.rotation.y = M.yaw; group.add(mg)
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6a42, metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide })
  const granite = new THREE.MeshStandardMaterial({ color: 0x8d8f93, roughness: 0.35 })
  const plinth = new THREE.Group(); mg.add(plinth)
  plinth.add(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.15, 4.2), granite)); plinth.children[0].position.y = 0.075
  plinth.add(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 3.2), granite)); plinth.children[1].position.y = 0.375
  const profile = [[0.001, 0], [0.55, 0], [0.6, 0.3], [0.52, 1], [0.45, 1.8], [0.36, 2.6], [0.34, 3], [0.5, 3.45], [0.2, 3.8], [0.001, 3.85]].map(([r, y]) => new THREE.Vector2(r, y))
  const fig = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), bronze); fig.position.y = 0.6; mg.add(fig)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), bronze); head.position.y = 0.6 + 4.12; mg.add(head)
  const arms = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.25), bronze); arms.position.set(0, 0.6 + 2.9, 0.38); mg.add(arms)
  colliders.addBox(M.x, M.z, 1.8, Infinity)

  const sg = new THREE.Group(); sg.position.set(M.stele.x, 0, M.stele.z); sg.rotation.y = M.steleYaw; group.add(sg)
  { // curved wing: radius 9 m, 14 m of arc, height rising from 8 to 12 m; concave side towards the figure (+z)
    const R = 9, arc = 14 / R, N = 24, pos: number[] = [], idx: number[] = []
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = (u - 0.5) * arc, x = R * Math.sin(a), z = R * (1 - Math.cos(a))
      pos.push(x, 0, z, x, 8 + 4 * u, z); if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2)
      if (i) colliders.add(...world(M.stele.x, M.stele.z, M.steleYaw, R * Math.sin((((i - 1) / N) - 0.5) * arc), R * (1 - Math.cos((((i - 1) / N) - 0.5) * arc))) as [number, number], ...world(M.stele.x, M.stele.z, M.steleYaw, x, z) as [number, number])
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals()
    sg.add(new THREE.Mesh(g, bronze))
  }
  for (const b of st.beds) { // sector lawn with a low granite curb (0.15 m)
    const sector = (r0: number, r1: number, span: number) => {
      const pts: THREE.Vector2[] = [], a0 = b.ang - span / 2
      for (let i = 0; i <= 12; i++) { const a = a0 + (span * i) / 12; pts.push(new THREE.Vector2(b.x + r1 * Math.sin(a), -(b.z + r1 * Math.cos(a)))) }
      for (let i = 12; i >= 0; i--) { const a = a0 + (span * i) / 12; pts.push(new THREE.Vector2(b.x + r0 * Math.sin(a), -(b.z + r0 * Math.cos(a)))) }
      return new THREE.Shape(pts)
    }
    curbGeos.push(new THREE.ExtrudeGeometry(sector(b.r0, b.r1, b.span), { depth: 0.15, bevelEnabled: false }).rotateX(-Math.PI / 2))
    lawnGeos.push(new THREE.ShapeGeometry(sector(b.r0 + 0.3, b.r1 - 0.3, b.span - 0.05)).rotateX(-Math.PI / 2).translate(0, 0.155, 0))
  }
  for (const [geos, mat, cast] of [[lawnGeos, mats.lawn, false], [graniteGeos, mats.granite, false], [curbGeos, granite, true]] as const)
    if (geos.length) put(new THREE.Mesh(mergeGeometries(geos)!, mat), cast)
  put(mg); put(sg)

  let time = 0
  return {
    preRender: (cam) => culled.forEach((c) => c.cull(cam, shadows ? SHADOW_KEEP : 0)),
    update(dt: number) {
      time += dt
      spots.forEach(([u, v], i) => { // travelling wave along the fountain, each jet 0.5-3 m
        const h = 0.5 + 2.5 * (0.5 + 0.5 * Math.sin(time * 2.2 - v * 0.55 + (i % 5) * 0.4))
        dummy.position.set(u, h / 2, v); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, h, 1); dummy.updateMatrix(); jets.setMatrixAt(i, dummy.matrix)
      })
      jets.instanceMatrix.needsUpdate = true
    },
  }
}
