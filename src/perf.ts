import * as THREE from 'three'
import type { Game } from './game'

/** Load-phase timings (ms), filled by main.ts via mark(). Read by perfReport(). */
export const timings: Record<string, number> = {}
const t0 = performance.now()
export const mark = (name: string) => { timings[name] = Math.round(performance.now() - t0) }

/** Viewpoints used by the regression script (npm run perf). yaw/pitch as THREE rotation (YXZ). */
export const VIEWS: Record<string, [x: number, y: number, z: number, pitch: number, yaw: number]> = {
  spawn: [NaN, NaN, NaN, 0, NaN], // NaN = leave the camera where the player spawned
  avenue: [-40, 1.7, -215, 0, -2.72],
  townhall: [309, 32, 85, 0.12, 0],
  aerial: [-130, 45, -150, -0.12, -0.95],
  plaza: [56, 1.7, 38, 0, -2.85],
}

const texBytes = (t: THREE.Texture) => {
  const im = t.image as { width?: number; height?: number } | null
  const w = im?.width ?? 0, h = im?.height ?? 0
  return w * h * 4 * (t.generateMipmaps && !(t as THREE.CompressedTexture).isCompressedTexture ? 4 / 3 : 1)
}

/** Hardware-independent scene stats: textures (deduped), geometry buffers, meshes, instances. */
export function sceneStats(scene: THREE.Scene) {
  const tex = new Set<THREE.Texture>(), geo = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>()
  let meshes = 0, instances = 0, shadowCasters = 0
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    meshes++; geo.add(m.geometry); if (m.castShadow) shadowCasters++
    instances += (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 0
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
      mats.add(mt)
      for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture) tex.add(v as THREE.Texture)
    }
  })
  let gbytes = 0
  for (const g of geo) {
    for (const a of Object.values(g.attributes)) gbytes += (a as THREE.BufferAttribute).array.byteLength
    if (g.index) gbytes += g.index.array.byteLength
  }
  let texMB = 0
  for (const t of tex) texMB += texBytes(t)
  return { meshes, shadowCasters, instances, materials: mats.size, textures: tex.size, texMB: +(texMB / 1048576).toFixed(1), geometryMB: +(gbytes / 1048576).toFixed(2) }
}

/** Renders `n` frames from the current camera. draws/tris = steady-state frame (shadow map is static, see sky.ts);
 *  shadowDraws/shadowTris = the frame in which the shadow map is re-rendered (every ~8 m of walking). renderCpuMs = median CPU time of Game.frame() (systems + culling + draw submission; GPU time is not measurable headless). */
function measureView(game: Game, n = 5) {
  const r = game.renderer, ms: number[] = []
  const lights: THREE.DirectionalLight[] = []
  game.scene.traverse((o) => { const l = o as THREE.DirectionalLight; if (l.isDirectionalLight && l.castShadow) lights.push(l) })
  lights.forEach((l) => (l.shadow.needsUpdate = true))
  game.frame(0) // systems may re-centre the shadow frustum / re-cull for the new viewpoint
  lights.forEach((l) => (l.shadow.needsUpdate = true))
  game.frame(0)
  const shadowDraws = r.info.render.calls, shadowTris = r.info.render.triangles
  for (let i = 0; i < n; i++) { const a = performance.now(); game.frame(0); ms.push(performance.now() - a) }
  ms.sort((a, b) => a - b)
  return { draws: r.info.render.calls, tris: r.info.render.triangles, shadowDraws, shadowTris, renderCpuMs: +ms[n >> 1].toFixed(2) }
}

export function perfReport(game: Game) {
  const cam = game.camera, keep = { p: cam.position.clone(), r: cam.rotation.clone() }
  const views: Record<string, ReturnType<typeof measureView>> = {}
  for (const [name, [x, y, z, pitch, yaw]] of Object.entries(VIEWS)) {
    if (!Number.isNaN(x)) { cam.position.set(x, y, z); cam.rotation.set(pitch, yaw, 0, 'YXZ') }
    cam.updateMatrixWorld()
    views[name] = measureView(game)
  }
  cam.position.copy(keep.p); cam.rotation.copy(keep.r)
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize
  return {
    views, timings,
    programs: game.renderer.info.programs?.length ?? 0,
    gpuTextures: game.renderer.info.memory.textures, gpuGeometries: game.renderer.info.memory.geometries,
    ...sceneStats(game.scene),
    jsHeapMB: heap ? +(heap / 1048576).toFixed(1) : null,
  }
}
