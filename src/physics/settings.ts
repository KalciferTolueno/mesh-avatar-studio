// Fork addition (see FORK.md): live physics adjustments, shared by the Live page, the OBS URL
// and the stream view. Built like src/lighting/settings.ts: a strict format, URL parameters and
// per-project browser storage.
import { busOn, busSend } from '../live/bus';

// drag: how much the pieces swing when the avatar is dragged across the frame (src/live/frame.ts)
export interface PhysicsTuning { strength: number; stiffness: number; wind: number; drag: number; groups: number[] }
export const DEFAULT_PHYSICS: Readonly<PhysicsTuning> = Object.freeze({ strength: 1, stiffness: 1, wind: 1, drag: 1, groups: [] });
export const PHYSICS_RANGES = { strength: [0, 2], stiffness: [0.5, 2], wind: [0, 2], drag: [0, 2], group: [0, 2] } as const;
const MAX_GROUPS = 32;
const clampTo = (value: number, [min, max]: readonly [number, number]) => Math.max(min, Math.min(max, value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function parsePhysics(input: unknown): PhysicsTuning | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !(key in DEFAULT_PHYSICS))) return null;
  if (!finite(data.strength) || !finite(data.stiffness) || !finite(data.wind) || (data.drag !== undefined && !finite(data.drag))) return null;
  if (!Array.isArray(data.groups) || data.groups.length > MAX_GROUPS || !data.groups.every(finite)) return null;
  return { strength: clampTo(data.strength, PHYSICS_RANGES.strength), stiffness: clampTo(data.stiffness, PHYSICS_RANGES.stiffness),
    wind: clampTo(data.wind, PHYSICS_RANGES.wind), drag: clampTo(finite(data.drag) ? data.drag : DEFAULT_PHYSICS.drag, PHYSICS_RANGES.drag), groups: (data.groups as number[]).map(v => clampTo(v, PHYSICS_RANGES.group)) };
}
// OBS URL: ph=strength,stiffness,wind[,drag] and phg=one strength per physics group, in rig order
export function physicsFromQuery(query: URLSearchParams): PhysicsTuning | null {
  const main = query.get('ph')?.split(',').map(Number);
  if (!main || (main.length !== 3 && main.length !== 4)) return null;
  const groups = query.get('phg')?.split(',').filter(Boolean).map(Number) ?? [];
  return parsePhysics({ strength: main[0], stiffness: main[1], wind: main[2], ...(main.length === 4 ? { drag: main[3] } : {}), groups });
}
export function writePhysicsQuery(query: URLSearchParams, value: PhysicsTuning) {
  const round = (n: number) => String(Math.round(n * 100) / 100);
  query.set('ph', [value.strength, value.stiffness, value.wind, value.drag].map(round).join(','));
  if (value.groups.length) query.set('phg', value.groups.map(round).join(','));
}
export function loadPhysics(project: string): PhysicsTuning {
  try {
    const stored = JSON.parse(localStorage.getItem(`mesh-avatar:physics:${project}`) ?? 'null');
    return (stored && parsePhysics({ ...DEFAULT_PHYSICS, ...stored })) ?? { ...DEFAULT_PHYSICS, groups: [] };
  } catch { return { ...DEFAULT_PHYSICS, groups: [] }; }
}
export function savePhysics(project: string, value: PhysicsTuning) {
  try { localStorage.setItem(`mesh-avatar:physics:${project}`, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}

// Live relay: Live page -> dev server -> stream view (see src/server/physics-relay.ts)
export const PHYSICS_EVENT = 'studio:physics';
export interface PhysicsMessage { project: string; physics: PhysicsTuning }
export function physicsMessage(input: unknown): PhysicsMessage | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || typeof data.project !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(data.project)) return null;
  const physics = parsePhysics(data.physics);
  return physics ? { project: data.project, physics } : null;
}
export function sendPhysics(project: string, value: PhysicsTuning) {
  const message = physicsMessage({ project, physics: value });
  if (message) busSend(PHYSICS_EVENT, message);
}
export function receivePhysics(project: string, callback: (value: PhysicsTuning) => void) {
  const receive = (data: unknown) => { const message = physicsMessage(data); if (message?.project === project) callback(message.physics); };
  return busOn(PHYSICS_EVENT, receive);
}
