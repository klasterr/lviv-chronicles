import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Colliders } from '../world/colliders'
import type { CityData } from '../world/city'
import type { Items } from '../items/items'
import { buildFigure } from '../interiors/figure'
import { isTouch, type Action } from '../device'
import { speechBubble } from '../bubble'
import { Balloon, COLOURS, balloonGeometry, floatAway } from './balloon'

const PRICE = 50     // ₴, narrative only: there is no wallet
const REACH = 2      // metres from her to buy
const FAR = 90       // beyond this she is hidden and not animated
const KID = 0.75     // figure scale: a child
const ARM = -0.8     // arm raised forward (rad about x), the hand holds the strings
const HAND = new THREE.Vector3(0.24, 1.43 - 0.62 * Math.cos(ARM), -0.62 * Math.sin(ARM)).multiplyScalar(KID) // figure.ts: shoulder pivot, hand 0.62 below it
const acc = (name: string) => name.toLowerCase().replace(/а$/, 'у').replace(/я$/, 'ю') // «червона» → «червону»
const LINES = [
  (n: string) => `Тримай ${acc(n)} кульку! З тебе ${PRICE} гривень.`,
  (n: string) => `${n} кулька — ${PRICE} ₴. Тримай міцно, бо полетить!`,
  (n: string) => `Ось ${acc(n)} кульку, найгарнішу! ${PRICE} гривень, дякую!`,
]

/** The bunch she holds: balloons on strings of 1-1.4 m fanning out from the hand (origin = hand). */
function bunch() {
  const up = new THREE.Vector3(0, 1, 0)
  return mergeGeometries(COLOURS.map(([c], i) => {
    const a = i * 2.4, tilt = 0.12 + 0.2 * (i % 3) // golden-angle fan
    const q = new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a)))
    return balloonGeometry(c, 1 + 0.06 * i).applyQuaternion(q)
  }))!
}

/**
 * A girl selling helium balloons by the dry fountain on the Opera square. Walk up (2 m) and press E (touch: `act`): she «sells» you one (no wallet, the price is said in a bubble),
 * a balloon of a random colour goes straight into your hands (Items.give). Q lets it go: it floats up and shrinks away (balloon.ts).
 */
export class BalloonGirl implements System {
  act: Action[] = []
  readonly position: THREE.Vector3
  private root = new THREE.Group()
  private bunch: THREE.Mesh
  private clock = 0
  private bubble = speechBubble('#e0508a', '18%')
  private hint = document.createElement('div')

  constructor(data: CityData, parent: THREE.Object3D, colliders: Colliders, private player: Player, private items: Items) {
    const f = data.street!.fountain, s = Math.sin(f.yaw), c = Math.cos(f.yaw), lx = -8, lz = 6 // west of the water (the scooters are east), towards the spawn
    this.position = new THREE.Vector3(f.x + lx * c + lz * s, 0, f.z - lx * s + lz * c)
    this.hint.style.cssText = 'position:fixed;left:50%;bottom:30%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none;text-align:center'
    document.body.append(this.hint)

    const { group, arm } = buildFigure({ shirt: 0xf06aa6, trousers: 0x3c7be0, shoes: 0xe8e8e8, hair: 0xd9a443, long: true }, true)
    group.scale.setScalar(KID); arm.rotation.x = ARM
    group.traverse((o) => { o.receiveShadow = true })
    this.bunch = new THREE.Mesh(bunch(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 }))
    this.bunch.position.copy(HAND); this.bunch.castShadow = true
    this.root.add(group, this.bunch)
    this.root.position.copy(this.position); this.root.rotation.y = f.yaw + 0.6 // faces the end of the fountain where you start
    parent.add(this.root)

    colliders.addBox(this.position.x, this.position.z, 0.3, Infinity)
    addEventListener('keydown', (e) => { if (e.code === 'KeyE' && !e.repeat) this.act[0]?.fire() })
  }

  /** Sell one balloon of a random colour straight into the hands; false if they are full. */
  buy() {
    const [color, name] = COLOURS[Math.floor(Math.random() * COLOURS.length)]
    if (!this.items.give(new Balloon(color, name))) return false
    this.bubble.say(LINES[Math.floor(Math.random() * LINES.length)](name), 4)
    return true
  }

  update(dt: number) {
    floatAway(dt)
    const pl = this.player, pos = pl.position
    this.bubble.tick(dt)
    this.act = []
    let text = ''
    if (pl.active && !pl.riding && !pl.seated && pos.y < 4 && Math.hypot(pos.x - this.position.x, pos.z - this.position.z) < REACH) {
      if (this.items.held.reduce((n, h) => n + h.hands, 0) >= 2) text = 'Руки зайняті'
      else {
        this.act = [{ label: `Купити кульку (${PRICE} ₴)`, fire: () => this.buy() }]
        if (!isTouch) text = `E — купити кульку (${PRICE} ₴)`
      }
    }
    this.hint.style.display = text ? 'block' : 'none'
    if (this.hint.textContent !== text) this.hint.textContent = text

    this.root.visible = Math.hypot(pos.x - this.position.x, pos.z - this.position.z) < FAR
    if (!this.root.visible) return
    this.clock += dt
    this.bunch.rotation.set(0.06 * Math.sin(this.clock * 0.9), 0.2 * Math.sin(this.clock * 0.3), 0.08 * Math.sin(this.clock * 1.3)) // the bunch bobs in the breeze
  }
}
