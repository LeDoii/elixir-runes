/* Les runes : galerie et dessin libre (fan-made, non affilié à l'équipe d'Elixir RP). */
(function () {
  "use strict";
  const D = window.RUNES, S = window.RuneScoring;
  const W = 720, SCALE = 1.3;
  const GRID_CX = 256, GRID_CY = 256;                       // centre de la grille commune (colonne 2, ligne 6)
  const map = (p) => [(p[0] - GRID_CX) * SCALE + W / 2, (p[1] - GRID_CY) * SCALE + W / 2];
  const byName = (n) => D.runes.find((r) => r.name === n);
  const $ = (id) => document.getElementById(id);
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
  const FREE_TOL = { t0: 9, t1: 40 };                        // tolérances larges : dessin à main levée
  const MODEL_TOL = { t0: 6, t1: 30 };

  /* ------------------------------------------------------------------ SVG d'une rune */
  function runeSVG(rune, opts) {
    opts = opts || {};
    const paths = rune.strokes.map((s, i) =>
      '<polyline class="' + (opts.animate ? "draw" + (opts.force ? " force" : "") : "") + '" pathLength="1" points="' + s.pts.map((p) => p.join(",")).join(" ") +
      '" fill="none" stroke="' + (opts.color || "#20201E") + '" stroke-width="' + D.strokeWidth +
      '" stroke-linecap="butt" stroke-linejoin="miter" style="animation-delay:' + (i * 0.45) + 's"/>').join("");
    return '<svg viewBox="120 24 272 464" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rune ' + rune.name + '">' + paths + "</svg>";
  }

  /* ------------------------------------------------------------------ onglets */
  const tabs = { runes: $("tab-runes"), draw: $("tab-draw"), design: $("tab-design") };
  const HASH = { runes: "#", draw: "#dessin", design: "#concepteur" };
  function show(which) {
    Object.keys(tabs).forEach((k) => {
      tabs[k].setAttribute("aria-selected", String(k === which));
      $(k).hidden = k !== which;
    });
    history.replaceState(null, "", HASH[which]);
  }
  tabs.runes.addEventListener("click", () => show("runes"));
  tabs.draw.addEventListener("click", () => show("draw"));
  tabs.design.addEventListener("click", () => show("design"));

  /* ------------------------------------------------------------------ galerie et fiche */
  const gallery = $("gallery"), dlg = $("dlg");
  const DIFF = window.DIFFICULTY || {};
  const LEVELS = ["Très facile", "Facile", "Moyen", "Difficile", "Très difficile"];
  const pips = (lvl) => '<span class="pips" aria-hidden="true">' + [1, 2, 3, 4, 5].map((i) => '<i' + (i <= lvl ? ' class="on"' : "") + "></i>").join("") + "</span>";
  let current = null;
  /** Rejoue le tracé de la rune d'une carte, trait par trait (volontairement même si le système réduit les animations). */
  function playTrace(card) {
    card.querySelectorAll("svg polyline").forEach((pl, i) => {
      pl.getAnimations().forEach((a) => a.cancel());
      pl.animate([{ strokeDasharray: "1", strokeDashoffset: "1" }, { strokeDasharray: "1", strokeDashoffset: "0" }],
        { duration: 600, delay: i * 250, easing: "ease", fill: "backwards" });
    });
  }
  function renderGallery() {
    const sort = $("gallery-sort").value;
    const list = D.runes.slice();
    if (sort !== "lib") list.sort((a, b) => (DIFF[a.name].rank - DIFF[b.name].rank) * (sort === "easy" ? 1 : -1));
    gallery.innerHTML = "";
    list.forEach((r) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      const d = DIFF[r.name];
      b.className = "card";
      b.innerHTML = runeSVG(r) + '<span class="nm">' + r.name + '</span><span class="gl">' + r.glyph + "</span>" +
        (d ? pips(d.level) + '<span class="lv">' + LEVELS[d.level - 1] + (sort !== "lib" ? " · n° " + d.rank : "") + "</span>" : "");
      b.addEventListener("click", () => openRune(r.name));
      const play = () => playTrace(b);
      b.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") play(); });
      b.addEventListener("focus", play);
      li.appendChild(b);
      gallery.appendChild(li);
    });
  }
  $("gallery-sort").addEventListener("change", renderGallery);
  renderGallery();
  function openRune(name) {
    current = byName(name);
    $("dlg-glyph").textContent = current.glyph;
    $("dlg-name").textContent = current.name;
    const d = DIFF[name];
    $("dlg-diff").innerHTML = d ? pips(d.level) + " " + LEVELS[d.level - 1] + " · n° " + d.rank + " sur 24 en difficulté" : "";
    $("dlg-sens").innerHTML = current.sens.map((t) => "<li>" + t + "</li>").join("");
    $("dlg-parts").innerHTML = current.strokes.map((s) => "<li>" + s.name + "</li>").join("");
    replay();
    if (!dlg.open) dlg.showModal();
  }
  function replay(force) { $("dlg-svg").innerHTML = runeSVG(current, { animate: true, force: force === true, color: "#2a140a" }); }
  $("dlg-replay").addEventListener("click", () => replay(true));   // demande explicite : on anime même si le système réduit les animations
  $("dlg-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  $("dlg-train").addEventListener("click", () => { dlg.close(); setModel(current.name); show("draw"); });

  /* ------------------------------------------------------------------ dessin libre */
  const cv = $("canvas"), g = cv.getContext("2d");
  const els = {
    model: $("model"), help: $("help"), fieldHelp: $("field-help"), align: $("align"), msg: $("msg"),
    send: $("send"), fieldSend: $("field-send"), freeRetry: $("free-retry"), undo: $("btn-undo"), clear: $("btn-clear"), engrave: $("btn-engrave"), retry: $("btn-retry"),
    outFree: $("out-free"), outModel: $("out-model"), top: $("free-top"), hint: $("free-hint"), list: $("free-list"), open: $("free-open"),
    total: $("score-total"), verdict: $("score-verdict"), cov: $("score-cov"), prec: $("score-prec"), best: $("best"),
  };
  els.model.innerHTML = '<option value="">Aucun : chercher la rune la plus proche</option>' +
    D.runes.map((r) => '<option value="' + r.name + '">' + r.glyph + "  " + r.name + "</option>").join("");

  let strokes = [], cur = null, locked = false, overlay = null, burn = null;
  let centered = false, sent = false, ranking = [], preview = null;                          // preview : nom de la rune superposée (sans modèle)

  function strokePath(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
  }
  function drawModel(ctx, rune, color, alpha, tf) {
    let paths = rune.strokes.map((s) => s.pts.map(map));
    let width = D.strokeWidth * SCALE;
    if (tf) {                                                 // modèle recalé sur le dessin
      paths = paths.map((p) => p.map(([x, y]) => [(x - tf.rcx) / tf.k + tf.ucx, (y - tf.rcy) / tf.k + tf.ucy]));
      width /= tf.k;
      const all = paths.flat(), M = 14;                       // le masque reste toujours entièrement dans le cadre
      const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
      const y0 = Math.min(...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
      const sc = Math.min(1, (W - 2 * M) / Math.max(x1 - x0, 1), (W - 2 * M) / Math.max(y1 - y0, 1));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const nx = Math.min(W - M - ((x1 - x0) * sc) / 2, Math.max(M + ((x1 - x0) * sc) / 2, cx));
      const ny = Math.min(W - M - ((y1 - y0) * sc) / 2, Math.max(M + ((y1 - y0) * sc) / 2, cy));
      paths = paths.map((p) => p.map(([x, y]) => [(x - cx) * sc + nx, (y - cy) * sc + ny]));
      width *= sc;
    }
    ctx.save();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineCap = "butt"; ctx.lineJoin = "miter"; ctx.miterLimit = 3;
    paths.forEach((p) => strokePath(ctx, p));
    ctx.restore();
  }
  function truncate(pts, upto) {                              // début du tracé, sur une longueur donnée (animation de gravure)
    let remaining = upto;
    const path = [pts[0]];
    for (let i = 1; i < pts.length && remaining > 0; i++) {
      const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (len <= remaining) { path.push(pts[i]); remaining -= len; }
      else {
        const k = remaining / len;
        path.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]);
        remaining = 0;
      }
    }
    return path;
  }
  const strokeLen = (s) => s.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0);
  const modelRune = () => (els.model.value ? byName(els.model.value) : null);

  function render() {
    g.clearRect(0, 0, W, W);
    g.drawImage(Supports.plate(Supports.current(), W, W), 0, 0);
    const m = modelRune();
    if (m && !overlay) {
      if (els.help.value === "guide") { const gd = Supports.guide(false); drawModel(g, m, gd.color, gd.alpha); }
      else if (els.help.value === "faint") { const gd = Supports.guide(true); drawModel(g, m, gd.color, gd.alpha); }
    }
    if (!m && preview && ranking.length) {                   // masque calé sur le dessin, qui reste proche de la taille standard
      const hit = ranking.find((r) => r.name === preview), gd = Supports.guide(false);
      if (hit) drawModel(g, byName(preview), gd.color, gd.alpha, hit.fit);
    }
    const list = overlay ? overlay.aligned : strokes.concat(cur ? [cur] : []);
    const paths = [];
    list.forEach((s, si) => {
      if (s.length < 2) return;
      paths.push(burn ? truncate(s, Math.max(0, burn.progress * burn.total - burn.offsets[si])) : s);
    });
    if (paths.length) Supports.engrave(g, paths, overlay ? 8 : 7, Supports.current(), { cap: "round" });
    if (overlay && overlay.showDiff) {
      g.save();
      g.strokeStyle = "rgba(61,92,140,.85)"; g.lineWidth = 1.6; g.setLineDash([6, 5]);
      m.strokes.forEach((s) => strokePath(g, s.pts.map(map)));
      g.setLineDash([]);
      g.fillStyle = "rgba(200,30,30,.8)";
      overlay.missed.forEach((p) => { g.beginPath(); g.arc(p.x, p.y, 4, 0, Math.PI * 2); g.fill(); });
      g.strokeStyle = "rgba(200,30,30,.9)"; g.lineWidth = 2;
      overlay.excess.forEach((p) => { g.beginPath(); g.moveTo(p.x - 4, p.y - 4); g.lineTo(p.x + 4, p.y + 4); g.moveTo(p.x + 4, p.y - 4); g.lineTo(p.x - 4, p.y + 4); g.stroke(); });
      g.restore();
    }
  }

  /* ---- reconnaissance (sans modèle) */
  const sendMode = () => !modelRune() && els.send.checked;
  function updateRanking() {
    els.freeRetry.hidden = !sent;
    if (sendMode() && !sent) {                                // la recherche attend l'envoi de la gravure
      ranking = []; preview = null; els.list.innerHTML = "";
      els.top.textContent = "—"; els.hint.textContent = "Dessine la rune, puis envoie la gravure pour lancer la recherche.";
      els.open.hidden = true; render(); return;
    }
    ranking = S.recognize(D.runes, map, strokes, Object.assign({ align: true }, FREE_TOL));
    els.list.innerHTML = "";
    if (!ranking.length) {
      els.top.textContent = "—"; els.hint.textContent = "Dessine une rune pour lancer la recherche.";
      els.open.hidden = true; preview = null; render(); return;
    }
    const best = ranking[0];
    els.top.textContent = best.name;
    const plural = (n, w) => n + " " + w + (n > 1 ? "s" : "");
    els.hint.textContent = (best.total >= 70 ? "Correspondance : " + Math.round(best.total) + " %."
      : "Correspondance faible (" + Math.round(best.total) + " %) : le dessin ne ressemble clairement à aucune rune.") +
      " Ton dessin compte " + plural(best.userShapes, "forme") + " et " + plural(best.userLoops, "boucle") + ".";
    if (!preview || !ranking.some((r) => r.name === preview)) preview = best.name;
    if (!centered) {                                          // recentrage au premier trait seulement
      const fitted = S.score(byName(preview), map, strokes, Object.assign({ align: true }, FREE_TOL));
      if (fitted) {
        strokes = fitted.aligned; centered = true;
        ranking = S.recognize(D.runes, map, strokes, Object.assign({ align: true }, FREE_TOL));
      }
    }
    ranking.slice(0, 5).forEach((r) => {
      const li = document.createElement("li");
      li.setAttribute("aria-current", String(r.name === preview));
      li.innerHTML = '<span class="name">' + r.name + '</span><span class="track"><span class="fill" style="width:' + Math.round(r.total) +
        '%"></span></span><span class="val">' + Math.round(r.total) + " %</span>";
      li.addEventListener("click", () => { preview = r.name; updateRanking(); });
      els.list.appendChild(li);
    });
    els.open.hidden = false;
    els.open.textContent = "Ouvrir la fiche de " + preview;
    render();
  }
  els.open.addEventListener("click", () => openRune(preview));

  /* ---- modèle choisi */
  function setModel(name) {
    els.model.value = name;
    onModelChange();
  }
  function onModelChange() {
    const m = !!modelRune();
    els.fieldHelp.hidden = !m;
    els.outFree.hidden = m;
    els.outModel.hidden = true;
    overlay = null; burn = null; locked = false; sent = false;
    [els.undo, els.clear, els.engrave].forEach((b) => (b.disabled = false));
    els.msg.textContent = "";
    strokes = []; cur = null; preview = null; ranking = []; centered = false;
    syncControls();
    if (!m) updateRanking(); else render();
  }
  function syncControls() {                                   // bouton d'envoi / de gravure selon le mode
    const m = !!modelRune();
    els.fieldSend.hidden = m;
    els.engrave.hidden = !(m || els.send.checked);
    els.engrave.textContent = m ? "Graver" : "Envoyer la gravure";
  }
  els.send.addEventListener("change", () => {
    try { localStorage.setItem("runes-send", els.send.checked ? "1" : "0"); } catch (e) { /* ignoré */ }
    sent = false; locked = false; overlay = null; burn = null; centered = false; preview = null; ranking = [];
    [els.undo, els.clear, els.engrave].forEach((b) => (b.disabled = false));
    els.msg.textContent = "";
    syncControls(); updateRanking();
  });
  els.freeRetry.addEventListener("click", () => {
    sent = false; locked = false; centered = false; preview = null; ranking = []; strokes = [];
    [els.undo, els.clear, els.engrave].forEach((b) => (b.disabled = false));
    els.msg.textContent = "";
    updateRanking();
  });
  Supports.bindSelect($("support"), $("support-note"));
  Supports.onChange(render);
  els.model.addEventListener("change", onModelChange);
  els.help.addEventListener("change", render);

  /* ---- saisie */
  function pos(e) {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * W];
  }
  cv.addEventListener("pointerdown", (e) => {
    if (locked) return;
    cv.setPointerCapture(e.pointerId);
    cur = [pos(e)];
    els.msg.textContent = "";
    render();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!cur) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach((ev) => {
      const p = pos(ev), q = cur[cur.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 2.5) cur.push(p);
    });
    render();
  });
  const end = () => {
    if (!cur) return;
    if (cur.length > 1) strokes.push(cur);
    cur = null;
    preview = null;                                          // le masque suit à nouveau la meilleure correspondance
    if (!modelRune()) updateRanking(); else render();
  };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);

  function changed() { preview = null; if (!strokes.length) centered = false; els.msg.textContent = ""; if (!modelRune()) updateRanking(); else render(); }
  els.undo.addEventListener("click", () => { if (!locked) { strokes.pop(); changed(); } });
  els.clear.addEventListener("click", () => { if (!locked) { strokes = []; changed(); } });
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !$("draw").hidden && !locked) { strokes.pop(); changed(); }
  });

  /* ---- gravure et score (avec modèle) */
  function verdict(p) {
    if (p >= 95) return "Gravure remarquable.";
    if (p >= 85) return "Très bonne gravure.";
    if (p >= 70) return "Bonne gravure.";
    if (p >= 50) return "Gravure à reprendre : l'ensemble est là, la précision manque.";
    return "Encore loin du modèle.";
  }
  const bestKey = () => "runes-best-" + els.model.value + "-" + els.help.value + (els.align.checked ? "-calage" : "-libre");

  function animateBurn(aligned, done) {                       // gravure animée du tracé, puis rappel
    let acc = 0;
    const offsets = aligned.map(strokeLen).map((l) => { const o = acc; acc += l; return o; });
    burn = { total: acc, offsets, progress: 0 };
    const t0 = performance.now(), dur = Math.min(2600, 700 + acc * 2.2);
    (function frame(now) {
      burn.progress = Math.min(1, (now - t0) / dur);
      render();
      if (burn.progress < 1) requestAnimationFrame(frame);
      else { burn = null; done(); }
    })(t0);
  }

  els.engrave.addEventListener("click", () => {
    if (locked) return;
    const m = modelRune();
    if (!m) {                                                 // envoi de la gravure : recherche de la rune la plus proche
      const rk = S.recognize(D.runes, map, strokes, Object.assign({ align: true }, FREE_TOL));
      if (!rk.length) { els.msg.textContent = "Le tracé est trop court pour être envoyé."; return; }
      const fitted = S.score(byName(rk[0].name), map, strokes, Object.assign({ align: true }, FREE_TOL));
      locked = true;
      [els.undo, els.clear, els.engrave].forEach((b) => (b.disabled = true));
      overlay = { aligned: fitted.aligned, showDiff: false };
      animateBurn(fitted.aligned, () => {
        overlay = null; strokes = fitted.aligned; sent = true; centered = true; preview = null;
        updateRanking();
      });
      return;
    }
    const res = S.score(m, map, strokes, Object.assign({ align: els.align.checked }, MODEL_TOL));
    if (!res) { els.msg.textContent = "Le tracé est trop court pour être gravé."; return; }
    locked = true;
    [els.undo, els.clear, els.engrave].forEach((b) => (b.disabled = true));
    overlay = { aligned: res.aligned, missed: res.missed, excess: res.excess, showDiff: false };
    animateBurn(res.aligned, () => { overlay.showDiff = true; render(); showResult(res); });
  });

  function showResult(res) {
    const total = Math.round(res.total);
    els.outModel.hidden = false;
    const t0 = performance.now();
    (function count(now) {
      const t = Math.min(1, (now - t0) / 900);
      els.total.textContent = Math.round(total * ease(t));
      if (t < 1) requestAnimationFrame(count);
    })(t0);
    els.verdict.textContent = verdict(res.total);
    els.cov.textContent = Math.round(res.coverage) + " %";
    els.prec.textContent = Math.round(res.precision) + " %";
    let best = 0;
    try { best = parseFloat(localStorage.getItem(bestKey()) || "0"); } catch (e) { /* stockage indisponible */ }
    if (res.total > best) { best = res.total; try { localStorage.setItem(bestKey(), String(best)); } catch (e) { /* ignoré */ } }
    els.best.textContent = "Meilleur score (ce réglage) : " + Math.round(best) + " %";
    els.outModel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  els.retry.addEventListener("click", () => {
    strokes = []; overlay = null; burn = null; locked = false;
    els.outModel.hidden = true; els.msg.textContent = "";
    [els.undo, els.clear, els.engrave].forEach((b) => (b.disabled = false));
    render();
  });

  /* ------------------------------------------------------------------ démarrage */
  try { if (localStorage.getItem("runes-send") === "0") els.send.checked = false; } catch (e) { /* ignoré */ }
  syncControls(); updateRanking();
  if (location.hash === "#dessin") show("draw"); else if (location.hash === "#concepteur") show("design");
  window.__runes = { map, setStrokes: (s) => { strokes = s; changed(); }, setModel, getRanking: () => ranking, getPreview: () => preview, getStrokes: () => strokes, isSent: () => sent, engrave: () => els.engrave.click() };
})();
