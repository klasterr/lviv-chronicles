import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { part, box, cyl } from '../world/props'

type G = THREE.BufferGeometry
/** Bone pivots (figure space: face +z, feet at the origin): 0 body, 1 left arm (+x), 2 right arm (-x), 3 left leg, 4 right leg. */
const SX = 0.3 // shoulder x
const PIVOTS: [number, number, number][] = [[0, 0, 0], [SX, 1.4, 0], [-SX, 1.4, 0], [0.13, 0.85, 0], [-0.13, 0.85, 0]]
const SIDES = [1, -1] // left, right

const tr = (x: number, y: number, z: number, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz))
/** Ellipsoid with radii (a, b, d); `fur` = the speckled, darker-below shading of foliage. */
const egg = (c: number, x: number, y: number, z: number, a: number, b = a, d = a, rx = 0, rz = 0, fur = false) => {
  const big = Math.max(a, b, d) >= 0.12 // smooth enough where two shells meet (belly, face), cheap for the small bits
  return part(new THREE.SphereGeometry(1, big ? 16 : 8, big ? 12 : 6), c, tr(x, y, z, rx, rz, a, b, d), fur)
}
/** Cone with its base at (x, y, z), tip along (0, cos rx, sin rx) tilted sideways by rz. */
const spike = (r: number, h: number, c: number, x: number, y: number, z: number, rx: number, rz = 0) => {
  const m = tr(x, y, z, rx, rz)
  return part(new THREE.ConeGeometry(r, h, 8), c, m.multiply(new THREE.Matrix4().makeTranslation(0, h / 2, 0)))
}
/** Limbs hang straight down from their pivots: a shoulder ball and sleeve, the hand at y 0.78; a leg ends in the foot on the ground. */
const sleeve = (sx: number, c: number, fur = false) => [egg(c, SX * sx, 1.4, 0, 0.1, 0.1, 0.1, 0, 0, fur), part(new THREE.CylinderGeometry(0.085, 0.075, 0.56, 10), c, tr(SX * sx, 1.12, 0), fur)]
const trouser = (sx: number, c: number, fur = false) => part(new THREE.CylinderGeometry(0.125, 0.11, 0.78, 10), c, tr(0.13 * sx, 0.46, 0), fur)

export interface Costume { name: string; acc: string; parts: () => G[][]; hug: string[]; shake: string[] }

function donkey(): G[][] {
  const GREY = 0x8d8f95, LIGHT = 0xdcd8cf, DARK = 0x38383b, HOOF = 0x2c2724, PINK = 0xd99a9a
  const mane = Array.from({ length: 8 }, (_, i) => { const a = 0.3 + i * 0.27; return part(new THREE.BoxGeometry(0.045, 0.08, 0.08), DARK, tr(0, 1.8 + 0.22 * Math.cos(a), -0.23 * Math.sin(a), -a)) })
  return [[
    egg(GREY, 0, 1.06, 0, 0.29, 0.45, 0.26), egg(LIGHT, 0, 1.0, 0.17, 0.19, 0.27, 0.11),            // torso, pale belly
    cyl(0.12, 0.14, 0.3, GREY, 0, 1.55, 0.02, 10), egg(GREY, 0, 1.8, 0, 0.21, 0.23, 0.24),           // neck, head
    egg(LIGHT, 0, 1.69, 0.2, 0.15, 0.13, 0.2), box(0.13, 0.015, 0.03, DARK, 0, 1.62, 0.365),         // long muzzle, mouth
    ...SIDES.flatMap((s) => [
      egg(DARK, 0.055 * s, 1.71, 0.385, 0.026, 0.032, 0.015),                                        // nostril
      egg(0xffffff, 0.1 * s, 1.87, 0.185, 0.05, 0.055, 0.04), egg(0x111111, 0.1 * s, 1.87, 0.22, 0.024), // eye
      egg(GREY, 0.17 * s, 2.13, -0.03, 0.065, 0.25, 0.035, 0, -0.25 * s), egg(PINK, 0.168 * s, 2.12, -0.002, 0.04, 0.19, 0.012, 0, -0.25 * s), // long ear
      egg(DARK, 0.232 * s, 2.36, -0.03, 0.04, 0.06, 0.03, 0, -0.25 * s),                             // dark ear tip
    ]),
    ...mane,
    part(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 6), GREY, tr(0, 0.86, -0.3, -0.35)), egg(DARK, 0, 0.66, -0.36, 0.05, 0.09, 0.05), // tail with a tuft
  ],
  ...SIDES.map((s) => [...sleeve(s, GREY), cyl(0.09, 0.085, 0.12, HOOF, SX * s, 0.8, 0, 10)]),       // arms end in hooves
  ...SIDES.map((s) => [trouser(s, GREY), cyl(0.12, 0.13, 0.14, HOOF, 0.13 * s, 0.07, 0.02, 10)])]
}

