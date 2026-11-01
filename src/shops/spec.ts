import { BAY_W } from '../world/materials'
import type { Front } from '../world/avenue/types'

export type ShopKind = 'books' | 'coffee' | 'pharmacy' | 'cafe'

/** A shop with an enterable room. `bay`/`bays`: which window bays of the building's street wall the hand-drawn shopfront replaces (the wall is split into round(len / 3.2 m) equal bays, see city.ts). */
export interface ShopSpec {
  id: string; kind: ShopKind
  name: string       // the sign
  front: string      // OSM id of the building whose street wall carries the shopfront
  bay: number; bays: number
  doorBay: number    // 0-based, within the shopfront
  slot: number       // Portal slot (1-4)
  room: { w: number; d: number }
}

// Real places: the names and the buildings come from data/osm-poi.json (signs are matched to the street walls by scripts/layout-poi.ts); the interiors are invented from typical layouts.
export const SHOPS: ShopSpec[] = [
  { id: 'ye', kind: 'books', name: 'Книгарня «Є»', front: 'way/171081056', bay: 2, bays: 2, doorBay: 0, slot: 1, room: { w: 9, d: 8 } },                 // Svobody 7
  { id: 'lmk', kind: 'coffee', name: 'Львівська мануфактура кави', front: 'relation/2395542', bay: 5, bays: 2, doorBay: 1, slot: 2, room: { w: 8, d: 7 } }, // Svobody 22
  { id: 'ds', kind: 'pharmacy', name: 'Аптека D.S.', front: 'way/171081064', bay: 5, bays: 2, doorBay: 1, slot: 3, room: { w: 9, d: 7 } },
  { id: 'vk', kind: 'cafe', name: 'Віденська кав\'ярня', front: 'way/149962279', bay: 0, bays: 2, doorBay: 1, slot: 4, room: { w: 11, d: 8 } },     // Svobody 12
]

/** Metres along the wall (from its left end seen from the street): span of the shopfront and the centre of its door. Bays are equal parts of the wall, like the facade tiles. */
export function shopSpan(f: Pick<Front, 'len'>, s: Pick<ShopSpec, 'bay' | 'bays' | 'doorBay'>) {
  const n = Math.max(1, Math.round(f.len / BAY_W)), bw = f.len / n
  return { u0: s.bay * bw, u1: (s.bay + s.bays) * bw, door: (s.bay + s.doorBay + 0.5) * bw, bw }
}

/** The street door of a shop in world coordinates with the wall's outward normal (what `Portal` wants). */
export function shopDoor(f: Front, s: Pick<ShopSpec, 'bay' | 'bays' | 'doorBay'>) {
  const u = shopSpan(f, s).door, tx = (f.b[0] - f.a[0]) / f.len, tz = (f.b[1] - f.a[1]) / f.len
  return { x: f.a[0] + tx * u + f.n[0] * f.off, z: f.a[1] + tz * u + f.n[1] * f.off, nx: f.n[0], nz: f.n[1] }
}

/** Does a mapped sign (centre `t` along the wall, width `w`) overlap a shopfront, i.e. would it float on top of it? */
export const signCovered = (t: number, w: number, u0: number, u1: number) => t + w / 2 > u0 && t - w / 2 < u1

/** What the counter sells (prices in ₴ are made up). `id` is also the key of the item's look in goods.ts. */
export interface Good { id: string; name: string; price: number }
export const GOODS: Record<ShopKind, Good[]> = {
  books: [{ id: 'kobzar', name: 'Кобзар (Т. Шевченко)', price: 350 }, { id: 'zakhar', name: 'Захар Беркут', price: 210 }, { id: 'guide', name: 'Путівник Львовом', price: 180 }],
  coffee: [{ id: 'espresso', name: 'Еспресо', price: 55 }, { id: 'cappuccino', name: 'Капучино', price: 75 }, { id: 'beans', name: 'Кава в зернах, 250 г', price: 290 }],
  pharmacy: [{ id: 'paracetamol', name: 'Парацетамол', price: 48 }, { id: 'vitamin', name: 'Вітамін C', price: 135 }, { id: 'syrup', name: 'Сироп від кашлю', price: 165 }],
  cafe: [{ id: 'vienna', name: 'Віденська кава', price: 85 }, { id: 'strudel', name: 'Штрудель яблучний', price: 95 }, { id: 'sacher', name: 'Торт «Захер»', price: 135 }],
}

/** Order: units per good id. At most MAX_UNITS pieces fit on the counter. */
export type Cart = Map<string, number>
export const MAX_UNITS = 6
export const units = (c: Cart) => [...c.values()].reduce((s, n) => s + n, 0)
export const cartTotal = (goods: Good[], c: Cart) => goods.reduce((s, g) => s + g.price * (c.get(g.id) ?? 0), 0)
/** One entry per piece, in the order of the catalogue ("2 × Еспресо, Капучино" is built from this). */
export const cartPieces = (goods: Good[], c: Cart) => goods.flatMap((g) => Array<Good>(c.get(g.id) ?? 0).fill(g))
export function describe(goods: Good[], c: Cart) {
  return goods.filter((g) => c.get(g.id)).map((g) => (c.get(g.id)! > 1 ? `${c.get(g.id)} × ` : '') + g.name).join(', ')
}
