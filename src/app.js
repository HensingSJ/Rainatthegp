// Browser: re-renders with the viewer's time zone and language, runs the countdown and the rain.
(function () {
  const D = JSON.parse(document.getElementById("wir-data").textContent);
  const W = globalThis.WIR, $ = (id) => document.getElementById(id);
  const lang = D.lang || "en";
  let sel = "W", lastWord = "", openRes = false;

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
    $("tower").innerHTML = W.towerHTML(D, now, sel, lang, undefined, openRes);
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
    const chosen = D.sessions.find((s) => s.code === sel);
    if (sel !== "W" && !(chosen && chosen.results && chosen.results.length && W.stateOf(chosen, Date.now()) === "done") && matchMedia("(max-width:700px)").matches) $("hero").scrollIntoView({ behavior: "smooth" });
  }
  // Close the race menu when clicking elsewhere or pressing Escape
  document.addEventListener("click", (e) => { const m = document.querySelector(".racemenu[open]"); if (m && !m.contains(e.target)) m.open = false; });
  document.addEventListener("keydown", (e) => { const m = document.querySelector(".racemenu[open]"); if (m && e.key === "Escape") { m.open = false; m.querySelector("summary").focus(); } });
  document.addEventListener("click", (e) => {
    const m = e.target.closest("[data-more]");
    if (m) { openRes = !openRes; renderLists(); const btn = document.querySelector("[data-more]"); if (btn) btn.focus(); return; }
    const b = e.target.closest("[data-s]"); if (b) { openRes = false; select(b.dataset.s, b.classList.contains("blk")); }
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

  // ---------- Live rain radar (LibreWXR, RainViewer-compatible) ----------
  const RADAR = {
    api: "https://api.librewxr.net/public/weather-maps.json",   // RainViewer: https://api.rainviewer.com/public/weather-maps.json
    fallbackHost: "https://api.librewxr.net",
    color: 2, opts: "1_0", maxZoom: 10,                         // RainViewer free tier: color 2 only, maxZoom 7
    credit: 'Radar: <a href="https://github.com/JoshuaKimsey/LibreWXR" rel="noopener">LibreWXR</a> (CC BY 4.0)'
  };
  const forceRadar = /[?&]radar=1/.test(location.search);
  // Sessions can run long (red flags, rain delays): keep the radar up until the result is confirmed, max 3 hours extra
  const inLiveWindow = (now) => D.sessions.some((s) => now >= W.ms(s.start) - 30 * 6e4 &&
    (now <= W.ms(s.end) + 15 * 6e4 || (!W.verifiedOut(s.outcome) && now <= W.ms(s.end) + 3 * 36e5)));
  let radar = null;
  function checkRadar() {
    if (!$("radar")) return;
    const want = forceRadar || inLiveWindow(Date.now());
    if (want && !radar) startRadar();
    $("radar").hidden = !want && !forceRadar;
  }
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((ok, fail) => {
      const css = document.createElement("link"); css.rel = "stylesheet";
      css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
      const js = document.createElement("script"); js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      js.onload = ok; js.onerror = fail; document.head.appendChild(js);
    });
  }
  async function loadFrames() {
    try {
      const r = await fetch(RADAR.api, { cache: "no-store" });
      const j = await r.json();
      const host = j.host || RADAR.fallbackHost;
      const mk = (f, future) => ({ time: f.time * 1000, future, url: `${host}${f.path}/256/{z}/{x}/{y}/${RADAR.color}/${RADAR.opts}.png` });
      const past = ((j.radar && j.radar.past) || []).map((f) => mk(f, false));
      const next = ((j.radar && j.radar.nowcast) || []).map((f) => mk(f, true));
      if (past.length) return past.concat(next);
    } catch (e) { /* fall back to the latest frame only */ }
    return [{ time: null, future: false, url: `${RADAR.fallbackHost}/v2/radar/0/256/{z}/{x}/{y}/${RADAR.color}/${RADAR.opts}.png` }];
  }
  async function startRadar() {
    radar = { layers: [], i: 0, last: 0, playing: !reduce, timer: null, map: null };
    $("radar").hidden = false;
    try { await loadLeaflet(); } catch (e) { $("rTime").textContent = W.T[lang].radarErr; return; }
    const L = window.L, c = [D.race.lat, D.race.lon];
    const map = L.map("radarMap", { scrollWheelZoom: false, minZoom: 5, maxZoom: RADAR.maxZoom, attributionControl: true }).setView(c, 8);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, className: "basemap",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a> · ' + RADAR.credit
    }).addTo(map);
    L.circleMarker(c, { radius: 7, color: "#ffffff", weight: 2, fillColor: "#e10600", fillOpacity: 1 }).addTo(map);
    radar.map = map;
    $("rPlay").onclick = () => { radar.playing = !radar.playing; setPlay(); tick(); };
    $("rSlider").oninput = (e) => { pause(); show(+e.target.value); };
    $("rPrev").onclick = () => { pause(); show(Math.max(0, radar.i - 1)); };
    $("rNext").onclick = () => { pause(); show(Math.min(radar.layers.length - 1, radar.i + 1)); };
    await refreshFrames();
    setInterval(refreshFrames, 10 * 6e4);
    setPlay(); tick();
  }
  async function refreshFrames() {
    const keep = radar.layers[radar.i] && radar.layers[radar.i].time;
    const frames = await loadFrames();
    for (const l of radar.layers) radar.map.removeLayer(l.layer);
    radar.layers = frames.map((f) => ({ time: f.time, future: f.future, layer: window.L.tileLayer(f.url, { opacity: 0, maxNativeZoom: RADAR.maxZoom, maxZoom: RADAR.maxZoom, zIndex: 5 }).addTo(radar.map) }));
    radar.last = Math.max(0, radar.layers.map((l) => l.future).lastIndexOf(false));
    const sl = $("rSlider"), n = radar.layers.length;
    sl.max = String(Math.max(0, n - 1)); sl.disabled = n < 2;
    const p = n > 1 ? ((radar.last + 0.5) / (n - 1)) * 100 : 100; // where the forecast part starts
    sl.style.setProperty("--fc", Math.min(100, p) + "%");
    const again = radar.layers.findIndex((l) => l.time === keep);
    show(!radar.playing && again >= 0 ? again : radar.last);
  }
  function show(i) {
    radar.i = i;
    radar.layers.forEach((l, k) => l.layer.setOpacity(k === i ? 0.75 : 0));
    const f = radar.layers[i], t = W.T[lang];
    $("rSlider").value = String(i);
    let label = t.radarNow;
    if (f && f.time) {
      label = W.fTime(f.time, lang);
      if (f.future) label += " · " + t.radarFc(Math.round((f.time - radar.layers[radar.last].time) / 6e4));
      else if (i === radar.last) label += " · " + t.radarNow;
    }
    $("rTime").textContent = label;
    $("radar").classList.toggle("future", !!(f && f.future));
  }
  function tick() {
    clearTimeout(radar.timer);
    if (!radar.playing) return;
    if (radar.layers.length > 1) show((radar.i + 1) % radar.layers.length);
    const end = radar.i === radar.layers.length - 1 || (radar.i === radar.last && radar.last === radar.layers.length - 1);
    radar.timer = setTimeout(tick, end ? 2000 : radar.i === radar.last ? 1400 : 600);
  }
  function pause() { if (radar.playing) { radar.playing = false; setPlay(); } }
  function setPlay() {
    const b = $("rPlay"); b.textContent = radar.playing ? W.T[lang].radarPause : W.T[lang].radarPlay; b.setAttribute("aria-pressed", String(radar.playing));
    if (!radar.playing) clearTimeout(radar.timer);
  }

  renderLists(); renderHero(false); renderCount(); size(); checkRadar();
  setInterval(checkRadar, 60000);
  if (reduce) { rainNow = rainTarget; frame(); } else requestAnimationFrame(frame);
  setInterval(renderCount, 1000);
  setInterval(() => { renderLists(); renderHero(false); }, 60000);
})();
