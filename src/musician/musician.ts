import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Colliders } from '../world/colliders'
import type { CityData } from '../world/city'
import { part, box, T } from '../world/props'
import { isTouch, type Action } from '../device'
import { speechBubble } from '../bubble'
import { CAP, canTip, coinSlot, shownCoins } from './tip'

const MUS_D = 3.5, CASE_D = 4.4 // metres in front of the monument (he faces local +z): clear of the benches (13 m) and the scooter parking (9 m)
const FAR = 90 // beyond this the whole thing is hidden and not animated
const FLIGHT = 0.45, NOD = 0.7 // seconds
const THANKS = ['Дякую, друже!', 'Щиро дякую!', 'Дай Боже здоров’я!', 'Ось це по-нашому! Дякую!', 'Дякую! Зараз зіграю щось веселе.', 'Гривня до гривні — і буде нова гітара. Дякую!']
const rnd = (n: number) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1

const at = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  part(geo, color, T(x, y, z).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))))
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const C = (r: number, h: number, seg = 14) => new THREE.CylinderGeometry(r, r, h, seg)

const SKIN = 0xd6a984, COAT = 0x3f5a47

/** Standing guitarist (nose along local +z, feet at the origin) without his strumming arm. */
function body() {
  const wood = 0xb5762f, dark = 0x1d1d1d
  const guitar = mergeGeometries([ // neck along local +x, tilted up; the left hand holds it
    at(C(0.19, 0.1, 16), wood, -0.12, 0, 0, Math.PI / 2), at(C(0.145, 0.1, 16), wood, 0.1, 0, 0, Math.PI / 2), at(C(0.05, 0.105, 10), dark, -0.02, 0, 0, Math.PI / 2),
    box(0.62, 0.035, 0.03, 0x3a2414, 0.4, 0, 0), box(0.12, 0.04, 0.045, 0x2a1a0e, 0.76, 0, 0),
  ])!.applyMatrix4(T(0, 1.0, 0.2).multiply(new THREE.Matrix4().makeRotationZ(0.3)))
  return mergeGeometries([
    guitar,
    box(0.11, 0.07, 0.24, dark, -0.1, 0.035, 0.04), box(0.11, 0.07, 0.24, dark, 0.1, 0.035, 0.04), box(0.13, 0.82, 0.14, 0x39496b, -0.1, 0.46, 0), box(0.13, 0.82, 0.14, 0x39496b, 0.1, 0.46, 0), // shoes, jeans
    box(0.4, 0.6, 0.24, COAT, 0, 1.17, 0), box(0.07, 0.1, 0.07, SKIN, 0, 1.5, 0), // torso, neck
    part(new THREE.SphereGeometry(0.115, 12, 10), SKIN, T(0, 1.63, 0)), box(0.03, 0.04, 0.04, SKIN, 0, 1.62, 0.12), box(0.15, 0.09, 0.07, 0x4a3524, 0, 1.55, 0.07), // head, nose, beard
    part(new THREE.CylinderGeometry(0.11, 0.12, 0.11, 12), 0x2b2118, T(0, 1.77, 0)), part(C(0.2, 0.015), 0x2b2118, T(0, 1.715, 0)), // hat
    box(0.09, 0.3, 0.09, COAT, 0.25, 1.28, 0.02), at(B(0.08, 0.08, 0.28), COAT, 0.34, 1.13, 0.13, 0, 0.685, 0), box(0.07, 0.06, 0.07, SKIN, 0.43, 1.14, 0.24), // left arm to the neck
  ])!
}

/** Strumming arm, pivot at the right shoulder (placed at (-0.25, 1.4, 0.02) in the figure). */
const arm = () => mergeGeometries([box(0.09, 0.3, 0.09, COAT, 0, -0.15, 0), at(B(0.08, 0.08, 0.32), COAT, 0.095, -0.35, 0.13, 0, 0.63, 0), box(0.07, 0.06, 0.07, SKIN, 0.19, -0.4, 0.26)])!

