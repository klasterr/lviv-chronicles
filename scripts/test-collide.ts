import assert from 'node:assert/strict'
import { Colliders } from '../src/world/colliders'
import { parkingZones, SLOTS } from '../src/world/parking'
import { stickKeys } from '../src/player/stick'

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
console.log('collide ok')
