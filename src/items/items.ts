import * as THREE from 'three'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Colliders } from '../world/colliders'
import { isTouch, type Action } from '../device'
import { heldMat, worldMat, Tray, type Item } from './item'

const REACH = 3        // metres from which an item can be picked up
const HANDS = 2        // a tray needs both, a loose item one
const THROW = 10       // m/s
const GRAVITY = 14
const MAX_AGE = 8      // s: a throw that never lands (out of the map) is dropped
const FRAGMENTS = 60   // pooled break pieces
const HAND = [new THREE.Vector3(0.3, -0.3, -0.55), new THREE.Vector3(-0.3, -0.3, -0.55)] // camera space: right hand, left hand
const TRAY_HAND = new THREE.Vector3(0, -0.52, -0.8) // low, so a carried tray does not hide the view

type Hook = ((item: Item, at: THREE.Vector3) => void) | null
interface Piece { p: THREE.Vector3; v: THREE.Vector3; life: number; floor: number }

/**
 * Carry and throw things. Aim at an item (3 m): E takes it, T takes the whole tray it lies on; a tray needs both hands, loose items one each.
 * Q throws the last thing taken; whatever is thrown breaks where it lands (or hits a wall) and is gone. Touch: the same as buttons via `act`.
 * Other systems put items into the world with add() and can listen with onPickup / onThrow / onBreak (sound, achievements ...).
 */
export class Items implements System {
  act: Action[] = []
  /** What the crosshair is on right now (also read by Restaurant: E at the counter takes an item before it opens the menu). */
  aim: { item: Item; tray: Tray | null } | null = null
  onPickup: Hook = null; onThrow: Hook = null; onBreak: Hook = null
  private rest = new Set<Item>()
  private hands: Item[] = []
  private flying: { item: Item; age: number }[] = []
  private pieces: Piece[] = []
  private chips: THREE.InstancedMesh
  private colors: THREE.Color[] = []
  private dir = new THREE.Vector3(); private v = new THREE.Vector3(); private c = new THREE.Vector3(); private m = new THREE.Matrix4()
  private q = new THREE.Quaternion(); private e = new THREE.Euler()
  private hint = this.el('position:fixed;left:50%;bottom:20%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none;text-align:center')
  private hold = this.el('position:fixed;left:16px;bottom:16px;padding:6px 12px;border-radius:6px;background:#000a;color:#fff;font:14px system-ui,sans-serif;pointer-events:none;display:none')

