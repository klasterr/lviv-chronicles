// export.geojson (OSM) -> public/city.json : metres, only the tags the game uses.
// Also reads data/osm-poi.json (OSM nodes: shops, benches, trees, crossings ... see fetch-poi.ts).
import { readFileSync, writeFileSync } from 'node:fs'
import { layoutAvenue } from './layout-avenue'
import { layoutPoi, type PoiNode } from './layout-poi'
import { findFront, frontFromVerts, type Front } from './frontage'
import { FACADES } from './facade-config'

const R = 6371008.8
const gj = JSON.parse(readFileSync('export.geojson', 'utf8'))
const poi: PoiNode[] = JSON.parse(readFileSync('data/osm-poi.json', 'utf8'))

// Projection origin = bbox centre. Equirectangular is fine for ~1 km.
let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
const scan = (c: any) => typeof c[0] === 'number'
  ? (minX = Math.min(minX, c[0]), maxX = Math.max(maxX, c[0]), minY = Math.min(minY, c[1]), maxY = Math.max(maxY, c[1]))
  : c.forEach(scan)
for (const f of gj.features) scan(f.geometry.coordinates)
const lon0 = (minX + maxX) / 2, lat0 = (minY + maxY) / 2
const k = Math.PI / 180
const proj = ([lon, lat]: number[]) => [
  +(R * (lon - lon0) * k * Math.cos(lat0 * k)).toFixed(2),
  +(-R * (lat - lat0) * k).toFixed(2), // -Z is north
]

const WIDTH: Record<string, number> = {
  primary: 10, secondary: 8, secondary_link: 6, tertiary: 7, residential: 6, service: 3.5,
  pedestrian: 5, cycleway: 2.5, footway: 2, steps: 2, path: 1.5, platform: 3,
}
const LANE_W = 3.1 // metres per lane when OSM gives `lanes` (avenue: 3 lanes west carriageway = 9.3 m, 2 lanes east = 6.2 m)
const AVENUE = 'проспект Свободи'

const buildings: any[] = []
const roads: any[] = []
const tags: Record<string, any> = {}
let monumentRing: number[][] = []
const avenue: { k: string; p: number[][]; w: number }[] = [] // проспект Свободи carriageways, used for the spawn point
let skippedTunnel = 0
const laneMarks: number[][][] = [] // carriageways OSM tags with lane_markings=yes and >= 2 lanes: dashed centre line
for (const f of gj.features) {
  const p = f.properties, g = f.geometry
  tags[f.id] = p
  if (g.type === 'Polygon' && p.building) {
    const levels = parseFloat(p['building:levels'])
    const height = parseFloat(p.height)
    const sd = parseInt(p.start_date) // "1896", "1890s", "1895..1900": first number is enough
    buildings.push({
      id: String(f.id),
      r: g.coordinates.map((ring: number[][]) => ring.slice(0, -1).map(proj)),
      h: height || (levels ? levels * 3.3 : 0), // 0 = unknown, game picks a default
      lv: levels || 0,
      t: p.building,
      ...(sd ? { sd } : {}), // construction year: drives the facade style
      ...(p['roof:shape'] ? { rs: p['roof:shape'] } : {}),
      ...(p['building:colour'] ? { bc: p['building:colour'] } : {}),
    })
  } else if (f.id === 'way/356593298') { // pedestrian area in the middle of the avenue = Shevchenko monument plaza
    monumentRing = g.coordinates[0].map(proj)
  } else if (g.type === 'LineString' && p.highway in WIDTH) {
    if (p.tunnel && p.tunnel !== 'no') { skippedTunnel++; continue }
    const lanes = parseInt(p.lanes), w = lanes > 0 && !['footway', 'cycleway', 'steps', 'path', 'pedestrian', 'platform'].includes(p.highway) ? Math.max(3, lanes * LANE_W) : WIDTH[p.highway]
    roads.push({ p: g.coordinates.map(proj), k: p.highway, s: p.surface || '', w })
    if (p.lane_markings === 'yes' && lanes >= 2) laneMarks.push(roads[roads.length - 1].p)
    if (p.name === AVENUE) avenue.push({ k: p.highway, p: roads[roads.length - 1].p, w })
  }
}
const opera = buildings.find((b) => b.id === 'way/459807007')!.r[0]

// Street furniture of проспект Свободи, laid out from the GeoJSON geometry (see scripts/layout-avenue.ts)
const street: any = layoutAvenue(avenue, opera, monumentRing)
console.log('avenue', JSON.stringify(street.stats), 'monument', JSON.stringify(street.monument))

// Street-facing walls of the buildings with an avenue address (+ the photo-facade buildings): all geometry from the footprints
const lines = avenue.map((a) => a.p)
const fronts: Record<string, Front> = {}
for (const b of buildings) {
  if (tags[b.id]['addr:street'] !== AVENUE) continue
  const f = findFront(b.r[0], lines)
  if (f) fronts[b.id] = f
}
for (const fc of FACADES) {
  const b = buildings.find((q) => q.id === fc.osm)
  if (!b) throw new Error('facade building missing: ' + fc.osm)
  if (fc.verts) fronts[fc.osm] = frontFromVerts(b.r[0], fc.verts[0], fc.verts[1], lines)
  if (!fronts[fc.osm]) throw new Error('no frontage for ' + fc.osm)
}
street.fronts = fronts

// OSM points: shop signs, benches, bins, lamps, trees, crossings, bollards
const layer = layoutPoi(poi, proj, buildings, roads, lines, street, ['way/171080874'] /* Svobody 35 gets a hand-drawn ground floor (McDonald's) */)
street.signs = layer.signs; street.signTexts = layer.signTexts; street.osm = layer.osm; street.crossings = layer.crossings; street.bollards = layer.bollards; street.laneMarks = laneMarks
console.log('poi layer: signs', layer.signs.length, 'osm', JSON.stringify(Object.fromEntries(Object.entries(layer.osm).map(([k2, v]) => [k2, v.length]))), 'crossings', layer.crossings.length, 'bollards', layer.bollards.length)

writeFileSync('public/city.json', JSON.stringify({ spawn: street.spawn, buildings, roads, street }))
console.log(`buildings=${buildings.length} roads=${roads.length} tunnels skipped=${skippedTunnel}`)
