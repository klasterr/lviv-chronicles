import * as THREE from 'three'
import { Game } from './game'
import { Player } from './player/player'
import { Sitting } from './player/sitting'
import { Scooters } from './world/scooters'
import { Grandpas } from './world/grandpas'
import { buildCity, type CityData } from './world/city'
import { loadMaterials } from './world/materials'
import { addProps } from './world/props'
import { addAvenue } from './world/avenue'
import { addSky } from './world/sky'
import { mark, perfReport } from './perf'

const shadows = !location.search.includes('noshadow')
const game = new Game(shadows)
const msg = document.getElementById('msg')!
const overlay = document.getElementById('overlay')!

const [mats, data] = await Promise.all([loadMaterials(), fetch('city.json').then((r) => r.json() as Promise<CityData>)])
mark('assetsLoaded')
const city = buildCity(data, mats, { shadows })
game.colliders = city.colliders
game.scene.add(city.group)
mark('cityBuilt')
const props = addProps(data, game.scene, city.colliders, mats, shadows)
const avenue = addAvenue(data, game.scene, city.colliders, shadows) // photo facades, McDonald's, shop signs, OSM furniture

mark('propsBuilt')
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mats.ground)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = shadows
ground.renderOrder = 1 // drawn after buildings/roads: early-z skips the pixels they cover (the PBR ground is the most expensive overdraw)
ground.geometry.attributes.uv.array.forEach((_, i, a) => ((a as Float32Array)[i] *= 4000)) // UVs in metres
game.scene.add(ground)

const sky = addSky(game.scene, game.camera, shadows)
const player = new Player(game.camera, game.renderer.domElement, game.colliders, city.bounds, data.spawn)
const grandpas = new Grandpas(data, game.scene, city.colliders, player)
game.systems.push(player, new Sitting(player, game.camera, city.colliders), new Scooters(data, game.scene, player), grandpas, sky.system, props, avenue)
// compile shaders and upload textures behind the loading screen instead of stalling the first seconds of play
await game.renderer.compileAsync(game.scene, game.camera)
game.frame(0)
mark('warmed')

msg.innerHTML = 'Натисніть, щоб почати<br><small>WASD — рух, Shift — біг, Space — стрибок<br>F (або двічі Space) — політ: Space вгору, C вниз<br>Клік по лавці — сісти<br>Самокати Bolt (парковки біля фонтану й пам’ятника Шевченку): E — сісти / злізти, R — відправити на парковку<br>Шахи: сядьте на лавку навпроти дідуся (клік), G — зіграти<br>Esc — пауза</small><br><br><small style="opacity:.7">Фото фасадів: Wikimedia Commons, CC BY-SA 4.0 (автори — у /photos/CREDITS.txt) · дані © OpenStreetMap contributors</small>'
overlay.onclick = () => player.controls.lock()
player.controls.addEventListener('lock', () => (overlay.style.display = 'none'))
player.controls.addEventListener('unlock', () => { if (!grandpas.chessOpen) overlay.style.display = 'grid' }) // the chess board releases the pointer on purpose

const hud = document.getElementById('hud')!
let frames = 0, t0 = performance.now()
mark('ready')
game.start(() => {
  if (++frames < 30) return
  const now = performance.now()
  const i = game.renderer.info.render
  hud.textContent = `${Math.round(frames * 1000 / (now - t0))} fps · ${game.pixelRatio}x · ${i.calls} draws · ${(i.triangles / 1000).toFixed(0)}k tris`
  frames = 0; t0 = now
})
;(window as any).game = game // debugging
;(window as any).perfReport = () => perfReport(game) // npm run perf
