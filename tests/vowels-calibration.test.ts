// Fork addition (see FORK.md): calibrating vowels with the user's own voice and microphone.
import { expect, test } from 'vitest';
import { VowelCalibration, VowelDetector, type Vowel } from '../src/expressions/vowels';

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
// a cheap laptop microphone: no lows below ~350 Hz, little above ~2.8 kHz, a resonance near
// 1.6 kHz and a strong loss of highs
const laptop = (f: number) => -12 * Math.log2(f / 200) + 10 / (1 + ((f - 1600) / 250) ** 2) - 18 / (1 + (f / 350) ** 4) - 24 / (1 + (2800 / f) ** 6);
function voice(f0: number, f1: number, f2: number, noise: () => number, binHz = 46.875, bins = 512) {
  const out = new Float32Array(bins);
  for (let i = 0; i < bins; i++) out[i] = -95 + noise() * 10;
  for (let h = f0; h < bins * binHz; h += f0) {
    const gain = 1 / (1 + ((h - f1) / 90) ** 2) + 0.6 / (1 + ((h - f2) / 120) ** 2) + 0.02;
    const bin = Math.round(h / binHz);
    out[bin] = Math.max(out[bin], 20 * Math.log10(gain) - 20 + laptop(h) + (noise() - 0.5) * 4);
  }
  return out;
}
// an unusual voice: formants a little off the typical tables
const speaker: Record<Vowel, [number, number]> = { a: [700, 1150], i: [320, 2050], u: [380, 1250], e: [520, 1750], o: [520, 900] };
const sustained = (detector: VowelDetector, vowel: Vowel, seed: number) => {
  const noise = rng(seed), seen: (Vowel | null)[] = [];
  const [f1, f2] = speaker[vowel];
  for (let i = 0; i < 180; i++) {
    const wobble = 1 + Math.sin(i / 9) * 0.06 + (noise() - 0.5) * 0.08;
    seen.push(detector.detect(voice(125 * (1 + Math.sin(i / 5) * 0.03), f1 * wobble, f2 * wobble, noise), 46.875, 0.4 + Math.sin(i / 4) * 0.15, 1 / 60));
  }
  return seen.slice(15).filter(v => v !== vowel).length;
};

test('calibrating with the user own voice fixes a cheap microphone', () => {
  const plain = new VowelDetector();
  const before = VowelCalibration.ORDER.reduce((sum, v, i) => sum + sustained(plain, v, 11 + i), 0);
  // the user says a, i, u, e, o; a breath and a pause in between do not count
  // one recording per vowel, as the Live page's buttons do
  const templates = {}, probe = new VowelDetector(), noise = rng(99);
  for (const vowel of VowelCalibration.ORDER) {
    const calibration = new VowelCalibration([vowel]);
    const [f1, f2] = speaker[vowel];
    for (let i = 0; i < 20; i++) calibration.feed(probe.envelope(voice(125, f1, f2, noise), 46.875), 0.05);
    for (let i = 0; calibration.vowel === vowel && i < 200; i++) {
      const wobble = 1 + (noise() - 0.5) * 0.06;
      calibration.feed(probe.envelope(voice(125, f1 * wobble, f2 * wobble, noise), 46.875), 0.4);
    }
    expect(calibration.done).toBe(true); expect(Object.keys(calibration.templates)).toEqual([vowel]);
    Object.assign(templates, calibration.templates);
  }
  const tuned = new VowelDetector();
  tuned.setTemplates(templates);
  const after = VowelCalibration.ORDER.reduce((sum, v, i) => sum + sustained(tuned, v, 11 + i), 0);
  console.log(`laptop microphone: ${before} wrong frames before calibration, ${after} after`);
  expect(before).toBeGreaterThan(0);
  expect(after).toBe(0);
});
