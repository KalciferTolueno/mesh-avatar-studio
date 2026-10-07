import { expect, test } from 'vitest';
import { FacePose, OneEuro, mapFace, readFace, smoothParameters, rmsLevel, faceNeutral, type FaceResult } from '../src/live/tracking';
const options = { mirror: false, sensitivity: 1, smoothing: 0 };
function result(yaw = 0, shapes: Record<string, number> = {}): FaceResult {
  const a = yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { faceLandmarks: [[]], facialTransformationMatrixes: [{ data: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1] }], faceBlendshapes: [{ categories: Object.entries(shapes).map(([categoryName, score]) => ({ categoryName, score })) }] };
}
test('matrix rotation maps to degrees, neutral calibration and clamped engine limits', () => {
  const face = readFace(result(25))!;
  expect(face.yaw).toBeCloseTo(25);
  expect(mapFace(face, null, options).angleX).toBeCloseTo(25);
  expect(mapFace(face, readFace(result(10)), options).angleX).toBeCloseTo(15);
  expect(mapFace(face, null, { ...options, sensitivity: 2 }).angleX).toBe(30);
  const matrix = result().facialTransformationMatrixes[0].data;
  // 30 degrees around X, then independently around Z.
  const a = Math.PI / 6, c = Math.cos(a), s = Math.sin(a);
  matrix.splice(0, 16, 1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1);
  const input = result(); input.facialTransformationMatrixes[0].data = matrix;
  expect(readFace(input)!.pitch).toBeCloseTo(30);
  input.facialTransformationMatrixes[0].data = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  expect(readFace(input)!.roll).toBeCloseTo(30);
  input.facialTransformationMatrixes[0].data[0] = NaN; expect(readFace(input)).toBeNull();
});
test('mirror flips horizontal pose and gaze, swaps eyes, and blink closes fully', () => {
  const face = readFace(result(20, { eyeBlinkLeft: 0.9, eyeLookOutRight: 0.8 }))!;
  const normal = mapFace(face, null, options), mirror = mapFace(face, null, { ...options, mirror: true });
  expect(normal.eyeLOpen).toBe(0); expect(normal.eyeROpen).toBe(1);
  expect(mirror.eyeROpen).toBe(0); expect(mirror.eyeLOpen).toBe(1);
  expect(mirror.angleX).toBe(-normal.angleX); expect(mirror.gazeX).toBe(-normal.gazeX);
  const pose = new FacePose(); pose.update(result(0, { eyeBlinkLeft: 0.95 }), 0);
  expect(pose.sample(1, 1 / 60, { ...options, smoothing: 1 }).params.eyeLOpen).toBe(0);
});
test('calibration normalizes relaxed eyes, mouth shapes, eyebrows and smile', () => {
  const neutral = readFace(result(0, { eyeBlinkLeft: 0.2, jawOpen: 0.1 }))!;
  const calm = mapFace(neutral, neutral, options);
  expect(calm.eyeLOpen).toBe(1); expect(calm.mouthOpen).toBe(0);
  const face = readFace(result(0, { jawOpen: 0.7, mouthPucker: 0.8, browInnerUp: 0.9, mouthSmileLeft: 0.3, cheekSquintRight: 0.4 }))!;
  const mapped = mapFace(face, neutral, options);
  expect(mapped.mouthOpen).toBeGreaterThan(0.6); expect(mapped.mouthForm).toBeGreaterThan(0);
  expect(mapped.browY).toBeGreaterThan(0); expect(mapped.eyeSmile).toBeGreaterThan(0);
  expect(mapFace(readFace(result(0, { mouthStretchLeft: 1, mouthStretchRight: 1 }))!, null, options).mouthForm).toBe(-1);
  expect(mapFace(readFace(result(0, { jawOpen: 0.5, mouthClose: 1 }))!, null, options).mouthOpen).toBe(0);
});
test('smoothing is time-based and face loss waits 500 ms before easing back to idle', () => {
  const full = smoothParameters({ angleX: 0 }, { angleX: 30 }, 0.1, 0.5);
  const half = smoothParameters(smoothParameters({ angleX: 0 }, { angleX: 30 }, 0.05, 0.5), { angleX: 30 }, 0.05, 0.5);
  expect(full.angleX).toBeCloseTo(half.angleX); expect(full.angleX).toBeGreaterThan(0); expect(full.angleX).toBeLessThan(30);
  const pose = new FacePose(); pose.update(result(30), 0);
  expect(pose.sample(499, 0.016, options)).toMatchObject({ tracking: true, weight: 1 });
  const lost = pose.sample(501, 0.016, options);
  expect(lost.tracking).toBe(false); expect(lost.weight).toBeLessThan(1); expect(lost.params.angleX).toBeGreaterThan(0);
  let last = lost;
  for (let i = 0; i < 200; i++) last = pose.sample(600 + i * 16, 0.016, options);
  expect(last.weight).toBe(0); expect(last.params.angleX).toBeCloseTo(faceNeutral.angleX);
  expect(pose.calibrate(5000)).toBe(false);
  pose.update(result(15), 5001); expect(pose.calibrate(5001)).toBe(true);
  expect(pose.sample(5001, 0.016, options).params.angleX).toBe(0);
});
test('microphone RMS has a noise floor, gain and a finite 0–1 output', () => {
  expect(rmsLevel(new Float32Array(128), 1)).toBe(0);
  const samples = new Float32Array([0.1, -0.1]);
  expect(rmsLevel(samples, 2)).toBeCloseTo(rmsLevel(samples, 1) * 2);
  expect(rmsLevel(new Float32Array([1, -1]), 5)).toBe(1);
  expect(rmsLevel(new Float32Array([NaN]), 1)).toBe(0);
});
test('one euro filter calms jitter at rest but follows fast movement', () => {
  const filter = new OneEuro(1, 0.03);
  let spread = 0;
  filter.filter(0, 1 / 30);
  for (let i = 1; i < 120; i++) spread = Math.max(spread, Math.abs(filter.filter(i % 2 ? 1 : -1, 1 / 30)));
  expect(spread).toBeLessThan(0.4);
  const turn = new OneEuro(1, 0.03); turn.filter(0, 1 / 30);
  let value = 0;
  for (let i = 1; i <= 9; i++) value = turn.filter(i * 3, 1 / 30); // 90°/s head turn
  expect(value).toBeGreaterThan(27 * 0.7);
});
test('a weak webcam blink still closes fully once its peak is learned, and eyes blink together', () => {
  const pose = new FacePose(), opts = { ...options, smoothing: 0 };
  pose.update(result(0, { eyeBlinkLeft: 0.1, eyeBlinkRight: 0.12 }), 0); pose.calibrate(0);
  // this face never scores above 0.55 when the eyes are shut
  pose.update(result(0, { eyeBlinkLeft: 0.55, eyeBlinkRight: 0.5 }), 33);
  expect(pose.sample(33, 1 / 30, opts).params).toMatchObject({ eyeLOpen: 0, eyeROpen: 0 });
  // reopening is filtered but quick: open again within about 100 ms
  let reopened = 0;
  for (let t = 66; t <= 166; t += 33) { pose.update(result(0, { eyeBlinkLeft: 0.1, eyeBlinkRight: 0.12 }), t); reopened = pose.sample(t, 1 / 30, opts).params.eyeLOpen; }
  expect(reopened).toBeGreaterThan(0.97);
  // slight left/right disagreement is merged; a deliberate wink is kept
  const relaxed = readFace(result(0, { eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1 }))!;
  const uneven = mapFace(readFace(result(0, { eyeBlinkLeft: 0.3, eyeBlinkRight: 0.22 }))!, relaxed, options);
  expect(uneven.eyeLOpen).toBe(uneven.eyeROpen);
  const unlinked = mapFace(readFace(result(0, { eyeBlinkLeft: 0.3, eyeBlinkRight: 0.22 }))!, relaxed, { ...options, linkEyes: false });
  expect(unlinked.eyeLOpen).not.toBe(unlinked.eyeROpen);
  const wink = mapFace(readFace(result(0, { eyeBlinkLeft: 0.6, eyeBlinkRight: 0.1 }))!, relaxed, options);
  expect(wink.eyeLOpen).toBe(0); expect(wink.eyeROpen).toBe(1);
});
test('parted lips open the mouth, with a separate mouth sensitivity and a resting dead zone', () => {
  const talk = readFace(result(0, { jawOpen: 0.12, mouthLowerDownLeft: 0.3, mouthLowerDownRight: 0.3 }))!;
  const plain = mapFace(talk, null, options).mouthOpen, boosted = mapFace(talk, null, { ...options, mouthSensitivity: 2 }).mouthOpen;
  expect(plain).toBeGreaterThan(0.2); expect(boosted).toBeGreaterThan(plain * 1.8);
  expect(mapFace(talk, null, { ...options, sensitivity: 2 }).mouthOpen).toBeCloseTo(plain);
  expect(mapFace(readFace(result(0, { jawOpen: 0.03 }))!, null, options).mouthOpen).toBe(0);
});
test('looking up raises the head and moving sideways carries the body with the mirror', () => {
  const a = Math.PI / 9, c = Math.cos(a), s = Math.sin(a);
  // a camera pitch that tips the face down maps to the engine's look-down direction
  const down = result(); down.facialTransformationMatrixes[0].data = [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
  expect(readFace(down)!.pitch).toBeGreaterThan(0);
  expect(mapFace(readFace(down)!, null, options).angleY).toBeLessThan(0);
  const at = (x: number) => { const r = result(); r.facialTransformationMatrixes[0].data[12] = x; return readFace(r)!; };
  const neutral = at(0), moved = mapFace(at(6), neutral, options);
  expect(moved.positionX).toBeCloseTo(0.5); expect(moved.bodyAngleX).toBeGreaterThan(3); expect(moved.bodyAngleZ).toBeLessThan(-2);
  const mirrored = mapFace(at(6), neutral, { ...options, mirror: true });
  expect(mirrored.positionX).toBeCloseTo(-moved.positionX); expect(mirrored.bodyAngleX).toBeCloseTo(-moved.bodyAngleX);
  expect(mapFace(at(6), neutral, { ...options, bodySensitivity: 0 })).toMatchObject({ positionX: 0, bodyAngleX: 0, bodyAngleZ: 0 });
  expect(mapFace(at(6), null, options).positionX).toBe(0);
});
