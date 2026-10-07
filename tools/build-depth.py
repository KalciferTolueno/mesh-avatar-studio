# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "pillow", "onnxruntime>=1.17", "huggingface_hub>=0.23"]
# ///
"""Estimate a depth map for a project with Depth Anything V2 Small, entirely on this machine.

The model (Apache-2.0, about 100 MB) is downloaded once from Hugging Face into the local
Hugging Face cache; the illustration itself is never uploaded. The result is a smooth relief
map, normalized inside the head ellipse (0 = head outline, 1 = nearest point such as a snout),
written to built/depth.png and announced in built/layers.json so the engine turns the head
with it when rig.head.depth.map is set.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from agent_common import ROOT, inside_repo

MODEL_REPO = "onnx-community/depth-anything-v2-small"
MODEL_FILE = "onnx/model.onnx"
SIZE = 518  # network input side, a multiple of the 14 px patch size
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def estimate(image: Image.Image) -> np.ndarray:
    """Relative inverse depth (larger = nearer) at the image's own size."""
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download

    model = hf_hub_download(MODEL_REPO, MODEL_FILE)
    session = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    rgba = np.asarray(image.convert("RGBA")).astype(np.float32) / 255
    # composite on mid grey so transparent pixels do not read as a near white wall
    rgb = rgba[..., :3] * rgba[..., 3:] + 0.5 * (1 - rgba[..., 3:])
    small = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).resize((SIZE, SIZE), Image.BICUBIC), np.float32) / 255
    tensor = ((small - MEAN) / STD).transpose(2, 0, 1)[None]
    name = session.get_inputs()[0].name
    depth = session.run(None, {name: tensor})[0].reshape(SIZE, SIZE)
    return np.asarray(Image.fromarray(depth.astype(np.float32), mode="F").resize(image.size, Image.BICUBIC))


def relief(depth: np.ndarray, alpha: np.ndarray, head: dict, blur: float) -> np.ndarray:
    """Normalize depth inside the head ellipse to 0..1 and smooth it so the warp cannot tear."""
    h, w = depth.shape
    ys, xs = np.mgrid[0:h, 0:w]
    inside = ((xs - head["cx"]) / head["rx"]) ** 2 + ((ys - head["cy"]) / head["ry"]) ** 2 < 1
    region = depth[inside & (alpha > 0.5)]
    if region.size < 100:
        raise ValueError("the head ellipse covers almost no opaque pixels")
    lo, hi = np.percentile(region, [5, 99])
    z = np.clip((depth - lo) / max(hi - lo, 1e-6), 0, 1)
    z[alpha <= 0.5] = 0  # background sits at the back
    image = Image.fromarray((z * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(image)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("project", help="project folder inside this repository")
    parser.add_argument("--blur", type=float, default=None, help="smoothing radius in px (default 1.5%% of the width)")
    args = parser.parse_args(argv)
    project = inside_repo(Path(args.project))
    built = project / "built"
    layers_path = built / "layers.json"
    if not layers_path.exists():
        raise SystemExit("Build the layers first (tools/build-layers.py).")
    rig = json.loads((project / "rig.json").read_text(encoding="utf8"))
    source = Image.open(project / "source.png")
    alpha = np.asarray(source.convert("RGBA"))[..., 3].astype(np.float32) / 255
    print("Estimating depth locally (the model downloads once on first use)...", file=sys.stderr)
    depth = estimate(source)
    blur = args.blur if args.blur is not None else source.width * 0.015
    out = relief(depth, alpha, rig["head"], blur)
    Image.fromarray(out).save(built / "depth.png")
    layers = json.loads(layers_path.read_text(encoding="utf8"))
    layers["depth"] = "depth.png"
    layers_path.write_text(json.dumps(layers), encoding="utf8")
    print(f"Wrote {(built / 'depth.png').relative_to(ROOT)}; set rig.head.depth.map to use it.")


if __name__ == "__main__":
    main()
