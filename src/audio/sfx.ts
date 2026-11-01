import type { Camera } from 'three'
import { distGain, panFor } from './logic'

type Pos = { x: number; z: number }
const MAX_VOICES = 48 // simultaneously playing source nodes (one-shots and music notes); more are dropped
const RANGE: Record<string, number> = { coin: 30, ding: 40, breakCup: 60, breakFood: 60, breakTray: 60 } // metres to silence for positional one-shots (default 35)

/**
 * Procedural sound effects (Web Audio, no files). `sfx.play('name', pos?, vol?)`: without `pos` the sound is "in your head", with it
 * it is attenuated by distance and panned from the camera. Nothing exists until `unlock()` runs in a user gesture; `?nosound` disables everything.
 */
export class Sfx {
  readonly enabled = !/[?&]nosound\b/.test(location.search)
  ctx: AudioContext | null = null
  master!: GainNode
  noise!: AudioBuffer // 4 s of white noise, shared by every hiss (filters make it wind, steps, water ...)
  muted = false
  cam: Camera | null = null
  live = 0 // source nodes currently playing
  analyser: AnalyserNode | null = null // only with window.__audioDebug (tests)
  played: Record<string, number> = {}
  private want = true
  private toastEl: HTMLDivElement | null = null
  private toastT = 0

