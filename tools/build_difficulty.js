// Difficulty ranking of the 24 runes -> docs/difficulty.js
// Composite of (a) simulated hand-drawn accuracy in model mode (lower = harder) and (b) structural complexity.
// Run from SiteRunes/ : node tools/build_difficulty.js
const fs = require("fs");
const path = require("path");
const docs = path.join(__dirname, "..", "docs");
global.window = {};
eval(fs.readFileSync(path.join(docs, "data.js"), "utf8"));
const S = require(path.join(docs, "scoring.js"));
const { map, makeRng, hand } = require("./handsim.js");
const R = window.RUNES.runes;
const TRIALS = 80;

function structure(r) {
  let len = 0, corners = 0;
  const diag = new Set();
  r.strokes.forEach((s) => {
    for (let i = 0; i < s.pts.length - 1; i++) {
      const dx = s.pts[i + 1][0] - s.pts[i][0], dy = s.pts[i + 1][1] - s.pts[i][1];
      len += Math.hypot(dx, dy);
      if (dx !== 0 && dy !== 0) diag.add(Math.round((Math.atan2(dy, dx) * 180) / Math.PI));
    }
    corners += Math.max(0, s.pts.length - 2);                 // interior vertices = direction changes
  });
  const strokes = r.strokes.length;
  const value = strokes + 1.5 * (len / 396) + 0.8 * corners + 0.5 * diag.size;
  return { strokes, length: Math.round(len / 396 * 10) / 10, corners, angles: diag.size, value };
}

const rnd = makeRng(11);
const rows = R.map((r) => {
  let sum = 0;
  for (let t = 0; t < TRIALS; t++) {
    const st = hand(r, rnd, 6, 0.8 + rnd() * 0.4, (rnd() - 0.5) * 40, (rnd() - 0.5) * 40, (rnd() - 0.5) * 0.12);
    sum += S.score(r, map, st, { align: true, t0: 6, t1: 30 }).total;
  }
  return Object.assign({ name: r.name, sim: sum / TRIALS }, structure(r));
});
const norm = (arr) => { const lo = Math.min(...arr), hi = Math.max(...arr); return arr.map((v) => (v - lo) / (hi - lo || 1)); };
const nSim = norm(rows.map((x) => 100 - x.sim)), nStr = norm(rows.map((x) => x.value));
rows.forEach((x, i) => { x.composite = 0.5 * nSim[i] + 0.5 * nStr[i]; });
const nc = norm(rows.map((x) => x.composite));
rows.forEach((x, i) => { x.level = 1 + Math.min(4, Math.floor(nc[i] * 5)); });
rows.sort((a, b) => a.composite - b.composite);
rows.forEach((x, i) => { x.rank = i + 1; });

const out = {};
rows.forEach((x) => { out[x.name] = { rank: x.rank, level: x.level, strokes: x.strokes, corners: x.corners, angles: x.angles, sim: Math.round(x.sim) }; });
fs.writeFileSync(path.join(docs, "difficulty.js"), "window.DIFFICULTY = " + JSON.stringify(out) + ";\n");
rows.forEach((x) => console.log(String(x.rank).padStart(2), x.name.padEnd(9), "niv", x.level, "traits", x.strokes, "angles", x.corners, "diag", x.angles, "sim", x.sim.toFixed(0)));
