// Right-sizes public/tex/*.webp in place (idempotent): GPU memory = w*h*4*1.33 per map, whatever the file size.
// Roughness is low-frequency, normals and far/rarely-seen colours survive 512 px; walkable cobbles (sett/paving) keep their colour and normal size.
// plaster_color is only painted into the CPU-side facade canvas (materials.ts), never uploaded as is.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'public', 'tex')
const MAX = (name) => {
  const [mat, kind] = name.replace('.webp', '').split('_')
  if (kind === 'rough') return 512
  if (mat === 'sett' || mat === 'paving' || mat === 'plaster' && kind === 'color') return 1024
  return 512
}
let before = 0, after = 0
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.webp'))) {
  const file = path.join(dir, f), buf = fs.readFileSync(file), meta = await sharp(buf).metadata(), max = MAX(f)
  before += buf.length
  if (Math.max(meta.width, meta.height) <= max) { after += buf.length; continue }
  const out = await sharp(buf).resize({ width: max, height: max, fit: 'inside' }).webp({ quality: 82 }).toBuffer()
  fs.writeFileSync(file, out); after += out.length
  console.log(f, `${meta.width}x${meta.height} -> max ${max}`, `${(buf.length / 1024) | 0} -> ${(out.length / 1024) | 0} KB`)
}
console.log(`textures: ${(before / 1024) | 0} KB -> ${(after / 1024) | 0} KB`)
