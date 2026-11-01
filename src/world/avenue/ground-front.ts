// Hand-drawn ground floor of проспект Свободи 35 (Feller Passage) with McDonald's, as it is today.
// Reference: Wikimedia Commons "Пасаж Феллерів.jpg" (2023-01-31, Vikcos75, CC BY-SA 4.0) and "Пасаж Феллерів 2025.jpg" (2025-11-30,
// Бондар Володимир, CC BY-SA 4.0) - the signage is identical in both. Positions are metres from the left (south) end of the wall,
// measured against the 26.5 m OSM wall length. The photos are only looked at, not used as a texture.
export const FRONT35 = {
  shops: [ // u0..u1 (m along the wall)
    { u0: 2.2, u1: 5.3, text: 'НАПОЇ ТА ТЮТЮН', fascia: '#141414' },
    { u0: 7.2, u1: 10.8, text: 'Appleroom.ua', fascia: '#0b0b0b' },
  ],
  arch: { u0: 12.3, u1: 16.3, spring: 3.3, apex: 4.6 },
  mcd: { u0: 16.8, u1: 24.6, awningTo: 22.6, left: [16.8, 20.1], right: [21.5, 24.7], logo: 20.85, door: [22.7, 24.2] },
}

export function drawFront35(len: number, H: number): HTMLCanvasElement {
  const W = 1280, HH = 256, sx = W / len, sy = HH / H
  const c = document.createElement('canvas'); c.width = W; c.height = HH
  const g = c.getContext('2d')!
  const X = (u: number) => u * sx, Y = (h: number) => (H - h) * sy
  const rect = (u0: number, h0: number, u1: number, h1: number, fill: string | CanvasGradient) => { g.fillStyle = fill; g.fillRect(X(u0), Y(h1), X(u1) - X(u0), Y(h0) - Y(h1)) }
  const grad = (h0: number, h1: number, c0: string, c1: string) => { const k = g.createLinearGradient(0, Y(h1), 0, Y(h0)); k.addColorStop(0, c0); k.addColorStop(1, c1); return k }

  // plaster (warm yellow, as the upper floors) + dark red granite plinth
  rect(0, 0, len, H, '#dfc579')
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,70,20' : '255,250,220'},${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * HH, 3, 2) }
  rect(0, 0, len, 0.55, '#6b3b37')
  rect(0, 0.55, len, 0.62, 'rgba(0,0,0,0.25)')
  rect(0, H - 0.35, len, H, grad(H - 0.35, H, 'rgba(0,0,0,0.0)', 'rgba(0,0,0,0.3)')) // shadow under the balcony slab

  const frameGlass = (u0: number, h0: number, u1: number, h1: number, bays: number, warm = 0.6) => {
    rect(u0 - 0.1, h0 - 0.05, u1 + 0.1, h1 + 0.1, '#3a2418')                       // wooden frame
    rect(u0, h0, u1, h1, grad(h0, h1, `rgba(${230 * warm + 20},${150 * warm + 20},${50 * warm},1)`, '#2a1a10')) // lit interior
    g.fillStyle = '#3a2418'
    for (let i = 1; i < bays; i++) g.fillRect(X(u0 + ((u1 - u0) * i) / bays) - 2, Y(h1), 4, Y(h0) - Y(h1)) // mullions
    g.fillRect(X(u0), Y(h0 + (h1 - h0) * 0.72), X(u1) - X(u0), 3)                // transom
  }
  const text = (s: string, u0: number, u1: number, h: number, size: number, fill: string, outline?: string, font = 'Arial') => {
    g.font = `bold ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    const w = g.measureText(s).width, k = Math.min(1, (X(u1) - X(u0)) / w)
    g.save(); g.translate(X((u0 + u1) / 2), Y(h)); g.scale(k, 1)
    if (outline) { g.lineWidth = 5; g.strokeStyle = outline; g.lineJoin = 'round'; g.strokeText(s, 0, 0) }
    g.fillStyle = fill; g.fillText(s, 0, 0); g.restore()
  }

  // arch passage: cream surround, dark opening, bulb fan, teal "luggage room" sign, carved corbel blocks left and right
  const a = FRONT35.arch, ac = (a.u0 + a.u1) / 2, ar = (a.u1 - a.u0) / 2
  for (const [u0, u1] of [[a.u0 - 0.95, a.u0], [a.u1, a.u1 + 0.95]]) {
    rect(u0, 0.55, u1, H - 0.2, '#d2c49e'); rect(u0 + 0.12, 0.8, u1 - 0.12, H - 0.45, 'rgba(0,0,0,0.12)')
    for (let h = 3.6; h < H - 0.4; h += 0.28) rect(u0 + 0.1, h, u1 - 0.1, h + 0.08, 'rgba(60,45,20,0.35)') // carved scrolls (suggested)
  }
  const arch = (r: number, fill: string) => { g.fillStyle = fill; g.beginPath(); g.moveTo(X(ac - r), Y(0)); g.lineTo(X(ac - r), Y(a.spring)); g.ellipse(X(ac), Y(a.spring), X(r) - X(0), Y(0) - Y(a.apex - a.spring), 0, Math.PI, 0); g.lineTo(X(ac + r), Y(0)); g.closePath(); g.fill() }
  arch(ar + 0.28, '#cfc09a'); arch(ar, '#14110d')
  g.fillStyle = '#f2c14a'
  for (let i = 0; i < 9; i++) { const t = Math.PI * (0.12 + (i / 8) * 0.76); g.beginPath(); g.arc(X(ac + Math.cos(t) * ar * 0.82), Y(a.spring + 0.15 + Math.sin(t) * (a.apex - a.spring) * 0.8), 3, 0, 7); g.fill() }
  rect(ac - 1.75, 2.65, ac + 1.75, 3.2, '#2b8f8a'); text('Камера схову · Luggage room', ac - 1.7, ac + 1.7, 2.93, 15, '#ffffff')

  // shops with black fascia + white lettering, lit glazing
  for (const s of FRONT35.shops) {
    rect(s.u0 - 0.15, 2.95, s.u1 + 0.15, 3.6, s.fascia); text(s.text, s.u0, s.u1, 3.27, 26, '#ffffff')
    frameGlass(s.u0, 0.05, s.u1, 2.85, 2)
    rect((s.u0 + s.u1) / 2 - 0.5, 0.05, (s.u0 + s.u1) / 2 + 0.5, 2.3, 'rgba(255,200,120,0.25)')
  }

  // McDonald's: high clerestory windows, white outlined letters pinned on the wall, golden arches, yellow awning, lit dining room, door
  const m = FRONT35.mcd
  frameGlass(16.9, 3.1, 19.9, 4.55, 3, 0.55); frameGlass(21.6, 3.1, 24.4, 4.55, 3, 0.55)
  text("McDonald's", m.left[0], m.left[1], 2.62, 42, '#ffffff', '#161616'); text("McDonald's", m.right[0], m.right[1], 2.62, 42, '#ffffff', '#161616')
  { // arches logo: two stroked arches
    const lx = X(m.logo), ly = Y(2.7), s = sx * 0.22
    g.lineCap = 'round'
    for (const [col, w] of [['#2a1a10', 11 * 1.0], ['#ffc72c', 7]] as [string, number][]) {
      g.strokeStyle = col; g.lineWidth = w
      g.beginPath(); g.moveTo(lx - s * 1.9, ly + s * 1.8); g.lineTo(lx - s * 1.9, ly - s * 0.2); g.bezierCurveTo(lx - s * 1.9, ly - s * 2.6, lx, ly - s * 2.6, lx, ly + s * 0.6)
      g.bezierCurveTo(lx, ly - s * 2.6, lx + s * 1.9, ly - s * 2.6, lx + s * 1.9, ly - s * 0.2); g.lineTo(lx + s * 1.9, ly + s * 1.8); g.stroke()
    }
  }
  frameGlass(16.9, 0.55, 22.3, 1.95, 4, 0.75)
  for (const u of [17.6, 19.0, 20.4, 21.7]) { g.fillStyle = '#ff9a2e'; g.beginPath(); g.arc(X(u), Y(1.55), 5, 0, 7); g.fill() } // pendant lamps
  rect(m.door[0] - 0.1, 0, m.door[1] + 0.1, 2.45, '#3a2418'); rect(m.door[0], 0.05, m.door[1], 2.35, grad(0.05, 2.35, '#c97a2c', '#4a2a14'))
  g.fillStyle = '#3a2418'; g.fillRect(X((m.door[0] + m.door[1]) / 2) - 2, Y(2.35), 4, Y(0.05) - Y(2.35))
  rect(m.u0, 2.0, m.awningTo, 2.3, grad(2.0, 2.3, '#e9a317', '#ffc72c'))   // yellow awning valance (also modelled in 3D)
  return c
}
