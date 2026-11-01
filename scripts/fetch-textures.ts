// Downloads CC0 PBR textures from ambientCG (1K JPG) and converts them to WebP in public/tex/.
import { mkdtempSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

const SET: Record<string, string> = {
  sett: 'PavingStones147', // fine grey granite setts (was 150, beige fan setts)
  paving: 'PavingStones109', // grey granite slabs like the avenue's pavements and boulevard (was 138, mossy blocks)
  asphalt: 'Asphalt031',
  plaster: 'Plaster001',
  roof: 'RoofingTiles014A',
  grass: 'Grass005',
}
const MAPS: Record<string, string> = { Color: 'color', NormalGL: 'normal', Roughness: 'rough' }

mkdirSync('public/tex', { recursive: true })
for (const [name, id] of Object.entries(SET)) {
  if (existsSync(`public/tex/${name}_color.webp`)) continue // already fetched
  const meta = await (await fetch(`https://ambientcg.com/api/v2/full_json?id=${id}&include=downloadData`)).json()
  const asset = meta.foundAssets[0]
  const link = asset.downloadFolders.default.downloadFiletypeCategories.zip.downloads
    .find((d: any) => d.attribute === '1K-JPG').downloadLink
  const dir = mkdtempSync(join(tmpdir(), `tex-${id}-`)) // fresh empty dir per archive
  const zip = join(dir, 'a.zip')
  writeFileSync(zip, Buffer.from(await (await fetch(link)).arrayBuffer()))
  execFileSync(process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar', ['-xf', zip, '-C', dir])
  for (const f of readdirSync(dir)) {
    const m = Object.keys(MAPS).find((k) => f.endsWith(`_${k}.jpg`))
    if (m) await sharp(join(dir, f)).webp({ quality: 82 }).toFile(`public/tex/${name}_${MAPS[m]}.webp`)
  }
  console.log(name, id, 'ok')
}
