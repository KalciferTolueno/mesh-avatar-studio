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

/** Distance from formants F1 / F2 to each vowel's nearest prototype (log frequency). */
function distances(f1: number, f2: number): Record<Vowel, number> {
  const out = { a: Infinity, i: Infinity, u: Infinity, e: Infinity, o: Infinity };
  for (const [vowel, p1, p2] of PROTOTYPES) {
    // F2 tells the front vowels (i, e) from the back ones (u, o) best, so it weighs a little more
    out[vowel] = Math.min(out[vowel], Math.log(f1 / p1) ** 2 + (Math.log(f2 / p2) * 1.3) ** 2);
  }
  return out;
}
/** Mismatch between a measured spectral envelope (linear magnitude per bin) and each vowel's
 * typical envelope, over 200–3200 Hz in dB. Level and spectral tilt differ between voices and
 * microphones, so a straight line in log frequency is fitted out of the difference first. */
export function matchVowels(env: Float32Array, binHz: number): Record<Vowel, number> {
  const lo = Math.max(1, Math.round(200 / binHz)), hi = Math.min(env.length - 1, Math.round(3200 / binHz));
  const xs: number[] = [], measured: number[] = [];
  for (let i = lo; i <= hi; i++) { xs.push(Math.log(i * binHz)); measured.push(20 * Math.log10(Math.max(env[i], 1e-7))); }
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n;
  const out = { a: Infinity, i: Infinity, u: Infinity, e: Infinity, o: Infinity };
  for (const [vowel, f1, f2] of PROTOTYPES) {
    const diff = xs.map((x, j) => {
      const f = Math.exp(x);
      return measured[j] - 20 * Math.log10(1 / (1 + ((f - f1) / 100) ** 2) + 0.6 / (1 + ((f - f2) / 130) ** 2) + 0.02);
    });
    const md = diff.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let j = 0; j < n; j++) { sxy += (xs[j] - mx) * (diff[j] - md); sxx += (xs[j] - mx) ** 2; }
    const slope = sxy / sxx;
    let err = 0;
    for (let j = 0; j < n; j++) err += (diff[j] - md - slope * (xs[j] - mx)) ** 2;
    out[vowel] = Math.min(out[vowel], err / n);
  }
  return out;
}

/** Nearest vowel for formants F1 / F2. */
export function classifyFormants(f1: number, f2: number): Vowel {
  const d = distances(f1, f2);
  return (Object.keys(d) as Vowel[]).reduce((a, b) => d[a] <= d[b] ? a : b);
}

export class VowelDetector {
  private env = new Float32Array(0);
  private flat = new Float32Array(0);
  private current: Vowel | null = null;
  private quiet = 0;
  // each vowel's mismatch, smoothed over ~0.1 s, and how long a challenger has been clearly better
  private score: Record<Vowel, number> | null = null;
  private challenger: Vowel | null = null;
  private challenge = 0;
  /** dB spectrum (AnalyserNode.getFloatFrequencyData), its bin width in Hz and the voice level 0..1. */
  detect(spectrum: Float32Array, binHz: number, level: number, dt: number): Vowel | null {
    if (level < 0.08) {
      this.quiet += dt;
      if (this.quiet > 0.25) { this.current = null; this.score = null; this.challenger = null; }
      return this.current;
    }
    this.quiet = 0;
    // spectral envelope: join the harmonic peaks (local maxima of the spectrum) with straight
    // lines, so it follows the vocal tract whether the voice is low (dense harmonics) or high
    if (this.env.length !== spectrum.length) { this.env = new Float32Array(spectrum.length); this.flat = new Float32Array(spectrum.length); }
    // pre-emphasis (+6 dB per octave), as in speech analysis: voices lose highs towards 3 kHz,
    // which would otherwise sink the upper harmonics below the noise threshold
    for (let i = 0; i < spectrum.length; i++) this.flat[i] = spectrum[i] + 6 * Math.log2(Math.max(i, 1) * binHz / 200);
    spectrum = this.flat;
    const mag = (i: number) => 10 ** (spectrum[i] / 20);
    const tops: number[] = [];
    const reach = Math.max(1, Math.round(60 / binHz));
    for (let i = 1; i < spectrum.length - 1; i++) {
      let top = true;
      for (let k = Math.max(0, i - reach); k <= Math.min(spectrum.length - 1, i + reach) && top; k++) if (spectrum[k] > spectrum[i]) top = false;
      if (top) tops.push(i);
    }
    // only harmonics of the voice count, not the noise floor between them
    const loudest = Math.max(...tops.map(i => spectrum[i]));
    for (let k = tops.length - 1; k >= 0; k--) if (spectrum[tops[k]] < loudest - 45) tops.splice(k, 1);
    if (tops.length < 2) return this.current;
    for (let i = 0; i < spectrum.length; i++) {
      let j = 0;
      while (j < tops.length - 2 && tops[j + 1] < i) j++;
      const [x0, x1] = [tops[j], tops[j + 1]];
      const u = Math.max(0, Math.min(1, (i - x0) / Math.max(1, x1 - x0)));
      this.env[i] = mag(x0) + (mag(x1) - mag(x0)) * u;
    }
    // compare the whole envelope with each vowel's typical shape: robust when two formants
    // merge into one peak (o in a high voice), unlike picking the second peak
    const raw = matchVowels(this.env, binHz);
    const k = this.score ? 1 - Math.exp(-dt / 0.1) : 1;
    const d = (this.score ??= { ...raw });
    for (const v of Object.keys(raw) as Vowel[]) d[v] += (raw[v] - d[v]) * k;
    const best = (Object.keys(d) as Vowel[]).reduce((x, y) => d[x] <= d[y] ? x : y);
    if (this.current === null) { this.current = best; return best; }
    // switch only to a vowel that is clearly closer, and for a moment (~0.1 s)
    if (best !== this.current && d[best] < d[this.current] * 0.8) {
      this.challenge = this.challenger === best ? this.challenge + dt : dt;
      this.challenger = best;
      if (this.challenge >= 0.09) { this.current = best; this.challenger = null; }
    } else this.challenger = null;
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
