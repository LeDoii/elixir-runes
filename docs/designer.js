/* Concepteur de bindrune : plusieurs runes sur une plaque, déplaçables, avec points d'ancrage magnétiques. */
(function () {
  "use strict";
  const D = window.RUNES;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const VW = 800, VH = 640;                                  // viewBox de la plaque (échelle 1 : la grille de la rune)
  const SNAP_R = 14;                                         // portée du magnétisme (unités de la plaque)
  const COLORS = ["#3D5C8C", "#7A4E7A", "#A4551F", "#2B2B2E", "#4E7A53", "#8C3D3D"];
  const byName = (n) => D.runes.find((r) => r.name === n);

  const svg = $("dz");
  let items = [], selected = null, nextId = 1, snapMark = null, drag = null;
  const maxRunes = () => ($("dz-adv").checked ? 6 : 4);
  const magnet = () => $("dz-magnet").checked;

  /* ---- ancrages : extrémités et angles de chaque trait, sans doublon */
  const anchorCache = {};
  function anchors(name) {
    if (anchorCache[name]) return anchorCache[name];
    const seen = new Set(), out = [];
    byName(name).strokes.forEach((s) => s.pts.forEach((p) => {
      const k = p[0] + "," + p[1];
      if (!seen.has(k)) { seen.add(k); out.push(p); }
    }));
    return (anchorCache[name] = out);
  }
  const abs = (it) => anchors(it.name).map((p) => [p[0] + it.x, p[1] + it.y]);

  /* ---- magnétisme : aligne le point d'ancrage le plus proche d'une autre rune */
  function snap(it, x, y) {
    snapMark = null;
    if (!magnet() || !it.snap) return [x, y];
    let best = null;
    anchors(it.name).forEach((a) => {
      const ax = a[0] + x, ay = a[1] + y;
      items.forEach((o) => {
        if (o === it || !o.snap) return;
        abs(o).forEach((b) => {
          const d = Math.hypot(b[0] - ax, b[1] - ay);
          if (d <= SNAP_R && (!best || d < best.d)) best = { d, dx: b[0] - ax, dy: b[1] - ay, at: b };
        });
      });
    });
    if (!best) return [x, y];
    snapMark = best.at;
    return [x + best.dx, y + best.dy];
  }

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
  function render() {
    drawCanvas();
    svg.innerHTML = "";
    el("rect", { width: VW, height: VH, fill: "transparent", id: "dz-bg" }, svg);
    items.forEach((it) => {
      const gr = el("g", { transform: "translate(" + it.x + " " + it.y + ")", "data-id": it.id, style: "cursor:" + (drag && drag.it === it ? "grabbing" : "grab") }, svg);
      byName(it.name).strokes.forEach((s) => {
        el("polyline", { points: s.pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "transparent", "stroke-width": 34, "pointer-events": "stroke", class: "ui" }, gr);
      });
      if (it.id === selected) {
        const [x0, y0, x1, y1] = D.bbox;
        el("rect", { x: x0 - 22, y: y0 - 14, width: x1 - x0 + 44, height: y1 - y0 + 28, fill: "none", stroke: "#fff", "stroke-dasharray": "6 5", "stroke-width": 2, rx: 4, class: "ui", "pointer-events": "none" }, gr);
        el("rect", { x: x0 - 22, y: y0 - 14, width: x1 - x0 + 44, height: y1 - y0 + 28, fill: "none", stroke: "#20201E", "stroke-dasharray": "6 5", "stroke-dashoffset": 5, "stroke-width": 1.4, rx: 4, class: "ui", "pointer-events": "none" }, gr);
      }
      if (magnet() && it.snap) {
        anchors(it.name).forEach((a) => el("circle", { cx: a[0], cy: a[1], r: 5, fill: "#fff", stroke: "#20201E", "stroke-width": 1.8, class: "ui", "pointer-events": "none" }, gr));
      }
    });
    if (snapMark) {
      el("circle", { cx: snapMark[0], cy: snapMark[1], r: 13, fill: "none", stroke: "#fff", "stroke-width": 3, class: "ui", "pointer-events": "none" }, svg);
      el("circle", { cx: snapMark[0], cy: snapMark[1], r: 13, fill: "none", stroke: "#2a140a", "stroke-width": 1.4, class: "ui", "pointer-events": "none" }, svg);
    }
    renderList();
    renderBrings();
    $("dz-count").textContent = "· " + items.length + " / " + maxRunes();
    document.querySelectorAll(".pal").forEach((b) => b.classList.toggle("full", items.length >= maxRunes()));
  }

  function renderList() {
    const ul = $("dz-list");
    ul.innerHTML = "";
    if (!items.length) { ul.innerHTML = '<li style="cursor:default;color:var(--grey2);font-style:italic">Aucune rune pour l\'instant.</li>'; return; }
    items.forEach((it) => {
      const li = document.createElement("li");
      li.setAttribute("aria-current", String(it.id === selected));
      li.innerHTML = '<i style="background:' + it.color + '"></i><span class="nm">' + it.name + "</span>" +
        '<label><input type="checkbox"' + (it.snap ? " checked" : "") + "> Aimant</label>" +
        '<button class="rm" title="Retirer" aria-label="Retirer ' + it.name + '">✕</button>';
      li.addEventListener("click", () => { selected = it.id; render(); });
      li.querySelector("label").addEventListener("click", (e) => e.stopPropagation());
      li.querySelector("input").addEventListener("change", (e) => { it.snap = e.target.checked; render(); });
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
    say("");
    const used = items.map((i) => i.color);
    const it = { id: nextId++, name, x: 0, y: 0, snap: true, color: COLORS.find((c) => !used.includes(c)) || COLORS[0] };
    const [x0, y0, x1, y1] = D.bbox;
    it.x = cx - (x0 + x1) / 2; it.y = cy - (y0 + y1) / 2;
    clamp(it);
    items.push(it);
    [it.x, it.y] = snap(it, it.x, it.y);
    snapMark = null;
    selected = it.id;
    render();
  }
  function remove(id) { items = items.filter((i) => i.id !== id); if (selected === id) selected = null; say(""); render(); }
  function clamp(it) {                                       // le centre de la rune reste dans la plaque
    const [x0, y0, x1, y1] = D.bbox, cx = (x0 + x1) / 2 + it.x, cy = (y0 + y1) / 2 + it.y;
    it.x += Math.min(VW - 20, Math.max(20, cx)) - cx;
    it.y += Math.min(VH - 20, Math.max(20, cy)) - cy;
  }

  /* ---- déplacement d'une rune sur la plaque */
  function svgPoint(e) {
    const r = svg.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * VW, ((e.clientY - r.top) / r.height) * VH];
  }
  svg.addEventListener("pointerdown", (e) => {
    const g = e.target.closest("g[data-id]");
    if (!g || !e.target.classList.contains("ui")) { if (e.target.id === "dz-bg") { selected = null; render(); } return; }
    const it = items.find((i) => i.id === Number(g.dataset.id));
    if (!it) return;
    items = items.filter((i) => i !== it).concat(it);        // passe au premier plan
    selected = it.id;
    svg.setPointerCapture(e.pointerId);
    const [px, py] = svgPoint(e);
    drag = { it, ox: it.x - px, oy: it.y - py };
    render();
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [px, py] = svgPoint(e), it = drag.it;
    it.x = px + drag.ox; it.y = py + drag.oy;
    clamp(it);
    [it.x, it.y] = snap(it, it.x, it.y);
    render();
  });
  const endDrag = () => { if (drag) { drag = null; snapMark = null; render(); } };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  window.addEventListener("keydown", (e) => {
    if ($("design").hidden || selected === null) return;
    if (e.target.matches("input, select, textarea")) return;
    const it = items.find((i) => i.id === selected);
    if (!it) return;
    const step = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); it.x += mv[0]; it.y += mv[1]; clamp(it); render(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(it.id); }
  });

  /* ---- palette : clic (ajout au centre) ou glisser-déposer sur la plaque */
  function miniSVG(r) {
    return '<svg viewBox="130 28 252 456" xmlns="http://www.w3.org/2000/svg">' + r.strokes.map((s) =>
      '<polyline points="' + s.pts.map((p) => p.join(",")).join(" ") + '" fill="none" stroke="#20201E" stroke-width="' + D.strokeWidth + '"/>').join("") + "</svg>";
  }
  const pal = $("palette");
  D.runes.forEach((r) => {
    const b = document.createElement("button");
    b.className = "pal"; b.type = "button";
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
    if (!e.target.checked && items.length > 4) {
      e.target.checked = true;
      say("Retire d'abord des runes : le mode normal est limité à 4.");
      return;
    }
    say(""); render();
  });
  $("dz-clear").addEventListener("click", () => { items = []; selected = null; say(""); render(); });

  /* ---- export PNG : le canevas seul (pas d'ancrages ni de sélection) */
  $("dz-export").addEventListener("click", () => {
    if (!items.length) { say("Ajoute au moins une rune avant d'exporter."); return; }
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
    if (!items.length) { box.innerHTML = '<p class="hint">Les runes posées sur la plaque apparaissent ici, avec leurs sens et leurs traits.</p>'; return; }
    items.forEach((it) => {
      const r = byName(it.name), d = document.createElement("div");
      d.className = "bring";
      d.innerHTML = '<h4><i style="background:' + it.color + '"></i>' + r.name + "</h4>" +
        "<h5>Sens</h5><ul>" + r.sens.map((t) => "<li>" + t + "</li>").join("") + "</ul>" +
        "<h5>Traits</h5><ul>" + r.strokes.map((s) => "<li>" + s.name + "</li>").join("") + "</ul>";
      box.appendChild(d);
    });
  }

  /* ---- bindrunes enregistrées (dans ce navigateur) et lien de partage */
  const STORE = "runes-saved";
  const readSaved = () => { try { const a = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(a) ? a.filter((x) => x && typeof x.name === "string" && x.d) : []; } catch (e) { return []; } };
  const writeSaved = (a) => { try { localStorage.setItem(STORE, JSON.stringify(a)); return true; } catch (e) { return false; } };
  const svmsg = (t) => { $("sv-msg").textContent = t; };
  const snapshot = () => ({
    r: items.map((i) => ({ n: i.name, x: Math.round(i.x * 10) / 10, y: Math.round(i.y * 10) / 10, m: i.snap ? 1 : 0, c: i.color })),
    s: Supports.current(), t: $("dz-strata").checked ? 1 : 0,
  });
  /** Valide des données venant du stockage ou d'un lien : jamais de confiance. */
  function restore(d) {
    if (!d || !Array.isArray(d.r) || !d.r.length || d.r.length > 6) return false;
    const next = [];
    for (const e of d.r) {
      if (!e || !byName(e.n) || !Number.isFinite(e.x) || !Number.isFinite(e.y) || Math.abs(e.x) > 2000 || Math.abs(e.y) > 2000) return false;
      next.push({ id: nextId++, name: e.n, x: e.x, y: e.y, snap: e.m !== 0, color: COLORS.includes(e.c) ? e.c : COLORS[next.length % COLORS.length] });
    }
    items = next; selected = null; snapMark = null;
    $("dz-adv").checked = items.length > 4;
    $("dz-strata").checked = d.t === 1;
    if (Supports.list.some((s) => s.id === d.s)) Supports.set(d.s);
    say(""); render();
    return true;
  }
  const b64 = {
    enc: (o) => { const u = new TextEncoder().encode(JSON.stringify(o)); let b = ""; u.forEach((c) => (b += String.fromCharCode(c))); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
    dec: (t) => { const b = atob(t.replace(/-/g, "+").replace(/_/g, "/")); return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))); },
  };
  function renderSaved() {
    const ul = $("sv-list"), all = readSaved().sort((a, b) => b.at - a.at);
    ul.innerHTML = "";
    if (!all.length) { ul.innerHTML = '<li style="cursor:default;color:var(--grey2);font-style:italic">Aucune bindrune enregistrée.</li>'; return; }
    all.forEach((rec) => {
      const li = document.createElement("li");
      const label = document.createElement("span"), nm = document.createElement("span"), sm = document.createElement("small");
      nm.className = "nm"; nm.textContent = rec.name;
      sm.textContent = (rec.d.r || []).map((e) => e.n).join(" · ");
      label.appendChild(nm); label.appendChild(sm);
      li.appendChild(label);
      [["Ouvrir", () => { if (restore(rec.d)) { $("sv-name").value = rec.name; svmsg("« " + rec.name + " » ouverte."); } }],
        ["Lien", () => share(rec)],
        ["Supprimer", () => { if (confirm("Supprimer « " + rec.name + " » ?")) { writeSaved(readSaved().filter((x) => x.name !== rec.name)); renderSaved(); svmsg(""); } }]].forEach(([t, fn]) => {
        const b = document.createElement("button");
        b.className = "act"; b.type = "button"; b.textContent = t; b.addEventListener("click", fn);
        li.appendChild(b);
      });
      ul.appendChild(li);
    });
  }
  function share(rec) {
    const url = location.origin + location.pathname + "#concepteur=" + b64.enc({ name: rec.name, d: rec.d });
    const done = () => svmsg("Lien copié.");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => prompt("Copie ce lien :", url));
    else prompt("Copie ce lien :", url);
  }
  $("sv-save").addEventListener("click", () => {
    const name = $("sv-name").value.trim().replace(/\s+/g, " ");
    if (!name) { svmsg("Donne un nom à ta bindrune."); return; }
    if (!items.length) { svmsg("Ajoute au moins une rune avant d'enregistrer."); return; }
    const all = readSaved(), idx = all.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
    if (idx >= 0 && !confirm("« " + all[idx].name + " » existe déjà. La remplacer ?")) return;
    const rec = { name, at: Date.now(), d: snapshot() };
    if (idx >= 0) all[idx] = rec; else all.push(rec);
    if (!writeSaved(all)) { svmsg("Enregistrement impossible : le stockage du navigateur est indisponible."); return; }
    renderSaved();
    svmsg("« " + name + " » enregistrée.");
  });
  $("sv-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("sv-save").click(); });
  renderSaved();
  const hash = window.__initialHash || "";                    // lien de partage reçu
  if (hash.indexOf("#concepteur=") === 0) {
    try {
      const shared = b64.dec(hash.slice(12));
      if (restore(shared.d)) { $("sv-name").value = String(shared.name || "").slice(0, 40); svmsg("Bindrune partagée ouverte. Enregistre-la pour la garder."); }
      else svmsg("Le lien de partage est invalide.");
    } catch (e) { svmsg("Le lien de partage est invalide."); }
  }

  render();
  window.__designer = { add, getItems: () => items, snapshot, restore, setMagnet: (v) => { $("dz-magnet").checked = v; render(); } };
})();
