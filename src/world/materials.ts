import * as THREE from 'three'

export const BAY_W = 3.2   // metres of wall per facade tile (one window bay)
export const FLOOR_H = 3.3 // metres per storey

const loader = new THREE.TextureLoader()
const load = (url: string, srgb: boolean, tileM: number, repeatMul = 1) =>
  new Promise<THREE.Texture>((res) => {
    const t = loader.load(url, () => res(t))
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.anisotropy = srgb ? 8 : 4 // normal/roughness maps are low-contrast: half the filtering cost
    t.repeat.set(repeatMul / tileM, repeatMul / tileM) // UVs are metres
  })

async function pbr(name: string, tileM: number, repeatMul = 1, params: THREE.MeshStandardMaterialParameters = {}) {
  const [map, normalMap, roughnessMap] = await Promise.all([
    load(`tex/${name}_color.webp`, true, tileM, repeatMul),
    load(`tex/${name}_normal.webp`, false, tileM, repeatMul),
    load(`tex/${name}_rough.webp`, false, tileM, repeatMul),
  ])
  return new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap, ...params })
}

export type Kind = 'ground' | 'mid' | 'top'

/** Resolution of one facade tile (1 bay x 1 storey = 3.2 x 3.3 m). 1024 = 320 px/m. GPU cost: 9 layers x res^2 x 4 B x 1.33. */
export const FACADE_RES = 512
/** Extra facade tiles for individual buildings. Register BEFORE loadMaterials() runs (module top level is fine); the painter gets a canvas that is
 *  already filled with the plaster texture (S x S px = 1 bay x 1 storey). Look them up with mats.facadeLayer(name). Same mesh, no extra draw call. */
export const extraFacadeTiles: Record<string, (g: CanvasRenderingContext2D, S: number) => void> = {}

