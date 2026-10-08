import { lightingFromQuery, writeLightingQuery, type LightingSettings } from '../lighting/settings';
import { physicsFromQuery, writePhysicsQuery, type PhysicsTuning } from '../physics/settings';
export const SAMPLE_PROJECT = 'sample-miko-qipao';
export interface ViewSettings {
  project: string;
  background: string;
  fit: 'contain' | 'cover';
  idle: boolean;
  lighting?: LightingSettings;
  physics?: PhysicsTuning;
}
export function backgroundColor(value: string | null): string {
  if (value === 'green') return '#00ff00';
  if (value === 'blue') return '#0000ff';
  if (value && /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return `#${value.replace('#', '')}`;
  return 'transparent';
}
export function viewSettings(search: string): ViewSettings {
  const query = new URLSearchParams(search), project = query.get('project');
  return { project: project && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(project) ? project : SAMPLE_PROJECT,
    background: backgroundColor(query.get('bg')), fit: query.get('fit') === 'cover' ? 'cover' : 'contain', idle: query.get('idle') !== '0', ...(query.has('light') ? { lighting: lightingFromQuery(query) } : {}),
    // fork: physics adjustments (src/physics)
    ...(physicsFromQuery(query) ? { physics: physicsFromQuery(query)! } : {}) };
}
export function streamUrl(settings: ViewSettings, origin: string): string {
  const url = new URL('/stream.html', origin);
  url.search = new URLSearchParams({ project: settings.project, bg: settings.background, fit: settings.fit, idle: settings.idle ? '1' : '0' }).toString();
  if (settings.lighting) writeLightingQuery(url.searchParams, settings.lighting);
  if (settings.physics) writePhysicsQuery(url.searchParams, settings.physics);
  return url.href;
}
