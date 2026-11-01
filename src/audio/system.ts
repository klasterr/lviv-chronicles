import type * as THREE from 'three'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Items } from '../items/items'
import type { Item } from '../items/item'
import type { Musician } from '../musician/musician'
import type { Restaurant } from '../restaurant/restaurant'
import { Beds, Music } from './beds'
import { MOVING, clamp01, distGain, itemClass, panFor, stepVol, stride } from './logic'
import { sfx } from './sfx'

export interface AudioDeps {
  player: Player; camera: THREE.PerspectiveCamera; items: Items; musician: Musician; restaurant?: Restaurant
  fountain?: { x: number; z: number }; overlay: HTMLElement
}

/** Drives the continuous sounds and turns player state changes (steps, jump, sit, scooter ...) into one-shots; hooks the items and the musician. */
export class AudioSystem implements System {
  private beds: Beds | null = null
  private music: Music | null = null
  private px = 0; private py = 0; private pz = 0; private seen = false // previous camera position
  private pvy = 0; private seated = false; private riding = false
  private dist = 0; private moving = false // metres walked since the last step

  constructor(private d: AudioDeps) {
    sfx.cam = d.camera
    const cls = (it: Item) => itemClass(it as never) // McItem has .menu, Tray has .contents
    d.items.onPickup = (it) => { const k = cls(it); sfx.play(k === 'cup' ? 'pickCup' : k === 'tray' ? 'pickTray' : 'pick') }
    d.items.onThrow = () => sfx.play('throw')
    d.items.onBreak = (it, at) => { const k = cls(it); sfx.play(k === 'cup' ? 'breakCup' : k === 'tray' ? 'breakTray' : 'breakFood', at) }
    d.musician.onTip = () => sfx.play('coin', d.musician.casePosition)
    addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) sfx.toggleMute() })
    document.addEventListener('visibilitychange', () => this.sync())
  }

  private sync() { sfx.sync(!document.hidden && this.d.overlay.style.display === 'none') }

  update(dt: number) {
    this.sync()
    if (!sfx.ready) return
    const { player: pl, camera, musician, restaurant } = this.d, p = pl.position
    if (!this.beds) { this.beds = new Beds(sfx); this.music = new Music(sfx) } // first frame after the context is running
    const b = this.beds.t

    // speed from the camera movement (a teleport is a jump of hundreds of metres in one frame: not a speed)
    let sp = 0, sp3 = 0
    if (this.seen && dt > 1e-4) {
      const dx = p.x - this.px, dz = p.z - this.pz
      sp = Math.hypot(dx, dz) / dt; sp3 = Math.hypot(dx, p.y - this.py, dz) / dt
      if (sp3 > 90) sp = sp3 = 0
    }
    this.px = p.x; this.py = p.y; this.pz = p.z; this.seen = true
    const inside = restaurant?.inside ?? false

    // footsteps: by distance walked, so the rate follows the speed
    const walking = pl.active && !pl.flying && !pl.riding && !pl.seated && pl.vspeed === 0 && sp > MOVING
    if (walking) {
      if (!this.moving) this.dist = stride(sp) * 0.7 // the first step comes quickly
      this.dist += sp * dt
      if (this.dist >= stride(sp)) { this.dist = 0; sfx.play(inside ? 'stepIn' : 'step', undefined, stepVol(sp)) }
    }
    this.moving = walking

    const vy = pl.vspeed
    if (!pl.flying && pl.active) {
      if (this.pvy === 0 && vy > 5) sfx.play('jump')
      else if (this.pvy < -4 && vy === 0) sfx.play('land', undefined, Math.min(1, 0.25 + (-this.pvy - 4) / 12))
    }
    this.pvy = vy
    if (pl.seated !== this.seated) sfx.play((this.seated = pl.seated) ? 'sit' : 'stand')
    if (pl.riding !== this.riding) sfx.play((this.riding = pl.riding) ? 'latch' : 'unlatch')

    b.inside = inside ? 1 : 0
    b.scooter = pl.riding ? 1 : 0; b.speed = pl.speedMs
    b.wind = pl.flying && pl.active ? clamp01(sp3 / 45) : 0
    const f = this.d.fountain
    if (f) { const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz); b.fountain = distGain(d, 40); b.fountainPan = d < 40 ? panFor(dx, dz, camera.rotation.y) : 0 }
    this.beds.update(dt)

    const mx = musician.position.x - p.x, mz = musician.position.z - p.z, md = Math.hypot(mx, mz)
    this.music!.update(dt, musician.playing, md, md < 35 ? panFor(mx, mz, camera.rotation.y) : 0)
  }
}
