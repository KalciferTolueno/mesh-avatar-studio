// Fork addition (see FORK.md): expressions toggled with keys on the Live page.
import { expect, test } from 'vitest';
import { ExpressionMixer } from '../src/expressions/presets';

test('expressions fade in on top of tracking, combine and fade out', () => {
  const mixer = new ExpressionMixer(), tracked = { eyeLOpen: 1, eyeROpen: 0.9, blush: 0.1, browY: 0.2, angleY: 3 };
  expect(mixer.apply(tracked)).toEqual(tracked);
  mixer.toggle('angry'); mixer.toggle('blush');
  for (let i = 0; i < 60; i++) mixer.step(1 / 60);
  const on = mixer.apply(tracked);
  expect(on.eyeLOpen).toBeCloseTo(0.7, 2); expect(on.eyeROpen).toBeCloseTo(0.63, 2);
  expect(on.browAngle).toBeCloseTo(0.9, 2); expect(on.blush).toBeCloseTo(1, 2); expect(on.angleY).toBe(3);
  mixer.toggle('angry');
  for (let i = 0; i < 60; i++) mixer.step(1 / 60);
  expect(mixer.apply(tracked).eyeLOpen).toBeCloseTo(1, 2);
  mixer.clear();
  for (let i = 0; i < 90; i++) mixer.step(1 / 60);
  expect(mixer.any()).toBe(false);
});

test('without tracking only the touched parameters are set, from the neutral pose', () => {
  const mixer = new ExpressionMixer();
  mixer.toggle('surprised');
  for (let i = 0; i < 60; i++) mixer.step(1 / 60);
  const alone = mixer.applyAlone();
  expect(Object.keys(alone).sort()).toEqual(['browY', 'eyeWide', 'mouthForm', 'mouthOpen']);
  expect(alone.eyeWide).toBeCloseTo(1, 2); expect(alone.mouthOpen).toBeCloseTo(0.35, 2);
});
