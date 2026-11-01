import * as THREE from 'three'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { CityData } from '../world/city'
import type { Items } from '../items/items'
import { isTouch, type Action } from '../device'
import { speechBubble } from '../bubble'
import { sfx } from '../audio/sfx'
import { COSTUMES, rig, type Costume } from './costumes'
import { loop, SPEED } from './route'

const REACH = 2        // m: hug / handshake from here, roughly facing them
const FACING = 0.55    // cos of the widest angle between your view and the animator
const FAR = 80         // m: beyond this an animator is hidden and not animated
const PERSONAL = 0.6   // m: the player is pushed out of this circle
const STRIDE = 1.1     // m per walk cycle (two steps)
const HUG_D = 1.05     // m: they step in this close to hug you
const SPLAY = 0.2      // rad: arms held a little out from the round costume
const DUR = { hug: 2.4, shake: 2.2 } // s, then they walk on
type Kind = keyof typeof DUR

const wrap = (a: number) => ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI
const ease = (t: number) => t * t * (3 - 2 * t)

interface Walker {
  c: Costume; mesh: THREE.SkinnedMesh; bones: THREE.Bone[]
  phase: number // metres along the loop at t = 0: the three are spread evenly
  lag: number   // s spent standing for a hug, caught up again by walking a bit faster
  s: number; yaw: number; x: number; z: number
  act: { kind: Kind; t: number; s: number; now: number; dx: number; dz: number; d: number } | null
  line: number
}

/**
 * Street animators in mascot costumes (a donkey, Sonic, Labubu) strolling a loop on the boulevard's central promenade (route.ts).
 * Their place on the loop is a function of wall-clock time, so every player sees them in about the same spot without any network traffic.
 * Walk up (2 m, facing one): E — hug, H — handshake (touch: `act`). They stop, turn to you, play the gesture, say something and walk on.
 */
export class Animators implements System {
  act: Action[] = []
  private walkers: Walker[]
  private route: ReturnType<typeof loop>
  private target: Walker | null = null
  private eFree = false
  private bubble = speechBubble('#7a4fd0', '18%')
  private hint = document.createElement('div')

  /** `others`: actions of systems that also use E (scooters, musician, balloons): while one is on offer, E is theirs. */
  constructor(data: CityData, parent: THREE.Object3D, private player: Player, private camera: THREE.Camera, shadows: boolean, private items: Items, private others: () => Action[]) {
    this.route = loop(data.street!.ribbons)
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    this.walkers = COSTUMES.map((c, i) => {
      const { mesh, bones } = rig(c.parts(), mat)
      mesh.castShadow = shadows; mesh.receiveShadow = true
      mesh.rotation.order = 'YXZ' // turn, then lean
      parent.add(mesh)
      return { c, mesh, bones, phase: (i * this.route.len) / COSTUMES.length, lag: 0, s: 0, yaw: 0, x: 0, z: 0, act: null, line: -1 }
    })
    this.hint.style.cssText = 'position:fixed;left:50%;bottom:36%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none;text-align:center'
    document.body.append(this.hint)
    addEventListener('keydown', (e) => {
      if (e.repeat) return
      if (e.code === 'KeyE' && this.eFree) this.start('hug')
      if (e.code === 'KeyH') this.start('shake')
    })
  }

