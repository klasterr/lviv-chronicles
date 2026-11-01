import * as THREE from 'three'
import type { System } from '../game'
import type { Colliders } from '../world/colliders'
import type { Player } from './player'
import { isTouch, type Action } from '../device'

const REACH = 4 // metres from which a bench can be clicked

/** Click a bench to sit on it; click again or press a movement key to get up. Shows a crosshair and a hint (touch: a button via `act`). */
export class Sitting implements System {
  /** What the touch UI should offer right now. */
  act: Action[] = []
  private dir = new THREE.Vector3()
  private aim: { x: number; z: number; yaw: number; standX: number; standZ: number } | null = null
  private cross = this.el('div', 'position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 3px #000;opacity:.7;pointer-events:none;display:none')
  private hint = this.el('div', 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none')

  constructor(private player: Player, private camera: THREE.Camera, private colliders: Colliders) {
    addEventListener('mousedown', (e) => {
      // the click that locks the pointer arrives while still unlocked; on a phone taps go through the touch buttons (and emulated mouse events must not sit you down)
      if (isTouch || e.button !== 0 || !player.active || player.riding) return
      this.activate()
    })
  }

  /** Sit on the aimed bench, or get up if already seated. */
  private activate() {
    const p = this.player
    if (p.seated) p.stand()
    else if (this.aim) { const a = this.aim; p.sit(a.x, a.z, a.yaw, a.standX, a.standZ) }
  }

  private el(tag: string, css: string) {
    const e = document.createElement(tag); e.style.cssText = css; document.body.append(e); return e
  }

  update() {
    const active = this.player.active
    const walking = active && !this.player.riding
    this.cross.style.display = walking && !this.player.seated ? 'block' : 'none'
    this.aim = null
    if (walking && !this.player.seated) {
      const o = this.camera.position, d = this.camera.getWorldDirection(this.dir)
      const hit = this.colliders.rayBench(o.x, o.y, o.z, d.x, d.y, d.z, REACH)
      if (hit) {
        const b = hit.bench, c = Math.cos(b.yaw), s = Math.sin(b.yaw)
        const sx = THREE.MathUtils.clamp(hit.lx, -(b.hw - 0.45), b.hw - 0.45) // sit where you aimed, not past the ends
        const at = (lx: number, lz: number) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c]
        const [x, z] = at(sx, 0), [standX, standZ] = at(sx, b.hd + 0.65)
        this.aim = { x, z, yaw: b.yaw + Math.PI, standX, standZ } // camera forward = bench front (local +z)
      }
    }
    this.act = !walking ? [] : this.player.seated ? [{ label: 'Підвестися', fire: () => this.activate() }] : this.aim ? [{ label: 'Сісти', fire: () => this.activate() }] : []
    const text = isTouch ? '' : this.player.seated ? 'Space / WASD або клік — підвестися' : this.aim ? 'Клік — сісти' : ''
    this.hint.textContent = text
    this.hint.style.display = active && text ? 'block' : 'none'
  }
}
