// Fork addition (see FORK.md): accessories (glasses, hats, …) placed on the avatar in the Live
// page, like VTube Studio's items. The pictures and this list live in the project folder
// (projects/<name>/items/), so the OBS stream view shows them too; changes are relayed live.
import { busOn, busSend } from './bus';
import type { AvatarItemLayer } from '../engine';

export interface AvatarItem {
  id: string; file: string; name: string;
  /** Centre in source-image px, size as a share of the picture's own size, degrees. */
  x: number; y: number; scale: number; rotation: number; flip: boolean;
  attach: 'head' | 'body' | 'none'; layer: 'front' | 'behind'; visible: boolean;
}
export const MAX_ITEMS = 16;
export const ITEM_FILE = /^[a-z0-9-]{1,60}\.(png|webp|jpg)$/;
export const ITEM_ID = /^[a-z0-9]{4,24}$/;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clampTo = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function parseItem(input: unknown): AvatarItem | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const d = input as Record<string, unknown>;
  if (typeof d.id !== 'string' || !ITEM_ID.test(d.id) || typeof d.file !== 'string' || !ITEM_FILE.test(d.file)) return null;
  if (typeof d.name !== 'string' || !finite(d.x) || !finite(d.y) || !finite(d.scale) || !finite(d.rotation)) return null;
  if (!['head', 'body', 'none'].includes(d.attach as string) || !['front', 'behind'].includes(d.layer as string)) return null;
  return { id: d.id, file: d.file, name: d.name.slice(0, 40), x: clampTo(d.x, -5000, 10000), y: clampTo(d.y, -5000, 10000),
    scale: clampTo(d.scale, 0.02, 8), rotation: clampTo(d.rotation, -180, 180), flip: d.flip === true,
    attach: d.attach as AvatarItem['attach'], layer: d.layer as AvatarItem['layer'], visible: d.visible !== false };
}
export function parseItems(input: unknown): AvatarItem[] | null {
  if (!Array.isArray(input) || input.length > MAX_ITEMS) return null;
  const items = input.map(parseItem);
  if (items.some(item => !item) || new Set(items.map(item => item!.id)).size !== items.length) return null;
  return items as AvatarItem[];
}
export const itemUrl = (project: string, file: string) => `/__items/${encodeURIComponent(project)}/file/${encodeURIComponent(file)}`;
export const itemLayers = (project: string, items: AvatarItem[]): AvatarItemLayer[] =>
  items.map(({ id, file, x, y, scale, rotation, flip, attach, layer, visible }) => ({ id, src: itemUrl(project, file), x, y, scale, rotation, flip, attach, layer, visible }));

export async function loadItems(project: string): Promise<AvatarItem[]> {
  try {
    const response = await fetch(`/__items/${encodeURIComponent(project)}`);
    return response.ok ? parseItems(await response.json()) ?? [] : [];
  } catch { return []; }
}
export async function saveItems(project: string, items: AvatarItem[]) {
  const response = await fetch(`/__items/${encodeURIComponent(project)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'save failed');
}
/** Stores a picture in the project and returns its file name. */
export async function uploadItem(project: string, file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const response = await fetch(`/__items/${encodeURIComponent(project)}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data: btoa(binary) }) });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.file !== 'string') throw new Error(body?.error ?? 'upload failed');
  return body.file;
}

// Live relay: Live page -> dev server -> stream view (see src/server/project-items.ts)
export const ITEMS_EVENT = 'studio:items';
export interface ItemsMessage { project: string; items: AvatarItem[] }
export function itemsMessage(input: unknown): ItemsMessage | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || typeof data.project !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(data.project)) return null;
  const items = parseItems(data.items);
  return items ? { project: data.project, items } : null;
}
export function sendItems(project: string, items: AvatarItem[]) {
  const message = itemsMessage({ project, items });
  if (message) busSend(ITEMS_EVENT, message);
}
export function receiveItems(project: string, callback: (items: AvatarItem[]) => void) {
  const receive = (data: unknown) => { const message = itemsMessage(data); if (message?.project === project) callback(message.items); };
  return busOn(ITEMS_EVENT, receive);
}
