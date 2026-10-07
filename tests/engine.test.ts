import { expect, test } from 'vitest';
import fixture from '../samples/miko-qipao/rig.json';
import { parseRig } from '../src/rig/validate';
import { createRig, PARAMS } from '../src/engine/rig.js';
import { createPhysics } from '../src/engine/physics.js';

test('rig instances have isolated coordinates and physics state', () => {
  const a = parseRig(fixture);
  const b = parseRig(fixture);
  b.head.shiftX += 100;
  const first = createRig(a);
  const second = createRig(b);
  const P = Object.fromEntries(PARAMS.map(p => [p.id, p.def]));
  P.angleX = 30;
  const x = [600, 400];
  const y = [...x];
  first.applyHead(x, 1, P);
  second.applyHead(y, 1, P);
  expect(x).not.toEqual(y);
  const { Physics } = createPhysics(first, a);
  expect(new Physics()).not.toBe(new Physics());
});

test('missing optional parts and variable strand lengths stay finite', () => {
  const rig = parseRig(fixture);
  delete rig.hand;
  delete rig.buns;
  rig.accessories = [];
  rig.strands = [rig.strands![0]];
  rig.strands[0].nodes.splice(1, 1);
  const engine = createRig(rig);
  const { Physics } = createPhysics(engine, rig);
  const physics = new Physics();
  const P = Object.fromEntries(PARAMS.map(p => [p.id, p.def]));
  const phys = physics.step(P, 1 / 60);
  const out = engine.deformBase(500, 300, engine.baseWeights(500, 300), P, phys, [0, 0]);
  expect(out.every(Number.isFinite)).toBe(true);
  expect(physics.chains).toHaveLength(0);
});
test('head depth turns the face as a dome: nose leads, ears trail and the whole head travels', () => {
  const at = (depth: Record<string, number> | undefined, x: number, y: number, angleX: number) => {
    const rig = parseRig(fixture);
    if (depth) rig.head.depth = depth;
    const engine = createRig(rig);
    const physics = new (createPhysics(engine, rig).Physics)();
    const P = { ...Object.fromEntries(PARAMS.map(p => [p.id, p.def])), angleX };
    return engine.deformBase(x, y, engine.baseWeights(x, y), P, physics.step(P, 1 / 60), [0, 0])[0] - x;
  };
  const depth = { round: 1, nose: 0.8, ears: -0.6 };
  const { nose, earR, eyeA } = fixture.face;
  const shift = (x: number, y: number) => at(depth, x, y, 30) - at(depth, x, y, 0);
  expect(shift(nose.cx, nose.cy)).toBeGreaterThan(shift(eyeA.cx, eyeA.cy));
  expect(shift(earR.cx, earR.cy)).toBeLessThan(shift(eyeA.cx, eyeA.cy));
  // the whole head travels: its crown moves with the face, but only rigidly fixed outlines stay put
  const { head } = fixture;
  const crown = (rigid: number) => at({ ...depth, rigid }, head.cx, head.cy - head.ry * 0.98, 30) - at({ ...depth, rigid }, head.cx, head.cy - head.ry * 0.98, 0);
  expect(crown(0.6)).toBeGreaterThan(head.shiftX * 0.5);
  expect(Math.abs(crown(0))).toBeLessThan(2);
});
test('a relief map makes nearer pixels travel further and is ignored without head.depth.map', () => {
  const travel = (map: number | undefined, near: boolean) => {
    const rig = parseRig(fixture);
    rig.head.depth = map === undefined ? { round: 1 } : { round: 1, map };
    const { nose } = fixture.face;
    const engine = createRig(rig, { depthAt: (x: number) => (near && x === nose.cx ? 1 : 0) });
    const physics = new (createPhysics(engine, rig).Physics)();
    const P = { ...Object.fromEntries(PARAMS.map(p => [p.id, p.def])), angleX: 30 };
    return engine.deformBase(nose.cx, nose.cy, engine.baseWeights(nose.cx, nose.cy), P, physics.step(P, 1 / 60), [0, 0])[0];
  };
  expect(travel(1, true)).toBeGreaterThan(travel(1, false) + 5);
  expect(travel(undefined, true)).toBe(travel(undefined, false));
});
