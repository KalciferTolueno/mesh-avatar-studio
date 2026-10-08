# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "pillow", "opencv-python-headless", "onnxruntime>=1.17", "huggingface_hub>=0.23"]
# ///
"""Split a built project into overlapping parts (body, head, ears, front hair) and fill what
each part hides, entirely on this machine.

The cuts come from rig.parts: a jaw polyline (head above, body below), ear outlines and a front
hair outline. Within the outlines, colours decide which pixels belong to which part. What a part
covers is filled on the part behind it: the neck and collar under the head, the base of each
ear under the head fur and the forehead under the front hair. Large fills use LaMa (Apache-2.0,
about 200 MB, downloaded once into the Hugging Face cache; nothing is uploaded), small ones
OpenCV. Results go to built/parts/ and built/layers.json; --preview only writes mask overlays.
"""

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from agent_common import ROOT, inside_repo

LAMA_REPO, LAMA_FILE, LAMA_SIZE = "Carve/LaMa-ONNX", "lama_fp32.onnx", 512


def polygon_mask(shape, points):
    mask = np.zeros(shape, np.uint8)
    cv2.fillPoly(mask, [np.round(np.asarray(points)).astype(np.int32)], 1)
    return mask.astype(bool)


def below_polyline(shape, points):
    """True below the polyline; columns outside its x range use the nearest end point."""
    h, w = shape
    pts = np.asarray(sorted(points), float)
    y = np.interp(np.arange(w), pts[:, 0], pts[:, 1])
    return np.arange(h)[:, None] > y[None, :]


def classify(rgba):
    rgb = rgba[..., :3].astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = rgb.mean(-1)
    sat = rgb.max(-1) - rgb.min(-1)
    return {
        "lum": lum,
        # ear skin (purple back, pink inside, dark shadow): green well below red
        "ear": (g < 0.62 * np.maximum(r, 1)) & (lum > 25),
        # clothing: saturated red, or dark warm brown, with little blue
        "cloth": ((r > 60) & (b < 0.6 * r) & (g < 0.45 * r)) | ((lum < 110) & (lum > 20) & (b <= r + 4) & (g <= r + 4) & (sat < 40)),
        "metal": (sat < 22) & (lum > 30) & (lum < 215),
        "line": lum < 60,
    }


def grow_into(mask, allowed, px):
    """Extend mask by px into allowed pixels (outline strokes next to a part belong to it)."""
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
    return mask | (cv2.dilate(mask.astype(np.uint8), kernel).astype(bool) & allowed)


def clean(mask, close=5, min_area=400):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close))
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, k)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros_like(m, bool)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            keep |= labels == i
    return keep


def fill_holes(mask):
    """Interior holes (a dark pixel of the mouth line) belong to the mask."""
    m = mask.astype(np.uint8)
    flood = m.copy()
    h, w = m.shape
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    return mask | (flood == 0)


def largest(mask):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask
    return labels == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))


