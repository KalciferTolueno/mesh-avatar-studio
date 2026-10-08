// Fork addition (see FORK.md): Live2D-style physics groups.
import { expect, test } from 'vitest';
import fixture from '../samples/miko-qipao/rig.json';
import { parseRig, validateRig } from '../src/rig/validate';
import { createGroupPhysics, groupWeights } from '../src/engine/groups.js';
import { PARAMS } from '../src/engine/rig.js';

const rest = Object.fromEntries(PARAMS.map(p => [p.id, p.def]));
const group = { name: 'ear', pivot: [500, 300] as [number, number], tip: [500, 100] as [number, number], part: 'ear_l', inputs: { angleX: 1 }, wind: 0 };

test('a quick head turn makes the group lag, swing back and settle', () => {
  const rig = parseRig(fixture);
  rig.physics = [group];
  expect(validateRig(rig)).toEqual([]);
  const sim = createGroupPhysics(rig);
  for (let i = 0; i < 30; i++) sim.step(rest, 1 / 60);
  expect(sim.step(rest, 1 / 60)[0]).toBeCloseTo(0, 5);
  const angles: number[] = [];
  for (let i = 1; i <= 12; i++) angles.push(sim.step({ ...rest, angleX: 30 * i / 12 }, 1 / 60)[0]);
  for (let i = 0; i < 240; i++) angles.push(sim.step({ ...rest, angleX: 30 }, 1 / 60)[0]);
  const peak = Math.max(...angles.map(Math.abs));
  expect(peak).toBeGreaterThan(0.02);
  expect(peak).toBeLessThanOrEqual(10 * Math.PI / 180);
  expect(Math.sign(Math.min(...angles))).not.toBe(Math.sign(Math.max(...angles)));
  expect(Math.abs(angles.at(-1)!)).toBeLessThan(0.002);
});

test('weights follow the named part from the pivot towards the tip, or a band without a part', () => {
  const [g] = createGroupPhysics({ ...parseRig(fixture), physics: [group] }).groups;
  expect(groupWeights([g], 500, 120, 'ear_l')[0][1]).toBeCloseTo(1);
  expect(groupWeights([g], 500, 120, 'head')).toEqual([]);
  expect(groupWeights([g], 500, 320, 'ear_l')).toEqual([]);
  const band = { ...g, part: undefined, width: 20 };
  expect(groupWeights([band], 510, 120)[0][1]).toBeCloseTo(1);
  expect(groupWeights([band], 600, 120)).toEqual([]);
});

test('a rig without physics groups returns no angles and validates bad groups', () => {
  expect(createGroupPhysics(parseRig(fixture)).step(rest, 1 / 60)).toEqual([]);
  const rig = parseRig(fixture);
  rig.physics = [{ ...group, damping: 2, attach: 'arm' as 'head' }];
  expect(validateRig(rig)).toEqual(expect.arrayContaining(['rig.physics[0].damping: must be between 0 and 1', 'rig.physics[0].attach: expected head or body']));
});
