import assert from 'node:assert/strict'
import { Colliders } from '../src/world/colliders'
import { parkingZones, SLOTS } from '../src/world/parking'
import { stickKeys } from '../src/player/stick'
import { total, describe, kinds, units, pieces, MENU } from '../src/restaurant/menu'
import { orderTray, McItem } from '../src/restaurant/mc-items'
import { Item, Tray } from '../src/items/item'
import { CAP, TIP_R, canTip, coinSlot, shownCoins } from '../src/musician/tip'
import { STEPS, STEP_S, distGain, fingerpick, itemClass, panFor, pluck, schedule, stepVol, stride } from '../src/audio/logic'

// Bolt parkings: 2 zones x SLOTS scooters, each parked with its nose towards the fountain / monument
const st = { fountain: { x: -25, z: -178, yaw: 0.38 }, monument: { x: 70, z: 67, yaw: -2.74 } }
const zones = parkingZones(st)
assert.equal(zones.length, 2)
zones.forEach((zn, i) => {
  const target = i === 0 ? st.fountain : st.monument
  assert.equal(zn.slots.length, SLOTS)
  zn.slots.forEach((s) => {
    const toX = target.x - s.x, toZ = target.z - s.z, d = Math.hypot(toX, toZ)
    assert.ok(Math.abs(d - (i === 0 ? 9.5 : 9)) < 1.5, `slot ${d.toFixed(1)} m from its landmark`)
    assert.ok((-Math.sin(s.a) * toX - Math.cos(s.a) * toZ) / d > 0.9, 'nose points at the landmark')
  })
  assert.ok(Math.abs(Math.hypot(zn.slots[1].x - zn.slots[0].x, zn.slots[1].z - zn.slots[0].z) - 0.85) < 1e-9) // spacing along the row
})

const c = new Colliders()
// 10x10 square building at (0..10, 0..10)
for (const [a, b, d, e] of [[0, 0, 10, 0], [10, 0, 10, 10], [10, 10, 0, 10], [0, 10, 0, 0]]) c.add(a, b, d, e, 10)