/** Open instrument case lying across (long side along local x, audience at +z): dark shell, red plush, lid propped open behind. */
function caseGeometry() {
  const shell = 0x17171a, plush = 0x9b1b26
  const lid = mergeGeometries([at(B(1.02, 0.025, 0.42), shell, 0, 0, 0.21), at(B(0.94, 0.01, 0.34), plush, 0, -0.0175, 0.21)])!
    .applyMatrix4(T(0, 0.14, -0.21).multiply(new THREE.Matrix4().makeRotationX(-1.87)))
  return mergeGeometries([
    lid, box(1, 0.02, 0.4, shell, 0, 0.01, 0), box(0.94, 0.01, 0.34, plush, 0, 0.025, 0),
    box(1, 0.12, 0.03, shell, 0, 0.06, -0.185), box(1, 0.12, 0.03, shell, 0, 0.06, 0.185), box(0.03, 0.12, 0.4, shell, -0.485, 0.06, 0), box(0.03, 0.12, 0.4, shell, 0.485, 0.06, 0),
  ])!
}

/**
 * Street guitarist 3.5 m in front of the Shevchenko monument, facing the walking area, with an open guitar case on the ground.
 * Walk up to the case and press E (touch: the `act` button) to throw a 10 ₴ coin: it arcs into the case, he thanks you in a speech bubble and nods.
 * Hooks for sound: `playing` (he is strumming), `onTip` (a coin was dropped), `position` (where the music comes from), `tips` (total coins thrown).
 */
export class Musician implements System {
  playing = true
  onTip: (() => void) | null = null
  tips = 0
  /** What the touch UI should offer right now. */
  act: Action[] = []
  readonly position: THREE.Vector3
  readonly casePosition: THREE.Vector3
  private yaw: number
  private root = new THREE.Group()
  private rig = new THREE.Group()
  private arm: THREE.Mesh
  private coins: THREE.InstancedMesh
  private slots: { pos: THREE.Vector3; q: THREE.Quaternion }[] = []
  private flight: { from: THREE.Vector3; t: number }[] = Array.from({ length: CAP }, () => ({ from: new THREE.Vector3(), t: 1 })) // t: 0..1 in flight, 1 just landed, 2 at rest
  private nodT = 0
  private clock = 0
  private lastLine = -1
  private bubble = speechBubble('#d9a21e', '18%')
  private hint = document.createElement('div')
  private m = new THREE.Matrix4()
  private p = new THREE.Vector3()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  private one = new THREE.Vector3(1, 1, 1)

