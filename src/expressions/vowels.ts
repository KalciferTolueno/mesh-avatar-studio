// Fork addition (see FORK.md): vowels from the microphone, so the drawn mouths follow the
// actual voice (like VTube Studio's advanced lip sync) instead of a random vowel per syllable.
// It estimates the first two formants from the smoothed spectrum and picks the nearest
// Japanese vowel among typical lower and higher voices; nothing is recorded or sent.

export type Vowel = 'a' | 'i' | 'u' | 'e' | 'o';
// engine mouth forms (src/engine/kana.js VOWELS): -1 wide (i) .. 0 (a) .. +1 round (u)
export const VOWEL_FORMS: Record<Vowel, number> = { a: 0, i: -0.85, u: 0.9, e: -0.4, o: 0.6 };
// [F1, F2] in Hz for a lower and a higher voice
const PROTOTYPES: [Vowel, number, number][] = [
  ['a', 750, 1250], ['i', 300, 2250], ['u', 350, 1350], ['e', 480, 1850], ['o', 480, 880],
  ['a', 900, 1450], ['i', 340, 2700], ['u', 400, 1600], ['e', 560, 2200], ['o', 560, 1000],
];

function peak(env: Float32Array, hz: number, lo: number, hi: number) {
  const a = Math.max(1, Math.floor(lo / hz)), b = Math.min(env.length - 2, Math.ceil(hi / hz));
  let best = -1, value = -Infinity;
  for (let i = a; i <= b; i++) if (env[i] > value && env[i] >= env[i - 1] && env[i] >= env[i + 1]) { value = env[i]; best = i; }
  if (best < 0) return null;
  // the centre of the resonance, not the first harmonic on its flat top
  const span = Math.max(1, Math.round(150 / hz));
  let sum = 0, weight = 0;
  for (let i = Math.max(a, best - span); i <= Math.min(b, best + span); i++) {
    const w = Math.max(0, env[i] - value * 0.6);
    sum += w * i; weight += w;
  }
  return (weight > 0 ? sum / weight : best) * hz;
}

/** Nearest vowel for formants F1 / F2 (log-frequency distance). */
export function classifyFormants(f1: number, f2: number): Vowel {
  let best: Vowel = 'a', distance = Infinity;
  for (const [vowel, p1, p2] of PROTOTYPES) {
    // F2 tells the front vowels (i, e) from the back ones (u, o) best, so it weighs a little more
    const d = Math.log(f1 / p1) ** 2 + (Math.log(f2 / p2) * 1.3) ** 2;
    if (d < distance) { distance = d; best = vowel; }
  }
  return best;
}

export class VowelDetector {
  private env = new Float32Array(0);
  private votes: Vowel[] = [];
  private current: Vowel | null = null;
  private quiet = 0;
  /** dB spectrum (AnalyserNode.getFloatFrequencyData), its bin width in Hz and the voice level 0..1. */
  detect(spectrum: Float32Array, binHz: number, level: number, dt: number): Vowel | null {
    if (level < 0.08) {
      this.quiet += dt;
      if (this.quiet > 0.25) { this.current = null; this.votes = []; }
      return this.current;
    }
    this.quiet = 0;
    // spectral envelope: join the harmonic peaks (local maxima of the spectrum) with straight
    // lines, so it follows the vocal tract whether the voice is low (dense harmonics) or high
    if (this.env.length !== spectrum.length) this.env = new Float32Array(spectrum.length);
    const mag = (i: number) => 10 ** (spectrum[i] / 20);
    const tops: number[] = [];
    const reach = Math.max(1, Math.round(60 / binHz));
    for (let i = 1; i < spectrum.length - 1; i++) {
      let top = true;
      for (let k = Math.max(0, i - reach); k <= Math.min(spectrum.length - 1, i + reach) && top; k++) if (spectrum[k] > spectrum[i]) top = false;
      if (top && spectrum[i] > -100) tops.push(i);
    }
    if (tops.length < 2) return this.current;
    for (let i = 0; i < spectrum.length; i++) {
      let j = 0;
      while (j < tops.length - 2 && tops[j + 1] < i) j++;
      const [x0, x1] = [tops[j], tops[j + 1]];
      const u = Math.max(0, Math.min(1, (i - x0) / Math.max(1, x1 - x0)));
      this.env[i] = mag(x0) + (mag(x1) - mag(x0)) * u;
    }
    const f1 = peak(this.env, binHz, 250, 1000);
    const f2 = f1 === null ? null : peak(this.env, binHz, Math.max(800, f1 + 250), 3000);
    if (f1 === null || f2 === null) return this.current;
    // a short majority vote keeps one vowel per syllable instead of flickering
    this.votes.push(classifyFormants(f1, f2));
    if (this.votes.length > 5) this.votes.shift();
    const counts = new Map<Vowel, number>();
    for (const v of this.votes) counts.set(v, (counts.get(v) ?? 0) + 1);
    const [top, count] = [...counts].sort((x, y) => y[1] - x[1])[0];
    if (count >= 3 || this.current === null) this.current = top;
    return this.current;
  }
}

/** Turns detected vowels into a mouth form that changes smoothly: each vowel is held for a
 * moment before the next, the form eases towards it, and `strength` pulls the extreme vowels
 * (i, u) towards the neutral mouth. */
export class VowelMouth {
  private form = 0;
  private shown: Vowel | null = null;
  private held = 0;
  step(vowel: Vowel | null, dt: number, smooth: number, strength: number): number | null {
    const s = Math.max(0, Math.min(1, smooth));
    this.held += Math.max(0, dt);
    if (!vowel) { this.shown = null; return null; }
    if (vowel !== this.shown && (this.shown === null || this.held >= 0.05 + 0.15 * s)) { this.shown = vowel; this.held = 0; }
    const target = VOWEL_FORMS[this.shown ?? vowel] * Math.max(0, Math.min(1, strength));
    const tau = 0.015 + 0.12 * s;
    this.form += (target - this.form) * (1 - Math.exp(-Math.max(0, dt) / tau));
    return this.form;
  }
}
