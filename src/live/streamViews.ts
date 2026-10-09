// Fork addition (see FORK.md 29): how many OBS stream views are open. Each stream view says
// hello every two seconds over the message bus; the Live page counts the ones heard recently.
import { useEffect, useState } from 'react';
import { busOn, busSend } from './bus';

const HELLO_EVENT = 'studio:stream-hello';
const helloMessage = (input: unknown) => {
  if (!input || typeof input !== 'object') return null;
  const { project, id } = input as Record<string, unknown>;
  return typeof project === 'string' && typeof id === 'string' && /^[a-z0-9]{6,32}$/.test(id) ? { project, id } : null;
};
/** Called by the stream view (src/live/stream.ts). */
export function announceStreamView(project: string) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  const hello = () => busSend(HELLO_EVENT, { project, id });
  hello();
  const timer = setInterval(hello, 2000);
  return () => clearInterval(timer);
}
export function useStreamViews(project: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const seen = new Map<string, number>();
    const off = busOn(HELLO_EVENT, data => { const message = helloMessage(data); if (message?.project === project) seen.set(message.id, performance.now()); });
    const timer = setInterval(() => {
      const now = performance.now();
      for (const [id, at] of seen) if (now - at > 5000) seen.delete(id);
      setCount(seen.size);
    }, 1000);
    return () => { off(); clearInterval(timer); };
  }, [project]);
  return count;
}

