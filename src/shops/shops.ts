import * as THREE from 'three'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Colliders } from '../world/colliders'
import type { Front } from '../world/avenue/types'
import type { Items } from '../items/items'
import type { ShopItem } from './goods'
import type { ShopMenu } from './ui'
import type { ShopRoom } from './room'
import { Portal } from '../interiors/portal'
import { speechBubble } from '../bubble'
import { isTouch, type Action } from '../device'
import { sfx } from '../audio/sfx'
import { SHOPS, GOODS, cartPieces, cartTotal, describe, shopDoor, units, type Cart, type ShopSpec } from './spec'

const ARM_TIME = 1.6
const GREET: Record<ShopSpec['kind'], string> = {
  books: 'Доброго дня! Новинки лежать на столах, українські автори — на лівих полицях.',
  coffee: 'Доброго дня! Каву мелемо на місці. Що вам приготувати?',
  pharmacy: 'Доброго дня! Чим можу допомогти? Рецептурні — лише за рецептом.',
  cafe: 'Ласкаво просимо до Віденської кав\'ярні! Штрудель сьогодні ще теплий.',
}
const css = (c: string) => { const e = document.createElement('div'); e.style.cssText = c; return e }

interface Entry { spec: ShopSpec; portal: Portal<ShopRoom>; bought: ShopItem[]; armT: number }

/**
 * The enterable shops of проспект Свободи (spec.ts, their fronts are drawn by facades.ts): each has a Portal into its own room (rooms.ts, built on the first visit)
 * and a shopkeeper. E at the counter opens a small purchase screen; what you pay for appears on the counter as pickable Items (E / Q like everywhere).
 */
export class Shops implements System {
  menuOpen = false // main.ts keeps the start screen hidden while the purchase screen is up
  act: Action[] = []
  readonly entries: Entry[] = []
  private mods: Promise<[typeof import('./rooms'), typeof import('./goods')]> | null = null
  private ui: ShopMenu | null = null
  private bubble = speechBubble('#d9b45a')
  private zone: Entry | null = null
  private talking = false
  private hint = css('position:fixed;left:50%;bottom:24%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none')

  constructor(
    parent: THREE.Object3D, private colliders: Colliders, private player: Player, camera: THREE.Camera,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, fronts: Record<string, Front> | undefined, private shadows: boolean, private items: Items,
  ) {
    for (const spec of SHOPS) {
      const f = fronts?.[spec.front]; if (!f) continue
      const hw = spec.room.w / 2, hd = spec.room.d / 2
      const portal = new Portal<ShopRoom>(parent, player, camera, bounds, {
        door: shopDoor(f, spec), slot: spec.slot, half: { w: hw, d: hd }, arrive: { x: 0, z: hd - 1.4 }, exit: { x: 0, z: hd, nx: 0, nz: 1 }, tone: 'shop',
        build: async (o) => {
          const [rooms, goods] = await (this.mods ??= Promise.all([import('./rooms'), import('./goods')]))
          const room = rooms.buildRoom(spec, o, this.colliders, this.shadows)
          for (const s of room.shelf) this.items.add(new goods.ShopItem(GOODS[spec.kind].find((g) => g.id === s.id)!), o.x + s.x, s.y, o.z + s.z) // a few goods on tables and the counter: pick up, throw, break
          return room
        },
      })
      this.entries.push({ spec, portal, bought: [], armT: 0 })
    }
    document.body.append(this.hint)
    addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat && !this.menuOpen) this.act[0]?.fire() })
  }

  /** In a shop room (any). */
  get inside() { return this.entries.some((e) => e.portal.inside) }

  private async openMenu(e: Entry) {
    this.menuOpen = true
    document.exitPointerLock()
    this.player.touchActive = false // phone: the purchase screen takes over, the touch controls step aside
    this.ui ??= new (await import('./ui')).ShopMenu(() => this.closed())
    this.ui.open(e.spec.name, GOODS[e.spec.kind], (cart) => this.buy(e, cart))
  }

  private closed() {
    this.menuOpen = false
    if (isTouch) { this.player.touchActive = true; return }
    this.player.controls.lock() // refused after Esc in some browsers: then the start screen is the way back in
    setTimeout(() => { if (!this.player.controls.isLocked && !this.menuOpen) document.getElementById('overlay')!.style.display = 'grid' }, 400)
  }

  /** The shopkeeper puts what was paid for on the counter (the previous purchase goes back on the shelf) and says what it comes to. */
  private async buy(e: Entry, cart: Cart) {
    if (!units(cart)) return
    const goods = GOODS[e.spec.kind], room = e.portal.room!, c = room.counter, o = e.portal.origin, { ShopItem } = (await this.mods!)[1]
    for (const it of e.bought) this.items.remove(it)
    e.bought = cartPieces(goods, cart).map((g, i) => {
      const it = new ShopItem(g)
      this.items.add(it, o.x + c.x + ((i % 3) - 1) * 0.45, c.top + 0.03, o.z + c.z + 0.12 + Math.floor(i / 3) * 0.16)
      return it
    })
    e.armT = ARM_TIME; sfx.play('ding', { x: o.x + c.x, z: o.z + c.z })
    this.talking = true
    this.bubble.say(`${describe(goods, cart)}. Разом ${cartTotal(goods, cart)} ₴. Дякую, гарного дня!`)
  }

  private nearCounter(e: Entry) {
    const c = e.portal.room!.counter, l = e.portal.local()
    return Math.abs(l.x - c.x) < c.w / 2 + 0.3 && l.z > c.z + c.d / 2 + 0.1 && l.z < c.z + c.d / 2 + 1.7
  }

  update(dt: number) {
    this.bubble.tick(dt)
    let cur: Entry | null = null
    for (const e of this.entries) {
      if (e.portal.update()) cur = e
      const room = e.portal.room
      if (room) { room.clerk.arm.rotation.x = e.armT > 0 ? -1.35 * Math.sin((Math.PI * (ARM_TIME - e.armT)) / ARM_TIME) : 0; e.armT = Math.max(0, e.armT - dt) }
    }
    this.act = []
    let text = ''
    if (!Portal.active && this.talking) { this.talking = false; this.bubble.say('', 0.001); this.bubble.tick(1) } // the shopkeeper's words stay in the room
    const near = this.menuOpen ? this.zone : cur && this.nearCounter(cur) ? cur : null // the screen unlocks the pointer (portal.update() then says false): keep the zone, or the greeting would repeat over the receipt
    if (near !== this.zone) { this.zone = near; if (near) { this.bubble.say(GREET[near.spec.kind], 5); this.talking = true } }
    if (near && !this.menuOpen && !this.items.aim) { // E at an item on the counter takes the item (Items), not the purchase screen
      this.act = [{ label: 'Купити', fire: () => this.openMenu(near) }]
      text = isTouch ? '' : 'E — купити'
    }
    this.hint.style.display = text ? 'block' : 'none'
    if (this.hint.textContent !== text) this.hint.textContent = text
  }
}
