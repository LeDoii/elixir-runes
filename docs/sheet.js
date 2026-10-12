/* Fiche d'une bindrune : une page A4 (PNG ou PDF) avec la plaque gravée, les runes, leurs sens gardés, les étiquettes et la complexité.
 *
 * Les couleurs et les polices suivent la charte des objets runiques (fond #E7E0D1, encre #20201E, Italiana, Crimson Pro).
 * Le PDF est une page A4 portant l'image de la fiche (JPEG) : aucune bibliothèque, aucun envoi.
 * Dépend de data.js, supports.js, tags.js, complexity.js. */
(function (root) {
  "use strict";
  const W = 2480, H = 3508, M = 150;                              // A4 à 300 dpi, marge intérieure
  const INK = "#20201E", GREY = "#948B78", GREY2 = "#6E6759", TEXT = "#33302A", WARM = "#A4551F", PAPER = "#E7E0D1";
  const SERIF = '"Crimson Pro", Georgia, serif', TITLE = '"Italiana", "Crimson Pro", Georgia, serif', MONO = 'ui-monospace, Consolas, "Courier New", monospace';

  /* ------------------------------------------------------------------ PDF : une page A4, une image JPEG */
  /** jpeg : Uint8Array du fichier JPEG ; retourne le PDF (Uint8Array). Les positions de la table xref sont calculées sur les octets réels. */
  function buildPdf(jpeg, wpx, hpx) {
    const enc = new TextEncoder(), parts = [], offsets = [];
    let len = 0;
    const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offsets[n] = len; push(n + " 0 obj\n"); push(body); push("\nendobj\n"); };
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>");
    const content = "q 595.28 0 0 841.89 0 0 cm /Im0 Do Q";
    obj(4, "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
    offsets[5] = len;
    push("5 0 obj\n<< /Type /XObject /Subtype /Image /Width " + wpx + " /Height " + hpx + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n");
    push(jpeg); push("\nendstream\nendobj\n");
    const xref = len;
    let table = "xref\n0 6\n0000000000 65535 f \n";
    for (let i = 1; i <= 5; i++) table += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    push(table + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    const out = new Uint8Array(len);
    let p = 0;
    parts.forEach((b) => { out.set(b, p); p += b.length; });
    return out;
  }

  /* ------------------------------------------------------------------ dessin */
  const cnv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

  /** Plaque gravée (support, effet, strates) : même rendu que l'onglet Bindrune, composition centrée. */
  function plateCanvas(d, w, h) {
    const D = root.RUNES, byName = (n) => D.runes.find((r) => r.name === n), c = cnv(w, h), g = c.getContext("2d"), RES = w / 800, HW = D.strokeWidth / 2;
    g.drawImage(root.Supports.plate(d.s, w, h), 0, 0);
    const placed = d.r.map((e) => ({ e, paths: byName(e.n).strokes.map((s) => s.pts.map((p) => [p[0] + e.x, p[1] + e.y])) }));
    const all = placed.flatMap((p) => p.paths.flat());
    const x0 = Math.min(...all.map((p) => p[0])) - HW, x1 = Math.max(...all.map((p) => p[0])) + HW;
    const y0 = Math.min(...all.map((p) => p[1])) - HW, y1 = Math.max(...all.map((p) => p[1])) + HW;
    const sc = Math.min(1, 740 / (x1 - x0), 590 / (y1 - y0));
    g.setTransform(RES * sc, 0, 0, RES * sc, 0, 0);
    g.translate(400 / sc - (x0 + x1) / 2, 320 / sc - (y0 + y1) / 2);
    if (d.t === 1) {
      g.save(); g.lineCap = "butt"; g.lineJoin = "miter"; g.miterLimit = 3; g.lineWidth = D.strokeWidth;
      placed.forEach(({ e, paths }) => {
        g.strokeStyle = e.c; g.globalAlpha = 0.88; g.beginPath();
        paths.forEach((p) => p.forEach((pt, i) => (i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]))));
        g.stroke();
      });
      g.restore();
    } else {
      root.Supports.engrave(g, placed.reduce((a, x) => a.concat(x.paths), []), D.strokeWidth, d.s, { cap: "butt" });
    }
    return c;
  }

  /** Retour à la ligne : retourne les lignes qui tiennent dans maxW avec la police courante du contexte. */
  function wrap(g, text, maxW) {
    const lines = [];
    let line = "";
    String(text).split(/\s+/).filter(Boolean).forEach((word) => {
      const t = line ? line + " " + word : word;
      if (line && g.measureText(t).width > maxW) { lines.push(line); line = word; } else line = t;
    });
    if (line) lines.push(line);
    return lines;
  }
  const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };

  /** Pastilles d'étiquettes sur plusieurs lignes ; dry : mesure seulement. Retourne la hauteur utilisée. */
  function chips(g, tags, x, y, maxW, s, dry) {
    const T = root.Tags, fs = 34 * s, padX = 22 * s, h = fs * 1.9, gap = 14 * s;
    g.font = fs + "px " + MONO;
    let cx = x, cy = y;
    tags.forEach(({ t, kind }) => {
      const label = T.label(t), w = g.measureText(label).width + 2 * padX;
      if (cx > x && cx + w > x + maxW) { cx = x; cy += h + gap; }
      if (!dry) {
        roundRect(g, cx, cy, w, h, h / 2);
        if (kind === "rune") { g.fillStyle = "rgba(32,32,30,.10)"; g.fill(); g.strokeStyle = GREY2; g.lineWidth = 3 * s; g.stroke(); }
        else { g.strokeStyle = WARM; g.lineWidth = 3 * s; if (kind === "free") g.setLineDash([10 * s, 8 * s]); g.stroke(); g.setLineDash([]); }
        g.fillStyle = kind === "rune" ? GREY2 : INK; g.textBaseline = "middle"; g.fillText(label, cx + padX, cy + h / 2 + 2 * s);
      }
      cx += w + gap;
    });
    return cy + h - y;
  }

  /** Bas de la fiche : étiquettes, description, complexité, runes et sens. dry : mesure ; sinon dessine. Retourne la hauteur. */
  function bottom(g, rec, s, x0, y0, dry) {
    const T = root.Tags, D = root.RUNES, byName = (n) => D.runes.find((r) => r.name === n), colW = (W - 2 * M - 80) / 2, x1 = x0 + colW + 80;
    const heading = (t, x, y) => { if (!dry) { g.font = 34 * s + "px " + MONO; g.fillStyle = GREY2; g.textBaseline = "alphabetic"; g.letterSpacing = 8 * s + "px"; g.fillText(t.toUpperCase(), x, y); g.letterSpacing = "0px"; } return 34 * s + 26 * s; };
    let y = y0;

    /* colonne gauche : étiquettes et description ; colonne droite : complexité */
    const base = T.derive(rec.d), all = base.map((t) => ({ t, kind: "rune" })).concat(T.clean(rec.tags).filter((t) => !base.includes(t)).map((t) => ({ t, kind: T.isImposed(t) ? "list" : "free" })));
    let yl = y, yr = y;
    yl += heading("Étiquettes", x0, yl);
    yl += chips(g, all, x0, yl, colW, s, dry) + 30 * s;
    if (rec.description) {
      g.font = "italic " + 40 * s + "px " + SERIF;
      const lines = wrap(g, rec.description, colW);
      lines.forEach((l, i) => { if (!dry) { g.fillStyle = TEXT; g.textBaseline = "alphabetic"; g.fillText(l, x0, yl + 40 * s + i * 54 * s); } });
      yl += lines.length * 54 * s + 20 * s;
    }
    const c = root.Complexity.rate(rec.d);
    yr += heading("Complexité", x1, yr);
    if (!dry) {
      g.fillStyle = INK; g.textBaseline = "alphabetic"; g.font = 64 * s + "px " + TITLE; g.fillText(c.level, x1, yr + 52 * s);
      g.font = 40 * s + "px " + MONO; g.fillStyle = GREY2; g.textAlign = "right"; g.fillText(c.score + " / 100", x1 + colW, yr + 48 * s); g.textAlign = "left";
    }
    yr += 80 * s;
    if (!dry) { g.fillStyle = "rgba(32,32,30,.14)"; g.fillRect(x1, yr, colW, 14 * s); g.fillStyle = WARM; g.fillRect(x1, yr, (colW * c.score) / 100, 14 * s); }
    yr += 50 * s;
    c.parts.forEach((p) => {
      if (!dry) { g.font = 36 * s + "px " + SERIF; g.fillStyle = TEXT; g.textBaseline = "alphabetic"; g.fillText(p.label + " (" + p.detail + ")", x1, yr); g.textAlign = "right"; g.font = 34 * s + "px " + MONO; g.fillText(p.pts + " / " + p.max, x1 + colW, yr); g.textAlign = "left"; }
      yr += 50 * s;
    });
    if (c.oppositions.length) {
      g.font = "italic " + 34 * s + "px " + SERIF;
      const txt = "Sens qui s'opposent : " + c.oppositions.map((o) => o.runes[0] + " (" + T.label(o.tags[0]) + ") et " + o.runes[1] + " (" + T.label(o.tags[1]) + ")").join(" ; ") + ".";
      const lines = wrap(g, txt, colW);
      lines.forEach((l, i) => { if (!dry) { g.fillStyle = GREY2; g.fillText(l, x1, yr + i * 46 * s); } });
      yr += lines.length * 46 * s + 10 * s;
    }
    y += Math.max(yl - y, yr - y) + 50 * s;

    /* runes et sens gardés, en deux colonnes */
    y += heading("Runes et sens gardés", x0, y) + 10 * s;
    const cols = [y, y];
    rec.d.r.forEach((e) => {
      const ci = cols[0] <= cols[1] ? 0 : 1, x = ci ? x1 : x0;
      let yy = cols[ci];
      const rune = byName(e.n), kept = T.keptTags(e);
      if (!dry) { g.fillStyle = e.c; g.beginPath(); g.arc(x + 20 * s, yy + 28 * s, 16 * s, 0, 6.3); g.fill(); g.font = 66 * s + "px " + TITLE; g.fillStyle = INK; g.textBaseline = "alphabetic"; g.fillText(e.n, x + 58 * s, yy + 50 * s); }
      yy += 88 * s;
      let any = false;
      rune.sens.forEach((text, i) => {
        const mine = T.RUNE_TAGS[e.n][i].map(T.norm).filter((t) => kept.includes(t));
        if (!mine.length) return;
        any = true;
        if (!dry) { g.font = 30 * s + "px " + MONO; g.fillStyle = WARM; g.textBaseline = "alphabetic"; g.fillText(mine.map((t) => T.label(t).toUpperCase()).join(" · "), x, yy + 26 * s); }
        yy += 40 * s;
        g.font = 38 * s + "px " + SERIF;
        const lines = wrap(g, text, colW);
        lines.forEach((l, k) => { if (!dry) { g.fillStyle = TEXT; g.textBaseline = "alphabetic"; g.fillText(l, x, yy + 34 * s + k * 48 * s); } });
        yy += lines.length * 48 * s + 24 * s;
      });
      if (!any) { if (!dry) { g.font = "italic " + 36 * s + "px " + SERIF; g.fillStyle = GREY2; g.fillText("Aucun sens gardé pour cette rune.", x, yy + 30 * s); } yy += 60 * s; }
      cols[ci] = yy + 24 * s;
    });
    return Math.max(cols[0], cols[1]) - y0;
  }

  /** Dessine la fiche et retourne le canevas. rec = { name, description, tags, d, author?, from? }. */
  async function render(rec) {
    try { await Promise.all([document.fonts.load("120px Italiana"), document.fonts.load("40px 'Crimson Pro'"), document.fonts.load("italic 40px 'Crimson Pro'")]); } catch (e) { /* polices indisponibles : repli */ }
    const c = cnv(W, H), g = c.getContext("2d"), D = root.RUNES;
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    g.strokeStyle = GREY; g.lineWidth = 6; g.strokeRect(70, 70, W - 140, H - 140);
    g.lineWidth = 2; g.strokeRect(92, 92, W - 184, H - 184);

    g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.font = "34px " + MONO; g.fillStyle = GREY2; g.letterSpacing = "12px"; g.fillText("BINDRUNE", W / 2 + 6, 215); g.letterSpacing = "0px";
    let ts = 170;
    g.font = ts + "px " + TITLE;
    while (g.measureText(rec.name).width > W - 2 * M - 100 && ts > 70) { ts -= 6; g.font = ts + "px " + TITLE; }
    g.fillStyle = INK; g.fillText(rec.name, W / 2, 215 + 40 + ts * 0.85);
    const sub = rec.d.r.map((e) => e.n).join(" · ") + "  —  " + root.Supports.get(rec.d.s).label + (rec.author ? "  —  par " + rec.author : rec.from ? "  —  d'après " + rec.from : "");
    g.font = "38px " + MONO; g.fillStyle = GREY2;
    let sy = 215 + 40 + ts * 0.85 + 70;
    g.fillText(sub.length > 90 ? sub.slice(0, 89) + "…" : sub, W / 2, sy);
    g.textAlign = "left";

    // plaque : on réduit sa taille si le bas de la fiche en a besoin (beaucoup de runes ou de sens)
    const footer = 150, top = sy + 60, avail = H - footer - M;
    let pw = 1900, s = 1, need;
    for (;;) {
      const ph = pw * 0.8;
      need = bottom(g, rec, s, M, 0, true);
      if (top + ph + 70 + need <= avail || (pw <= 1100 && s <= 0.55)) break;
      if (pw > 1100) pw -= 100; else s -= 0.05;
    }
    const ph = pw * 0.8, px = (W - pw) / 2;
    const plate = plateCanvas(rec.d, Math.round(pw), Math.round(ph));
    g.save(); g.shadowColor = "rgba(32,32,30,.35)"; g.shadowBlur = 40; g.shadowOffsetY = 14;
    roundRect(g, px, top, pw, ph, 44); g.fillStyle = INK; g.fill(); g.restore();
    g.save(); roundRect(g, px, top, pw, ph, 44); g.clip(); g.drawImage(plate, px, top); g.restore();
    bottom(g, rec, s, M, top + ph + 80, false);

    g.textAlign = "center"; g.font = "italic 30px " + SERIF; g.fillStyle = GREY2;
    g.fillText("Les sens viennent du Chapitre 7 du livre de runes. Fiche créée avec « Les runes » : outil de fan, non affilié à l'équipe d'Elixir RP. Rien ne sort de ton navigateur.", W / 2, H - 150);
    g.fillText(new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }), W / 2, H - 108);
    return c;
  }

  const fileSafe = (s) => String(s).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "bindrune";
  function save(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  const toBlob = (c, type, q) => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Image impossible à produire."))), type, q));

  /** Télécharge la fiche ; kind : "png" ou "pdf". */
  async function download(rec, kind) {
    const c = await render(rec), base = "fiche-" + fileSafe(rec.name);
    if (kind === "pdf") {
      const jpeg = new Uint8Array(await (await toBlob(c, "image/jpeg", 0.92)).arrayBuffer());
      save(new Blob([buildPdf(jpeg, c.width, c.height)], { type: "application/pdf" }), base + ".pdf");
    } else save(await toBlob(c, "image/png"), base + ".png");
  }

  const api = { render, download, buildPdf, plateCanvas };
  if (typeof module === "object" && module.exports) module.exports = api; else root.Sheet = api;
})(typeof self !== "undefined" ? self : globalThis);
