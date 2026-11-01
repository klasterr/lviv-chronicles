import * as THREE from 'three'

/** Canvas textures of the opera: one 1024² atlas (ceiling painting, curtain, foyer paintings, mirror, signs, poster) and a 512² marble tile. Everything is drawn here, no photos. */
export const AW = 1024
export const RECT = {
  plafond: [0, 0, 512, 512], curtain: [512, 0, 512, 512], paintings: [0, 512, 1024, 256], mirror: [0, 768, 256, 256],
  kasa: [256, 768, 256, 128], garderob: [256, 896, 256, 128], poster: [512, 768, 256, 256], parter: [768, 768, 256, 128], tiers: [768, 896, 256, 128],
} satisfies Record<string, number[]>
export type Rect = readonly number[]

const GOLD = '#d4a93c', GOLD_D = '#8a6a1c'
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })() // deterministic: the same painting every time

const cv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const tex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t }

function sign(g: CanvasRenderingContext2D, [x, y, w, h]: Rect, text: string, bg: string) {
  g.fillStyle = bg; g.fillRect(x, y, w, h)
  g.strokeStyle = GOLD; g.lineWidth = 5; g.strokeRect(x + 6, y + 6, w - 12, h - 12)
  g.fillStyle = GOLD; g.textAlign = 'center'; g.textBaseline = 'middle'
  let px = Math.floor(h * 0.4); g.font = `bold ${px}px Georgia, serif`
  while (g.measureText(text).width > w - 30 && px > 8) g.font = `bold ${--px}px Georgia, serif`
  g.fillText(text, x + w / 2, y + h / 2 + 3)
}

function plafond(g: CanvasRenderingContext2D, [x, y, w]: Rect) {
  const cx = x + w / 2, cy = y + w / 2, R = w / 2 - 4
  g.fillStyle = '#e8dcc0'; g.fillRect(x, y, w, w)
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip()
  const sky = g.createRadialGradient(cx, cy, 10, cx, cy, R); sky.addColorStop(0, '#f8ecc8'); sky.addColorStop(0.55, '#9cc0e0'); sky.addColorStop(1, '#4f78b0')
  g.fillStyle = sky; g.fillRect(x, y, w, w)
  for (let i = 0; i < 10; i++) { // ten sectors, each with a draped allegorical figure on a cloud
    const a = ((i + 0.5) / 10) * Math.PI * 2, r = R * 0.62, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r
    g.save(); g.translate(px, py); g.rotate(a + Math.PI / 2)
    g.fillStyle = 'rgba(255,255,255,0.75)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse((k - 1.5) * 20, 26 + (k % 2) * 4, 24, 11, 0, 0, 7); g.fill() }
    const cols = ['#c9514f', '#e0b04a', '#5b88c7', '#ece3d3', '#6fa070'][i % 5]
    g.fillStyle = cols; g.beginPath(); g.moveTo(-20, 28); g.bezierCurveTo(-34, -6, -6, -30, 6, -38); g.bezierCurveTo(28, -20, 34, 8, 22, 28); g.closePath(); g.fill()
    g.fillStyle = '#f0c9a4'; g.beginPath(); g.arc(2, -44, 9, 0, 7); g.fill()
    g.strokeStyle = cols; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(-8, -20); g.quadraticCurveTo(-34, -40, -30, -62); g.stroke()
    g.restore()
    g.strokeStyle = GOLD; g.lineWidth = 3; g.beginPath(); g.moveTo(cx + Math.cos(a - Math.PI / 10) * 70, cy + Math.sin(a - Math.PI / 10) * 70); g.lineTo(cx + Math.cos(a - Math.PI / 10) * R, cy + Math.sin(a - Math.PI / 10) * R); g.stroke()
  }
  g.restore()
  g.strokeStyle = GOLD; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, R - 4, 0, 7); g.stroke()
  g.strokeStyle = GOLD_D; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R - 12, 0, 7); g.stroke()
  g.fillStyle = GOLD; g.beginPath(); g.arc(cx, cy, 62, 0, 7); g.fill() // central rosette: the chandelier hangs here
  g.fillStyle = '#f5e6b0'; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38, 18, 8, a, 0, 7); g.fill() }
  g.fillStyle = GOLD_D; g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.fill()
}