  constructor(data: CityData, parent: THREE.Object3D, colliders: Colliders, private player: Player) {
    const M = data.street!.monument, s = Math.sin(M.yaw), c = Math.cos(M.yaw)
    this.yaw = M.yaw
    this.position = new THREE.Vector3(M.x + s * MUS_D, 0, M.z + c * MUS_D)
    this.casePosition = new THREE.Vector3(M.x + s * CASE_D, 0, M.z + c * CASE_D)
    this.hint.style.cssText = 'position:fixed;left:50%;bottom:30%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none;text-align:center'
    document.body.append(this.hint)

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
    const figure = new THREE.Mesh(body(), mat), caseMesh = new THREE.Mesh(caseGeometry(), mat)
    this.arm = new THREE.Mesh(arm(), mat); this.arm.position.set(-0.25, 1.4, 0.02)
    this.rig.position.copy(this.position); this.rig.rotation.y = M.yaw
    this.rig.add(figure, this.arm)
    caseMesh.position.copy(this.casePosition); caseMesh.rotation.y = M.yaw
    for (const o of [figure, this.arm, caseMesh]) o.castShadow = o.receiveShadow = true

    // coin resting places: a jittered 4 x 3 grid on the plush, filled in a scattered order
    const cx = this.casePosition.x, cz = this.casePosition.z
    const order = Array.from({ length: CAP }, (_, i) => i).sort((a, b) => rnd(a + 1) - rnd(b + 1))
    this.slots = order.map((k, i) => {
      const lx = (k % 4 - 1.5) * 0.22 + (rnd(i + 20) - 0.5) * 0.06, lz = (Math.floor(k / 4) - 1) * 0.1 + (rnd(i + 40) - 0.5) * 0.03
      return {
        pos: new THREE.Vector3(cx + lx * c + lz * s, 0.036 + (rnd(i + 60) < 0.3 ? 0.012 : 0), cz - lx * s + lz * c),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd(i + 80) - 0.5) * 0.25, rnd(i), (rnd(i + 100) - 0.5) * 0.25)),
      }
    })
    this.coins = new THREE.InstancedMesh(C(0.04, 0.012, 10), new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.7, roughness: 0.3, emissive: 0x4a3300 }), CAP)
    this.coins.boundingSphere = new THREE.Sphere(this.casePosition.clone().setY(1), 4) // fixed: instance matrices are zero-scale until a coin lands
    for (let i = 0; i < CAP; i++) this.coins.setMatrixAt(i, this.m.makeScale(0, 0, 0))
    this.root.add(this.rig, caseMesh, this.coins)
    parent.add(this.root)

    colliders.addBox(this.position.x, this.position.z, 0.3, Infinity)
    colliders.addRect(cx, cz, 0.5, 0.2, M.yaw, 0.15)
    addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat) this.act[0]?.fire() })
  }

  private tip() {
    const i = coinSlot(this.tips++), f = this.flight[i]
    f.from.copy(this.player.position).y -= 0.4; f.t = 0
    this.nodT = NOD
    let n: number; do n = Math.floor(Math.random() * THANKS.length); while (n === this.lastLine)
    this.bubble.say(THANKS[this.lastLine = n], 4)
    this.onTip?.()
  }

  update(dt: number) {
    const pl = this.player, pos = pl.position
    this.bubble.tick(dt)
    this.act = []
    let text = ''
    if (pl.active && !pl.riding && !pl.seated && pos.y < 4 && canTip(pos.x, pos.z, { x: this.casePosition.x, z: this.casePosition.z, yaw: this.yaw })) {
      this.act = [{ label: 'Кинути чайові (10 ₴)', fire: () => this.tip() }]
      if (!isTouch) text = 'E — кинути чайові (10 ₴)'
    }
    this.hint.style.display = text ? 'block' : 'none'
    if (this.hint.textContent !== text) this.hint.textContent = text

    this.root.visible = Math.hypot(pos.x - this.position.x, pos.z - this.position.z) < FAR
    if (!this.root.visible) return
    this.clock += dt
    this.arm.rotation.x = this.playing ? -0.1 + 0.15 * Math.sin(this.clock * 10) : 0
    this.nodT = Math.max(0, this.nodT - dt)
    this.rig.rotation.x = this.nodT > 0 ? 0.17 * Math.sin(Math.PI * (1 - this.nodT / NOD)) : 0 // bow, then upright
    this.rig.rotation.z = 0.015 * Math.sin(this.clock * 1.7)

    let moved = false
    for (let i = 0; i < shownCoins(this.tips); i++) {
      const f = this.flight[i]
      if (f.t >= 1) { if (f.t === 1) { f.t = 2; this.place(i, this.slots[i].pos, this.slots[i].q); moved = true } continue } // landed: one last write, then nothing per frame
      f.t = Math.min(1, f.t + dt / FLIGHT); moved = true
      this.p.lerpVectors(f.from, this.slots[i].pos, f.t).y += 0.7 * f.t * (1 - f.t) * 4
      this.place(i, this.p, this.q.setFromEuler(this.e.set(f.t * 14, 0, 0)))
    }
    if (moved) this.coins.instanceMatrix.needsUpdate = true
  }

  private place(i: number, pos: THREE.Vector3, q: THREE.Quaternion) { this.coins.setMatrixAt(i, this.m.compose(pos, q, this.one)) }
}
