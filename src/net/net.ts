import type * as THREE from 'three'
import { joinRoom, selfId } from 'trystero'
import type { System } from '../game'
import type { Player } from '../player/player'
import type { Sitting } from '../player/sitting'
import type { Scooters } from '../world/scooters'
import type { Items } from '../items/items'
import type { Item } from '../items/item'
import { sfx } from '../audio/sfx'
import { speechBubble } from '../bubble'
import { Avatars, standIn } from './avatars'
import { newer, readGone, readName, readPose, readScoot, readSnapshotScoot, readThrow, type PoseMsg, type ScootRec, type ThrowMsg } from './sync'

const SEND_EVERY = 0.1 // s: own pose 10 times a second
const SEAT_R = 0.6     // m: two seat spots closer than this are the same place on a bench
const THROWS = 5       // per second per peer; more is dropped (spam)
const r2 = (v: number) => Math.round(v * 100) / 100

export interface NetDeps { scene: THREE.Object3D; camera: THREE.Camera; shadows: boolean; player: Player; sitting: Sitting; scooters: Scooters; items: Items }

/**
 * Multiplayer without a server: WebRTC between the browsers in one room (trystero; peers find each other through public Nostr relays).
 * Shared without an arbiter, so every rule converges by itself (see sync.ts): scooters are last-writer-wins registers on a Lamport clock,
 * taken shelf items a set that only grows, benches first come (on a tie the smaller peer id keeps the seat).
 * shortcut: no TURN server, so some mobile / corporate networks cannot connect; add turnConfig to joinRoom if players report it.
 */
export class Net implements System {
  private room
  private avatars: Avatars
  private clock = 0
  private wait = 0
  private throwLog = new Map<string, number[]>()
  private sendPose; private sendHello; private sendScoot
  private flash = document.createElement('div')
  private bubble = speechBubble('#c0392b', '18%')

  constructor(private d: NetDeps, private name: string, roomId: string) {
    this.avatars = new Avatars(d.scene, d.shadows)
    const room = this.room = joinRoom({ appId: 'lviv-walk', maxReceiveBytes: 16384 }, roomId)
    const pose = room.makeAction<PoseMsg>('pose'), hello = room.makeAction<{ n: string }>('hello'), scoot = room.makeAction<ScootRec>('scoot')
    const snap = room.makeAction<{ s: ScootRec[]; g: string[] }>('snap'), gone = room.makeAction<string[]>('gone'), thr = room.makeAction<ThrowMsg>('throw')
    this.sendPose = pose.send; this.sendHello = hello.send; this.sendScoot = scoot.send
    const count = d.scooters.items.length

    room.onPeerJoin = (id) => { // a newcomer learns who we are and everything shared so far
      hello.send({ n: this.name }, { target: id })
      snap.send({ s: d.scooters.items.flatMap((s, i) => (s.t ? [this.rec(i)] : [])), g: [...d.items.gone] }, { target: id })
    }
    room.onPeerLeave = (id) => this.left(id)
    pose.onMessage = (m, { peerId }) => { const p = readPose(m); if (p) this.avatars.setPose(peerId, p) }
    hello.onMessage = (m, { peerId }) => { const n = readName(m); if (n) this.avatars.setName(peerId, n) }
    scoot.onMessage = (m, { peerId }) => { const r = readScoot(m, peerId, count); if (r) this.receive(r) }
    snap.onMessage = (m) => {
      if (typeof m !== 'object' || m === null || !Array.isArray(m.s) || m.s.length > 200) return
      for (const v of m.s) { const r = readSnapshotScoot(v, count); if (r) this.receive(r) }
      for (const id of readGone(m.g) ?? []) d.items.removeId(id)
    }
    gone.onMessage = (m) => { for (const id of readGone(m) ?? []) d.items.removeId(id) }
    thr.onMessage = (m, { peerId }) => {
      const now = performance.now(), log = (this.throwLog.get(peerId) ?? []).filter((t) => now - t < 1000)
      this.throwLog.set(peerId, log)
      const t = readThrow(m); if (!t || log.length >= THROWS) return
      log.push(now)
      const it = standIn(t.r, t.c, t.n); it.mesh.position.set(...t.p); it.thrower = peerId
      d.items.throwRemote(it, ...t.v)
    }
    // every client flies every throw itself and checks it against the bodies it sees; only the one who was hit feels it (its own true position decides)
    // shortcut: thrower and target may disagree about a near miss by the network lag (~0.1 s); fine for a snowball fight, not for scoring
    d.items.hitTest = (p, it) => {
      const hit = this.avatars.hitAt(p, it.thrower)
      if (hit) { if (!it.thrower) this.bubble.say(`Влучання: ${this.avatars.list.get(hit)?.name || 'гравець'}!`, 2); return true }
      const me = d.player.position
      if (!it.thrower || Math.hypot(me.x - p.x, me.z - p.z) > 0.4 || p.y > me.y + 0.25 || p.y < me.y - 1.75) return false
      this.feel(it.thrower, it)
      return true
    }

    d.scooters.onChange = (i) => this.stamp(i)
    d.sitting.taken = (x, z) => this.avatars.seatedNear(x, z, SEAT_R) !== null
    // Items has one slot per hook and the audio system already uses them: chain after it
    const picked = d.items.onPickup, thrown = d.items.onThrow
    d.items.onPickup = (it, at) => { picked?.(it, at); if (it.id) gone.send([it.id]) }
    d.items.onThrow = (it, at) => {
      thrown?.(it, at)
      const p = it.mesh.position, v = it.vel
      thr.send({ p: [r2(p.x), r2(p.y), r2(p.z)], v: [r2(v.x), r2(v.y), r2(v.z)], r: it.radius, c: it.fragments.slice(0, 8), n: it.name })
    }
    addEventListener('pagehide', () => void room.leave()) // the others drop our figure at once instead of after a timeout
    this.flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .5s;background:radial-gradient(circle,transparent 45%,rgba(200,0,0,.55))'
    document.body.append(this.flash)
  }

