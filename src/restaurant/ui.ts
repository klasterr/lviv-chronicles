import { MAX_UNITS, MENU, total, units, type Cart } from './menu'
import { isTouch } from '../device'
import { sfx } from '../audio/sfx'

const CSS = `
#menu{position:fixed;inset:0;display:none;place-items:center;background:#000b;z-index:20;font:15px system-ui,sans-serif;color:#fff;overflow:auto}
#menu .panel{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:16px;width:min(900px,calc(100vw - 16px));max-height:calc(100vh - 16px);background:#2a1a17;border:2px solid #ffc72c;border-radius:12px;padding:14px 16px;box-shadow:0 10px 40px #000}
#menu h2{margin:0 0 8px;font-size:clamp(15px,2.4vh,21px);color:#ffc72c}
#menu .main{display:flex;flex-direction:column;min-height:0}
#menu .tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
#menu button{background:#6b1a14;border:0;color:#fff;padding:7px 14px;border-radius:6px;font:inherit;cursor:pointer}
#menu button:hover{background:#8a2218}
#menu .tabs .on{background:#ffc72c;color:#222}
#menu .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;overflow:auto;align-content:start}
#menu .it{background:#3b2622;border-radius:8px;padding:8px;text-align:center;cursor:pointer;user-select:none}
#menu .it:hover{background:#523229}
#menu .it b{display:block;font-size:30px;font-weight:400}
#menu .it span{display:block;color:#ffc72c}
#menu .side{display:flex;flex-direction:column;background:#1c1210;border-radius:8px;padding:10px;min-height:0}
#menu .cart{flex:1;overflow:auto;min-height:80px;margin:6px 0}
#menu .row{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #fff2}
#menu .row i{flex:1;font-style:normal}
#menu .row button{padding:2px 9px}
#menu .tot{font-size:18px;margin:6px 0;text-align:right;color:#ffc72c}
#menu .go{background:#34a853;margin-bottom:6px}#menu .go:hover{background:#3cc460}#menu .go:disabled{background:#555;cursor:default}
@media (max-width:640px),(max-height:520px){#menu .panel{grid-template-columns:minmax(0,1fr) 190px;gap:8px;padding:8px 10px}#menu .it b{font-size:22px}#menu .grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}}`

/** Order screen shared by the cash desk and the self-service kiosks: pick items, "Замовити" hands the cart to the caller. */
export class MenuUI {
  isOpen = false
  private root = document.createElement('div')
  private cart: Cart = new Map()
  private tab = 0
  private onOrder: (cart: Cart) => void = () => {}
  private el = (c: string) => this.root.querySelector<HTMLElement>(c)!

  constructor(private onClose: () => void) {
    document.head.append(Object.assign(document.createElement('style'), { textContent: CSS }))
    this.root.id = 'menu'
    this.root.innerHTML = '<div class="panel"><div class="main"><h2></h2><div class="tabs"></div><div class="grid"></div></div>'
      + '<div class="side"><b>Ваше замовлення</b><div class="cart"></div><div class="tot"></div><button class="go" data-a="order">Замовити</button><button data-a="close">Вийти' + (isTouch ? '' : ' (Esc)') + '</button></div></div>'
    document.body.append(this.root)
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]'); if (!t) return
      const { a, id } = t.dataset as { a: string; id: string }
      sfx.play(a === 'order' ? 'confirm' : a === 'dec' ? 'untick' : 'tick')
      if (a === 'tab') this.tab = +id
      else if (a === 'add' || a === 'inc') { if (units(this.cart) < MAX_UNITS) this.cart.set(id, (this.cart.get(id) ?? 0) + 1) } // the tray holds 8 pieces
      else if (a === 'dec') { const n = (this.cart.get(id) ?? 0) - 1; n > 0 ? this.cart.set(id, n) : this.cart.delete(id) }
      else if (a === 'order' && this.cart.size) { const c = this.cart; this.close(); this.onOrder(c); return }
      else if (a === 'close') { this.close(); return }
      this.render()
    })
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.isOpen) this.close() })
  }

  open(title: string, onOrder: (cart: Cart) => void) {
    this.onOrder = onOrder; this.cart = new Map(); this.tab = 0; this.isOpen = true
    this.el('h2').textContent = title; this.root.style.display = 'grid'
    this.render()
  }

  private close() { this.isOpen = false; this.root.style.display = 'none'; this.onClose() }

  private render() {
    this.el('.tabs').innerHTML = MENU.map((c, i) => `<button data-a="tab" data-id="${i}"${i === this.tab ? ' class="on"' : ''}>${c.title}</button>`).join('')
    this.el('.grid').innerHTML = MENU[this.tab].items.map((i) => `<div class="it" data-a="add" data-id="${i.id}"><b>${i.icon}</b>${i.name}<span>${i.price} ₴</span></div>`).join('')
    const price = new Map(MENU.flatMap((c) => c.items).map((i) => [i.id, i.price]))
    this.el('.cart').innerHTML = [...this.cart].map(([id, n]) =>
      `<div class="row"><i>${id}</i><button data-a="dec" data-id="${id}">−</button>${n}<button data-a="inc" data-id="${id}">+</button><span>${price.get(id)! * n}</span></div>`).join('') || '<small style="opacity:.6">Натисніть на страву, щоб додати</small>'
    this.el('.tot').textContent = `Разом: ${total(this.cart)} ₴` + (units(this.cart) >= MAX_UNITS ? ` (макс. ${MAX_UNITS} позицій)` : '')
    ;(this.el('.go') as HTMLButtonElement).disabled = !this.cart.size
  }
}
