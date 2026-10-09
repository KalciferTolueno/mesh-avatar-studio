// Fork addition (see FORK.md 33): asks the desktop app's server to resize the OBS browser source
// showing this project's stream view to the box chosen on the Live page (src-tauri/src/obs.rs).
// Under `npm run dev` there is no such server and the result says so.

export type ObsLink =
  | { state: 'idle' | 'working' | 'desktop-only' }
  | { state: 'done'; sources: number; width: number; height: number }
  | { state: 'unavailable'; reason: string };

export async function applyObsSize(project: string, width: number, height: number): Promise<ObsLink> {
  try {
    const response = await fetch(`/__obs/${encodeURIComponent(project)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ width, height }) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return { state: 'desktop-only' };
    const body = await response.json();
    return body.available ? { state: 'done', sources: Number(body.sources) || 0, width, height } : { state: 'unavailable', reason: String(body.reason ?? '') };
  } catch { return { state: 'desktop-only' }; }
}
