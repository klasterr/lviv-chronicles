import * as THREE from 'three'
import type { System } from '../game'

const HORIZON = 0xcfd9e2

/** Gradient sky dome that follows the camera + fog + lights. */
export function addSky(scene: THREE.Scene, camera: THREE.Camera, shadows: boolean): { sun: THREE.DirectionalLight; system: System } {
  scene.fog = new THREE.Fog(HORIZON, 120, 600)
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(500, 16, 8), // inside the camera far plane (700)
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x5b8cc4) }, hor: { value: new THREE.Color(HORIZON) } },
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top,hor; varying float h; void main(){ gl_FragColor = vec4(mix(hor, top, pow(clamp(h,0.,1.),.6)),1.);\n#include <colorspace_fragment>\n}',
    }),
  )
  dome.frustumCulled = false
  dome.renderOrder = -1
  scene.add(dome)

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x9a8f80, 2.4))
  const sun = new THREE.DirectionalLight(0xfff1dc, 3)
  sun.position.set(-80, 120, 60)
  if (shadows) {
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const c = sun.shadow.camera
    c.left = c.bottom = -70; c.right = c.top = 70; c.near = 10; c.far = 400
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05
    sun.shadow.autoUpdate = false // the map is re-rendered only when the (snapped) centre moves, see update()
  }
  scene.add(sun, sun.target)
  const offset = sun.position.clone()
  // Shadow frustum follows the player in steps of 128 shadow texels (8.75 m) along the light's own axes: the map is static (no
  // shimmering) and is re-rendered only when a step is crossed, instead of every frame. Instances keep casting up to SHADOW_KEEP (instancing.ts) from the camera.
  const dir = offset.clone().normalize(), right = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(right)
  const STEP = (140 / 2048) * 128, snapped = new THREE.Vector3(NaN, 0, 0), p = new THREE.Vector3()
  return {
    sun,
    system: { update: () => {
      dome.position.copy(camera.position)
      if (!shadows) return
      p.set(camera.position.x, 0, camera.position.z)
      const sx = Math.round(p.dot(right) / STEP) * STEP - p.dot(right), sy = Math.round(p.dot(up) / STEP) * STEP - p.dot(up)
      p.addScaledVector(right, sx).addScaledVector(up, sy)
      if (p.distanceToSquared(snapped) < 1e-6) return
      snapped.copy(p)
      sun.target.position.copy(p)
      sun.position.copy(p).add(offset)
      sun.shadow.needsUpdate = true
    } },
  }
}
