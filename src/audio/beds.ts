import type { Sfx } from './sfx'
import { STEP_S, STEPS, distGain, fingerpick, midiHz, pluck, schedule } from './logic'

const smooth = (cur: number, target: number, dt: number, rate: number) => (Math.abs(target - cur) < 1e-4 ? target : cur + (target - cur) * (1 - Math.exp(-rate * dt)))

/** Continuous sounds (all built once, never allocated per frame): city bed, restaurant murmur, fountain, scooter, wind. Targets are set in `t`, `update` eases them in. */
export class Beds {
  /** What should be heard right now (0..1 unless noted); written by AudioSystem every frame. */
  t = { inside: 0, fountain: 0, fountainPan: 0, scooter: 0, speed: 0, wind: 0 }
  private v = { city: 0, room: 0, fountain: 0, scooter: 0, speed: 0, wind: 0 }
  private city: GainNode; private room: GainNode; private fount: GainNode; private fountPan: StereoPannerNode | null
  private scoot: GainNode; private roll: GainNode; private wind: GainNode; private windF: BiquadFilterNode; private hum: [OscillatorNode, OscillatorNode, BiquadFilterNode]

  constructor(private s: Sfx) {
    const c = s.ctx!, out = s.master
    const g = (v: number, to: AudioNode = out) => { const n = c.createGain(); n.gain.value = v; n.connect(to); return n }
    const f = (type: BiquadFilterType, hz: number, q: number, to: AudioNode) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = hz; n.Q.value = q; n.connect(to); return n }
    const src = (to: AudioNode) => { const n = c.createBufferSource(); n.buffer = s.noise; n.loop = true; n.connect(to); n.start(0, Math.random() * 3); return n }
    const lfo = (hz: number, depth: number, to: AudioParam) => { const o = c.createOscillator(), d = c.createGain(); o.frequency.value = hz; d.gain.value = depth; o.connect(d).connect(to); o.start() }

    this.city = g(0) // low rumble of traffic far away, drifting slowly
    const cityF = f('lowpass', 380, 0.5, this.city); src(cityF); lfo(0.07, 120, cityF.frequency)

    this.room = g(0) // restaurant: voices (band noise that swells), ventilation hum
    src(f('bandpass', 420, 0.7, this.room))
    const swell = g(0.5, this.room); src(f('bandpass', 1100, 1, swell)); lfo(0.4, 0.4, swell.gain)
    const hv = c.createOscillator(); hv.frequency.value = 100; hv.connect(g(0.12, this.room)); hv.start()

    this.fountPan = c.createStereoPanner ? c.createStereoPanner() : null // water: broad hiss with bubbling
    this.fountPan?.connect(out)
    this.fount = g(0, this.fountPan ?? out)
    src(f('highpass', 700, 0.7, f('lowpass', 4200, 0.7, this.fount)))
    const jets = g(0.7, this.fount); src(f('bandpass', 2200, 0.6, jets)); lfo(0.6, 0.25, jets.gain)

    this.scoot = g(0) // electric hum: two detuned saws through a low-pass, plus tyre noise
    const lp = f('lowpass', 400, 0.8, this.scoot)
    const o1 = c.createOscillator(), o2 = c.createOscillator()
    o1.type = 'sawtooth'; o2.type = 'square'; o1.connect(lp); o2.connect(g(0.5, lp)); o1.start(); o2.start()
    this.hum = [o1, o2, lp]
    this.roll = g(0); src(f('bandpass', 900, 1.5, this.roll))

    this.wind = g(0); this.windF = f('bandpass', 300, 0.6, this.wind); src(this.windF)
  }

  update(dt: number) {
    const v = this.v, t = this.t
    v.city = smooth(v.city, 0.05 * (1 - t.inside), dt, 3); this.city.gain.value = v.city
    v.room = smooth(v.room, 0.07 * t.inside, dt, 3); this.room.gain.value = v.room
    v.fountain = smooth(v.fountain, t.fountain, dt, 6); this.fount.gain.value = v.fountain * 0.135
    if (this.fountPan) this.fountPan.pan.value = t.fountainPan
    v.scooter = smooth(v.scooter, t.scooter, dt, 8); v.speed = smooth(v.speed, t.speed, dt, 6)
    const k = Math.min(1, v.speed / 11.1)
    this.scoot.gain.value = v.scooter * (0.03 + 0.07 * k)
    this.roll.gain.value = v.scooter * 0.1 * k * k
    const hz = 62 + v.speed * 12
    this.hum[0].frequency.value = hz; this.hum[1].frequency.value = hz * 1.005; this.hum[2].frequency.value = 300 + v.speed * 60
    v.wind = smooth(v.wind, t.wind, dt, 5)
    this.wind.gain.value = 0.14 * v.wind ** 1.5; this.windF.frequency.value = 220 + 700 * v.wind
  }
}

/** Fingerpicked guitar for the street musician: Karplus-Strong notes (cached per pitch) scheduled ahead on the audio clock; silent and unscheduled out of earshot. */
export class Music {
  private bus: GainNode; private pan: StereoPannerNode | null
  private bufs = new Map<number, AudioBuffer>()
  private sch = { t: 0, i: 0 }
  private on = false
  private lvl = 0

  constructor(private s: Sfx) {
    const c = s.ctx!
    this.bus = c.createGain(); this.bus.gain.value = 0
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3800 // takes the digital edge off
    this.pan = c.createStereoPanner ? c.createStereoPanner() : null
    this.bus.connect(tone); tone.connect(this.pan ?? s.master); this.pan?.connect(s.master)
  }

  private buf(m: number) {
    let b = this.bufs.get(m)
    if (!b) { const c = this.s.ctx!, d = pluck(c.sampleRate, midiHz(m), 2.2); b = c.createBuffer(1, d.length, c.sampleRate); b.copyToChannel(d, 0); this.bufs.set(m, b) }
    return b
  }

  private step(i: number, t: number) {
    const c = this.s.ctx!
    for (const n of fingerpick(i % STEPS)) {
      if (this.s.live >= 40) return
      const src = c.createBufferSource(), g = c.createGain()
      src.buffer = this.buf(n.midi); g.gain.value = n.vel * 0.55
      src.connect(g).connect(this.bus); src.start(t + Math.random() * 0.008) // a hair of human timing
      this.s.track(src)
    }
  }

  /** `d` metres to the musician, `pan` from the camera; call every frame. */
  update(dt: number, playing: boolean, d: number, pan: number) {
    const g = playing ? distGain(d, 35) : 0
    this.lvl = smooth(this.lvl, g, dt, 8); this.bus.gain.value = this.lvl
    if (this.pan) this.pan.pan.value = pan
    if (g > 0.003) { this.on = true; schedule(this.sch, this.s.ctx!.currentTime, 0.3, STEP_S, (i, t) => this.step(i, t)) }
    else if (this.on && this.lvl < 0.003) { this.on = false; this.sch.i = 0 } // out of earshot: stop scheduling, start the piece over next time
  }
}
