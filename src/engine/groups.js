// Fork addition (see FORK.md): Live2D-style physics groups (rig.physics).
//
// Each group is a damped pendulum hanging from `pivot` towards `tip`. Like a Live2D physics
// setting, it is driven by a weighted mix of the pose (head angles, body angles, sideways
// position): when that mix accelerates, the pendulum lags behind and swings back; gravity keeps
// it hanging when the head or body rolls; a light wind keeps it alive at rest. The engine
// rotates the vertices of the group (one separated part, or a band along pivot -> tip) about
// the pivot by the simulated angle, before the head and body transforms.

const DEG = Math.PI / 180;
const INPUTS = {
  angleX: P => P.angleX / 30, angleY: P => P.angleY / 30, angleZ: P => P.angleZ / 30,
  bodyAngleX: P => P.bodyAngleX / 10, bodyAngleY: P => (P.bodyAngleY ?? 0) / 10, bodyAngleZ: P => P.bodyAngleZ / 10, positionX: P => P.positionX ?? 0,
};
export const PHYSICS_INPUTS = Object.keys(INPUTS);
export const GROUP_DEFAULTS = { freq: 1.2, damping: 0.22, max: 10, inertia: 1, hang: 0.8, wind: 0.25, attach: 'head' };

/** @param {import('../rig/types').Rig} rig */
export function createGroupPhysics(rig) {
  const groups = (rig.physics ?? []).map((g, i) => ({ ...GROUP_DEFAULTS, ...g, phase: i * 2.3 }));
  const state = groups.map(() => ({ a: 0, v: 0, drive: null, vel: 0, acc: 0 }));
  let time = 0;
  const out = groups.map(() => 0);
  // live adjustments (src/physics): overall strength, stiffness and wind, and per-group strength
  let tuning = { strength: 1, stiffness: 1, wind: 1, groups: [] };
  return {
    groups,
    setTuning(value) { tuning = { ...tuning, ...value }; },
    reset() { for (const s of state) { s.a = 0; s.v = 0; s.drive = null; s.vel = 0; s.acc = 0; } },
    /** Advance by dt seconds; returns each group's angle in radians. `dragAcc`: sideways
     * acceleration of the whole avatar on screen (fork, src/live/frame.ts), in positionX units. */
    step(P, dt, dragAcc = 0) {
      if (!groups.length) return out;
      const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = Math.min(dt, 0.05) / sub;
      groups.forEach((g, gi) => {
        const s = state[gi];
        let drive = 0;
        for (const [key, weight] of Object.entries(g.inputs ?? {})) if (INPUTS[key]) drive += INPUTS[key](P) * weight;
        if (s.drive === null) s.drive = drive;
        // smoothed velocity and acceleration of the drive: tracking noise must not kick it
        const vel = (drive - s.drive) / Math.max(dt, 1e-3);
        s.drive = drive;
        const kv = 1 - Math.exp(-dt / 0.04), ka = 1 - Math.exp(-dt / 0.06);
        const acc = (vel - s.vel) / Math.max(dt, 1e-3);
        s.vel += (vel - s.vel) * kv;
        s.acc += (acc - s.acc) * ka;
        const maxRad = Math.max(1e-4, g.max * DEG * tuning.strength * (tuning.groups[gi] ?? 1));
        const w = 2 * Math.PI * g.freq * tuning.stiffness;
        // gravity: hang straight while the head (if attached to it) and the body roll
        const roll = (g.attach === 'head' ? P.angleZ / 30 * rig.head.maxRoll : 0) + P.bodyAngleZ / 10 * rig.body.maxRoll;
        for (let i = 0; i < sub; i++) {
          const t = time + i * h;
          const wind = g.wind * tuning.wind * maxRad * 0.3 * (Math.sin(t * 1.3 + g.phase) + 0.5 * Math.sin(t * 2.9 + g.phase * 2));
          const rest = g.hang * roll + wind;
          let accel = -w * w * (s.a - rest) - 2 * g.damping * w * s.v - 4 * g.inertia * maxRad * s.acc;
          // dragged across the frame: the piece lags behind like it does when the body moves
          if (dragAcc) accel -= 4 * g.inertia * maxRad * dragAcc;
          s.v += accel * h;
          s.a += s.v * h;
        }
        // soft limit keeps a violent shake inside the drawing
        out[gi] = maxRad * Math.tanh(s.a / maxRad);
      });
      time += Math.min(dt, 0.05);
      return out;
    },
  };
}

/** Sparse [group index, weight] list for a vertex at rest position (x, y) of the named piece. */
export function groupWeights(groups, x, y, piece) {
  const hits = [];
  groups.forEach((g, i) => {
    if (g.part && g.part !== piece) return;
    const dx = g.tip[0] - g.pivot[0], dy = g.tip[1] - g.pivot[1], len2 = dx * dx + dy * dy;
    const t = ((x - g.pivot[0]) * dx + (y - g.pivot[1]) * dy) / len2;
    if (t <= 0) return;
    // stiff at the pivot, free towards the tip
    const along = Math.min(1, t / 0.6);
    let wt = along * along * (3 - 2 * along);
    if (!g.part) {
      // a band around the pivot -> tip line (e.g. a hanging cord on the body): everything within
      // `width` turns as one piece (a falloff across the cord would pinch it), then it fades out
      const len = Math.sqrt(len2), d = Math.abs((x - g.pivot[0]) * dy - (y - g.pivot[1]) * dx) / len;
      const width = g.width ?? 30, side = Math.min(1, Math.max(0, (d - width) / width));
      wt *= (1 - side * side * (3 - 2 * side)) * (t > 1.15 ? Math.max(0, 1 - (t - 1.15) / 0.2) : 1);
    }
    if (wt > 0.01) hits.push([i, wt]);
  });
  return hits;
}
