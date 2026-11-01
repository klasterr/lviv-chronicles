import type { Colliders } from '../world/colliders'
import { Kit, floorTex, SPINES, type Counter, type ShopRoom } from './room'
import type { ShopSpec } from './spec'

// Interiors of the four shops. Invented from typical layouts of such shops (nobody photographed the real ones); the player comes in through the south door facing north.
const WOOD = 0x6a4428, DARK = 0x2a2d32, STEEL = 0xc4c9ce

const rows = (k: Kit, x0: number, x1: number, y: number, depth: number, items: (x: number) => [w: number, h: number, c: number, d?: number] | null, gap = 0.004) => {
  for (let x = x0 + 0.02; x < x1 - 0.05;) { const it = items(x); if (!it) break; const [w, h, c, d = depth - 0.05] = it; k.b(w, h, d, c, x + w / 2, y + h / 2, 0); x += w + gap }
}
const books = (k: Kit, x0: number, x1: number, y: number, depth: number) => rows(k, x0, x1, y, depth, () => { const w = 0.03 + k.rnd() * 0.035; return [w, 0.2 + k.rnd() * 0.13, SPINES[Math.floor(k.rnd() * SPINES.length)]] })
const label = (g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, font = 'Arial', style = 'bold', align: CanvasTextAlign = 'center') => { g.font = `${style} ${size}px ${font}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y) }
const till = (k: Kit, x: number, y: number, z: number) => { k.b(0.38, 0.3, 0.3, DARK, x, y + 0.15, z); k.g_(0.3, 0.2, 0.02, 0x9ad8ff, x, y + 0.19, z + 0.16) } // till with its customer-facing screen
const counterTop = (k: Kit, c: Counter, front: number, top: number) => { k.b(c.w, c.top - 0.03, c.d, front, c.x, (c.top - 0.03) / 2, c.z); k.b(c.w + 0.1, 0.06, c.d + 0.1, top, c.x, c.top, c.z); k.rect(c.x, c.z, c.w / 2, c.d / 2, c.top + 0.7) }
const panel = (k: Kit, xs: number[], zs: number[], y: number, c = 0xfff6dc, w = 1.4, d = 0.4) => { for (const x of xs) for (const z of zs) k.g_(w, 0.04, d, c, x, y - 0.03, z) }

// ---- Книгарня «Є»: wooden bookcases round the walls, two display tables, a counter at the back right
function books_(k: Kit): ShopRoom {
  const { hw, hd, H } = k
  const pane = k.shell({ wall: 0xe8dcc0, plinth: 0x4a3020, trim: 0x2a1c12, ceil: 0xf3efe4 })
  pane(hw, -2.3, 'x', 1.4, 1.9, 1.3)
  const fill = (kk: Kit, x0: number, x1: number, y: number, d: number) => books(kk, x0, x1, y, d)
  for (const x of [-3.3, -1.1, 1.1, 3.3]) k.shelves(x, -hd + 0.2, 0, 2.0, { wood: WOOD, fill })
  for (const z of [-1.9, 0.1, 2.1]) k.shelves(-hw + 0.2, z, Math.PI / 2, 2.0, { wood: WOOD, fill })
  for (const z of [0.6, 2.6]) k.shelves(hw - 0.2, z, -Math.PI / 2, 2.0, { wood: WOOD, fill })
  for (const [x, z] of [[-1.5, -0.2], [-1.5, 1.6]]) { // display tables with piles of new books
    k.b(1.5, 0.05, 0.9, 0x8a5a34, x, 0.78, z); for (const s of [-1, 1]) for (const t of [-1, 1]) k.b(0.06, 0.76, 0.06, WOOD, x + s * 0.68, 0.38, z + t * 0.38)
    for (let i = 0; i < 6; i++) for (let n = 0; n < 2 + (i % 3); n++) k.b(0.18, 0.035, 0.25, SPINES[(i * 3 + n) % SPINES.length], x - 0.55 + i * 0.22, 0.82 + n * 0.037, z + (i % 2 ? 0.12 : -0.12))
    k.rect(x, z, 0.75, 0.45, 0.85)
  }
  k.shelf.push({ id: 'kobzar', x: -1.9, y: 0.8, z: 0.25 }, { id: 'zakhar', x: -1.2, y: 0.8, z: 0.05 }, { id: 'guide', x: -1.9, y: 0.8, z: 1.95 }, { id: 'kobzar', x: -1.2, y: 0.8, z: 1.7 })
  const c: Counter = { x: 2.3, z: -1.8, w: 2.6, d: 0.7, top: 1.0 }
  counterTop(k, c, 0x5a3a22, 0xd8c8a8); till(k, c.x + 0.7, 1.03, c.z - 0.1)
  for (let i = 0; i < 5; i++) k.b(0.2, 0.02 + i * 0.001, 0.14, 0xe8e0d0, c.x - 0.9, 1.04 + i * 0.022, c.z - 0.1) // bags
  k.g_(0.3, 0.02, 0.3, 0xffe9a0, c.x - 0.2, 2.8, c.z); k.b(0.02, 0.9, 0.02, 0x222222, c.x - 0.2, 3.1, c.z)
  const g = k.g
  g.fillStyle = '#1d1d20'; g.fillRect(0, 0, 640, 160); label(g, 'Є', 110, 84, 130, '#ffd21f'); label(g, 'КНИГАРНЯ', 400, 84, 74, '#fff')
  g.fillStyle = '#f1ecdd'; g.fillRect(660, 0, 340, 200); label(g, 'Нові надходження', 830, 40, 34, '#222'); label(g, 'Українські автори', 830, 90, 26, '#444', 'Arial', 'normal'); label(g, 'Дитяча полиця', 830, 130, 26, '#444', 'Arial', 'normal'); label(g, 'Є кав\'ярня поруч!', 830, 170, 22, '#a33', 'Arial', 'bold')
  k.sign(3.2, 0.8, [0, 0, 640, 160], 0, 2.82, -hd + 0.02); k.sign(1.7, 1.0, [660, 0, 340, 200], -hw + 0.02, 2.85, 0.6, Math.PI / 2)
  panel(k, [-2.4, 0, 2.4], [-2.4, 0.4, 2.4], H)
  return k.finish(floorTex((f) => { for (let i = 0; i < 4; i++) { f.fillStyle = ['#a8794a', '#9a6b3e', '#b3834f', '#946336'][i]; f.fillRect(0, i * 32, 128, 32); f.fillStyle = '#0005'; f.fillRect(0, i * 32, 128, 2); f.fillRect((i * 40) % 128, i * 32, 2, 32) } }),
    { shirt: 0x3d5a6c, hair: 0x2b2018 }, c)
}

// ---- Львівська мануфактура кави: roastery counter with machine and grinder, shelves of tins and bags, chalk menu, a few tables
function coffee_(k: Kit): ShopRoom {
  const { hw, hd, H } = k
  const pane = k.shell({ wall: 0xd9c8a4, plinth: 0x3a2416, trim: 0x2a1810, ceil: 0xe9dfc8, plinthH: 1.2 })
  pane(-hw, 0.8, 'x', 2.0, 1.8, 1.2); pane(hw, 0.8, 'x', 2.0, 1.8, 1.2)
  const fill = (kk: Kit, x0: number, x1: number, y: number) => rows(kk, x0, x1, y, 0.3, () => kk.rnd() < 0.5 ? [0.16, 0.22, [0x5a3a22, 0x8a5a2a, 0xe8d9b0, 0xc8a050][Math.floor(kk.rnd() * 4)], 0.16] : [0.1, 0.26, [0x3a2418, 0xb08a5a][Math.floor(kk.rnd() * 2)], 0.12], 0.05)
  k.shelves(-2.3, -hd + 0.2, 0, 2.4, { wood: 0x3a2416, h: 2.4, rows: 4, fill }); k.shelves(2.3, -hd + 0.2, 0, 2.4, { wood: 0x3a2416, h: 2.4, rows: 4, fill })
  k.b(6.8, 0.9, 0.5, 0x3a2416, 0, 0.45, -hd + 0.55); k.b(6.9, 0.05, 0.55, 0x4a4f55, 0, 0.92, -hd + 0.55) // back cabinet
  const c: Counter = { x: 0.8, z: -1.0, w: 4.4, d: 0.8, top: 1.05 }
  counterTop(k, c, 0x3a2416, 0xcfc4b0)
  k.b(0.7, 0.5, 0.5, STEEL, 2.4, 1.33, c.z - 0.05); k.b(0.72, 0.1, 0.52, 0x2a2d32, 2.4, 1.63, c.z - 0.05); k.b(0.1, 0.12, 0.1, 0x222222, 2.25, 1.15, c.z + 0.18); k.b(0.1, 0.12, 0.1, 0x222222, 2.55, 1.15, c.z + 0.18) // espresso machine
  k.cy(0.09, 0.12, 0.35, 0x222222, 1.4, 1.25, c.z - 0.05); k.cy(0.14, 0.09, 0.14, 0xdddddd, 1.4, 1.5, c.z - 0.05); till(k, 0.0, 1.08, c.z - 0.1) // grinder, till
  for (let i = 0; i < 6; i++) k.cy(0.04, 0.032, 0.08, 0xffffff, -1.0 + (i % 3) * 0.1, 1.1, c.z + 0.1 + Math.floor(i / 3) * 0.1) // stacked paper cups
  k.shelf.push({ id: 'espresso', x: -1.0, y: 1.09, z: c.z + 0.2 }, { id: 'cappuccino', x: 3.0, y: 1.09, z: c.z + 0.2 })
  for (const z of [0.4, 2.0]) { // tables with stools (west), bags of beans (east)
    k.cy(0.35, 0.35, 0.04, 0x6a4a2a, -2.8, 0.74, z, 16); k.cy(0.05, 0.05, 0.72, 0x222222, -2.8, 0.37, z); k.rect(-2.8, z, 0.35, 0.35, 0.78)
    for (const s of [-1, 1]) { k.cy(0.17, 0.17, 0.05, 0x8a5a2a, -2.8 + s * 0.65, 0.5, z, 12); k.cy(0.02, 0.02, 0.5, 0x222222, -2.8 + s * 0.65, 0.25, z); k.rect(-2.8 + s * 0.65, z, 0.17, 0.17, 0.5) }
  }
  for (const [x, z] of [[3.3, 1.6], [3.3, 2.5], [2.5, 2.4]]) { k.cy(0.28, 0.22, 0.55, 0xc9a56a, x, 0.275, z, 12); k.cy(0.2, 0.22, 0.06, 0xc9a56a, x, 0.58, z, 12); k.rect(x, z, 0.28, 0.28, 0.6) } // burlap sacks
  k.shelf.push({ id: 'beans', x: 3.3, y: 0.62, z: 1.6 }, { id: 'beans', x: 2.5, y: 0.62, z: 2.4 })
  const g = k.g
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, 700, 300); g.strokeStyle = '#c9a24a'; g.lineWidth = 6; g.strokeRect(8, 8, 684, 284)
  label(g, 'КАВА', 350, 42, 40, '#e0b95a', 'Georgia, serif'); label(g, 'Еспресо', 40, 100, 30, '#eee', 'Georgia, serif', 'normal', 'left'); label(g, '55 ₴', 660, 100, 30, '#e0b95a', 'Georgia, serif', 'normal', 'right')
  label(g, 'Капучино', 40, 150, 30, '#eee', 'Georgia, serif', 'normal', 'left'); label(g, '75 ₴', 660, 150, 30, '#e0b95a', 'Georgia, serif', 'normal', 'right'); label(g, 'Кава в зернах, 250 г', 40, 200, 30, '#eee', 'Georgia, serif', 'normal', 'left'); label(g, '290 ₴', 660, 200, 30, '#e0b95a', 'Georgia, serif', 'normal', 'right')
  label(g, 'Свіжообсмажена, мелемо на місці', 350, 255, 24, '#bbb', 'Georgia, serif', 'italic')
  k.sign(2.0, 0.857, [0, 0, 700, 300], 0, 1.9, -hd + 0.02)
  for (const x of [-0.6, 0.8, 2.2]) { k.b(0.015, 0.8, 0.015, 0x222222, x, H - 0.4, c.z); k.sph(0.1, 0xffe9a0, x, H - 0.85, c.z, true) } // pendant lamps
  panel(k, [-2, 2], [-0.5, 2], H, 0xfff0d0, 1.2, 0.3)
  return k.finish(floorTex((f) => { f.fillStyle = '#4a3f38'; f.fillRect(0, 0, 128, 128); f.fillStyle = '#5a4e46'; f.fillRect(2, 2, 60, 60); f.fillRect(66, 66, 60, 60); f.fillStyle = '#3e342e'; f.fillRect(66, 2, 60, 60); f.fillRect(2, 66, 60, 60) }),
    { shirt: 0xf2eee4, yoke: 0x5a3a22, hair: 0x5a3a20, long: true }, c)
}

// ---- Аптека D.S.: white, green stripe; wall cabinets of boxes behind a long counter, glass display cases, waiting chairs
function pharmacy_(k: Kit): ShopRoom {
  const { hw, hd, H } = k
  const pane = k.shell({ wall: 0xf1f3f0, plinth: 0x2f9a55, trim: 0x9aa7a2, ceil: 0xffffff, plinthH: 0.15 })
  k.b(2 * hw, 0.25, 0.04, 0x2f9a55, 0, 1.6, -hd + 0.03); pane(-hw, -2.6, 'x', 1.4, 1.9, 1.2); pane(hw, -2.6, 'x', 1.4, 1.9, 1.2)
  const pills = (kk: Kit, x0: number, x1: number, y: number, d: number) => rows(kk, x0, x1, y, d, () => { const r = kk.rnd(); return [0.07 + r * 0.05, 0.1 + kk.rnd() * 0.1, [0xffffff, 0x2f9a55, 0xe9eef0, 0xe8782a, 0x4a90d0, 0xf0d040][Math.floor(kk.rnd() * 6)], 0.15] }, 0.01)
  for (const x of [-3.3, -1.1, 1.1, 3.3]) k.shelves(x, -hd + 0.2, 0, 2.0, { wood: 0xdfe3e0, h: 2.5, rows: 6, fill: pills })
  const c: Counter = { x: 0.5, z: -1.2, w: 5.4, d: 0.8, top: 1.05 }
  counterTop(k, c, 0xf4f6f4, 0xcfd6d2)
  till(k, -0.8, 1.08, c.z - 0.1); till(k, 1.9, 1.08, c.z - 0.1)
  k.b(0.4, 0.04, 0.3, 0x888888, -1.8, 1.1, c.z + 0.1); k.cy(0.12, 0.12, 0.2, 0xe8eef0, -1.8, 1.22, c.z + 0.1, 12) // scales
  k.shelf.push({ id: 'paracetamol', x: -1.3, y: 1.09, z: c.z + 0.2 }, { id: 'paracetamol', x: -1.0, y: 1.09, z: c.z + 0.28 }, { id: 'vitamin', x: 2.5, y: 1.09, z: c.z + 0.2 }, { id: 'syrup', x: 2.8, y: 1.09, z: c.z + 0.3 })
  for (const s of [-1, 1]) { // glass display cases on the side walls, lit inside
    k.at(s * (hw - 0.4), 1.6, -s * Math.PI / 2, () => { k.b(1.8, 0.8, 0.5, 0xe9eceb, 0, 0.4, 0); k.g_(1.7, 0.9, 0.42, 0xdff2f6, 0, 1.25, 0); for (let i = 0; i < 8; i++) k.b(0.1, 0.12, 0.08, [0x2f9a55, 0xffffff, 0xe8782a, 0x4a90d0][i % 4], -0.7 + i * 0.2, 0.9 + 0.05 * (i % 2), 0); k.b(1.8, 0.03, 0.5, 0x9aa7a2, 0, 1.7, 0) })
    k.rect(s * (hw - 0.4), 1.6, 0.25, 0.9, 1.7)
  }
  for (const z of [2.2, 3.0]) { k.b(0.4, 0.05, 0.4, 0x3a8a5a, -hw + 0.5, 0.45, z); k.b(0.05, 0.4, 0.4, 0x3a8a5a, -hw + 0.3, 0.7, z); k.b(0.04, 0.45, 0.04, 0x888888, -hw + 0.5, 0.22, z); k.bench(-hw + 0.5, z, -Math.PI / 2, 0.22, 0.22, 0.5) } // waiting chairs
  const g = k.g
  g.fillStyle = '#fff'; g.fillRect(0, 0, 700, 200); g.fillStyle = '#1f9a46'; g.fillRect(0, 0, 700, 14); g.fillRect(0, 186, 700, 14)
  label(g, 'D.S.', 170, 105, 130, '#1f9a46'); label(g, 'АПТЕКА', 510, 105, 70, '#1f9a46')
  g.fillStyle = '#fff'; g.fillRect(0, 220, 500, 290); g.strokeStyle = '#1f9a46'; g.lineWidth = 6; g.strokeRect(4, 224, 492, 282)
  label(g, 'Безрецептурні', 250, 262, 34, '#1f9a46'); label(g, 'Парацетамол          48 ₴', 250, 320, 28, '#333', 'Arial', 'normal'); label(g, 'Вітамін C               135 ₴', 250, 365, 28, '#333', 'Arial', 'normal'); label(g, 'Сироп від кашлю    165 ₴', 250, 410, 28, '#333', 'Arial', 'normal'); label(g, 'Перед застосуванням — до лікаря', 250, 470, 20, '#a33', 'Arial', 'italic')
  k.sign(3.4, 0.97, [0, 0, 700, 200], 0, 2.98, -hd + 0.02); k.sign(1.6, 0.93, [0, 220, 500, 290], hw - 0.02, 1.9, -0.3, -Math.PI / 2)
  panel(k, [-2.6, 0, 2.6], [-2.2, 0.2, 2.4], H, 0xf2fbff, 1.6, 0.35)
  return k.finish(floorTex((f) => { f.fillStyle = '#d9dedc'; f.fillRect(0, 0, 128, 128); f.fillStyle = '#e8ecea'; f.fillRect(2, 2, 60, 60); f.fillRect(66, 66, 60, 60) }),
    { shirt: 0xf4f4f0, yoke: 0x2f9a55, tag: 0x2f9a55, hair: 0x3a2a20 }, c)
}

// ---- Віденська кав'ярня: Thonet chairs round marble tables, a glass cake counter, mirror and paintings, chandeliers
function cafe_(k: Kit): ShopRoom {
  const { hw, hd, H } = k
  const pane = k.shell({ wall: 0x8a3b32, plinth: 0x4a2a1a, trim: 0x2a1a12, ceil: 0xf0e6d0, plinthH: 1.1 })
  pane(-hw, -0.4, 'x', 2.2, 2.0, 1.4); pane(-hw, 2.2, 'x', 2.0, 2.0, 1.4); pane(hw, 2.4, 'x', 2.0, 2.0, 1.4)
  k.b(2 * hw, 0.08, 0.06, 0xd8b868, 0, 1.12, -hd + 0.03) // picture rail
  const c: Counter = { x: 2.4, z: -1.9, w: 3.6, d: 0.8, top: 1.1 }
  k.b(c.w, 0.35, c.d, 0x3a2418, c.x, 0.175, c.z); k.b(c.w + 0.1, 0.06, c.d + 0.1, 0xe8e0d0, c.x, c.top, c.z); k.b(c.w - 0.1, 0.03, c.d - 0.1, 0xd8b868, c.x, 0.72, c.z) // open pastry counter: base, shelf, top
  k.g_(c.w - 0.1, 0.7, 0.03, 0xfff2d8, c.x, 0.72, c.z - c.d / 2 + 0.06); for (const s of [-1, 1]) k.b(0.04, 0.72, c.d, 0xd8b868, c.x + s * (c.w / 2 - 0.04), 0.71, c.z); k.rect(c.x, c.z, c.w / 2, c.d / 2, c.top + 0.7)
  const cakes = [0xf0d8a0, 0x5a2a1a, 0xe8607a, 0xf4ecd8, 0x8a5a2a, 0xc8282e]
  for (let i = 0; i < 6; i++) { k.cy(0.14, 0.14, 0.1, cakes[i], c.x - 1.4 + i * 0.56, 0.79, c.z + 0.05, 14); k.cy(0.14, 0.14, 0.1, cakes[(i + 3) % 6], c.x - 1.4 + i * 0.56, 0.41, c.z + 0.05, 14) }
  k.b(0.7, 0.5, 0.5, STEEL, c.x + 1.0, 1.4, c.z - 0.2); k.b(0.72, 0.1, 0.52, 0x8a6a2a, c.x + 1.0, 1.7, c.z - 0.2) // espresso machine behind the glass
  till(k, c.x - 1.0, 1.13, c.z - 0.18)
  k.shelf.push({ id: 'strudel', x: -3.3, y: 0.8, z: 0.0 }, { id: 'sacher', x: -3.3, y: 0.8, z: 2.0 }, { id: 'vienna', x: -1.3, y: 0.8, z: -0.1 }, { id: 'vienna', x: -1.3, y: 0.8, z: 2.0 })
  const table = (x: number, z: number) => {
    k.cy(0.38, 0.38, 0.035, 0xe8e2d6, x, 0.76, z, 16); k.cy(0.04, 0.04, 0.72, 0x222222, x, 0.37, z); k.cy(0.25, 0.25, 0.03, 0x222222, x, 0.015, z, 12); k.rect(x, z, 0.38, 0.38, 0.78)
    for (const a of [0.5, 2.6, 4.7]) { const cx = x + Math.sin(a) * 0.62, cz = z + Math.cos(a) * 0.62; k.cy(0.2, 0.2, 0.04, 0x4a2a1a, cx, 0.46, cz, 10); k.cy(0.02, 0.02, 0.46, 0x4a2a1a, cx, 0.23, cz, 6); k.b(0.36, 0.4, 0.03, 0x4a2a1a, cx + Math.sin(a) * 0.19, 0.7, cz + Math.cos(a) * 0.19) } // Thonet chair, back outside
  }
  for (const x of [-3.3, -1.3]) for (const z of [0.0, 2.0]) table(x, z)
  for (const [x, z] of [[-3.3, -2.5], [-1.3, -2.5], [3.3, 1.2], [4.4, 2.8], [2.0, 2.6]]) table(x, z)
  for (const [x, z] of [[-2.3, 1.0], [-0.5, 1.0], [3.4, 1.0]]) { k.cy(0.015, 0.015, H - 2.6, 0xc8a050, x, (H + 2.6) / 2, z, 6); k.cy(0.3, 0.3, 0.04, 0xc8a050, x, 2.55, z, 14); for (let i = 0; i < 6; i++) k.sph(0.05, 0xfff0c0, x + Math.sin(i) * 0.3, 2.6, z + Math.cos(i) * 0.3, true) } // chandeliers
  const g = k.g
  g.fillStyle = '#c9a24a'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#9ab0b8'; g.fillRect(14, 14, 372, 272) // mirror
  g.fillStyle = '#ffffff30'; g.beginPath(); g.moveTo(40, 280); g.lineTo(140, 20); g.lineTo(190, 20); g.lineTo(90, 280); g.fill()
  g.fillStyle = '#c9a24a'; g.fillRect(420, 0, 280, 300); g.fillStyle = '#6a8a58'; g.fillRect(432, 12, 256, 276); g.fillStyle = '#d8c070'; g.beginPath(); g.arc(560, 110, 38, 0, 7); g.fill(); g.fillStyle = '#3a5a3a'; g.beginPath(); g.moveTo(432, 288); g.lineTo(520, 160); g.lineTo(640, 288); g.fill() // landscape painting
  g.fillStyle = '#16231d'; g.fillRect(0, 320, 600, 190); g.strokeStyle = '#c9a24a'; g.lineWidth = 5; g.strokeRect(6, 326, 588, 178)
  label(g, 'Меню', 300, 360, 34, '#e6c875', 'Georgia, serif', 'italic bold'); label(g, 'Віденська кава', 40, 410, 28, '#eee', 'Georgia, serif', 'normal', 'left'); label(g, '85 ₴', 560, 410, 28, '#e6c875', 'Georgia, serif', 'normal', 'right')
  label(g, 'Штрудель яблучний', 40, 450, 28, '#eee', 'Georgia, serif', 'normal', 'left'); label(g, '95 ₴', 560, 450, 28, '#e6c875', 'Georgia, serif', 'normal', 'right'); label(g, 'Торт «Захер»', 40, 487, 28, '#eee', 'Georgia, serif', 'normal', 'left'); label(g, '135 ₴', 560, 487, 28, '#e6c875', 'Georgia, serif', 'normal', 'right')
  k.sign(1.7, 1.27, [0, 0, 400, 300], c.x - 0.8, 2.0, -hd + 0.02); k.sign(1.2, 1.29, [420, 0, 280, 300], c.x + 1.0, 2.0, -hd + 0.02)
  k.sign(2.0, 0.63, [0, 320, 600, 190], c.x + 0.1, 3.0, -hd + 0.02)
  panel(k, [-3, 0, 3], [-2.4, 1.2], H, 0xfff0d0, 0.8, 0.3)
  return k.finish(floorTex((f) => { f.fillStyle = '#efe6d2'; f.fillRect(0, 0, 128, 128); f.fillStyle = '#2a2a2a'; f.fillRect(0, 0, 64, 64); f.fillRect(64, 64, 64, 64) }),
    { shirt: 0xf6f2ea, yoke: 0x1c1c1c, hair: 0x2a1c14, long: true }, c)
}

const BUILD = { books: books_, coffee: coffee_, pharmacy: pharmacy_, cafe: cafe_ }

/** The room of a shop at its slot on the empty ground beyond the city; colliders are registered. */
export function buildRoom(s: ShopSpec, o: { x: number; z: number }, colliders: Colliders, shadows: boolean): ShopRoom {
  const k = new Kit(o.x, o.z, colliders, s.room.w / 2, s.room.d / 2, 3.5, shadows)
  const r = BUILD[s.kind](k)
  return r
}
