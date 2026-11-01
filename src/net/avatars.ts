import * as THREE from 'three'
import { buildFigure } from '../interiors/figure'
import { box } from '../world/props'
import { Item } from '../items/item'
import type { PoseMsg } from './sync'

const SHIRTS = [0x2f6fb5, 0xc0392b, 0x27ae60, 0xe1a12a, 0x8e44ad, 0x16a085, 0xd35400, 0x34495e, 0xe84393, 0x6d4c41]
const HAIR = [0x2b1a10, 0x4a2f1c, 0x7a5230, 0xc9a25a, 0x1a1a1a]
// feet height below the camera of the sender, per mode (walk, seated, scooter, flying): their eye height minus how high the figure stands
const FEET = [1.7, 1.2 + 0.45, 1.8 - 0.17, 1.7] // shortcut: a seated figure is just lowered into the bench (no bent legs); add a sitting pose if it bothers
const HAND = [new THREE.Vector3(0.24, 0.85, 0.12), new THREE.Vector3(-0.24, 0.85, 0.12)]

/** A small cube in the colour of what someone carries or throws. shortcut: not the real model (that needs an item factory by kind, e.g. makeItem(key)). */
export function standIn(radius: number, colours: number[]) {
  const s = Math.min(0.3, radius * 1.4)
  return new Item('', box(s, s, s, colours[0], 0, s / 2, 0), { radius, fragments: colours })
}

function hash(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) }

function label(text: string) {
  const c = document.createElement('canvas'), g = c.getContext('2d')!
  g.font = 'bold 40px system-ui,sans-serif'
  c.width = Math.ceil(g.measureText(text).width) + 32; c.height = 56
  g.font = 'bold 40px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = '#0009'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 14); g.fill()
  g.fillStyle = '#fff'; g.fillText(text, c.width / 2, c.height / 2 + 2)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }))
  s.scale.set(0.3 * c.width / c.height, 0.3, 1); s.position.y = 2.05
  return s
}

interface Avatar { root: THREE.Group; tag: THREE.Sprite | null; name: string; pose: PoseMsg | null; yaw: number; heldKey: string; held: Item[] }

/** Other players: a figure per peer that glides towards the last pose it sent, its name above its head. */
export class Avatars {
  /** userData.keep: interiors/portal.ts leaves it on indoors, so players in the same room still see each other. */
  readonly group = new THREE.Group()
  readonly list = new Map<string, Avatar>()
  private v = new THREE.Vector3()

  constructor(parent: THREE.Object3D, private shadows: boolean) { this.group.userData.keep = true; parent.add(this.group) }

  private get(id: string) {
    let a = this.list.get(id)
    if (!a) {
      const h = hash(id), fig = buildFigure({ shirt: SHIRTS[h % SHIRTS.length], hair: HAIR[(h >> 4) % HAIR.length], long: (h >> 8) % 3 === 0 }, this.shadows)
      a = { root: fig.group, tag: null, name: '', pose: null, yaw: 0, heldKey: '', held: [] }
      a.root.visible = false // until the first pose arrives
      this.group.add(a.root); this.list.set(id, a)
    }
    return a
  }

  setName(id: string, name: string) {
    const a = this.get(id)
    if (a.name === name) return
    if (a.tag) { a.tag.material.map?.dispose(); a.tag.material.dispose(); a.tag.removeFromParent() }
    a.name = name; a.tag = label(name); a.root.add(a.tag)
  }

  setPose(id: string, p: PoseMsg) {
    const a = this.get(id), first = !a.pose
    a.pose = p
    if (first) { a.root.position.set(p.p[0], p.p[1] - FEET[p.m], p.p[2]); a.yaw = p.p[3]; a.root.visible = true }
    const key = JSON.stringify(p.h)
    if (key !== a.heldKey) { // what they carry changed: rebuild the stand-ins
      for (const it of a.held) it.mesh.removeFromParent()
      a.held = p.h.map((h) => standIn(h[0], h.slice(1)))
      a.held.forEach((it, i) => { it.mesh.position.copy(HAND[i]); a.root.add(it.mesh) })
      a.heldKey = key
    }
  }

  remove(id: string) {
    const a = this.list.get(id); if (!a) return
    a.root.removeFromParent(); this.list.delete(id)
    a.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose() }) // every figure and stand-in has its own geometry
    a.tag?.material.map?.dispose()
  }

  /** Id of a seated player within r metres of (x, z), if any. */
  seatedNear(x: number, z: number, r: number) {
    for (const [id, a] of this.list) if (a.pose?.m === 1 && Math.hypot(a.pose.p[0] - x, a.pose.p[2] - z) < r) return id
    return null
  }

  /** Current (smoothed) position and heading of a player; heading in the camera yaw convention, like Player.heading. */
  at(id: string) { const a = this.list.get(id); return a?.pose ? { x: a.root.position.x, z: a.root.position.z, a: a.yaw } : null }

  update(dt: number) {
    const k = 1 - Math.exp(-12 * dt)
    for (const a of this.list.values()) {
      const p = a.pose; if (!p) continue
      a.root.position.lerp(this.v.set(p.p[0], p.p[1] - FEET[p.m], p.p[2]), k)
      a.yaw += (((p.p[3] - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k
      a.root.rotation.y = a.yaw + Math.PI // the figure faces +z, camera yaw 0 looks along -z
    }
  }
}