/** One facade tile (1 bay x 1 storey): photo plaster + historicist details. kind: rusticated ground floor / middle storey / top storey with cornice. */
function facadeTile(style: number, kind: Kind, plaster: HTMLImageElement) {
  const S = FACADE_RES, c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d', { willReadFrequently: true })! // CPU canvas: the pixels are read back into the texture array
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.drawImage(plaster, i * S / 3, j * S / 3, S / 3, S / 3) // 3x3 repeats, seamless

  const path = (cx: number, top: number, w: number, h: number, arch: boolean, p: number) => { // p = outward padding
    const x = cx - w / 2
    g.beginPath()
    if (arch) { g.moveTo(x - p, top + h + p); g.lineTo(x - p, top + w / 2); g.arc(cx, top + w / 2, w / 2 + p, Math.PI, 0); g.lineTo(x + w + p, top + h + p) }
    else g.rect(x - p, top - p, w + 2 * p, h + 2 * p)
    g.closePath()
  }
  const glass = (cx: number, top: number, w: number, h: number, arch: boolean, panes: boolean) => {
    const x = cx - w / 2
    g.fillStyle = 'rgba(0,0,0,0.55)'; path(cx, top, w, h, arch, S * 0.008); g.fill() // reveal shadow
    const gl = g.createLinearGradient(0, top, 0, top + h)
    gl.addColorStop(0, '#34424f'); gl.addColorStop(1, '#788e9e')
    g.fillStyle = gl; path(cx, top, w, h, arch, 0); g.fill()
    if (!panes) return
    g.save(); path(cx, top, w, h, arch, 0); g.clip()
    g.strokeStyle = '#e4ddcc'; g.lineWidth = S * 0.012
    g.strokeRect(x, top, w, h)
    g.beginPath(); g.moveTo(cx, top); g.lineTo(cx, top + h); g.moveTo(x, top + h * 0.33); g.lineTo(x + w, top + h * 0.33); g.stroke()
    g.restore()
  }
  const win = (cx: number, top: number, w: number, h: number, arch: boolean, pediment: boolean) => {
    const x = cx - w / 2
    g.fillStyle = 'rgba(255,255,255,0.5)'; path(cx, top, w, h, arch, S * 0.03); g.fill() // surround
    if (pediment) {
      g.fillStyle = 'rgba(255,255,255,0.55)'
      g.beginPath(); g.moveTo(x - S * 0.045, top - S * 0.03); g.lineTo(cx, top - S * 0.12); g.lineTo(x + w + S * 0.045, top - S * 0.03); g.closePath(); g.fill()
      g.fillStyle = 'rgba(0,0,0,0.18)'
      g.beginPath(); g.moveTo(x - S * 0.01, top - S * 0.035); g.lineTo(cx, top - S * 0.095); g.lineTo(x + w + S * 0.01, top - S * 0.035); g.closePath(); g.fill()
    }
    glass(cx, top, w, h, arch, true)
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x - S * 0.035, top + h + S * 0.025, w + S * 0.07, S * 0.026) // sill
    const sh = g.createLinearGradient(0, top + h + S * 0.05, 0, top + h + S * 0.12)
    sh.addColorStop(0, 'rgba(0,0,0,0.3)'); sh.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = sh; g.fillRect(x - S * 0.035, top + h + S * 0.05, w + S * 0.07, S * 0.07)
  }

  if (kind === 'ground') {
    // rustication: horizontal joints + staggered vertical joints
    const row = S * 0.125
    for (let r = 0; r < 8; r++) {
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(0, r * row, S, S * 0.007)
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, r * row + S * 0.007, S, S * 0.005)
      for (let x = (r % 2) * S * 0.25 + S * 0.125; x < S; x += S * 0.5) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, r * row, S * 0.006, row) }
    }
    if (style === 0) { // shopfront with stone surround
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(S * 0.14, S * 0.16, S * 0.72, S * 0.7)
      glass(S / 2, S * 0.2, S * 0.64, S * 0.62, false, false)
      g.fillStyle = '#d9d2c0'; g.fillRect(S * 0.18, S * 0.2 + S * 0.62 * 0.28, S * 0.64, S * 0.014) // transom
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(S * 0.12, S * 0.86, S * 0.76, S * 0.02)
    } else if (style === 1) { // arched portal with wooden door
      g.fillStyle = 'rgba(255,255,255,0.55)'; path(S / 2, S * 0.12, S * 0.4, S * 0.88, true, S * 0.04); g.fill()
      g.fillStyle = '#4b3626'; path(S / 2, S * 0.12, S * 0.4, S * 0.88, true, 0); g.fill()
      g.fillStyle = '#6a7d8c'; g.beginPath(); g.arc(S / 2, S * 0.12 + S * 0.2, S * 0.15, Math.PI, 0); g.closePath(); g.fill() // fanlight
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(S / 2 - S * 0.004, S * 0.34, S * 0.008, S * 0.66)
    } else { // two small barred windows
      win(S * 0.3, S * 0.3, S * 0.18, S * 0.36, false, false); win(S * 0.7, S * 0.3, S * 0.18, S * 0.36, false, false)
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, S * 0.955, S, S * 0.045) // plinth shadow
  } else {
    if (style === 0) win(S / 2, S * 0.26, S * 0.28, S * 0.5, false, kind === 'mid')
    else if (style === 1) win(S / 2, S * 0.2, S * 0.28, S * 0.56, true, false)
    else { win(S * 0.32, S * 0.26, S * 0.17, S * 0.46, false, false); win(S * 0.68, S * 0.26, S * 0.17, S * 0.46, false, false) }
    if (kind === 'top') { // crowning cornice with dentils
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(0, 0, S, S * 0.05)
      for (let x = 0; x < S; x += S / 24) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + S / 96, S * 0.05, S / 48, S * 0.03) }
      const sh = g.createLinearGradient(0, S * 0.08, 0, S * 0.16)
      sh.addColorStop(0, 'rgba(0,0,0,0.3)'); sh.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = sh; g.fillRect(0, S * 0.08, S, S * 0.08)
    }
  }
  // belt course at the bottom edge of upper storeys
  if (kind !== 'ground') {
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(0, S - S * 0.04, S, S * 0.022)
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, S - S * 0.018, S, S * 0.018)
  }

  return c
}

/** Packs square canvases into one 2D texture array (layer i = canvases[i]); a single sampler for every facade type. */
function tileArray(canvases: HTMLCanvasElement[]) {
  const S = canvases[0].width, row = S * 4, data = new Uint8Array(row * S * canvases.length)
  canvases.forEach((c, i) => {
    const px = c.getContext('2d')!.getImageData(0, 0, S, S).data
    for (let y = 0; y < S; y++) data.set(px.subarray(y * row, (y + 1) * row), i * row * S + (S - 1 - y) * row) // array textures cannot flipY
  })
  const t = new THREE.DataArrayTexture(data, S, S, canvases.length)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/** Plaster-based PBR material whose albedo comes from `tiles` (texture array) selected by the per-vertex `tile` attribute; uv in tile units. */
function facadeMaterial(base: THREE.MeshStandardMaterial, tiles: THREE.DataArrayTexture) {
  const m = base.clone() // shares the plaster normal/roughness maps (repeat 3x per bay tile)
  m.map = null
  m.onBeforeCompile = (sh) => {
    sh.uniforms.facadeTiles = { value: tiles }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tile; varying float vTile; varying vec2 vTileUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTile = tile; vTileUv = uv;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform highp sampler2DArray facadeTiles; varying float vTile; varying vec2 vTileUv;')
      .replace('#include <map_fragment>', 'diffuseColor *= texture(facadeTiles, vec3(vTileUv, floor(vTile + 0.5)));')
  }
  m.customProgramCacheKey = () => 'facade-tiles'
  return m
}

const img = (url: string) => new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = url })

