"""Build docs/data.js from Devoir/Bindrune/Runes/runes.json (grid nodes -> pixels)."""
import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "Runes" / "runes.json"
DESC = Path(__file__).resolve().parent / "descriptions.json"
OUT = Path(__file__).resolve().parents[1] / "docs" / "data.js"

src = json.loads(SRC.read_text(encoding="utf-8"))
grid = src["grille"]


def px(c, r):
    return [160 + 48 * c, 58 + 33 * r]


descriptions = json.loads(DESC.read_text(encoding="utf-8"))
runes = []
for name, r in src["runes"].items():
    strokes = []
    for t in r["traits"]:
        pts = [px(c, row) for c, row in t["noeuds"]]
        if t["ferme"]:
            pts.append(pts[0])
        strokes.append({"name": t["nom"], "pts": pts})
    runes.append({"name": name, "glyph": r["glyphe"], "strokes": strokes, "sens": descriptions[name]})

data = {"strokeWidth": grid["epaisseur_px"], "bbox": [160, 58, 352, 454], "runes": runes}
OUT.write_text("window.RUNES = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
print(f"{len(runes)} runes -> {OUT}", file=sys.stderr)
