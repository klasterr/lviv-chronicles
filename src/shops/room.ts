import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Colliders } from '../world/colliders'
import { box, cyl, part, T } from '../world/props'
import { buildFigure, type Look } from '../interiors/figure'

export const WINDOW = 0xc4e3f7
export const AW = 1024, AH = 512

/** Where a shopkeeper stands and where customers talk to him: an axis-aligned counter (centre, size, top height), customers on the +z side. */
export interface Counter { x: number; z: number; w: number; d: number; top: number }
export interface Spawn { id: string; x: number; y: number; z: number }
export interface ShopRoom { group: THREE.Group; clerk: ReturnType<typeof buildFigure>; counter: Counter; shelf: Spawn[] }

/** Collects the geometry of one room (solid / glowing / textured) and its colliders; every coordinate is room-local (+x east, +z south, origin = centre of the floor). */
export class Kit {
  solid: THREE.BufferGeometry[] = []; glow: THREE.BufferGeometry[] = []; lit: THREE.BufferGeometry[] = []
  shelf: Spawn[] = []
  readonly atlas = document.createElement('canvas')
  readonly g = this.atlas.getContext('2d')!
  private rng = 7
  constructor(readonly ox: number, readonly oz: number, private colliders: Colliders, readonly hw: number, readonly hd: number, readonly H: number, private shadows: boolean) { this.atlas.width = AW; this.atlas.height = AH }

  rnd() { this.rng = (this.rng * 16807) % 2147483647; return this.rng / 2147483647 }
  b = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => { this.solid.push(box(w, h, d, c, x, y, z)) }
  g_ = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => { this.glow.push(box(w, h, d, c, x, y, z)) }
  cy = (r0: number, r1: number, h: number, c: number, x: number, y: number, z: number, seg = 10) => { this.solid.push(cyl(r0, r1, h, c, x, y, z, seg)) }
  sph = (r: number, c: number, x: number, y: number, z: number, glow = false) => { (glow ? this.glow : this.solid).push(part(new THREE.SphereGeometry(r, 10, 8), c, T(x, y, z))) }
  /** Collider box (half sizes) at room position, optional yaw. */
  rect(x: number, z: number, hw: number, hd: number, top: number, yaw = 0) { this.colliders.addRect(this.ox + x, this.oz + z, hw, hd, yaw, top) }
  wall(ax: number, az: number, bx: number, bz: number) { this.colliders.add(this.ox + ax, this.oz + az, this.ox + bx, this.oz + bz) }
  bench(x: number, z: number, yaw: number, hw: number, hd: number, h: number) { this.colliders.addBench(this.ox + x, this.oz + z, yaw, hw, hd, h) }