  /** Create / resume the context. Call from a click or touch handler; harmless to call again. */
  unlock() {
    if (!this.enabled) return
    if (!this.ctx) {
      try {
        const c = (this.ctx = new (window.AudioContext ?? (window as any).webkitAudioContext)())
        const comp = c.createDynamicsCompressor() // gentle limiter so overlapping sounds never clip
        comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2
        this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.7
        this.master.connect(comp); comp.connect(c.destination)
        if ((window as any).__audioDebug) { this.analyser = c.createAnalyser(); comp.connect(this.analyser) }
        this.noise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate)
        const d = this.noise.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      } catch { this.ctx = null; return }
    }
    this.want = true
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
  }

  /** Suspend while the tab is hidden or the pause screen is up, resume afterwards. */
  sync(run: boolean) {
    const c = this.ctx
    if (!c || run === this.want) return
    this.want = run
    void (run ? c.resume() : c.suspend()).catch(() => {})
  }

  toggleMute() {
    this.muted = !this.muted
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7, this.ctx.currentTime, 0.03)
    const e = (this.toastEl ??= document.createElement('div'))
    e.style.cssText = 'position:fixed;left:50%;top:10%;transform:translateX(-50%);padding:5px 12px;border-radius:6px;background:#000a;color:#fff;font:14px system-ui,sans-serif;pointer-events:none;z-index:30'
    if (!e.parentNode) document.body.append(e)
    e.textContent = this.muted ? 'Звук вимкнено (M)' : 'Звук увімкнено (M)'; e.style.display = 'block'
    clearTimeout(this.toastT); this.toastT = window.setTimeout(() => (e.style.display = 'none'), 1300)
  }

  get ready() { const c = this.ctx; return !!c && !this.muted && c.state === 'running' }

  play(name: keyof typeof R, pos?: Pos, vol = 1) {
    if (!this.ready || this.live >= MAX_VOICES) return
    const c = this.ctx!
    let pan = 0
    if (pos && this.cam) {
      const dx = pos.x - this.cam.position.x, dz = pos.z - this.cam.position.z
      vol *= distGain(Math.hypot(dx, dz), RANGE[name] ?? 35)
      if (vol < 0.01) return
      pan = panFor(dx, dz, this.cam.rotation.y)
    }
    const g = c.createGain(); g.gain.value = vol
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.master) } else g.connect(this.master)
    if (this.analyser) this.played[name] = (this.played[name] ?? 0) + 1
    R[name](this, g, c.currentTime + 0.005)
  }

  track(n: AudioScheduledSourceNode) { this.live++; n.onended = () => { this.live--; n.disconnect() } }

  /** Oscillator blip with an exponential pitch slide and decay. */
  tone(out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, atk = 0.002) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain()
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02); this.track(o)
  }

  /** Filtered noise burst (filter frequency slides f0 -> f1). */
  hiss(out: AudioNode, t: number, type: BiquadFilterType, f0: number, f1: number, q: number, dur: number, vol: number, atk = 0.003) {
    const c = this.ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
    s.buffer = this.noise; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * (this.noise.duration - dur - 0.1)); s.stop(t + dur + 0.02); this.track(s)
  }

  /** Struck metal: fundamental plus two inharmonic partials. */
  bell(out: AudioNode, t: number, f: number, vol: number, dur: number) {
    this.tone(out, t, 'sine', f, f, dur, vol); this.tone(out, t, 'sine', f * 2.76, f * 2.76, dur * 0.55, vol * 0.4); this.tone(out, t, 'sine', f * 5.4, f * 5.4, dur * 0.25, vol * 0.15)
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
type Fn = (s: Sfx, o: AudioNode, t: number) => void
const click = (s: Sfx, o: AudioNode, t: number, f: number, v: number) => { s.tone(o, t, 'triangle', f, f * 0.5, 0.02, v); s.hiss(o, t, 'bandpass', 2800, 2800, 1, 0.015, v * 0.8) }
/** A few randomized debris ticks after a crash. */
const ticks = (s: Sfx, o: AudioNode, t: number, n: number, hi: boolean) => { for (let i = 0; i < n; i++) s.tone(o, t + rnd(0.04, 0.5), 'triangle', (hi ? 3000 : 900) * rnd(0.6, 1.4), hi ? 1500 : 500, 0.03, rnd(0.08, 0.2)) }
const glass = (s: Sfx, o: AudioNode, t: number) => {
  for (let i = 0; i < 6; i++) s.tone(o, t + rnd(0, 0.05), 'sine', rnd(2400, 6900), rnd(2000, 5000), rnd(0.06, 0.16), 0.1)
  s.hiss(o, t, 'highpass', 3500, 3500, 0.7, 0.16, 0.4); s.tone(o, t, 'sine', 160, 70, 0.1, 0.35)
}
const crunch = (s: Sfx, o: AudioNode, t: number) => { s.hiss(o, t, 'lowpass', 2000, 600, 0.7, 0.18, 0.7); s.tone(o, t, 'sine', 150, 60, 0.12, 0.5) }

// Every recipe is short (<1.5 s) and quiet by itself; levels are balanced against each other by ear (see docs/architecture.md, "Звук").
const R = {
  step: (s, o, t) => { const r = rnd(0.85, 1.15); s.tone(o, t, 'sine', 95 * r, 45, 0.09, 0.5); s.hiss(o, t, 'bandpass', 1100 * r, 700 * r, 0.9, 0.07, 0.45) }, // cobbles: dull thump + grit
  stepIn: (s, o, t) => { const r = rnd(0.85, 1.15); s.tone(o, t, 'sine', 130 * r, 70, 0.06, 0.3); s.hiss(o, t, 'bandpass', 3200 * r, 2200, 1.2, 0.035, 0.4); s.hiss(o, t, 'lowpass', 900, 500, 0.7, 0.05, 0.2) }, // tile: short, brighter
  jump: (s, o, t) => s.hiss(o, t, 'bandpass', 500, 1100, 0.8, 0.14, 0.28, 0.03),
  land: (s, o, t) => { s.tone(o, t, 'sine', 120, 40, 0.2, 0.9); s.hiss(o, t, 'lowpass', 700, 250, 0.7, 0.16, 0.7) },
  sit: (s, o, t) => { s.hiss(o, t, 'lowpass', 600, 250, 0.7, 0.16, 0.55); s.tone(o, t, 'sine', 90, 55, 0.14, 0.45); s.hiss(o, t + 0.03, 'bandpass', 1800, 1200, 0.8, 0.12, 0.14, 0.02) },
  stand: (s, o, t) => { s.hiss(o, t, 'bandpass', 1500, 2200, 0.8, 0.14, 0.16, 0.03); s.tone(o, t + 0.1, 'sine', 100, 60, 0.08, 0.2) },
  latch: (s, o, t) => { click(s, o, t, 1500, 0.3); click(s, o, t + 0.07, 1000, 0.25) },
  unlatch: (s, o, t) => { click(s, o, t, 1000, 0.25); click(s, o, t + 0.07, 1500, 0.3) },
  chess: (s, o, t) => { s.tone(o, t, 'sine', 520, 230, 0.045, 0.5); s.hiss(o, t, 'bandpass', 1800, 1800, 2, 0.02, 0.35); s.tone(o, t, 'sine', 160, 110, 0.09, 0.4) },
  chime: (s, o, t) => { s.bell(o, t, 1318, 0.2, 1.1); s.bell(o, t + 0.22, 987, 0.2, 1.4) },
  ding: (s, o, t) => s.bell(o, t, 2637, 0.25, 0.9),
  tune: (s, o, t) => { for (const f of [220, 440, 441.6, 659, 880]) s.tone(o, t + rnd(0, 0.3), 'triangle', f, f, 2.8, 0.05, 0.9) }, // the orchestra tuning to A, a faint swell (opera hall)
  tick: (s, o, t) => { s.tone(o, t, 'triangle', 1500, 1100, 0.03, 0.18); s.hiss(o, t, 'highpass', 5000, 5000, 0.7, 0.015, 0.1) },
  untick: (s, o, t) => s.tone(o, t, 'triangle', 1100, 800, 0.035, 0.18),
  confirm: (s, o, t) => { s.tone(o, t, 'sine', 880, 880, 0.09, 0.2); s.tone(o, t + 0.08, 'sine', 1320, 1320, 0.14, 0.2) },
  coin: (s, o, t) => { s.tone(o, t, 'triangle', 2900, 2900, 0.22, 0.2); s.tone(o, t, 'sine', 4300, 4300, 0.14, 0.15); s.tone(o, t + 0.05, 'triangle', 3500, 3500, 0.2, 0.18) },
  pick: (s, o, t) => { s.hiss(o, t, 'bandpass', 2400, 3200, 0.6, 0.11, 0.3, 0.02); s.tone(o, t, 'sine', 520, 300, 0.04, 0.2) },
  pickCup: (s, o, t) => { s.hiss(o, t, 'highpass', 4500, 4500, 0.7, 0.05, 0.25); s.tone(o, t, 'sine', 760, 420, 0.05, 0.25) },
  pickTray: (s, o, t) => { s.tone(o, t, 'sine', 200, 120, 0.1, 0.3); s.hiss(o, t, 'bandpass', 1400, 900, 0.8, 0.1, 0.25) },
  throw: (s, o, t) => s.hiss(o, t, 'bandpass', 400, 1800, 0.9, 0.2, 0.35, 0.05),
  breakCup: (s, o, t) => { glass(s, o, t); ticks(s, o, t, 4, true) },
  breakFood: (s, o, t) => { crunch(s, o, t); ticks(s, o, t, 3, false) },
  breakTray: (s, o, t) => { glass(s, o, t); crunch(s, o, t + 0.02); s.tone(o, t, 'sine', 100, 50, 0.2, 0.4); ticks(s, o, t, 8, true); ticks(s, o, t, 5, false) },
} satisfies Record<string, Fn>

export const sfx = new Sfx()
