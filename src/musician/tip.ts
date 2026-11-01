/** Pure tip-box logic (no DOM / three), tested in scripts/test-collide.ts. */
export const CAP = 12      // coins visible in the case; the 13th replaces the 1st
export const TIP_R = 1.8   // metres from the case centre: the farthest tipping spot (6.2 m from the monument) is out of the 2.5 m mount reach of the scooters parked 9 m away

export const coinSlot = (n: number) => n % CAP // n = 0-based index of the tip
export const shownCoins = (tips: number) => Math.min(tips, CAP)

/** Player at (px, pz) may tip: near the case and on the audience side (in front of it along its yaw, the way the musician faces). */
export function canTip(px: number, pz: number, c: { x: number; z: number; yaw: number }) {
  const dx = px - c.x, dz = pz - c.z
  return Math.hypot(dx, dz) <= TIP_R && dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw) > 0.2
}
