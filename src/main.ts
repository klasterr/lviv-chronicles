import * as THREE from 'three'
import { Game } from './game'
import { Player } from './player/player'
import { TouchControls } from './player/touch'
import { isTouch } from './device'
import { Sitting } from './player/sitting'
import { Scooters } from './world/scooters'
import { Grandpas } from './world/grandpas'
import { buildCity, type CityData } from './world/city'
import { loadMaterials } from './world/materials'
import { addProps } from './world/props'
import { addAvenue, wallFrame } from './world/avenue'
import { FRONT35 } from './world/avenue/ground-front'
import { Restaurant } from './restaurant/restaurant'
import { Shops } from './shops/shops'
import { Opera } from './opera/opera'
import { Items } from './items/items'
import { Musician } from './musician/musician'
import { BalloonGirl } from './balloons/seller'
import { Animators } from './animators/animators'
import { addSky } from './world/sky'
import { sfx } from './audio/sfx'
import { AudioSystem } from './audio/system'
import { mark, perfReport } from './perf'

const shadows = !location.search.includes('noshadow') && (!isTouch || /[?&]shadow\b/.test(location.search)) // phones: no shadow map unless ?shadow
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
const musician = new Musician(data, game.scene, city.colliders, player) // street guitarist by the Shevchenko monument
const sitting = new Sitting(player, game.camera, city.colliders), scooters = new Scooters(data, game.scene, player)
const items = new Items(game.scene, game.camera, player, city.colliders) // things you can pick up, carry and throw
// McDonald's at проспект Свободи 35: its painted door leads into a separate interior room (restaurant/)
const f35 = data.street?.fronts?.['way/171080874']
const restaurant = f35 && (() => {
  const fr = wallFrame(f35), d = fr.at((FRONT35.mcd.door[0] + FRONT35.mcd.door[1]) / 2, 0, 0)
  return new Restaurant(game.scene, city.colliders, player, game.camera, city.bounds, { x: d.x, z: d.z, nx: f35.n[0], nz: f35.n[1] }, shadows, items)
})()
game.systems.push(player, items, sitting, scooters, grandpas, musician, sky.system, props, avenue)
const balloons = new BalloonGirl(data, game.scene, city.colliders, player, items) // balloon seller by the dry fountain (balloons/)
game.systems.push(balloons)
const animators = new Animators(data, game.scene, player, game.camera, shadows, items, () => [...scooters.act, ...musician.act, ...balloons.act]) // donkey, Sonic and Labubu costumes strolling the boulevard: hug (E) / handshake (H) (animators/)
game.systems.push(animators)
if (restaurant) game.systems.push(restaurant)
const shops = new Shops(game.scene, city.colliders, player, game.camera, city.bounds, data.street?.fronts, shadows, items) // the bookshop, coffee shop, pharmacy and Viennese cafe you can walk into (shops/)
game.systems.push(shops)
const opera = Opera.make(game.scene, city.colliders, player, game.camera, city.bounds, data, shadows, items) // the Opera and Ballet Theatre: its main entrance leads into the hall (opera/)
if (opera) game.systems.push(opera)
if (sfx.enabled) game.systems.push(new AudioSystem({ player, camera: game.camera, items, musician, restaurant: restaurant || undefined, fountain: data.street?.fountain, overlay })) // procedural sound (audio/); starts on the first click
// phone: on-screen controls; the buttons are the systems' current actions (sit, scooter, chess); the menu button pauses
if (isTouch) game.systems.push(new TouchControls(player, () => [...sitting.act, ...scooters.act, ...grandpas.act, ...musician.act, ...balloons.act, ...animators.act, ...items.act, ...(restaurant?.act ?? []), ...shops.act, ...(opera?.act ?? [])], () => { player.touchActive = false; overlay.style.display = 'grid'; pausedAt = performance.now() }))
// compile shaders and upload textures behind the loading screen instead of stalling the first seconds of play
await game.renderer.compileAsync(game.scene, game.camera)
game.frame(0)
mark('warmed')

