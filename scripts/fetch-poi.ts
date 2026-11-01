// Downloads OSM point features (POIs, street furniture, trees) for the bbox of export.geojson from the Overpass API
// into data/osm-poi.json (committed; ODbL, (c) OpenStreetMap contributors). prepare-city.ts reads that file, so the
// data pipeline stays offline/reproducible. Run: npx tsx scripts/fetch-poi.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const gj = JSON.parse(readFileSync('export.geojson', 'utf8'))
let s = 90, n = -90, w = 180, e = -180
const scan = (c: any) => (typeof c[0] === 'number' ? ((w = Math.min(w, c[0])), (e = Math.max(e, c[0])), (s = Math.min(s, c[1])), (n = Math.max(n, c[1]))) : c.forEach(scan))
for (const f of gj.features) scan(f.geometry.coordinates)
const bb = `${s},${w},${n},${e}`

const KEYS = ['amenity', 'shop', 'tourism', 'highway', 'railway', 'natural', 'man_made', 'historic', 'barrier', 'emergency', 'leisure', 'crossing', 'crossing:markings']
const ql = `[out:json][timeout:120];(${KEYS.map((k) => `node["${k}"](${bb});`).join('')});out tags center;`
const KEEP = new Set(['name', 'name:uk', 'brand', 'amenity', 'shop', 'tourism', 'highway', 'railway', 'natural', 'man_made', 'historic', 'barrier', 'emergency', 'leisure', 'crossing', 'crossing:markings', 'genus', 'species', 'leaf_type', 'leaf_cycle', 'backrest', 'material', 'seats', 'bench', 'addr:housenumber', 'colour', 'artwork_type', 'memorial', 'shelter', 'bin', 'capacity'])

let text = ''
for (let i = 0, wait = 15000; i < 6; i++, wait *= 2) {
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { 'User-Agent': 'lviv-walk-prototype/0.1 (local dev)', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(ql),
  })
  if (r.ok) { text = await r.text(); break }
  console.log('overpass', r.status, 'retrying in', wait / 1000, 's')
  await new Promise((res) => setTimeout(res, wait))
}
if (!text) throw new Error('overpass failed')
const els = JSON.parse(text).elements as any[]
const out = els.map((el) => ({
  lat: +(el.lat ?? el.center.lat).toFixed(7), lon: +(el.lon ?? el.center.lon).toFixed(7),
  t: Object.fromEntries(Object.entries(el.tags ?? {}).filter(([k]) => KEEP.has(k))),
}))
mkdirSync('data', { recursive: true })
writeFileSync('data/osm-poi.json', JSON.stringify(out))
console.log('osm-poi.json', out.length, 'nodes, bbox', bb)
