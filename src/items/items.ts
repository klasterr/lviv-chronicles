import * as THREE from 'three'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Colliders } from '../world/colliders'
import { isTouch, type Action } from '../device'
import { heldMat, worldMat, Tray, type Item } from './item'
import { Balloon } from '../balloons/balloon'

const REACH = 3        // metres from which an item can be picked up
const HANDS = 2        // a tray needs both, a loose item one
const THROW = 10       // m/s
const GRAVITY = 14
const MAX_AGE = 8      // s: a throw that never lands (out of the map) is dropped
const FRAGMENTS = 60   // pooled break pieces
const HAND = [new THREE.Vector3(0.3, -0.3, -0.55), new THREE.Vector3(-0.3, -0.3, -0.55)] // camera space: right hand, left hand
const TRAY_HAND = new THREE.Vector3(0, -0.52, -0.8) // low, so a carried tray does not hide the view
const MOUTH = new THREE.Vector3(0, -0.22, -0.36)    // camera space: where food goes to be eaten (low enough not to hide the view)
const MEAL = 1.4                                     // s from lifting it to the mouth to finished
const BITES = [0.45, 0.8, 1.15]                      // s: when each bite / gulp happens

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
  /** Each bite or gulp while eating / drinking (sound). */
  onBite: Hook = null
  /** Asked every frame for every flying item: did it hit a player at `at`? true = it breaks there (src/net handles who felt it). */
  hitTest: ((at: THREE.Vector3, item: Item) => boolean) | null = null
  /** Ids of shared items (shop shelves, opera leaflets) that someone has taken: such an item is gone for every player (src/net). */
  readonly gone = new Set<string>()
  private byId = new Map<string, Item>()
  private rest = new Set<Item>()
  private hands: Item[] = []
  private flying: { item: Item; age: number }[] = []
  private eating: { item: Item; t: number; from: THREE.Vector3; bites: number } | null = null
  private yum = 0 // s left to show "Смачно!" after a meal
  private pieces: Piece[] = []
  private chips: THREE.InstancedMesh
  private colors: THREE.Color[] = []
  private dir = new THREE.Vector3(); private v = new THREE.Vector3(); private c = new THREE.Vector3(); private m = new THREE.Matrix4()
  private q = new THREE.Quaternion(); private e = new THREE.Euler()
  private hint = this.el('position:fixed;left:50%;bottom:20%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none;text-align:center')
  private hold = this.el('position:fixed;left:16px;bottom:16px;padding:6px 12px;border-radius:6px;background:#000a;color:#fff;font:14px system-ui,sans-serif;pointer-events:none;display:none')

  constructor(private scene: THREE.Object3D, private camera: THREE.Camera, private player: Player, private colliders: Colliders) {
    this.chips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), new THREE.MeshStandardMaterial({ roughness: 0.8 }), FRAGMENTS)
    this.chips.frustumCulled = false; this.chips.count = 0; this.chips.userData.keep = true
    this.chips.setColorAt(0, new THREE.Color()) // allocates the colour buffer
    scene.add(this.chips)
    addEventListener('keydown', (e) => {
      if (e.repeat || !this.can()) return
      if (e.code === 'KeyE') this.pick(false); else if (e.code === 'KeyT') this.pick(true); else if (e.code === 'KeyQ') this.throwHeld(); else if (e.code === 'KeyX') this.eat()
    })
  }

  private el(css: string) { const e = document.createElement('div'); e.style.cssText = css; document.body.append(e); return e }
  private can() { return this.player.active && !this.player.riding }

  /** Put an item at rest in the world, its base at (x, y, z). `id`: the item exists for every player (taken by one = gone for all). */
  add(item: Item, x: number, y: number, z: number, id?: string) {
    if (id) { if (this.gone.has(id)) return; item.id = id; this.byId.set(id, item) }
    item.mesh.position.set(x, y, z); item.state = 'rest'
    this.scene.add(item.mesh); item.mesh.updateMatrixWorld(true); this.rest.add(item)
  }

  /** Remove a resting item (and what lies on it) without any effect, e.g. an order that was replaced. */
  remove(item: Item) { this.rest.delete(item); item.mesh.removeFromParent() }

  /** Another player took the shared item `id`. */
  removeId(id: string) {
    this.gone.add(id)
    const it = this.byId.get(id)
    if (it?.state === 'rest') { this.remove(it); if (this.aim?.item === it) this.aim = null }
  }

  /** What the player carries, last taken last. */
  get held(): readonly Item[] { return this.hands }

  /** Another player's throw: it flies and breaks here too. */
  throwRemote(it: Item, vx: number, vy: number, vz: number) {
    it.state = 'flying'; it.vel.set(vx, vy, vz); it.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5)
    this.scene.add(it.mesh); this.flying.push({ item: it, age: 0 })
  }

  private used() { return this.hands.reduce((s, h) => s + h.hands, 0) }

  private pick(whole: boolean) {
    const a = this.aim; if (!a || this.player.seated) return
    const tray = a.tray ?? (a.item instanceof Tray ? a.item : null)
    this.take(whole && tray ? tray : a.item)
  }

  private take(it: Item) {
    if (this.used() + it.hands > HANDS) return
    if (it.container) { it.container.release(it) } else this.rest.delete(it)
    if (it.id) this.gone.add(it.id)
    it.state = 'held'; it.setMaterial(heldMat, 10)
    this.hands.push(it); this.aim = null
    this.onPickup?.(it, this.player.position)
  }

  /** Put a new item (a purchase) straight into the hands; false if there is no room. */
  give(it: Item) {
    if (this.used() + it.hands > HANDS) return false
    it.state = 'held'; it.setMaterial(heldMat, 10)
    this.hands.push(it)
    this.onPickup?.(it, this.player.position)
    return true
  }

  private throwHeld() {
    const it = this.hands.pop(); if (!it) return
    if (it instanceof Balloon) return it.release(this.camera.rotation.y) // let go: it floats away, nothing breaks (no onThrow: src/net would broadcast a breaking throw)
    const d = this.camera.getWorldDirection(this.dir)
    it.mesh.position.copy(this.camera.position).addScaledVector(d, 0.5); it.mesh.position.y -= 0.35 // base of the item, just in front of the hand
    it.setMaterial(worldMat, 0); it.state = 'flying'; it.mesh.visible = true
    it.vel.copy(d).multiplyScalar(THROW); it.vel.y += 2
    it.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5)
    this.flying.push({ item: it, age: 0 })
    this.onThrow?.(it, it.mesh.position)
  }

  /** The food or drink X would take: the last one in hand, else the last one on a carried tray. */
  private meal(): Item | null {
    for (let i = this.hands.length - 1; i >= 0; i--) {
      const h = this.hands[i]
      if (h.edible) return h
      if (h instanceof Tray) for (let j = h.contents.length - 1; j >= 0; j--) if (h.contents[j].edible) return h.contents[j]
    }
    return null
  }

  /** Eat or drink: it goes to the mouth, three bites / gulps, gone. Works seated on a bench too. */
  private eat() {
    const it = this.meal(); if (!it || this.eating || !this.can()) return
    const from = it.mesh.getWorldPosition(new THREE.Vector3()).sub(this.camera.position).applyQuaternion(this.q.copy(this.camera.quaternion).invert())
    if (it.container) { it.container.contents.splice(it.container.contents.indexOf(it), 1); it.container = null; it.mesh.removeFromParent() }
    else this.hands.splice(this.hands.indexOf(it), 1)
    this.scene.add(it.mesh)
    this.eating = { item: it, t: 0, from, bites: 0 }
  }

  private chew(dt: number) {
    const e = this.eating; if (!e) return
    const it = e.item, m = it.mesh
    e.t += dt
    m.position.lerpVectors(e.from, MOUTH, Math.min(1, e.t / 0.35)).applyQuaternion(this.camera.quaternion).add(this.camera.position)
    m.quaternion.copy(this.camera.quaternion)
    if (it.edible === 'drink') m.quaternion.multiply(this.q.setFromEuler(this.e.set(Math.min(1, Math.max(0, (e.t - 0.3) / 0.3)) * 1.1, 0, 0))) // tip the cup towards you
    while (e.bites < BITES.length && e.t >= BITES[e.bites]) { e.bites++; this.onBite?.(it, this.player.position) }
    if (it.edible === 'eat') m.scale.setScalar(Math.max(0.05, 1 - e.bites / BITES.length))
    m.visible = !this.player.riding
    if (e.t >= MEAL) { m.removeFromParent(); m.scale.setScalar(1); this.eating = null; this.yum = 1.5 }
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

  /** hitTest along this frame's flight segment in 15 cm steps (at 10 m/s and a slow frame an item moves ~1 m: it must not skip a body). Moves `p` to the hit. */
  private hits(from: THREE.Vector3, p: THREE.Vector3, it: Item) {
    if (!this.hitTest) return false
    const n = Math.max(1, Math.ceil(from.distanceTo(p) / 0.15))
    for (let i = 1; i <= n; i++) if (this.hitTest(this.v.lerpVectors(from, p, i / n), it)) { p.copy(this.v); return true }
    return false
  }

  private fly(dt: number) {
    for (const f of [...this.flying]) {
      const it = f.item, p = it.mesh.position, from = this.c.copy(p)
      it.vel.y -= GRAVITY * dt; p.addScaledVector(it.vel, dt)
      this.e.set(it.spin.x * dt, it.spin.y * dt, it.spin.z * dt); it.mesh.quaternion.premultiply(this.q.setFromEuler(this.e))
      const w = { x: p.x, z: p.z }
      this.colliders.resolve(w, 0.1, p.y)
      if (this.hits(from, p, it) || Math.hypot(w.x - p.x, w.z - p.z) > 1e-4 || p.y <= this.colliders.groundAt(p.x, p.z, p.y) + 0.02 || (f.age += dt) > MAX_AGE) this.shatter(f)
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
    this.fly(dt); this.chipsStep(dt); this.chew(dt)
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
    const verb = last instanceof Balloon ? 'відпустити' : 'кинути' // a balloon floats away instead of flying
    if (walking && last) this.act.push({ label: verb[0].toUpperCase() + verb.slice(1) + ': ' + last.name, fire: () => this.throwHeld() })
    const meal = this.can() && !this.eating ? this.meal() : null, eatLabel = meal ? (meal.edible === 'drink' ? 'Випити: ' : 'З’їсти: ') + meal.name : ''
    if (meal) this.act.push({ label: eatLabel, fire: () => this.eat() })
    if (this.yum > 0 && (this.yum -= dt) > 0 && !hint) hint = 'Смачно!'
    this.hint.style.display = hint && (!isTouch || hint === 'Смачно!') ? 'block' : 'none'
    if (this.hint.textContent !== hint) this.hint.textContent = hint
    const held = last && this.can() ? 'У руках: ' + this.hands.map((h) => h.name).join(', ') + (isTouch ? '' : ' · Q — ' + verb + (meal ? ' · X — ' + eatLabel[0].toLowerCase() + eatLabel.slice(1) : '')) : ''
    this.hold.style.display = held ? 'block' : 'none'
    if (this.hold.textContent !== held) this.hold.textContent = held
  }
}
