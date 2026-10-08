import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME, frameFromQuery, frameMessage, parseFrame, writeFrameQuery, zoomFrameAt } from '../src/live/frame';
import { streamUrl, viewSettings } from '../src/live/settings';

describe('avatar framing', () => {
  it('accepts only complete, finite frames and clamps them', () => {
    expect(parseFrame({ x: 0.2, y: -0.1, scale: 1.5 })).toEqual({ x: 0.2, y: -0.1, scale: 1.5 });
    expect(parseFrame({ x: 5, y: -5, scale: 99 })).toEqual({ x: 1, y: -1, scale: 4 });
    expect(parseFrame({ x: 0, y: 0 })).toBeNull();
    expect(parseFrame({ x: 0, y: 0, scale: Number.NaN })).toBeNull();
    expect(parseFrame({ x: 0, y: 0, scale: 1, extra: 1 })).toBeNull();
  });
  it('zooms about the pointer, keeping the point under it in place', () => {
    const start = { x: 0.1, y: 0.05, scale: 1 }, at = [0.3, -0.2] as const;
    const next = zoomFrameAt(start, 2, ...at);
    expect(next.scale).toBe(2);
    // a point of the avatar under the pointer: share = p * scale + shift, before and after
    const p = [(at[0] - start.x) / start.scale, (at[1] - start.y) / start.scale];
    expect(p[0] * next.scale + next.x).toBeCloseTo(at[0]);
    expect(p[1] * next.scale + next.y).toBeCloseTo(at[1]);
    expect(zoomFrameAt({ ...DEFAULT_FRAME }, 100, 0, 0).scale).toBe(4);
  });
  it('travels in the OBS URL only once moved, and back', () => {
    const query = new URLSearchParams();
    writeFrameQuery(query, { ...DEFAULT_FRAME });
    expect(query.has('frame')).toBe(false);
    writeFrameQuery(query, { x: -0.25, y: 0.125, scale: 1.75 });
    expect(frameFromQuery(query)).toEqual({ x: -0.25, y: 0.125, scale: 1.75 });
    const url = streamUrl({ ...viewSettings('?project=tigre'), frame: { x: 0.3, y: 0, scale: 0.8 } }, 'http://127.0.0.1:5173');
    expect(viewSettings(new URL(url).search).frame).toEqual({ x: 0.3, y: 0, scale: 0.8 });
    expect(viewSettings('?frame=1,2').frame).toBeUndefined();
  });
  it('relays only well-formed messages', () => {
    expect(frameMessage({ project: 'tigre', frame: { x: 0, y: 0, scale: 1 } })).toEqual({ project: 'tigre', frame: { x: 0, y: 0, scale: 1 } });
    expect(frameMessage({ project: '../x', frame: { x: 0, y: 0, scale: 1 } })).toBeNull();
    expect(frameMessage({ project: 'tigre', frame: { x: 0, y: 0, scale: 1 }, more: 1 })).toBeNull();
  });
});