  constructor(private scene: THREE.Object3D, private camera: THREE.Camera, private player: Player, private colliders: Colliders) {
    this.chips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), new THREE.MeshStandardMaterial({ roughness: 0.8 }), FRAGMENTS)
    this.chips.frustumCulled = false; this.chips.count = 0
    this.chips.setColorAt(0, new THREE.Color()) // allocates the colour buffer
    scene.add(this.chips)
    addEventListener('keydown', (e) => {
      if (e.repeat || !this.can()) return
      if (e.code === 'KeyE') this.pick(false); else if (e.code === 'KeyT') this.pick(true); else if (e.code === 'KeyQ') this.throwHeld()
    })
  }

  private el(css: string) { const e = document.createElement('div'); e.style.cssText = css; document.body.append(e); return e }
  private can() { return this.player.active && !this.player.riding }

  /** Put an item at rest in the world, its base at (x, y, z). */
  add(item: Item, x: number, y: number, z: number) {
    item.mesh.position.set(x, y, z); item.state = 'rest'
    this.scene.add(item.mesh); item.mesh.updateMatrixWorld(true); this.rest.add(item)
  }

  /** Remove a resting item (and what lies on it) without any effect, e.g. an order that was replaced. */
  remove(item: Item) { this.rest.delete(item); item.mesh.removeFromParent() }

  private used() { return this.hands.reduce((s, h) => s + h.hands, 0) }

  private pick(whole: boolean) {
    const a = this.aim; if (!a || this.player.seated) return
    const tray = a.tray ?? (a.item instanceof Tray ? a.item : null)
    this.take(whole && tray ? tray : a.item)
  }

  private take(it: Item) {
    if (this.used() + it.hands > HANDS) return
    if (it.container) { it.container.release(it) } else this.rest.delete(it)
    it.state = 'held'; it.setMaterial(heldMat, 10)
    this.hands.push(it); this.aim = null
    this.onPickup?.(it, this.player.position)
  }

  private throwHeld() {
    const it = this.hands.pop(); if (!it) return
    const d = this.camera.getWorldDirection(this.dir)
    it.mesh.position.copy(this.camera.position).addScaledVector(d, 0.5); it.mesh.position.y -= 0.35 // base of the item, just in front of the hand
    it.setMaterial(worldMat, 0); it.state = 'flying'; it.mesh.visible = true
    it.vel.copy(d).multiplyScalar(THROW); it.vel.y += 2
    it.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5)
    this.flying.push({ item: it, age: 0 })
    this.onThrow?.(it, it.mesh.position)
  }

  private shatter(f: { item: Item; age: number }) {
    const it = f.item, p = it.mesh.position
    this.flying.splice(this.flying.indexOf(f), 1)
    it.mesh.removeFromParent()
    const floor = this.colliders.groundAt(p.x, p.z, p.y), cols = it.fragments
    for (let i = 0; i < 16; i++) {
      if (this.pieces.length >= FRAGMENTS) { this.pieces.shift(); this.colors.shift() }
      this.pieces.push({ p: p.clone().setY(Math.max(p.y, floor) + 0.05), v: new THREE.Vector3(Math.random() * 4 - 2, Math.random() * 3 + 1, Math.random() * 4 - 2), life: 0.9, floor })
      this.colors.push(new THREE.Color(cols[i % cols.length]))
    }
    this.onBreak?.(it, p)
  }

  private fly(dt: number) {
    for (const f of [...this.flying]) {
      const it = f.item, p = it.mesh.position
      it.vel.y -= GRAVITY * dt; p.addScaledVector(it.vel, dt)
      this.e.set(it.spin.x * dt, it.spin.y * dt, it.spin.z * dt); it.mesh.quaternion.premultiply(this.q.setFromEuler(this.e))
      const w = { x: p.x, z: p.z }
      this.colliders.resolve(w, 0.1, p.y)
      if (Math.hypot(w.x - p.x, w.z - p.z) > 1e-4 || p.y <= this.colliders.groundAt(p.x, p.z, p.y) + 0.02 || (f.age += dt) > MAX_AGE) this.shatter(f)
    }
  }

  private chipsStep(dt: number) {
    const ps = this.pieces
    for (let i = ps.length - 1; i >= 0; i--) {
      const s = ps[i]
      if ((s.life -= dt) <= 0) { ps.splice(i, 1); this.colors.splice(i, 1); continue }
      s.v.y -= 12 * dt; s.p.addScaledVector(s.v, dt)
      if (s.p.y < s.floor + 0.02) { s.p.y = s.floor + 0.02; s.v.set(0, 0, 0) }
    }
    this.chips.count = ps.length
    ps.forEach((s, i) => { this.chips.setMatrixAt(i, this.m.makeScale(s.life / 0.9, s.life / 0.9, s.life / 0.9).setPosition(s.p)); this.chips.setColorAt(i, this.colors[i]) })
    this.chips.instanceMatrix.needsUpdate = true; if (this.chips.instanceColor) this.chips.instanceColor.needsUpdate = true
  }

  /** Nearest aim sphere along the view ray; a part lying on a tray wins over the tray itself. */
  private aimAt(): Items['aim'] {
    const o = this.camera.position, d = this.camera.getWorldDirection(this.dir)
    let best: Items['aim'] = null as Items['aim'], bt = Infinity
    const test = (it: Item, bias: number, tray: Tray | null) => {
      this.v.copy(it.center(this.c)).sub(o)
      const t = this.v.dot(d), r = it.radius + 0.05
      if (t < 0 || t > REACH || this.v.lengthSq() - t * t > r * r || t - bias >= bt) return
      bt = t - bias; best = { item: it, tray }
    }
    for (const it of this.rest) { test(it, 0, null); if (it instanceof Tray) for (const c of it.contents) test(c, 0.15, it) }
    return best
  }

  update(dt: number) {
    this.fly(dt); this.chipsStep(dt)
    let slot = 0
    for (const it of this.hands) { // carried things follow the view
      const off = it.hands === 2 ? TRAY_HAND : HAND[slot]; slot += it.hands
      it.mesh.position.copy(off).applyQuaternion(this.camera.quaternion).add(this.camera.position)
      it.mesh.quaternion.copy(this.camera.quaternion); it.mesh.visible = !this.player.riding
      if (!it.mesh.parent) this.scene.add(it.mesh)
    }

    this.act = []
    const walking = this.can() && !this.player.seated
    this.aim = walking ? this.aimAt() : null
    let hint = ''
    const a = this.aim
    if (a) {
      const tray = a.tray ?? (a.item instanceof Tray ? a.item : null), free = this.used() + a.item.hands <= HANDS
      if (!free) hint = 'Руки зайняті'
      else {
        const label = a.item === tray ? 'Взяти піднос' : 'Взяти: ' + a.item.name
        this.act.push({ label, fire: () => this.pick(false) })
        hint = (isTouch ? '' : 'E — ') + label[0].toLowerCase() + label.slice(1) // only the verb: item names keep their capitals
      }
      if (tray && a.item !== tray && this.used() === 0) {
        this.act.push({ label: 'Взяти весь піднос', fire: () => this.pick(true) })
        if (!isTouch) hint += ' · T — весь піднос'
      }
    }
    const last = this.hands[this.hands.length - 1]
    if (walking && last) this.act.push({ label: 'Кинути: ' + last.name, fire: () => this.throwHeld() })
    this.hint.style.display = hint && !isTouch ? 'block' : 'none'
    if (this.hint.textContent !== hint) this.hint.textContent = hint
    const held = last && this.can() ? 'У руках: ' + this.hands.map((h) => h.name).join(', ') + (isTouch ? '' : ' · Q — кинути') : ''
    this.hold.style.display = held ? 'block' : 'none'
    if (this.hold.textContent !== held) this.hold.textContent = held
  }
}
