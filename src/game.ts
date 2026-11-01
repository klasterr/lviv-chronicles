import * as THREE from 'three'
import type { Colliders } from './world/colliders'
import { isTouch } from './device'

/** Anything that needs a per-frame tick (player, NPCs, day/night, ...). Add via game.systems.push().
 *  preRender runs after all updates, right before drawing, with up-to-date camera matrices (instance culling etc.). */
export interface System { update(dt: number): void; preRender?(camera: THREE.PerspectiveCamera): void }

// pixel-ratio ladder of the adaptive governor (top step is capped by devicePixelRatio / 1.5)
const STEPS = [1.5, 1.25, 1, 0.8, 0.65]

export class Game {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(70, 1, 0.2, 700) // 700 m: fog is opaque at 600 m (sky.ts), nothing beyond is visible
  systems: System[] = []
  colliders!: Colliders
  /** Current render resolution scale (changes by itself when the machine cannot hold ~50 fps). */
  pixelRatio: number
  private level: number
  private ceiling = 0 // best level index the governor may climb back to (set when a climb was premature)
  private climbed = false
  private sinceChange = 0 // seconds since the last resolution change
  private lost = false

  constructor(shadows: boolean) {
    this.renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' })
    const top = Math.min(devicePixelRatio, isTouch ? 1 : STEPS[0]) // phones start at 1x with antialiasing off; the governor may climb back
    this.level = Math.max(0, STEPS.findIndex((s) => s <= top)); this.pixelRatio = STEPS[this.level]
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2
    this.renderer.shadowMap.enabled = shadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    const dom = this.renderer.domElement
    document.body.prepend(dom)
    dom.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true }) // three re-uploads everything on restore
    dom.addEventListener('webglcontextrestored', () => { this.lost = false })
    addEventListener('resize', () => this.resize()); this.resize()
  }

  private resize() {
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(innerWidth, innerHeight)
    this.camera.aspect = innerWidth / innerHeight
    this.camera.updateProjectionMatrix()
  }

  /** One tick: update systems, let them prepare the view (culling), draw. */
  frame(dt: number) {
    for (const s of this.systems) s.update(dt)
    this.camera.updateMatrixWorld(); this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert()
    for (const s of this.systems) s.preRender?.(this.camera)
    this.renderer.render(this.scene, this.camera)
  }

  start(onFrame?: (dt: number) => void) {
    const clock = new THREE.Timer()
    clock.connect(document) // ignores the time spent in a hidden tab
    let n = 0, sum = 0
    const governor = !location.search.includes('nogov') // ?nogov: fixed resolution (screenshots, profiling)
    this.renderer.setAnimationLoop(() => {
      clock.update()
      const raw = clock.getDelta(), dt = Math.min(raw, 0.1)
      if (this.lost) return
      this.frame(dt)
      onFrame?.(dt)

      // adaptive resolution: 45-frame window, skip warm-up and stalls (tab switch, shader compile)
      this.sinceChange += raw
      if (!governor || raw > 1 || this.sinceChange < 2) { n = sum = 0; return }
      sum += raw
      if (++n < 45) return
      const avg = sum / n; n = sum = 0
      if (avg > 0.021 && this.level < STEPS.length - 1) this.setLevel(this.level + 1, true)
      else if (avg < 0.0125 && this.level > this.ceiling && this.sinceChange > 6) this.setLevel(this.level - 1, false)
    })
  }

  private setLevel(l: number, down: boolean) {
    if (down && this.climbed) this.ceiling = l // we climbed and had to fall back: do not try that level again
    this.climbed = !down
    this.level = l; this.pixelRatio = STEPS[l]; this.resize(); this.sinceChange = 0
  }
}
