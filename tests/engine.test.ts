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
test('separated parts: the body ignores head turns while head pieces follow them fully', () => {
  const rig = parseRig(fixture);
  const engine = createRig(rig);
  const physics = new (createPhysics(engine, rig).Physics)();
  const move = (x: number, y: number, role: string) => {
    const at = (angleX: number) => {
      const P = { ...Object.fromEntries(PARAMS.map(p => [p.id, p.def])), angleX };
      return engine.deformBase(x, y, engine.baseWeights(x, y, 0, role), P, physics.step(P, 1 / 60), [0, 0])[0];
    };
    return at(30) - at(0);
  };
  const { head } = fixture;
  // a point beside the jaw, inside the turn band, where the single base image is dragged along
  const x = head.cx, y = head.weightBand[0] - 5;
  expect(Math.abs(move(x, y, 'all'))).toBeGreaterThan(1);
  expect(move(x, y, 'body')).toBe(0);
  expect(move(x, y, 'head')).toBeGreaterThanOrEqual(move(x, y, 'all'));
});
test('leaning forward lowers and widens the upper body, the bottom edge stays put', () => {
  const rig = parseRig(fixture), engine = createRig(rig);
  const physics = new (createPhysics(engine, rig).Physics)();
  const move = (x: number, y: number, lean: number) => {
    const P = { ...Object.fromEntries(PARAMS.map(p => [p.id, p.def])), bodyAngleY: lean };
    return engine.deformBase(x, y, engine.baseWeights(x, y, 0, 'body'), P, physics.step(P, 1 / 60), [0, 0]);
  };
  const { chest } = fixture.body;
  const shoulder = [chest.cx + chest.rx, chest.cy - chest.ry * 0.5];
  const forward = move(shoulder[0], shoulder[1], -10), back = move(shoulder[0], shoulder[1], 10);
  expect(forward[1]).toBeGreaterThan(shoulder[1]); expect(back[1]).toBeLessThan(shoulder[1]);
  expect(forward[0]).toBeGreaterThan(shoulder[0]); expect(back[0]).toBeLessThan(shoulder[0]);
  const bottom = move(chest.cx + 100, fixture.image.height, -10);
  expect(bottom[1]).toBeCloseTo(fixture.image.height); expect(bottom[0]).toBeCloseTo(chest.cx + 100);
});
test('wide eyes enlarge the eye area around its centre and leave it alone by default', () => {
  const rig = parseRig(fixture), engine = createRig(rig);
  const physics = new (createPhysics(engine, rig).Physics)();
  const at = (x: number, y: number, eyeWide: number) => {
    const P = { ...Object.fromEntries(PARAMS.map(p => [p.id, p.def])), eyeWide };
    return engine.deformBase(x, y, engine.baseWeights(x, y), P, physics.step(P, 1 / 60), [0, 0]);
  };
  const { eyeA } = fixture.face;
  expect(at(eyeA.cx, eyeA.cy - 20, 1)[1]).toBeLessThan(at(eyeA.cx, eyeA.cy - 20, 0)[1] - 3);
  expect(at(eyeA.cx, eyeA.cy + 20, 1)[1]).toBeGreaterThan(at(eyeA.cx, eyeA.cy + 20, 0)[1] + 3);
});
