// Fork addition (see FORK.md): a picture, animated GIF or looping video behind the avatar, like
// VTube Studio's backgrounds. Files live in projects/<name>/backgrounds/ (see
// src/server/project-items.ts); the choice goes in the OBS URL and is relayed live.
import { busOn, busSend } from './bus';

export type BackgroundFit = 'cover' | 'contain' | 'stretch';
export interface BackgroundImage { file: string | null; fit: BackgroundFit }
export const BACKGROUND_FILE = /^[a-z0-9-]{1,60}\.(png|jpg|webp|gif|mp4|webm)$/;
export const BACKGROUND_FITS: BackgroundFit[] = ['cover', 'contain', 'stretch'];
export const NO_BACKGROUND: BackgroundImage = { file: null, fit: 'cover' };
export const isVideo = (file: string) => /\.(mp4|webm)$/.test(file);
export const backgroundUrl = (project: string, file: string) => `/__items/${encodeURIComponent(project)}/background/${encodeURIComponent(file)}`;

export function parseBackground(input: unknown): BackgroundImage | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => key !== 'file' && key !== 'fit')) return null;
  if (data.file !== null && (typeof data.file !== 'string' || !BACKGROUND_FILE.test(data.file))) return null;
  if (!BACKGROUND_FITS.includes(data.fit as BackgroundFit)) return null;
  return { file: data.file as string | null, fit: data.fit as BackgroundFit };
}
// OBS URL: bgimg=<file>&bgfit=cover|contain|stretch
export function backgroundFromQuery(query: URLSearchParams): BackgroundImage | null {
  const file = query.get('bgimg');
  if (!file) return null;
  return parseBackground({ file, fit: query.get('bgfit') ?? 'cover' });
}
export function writeBackgroundQuery(query: URLSearchParams, value: BackgroundImage) {
  if (!value.file) return;
  query.set('bgimg', value.file); query.set('bgfit', value.fit);
}
const storageKey = (project: string) => `mesh-avatar:background:${project}`;
export function loadBackground(project: string): BackgroundImage {
  try { return parseBackground(JSON.parse(localStorage.getItem(storageKey(project)) ?? 'null')) ?? { ...NO_BACKGROUND }; } catch { return { ...NO_BACKGROUND }; }
}
export function saveBackground(project: string, value: BackgroundImage) {
  try { localStorage.setItem(storageKey(project), JSON.stringify(value)); } catch { /* Storage is optional. */ }
}

export async function listBackgrounds(project: string): Promise<string[]> {
  try {
    const response = await fetch(`/__items/${encodeURIComponent(project)}/backgrounds`);
    const list = response.ok ? await response.json() : [];
    return Array.isArray(list) ? list.filter((file): file is string => typeof file === 'string' && BACKGROUND_FILE.test(file)) : [];
  } catch { return []; }
}
/** Stores a picture or video in the project and returns its file name. */
export async function uploadBackground(project: string, file: File): Promise<string> {
  const response = await fetch(`/__items/${encodeURIComponent(project)}/upload-background`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.file !== 'string') throw new Error(body?.error ?? 'upload failed');
  return body.file;
}
export async function deleteBackground(project: string, file: string) {
  await fetch(backgroundUrl(project, file), { method: 'DELETE' }).catch(() => undefined);
}

/** Shows the background behind a canvas: a CSS background for pictures, a video element
 * placed exactly under the canvas for videos. Returns a function that removes it. */
export function showBackground(canvas: HTMLCanvasElement, project: string, value: BackgroundImage): () => void {
  const style = canvas.style;
  const clear = () => { style.backgroundImage = ''; style.backgroundSize = ''; style.backgroundPosition = ''; style.backgroundRepeat = ''; };
  clear();
  if (!value.file) return clear;
  const url = backgroundUrl(project, value.file);
  const size = value.fit === 'stretch' ? '100% 100%' : value.fit;
  if (!isVideo(value.file)) {
    style.backgroundImage = `url("${url}")`; style.backgroundSize = size; style.backgroundPosition = 'center'; style.backgroundRepeat = 'no-repeat';
    return clear;
  }
  const video = document.createElement('video');
  // muted before the source is set, so browsers (and OBS) allow it to start on its own
  video.muted = true; video.defaultMuted = true; video.setAttribute('muted', '');
  Object.assign(video, { autoplay: true, loop: true, playsInline: true });
  const start = () => { if (video.paused) void video.play().catch(() => undefined); };
  video.addEventListener('canplay', start);
  document.addEventListener('visibilitychange', start);
  video.src = url;
  video.setAttribute('aria-hidden', 'true');
  video.dataset.background = 'true';
  Object.assign(video.style, { position: 'absolute', pointerEvents: 'none', objectFit: value.fit === 'stretch' ? 'fill' : value.fit, zIndex: '0' });
  if (getComputedStyle(canvas).position === 'static') { canvas.style.position = 'relative'; }
  canvas.style.zIndex = '1';
  const place = () => Object.assign(video.style, { left: `${canvas.offsetLeft}px`, top: `${canvas.offsetTop}px`, width: `${canvas.clientWidth}px`, height: `${canvas.clientHeight}px` });
  canvas.before(video); place();
  const observer = new ResizeObserver(place); observer.observe(canvas);
  start();
  return () => { observer.disconnect(); document.removeEventListener('visibilitychange', start); video.removeAttribute('src'); video.load(); video.remove(); clear(); };
}

// Live relay: Live page -> dev server -> stream view (see src/server/project-items.ts)
export const BACKGROUND_EVENT = 'studio:background';
export interface BackgroundMessage { project: string; background: BackgroundImage }
export function backgroundMessage(input: unknown): BackgroundMessage | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || typeof data.project !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(data.project)) return null;
  const background = parseBackground(data.background);
  return background ? { project: data.project, background } : null;
}
export function sendBackground(project: string, background: BackgroundImage) {
  const message = backgroundMessage({ project, background });
  if (message) busSend(BACKGROUND_EVENT, message);
}
export function receiveBackground(project: string, callback: (value: BackgroundImage) => void) {
  const receive = (data: unknown) => { const message = backgroundMessage(data); if (message?.project === project) callback(message.background); };
  return busOn(BACKGROUND_EVENT, receive);
}
