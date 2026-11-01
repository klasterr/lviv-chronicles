import * as THREE from 'three'

/** Instances within this distance of the camera are kept even when outside the view frustum, because they can still cast
 *  shadows into it (shadow camera = +-70 m square around the player, snapped in 8.75 m steps). Set to 0 when shadows are off. */
export const SHADOW_KEEP = 100

export interface CulledOpts {
  /** Instances further than this from the camera are dropped (beyond it they are a few pixels or hidden by fog). */
  maxDist?: number
  /** Cheaper geometries (same local frame as the main one) for instances further than `dist`; ascending dist. */
  lods?: { geo: THREE.BufferGeometry; dist: number }[]
}

const _f = new THREE.Frustum(), _pv = new THREE.Matrix4(), _s = new THREE.Sphere(), _c = new THREE.Vector3()

/**
 * One prop type with many instances. Per-instance matrices stay on the CPU; before every render (`cull(camera)`, called by
 * Game via System.preRender) the visible ones (frustum, distance, LOD level) are copied into InstancedMeshes, so a type is
 * always 1-2 draw calls and only visible instances cost vertices. For a few thousand instances this is far cheaper than
 * per-chunk meshes (those multiply draw calls by the number of visible chunks).
 */
export class CulledInstances {
  readonly meshes: THREE.InstancedMesh[] = []
  private mats: Float32Array
  private cols?: Float32Array
  private ctr: Float32Array // x, y, z, radius per instance (world space)
  private n = 0
  private last = new THREE.Matrix4()
  private lastKeep = -1

  constructor(parent: THREE.Object3D, private geo: THREE.BufferGeometry, private mat: THREE.Material, count: number, private opts: CulledOpts = {}, cast = true, receive = true) {
    this.mats = new Float32Array(count * 16); this.ctr = new Float32Array(count * 4)
    const mk = (g: THREE.BufferGeometry) => {
      const m = new THREE.InstancedMesh(g, mat, count)
      m.count = 0; m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = receive
      parent.add(m); this.meshes.push(m); return m
    }
    mk(geo); opts.lods?.forEach((l) => mk(l.geo))
    geo.computeBoundingSphere()
  }

  /** Register instance `this.n` (call count times in order). Returns its index. */
  push(m: THREE.Matrix4, color?: THREE.Color) {
    const i = this.n++
    m.toArray(this.mats, i * 16)
    _s.copy(this.geo.boundingSphere!).applyMatrix4(m)
    this.ctr.set([_s.center.x, _s.center.y, _s.center.z, _s.radius], i * 4)
    if (color) { this.cols ??= new Float32Array(this.mats.length / 16 * 3); color.toArray(this.cols, i * 3) }
    return i
  }

  cull(camera: THREE.Camera, keep: number) {
    // rebuild only when the view changed noticeably (instance sets are static)
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse) // Game keeps both camera matrices current before preRender
    if (keep === this.lastKeep && this.last.equals(_pv)) return
    this.lastKeep = keep; this.last.copy(_pv)
    _f.setFromProjectionMatrix(_pv)
    const cam = camera.matrixWorld.elements, cx = cam[12], cy = cam[13], cz = cam[14]
    const maxD = this.opts.maxDist ?? Infinity, lods = this.opts.lods ?? []
    const counts = this.meshes.map(() => 0), ctr = this.ctr
    for (let i = 0; i < this.n; i++) {
      const dx = ctr[i * 4] - cx, dy = ctr[i * 4 + 1] - cy, dz = ctr[i * 4 + 2] - cz, r = ctr[i * 4 + 3]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - r
      if (d > maxD) continue
      const seen = _f.intersectsSphere(_s.set(_c.set(ctr[i * 4], ctr[i * 4 + 1], ctr[i * 4 + 2]), r))
      if (!seen && d > keep) continue
      let lv = 0 // out of view but kept for its shadow: the cheapest geometry is enough
      if (lods.length) { if (seen) while (lv < lods.length && d > lods[lv].dist) lv++; else lv = lods.length }
      const m = this.meshes[lv], k = counts[lv]++
      ;(m.instanceMatrix.array as Float32Array).set(this.mats.subarray(i * 16, i * 16 + 16), k * 16)
      if (this.cols) {
        if (!m.instanceColor) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cols.length), 3)
        ;(m.instanceColor.array as Float32Array).set(this.cols.subarray(i * 3, i * 3 + 3), k * 3)
      }
    }
    this.meshes.forEach((m, lv) => {
      m.count = counts[lv]; m.visible = m.count > 0 // no empty draw calls
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    })
  }
}
