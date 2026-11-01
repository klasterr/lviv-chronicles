// Pure audio math: no DOM, no AudioContext, so it runs under `npm test`.

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Distance attenuation: full volume within 2 m, quadratic fade to silence at `range` metres. */
export const distGain = (d: number, range = 35) => (d <= 2 ? 1 : d >= range ? 0 : ((range - d) / (range - 2)) ** 2)

/** Stereo pan -1..1 of a source at offset (dx, dz) from a listener with camera yaw `yaw` (camera right = (cos a, -sin a)). Eased to 0 right next to the source. */
export function panFor(dx: number, dz: number, yaw: number) {
  const d = Math.hypot(dx, dz)
  if (d < 0.01) return 0
  const side = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d
  return Math.max(-1, Math.min(1, side)) * Math.min(1, d / 3) * 0.85
}

/** Metres between footsteps: longer stride when running (4 m/s walk, 8 m/s run). */
export const stride = (speed: number) => 1.6 + 0.25 * Math.min(4, Math.max(0, speed - 4))
export const stepVol = (speed: number) => 0.9 * (0.6 + 0.4 * clamp01((speed - 2) / 6)) // 0.9: footsteps were turned down 10 %
export const MOVING = 0.8 // m/s below which nobody makes steps

/** Which sound family an item belongs to (duck-typed so this module stays free of three.js): trays hold things, drinks and desserts are cups. */
export const itemClass = (it: { contents?: unknown[]; menu?: { kind: string } }) =>
  it.contents ? 'tray' : it.menu?.kind === 'drink' || it.menu?.kind === 'dessert' ? 'cup' : 'food'

// --- street guitar: Am F C G | Am Dm E Am, fingerpicked eighth notes -------------------------------------------------------------
const CH: Record<string, { b: number[]; t: number[] }> = { // MIDI: two bass notes, three treble notes
  Am: { b: [45, 52], t: [57, 60, 64] }, F: { b: [41, 48], t: [57, 60, 65] }, C: { b: [48, 43], t: [55, 60, 64] },
  G: { b: [43, 50], t: [59, 62, 67] }, Dm: { b: [50, 45], t: [57, 62, 65] }, E: { b: [40, 47], t: [56, 59, 64] },
}
const PROG = ['Am', 'F', 'C', 'G', 'Am', 'Dm', 'E', 'Am']
const MEL = [[76, 0], [77, 72], [76, 0], [74, 71], [72, 0], [74, 77], [71, 68], [69, 0]] // a sung note on beats 4 and 8 of each bar (0 = rest)
export const STEPS = PROG.length * 8
export const STEP_S = 60 / 92 / 2 // seconds per eighth note
export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12)

/** Notes to pluck on eighth-note `step` (loops every STEPS): bass, then thumb-and-finger arpeggio, plus a melody note twice a bar. */
export function fingerpick(step: number) {
  const s = ((step % STEPS) + STEPS) % STEPS, bar = s >> 3, i = s & 7, c = CH[PROG[bar]]
  const pat = [c.b[0], c.t[0], c.t[1], c.t[2], c.b[1], c.t[1], c.t[2], c.t[1]]
  const out = [{ midi: pat[i], vel: i === 0 ? 0.9 : i === 4 ? 0.75 : i & 1 ? 0.5 : 0.58 }]
  const m = i === 3 ? MEL[bar][0] : i === 7 ? MEL[bar][1] : 0
  if (m) out.push({ midi: m, vel: 0.6 })
  return out
}

/** Look-ahead scheduler: call every frame with the audio clock; emits every step that starts before now + ahead, never a burst after a stall. */
export function schedule(s: { t: number; i: number }, now: number, ahead: number, stepS: number, emit: (i: number, t: number) => void) {
  if (s.t < now - 0.25) s.t = now + 0.05
  while (s.t < now + ahead) { emit(s.i++, s.t); s.t += stepS }
}

/** Karplus-Strong plucked string: noise burst in a delay line with a two-point average; the tail is faded so it never clicks. */
export function pluck(sr: number, hz: number, secs: number, rnd: () => number = Math.random) {
  const n = Math.round(sr * secs), p = Math.max(2, Math.round(sr / hz - 0.5)), out = new Float32Array(n) // the averaging filter adds half a sample of delay
  let prev = 0
  for (let i = 0; i < p && i < n; i++) { prev = 0.5 * prev + 0.5 * (rnd() * 2 - 1); out[i] = prev } // softened burst = a soft pick
  for (let i = p; i < n; i++) out[i] = 0.4975 * (out[i - p] + out[i - p + 1])
  const tail = 0.25 * sr
  for (let i = Math.max(0, n - tail | 0); i < n; i++) out[i] *= (n - i) / tail
  return out
}
