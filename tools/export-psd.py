# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "pillow", "psd-tools>=1.10"]
# ///
"""Export a built project as a layered PSD for Affinity, Photoshop or Live2D Cubism.

Layers, bottom to top: the original illustration (hidden, for reference), the separated parts
from tools/build-parts.py (or the single base image), the eye layers, and the drawn eye and
mouth variants (hidden). Every layer is placed at its source position, so the visible layers
recompose the illustration. The file is written inside the project (default: <project>/<name>.psd).
"""

import argparse
import json
from pathlib import Path

from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer

from agent_common import ROOT, inside_repo

EYE_PARTS = ["ball", "low", "crease", "lash"]


def add(psd, image, name, left, top, visible=True):
    layer = PixelLayer.frompil(image.convert("RGBA"), psd, name, top, left)
    layer.visible = visible
    psd.append(layer)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("project")
    parser.add_argument("--out", help="output path inside the project")
    args = parser.parse_args(argv)
    project = inside_repo(Path(args.project))
    built = project / "built"
    meta = json.loads((built / "layers.json").read_text(encoding="utf8"))
    source = Image.open(project / "source.png").convert("RGBA")
    psd = PSDImage.new("RGB", source.size, depth=8)
    add(psd, source, "reference (original)", 0, 0, visible=False)
    parts = meta.get("parts") or []
    if parts:
        for part in sorted(parts, key=lambda p: p["z"]):
            x, y, _, _ = part["rect"]
            add(psd, Image.open(built / part["file"]), part["name"], x, y)
    else:
        add(psd, Image.open(built / "base.png"), "base", 0, 0)
    for eye in (0, 1):
        for part in EYE_PARTS:
            name = f"eye{eye}_{part}"
            if name in meta["layers"]:
                x, y, _, _ = meta["layers"][name]
                add(psd, Image.open(built / f"{name}.png"), name, x, y)
    sprites = built / "sprites" / "sprites.json"
    if sprites.exists():
        sheet = json.loads(sprites.read_text(encoding="utf8"))
        for name, (x, y, _, _) in sheet["layers"].items():
            add(psd, Image.open(built / "sprites" / f"{name}.png"), f"variant {name}", x, y, visible=False)
    out = inside_repo(Path(args.out)) if args.out else project / f"{project.name}.psd"
    if not out.resolve().is_relative_to(project.resolve()):
        raise SystemExit("the PSD must stay inside the project folder")
    psd.save(out)
    print(f"Wrote {out.relative_to(ROOT)} with {len(list(psd))} layers")


if __name__ == "__main__":
    main()
