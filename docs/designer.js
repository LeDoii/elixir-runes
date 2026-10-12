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
  const anchors = Bindrunes.anchors;                         // extrémités et angles de chaque rune, sans doublon

  const svg = $("dz");
  let items = [], links = [], nextId = 1, snapMark = null, drag = null, marquee = null;
  let sel = new Set();                                       // identifiants des runes sélectionnées (une, ou plusieurs avec le cadre de sélection)
  const advanced = () => $("dz-adv").checked;                 // mode avancé : jusqu'à 6 runes, une même rune plusieurs fois
  const maxRunes = () => (advanced() ? 6 : 4);
  const hasDuplicates = () => new Set(items.map((i) => i.name)).size < items.length;
  const magnet = () => $("dz-magnet").checked;
  /* ---- annuler / rétablir : historique de la composition (runes, positions, aimants, liaisons) */
  const past = [], future = [];
  let nudgeTimer = null;
  const stateJson = () => JSON.stringify({ items, links, nextId });
  function refreshHistory() { $("dz-undo").disabled = !past.length; $("dz-redo").disabled = !future.length; }
  /** À appeler juste avant de modifier la composition. */
  function record() { past.push(stateJson()); if (past.length > 100) past.shift(); future.length = 0; refreshHistory(); }
  function loadState(json) {
    const s = JSON.parse(json);
    items = s.items; links = s.links; nextId = Math.max(nextId, s.nextId);
    sel = new Set([...sel].filter((id) => itemById(id)));
    snapMark = null;
  }
  function undo() { if (!past.length) return; future.push(stateJson()); loadState(past.pop()); say("Annulé."); render(); }
  function redo() { if (!future.length) return; past.push(stateJson()); loadState(future.pop()); say("Rétabli."); render(); }

  const abs = (it) => anchors(it.name).map((p) => [p[0] + it.x, p[1] + it.y]);
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
  const boxCache = {};
  function runeBox(name) {                                   // emprise de la rune (épaisseur du trait comprise), dans son repère
    if (boxCache[name]) return boxCache[name];
    const all = byName(name).strokes.flatMap((s) => s.pts);
    return (boxCache[name] = [Math.min(...all.map((p) => p[0])) - HW, Math.min(...all.map((p) => p[1])) - HW, Math.max(...all.map((p) => p[0])) + HW, Math.max(...all.map((p) => p[1])) + HW]);
  }
  function boundsOf(members) {
    const bs = members.map((m) => { const b = runeBox(m.name); return [b[0] + m.x, b[1] + m.y, b[2] + m.x, b[3] + m.y]; });
    return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
  }
  /** Ramène l'ensemble dans le cadre ; s'il est plus grand que le cadre sur un axe, il est centré sur cet axe. */
  function fit(members) {
    if (!members.length) return;
    const [x0, y0, x1, y1] = boundsOf(members);
    const axis = (lo, hi, size) => (hi - lo >= size - 2 * MARGIN ? size / 2 - (lo + hi) / 2 : lo < MARGIN ? MARGIN - lo : hi > size - MARGIN ? size - MARGIN - hi : 0);
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

  /* ---- rendu */
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }
  /* ---- fond et tracé : dessinés sur le canevas, avec l'effet du support */
  const cv = $("dz-canvas"), ctx = cv.getContext("2d"), RES = cv.width / VW;
  function drawCanvas() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(Supports.plate(Supports.current(), cv.width, cv.height), 0, 0);
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    const placed = items.map((it) => ({ it, paths: byName(it.name).strokes.map((s) => s.pts.map((p) => [p[0] + it.x, p[1] + it.y])) }));
    if ($("dz-strata").checked) {
      ctx.save(); ctx.lineCap = "butt"; ctx.lineJoin = "miter"; ctx.miterLimit = 3; ctx.lineWidth = D.strokeWidth;
      placed.forEach(({ it, paths }) => {
        ctx.strokeStyle = it.color; ctx.globalAlpha = 0.88;
        ctx.beginPath();
        paths.forEach((p) => p.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]))));
        ctx.stroke();
      });
      ctx.restore();
    } else if (placed.length) {
      Supports.engrave(ctx, placed.reduce((a, x) => a.concat(x.paths), []), D.strokeWidth, Supports.current(), { cap: "butt" });
    }
  }

  /* ---- rendu : le SVG ne porte que l'interaction (zones de prise, ancrages, sélection) */
  function selectionRect(gr, stroke, extra) {
    const [x0, y0, x1, y1] = D.bbox;
    el("rect", Object.assign({ x: x0 - 22, y: y0 - 14, width: x1 - x0 + 44, height: y1 - y0 + 28, fill: "none", stroke, "stroke-dasharray": "6 5", rx: 4, class: "ui", "pointer-events": "none" }, extra), gr);
  }
  function render() {
    drawCanvas();
    svg.innerHTML = "";
    el("rect", { width: VW, height: VH, fill: "transparent", id: "dz-bg" }, svg);
    const grp = selMembers();
    items.forEach((it) => {
      const gr = el("g", { transform: "translate(" + it.x + " " + it.y + ")", "data-id": it.id, style: "cursor:" + (drag && drag.it === it ? "grabbing" : "grab") }, svg);
      byName(it.name).strokes.forEach((s) => {
        el("polyline", { points: s.pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "transparent", "stroke-width": 34, "pointer-events": "stroke", class: "ui" }, gr);
      });
      if (sel.has(it.id)) {
        selectionRect(gr, "#fff", { "stroke-width": 2 });
        selectionRect(gr, "#20201E", { "stroke-width": 1.4, "stroke-dashoffset": 5 });
      } else if (grp.includes(it)) {
        selectionRect(gr, LINK_COLOR, { "stroke-width": 1.6 });
      }
      const linked = linkedPoints(it);
      anchors(it.name).forEach((a, pi) => {
        const isLink = linked.has(pi);
        if (!isLink && !(magnet() && it.snap)) return;
        el("circle", { cx: a[0], cy: a[1], r: 10, fill: "transparent", class: "ui", "data-pt": pi, style: "cursor:pointer" }, gr);   // zone de clic
        el("circle", { cx: a[0], cy: a[1], r: isLink ? 7 : 5, fill: isLink ? LINK_COLOR : "#fff", stroke: isLink ? "#fff" : "#20201E", "stroke-width": isLink ? 2.4 : 1.8, class: "ui", "pointer-events": "none" }, gr);
      });
    });
    if (marquee && marquee.moved) {
      const m = marqueeRect();
      el("rect", { x: m[0], y: m[1], width: m[2] - m[0], height: m[3] - m[1], class: "marquee" }, svg);
    }
    if (snapMark) {
      el("circle", { cx: snapMark[0], cy: snapMark[1], r: 13, fill: "none", stroke: "#fff", "stroke-width": 3, class: "ui", "pointer-events": "none" }, svg);
      el("circle", { cx: snapMark[0], cy: snapMark[1], r: 13, fill: "none", stroke: "#2a140a", "stroke-width": 1.4, class: "ui", "pointer-events": "none" }, svg);
    }
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
        '<label><input type="checkbox"' + (it.snap ? " checked" : "") + "> Aimant</label>" +
        '<button class="rm" title="Retirer" aria-label="Retirer ' + it.name + '">✕</button>';
      li.addEventListener("click", (e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) { if (sel.has(it.id)) sel.delete(it.id); else sel.add(it.id); } else sel = new Set([it.id]); render(); });
      li.querySelector("label").addEventListener("click", (e) => e.stopPropagation());
      li.querySelector("input").addEventListener("change", (e) => { record(); it.snap = e.target.checked; render(); });
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
    record();
    const used = items.map((i) => i.color);
    const it = { id: nextId++, name, x: 0, y: 0, snap: true, keep: null, color: COLORS.find((c) => !used.includes(c)) || COLORS[0] };
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
    record();
    items = items.filter((i) => !ids.includes(i.id));
    links = links.filter((l) => !ids.includes(l.a) && !ids.includes(l.b));
    ids.forEach((id) => sel.delete(id));
    say(""); render();
  }

  /* ---- liaison : un clic sur un point d'ancrage lie les runes dont les points se touchent (un second clic délie) */
  function clickAnchor(it, pi) {
    const own = links.filter((l) => (l.a === it.id && l.pa === pi) || (l.b === it.id && l.pb === pi));
    if (own.length) { record(); links = links.filter((l) => !own.includes(l)); say("Liaison retirée."); render(); return; }
    const a = abs(it)[pi], partners = [];
    items.forEach((o) => {
      if (o === it) return;
      abs(o).forEach((b, pj) => { if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= LINK_R) partners.push([o, pj, b]); });
    });
    if (!partners.length) { say("Aucun point d'une autre rune à cet endroit : amène deux points d'ancrage l'un sur l'autre (l'aimant aide), puis clique dessus."); return; }
    record();
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
    return byName(it.name).strokes.some((s) => s.pts.some((p, i) => {
      const a = [p[0] + it.x, p[1] + it.y];
      if (!i) return inside(a[0], a[1]);
      const q = s.pts[i - 1], b = [q[0] + it.x, q[1] + it.y], n = Math.max(1, Math.ceil(Math.hypot(a[0] - b[0], a[1] - b[1]) / 5));
      for (let k = 0; k <= n; k++) if (inside(b[0] + ((a[0] - b[0]) * k) / n, b[1] + ((a[1] - b[1]) * k) / n)) return true;
      return false;
    }));
  }
  svg.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
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
    items = items.filter((i) => i !== it).concat(it);        // passe au premier plan
    if (!sel.has(it.id)) sel = new Set([it.id]);             // une rune de la sélection multiple entraîne les autres
    svg.setPointerCapture(e.pointerId);
    const members = selMembers(), [px, py] = svgPoint(e);
    drag = { it, members, starts: members.map((m) => [m.x, m.y]), px, py, cx: e.clientX, cy: e.clientY, moved: false, pt: e.target.dataset.pt === undefined ? null : Number(e.target.dataset.pt) };
    render();
  });
  svg.addEventListener("pointermove", (e) => {
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
    if (!drag.moved) record();                               // un déplacement = une seule étape d'historique
    drag.moved = true;
    const [px, py] = svgPoint(e);
    drag.members.forEach((m, i) => { m.x = drag.starts[i][0] + px - drag.px; m.y = drag.starts[i][1] + py - drag.py; });
    settle(drag.members);
    render();
  });
  const endDrag = (e) => {
    if (marquee) {
      const was = marquee.moved;
      marquee = null;
      if (was) say(sel.size > 1 ? sel.size + " runes sélectionnées : glisse l'une d'elles pour les déplacer ensemble, Suppr pour les retirer." : sel.size ? "" : "Aucune rune dans le cadre.");
      render();
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null; snapMark = null;
    if (!d.moved && d.pt === null && sel.size > 1) sel = new Set([d.it.id]);   // simple clic sur une rune : elle seule reste sélectionnée
    if (!d.moved && d.pt !== null && e.type === "pointerup") clickAnchor(d.it, d.pt);
    else render();
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", (e) => {
    if ($("design").hidden) return;
    if ((e.target.matches && e.target.matches("input, select, textarea"))) return;
    if (e.key === "Escape") {                                // Échap : désélectionne d'abord, puis quitte le mode étendu
      if (sel.size) { sel = new Set(); render(); } else if (expanded) setExpanded(false);
      return;
    }
    if (!sel.size) return;
    const members = selMembers();
    if (!members.length) return;
    const step = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); if (!nudgeTimer) record(); clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => { nudgeTimer = null; }, 500); members.forEach((m) => { m.x += mv[0]; m.y += mv[1]; }); fit(members); render(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeMany([...sel]); }

  });

  /* ---- centrage : la sélection (rune ou ensemble) ou toute la composition */
  $("dz-center").addEventListener("click", () => {
    const g = selMembers();
    if (!g.length) { say("Sélectionne d'abord une rune."); return; }
    record();
    centerOn(g); fit(g);
    say(g.length > 1 ? (sel.size > 1 ? "Sélection de " + g.length + " runes centrée." : "Ensemble de " + g.length + " runes centré.") : "« " + g[0].name + " » centrée.");
    render();
  });
  $("dz-center-all").addEventListener("click", () => {
    if (!items.length) return;
    record();
    centerOn(items); fitAll();
    say("Composition centrée.");
    render();
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
  $("dz-clear").addEventListener("click", () => { if (!items.length) return; record(); items = []; links = []; sel = new Set(); say(""); render(); });
  $("dz-undo").addEventListener("click", undo);
  $("dz-redo").addEventListener("click", redo);
  window.addEventListener("keydown", (e) => {                // Ctrl+Z / Ctrl+Y (Ctrl+Maj+Z) dans l'onglet Bindrune
    if ($("design").hidden || (e.target.matches && e.target.matches("input, select, textarea"))) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "a") { e.preventDefault(); sel = new Set(items.map((i) => i.id)); say(items.length > 1 ? "Toutes les runes sont sélectionnées." : ""); render(); return; }
    if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
  });

  /* ---- mode étendu : la conception occupe toute la fenêtre, plaque agrandie (Échap pour en sortir) */
  let expanded = false;
  function setExpanded(on) {
    expanded = on;
    $("design").classList.toggle("expanded", on);
    document.body.style.overflow = on ? "hidden" : "";
    $("dz-expand").textContent = on ? "✕ Quitter le mode étendu" : "⤢ Mode étendu";
    $("dz-expand").setAttribute("aria-pressed", String(on));
    if (on) $("design").scrollTop = 0;
  }
  $("dz-expand").addEventListener("click", () => setExpanded(!expanded));
  window.addEventListener("hashchange", () => { if (expanded && $("design").hidden) setExpanded(false); });

  /* ---- export PNG : la composition est d'abord centrée ; le canevas seul (pas d'ancrages ni de sélection) */
  $("dz-export").addEventListener("click", () => {
    if (!items.length) { say("Ajoute au moins une rune avant d'exporter."); return; }
    record();
    centerOn(items); fitAll();
    render();
    say("Composition centrée avant l'export.");
    cv.toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = "bindrune-" + Supports.current() + ".png"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
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
      d.className = "bring";
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
        record();
        it.keep = next.length === flat.length ? null : next;
        say(""); render();
      }));
      box.appendChild(d);
    });
  }

  /* ---- complexité : voir complexity.js */
  function renderComplexity() {
    const box = $("dz-complexity");
    if (!items.length) { box.innerHTML = '<p class="hint">Pose des runes pour évaluer la complexité de la bindrune.</p>'; return; }
    const c = Complexity.rate(platesD());
    box.innerHTML = '<p class="cplx-head"><strong>' + c.level + "</strong> · " + c.score + ' / 100</p><div class="cplx-bar"><i style="width:' + c.score + '%"></i></div><ul>' +
      c.parts.map((p) => "<li><span>" + p.label + " <small>(" + p.detail + ")</small></span><b>" + p.pts + " / " + p.max + "</b></li>").join("") + "</ul>" +
      (c.oppositions.length ? '<p class="hint">Sens qui s\'opposent : ' + c.oppositions.map((o) => o.runes[0] + " (" + Tags.label(o.tags[0]) + ") et " + o.runes[1] + " (" + Tags.label(o.tags[1]) + ") : " + o.families[0] + " contre " + o.families[1]).join(" ; ") + ".</p>" : "") +
      '<p class="hint">Évaluation du site (nombre de runes, difficulté de tracé, traits, répétitions, sens opposés) : un repère pour comparer, pas une règle du livre.</p>';
  }

  /* ---- fiche A4 de la composition en cours (PNG ou PDF) */
  ["png", "pdf"].forEach((kind) => $("dz-sheet-" + kind).addEventListener("click", async () => {
    if (!items.length) { say("Ajoute au moins une rune avant de créer la fiche."); return; }
    const d = Bindrunes.validate(snapshot());
    if (!d) { say("Composition invalide."); return; }
    say("Création de la fiche…");
    try {
      await Sheet.download({ name: Bindrunes.cleanName($("sv-name").value) || "Sans nom", description: Bindrunes.cleanDesc($("sv-desc").value), tags: Tags.extras(d, svTags), d }, kind);
      say("Fiche prête (" + kind.toUpperCase() + ").");
    } catch (e) { say("Fiche impossible : " + e.message); }
  }));

  /* ---- enregistrement : liste, renommage, partage et import se gèrent dans l'onglet « Mes bindrunes » */
  const platesD = () => ({ r: items.map((i) => ({ n: i.name, t: i.keep })) });   // runes et sens gardés, pour les étiquettes
  let svTags = [];                                           // étiquettes choisies (les verrouillées se déduisent des runes posées)
  const tagEd = Tags.editor({ locked: () => Tags.derive(platesD()), get: () => svTags, set: (t) => { svTags = Tags.extras(platesD(), t); } });
  $("sv-tags").appendChild(tagEd.el);
  const svmsg = (t) => { $("sv-msg").textContent = t; };
  const snapshot = () => ({
    r: items.map((i) => Object.assign({ n: i.name, x: Math.round(i.x * 10) / 10, y: Math.round(i.y * 10) / 10, m: i.snap ? 1 : 0, c: i.color }, i.keep ? { t: i.keep } : {})),
    s: Supports.current(), t: $("dz-strata").checked ? 1 : 0,
    l: links.map((k) => [items.findIndex((i) => i.id === k.a), items.findIndex((i) => i.id === k.b), k.pa, k.pb]),
  });
  function restore(raw) {
    const d = Bindrunes.validate(raw);
    if (!d) return false;
    record();
    items = d.r.map((e) => ({ id: nextId++, name: e.n, x: e.x, y: e.y, snap: e.m !== 0, keep: Array.isArray(e.t) ? e.t : null, color: e.c }));
    links = (d.l || []).map(([i, j, pa, pb]) => ({ a: items[i].id, pa, b: items[j].id, pb }));
    fitAll();
    sel = new Set(); snapMark = null;
    $("dz-adv").checked = items.length > 4 || hasDuplicates();
    $("dz-strata").checked = d.t === 1;
    Supports.set(d.s);
    say(""); render();
    return true;
  }
  function openSaved(name, d, description, tags) {
    if (restore(d)) { $("sv-name").value = name; $("sv-desc").value = description || ""; svTags = Tags.extras(platesD(), tags); tagEd.refresh(); svmsg("« " + name + " » ouverte."); window.showTab("design"); }
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
  $("sv-save").addEventListener("click", () => {
    const name = Bindrunes.cleanName($("sv-name").value);
    if (!name) { svmsg("Donne un nom à ta bindrune."); return; }
    if (!items.length) { svmsg("Ajoute au moins une rune avant d'enregistrer."); return; }
    if (!Tags.all(platesD(), svTags).length) { svmsg("Garde au moins une étiquette : coche un sens d'une rune ou ajoute une étiquette."); return; }
    const old = Bindrunes.get(name);
    if (old && !confirm("« " + old.name + " » existe déjà. La remplacer ?")) return;
    if (!Bindrunes.save(name, snapshot(), $("sv-desc").value, svTags)) { svmsg("Enregistrement impossible : le stockage du navigateur est indisponible."); return; }
    const done = "« " + name + " » enregistrée (onglet « Mes bindrunes »).";
    svmsg(done);
    Bindrunes.duplicateNotice(name, snapshot()).then((t) => { if (t && $("sv-msg").textContent === done) svmsg(done + " " + t); });
  });
  $("sv-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("sv-save").click(); });

  render();
  window.__designer = { setExpanded, getSel: () => [...sel], setSel: (ids) => { sel = new Set(ids); render(); }, touches, undo, redo, historySize: () => [past.length, future.length], add, getItems: () => items, getLinks: () => links, clickAnchor, groupOf, boundsOf, settle, snapshot, restore, setMagnet: (v) => { $("dz-magnet").checked = v; render(); } };
})();
