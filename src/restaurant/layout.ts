/** Room layout, metres from the room's origin (+x east, +z south). The player comes in through the south door facing north,
 *  so the counter is straight ahead, the kitchen behind it, the stairs on the left (west) and the kiosks at the entrance. */
export const L = {
  hw: 9, hd: 8, H: 6.4,                // half width / half depth / ceiling
  door: { x: 0, z: 8 },
  arrive: { x: 0, z: 6.6 },
  cashier: { x: 0, z: -2.6 },
  counterZ: -1.9,                      // centre line of the counter (1 m deep)
  tray: { x: 0, z: -1.75 },
  kiosks: [2.6, 4.3],                  // x of the two self-service kiosks on the south wall
  kioskZ: 7.775,
  mezz: 3.2,                           // level of the second floor
}