function hedgehog(): G[][] {
  const BLUE = 0x1f5bd9, PEACH = 0xf1c7a0, W = 0xffffff, RED = 0xd6262b, K = 0x111111
  return [[
    egg(BLUE, 0, 1.06, 0, 0.29, 0.45, 0.26), egg(PEACH, 0, 1.0, 0.17, 0.19, 0.27, 0.11),             // torso, peach belly
    cyl(0.12, 0.14, 0.25, BLUE, 0, 1.52, 0, 10), egg(BLUE, 0, 1.78, -0.02, 0.29, 0.28, 0.28),        // neck, big head
    egg(PEACH, 0, 1.68, 0.19, 0.17, 0.11, 0.12), egg(K, 0, 1.73, 0.3, 0.045, 0.035, 0.035),           // white-ish muzzle, black nose
    box(0.1, 0.015, 0.02, K, 0.03, 1.635, 0.295),                                                    // smirk
    ...SIDES.flatMap((s) => [
      egg(W, 0.075 * s, 1.86, 0.2, 0.085, 0.11, 0.07), egg(0x2fae4e, 0.065 * s, 1.85, 0.262, 0.04, 0.055, 0.02), egg(K, 0.06 * s, 1.85, 0.278, 0.018, 0.028, 0.01), // eye
      spike(0.08, 0.2, BLUE, 0.15 * s, 1.97, -0.04, 0, -0.45 * s), spike(0.05, 0.13, PEACH, 0.152 * s, 1.98, -0.005, 0, -0.45 * s), // ear
      spike(0.11, 0.42, BLUE, 0.15 * s, 1.78, -0.17, -1.65, -0.35 * s),                              // side quill
      spike(0.08, 0.26, BLUE, 0.09 * s, 1.3, -0.2, -1.95),                                           // little back spikes
    ]),
    spike(0.13, 0.5, BLUE, 0, 1.95, -0.14, -1.2), spike(0.13, 0.52, BLUE, 0, 1.78, -0.2, -1.6), spike(0.12, 0.48, BLUE, 0, 1.62, -0.18, -2), // quills swept back
  ],
  ...SIDES.map((s) => [...sleeve(s, PEACH), cyl(0.095, 0.095, 0.07, W, SX * s, 0.87, 0, 10), egg(W, SX * s, 0.77, 0.01, 0.1)]), // arms, white gloves
  ...SIDES.map((s) => [
    trouser(s, BLUE), cyl(0.11, 0.11, 0.14, W, 0.13 * s, 0.22, 0, 10),                               // leg, white sock
    egg(RED, 0.13 * s, 0.1, 0.07, 0.13, 0.1, 0.22), egg(0xe6e6e6, 0.13 * s, 0.03, 0.07, 0.135, 0.035, 0.225), // big red shoe on a pale sole
    egg(W, 0.13 * s, 0.1, 0.08, 0.137, 0.105, 0.045), box(0.02, 0.05, 0.05, 0xe2b33a, 0.265 * s, 0.11, 0.08), // white strap round it, gold buckle
  ])]
}

