import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { part, box, T } from '../world/props'
import { Item, worldMat } from '../items/item'

/** Balloon colours with their names (nominative feminine: «червона кулька»). */
export const COLOURS: [number, string][] = [
  [0xe02a2a, 'Червона'], [0xf2c81e, 'Жовта'], [0x2f62e0, 'Синя'], [0x2fb84a, 'Зелена'],
  [0xf27ab8, 'Рожева'], [0xf28a1e, 'Помаранчева'], [0x8c3fd0, 'Фіолетова'], [0x3fc4ee, 'Блакитна'],
]
export const R = 0.15, STRING = 0.75 // balloon radius, string length (m)
const TILT = 0.85 // the geometry leans forward (local -z) by this much, so in first person the balloon floats ahead of the hand and stays in view

/** One balloon standing upright: string from the origin up, knot, a slightly tall sphere. Shared with the seller's bunch. */
export function balloonGeometry(color: number, s = STRING) {
  return mergeGeometries([
    box(0.003, s, 0.003, 0xf4f4f4, 0, s / 2, 0),
    part(new THREE.ConeGeometry(0.018, 0.04, 6), color, T(0, s + 0.02, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI))), // knot, tip down
    part(new THREE.SphereGeometry(R, 16, 12), color, T(0, s + 0.035 + R * 1.15, 0).multiply(new THREE.Matrix4().makeScale(1, 1.15, 1))),
  ])!
}

const geo = new Map<number, THREE.BufferGeometry>() // one geometry per colour
/** Balloons that were let go: they rise, sway and shrink away. Stepped by the seller system (BalloonGirl.update). */
const aloft: { b: Balloon; p: THREE.Vector3; t: number }[] = []
const LIFE = 6, SHRINK = 1.5 // seconds aloft, of them shrinking at the end

/** A helium balloon on a string: one hand, never lies in the world (bought straight into the hands), Q lets it go instead of throwing it. */
export class Balloon extends Item {
  constructor(color: number, name: string) {
    if (!geo.has(color)) geo.set(color, balloonGeometry(color).applyMatrix4(new THREE.Matrix4().makeRotationX(-TILT)))
    super(name + ' кулька', geo.get(color)!, { radius: R, cy: STRING, fragments: [color] })
  }

  /** Let go where the hand is: upright again, then it floats off (Items.throwHeld; no onThrow, so nothing breaks for other players). */
  release(yaw: number) {
    this.state = 'flying'; this.setMaterial(worldMat, 0); this.mesh.visible = true
    this.mesh.quaternion.setFromEuler(new THREE.Euler(TILT, yaw, 0, 'YXZ'))
    aloft.push({ b: this, p: this.mesh.position.clone(), t: 0 })
  }
}

export function floatAway(dt: number) {
  for (let i = aloft.length - 1; i >= 0; i--) {
    const a = aloft[i], t = (a.t += dt), m = a.b.mesh
    if (t > LIFE) { m.removeFromParent(); aloft.splice(i, 1); continue }
    m.position.set(a.p.x + 0.25 * Math.sin(t * 1.3), a.p.y + 0.5 * t + 0.08 * t * t, a.p.z + 0.2 * Math.sin(t * 0.9)) // slow, then a little faster
    m.scale.setScalar(Math.min(1, (LIFE - t) / SHRINK))
  }
}
