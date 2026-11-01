/** What a tray shows: burgers get a wrapper, sides a fries pack, drinks a cup, desserts a sundae. */
export type Kind = 'burger' | 'side' | 'drink' | 'dessert'
export interface Item { id: string; name: string; price: number; kind: Kind; icon: string }

// Standard McDonald's range; prices (₴) are made up.
const item = (name: string, price: number, kind: Kind, icon: string): Item => ({ id: name, name, price, kind, icon })
export const MENU: { title: string; items: Item[] }[] = [
  { title: 'Бургери', items: [
    item('Біг Мак', 139, 'burger', '🍔'), item('Чізбургер', 69, 'burger', '🍔'), item('Гамбургер', 59, 'burger', '🍔'),
    item('Макчікен', 99, 'burger', '🍔'), item('Філе-О-Фіш', 109, 'burger', '🐟'), item('Подвійний чізбургер', 119, 'burger', '🍔') ] },
  { title: 'Курка та картопля', items: [
    item('Картопля фрі', 59, 'side', '🍟'), item('Картопля фрі велика', 69, 'side', '🍟'),
    item('Макнагетси 6 шт', 99, 'side', '🍗'), item('Макнагетси 9 шт', 139, 'side', '🍗') ] },
  { title: 'Напої', items: [
    item('Кока-Кола', 55, 'drink', '🥤'), item('Спрайт', 55, 'drink', '🥤'), item('Фанта', 55, 'drink', '🥤'), item('Яблучний сік', 55, 'drink', '🧃'),
    item('Американо', 55, 'drink', '☕'), item('Капучино', 69, 'drink', '☕'), item('Чай', 39, 'drink', '🍵'), item('Молочний коктейль', 79, 'drink', '🥛') ] },
  { title: 'Десерти', items: [
    item('Макфлурі', 79, 'dessert', '🍨'), item('Сандей полуничний', 59, 'dessert', '🍓'), item('Яблучний пиріг', 39, 'dessert', '🥧'), item('Вишневий пиріг', 39, 'dessert', '🍒') ] },
]

export type Cart = Map<string, number>
export const MAX_UNITS = 8 // what fits on the tray (restaurant/mc-items.ts lays out 4 x 2)
const BY_ID = new Map(MENU.flatMap((c) => c.items).map((i) => [i.id, i]))

export const total = (cart: Cart) => [...cart].reduce((s, [id, n]) => s + BY_ID.get(id)!.price * n, 0)
export const units = (cart: Cart) => [...cart.values()].reduce((s, n) => s + n, 0)
/** One entry per piece: 2× Біг Мак -> two burgers. */
export const pieces = (cart: Cart) => [...cart].flatMap(([id, n]) => Array<Item>(n).fill(BY_ID.get(id)!))
export const kinds = (cart: Cart) => new Set([...cart.keys()].map((id) => BY_ID.get(id)!.kind))
/** "2× Біг Мак, Картопля фрі" */
export const describe = (cart: Cart) => [...cart].map(([id, n]) => (n > 1 ? `${n}× ` : '') + id).join(', ')
