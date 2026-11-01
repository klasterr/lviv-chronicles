import type { System } from '../game'
import type { Action } from '../device'
import type { Player } from './player'
import { stickKeys } from './stick'

const LOOK = 0.0045 // radians of turn per pixel dragged
const STICK_R = 56 // px of finger travel for a full deflection

const CSS = `
#touch{position:fixed;inset:0;z-index:5;touch-action:none;display:none;-webkit-tap-highlight-color:transparent}
#touch .b{position:absolute;display:grid;place-items:center;color:#fff;font:600 14px system-ui,sans-serif;text-align:center;background:rgba(255,255,255,.2);
  border:2px solid rgba(255,255,255,.55);border-radius:50%;touch-action:none;user-select:none;-webkit-user-select:none}
#touch .b.on{background:rgba(255,255,255,.5)}
#touch .base{position:absolute;width:132px;height:132px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.4);display:none;pointer-events:none}
#touch .knob{position:absolute;left:38px;top:38px;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.5)}
#touch .jump{right:max(18px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));width:76px;height:76px}
#touch .acts{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:calc(max(20px,env(safe-area-inset-bottom)) + 94px);display:flex;flex-direction:column;gap:10px;align-items:flex-end}
#touch .acts .b{position:static;border-radius:24px;padding:0 18px;height:48px;min-width:120px;font-size:16px;background:rgba(52,209,134,.6);border-color:#34d186}
#touch .fly{top:max(8px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));width:50px;height:50px;font-size:22px}
#touch .menu{top:max(30px,calc(env(safe-area-inset-top) + 22px));left:max(12px,env(safe-area-inset-left));width:44px;height:44px;font-size:20px}
#touch .up,#touch .down{right:calc(max(18px,env(safe-area-inset-right)) + 94px);width:58px;height:58px;font-size:22px}
#touch .up{bottom:calc(max(20px,env(safe-area-inset-bottom)) + 70px)}
#touch .down{bottom:max(20px,env(safe-area-inset-bottom))}`

/**
 * On-screen controls for phones in landscape: floating joystick (left 40 % of the screen) -> W/A/S/D/Shift, drag anywhere else to look,
 * a jump button, flight toggle + up/down while flying, and contextual buttons (sit, scooter, chess) built from the systems' `act` lists.
 */
export class TouchControls implements System {
  private root = document.createElement('div')
  private base: HTMLElement; private knob: HTMLElement; private acts: HTMLElement
  private jump: HTMLElement; private fly: HTMLElement; private up: HTMLElement; private down: HTMLElement
  private stick: { id: number; x: number; y: number } | null = null
  private look: { id: number; x: number; y: number } | null = null
  private held = new Set<string>() // keys currently pressed on behalf of the stick
  private sig = ''

  constructor(private player: Player, private actions: () => Action[], onMenu: () => void) {
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }))
    this.root.id = 'touch'
    this.root.innerHTML = '<div class="base"><div class="knob"></div></div><div class="b jump">Стрибок</div><div class="b fly">✈</div><div class="b menu">☰</div><div class="b up">▲</div><div class="b down">▼</div><div class="acts"></div>'
    document.body.append(this.root)
    const q = (c: string) => this.root.querySelector<HTMLElement>('.' + c)!
    this.base = q('base'); this.knob = q('knob'); this.acts = q('acts'); this.jump = q('jump'); this.fly = q('fly'); this.up = q('up'); this.down = q('down')

    this.press(this.jump, () => player.keyDown('Space'), () => player.keyUp('Space'))
    this.press(this.fly, () => player.keyDown('KeyF'), () => player.keyUp('KeyF'))
    this.press(this.up, () => (player.climb = 1), () => (player.climb = 0))
    this.press(this.down, () => (player.climb = -1), () => (player.climb = 0))
    this.press(q('menu'), onMenu)

    const r = this.root
    r.addEventListener('pointerdown', (e) => {
      if (e.target !== r) return // buttons handle their own touches
      e.preventDefault(); r.setPointerCapture(e.pointerId)
      if (e.clientX < innerWidth * 0.4 && !this.stick) { // floating joystick: appears where the thumb lands
        this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY }
        this.base.style.display = 'block'; this.base.style.left = e.clientX - 66 + 'px'; this.base.style.top = e.clientY - 66 + 'px'
        this.knob.style.transform = ''
      } else if (!this.look) this.look = { id: e.pointerId, x: e.clientX, y: e.clientY }
    })
    r.addEventListener('pointermove', (e) => {
      if (this.stick?.id === e.pointerId) {
        let dx = e.clientX - this.stick.x, dy = e.clientY - this.stick.y
        const m = Math.hypot(dx, dy), k = m > STICK_R ? STICK_R / m : 1
        dx *= k; dy *= k
        this.knob.style.transform = `translate(${dx}px,${dy}px)`
        this.apply(dx / STICK_R, dy / STICK_R)
      } else if (this.look?.id === e.pointerId) {
        player.look((e.clientX - this.look.x) * LOOK, (e.clientY - this.look.y) * LOOK)
        this.look.x = e.clientX; this.look.y = e.clientY
      }
    })
    const end = (e: PointerEvent) => {
      if (this.stick?.id === e.pointerId) { this.stick = null; this.base.style.display = 'none'; this.apply(0, 0) }
      if (this.look?.id === e.pointerId) this.look = null
    }
    r.addEventListener('pointerup', end); r.addEventListener('pointercancel', end)
    addEventListener('contextmenu', (e) => e.preventDefault()) // long press must not open a menu
  }

  /** Button that reacts on touch-down (taps feel instant) and, for hold buttons, on release. */
  private press(el: HTMLElement, down: () => void, up?: () => void) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation()
      el.setPointerCapture(e.pointerId); el.classList.add('on'); down(); navigator.vibrate?.(8)
    })
    const end = () => { el.classList.remove('on'); up?.() }
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end)
  }

  /** Turn the stick deflection into key presses (only the changes are sent). */
  private apply(sx: number, sy: number) {
    const want = new Set(stickKeys(sx, sy))
    for (const k of [...this.held]) if (!want.has(k)) { this.player.keyUp(k); this.held.delete(k) }
    for (const k of want) if (!this.held.has(k)) { this.player.keyDown(k); this.held.add(k) }
  }

  update() {
    const p = this.player
    this.root.style.display = p.touchActive ? 'block' : 'none'
    if (!p.touchActive) { // paused or the chess board is up: let go of everything
      this.apply(0, 0); this.stick = this.look = null; this.base.style.display = 'none'; p.climb = 0
      return
    }
    const free = !p.seated && !p.riding, show = (el: HTMLElement, v: boolean) => (el.style.display = v ? '' : 'none')
    show(this.jump, free); show(this.fly, free); show(this.up, free && p.flying); show(this.down, free && p.flying)
    this.fly.classList.toggle('on', p.flying)

    const acts = this.actions(), sig = acts.map((a) => a.label).join('|')
    if (sig !== this.sig) { // rebuild only when the set of available actions changes
      this.sig = sig
      this.acts.replaceChildren(...acts.map((a) => {
        const b = document.createElement('div'); b.className = 'b'; b.textContent = a.label
        this.press(b, () => a.fire()); return b
      }))
    }
  }
}
