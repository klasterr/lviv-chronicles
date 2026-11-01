import { Chess, type Square } from 'chess.js'
import type { Level, Pick } from './engine'
import { isTouch } from '../device'

export interface Opponent { key: string; name: string; level: Level; quips: { move: string[]; check: string[]; win: string[]; lose: string[] } }

const GLYPH: Record<string, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }
const FILES = 'abcdefgh'
const MIN_THINK_MS = 700 // a grandpa who answers instantly feels like a machine
const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

const CSS = `
#chess{position:fixed;inset:0;display:none;place-items:center;background:#000b;z-index:20;font:15px system-ui,sans-serif;color:#fff;overflow:auto;
  --s:max(28px,min(60px,calc((100vh - 210px) / 8),calc((100vw - 64px) / 8)))} /* square size: the panel (title + status + buttons ~ 200 px) always fits the window */
#chess .panel{background:#2b2622;border:2px solid #6b5a3a;border-radius:12px;padding:12px 16px;box-shadow:0 10px 40px #000;max-width:calc(100vw - 16px)}
#chess h2{margin:0 0 4px;font-size:clamp(14px,2.2vh,20px)}
#chess .st{min-height:22px;margin:6px 0 10px;color:#f2d98d}
#chess .bd{display:grid;grid-template-columns:repeat(8,var(--s));grid-template-rows:repeat(8,var(--s));border:3px solid #6b5a3a;user-select:none}
#chess .sq{display:grid;place-items:center;font-size:calc(var(--s) * .73);line-height:1;cursor:pointer;position:relative}
#chess .l{background:#ead9b5}#chess .d{background:#a67c52}
#chess .sq.sel{outline:4px solid #34d186;outline-offset:-4px}
#chess .sq.mv::after{content:"";position:absolute;width:30%;height:30%;border-radius:50%;background:#34d18699}
#chess .sq.cap::after{content:"";position:absolute;inset:6%;border-radius:50%;border:solid #34d18699;border-width:max(3px,calc(var(--s) * .08))}
#chess .sq.last{box-shadow:inset 0 0 0 100px #f2d98d55}
#chess .sq.chk{box-shadow:inset 0 0 0 100px #e5393588}
#chess .w{color:#fff;text-shadow:0 0 2px #000,0 0 2px #000,0 0 3px #000}
#chess .b{color:#1b1b1b}
#chess .row{display:flex;gap:8px;margin-top:10px;justify-content:flex-end}
#chess button{background:#6b5a3a;border:0;color:#fff;padding:7px 14px;border-radius:6px;font:inherit;cursor:pointer}
#chess button:hover{background:#85703f}
@media (max-height:520px){ /* landscape phone: board on the left, title / status / buttons in a column on the right */
  #chess{--s:max(26px,min(60px,calc((100vh - 44px) / 8),calc((100vw - 260px) / 8)))}
  #chess .panel{display:grid;grid-template-columns:auto minmax(150px,210px);grid-template-areas:"bd h" "bd st" "bd row";grid-template-rows:auto auto 1fr;column-gap:14px;padding:10px 12px}
  #chess .bd{grid-area:bd}#chess h2{grid-area:h;font-size:15px}#chess .st{grid-area:st;margin:6px 0}
  #chess .row{grid-area:row;flex-direction:column;justify-content:flex-end;margin:0}
}`

/** Chess board overlay: you play white, the grandpa plays black. Games persist per opponent while the page is open. */
export class ChessUI {
  isOpen = false
  private root = document.createElement('div')
  private board: HTMLDivElement; private status: HTMLDivElement; private title: HTMLHeadingElement
  private games = new Map<string, Chess>()
  private opp!: Opponent
  private sel: Square | null = null
  private last: [string, string] | null = null
  private busy = false
  private worker: Worker | null = null
  private seq = 0 // worker request ids
  private epoch = 0 // bumped by "new game" so a late reply to the old game is dropped

