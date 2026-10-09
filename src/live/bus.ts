// Fork addition (see FORK.md): the message channel between the Live page and the stream views.
// Under `npm run dev` it is Vite's own WebSocket (import.meta.hot), as in the original; in the
// desktop app (src-tauri) and other built copies it is the app server's WebSocket at /__bus,
// which forwards { event, data } to every other open page. Receivers validate every message.

type Handler = (data: unknown) => void;
const handlers = new Map<string, Set<Handler>>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;

function connect() {
  if (socket || typeof WebSocket === 'undefined') return;
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/__bus`);
  socket = ws;
  ws.onmessage = event => {
    let message: unknown;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (!message || typeof message !== 'object') return;
    const { event: name, data } = message as { event?: unknown; data?: unknown };
    if (typeof name === 'string') for (const handler of handlers.get(name) ?? []) handler(data);
  };
  ws.onclose = () => {
    socket = null;
    // reconnect while anything still listens or sends (e.g. the app server restarted)
    clearTimeout(retry); retry = setTimeout(connect, 1000);
  };
}

export function busSend(event: string, data: unknown) {
  if (import.meta.hot) { import.meta.hot.send(event, data); return; }
  connect();
  // live values are sent many times a second: one lost while connecting does not matter
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, data }));
}

export function busOn(event: string, handler: Handler): () => void {
  if (import.meta.hot) {
    const hot = import.meta.hot;
    hot.on(event, handler);
    return () => hot.off(event, handler);
  }
  connect();
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(handler);
  return () => { handlers.get(event)?.delete(handler); };
}

/** True where messages can travel: the dev server or a built app server. */
export const busAvailable = () => Boolean(import.meta.hot) || typeof WebSocket !== 'undefined';
