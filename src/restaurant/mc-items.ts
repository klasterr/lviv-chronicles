import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Item, Tray } from '../items/item'
import { part, box, cyl, T } from '../world/props'
import { pieces, type Cart, type Item as MenuItem, type Kind } from './menu'

const YELLOW = 0xffc72c

// look of each kind of food, origin on the base; [geometry, aim-sphere radius, centre height, break colours]
const LOOK: Record<Kind, () => [THREE.BufferGeometry, number, number, number[]]> = {
  burger: () => [mergeGeometries([box(0.13, 0.07, 0.13, 0xf5c542, 0, 0.035, 0), cyl(0.065, 0.065, 0.045, 0xd9a24a, 0, 0.09, 0, 10)])!, 0.09, 0.06, [0xf5c542, 0xd9a24a]],
  side: () => [mergeGeometries([box(0.1, 0.1, 0.06, 0xc62828, 0, 0.05, 0), box(0.09, 0.05, 0.04, YELLOW, 0, 0.125, 0)])!, 0.09, 0.07, [0xc62828, YELLOW]],
  drink: () => [mergeGeometries([cyl(0.04, 0.032, 0.15, 0xffffff, 0, 0.075, 0), cyl(0.041, 0.034, 0.04, 0xc62828, 0, 0.07, 0), cyl(0.043, 0.043, 0.012, 0x222222, 0, 0.156, 0), box(0.006, 0.08, 0.006, 0xffeeaa, 0.005, 0.2, 0)])!, 0.11, 0.1, [0xffffff, 0xc62828]],
  dessert: () => [mergeGeometries([cyl(0.04, 0.03, 0.07, 0xf3e5d0, 0, 0.035, 0), part(new THREE.SphereGeometry(0.035, 8, 6), 0xf48fb1, T(0, 0.08, 0))])!, 0.08, 0.06, [0xf3e5d0, 0xf48fb1]],
}
const geo = new Map<Kind, ReturnType<(typeof LOOK)[Kind]>>() // one geometry per kind, shared by every piece

/** A piece of McDonald's food or drink: a generic Item that only knows its menu entry. */
export class McItem extends Item {
  constructor(readonly menu: MenuItem) {
    if (!geo.has(menu.kind)) geo.set(menu.kind, LOOK[menu.kind]())
    const [g, radius, cy, fragments] = geo.get(menu.kind)!
    super(menu.name, g, { radius, cy, fragments, edible: menu.kind === 'drink' ? 'drink' : 'eat' })
  }
}

let trayGeo: THREE.BufferGeometry | undefined
const COLS = 4, DX = 0.14, DZ = 0.16

/** A red tray with one McItem per ordered piece (at most MAX_UNITS, 4 x 2). */
export function orderTray(cart: Cart) {
  trayGeo ??= box(0.56, 0.02, 0.38, 0xb3261e, 0, 0.01, 0)
  const tray = new Tray('піднос', trayGeo)
  pieces(cart).forEach((m, i) => tray.put(new McItem(m), (-(COLS - 1) / 2 + (i % COLS)) * DX, (Math.floor(i / COLS) - 0.5) * DZ))
  return tray
}
