// Fork addition (see FORK.md): one-shot animations on keys, like VTube Studio's
// TriggerAnimation hotkeys. They reuse the engine's keyframed motions (src/engine/motions.js)
// but play on top of face tracking: head and body tracks are added to the tracked pose, face
// tracks blend in and out over the tracked face.
import { ADDITIVE, MOTIONS, sampleTrack } from '../engine/motions.js';
import { PARAMS } from '../engine/rig.js';

export const ANIMATIONS = [
  { id: 'nod', key: 'q' }, { id: 'no', key: 'w' }, { id: 'greet', key: 'e' }, { id: 'giggle', key: 'r' },
  { id: 'surprise', key: 't' }, { id: 'tilt', key: 'y' }, { id: 'think', key: 'u' }, { id: 'shy', key: 'i' }, { id: 'wink', key: 'o' },
] as const;
export type AnimationId = typeof ANIMATIONS[number]['id'];

type Tracks = Record<string, [number, number][]>;
const motions = MOTIONS as unknown as Record<string, { dur: number; tracks: Tracks }>;
const DEFAULTS: Record<string, number> = { ...Object.fromEntries(PARAMS.map(p => [p.id, p.def])), eyeSmileL: 0 };
const RANGES = new Map<string, [number, number]>([...PARAMS.map(p => [p.id, [p.min, p.max]] as [string, [number, number]]), ['eyeSmileL', [0, 1]]]);
// motion track names -> avatar parameters; eye openness tracks are relative to open (1)
const TARGETS: Record<string, { keys: string[]; scale?: boolean }> = {
  eyeOpen: { keys: ['eyeLOpen', 'eyeROpen'], scale: true }, eyeOpenL: { keys: ['eyeLOpen'], scale: true },
  eyeSmile: { keys: ['eyeSmile', 'eyeSmileL'] },
};
const FADE = 0.18;

export class AnimationPlayer {
  private playing: { id: string; t: number } | null = null;
  /** Start an animation; pressing it again while it plays restarts it. */
  play(id: AnimationId) { if (motions[id]) this.playing = { id, t: 0 }; }
  stop() { this.playing = null; }
  current() { return this.playing?.id ?? null; }
  step(dt: number) {
    if (!this.playing) return;
    this.playing.t += Math.max(0, dt);
    if (this.playing.t >= motions[this.playing.id].dur) this.playing = null;
  }
  any() { return this.playing !== null; }
  /** Parameter names the playing animation drives. */
  touched(): string[] {
    if (!this.playing) return [];
    return Object.keys(motions[this.playing.id].tracks).flatMap(track => TARGETS[track]?.keys ?? [track]).filter(key => RANGES.has(key));
  }
  apply(base: Record<string, number>): Record<string, number> {
    if (!this.playing) return base;
    const { id, t } = this.playing, motion = motions[id], out = { ...base };
    const envelope = Math.min(1, t / FADE, (motion.dur - t) / FADE);
    for (const [track, keys] of Object.entries(motion.tracks)) {
      const value = sampleTrack(keys, t), target = TARGETS[track];
      for (const key of target?.keys ?? [track]) {
        const range = RANGES.get(key);
        if (!range) continue;
        const b = out[key] ?? DEFAULTS[key] ?? 0;
        // head, body and gaze tracks start and end at 0: added to the tracked pose as they are
        const next = ADDITIVE.has(track) ? b + value : target?.scale ? b + (b * value - b) * envelope : b + (value - b) * envelope;
        out[key] = Math.max(range[0], Math.min(range[1], next));
      }
    }
    return out;
  }
}
