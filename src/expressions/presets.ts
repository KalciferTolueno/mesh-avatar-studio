// Fork addition (see FORK.md): expressions toggled with keys on the Live page, like VTube
// Studio's expression hotkeys. Each one overrides a few parameters on top of face tracking and
// fades in and out; several can be on at once.
import { PARAMS } from '../engine/rig.js';

type Mode = 'set' | 'scale' | 'add' | 'max';
export interface Expression { id: string; key: string; params: Record<string, [Mode, number]> }

export const EXPRESSIONS: Expression[] = [
  { id: 'happy', key: '1', params: { eyeSmile: ['set', 0.7], eyeSmileL: ['set', 0.7], blush: ['max', 0.6], mouthForm: ['set', -0.6], browY: ['set', 0.3] } },
  { id: 'blush', key: '2', params: { blush: ['set', 1] } },
  { id: 'angry', key: '3', params: { browAngle: ['set', 0.9], browY: ['set', -0.6], eyeLOpen: ['scale', 0.7], eyeROpen: ['scale', 0.7], mouthForm: ['set', 0.2] } },
  { id: 'sad', key: '4', params: { browAngle: ['set', -0.8], browY: ['set', -0.3], eyeLOpen: ['scale', 0.8], eyeROpen: ['scale', 0.8], angleY: ['add', -5] } },
  { id: 'surprised', key: '5', params: { eyeWide: ['set', 1], browY: ['set', 1], mouthOpen: ['max', 0.35], mouthForm: ['set', 0.6] } },
  { id: 'sleepy', key: '6', params: { eyeLOpen: ['scale', 0.35], eyeROpen: ['scale', 0.35], browY: ['set', -0.2], angleY: ['add', -6], angleZ: ['add', 4] } },
];

const DEFAULTS: Record<string, number> = { ...Object.fromEntries(PARAMS.map(p => [p.id, p.def])), eyeSmileL: 0 };
const RANGES = new Map<string, [number, number]>([...PARAMS.map(p => [p.id, [p.min, p.max]] as [string, [number, number]]), ['eyeSmileL', [0, 1]]]);

export class ExpressionMixer {
  readonly active = new Set<string>();
  private mix: Record<string, number> = Object.fromEntries(EXPRESSIONS.map(e => [e.id, 0]));
  toggle(id: string) { if (!this.active.delete(id)) this.active.add(id); }
  clear() { this.active.clear(); }
  /** Fade each expression towards on / off over about a quarter of a second. */
  step(dt: number) {
    const k = 1 - Math.exp(-Math.max(0, dt) / 0.08);
    for (const e of EXPRESSIONS) this.mix[e.id] += ((this.active.has(e.id) ? 1 : 0) - this.mix[e.id]) * k;
  }
  any() { return EXPRESSIONS.some(e => this.mix[e.id] > 0.002); }
  /** The parameters with every visible expression applied on top. */
  apply(base: Record<string, number>): Record<string, number> {
    const out = { ...base };
    for (const e of EXPRESSIONS) {
      const m = this.mix[e.id];
      if (m <= 0.002) continue;
      for (const [key, [mode, value]] of Object.entries(e.params)) {
        const b = out[key] ?? DEFAULTS[key] ?? 0;
        const next = mode === 'set' ? value : mode === 'scale' ? b * value : mode === 'add' ? b + value : Math.max(b, value);
        const range = RANGES.get(key);
        const v = b + (next - b) * m;
        out[key] = range ? Math.max(range[0], Math.min(range[1], v)) : v;
      }
    }
    return out;
  }
  /** Only the parameters the visible expressions touch, applied to the neutral pose. */
  applyAlone(): Record<string, number> {
    const touched = new Set(EXPRESSIONS.filter(e => this.mix[e.id] > 0.002).flatMap(e => Object.keys(e.params)));
    const all = this.apply({});
    return Object.fromEntries([...touched].map(key => [key, all[key]]));
  }
}

// key bindings are a per-browser convenience
const BINDINGS_KEY = 'mesh-avatar-expression-keys';
export function loadBindings(): Record<string, string> {
  const defaults = Object.fromEntries(EXPRESSIONS.map(e => [e.id, e.key]));
  try {
    const saved = JSON.parse(localStorage.getItem(BINDINGS_KEY) ?? '{}');
    return Object.fromEntries(EXPRESSIONS.map(e => [e.id, typeof saved[e.id] === 'string' ? saved[e.id] : defaults[e.id]]));
  } catch { return defaults; }
}
export function saveBindings(bindings: Record<string, string>) {
  try { localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings)); } catch { /* storage is optional */ }
}
