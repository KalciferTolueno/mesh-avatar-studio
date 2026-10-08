// Fork addition (see FORK.md): vowels from the microphone, so the drawn mouths follow the
// actual voice (like VTube Studio's advanced lip sync) instead of a random vowel per syllable.
// It compares the voice's spectral envelope with each Japanese vowel: typical lower and higher
// voices, or the user's own vowels after calibration. Nothing is recorded or sent; calibration
// keeps only one averaged envelope per vowel in this browser.

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
// envelopes are compared on 48 log-spaced frequencies from 200 to 3200 Hz, so templates do not
// depend on the microphone's sample rate or FFT size
export const GRID = Array.from({ length: 48 }, (_, i) => 200 * 16 ** (i / 47));
const LOG_GRID = GRID.map(f => Math.log(f));
/** A vowel's envelope (dB per GRID frequency), e.g. recorded from the user's own voice. */
export type VowelTemplates = Partial<Record<Vowel, number[]>>;

/** Envelope in dB on GRID from a linear envelope per FFT bin. */
export function gridEnvelope(env: Float32Array, binHz: number): number[] {
  return GRID.map(f => {
    const x = Math.min(env.length - 1.001, f / binHz), i = Math.floor(x), u = x - i;
    return 20 * Math.log10(Math.max(env[i] + (env[i + 1] - env[i]) * u, 1e-7));
  });
}
const model = (f1: number, f2: number) => GRID.map(f => 20 * Math.log10(1 / (1 + ((f - f1) / 100) ** 2) + 0.6 / (1 + ((f - f2) / 130) ** 2) + 0.02));
const PROTOTYPE_SHAPES: [Vowel, number[]][] = PROTOTYPES.map(([v, f1, f2]) => [v, model(f1, f2)]);
// mismatch after fitting out level and spectral tilt (a straight line in log frequency)
function residual(measured: number[], shape: number[]) {
  const n = GRID.length, mx = LOG_GRID.reduce((a, b) => a + b, 0) / n;
  const diff = measured.map((m, j) => m - shape[j]);
  const md = diff.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let j = 0; j < n; j++) { sxy += (LOG_GRID[j] - mx) * (diff[j] - md); sxx += (LOG_GRID[j] - mx) ** 2; }
  const slope = sxy / sxx;
  let err = 0;
  for (let j = 0; j < n; j++) err += (diff[j] - md - slope * (LOG_GRID[j] - mx)) ** 2;
  return err / n;
}
/** Mismatch between a measured envelope (dB on GRID) and each vowel: the user's recorded
 * templates when there is one for that vowel, otherwise typical lower and higher voices. */