function curtain(g: CanvasRenderingContext2D, [x, y, w, h]: Rect) {
  g.fillStyle = '#7a0f16'; g.fillRect(x, y, w, h)
  for (let i = 0; i < 16; i++) {
    const fx = x + i * (w / 16), gr = g.createLinearGradient(fx, 0, fx + w / 16, 0)
    gr.addColorStop(0, '#4a070d'); gr.addColorStop(0.45, i % 2 ? '#c42a35' : '#b3202b'); gr.addColorStop(1, '#4e080e')
    g.fillStyle = gr; g.fillRect(fx, y, w / 16, h)
  }
  const sh = g.createLinearGradient(0, y, 0, y + h); sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(0.2, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)')
  g.fillStyle = sh; g.fillRect(x, y, w, h)
  g.fillStyle = GOLD; g.fillRect(x, y + h - 26, w, 10); g.fillRect(x, y + 20, w, 8) // gold braid and fringe
  for (let i = 0; i < 64; i++) { g.fillStyle = i % 2 ? GOLD : GOLD_D; g.fillRect(x + i * (w / 64) + 1, y + h - 16, w / 64 - 3, 16) }
  for (let i = 0; i < 8; i++) { g.fillStyle = GOLD; g.beginPath(); g.arc(x + (i + 0.5) * (w / 8), y + 52, 9, 0, 7); g.fill() }
}

function paintings(g: CanvasRenderingContext2D, [x, y, w, h]: Rect) {
  const pw = w / 3, names = ['ПОЕЗІЯ', 'МУЗИКА', 'ХОРЕОГРАФІЯ']
  names.forEach((name, i) => {
    const px = x + i * pw + 10, py = y + 10, iw = pw - 20, ih = h - 20
    const sky = g.createLinearGradient(0, py, 0, py + ih); sky.addColorStop(0, ['#7aa6d6', '#c78f9c', '#d9b47a'][i]); sky.addColorStop(1, '#f2e2bf')
    g.fillStyle = sky; g.fillRect(px, py, iw, ih)
    g.fillStyle = 'rgba(255,255,255,0.7)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(px + rnd() * iw, py + 30 + rnd() * 80, 38, 14, 0, 0, 7); g.fill() }
    g.fillStyle = ['#6f8f5a', '#7a6b8f', '#9a8a4a'][i]; g.beginPath(); g.moveTo(px, py + ih); g.quadraticCurveTo(px + iw * 0.3, py + ih * 0.55, px + iw * 0.6, py + ih * 0.75); g.quadraticCurveTo(px + iw * 0.85, py + ih * 0.65, px + iw, py + ih * 0.8); g.lineTo(px + iw, py + ih); g.fill()
    for (let k = 0; k < 4; k++) { // draped figures
      const fx = px + 40 + k * (iw - 80) / 3, fy = py + ih * 0.55 + (k % 2) * 14
      g.fillStyle = ['#d9d0c0', '#c95a54', '#e0b04a', '#5b88c7'][(k + i) % 4]; g.beginPath(); g.moveTo(fx - 14, fy + 60); g.bezierCurveTo(fx - 20, fy + 10, fx - 4, fy, fx, fy - 4); g.bezierCurveTo(fx + 12, fy + 4, fx + 22, fy + 20, fx + 14, fy + 60); g.fill()
      g.fillStyle = '#f0c9a4'; g.beginPath(); g.arc(fx, fy - 12, 8, 0, 7); g.fill()
    }
    g.strokeStyle = GOLD; g.lineWidth = 8; g.strokeRect(px, py, iw, ih)
    g.fillStyle = GOLD; g.font = 'bold 24px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(name, px + iw / 2, py + ih - 10)
  })
}

