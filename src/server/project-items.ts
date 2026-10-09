// Fork addition (see FORK.md): stores the Live page's accessories in the project folder
// (projects/<name>/items/: the pictures and items.json) and relays live changes to the stream
// views. Same rules as the local projects API: local origin only, safe names, nothing outside
// the project folder, pictures checked by their bytes.
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, WebSocketClient } from 'vite';
import { ITEM_FILE, ITEMS_EVENT, itemsMessage, parseItems } from '../live/items';

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const inside = (base: string, path: string) => { const rel = relative(base, path); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };
const projectName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MIME: Record<string, string> = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg' };
const MAX_PICTURE = 10 * 1024 * 1024;

/** File extension from the picture's own bytes, or null. */
export function pictureType(bytes: Uint8Array): 'png' | 'webp' | 'jpg' | null {
  const at = (offset: number, text: string) => [...text].every((ch, i) => bytes[offset + i] === ch.charCodeAt(0));
  if (bytes.length > 8 && bytes[0] === 0x89 && at(1, 'PNG')) return 'png';
  if (bytes.length > 12 && at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

export function projectItemsMiddleware(root: string) {
  const base = resolve(root, 'projects');
  async function folder(name: string, create = false) {
    if (!projectName.test(name) || name === '.' || name === '..') throw new HttpError(400, 'Invalid project name.');
    const project = resolve(base, name);
    if (!inside(base, project) || await realpath(base) !== base) throw new HttpError(400, 'Project root cannot redirect elsewhere.');
    if (!(await stat(project)).isDirectory() || !inside(base, await realpath(project))) throw new HttpError(404, 'Project not found.');
    const items = resolve(project, 'items');
    if (create) await mkdir(items, { recursive: true });
    try { if (!inside(project, await realpath(items))) throw new HttpError(400, 'Items folder cannot redirect elsewhere.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return items;
  }
  async function readBody(req: IncomingMessage, limit: number) {
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(400, 'Send application/json.');
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw new HttpError(413, 'Request is too large.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON.'); }
  }
  async function atomicWrite(dir: string, file: string, data: string | Uint8Array) {
    const temporary = resolve(dir, `.${file}-${randomBytes(6).toString('hex')}.tmp`);
    try { await writeFile(temporary, data, { flag: 'wx' }); await rename(temporary, resolve(dir, file)); }
    finally { await unlink(temporary).catch(() => undefined); }
  }
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/__items/')) { next(); return; }
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new HttpError(403, 'Use the local studio origin.');
      const host = req.headers.host?.split(':')[0];
      if (host !== '127.0.0.1' && host !== 'localhost') throw new HttpError(403, 'Local requests only.');
      let parts: string[];
      try { parts = req.url.split('?')[0].slice('/__items/'.length).split('/').map(decodeURIComponent); } catch { throw new HttpError(400, 'Invalid path encoding.'); }
      const [name, action, file] = parts;
      if (parts.length === 1 && req.method === 'GET') {
        const items = await folder(name);
        try { json(200, parseItems(JSON.parse(await readFile(resolve(items, 'items.json'), 'utf8'))) ?? []); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) json(200, []); else throw error; }
        return;
      }
      if (parts.length === 1 && req.method === 'PUT') {
        const list = parseItems(await readBody(req, 256 * 1024));
        if (!list) throw new HttpError(400, 'Invalid items.');
        await atomicWrite(await folder(name, true), 'items.json', JSON.stringify(list, null, 2) + '\n');
        json(200, { saved: list.length }); return;
      }
      if (parts.length === 2 && action === 'upload' && req.method === 'POST') {
        const body = await readBody(req, Math.ceil(MAX_PICTURE * 4 / 3) + 4096);
        if (typeof body?.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw new HttpError(400, 'Send a PNG, WebP or JPEG picture.');
        const bytes = Buffer.from(body.data, 'base64'), type = pictureType(bytes);
        if (!type) throw new HttpError(400, 'Send a PNG, WebP or JPEG picture.');
        if (bytes.length > MAX_PICTURE) throw new HttpError(413, 'Picture is too large.');
        const slug = (typeof body.name === 'string' ? body.name : '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
        const stored = `${slug}-${randomBytes(4).toString('hex')}.${type}`;
        await atomicWrite(await folder(name, true), stored, bytes);
        json(200, { file: stored }); return;
      }
      if (parts.length === 3 && action === 'file' && ITEM_FILE.test(file) && (req.method === 'GET' || req.method === 'DELETE')) {
        const items = await folder(name), path = resolve(items, file);
        if (!inside(items, path)) throw new HttpError(400, 'Invalid file.');
        if (req.method === 'DELETE') { await unlink(path); json(200, { deleted: file }); return; }
        const bytes = await readFile(path);
        res.writeHead(200, { 'Content-Type': MIME[file.split('.').pop()!], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(bytes); return;
      }
      throw new HttpError(404, 'Not found.');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const status = error instanceof HttpError ? error.status : code === 'ENOENT' || code === 'ENOTDIR' ? 404 : 500;
      json(status, { error: error instanceof HttpError ? error.message : status === 404 ? 'Project or file not found.' : 'Items operation failed.' });
    }
  };
}

export function projectItems(root: string): Plugin {
  return {
    name: 'local-project-items',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(projectItemsMiddleware(root));
      const last = new WeakMap<WebSocketClient['socket'], number>();
      server.ws.on(ITEMS_EVENT, (data, client) => {
        const message = itemsMessage(data), now = performance.now();
        if (!message || now - (last.get(client.socket) ?? -Infinity) < 1000 / 30) return;
        last.set(client.socket, now);
        server.ws.send(ITEMS_EVENT, message);
      });
    },
  };
}
