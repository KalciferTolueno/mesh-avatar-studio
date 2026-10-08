// Fork addition (see FORK.md): forwards validated physics adjustments from the Live page to the
// stream views, at most 60 per second per client, like the lighting relay in live-relay.ts.
import type { Plugin, WebSocketClient } from 'vite';
import { PHYSICS_EVENT, physicsMessage } from '../physics/settings';

export function physicsRelay(): Plugin {
  return {
    name: 'local-physics-relay',
    configureServer(server) {
      const last = new WeakMap<WebSocketClient['socket'], number>();
      server.ws.on(PHYSICS_EVENT, (data, client) => {
        const message = physicsMessage(data), now = performance.now();
        if (!message || now - (last.get(client.socket) ?? -Infinity) < 1000 / 60) return;
        last.set(client.socket, now);
        server.ws.send(PHYSICS_EVENT, message);
      });
    },
  };
}
