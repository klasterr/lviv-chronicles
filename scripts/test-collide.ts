import assert from 'node:assert/strict'
import { Colliders } from '../src/world/colliders'
import { OP, addOperaColliders, parterreSeats, tierSeats, seatGroups, stairSteps, tierStrips, horseshoe } from '../src/opera/layout'
import { parkingZones, SLOTS } from '../src/world/parking'
import { STEPS as MSTEPS, STELE, SOLID_HALF, addMonumentColliders, arcPt, steleTop } from '../src/world/monument-layout'
import { stickKeys } from '../src/player/stick'
import { total, describe, kinds, units, pieces, MENU } from '../src/restaurant/menu'
import { orderTray, McItem } from '../src/restaurant/mc-items'
import { Item, Tray } from '../src/items/item'
import { CAP, TIP_R, canTip, coinSlot, shownCoins } from '../src/musician/tip'
import { SHOPS, GOODS, MAX_UNITS, shopSpan, shopDoor, signCovered, cartTotal, cartPieces, describe as describeCart, units as cartUnits, type Cart } from '../src/shops/spec'
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
// Shevchenko monument: the kerb-high apron is walkable, the solid steps are not, the stele slab blocks both faces, the musician's spot stays clear
{
  const M = { x: 70.42, z: 67.38, yaw: -2.74, stele: { x: 66.91, z: 73.2 }, steleYaw: 2.6 }, mc = new Colliders(); addMonumentColliders(mc, M)
  const at = (lx: number, lz: number) => [M.x + lx * Math.cos(M.yaw) + lz * Math.sin(M.yaw), M.z - lx * Math.sin(M.yaw) + lz * Math.cos(M.yaw)]
  const moved = (lx: number, lz: number) => { const [x, z] = at(lx, lz), q = mc.resolve({ x, z }, 0.35); return Math.hypot(q.x - x, q.z - z) }
  assert.ok(MSTEPS[0].half > SOLID_HALF && MSTEPS.every((s, i) => !i || (s.half < MSTEPS[i - 1].half && s.h > MSTEPS[i - 1].h)), 'steps shrink and rise')
  assert.ok(moved(SOLID_HALF - 0.1, 0) > 0.2 && moved(0, SOLID_HALF + 0.1) > 0.1, "the solid steps push you out")
  assert.ok(moved(SOLID_HALF + 0.36, 0) < 1e-9 && moved(0, SOLID_HALF + 0.36) < 1e-9, 'you can walk right up to the steps (the apron is only a 10 cm kerb)')
  assert.ok(moved(0, 3.5) < 1e-9, 'the musician stands on free ground (3.5 m in front)')
  for (const r of [STELE.R - STELE.plinthFront - 0.1, STELE.R + STELE.plinthBack + 0.1]) for (const u of [0.3, 0.5, 0.8]) {
    const [lx, lz] = arcPt(u, r), x = M.stele.x + lx * Math.cos(M.steleYaw) + lz * Math.sin(M.steleYaw), z = M.stele.z - lx * Math.sin(M.steleYaw) + lz * Math.cos(M.steleYaw)
    const q = mc.resolve({ x, z }, 0.35); assert.ok(Math.hypot(q.x - x, q.z - z) > 0.2, `stele slab blocks at u=${u}, r=${r}`)
  }
  assert.ok(steleTop(1) < 11 && steleTop(0) > 7 && steleTop(0.9) > steleTop(0.1), 'crest 7.4 -> 10.4 m, Oranta makes 12')
}
// shops: the shopfront takes whole window bays of the wall, the door is the centre of one bay (in the wall plane), a mapped sign under the new front is detected, the order arithmetic
{
  const f = { a: [60.18, 156.38], b: [54.09, 145.14], n: [0.879, -0.476], len: 12.78, off: 0, dist: 13 } // Svobody 7 (the bookshop)
  const ye = SHOPS[0], sp = shopSpan(f, ye), bw = f.len / 4
  assert.ok(Math.abs(sp.bw - bw) < 1e-9 && Math.abs(sp.u0 - 2 * bw) < 1e-9 && Math.abs(sp.u1 - f.len) < 1e-9, 'two of four bays, ending at the wall end')
  assert.ok(Math.abs(sp.door - 2.5 * bw) < 1e-9 && sp.door > sp.u0 && sp.door < sp.u1, 'door in the middle of the first bay')
  const d = shopDoor(f, ye), tx = (f.b[0] - f.a[0]) / f.len, tz = (f.b[1] - f.a[1]) / f.len
  assert.ok(Math.abs((d.x - f.a[0]) * tx + (d.z - f.a[1]) * tz - sp.door) < 0.01 && Math.abs((d.x - f.a[0]) * f.n[0] + (d.z - f.a[1]) * f.n[1]) < 0.02, 'on the wall line at u = door')
  assert.deepEqual([d.nx, d.nz], f.n)
  assert.ok(Math.abs(shopDoor({ ...f, off: 2 }, ye).x - d.x - 2 * f.n[0]) < 1e-9, 'a bulging wall moves the door out by its offset')
  assert.ok(signCovered(sp.u0 + 1, 1.5, sp.u0, sp.u1) && !signCovered(2.9, 1.5, sp.u0, sp.u1) && !signCovered(sp.u1 + 1, 1.5, sp.u0, sp.u1) && signCovered(sp.u0 - 0.5, 1.5, sp.u0, sp.u1), 'Sova at u 2.9 (2.15..3.65) stays, one that overlaps goes')
  assert.deepEqual(SHOPS.map((x) => x.slot), [1, 2, 3, 4]); assert.equal(new Set(SHOPS.map((x) => x.front)).size, SHOPS.length)
  for (const x of SHOPS) { assert.ok(x.doorBay < x.bays && x.room.w >= 7 && x.room.w <= 12 && GOODS[x.kind].length >= 2) }
  const goods = GOODS.coffee, cart: Cart = new Map([['espresso', 2], ['beans', 1]])
  assert.equal(cartTotal(goods, cart), 2 * 55 + 290); assert.equal(cartUnits(cart), 3); assert.equal(cartUnits(cart) <= MAX_UNITS, true)
  assert.deepEqual(cartPieces(goods, cart).map((g) => g.id), ['espresso', 'espresso', 'beans']); assert.equal(describeCart(goods, cart), '2 × Еспресо, Кава в зернах, 250 г'); assert.equal(cartTotal(goods, new Map()), 0)
}
{ // Opera (src/opera/layout.ts): stair geometry, walking the real colliders, seat layout
  const steps = stairSteps(), rise = OP.up / OP.stair.n
  assert.equal(steps.length, OP.stair.n); assert.ok(Math.abs(steps.at(-1)!.top - OP.up) < 1e-9, 'the last step is level with the upper foyer')
  steps.forEach((st, i) => { assert.ok(Math.abs(st.top - (i + 1) * rise) < 1e-9); assert.ok(st.z1 - st.z0 >= 0.5 && rise <= 0.2, 'comfortable treads') })
  const oc = new Colliders(); addOperaColliders(oc, 0, 0)
  /** Walks (feet at height y) to each target at 4 m/s in 60 Hz steps, like the player: wall push-out, then the floor under the feet. */
  const owalk = (x: number, z: number, y: number, pts: number[][]) => {
    const p = { x, z }
    for (const [tx, tz] of pts) for (let i = 0; i < 900; i++) {
      const d = Math.hypot(tx - p.x, tz - p.z); if (d < 0.1) break
      p.x += ((tx - p.x) / d) * 4 / 60; p.z += ((tz - p.z) / d) * 4 / 60
      oc.resolve(p, 0.35, y); y = oc.groundAt(p.x, p.z, y + 0.6)
    }
    return { x: p.x, z: p.z, y }
  }
  const top = owalk(11.7, 31, 0, [[11.7, 14], [11.7, 10], [0, 10], [0, 5]])
  assert.equal(top.y, OP.up, 'up the east flight, over the upper foyer, through the passage onto the first tier'); assert.ok(top.z > 4.3, 'stops at the balcony railing')
  const rail = owalk(0, 10, OP.up, [[0, 20]]); assert.ok(rail.z < OP.stair.zTop - 0.3 && rail.y === OP.up, 'the balustrade keeps you on the upper foyer')
  const flight = owalk(0, 25, 0, [[11.7, 25]]); assert.ok(flight.x < OP.stair.xIn - 0.3 && flight.y === 0, 'the inner railing keeps the ground floor off the stairs')
  assert.ok(owalk(0, 6, 0, [[0, -18]]).z > OP.pit.z + 0.3, 'the pit parapet keeps you off the stage')
  const edge = owalk(0, 20, 0, [[-30, 20], [-30, 45], [30, 45], [30, -60], [-30, -60]]); assert.ok(Math.abs(edge.x) < 20 && edge.z > -60 && edge.z < 32, 'closed room')
  assert.ok(owalk(0, 30, 0, [[0, 40]]).z < OP.hd - 0.3, 'the south wall holds')
  const t1 = OP.tiers[0]; let ring = owalk(0, 5, t1.y, [[0, 5.2]]), minY = 99
  for (let t = Math.PI / 2 + 0.1; t <= Math.PI - 0.05; t += 0.1) { ring = owalk(ring.x, ring.z, ring.y, [[-12.7 * Math.cos(t), OP.aud.cz + 12.7 * Math.sin(t)]]); minY = Math.min(minY, ring.y) }
  assert.equal(minY, t1.y, 'all the way round the first tier: floor under the feet'); assert.ok(ring.x > 10 && Math.abs(ring.z - OP.aud.cz) < 2, 'ended on the far side')
  for (let t = 0.2; t < Math.PI - 0.2; t += 0.25) assert.equal(oc.groundAt(12.6 * Math.cos(t), OP.aud.cz + 12.6 * Math.sin(t), t1.y), t1.y, 'strips cover the tier ring')
  assert.ok(tierStrips(t1.rf).length > 30)
  const h = horseshoe(OP.aud.R, 1); assert.ok(Math.abs(h[0].x + OP.aud.R) < 1e-9 && Math.abs(h.at(-1)!.x - OP.aud.R) < 1e-9 && h.every((q) => Math.hypot(q.nx, q.nz) > 0.999), 'horseshoe path: sides and arc, unit normals')
  const seats = parterreSeats()
  assert.ok(seats.length > 300 && seats.length < 700, `parterre seats ${seats.length}`)
  for (const s of seats) {
    assert.ok(Math.abs(s.x) >= 0.9 - 1e-9 && s.z > OP.pit.z + 1 && (s.z <= OP.aud.cz ? Math.abs(s.x) <= OP.aud.R : Math.hypot(s.x, s.z - OP.aud.cz) <= OP.aud.R), 'seat in the aisle, pit or wall')
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), tx = OP.aud.stageC.x - s.x, tz = OP.aud.stageC.z - s.z
    assert.ok((fx * tx + fz * tz) / Math.hypot(tx, tz) > 0.999, 'seat faces the stage')
  }
  const groups = seatGroups(seats, 5); assert.ok(groups.every((g) => g.hw > 0 && g.hw <= 2.5 * OP.seatW + 1e-9) && Math.abs(groups.reduce((a, g) => a + g.hw * 2, 0) / OP.seatW - seats.length) < 1e-6, 'benches cover every seat once')
  assert.ok(tierSeats().length > 40 && tierSeats().every((s) => s.y === t1.y))
  const near = owalk(0, 6, 0, [[0.8, -2]]); assert.ok(Math.abs(near.x) < 1.3 + 0.35, 'aisle stays free')
  const row = owalk(2.3, 0.2 + 0.8, 0, [[2.3, -6]]); assert.ok(row.z > -0.9, 'you cannot walk through the row of seats in front')
}
console.log('collide ok')