  /** Everything drawn by `fn` (in local coordinates of an object at (x, z) turned by yaw, +z = the way it faces) is moved into place. */
  at(x: number, z: number, yaw: number, fn: () => void) {
    const n = [this.solid.length, this.glow.length, this.lit.length], m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z)
    fn()
    this.solid.slice(n[0]).forEach((q) => q.applyMatrix4(m)); this.glow.slice(n[1]).forEach((q) => q.applyMatrix4(m)); this.lit.slice(n[2]).forEach((q) => q.applyMatrix4(m))
  }

  /** Atlas rectangle (px) as a quad of w x h metres facing +z at the origin (uv per THREE's flipped canvas). */
  quad(w: number, h: number, [x, y, pw, ph]: number[]) {
    const q = new THREE.PlaneGeometry(w, h), uv = q.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * pw) / AW, 1 - (y + (1 - uv.getY(i)) * ph) / AH)
    return q
  }
  /** Lit sign from an atlas rectangle: w x h metres, centre (x, y, z), facing yaw (0 = +z). */
  sign(w: number, h: number, r: number[], x: number, y: number, z: number, yaw = 0) { this.lit.push(this.quad(w, h, r).rotateY(yaw).translate(x, y, z)) }

  /** Four walls with a door gap (x -0.8..0.8) in the south wall, window panes either side of it, ceiling and the ring that marks the way out. */
  shell(c: { wall: number; plinth: number; trim: number; ceil: number; plinthH?: number }) {
    const { hw, hd, H } = this, ph = c.plinthH ?? 1
    this.b(2 * hw + 0.6, H, 0.3, c.wall, 0, H / 2, -hd - 0.15); this.b(2 * hw + 0.6, ph, 0.34, c.plinth, 0, ph / 2, -hd - 0.15)
    for (const s of [-1, 1]) { this.b(0.3, H, 2 * hd, c.wall, s * (hw + 0.15), H / 2, 0); this.b(0.34, ph, 2 * hd, c.plinth, s * (hw + 0.15), ph / 2, 0) }
    for (const s of [-1, 1]) { this.b(hw - 0.8, H, 0.3, c.wall, s * (hw + 0.8) / 2, H / 2, hd + 0.15); this.b(hw - 0.8, ph, 0.34, c.plinth, s * (hw + 0.8) / 2, ph / 2, hd + 0.15) }
    this.b(1.6, H - 2.5, 0.3, c.wall, 0, (H + 2.5) / 2, hd + 0.15)
    this.b(0.1, 2.5, 0.36, c.trim, -0.85, 1.25, hd + 0.15); this.b(0.1, 2.5, 0.36, c.trim, 0.85, 1.25, hd + 0.15); this.b(1.8, 0.1, 0.36, c.trim, 0, 2.55, hd + 0.15)
    this.g_(1.6, 2.45, 0.05, 0xd8ecff, 0, 1.225, hd + 0.02); this.b(0.05, 2.45, 0.07, c.trim, 0, 1.225, hd - 0.02) // the door itself: a bright pane
    this.g_(2 * hw + 0.6, 0.3, 2 * hd + 0.6, new THREE.Color(c.ceil).multiplyScalar(0.8).getHex(), 0, H + 0.15, 0) // unlit ceiling: the sky light hardly reaches its underside
    this.wall(-hw, hd, hw, hd); this.wall(hw, -hd, hw, hd); this.wall(-hw, -hd, -hw, hd); this.wall(-hw, -hd, hw, -hd)
    const pane = (x: number, z: number, axis: 'x' | 'z', len: number, y: number, h: number) => { // panes stay bright: nothing is outside this room
      if (axis === 'z') { this.b(len + 0.12, h + 0.12, 0.05, c.trim, x, y, z - 0.025); this.g_(len, h, 0.04, WINDOW, x, y, z - 0.04) }
      else { const s = Math.sign(x); this.b(0.05, h + 0.12, len + 0.12, c.trim, x - s * 0.025, y, z); this.g_(0.04, h, len, WINDOW, x - s * 0.04, y, z) }
    }
    for (const x of [-hw / 2 - 0.4, hw / 2 + 0.4]) pane(x, hd, 'z', Math.min(2.2, hw - 1.6), 1.7, 1.5)
    return pane
  }

  /** Straight run of shelf (centre (x, z), facing yaw): frame, `rows` boards, goods from `fill(local x0, x1, board top y)`. Collider included. */
  shelves(x: number, z: number, yaw: number, len: number, o: { h?: number; rows?: number; depth?: number; wood: number; fill: (k: Kit, x0: number, x1: number, y: number, depth: number) => void }) {
    const h = o.h ?? 2.3, rows = o.rows ?? 5, d = o.depth ?? 0.34
    this.at(x, z, yaw, () => {
      this.b(len, h, 0.03, o.wood, 0, h / 2, -d / 2); this.b(0.04, h, d, o.wood, -len / 2, h / 2, 0); this.b(0.04, h, d, o.wood, len / 2, h / 2, 0); this.b(len, 0.05, d, o.wood, 0, h, 0)
      for (let r = 0; r < rows; r++) { const y = 0.18 + r * ((h - 0.3) / rows); this.b(len, 0.03, d, o.wood, 0, y, 0); o.fill(this, -len / 2 + 0.03, len / 2 - 0.03, y + 0.015, d) }
    })
    const c = Math.cos(yaw), s = Math.sin(yaw) // collider: local z -> (s, c)
    this.rect(x + s * d * 0.1, z + c * d * 0.1, (Math.abs(c) * len) / 2 + (Math.abs(s) * d) / 2, (Math.abs(s) * len) / 2 + (Math.abs(c) * d) / 2, h)
  }

  /** The finished room: merged solid mesh (brighter than outdoors: the room only gets sky light), glow mesh, lit atlas mesh, floor, the exit ring and the shopkeeper. */
  finish(floor: THREE.Texture, clerk: Look, counter: Counter): ShopRoom {
    const shadows = this.shadows
    const group = new THREE.Group()
    const mesh = (geo: THREE.BufferGeometry[], mat: THREE.Material, cast = false) => { if (!geo.length) return; const m = new THREE.Mesh(mergeGeometries(geo)!, mat); m.castShadow = cast && shadows; m.receiveShadow = shadows; group.add(m) }
    mesh(this.solid, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, color: new THREE.Color().setScalar(1.6) }), true)
    mesh(this.glow, new THREE.MeshBasicMaterial({ vertexColors: true }))
    const tex = new THREE.CanvasTexture(this.atlas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8
    mesh(this.lit, new THREE.MeshBasicMaterial({ map: tex }))
    floor.repeat.set((2 * this.hw) / 1.2, (2 * this.hd) / 1.2)
    group.add(new THREE.Mesh(new THREE.PlaneGeometry(2 * this.hw, 2 * this.hd).rotateX(-Math.PI / 2).translate(0, 0.02, 0), new THREE.MeshStandardMaterial({ map: floor, roughness: 0.6 })))
    group.add(new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2).translate(0, 0.05, this.hd - 0.65), new THREE.MeshBasicMaterial({ color: 0xffc72c, transparent: true, opacity: 0.85, depthWrite: false })))
    const fig = buildFigure(clerk, shadows); fig.group.position.set(counter.x - 0.5, 0, counter.z - counter.d / 2 - 0.5); group.add(fig.group)
    this.colliders.addBox(this.ox + counter.x - 0.5, this.oz + counter.z - counter.d / 2 - 0.5, 0.25, 1.8)
    group.position.set(this.ox, 0, this.oz)
    return { group, clerk: fig, counter, shelf: this.shelf }
  }
}

/** A tiled 128 px floor texture; `draw` paints one tile. */
export function floorTex(draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = c.height = 128
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8
  return t
}

/** Spine colours for rows of books. */
export const SPINES = [0x8a2a2a, 0x2f5d8a, 0xd8b64a, 0x3f7a4f, 0xe8e0d0, 0x5a3a6a, 0xc8612a, 0x2a2a30, 0x6a8a9a]
