// Fork addition (see FORK.md): forwards validated avatar framing from the Live page to the
// stream views, at most 60 per second per client, like the physics relay.
import type { Plugin, WebSocketClient } from 'vite';
import { FRAME_EVENT, frameMessage } from '../live/frame';

export function frameRelay(): Plugin {
  return {
    name: 'local-frame-relay',
    configureServer(server) {
      const last = new WeakMap<WebSocketClient['socket'], number>();
      server.ws.on(FRAME_EVENT, (data, client) => {
        const message = frameMessage(data), now = performance.now();
        if (!message || now - (last.get(client.socket) ?? -Infinity) < 1000 / 60) return;
        last.set(client.socket, now);
        server.ws.send(FRAME_EVENT, message);
      });
      // fork (FORK.md 29): stream views say hello so the Live status bar can count them
      server.ws.on('studio:stream-hello', data => {
        const { project, id } = (data ?? {}) as Record<string, unknown>;
        if (typeof project === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(project) && typeof id === 'string' && /^[a-z0-9]{6,32}$/.test(id)) server.ws.send('studio:stream-hello', { project, id });
      });
    },
  };
}
