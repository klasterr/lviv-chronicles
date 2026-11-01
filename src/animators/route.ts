/** Walking loop of the costumed animators on the central granite promenade of the boulevard. Pure logic (no THREE), tested in scripts/test-collide.ts. */
export const SPEED = 0.7 // m/s, a slow stroll
export const HALF = 3.5  // m either side of the promenade's centre line (it is ~19 m wide, the benches stand at its edges); the ends turn on a half-circle
const END = 15           // m kept clear at both ends: the dry fountain / spawn and the monument square with the musician

type Ribbon = { kind: string; l: number[][]; r: number[][] }

/** Stadium-shaped loop: up one lane, half-circle, back down the other. `at(s)` = position s metres along it (wraps), `len` = its length. */
export function loop(ribbons: Ribbon[]) {
  const g = ribbons.filter((r) => r.kind === 'granite').reduce((a, b) => (b.l.length > a.l.length ? b : a)) // the boulevard (the short one is the Opera square)
  const mid = (i: number) => [(g.l.at(i)![0] + g.r.at(i)![0]) / 2, (g.l.at(i)![1] + g.r.at(i)![1]) / 2]
  const [ax, az] = mid(0), [bx, bz] = mid(-1)
  const D = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / D, uz = (bz - az) / D
  const L = D - 2 * END, H = Math.PI * HALF, len = 2 * L + 2 * H
  const at = (s: number) => {
    s = ((s % len) + len) % len
    let u: number, v: number // along the axis, across it
    if (s < L) { u = s; v = HALF }
    else if ((s -= L) < H) { u = L + HALF * Math.sin(s / HALF); v = HALF * Math.cos(s / HALF) }
    else if ((s -= H) < L) { u = L - s; v = -HALF }
    else { s -= L; u = -HALF * Math.sin(s / HALF); v = -HALF * Math.cos(s / HALF) }
    u += END
    return { x: ax + u * ux + v * uz, z: az + u * uz - v * ux }
  }
  return { at, len }
}
