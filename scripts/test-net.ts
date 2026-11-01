import assert from 'node:assert/strict'
import { newer, readGone, readName, readPose, readScoot, readSnapshotScoot, readThrow, type ScootRec } from '../src/net/sync'

// last writer wins: the higher clock, on a tie the smaller writer id; every peer picks the same record whatever order they arrive in
const rec = (t: number, w: string, s: ScootRec['s'] = 'dropped'): ScootRec => ({ i: 0, s, x: 1, z: 2, a: 0, by: s === 'ridden' ? w : '', t, w })
const recs = [rec(3, 'bb'), rec(3, 'aa'), rec(2, 'zz', 'ridden'), rec(1, 'aa')]
const winner = (order: ScootRec[]) => order.reduce<ScootRec | undefined>((cur, r) => (newer(r, cur) ? r : cur), undefined)
for (const order of [recs, [...recs].reverse(), [recs[2], recs[0], recs[3], recs[1]]]) assert.deepEqual(winner(order), rec(3, 'aa'))
assert.ok(!newer(rec(3, 'aa'), rec(3, 'aa')), 'the same record again is not newer')

// scooter writes: well-formed, in the sender's own name, rides only for yourself
assert.deepEqual(readScoot(rec(1, 'p1', 'ridden'), 'p1', 5), rec(1, 'p1', 'ridden'))
assert.equal(readScoot(rec(1, 'p1'), 'p2', 5), null, 'written in someone else\'s name')
assert.equal(readScoot({ ...rec(1, 'p1', 'ridden'), by: 'p9' }, 'p1', 5), null, 'claims a ride for someone else')
assert.equal(readScoot({ ...rec(1, 'p1'), i: 5 }, 'p1', 5), null, 'index out of range')
assert.equal(readScoot({ ...rec(1, 'p1'), x: NaN }, 'p1', 5), null)
assert.equal(readScoot({ ...rec(1, 'p1'), s: 'stolen' }, 'p1', 5), null)
assert.equal(readScoot({ ...rec(1, 'p1'), t: 1.5 }, 'p1', 5), null)
assert.ok(readSnapshotScoot(rec(4, 'p7'), 5), 'a snapshot relays other writers')
assert.equal(readSnapshotScoot({ ...rec(4, 'p7', 'ridden'), by: 'p8' }, 5), null)

// poses, throws, item ids, names
assert.ok(readPose({ p: [1, 2, 3, 0.5], m: 2, s: 1, h: [[0.1, 0xff0000]] }))
assert.equal(readPose({ p: [1, 2, 3], m: 0, s: -1, h: [] }), null)
assert.equal(readPose({ p: [1, 2, 3, Infinity], m: 0, s: -1, h: [] }), null)
assert.equal(readPose({ p: [1, 2, 3, 0], m: 7, s: -1, h: [] }), null)
assert.equal(readPose({ p: [1, 2, 3, 0], m: 0, s: -1, h: [[0.1], [0.1, 1], [0.1, 1]] }), null, 'three hands / no colour')
assert.ok(readThrow({ p: [0, 1, 0], v: [10, 2, 0], r: 0.1, c: [0xdddddd] }))
assert.equal(readThrow({ p: [0, 1, 0], v: [10, 2, 0], r: 0.1, c: [1], n: ' Біг Мак\n' + 'x'.repeat(60) })?.n.length, 32, 'item name: trimmed, control chars out, capped')
assert.equal(readThrow({ p: [0, 1, 0], v: [10, 2, 0], r: 0.1, c: [1], n: 42 })?.n, '')
assert.equal(readThrow({ p: [0, 1, 0], v: [1e6, 2, 0], r: 0.1, c: [1] }), null, 'absurd speed')
assert.equal(readThrow({ p: [0, 1, 0], v: [1, 2, 0], r: 0.1, c: [-1] }), null)
assert.deepEqual(readGone(['shop:3:12', 'prog:2']), ['shop:3:12', 'prog:2'])
assert.equal(readGone(['shop:3:12', '<img src=x>']), null)
assert.equal(readGone('prog:1'), null)
assert.equal(readName({ n: '  Оля\u0007 ' }), 'Оля')
assert.equal(readName({ n: 'x'.repeat(50) })?.length, 16)
assert.equal(readName({ n: '   ' }), null)
assert.equal(readName('Оля'), null)
console.log('net ok')
