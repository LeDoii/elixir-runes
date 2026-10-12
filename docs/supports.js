/* Supports de gravure : fond du support et effet du tracé (pyrogravure, creux, encre, fil, cristal).
 *
 * Les supports et leur stabilité viennent des notes sur les bindrunes (bois, pierre, métal stables ; os, défense,
 * papier, tissu instables ; cristal : amplifie la puissance). Le rendu visuel de chaque effet est une interprétation.
 */
(function (root) {
  "use strict";

  const SUPPORTS = [
    { id: "bois", label: "Bois", group: "Supports stables", style: "burn",
      note: "Pyrogravure : brûlure sombre avec léger halo roussi.", guide: ["#EAF2FF", 0.5], faint: ["#EAF2FF", 0.16] },
    { id: "pierre", label: "Pierre", group: "Supports stables", style: "carve",
      tone: { groove: "#4a4743", rim: "rgba(0,0,0,.5)", hi: "rgba(255,255,255,.45)", inner: "rgba(0,0,0,.35)" },
      note: "Gravure creusée dans la pierre, tracé ciselé aux bords clairs.", guide: ["#EAF2FF", 0.5], faint: ["#EAF2FF", 0.16] },
    { id: "cuivre", label: "Métal : cuivre ciré", group: "Supports stables", style: "carve",
      tone: { groove: "#6a3a1f", rim: "rgba(40,15,5,.55)", hi: "rgba(255,225,190,.6)", inner: "rgba(30,10,0,.4)" },
      note: "Gravure creusée dans le cuivre ciré.", guide: ["#3D5C8C", 0.45], faint: ["#3D5C8C", 0.15] },
    { id: "acier", label: "Métal : acier brossé", group: "Supports stables", style: "carve",
      tone: { groove: "#3b3e43", rim: "rgba(0,0,0,.55)", hi: "rgba(255,255,255,.7)", inner: "rgba(0,0,0,.4)" },
      note: "Gravure creusée dans l'acier brossé.", guide: ["#3D5C8C", 0.5], faint: ["#3D5C8C", 0.18] },
    { id: "os", label: "Os", group: "Supports instables", style: "carve",
      tone: { groove: "#5a3b22", rim: "rgba(60,35,15,.45)", hi: "rgba(255,255,245,.7)", inner: "rgba(40,20,5,.3)" },
      note: "Support instable. Gravure fine dans l'os, creux teinté de brun.", guide: ["#3D5C8C", 0.45], faint: ["#3D5C8C", 0.15] },
    { id: "defense", label: "Défense", group: "Supports instables", style: "carve",
      tone: { groove: "#4a2c16", rim: "rgba(60,30,10,.5)", hi: "rgba(255,250,230,.75)", inner: "rgba(40,18,0,.3)" },
      note: "Support instable. Gravure dans l'ivoire de la défense, creux ambré.", guide: ["#3D5C8C", 0.45], faint: ["#3D5C8C", 0.15] },
    { id: "papier", label: "Papier", group: "Supports instables", style: "ink",
      note: "Support instable. Tracé à l'encre, avec un léger bavage.", guide: ["#3D5C8C", 0.4], faint: ["#3D5C8C", 0.14] },
    { id: "tissu", label: "Tissu (habit)", group: "Supports instables", style: "stitch",
      note: "Support instable. Tracé en fil, comme un point de broderie. On peut graver sur un habit.", guide: ["#3D5C8C", 0.45], faint: ["#3D5C8C", 0.16] },
    { id: "cuir", label: "Cuir", group: "Supports instables", style: "carve",
      tone: { groove: "#24130a", rim: "rgba(18,8,0,.6)", hi: "rgba(255,226,180,.38)", inner: "rgba(12,4,0,.5)" },
      note: "Support instable. Gravure pressée et brunie dans le cuir : le tracé s'enfonce et fonce.", guide: ["#F3E6CF", 0.5], faint: ["#F3E6CF", 0.17] },
    { id: "cristal", label: "Cristal", group: "Amplification", style: "crystal",
      note: "Un cristal amplifie la puissance d'une bindrune. Gravure creusée, lumière prise dans le trait.", guide: ["#FFFFFF", 0.55], faint: ["#FFFFFF", 0.2] },
  ];
  const byId = (id) => SUPPORTS.find((s) => s.id === id) || SUPPORTS[0];
  const KEY = "runes-support";
  let current = "bois";
  try { current = byId(localStorage.getItem(KEY)).id; } catch (e) { /* stockage indisponible */ }
  const listeners = [];

  /* ------------------------------------------------------------------ fonds */
  const rng = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
  function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
  function grain(g, w, h, amp, seed) {
    const im = g.getImageData(0, 0, w, h), d = im.data, r = rng(seed);
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(im, 0, 0);
  }
  function blobs(g, w, h, n, rmin, rmax, colors, seed) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin), c = colors[Math.floor(r() * colors.length)];
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, c); gr.addColorStop(1, c.replace(/[\d.]+\)$/, "0)"));
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  function vignette(g, w, h, color) {
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, color);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }

  const PLATES = {
    bois(g, w, h, k) {
      const gr = g.createLinearGradient(0, 0, w, h * 0.4);
      gr.addColorStop(0, "#c9a169"); gr.addColorStop(0.5, "#b88c55"); gr.addColorStop(1, "#a97d47");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = rng(21);
      for (let y = -10; y < h + 10; y += 2.6 * k) {                       // fil du bois
        g.beginPath();
        const ph = r() * 6, a = (2 + r() * 4) * k;
        for (let x = 0; x <= w; x += 10 * k) g.lineTo(x, y + Math.sin(x / (90 * k) + y / (37 * k) + ph) * a + Math.sin(x / (23 * k) + ph) * 0.8 * k);
        g.strokeStyle = "rgba(70,40,12," + (0.04 + r() * 0.14) + ")"; g.lineWidth = (0.5 + r() * 1.3) * k; g.stroke();
      }
      for (let n = 0; n < 2; n++) {                                         // nœuds
        const cx = r() * w, cy = r() * h;
        for (let i = 1; i < 7; i++) {
          g.beginPath(); g.ellipse(cx, cy, i * 9 * k, i * 4.5 * k, 0, 0, Math.PI * 2);
          g.strokeStyle = "rgba(70,40,12," + (0.3 - i * 0.03) + ")"; g.lineWidth = 1.2 * k; g.stroke();
        }
      }
      grain(g, w, h, 14, 5); vignette(g, w, h, "rgba(50,25,5,.22)");
    },
    pierre(g, w, h, k) {
      g.fillStyle = "#8b8883"; g.fillRect(0, 0, w, h);
      blobs(g, w, h, 70, 40 * k, 170 * k, ["rgba(255,255,255,.13)", "rgba(40,38,35,.13)", "rgba(120,105,85,.1)"], 3);
      const r = rng(8);
      for (let i = 0; i < 7000 * k * k; i++) {                              // grains de roche
        g.fillStyle = ["rgba(255,255,255,.28)", "rgba(30,30,30,.28)", "rgba(185,168,140,.3)"][Math.floor(r() * 3)];
        g.fillRect(r() * w, r() * h, (0.6 + r() * 1.6) * k, (0.6 + r() * 1.6) * k);
      }
      grain(g, w, h, 22, 6); vignette(g, w, h, "rgba(20,20,20,.25)");
    },
    cuivre(g, w, h, k) {
      const gr = g.createRadialGradient(w * 0.38, h * 0.32, 40 * k, w / 2, h / 2, Math.max(w, h) * 0.8);
      gr.addColorStop(0, "#E2A982"); gr.addColorStop(0.55, "#CD8F66"); gr.addColorStop(1, "#A9704C");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = rng(11);
      for (let i = 0; i < 1400 * k; i++) { g.fillStyle = "rgba(" + (r() > 0.5 ? "255,255,255" : "0,0,0") + ",.05)"; g.fillRect(r() * w, r() * h, (40 + r() * 200) * k, k); }
      grain(g, w, h, 8, 4);
    },
    acier(g, w, h, k) {
      const gr = g.createLinearGradient(0, 0, w, h);
      [[0, "#8f949a"], [0.3, "#c9ced3"], [0.55, "#8a8f95"], [0.8, "#b9bec3"], [1, "#868b91"]].forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = rng(13);
      for (let i = 0; i < 2600 * k; i++) {                                  // brossage
        const y = r() * h, x = r() * w;
        g.fillStyle = "rgba(" + (r() > 0.5 ? "255,255,255" : "0,0,0") + "," + (0.04 + r() * 0.07) + ")"; g.fillRect(x, y, (60 + r() * 300) * k, 0.8 * k);
      }
      grain(g, w, h, 10, 7);
    },
    os(g, w, h, k) {
      g.fillStyle = "#e8dfc6"; g.fillRect(0, 0, w, h);
      blobs(g, w, h, 40, 50 * k, 160 * k, ["rgba(190,160,100,.13)", "rgba(255,255,255,.14)"], 5);
      const r = rng(15);
      for (let i = 0; i < 70; i++) {                                         // fibres
        g.beginPath(); const x = r() * w; g.moveTo(x, 0);
        for (let y = 0; y <= h; y += 20 * k) g.lineTo(x + Math.sin(y / (60 * k) + i) * 6 * k, y);
        g.strokeStyle = "rgba(140,115,75," + (0.05 + r() * 0.1) + ")"; g.lineWidth = (0.6 + r() * 1.2) * k; g.stroke();
      }
      for (let i = 0; i < 2600 * k * k; i++) { g.fillStyle = "rgba(90,65,35,.3)"; g.beginPath(); g.arc(r() * w, r() * h, (0.5 + r()) * k, 0, 6.3); g.fill(); }
      grain(g, w, h, 9, 9); vignette(g, w, h, "rgba(110,80,40,.2)");
    },
    defense(g, w, h, k) {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, "#f1e6c7"); gr.addColorStop(1, "#d6c092"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = rng(17);
      for (let i = 0; i < 70; i++) {                                         // anneaux de croissance
        g.beginPath(); const rad = (60 + i * 14) * k;
        g.arc(-w * 0.35, h * 1.3, rad, -Math.PI * 0.45, -Math.PI * 0.05);
        g.strokeStyle = "rgba(125,92,45," + (0.06 + r() * 0.16) + ")"; g.lineWidth = (0.6 + r() * 1.8) * k; g.stroke();
      }
      for (let i = 0; i < 5; i++) {                                          // fines fissures
        g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y);
        for (let s = 0; s < 8; s++) { x += (r() - 0.3) * 30 * k; y += (r() - 0.5) * 18 * k; g.lineTo(x, y); }
        g.strokeStyle = "rgba(90,60,25,.25)"; g.lineWidth = 0.8 * k; g.stroke();
      }
      grain(g, w, h, 8, 10); vignette(g, w, h, "rgba(120,80,30,.22)");
    },
    papier(g, w, h, k) {
      g.fillStyle = "#ecdfc2"; g.fillRect(0, 0, w, h);
      blobs(g, w, h, 60, 40 * k, 150 * k, ["rgba(165,120,55,.1)", "rgba(255,250,235,.15)"], 19);
      const r = rng(23);
      for (let i = 0; i < 1800 * k; i++) {                                   // fibres
        const x = r() * w, y = r() * h, a = r() * 6.3, l = (4 + r() * 12) * k;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.strokeStyle = "rgba(120,90,50," + (0.05 + r() * 0.08) + ")"; g.lineWidth = 0.7 * k; g.stroke();
      }
      grain(g, w, h, 8, 12); vignette(g, w, h, "rgba(130,85,30,.38)");
    },
    tissu(g, w, h, k) {
      g.fillStyle = "#cbbd9f"; g.fillRect(0, 0, w, h);
      const r = rng(29), st = 3.2 * k;
      for (let x = 0; x < w; x += st) { g.fillStyle = "rgba(" + (r() > 0.5 ? "255,250,235" : "70,55,30") + "," + (0.05 + r() * 0.12) + ")"; g.fillRect(x, 0, st * 0.55, h); }
      for (let y = 0; y < h; y += st) { g.fillStyle = "rgba(" + (r() > 0.5 ? "255,250,235" : "70,55,30") + "," + (0.05 + r() * 0.12) + ")"; g.fillRect(0, y, w, st * 0.55); }
      for (let i = 0; i < 90; i++) {                                         // nœuds de lin
        g.fillStyle = "rgba(90,70,40,.18)"; g.fillRect(r() * w, r() * h, (8 + r() * 24) * k, 1.2 * k);
      }
      blobs(g, w, h, 20, 80 * k, 220 * k, ["rgba(60,45,25,.07)", "rgba(255,250,235,.08)"], 31);
      grain(g, w, h, 16, 14); vignette(g, w, h, "rgba(60,40,15,.2)");
    },
    cuir(g, w, h, k) {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, "#94603a"); gr.addColorStop(0.5, "#7d4e2c"); gr.addColorStop(1, "#6a4123");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      blobs(g, w, h, 55, 50 * k, 190 * k, ["rgba(40,18,6,.16)", "rgba(210,150,95,.12)"], 41);       // marbrure de la peau
      const r = rng(43);
      for (let i = 0; i < 5200 * k * k; i++) {                              // grain : petites alvéoles
        const x = r() * w, y = r() * h, s = (1.2 + r() * 2.4) * k;
        g.beginPath(); g.ellipse(x, y, s, s * (0.6 + r() * 0.5), r() * 3.1, 0, 6.3);
        g.strokeStyle = "rgba(30,12,2," + (0.12 + r() * 0.2) + ")"; g.lineWidth = 0.7 * k; g.stroke();
      }
      for (let i = 0; i < 14; i++) {                                         // plis fins
        g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y);
        for (let s = 0; s < 9; s++) { x += (r() - 0.5) * 70 * k; y += (r() - 0.5) * 40 * k; g.lineTo(x, y); }
        g.strokeStyle = "rgba(25,10,0," + (0.1 + r() * 0.12) + ")"; g.lineWidth = (0.7 + r()) * k; g.stroke();
      }
      grain(g, w, h, 12, 18); vignette(g, w, h, "rgba(30,12,2,.4)");
    },
    cristal(g, w, h, k) {
      const gr = g.createLinearGradient(0, 0, w, h);
      [[0, "#5d77b3"], [0.45, "#a6d3ea"], [0.7, "#8aa9d8"], [1, "#7a6db7"]].forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = rng(37);
      for (let i = 0; i < 22; i++) {                                         // facettes
        g.beginPath(); const x = r() * w, y = r() * h;
        g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 420 * k, y + (r() - 0.5) * 420 * k); g.lineTo(x + (r() - 0.5) * 420 * k, y + (r() - 0.5) * 420 * k);
        g.closePath(); g.fillStyle = r() > 0.5 ? "rgba(255,255,255," + (0.05 + r() * 0.13) + ")" : "rgba(20,30,90," + (0.05 + r() * 0.1) + ")"; g.fill();
      }
      for (let i = 0; i < 26; i++) {                                         // éclats
        const x = r() * w, y = r() * h, s = (3 + r() * 7) * k;
        g.strokeStyle = "rgba(255,255,255,.7)"; g.lineWidth = 1.1 * k; g.beginPath();
        g.moveTo(x - s, y); g.lineTo(x + s, y); g.moveTo(x, y - s); g.lineTo(x, y + s); g.stroke();
      }
      grain(g, w, h, 6, 16); vignette(g, w, h, "rgba(10,15,50,.3)");
    },
  };

  const plateCache = {};
  function plate(id, w, h) {
    const key = id + w + "x" + h;
    if (plateCache[key]) return plateCache[key];
    const [c, g] = canvas(w, h);
    PLATES[id](g, w, h, w / 720);
    return (plateCache[key] = c);
  }

  /* ------------------------------------------------------------------ effets du tracé */
  function trace(g, paths) {
    g.beginPath();
    paths.forEach((p) => p.forEach((pt, i) => (i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]))));
    g.stroke();
  }
  function pass(g, paths, width, color, dx, dy, extra) {
    g.save();
    if (dx || dy) g.translate(dx, dy);
    g.strokeStyle = color; g.lineWidth = width;
    if (extra) extra(g);
    trace(g, paths);
    g.restore();
  }

  const EFFECTS = {
    burn(g, paths, w) {                                                   // pyrogravure : cœur brûlé + halo roussi
      pass(g, paths, w + 6, "rgba(120,55,15,.35)", 0, 0, (c) => { c.shadowColor = "rgba(150,70,15,.6)"; c.shadowBlur = 9; });
      pass(g, paths, w, "#2a140a");
      pass(g, paths, Math.max(1, w * 0.25), "rgba(255,170,90,.18)");
    },
    carve(g, paths, w, s) {                                               // creux : paroi ombrée, lèvre éclairée
      const t = s.tone;
      pass(g, paths, w + 1.6, t.hi, 1.3, 1.3);
      pass(g, paths, w + 1.6, t.rim, -1.1, -1.1);
      pass(g, paths, w, t.groove);
      pass(g, paths, w * 0.55, t.inner, -w * 0.08, -w * 0.08);
    },
    ink(g, paths, w) {                                                    // encre sur papier
      pass(g, paths, w + 4, "rgba(60,40,15,.14)", 0, 0, (c) => { c.shadowColor = "rgba(40,25,10,.5)"; c.shadowBlur = 5; });
      pass(g, paths, w, "#1c1814");
      pass(g, paths, w * 0.5, "rgba(0,0,0,.35)");
    },
    stitch(g, paths, w) {                                                 // fil : points serrés, perpendiculaires au trait
      const d = Math.max(1.6, w * 0.16);
      pass(g, paths, w + 2, "rgba(0,0,0,.28)", 1, 1.5);
      pass(g, paths, w, "#4a2c22", 0, 0, (c) => { c.setLineDash([d * 1.5, d * 0.5]); });
      pass(g, paths, w * 0.7, "rgba(255,225,200,.28)", 0, 0, (c) => { c.setLineDash([d * 0.5, d * 1.5]); c.lineDashOffset = -d * 0.4; });
    },
    crystal(g, paths, w) {                                                // creux avec lumière prise dans le trait
      pass(g, paths, w + 1.6, "rgba(255,255,255,.65)", 1.2, 1.2);
      pass(g, paths, w + 1.6, "rgba(10,20,70,.5)", -1, -1);
      pass(g, paths, w + 3, "rgba(200,240,255,.3)", 0, 0, (c) => { c.shadowColor = "rgba(180,235,255,.95)"; c.shadowBlur = 14; });
      pass(g, paths, w, "rgba(30,48,110,.88)");
      pass(g, paths, Math.max(1.2, w * 0.24), "rgba(220,248,255,.92)", 0, 0, (c) => { c.shadowColor = "rgba(200,245,255,.9)"; c.shadowBlur = 6; });
    },
  };

  /**
   * Grave des tracés sur le support. Tous les tracés passent ensemble à chaque étape, pour que les croisements
   * forment un seul creux.
   * @param paths  tableau de tracés, chacun = tableau de [x, y] (coordonnées du contexte)
   * @param width  largeur du trait
   * @param opts   { cap: "butt" | "round" }
   */
  function engrave(g, paths, width, id, opts) {
    const s = byId(id), cap = (opts && opts.cap) || "round";
    g.save();
    g.lineCap = cap; g.lineJoin = cap === "butt" ? "miter" : "round"; g.miterLimit = 3;
    EFFECTS[s.style](g, paths, width, s);
    g.restore();
  }

  /* ------------------------------------------------------------------ sélection partagée */
  function set(id) {
    current = byId(id).id;
    try { localStorage.setItem(KEY, current); } catch (e) { /* ignoré */ }
    listeners.forEach((fn) => fn(current));
  }
  function bindSelect(sel, noteEl) {
    const groups = {};
    SUPPORTS.forEach((s) => { (groups[s.group] = groups[s.group] || []).push(s); });
    sel.innerHTML = Object.keys(groups).map((gn) =>
      '<optgroup label="' + gn + '">' + groups[gn].map((s) => '<option value="' + s.id + '">' + s.label + "</option>").join("") + "</optgroup>").join("");
    const sync = () => {
      sel.value = current;
      if (noteEl) noteEl.textContent = byId(current).note + " Un être vivant ne peut pas servir de support.";
    };
    sel.addEventListener("change", () => set(sel.value));
    listeners.push(sync);
    sync();
  }

  root.Supports = {
    list: SUPPORTS, get: byId, current: () => current, set, bindSelect, plate, engrave,
    onChange: (fn) => listeners.push(fn),
    guide: (faint) => { const s = byId(current), v = faint ? s.faint : s.guide; return { color: v[0], alpha: v[1] }; },
  };
})(window);