  constructor(private onClose: (viaButton: boolean) => void) {
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }))
    this.root.id = 'chess'
    this.root.innerHTML = '<div class="panel"><h2></h2><div class="st"></div><div class="bd"></div><div class="row"><button data-a="new">Нова гра</button><button data-a="close">Встати з-за столу' + (isTouch ? '' : ' (Esc)') + '</button></div></div>'
    document.body.append(this.root)
    this.title = this.root.querySelector('h2')!; this.status = this.root.querySelector('.st')!; this.board = this.root.querySelector('.bd')!
    this.root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement, a = t.dataset.a, sq = t.closest<HTMLElement>('.sq')?.dataset.sq
      if (a === 'new') { this.game.reset(); this.sel = null; this.last = null; this.busy = false; this.epoch++; this.render() }
      else if (a === 'close') this.close(true)
      else if (sq) this.click(sq as Square)
    })
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.isOpen) this.close(false) })
  }

  private get game() {
    let g = this.games.get(this.opp.key)
    if (!g) this.games.set(this.opp.key, (g = new Chess()))
    return g
  }

  open(o: Opponent) {
    this.opp = o; this.isOpen = true; this.sel = null; this.root.style.display = 'grid'
    this.title.textContent = `Шахи з ${o.name} (${o.level === 'easy' ? 'легкий' : 'складний'}) — ви граєте білими`
    this.render()
    if (this.game.turn() === 'b' && !this.game.isGameOver() && !this.busy) void this.reply()
  }

  close(viaButton: boolean) { this.isOpen = false; this.root.style.display = 'none'; this.onClose(viaButton) }

  private say(t: string) { this.status.textContent = t }

  private over() {
    const g = this.game
    if (g.isCheckmate()) return g.turn() === 'w' ? `Мат. ${this.opp.name} переміг. ${rnd(this.opp.quips.win)}` : `Мат! Ви перемогли. ${rnd(this.opp.quips.lose)}`
    if (g.isStalemate()) return 'Пат — нічия.'
    if (g.isDraw()) return 'Нічия.'
    return ''
  }

  private render() {
    const g = this.game, legal = this.sel ? g.moves({ square: this.sel, verbose: true }) : []
    const king = g.inCheck() ? g.board().flat().find((s) => s && s.type === 'k' && s.color === g.turn())?.square : null
    this.board.innerHTML = ''
    for (let r = 8; r >= 1; r--) for (let f = 0; f < 8; f++) {
      const sq = (FILES[f] + r) as Square, p = g.get(sq), d = document.createElement('div')
      d.className = `sq ${(f + r) % 2 ? 'l' : 'd'}`
      d.dataset.sq = sq
      if (p) { d.textContent = GLYPH[p.type]; d.classList.add(p.color) }
      if (sq === this.sel) d.classList.add('sel')
      const m = legal.find((x) => x.to === sq); if (m) d.classList.add(m.captured ? 'cap' : 'mv')
      if (this.last && (sq === this.last[0] || sq === this.last[1])) d.classList.add('last')
      if (sq === king) d.classList.add('chk')
      this.board.append(d)
    }
    const end = this.over()
    this.say(end || (this.busy ? `${this.opp.name} думає…` : g.inCheck() ? 'Вам шах!' : 'Ваш хід'))
  }

  private click(sq: Square) {
    const g = this.game
    if (this.busy || g.isGameOver() || g.turn() !== 'w') return
    const p = g.get(sq)
    if (p && p.color === 'w') { this.sel = sq; this.render(); return }
    if (!this.sel) return
    const mv = g.moves({ square: this.sel, verbose: true }).find((m) => m.to === sq)
    if (!mv) { this.sel = null; this.render(); return }
    g.move({ from: mv.from, to: mv.to, promotion: 'q' }) // shortcut: pawns always promote to a queen
    this.last = [mv.from, mv.to]; this.sel = null
    this.render()
    if (!g.isGameOver()) void this.reply()
  }

  private ask(fen: string, level: Level): Promise<Pick | null> {
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    const id = ++this.seq, w = this.worker
    return new Promise((res) => {
      const on = (e: MessageEvent) => { if (e.data.id === id) { w.removeEventListener('message', on); res(e.data.move) } }
      w.addEventListener('message', on)
      w.postMessage({ id, fen, level })
    })
  }

  private async reply() {
    const g = this.game, key = this.opp.key, epoch = this.epoch
    this.busy = true; this.render()
    const t0 = performance.now()
    const mv = await this.ask(g.fen(), this.opp.level)
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_THINK_MS - (performance.now() - t0))))
    if (this.opp.key !== key || this.games.get(key) !== g || g.turn() !== 'b' || this.epoch !== epoch) { this.busy = false; return } // a new game started meanwhile
    this.busy = false
    if (mv) { g.move(mv); this.last = [mv.from, mv.to] }
    if (this.isOpen) {
      this.render()
      if (!g.isGameOver()) this.say(g.inCheck() ? `Шах! ${rnd(this.opp.quips.check)}` : rnd(this.opp.quips.move))
    }
  }
}
