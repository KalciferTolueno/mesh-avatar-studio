// Fork addition (see FORK.md): live physics adjustments.
import { expect, test } from 'vitest';
import { DEFAULT_PHYSICS, parsePhysics, physicsFromQuery, physicsMessage, writePhysicsQuery } from '../src/physics/settings';
import { streamUrl, viewSettings } from '../src/live/settings';

test('physics adjustments round-trip through the OBS URL and clamp to their ranges', () => {
  const value = { strength: 1.4, stiffness: 0.8, wind: 0, groups: [1, 0.5, 2] };
  const query = new URLSearchParams(); writePhysicsQuery(query, value);
  expect(physicsFromQuery(query)).toEqual(value);
  const url = streamUrl({ ...viewSettings('?project=tigre'), physics: value }, 'http://127.0.0.1:5173');
  expect(viewSettings(new URL(url).search).physics).toEqual(value);
  expect(viewSettings('?project=tigre').physics).toBeUndefined();
  expect(parsePhysics({ strength: 9, stiffness: 0, wind: -1, groups: [5] })).toEqual({ strength: 2, stiffness: 0.5, wind: 0, groups: [2] });
});

test('malformed physics input and relay messages are rejected', () => {
  expect(parsePhysics({ ...DEFAULT_PHYSICS, extra: 1 })).toBeNull();
  expect(parsePhysics({ ...DEFAULT_PHYSICS, strength: Number.NaN })).toBeNull();
  expect(parsePhysics({ ...DEFAULT_PHYSICS, groups: new Array(40).fill(1) })).toBeNull();
  expect(physicsFromQuery(new URLSearchParams('ph=1,2'))).toBeNull();
  expect(physicsMessage({ project: 'tigre', physics: DEFAULT_PHYSICS })).toEqual({ project: 'tigre', physics: { ...DEFAULT_PHYSICS, groups: [] } });
  expect(physicsMessage({ project: '../x', physics: DEFAULT_PHYSICS })).toBeNull();
  expect(physicsMessage({ project: 'tigre', physics: DEFAULT_PHYSICS, extra: true })).toBeNull();
});
