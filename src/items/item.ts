import * as THREE from 'three'

/** Shared materials: the world one is lit normally, the held one ignores depth so an item never sinks into the wall you are standing at (first-person viewmodel). */
export const worldMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })
export const heldMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, depthTest: false })

export interface ItemOpts {
  radius?: number    // pick-up / aim sphere
  cy?: number        // height of that sphere's centre above the item's base
  hands?: number     // hands needed to carry it
  fragments?: number[] // colours of the pieces it breaks into
}

/**
 * Generic carryable thing: a mesh with its origin on the base, a name and a pick-up sphere. Subclasses only decide the look and what it is made of
 * (McItem = food and drink, Tray = a container of other items). What happens to it (pick up, carry, throw, break) lives in Items, not here.
 */
export class Item {
  readonly mesh: THREE.Mesh
  readonly radius: number
  readonly cy: number
  readonly hands: number
  state: 'rest' | 'held' | 'flying' = 'rest'
  container: Tray | null = null // set while the item lies on a tray
  readonly vel = new THREE.Vector3()
  readonly spin = new THREE.Vector3()
  private frag: number[]

  constructor(readonly name: string, geo: THREE.BufferGeometry, o: ItemOpts = {}) {
    this.mesh = new THREE.Mesh(geo, worldMat)
    this.radius = o.radius ?? 0.1; this.cy = o.cy ?? this.radius; this.hands = o.hands ?? 1; this.frag = o.fragments ?? [0xdddddd]
  }

  /** Colours of what it breaks into (a tray adds its contents). */
  get fragments(): number[] { return this.frag }

  /** World position of the aim sphere centre (call after the mesh's matrices are current). */
  center(out: THREE.Vector3) { this.mesh.getWorldPosition(out); out.y += this.cy; return out }

  /** Swap the material of this item and everything on it. */
  setMaterial(m: THREE.Material, order: number) {
    this.mesh.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).material = m; o.renderOrder = order + (o === this.mesh ? 0 : 1) } })
  }
}

/** A tray carries other items; they are children of the tray's mesh, so moving the tray moves them. Takes both hands. */
export class Tray extends Item {
  readonly contents: Item[] = []

  constructor(name: string, geo: THREE.BufferGeometry) { super(name, geo, { radius: 0.3, cy: 0.03, hands: 2, fragments: [0xb3261e] }) }

  /** Put an item on the tray at local (x, z). */
  put(it: Item, x: number, z: number) {
    it.mesh.position.set(x, 0.02, z); it.container = this
    this.mesh.add(it.mesh); this.contents.push(it)
  }

  /** Take an item off the tray; it keeps its place in the world. */
  release(it: Item) {
    this.mesh.parent?.attach(it.mesh); it.container = null
    this.contents.splice(this.contents.indexOf(it), 1)
  }

  get fragments() { return [...super.fragments, ...this.contents.flatMap((c) => c.fragments)] }
}
