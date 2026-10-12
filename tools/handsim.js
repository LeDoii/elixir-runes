// Simulated hand-drawn copies of a rune (shared by the recognition test and the difficulty ranking).
const MAP_SCALE = 1.3;
const map = (p) => [(p[0] - 256) * MAP_SCALE + 360, (p[1] - 256) * MAP_SCALE + 360];

function makeRng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Wobbly, rotated, rescaled and shifted copy of a rune, as canvas strokes. */
function hand(rune, rnd, amp, sc, dx, dy, rot) {
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
module.exports = { map, makeRng, hand };
