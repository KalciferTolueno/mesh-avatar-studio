// Fork addition (see FORK.md): accessories on the avatar (src/live/items.ts, src/server/project-items.ts).
import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { itemLayers, itemsMessage, parseItems, type AvatarItem } from '../src/live/items';
import { pictureType, projectItemsMiddleware } from '../src/server/project-items';

const glasses: AvatarItem = { id: 'abcd12', file: 'glasses-0a1b2c3d.png', name: 'Gafas', x: 1000, y: 480, scale: 0.8, rotation: -5, flip: false, attach: 'head', layer: 'front', visible: true };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test('items are validated strictly and clamped', () => {
  expect(parseItems([glasses])).toEqual([glasses]);
  expect(parseItems([{ ...glasses, scale: 99, rotation: 400 }])?.[0]).toMatchObject({ scale: 8, rotation: 180 });
  expect(parseItems([{ ...glasses, file: '../rig.json' }])).toBeNull();
  expect(parseItems([{ ...glasses, attach: 'tail' }])).toBeNull();
  expect(parseItems([glasses, glasses])).toBeNull();
  expect(parseItems(new Array(17).fill(0).map((_, i) => ({ ...glasses, id: `item${i}` })))).toBeNull();
  expect(itemLayers('tigre', [glasses])[0].src).toBe('/__items/tigre/file/glasses-0a1b2c3d.png');
  expect(itemsMessage({ project: 'tigre', items: [glasses] })).toEqual({ project: 'tigre', items: [glasses] });
  expect(itemsMessage({ project: '../x', items: [] })).toBeNull();
});

test('pictures are recognised by their bytes', () => {
  expect(pictureType(PNG)).toBe('png');
  expect(pictureType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
  expect(pictureType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
  expect(pictureType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
});

let root: string;
beforeEach(async () => {
  const scratch = resolve('projects'); await mkdir(scratch, { recursive: true });
  root = await mkdtemp(join(scratch, '.items-api-test-'));
  await mkdir(resolve(root, 'projects/nova'), { recursive: true });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function call(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as IncomingMessage;
  request.url = path; request.method = method;
  request.headers = { host: '127.0.0.1:5173', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers };
  let status = 0, payload: Buffer = Buffer.alloc(0), type = '';
  const response = { writeHead(code: number, head: Record<string, string>) { status = code; type = head['Content-Type']; return response; }, end(value: string | Buffer) { payload = Buffer.from(value); } } as unknown as ServerResponse;
  await projectItemsMiddleware(root)(request, response, () => { status = -1; });
  return { status, type, json: () => JSON.parse(payload.toString('utf8')), bytes: payload };
}

test('upload, list, read and delete stay inside the project items folder', async () => {
  expect((await call('/__items/nova')).json()).toEqual([]);
  const upload = await call('/__items/nova/upload', 'POST', { name: 'Mis Gafas!.png', data: PNG.toString('base64') });
  expect(upload.status).toBe(200);
  const file = upload.json().file as string;
  expect(file).toMatch(/^mis-gafas-[0-9a-f]{8}\.png$/);
  expect((await readFile(resolve(root, 'projects/nova/items', file))).equals(PNG)).toBe(true);
  const item = { ...glasses, file };
  expect((await call('/__items/nova', 'PUT', [item])).status).toBe(200);
  expect((await call('/__items/nova')).json()).toEqual([item]);
  const picture = await call(`/__items/nova/file/${file}`);
  expect(picture.type).toBe('image/png'); expect(picture.bytes.equals(PNG)).toBe(true);
  expect((await call(`/__items/nova/file/${file}`, 'DELETE')).status).toBe(200);
  expect((await call(`/__items/nova/file/${file}`)).status).toBe(404);
});

test('rejects foreign origins, other pictures, bad names and unknown projects', async () => {
  expect((await call('/__items/nova', 'GET', undefined, { origin: 'https://evil.example' })).status).toBe(403);
  expect((await call('/__items/nova', 'GET', undefined, { host: 'evil.example' })).status).toBe(403);
  expect((await call('/__items/nova/upload', 'POST', { name: 'x.svg', data: Buffer.from('<svg/>').toString('base64') })).status).toBe(400);
  expect((await call('/__items/nova', 'PUT', [{ ...glasses, file: '../../rig.json' }])).status).toBe(400);
  expect((await call('/__items/nova/file/..%2Frig.json')).status).toBe(404);
  expect((await call('/__items/..%2Fsamples')).status).toBe(400);
  expect((await call('/__items/missing')).status).toBe(404);
  expect((await call('/elsewhere')).status).toBe(-1);
});
