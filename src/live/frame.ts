// Fork addition (see FORK.md): where the avatar sits in the frame and how big it is, like
// dragging and scrolling the model in VTube Studio. Shared by the Live page, the OBS URL and the
// stream view; built like src/physics/settings.ts (strict format, URL, browser storage, relay).
import { busOn, busSend } from './bus';

/** x / y: shift in shares of the canvas width / height; scale about the canvas centre. */
export interface AvatarFrame { x: number; y: number; scale: number }
/** The Live preview's shape, so it matches the OBS browser source ('custom': width x height). */
export type FrameAspect = '16:9' | '9:16' | '4:3' | '3:4' | '1:1' | 'custom' | 'free';
/** Fork (FORK.md 32): `auto` fits the avatar into the box with `safe` margins (share of the box). */
export interface FrameSettings { frame: AvatarFrame; aspect: FrameAspect; locked: boolean; custom: { w: number; h: number }; auto: boolean; safe: number }
export const DEFAULT_FRAME: Readonly<AvatarFrame> = Object.freeze({ x: 0, y: 0, scale: 1 });
export const FRAME_RANGES = { x: [-1, 1], y: [-1, 1], scale: [0.2, 4] } as const;
export const ASPECTS: FrameAspect[] = ['16:9', '9:16', '4:3', '3:4', '1:1', 'custom', 'free'];
/** OBS browser source size for each shape (1080 px on the short side). */
export const ASPECT_SIZE: Record<Exclude<FrameAspect, 'custom' | 'free'>, [number, number]> = {
  '16:9': [1920, 1080], '9:16': [1080, 1920], '4:3': [1440, 1080], '3:4': [1080, 1440], '1:1': [1080, 1080],
};
export const SAFE_RANGE = [0, 0.2] as const;
export const CUSTOM_RANGE = [200, 4096] as const;
const clampTo = (value: number, [min, max]: readonly [number, number]) => Math.max(min, Math.min(max, value));
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function parseFrame(input: unknown): AvatarFrame | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !(key in DEFAULT_FRAME))) return null;
  if (!finite(data.x) || !finite(data.y) || !finite(data.scale)) return null;
  return { x: clampTo(data.x, FRAME_RANGES.x), y: clampTo(data.y, FRAME_RANGES.y), scale: clampTo(data.scale, FRAME_RANGES.scale) };
}
export const isDefaultFrame = (frame: AvatarFrame) => frame.x === 0 && frame.y === 0 && frame.scale === 1;

/** Zoom by `factor` keeping the canvas point (cx, cy) — shares of width / height from the
 * centre, -0.5..0.5 — where it is, like zooming at the mouse pointer. */
export function zoomFrameAt(frame: AvatarFrame, factor: number, cx: number, cy: number): AvatarFrame {
  const scale = clampTo(frame.scale * factor, FRAME_RANGES.scale), k = scale / frame.scale;
  return parseFrame({ x: cx - (cx - frame.x) * k, y: cy - (cy - frame.y) * k, scale })!;
}

// OBS URL: frame=x,y,scale (only when the avatar was moved)
export function frameFromQuery(query: URLSearchParams): AvatarFrame | null {
  const value = query.get('frame')?.split(',').map(Number);
  return value?.length === 3 ? parseFrame({ x: value[0], y: value[1], scale: value[2] }) : null;
}
export function writeFrameQuery(query: URLSearchParams, frame: AvatarFrame) {
  if (isDefaultFrame(frame)) return;
  const round = (n: number) => String(Math.round(n * 1000) / 1000);
  query.set('frame', [frame.x, frame.y, frame.scale].map(round).join(','));
}

const storageKey = (project: string) => `mesh-avatar:frame:${project}`;
export function loadFrameSettings(project: string): FrameSettings {
  const fallback: FrameSettings = { frame: { ...DEFAULT_FRAME }, aspect: '16:9', locked: false, custom: { w: 1080, h: 1080 }, auto: true, safe: 0.05 };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(project)) ?? 'null');
    if (!stored || typeof stored !== 'object') return fallback;
    const frame = parseFrame(stored.frame) ?? fallback.frame;
    const size = (value: unknown) => finite(value) ? Math.round(clampTo(value, CUSTOM_RANGE)) : null;
    const custom = stored.custom && typeof stored.custom === 'object' ? { w: size(stored.custom.w) ?? 1080, h: size(stored.custom.h) ?? 1080 } : fallback.custom;
    return { frame, aspect: ASPECTS.includes(stored.aspect) ? stored.aspect : fallback.aspect, locked: stored.locked === true, custom,
      // saved before automatic framing existed: automatic only if the avatar was never moved
      auto: typeof stored.auto === 'boolean' ? stored.auto : isDefaultFrame(frame),
      safe: finite(stored.safe) ? clampTo(stored.safe, SAFE_RANGE) : fallback.safe };
  } catch { return fallback; }
}
export function saveFrameSettings(project: string, value: FrameSettings) {
  try { localStorage.setItem(storageKey(project), JSON.stringify(value)); } catch { /* Storage is optional. */ }
}

// Live relay: Live page -> dev server -> stream view (see src/server/frame-relay.ts)
export const FRAME_EVENT = 'studio:frame';
/** `at`: when the sending Live page last changed it (Date.now()); a stream view follows the most
 * recent change, so a second Live page left open cannot pull the avatar back every second. */
export interface FrameMessage { project: string; frame: AvatarFrame; at?: number }
export function frameMessage(input: unknown): FrameMessage | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const keys = Object.keys(data).length;
  if ((keys !== 2 && !(keys === 3 && 'at' in data)) || typeof data.project !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(data.project)) return null;
  if ('at' in data && !(typeof data.at === 'number' && Number.isFinite(data.at) && data.at >= 0)) return null;
  const frame = parseFrame(data.frame);
  return frame ? { project: data.project, frame, ...(typeof data.at === 'number' ? { at: data.at } : {}) } : null;
}
export function sendFrame(project: string, frame: AvatarFrame, at?: number) {
  const message = frameMessage({ project, frame, ...(at === undefined ? {} : { at }) });
  if (message) busSend(FRAME_EVENT, message);
}
export function receiveFrame(project: string, callback: (frame: AvatarFrame, at: number) => void) {
  const receive = (data: unknown) => { const message = frameMessage(data); if (message?.project === project) callback(message.frame, message.at ?? 0); };
  return busOn(FRAME_EVENT, receive);
}

/** When this browser last changed a relayed setting (`frame`, `background`) for a project. */
export function loadChangedAt(kind: string, project: string): number {
  try { const value = Number(localStorage.getItem(`mesh-avatar:changed:${kind}:${project}`)); return Number.isFinite(value) && value > 0 ? value : 0; } catch { return 0; }
}
export function saveChangedAt(kind: string, project: string, at: number) {
  try { localStorage.setItem(`mesh-avatar:changed:${kind}:${project}`, String(at)); } catch { /* optional */ }
}
