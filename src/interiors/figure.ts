import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { part, box, cyl, T } from '../world/props'

export interface Look {
  shirt: number; yoke?: number          // torso and the collar/apron band over it
  trousers?: number; shoes?: number; skin?: number
  cap?: number                          // cap + visor colour (none = bare head)
  hair?: number; long?: boolean         // hair colour; a ponytail
  tag?: number                          // name tag
}

/**
 * Standing staff member (feet on the ground at the origin, face towards +z). The right arm is a separate mesh that swings forward when handing something over.
 * Used for the McDonald's cashier and the shopkeepers.
 */
export function buildFigure(look: Look, shadows: boolean) {
  const skin = look.skin ?? 0xe0b08c, shirt = look.shirt, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  const legs = look.trousers ?? 0x1c1c1c, shoes = look.shoes ?? 0x111111, hair = look.hair ?? 0x4a2f1c
  const body = mergeGeometries([
    box(0.12, 0.85, 0.14, legs, -0.09, 0.425, 0), box(0.12, 0.85, 0.14, legs, 0.09, 0.425, 0),                 // legs
    box(0.12, 0.07, 0.24, shoes, -0.09, 0.035, 0.04), box(0.12, 0.07, 0.24, shoes, 0.09, 0.035, 0.04),         // shoes
    box(0.4, 0.6, 0.24, shirt, 0, 1.15, 0), ...(look.yoke !== undefined ? [box(0.4, 0.14, 0.25, look.yoke, 0, 1.38, 0)] : []), // torso, yoke
    ...(look.tag !== undefined ? [box(0.05, 0.03, 0.01, look.tag, 0.1, 1.3, 0.125)] : []),
    box(0.08, 0.55, 0.08, shirt, -0.24, 1.13, 0), box(0.07, 0.07, 0.08, skin, -0.24, 0.82, 0),                 // left arm and hand
    part(new THREE.SphereGeometry(0.115, 12, 10), skin, T(0, 1.58, 0)),                                        // head
    ...(look.cap !== undefined
      ? [cyl(0.125, 0.125, 0.07, look.cap, 0, 1.67, -0.005, 12), box(0.18, 0.015, 0.1, look.cap, 0, 1.655, 0.13)] // cap and visor
      : [part(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, T(0, 1.585, -0.01))]), // hair cap
    ...(look.long ? [box(0.06, 0.16, 0.05, hair, 0, 1.55, -0.14)] : []), // ponytail
  ])!
  const arm = mergeGeometries([box(0.08, 0.6, 0.08, shirt, 0, -0.3, 0), box(0.07, 0.07, 0.09, skin, 0, -0.62, 0)])!
  const group = new THREE.Group(), armMesh = new THREE.Mesh(arm, mat)
  armMesh.position.set(0.24, 1.43, 0)
  group.add(new THREE.Mesh(body, mat), armMesh)
  group.traverse((m) => { m.castShadow = shadows })
  return { group, arm: armMesh }
}
