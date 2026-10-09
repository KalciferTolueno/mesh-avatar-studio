// Fork addition (see FORK.md): accessories (glasses, hats, …) drawn on the avatar, like VTube
// Studio's items pinned to the model. Each item is a rigid picture placed in source-image px;
// it follows the head (turn with depth, nod, roll, body), the body, or stays put. To stay rigid
// it is not bent like the mesh: the anchor and two points next to it are deformed like the face
// there, and the item takes the resulting position, rotation, squash and shear.

const STEP = 40;            // px between the anchor and its two neighbours
const FACE_STILL = { eyeWide: 0, browY: 0, browAngle: 0, mouthOpen: 0 };

function quad(cells = 4) {
  const n = cells + 1, rest = new Float32Array(n * n * 2), uv = new Float32Array(n * n * 2), tris = [], lines = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    uv[k * 2] = i / cells; uv[k * 2 + 1] = j / cells;
  }
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    tris.push(a, b, c, b, d, c); lines.push(a, b, a, c, b, c);
  }
  return { rect: [0, 0, 1, 1], cols: cells, rows: cells, rest, uv, pos: new Float32Array(rest.length), tris: new Uint32Array(tris), lines: new Uint32Array(lines) };
}

/**
 * @param R       Renderer
 * @param engine  rig helpers (baseWeights, deformBase)
 * @param load    (src) => Promise<HTMLImageElement>
 */
export function createItems(R, engine, load) {
  const { baseWeights, deformBase } = engine;
  let items = [];            // { def, layer, mesh, w, img }
  let version = 0;
  const tmp = [0, 0], a = [0, 0], bx = [0, 0], by = [0, 0];

  function weights(def) {
    if (def.attach === 'none') return null;
    const w = baseWeights(def.x, def.y, 0, def.attach === 'body' ? 'body' : 'head');
    // rigid: only the head / body / turn / depth weights, none of the local face motions
    return { ...w, strands: [], groups: null, bunL: 0, bunR: 0, brow: 0, jaw: 0 };
  }

  return {
    /** Replace the items; images are loaded once per src. Resolves when they are shown. */
    async set(list) {
      const mine = ++version;
      const loaded = await Promise.all(list.map(def => load(def.src).catch(() => null)));
      if (mine !== version) return;
      const old = new Map(items.map(it => [it.def.id, it]));
      const next = [];
      list.forEach((def, i) => {
        const img = loaded[i];
        if (!img) return;
        const prev = old.get(def.id);
        if (prev && prev.img === img && prev.def.layer === def.layer) {
          old.delete(def.id);
          next.push({ ...prev, def, w: weights(def) });
          return;
        }
        const mesh = quad();
        const layer = R.addLayer(`item:${def.id}`, img, mesh, { item: true, first: def.layer === 'behind' });
        next.push({ def, img, mesh, layer, w: weights(def) });
      });
      for (const it of old.values()) R.removeLayer(it.layer);
      // keep the list order among items on the same side
      R.orderItems(next.filter(it => it.def.layer === 'behind').map(it => it.layer), next.filter(it => it.def.layer !== 'behind').map(it => it.layer));
      items = next;
    },
    update(P, phys) {
      const Q = { ...P, ...FACE_STILL };
      for (const it of items) {
        const { def, mesh, layer, w } = it;
        layer.visible = def.visible !== false;
        if (!layer.visible) continue;
        // where the anchor and its neighbours end up: an affine frame for the whole item
        let ox = def.x, oy = def.y, m00 = 1, m01 = 0, m10 = 0, m11 = 1;
        if (w) {
          deformBase(def.x, def.y, w, Q, phys, a); ox = a[0]; oy = a[1];
          deformBase(def.x + STEP, def.y, w, Q, phys, bx);
          deformBase(def.x, def.y + STEP, w, Q, phys, by);
          m00 = (bx[0] - a[0]) / STEP; m10 = (bx[1] - a[1]) / STEP;
          m01 = (by[0] - a[0]) / STEP; m11 = (by[1] - a[1]) / STEP;
        }
        const iw = it.img.width * def.scale, ih = it.img.height * def.scale;
        const r = (def.rotation ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), f = def.flip ? -1 : 1;
        for (let k = 0; k < mesh.uv.length / 2; k++) {
          // item px about its centre -> flipped, rotated, scaled -> image px about the anchor
          const lx = (mesh.uv[k * 2] - 0.5) * iw * f, ly = (mesh.uv[k * 2 + 1] - 0.5) * ih;
          const dx = lx * c - ly * s, dy = lx * s + ly * c;
          tmp[0] = ox + m00 * dx + m01 * dy; tmp[1] = oy + m10 * dx + m11 * dy;
          mesh.pos[k * 2] = tmp[0]; mesh.pos[k * 2 + 1] = tmp[1];
        }
      }
    },
    /** Item id under an image point (topmost first), for picking it in the preview. */
    hit(x, y) {
      for (let i = items.length - 1; i >= 0; i--) {
        const { def, mesh, layer } = items[i];
        if (!layer.visible) continue;
        // inside the deformed quad (its four corners)
        const n = mesh.cols + 1, corner = k => [mesh.pos[k * 2], mesh.pos[k * 2 + 1]];
        const poly = [corner(0), corner(n - 1), corner(n * n - 1), corner(n * (n - 1))];
        let inside = false;
        for (let p = 0, q = 3; p < 4; q = p++) {
          const [xi, yi] = poly[p], [xj, yj] = poly[q];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) return def.id;
      }
      return null;
    },
  };
}
