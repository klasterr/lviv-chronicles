import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { CityData } from './city'
import { parkingZones } from './parking'
import { part, box, T } from './props'
import { isTouch, type Action } from '../device'

const BOLT = 0x34d186
const MOUNT_DIST = 2.5 // metres from which E gets you on
const SEND_DIST = 8 // metres from which R sends a left scooter home
const RETURN_SPEED = 6 // m/s while a scooter drives itself to its parking slot

type State = 'parked' | 'ridden' | 'dropped' | 'returning'
/** by / t / w: who rides it and the last-writer-wins stamp of the shared state (src/net/sync.ts); unused when playing alone. */
interface Scooter { x: number; z: number; a: number; home: { x: number; z: number; a: number }; state: State; by: string; t: number; w: string }

/** Bolt-style kick scooter, nose along local +z, standing on the ground at the origin. */
function scooterGeometry() {
  const rotZ = new THREE.Matrix4().makeRotationZ(Math.PI / 2)
  const wheel = (z: number) => part(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 14), 0x15171a, T(0, 0.13, z).multiply(rotZ))
  const tilt = -0.18 // handlebar leans back towards the rider
  const stem = (len: number, colour: number, r: number) => part(new THREE.CylinderGeometry(r, r, len, 8), colour, T(0, 0.14, 0.43).multiply(new THREE.Matrix4().makeRotationX(tilt)).multiply(T(0, len / 2, 0)))
  return mergeGeometries([
    box(0.2, 0.05, 0.62, 0x1d1f22, 0, 0.14, -0.05), box(0.17, 0.012, 0.5, BOLT, 0, 0.172, -0.05), // deck with a green stripe
    wheel(-0.42), wheel(0.45), box(0.1, 0.02, 0.22, BOLT, 0, 0.27, 0.45), // wheels, green front fender
    stem(1.0, 0x1d1f22, 0.018), stem(0.32, BOLT, 0.03), // stem with a green battery sleeve
    box(0.52, 0.03, 0.03, 0x1d1f22, 0, 1.124, 0.251), box(0.05, 0.05, 0.06, BOLT, -0.26, 1.124, 0.251), box(0.05, 0.05, 0.06, BOLT, 0.26, 1.124, 0.251), // handlebar + grips
  ])!
}

/** Bolt e-scooters: two parkings, E to get on / off, R sends a left-behind scooter back to its slot, speedometer while riding. */
export class Scooters implements System {
  /** What the touch UI should offer right now. */
  act: Action[] = []
  /** Called after the player changed scooter `i` (got on, off, sent it home): the network stamps and shares it. */
  onChange: ((i: number) => void) | null = null
  readonly items: Scooter[] = []
  private ridden: Scooter | null = null
  private mesh: THREE.InstancedMesh
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private up = new THREE.Vector3(0, 1, 0)
  private one = new THREE.Vector3(1, 1, 1)
  private pos = new THREE.Vector3()
  private hint = this.el('position:fixed;left:50%;bottom:24%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none')
  private hud = this.el((isTouch ? 'position:fixed;right:120px;top:8px;padding:6px 14px;' : 'position:fixed;right:28px;bottom:26px;padding:10px 18px;') + 'border-radius:10px;background:#000b;color:#fff;font:system-ui,sans-serif;text-align:right;pointer-events:none;display:none;border-left:5px solid #34d186')
  private shown = ''
  private kmh = -1 // last speed written to the HUD (avoids rewriting the DOM every frame)

