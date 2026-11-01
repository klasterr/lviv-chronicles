import * as THREE from 'three'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import type { System } from '../game'
import type { Colliders } from '../world/colliders'

const EYE = 1.7, EYE_SIT = 1.2, EYE_RIDE = 1.8, MAX_SPEED = 40 / 3.6 /* scooter top speed, 40 km/h */, RADIUS = 0.35, WALK = 4, RUN = 8, GRAVITY = 22, JUMP = 7.5
const FLY = 14, FLY_FAST = 45, CEILING = 300
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']

interface Seat { x: number; z: number; yaw: number; standX: number; standZ: number; t: number }

export class Player implements System {
  controls: PointerLockControls
  flying = false
  touchActive = false // phone: set while the touch controls are in use (the start screen / menu / chess board switch it off)
  climb = 0 // touch up/down buttons while flying: -1..1
  private keys = new Set<string>()
  private vel = new THREE.Vector3()
  private fwd = new THREE.Vector3()
  private target = new THREE.Vector3() // reused every frame (no per-frame allocation)
  private y: number // feet height
  private vy = 0
  private eye = EYE // eased between standing and seated eye height
  private seat: Seat | null = null
  private ride: { a: number; speed: number; t: number } | null = null // a = heading in camera-yaw convention: forward = (-sin a, -cos a)
  private wantStand = false // set by a movement key press while seated, consumed in update (a tap between frames still counts)
  private jumpQueued = false
  private lastSpace = 0

  constructor(
    private camera: THREE.PerspectiveCamera, dom: HTMLElement, private colliders: Colliders,
    private bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    spawn: { x: number; z: number; yaw: number },
  ) {
    this.controls = new PointerLockControls(camera, dom)
    this.y = colliders.groundAt(spawn.x, spawn.z)
    camera.position.set(spawn.x, this.y + EYE, spawn.z)
    camera.rotation.set(0, spawn.yaw, 0, 'YXZ')
    addEventListener('keydown', (e) => { if (!e.repeat) this.keyDown(e.code) })
    addEventListener('keyup', (e) => this.keyUp(e.code))
    addEventListener('blur', () => this.keys.clear())
  }

  /** Key presses come from the keyboard or from the touch controls. */
  keyDown(code: string) {
    this.keys.add(code)
    if (this.seat) { if (MOVE_KEYS.includes(code)) this.wantStand = true; return } // seated: movement keys only stand you up
    if (this.ride) return // riding: Space / F do nothing
    if (code === 'KeyF') this.flying = !this.flying
    if (code === 'Space') {
      const now = performance.now()
      if (now - this.lastSpace < 300) this.flying = !this.flying // double-tap Space also toggles flight
      this.lastSpace = now
      this.jumpQueued = true
    }
  }

  keyUp(code: string) { this.keys.delete(code) }

  /** Touch look: radians; finger right = turn right, finger up = look up. */
  look(dYaw: number, dPitch: number) {
    const r = this.camera.rotation
    r.y -= dYaw
    r.x = THREE.MathUtils.clamp(r.x - dPitch, -1.5, 1.5)
  }

  /** True while the player is in control: pointer locked (desktop) or the touch controls are on (phone). */
  get active() { return this.controls.isLocked || this.touchActive }

  get seated() { return this.seat !== null }
  get riding() { return this.ride !== null }
  get speedMs() { return this.ride?.speed ?? 0 }
  get heading() { return this.ride?.a ?? 0 }
  get position() { return this.camera.position }

  /** Get on a scooter standing at (x, z) with heading a. */
  mount(x: number, z: number, a: number) {
    this.ride = { a, speed: 0, t: 0 }
    this.camera.position.x = x; this.camera.position.z = z
    this.flying = false; this.vel.set(0, 0, 0); this.vy = 0; this.jumpQueued = false
    this.keys.clear()
  }

  /** Step off to the right of the scooter; returns where it was left. */
  dismount() {
    const r = this.ride
    if (!r) return null
    const p = this.camera.position, pose = { x: p.x, z: p.z, a: r.a }
    p.x += Math.cos(r.a) * 0.8; p.z -= Math.sin(r.a) * 0.8 // right of the heading
    this.ride = null; this.vel.set(0, 0, 0)
    return pose
  }

  /** Glide onto a seat; `yaw` is the camera yaw to face (eased in, then the mouse is free again). */
  sit(x: number, z: number, yaw: number, standX: number, standZ: number) {
    this.seat = { x, z, yaw, standX, standZ, t: 0 }; this.wantStand = false
    this.flying = false; this.vel.set(0, 0, 0); this.vy = 0; this.jumpQueued = false
    this.keys.clear() // a key held while clicking must not stand you straight back up
  }

  stand() {
    if (!this.seat) return
    this.camera.position.x = this.seat.standX; this.camera.position.z = this.seat.standZ
    this.y = this.colliders.groundAt(this.seat.standX, this.seat.standZ); this.vy = 0
    this.seat = null; this.jumpQueued = false; this.lastSpace = 0
  }

