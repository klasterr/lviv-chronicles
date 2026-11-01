import * as THREE from 'three'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Colliders } from '../world/colliders'
import { isTouch, type Action } from '../device'
import type { MenuUI } from './ui'
import { L } from './layout'
import type { Items } from '../items/items'
import type { Tray } from '../items/item'
import { describe, total, type Cart } from './menu'
import { sfx } from '../audio/sfx'

const ENTER_R = 0.9 // metres from the door at which walking into it counts
const ARM_TIME = 2 // seconds of the cashier's hand-over gesture

export interface Door { x: number; z: number; nx: number; nz: number } // street door in the wall; (nx, nz) = outward normal

const css = (c: string) => { const e = document.createElement('div'); e.style.cssText = c; return e }

/**
 * Walk into the McDonald's door (like the interiors in old GTA) and you are moved into a separate, lazily built room far outside the city;
 * walk into its door to come back. Inside: a cashier who hands out orders (E at the counter) and two self-service kiosks (E; pick the order up at the counter).
 */
export class Restaurant implements System {
  menuOpen = false // main.ts keeps the start screen hidden while the menu is up
  act: Action[] = [] // what the touch UI should offer right now
  inside = false // in the room (read-only for others: audio/ picks the room tone and footsteps by it)
  private busy = false // door fade in progress
  private mod: typeof import('./interior') | null = null // loaded on the first visit (keeps the room's code out of the start-up bundle)
  private mc: typeof import('./mc-items') | null = null
  private room: ReturnType<typeof import('./interior').buildInterior> | null = null
  private origin: { x: number; z: number }
  private saved: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null
  private ui: MenuUI | null = null
  private pending: { n: number; cart: Cart } | null = null // ordered at a kiosk, waiting at the counter
  private tray: Tray | null = null // the last order, while nobody has taken it
  private orders = 41
  private armT = 0
  private bubbleT = 0
  private marker: THREE.Mesh
  private dir = new THREE.Vector3()
  private fade = css('position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .25s;z-index:15')
  private hint = css('position:fixed;left:50%;bottom:24%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none')
  private bubble = css('position:fixed;left:50%;top:12%;transform:translateX(-50%);max-width:min(560px,90vw);padding:10px 18px;border-radius:12px;background:#fffe;color:#222;font:17px system-ui,sans-serif;pointer-events:none;display:none;border:3px solid #c8281e')

