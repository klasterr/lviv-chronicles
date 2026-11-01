/**
 * Shared-world rules and message checks for the P2P room (src/net/net.ts). Pure: no DOM, no three.js, so scripts/test-net.ts can run it.
 * Every peer may send anything, so whatever arrives goes through one of the `read*` functions first; null = drop the message.
 */

export const SCOOT_STATES = ['parked', 'ridden', 'dropped', 'returning'] as const
export type ScootState = (typeof SCOOT_STATES)[number]

// types, not interfaces: trystero only sends JSON-shaped values, and interfaces do not count as such
/** Last-writer-wins register of one scooter. t = Lamport clock of the write, w = the peer who wrote it, by = the rider (only while ridden). */
export type ScootRec = { i: number; s: ScootState; x: number; z: number; a: number; by: string; t: number; w: string }

/** Player pose, 10 times a second. m: 0 walk, 1 seated, 2 riding scooter `s`, 3 flying; h = held things as [radius, ...fragment colours]. */
export type PoseMsg = { p: [number, number, number, number]; m: number; s: number; h: number[][] }
export type ThrowMsg = { p: [number, number, number]; v: [number, number, number]; r: number; c: number[]; n: string } // n = what it is ("Біг Мак")

const LIM = 5000 // metres: the city plus the interior rooms beyond its edge
const PEER = /^[\w-]{1,40}$/
const ITEM_ID = /^(shop:\d{1,2}:\d{1,3}|prog:\d{1,2})$/

/** Does `b` win over `a`? Higher clock wins; on a tie the smaller writer id, so every peer picks the same one. */
type Stamp = { t: number; w: string }
export const newer = (b: Stamp, a: Stamp | undefined) => !a || b.t > a.t || (b.t === a.t && b.w < a.w)

const num = (v: unknown, lim = LIM): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const colours = (v: unknown): v is number[] => Array.isArray(v) && v.length >= 1 && v.length <= 8 && v.every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffffff)

export function readScoot(v: unknown, from: string, count: number): ScootRec | null {
  if (!isObj(v)) return null
  const { i, s, x, z, a, by, t, w } = v
  if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= count) return null
  if (!SCOOT_STATES.includes(s as ScootState) || !num(x) || !num(z) || !num(a, 1e4) || !Number.isInteger(t) || (t as number) < 0) return null
  if (typeof by !== 'string' || typeof w !== 'string' || !PEER.test(w)) return null
  if (s === 'ridden' ? by !== w : by !== '') return null // you can only claim a ride for yourself
  if (w !== from) return null // a live write is always in the sender's own name
  return { i: i as number, s: s as ScootState, x: x as number, z: z as number, a: a as number, by, t: t as number, w }
}

/** Snapshot sent to a newcomer: carries records written by others too (relayed); a ride is still only valid for its own writer. */
export function readSnapshotScoot(v: unknown, count: number): ScootRec | null {
  return isObj(v) && typeof v.w === 'string' ? readScoot(v, v.w, count) : null
}

export function readPose(v: unknown): PoseMsg | null {
  if (!isObj(v) || !Array.isArray(v.p) || v.p.length !== 4 || !v.p.every((n) => num(n, 1e4))) return null
  if (![0, 1, 2, 3].includes(v.m as number) || !Number.isInteger(v.s) || (v.s as number) < -1 || (v.s as number) > 999) return null
  if (!Array.isArray(v.h) || v.h.length > 2 || !v.h.every((h) => Array.isArray(h) && num(h[0], 1) && (h[0] as number) > 0 && colours(h.slice(1)))) return null
  return { p: v.p as PoseMsg['p'], m: v.m as number, s: v.s as number, h: v.h as number[][] }
}

export function readThrow(v: unknown): ThrowMsg | null {
  if (!isObj(v) || !Array.isArray(v.p) || !Array.isArray(v.v) || v.p.length !== 3 || v.v.length !== 3) return null
  if (!v.p.every((n) => num(n)) || !v.v.every((n) => num(n, 50)) || !num(v.r, 1) || (v.r as number) <= 0 || !colours(v.c)) return null
  return { p: v.p as ThrowMsg['p'], v: v.v as ThrowMsg['v'], r: v.r as number, c: v.c as number[], n: clean(v.n, 32) ?? '' }
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || null : null)

export function readGone(v: unknown): string[] | null {
  return Array.isArray(v) && v.length <= 500 && v.every((id) => typeof id === 'string' && ITEM_ID.test(id)) ? v : null
}

/** Display name: plain text, at most 16 characters (it is drawn on a canvas, never parsed as HTML). */
export function readName(v: unknown): string | null {
  return isObj(v) ? clean(v.n, 16) : null
}
