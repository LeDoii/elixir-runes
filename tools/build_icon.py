"""Icône du site : une bindrune gravée en clair sur fond d'encre. Génère docs/favicon.svg, favicon.ico (via PNG), apple-touch-icon.png, icon-192.png, icon-512.png.
Lancer :  python tools/build_icon.py [Rune1 Rune2 …]   (par défaut : les runes de ICON). Les formes viennent de docs/data.js."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
ICON = ["Gebo", "Isa"]                       # bindrune de l'icône (même point d'ancrage, superposées)
INK, PAPER, WARM = "#20201E", "#E7E0D1", "#A4551F"
THICK = 1.7                                  # trait épaissi : l'icône reste lisible à 16 px


def runes():
    text = (DOCS / "data.js").read_text(encoding="utf-8")
    data = json.loads(text[text.index("{"): text.rindex("}") + 1])
    return data, {r["name"]: r for r in data["runes"]}


def geometry(names):
    data, by = runes()
    paths = [s["pts"] for n in names for s in by[n]["strokes"]]
    xs = [p[0] for s in paths for p in s]; ys = [p[1] for s in paths for p in s]
    return paths, data["strokeWidth"], (min(xs), min(ys), max(xs), max(ys))


def svg(names, size=512):
    paths, sw, (x0, y0, x1, y1) = geometry(names)
    cx, cy, span = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) + sw
    k = size * 0.62 / span
    lines = []
    for s in paths:
        pts = " ".join("%.1f,%.1f" % ((p[0] - cx) * k + size / 2, (p[1] - cy) * k + size / 2) for p in s)
        lines.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linejoin="miter" stroke-linecap="butt"/>' % (pts, PAPER, sw * k * THICK))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d"><rect width="%d" height="%d" rx="%d" fill="%s"/>'
            '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%d" fill="none" stroke="%s" stroke-width="%.1f" opacity=".9"/>%s</svg>'
            % (size, size, size, size, size * 0.19, INK, size * 0.035, size * 0.035, size * 0.93, size * 0.93, size * 0.16, WARM, size * 0.012, "".join(lines)))


def png(names, size, ss=4):
    """Rendu en suréchantillonnage, coins arrondis et transparents."""
    paths, sw, (x0, y0, x1, y1) = geometry(names)
    big = size * ss
    cx, cy, span = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) + sw
    k = big * 0.62 / span
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.19, fill=INK)
    d.rounded_rectangle([big * 0.035, big * 0.035, big * 0.965, big * 0.965], radius=big * 0.16, outline=WARM, width=max(1, int(big * 0.012)))
    for s in paths:
        pts = [((p[0] - cx) * k + big / 2, (p[1] - cy) * k + big / 2) for p in s]
        d.line(pts, fill=PAPER, width=int(sw * k * THICK), joint="curve")
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    names = sys.argv[1:] or ICON
    (DOCS / "favicon.svg").write_text(svg(names), encoding="utf-8")
    png(names, 180).save(DOCS / "apple-touch-icon.png")
    png(names, 192).save(DOCS / "icon-192.png")
    png(names, 512).save(DOCS / "icon-512.png")
    png(names, 48).save(DOCS / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("icône :", " + ".join(names))
