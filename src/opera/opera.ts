import * as THREE from 'three'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Colliders } from '../world/colliders'
import type { CityData } from '../world/city'
import type { Items } from '../items/items'
import { Portal } from '../interiors/portal'
import { isTouch, type Action } from '../device'
import { speechBubble } from '../bubble'
import { operaFront } from '../world/landmarks'
import { sfx } from '../audio/sfx'
import { OP, addOperaColliders } from './layout'

const OPERA_ID = 'way/459807007'
const NEAR = 3.4 // the usher greets you from here; E talks to him from closer
const TALK = 2.8
const WORDS = [
  'Добрий вечір! Вітаємо у Львівській опері. Квиток, будь ласка… дякую, проходьте.',
  'Сьогодні «Лускунчик». Партер — просто прямо, яруси — сходами нагору.',
  'Гардероб ліворуч, а касу ви вже бачили при вході. Приємного вечора!',
  'Зал збудовано 1900 року, у ньому тисяча місць і чотири яруси. Подивіться на люстру!',
]

/**
 * The Lviv Opera and Ballet Theatre: walk into its main entrance (the arch in the middle of the photo facade) and you are moved into a separate room far outside the city (slot 7, see interiors/portal.ts).
 * Inside: vestibule with box offices and cloakroom, a foyer with two marble flights up to the upper foyer, the horseshoe auditorium (parterre seats you can sit on, a tier with boxes you can walk to), the stage.
 * An usher greets you near his desk (E: talk) and a few programme leaflets lie on it (E: take, Q: throw).
 */
export class Opera implements System {
  act: Action[] = []
  readonly portal: Portal<ReturnType<typeof import('./interior').buildHall>>
  private bubble = speechBubble('#b8860b')
  private hint = document.createElement('div')
  private seen = false  // greeted since walking up
  private talked = 0
  private armT = 0
  private inHall = false

  static make(parent: THREE.Object3D, colliders: Colliders, player: Player, camera: THREE.Camera, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, data: CityData, shadows: boolean, items: Items) {
    const b = data.buildings.find((x) => x.id === OPERA_ID)
    return b ? new Opera(parent, colliders, player, camera, bounds, operaFront(b.r[0]).door, shadows, items) : null
  }

  constructor(parent: THREE.Object3D, colliders: Colliders, private player: Player, camera: THREE.Camera, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, door: { x: number; z: number; nx: number; nz: number }, shadows: boolean, private items: Items) {
    this.portal = new Portal(parent, player, camera, bounds, {
      door, slot: 7, half: { w: OP.hw, d: OP.hd }, arrive: OP.arrive, exit: { ...OP.door, nx: 0, nz: 1 }, tone: 'hall',
      build: async (o) => { // the room, its colliders and the leaflets exist only after the first visit
        const [{ buildHall }, { Programme }] = await Promise.all([import('./interior'), import('./usher')])
        addOperaColliders(colliders, o.x, o.z)
        for (const dx of [-0.45, 0, 0.45]) this.items.add(new Programme(), o.x + OP.desk.x + dx, 0.995, o.z + OP.desk.z + 0.05)
        return buildHall(o.x, o.z, shadows)
      },
    })
    this.hint.style.cssText = 'position:fixed;left:50%;bottom:24%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none'
    document.body.append(this.hint)
    addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat) this.act[0]?.fire() })
  }

  /** In the room (read by audio/ if it wants to). */
  get inside() { return this.portal.inside }

  private greet(text = WORDS[this.talked++ % WORDS.length]) { this.bubble.say(text, 6); this.armT = 1.6 }

  update(dt: number) {
    const free = this.portal.update()
    this.act = []
    this.bubble.tick(dt)
    let text = ''
    const room = this.portal.room
    if (!this.portal.inside) {
      if (this.seen || this.inHall) { this.seen = this.inHall = false; this.bubble.say(' ', 0.001); this.bubble.tick(1) } // the usher's words stay in the room
    } else if (room) {
      const a = this.armT > 0 ? Math.sin((Math.PI * Math.min(1, this.armT / 1.6)) ) : 0
      room.usher.arm.rotation.z = 2.6 * a // a raised hand
      this.armT = Math.max(0, this.armT - dt)
      const { x: lx, z: lz } = this.portal.local(), d = Math.hypot(lx - OP.usher.x, lz - OP.usher.z)
      if (free) {
        if (d < NEAR && !this.seen) { this.seen = true; this.greet() } else if (d > NEAR + 2) this.seen = false
        if (d < TALK && !this.items.aim) { // E at a leaflet takes it (Items), not a chat
          this.act = [{ label: 'Привітатися', fire: () => this.greet() }]
          text = isTouch ? '' : 'E — поговорити з білетером'
        }
      }
      if (lz < 4 && this.player.position.y < 12) { // in the auditorium or on the tier: the orchestra is tuning up, once per visit to the hall
        if (!this.inHall) { this.inHall = true; sfx.play('tune', undefined, 0.5) }
      } else if (lz > 9) this.inHall = false
    }
    this.hint.style.display = text ? 'block' : 'none'
    if (this.hint.textContent !== text) this.hint.textContent = text
  }
}