  constructor(data: CityData, parent: THREE.Object3D, private player: Player) {
    const zones = data.street ? parkingZones(data.street) : []
    for (const z of zones) for (const s of z.slots) this.items.push({ x: s.x, z: s.z, a: s.a, home: { ...s }, state: 'parked', by: '', t: 0, w: '' })

    // painted parking bays: one merged mesh for both
    const tex = new THREE.CanvasTexture(Object.assign(document.createElement('canvas'), { width: 128, height: 512 }))
    { const g = tex.image.getContext('2d')!
      g.fillStyle = 'rgba(52,209,134,0.45)'; g.fillRect(0, 0, 128, 512)
      g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 504)
      g.fillStyle = '#fff'; g.font = 'bold 56px system-ui'; g.textAlign = 'center'; g.translate(64, 256); g.rotate(-Math.PI / 2); g.fillText('BOLT', 0, 20)
      tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true }
    const bays = mergeGeometries(zones.map((z) => new THREE.PlaneGeometry(z.w, z.d).rotateX(-Math.PI / 2).rotateY(z.yaw).translate(z.x, 0.02, z.z)))
    if (bays) parent.add(new THREE.Mesh(bays, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -9, polygonOffsetUnits: -9 })))

    this.mesh = new THREE.InstancedMesh(scooterGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 }), Math.max(1, this.items.length))
    this.mesh.count = this.items.length
    this.mesh.frustumCulled = false // a dozen tiny instances at two spots: one cheap draw, no per-instance culling needed
    this.items.forEach((_, i) => this.pose(i))
    parent.add(this.mesh)

    addEventListener('keydown', (e) => {
      if (e.repeat || !player.active || player.seated) return
      if (e.code === 'KeyE') (player.riding ? this.dismount() : this.mount())
      if (e.code === 'KeyR' && !player.riding) this.send()
    })
  }

  private el(css: string) { const e = document.createElement('div'); e.style.cssText = css; document.body.append(e); return e }

  private pose(i: number) {
    const s = this.items[i]
    this.q.setFromAxisAngle(this.up, s.a + Math.PI) // model nose is local +z, heading is the opposite yaw convention
    this.mesh.setMatrixAt(i, this.m.compose(this.pos.set(s.x, 0, s.z), this.q, this.one))
    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Nearest scooter in one of the given states within `max` metres of the player. */
  private nearest(states: State[], max: number) {
    const p = this.player.position
    let best: Scooter | null = null, bd = max
    for (const s of this.items) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (states.includes(s.state) && d < bd) { best = s; bd = d } }
    return best
  }

  private mount() {
    const s = this.nearest(['parked', 'dropped'], MOUNT_DIST)
    if (!s || this.player.flying) return
    s.state = 'ridden'; this.ridden = s
    this.player.mount(s.x, s.z, s.a)
    this.onChange?.(this.items.indexOf(s))
  }

  private dismount() {
    const pose = this.player.dismount()
    if (!pose || !this.ridden) return
    Object.assign(this.ridden, pose, { state: 'dropped' as State }) // it stays exactly where you left it
    const i = this.items.indexOf(this.ridden)
    this.pose(i); this.ridden = null
    this.onChange?.(i)
  }

  private send() {
    const s = this.nearest(['dropped'], SEND_DIST)
    if (s) { s.state = 'returning'; this.onChange?.(this.items.indexOf(s)) }
  }

  /** Index of the scooter the player rides, -1 if none. */
  get riddenIndex() { return this.ridden ? this.items.indexOf(this.ridden) : -1 }

  /**
   * Take over shared state for scooter `i` (another player's change). Someone else got on the scooter we ride: we step off and leave it to them.
   * Returns false when it refuses: a park / send-home that raced with our ride; the caller then re-claims the ride so every player agrees.
   */
  apply(i: number, rec: Pick<Scooter, 'state' | 'x' | 'z' | 'a' | 'by' | 't' | 'w'>) {
    const s = this.items[i]
    if (s === this.ridden && rec.state !== 'ridden') return false
    if (s === this.ridden) { this.player.dismount(); this.ridden = null }
    Object.assign(s, rec); this.pose(i)
    return true
  }

  /** Another player rides scooter `i`: it goes where they go. */
  follow(i: number, x: number, z: number, a: number) {
    const s = this.items[i]
    if (s.state !== 'ridden' || s === this.ridden) return
    s.x = x; s.z = z; s.a = a; this.pose(i)
  }

  update(dt: number) {
    const p = this.player
    if (this.ridden) { // follows the player
      this.ridden.x = p.position.x; this.ridden.z = p.position.z; this.ridden.a = p.heading
      this.pose(this.items.indexOf(this.ridden))
    }
    this.items.forEach((s, i) => { // self-driving back to the slot (straight line: it ignores obstacles)
      if (s.state !== 'returning') return
      const dx = s.home.x - s.x, dz = s.home.z - s.z, d = Math.hypot(dx, dz), step = RETURN_SPEED * dt
      if (d <= step) Object.assign(s, s.home, { state: 'parked' as State })
      else { s.x += (dx / d) * step; s.z += (dz / d) * step; s.a = Math.atan2(-dx, -dz) }
      this.pose(i)
    })

    let text = ''
    this.act = []
    if (p.active && !p.seated) {
      if (p.riding) { text = 'E — злізти'; this.act = [{ label: 'Злізти', fire: () => this.dismount() }] }
      else {
        const mount = this.nearest(['parked', 'dropped'], MOUNT_DIST) && !p.flying, send = this.nearest(['dropped'], SEND_DIST)
        text = [mount ? 'E — сісти на самокат Bolt' : '', send ? 'R — відправити самокат на парковку' : ''].filter(Boolean).join('  ·  ')
        if (mount) this.act.push({ label: 'Сісти на самокат', fire: () => this.mount() })
        if (send) this.act.push({ label: 'На парковку', fire: () => this.send() })
      }
    }
    if (isTouch) text = '' // the buttons say it
    this.hint.style.display = text ? 'block' : 'none'
    if (text !== this.shown) { this.hint.textContent = text; this.shown = text }

    this.hud.style.display = p.riding ? 'block' : 'none'
    const kmh = p.riding ? Math.round(p.speedMs * 3.6) : -1
    if (kmh !== this.kmh) this.hud.innerHTML = kmh < 0 ? '' : `<span style="font-size:46px;font-weight:700">${kmh}</span> <span style="font-size:16px;opacity:.8">км/год</span><br><span style="font-size:12px;color:#34d186;letter-spacing:2px">BOLT · ${isTouch ? 'джойстик: вперед — газ, назад — гальмо' : 'W газ · S гальмо · A/D поворот'}</span>`
    this.kmh = kmh
  }
}
