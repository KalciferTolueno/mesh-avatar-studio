// Fork addition (see FORK.md): a sustained vowel keeps one mouth shape.
import { expect, test } from 'vitest';
import { VowelDetector, type Vowel } from '../src/expressions/vowels';

// deterministic pseudo-random numbers
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
function voice(f0: number, f1: number, f2: number, noise: () => number, tilt = 0, binHz = 46.875, bins = 512) {
  const out = new Float32Array(bins);
  for (let i = 0; i < bins; i++) out[i] = -95 + noise() * 10;
  for (let h = f0; h < bins * binHz; h += f0) {
    const gain = 1 / (1 + ((h - f1) / 90) ** 2) + 0.6 / (1 + ((h - f2) / 120) ** 2) + 0.02;
    const bin = Math.round(h / binHz);
    out[bin] = Math.max(out[bin], 20 * Math.log10(gain) - 20 - tilt * Math.log2(h / 200) + (noise() - 0.5) * 4);
  }
  return out;
}
const lower: Record<Vowel, [number, number]> = { a: [760, 1220], i: [290, 2200], u: [340, 1300], e: [470, 1850], o: [490, 860] };
const higher: Record<Vowel, [number, number]> = { a: [920, 1480], i: [330, 2750], u: [390, 1580], e: [570, 2250], o: [570, 1010] };

test('a sustained vowel with natural wobble keeps its shape for three seconds', () => {
  // tilt: a voice through a microphone loses about 0–9 dB per octave towards 3 kHz
  for (const tilt of [0, 6, 9]) for (const [f0, table] of [[110, lower], [140, lower], [210, higher], [240, higher]] as const) {
    for (const [vowel, [f1, f2]] of Object.entries(table) as [Vowel, [number, number]][]) {
      const noise = rng(f0 * 7 + f1), detector = new VowelDetector();
      const seen: (Vowel | null)[] = [];
      for (let i = 0; i < 180; i++) {
        const wobble = 1 + Math.sin(i / 9) * 0.06 + (noise() - 0.5) * 0.08;      // formants drift ±7 %
        const pitch = f0 * (1 + Math.sin(i / 5) * 0.03);                          // vibrato
        const level = 0.4 + Math.sin(i / 4) * 0.15;                               // loudness wobble
        seen.push(detector.detect(voice(pitch, f1 * wobble, f2 * wobble, noise, tilt), 46.875, level, 1 / 60));
      }
      const settled = seen.slice(15);
      const wrong = settled.filter(v => v !== vowel).length;
      expect(wrong, `${vowel} at ${f0} Hz, tilt ${tilt}: ${[...new Set(settled)].join(',')}`).toBe(0);
    }
  }
});

test('a heard vowel replaces the random vowel the engine picks for each syllable', async () => {
  const { Motion } = await import('../src/engine/motion.js');
  const forms = (voiceVowel: string | null) => {
    const motion = new Motion([500, 400]);
    motion.voiceVowel = voiceVowel; motion.setSpeaking(true);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      motion.setVoiceLevel(0.5 + 0.4 * Math.sin(i / 3));        // a wobbling "ooooo"
      motion.update(1 / 60);
      if (motion.lipOpen !== null && motion.P.mouthOpen > 0.2) seen.add(Math.round(motion.P.mouthForm * 100));
    }
    return seen;
  };
  expect(forms(null).size).toBeGreaterThan(1);
  expect([...forms('o')]).toEqual([60]);
});
