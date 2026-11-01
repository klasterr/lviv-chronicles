import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Item } from '../items/item'
import { box, cyl, part, T } from '../world/props'
import type { Good } from './spec'

type Look = [THREE.BufferGeometry, number, number, number[]] // geometry (origin on the base), aim radius, aim centre height, break colours
const book = (c: number, w: number, d: number) => [mergeGeometries([box(w, 0.04, d, c, 0, 0.02, 0), box(w - 0.01, 0.036, d - 0.01, 0xf1ead8, 0.005, 0.02, 0), box(0.01, 0.042, d, 0xe0c060, -w / 2 + 0.02, 0.02, 0)])!, 0.13, 0.03, [c, 0xf1ead8]] as Look
const cup = (h: number, c: number, saucer: boolean) => [mergeGeometries([...(saucer ? [cyl(0.075, 0.07, 0.01, 0xffffff, 0, 0.005, 0, 12)] : []), cyl(0.045, 0.032, h, c, 0, h / 2 + 0.01, 0, 12), cyl(0.04, 0.04, 0.004, 0x4a2a14, 0, h + 0.008, 0, 12)])!, 0.1, h / 2, [c, 0x4a2a14]] as Look
const plate = (food: THREE.BufferGeometry[], cols: number[]) => [mergeGeometries([cyl(0.1, 0.085, 0.015, 0xffffff, 0, 0.0075, 0, 14), ...food])!, 0.11, 0.05, [0xffffff, ...cols]] as Look

const LOOK: Record<string, () => Look> = {
  kobzar: () => book(0x7a1f1f, 0.17, 0.24), zakhar: () => book(0x2f6a45, 0.15, 0.22), guide: () => book(0x2b5a8c, 0.14, 0.2),
  espresso: () => cup(0.05, 0xf4efe6, true), cappuccino: () => cup(0.1, 0xffffff, false), vienna: () => cup(0.065, 0xf4efe6, true),
  beans: () => [mergeGeometries([box(0.13, 0.21, 0.07, 0xb08a5a, 0, 0.105, 0), box(0.131, 0.05, 0.071, 0x5a3a22, 0, 0.19, 0), box(0.07, 0.09, 0.075, 0xf0e2c0, 0, 0.09, 0)])!, 0.12, 0.1, [0xb08a5a, 0x5a3a22]],
  paracetamol: () => [mergeGeometries([box(0.1, 0.04, 0.06, 0xf4f6f6, 0, 0.02, 0), box(0.1, 0.012, 0.061, 0x2f8fd0, 0, 0.02, 0), box(0.04, 0.041, 0.062, 0xe85a3c, 0.03, 0.02, 0)])!, 0.08, 0.025, [0xf4f6f6, 0x2f8fd0]],
  vitamin: () => [mergeGeometries([cyl(0.032, 0.032, 0.09, 0xf0912a, 0, 0.045, 0, 12), cyl(0.034, 0.034, 0.02, 0xffffff, 0, 0.1, 0, 12)])!, 0.08, 0.06, [0xf0912a, 0xffffff]],
  syrup: () => [mergeGeometries([cyl(0.04, 0.04, 0.13, 0x6a3a18, 0, 0.065, 0, 12), cyl(0.016, 0.02, 0.03, 0x6a3a18, 0, 0.145, 0, 8), cyl(0.02, 0.02, 0.02, 0x2f9a55, 0, 0.17, 0, 8), box(0.07, 0.06, 0.003, 0xf0f0e8, 0, 0.07, 0.04)])!, 0.09, 0.09, [0x6a3a18, 0x2f9a55]],
  strudel: () => plate([part(new THREE.CapsuleGeometry(0.03, 0.08, 4, 8), 0xc8964a, T(0, 0.045, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))), box(0.1, 0.006, 0.03, 0xffffff, 0, 0.078, 0)], [0xc8964a]),
  sacher: () => plate([part(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 3, 1, false, 0, Math.PI * 0.45), 0x3a1d12, T(-0.02, 0.043, 0)), box(0.04, 0.012, 0.02, 0xd8a050, 0.04, 0.025, 0.05)], [0x3a1d12, 0xd8a050]),
}
const geo = new Map<string, Look>() // one geometry per kind, shared by every piece
const EDIBLE: Record<string, 'eat' | 'drink'> = { espresso: 'drink', cappuccino: 'drink', vienna: 'drink', strudel: 'eat', sacher: 'eat' } // books, beans and medicine are not

/** Something from a shop's counter or shelf: a generic Item that only knows what it is (look by good id). */
export class ShopItem extends Item {
  constructor(readonly good: Good) {
    if (!geo.has(good.id)) geo.set(good.id, LOOK[good.id]())
    const [g, radius, cy, fragments] = geo.get(good.id)!
    super(good.name, g, { radius, cy, fragments, edible: EDIBLE[good.id] })
  }
}