export type Mats = Awaited<ReturnType<typeof loadMaterials>>

export async function loadMaterials() {
  const [sett, paving, asphalt, roofTile, grass, plasterImg, plasterBase] = await Promise.all([
    pbr('sett', 5), pbr('paving', 2.5), pbr('asphalt', 3), pbr('roof', 3, 1, { vertexColors: false }), pbr('grass', 2),
    img('tex/plaster_color.webp'), pbr('plaster', 1, 3, { vertexColors: true }),
  ])
  // facade tiles: layers 0-8 = (ground|mid|top) x style 0-2, then extraFacadeTiles in insertion order
  const kinds: Kind[] = ['ground', 'mid', 'top'], names = [...kinds.flatMap((k) => [0, 1, 2].map((i) => k + i)), ...Object.keys(extraFacadeTiles)]
  const canvases = kinds.flatMap((k) => [0, 1, 2].map((i) => facadeTile(i, k, plasterImg)))
  for (const paint of Object.values(extraFacadeTiles)) {
    const c = document.createElement('canvas'); c.width = c.height = FACADE_RES
    const g = c.getContext('2d', { willReadFrequently: true })!, S = FACADE_RES
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.drawImage(plasterImg, i * S / 3, j * S / 3, S / 3, S / 3)
    paint(g, S); canvases.push(c)
  }
  const facade = facadeMaterial(plasterBase, tileArray(canvases))
  /** Texture-array layer of a facade tile: kind + style (0-2) for the built-in ones, or the name of an extraFacadeTiles entry. */
  const facadeLayer = (kind: Kind | string, style = 0) => {
    const i = names.indexOf(kinds.includes(kind as Kind) ? kind + style : kind)
    if (i < 0) throw new Error('unknown facade tile ' + kind + style)
    return i
  }
  // Lviv: dark grey cobbles/granite, darker slabs, mix of dark tile and grey metal roofs
  sett.color.set(0x8e8f92); paving.color.set(0xb4afa6)
  const roofs = [roofTile.clone(), asphalt.clone()]
  roofs[0].color.set(0xa07868); roofs[1].color.set(0x9aa0a8)

  // roads: separate material per (surface, layer) so polygonOffset resolves z-fighting between overlapping ways
  const base: Record<string, THREE.MeshStandardMaterial> = { sett, paving, asphalt }
  const cache = new Map<string, THREE.MeshStandardMaterial>()
  const road = (surface: string, layer: number) => {
    const s = surface === 'cycleway' ? 'asphalt' : surface === 'sett' || surface === 'cobblestone' ? 'sett'
      : surface === 'asphalt' ? 'asphalt'
      : surface ? 'paving' : layer === 0 ? 'asphalt' : 'paving'
    const key = (surface === 'cycleway' ? 'cycle' : s) + layer
    let m = cache.get(key)
    if (!m) {
      m = base[s].clone()
      if (surface === 'cycleway') m.color.set(0xa4503f) // Lviv cycle lanes are red asphalt (visible along the avenue in 2023-25 photos)
      m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = -(layer + 1)
      cache.set(key, m)
    }
    return m
  }
  // ground shares the cobble textures (UVs in metres); pushed back so roads/footways win
  const ground = sett.clone()
  ground.polygonOffset = true; ground.polygonOffsetFactor = ground.polygonOffsetUnits = 1
  // boulevard surfaces drawn above roads/footways: light-grey granite slabs and lawn
  const over = (m: THREE.MeshStandardMaterial, layer: number) => { m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = -layer; return m }
  const granite = over(paving.clone(), 6); granite.color.set(0xd6d6d4)
  const lawn = over(grass, 7); lawn.color.set(0xb8c9a0)
  return { facade, facadeLayer, roofs, ground, road, granite, lawn }
}