  private start(kind: Kind) {
    const w = this.target
    if (!w || this.walkers.some((o) => o.act)) return
    const p = this.player.position, dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz) || 1
    w.act = { kind, t: 0, s: w.s, now: Date.now() / 1000, dx: dx / d, dz: dz / d, d }
    const lines = w.c[kind]
    let n: number; do n = Math.floor(Math.random() * lines.length); while (n === w.line && lines.length > 1)
    this.bubble.say(`${w.c.name}: ${lines[(w.line = n)]}`, 3.5)
    sfx.play(kind === 'hug' ? 'sit' : 'stand', { x: w.x, z: w.z }) // soft costume rustle
  }

  update(dt: number) {
    const pl = this.player, p = pl.position, now = Date.now() / 1000
    this.bubble.tick(dt)
    const onFoot = pl.active && !pl.riding && !pl.seated && !pl.flying && p.y < 4
    const fx = -Math.sin(this.camera.rotation.y), fz = -Math.cos(this.camera.rotation.y) // camera yaw convention (docs/architecture.md)
    let best: Walker | null = null, bd = REACH
    for (const w of this.walkers) {
      const a = w.act
      // shortcut: a hug pause is local (other players see the animator keep walking, then it catches up), sync it through net/ if players notice
      if (a) { a.t += dt; if (a.t >= DUR[a.kind]) { w.act = null; w.lag += now - a.now } } // stands still where it stopped
      else w.lag = Math.max(0, w.lag - dt * 0.4) // walks 1.4x until back on the shared schedule
      const s = (w.s = a ? a.s : (now - w.lag) * SPEED + w.phase), q = this.route.at(s), ahead = this.route.at(s + 0.3)
      const e = a ? ease(Math.max(0, Math.min(1, a.t / 0.35, (DUR[a.kind] - a.t) / 0.4))) : 0
      const step = a?.kind === 'hug' ? Math.max(0, a.d - HUG_D) * e : 0 // steps in towards you for the hug
      w.x = q.x + (a ? a.dx * step : 0); w.z = q.z + (a ? a.dz * step : 0)
      const dist = Math.hypot(p.x - w.x, p.z - w.z)
      const want = a ? Math.atan2(p.x - w.x, p.z - w.z) : Math.atan2(ahead.x - q.x, ahead.z - q.z)
      w.mesh.visible = dist < FAR
      if (!w.mesh.visible) { w.yaw = want; continue }
      w.yaw += wrap(want - w.yaw) * (1 - Math.exp(-6 * dt))
      if (!a && p.y < 4 && !pl.seated && dist < PERSONAL && dist > 1e-6) { p.x = w.x + ((p.x - w.x) / dist) * PERSONAL; p.z = w.z + ((p.z - w.z) / dist) * PERSONAL } // personal space
      if (onFoot && !a && dist < bd && (dist < 0.9 || (fx * (w.x - p.x) + fz * (w.z - p.z)) / dist > FACING)) { best = w; bd = dist }
      this.pose(w, s, e)
    }

    const busy = this.walkers.some((w) => w.act)
    if (busy) this.nudgeView(dt)
    this.target = busy ? null : best
    this.eFree = !this.items.aim && !this.others().some((o) => o.label !== 'На парковку') // that one is R (scooters.ts), not E
    const t = this.target
    this.act = t ? [{ label: `Обійняти ${t.c.acc}`, fire: () => this.start('hug') }, { label: 'Привітатися', fire: () => this.start('shake') }] : []
    const text = t && !isTouch ? (this.eFree ? `E — обійняти ${t.c.acc} · H — привітатися` : 'H — привітатися') : ''
    this.hint.style.display = text ? 'block' : 'none'
    if (this.hint.textContent !== text) this.hint.textContent = text
  }

  /** Walk cycle blended with the gesture (e = 0..1 how far into it). */
  private pose(w: Walker, s: number, e: number) {
    const [, armL, armR, legL, legR] = w.bones, a = w.act, m = w.mesh
    const ph = (2 * Math.PI * s) / STRIDE, sw = Math.sin(ph) * (1 - e)
    legL.rotation.x = 0.4 * sw; legR.rotation.x = -0.4 * sw
    armL.rotation.set(-0.35 * sw, 0, SPLAY); armR.rotation.set(0.35 * sw, 0, -SPLAY)
    m.position.set(w.x, 0.03 * Math.abs(Math.cos(ph)) * (1 - e), w.z)
    m.rotation.set(0, w.yaw, 0.035 * sw) // waddle
    if (!a) return
    if (a.kind === 'hug') {
      const wrapIn = 0.25 + 0.3 * Math.min(1, Math.max(0, (a.t - 0.35) / 0.4)) + 0.1 * Math.max(0, Math.sin((a.t - 0.75) * 8)) // reach out, close round you, squeeze
      armL.rotation.set(-1.35 * e, 0, SPLAY - (SPLAY + wrapIn) * e)
      armR.rotation.set(-1.35 * e, 0, -SPLAY + (SPLAY + wrapIn) * e)
      m.rotation.x = 0.14 * e
      if (a.t > 1.1 && a.t < 1.45) m.position.y += 0.12 * Math.sin(((a.t - 1.1) / 0.35) * Math.PI) // a happy hop
    } else {
      const shake = a.t > 0.45 && a.t < 1.7 ? 0.22 * Math.sin((a.t - 0.45) * 16) : 0
      armR.rotation.set(-1.1 * e + shake, 0, -SPLAY + 0.75 * e) // across to your right hand
      m.rotation.x = 0.06 * e + shake * 0.1
    }
  }

  /** Gently turn the player's view to the animator they are hugging / greeting. */
  private nudgeView(dt: number) {
    const w = this.walkers.find((o) => o.act)!, r = this.camera.rotation, p = this.player.position
    if (w.act!.t > 1) return
    const k = 1 - Math.exp(-4 * dt)
    r.y += wrap(Math.atan2(-(w.x - p.x), -(w.z - p.z)) - r.y) * k
    r.x += (-0.05 - r.x) * k
  }
}
