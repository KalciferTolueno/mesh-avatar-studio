// Fork addition (see FORK.md): vowel detection from the microphone spectrum.
import { expect, test } from 'vitest';
import { classifyFormants, VowelDetector, type Vowel } from '../src/expressions/vowels';

// dB spectrum of a voiced vowel: harmonics of f0 shaped by two formant resonances
function voice(f0: number, f1: number, f2: number, binHz = 46.875, bins = 512) {
  const out = new Float32Array(bins).fill(-120);
  for (let h = f0; h < bins * binHz; h += f0) {
    const gain = 1 / (1 + ((h - f1) / 90) ** 2) + 0.6 / (1 + ((h - f2) / 120) ** 2) + 0.02;
    const bin = Math.round(h / binHz);
    out[bin] = Math.max(out[bin], 20 * Math.log10(gain) - 20);
  }
  return out;
}
const lower: Record<Vowel, [number, number]> = { a: [760, 1220], i: [290, 2200], u: [340, 1300], e: [470, 1850], o: [490, 860] };
const higher: Record<Vowel, [number, number]> = { a: [920, 1480], i: [330, 2750], u: [390, 1580], e: [570, 2250], o: [570, 1010] };

test('formants map to the nearest Japanese vowel for lower and higher voices', () => {
  for (const [vowel, [f1, f2]] of [...Object.entries(lower), ...Object.entries(higher)]) expect(classifyFormants(f1, f2)).toBe(vowel);
});

test('the detector reads vowels from voiced spectra and keeps one per syllable', () => {
  for (const [f0, table] of [[100, lower], [120, lower], [150, lower], [200, higher], [220, higher], [250, higher]] as const) {
    for (const [vowel, [f1, f2]] of Object.entries(table)) {
      const detector = new VowelDetector();
      let got = null;
      for (let i = 0; i < 6; i++) got = detector.detect(voice(f0, f1, f2), 46.875, 0.5, 1 / 60);
      expect(got, `${vowel} at ${f0} Hz`).toBe(vowel);
    }
  }
  const detector = new VowelDetector();
  for (let i = 0; i < 6; i++) detector.detect(voice(120, ...lower.a), 46.875, 0.5, 1 / 60);
  expect(detector.detect(voice(120, ...lower.i), 46.875, 0.5, 1 / 60)).toBe('a');
  for (let i = 0; i < 30; i++) detector.detect(new Float32Array(512).fill(-120), 46.875, 0, 1 / 60);
  expect(detector.detect(new Float32Array(512).fill(-120), 46.875, 0, 1 / 60)).toBeNull();
});