function labubu(): G[][] {
  const FUR = 0xc2976a, FACE = 0xf4e1c4, PINK = 0xeaa1aa, K = 0x161616, W = 0xffffff
  const teeth = Array.from({ length: 9 }, (_, i) => { const x = -0.11 + i * 0.0275; return spike(0.013, 0.04, W, x, 1.712, 0.268 + 0.027 * Math.sqrt(1 - (x / 0.145) ** 2), Math.PI) })
  return [[
    egg(FUR, 0, 1.06, 0, 0.3, 0.46, 0.27, 0, 0, true), egg(FUR, 0, 1.8, 0, 0.3, 0.29, 0.28, 0, 0, true), // furry body, furry hood
    egg(FACE, 0, 1.76, 0.1, 0.23, 0.2, 0.2),                                                          // pale face
    egg(0x4a1a1c, 0, 1.68, 0.27, 0.14, 0.035, 0.03), ...teeth,                                       // wide grin, a row of pointy teeth
    egg(0xd98080, 0, 1.775, 0.3, 0.022, 0.016, 0.01),                                                // tiny nose
    ...SIDES.flatMap((s) => [
      egg(K, 0.085 * s, 1.83, 0.275, 0.055, 0.065, 0.025), egg(W, 0.07 * s, 1.855, 0.297, 0.015),    // eye with a glint
      egg(FUR, 0.17 * s, 2.24, -0.02, 0.07, 0.26, 0.05, 0, -0.15 * s, true), egg(PINK, 0.168 * s, 2.22, 0.017, 0.04, 0.19, 0.02, 0, -0.15 * s), // tall rabbit ear
    ]),
  ],
  ...SIDES.map((s) => [...sleeve(s, FUR, true), egg(FUR, SX * s, 0.79, 0.01, 0.1, 0.1, 0.1, 0, 0, true)]),
  ...SIDES.map((s) => [trouser(s, FUR, true), egg(FACE, 0.13 * s, 0.07, 0.05, 0.13, 0.08, 0.18)])]
}

export const COSTUMES: Costume[] = [
  { name: 'Віслюк', acc: 'Віслюка', parts: donkey,
    hug: ['І-а! Обійми — це святе! ❤', 'І-а-а! Тепліше, ніж у стайні!', 'Ой, обережно з вухами! І-а!'],
    shake: ['Копито — на щастя! І-а!', 'Радий знайомству! Гуляю тут від Опери до Шевченка.', 'І-а! Добрий день, пане-товаришу!'] },
  { name: 'Сонік', acc: 'Соніка', parts: hedgehog,
    hug: ['Швидкі обійми — найкращі! ❤', 'Ух! Аж колючки стали дибки!', 'Обережно, я колючий… жартую!'],
    shake: ['Дай п’ять! Тільки не відставай!', 'Гей! Я найшвидший на проспекті Свободи!', 'Привіт! Біжу далі, але радий знайомству!'] },
  { name: 'Лабубу', acc: 'Лабубу', parts: labubu,
    hug: ['Хі-хі-хі! Обіймашки! ❤', 'Я не кусаюся, це просто усмішка!', 'М’якенько, правда? Хі-хі!'],
    shake: ['Привіт! Мене звати Лабубу!', 'Лапку? Тримай лапку!', 'Хі-хі! Сфотографуємось?'] },
]

/**
 * One skinned mesh per animator (a single draw call): every part is rigidly bound to one bone, the arms and legs swing about their pivots.
 * Bound at the origin, so place it with `mesh.position` / `mesh.rotation` afterwards. Returns the mesh and its bones (see PIVOTS).
 */
export function rig(parts: G[][], mat: THREE.Material) {
  const geo = mergeGeometries(parts.map((list, k) => {
    const g = mergeGeometries(list)!, n = g.attributes.position.count
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 ? 0 : k)), 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 ? 0 : 1)), 4))
    return g
  }))!
  const bones = PIVOTS.map((p) => { const b = new THREE.Bone(); b.position.set(...p); return b })
  bones[0].add(...bones.slice(1))
  const mesh = new THREE.SkinnedMesh(geo, mat)
  mesh.add(bones[0])
  mesh.bind(new THREE.Skeleton(bones))
  return { mesh, bones }
}
