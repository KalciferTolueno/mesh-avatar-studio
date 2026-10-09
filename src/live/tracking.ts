import { PARAMS } from '../engine/rig.js';

export interface FaceResult {
  faceLandmarks: unknown[][];
  faceBlendshapes: { categories: { categoryName: string; score: number }[] }[];
  facialTransformationMatrixes: { data: number[] }[];
}
/** Head rotation in degrees and head position (MediaPipe face-geometry units, about 1 cm) seen by the camera. */
export interface RawFace { yaw: number; pitch: number; roll: number; x?: number; y?: number; z?: number; shapes: Record<string, number> }
export interface TrackingOptions {
  mirror: boolean; sensitivity: number; smoothing: number;
  /** Mouth opening gain, separate from head sensitivity; defaults to 1. */
  mouthSensitivity?: number;
  /** Blink both eyes together unless one is clearly winking; defaults to true. */
  linkEyes?: boolean;
  /** How strongly moving sideways sways and leans the body; defaults to 1. */
  bodySensitivity?: number;
  /** How far the avatar follows the head across the screen and zooms when leaning in; defaults to 1. */
  screenMove?: number;
  /** Caps on the screen movement, 0–1 of its full range (default 1): sideways, up, down, zoom in, zoom out. */
  limitSide?: number; limitUp?: number; limitDown?: number; limitIn?: number; limitOut?: number;
  /** Expression ranges, like VTube Studio's amplified mappings (defaults in brackets): head pitch
   * gain [1], wide-eye surprise [0], brows [1], blush on smile [0], smiling eyes [1]. */
  pitchBoost?: number; eyeWideGain?: number; browGain?: number; blushGain?: number; smileEyes?: number;
  /** Live only (src/expressions/life.ts): breathing amount 0–1 and blink source. */
  breathing?: number; blinkMode?: 'camera' | 'auto' | 'both';
  /** Live only (src/expressions/vowels.ts): mouth shape from the vowels in the microphone. */
  voiceVowels?: boolean;
  /** How softly the mouth changes between vowels (0–1) and how marked the vowels are (0–1). */
  vowelSmooth?: number; vowelStrength?: number;
  /** Caps on the forward / back body lean, 0–1 of its full range (default 1). */
  limitLeanForward?: number; limitLeanBack?: number;
  /** Fork (src/live/LiveLost.tsx): when the face is lost — seconds before reacting [0.5], seconds
   * to return to rest [0.6], and what the avatar does meanwhile: idle motions, stay at rest, or
   * hold the last head / body pose ['idle']. Live only: expression shown while lost and
   * animation played when the face is back ('' for none). */
  lostDelay?: number; lostReturn?: number; lostMode?: 'idle' | 'rest' | 'hold';
  lostExpression?: string; foundAnimation?: string;
}
/** Blink score range per eye: [relaxed open score, score when fully closed]. */
export type EyeRanges = Record<'Left' | 'Right', readonly [number, number]>;
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const faceNeutral: Record<string, number> = {
  angleX: 0, angleY: 0, angleZ: 0, bodyAngleX: 0, bodyAngleY: 0, bodyAngleZ: 0,
  positionX: 0, positionY: 0, positionZ: 0, eyeWide: 0, blush: 0, eyeLOpen: 1, eyeROpen: 1, gazeX: 0, gazeY: 0, mouthOpen: 0, mouthForm: 0, browY: 0, eyeSmile: 0, eyeSmileL: 0,
};
export function readFace(result: FaceResult): RawFace | null {
  const matrix = result.facialTransformationMatrixes[0]?.data;
  if (!result.faceLandmarks.length || !matrix || matrix.length !== 16 || !matrix.every(Number.isFinite)) return null;
  // MediaPipe matrices are column-major. Remove scale before extracting Y-X-Z rotation.
  const m = [...matrix];
  for (const offset of [0, 4, 8]) {
    const length = Math.hypot(m[offset], m[offset + 1], m[offset + 2]);
    if (length < 1e-6) return null;
    for (let i = 0; i < 3; i++) m[offset + i] /= length;
  }
  const degrees = 180 / Math.PI;
  return { yaw: Math.atan2(m[8], m[10]) * degrees, pitch: Math.asin(clamp(-m[9], -1, 1)) * degrees,
    roll: Math.atan2(m[1], m[5]) * degrees, x: matrix[12], y: matrix[13], z: matrix[14],
    shapes: Object.fromEntries((result.faceBlendshapes[0]?.categories ?? []).map(shape => [shape.categoryName, clamp(shape.score)])) };
}
const limit = (value: number | undefined) => clamp(value ?? 1);
const angleDelta = (value: number, neutral: number) => ((value - neutral + 540) % 360) - 180;
// Webcam blink scores rarely reach 1: many faces peak around 0.5-0.7. Without a measured
// peak, assume the eye is closed this far above its relaxed score.
const DEFAULT_CLOSED_SPAN = 0.4;
/** `origin`: where the head was when tracking started, used for screen movement until calibrated. */
export type HeadOrigin = Partial<Record<'x' | 'y' | 'z', number>>;
export function mapFace(face: RawFace, neutral: RawFace | null, options: TrackingOptions, eyeRanges?: EyeRanges, origin?: HeadOrigin | null): Record<string, number> {
  const s = (key: string) => face.shapes[key] ?? 0;
  const n = (key: string) => neutral?.shapes[key] ?? 0;
  const d = (key: string) => s(key) - n(key);
  const mean = (a: string, b: string) => (d(a) + d(b)) / 2;
  const mirror = options.mirror ? -1 : 1, gain = clamp(options.sensitivity, 0.25, 2);
  const mouthGain = clamp(options.mouthSensitivity ?? 1, 0.25, 3);
  const x = clamp(angleDelta(face.yaw, neutral?.yaw ?? 0) * gain * mirror, -30, 30);
  // camera pitch grows as the head tips down; the engine's angleY grows looking up
  // the camera sees a smaller pitch range than the avatar has: VTube Studio maps ±20° to ±30°
  const y = clamp(-angleDelta(face.pitch, neutral?.pitch ?? 0) * gain * clamp(options.pitchBoost ?? 1, 0.5, 2.5), -30, 30);
  const z = clamp(angleDelta(face.roll, neutral?.roll ?? 0) * gain * mirror, -30, 30);
  // Eye openness eases from fully open to fully closed across the middle of this eye's own
  // blink range, so a webcam blink that never scores near 1 still closes the eye completely.
  const open = (side: 'Left' | 'Right') => {
    const [relaxed, closed] = eyeRanges?.[side] ?? [n(`eyeBlink${side}`), Math.min(0.95, n(`eyeBlink${side}`) + DEFAULT_CLOSED_SPAN)];
    const span = Math.max(0.15, closed - relaxed);
    return 1 - smoothstep(relaxed + span * 0.25, relaxed + span * 0.8, s(`eyeBlink${side}`));
  };
  let left = open(options.mirror ? 'Right' : 'Left'), right = open(options.mirror ? 'Left' : 'Right');
  // Like VTube Studio's eye linking: tracking noise makes the two eyes disagree slightly,
  // which reads as a lazy half-wink. Only a clear difference is kept as a wink.
  if ((options.linkEyes ?? true) && Math.abs(left - right) < 0.45) left = right = (left + right) / 2;
  // Lips parting counts too: talking moves the lips far more than the jaw score.
  const lips = 0.5 * mean('mouthLowerDownLeft', 'mouthLowerDownRight') + 0.3 * mean('mouthUpperUpLeft', 'mouthUpperUpRight');
  const jaw = (d('jawOpen') + Math.max(0, lips) - Math.max(0, d('mouthClose'))) / Math.max(0.2, 1 - n('jawOpen'));
  const smile = clamp((mean('mouthSmileLeft', 'mouthSmileRight') + mean('cheekSquintLeft', 'cheekSquintRight')) * 0.3 * clamp(options.smileEyes ?? 1, 0, 3));
  // wide-open eyes: MediaPipe's eyeWide scores stay small, so they are amplified; closing eyes cancel it
  const wide = clamp(mean('eyeWideLeft', 'eyeWideRight') * 4 * clamp(options.eyeWideGain ?? 0, 0, 3)) * Math.min(left, right, 1);
  const blush = clamp(mean('mouthSmileLeft', 'mouthSmileRight') * 1.6 * clamp(options.blushGain ?? 0, 0, 3));
  // Moving sideways (not only turning) carries the body: it shifts, leans and the whole
  // avatar slides a little, like VTube Studio's face-position movement. Same mirroring as yaw.
  // the calibrated pose, otherwise the first tracked position, is the centre of the screen movement
  const reference = neutral ?? origin;
  const offset = (key: 'x' | 'y' | 'z') => Number.isFinite(face[key]) ? (face[key] ?? 0) - (reference?.[key] ?? face[key] ?? 0) : 0;
  const side = offset('x') * mirror * clamp(options.bodySensitivity ?? 1, 0, 3);
  // like VTube Studio's model movement: the avatar follows the head across the screen and
  // comes closer when leaning towards the camera (camera space: y up, z towards the viewer)
  const move = clamp(options.screenMove ?? 1, 0, 3);
  return { angleX: x, angleY: y, angleZ: z,
    bodyAngleX: clamp(x * 0.2 + side * 0.6, -10, 10), bodyAngleZ: clamp(z * 0.2 - side * 0.4, -10, 10),
    // fork: forward / back lean, like VTube Studio's FaceAngleY -> BodyAngleY at a third, plus
    // leaning towards the camera (about 8 cm closer reaches the full forward lean)
    bodyAngleY: clamp((y / 2 - offset('z') * 0.7) * clamp(options.bodySensitivity ?? 1, 0, 3), -10 * limit(options.limitLeanForward), 10 * limit(options.limitLeanBack)),
    // about 8 cm sideways, 7 cm up or down and 14 cm closer reach the full movement
    // capped so the avatar stays framed (Live: "Movement limits")
    positionX: clamp(offset('x') * mirror * move / 8, -limit(options.limitSide), limit(options.limitSide)),
    positionY: clamp(offset('y') * move / 7, -limit(options.limitDown), limit(options.limitUp)),
    positionZ: clamp(offset('z') * move / 14, -limit(options.limitOut), limit(options.limitIn)),
    eyeLOpen: left, eyeROpen: right,
    gazeX: clamp((d('eyeLookOutRight') - d('eyeLookInRight') + d('eyeLookInLeft') - d('eyeLookOutLeft')) * mirror, -1, 1),
    gazeY: clamp(mean('eyeLookUpLeft', 'eyeLookUpRight') - mean('eyeLookDownLeft', 'eyeLookDownRight'), -1, 1),
    // a small dead zone keeps a resting mouth shut against tracking noise
    mouthOpen: clamp((jaw * mouthGain - 0.04) / 0.96),
    mouthForm: clamp((d('mouthPucker') + d('mouthFunnel') - mean('mouthSmileLeft', 'mouthSmileRight') - mean('mouthStretchLeft', 'mouthStretchRight')) * gain, -1, 1),
    browY: clamp((d('browInnerUp') + mean('browOuterUpLeft', 'browOuterUpRight') - mean('browDownLeft', 'browDownRight')) * gain * clamp(options.browGain ?? 1, 0, 3), -1, 1),
    eyeSmile: smile, eyeSmileL: smile, eyeWide: wide, blush };
}
export function smoothParameters(current: Record<string, number>, target: Record<string, number>, dt: number, smoothing: number) {
  const tau = clamp(smoothing) * 0.25;
  const alpha = tau === 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau);
  return Object.fromEntries(Object.entries(target).map(([key, value]) => [key, (current[key] ?? value) + (value - (current[key] ?? value)) * alpha]));
}
/**
 * One Euro filter (Casiez et al. 2012): heavy smoothing while a value is steady, little lag
 * while it moves fast. Removes jitter at rest without making quick turns or blinks sluggish.
 */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  constructor(private minCutoff: number, private beta: number, private dCutoff = 1) {}
  private static alpha(cutoff: number, dt: number) { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); }
  reset() { this.x = null; this.dx = 0; }
  filter(value: number, dt: number, cutoffScale = 1) {
    if (this.x === null || !(dt > 0)) { this.x ??= value; return this.x; }
    const dx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dx - this.dx);
    const cutoff = this.minCutoff * cutoffScale + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}
