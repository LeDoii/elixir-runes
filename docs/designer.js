/* Onglet Bindrune (concepteur) : plusieurs runes sur une plaque, déplaçables, avec points d'ancrage magnétiques,
 * liaisons entre runes (ensembles), cadrage et centrage. */
(function () {
  "use strict";
  const D = window.RUNES;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const VW = 800, VH = 640;                                  // viewBox de la plaque (échelle 1 : la grille de la rune)
  const SNAP_R = 14;                                         // portée du magnétisme (unités de la plaque)
  const LINK_R = 6;                                          // écart maximal entre deux points pour les lier
  const MARGIN = 10;                                         // marge du cadre : une rune ne dépasse jamais
  const HW = D.strokeWidth / 2;
  const LINK_COLOR = "#12A26A";                              // points d'ancrage de liaison
  const COLORS = Bindrunes.COLORS;
  const byName = (n) => D.runes.find((r) => r.name === n);
  const ALIGN_R = 5;                                         // portée des repères d'alignement (pixels de l'écran)

  const svg = $("dz");
  let items = [], links = [], nextId = 1, snapMark = null, drag = null, marquee = null, guides = [];
  let sel = new Set();                                       // identifiants des runes sélectionnées (une, ou plusieurs avec le cadre de sélection)
  const advanced = () => $("dz-adv").checked;                 // mode avancé : jusqu'à 6 runes, une même rune plusieurs fois
  const maxRunes = () => (advanced() ? 6 : 4);
  const hasDuplicates = () => new Set(items.map((i) => i.name)).size < items.length;
  const magnet = () => $("dz-magnet").checked;
  /* ---- annuler / rétablir : historique de la composition (runes, positions, aimants, liaisons) */
  const past = [], future = [];
  let nudgeTimer = null;
  const stateJson = () => JSON.stringify({ items, links, nextId });
  function refreshHistory() { $("dz-undo").disabled = !past.length; $("dz-redo").disabled = !future.length; renderHistory(); }
  /** À appeler juste avant de modifier la composition ; label dit ce qui va changer (panneau Historique). */
  function record(label) { past.push({ s: stateJson(), label: label || "Modification" }); if (past.length > 100) past.shift(); future.length = 0; refreshHistory(); }
  function loadState(json) {
    const s = JSON.parse(json);
    items = s.items; links = s.links; nextId = Math.max(nextId, s.nextId);
    sel = new Set([...sel].filter((id) => itemById(id)));
    snapMark = null;
  }
  function undo() { if (!past.length) return; const p = past.pop(); future.push({ s: stateJson(), label: p.label }); loadState(p.s); say("Annulé : " + p.label + "."); render(); }
  function redo() { if (!future.length) return; const f = future.pop(); past.push({ s: stateJson(), label: f.label }); loadState(f.s); say("Rétabli : " + f.label + "."); render(); }
  /** Revient à l'état obtenu après n actions (0 : état initial). */
  function goTo(n) {
    while (past.length > n) { const p = past.pop(); future.push({ s: stateJson(), label: p.label }); loadState(p.s); }
    while (past.length < n && future.length) { const f = future.pop(); past.push({ s: stateJson(), label: f.label }); loadState(f.s); }
    say(""); render();
  }
  function renderHistory() {
    const ol = $("dz-history");
    if (!ol) return;
    const rows = [{ label: "État initial", n: 0 }].concat(past.map((p, i) => ({ label: p.label, n: i + 1 })), future.slice().reverse().map((f, i) => ({ label: f.label, n: past.length + i + 1, future: true })));
    ol.innerHTML = "";
    rows.forEach((r) => {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = r.label;
      if (r.future) li.className = "future";
      if (r.n === past.length) { li.setAttribute("aria-current", "true"); }
      b.addEventListener("click", () => goTo(r.n));
      li.appendChild(b); ol.appendChild(li);
    });
    $("dz-hist-n").textContent = past.length ? past.length + (past.length > 1 ? " actions" : " action") : "";
    const cur = ol.querySelector('[aria-current="true"]');
    if (cur && ol.scrollHeight > ol.clientHeight) ol.scrollTop = cur.offsetTop - ol.clientHeight + cur.offsetHeight + 4;
  }

  const abs = (it) => Geom.anchors(it.name, it.f, it.k).map((p) => [p[0] + it.x, p[1] + it.y]);
  const itemById = (id) => items.find((i) => i.id === id);
  const selItems = () => items.filter((i) => sel.has(i.id));
  /** Les runes sélectionnées et celles qui leur sont liées : ce qui bouge ensemble. */
  const selMembers = () => {
    const ids = new Set();
    selItems().forEach((i) => groupOf(i).forEach((m) => ids.add(m.id)));
    return items.filter((i) => ids.has(i.id));
  };

  /* ---- ensembles : runes liées par des points d'ancrage de liaison */
  function groupOf(it) {
    const ids = new Set([it.id]);
    for (let grew = true; grew;) {
      grew = false;
      links.forEach((l) => { if (ids.has(l.a) !== ids.has(l.b)) { ids.add(l.a); ids.add(l.b); grew = true; } });
    }
    return items.filter((i) => ids.has(i.id));
  }
  const linkedPoints = (it) => {
    const s = new Set();
    links.forEach((l) => { if (l.a === it.id) s.add(l.pa); if (l.b === it.id) s.add(l.pb); });
    return s;
  };
  const groups = () => {                                     // tous les ensembles (une rune seule en est un)
    const seen = new Set(), out = [];
    items.forEach((i) => { if (!seen.has(i.id)) { const g = groupOf(i); g.forEach((m) => seen.add(m.id)); out.push(g); } });
    return out;
  };

  /* ---- cadre : emprise des runes, maintien dans la plaque, centrage */
  let boxCache = {};
  function runeBox(name, f, k) {                             // emprise de la rune (épaisseur du trait comprise), dans son repère
    const kk = k || 1, key = name + "|" + (f || 0) + "|" + kk;
    if (boxCache[key]) return boxCache[key];
    if (Object.keys(boxCache).length > 500) boxCache = {};
    const all = Geom.strokes(name, f, kk).flatMap((s) => s.pts), pad = HW * kk;
    return (boxCache[key] = [Math.min(...all.map((p) => p[0])) - pad, Math.min(...all.map((p) => p[1])) - pad, Math.max(...all.map((p) => p[0])) + pad, Math.max(...all.map((p) => p[1])) + pad]);
  }
  function boundsOf(members) {
    const bs = members.map((m) => { const b = runeBox(m.name, m.f, m.k); return [b[0] + m.x, b[1] + m.y, b[2] + m.x, b[3] + m.y]; });
    return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
  }
  /** Ramène l'ensemble dans le cadre ; s'il est plus grand que le cadre sur un axe, il est centré sur cet axe. */
  function fit(members) {
    if (!members.length) return;
    const [x0, y0, x1, y1] = boundsOf(members);
    // le cadre visible, ramené dans le repère des runes : plus la bindrune est grande, plus il est petit
    const axis = (lo, hi, size) => { const mid = size / 2, half = size / 2 - MARGIN, a = mid - half, b = mid + half; return hi - lo >= b - a ? mid - (lo + hi) / 2 : lo < a ? a - lo : hi > b ? b - hi : 0; };
    const dx = axis(x0, x1, VW), dy = axis(y0, y1, VH);
    members.forEach((m) => { m.x += dx; m.y += dy; });
  }
  function centerOn(members) {
    if (!members.length) return;
    const [x0, y0, x1, y1] = boundsOf(members), dx = VW / 2 - (x0 + x1) / 2, dy = VH / 2 - (y0 + y1) / 2;
    members.forEach((m) => { m.x += dx; m.y += dy; });
  }
  const fitAll = () => groups().forEach(fit);

  /* ---- magnétisme : l'ensemble déplacé s'accroche aux points d'ancrage des autres runes */
  function snapGroup(members) {
    snapMark = null;
    if (!magnet()) return;
    const active = members.filter((m) => m.snap), others = items.filter((o) => !members.includes(o) && o.snap);
    if (!active.length || !others.length) return;
    let best = null;
    active.forEach((m) => abs(m).forEach((a) => others.forEach((o) => abs(o).forEach((b) => {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= SNAP_R && (!best || d < best.d)) best = { d, dx: b[0] - a[0], dy: b[1] - a[1], at: b };
    }))));
    if (best) { members.forEach((m) => { m.x += best.dx; m.y += best.dy; }); snapMark = best.at; }
  }
  /** Place un ensemble : dans le cadre, aimanté, puis encore dans le cadre (le cadre l'emporte). */
  function settle(members) { fit(members); snapGroup(members); fit(members); }

  /* ---- repères d'alignement : bords et centres de l'ensemble déplacé contre ceux des autres runes et le centre de la plaque */
  function align(members) {
    guides = [];
    if (!$("dz-align").checked || snapMark || !items.length) return;
    const others = items.filter((o) => !members.includes(o));
    const [x0, y0, x1, y1] = boundsOf(members), tol = ALIGN_R;
    const mine = { x: [x0, (x0 + x1) / 2, x1], y: [y0, (y0 + y1) / 2, y1] };
    const targets = { x: [VW / 2], y: [VH / 2] };
    others.forEach((o) => { const [a, b, c, d] = boundsOf([o]); targets.x.push(a, (a + c) / 2, c); targets.y.push(b, (b + d) / 2, d); });
    const shift = { x: 0, y: 0 };
    ["x", "y"].forEach((ax) => {
      let best = null;
      mine[ax].forEach((m) => targets[ax].forEach((t) => { const dlt = t - m; if (Math.abs(dlt) <= tol && (!best || Math.abs(dlt) < Math.abs(best.dlt))) best = { dlt, t }; }));
      if (best) { shift[ax] = best.dlt; guides.push({ axis: ax, v: best.t }); }
    });
    if (shift.x || shift.y) members.forEach((m) => { m.x += shift.x; m.y += shift.y; });
  }
  const locked = (members) => members.find((m) => m.locked);
  const lockMsg = (m) => say("« " + m.name + " » est verrouillée : décoche « Verrou » dans les calques pour la modifier.");

  /* ---- rendu */
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }
  /* ---- fond et tracé : dessinés sur le canevas, avec l'effet du support */
  const cv = $("dz-canvas"), ctx = cv.getContext("2d"), RES = cv.width / VW;
  /**
   * Peint la composition sur g. tf = [échelle x, échelle y, décalage x, décalage y] (plaque -> pixels) ; avecPlaque : fond du support (taille pw x ph).
   * Une gravure par échelle de rune : l'épaisseur du trait suit celle de la rune.
   */
  function paint(g, tf, avecPlaque, pw, ph) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (avecPlaque) g.drawImage(Supports.plate(Supports.current(), pw, ph), 0, 0);
    g.setTransform(tf[0], 0, 0, tf[1], tf[2], tf[3]);
    const placed = items.map((it) => ({ it, paths: Geom.placed(it).map((s) => s.pts) }));
    if ($("dz-strata").checked) {
      g.save(); g.lineCap = "butt"; g.lineJoin = "miter"; g.miterLimit = 3;
      placed.forEach(({ it, paths }) => {
        g.lineWidth = D.strokeWidth * (it.k || 1);
        g.strokeStyle = it.color; g.globalAlpha = 0.88;
        g.beginPath();
        paths.forEach((p) => p.forEach((pt, i) => (i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1]))));
        g.stroke();
      });
      g.restore();
    } else if (placed.length) {
      const byK = {};
      placed.forEach(({ it, paths }) => { (byK[it.k || 1] = byK[it.k || 1] || []).push(...paths); });
      Object.keys(byK).forEach((k) => Supports.engrave(g, byK[k], D.strokeWidth * Number(k), Supports.current(), { cap: "butt" }));
    }
  }
  const drawCanvas = () => paint(ctx, [RES, RES, 0, 0], true, cv.width, cv.height);

  /* ---- rendu : le SVG ne porte que l'interaction (zones de prise, ancrages, sélection) */
  function selectionRect(gr, stroke, extra, k) {
    const kk = k || 1, [bx0, by0, bx1, by1] = D.bbox, [cx, cy] = Geom.center();
    const x0 = cx + (bx0 - cx) * kk, y0 = cy + (by0 - cy) * kk, x1 = cx + (bx1 - cx) * kk, y1 = cy + (by1 - cy) * kk;
    el("rect", Object.assign({ x: x0 - 22, y: y0 - 14, width: x1 - x0 + 44, height: y1 - y0 + 28, fill: "none", stroke, "stroke-dasharray": "6 5", rx: 4, class: "ui", "pointer-events": "none" }, extra), gr);
  }
  /** Poignées de la sélection : coins pour redimensionner (autour du coin opposé), ⇅ et ⇄ pour les miroirs. */
  function drawHandles(world) {
    const members = selMembers();
    if (!members.length) return;
    const [x0, y0, x1, y1] = boundsOf(members), pad = 8, X0 = x0 - pad, Y0 = y0 - pad, X1 = x1 + pad, Y1 = y1 + pad, mx = (X0 + X1) / 2, my = (Y0 + Y1) / 2;
    el("rect", { x: X0, y: Y0, width: X1 - X0, height: Y1 - Y0, fill: "none", stroke: "#e0924f", "stroke-width": 1.2, "stroke-dasharray": "4 4", class: "ui", "pointer-events": "none" }, world);
    [["nw", X0, Y0, "nwse-resize"], ["ne", X1, Y0, "nesw-resize"], ["sw", X0, Y1, "nesw-resize"], ["se", X1, Y1, "nwse-resize"]].forEach(([h, x, y, cur]) =>
      el("rect", { x: x - 5, y: y - 5, width: 10, height: 10, fill: "#fff", stroke: "#20201E", "stroke-width": 1.4, class: "ui", "data-h": h, style: "cursor:" + cur }, world));
    [["mv", mx, Y0 - 24, "⇅", "Miroir vertical"], ["mh", X0 - 24, my, "⇄", "Miroir horizontal"]].forEach(([h, x, y, glyph, tip]) => {
      const c = el("circle", { cx: x, cy: y, r: 11, fill: "#fff", stroke: "#20201E", "stroke-width": 1.4, class: "ui", "data-h": h, style: "cursor:pointer" }, world);
      const t = document.createElementNS(NS, "title"); t.textContent = tip; c.appendChild(t);
      const tx = el("text", { x, y, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 14, fill: "#20201E", "pointer-events": "none" }, world);
      tx.textContent = glyph;
    });
  }
  let resize = null;
  function startHandle(e, h) {
    if (h === "mv" || h === "mh") { mirrorSel(h === "mv" ? "v" : "h"); return; }
    const members = selMembers();
    if (!members.length) return;
    if (locked(members)) { lockMsg(locked(members)); return; }
    const [x0, y0, x1, y1] = boundsOf(members), corner = { nw: [x0, y0], ne: [x1, y0], sw: [x0, y1], se: [x1, y1] }, opp = corner[{ nw: "se", ne: "sw", sw: "ne", se: "nw" }[h]], c0 = corner[h];
    resize = { members, starts: members.map((m) => ({ x: m.x, y: m.y, k: m.k || 1 })), opp, c0, len2: (c0[0] - opp[0]) ** 2 + (c0[1] - opp[1]) ** 2, recorded: false };
    svg.setPointerCapture(e.pointerId);
  }
  function moveHandle(e) {
    const [px, py] = svgPoint(e), { opp, c0, len2, members, starts } = resize;
    const f = Math.max(0.05, ((px - opp[0]) * (c0[0] - opp[0]) + (py - opp[1]) * (c0[1] - opp[1])) / len2);
    if (!resize.recorded) { record("Redimensionnement"); resize.recorded = true; }
    members.forEach((m, i) => { m.x = starts[i].x; m.y = starts[i].y; m.k = starts[i].k; });
    Geom.scaleAbout(members, f, opp[0], opp[1]);
    fit(members);
    say("Taille : " + Math.round((members[0].k || 1) * 100) + " %");
    render();
  }

  function render() {
    drawCanvas();
    svg.innerHTML = "";
    el("rect", { width: VW, height: VH, fill: "transparent", id: "dz-bg" }, svg);
    const grp = selMembers();
    const world = el("g", { id: "dz-world" }, svg);
    items.forEach((it) => {
      const gr = el("g", { transform: "translate(" + it.x + " " + it.y + ")", "data-id": it.id, style: "cursor:" + (it.locked ? "not-allowed" : drag && drag.it === it ? "grabbing" : "grab") }, world);
      Geom.strokes(it.name, it.f, it.k).forEach((s) => {
        el("polyline", { points: s.pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "transparent", "stroke-width": 34, "pointer-events": "stroke", class: "ui" }, gr);
      });
      if (sel.has(it.id)) {
        selectionRect(gr, "#fff", { "stroke-width": 2 }, it.k);
        selectionRect(gr, "#20201E", { "stroke-width": 1.4, "stroke-dashoffset": 5 }, it.k);
      } else if (grp.includes(it)) {
        selectionRect(gr, LINK_COLOR, { "stroke-width": 1.6 }, it.k);
      }
      const linked = linkedPoints(it);
      Geom.anchors(it.name, it.f, it.k).forEach((a, pi) => {
        const isLink = linked.has(pi);
        if (!isLink && !(magnet() && it.snap)) return;
        el("circle", { cx: a[0], cy: a[1], r: 10, fill: "transparent", class: "ui", "data-pt": pi, style: "cursor:pointer" }, gr);   // zone de clic
        el("circle", { cx: a[0], cy: a[1], r: isLink ? 7 : 5, fill: isLink ? LINK_COLOR : "#fff", stroke: isLink ? "#fff" : "#20201E", "stroke-width": isLink ? 2.4 : 1.8, class: "ui", "pointer-events": "none" }, gr);
      });
    });
    if (activeTool() === "select" && sel.size && !(drag && drag.moved) && !(marquee && marquee.moved)) drawHandles(world);
    if (marquee && marquee.moved) {
      const m = marqueeRect();
      el("rect", { x: m[0], y: m[1], width: m[2] - m[0], height: m[3] - m[1], class: "marquee" }, world);
    }
    guides.forEach((g) => {                                  // repères d'alignement : ligne sur toute la plaque visible
      const span = Math.max(VW, VH), a = g.axis === "x" ? { x1: g.v, x2: g.v, y1: VH / 2 - span, y2: VH / 2 + span } : { x1: VW / 2 - span, x2: VW / 2 + span, y1: g.v, y2: g.v };
      el("line", Object.assign({ stroke: "#fff", "stroke-width": 3, class: "ui", "pointer-events": "none" }, a), world);
      el("line", Object.assign({ stroke: "#A4551F", "stroke-width": 1.4, "stroke-dasharray": "6 5", class: "ui", "pointer-events": "none" }, a), world);
    });
    if (snapMark) {
      el("circle", { cx: snapMark[0], cy: snapMark[1], r: 13, fill: "none", stroke: "#fff", "stroke-width": 3, class: "ui", "pointer-events": "none" }, world);
      el("circle", { cx: snapMark[0], cy: snapMark[1], r: 13, fill: "none", stroke: "#2a140a", "stroke-width": 1.4, class: "ui", "pointer-events": "none" }, world);
    }
    syncSize();
    scheduleRulers();
    scheduleDraft();
    renderList();
    renderBrings();
    tagEd.refresh();
    $("dz-count").textContent = "· " + items.length + " / " + maxRunes();
    document.querySelectorAll(".pal").forEach((b) => {
      b.classList.toggle("full", items.length >= maxRunes());
      b.classList.toggle("taken", !advanced() && items.some((i) => i.name === b.dataset.name));
    });
    refreshHistory();
  }

  function renderList() {
    const ul = $("dz-list");
    ul.innerHTML = "";
    if (!items.length) { ul.innerHTML = '<li style="cursor:default;color:var(--grey2);font-style:italic">Aucune rune pour l\'instant.</li>'; return; }
    items.forEach((it) => {
      const li = document.createElement("li"), n = groupOf(it).length;
      li.setAttribute("aria-current", String(sel.has(it.id)));
      li.innerHTML = '<i style="background:' + it.color + '"></i><span class="nm">' + it.name + (n > 1 ? "<small>Ensemble de " + n + " runes</small>" : "") + "</span>" +
        '<span class="ctl"><label><input type="checkbox" class="snap"' + (it.snap ? " checked" : "") + "> Aimant</label>" +
        '<label><input type="checkbox" class="lock"' + (it.locked ? " checked" : "") + "> Verrou</label>" +
        '<button type="button" class="ord up" title="Mettre au premier plan" aria-label="Premier plan : ' + it.name + '">▲</button>' +
        '<button type="button" class="ord down" title="Mettre à l\'arrière-plan" aria-label="Arrière-plan : ' + it.name + '">▼</button></span>' +
        '<button class="rm" title="Retirer" aria-label="Retirer ' + it.name + '">✕</button>';
      li.addEventListener("click", (e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) { if (sel.has(it.id)) sel.delete(it.id); else sel.add(it.id); } else sel = new Set([it.id]); render(); });
      li.querySelector(".ctl").addEventListener("click", (e) => e.stopPropagation());
      li.querySelector("input.snap").addEventListener("change", (e) => { record("Aimant de " + it.name); it.snap = e.target.checked; render(); });
      li.querySelector("input.lock").addEventListener("change", (e) => { record((e.target.checked ? "Verrouillage de " : "Déverrouillage de ") + it.name); it.locked = e.target.checked; say(it.locked ? "« " + it.name + " » verrouillée : elle ne bouge plus." : "« " + it.name + " » déverrouillée."); render(); });
      li.querySelector(".up").addEventListener("click", () => { record("Premier plan : " + it.name); items = items.filter((i) => i !== it).concat(it); say("« " + it.name + " » passe au premier plan."); render(); });
      li.querySelector(".down").addEventListener("click", () => { record("Arrière-plan : " + it.name); items = [it].concat(items.filter((i) => i !== it)); say("« " + it.name + " » passe à l'arrière-plan."); render(); });
      li.querySelector(".rm").addEventListener("click", (e) => { e.stopPropagation(); remove(it.id); });
      ul.appendChild(li);
    });
  }

  function say(t) { $("dz-msg").textContent = t; }

  /* ---- ajout et retrait */
  function add(name, cx, cy) {
    if (items.length >= maxRunes()) {
      say(items.length >= 6 ? "Limite de 6 runes atteinte." : "Limite de 4 runes atteinte : active le mode avancé pour aller jusqu'à 6.");
      return;
    }
    if (!advanced() && items.some((i) => i.name === name)) {
      say("« " + name + " » est déjà sur la plaque : une même rune ne s'emploie qu'une fois (le mode avancé lève ce blocage).");
      return;
    }
    say("");
    record("Ajout de " + name);
    const used = items.map((i) => i.color);
    const it = { id: nextId++, name, x: 0, y: 0, f: 0, k: 1, snap: true, keep: null, locked: false, color: COLORS.find((c) => !used.includes(c)) || COLORS[0] };
    const [x0, y0, x1, y1] = D.bbox;
    it.x = cx - (x0 + x1) / 2; it.y = cy - (y0 + y1) / 2;
    items.push(it);
    settle([it]);
    snapMark = null;
    sel = new Set([it.id]);
    render();
  }
  const remove = (id) => removeMany([id]);
  function removeMany(ids) {
    if (!ids.length) return;
    record(ids.length > 1 ? "Retrait de " + ids.length + " runes" : "Retrait de " + (itemById(ids[0]) || { name: "la rune" }).name);
    items = items.filter((i) => !ids.includes(i.id));
    links = links.filter((l) => !ids.includes(l.a) && !ids.includes(l.b));
    ids.forEach((id) => sel.delete(id));
    say(""); render();
  }

  /* ---- liaison : un clic sur un point d'ancrage lie les runes dont les points se touchent (un second clic délie) */
  function clickAnchor(it, pi) {
    const own = links.filter((l) => (l.a === it.id && l.pa === pi) || (l.b === it.id && l.pb === pi));
    if (own.length) { record("Liaison retirée"); links = links.filter((l) => !own.includes(l)); say("Liaison retirée."); render(); return; }
    const a = abs(it)[pi], partners = [];
    items.forEach((o) => {
      if (o === it) return;
      abs(o).forEach((b, pj) => { if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= LINK_R) partners.push([o, pj, b]); });
    });
    if (!partners.length) { say("Aucun point d'une autre rune à cet endroit : amène deux points d'ancrage l'un sur l'autre (l'aimant aide), puis clique dessus."); return; }
    record("Liaison de " + it.name);
    const grp = groupOf(it), [first, , fb] = partners[0];
    if (!grp.includes(first)) { const dx = fb[0] - a[0], dy = fb[1] - a[1]; grp.forEach((m) => { m.x += dx; m.y += dy; }); }   // les points se superposent exactement
    partners.forEach(([o, pj]) => {
      if (!links.some((l) => (l.a === it.id && l.b === o.id && l.pa === pi && l.pb === pj) || (l.a === o.id && l.b === it.id && l.pa === pj && l.pb === pi))) links.push({ a: it.id, pa: pi, b: o.id, pb: pj });
    });
    fit(groupOf(it));
    say("« " + it.name + " » est liée à « " + partners.map((p) => p[0].name).join(" », « ") + " » : l'ensemble se déplace d'un bloc.");
    render();
  }

  /* ---- déplacement d'une rune (ou de son ensemble) sur la plaque */
  function svgPoint(e) {
    const r = svg.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH];
  }
  /* ---- cadre de sélection : clic gauche maintenu sur le fond de la plaque ; Maj / Ctrl ajoute à la sélection */
  const marqueeRect = () => [Math.min(marquee.x0, marquee.x1), Math.min(marquee.y0, marquee.y1), Math.max(marquee.x0, marquee.x1), Math.max(marquee.y0, marquee.y1)];
  /** Une rune est prise si le cadre touche un de ses traits (épaisseur comprise). */
  function touches(it, [x0, y0, x1, y1]) {
    const inside = (x, y) => x >= x0 - HW && x <= x1 + HW && y >= y0 - HW && y <= y1 + HW;
    return Geom.strokes(it.name, it.f, it.k).some((s) => s.pts.some((p, i) => {
      const a = [p[0] + it.x, p[1] + it.y];
      if (!i) return inside(a[0], a[1]);
      const q = s.pts[i - 1], b = [q[0] + it.x, q[1] + it.y], n = Math.max(1, Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 5));
      for (let k = 0; k <= n; k++) if (inside(b[0] + ((a[0] - b[0]) * k) / n, b[1] + ((a[1] - b[1]) * k) / n)) return true;
      return false;
    }));
  }
  svg.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || activeTool() !== "select") return;
    if (e.target.dataset && e.target.dataset.h) { startHandle(e, e.target.dataset.h); return; }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const g = e.target.closest("g[data-id]");
    if (!g || !e.target.classList.contains("ui")) {
      if (e.target.id === "dz-bg") {
        const [px, py] = svgPoint(e);
        svg.setPointerCapture(e.pointerId);
        marquee = { x0: px, y0: py, x1: px, y1: py, base: additive ? new Set(sel) : new Set(), cx: e.clientX, cy: e.clientY, moved: false };
        if (!additive && sel.size) { sel = new Set(); render(); }
      }
      return;
    }
    const it = itemById(Number(g.dataset.id));
    if (!it) return;
    if (additive) { if (sel.has(it.id)) sel.delete(it.id); else sel.add(it.id); render(); return; }
    if (!sel.has(it.id)) sel = new Set([it.id]);             // une rune de la sélection multiple entraîne les autres
    svg.setPointerCapture(e.pointerId);
    const members = selMembers(), [px, py] = svgPoint(e);
    drag = { it, members, starts: members.map((m) => [m.x, m.y]), px, py, cx: e.clientX, cy: e.clientY, moved: false, pt: e.target.dataset.pt === undefined ? null : Number(e.target.dataset.pt) };
    render();
  });
  svg.addEventListener("pointermove", (e) => {
    if (resize) { moveHandle(e); return; }
    if (marquee) {
      if (!marquee.moved && Math.hypot(e.clientX - marquee.cx, e.clientY - marquee.cy) < 4) return;
      marquee.moved = true;
      [marquee.x1, marquee.y1] = svgPoint(e);
      const r = marqueeRect();
      sel = new Set([...marquee.base, ...items.filter((it) => touches(it, r)).map((it) => it.id)]);
      render();
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 4) return;   // un simple clic ne déplace rien
    const stuck = locked(drag.members);
    if (stuck) { if (!drag.warned) { drag.warned = true; lockMsg(stuck); } return; }
    if (!drag.moved) record("Déplacement de " + (drag.members.length > 1 ? drag.members.length + " runes" : drag.it.name));   // un déplacement = une seule étape d'historique
    drag.moved = true;
    const [px, py] = svgPoint(e);
    drag.members.forEach((m, i) => { m.x = drag.starts[i][0] + px - drag.px; m.y = drag.starts[i][1] + py - drag.py; });
    settle(drag.members);
    align(drag.members);
    render();
  });
  const endDrag = (e) => {
    if (resize) { resize = null; say(""); render(); return; }
    if (marquee) {
      const was = marquee.moved;
      marquee = null;
      if (was) say(sel.size > 1 ? sel.size + " runes sélectionnées : glisse l'une d'elles pour les déplacer ensemble, Suppr pour les retirer." : sel.size ? "" : "Aucune rune dans le cadre.");
      render();
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null; snapMark = null; guides = [];
    if (!d.moved && d.pt === null && sel.size > 1) sel = new Set([d.it.id]);   // simple clic sur une rune : elle seule reste sélectionnée
    if (!d.moved && d.pt !== null && e.type === "pointerup") clickAnchor(d.it, d.pt);
    else { render(); if (!d.moved && d.pt === null && e.type === "pointerup") openMenu(e.clientX, e.clientY, d.it); }
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", (e) => {
    if ($("design").hidden) return;
    if ((e.target.matches && e.target.matches("input, select, textarea"))) return;
    if (e.key === "Escape" && !saveBox.hidden) { closeSave(); return; }
    if (e.key === "Escape" && !expBox.hidden) { closeExport(); return; }
    if (e.key === "Escape" && !keysBox.hidden) { closeKeys(); return; }
    if (e.key === "Escape" && !$("dz-diff").hidden) { $("dz-diff").hidden = true; return; }
    if (e.key === "Escape" && !$("dz-tour").hidden) { endTour(); return; }
    if (e.key === "Escape" && !menu.hidden) { closeMenu(); return; }
    if (e.key === "Escape") {                                // Échap : ferme le menu, désélectionne, puis quitte le plein écran
      if (sel.size) { sel = new Set(); render(); } else if (expanded) setExpanded(false);
      return;
    }
    if (!sel.size) return;
    const members = selMembers();
    if (!members.length) return;
    const step = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if ((mv || e.key === "Delete" || e.key === "Backspace") && locked(members)) { e.preventDefault(); lockMsg(locked(members)); return; }
    if (mv) { e.preventDefault(); if (!nudgeTimer) record("Ajustement au clavier"); clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => { nudgeTimer = null; }, 500); members.forEach((m) => { m.x += mv[0]; m.y += mv[1]; }); fit(members); render(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeMany([...sel]); }

  });

  /* ---- centrage : la sélection (rune ou ensemble) ou toute la composition */
  $("dz-center").addEventListener("click", () => {
    const g = selMembers();
    if (!g.length) { say("Sélectionne d'abord une rune."); return; }
    if (locked(g)) { lockMsg(locked(g)); return; }
    record("Centrage");
    centerOn(g); fit(g);
    say(g.length > 1 ? (sel.size > 1 ? "Sélection de " + g.length + " runes centrée." : "Ensemble de " + g.length + " runes centré.") : "« " + g[0].name + " » centrée.");
    render();
  });
  $("dz-center-all").addEventListener("click", () => {
    if (!items.length) return;
    if (locked(items)) { lockMsg(locked(items)); return; }
    record("Centrage de la composition");
    centerOn(items); fitAll();
    say("Composition centrée.");
    render();
  });

  /* ---- miroir et taille : la sélection (avec les runes liées, qui forment un bloc), sinon toute la composition */
  const targets = () => { const m = selMembers(); return m.length ? m : items; };
  const scope = () => (!sel.size ? "toute la bindrune" : selMembers().length > 1 ? "la sélection" : "la rune");
  /** Miroir « vertical » : haut ↔ bas ; « horizontal » : gauche ↔ droite (le même bouton, pressé deux fois, rétablit). */
  function mirrorSel(axis) {
    if (!items.length) { say("Ajoute d'abord des runes."); return; }
    const members = targets();
    if (locked(members)) { lockMsg(locked(members)); return; }
    record(axis === "v" ? "Miroir vertical" : "Miroir horizontal");
    const [x0, y0, x1, y1] = boundsOf(members);
    Geom.mirror(members, axis, (x0 + x1) / 2, (y0 + y1) / 2);
    snapMark = null;
    say("Miroir " + (axis === "v" ? "vertical" : "horizontal") + " : " + scope() + ".");
    render();
  }
  $("dz-mirror-v").addEventListener("click", () => mirrorSel("v"));
  $("dz-mirror-h").addEventListener("click", () => mirrorSel("h"));

  /** Échelle de référence affichée par le curseur : la dernière rune sélectionnée, sinon la première. */
  const refItem = () => (sel.size && itemById([...sel].pop())) || items[0];
  /** Fixe l'échelle de référence à pct % ; les autres runes du bloc suivent dans la même proportion, autour du centre du bloc. */
  function applyPct(pct) {
    const members = targets(), ref = refItem();
    if (!ref || !members.length) return false;
    if (locked(members)) { lockMsg(locked(members)); return false; }
    const factor = pct / 100 / (ref.k || 1);
    if (Math.abs(factor - 1) < 1e-4) return false;
    const [x0, y0, x1, y1] = boundsOf(members);
    Geom.scaleAbout(members, factor, (x0 + x1) / 2, (y0 + y1) / 2);
    fit(members);
    return true;
  }
  function resizeTo(pct, label) { if (!items.length) { say("Ajoute d'abord des runes."); return; } const ref = refItem(); if (Math.abs(pct / 100 - (ref.k || 1)) < 1e-4) return; if (locked(targets())) { lockMsg(locked(targets())); return; } record(label); applyPct(pct); say("Taille : " + scope() + " à " + Math.round(refItem().k * 100) + " %."); render(); }
  let sizing = false;
  $("dz-size").addEventListener("input", (e) => {
    if (!items.length) return;
    if (!sizing) { if (locked(targets())) { lockMsg(locked(targets())); render(); return; } record("Taille de " + scope()); sizing = true; }   // un geste sur le curseur = une seule étape d'historique
    applyPct(Number(e.target.value)); say(""); render();
  });
  $("dz-size").addEventListener("change", () => { sizing = false; });
  $("dz-size-reset").addEventListener("click", () => resizeTo(100, "Taille d'origine"));
  /** Curseur et libellé de taille : ils suivent la sélection. */
  function syncSize() {
    const ref = refItem(), pct = ref ? Math.round((ref.k || 1) * 100) : 100;
    $("dz-size").value = pct; $("dz-size-val").textContent = pct + " %";
    $("dz-size").disabled = !items.length; $("dz-size-reset").disabled = !items.length;
    $("dz-size-label").textContent = !items.length ? "Taille" : !sel.size ? "Taille : toutes les runes" : selMembers().length > 1 ? "Taille : la sélection (" + selMembers().length + " runes)" : "Taille : " + ref.name;
  }

  /* ---- menu contextuel : un clic sur une rune (ou clic droit) propose des actions sur elle ou sur la sélection */
  const menu = $("dz-menu");
  const closeMenu = () => { menu.hidden = true; menu.innerHTML = ""; };
  function openMenu(cx, cy, it) {
    const members = selMembers(), multi = sel.size > 1 || members.length > 1, single = sel.size === 1;
    const everyone = selItems();
    const act = (label, fn) => () => { closeMenu(); fn(); };
    const entries = [
      { head: multi ? members.length + " runes" : it.name },
      { label: "Miroir vertical", hint: "haut ↔ bas", fn: () => mirrorSel("v") },
      { label: "Miroir horizontal", hint: "gauche ↔ droite", fn: () => mirrorSel("h") },
      { sep: true },
      { label: "Agrandir", hint: "+ 10 %", fn: () => resizeTo(Math.round((refItem().k || 1) * 110), "Agrandissement") },
      { label: "Réduire", hint: "− 10 %", fn: () => resizeTo(Math.round((refItem().k || 1) * 91), "Réduction") },
      { label: "Taille d'origine", hint: "100 %", fn: () => resizeTo(100, "Taille d'origine") },
      { sep: true },
    ];
    if (single) {
      entries.push({ label: "Premier plan", fn: () => { record("Premier plan : " + it.name); items = items.filter((i) => i !== it).concat(it); render(); } });
      entries.push({ label: "Arrière-plan", fn: () => { record("Arrière-plan : " + it.name); items = [it].concat(items.filter((i) => i !== it)); render(); } });
    }
    const lockedNow = everyone.every((i) => i.locked), snapNow = everyone.every((i) => i.snap);
    entries.push({ label: lockedNow ? "Déverrouiller" : "Verrouiller", fn: () => { record((lockedNow ? "Déverrouillage" : "Verrouillage") + " de " + (multi ? everyone.length + " runes" : it.name)); everyone.forEach((i) => { i.locked = !lockedNow; }); render(); } });
    entries.push({ label: snapNow ? "Désactiver l'aimant" : "Activer l'aimant", fn: () => { record("Aimant de " + (multi ? everyone.length + " runes" : it.name)); everyone.forEach((i) => { i.snap = !snapNow; }); render(); } });
    entries.push({ label: "Centrer", fn: () => $("dz-center").click() });
    entries.push({ label: "Sens et étiquettes…", fn: () => { openSave(); const card = document.querySelector('.bring[data-id="' + it.id + '"]'); if (card) { card.scrollIntoView({ block: "nearest" }); card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1200); } } });
    entries.push({ sep: true });
    entries.push({ label: "Retirer", danger: true, fn: () => removeMany(everyone.map((i) => i.id)) });

    menu.innerHTML = "";
    entries.forEach((en) => {
      if (en.sep) { menu.appendChild(document.createElement("hr")); return; }
      if (en.head) { const h = document.createElement("div"); h.className = "mh"; h.textContent = en.head; menu.appendChild(h); return; }
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "menuitem"); if (en.danger) b.className = "danger";
      b.innerHTML = "<span></span><em></em>"; b.firstChild.textContent = en.label; b.lastChild.textContent = en.hint || "";
      b.addEventListener("click", act(en.label, en.fn));
      menu.appendChild(b);
    });
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(cx + 4, window.innerWidth - r.width - 4)) + "px";
    menu.style.top = Math.max(4, Math.min(cy + 4, window.innerHeight - r.height - 4)) + "px";
    const first = menu.querySelector("button"); if (first) first.focus({ preventScroll: true });
  }
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);
  window.addEventListener("resize", closeMenu);
  $("dz-stage").addEventListener("scroll", closeMenu);
  menu.addEventListener("keydown", (e) => {
    const btns = [...menu.querySelectorAll("button")], i = btns.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  });
  svg.addEventListener("contextmenu", (e) => {                // clic droit sur une rune
    const g = e.target.closest("g[data-id]");
    if (!g) return;
    e.preventDefault();
    const it = itemById(Number(g.dataset.id));
    if (!it) return;
    if (!sel.has(it.id)) sel = new Set([it.id]);
    render();
    openMenu(e.clientX, e.clientY, it);
  });

  /* ---- palette : clic (ajout au centre) ou glisser-déposer sur la plaque */
  function miniSVG(r) {
    return '<svg viewBox="112 28 288 456" xmlns="http://www.w3.org/2000/svg">' + r.strokes.map((s) =>
      '<polyline points="' + s.pts.map((p) => p.join(",")).join(" ") + '" fill="none" stroke="#20201E" stroke-width="' + D.strokeWidth + '"/>').join("") + "</svg>";
  }
  const pal = $("palette");
  D.runes.forEach((r) => {
    const b = document.createElement("button");
    b.className = "pal"; b.type = "button"; b.dataset.name = r.name;
    b.innerHTML = miniSVG(r) + "<span>" + r.name + "</span>";
    b.addEventListener("pointerdown", (e) => startPaletteDrag(e, r.name, b));
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); add(r.name, VW / 2, VH / 2); } });
    pal.appendChild(b);
  });
  function startPaletteDrag(e, name, btn) {
    if (e.button > 0) return;
    const sx = e.clientX, sy = e.clientY;
    let ghost = null;
    btn.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) {
        ghost = document.createElement("div");
        ghost.className = "drag-ghost";
        ghost.innerHTML = miniSVG(byName(name));
        document.body.appendChild(ghost);
      }
      if (ghost) { ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px"; }
    };
    const up = (ev) => {
      btn.removeEventListener("pointermove", move);
      btn.removeEventListener("pointerup", up);
      btn.removeEventListener("pointercancel", up);
      if (ghost) ghost.remove();
      if (!ghost) { add(name, VW / 2, VH / 2); return; }     // simple clic
      if (ev.type === "pointercancel") return;
      const r = svg.getBoundingClientRect();
      if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
        const [px, py] = svgPoint(ev);
        add(name, px, py);
      }
    };
    btn.addEventListener("pointermove", move);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  }

  /* ---- options */
  $("dz-magnet").addEventListener("change", () => { snapMark = null; render(); });
  $("dz-adv").addEventListener("change", (e) => {
    if (!e.target.checked && (items.length > 4 || hasDuplicates())) {
      e.target.checked = true;
      say(items.length > 4 ? "Retire d'abord des runes : le mode normal est limité à 4." : "Retire d'abord les runes en double : le mode normal n'emploie une rune qu'une fois.");
      return;
    }
    say(""); render();
  });
  $("dz-clear").addEventListener("click", () => { if (!items.length) return; record("Tout retiré"); items = []; links = []; sel = new Set(); say(""); render(); });
  $("dz-align").addEventListener("change", () => { guides = []; render(); });
  $("dz-undo").addEventListener("click", undo);
  $("dz-redo").addEventListener("click", redo);
  window.addEventListener("keydown", (e) => {                // Ctrl+Z / Ctrl+Y (Ctrl+Maj+Z) dans l'onglet Bindrune
    if ($("design").hidden || (e.target.matches && e.target.matches("input, select, textarea"))) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "a") { e.preventDefault(); sel = new Set(items.map((i) => i.id)); say(items.length > 1 ? "Toutes les runes sont sélectionnées." : ""); render(); return; }
    if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
  });

  /* ---- vue : le plan de travail s'ajuste à la fenêtre ; − / + ou Ctrl + molette pour agrandir ou réduire la vue (sans toucher à la bindrune) */
  const stage = $("dz-stage"), wrap = $("dz-wrap");
  let viewScale = null;                                      // null : ajusté à la fenêtre
  function applyView() {
    const cs = getComputedStyle(stage), padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const fitW = Math.max(240, Math.min(stage.clientWidth - padX, ((stage.clientHeight - padY) * VW) / VH));
    const w = Math.round(fitW * (viewScale === null ? 1 : viewScale));
    wrap.style.width = w + "px";
    $("dz-view-val").textContent = Math.round((w / VW) * 100) + " %";
    scheduleRulers();
  }
  const zoomView = (k) => { viewScale = Math.min(4, Math.max(0.25, (viewScale === null ? 1 : viewScale) * k)); applyView(); };
  /** Zoom de la vue qui garde sous le curseur le point visé de la plaque. */
  function zoomAt(k, cx, cy) {
    const before = wrap.getBoundingClientRect(), u = (cx - before.left) / before.width, v = (cy - before.top) / before.height;
    zoomView(k);
    const after = wrap.getBoundingClientRect();
    stage.scrollLeft += after.left + u * after.width - cx;
    stage.scrollTop += after.top + v * after.height - cy;
    scheduleRulers();
  }
  $("dz-view-in").addEventListener("click", () => zoomView(1.25));
  $("dz-view-out").addEventListener("click", () => zoomView(0.8));
  $("dz-view-fit").addEventListener("click", () => { viewScale = null; applyView(); });
  stage.addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY); } }, { passive: false });

  /* ---- outils : Sélection (V), Main (H, ou Espace maintenu), Zoom (Z) */
  let tool = "select", tempHand = false, pan = null;
  const activeTool = () => (tempHand ? "hand" : tool);
  function syncTool() {
    const a = activeTool();
    ["select", "hand", "zoom"].forEach((n) => { const b = $("dz-tool-" + n); b.classList.toggle("on", n === tool); b.setAttribute("aria-pressed", String(n === tool)); });
    stage.dataset.tool = a;
    if (a !== "select") render();                            // les poignées disparaissent hors de l'outil Sélection
  }
  function setTool(t) { tool = t; tempHand = false; syncTool(); render(); }
  ["select", "hand", "zoom"].forEach((n) => $("dz-tool-" + n).addEventListener("click", () => setTool(n)));
  stage.addEventListener("pointerdown", (e) => {
    const t = e.button === 1 ? "hand" : activeTool();        // le bouton du milieu déplace toujours la vue
    if (t === "hand" && (e.button === 0 || e.button === 1)) {
      pan = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
      stage.classList.add("panning"); stage.setPointerCapture(e.pointerId); e.preventDefault();
    } else if (t === "zoom" && e.button === 0) zoomAt(e.shiftKey || e.altKey ? 0.8 : 1.25, e.clientX, e.clientY);
  });
  stage.addEventListener("pointermove", (e) => { if (pan) { stage.scrollLeft = pan.l - (e.clientX - pan.x); stage.scrollTop = pan.t - (e.clientY - pan.y); } });
  const endPan = () => { pan = null; stage.classList.remove("panning"); };
  stage.addEventListener("pointerup", endPan);
  stage.addEventListener("pointercancel", endPan);
  window.addEventListener("keydown", (e) => {
    if ($("design").hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches && e.target.matches("input, select, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === "v") setTool("select");
    else if (k === "h") setTool("hand");
    else if (k === "z") setTool("zoom");
    else if (e.key === "?") openKeys();
    else if (e.key === " " && !(e.target.closest && e.target.closest("button, summary, a")) && !tempHand) { e.preventDefault(); tempHand = true; syncTool(); }
  });
  window.addEventListener("keyup", (e) => { if (e.key === " " && tempHand) { tempHand = false; syncTool(); } });
  window.addEventListener("blur", () => { if (tempHand) { tempHand = false; syncTool(); } });

  /* ---- fenêtre des raccourcis */
  const keysBox = $("dz-keys");
  function openKeys() { keysBox.hidden = false; $("dz-keys-close").focus(); }
  const closeKeys = () => { keysBox.hidden = true; };
  $("dz-keys-btn").addEventListener("click", openKeys);
  $("dz-keys-close").addEventListener("click", closeKeys);
  keysBox.addEventListener("pointerdown", (e) => { if (e.target === keysBox) closeKeys(); });
  if (window.ResizeObserver) new ResizeObserver(applyView).observe(stage); else window.addEventListener("resize", applyView);

  /* ---- règles graduées : unités de la plaque (la plaque mesure 800 × 640), alignées sur le plan de travail ; le curseur y laisse un repère */
  const rx = $("dz-ruler-x"), ry = $("dz-ruler-y"), box = $("dz-center-box");
  let rulersOn = true, cursor = null, rulerFrame = 0;
  try { rulersOn = localStorage.getItem("runes-rulers") !== "0"; } catch (e) { /* stockage indisponible */ }
  $("dz-rulers").checked = rulersOn;
  const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  function ticks(cv, horizontal, origin, scale, length) {
    const dpr = window.devicePixelRatio || 1, thick = 20;
    cv.width = Math.round((horizontal ? length : thick) * dpr); cv.height = Math.round((horizontal ? thick : length) * dpr);
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#303030"; g.fillRect(0, 0, horizontal ? length : thick, horizontal ? thick : length);
    const plateEnd = origin + (horizontal ? VW : VH) * scale;                      // la plaque est un peu plus claire que le reste
    g.fillStyle = "#3d3d3d";
    if (horizontal) g.fillRect(Math.max(0, origin), 0, Math.min(length, plateEnd) - Math.max(0, origin), thick); else g.fillRect(0, Math.max(0, origin), thick, Math.min(length, plateEnd) - Math.max(0, origin));
    const minor = STEPS.find((s) => s * scale >= 7) || 500, major = STEPS.find((s) => s * scale >= 56 && s % minor === 0) || 1000;
    g.strokeStyle = "#8a8a8a"; g.fillStyle = "#b5b5b5"; g.lineWidth = 1; g.font = "9px system-ui, sans-serif"; g.textBaseline = "top"; g.textAlign = "left";
    const u0 = Math.ceil(-origin / scale / minor) * minor, u1 = Math.floor((length - origin) / scale);
    for (let u = u0; u <= u1; u += minor) {
      const p = Math.round(origin + u * scale) + 0.5, big = u % major === 0, len = big ? 14 : u % (minor * 5) === 0 ? 9 : 5;
      g.beginPath();
      if (horizontal) { g.moveTo(p, thick); g.lineTo(p, thick - len); } else { g.moveTo(thick, p); g.lineTo(thick - len, p); }
      g.stroke();
      if (big) {
        if (horizontal) g.fillText(String(u), p + 2, 1);
        else { g.save(); g.translate(1, p + 2); g.rotate(-Math.PI / 2); g.textAlign = "right"; g.fillText(String(u), 0, 0); g.restore(); }
      }
    }
    return g;
  }
  function drawRulers() {
    rulerFrame = 0;
    box.classList.toggle("no-rulers", !rulersOn);
    if (!rulersOn) return;
    const st = stage.getBoundingClientRect(), w = wrap.getBoundingClientRect(), scale = w.width / VW;
    if (!st.width || !scale) return;
    const gx = ticks(rx, true, w.left - st.left, scale, st.width), gy = ticks(ry, false, w.top - st.top, scale, st.height);
    if (cursor) {                                            // repère du curseur sur chaque règle, et position dans la barre d'état
      const cxp = cursor[0] - st.left, cyp = cursor[1] - st.top;
      gx.strokeStyle = gy.strokeStyle = "#e0924f"; gx.lineWidth = gy.lineWidth = 1.5;
      gx.beginPath(); gx.moveTo(cxp + 0.5, 0); gx.lineTo(cxp + 0.5, 20); gx.stroke();
      gy.beginPath(); gy.moveTo(0, cyp + 0.5); gy.lineTo(20, cyp + 0.5); gy.stroke();
    }
  }
  function scheduleRulers() { if (!rulerFrame) rulerFrame = requestAnimationFrame(drawRulers); }
  $("dz-rulers").addEventListener("change", (e) => { rulersOn = e.target.checked; try { localStorage.setItem("runes-rulers", rulersOn ? "1" : "0"); } catch (err) { /* ignoré */ } scheduleRulers(); applyView(); });
  stage.addEventListener("scroll", scheduleRulers);
  stage.addEventListener("pointermove", (e) => {
    cursor = [e.clientX, e.clientY];
    const w = wrap.getBoundingClientRect(), u = ((e.clientX - w.left) / w.width) * VW, v = ((e.clientY - w.top) / w.height) * VH;
    $("dz-xy").textContent = u >= 0 && u <= VW && v >= 0 && v <= VH ? "x " + Math.round(u) + "  y " + Math.round(v) : "";
    scheduleRulers();
  });
  stage.addEventListener("pointerleave", () => { cursor = null; $("dz-xy").textContent = ""; scheduleRulers(); });

  /* ---- plein écran : l'atelier occupe toute la fenêtre (Échap pour en sortir) */
  let expanded = false;
  function setExpanded(on) {
    expanded = on;
    $("design").classList.toggle("expanded", on);
    document.body.style.overflow = on ? "hidden" : "";
    $("dz-expand").querySelector("span").textContent = on ? "Quitter le plein écran" : "Plein écran";
    $("dz-expand").setAttribute("aria-pressed", String(on));
    applyView();
  }
  $("dz-expand").addEventListener("click", () => setExpanded(!expanded));
  window.addEventListener("hashchange", () => { if (expanded && $("design").hidden) setExpanded(false); });

  /* ---- export PNG : la composition est d'abord centrée ; le canevas seul (pas d'ancrages ni de sélection) */
  const fileSafe = (t) => String(t).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "bindrune";
  function saveBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  const cdata = () => Bindrunes.validate(snapshot());
  const exportName = () => Bindrunes.cleanName($("sv-name").value) || "Sans nom";
  const toBlob = (c) => new Promise((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Image impossible à produire."))), "image/png"));
  /** PNG de la composition seule (fond transparent), cadré sur la bindrune, 3 pixels par unité de la plaque. */
  function transparentCanvas(d, scale) {
    const [x0, y0, x1, y1] = Export.bounds(d), c = document.createElement("canvas");
    c.width = Math.ceil((x1 - x0) * scale); c.height = Math.ceil((y1 - y0) * scale);
    paint(c.getContext("2d"), [scale, scale, -x0 * scale, -y0 * scale], false);
    return c;
  }
  /* ---- exporter : une fenêtre propose le format et ses options, avec un aperçu, puis confirme */
  const expBox = $("dz-export-dlg"), EXP = "runes-export";
  let expPrefs = { fmt: "png", centre: true, res: 3, whole: true, svgs: true, pngs: true };
  try { Object.assign(expPrefs, JSON.parse(localStorage.getItem(EXP) || "{}")); } catch (e) { /* préférences illisibles : valeurs d'origine */ }
  const saveExp = () => { try { localStorage.setItem(EXP, JSON.stringify(expPrefs)); } catch (e) { /* ignoré */ } };
  const expFmt = () => (document.querySelector('input[name="dz-fmt"]:checked') || {}).value || "png";
  const expBase = () => fileSafe($("dz-exp-name").value || exportName());
  const chk = (id, label, on) => '<label class="check"><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + "> " + label + "</label>";
  const resSel = () => '<label>Résolution <select id="dz-x-res">' + [2, 3, 4].map((r) => '<option value="' + r + '"' + (expPrefs.res === r ? " selected" : "") + ">× " + r + " (" + r + " pixels par unité)</option>").join("") + "</select></label>";
  function renderExportOpts() {
    const f = expFmt(), box = $("dz-exp-extra");
    box.innerHTML = f === "png" ? chk("dz-x-centre", "Centrer la composition avant l'export", expPrefs.centre)
      : f === "transparent" ? resSel()
      : f === "zip" ? resSel() + chk("dz-x-whole", "L'ensemble (bindrune.svg et bindrune.png)", expPrefs.whole) + chk("dz-x-svgs", "Une image SVG par rune", expPrefs.svgs) + chk("dz-x-pngs", "Une image PNG par rune", expPrefs.pngs)
      : "";
    box.querySelectorAll("input, select").forEach((x) => x.addEventListener("change", () => {
      if ($("dz-x-centre")) expPrefs.centre = $("dz-x-centre").checked;
      if ($("dz-x-res")) expPrefs.res = Number($("dz-x-res").value);
      if ($("dz-x-whole")) expPrefs.whole = $("dz-x-whole").checked;
      if ($("dz-x-svgs")) expPrefs.svgs = $("dz-x-svgs").checked;
      if ($("dz-x-pngs")) expPrefs.pngs = $("dz-x-pngs").checked;
      saveExp(); renderExportPreview();
    }));
  }
  const zipNames = (d) => {
    const names = [];
    if (expPrefs.whole) names.push("bindrune.svg", "bindrune.png");
    Export.layers(d, "").forEach((l) => { if (expPrefs.svgs) names.push(l.name + ".svg"); if (expPrefs.pngs) names.push(l.name + ".png"); });
    return names.concat("LISEZMOI.txt");
  };
  let prevSeq = 0;
  async function renderExportPreview() {
    const box = $("dz-exp-prev"), info = $("dz-exp-info"), f = expFmt(), seq = ++prevSeq, d = cdata();
    box.innerHTML = ""; box.classList.toggle("checker", f === "transparent" || f === "svg" || f === "zip");
    if (!d) { info.textContent = "Rien à exporter."; return; }
    if (f === "png") {
      const c = document.createElement("canvas"); c.width = 320; c.height = 256; c.getContext("2d").drawImage(cv, 0, 0, 320, 256); box.appendChild(c);
      info.textContent = "1600 × 1280 pixels · PNG" + (expPrefs.centre ? " · composition centrée à l'export" : "");
    } else if (f === "transparent") {
      const c = transparentCanvas(d, 1), z = expPrefs.res; box.appendChild(c);
      info.textContent = c.width * z + " × " + c.height * z + " pixels · PNG, fond transparent";
    } else if (f === "svg") {
      box.innerHTML = Export.svgOf(d, exportName()); info.textContent = "Vectoriel · " + d.r.length + " groupe" + (d.r.length > 1 ? "s" : "") + ", un par rune";
    } else if (f === "zip") {
      const ul = document.createElement("ul"); ul.className = "files";
      zipNames(d).forEach((n) => { const li = document.createElement("li"); li.textContent = n; ul.appendChild(li); });
      box.appendChild(ul); const c = transparentCanvas(d, 1);
      info.textContent = ul.children.length + " fichiers · cadre commun de " + c.width * expPrefs.res + " × " + c.height * expPrefs.res + " pixels";
    } else {
      info.textContent = "Page A4 (2480 × 3508 pixels) · " + (f === "sheet-pdf" ? "PDF" : "PNG");
      box.textContent = "Aperçu en cours…";
      try {
        const c = await Sheet.render({ name: exportName(), description: Bindrunes.cleanDesc($("sv-desc").value), tags: Tags.extras(d, svTags), d });
        if (seq !== prevSeq) return;
        const t = document.createElement("canvas"); t.width = 230; t.height = 325; t.getContext("2d").drawImage(c, 0, 0, 230, 325);
        box.innerHTML = ""; box.appendChild(t);
      } catch (e) { box.textContent = "Aperçu indisponible."; }
    }
  }
  function openExport() {
    if (!items.length) { say("Ajoute au moins une rune avant d'exporter."); return; }
    const r = document.querySelector('input[name="dz-fmt"][value="' + expPrefs.fmt + '"]') || document.querySelector('input[name="dz-fmt"]');
    r.checked = true;
    $("dz-exp-name").value = fileSafe(exportName());
    renderExportOpts(); renderExportPreview();
    expBox.hidden = false; $("dz-export-go").focus();
  }
  const closeExport = () => { expBox.hidden = true; };
  document.querySelectorAll('input[name="dz-fmt"]').forEach((r) => r.addEventListener("change", () => { expPrefs.fmt = expFmt(); saveExp(); renderExportOpts(); renderExportPreview(); }));
  $("dz-export-open").addEventListener("click", openExport);
  $("dz-export-cancel").addEventListener("click", closeExport);
  expBox.addEventListener("pointerdown", (e) => { if (e.target === expBox) closeExport(); });
  /** Strates : l'ensemble en SVG et en PNG (selon les cases), puis une image par rune, toutes de même cadre, dans une archive ZIP. */
  async function exportZip(d, name, base) {
    const enc = new TextEncoder(), scale = expPrefs.res, files = [];
    if (expPrefs.whole) {
      files.push({ name: "bindrune.svg", data: enc.encode(Export.svgOf(d, name)) });
      files.push({ name: "bindrune.png", data: new Uint8Array(await (await toBlob(transparentCanvas(d, scale))).arrayBuffer()) });
    }
    for (const l of Export.layers(d, name)) {
      if (expPrefs.svgs) files.push({ name: l.name + ".svg", data: enc.encode(l.svg) });
      if (!expPrefs.pngs) continue;
      const [x0, y0, x1, y1] = l.box, c = document.createElement("canvas");
      c.width = Math.ceil((x1 - x0) * scale); c.height = Math.ceil((y1 - y0) * scale);
      const g = c.getContext("2d");
      g.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
      g.lineCap = "butt"; g.lineJoin = "miter"; g.miterLimit = 3; g.lineWidth = D.strokeWidth * (l.e.k || 1); g.strokeStyle = l.e.c; g.globalAlpha = 0.88;
      g.beginPath();
      Geom.placed(l.e).forEach((st) => st.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))));
      g.stroke();
      files.push({ name: l.name + ".png", data: new Uint8Array(await (await toBlob(c)).arrayBuffer()) });
    }
    files.push({ name: "LISEZMOI.txt", data: enc.encode("Strates de la bindrune « " + name + " »\r\n\r\n" +
      "bindrune.svg et bindrune.png : toute la bindrune (fond transparent).\r\n" +
      "01-…, 02-… : une image par rune, dans l'ordre d'empilement (01 en dessous). Elles ont toutes le même cadre : placées l'une sur l'autre à la position 0, 0, elles reconstituent la bindrune.\r\n" +
      "Les couleurs sont celles des strates du site. Fait avec « Les runes » (outil de fan, non affilié à l'équipe d'Elixir RP).\r\n") });
    saveBlob(new Blob([Zip.build(files)], { type: "application/zip" }), base + ".zip");
    return files.length;
  }
  $("dz-export-go").addEventListener("click", async () => {
    if (!items.length) { say("Ajoute au moins une rune avant d'exporter."); return; }
    const f = expFmt(), base = expBase(), d = cdata(), name = exportName();
    if (f === "zip" && !expPrefs.whole && !expPrefs.svgs && !expPrefs.pngs) { $("dz-exp-info").textContent = "Coche au moins un type de fichier."; return; }
    closeExport();
    say("Export en cours…");
    try {
      if (f === "png") {
        if (expPrefs.centre) { record("Centrage avant l'export"); centerOn(items); fitAll(); render(); }
        await new Promise((ok) => cv.toBlob((b) => { saveBlob(b, base + ".png"); ok(); }));
        say("Image PNG exportée.");
      } else if (f === "transparent") { saveBlob(await toBlob(transparentCanvas(d, expPrefs.res)), base + ".png"); say("PNG sans fond exporté."); }
      else if (f === "svg") { saveBlob(new Blob([Export.svgOf(d, name)], { type: "image/svg+xml" }), base + ".svg"); say("SVG exporté : un groupe par rune."); }
      else if (f === "zip") say("Strates exportées : " + (await exportZip(d, name, base)) + " fichiers.");
      else { await Sheet.download({ name, description: Bindrunes.cleanDesc($("sv-desc").value), tags: Tags.extras(d, svTags), d }, f === "sheet-pdf" ? "pdf" : "png", base); say("Fiche A4 exportée."); }
    } catch (e) { say("Export impossible : " + e.message); }
  });

  /* ---- nouvelle bindrune : repart de zéro, au-delà de « Tout retirer » (qui s'annule et garde nom, support et réglages) */
  function savedAsIs() {
    const rec = Bindrunes.get(Bindrunes.cleanName($("sv-name").value)), d = cdata();
    return !!(rec && d && JSON.stringify(rec.d) === JSON.stringify(d) && (rec.description || "") === Bindrunes.cleanDesc($("sv-desc").value) && JSON.stringify(rec.tags || []) === JSON.stringify(Tags.extras(d, svTags)));
  }
  function newBindrune() {
    items = []; links = []; sel = new Set(); marquee = null; drag = null; resize = null; guides = []; snapMark = null;
    past.length = 0; future.length = 0; snaps = []; saveSnaps(); renderSnaps();
    svTags = []; $("sv-name").value = ""; $("sv-desc").value = ""; $("sv-msg").textContent = "";
    $("dz-adv").checked = false; $("dz-strata").checked = false; Supports.set("bois");
    try { localStorage.removeItem(DRAFT); } catch (e) { /* ignoré */ }
    viewScale = null; tool = "select"; tempHand = false; closeMenu(); syncTool();
    say("Nouvelle bindrune."); refreshSave(); render(); tagEd.refresh(); applyView();
  }
  $("dz-new").addEventListener("click", () => {
    if (items.length && !savedAsIs() && !confirm("Commencer une nouvelle bindrune ?\n\nLa composition en cours n'est pas enregistrée à l'identique : elle sera perdue, sans retour possible.")) return;
    newBindrune();
  });

  Supports.bindSelect($("dz-support"), $("dz-support-note"));
  Supports.onChange(render);
  $("dz-strata").addEventListener("change", render);


  /* ---- ce que chaque rune apporte : sens du livre et traits, sous la zone de tracé */
  function renderBrings() {
    const box = $("dz-brings");
    box.innerHTML = "";
    renderComplexity();
    if (!items.length) { box.innerHTML = '<p class="hint">Les runes posées sur la plaque apparaissent ici, avec leurs sens et leurs traits.</p>'; return; }
    items.forEach((it) => {
      const r = byName(it.name), d = document.createElement("div"), kept = Tags.keptTags({ n: it.name, t: it.keep }), flat = Tags.runeTags(it.name);
      d.className = "bring"; d.dataset.id = it.id;
      d.innerHTML = '<h4><i style="background:' + it.color + '"></i>' + r.name + "</h4>" +
        "<h5>Sens (un interrupteur par étiquette)</h5><ul class=\"sens\">" + r.sens.map((t, i) =>
          "<li><div class=\"tags\">" + (Tags.RUNE_TAGS[r.name][i].length
            ? Tags.RUNE_TAGS[r.name][i].map((x) => { const k = Tags.norm(x), on = kept.includes(k); return '<button type="button" class="tag locked tg' + (on ? " on" : "") + '" role="switch" aria-checked="' + on + '" data-tag="' + k + '">' + Tags.label(k) + "</button>"; }).join("")
            : '<span class="hint">(sans étiquette)</span>') + "</div>" + t + "</li>").join("") + "</ul>" +
        "<h5>Traits</h5><ul>" + r.strokes.map((s) => "<li>" + s.name + "</li>").join("") + "</ul>";
      d.querySelectorAll("button.tg").forEach((btn) => btn.addEventListener("click", () => {
        const tag = btn.dataset.tag, next = btn.classList.contains("on") ? kept.filter((k) => k !== tag) : flat.filter((k) => k === tag || kept.includes(k));
        const test = items.map((o) => ({ n: o.name, t: o === it ? next : o.keep }));
        if (!Tags.all({ r: test }, svTags).length) { say("Une bindrune garde au moins une étiquette : active une autre étiquette ou ajoutes-en une."); return; }
        record((btn.classList.contains("on") ? "Étiquette retirée : " : "Étiquette activée : ") + Tags.label(tag));
        it.keep = next.length === flat.length ? null : next;
        say(""); render();
      }));
      box.appendChild(d);
    });
  }

  /* ---- complexité : voir complexity.js */
  function renderComplexity() {
    const box = $("dz-complexity");
    if (!items.length) { box.innerHTML = '<p class="hint">Pose des runes pour évaluer la complexité de la bindrune.</p>'; $("dz-cx-badge").innerHTML = ""; return; }
    const c = Complexity.rate(platesD());
    $("dz-cx-badge").innerHTML = "Complexité <b>" + c.level + "</b> · " + c.score + " / 100";
    box.innerHTML = '<p class="cplx-head"><strong>' + c.level + "</strong> · " + c.score + ' / 100</p><div class="cplx-bar"><i style="width:' + c.score + '%"></i></div><ul>' +
      c.parts.map((p) => "<li><span>" + p.label + " <small>(" + p.detail + ")</small></span><b>" + p.pts + " / " + p.max + "</b></li>").join("") + "</ul>" +
      (c.oppositions.length ? '<p class="hint">Sens qui s\'opposent : ' + c.oppositions.map((o) => o.runes[0] + " (" + Tags.label(o.tags[0]) + ") et " + o.runes[1] + " (" + Tags.label(o.tags[1]) + ") : " + o.families[0] + " contre " + o.families[1]).join(" ; ") + ".</p>" : "") +
      '<p class="hint">Évaluation du site (nombre de runes, difficulté de tracé, traits, répétitions, sens opposés) : un repère pour comparer, pas une règle du livre.</p>';
  }

  /* ---- enregistrement : liste, renommage, partage et import se gèrent dans l'onglet « Mes bindrunes » */
  const platesD = () => ({ r: items.map((i) => ({ n: i.name, t: i.keep })) });   // runes et sens gardés, pour les étiquettes
  let svTags = [];                                           // étiquettes choisies (les verrouillées se déduisent des runes posées)
  const tagEd = Tags.editor({ locked: () => Tags.derive(platesD()), get: () => svTags, set: (t) => { svTags = Tags.extras(platesD(), t); scheduleDraft(); } });
  $("sv-tags").appendChild(tagEd.el);
  const svmsg = (t) => { $("sv-msg").textContent = t; };
  const toD = (its, lks, support, strata) => ({
    r: its.map((i) => Object.assign({ n: i.name, x: Math.round(i.x * 10) / 10, y: Math.round(i.y * 10) / 10, m: i.snap ? 1 : 0, c: i.color }, i.keep ? { t: i.keep } : {}, i.f ? { f: i.f } : {}, i.k && i.k !== 1 ? { k: Math.round(i.k * 100) / 100 } : {})),
    s: support, t: strata,
    l: lks.map((k) => [its.findIndex((i) => i.id === k.a), its.findIndex((i) => i.id === k.b), k.pa, k.pb]),
  });
  const snapshot = () => toD(items, links, Supports.current(), $("dz-strata").checked ? 1 : 0);
  function restore(raw, label) {
    const d = Bindrunes.validate(raw);
    if (!d) return false;
    record(label || "Ouverture");
    items = d.r.map((e) => ({ id: nextId++, name: e.n, x: e.x, y: e.y, f: e.f || 0, k: e.k || 1, snap: e.m !== 0, keep: Array.isArray(e.t) ? e.t : null, locked: false, color: e.c }));
    if (d.z) Geom.scaleAbout(items, d.z, VW / 2, VH / 2);     // ancien format : taille générale, convertie en échelle de chaque rune
    links = (d.l || []).map(([i, j, pa, pb]) => ({ a: items[i].id, pa, b: items[j].id, pb }));
    fitAll();
    sel = new Set(); snapMark = null;
    $("dz-adv").checked = items.length > 4 || hasDuplicates();
    guides = [];
    $("dz-strata").checked = d.t === 1;
    Supports.set(d.s);
    say(""); render();
    return true;
  }
  function openSaved(name, d, description, tags) {
    if (restore(d, "Ouverture de « " + name + " »")) { $("sv-name").value = name; refreshSave(); $("sv-desc").value = description || ""; svTags = Tags.extras(platesD(), tags); tagEd.refresh(); svmsg("« " + name + " » ouverte."); window.showTab("design"); }
  }
  function refreshOpen() {
    const sel = $("dz-open");
    sel.innerHTML = '<option value="">Choisir…</option>';
    Bindrunes.list().forEach((b) => { const o = document.createElement("option"); o.value = b.name; o.textContent = b.name; sel.appendChild(o); });
  }
  Bindrunes.onChange(refreshOpen); refreshOpen();
  $("dz-open").addEventListener("change", (e) => {
    const rec = Bindrunes.get(e.target.value);
    if (rec) openSaved(rec.name, rec.d, rec.description, rec.tags);
    e.target.value = "";
  });
  window.addEventListener("bindrune:open", (e) => openSaved(e.detail.name, e.detail.d, e.detail.description, e.detail.tags));
  $("sv-manage").addEventListener("click", () => window.showTab("mine"));
  /* ---- enregistrer : une fenêtre rassemble nom, description, sens à garder et étiquettes ; le bouton confirme */
  const saveBox = $("dz-save-dlg");
  function refreshSave() {
    const name = Bindrunes.cleanName($("sv-name").value), exists = !!(name && Bindrunes.get(name));
    $("sv-exists").hidden = !exists;
    $("sv-save").textContent = exists ? "Remplacer" : "Enregistrer";
    const doc = $("dz-doc");
    doc.textContent = name || "Sans nom"; doc.classList.toggle("empty", !name);
  }
  function openSave() {
    $("sv-msg").textContent = "";
    const logged = !!(window.Account && window.Account.user());
    $("sv-dest").hidden = !logged; $("sv-acc").checked = false; $("sv-pub").checked = false;
    refreshSave(); renderBrings();
    saveBox.hidden = false; $("sv-name").focus(); $("sv-name").select();
  }
  const closeSave = () => { saveBox.hidden = true; };
  $("dz-save-open").addEventListener("click", openSave);
  $("dz-doc").addEventListener("click", openSave);
  $("sv-cancel").addEventListener("click", closeSave);
  saveBox.addEventListener("pointerdown", (e) => { if (e.target === saveBox) closeSave(); });
  $("sv-name").addEventListener("input", refreshSave);
  $("sv-pub").addEventListener("change", (e) => { if (e.target.checked) $("sv-acc").checked = true; });
  $("sv-save").addEventListener("click", async () => {
    const name = Bindrunes.cleanName($("sv-name").value);
    if (!name) { svmsg("Donne un nom à ta bindrune."); $("sv-name").focus(); return; }
    if (!items.length) { svmsg("Ajoute au moins une rune avant d'enregistrer."); return; }
    if (!Tags.all(platesD(), svTags).length) { svmsg("Garde au moins une étiquette : active un sens d'une rune ou ajoute une étiquette."); return; }
    const rec = Bindrunes.save(name, snapshot(), $("sv-desc").value, svTags);
    if (!rec) { svmsg("Enregistrement impossible : le stockage du navigateur est indisponible."); return; }
    const wantAcc = !$("sv-dest").hidden && $("sv-acc").checked, wantPub = !$("sv-dest").hidden && $("sv-pub").checked;
    closeSave(); refreshSave();
    const done = "« " + name + " » enregistrée (onglet « Mes bindrunes »).";
    say(done);
    if (wantPub) { await window.Account.publish(rec); say($("acc-msg").textContent || done); }
    else if (wantAcc) { await window.Account.upload(rec); say($("acc-msg").textContent || done); }
    Bindrunes.duplicateNotice(name, snapshot()).then((t) => { if (t && $("dz-msg").textContent.indexOf(done) === 0) say($("dz-msg").textContent + " " + t); });
  });
  $("sv-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("sv-save").click(); });
  window.addEventListener("keydown", (e) => {                // Ctrl+S : enregistrer ; Ctrl+E : exporter (même depuis un champ de texte)
    if ($("design").hidden || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "s") { e.preventDefault(); openSave(); }
    else if (k === "e") { e.preventDefault(); openExport(); }
  });

  /* ---- brouillon : la composition en cours est gardée dans ce navigateur et rétablie à la réouverture */
  const DRAFT = "runes-draft";
  let draftTimer = null;
  function saveDraft() {
    try {
      if (!items.length) { localStorage.removeItem(DRAFT); return; }
      localStorage.setItem(DRAFT, JSON.stringify({ d: snapshot(), name: $("sv-name").value, desc: $("sv-desc").value, tags: svTags, at: Date.now() }));
    } catch (e) { /* stockage indisponible : pas de brouillon */ }
  }
  function scheduleDraft() {
    if (!draftReady) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 400);
  }
  let draftReady = false;
  ["sv-name", "sv-desc"].forEach((id) => $(id).addEventListener("input", scheduleDraft));
  window.addEventListener("pagehide", () => { if (draftReady) saveDraft(); });
  function loadDraft() {
    try {
      const x = JSON.parse(localStorage.getItem(DRAFT) || "null");
      if (!x || !x.d || !restore(x.d)) return;
      past.length = 0; future.length = 0; refreshHistory();
      $("sv-name").value = Bindrunes.cleanName(x.name); $("sv-desc").value = Bindrunes.cleanDesc(x.desc); refreshSave();
      svTags = Tags.extras(platesD(), x.tags); tagEd.refresh();
      say("Brouillon rétabli (" + new Date(x.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + ") : « Tout retirer » repart de zéro.");
    } catch (e) { /* brouillon illisible : on repart de zéro */ }
  }

  /* ---- instantanés : états nommés, qu'on retrouve ou qu'on compare à l'état actuel */
  const SNAPS = "runes-snaps";
  let snaps = [];
  try { snaps = JSON.parse(localStorage.getItem(SNAPS) || "[]").filter((x) => x && typeof x.state === "string" && typeof x.name === "string").slice(0, 20); } catch (e) { snaps = []; }
  function saveSnaps() { try { localStorage.setItem(SNAPS, JSON.stringify(snaps)); } catch (e) { /* ignoré */ } }
  const snapD = (sn) => { const st = JSON.parse(sn.state); return Bindrunes.validate(toD(st.items, st.links, sn.s, sn.t)); };
  function renderSnaps() {
    const ul = $("dz-snaps");
    ul.innerHTML = "";
    if (!snaps.length) { const li = document.createElement("li"); li.className = "hint"; li.style.border = "0"; li.style.background = "none"; li.textContent = "Aucun instantané."; ul.appendChild(li); return; }
    snaps.forEach((sn, i) => {
      const li = document.createElement("li"), nm = document.createElement("span");
      nm.className = "nm"; nm.textContent = sn.name;
      const when = document.createElement("small"); when.textContent = new Date(sn.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const mk = (label, title, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.title = title; b.addEventListener("click", fn); return b; };
      li.append(nm, when,
        mk("Revenir", "Revient à cet instantané (annulable)", () => {
          record("Retour à « " + sn.name + " »");
          loadState(sn.state); Supports.set(sn.s); $("dz-strata").checked = sn.t === 1;
          say("Retour à l'instantané « " + sn.name + " »."); render();
        }),
        mk("Comparer", "Compare cet instantané à l'état actuel", () => { const d = snapD(sn); if (d) openDiff("Instantané « " + sn.name + " »", d); }),
        mk("✕", "Supprimer l'instantané", () => { snaps.splice(i, 1); saveSnaps(); renderSnaps(); }));
      ul.appendChild(li);
    });
  }
  $("dz-snap").addEventListener("click", () => {
    if (!items.length) { say("Ajoute d'abord des runes."); return; }
    const name = (prompt("Nom de l'instantané :", "Version " + (snaps.length + 1)) || "").trim().slice(0, 40);
    if (!name) return;
    snaps.unshift({ name, at: Date.now(), state: stateJson(), s: Supports.current(), t: $("dz-strata").checked ? 1 : 0 });
    snaps = snaps.slice(0, 20); saveSnaps(); renderSnaps();
    say("Instantané « " + name + " » gardé.");
  });
  /** Fenêtre de comparaison : aperçus côte à côte et liste des différences. */
  const diffBox = $("dz-diff");
  function openDiff(label, before) {
    const now = cdata();
    if (!now) { say("Rien à comparer."); return; }
    $("dz-diff-title").textContent = "Comparaison";
    $("dz-diff-a-cap").textContent = label;
    $("dz-diff-a").innerHTML = Bindrunes.previewSVG(before);
    $("dz-diff-b").innerHTML = Bindrunes.previewSVG(now);
    const r = BindDiff.diff(before, now, (id) => Supports.get(id).label), ul = $("dz-diff-lines");
    ul.innerHTML = "";
    (r.same ? ["Aucune différence : les deux versions sont identiques."] : r.lines).forEach((t) => { const li = document.createElement("li"); if (r.same) li.className = "none"; li.textContent = t; ul.appendChild(li); });
    diffBox.hidden = false; $("dz-diff-close").focus();
  }
  $("dz-diff-close").addEventListener("click", () => { diffBox.hidden = true; });
  diffBox.addEventListener("pointerdown", (e) => { if (e.target === diffBox) diffBox.hidden = true; });
  $("dz-cmp-saved").addEventListener("click", () => {
    const name = Bindrunes.cleanName($("sv-name").value), rec = name && Bindrunes.get(name);
    if (!items.length) { say("Ajoute d'abord des runes."); return; }
    if (!rec) { say(name ? "Aucune version enregistrée sous le nom « " + name + " »." : "Donne d'abord à la bindrune le nom d'une version enregistrée."); return; }
    openDiff("Version enregistrée « " + rec.name + " »", rec.d);
  });
  renderSnaps();

  /* ---- mémoire de l'interface : panneaux ouverts ou fermés, ordre, largeur de la colonne de droite */
  const UI = "runes-ui";
  let ui = {};
  try { ui = JSON.parse(localStorage.getItem(UI) || "{}") || {}; } catch (e) { ui = {}; }
  const saveUi = () => { try { localStorage.setItem(UI, JSON.stringify(ui)); } catch (e) { /* ignoré */ } };
  const panelsBox = document.querySelector(".ps-panels"), body = document.querySelector(".ps-body");
  const panels = () => [...panelsBox.querySelectorAll(":scope > details.pnl")];
  if (Array.isArray(ui.order)) ui.order.forEach((id) => { const p = panels().find((x) => x.dataset.pnl === id); if (p) panelsBox.appendChild(p); });
  panels().forEach((p) => {
    const id = p.dataset.pnl;
    if (ui.open && typeof ui.open[id] === "boolean") p.open = ui.open[id];
    p.addEventListener("toggle", () => { ui.open = ui.open || {}; ui.open[id] = p.open; saveUi(); });
    const mv = document.createElement("span");
    mv.className = "pmv";
    [["▲", -1, "Monter le panneau"], ["▼", 1, "Descendre le panneau"]].forEach(([g, dir, tip]) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = g; b.title = tip; b.setAttribute("aria-label", tip + " " + p.querySelector("summary").firstChild.textContent.trim());
      b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const all = panels(), i = all.indexOf(p), j = i + dir;
        if (j < 0 || j >= all.length) return;
        if (dir < 0) panelsBox.insertBefore(p, all[j]); else panelsBox.insertBefore(all[j], p);
        ui.order = panels().map((x) => x.dataset.pnl); saveUi();
      });
      mv.appendChild(b);
    });
    p.querySelector("summary").appendChild(mv);
  });
  const setPanelsW = (w) => $("design").style.setProperty("--panels-w", w + "px");
  if (Number.isFinite(ui.w)) setPanelsW(Math.min(640, Math.max(240, ui.w)));
  const split = document.createElement("div");
  split.className = "ps-split"; split.setAttribute("role", "separator"); split.setAttribute("aria-orientation", "vertical"); split.setAttribute("aria-label", "Largeur des panneaux"); split.tabIndex = 0;
  body.appendChild(split);
  const curW = () => panelsBox.getBoundingClientRect().width;
  split.addEventListener("pointerdown", (e) => { split.setPointerCapture(e.pointerId); split.classList.add("on"); e.preventDefault(); });
  split.addEventListener("pointermove", (e) => {
    if (!split.classList.contains("on")) return;
    const w = Math.round(Math.min(640, Math.max(240, body.getBoundingClientRect().right - e.clientX)));
    setPanelsW(w); ui.w = w;
  });
  const endSplit = () => { if (split.classList.contains("on")) { split.classList.remove("on"); saveUi(); applyView(); } };
  split.addEventListener("pointerup", endSplit);
  split.addEventListener("pointercancel", endSplit);
  split.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const w = Math.round(Math.min(640, Math.max(240, curW() + (e.key === "ArrowLeft" ? 20 : -20))));
    setPanelsW(w); ui.w = w; saveUi(); applyView();
  });
  $("dz-ui-reset").addEventListener("click", () => { try { localStorage.removeItem(UI); } catch (e) { /* ignoré */ } location.reload(); });

  /* ---- guide de première visite (quatre étapes) ; « ? » le rouvre */
  const TOUR = "runes-tour", tourBox = $("dz-tour");
  const TOUR_STEPS = [
    { sel: '[data-pnl="runes"]', h: "Choisis des runes", t: "Clique une rune du panneau « Runes », ou glisse-la sur la plaque. Quatre au plus (six avec le mode avancé, interrupteur « + » de la barre d'outils)." },
    { sel: "#dz-stage", h: "Compose sur le plan de travail", t: "Glisse les runes, approche deux points d'ancrage pour les aimanter, clique sur une rune pour son menu (miroirs, taille, verrou…). Les poignées des coins redimensionnent. Ctrl + molette zoome la vue, Espace la déplace." },
    { sel: ".ps-tools", h: "Les outils", t: "Annuler, miroirs, centrage, et les interrupteurs : magnétisme, repères, strates, mode avancé, règles. V, H et Z choisissent Sélection, Main et Zoom." },
    { sel: ".ps-bar", h: "Enregistre et exporte", t: "« Enregistrer » ouvre une fenêtre : nom, description, sens à garder, étiquettes. « Exporter » propose le format (image, SVG, strates, fiche A4) et ses options. À droite : Calques, Historique avec instantanés, Complexité. Touche ? pour les raccourcis." },
  ];
  let tourI = -1;
  const seen = () => { try { return localStorage.getItem(TOUR) === "1"; } catch (e) { return true; } };
  function clearHl() { document.querySelectorAll(".tour-hl").forEach((x) => x.classList.remove("tour-hl")); }
  function endTour() { clearHl(); tourBox.hidden = true; tourI = -1; try { localStorage.setItem(TOUR, "1"); } catch (e) { /* ignoré */ } }
  function showTour(i) {
    clearHl();
    if (i < 0) i = 0;
    if (i >= TOUR_STEPS.length) { endTour(); return; }
    tourI = i;
    const st = TOUR_STEPS[i], target = document.querySelector(st.sel);
    if (target) { if (target.tagName === "DETAILS") target.open = true; target.classList.add("tour-hl"); target.scrollIntoView({ block: "nearest" }); }
    tourBox.querySelector(".tstep").textContent = "Guide · étape " + (i + 1) + " sur " + TOUR_STEPS.length;
    tourBox.querySelector("h4").textContent = st.h; tourBox.querySelector(".ttext").textContent = st.t;
    $("dz-tour-prev").disabled = i === 0; $("dz-tour-next").textContent = i === TOUR_STEPS.length - 1 ? "Terminer" : "Suivant";
    tourBox.hidden = false;
    const r = target ? target.getBoundingClientRect() : { left: 20, right: 20, top: 80, bottom: 80 }, w = tourBox.offsetWidth, h = tourBox.offsetHeight;
    let x, y;
    if (window.innerWidth < 960) { x = (window.innerWidth - w) / 2; y = window.innerHeight - h - 12; }
    else if (r.right + w + 16 < window.innerWidth) { x = r.right + 12; y = r.top + 12; }
    else if (r.left - w - 16 > 0) { x = r.left - w - 12; y = r.top + 12; }
    else { x = (window.innerWidth - w) / 2; y = Math.min(r.bottom + 12, window.innerHeight - h - 12); }
    tourBox.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    tourBox.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + "px";
  }
  $("dz-tour-next").addEventListener("click", () => showTour(tourI + 1));
  $("dz-tour-prev").addEventListener("click", () => showTour(tourI - 1));
  $("dz-tour-skip").addEventListener("click", endTour);
  $("dz-tour-again").addEventListener("click", () => { closeKeys(); showTour(0); });
  const tourWatch = () => { if (!$("design").hidden && !seen() && tourI < 0) setTimeout(() => { if (!$("design").hidden && !seen() && tourI < 0) showTour(0); }, 700); };
  new MutationObserver(tourWatch).observe($("design"), { attributes: true, attributeFilter: ["hidden"] });
  window.addEventListener("resize", () => { if (tourI >= 0) showTour(tourI); });

  render();
  loadDraft();
  draftReady = true;
  syncTool();
  tourWatch();
  window.__designer = { applyView, goTo, resizeTo: (p) => resizeTo(p, "Taille"), mirror: mirrorSel, getGuides: () => guides, align, draftKey: DRAFT, setExpanded, getSel: () => [...sel], setSel: (ids) => { sel = new Set(ids); render(); }, touches, undo, redo, historySize: () => [past.length, future.length], add, getItems: () => items, getLinks: () => links, clickAnchor, groupOf, boundsOf, settle, snapshot, restore, setMagnet: (v) => { $("dz-magnet").checked = v; render(); } };
})();