const TOUCH_MSG = 'Торкніться, щоб почати<br><small>Лівий палець — рух (до краю — біг), правий — огляд<br>Праворуч: стрибок, ✈ політ і кнопки дій (лавка, самокат Bolt, шахи, замовлення в McDonald’s)<br>☰ — пауза<br>Є звук: кроки, самокати, McDonald’s, гітарист (на iPhone вимкніть беззвучний режим)</small><br><br><small style="opacity:.7">Фото фасадів: Wikimedia Commons, CC BY-SA 4.0 · дані © OpenStreetMap contributors</small>'
msg.innerHTML = isTouch ? TOUCH_MSG : 'Натисніть, щоб почати<br><small>WASD — рух, Shift — біг, Space — стрибок<br>F (або двічі Space) — політ: Space вгору, C вниз<br>Клік по лавці — сісти<br>Самокати Bolt (парковки біля фонтану й пам’ятника Шевченку): E — сісти / злізти, R — відправити на парковку<br>Шахи: сядьте на лавку навпроти дідуся (клік), G — зіграти<br>McDonald’s: зайдіть у двері (проспект Свободи 35), E біля каси чи кіосків — замовлення<br>Музикант біля пам’ятника Шевченку: E біля кейса — чайові<br>M — звук увімк./вимк. (кроки, самокати, McDonald’s, гітарист)<br>Esc — пауза</small><br><br><small style="opacity:.7">Фото фасадів: Wikimedia Commons, CC BY-SA 4.0 (автори — у /photos/CREDITS.txt) · дані © OpenStreetMap contributors</small>'
// no pointer lock on a phone: tapping the start screen turns the touch controls on (and goes fullscreen / landscape where the browser allows it)
let pausedAt = 0
const startTouch = () => {
  if (performance.now() - pausedAt < 400) return // the click that follows the tap on the menu button lands on the pause screen it just opened
  overlay.style.display = 'none'; player.touchActive = true
  try { Promise.resolve(document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })).then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')).catch(() => {}) } catch { /* iOS has no fullscreen API */ }
}
// your name above your head for the other players; editable on the start / pause screen
const nick = Object.assign(document.createElement('input'), { maxLength: 16, placeholder: 'Ваше ім’я для інших гравців', value: localStorage.getItem('name') ?? '' })
nick.style.cssText = 'display:block;margin:14px auto 0;padding:6px 10px;width:240px;border-radius:6px;border:0;font:16px system-ui,sans-serif;text-align:center'
nick.onclick = (e) => e.stopPropagation() // not the click that starts the game
nick.onkeydown = nick.onkeyup = (e) => { e.stopPropagation(); if (e.key === 'Enter') nick.blur() } // typing must not walk the player
nick.onchange = () => { localStorage.setItem('name', nick.value.trim()); net?.rename(nick.value.trim() || 'Гість') }
// multiplayer (net/): loaded after start-up so it never delays the city; ?solo = alone, ?room=xyz = a private room
let net: import('./net/net').Net | undefined
if (!/[?&]solo\b/.test(location.search)) {
  msg.append(nick)
  import('./net/net').then(({ Net }) => {
    const room = new URLSearchParams(location.search).get('room')?.slice(0, 40) || 'main'
    net = new Net({ scene: game.scene, camera: game.camera, shadows, player, sitting, scooters, items }, nick.value.trim() || 'Гість', room)
    game.systems.push(net)
  }).catch((e) => console.warn('multiplayer is off:', e)) // e.g. no WebRTC in this browser
}
overlay.onclick = () => { sfx.unlock(); isTouch ? startTouch() : player.controls.lock() } // the click is the user gesture that lets audio start
player.controls.addEventListener('lock', () => { overlay.style.display = 'none'; sfx.unlock() })
player.controls.addEventListener('unlock', () => { if (!grandpas.chessOpen && !restaurant?.menuOpen && !shops.menuOpen) overlay.style.display = 'grid' }) // the chess board releases the pointer on purpose

const hud = document.getElementById('hud')!
let frames = 0, t0 = performance.now()
mark('ready')
game.start(() => {
  if (++frames < 30) return
  const now = performance.now()
  const i = game.renderer.info.render
  hud.textContent = `${Math.round(frames * 1000 / (now - t0))} fps · ${game.pixelRatio}x · ${i.calls} draws · ${(i.triangles / 1000).toFixed(0)}k tris` + (net ? ` · онлайн: ${net.online + 1}` : '')
  frames = 0; t0 = now
})
;(window as any).game = game // debugging
;(window as any).sfx = sfx
;(window as any).perfReport = () => perfReport(game) // npm run perf
