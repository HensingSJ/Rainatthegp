// Shared rendering logic. Runs in Node (build: server-rendered HTML for SEO)
// and in the browser (live countdown, language toggle, session selection).
// Plain script, no imports/exports: it attaches itself to globalThis.WIR.
(function () {
  const T = {
    en: {
      yes: "Yes", maybe: "Maybe", no: "No", early: "Not yet", over: "Over", unknown: "?",
      names: { FP1: "Practice 1", FP2: "Practice 2", FP3: "Practice 3", SQ: "Sprint Qualifying", S: "Sprint", Q: "Qualifying", R: "Race", W: "Whole weekend" },
      qW: (gp) => `Will it rain at the ${gp}?`,
      qS: (n, gp) => `Will it rain during ${n.toLowerCase()} at the ${gp}?`,
      qDidW: (gp) => `Did it rain at the ${gp}?`,
      qDidS: (n, gp) => `Did it rain during ${n.toLowerCase()} at the ${gp}?`,
      pctLab: "chance of rain", pctWas: "forecast was",
      noteW: (p, n) => `Biggest risk: ${n.toLowerCase()} at ${p}%. Tap a session for its own answer.`,
      noteS: "Chance of rain at any point during the session, from the hourly forecast for the circuit.",
      noteEarly: (d) => `Forecasts this far out are guesswork. The rain chance per session appears on ${d}.`,
      noteOver: "This race weekend is over.",
      noteDid: (wet, st, km) => `${wet ? "Rain was" : "No rain was"} reported at the ${st} weather station, about ${km} km from the circuit.`,
      noteDidTrack: (wet) => `${wet ? "Rain was" : "No rain was"} measured by the circuit's own weather station.`,
      noteNoObs: "No measurement yet. Check back in an hour.",
      sumWet: (list) => `Rain during ${list}.`, sumDry: "No rain during any session.",
      sumSrc: (st, km) => `Measured at the ${st} weather station, about ${km} km from the circuit.`,
      sumSrcTrack: "Measured by the circuit's own weather station.",
      and: "and",
      nextLink: (n) => `Next up: ${n}`,
      cNext: (c) => `${c} in`, cLive: (c) => `${c} live`, cOpens: "Forecast in", cDone: "Weekend over",
      live: "Live", done: "Done", dry: "Dry", wet: "Wet", fc: (p) => `forecast ${p}%`,
      tyre: { dry: "Slicks", inter: "Inters", wet: "Wets" },
      leg: ["Dry", "Unsure", "Wet"], wk: "Weekend", sessions: "Sessions", WKD: "WKD",
      updated: (d) => `Forecast updated ${d}.`, loc: "en-GB"
    },
    nl: {
      yes: "Ja", maybe: "Mis\u00ADschien", no: "Nee", early: "Nog niet", over: "Voorbij", unknown: "?",
      names: { FP1: "Vrije training 1", FP2: "Vrije training 2", FP3: "Vrije training 3", SQ: "Sprintkwalificatie", S: "Sprint", Q: "Kwalificatie", R: "Race", W: "Heel het weekend" },
      qW: (gp) => `Gaat het regenen bij de ${gp}?`,
      qS: (n, gp) => `Gaat het regenen tijdens de ${n.toLowerCase()} van de ${gp}?`,
      qDidW: (gp) => `Heeft het geregend bij de ${gp}?`,
      qDidS: (n, gp) => `Heeft het geregend tijdens de ${n.toLowerCase()} van de ${gp}?`,
      pctLab: "kans op regen", pctWas: "verwachting was",
      noteW: (p, n) => `Grootste risico: ${n.toLowerCase()} met ${p}%. Tik op een sessie voor het antwoord per sessie.`,
      noteS: "Kans op regen op enig moment tijdens de sessie, uit de uurverwachting voor het circuit.",
      noteEarly: (d) => `Zo ver vooruit is een verwachting gokwerk. De regenkans per sessie verschijnt op ${d}.`,
      noteOver: "Dit raceweekend is voorbij.",
      noteDid: (wet, st, km) => `Weerstation ${st}, ongeveer ${km} km van het circuit, ${wet ? "meldde regen" : "meldde geen regen"}.`,
      noteDidTrack: (wet) => `Het weerstation op het circuit ${wet ? "mat regen" : "mat geen regen"}.`,
      noteNoObs: "Nog geen meting. Kijk over een uur nog eens.",
      sumWet: (list) => `Regen tijdens ${list}.`, sumDry: "Geen regen tijdens de sessies.",
      sumSrc: (st, km) => `Gemeten bij weerstation ${st}, ongeveer ${km} km van het circuit.`,
      sumSrcTrack: "Gemeten door het weerstation op het circuit.",
      and: "en",
      nextLink: (n) => `Volgende: ${n}`,
      cNext: (c) => `${c} over`, cLive: (c) => `${c} live`, cOpens: "Verwachting over", cDone: "Weekend voorbij",
      live: "Live", done: "Klaar", dry: "Droog", wet: "Regen", fc: (p) => `verwachting ${p}%`,
      tyre: { dry: "Slicks", inter: "Inters", wet: "Wets" },
      leg: ["Droog", "Twijfel", "Nat"], wk: "Weekend", sessions: "Sessies", WKD: "WKD",
      updated: (d) => `Verwachting bijgewerkt ${d}.`, loc: "nl-NL"
    },
    es: {
      yes: "Sí", maybe: "Quizás", no: "No", early: "Aún no", over: "Fin", unknown: "?",
      names: { FP1: "Libres 1", FP2: "Libres 2", FP3: "Libres 3", SQ: "Clasificación sprint", S: "Sprint", Q: "Clasificación", R: "Carrera", W: "Todo el fin de semana" },
      qW: (gp) => `¿Lloverá en el ${gp}?`,
      qS: (n, gp) => `¿Lloverá durante ${n === "Sprint" ? "la sprint" : "la " + n.toLowerCase()} del ${gp}?`,
      qDidW: (gp) => `¿Llovió en el ${gp}?`,
      qDidS: (n, gp) => `¿Llovió durante ${n === "Sprint" ? "la sprint" : "la " + n.toLowerCase()} del ${gp}?`,
      pctLab: "probabilidad de lluvia", pctWas: "la previsión era",
      noteW: (p, n) => `Mayor riesgo: ${n.toLowerCase()}, con un ${p}%. Toca una sesión para ver su respuesta.`,
      noteS: "Probabilidad de lluvia en algún momento de la sesión, según la previsión horaria del circuito.",
      noteEarly: (d) => `Con tanta antelación, una previsión es pura conjetura. La probabilidad por sesión aparece el ${d}.`,
      noteOver: "Este fin de semana de carreras ha terminado.",
      noteDid: (wet, st, km) => `La estación meteorológica de ${st}, a unos ${km} km del circuito, ${wet ? "registró" : "no registró"} lluvia.`,
      noteDidTrack: (wet) => `La estación meteorológica del circuito ${wet ? "registró" : "no registró"} lluvia.`,
      noteNoObs: "Aún no hay medición. Vuelve a mirar en una hora.",
      sumWet: (list) => `Llovió durante ${list}.`, sumDry: "No llovió en ninguna sesión.",
      sumSrc: (st, km) => `Medido en la estación de ${st}, a unos ${km} km del circuito.`,
      sumSrcTrack: "Medido por la estación meteorológica del circuito.",
      and: "y",
      nextLink: (n) => `Siguiente: ${n}`,
      cNext: (c) => `${c} en`, cLive: (c) => `${c} en directo`, cOpens: "Previsión en", cDone: "Fin de semana terminado",
      live: "En directo", done: "Terminada", dry: "Seco", wet: "Lluvia", fc: (p) => `previsión ${p}%`,
      tyre: { dry: "Slicks", inter: "Inters", wet: "Lluvia" },
      leg: ["Seco", "Dudoso", "Mojado"], wk: "Fin de semana", sessions: "Sesiones", WKD: "FDS",
      updated: (d) => `Previsión actualizada ${d}.`, loc: "es-ES"
    }
  };

  const verdict = (p) => (p > 55 ? "yes" : p >= 25 ? "maybe" : "no");
  const vColor = { no: "var(--dry)", maybe: "var(--maybe)", yes: "var(--wet)" };
  const tyre = (p) => (p > 70 ? "wet" : p >= 40 ? "inter" : "dry");
  const tyreC = { dry: "var(--soft)", inter: "var(--inter)", wet: "var(--wetT)" };
  const tyreSVG = (t) => `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="var(--tyre)"/><circle cx="12" cy="12" r="8" fill="none" stroke="${tyreC[t]}" stroke-width="2.2"/><circle cx="12" cy="12" r="4.2" fill="var(--hub)"/></svg>`;
  const ms = (s) => new Date(s).getTime();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const stateOf = (s, now) => (now >= ms(s.end) ? "done" : now >= ms(s.start) ? "live" : "up");
  const outcome = (s) => (s.outcome && s.outcome.wet != null ? s.outcome.wet : null); // true / false / null
  // Color of a session: measured result once done, otherwise the forecast
  function colorOf(s, now) {
    if (stateOf(s, now) === "done") { const o = outcome(s); return o == null ? "var(--muted)" : o ? "var(--wet)" : "var(--dry)"; }
    return s.rain == null ? "var(--muted)" : vColor[verdict(s.rain)];
  }

  function fmt(ts, lang, opts, tz) {
    const o = Object.assign({}, opts);
    if (tz) o.timeZone = tz;
    return new Intl.DateTimeFormat(T[lang].loc, o).format(new Date(ts));
  }
  const fDay = (ts, lang, tz) => fmt(ts, lang, { weekday: "short", day: "numeric", month: "short" }, tz);
  const fTime = (ts, lang, tz) => fmt(ts, lang, { hour: "2-digit", minute: "2-digit" }, tz);
  const fLong = (ts, lang, tz) => fmt(ts, lang, { weekday: "long", day: "numeric", month: "long" }, tz);
  const list = (items, lang) => (items.length < 2 ? items.join("") : items.slice(0, -1).join(", ") + " " + T[lang].and + " " + items.at(-1));

  // Highest remaining risk of the weekend (sessions that haven't finished)
  function focus(D, now) {
    const rem = D.sessions.filter((s) => s.rain != null && stateOf(s, now) !== "done");
    return rem.length ? rem.reduce((a, b) => (b.rain > a.rain ? b : a)) : null;
  }

  // Summary once every session has finished (or the page is for a past race)
  function summary(D, lang) {
    const t = T[lang], gp = D.race.name[lang] || D.race.name.en;
    const known = D.sessions.filter((s) => outcome(s) != null);
    const next = D.next ? ` <a href="/${D.next.slug}/">${esc(t.nextLink(D.next.name[lang] || D.next.name.en))} →</a>` : "";
    if (!known.length) return { v: "over", q: t.qDidW(gp), word: t.over, pct: "–", pctLab: t.pctLab, note: t.noteOver + next, rain: 0 };
    const wet = known.filter((s) => outcome(s));
    const st = D.race.station;
    const track = known.every((s) => s.outcome.source === "track");
    const src = track ? t.sumSrcTrack : st ? t.sumSrc(st.name || st.id, st.km) : "";
    const note = (wet.length ? t.sumWet(list(wet.map((s) => t.names[s.code].toLowerCase()), lang)) : t.sumDry) + (src ? " " + src : "");
    return { v: wet.length ? "yes" : "no", q: t.qDidW(gp), word: wet.length ? t.yes : t.no, pct: "–", pctLab: t.pctLab, note: esc(note) + next, rain: wet.length ? 60 : 0 };
  }

  function hero(D, now, sel, lang) {
    const t = T[lang], gp = D.race.name[lang] || D.race.name.en;
    if (D.state === "early") {
      return { v: "early", q: t.qW(gp), word: t.early, pct: "–", pctLab: t.pctLab, note: esc(t.noteEarly(fLong(D.opensAt, lang, D.race.tz))), rain: 0 };
    }
    const chosen = sel && sel !== "W" ? D.sessions.find((s) => s.code === sel) : null;
    if (chosen && stateOf(chosen, now) === "done") {
      const o = outcome(chosen), st = D.race.station;
      return {
        v: o == null ? "early" : o ? "yes" : "no", q: t.qDidS(t.names[chosen.code], gp),
        word: o == null ? t.unknown : o ? t.yes : t.no,
        pct: chosen.rain != null ? chosen.rain + "%" : "–", pctLab: t.pctWas,
        note: esc(o == null ? t.noteNoObs : chosen.outcome.source === "track" ? t.noteDidTrack(o) : st ? t.noteDid(o, st.name || st.id, st.km) : ""), rain: o ? 60 : 0
      };
    }
    if (chosen && chosen.rain != null) {
      const v = verdict(chosen.rain);
      return { v, q: t.qS(t.names[chosen.code], gp), word: t[v], pct: chosen.rain + "%", pctLab: t.pctLab, note: esc(t.noteS), rain: chosen.rain };
    }
    if (D.state === "over") return summary(D, lang);
    const f = focus(D, now);
    if (!f) return summary(D, lang);
    const v = verdict(f.rain);
    return { v, q: t.qW(gp), word: t[v], pct: f.rain + "%", pctLab: t.pctLab, note: esc(t.noteW(f.rain, t.names[f.code])), rain: f.rain };
  }

  function wordHTML(word) {
    return [...word].map((c, i) => (c === "­" ? "&shy;" : c === " " ? " " : `<span class="l" style="--i:${i}">${esc(c)}</span>`)).join("");
  }

  function laneHTML(D, now, sel, lang) {
    const a = ms(D.laneStart), b = ms(D.laneEnd), span = b - a, pos = (x) => ((x - a) / span) * 100;
    let h = "";
    for (const s of D.sessions) {
      const mid = (ms(s.start) + ms(s.end)) / 2;
      const w = ((ms(s.end) - ms(s.start)) / span) * 100;
      const done = stateOf(s, now) === "done", o = outcome(s);
      const lab = done ? (o == null ? "" : " " + (o ? T[lang].wet : T[lang].dry)) : s.rain != null ? " " + s.rain + "%" : "";
      h += `<button type="button" class="blk${done ? " done" : ""}" id="blk-${s.code}" data-s="${s.code}" style="left:${pos(mid).toFixed(2)}%;width:${w.toFixed(2)}%;background:${colorOf(s, now)}" aria-pressed="${sel === s.code}" aria-label="${esc(T[lang].names[s.code] + lab)}">${s.code}</button>`;
    }
    if (now > a && now < b) h += `<div class="now" style="left:${pos(now).toFixed(2)}%" aria-hidden="true"></div>`;
    return h;
  }
  function daysHTML(D, lang) {
    const a = ms(D.laneStart);
    return [0, 1, 2].map((i) => `<span>${esc(fmt(a + i * 864e5 + 12 * 36e5, lang, { weekday: "short" }, D.race.tz))}</span>`).join("");
  }
  function legendHTML(lang) {
    const t = T[lang];
    return ["no", "maybe", "yes"].map((v, i) => `<span><i style="background:${vColor[v]}"></i>${t.leg[i]} (${["&lt;25", "25–55", "&gt;55"][i]}%)</span>`).join("");
  }

  function towerHTML(D, now, sel, lang, tz) {
    const t = T[lang];
    const rows = [];
    const f = focus(D, now);
    if (f && D.state === "forecast") rows.push({ code: "W", rain: f.rain });
    rows.push(...D.sessions);
    return rows.map((s) => {
      const isW = s.code === "W", st = isW ? "up" : stateOf(s, now);
      const done = st === "done", o = done ? outcome(s) : null;
      const has = s.rain != null, ty = has ? tyre(s.rain) : null;
      const col = isW ? vColor[verdict(s.rain)] : colorOf(s, now);
      const when = isW ? "" : `${fDay(s.start, lang, tz)} · ${fTime(s.start, lang, tz)}${!done && s.temp != null ? " · " + s.temp + "°C" : ""}${done && has ? " · " + t.fc(s.rain) : ""}`;
      const right = done ? (o == null ? "–" : o ? t.wet : t.dry) : has ? s.rain + "%" : "–";
      const mid = done ? "" : has ? tyreSVG(ty) + `<span>${t.tyre[ty]}</span>` : "";
      return `<li><button type="button" id="row-${s.code}" data-s="${s.code}" class="row${isW ? " wk" : ""}${done ? " done" : ""}${done && o != null ? " res" : ""}" style="--c:${col}" aria-pressed="${(sel || "W") === s.code}">
<span class="code">${isW ? t.WKD : s.code}</span>
<span class="nm"><b>${esc(t.names[s.code])}</b><small>${esc(when)}${st !== "up" ? `<span class="tag ${st}">${st === "live" ? t.live : t.done}</span>` : ""}</small></span>
<span class="ty">${mid}</span>
<span class="p">${right}</span>
<span class="bar" aria-hidden="true"><i style="width:${done ? (o ? 100 : 0) : has ? s.rain : 0}%"></i></span></button></li>`;
    }).join("");
  }

  function countdown(D, now, lang) {
    const t = T[lang];
    if (D.state === "early") return { lab: t.cOpens, val: dur(ms(D.opensAt) - now), live: false };
    const live = D.sessions.find((s) => stateOf(s, now) === "live");
    if (live) return { lab: t.cLive(live.code), val: dur(ms(live.end) - now), live: true };
    const nx = D.sessions.find((s) => stateOf(s, now) === "up");
    if (nx) return { lab: t.cNext(nx.code), val: dur(ms(nx.start) - now), live: false };
    return { lab: t.cDone, val: "—", live: false };
  }
  function dur(d) {
    d = Math.max(0, d);
    const h = Math.floor(d / 36e5), m = Math.floor((d % 36e5) / 6e4), s = Math.floor((d % 6e4) / 1e3);
    const p = (n) => String(n).padStart(2, "0");
    return (h >= 24 ? Math.floor(h / 24) + "d " + p(h % 24) : p(h)) + ":" + p(m) + ":" + p(s);
  }

  globalThis.WIR = { T, verdict, tyre, hero, summary, wordHTML, laneHTML, daysHTML, legendHTML, towerHTML, countdown, fDay, fTime, fLong, fmt, esc, stateOf, outcome, ms };
})();
