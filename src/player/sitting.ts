import * as THREE from 'three'
import type { System } from '../game'
import type { Colliders } from '../world/colliders'
import type { Player } from './player'

const REACH = 4 // metres from which a bench can be clicked

/** Click a bench to sit on it; click again or press a movement key to get up. Shows a crosshair and a hint. */
export class Sitting implements System {
  private dir = new THREE.Vector3()
  private aim: { x: number; z: number; yaw: number; standX: number; standZ: number } | null = null
  private cross = this.el('div', 'position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 3px #000;opacity:.7;pointer-events:none;display:none')
  private hint = this.el('div', 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);padding:6px 14px;border-radius:6px;background:#000a;color:#fff;font:15px system-ui,sans-serif;pointer-events:none;display:none')

  constructor(private player: Player, private camera: THREE.Camera, private colliders: Colliders) {
    addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !player.controls.isLocked || player.riding) return // the click that locks the pointer arrives while still unlocked
      if (player.seated) player.stand()
      else if (this.aim) { const a = this.aim; player.sit(a.x, a.z, a.yaw, a.standX, a.standZ) }
    })
  }

  private el(tag: string, css: string) {
    const e = document.createElement(tag); e.style.cssText = css; document.body.append(e); return e
  }

  update() {
    const locked = this.player.controls.isLocked
    const walking = locked && !this.player.riding
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
    const text = this.player.seated ? 'Space / WASD або клік — підвестися' : this.aim ? 'Клік — сісти' : ''
    this.hint.textContent = text
    this.hint.style.display = locked && text ? 'block' : 'none'
  }
}
