const DEAD = 0.25 // fraction of full deflection ignored around the centre

/** Joystick deflection (x right, y down, each -1..1) -> the keys it stands for: 8-way, Shift when pushed to the edge (run).
 *  shortcut: digital, not analog speed; upgrade by passing the deflection to Player instead of key codes. */
export function stickKeys(x: number, y: number): string[] {
  const keys: string[] = []
  if (y < -DEAD) keys.push('KeyW'); else if (y > DEAD) keys.push('KeyS')
  if (x < -DEAD) keys.push('KeyA'); else if (x > DEAD) keys.push('KeyD')
  if (keys.length && Math.hypot(x, y) > 0.9) keys.push('ShiftLeft')
  return keys
}
