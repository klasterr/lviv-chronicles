// Downloads CC BY-SA photos from Wikimedia Commons and turns them into landmark textures in public/photos/ (opera, town-hall tower)
// and the rectified avenue facade atlas (public/photos/facades.webp + src/world/avenue/facades.generated.ts, config in scripts/facade-config.ts).
// Crop boxes are in a 1920px-wide reference frame (scaled to the original's real width).
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { FACADES, type FacadeCfg } from './facade-config'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const UA = 'lviv-walk-prototype/0.1 (local dev)'
const API = 'https://commons.wikimedia.org/w/api.php'

const PHOTOS = [
  { out: 'opera_front', title: 'Lviv Theatre of Opera and Ballet.jpg', crop: [315, 95, 1440, 1100], keyOutSky: true, wire: [[0, 386], [1920, 300]], maxW: 2048 },
  { out: 'tower_mid', title: 'Lviv - Cityhall tower with roofs.jpg', crop: [614, 602, 198, 832], keyOutSky: false, wire: null, maxW: 512 },
] as const

mkdirSync('public/photos', { recursive: true })
const dir = mkdtempSync(join(tmpdir(), 'photos-')) // fresh dir for untrusted downloads
const credits: string[] = []

for (const p of PHOTOS) {
  const meta = await (await fetch(`${API}?action=query&titles=${encodeURIComponent('File:' + p.title)}&prop=imageinfo&iiprop=url|extmetadata&format=json`, { headers: { 'User-Agent': UA } })).json()
  const ii = (Object.values(meta.query.pages)[0] as any).imageinfo[0]
  const md = ii.extmetadata
  if (!/CC BY-SA|CC BY |CC0|Public domain/i.test(md.LicenseShortName.value)) throw new Error(`unexpected licence for ${p.title}: ${md.LicenseShortName.value}`)
  credits.push(`${p.out}: "${p.title}" by ${md.Artist.value.replace(/<[^>]+>/g, '')}, ${md.LicenseShortName.value} (${md.LicenseUrl?.value ?? ''}), cropped/edited. Source: ${ii.descriptionurl}`)

  const file = join(dir, p.out + '.jpg')
  writeFileSync(file, Buffer.from(await (await fetch(ii.url, { headers: { 'User-Agent': UA } })).arrayBuffer()))
  const oriented = await sharp(file).rotate().toBuffer() // apply EXIF orientation before cropping
  const full = await sharp(oriented).metadata()
  const k = full.width! / 1920
  const [cx, cy, cw, ch] = p.crop.map((v) => Math.round(v * k))
  const raw = await sharp(oriented).extract({ left: cx, top: cy, width: cw, height: ch }).resize({ width: Math.min(p.maxW, cw) }).removeAlpha().modulate(p.out === 'tower_mid' ? { saturation: 0.55, brightness: 1.12 } : {}).raw().toBuffer({ resolveWithObject: true })
  const info = raw.info
  const data = Buffer.alloc(info.width * info.height * 4, 255) // explicit RGBA
  for (let i = 0; i < info.width * info.height; i++) for (let c = 0; c < 3; c++) data[i * 4 + c] = raw.data[i * info.channels + c]
  const { width: W, height: H } = info, s = W / (p.crop[2])

  if (p.wire) { // paint over one overhead wire: copy pixels from 16px above/below the line
    const [[x0, y0], [x1, y1]] = p.wire.map(([x, y]) => [(x - p.crop[0]) * s, (y - p.crop[1]) * s])
    for (let x = 0; x < W; x++) {
      const yl = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
      for (let dy = -8; dy <= 8; dy++) for (let c = 0; c < 3; c++) {
        const y = Math.round(yl + dy), a = Math.round(yl - 16), b = Math.round(yl + 16)
        if (y < 0 || y >= H || a < 0 || b >= H) continue
        data[(y * W + x) * 4 + c] = (data[(a * W + x) * 4 + c] + data[(b * W + x) * 4 + c]) >> 1
      }
    }
  }

  if (p.keyOutSky) { // sky = neutral light-grey pixels connected to the image border
    const sky = new Uint8Array(W * H), q: number[] = []
    const isSky = (i: number) => { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; return Math.max(r, g, b) - Math.min(r, g, b) <= 14 && Math.min(r, g, b) >= 170 }
    const push = (i: number) => { if (!sky[i] && isSky(i)) { sky[i] = 1; q.push(i) } }
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x) }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1) }
    while (q.length) {
      const i = q.pop()!, x = i % W
      if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < W * (H - 1)) push(i + W)
    }
    const solid = Buffer.alloc(W * H); for (let i = 0; i < W * H; i++) solid[i] = sky[i] ? 0 : 255
    // blur+threshold = morphological opening: thin wires over the sky vanish, statues/pediment stay
    const alpha = await sharp(solid, { raw: { width: W, height: H, channels: 1 } }).blur(2.4).threshold(150).blur(0.8).extractChannel(0).raw().toBuffer()
    for (let i = 0; i < W * H; i++) data[i * 4 + 3] = alpha[i]
  }
  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 86, alphaQuality: 90 }).toFile(`public/photos/${p.out}.webp`)
  console.log(p.out, `${W}x${H}`)
}
// ---- avenue facades: rectify each photo into a flat panel, pack into one atlas, emit src/world/avenue/facades.generated.ts.
// Needs public/city.json (run `npm run prepare-data` first) for the wall lengths of the footprints.
const PX = 32 // atlas pixels per metre of wall
const ATLAS_W = 2048, GUT = 6
const city = JSON.parse(readFileSync('public/city.json', 'utf8'))
type Panel = { cfg: FacadeCfg; w: number; h: number; rgba: Buffer; x: number; y: number }
const panels: Panel[] = []

