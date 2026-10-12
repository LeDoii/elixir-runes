// Recognition benchmark: wobbly, rotated, rescaled copies of every rune must be recognised.
// Run from SiteRunes/ : node tools/test_recognition.js
const fs = require("fs");
const path = require("path");
const docs = path.join(__dirname, "..", "docs");
global.window = {};
eval(fs.readFileSync(path.join(docs, "data.js"), "utf8"));
const S = require(path.join(docs, "scoring.js"));
const { map, makeRng, hand } = require("./handsim.js");
const R = window.RUNES.runes;
const rnd = makeRng(5);

for (const [amp, rot] of [[0, 0], [5, 0.05], [8, 0.1]]) {
  let ok = 0, ok3 = 0, tot = 0;
  const bad = [];
  for (const r of R) {
    for (let t = 0; t < 4; t++) {
      const st = hand(r, rnd, amp, 0.6 + rnd() * 0.7, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, (rnd() - 0.5) * 2 * rot);
      const res = S.recognize(R, map, st, { align: true, t0: 9, t1: 40 });
      tot++;
      if (res[0].name === r.name) ok++; else bad.push(r.name + "->" + res[0].name);
      if (res.slice(0, 3).some((x) => x.name === r.name)) ok3++;
    }
  }
  console.log("amp", amp, "rot", rot, "top1", ok + "/" + tot, "top3", ok3, [...new Set(bad)].join(" "));
}
