import * as THREE from 'three'
import type { System } from '../game'
import type { Player } from '../player/player'
import { sfx } from '../audio/sfx'

const ENTER_R = 0.9 // metres from a door at which walking into it counts (while looking at it)
const SLOT = 150    // metres between room slots beyond the city

export interface Door { x: number; z: number; nx: number; nz: number } // a door in a wall; (nx, nz) = outward normal
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number }

export interface PortalSpec<R extends { group: THREE.Object3D }> {
  /** The street door in the world. */
  door: Door
  /** Which spot beyond the city the room occupies: x = city.maxX + 150 + slot * 150. Every room needs its own slot (0 restaurant, 1-6 shops, 7 opera). */
  slot: number
  /** Half extents of the room: while inside, the player is kept within it. */
  half: { w: number; d: number }
  /** Where you appear (room-local, +x east, +z south) and the camera yaw (0 = facing north, -z). */
  arrive: { x: number; z: number; yaw?: number }
  /** The door you leave through, room-local, with its outward normal (the way you face to leave). */
  exit: { x: number; z: number; nx: number; nz: number }
  /** Builds the room at its origin on the first visit (lazy, so the code and textures stay out of the start-up cost). Return the room with its root `group` placed at the origin. */
  build: (origin: { x: number; z: number }) => Promise<R>
  /** Ambience profile for the audio system ('restaurant' | 'shop' | 'hall'); only used by src/audio. */
  tone?: string
}

/**
 * A door that leads into a separate room far outside the city (like the interiors of old GTA): walk into it while looking at it, the screen fades, you are teleported.
 * One room at a time: `Portal.active` is the room the player is in (null outdoors). Call update() every frame (game.systems or from your own system).
 */
export class Portal<R extends { group: THREE.Object3D } = { group: THREE.Object3D }> implements System {
  static active: Portal<any> | null = null
  room: R | null = null
  readonly origin: { x: number; z: number }
  busy = false // fade in progress
  private saved: Bounds | null = null
  private hidden: THREE.Object3D[] = [] // the outdoor world, switched off while you are inside
  private marker: THREE.Mesh
  private dir = new THREE.Vector3()
  private fade = document.createElement('div')

  constructor(private parent: THREE.Object3D, private player: Player, private camera: THREE.Camera, private bounds: Bounds, readonly spec: PortalSpec<R>) {
    this.origin = { x: bounds.maxX + 150 + spec.slot * SLOT, z: bounds.maxZ + 150 } // construct before anyone walks in: `bounds` shrinks while inside
    this.fade.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .25s;z-index:15'
    document.body.append(this.fade)
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc72c, transparent: true, opacity: 0.85, depthWrite: false }))
    const d = spec.door
    this.marker.position.set(d.x + d.nx * 0.6, 0.06, d.z + d.nz * 0.6)
    parent.add(this.marker)
  }

  get inside() { return Portal.active === this }
  /** Player position in room coordinates. */
  local() { const p = this.player.position; return { x: p.x - this.origin.x, z: p.z - this.origin.z } }

  private facing(dx: number, dz: number) { this.camera.getWorldDirection(this.dir); return this.dir.x * dx + this.dir.z * dz > 0.3 }

  private go(to: () => void | Promise<void>) {
    this.busy = true; this.fade.style.opacity = '1'; sfx.play('chime') // door chime, both ways
    setTimeout(async () => { await to(); this.fade.style.opacity = '0'; setTimeout(() => (this.busy = false), 300) }, 280)
  }

  enter() {
    this.go(async () => {
      if (!this.room) { // first visit: build the room (walls, furniture and floors register themselves with the colliders)
        this.room = await this.spec.build(this.origin)
        this.parent.add(this.room.group)
      }
      const s = this.spec, o = this.origin
      this.room.group.visible = true; this.marker.visible = false
      // nothing outside can be seen from in here, but without occlusion culling the GPU would still draw the whole city behind the walls (~1.7 M triangles)
      this.hidden = this.parent.children.filter((c) => c.visible && c !== this.room!.group && !(c as THREE.Light).isLight && !c.userData.keep)
      for (const c of this.hidden) c.visible = false
      this.saved = { ...this.bounds }
      Object.assign(this.bounds, { minX: o.x - s.half.w, maxX: o.x + s.half.w, minZ: o.z - s.half.d, maxZ: o.z + s.half.d })
      this.player.teleport(o.x + s.arrive.x, o.z + s.arrive.z, s.arrive.yaw ?? 0)
      Portal.active = this
    })
  }

  leave() {
    this.go(() => {
      Object.assign(this.bounds, this.saved)
      this.room!.group.visible = false; this.marker.visible = true
      for (const c of this.hidden) c.visible = true
      const d = this.spec.door
      this.player.teleport(d.x + d.nx * 1.4, d.z + d.nz * 1.4, Math.atan2(-d.nx, -d.nz))
      Portal.active = null
    })
  }

  /** Triggers walking into either door. Returns true while the player is free to act in the room (inside, not fading, on the ground floor). */
  update() {
    this.marker.scale.setScalar(1 + 0.12 * Math.sin(performance.now() / 250))
    const p = this.player, pos = p.position
    if (!p.active || this.busy || p.riding || p.seated || (Portal.active && !this.inside)) return false
    if (!this.inside) {
      const d = this.spec.door
      if (pos.y < 4 && Math.hypot(pos.x - d.x, pos.z - d.z) < ENTER_R && this.facing(-d.nx, -d.nz)) this.enter()
      return false
    }
    const e = this.spec.exit, l = this.local()
    if (pos.y < 3.5 && Math.hypot(l.x - e.x, l.z - e.z) < ENTER_R && this.facing(e.nx, e.nz)) { this.leave(); return false }
    return pos.y < 3.5
  }
}
