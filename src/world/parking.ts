/** Heading a is in camera-yaw convention: the scooter's nose points along (-sin a, -cos a). */
export interface Slot { x: number; z: number; a: number }
/** yaw is the THREE rotation.y of the zone: local z runs along the row of slots, local x across it. */
export interface ParkingZone { x: number; z: number; yaw: number; w: number; d: number; slots: Slot[] }

export const SLOTS = 6
const GAP = 0.85

const zone = (x: number, z: number, yaw: number, a: number): ParkingZone => ({
  x, z, yaw, w: 1.8, d: SLOTS * GAP + 0.6,
  slots: Array.from({ length: SLOTS }, (_, i) => {
    const s = (i - (SLOTS - 1) / 2) * GAP
    return { x: x + Math.sin(yaw) * s, z: z + Math.cos(yaw) * s, a }
  }),
})

/** Two Bolt parkings from the street layout: east of the dry fountain (between it and the long benches) and north of the Shevchenko monument. */
export function parkingZones(st: { fountain: { x: number; z: number; yaw: number }; monument: { x: number; z: number; yaw: number } }): ParkingZone[] {
  const f = st.fountain, m = st.monument
  return [
    // 9.5 m to the side of the fountain's axis, nose towards the water
    zone(f.x + Math.cos(f.yaw) * 9.5, f.z - Math.sin(f.yaw) * 9.5, f.yaw, Math.atan2(Math.cos(f.yaw), -Math.sin(f.yaw))),
    // 9 m in front of the poet (the side he faces), row across his line of sight, nose towards him
    zone(m.x + Math.sin(m.yaw) * 9, m.z + Math.cos(m.yaw) * 9, m.yaw + Math.PI / 2, m.yaw),
  ]
}
