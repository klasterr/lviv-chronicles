import * as THREE from 'three'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Colliders } from '../world/colliders'
import { Portal, type Door } from '../interiors/portal'
import { isTouch, type Action } from '../device'
import type { MenuUI } from './ui'
import { L } from './layout'
import type { Items } from '../items/items'
import type { Tray } from '../items/item'
import { describe, total, type Cart } from './menu'
import { sfx } from '../audio/sfx'

const ARM_TIME = 2 // seconds of the cashier's hand-over gesture

const css = (c: string) => { const e = document.createElement('div'); e.style.cssText = c; return e }

/**
 * Walk into the McDonald's door (like the interiors in old GTA) and you are moved into a separate, lazily built room far outside the city;
 * walk into its door to come back. Inside: a cashier who hands out orders (E at the counter) and two self-service kiosks (E; pick the order up at the counter).
 */
export class Restaurant implements System {
  menuOpen = false // main.ts keeps the start screen hidden while the menu is up
  act: Action[] = [] // what the touch UI should offer right now
  readonly portal: Portal<ReturnType<typeof import('./interior').buildInterior>>
  private mod: typeof import('./interior') | null = null // loaded on the first visit (keeps the room's code out of the start-up bundle)
  private mc: typeof import('./mc-items') | null = null
  private ui: MenuUI | null = null
  private pending: { n: number; cart: Cart } | null = null // ordered at a kiosk, waiting at the counter
  private tray: Tray | null = null // the last order, while nobody has taken it
  private orders = 41
  private armT = 0
  private bubbleT = 0
  private hint = css('position:fixed;left:50%;bottom:24%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none')
  private bubble = css('position:fixed;left:50%;top:12%;transform:translateX(-50%);max-width:min(560px,90vw);padding:10px 18px;border-radius:12px;background:#fffe;color:#222;font:17px system-ui,sans-serif;pointer-events:none;display:none;border:3px solid #c8281e')

  constructor(
    parent: THREE.Object3D, private colliders: Colliders, private player: Player, camera: THREE.Camera,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, door: Door, private shadows: boolean, private items: Items,
  ) {
    this.portal = new Portal(parent, player, camera, bounds, {
      door, slot: 0, half: { w: L.hw, d: L.hd }, arrive: L.arrive, exit: { ...L.door, nx: 0, nz: 1 }, tone: 'restaurant',
      build: async (o) => {
        ;[this.mod, this.mc] = await Promise.all([this.mod ?? import('./interior'), this.mc ?? import('./mc-items')])
        return this.mod.buildInterior(o.x, o.z, this.colliders, this.shadows)
      },
    })
    document.body.append(this.hint, this.bubble)
    addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat && !this.menuOpen) this.act[0]?.fire() })
  }

  /** In the room (read by audio/ to pick the room tone and the footsteps). */
  get inside() { return this.portal.inside }

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
    this.items.add(this.tray, this.portal.origin.x + L.tray.x, 1.11, this.portal.origin.z + L.tray.z)
    this.armT = ARM_TIME; sfx.play('ding', { x: this.portal.origin.x + L.cashier.x, z: this.portal.origin.z + L.counterZ })
    this.say(`Ваше замовлення №${n}: ${describe(cart)}. Разом ${total(cart)} ₴. Смачного!`)
  }

  private atCashier(lx: number, lz: number) { return Math.abs(lx - L.cashier.x) < 2 && lz > L.counterZ + 0.5 && lz < 1 }
  private atKiosk(lx: number, lz: number) { return L.kiosks.some((x) => Math.hypot(lx - x, lz - 6.9) < 1.3) }

  update(dt: number) {
    const free = this.portal.update()
    this.act = []
    let text = ''
    if (this.bubbleT > 0 && (this.bubbleT -= dt) <= 0) this.bubble.style.display = 'none'
    if (!this.portal.inside) this.bubble.style.display = 'none' // the cashier's words stay in the room
    const room = this.portal.room
    if (room) {
      const a = this.armT > 0 ? Math.sin((Math.PI * (ARM_TIME - this.armT)) / ARM_TIME) : 0
      room.cashier.arm.rotation.x = -1.35 * a
      this.armT = Math.max(0, this.armT - dt)
    }
    if (free && !this.menuOpen) { // on the ground floor: order at the counter or a kiosk
      const { x: lx, z: lz } = this.portal.local()
      if (this.atCashier(lx, lz)) {
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
    this.hint.style.display = text ? 'block' : 'none'
    if (this.hint.textContent !== text) this.hint.textContent = text
  }
}