function mirror(g: CanvasRenderingContext2D, [x, y, w, h]: Rect) {
  const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#dbe8ee'); gr.addColorStop(0.5, '#9db4c4'); gr.addColorStop(1, '#c8d9e2')
  g.fillStyle = gr; g.fillRect(x, y, w, h)
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x + 40, y); g.lineTo(x + 90, y); g.lineTo(x + 20, y + h); g.lineTo(x - 30, y + h); g.fill()
  g.beginPath(); g.moveTo(x + 150, y); g.lineTo(x + 170, y); g.lineTo(x + 100, y + h); g.lineTo(x + 80, y + h); g.fill()
  g.strokeStyle = GOLD; g.lineWidth = 10; g.strokeRect(x + 5, y + 5, w - 10, h - 10)
}

function poster(g: CanvasRenderingContext2D, [x, y, w, h]: Rect) {
  g.fillStyle = '#5b0f1c'; g.fillRect(x, y, w, h)
  g.strokeStyle = GOLD; g.lineWidth = 5; g.strokeRect(x + 8, y + 8, w - 16, h - 16)
  g.fillStyle = GOLD; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = 'bold 34px Georgia, serif'; g.fillText('ЛУСКУНЧИК', x + w / 2, y + 62)
  g.font = '20px Georgia, serif'; g.fillText('балет П. Чайковського', x + w / 2, y + 100)
  g.fillStyle = '#f2e6c8'; g.beginPath(); g.arc(x + w / 2, y + 160, 34, 0, 7); g.fill(); g.fillStyle = '#5b0f1c'; g.fillRect(x + w / 2 - 6, y + 128, 12, 66)
  g.fillStyle = GOLD; g.font = '22px Georgia, serif'; g.fillText('Сьогодні, 19:00', x + w / 2, y + 222)
}

export function drawAtlas() {
  const c = cv(AW, AW), g = c.getContext('2d')!
  g.fillStyle = '#222'; g.fillRect(0, 0, AW, AW)
  plafond(g, RECT.plafond); curtain(g, RECT.curtain); paintings(g, RECT.paintings); mirror(g, RECT.mirror); poster(g, RECT.poster)
  sign(g, RECT.kasa, 'КАСА', '#14301f'); sign(g, RECT.garderob, 'ГАРДЕРОБ', '#3a1a1a'); sign(g, RECT.parter, 'ПАРТЕР', '#14301f'); sign(g, RECT.tiers, 'ЯРУСИ', '#14301f')
  return tex(c)
}

/** 4 x 4 m of pale marble: big diagonal squares in cream and rose, veined, with a thin dark joint. */
export function drawMarble(repeatX: number, repeatY: number) {
  const c = cv(512, 512), g = c.getContext('2d')!
  const q = 256
  for (let i = 0; i < 4; i++) {
    g.fillStyle = (i % 3 === 0) ? '#e9e0cf' : '#c9a99a'; g.fillRect((i % 2) * q, Math.floor(i / 2) * q, q, q)
    g.save(); g.beginPath(); g.rect((i % 2) * q, Math.floor(i / 2) * q, q, q); g.clip()
    g.strokeStyle = 'rgba(90,70,60,0.13)'; g.lineWidth = 1.2
    for (let k = 0; k < 9; k++) { const x = (i % 2) * q + rnd() * q, y = Math.floor(i / 2) * q + rnd() * q; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 60, y + 20, x + 20, y + 90, x + 110 * (rnd() - 0.3), y + 130); g.stroke() }
    g.restore()
  }
  g.strokeStyle = 'rgba(60,45,40,0.5)'; g.lineWidth = 3; g.strokeRect(0, 0, 512, 512); g.beginPath(); g.moveTo(256, 0); g.lineTo(256, 512); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke()
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY)
  return t
}

/** A w x h metre quad facing +z showing the atlas rectangle (uv per THREE's flipped canvas). */
export function quad(w: number, h: number, [x, y, pw, ph]: Rect, geo: THREE.BufferGeometry = new THREE.PlaneGeometry(w, h)) {
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x + uv.getX(i) * pw) / AW, 1 - (y + (1 - uv.getY(i)) * ph) / AW)
  return geo
}
