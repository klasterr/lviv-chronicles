import { MAX_UNITS, cartTotal, units, type Cart, type Good } from './spec'
import { sfx } from '../audio/sfx'

const CSS = `
#shopmenu{position:fixed;inset:0;display:none;place-items:center;background:#000a;z-index:20;font:16px system-ui,sans-serif;color:#fff}
#shopmenu .panel{width:min(420px,calc(100vw - 16px));background:#26211c;border:2px solid #d9b45a;border-radius:12px;padding:14px 16px;box-shadow:0 10px 40px #000}
#shopmenu h2{margin:0 0 10px;font-size:20px;color:#d9b45a}
#shopmenu .row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #fff2}
#shopmenu .row i{flex:1;font-style:normal}#shopmenu .row b{min-width:2ch;text-align:center}
#shopmenu button{background:#6b4a1e;border:0;color:#fff;padding:6px 12px;border-radius:6px;font:inherit;cursor:pointer}
#shopmenu button:hover{background:#8a6228}#shopmenu .go{background:#34a853}#shopmenu .go:disabled{background:#555;cursor:default}
#shopmenu .tot{margin:10px 0;text-align:right;font-size:18px;color:#d9b45a}#shopmenu .btns{display:flex;gap:8px;justify-content:flex-end}`

/** Small purchase screen of a shop: +/- per good, total, "Оплатити" hands the cart to the caller (at most MAX_UNITS pieces). */
export class ShopMenu {
  isOpen = false
  private root = document.createElement('div')
  private cart: Cart = new Map()
  private goods: Good[] = []
  private pay: (cart: Cart) => void = () => {}
  private el = (c: string) => this.root.querySelector<HTMLElement>(c)!

  constructor(private onClose: () => void) {
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }))
    this.root.id = 'shopmenu'
    this.root.innerHTML = '<div class="panel"><h2></h2><div class="list"></div><div class="tot"></div><div class="btns"><button class="x">Закрити</button><button class="go">Оплатити</button></div></div>'
    document.body.append(this.root)
    this.el('.x').onclick = () => this.close()
    this.el('.go').onclick = () => { const c = this.cart; this.close(); this.pay(c); sfx.play('confirm') }
    addEventListener('keydown', (e) => { if (this.isOpen && e.code === 'Escape') this.close() })
  }

  open(title: string, goods: Good[], pay: (cart: Cart) => void) {
    this.goods = goods; this.pay = pay; this.cart = new Map(); this.isOpen = true
    this.el('h2').textContent = title; this.root.style.display = 'grid'; this.render()
  }

  close() { if (!this.isOpen) return; this.isOpen = false; this.root.style.display = 'none'; this.onClose() }

  private add(g: Good, d: number) {
    const n = (this.cart.get(g.id) ?? 0) + d
    if (n < 0 || units(this.cart) + d > MAX_UNITS) return
    n ? this.cart.set(g.id, n) : this.cart.delete(g.id); sfx.play('tick'); this.render()
  }

  private render() {
    const list = this.el('.list'); list.textContent = ''
    for (const g of this.goods) {
      const row = document.createElement('div'); row.className = 'row'
      const name = Object.assign(document.createElement('i'), { textContent: `${g.name} — ${g.price} ₴` })
      const minus = Object.assign(document.createElement('button'), { textContent: '−', onclick: () => this.add(g, -1) })
      const plus = Object.assign(document.createElement('button'), { textContent: '+', onclick: () => this.add(g, 1) })
      row.append(name, minus, Object.assign(document.createElement('b'), { textContent: String(this.cart.get(g.id) ?? 0) }), plus); list.append(row)
    }
    const sum = cartTotal(this.goods, this.cart)
    this.el('.tot').textContent = `Разом: ${sum} ₴`; (this.el('.go') as HTMLButtonElement).disabled = !sum
  }
}
