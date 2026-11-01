/** Phone/tablet: on-screen controls instead of keyboard + pointer lock. `?touch` forces it (testing on a desktop). */
export const isTouch = matchMedia('(pointer: coarse)').matches || /[?&]touch\b/.test(location.search)

/** Something the player can do right now (sit, get on a scooter, play chess). Systems publish these each frame; the touch UI shows them as buttons. */
export interface Action { label: string; fire: () => void }
