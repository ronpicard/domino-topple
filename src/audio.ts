/** Synthesized sound effects for Domino Topple, entirely Web Audio, no asset files. */

import type { MaterialKey } from './game/types.ts'

const MASTER_GAIN = 0.55
const NOISE_BUFFER_SECONDS = 0.2
/** Impact voices are throttled to at most one per this many seconds, see `shouldPlayImpact`. */
const MIN_IMPACT_INTERVAL_S = 0.012
/** A throttled impact still plays if it is at least this much louder than the one it would replace. */
const IMPACT_OVERRIDE_RATIO = 1.5
const MAX_IMPACT_VOICES = 10

type AudioContextConstructor = typeof AudioContext
type ToneExtras = { type?: OscillatorType; endFreq?: number; attack?: number }

/** A short envelope: near-silent, ramp up to `peak`, ramp back down, both exponential. */
function scheduleEnvelope(gain: GainNode, now: number, attack: number, peak: number, duration: number): void {
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), now + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
}

/** Plays one enveloped oscillator (optionally sweeping to `endFreq`) and cleans itself up. */
function playTone(
  context: AudioContext, out: AudioNode, now: number,
  freq: number, duration: number, peak: number, extras: ToneExtras = {},
): AudioNode {
  const osc = context.createOscillator()
  osc.type = extras.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, now)
  if (extras.endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(extras.endFreq, now + duration)
  }
  const gain = context.createGain()
  scheduleEnvelope(gain, now, extras.attack ?? 0.006, peak, duration)
  osc.connect(gain)
  gain.connect(out)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
  osc.start(now)
  osc.stop(now + duration + 0.02)
  return gain
}

/** Plays one enveloped, band-passed slice of the shared noise buffer and cleans itself up. */
function playNoiseBurst(
  context: AudioContext, out: AudioNode, buffer: AudioBuffer, now: number,
  freq: number, q: number, duration: number, peak: number, attack = 0.003,
): AudioNode {
  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = duration > NOISE_BUFFER_SECONDS
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = q
  const gain = context.createGain()
  scheduleEnvelope(gain, now, attack, peak, duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(out)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }
  source.start(now)
  source.stop(now + duration + 0.02)
  return gain
}

/** Plays a short staggered run of tones: the arpeggio used by chime-like award sounds. */
function playArpeggio(
  context: AudioContext, out: AudioNode, now: number,
  freqs: readonly number[], noteDuration: number, peak: number, extras: ToneExtras, stagger: number,
): void {
  freqs.forEach((freq, i) => playTone(context, out, now + i * stagger, freq, noteDuration, peak, extras))
}

/** Per-material timbre for `impact`: the bandpass center/Q for the noise burst and the ping's tone. */
interface ImpactTimbre {
  noiseFreq: number
  noiseQ: number
  pingType: OscillatorType
  pingFreq: number
  pingDecay: number
  /** Extra ringing partials (metal/brass) played alongside the ping, relative to `pingFreq`. */
  ringPartials?: readonly number[]
}

const DEFAULT_TIMBRE: ImpactTimbre = { noiseFreq: 1400, noiseQ: 2.5, pingType: 'triangle', pingFreq: 900, pingDecay: 0.09 }

const IMPACT_TIMBRES: Partial<Record<MaterialKey, ImpactTimbre>> = {
  domino: { noiseFreq: 2200, noiseQ: 3.2, pingType: 'triangle', pingFreq: 2400, pingDecay: 0.06 },
  dominoTall: { noiseFreq: 2200, noiseQ: 3.2, pingType: 'triangle', pingFreq: 1500, pingDecay: 0.08 },
  wood: { noiseFreq: 900, noiseQ: 1.8, pingType: 'triangle', pingFreq: 480, pingDecay: 0.1 },
  woodDark: { noiseFreq: 900, noiseQ: 1.8, pingType: 'triangle', pingFreq: 420, pingDecay: 0.11 },
  metal: { noiseFreq: 1600, noiseQ: 4, pingType: 'sine', pingFreq: 1800, pingDecay: 0.25, ringPartials: [1, 2.4, 3.8] },
  brass: { noiseFreq: 1600, noiseQ: 4, pingType: 'sine', pingFreq: 2000, pingDecay: 0.25, ringPartials: [1, 2.4, 3.8] },
  marble: { noiseFreq: 3400, noiseQ: 6, pingType: 'sine', pingFreq: 3200, pingDecay: 0.12 },
  plastic: { noiseFreq: 1400, noiseQ: 2.8, pingType: 'square', pingFreq: 1100, pingDecay: 0.07 },
}

