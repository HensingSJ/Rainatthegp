// Browser: re-renders with the viewer's time zone and language, runs the countdown and the rain.
(function () {
  const D = JSON.parse(document.getElementById("wir-data").textContent);
  const W = globalThis.WIR, $ = (id) => document.getElementById(id);
  const lang = D.lang || "en";
  let sel = "W", lastWord = "";

  function renderHero(animate) {
    const h = W.hero(D, Date.now(), sel, lang);
    $("hero").dataset.v = h.v;
    $("q").textContent = h.q;
    const w = $("word"), key = lang + h.v;
    if (key !== lastWord) {
      w.innerHTML = W.wordHTML(h.word);
      w.classList.toggle("long", h.word.replace("­", "").length > 5);
      w.classList.remove("swap"); void w.offsetWidth;
      if (animate) w.classList.add("swap");
      lastWord = key;
    }
    $("pct").textContent = h.pct;
    $("pctBox").hidden = h.pct === "–";
    $("pctLab").textContent = h.pctLab;
    $("note").innerHTML = h.note;
    rainTarget = h.rain;
  }
  function renderLists() {
    const t = W.T[lang], now = Date.now();
    if ($("lane")) {
      $("days").innerHTML = W.daysHTML(D, lang);
      $("lane").innerHTML = W.laneHTML(D, now, sel, lang);
      $("legend").innerHTML = W.legendHTML(lang);
    }
    $("h-wk") && ($("h-wk").textContent = t.wk);
    $("h-sessions").textContent = t.sessions;
    $("tower").innerHTML = W.towerHTML(D, now, sel, lang, undefined);
    if ($("updated") && D.state === "forecast") $("updated").textContent = t.updated(W.fDay(D.updated, lang) + " " + W.fTime(D.updated, lang));
  }
  function renderCount() {
    const c = W.countdown(D, Date.now(), lang);
    $("count").hidden = c.val === "—";
    $("cLab").textContent = c.lab;
    $("cT").innerHTML = (c.live ? '<span class="dot"></span>' : "") + c.val;
  }
  function select(code, fromLane) {
    if (D.state === "early") return;
    sel = fromLane && sel === code ? "W" : code;
    renderLists(); renderHero(true);
    if (sel !== "W" && matchMedia("(max-width:700px)").matches) $("hero").scrollIntoView({ behavior: "smooth" });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-s]"); if (b) select(b.dataset.s, b.classList.contains("blk"));
  });

  // Rain canvas: number of drops follows the chance of rain on screen
  const cv = $("rain"), cx = cv.getContext("2d");
  let Wd = 0, Hd = 0, drops = [], splash = [], rainTarget = 0, rainNow = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function size() { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); Wd = r.width; Hd = r.height; cv.width = Wd * d; cv.height = Hd * d; cx.setTransform(d, 0, 0, d, 0, 0); }
  function mk(y) { return { x: Math.random() * (Wd + 120) - 60, y: y ?? Math.random() * Hd, l: 10 + Math.random() * 18, v: 7 + Math.random() * 7, a: 0.15 + Math.random() * 0.35 }; }
  function frame() {
    rainNow += (rainTarget - rainNow) * 0.04;
    const want = Math.round(Math.pow(rainNow / 100, 1.4) * Wd * 0.55);
    while (drops.length < want) drops.push(mk(reduce ? undefined : -20));
    if (drops.length > want) drops.length = Math.max(want, 0);
    cx.clearRect(0, 0, Wd, Hd); cx.lineCap = "round"; cx.lineWidth = 1.1;
    for (const d of drops) {
      cx.strokeStyle = `rgba(210,230,255,${d.a})`;
      cx.beginPath(); cx.moveTo(d.x, d.y); cx.lineTo(d.x - d.l * 0.28, d.y + d.l); cx.stroke();
      if (!reduce) { d.y += d.v; d.x -= d.v * 0.28; if (d.y > Hd - 4) { if (Math.random() < 0.3) splash.push({ x: d.x, y: Hd - 2, r: 1, a: 0.5 }); Object.assign(d, mk(-20)); } }
    }
    for (let i = splash.length - 1; i >= 0; i--) { const s = splash[i]; cx.strokeStyle = `rgba(210,230,255,${s.a})`; cx.beginPath(); cx.ellipse(s.x, s.y, s.r * 2, s.r * 0.6, 0, 0, Math.PI * 2); cx.stroke(); s.r += 0.5; s.a -= 0.03; if (s.a <= 0) splash.splice(i, 1); }
    if (!reduce) requestAnimationFrame(frame);
  }
  addEventListener("resize", () => { size(); if (reduce) frame(); });

  renderLists(); renderHero(false); renderCount(); size();
  if (reduce) { rainNow = rainTarget; frame(); } else requestAnimationFrame(frame);
  setInterval(renderCount, 1000);
  setInterval(() => { renderLists(); renderHero(false); }, 60000);
})();