/** Heckbert unit-square -> quad projective map; returns (s,t) -> source (x,y). */
function quadMap(q: number[][]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dy1 * dx2, g = (dx3 * dy2 - dy3 * dx2) / den, h = (dx1 * dy3 - dy1 * dx3) / den
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3
  return (s: number, t: number) => { const w = g * s + h * t + 1; return [(a * s + b * t + x0) / w, (d * s + e * t + y0) / w] }
}

/** Sky = pixels connected to the border that look like sky (neutral light grey, or saturated blue); optionally dark foliage too. */
async function keySky(data: Buffer, W: number, H: number, mode: 'neutral' | 'blue', leavesRows: number) {
  const sky = new Uint8Array(W * H), q: number[] = []
  const isSky = (i: number) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], row = Math.floor(i / W)
    if (mode === 'neutral') return Math.max(r, g, b) - Math.min(r, g, b) <= 14 && Math.min(r, g, b) >= 170
    if (b > r + 40 && b > 130) return true
    return row < leavesRows && Math.max(r, g, b) < 75 && g >= r - 6 // foliage hanging into the sky area above the facade
  }
  const push = (i: number) => { if (!sky[i] && isSky(i)) { sky[i] = 1; q.push(i) } }
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x) }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1) }
  while (q.length) { const i = q.pop()!, x = i % W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < W * (H - 1)) push(i + W) }
  const solid = Buffer.alloc(W * H); for (let i = 0; i < W * H; i++) solid[i] = sky[i] ? 0 : 255
  const alpha = await sharp(solid, { raw: { width: W, height: H, channels: 1 } }).blur(2.2).threshold(150).blur(0.8).extractChannel(0).raw().toBuffer()
  for (let i = 0; i < W * H; i++) data[i * 4 + 3] = alpha[i]
}