export function matchVowels(measured: number[], templates?: VowelTemplates | null): Record<Vowel, number> {
  const out = { a: Infinity, i: Infinity, u: Infinity, e: Infinity, o: Infinity };
  const own = templates && (Object.keys(out) as Vowel[]).every(v => templates[v]?.length === GRID.length);
  if (own) for (const v of Object.keys(out) as Vowel[]) out[v] = residual(measured, templates![v]!);
  else for (const [v, shape] of PROTOTYPE_SHAPES) out[v] = Math.min(out[v], residual(measured, shape));
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
  private templates: VowelTemplates | null = null;
  /** Use the user's recorded vowels (calibration), or null for typical voices. */
  setTemplates(templates: VowelTemplates | null) { this.templates = templates; this.score = null; }
  /** The envelope of the current sound (dB on GRID), or null when it is not voiced enough. */
  envelope(spectrum: Float32Array, binHz: number): number[] | null {
    // spectral envelope: join the harmonic peaks (local maxima of the spectrum) with straight
    // lines, so it follows the vocal tract whether the voice is low (dense harmonics) or high
    if (this.env.length !== spectrum.length) { this.env = new Float32Array(spectrum.length); this.flat = new Float32Array(spectrum.length); }
    // pre-emphasis (+6 dB per octave), as in speech analysis: voices lose highs towards 3 kHz,
    // which would otherwise sink the upper harmonics below the noise threshold
    for (let i = 0; i < spectrum.length; i++) this.flat[i] = spectrum[i] + 6 * Math.log2(Math.max(i, 1) * binHz / 200);
    const flat = this.flat;
    const mag = (i: number) => 10 ** (flat[i] / 20);
    const tops: number[] = [];
    const reach = Math.max(1, Math.round(60 / binHz));
    for (let i = 1; i < flat.length - 1; i++) {
      let top = true;
      for (let k = Math.max(0, i - reach); k <= Math.min(flat.length - 1, i + reach) && top; k++) if (flat[k] > flat[i]) top = false;
      if (top) tops.push(i);
    }
    // only harmonics of the voice count, not the noise floor between them
    const loudest = Math.max(...tops.map(i => flat[i]));
    for (let k = tops.length - 1; k >= 0; k--) if (flat[tops[k]] < loudest - 45) tops.splice(k, 1);
    if (tops.length < 2) return null;
    for (let i = 0; i < flat.length; i++) {
      let j = 0;
      while (j < tops.length - 2 && tops[j + 1] < i) j++;
      const [x0, x1] = [tops[j], tops[j + 1]];
      const u = Math.max(0, Math.min(1, (i - x0) / Math.max(1, x1 - x0)));
      this.env[i] = mag(x0) + (mag(x1) - mag(x0)) * u;
    }
    return gridEnvelope(this.env, binHz);
  }
  /** dB spectrum (AnalyserNode.getFloatFrequencyData), its bin width in Hz and the voice level 0..1. */
  detect(spectrum: Float32Array, binHz: number, level: number, dt: number): Vowel | null {
    if (level < 0.08) {
      this.quiet += dt;
      if (this.quiet > 0.25) { this.current = null; this.score = null; this.challenger = null; }
      return this.current;
    }
    this.quiet = 0;
    const measured = this.envelope(spectrum, binHz);
    if (!measured) return this.current;
    // compare the whole envelope with each vowel's typical shape: robust when two formants
    // merge into one peak (o in a high voice), unlike picking the second peak
    const raw = matchVowels(measured, this.templates);
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

/** Records the user's own vowels: each one is held for a moment and its averaged envelope
 * becomes that vowel's template. Only voiced frames count, so pauses do not matter. */
export class VowelCalibration {
  static readonly ORDER: Vowel[] = ['a', 'i', 'u', 'e', 'o'];
  static readonly FRAMES = 40;              // voiced frames per vowel, about 0.7 s
  private index = 0;
  private frames = 0;
  private sum: number[] = [];
  readonly templates: VowelTemplates = {};
  get vowel(): Vowel | null { return VowelCalibration.ORDER[this.index] ?? null; }
  get done() { return this.index >= VowelCalibration.ORDER.length; }
  /** 0..1 progress of the current vowel. */
  get progress() { return this.frames / VowelCalibration.FRAMES; }
  feed(envelope: number[] | null, level: number) {
    const vowel = this.vowel;
    if (!vowel || !envelope || level < 0.12) return;
    // a frame that does not fit the vowel being asked for is a consonant or a breath
    if (this.frames > 8 && residual(envelope, this.sum.map(v => v / this.frames)) > 60) return;
    this.sum = this.frames ? this.sum.map((v, i) => v + envelope[i]) : [...envelope];
    if (++this.frames >= VowelCalibration.FRAMES) {
      this.templates[vowel] = this.sum.map(v => v / this.frames);
      this.index++; this.frames = 0; this.sum = [];
    }
  }
}

const TEMPLATES_KEY = 'mesh-avatar-vowel-templates';
export function loadVowelTemplates(): VowelTemplates | null {
  try {
    const saved = JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? 'null');
    const ok = saved && VowelCalibration.ORDER.every(v => Array.isArray(saved[v]) && saved[v].length === GRID.length && saved[v].every(Number.isFinite));
    return ok ? saved : null;
  } catch { return null; }
}
export function saveVowelTemplates(templates: VowelTemplates | null) {
  try { if (templates) localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates)); else localStorage.removeItem(TEMPLATES_KEY); } catch { /* storage is optional */ }
}