  /** Another player's throw hit us: shove, flinch, thud, red edges, a buzz on phones, and who it was. */
  private feel(from: string, it: Item) {
    const h = Math.hypot(it.vel.x, it.vel.z) || 1
    this.d.player.hitBy(it.vel.x / h, it.vel.z / h)
    sfx.play('hit')
    navigator.vibrate?.(150)
    this.flash.style.transition = 'none'; this.flash.style.opacity = '1'
    requestAnimationFrame(() => { this.flash.style.transition = 'opacity .5s'; this.flash.style.opacity = '0' })
    this.bubble.say(`У вас влучили${it.name ? ': ' + it.name : ''} — це ${this.avatars.list.get(from)?.name || 'хтось'}!`, 3)
  }

  /** Players connected right now (not counting us). */
  get online() { return Object.keys(this.room.getPeers()).length }

  rename(n: string) { this.name = n; void this.sendHello({ n }) }

  private rec(i: number): ScootRec {
    const s = this.d.scooters.items[i]
    return { i, s: s.state, x: r2(s.x), z: r2(s.z), a: r2(s.a), by: s.by, t: s.t, w: s.w }
  }

  /** We changed scooter i: stamp it as the newest write and tell everyone. */
  private stamp(i: number) {
    const s = this.d.scooters.items[i]
    s.t = ++this.clock; s.w = selfId; s.by = s.state === 'ridden' ? selfId : ''
    void this.sendScoot(this.rec(i))
  }

  private receive(r: ScootRec) {
    this.clock = Math.max(this.clock, r.t)
    if (!newer(r, this.d.scooters.items[r.i])) return
    if (!this.d.scooters.apply(r.i, { state: r.s, x: r.x, z: r.z, a: r.a, by: r.by, t: r.t, w: r.w })) this.stamp(r.i) // they parked it while we got on: our ride wins, re-announced
  }

  private left(id: string) {
    const last = this.avatars.at(id)
    this.avatars.remove(id); this.throwLog.delete(id)
    // the scooters they rode stay where they were; one peer (the smallest id still here) writes that down for everyone
    const janitor = [selfId, ...Object.keys(this.room.getPeers()).filter((p) => p !== id)].sort()[0] === selfId
    this.d.scooters.items.forEach((s, i) => {
      if (s.state !== 'ridden' || s.by !== id) return
      this.d.scooters.apply(i, { ...s, ...last, state: 'dropped', by: '' })
      if (janitor) this.stamp(i)
    })
  }

  update(dt: number) {
    const { player, scooters, camera } = this.d
    this.avatars.update(dt); this.bubble.tick(dt)
    scooters.items.forEach((s, i) => { // scooters other players ride go where they go
      if (s.state !== 'ridden' || s.by === selfId) return
      const at = this.avatars.at(s.by); if (at) scooters.follow(i, at.x, at.z, at.a)
    })
    const seat = player.seatAt, other = seat && this.avatars.seatedNear(seat.x, seat.z, SEAT_R)
    if (other && other < selfId) player.stand() // sat down on the same spot at the same moment: the smaller id keeps it

    if ((this.wait -= dt) > 0 || !this.online) return
    this.wait = SEND_EVERY
    const p = player.position, m = player.seated ? 1 : player.riding ? 2 : player.flying ? 3 : 0
    void this.sendPose({
      p: [r2(p.x), r2(p.y), r2(p.z), r2(player.riding ? player.heading : camera.rotation.y)], m, s: scooters.riddenIndex,
      h: this.d.items.held.map((it) => [r2(it.radius), ...it.fragments.slice(0, 7)]),
    })
  }
}
