// Compare recognition with and without the topology correction, and print each rune's topology.
// Run from SiteRunes/ : node tools/test_topology.js
const fs = require("fs");
const path = require("path");
const docs = path.join(__dirname, "..", "docs");
global.window = {};
eval(fs.readFileSync(path.join(docs, "data.js"), "utf8"));
const S = require(path.join(docs, "scoring.js"));
const { map, makeRng, hand } = require("./handsim.js");
const R = window.RUNES.runes;
console.log(R.map((r) => { const t = S.runeTopology(r); return r.name + ":" + t.shapes + "/" + t.loops; }).join(" "));

for (const [amp, rot] of [[5, 0.05], [8, 0.1], [12, 0.15]]) {
  for (const [label, o] of [["geometrie", { shapePenalty: 1, loopPenalty: 1 }], ["+topologie", {}]]) {
    const rnd = makeRng(99);
    let ok = 0, tot = 0;
    const bad = {};
    for (const r of R) {
      for (let t = 0; t < 10; t++) {
        const st = hand(r, rnd, amp, 0.6 + rnd() * 0.7, (rnd() - 0.5) * 80, (rnd() - 0.5) * 80, (rnd() - 0.5) * 2 * rot);
        const res = S.recognize(R, map, st, Object.assign({ align: true, t0: 9, t1: 40 }, o));
        tot++;
        if (res[0].name === r.name) ok++; else bad[r.name + "->" + res[0].name] = (bad[r.name + "->" + res[0].name] || 0) + 1;
      }
    }
    console.log("amp", amp, label.padEnd(11), ok + "/" + tot, JSON.stringify(bad));
  }
}