def split(rgba, rig, hair):
    shape = rgba.shape[:2]
    alpha = rgba[..., 3] > 8
    c = classify(rgba)
    parts = rig["parts"]
    head = rig["head"]
    ys, xs = np.mgrid[0:shape[0], 0:shape[1]]
    # generous head area: the head ellipse grown upwards for ears and hair
    near_head = ((xs - head["cx"]) / (head["rx"] * 1.3)) ** 2 + ((ys - head["cy"]) / (head["ry"] * 1.35)) ** 2 < 1
    above_jaw = ~below_polyline(shape, parts["jaw"])
    # clothing colours only count around the neck: pink ear skin is just as red
    neck_y = min(y for _, y in parts["jaw"]) - 80
    # fur: light or lavender pixels of the head (face fur, stripes, hair)
    rgb = rgba[..., :3].astype(np.float32)
    fur = (rgb[..., 1] > 0.68 * np.maximum(rgb[..., 0], 1)) & (c["lum"] > 90) & ~c["metal"]
    # beside the neck only fur belongs to the head (the collar's shading is just as dark)
    neck = ys > neck_y
    head_area = alpha & near_head & above_jaw & (~neck | fur)
    head_area = grow_into(head_area, alpha & c["line"] & above_jaw, 3)
    head_area = fill_holes(largest(clean(head_area)))
    ears = []
    for ear in parts.get("ears", []):
        inside = polygon_mask(shape, ear["outline"])
        # fur inside the outline belongs to the head when it continues outside the outline
        # (fur over the ear base, hair over its top); highlights on the ear rim only touch
        # the background, so they stay with the ear
        outside_fur = fur & head_area & ~inside
        n, labels = cv2.connectedComponents((fur & inside & head_area).astype(np.uint8), 8)
        head_fur = np.zeros(shape, bool)
        touch = cv2.dilate(outside_fur.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        for i in range(1, n):
            comp = labels == i
            if (comp & touch).any():
                head_fur |= comp
        head_fur = grow_into(head_fur, inside & c["line"], 3)
        m = head_area & inside & ~head_fur
        ears.append((ear["name"], clean(m, 3, 200)))
    any_ear = np.zeros(shape, bool)
    for _, m in ears:
        any_ear |= m

    front = np.zeros(shape, bool)
    if "front" in parts:
        inside = polygon_mask(shape, parts["front"]["outline"])
        top = parts["front"].get("hairline", 300)
        front = head_area & inside & ~any_ear & ((hair > 0.3) | (ys < top))
        front = grow_into(front, head_area & inside & c["line"] & ~any_ear, 2)
        front = clean(front, 3, 200)

    head_only = head_area & ~any_ear & ~front
    # leftovers inside an ear outline that do not reach the rest of the head (rim highlights,
    # the rim outline next to the hair) belong to that ear
    refined = []
    for (name, m), ear in zip(ears, parts.get("ears", [])):
        inside = polygon_mask(shape, ear["outline"])
        main = cv2.dilate((head_only & ~inside).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        n, labels = cv2.connectedComponents((head_only & inside).astype(np.uint8), 8)
        for i in range(1, n):
            comp = labels == i
            if not (comp & main).any():
                m = m | comp
                head_only &= ~comp
        refined.append((name, m))
    ears = refined
    # stray pieces of the head (outline arcs along an ear's rim) go to the nearest ear
    main = largest(head_only)
    n, labels = cv2.connectedComponents((head_only & ~main).astype(np.uint8), 8)
    grown = [cv2.dilate(polygon_mask(shape, ear["outline"]).astype(np.uint8), np.ones((81, 81), np.uint8)).astype(bool)
             for ear in parts.get("ears", [])]
    for i in range(1, n):
        comp = labels == i
        for k, area in enumerate(grown):
            if (comp & area).any():
                ears[k] = (ears[k][0], ears[k][1] | comp)
                head_only &= ~comp
                break
    # items lying on the body (hoodie cords…): everything opaque inside their outline
    items = []
    for item in parts.get("items", []):
        m = alpha & ~head_area & polygon_mask(shape, item["outline"])
        items.append((item["name"], clean(m, 3, 100)))
    body = alpha & ~head_area
    for _, m in items:
        body &= ~m
    return {"body": body, "head": head_only, "front": front, "ears": ears, "items": items, "alpha": alpha}


def overlay(rgba, masks, path):
    colours = {"body": (60, 120, 255), "head": (255, 200, 40), "front": (40, 220, 90)}
    out = rgba[..., :3].astype(np.float32) * 0.45 + 255 * 0.15
    for name, colour in colours.items():
        m = masks[name]
        out[m] = out[m] * 0.45 + np.array(colour) * 0.55
    for i, (_, m) in enumerate(masks["ears"]):
        out[m] = out[m] * 0.45 + np.array((230, 60, 200) if i == 0 else (255, 80, 80)) * 0.55
    for _, m in masks["items"]:
        out[m] = out[m] * 0.45 + np.array((40, 220, 220)) * 0.55
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(path)


# ---- filling ----

def lama_session():
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download
    return ort.InferenceSession(hf_hub_download(LAMA_REPO, LAMA_FILE), providers=["CPUExecutionProvider"])


def lama_fill(session, rgb, hole, box):
    """Inpaint hole inside box=(x0,y0,x1,y1) of rgb (uint8 HxWx3); returns the filled crop."""
    x0, y0, x1, y1 = box
    crop = rgb[y0:y1, x0:x1]
    m = hole[y0:y1, x0:x1].astype(np.uint8)
    h, w = m.shape
    img = cv2.resize(crop, (LAMA_SIZE, LAMA_SIZE), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    mk = (cv2.resize(m, (LAMA_SIZE, LAMA_SIZE), interpolation=cv2.INTER_NEAREST) > 0).astype(np.float32)
    inputs = session.get_inputs()
    feed = {inputs[0].name: img.transpose(2, 0, 1)[None], inputs[1].name: mk[None, None]}
    out = session.run(None, feed)[0][0].transpose(1, 2, 0)
    if out.max() <= 1.5:
        out = out * 255
    out = cv2.resize(out.clip(0, 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_CUBIC)
    result = crop.copy()
    result[m > 0] = out[m > 0]
    return result


def square_box(mask, pad, shape):
    ys, xs = np.nonzero(mask)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    side = max(xs.max() - xs.min(), ys.max() - ys.min()) + 2 * pad
    x0 = int(max(0, cx - side / 2)); y0 = int(max(0, cy - side / 2))
    x1 = int(min(shape[1], x0 + side)); y1 = int(min(shape[0], y0 + side))
    return x0, y0, x1, y1


def distance_to(mask):
    return cv2.distanceTransform((~mask).astype(np.uint8), cv2.DIST_L2, 5)


def paint_behind(out, rgba, masks, hole, cfg):
    """Paint what a lifted or turning head uncovers: a rounded neck between `neck.width` (at
    the bottom) and `neck.topWidth` (at the top of the outline), cel shaded with an outline, and
    the clothing behind it in shadow. Colours are sampled from the drawing."""
    rgb = rgba[..., :3].astype(np.float32)
    ys, xs = np.nonzero(hole)
    if not len(ys):
        return
    y0, y1 = ys.min(), ys.max() + 1
    neck = cfg["neck"]
    cx, bottom = neck["cx"], neck["bottom"]
    # neck colour: the fur just below the jaw; clothing: the clothing's own pixels, in shadow
    below = masks["body"].copy()
    below[: int(bottom)] = False
    below[int(bottom) + 80:] = False
    below[:, : int(cx - neck["width"] / 2)] = False
    below[:, int(cx + neck["width"] / 2):] = False
    lum = rgb.mean(-1)
    fur = below & (lum > 150)   # the light fur under the chin, shaded below
    neck_col = np.median(rgb[fur], axis=0) if fur.any() else np.array([190, 170, 200], np.float32)
    # the drawing's own fur shadow (stripes, shading), so the shadow keeps the fur's hue
    shaded = below & (lum > 100) & (lum < 175)
    shadow_col = np.median(rgb[shaded], axis=0) if shaded.any() else neck_col * 0.7
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    cloth = masks["body"] & (r > 90) & (g < 0.45 * r) & (b < 0.6 * r)   # the hood's red lining
    cloth[: y0] = False
    cloth[int(bottom) + 200:] = False
    cloth_col = np.median(rgb[cloth], axis=0) if cloth.any() else np.array([110, 30, 35], np.float32)
    line_col = np.array(cfg.get("line", [28, 14, 24]), np.float32)
    yy, xx = ys.astype(np.float32), xs.astype(np.float32)
    t = np.clip((yy - y0) / max(1, bottom - y0), 0, 1)          # 0 top .. 1 jaw
    # sides curve out into the shoulders like a real neck, instead of straight lines
    half = (neck["topWidth"] + (neck["width"] - neck["topWidth"]) * t ** 1.8) / 2
    d = np.abs(xx - cx) - half                                     # < 0 inside the neck
    inside = np.clip(0.5 - d, 0, 1)[:, None]
    rel = np.clip(np.abs(xx - cx) / np.maximum(half, 1), 0, 1)
    # deep under the head it is in shadow; towards the chest it meets the fur it continues
    light = ((0.25 + 0.6 * t ** 1.5) * (0.8 + 0.2 * (1 - rel ** 2)))[:, None]
    neck_px = shadow_col * 0.85 * (1 - light) + neck_col * light
    # only a sliver of clothing shows beside the neck: dark and muted, so it reads as depth
    muted = cloth_col * 0.6 + cloth_col.mean() * 0.4
    cloth_px = muted * (0.32 + 0.12 * t)[:, None]
    col = neck_px * inside + cloth_px * (1 - inside)
    line = 0.7 * np.clip(1.3 - np.abs(d), 0, 1)[:, None]
    col = col * (1 - line) + line_col * line
    out[ys, xs] = col.clip(0, 255).astype(np.uint8)


def fill_parts(rgba, masks, rig, session):
    rgb = rgba[..., :3].copy()
    shape = rgb.shape[:2]
    layers = {}
    fill = rig["parts"].get("fill", {})

    # body: the strip under the head that a turning head uncovers (neck, collar)
    covered = masks["head"] | masks["front"]
    for _, m in masks["ears"]:
        covered |= m
    reach = fill.get("body", 110)
    # Behind the head there is a neck only as wide as the jaw; beside it, behind the cheek
    # fur, there is background or the collar's edge. Fill the neck up to `reach` above the jaw
    # and elsewhere only a thin band that continues the collar under the fur.
    jaw = np.asarray(sorted(rig["parts"]["jaw"]), float)
    inner = jaw[1:-1] if len(jaw) > 2 else jaw
    ys, xs = np.mgrid[0:shape[0], 0:shape[1]]
    neck = (xs >= inner[0, 0]) & (xs <= inner[-1, 0]) & (ys > np.interp(xs, jaw[:, 0], jaw[:, 1]) - reach)
    near_body = distance_to(masks["body"])
    hole = covered & (near_body < reach) & (neck | (near_body < fill.get("collar", 12))) & (distance_to(~masks["alpha"]) > 2)
    body_rgb = rgb.copy()
    behind = rig["parts"].get("behind")
    if behind:
        # drawn instead of guessed: a rounded neck and the hood's lining in shadow
        # kept well inside the head's silhouette so its edge never shows when the head moves
        inset = int(behind.get("inset", 40))
        solid = cv2.erode((covered | masks["body"]).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * inset + 1, 2 * inset + 1))).astype(bool)
        hole = covered & polygon_mask(shape, behind["outline"]) & solid
        paint_behind(body_rgb, rgba, masks, hole, behind)
    body_alpha = masks["body"] | hole
    if hole.any() and not behind:
        # Under the head there is only neck in shadow: carry the neck, chest and collar
        # colours upwards smoothly (no invented strokes) and darken them like the head's shadow.
        # Everything that is not body, background included, is unknown.
        x0, y0, x1, y1 = square_box(hole, 40, shape)
        k = 4
        crop = cv2.resize(rgb[y0:y1, x0:x1], None, fx=1 / k, fy=1 / k, interpolation=cv2.INTER_AREA)
        # outline strokes are not a colour to continue: leave them out of the context
        lines = cv2.dilate((rgb.astype(np.float32).mean(-1) < 80).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        context = masks["body"] & ~lines
        unknown = cv2.resize((~context[y0:y1, x0:x1]).astype(np.uint8), (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_NEAREST)
        smooth = cv2.inpaint(crop, unknown, 12, cv2.INPAINT_TELEA)
        smooth = cv2.resize(smooth, (x1 - x0, y1 - y0), interpolation=cv2.INTER_CUBIC).astype(np.float32)
        depth = np.clip(distance_to(masks["body"])[y0:y1, x0:x1] / reach, 0, 1)
        shade = smooth * (0.9 - 0.15 * depth)[..., None]
        region = hole[y0:y1, x0:x1]
        body_rgb[y0:y1, x0:x1][region] = shade[region].clip(0, 255).astype(np.uint8)
        # beside the neck the band continues the collar, so it takes the clothing's colours only
        side = hole & ~neck
        if side.any():
            cloth = masks["body"] & classify(rgba)["cloth"] & ~lines
            unknown = (~cloth[y0:y1, x0:x1]).astype(np.uint8)
            full = cv2.inpaint(rgb[y0:y1, x0:x1], unknown, 9, cv2.INPAINT_TELEA)
            region = side[y0:y1, x0:x1]
            body_rgb[y0:y1, x0:x1][region] = full[region]
    # the cloth behind each item: smooth fill from the surrounding body only
    for name, m in masks["items"]:
        x0, y0, x1, y1 = square_box(m, 30, shape)
        hole = cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8))[y0:y1, x0:x1]
        unknown = ((hole > 0) | ~masks["body"][y0:y1, x0:x1]).astype(np.uint8)
        filled = cv2.inpaint(body_rgb[y0:y1, x0:x1], unknown, 9, cv2.INPAINT_TELEA)
        region = (hole > 0) & masks["alpha"][y0:y1, x0:x1]
        body_rgb[y0:y1, x0:x1][region] = filled[region]
        body_alpha[y0:y1, x0:x1] |= region
        layers[name] = with_alpha(rgb, m)
    layers["body"] = with_alpha(body_rgb, body_alpha)

    # head: the forehead under the front hair
    head_rgb = rgb.copy()
    hole = masks["front"] & (distance_to(masks["head"]) < fill.get("front", 45))
    if hole.any():
        for comp in components(hole):
            box = square_box(comp, 50, shape)
            head_rgb[box[1]:box[3], box[0]:box[2]] = lama_fill(session, head_rgb, comp, box)
    layers["head"] = with_alpha(head_rgb, masks["head"] | hole)
    layers["front"] = with_alpha(rgb, masks["front"])

    # ears: continue each ear a little under the head fur, from the ear's own colours only
    for name, m in masks["ears"]:
        hole = (covered & ~m) & (distance_to(m) < fill.get("ears", 35))
        ear = rgb.copy()
        if hole.any():
            # propagate only the ear's own colours: everything that is not ear is unknown
            x0, y0, x1, y1 = square_box(m | hole, 20, shape)
            crop = rgb[y0:y1, x0:x1]
            unknown = (~m[y0:y1, x0:x1]).astype(np.uint8)
            filled = cv2.inpaint(crop, unknown, 9, cv2.INPAINT_TELEA)
            region = hole[y0:y1, x0:x1]
            ear[y0:y1, x0:x1][region] = filled[region]
        layers[name] = with_alpha(ear, m | hole)
    return layers


def components(mask):
    n, labels = cv2.connectedComponents(mask.astype(np.uint8), 8)
    return [labels == i for i in range(1, n) if (labels == i).sum() > 30]


def with_alpha(rgb, mask):
    soft = cv2.GaussianBlur(mask.astype(np.float32), (3, 3), 0.7)
    return np.dstack([rgb, (soft * 255).astype(np.uint8)])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("project")
    parser.add_argument("--preview", action="store_true", help="only write mask overlays to work/")
    args = parser.parse_args(argv)
    project = inside_repo(Path(args.project))
    built = project / "built"
    rig = json.loads((project / "rig.json").read_text(encoding="utf8"))
    if "parts" not in rig:
        raise SystemExit("rig.json has no parts section")
    base = np.asarray(Image.open(built / "base.png").convert("RGBA"))
    hair = np.asarray(Image.open(built / "hairmask.png").convert("L")).astype(np.float32) / 255
    masks = split(base, rig, hair)
    (project / "work").mkdir(exist_ok=True)
    overlay(base, masks, project / "work" / "parts-overlay.png")
    if args.preview:
        print(f"Wrote {(project / 'work' / 'parts-overlay.png').relative_to(ROOT)}")
        return
    print("Filling hidden areas locally (LaMa downloads once on first use)...", file=sys.stderr)
    layers = fill_parts(base, masks, rig, lama_session())
    out = built / "parts"
    out.mkdir(exist_ok=True)
    meta = json.loads((built / "layers.json").read_text(encoding="utf8"))
    order = ["body", "head", "front"]
    entries = []
    for name, image in layers.items():
        ys, xs = np.nonzero(image[..., 3] > 0)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        Image.fromarray(image[y0:y1, x0:x1]).save(out / f"{name}.png")
        item = name in {n for n, _ in masks["items"]}
        role = "body" if name == "body" or item else "head"
        z = 0.5 if item else -1 if name not in order else order.index(name)
        entries.append({"name": name, "file": f"parts/{name}.png", "rect": [x0, y0, x1 - x0, y1 - y0], "role": role, "z": z,
                        "hair": name == "front"})
    meta["parts"] = sorted(entries, key=lambda e: e["z"])
    (built / "layers.json").write_text(json.dumps(meta), encoding="utf8")
    print(f"Wrote {len(entries)} parts to {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
