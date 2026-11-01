import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { part, box, cyl, T } from '../world/props'
import { Item } from '../items/item'

/** The ticket-checker in a dark tailcoat with a red bow tie (feet at the origin, face towards +z); the right arm is a separate mesh so it can wave. */
export function buildUsher(shadows: boolean) {
  const skin = 0xe3b794, coat = 0x1d1d26, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  const body = mergeGeometries([
    box(0.12, 0.85, 0.14, 0x14141a, -0.09, 0.425, 0), box(0.12, 0.85, 0.14, 0x14141a, 0.09, 0.425, 0),       // legs
    box(0.12, 0.07, 0.24, 0x0a0a0a, -0.09, 0.035, 0.04), box(0.12, 0.07, 0.24, 0x0a0a0a, 0.09, 0.035, 0.04), // shoes
    box(0.4, 0.62, 0.24, coat, 0, 1.15, 0), box(0.14, 0.46, 0.02, 0xf4f1ea, 0, 1.2, 0.125),                   // tailcoat, white shirt front
    box(0.2, 0.3, 0.2, coat, 0, 0.78, -0.02), box(0.1, 0.05, 0.03, 0xa3141f, 0, 1.4, 0.135),                 // coat tails, bow tie
    box(0.08, 0.55, 0.08, coat, -0.24, 1.13, 0), box(0.07, 0.07, 0.08, skin, -0.24, 0.82, 0),                 // left arm and hand
    part(new THREE.SphereGeometry(0.115, 12, 10), skin, T(0, 1.58, 0)),
    part(new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), 0xb8b8bc, T(0, 1.6, -0.01)), // silver hair
    cyl(0.04, 0.04, 0.1, skin, 0, 1.45, 0, 8),
  ])!
  const arm = mergeGeometries([box(0.08, 0.6, 0.08, coat, 0, -0.3, 0), box(0.07, 0.07, 0.09, skin, 0, -0.62, 0)])!
  const group = new THREE.Group(), armMesh = new THREE.Mesh(arm, mat)
  armMesh.position.set(0.24, 1.43, 0)
  group.add(new THREE.Mesh(body, mat), armMesh)
  group.traverse((m) => { m.castShadow = shadows })
  return { group, arm: armMesh }
}

/** A programme leaflet lying on the usher's desk: pick it up (E), carry it, throw it. */
export class Programme extends Item {
  constructor() {
    super('Програмка', mergeGeometries([box(0.15, 0.012, 0.21, 0x7a1220, 0, 0.006, 0), box(0.1, 0.002, 0.04, 0xd4a93c, 0, 0.013, -0.02)])!, { radius: 0.13, fragments: [0x7a1220, 0xf4f1ea, 0xd4a93c] })
  }
}