  constructor(
    private parent: THREE.Object3D, private colliders: Colliders, private player: Player, private camera: THREE.Camera,
    private bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, private door: Door, private shadows: boolean, private items: Items,
  ) {
    this.origin = { x: bounds.maxX + 150, z: bounds.maxZ + 150 } // empty ground beyond the city (the ground plane is 4 km wide)
    document.body.append(this.fade, this.hint, this.bubble)
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc72c, transparent: true, opacity: 0.85, depthWrite: false }))
    this.marker.position.set(door.x + door.nx * 0.6, 0.06, door.z + door.nz * 0.6)
    parent.add(this.marker)
    addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat && !this.menuOpen) this.act[0]?.fire() })
  }

  private facing(dx: number, dz: number) { this.camera.getWorldDirection(this.dir); return this.dir.x * dx + this.dir.z * dz > 0.3 }

  private go(to: () => void | Promise<void>) {
    this.busy = true; this.fade.style.opacity = '1'; sfx.play('chime') // door chime, both ways
    setTimeout(async () => { await to(); this.fade.style.opacity = '0'; setTimeout(() => (this.busy = false), 300) }, 280)
  }

  private enter() {
    this.go(async () => {
      ;[this.mod, this.mc] = await Promise.all([this.mod ?? import('./interior'), this.mc ?? import('./mc-items')])
      if (!this.room) { // first visit: build the room (walls, furniture and floors are registered with the colliders)
        this.room = this.mod.buildInterior(this.origin.x, this.origin.z, this.colliders, this.shadows)
        this.parent.add(this.room.group)
      }
      this.room.group.visible = true; this.marker.visible = false
      this.saved = { ...this.bounds }
      Object.assign(this.bounds, { minX: this.origin.x - L.hw, maxX: this.origin.x + L.hw, minZ: this.origin.z - L.hd, maxZ: this.origin.z + L.hd })
      this.player.teleport(this.origin.x + L.arrive.x, this.origin.z + L.arrive.z, 0)
      this.inside = true
    })
  }

  private leave() {
    this.go(() => {
      Object.assign(this.bounds, this.saved)
      this.room!.group.visible = false; this.marker.visible = true
      this.player.teleport(this.door.x + this.door.nx * 1.4, this.door.z + this.door.nz * 1.4, Math.atan2(-this.door.nx, -this.door.nz))
      this.inside = false; this.bubble.style.display = 'none'; this.bubbleT = 0
    })
  }

  private say(text: string) { this.bubble.textContent = text; this.bubble.style.display = 'block'; this.bubbleT = 7 }

  private async openMenu(title: string, done: (cart: Cart) => void) {
    this.menuOpen = true
    document.exitPointerLock()
    this.player.touchActive = false // phone: the order screen takes over, the touch controls step aside
    this.ui ??= new (await import('./ui')).MenuUI(() => this.closed())
    this.ui.open(title, done)
  }

  private closed() {
    this.menuOpen = false
    if (isTouch) { this.player.touchActive = true; return }
    this.player.controls.lock() // refused after Esc in some browsers: then the start screen is the way back in
    setTimeout(() => { if (!this.player.controls.isLocked && !this.menuOpen) document.getElementById('overlay')!.style.display = 'grid' }, 400)
  }

  /** The cashier puts the order on the counter as a tray of separate items (taking the old one away) and says what it is. */
  private handOver(n: number, cart: Cart) {
    if (this.tray) this.items.remove(this.tray)
    this.tray = this.mc!.orderTray(cart)
    this.items.add(this.tray, this.origin.x + L.tray.x, 1.11, this.origin.z + L.tray.z)
    this.armT = ARM_TIME; sfx.play('ding', { x: this.origin.x + L.cashier.x, z: this.origin.z + L.counterZ })
    this.say(`Ваше замовлення №${n}: ${describe(cart)}. Разом ${total(cart)} ₴. Смачного!`)
  }

  private atCashier(lx: number, lz: number) { return Math.abs(lx - L.cashier.x) < 2 && lz > L.counterZ + 0.5 && lz < 1 }
  private atKiosk(lx: number, lz: number) { return L.kiosks.some((x) => Math.hypot(lx - x, lz - 6.9) < 1.3) }

  update(dt: number) {
    const pos = this.player.position, p = this.player
    this.marker.scale.setScalar(1 + 0.12 * Math.sin(performance.now() / 250))
    this.act = []
    let text = ''
    if (this.bubbleT > 0 && (this.bubbleT -= dt) <= 0) this.bubble.style.display = 'none'
    if (this.room) {
      const a = this.armT > 0 ? Math.sin((Math.PI * (ARM_TIME - this.armT)) / ARM_TIME) : 0
      this.room.cashier.arm.rotation.x = -1.35 * a
      this.armT = Math.max(0, this.armT - dt)
    }
    if (p.active && !this.busy && !this.menuOpen && !p.riding && !p.seated) {
      if (!this.inside) {
        const d = this.door
        if (pos.y < 4 && Math.hypot(pos.x - d.x, pos.z - d.z) < ENTER_R && this.facing(-d.nx, -d.nz)) this.enter()
      } else if (pos.y < 3.5) { // ground floor: leave through the door, order at the counter or a kiosk
        const lx = pos.x - this.origin.x, lz = pos.z - this.origin.z
        if (Math.hypot(lx - L.door.x, lz - L.door.z) < ENTER_R && this.facing(0, 1)) this.leave()
        else if (this.atCashier(lx, lz)) {
          const pend = this.pending
          const label = pend ? `Забрати замовлення №${pend.n}` : 'Зробити замовлення'
          if (!this.items.aim) { // E at an item on the counter takes the item (Items), not the order
            this.act = [{ label, fire: () => pend ? (this.pending = null, this.handOver(pend.n, pend.cart)) : this.openMenu('Каса — що замовляєте?', (c) => this.handOver(++this.orders, c)) }]
            text = isTouch ? '' : 'E — ' + label.toLowerCase()
          }
        } else if (this.atKiosk(lx, lz)) {
          this.act = [{ label: 'Кіоск', fire: () => this.openMenu('Кіоск самообслуговування', (c) => {
            const n = ++this.orders; this.pending = { n, cart: c }
            this.say(`Оплачено ${total(c)} ₴. Ваше замовлення №${n}: ${describe(c)}. Заберіть його на касі.`)
          }) }]
          text = isTouch ? '' : 'E — замовити на кіоску'
        }
      }
    }
    this.hint.style.display = text ? 'block' : 'none'
    if (this.hint.textContent !== text) this.hint.textContent = text
  }
}
