import { LIGHTING_EVENT, lightingMessage } from '../lighting/protocol';
import type { Plugin, WebSocketClient } from 'vite';
import { LIVE_EVENT, liveMessage } from '../live/protocol';

export function liveRelay(): Plugin {
  return {
    name: 'local-live-relay',
    configureServer(server) {
      const lastLighting = new WeakMap<WebSocketClient['socket'], number>();
      server.ws.on(LIGHTING_EVENT, (data, client) => {
        const message = lightingMessage(data), now = performance.now();
        if (!message || now - (lastLighting.get(client.socket) ?? -Infinity) < 1000 / 60) return;
        lastLighting.set(client.socket, now);
        server.ws.send(LIGHTING_EVENT, message);
      });
      const lastSent = new WeakMap<WebSocketClient['socket'], number>();
      server.ws.on(LIVE_EVENT, (data, client) => {
        const now = performance.now();
        if (now - (lastSent.get(client.socket) ?? -Infinity) < 1000 / 60) return;
        const message = liveMessage(data);
        if (!message) return;
        lastSent.set(client.socket, now);
        server.ws.send(LIVE_EVENT, message);
      });
    },
  };
}