const outside = c.resolve({ x: -0.1, z: 5 }, 0.35)          // pushed out of the west wall
assert.ok(outside.x <= -0.35 + 1e-9, `pushed out, got ${outside.x}`)
const free = c.resolve({ x: -5, z: 5 }, 0.35)               // far away: untouched
assert.deepEqual(free, { x: -5, z: 5 })
const slide = c.resolve({ x: -0.2, z: 7 }, 0.35)            // slides along the wall: z unchanged
assert.equal(slide.z, 7)
const corner = c.resolve({ x: -0.1, z: -0.1 }, 0.35)        // corner: ends up >= r away
assert.ok(Math.hypot(corner.x, corner.z) >= 0.35 - 1e-9)
// jumping/flying: walls lower than the feet don't block; roof height comes from the footprint
const ring = [[0, 0], [10, 0], [10, 10], [0, 10]]
c.addBuilding([ring], 10)
assert.equal(c.groundAt(5, 5), 10)
assert.equal(c.groundAt(-5, 5), 0)
const over = c.resolve({ x: -0.1, z: 5 }, 0.35, 10)         // feet on the roof: the wall no longer blocks
assert.equal(over.x, -0.1)
const yard = new Colliders(); yard.addBuilding([ring, [[4, 4], [6, 4], [6, 6], [4, 6]]], 10)
assert.equal(yard.groundAt(5, 5), 0)                         // hole = open courtyard
assert.equal(yard.groundAt(2, 2), 10)
// picking benches with a view ray
const bn = new Colliders()
bn.addBench(0, 0, 0, 1, 0.3, 0.85)                          // long axis along world x
bn.addBench(20, 0, Math.PI / 2, 1, 0.3, 0.85)               // rotated: long axis along world z
const down = bn.rayBench(0.4, 2, 0, 0, -1, 0, 4)            // straight down onto the seat
assert.ok(down && Math.abs(down.lx - 0.4) < 1e-9, 'hit at local x = 0.4')
assert.equal(bn.rayBench(0.4, 2, 2, 0, -1, 0, 4), null)     // beside the bench: no hit
assert.equal(bn.rayBench(0.4, 2, 0, 0, -1, 0, 1), null)     // too far away
const turned = bn.rayBench(20, 2, 0.8, 0, -1, 0, 4)         // rotated bench, aimed 0.8 m along world z
assert.ok(turned && Math.abs(turned.lx + 0.8) < 1e-9, `rotated bench local x, got ${turned?.lx}`)
const side = bn.rayBench(-3, 0.6, 0, 1, 0, 0, 4)            // level ray from the side hits the end
assert.ok(side && Math.abs(side.t - (3 - 1.15)) < 1e-9)
// touch joystick -> keys
assert.deepEqual(stickKeys(0, 0), [])
assert.deepEqual(stickKeys(0.1, -0.2), [])                  // inside the dead zone
assert.deepEqual(stickKeys(0, -0.6), ['KeyW'])
assert.deepEqual(stickKeys(-0.5, 0.5), ['KeyS', 'KeyA'])    // a diagonal is two keys
assert.deepEqual(stickKeys(0, -1), ['KeyW', 'ShiftLeft'])   // pushed to the edge = run
// interior floors: a mezzanine over open floor, stairs up to it; floors only count for feet within a step of them
const room = new Colliders()
room.addFloor(0, 0, 6, 8, 3.2)                              // mezzanine slab
room.addFloor(7, 1, 8.6, 6, 3.2, 0.17)                      // ramp: 3.2 m at z = 1 down to 0.17 m at z = 6
assert.equal(room.groundAt(3, 4, 0), 0)                     // standing under the slab: the floor, not the slab
assert.equal(room.groundAt(3, 4, 3.2), 3.2)                 // standing on it
assert.equal(room.groundAt(3, 4, 2.7), 3.2)                 // within a step below
assert.ok(Math.abs(room.groundAt(7.5, 3.5, 3) - 1.685) < 1e-9 && room.groundAt(7.5, 3.5, 0) === 0, 'ramp halfway up is only reachable from near its height')
assert.equal(room.groundAt(3, 4), 3.2)                      // no feet height given: the highest surface
// a railing on the mezzanine blocks the people up there, not the ones walking below it
room.add(0, 0, 6, 0, 4.9, 3.2)
assert.equal(room.resolve({ x: 3, z: 0.1 }, 0.35, 3.2).z, 0.35)
assert.equal(room.resolve({ x: 3, z: 0.1 }, 0.35, 0).z, 0.1)
// a bench on the upper floor can be aimed at from there, but not from the floor below
room.addBench(3, 4, 0, 0.65, 0.2, 0.5, 3.2)
assert.ok(room.rayBench(3, 4.9, 4, 0, -1, 0, 4), 'aimed at from above, up on the mezzanine')
assert.equal(room.rayBench(3, 1.7, 3.2, 0, 0.2, 1, 4), null, 'not through the slab from below')
// menu arithmetic
const cart = new Map([['Біг Мак', 2], ['Кока-Кола', 1]])
assert.equal(total(cart), 2 * 139 + 55)
assert.equal(describe(cart), '2× Біг Мак, Кока-Кола')
assert.deepEqual([...kinds(cart)], ['burger', 'drink'])
assert.equal(new Set(MENU.flatMap((c) => c.items).map((i) => i.id)).size, MENU.flatMap((c) => c.items).length) // ids are unique
// street musician: the case holds CAP coins, the next tip reuses the first slot; only the audience side within TIP_R can tip
assert.deepEqual([0, 1, CAP - 1, CAP, CAP + 1].map(coinSlot), [0, 1, CAP - 1, 0, 1])
assert.deepEqual([0, 5, CAP, 3 * CAP].map(shownCoins), [0, 5, CAP, CAP])
const cs = { x: 70, z: 60, yaw: -2.74 }, fwd = [Math.sin(cs.yaw), Math.cos(cs.yaw)] // he faces the walking area, away from the monument
assert.ok(canTip(cs.x + fwd[0] * 1.2, cs.z + fwd[1] * 1.2, cs), 'in front of the case')
assert.ok(!canTip(cs.x - fwd[0] * 1.2, cs.z - fwd[1] * 1.2, cs), 'behind the case (musician side)')
assert.ok(!canTip(cs.x + fwd[0] * (TIP_R + 0.5), cs.z + fwd[1] * (TIP_R + 0.5), cs), 'too far')
// items: an order becomes one McItem per piece on a tray; items come off the tray one by one; breaking colours include the contents
assert.equal(units(cart), 3); assert.equal(pieces(cart).length, 3)
const tray = orderTray(cart)
assert.equal(tray.contents.length, 3)
assert.ok(tray instanceof Item && tray.contents[0] instanceof McItem && tray.contents[0] instanceof Item, 'McItem and Tray derive from the generic Item')
assert.deepEqual(tray.contents.map((i) => i.name), ['Біг Мак', 'Біг Мак', 'Кока-Кола'])
assert.equal(tray.hands, 2); assert.equal(tray.contents[0].hands, 1)
assert.ok(tray.fragments.length > 3)
const first = tray.contents[0]; tray.release(first)
assert.equal(tray.contents.length, 2); assert.equal(first.container, null)
assert.ok(tray instanceof Tray)
// audio (pure logic): distance curve, pan from the camera yaw, footstep cadence, item families, guitar pattern + scheduler + Karplus-Strong
assert.equal(distGain(0), 1); assert.equal(distGain(2), 1); assert.equal(distGain(35), 0); assert.equal(distGain(100), 0)
assert.ok(distGain(10) > distGain(20) && distGain(20) > distGain(34) && distGain(34) > 0, 'monotonic fade')
for (const yaw of [0, 1, -2.5, 3]) { // a source straight ahead pans to 0, to the right > 0, to the left < 0 (camera forward = (-sin a, -cos a), right = (cos a, -sin a))
  const f = [-Math.sin(yaw), -Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)]
  assert.ok(Math.abs(panFor(f[0] * 10, f[1] * 10, yaw)) < 1e-9)
  assert.ok(panFor(r[0] * 10, r[1] * 10, yaw) > 0.8); assert.ok(panFor(-r[0] * 10, -r[1] * 10, yaw) < -0.8)
}
assert.equal(panFor(0, 0, 1), 0); assert.ok(Math.abs(panFor(0.3, 0, 0)) < 0.1, 'no hard pan right next to the source')
assert.ok(stride(8) > stride(4) && stride(4) === 1.6 && stride(100) === 2.6)
assert.ok(stride(4) / 4 > 0.3 && stride(4) / 4 < 0.5 && stride(8) / 8 < stride(4) / 4, 'walking ~2.5 steps/s, running faster')
assert.equal(itemClass({ contents: [] }), 'tray'); assert.equal(itemClass({ menu: { kind: 'drink' } }), 'cup'); assert.equal(itemClass({ menu: { kind: 'burger' } }), 'food')
{
  const PC = new Set([9, 11, 0, 2, 4, 5, 7, 8]) // A minor + G# of the E chord
  for (let i = 0; i < STEPS * 2; i++) {
    const n = fingerpick(i)
    assert.ok(n.length >= 1 && n.length <= 2)
    for (const x of n) assert.ok(x.midi >= 36 && x.midi <= 84 && PC.has(x.midi % 12) && x.vel > 0 && x.vel <= 1, `step ${i}: ${x.midi}`)
  }
  assert.deepEqual(fingerpick(3), fingerpick(3 + STEPS)); assert.deepEqual(fingerpick(-1), fingerpick(STEPS - 1))
  assert.equal(fingerpick(0)[0].midi, 45, 'starts on the A bass')
  const got: number[] = [], st = { t: 0, i: 0 } // 10 s of frames at ~60 fps: every step exactly once, evenly spaced, none in the past
  for (let now = 1; now < 11; now += 1 / 60) schedule(st, now, 0.3, STEP_S, (i, t) => { assert.ok(t >= now - 1e-9 || got.length === 0); got.push(t) })
  assert.ok(got.length > 28 && got.length < 36, `${got.length} steps in 10 s`)
  got.slice(1).forEach((t, k) => assert.ok(Math.abs(t - got[k] - STEP_S) < 1e-9, 'no drift'))
  const n0 = got.length; schedule(st, 100, 0.3, STEP_S, () => {}); assert.ok(st.t > 100 && st.i - n0 <= 2, 'after a stall it restarts, no burst')
  let k = 1; const w = pluck(44100, 220, 1, () => (k = (k * 16807) % 2147483647) / 2147483647), mid = (a: number, b: number) => w.slice(a, b).reduce((s, x) => s + x * x, 0)
  assert.equal(w.length, 44100); assert.ok(w.every(Number.isFinite) && mid(0, 4000) > mid(30000, 34000) && Math.abs(w[44099]) < 1e-3, 'pluck decays and ends silent')
}
console.log('collide ok')