// Per-parameter filter tuning: [minimum cutoff Hz, speed coefficient]. Head angles are in
// degrees, the rest in 0-1 units, so their speed coefficients differ in scale.
const FILTERS: Record<string, readonly [number, number]> = {
  angleX: [1.0, 0.03], angleY: [1.0, 0.03], angleZ: [1.0, 0.03], bodyAngleX: [0.8, 0.1], bodyAngleY: [0.8, 0.1], bodyAngleZ: [0.8, 0.1], positionX: [0.8, 1.0], positionY: [0.8, 1.0], positionZ: [0.6, 0.8],
  eyeLOpen: [2.5, 1.5], eyeROpen: [2.5, 1.5], mouthOpen: [2.0, 1.0], eyeWide: [1.5, 1.0], blush: [0.5, 0.2],
  gazeX: [0.8, 0.4], gazeY: [0.8, 0.4], mouthForm: [0.8, 0.3], browY: [0.8, 0.3], eyeSmile: [0.6, 0.2], eyeSmileL: [0.6, 0.2],
};
export class FacePose {
  private face: RawFace | null = null;
  private neutral: RawFace | null = null;
  private seen = -Infinity;
  private params = { ...faceNeutral };
  private weight = 0;
  private filters = Object.fromEntries(Object.entries(FILTERS).map(([key, [cutoff, beta]]) => [key, new OneEuro(cutoff, beta)]));
  // highest blink score seen per eye, slowly forgotten, to learn how far this face's blink goes
  private blinkPeak = { Left: 0, Right: 0 };
  private origin: HeadOrigin | null = null;
  update(result: FaceResult, now: number) {
    const face = readFace(result);
    if (!face) return;
    const dt = Number.isFinite(this.seen) ? Math.max(0, now - this.seen) / 1000 : 0;
    for (const side of ['Left', 'Right'] as const) {
      const score = face.shapes[`eyeBlink${side}`] ?? 0;
      this.blinkPeak[side] = Math.max(score, this.blinkPeak[side] * Math.exp(-dt / 90));
    }
    this.face = face; this.seen = now;
    if (!this.origin && [face.x, face.y, face.z].every(Number.isFinite)) this.origin = { x: face.x, y: face.y, z: face.z };
  }
  calibrate(now: number) {
    if (!this.face || now - this.seen > 500) return false;
    this.neutral = structuredClone(this.face); this.params = { ...faceNeutral };
    this.origin = { x: this.face.x, y: this.face.y, z: this.face.z };
    for (const filter of Object.values(this.filters)) filter.reset();
    return true;
  }
  reset() {
    this.face = null; this.neutral = null; this.origin = null; this.seen = -Infinity; this.blinkPeak = { Left: 0, Right: 0 };
    for (const filter of Object.values(this.filters)) filter.reset();
  }
  private eyeRanges(): EyeRanges {
    const range = (side: 'Left' | 'Right') => {
      const relaxed = this.neutral?.shapes[`eyeBlink${side}`] ?? 0;
      // trust a learned peak only once it is clearly above the relaxed score
      const learned = this.blinkPeak[side] * 0.9;
      const closed = learned > relaxed + 0.2 ? learned : Math.min(0.95, relaxed + DEFAULT_CLOSED_SPAN);
      return [relaxed, closed] as const;
    };
    return { Left: range('Left'), Right: range('Right') };
  }
  sample(now: number, dt: number, options: TrackingOptions) {
    const delay = clamp(options.lostDelay ?? 0.5, 0, 10), back = clamp(options.lostReturn ?? 0.6, 0.05, 10);
    const tracking = !!this.face && now - this.seen <= delay * 1000;
    // hold: the last head and body pose stays (the face relaxes); idle / rest hand the avatar back
    const hold = !tracking && !!this.face && options.lostMode === 'hold';
    if (tracking) {
      const target = mapFace(this.face!, this.neutral, options, this.eyeRanges(), this.origin);
      // the Smoothing slider scales every cutoff: 0 is twice as responsive, 1 eight times calmer
      const scale = 2 ** (1 - 4 * clamp(options.smoothing));
      this.params = Object.fromEntries(Object.entries(target).map(([key, value]) =>
        [key, this.filters[key] ? this.filters[key].filter(value, dt, scale) : value]));
      // a closed eye snaps shut: blinks are faster than any filter should allow
      for (const eye of ['eyeLOpen', 'eyeROpen']) if (target[eye] <= 0.02) this.params[eye] = 0;
    } else {
      const k = 1 - Math.exp(-Math.max(0, dt) / (back * 0.175 / 0.6));
      this.params = Object.fromEntries(Object.entries(faceNeutral).map(([key, value]) => {
        const current = this.params[key] ?? value;
        return [key, hold && /^(angle|bodyAngle|position)/.test(key) ? current : current + (value - current) * k];
      }));
      for (const filter of Object.values(this.filters)) filter.reset();
    }
    this.weight = tracking || hold ? 1 : this.weight * Math.exp(-dt / (back / 3));
    if (this.weight < 0.005) this.weight = 0;
    // seconds since the face was last seen (Infinity before it ever was)
    const lostFor = tracking ? 0 : Math.max(0, (now - this.seen) / 1000);
    return { tracking, hold, lostFor, params: { ...this.params }, weight: this.weight };
  }
}
export function rmsLevel(samples: Float32Array, gain: number): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return clamp((Math.sqrt(sum / samples.length) - 0.008) * clamp(gain, 0, 10) * 5);
}
export const parameterRanges = new Map(PARAMS.map(param => [param.id, [param.min, param.max] as const]));
parameterRanges.set('eyeSmileL', [0, 1]);
