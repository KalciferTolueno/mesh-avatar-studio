import { busAvailable, busOn, busSend } from './bus';
import { LIGHTING_EVENT, lightingWire, lightingMessage, lightingValue } from '../lighting/protocol';
import type { LightingSettings } from '../lighting/settings';
import { LIVE_EVENT, liveMessage } from './protocol';

export function createLiveSender(project: string) {
  let sent = -Infinity;
  return (params: Record<string, number>, now: number) => {
    // fork: busSend works under Vite and in the desktop app (src/live/bus.ts)
    if (!busAvailable() || now - sent < 1000 / 60) return;
    const message = liveMessage({ project, params, t: now });
    if (message) { busSend(LIVE_EVENT, message); sent = now; }
  };
}
export function receiveLiveParameters(callback: (data: unknown) => void) {
  return busOn(LIVE_EVENT, callback);
}

export function sendLighting(project: string, value: LightingSettings) {
  const message = lightingMessage(lightingWire(project, value));
  if (message) busSend(LIGHTING_EVENT, message);
}
export function receiveLighting(project: string, callback: (value: LightingSettings) => void) {
  const receive = (data: unknown) => { const message = lightingMessage(data); if (message?.project === project) callback(lightingValue(message)); };
  return busOn(LIGHTING_EVENT, receive);
}