/** Sound effects for the diorama. Every method is a no-op until `unlock()` succeeds. */
export interface GameAudio {
  /** Creates/resumes the AudioContext; call from the first user gesture. Safe to call repeatedly. */
  unlock(): void
  setMuted(muted: boolean): void
  /** A short "clack" for a physics collision. `strength` is roughly impact speed, unbounded but typically 0..1+. */
  impact(strength: number, material: MaterialKey): void
  chime(): void
  star(): void
  spring(): void
  place(): void
  remove(): void
  click(): void
  success(): void
  fail(): void
  whoosh(): void
}

export function createAudio(): GameAudio {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let noiseBuffer: AudioBuffer | null = null
  let unlocked = false
  let muted = false

  let lastImpactAt = -Infinity
  let lastImpactVolume = 0
  const activeImpactVoices: { gain: GainNode; volume: number }[] = []

  function ensureContext(): boolean {
    if (ctx && master) return true
    try {
      const w = window as unknown as {
        AudioContext?: AudioContextConstructor
        webkitAudioContext?: AudioContextConstructor
      }
      const Ctor = w.AudioContext ?? w.webkitAudioContext
      if (!Ctor) return false
      const context = new Ctor()
      const compressor = context.createDynamicsCompressor()
      compressor.connect(context.destination)
      const gain = context.createGain()
      gain.gain.value = muted ? 0 : MASTER_GAIN
      gain.connect(compressor)
      ctx = context
      master = gain
      return true
    } catch {
      ctx = null
      master = null
      return false
    }
  }

  function unlock(): void {
    try {
      if (!ensureContext() || !ctx) return
      if (ctx.state === 'suspended') void ctx.resume()
      unlocked = true
    } catch { /* no-op: audio is optional */ }
  }

  function setMuted(nextMuted: boolean): void {
    muted = nextMuted
    if (!ctx || !master) return
    try {
      const now = ctx.currentTime
      const target = muted ? 0 : MASTER_GAIN
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(target, now + 0.03)
    } catch { /* no-op: audio is optional */ }
  }

  function canPlay(): boolean {
    return unlocked && !muted && ctx !== null && master !== null
  }

  /** Runs `action` with the live context/master gain when playable, and never throws. */
  function withAudio(action: (context: AudioContext, out: GainNode) => void): void {
    if (!canPlay() || !ctx || !master) return
    try {
      action(ctx, master)
    } catch { /* no-op: audio is optional */ }
  }

  /** One shared 0.2 s white-noise buffer, generated once and reused by every noise-based voice. */
  function getNoiseBuffer(context: AudioContext): AudioBuffer {
    if (noiseBuffer) return noiseBuffer
    const length = Math.floor(context.sampleRate * NOISE_BUFFER_SECONDS)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    noiseBuffer = buffer
    return buffer
  }

  /** Applies the 12 ms throttle: true if this impact should be dropped in favor of the recent one. */
  function shouldDropImpact(now: number, volume: number): boolean {
    if (now - lastImpactAt >= MIN_IMPACT_INTERVAL_S) return false
    return volume < lastImpactVolume * IMPACT_OVERRIDE_RATIO
  }

  /** Enforces the 10-voice cap: drops the quietest voice (new or active) so at most 10 play at once. */
  function admitImpactVoice(volume: number): boolean {
    if (activeImpactVoices.length < MAX_IMPACT_VOICES) return true
    let quietestIndex = 0
    for (let i = 1; i < activeImpactVoices.length; i++) {
      if (activeImpactVoices[i].volume < activeImpactVoices[quietestIndex].volume) quietestIndex = i
    }
    const quietest = activeImpactVoices[quietestIndex]
    if (quietest.volume >= volume) return false
    try {
      quietest.gain.gain.cancelScheduledValues(0)
      quietest.gain.gain.value = 0
    } catch { /* no-op: audio is optional */ }
    activeImpactVoices.splice(quietestIndex, 1)
    return true
  }

  function trackImpactVoice(gain: GainNode, volume: number, durationS: number): void {
    const entry = { gain, volume }
    activeImpactVoices.push(entry)
    setTimeout(() => {
      const index = activeImpactVoices.indexOf(entry)
      if (index >= 0) activeImpactVoices.splice(index, 1)
    }, (durationS + 0.03) * 1000)
  }

  function impact(strength: number, material: MaterialKey): void {
    withAudio((context, out) => {
      const now = context.currentTime
      const volume = Math.pow(Math.max(0, strength), 1.3)
      if (shouldDropImpact(now, volume)) return
      if (!admitImpactVoice(volume)) return
      lastImpactAt = now
      lastImpactVolume = volume

      const timbre = IMPACT_TIMBRES[material] ?? DEFAULT_TIMBRE
      const detune = 1 + (Math.random() * 2 - 1) * 0.06
      const noisePeak = 0.16 * Math.min(1, volume)
      const pingPeak = 0.14 * Math.min(1, volume)
      const buffer = getNoiseBuffer(context)
      const noiseDuration = 0.05
      const noiseGain = playNoiseBurst(
        context, out, buffer, now, timbre.noiseFreq * detune, timbre.noiseQ, noiseDuration, noisePeak,
      ) as GainNode
      trackImpactVoice(noiseGain, volume, noiseDuration)

      if (timbre.ringPartials) {
        timbre.ringPartials.forEach((partial, i) => {
          playTone(
            context, out, now, timbre.pingFreq * partial * detune, timbre.pingDecay, pingPeak * (0.7 - i * 0.15),
            { type: timbre.pingType },
          )
        })
      } else {
        playTone(context, out, now, timbre.pingFreq * detune, timbre.pingDecay, pingPeak, { type: timbre.pingType })
      }
    })
  }

  function chime(): void {
    withAudio((context, out) => {
      const now = context.currentTime
      const base = 880
      const partials = [1, 2.76, 5.4]
      partials.forEach((partial, i) => {
        playTone(context, out, now, base * partial, 1.8, 0.11 * (1 - i * 0.25), { type: 'sine', attack: 0.01 })
      })
    })
  }

  function star(): void {
    withAudio((context, out) => {
      const now = context.currentTime
      playArpeggio(context, out, now, [1046.5, 1318.51, 1567.98, 2093], 0.1, 0.12, { type: 'sine', attack: 0.003 }, 0.05)
    })
  }

  function spring(): void {
    withAudio((context, out) => {
      const now = context.currentTime
      const osc = context.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(180, now)
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.18)
      const vibrato = context.createOscillator()
      vibrato.frequency.value = 22
      const vibratoGain = context.createGain()
      vibratoGain.gain.value = 18
      vibrato.connect(vibratoGain)
      vibratoGain.connect(osc.frequency)
      const gain = context.createGain()
      scheduleEnvelope(gain, now, 0.01, 0.13, 0.22)
      osc.connect(gain)
      gain.connect(out)
      osc.onended = () => {
        osc.disconnect()
        vibrato.disconnect()
        vibratoGain.disconnect()
        gain.disconnect()
      }
      osc.start(now)
      vibrato.start(now)
      osc.stop(now + 0.24)
      vibrato.stop(now + 0.24)
    })
  }

  function place(): void {
    withAudio((context, out) => {
      const now = context.currentTime
      const buffer = getNoiseBuffer(context)
      playNoiseBurst(context, out, buffer, now, 700, 1.6, 0.06, 0.07, 0.004)
      playTone(context, out, now, 260, 0.09, 0.06, { type: 'triangle', endFreq: 160 })
    })
  }

  function remove(): void {
    withAudio((context, out) => {
      const now = context.currentTime
      const buffer = getNoiseBuffer(context)
      playNoiseBurst(context, out, buffer, now, 500, 1.4, 0.05, 0.06, 0.003)
      playTone(context, out, now, 170, 0.07, 0.05, { type: 'triangle', endFreq: 100 })
    })
  }

  function click(): void {
    withAudio((context, out) => {
      const now = context.currentTime
      playTone(context, out, now, 1200, 0.03, 0.05, { type: 'square', attack: 0.001 })
    })
  }

  function success(): void {
    withAudio((context, out) => {
      const now = context.currentTime
      playArpeggio(context, out, now, [523.25, 659.25, 783.99], 0.16, 0.13, { type: 'triangle', attack: 0.005 }, 0.09)
    })
  }

  function fail(): void {
    withAudio((context, out) => {
      const now = context.currentTime
      playTone(context, out, now, 330, 0.22, 0.1, { type: 'sine', endFreq: 260, attack: 0.01 })
      playTone(context, out, now + 0.16, 247, 0.28, 0.09, { type: 'sine', endFreq: 190, attack: 0.01 })
    })
  }

  function whoosh(): void {
    withAudio((context, out) => {
      const now = context.currentTime
      const buffer = getNoiseBuffer(context)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      const filter = context.createBiquadFilter()
      filter.type = 'bandpass'
      filter.Q.value = 1.2
      filter.frequency.setValueAtTime(300, now)
      filter.frequency.exponentialRampToValueAtTime(2200, now + 0.35)
      filter.frequency.exponentialRampToValueAtTime(500, now + 0.6)
      const gain = context.createGain()
      scheduleEnvelope(gain, now, 0.08, 0.1, 0.6)
      source.connect(filter)
      filter.connect(gain)
      gain.connect(out)
      source.onended = () => {
        source.disconnect()
        filter.disconnect()
        gain.disconnect()
      }
      source.start(now)
      source.stop(now + 0.65)
    })
  }

  return { unlock, setMuted, impact, chime, star, spring, place, remove, click, success, fail, whoosh }
}

/** The single shared audio singleton the app talks to. */
export const audio: GameAudio = createAudio()