  update(dt: number) {
    if (!this.active) { this.vel.set(0, 0, 0); this.jumpQueued = false; return }
    const p = this.camera.position

    if (this.seat) {
      const s = this.seat, k = 1 - Math.exp(-8 * dt)
      p.x += (s.x - p.x) * k; p.z += (s.z - p.z) * k // no collision while seated: the bench itself is an obstacle
      this.eye += (EYE_SIT - this.eye) * k
      if (s.t < 0.5) { // turn to face out of the bench, then leave the mouse alone
        s.t += dt
        const d = ((s.yaw - this.camera.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        this.camera.rotation.y += d * k
        this.camera.rotation.x -= this.camera.rotation.x * k // and level the view (you were looking down at the bench)
      }
      p.y = this.y + this.eye
      if (this.wantStand) this.stand()
      return
    }

    if (this.ride) {
      const r = this.ride, held = this.keys, k8 = 1 - Math.exp(-8 * dt)
      const thr = +(held.has('KeyW') || held.has('ArrowUp')) - +(held.has('KeyS') || held.has('ArrowDown'))
      const steer = +(held.has('KeyA') || held.has('ArrowLeft')) - +(held.has('KeyD') || held.has('ArrowRight'))
      r.speed = THREE.MathUtils.clamp(r.speed + (thr > 0 ? 3.5 : thr < 0 ? -7 : -0.6) * dt, 0, MAX_SPEED) // W accelerate, S brake, else coast
      const turn = steer * 1.3 * Math.min(1, r.speed / 2.5) * dt // no turning on the spot
      r.a += turn; this.camera.rotation.y += turn // the camera follows the steering; the mouse offset stays
      if (r.t < 0.4) { // ease the view onto the scooter's heading after mounting
        r.t += dt
        this.camera.rotation.y += (((r.a - this.camera.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k8
      }
      const nx = p.x - Math.sin(r.a) * r.speed * dt, nz = p.z - Math.cos(r.a) * r.speed * dt
      p.x = nx; p.z = nz
      this.colliders.resolve(p, 0.5, this.y)
      if (Math.hypot(p.x - nx, p.z - nz) > 0.02) r.speed *= 0.3 // bumped into something
      p.x = THREE.MathUtils.clamp(p.x, this.bounds.minX, this.bounds.maxX)
      p.z = THREE.MathUtils.clamp(p.z, this.bounds.minZ, this.bounds.maxZ)
      this.y = this.colliders.groundAt(p.x, p.z)
      this.eye += (EYE_RIDE - this.eye) * k8
      p.y = this.y + this.eye
      return
    }

    const k = this.keys
    const f = +(k.has('KeyW') || k.has('ArrowUp')) - +(k.has('KeyS') || k.has('ArrowDown'))
    const r = +(k.has('KeyD') || k.has('ArrowRight')) - +(k.has('KeyA') || k.has('ArrowLeft'))
    const speed = this.flying ? (k.has('ShiftLeft') ? FLY_FAST : FLY) : k.has('ShiftLeft') ? RUN : WALK
    const n = Math.hypot(f, r) || 1

    this.camera.getWorldDirection(this.fwd)
    const pitch = this.fwd.y
    const hl = Math.hypot(this.fwd.x, this.fwd.z) || 1
    const fx = this.fwd.x / hl, fz = this.fwd.z / hl // horizontal forward
    // walking stays on the ground plane; flying goes where you look
    const fyaw = this.flying ? pitch : 0, fh = this.flying ? hl : 1
    const target = this.target.set(
      (fx * fh * f - fz * r) * speed / n, (fyaw * f) * speed / n, (fz * fh * f + fx * r) * speed / n,
    )
    const k1 = 1 - Math.exp(-(this.flying ? 4 : 10) * dt)
    this.vel.x += (target.x - this.vel.x) * k1
    this.vel.z += (target.z - this.vel.z) * k1

    p.x += this.vel.x * dt; p.z += this.vel.z * dt
    if (this.flying) {
      this.vy += (target.y + THREE.MathUtils.clamp(+k.has('Space') - +k.has('KeyC') + this.climb, -1, 1) * speed - this.vy) * k1
      this.y += this.vy * dt
    } else {
      this.vy -= GRAVITY * dt
      this.y += this.vy * dt
    }
    this.colliders.resolve(p, RADIUS, this.y)
    p.x = THREE.MathUtils.clamp(p.x, this.bounds.minX, this.bounds.maxX)
    p.z = THREE.MathUtils.clamp(p.z, this.bounds.minZ, this.bounds.maxZ)

    const ground = this.colliders.groundAt(p.x, p.z)
    if (this.y <= ground) {
      this.y = ground
      if (this.vy < 0) this.vy = 0
      if (this.jumpQueued && !this.flying) this.vy = JUMP
    }
    this.jumpQueued = false
    this.y = Math.min(this.y, CEILING)
    this.eye += (EYE - this.eye) * k1 // back to standing eye height after getting up
    p.y = this.y + this.eye
  }
}
