import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Opponent } from '../chess/ui'
import type { Colliders } from './colliders'
import type { CityData } from './city'
import { part, box, T } from './props'

interface Look { jacket: number; trousers: number; cap: number; hat: boolean; glasses: boolean }

// Two of the six chess tables (indices into street.chess); each grandpa sits on the bench with local z = -1.35, the free bench faces him.
const GRANDPAS: { table: number; look: Look; opp: Opponent }[] = [
  { table: 0, look: { jacket: 0x59753d, trousers: 0x3b3a36, cap: 0x6b5a3a, hat: false, glasses: false },
    opp: { key: 'stepan', name: 'Дід Степан', level: 'easy', quips: {
      move: ['Ану, подивимось…', 'Хм, я так думаю.', 'Ходи, ходи, не поспішай.', 'Ой, а то мій кінь?'],
      check: ['Ага!', 'Бережи короля!'],
      win: ['Ех, молодь, молодь…', 'Ще партійку?'], lose: ['Ну ти даєш! Майстер!', 'Пощастило тобі, синку.'] } } },
  { table: 5, look: { jacket: 0x2d3640, trousers: 0x242424, cap: 0x555555, hat: true, glasses: true },
    opp: { key: 'yaroslav', name: 'Дід Ярослав', level: 'hard', quips: {
      move: ['Цікаво.', 'Подумайте, куди дивиться ваш слон.', 'Я ще з вісімдесятих тут граю.', 'Тихіше їдеш — далі будеш.'],
      check: ['Шах.', 'Шах. Дивіться уважніше.'],
      win: ['Не засмучуйтесь, це дрібниці.', 'Приходьте завтра, потренуємось.'], lose: ['Браво. Давно такого не бачив.', 'Це був гарний хід. Вітаю.'] } } },
]

/** Seated grandpa (nose along local +z, origin at the seat centre on the ground). */
function figure(l: Look) {
  const skin = 0xd6a984, hair = 0xcfcfcf
  const parts = [
    box(0.34, 0.14, 0.46, l.trousers, 0, 0.56, 0.15), box(0.12, 0.46, 0.12, l.trousers, -0.1, 0.25, 0.38), box(0.12, 0.46, 0.12, l.trousers, 0.1, 0.25, 0.38), // thighs, shins
    box(0.12, 0.07, 0.22, 0x1d1d1d, -0.1, 0.035, 0.45), box(0.12, 0.07, 0.22, 0x1d1d1d, 0.1, 0.035, 0.45), // shoes
    box(0.42, 0.56, 0.26, l.jacket, 0, 0.77, -0.04), // torso
    part(new THREE.SphereGeometry(0.115, 12, 10), skin, T(0, 1.17, 0)), box(0.25, 0.07, 0.2, hair, 0, 1.15, -0.03), // head, grey hair
    box(0.09, 0.3, 0.09, l.jacket, -0.25, 0.92, 0), box(0.09, 0.3, 0.09, l.jacket, 0.25, 0.92, 0), // upper arms
    box(0.08, 0.08, 0.5, l.jacket, -0.25, 0.8, 0.27), box(0.08, 0.08, 0.5, l.jacket, 0.25, 0.8, 0.27), // forearms reach for the table
    box(0.07, 0.05, 0.09, skin, -0.25, 0.8, 0.55), box(0.07, 0.05, 0.09, skin, 0.25, 0.8, 0.55), // hands
  ]
  if (l.hat) parts.push(part(new THREE.CylinderGeometry(0.1, 0.11, 0.1, 12), l.cap, T(0, 1.32, 0)), part(new THREE.CylinderGeometry(0.19, 0.19, 0.015, 14), l.cap, T(0, 1.265, 0)))
  else parts.push(part(new THREE.CylinderGeometry(0.135, 0.135, 0.045, 12), l.cap, T(0, 1.285, -0.01)), box(0.16, 0.015, 0.09, l.cap, 0, 1.265, 0.12)) // flat cap
  if (l.glasses) parts.push(box(0.19, 0.03, 0.015, 0x111111, 0, 1.19, 0.11))
  return mergeGeometries(parts)!
}

/** Two chess-playing grandpas on the avenue; sit on the free bench opposite one and press G to play. */
export class Grandpas implements System {
  chessOpen = false // main.ts keeps the start screen hidden while the board is up
  private seats: { x: number; z: number; opp: Opponent }[] = []
  private ui: import('../chess/ui').ChessUI | null = null
  private hint = Object.assign(document.createElement('div'), {}) as HTMLDivElement

  constructor(data: CityData, parent: THREE.Object3D, colliders: Colliders, private player: Player) {
    this.hint.style.cssText = 'position:fixed;left:50%;bottom:30%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none;text-align:center'
    document.body.append(this.hint)

    const geos: THREE.BufferGeometry[] = []
    for (const g of GRANDPAS) {
      const t = data.street?.chess[g.table]
      if (!t) continue
      const [tx, tz, yaw] = t
      const bench = colliders.benches.find((b) => Math.hypot(b.x - (tx - Math.sin(yaw) * 1.35), b.z - (tz - Math.cos(yaw) * 1.35)) < 0.6)
      if (!bench) { console.warn('no bench for grandpa', g.opp.name); continue }
      geos.push(figure(g.look).applyMatrix4(T(bench.x, 0, bench.z).multiply(new THREE.Matrix4().makeRotationY(bench.yaw))))
      this.seats.push({ x: bench.x, z: bench.z, opp: g.opp })
    }
    if (geos.length) {
      const mesh = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }))
      mesh.castShadow = mesh.receiveShadow = true
      parent.add(mesh)
    }

    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyG' || e.repeat || this.chessOpen || !player.controls.isLocked) return
      const s = this.opposite()
      if (s) void this.open(s)
    })
  }

  /** The grandpa across the table when the player sits on the free bench (2.7 m away), else null. */
  private opposite() {
    if (!this.player.seated) return null
    const p = this.player.position
    return this.seats.find((s) => { const d = Math.hypot(s.x - p.x, s.z - p.z); return d > 1.5 && d < 3.6 }) ?? null
  }

  private async open(s: { opp: Opponent }) {
    this.chessOpen = true
    document.exitPointerLock()
    const { ChessUI } = await import('../chess/ui') // chess.js and the board only load when someone sits down to play
    this.ui ??= new ChessUI(() => this.closed())
    this.ui.open(s.opp)
  }

  private closed() {
    this.chessOpen = false
    this.player.controls.lock() // refused after Esc in some browsers: then the start screen is the way back in
    setTimeout(() => { if (!this.player.controls.isLocked) document.getElementById('overlay')!.style.display = 'grid' }, 400)
  }

  update() {
    const p = this.player, pos = p.position
    let text = ''
    if (p.controls.isLocked && !this.chessOpen && !p.riding) {
      const s = this.opposite()
      if (s) text = `G — зіграти в шахи: ${s.opp.name} (${s.opp.level === 'easy' ? 'легкий' : 'складний'})`
      else if (!p.seated) {
        const near = this.seats.find((x) => Math.hypot(x.z - pos.z, x.x - pos.x) < 5)
        if (near) text = `${near.opp.name} грає в шахи. Сядьте на лавку навпроти (клік), щоб зіграти`
      }
    }
    this.hint.style.display = text ? 'block' : 'none'
    if (this.hint.textContent !== text) this.hint.textContent = text
  }
}
