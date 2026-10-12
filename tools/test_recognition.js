// Recognition benchmark: wobbly, rotated, rescaled copies of every rune must be recognised.
// Run from SiteRunes/ : node tools/test_recognition.js
const fs = require("fs");
const path = require("path");
const docs = path.join(__dirname, "..", "docs");
global.window = {};
eval(fs.readFileSync(path.join(docs, "data.js"), "utf8"));
const S = require(path.join(docs, "scoring.js"));
const R = window.RUNES.runes;

let seed = 5;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const map = (p) => [(p[0] - 256) * 1.3 + 360, (p[1] - 256) * 1.3 + 360];

function hand(rune, amp, sc, dx, dy, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return rune.strokes.map((st) => {
    const m = st.pts.map(map), o = [];
    for (let i = 0; i < m.length - 1; i++) {
      const n = Math.max(2, Math.round(Math.hypot(m[i + 1][0] - m[i][0], m[i + 1][1] - m[i][1]) / 6));
      for (let k = 0; k < n; k++) { const t = k / n; o.push([m[i][0] + (m[i + 1][0] - m[i][0]) * t, m[i][1] + (m[i + 1][1] - m[i][1]) * t]); }
    }
    o.push(m[m.length - 1]);
    const ph = rnd() * 6, ph2 = rnd() * 6;
    return o.map(([x, y], i) => {
      x -= 360; y -= 360;
      return [(x * c - y * s) * sc + 360 + dx + amp * Math.sin(i / 5 + ph), (x * s + y * c) * sc + 360 + dy + amp * Math.cos(i / 6 + ph2)];
    });
  });
}

for (const [amp, rot] of [[0, 0], [5, 0.05], [8, 0.1]]) {
  let ok = 0, ok3 = 0, tot = 0;
  const bad = [];
  for (const r of R) {
    for (let t = 0; t < 4; t++) {
      const st = hand(r, amp, 0.6 + rnd() * 0.7, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, (rnd() - 0.5) * 2 * rot);
      const res = S.recognize(R, map, st, { align: true, t0: 9, t1: 40 });
      tot++;
      if (res[0].name === r.name) ok++; else bad.push(r.name + "->" + res[0].name);
      if (res.slice(0, 3).some((x) => x.name === r.name)) ok3++;
    }
  }
  console.log("amp", amp, "rot", rot, "top1", ok + "/" + tot, "top3", ok3, [...new Set(bad)].join(" "));
}