for (const cfg of FACADES) {
  const front = city.street.fronts[cfg.osm]
  if (!front) throw new Error(`no frontage for ${cfg.osm}; run prepare-data`)
  const meta = await (await fetch(`${API}?action=query&titles=${encodeURIComponent('File:' + cfg.title)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1920&format=json`, { headers: { 'User-Agent': UA } })).json()
  const ii = (Object.values(meta.query.pages)[0] as any).imageinfo[0], md = ii.extmetadata
  if (!/CC BY-SA|CC BY |CC0|Public domain/i.test(md.LicenseShortName.value)) throw new Error(`unexpected licence for ${cfg.title}: ${md.LicenseShortName.value}`)
  credits.push(`${cfg.key}: "${cfg.title}" (${md.DateTimeOriginal?.value ?? 'date n/a'}) by ${md.Artist.value.replace(/<[^>]+>/g, '')}, ${md.LicenseShortName.value} (${md.LicenseUrl?.value ?? ''}), rectified/cropped/edited as the upper-floor facade of Svobody Ave ${cfg.houseNo}. Source: ${ii.descriptionurl}`)
  const file = join(dir, cfg.key + '.jpg')
  writeFileSync(file, Buffer.from(await (await fetch(ii.thumburl, { headers: { 'User-Agent': UA } })).arrayBuffer()))
  const src = await sharp(file).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const SW = src.info.width, SH = src.info.height, k = SW / 1920, map = quadMap(cfg.quad.map(([x, y]) => [x * k, y * k]))
  const px = (x: number, y: number, c: number) => { // bilinear
    x = Math.min(SW - 1.001, Math.max(0, x)); y = Math.min(SH - 1.001, Math.max(0, y))
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = (y0 * SW + x0) * 3 + c, d = src.data
    return d[i] * (1 - fx) * (1 - fy) + d[i + 3] * fx * (1 - fy) + d[i + SW * 3] * (1 - fx) * fy + d[i + SW * 3 + 3] * fx * fy
  }
  const w = Math.round(front.len * PX), h = Math.round((1 + cfg.topExtra) * cfg.heightM * PX)
  const rgba = Buffer.alloc(w * h * 4, 255)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const acc = [0, 0, 0]
    for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const [sx, sy] = map((i + ox) / w, ((j + oy) / h) * (1 + cfg.topExtra) - cfg.topExtra)
      for (let c = 0; c < 3; c++) acc[c] += px(sx, sy, c) / 4
    }
    for (let c = 0; c < 3; c++) rgba[(j * w + i) * 4 + c] = Math.round(acc[c])
  }
  await keySky(rgba, w, h, cfg.sky, cfg.leaves ? Math.round(cfg.topExtra * cfg.heightM * PX) : 0)
  panels.push({ cfg, w, h, rgba, x: 0, y: 0 })
}
{ // shelf packing, tallest first
  let x = 0, y = 0, rowH = 0
  for (const p of [...panels].sort((a, b) => b.h - a.h)) {
    if (x + p.w + GUT > ATLAS_W) { x = 0; y += rowH + GUT; rowH = 0 }
    p.x = x; p.y = y; x += p.w + GUT; rowH = Math.max(rowH, p.h)
  }
  const H = Math.ceil((y + rowH) / 16) * 16
  const atlas = Buffer.alloc(ATLAS_W * H * 4, 0)
  for (const p of panels) for (let j = 0; j < p.h; j++) p.rgba.copy(atlas, ((p.y + j) * ATLAS_W + p.x) * 4, j * p.w * 4, (j + 1) * p.w * 4)
  await sharp(atlas, { raw: { width: ATLAS_W, height: H, channels: 4 } }).webp({ quality: 80, alphaQuality: 90 }).toFile('public/photos/facades.webp')
  const rec = Object.fromEntries(panels.map((p) => [p.cfg.osm, { key: p.cfg.key, x: p.x, y: p.y, w: p.w, h: p.h, hm: +(p.h / PX).toFixed(2), groundH: p.cfg.groundH, eaveM: p.cfg.eaveM, tint: p.cfg.tint, roofColor: p.cfg.roofColor, alpha: p.cfg.topExtra > 0 }]))
  writeFileSync('src/world/avenue/facades.generated.ts', `// generated by scripts/prepare-photos.ts - do not edit\nexport const FACADE_ATLAS = { url: 'photos/facades.webp', w: ${ATLAS_W}, h: ${H} }\nexport const FACADE_PANELS: Record<string, { key: string; x: number; y: number; w: number; h: number; hm: number; groundH: number; eaveM: number; tint: number; roofColor: number; alpha: boolean }> = ${JSON.stringify(rec, null, 1)}\n`)
  console.log('facades atlas', ATLAS_W, 'x', H)
}

credits.push(
  `reference only (looked at to hand-draw the McDonald's / Svobody 35 ground floor, not used as textures): "Пасаж Феллерів.jpg" (2023-01-31, Vikcos75, CC BY-SA 4.0), "Пасаж Феллерів 2025.jpg" (2025-11-30, Бондар Володимир, CC BY-SA 4.0), "35 Prospekt Svobody, Lviv (01).jpg" (2012, Aeou, CC BY 3.0), all Wikimedia Commons`,
  'map data: (c) OpenStreetMap contributors, ODbL (export.geojson, data/osm-poi.json); PBR textures in public/tex: ambientCG, CC0',
)
writeFileSync('public/photos/CREDITS.txt', credits.join('\n') + '\n')
console.log(credits.join('\n'))
