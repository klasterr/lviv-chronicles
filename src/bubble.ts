/** DOM speech bubble pinned to the top of the screen: say() shows it for `secs`, tick(dt) (per frame) hides it again. */
export function speechBubble(border: string, top = '12%') {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;left:50%;top:${top};transform:translateX(-50%);max-width:min(560px,90vw);padding:10px 18px;border-radius:12px;background:#fffe;color:#222;font:17px system-ui,sans-serif;pointer-events:none;display:none;border:3px solid ${border}`
  document.body.append(el)
  let left = 0
  return {
    say(text: string, secs = 7) { el.textContent = text; el.style.display = 'block'; left = secs },
    tick(dt: number) { if (left > 0 && (left -= dt) <= 0) el.style.display = 'none' },
  }
}
