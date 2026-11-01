import * as THREE from 'three'

/** Accumulates indexed triangles per (spatial chunk, material). Chunks give frustum/shadow culling, one material per
 *  chunk keeps draw calls low (see docs/performance.md). Attributes are packed: Int8 normals, Uint8 colours, optional Uint8 `tile`. */
export class Batch {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; tile: number[] = []; idx: number[] = []

  /** Adds a vertex and returns its index; connect with tri(). `tile` = layer in the facade texture array (see materials.ts). */
  add(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c?: THREE.Color, tile?: number) {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v)
    if (c) this.col.push(c.r, c.g, c.b)
    if (tile !== undefined) this.tile.push(tile)
    return this.pos.length / 3 - 1
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c) }
  /** Unshared vertex + its own index: three calls make one triangle. */
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c?: THREE.Color, tile?: number) {
    this.idx.push(this.add(x, y, z, nx, ny, nz, u, v, c, tile))
  }
}

export class Chunks {
  private map = new Map<string, Map<THREE.Material, Batch>>()
  constructor(private size = 250) {}

  batch(x: number, z: number, mat: THREE.Material): Batch {
    const key = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`
    let m = this.map.get(key)
    if (!m) this.map.set(key, (m = new Map()))
    let b = m.get(mat)
    if (!b) m.set(mat, (b = new Batch()))
    return b
  }

  build(group: THREE.Group, opts: { cast?: boolean; receive?: boolean } = {}) {
    for (const m of this.map.values()) for (const [mat, b] of m) {
      if (!b.idx.length) continue
      const n = b.pos.length / 3, g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
      g.setAttribute('normal', new THREE.Int8BufferAttribute(b.nor.map((v) => Math.round(v * 127)), 3, true))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
      if (b.col.length) g.setAttribute('color', new THREE.Uint8BufferAttribute(b.col.map((v) => Math.round(v * 255)), 3, true))
      if (b.tile.length) g.setAttribute('tile', new THREE.Uint8BufferAttribute(b.tile, 1))
      g.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx), 1))
      g.computeBoundingSphere()
      const mesh = new THREE.Mesh(g, mat)
      mesh.matrixAutoUpdate = false
      mesh.castShadow = !!opts.cast
      mesh.receiveShadow = opts.receive ?? true
      group.add(mesh)
    }
  }
}
