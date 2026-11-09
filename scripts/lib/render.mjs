// HTML for circuit pages and the track record page, in every language.
import "../../src/shared.js";
import { SITE, LANGS, NOW, now, read, langPath, isoZ, FORECAST_WINDOW_DAYS } from "./config.mjs";
import { S } from "./i18n.mjs";
import { gpName } from "./sources.mjs";

const W = globalThis.WIR;
const esc = W.esc;
const [CSS, SHARED, APP] = await Promise.all([read("src/style.css"), read("src/shared.js"), read("src/app.js")]);
const FONTS = "https://fonts.googleapis.com/css2?family=Saira+Extra+Condensed:wght@700;800;900&family=Titillium+Web:wght@400;600;700&family=Chivo+Mono:wght@400;500&display=swap";
const ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2c3 4.5 6 8 6 11.5A6 6 0 0 1 6 13.5C6 10 9 6.5 12 2z" fill="#2f8dff"/></svg>')}`;
const OGV = isoZ(NOW).slice(0, 13).replace(/\D/g, ""); // changes every hour, so shared links pick up the new image

function head(lang, m) {
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${langPath(l, m.slug)}">`).join("\n") +
    `\n<link rel="alternate" hreflang="x-default" href="${SITE}${langPath("en", m.slug)}">`;
  const og = `${SITE}/og/${lang}-${m.og}.png?v=${OGV}`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.desc)}">
<link rel="canonical" href="${SITE}${m.canonical || langPath(lang, m.slug)}">
${alts}
<meta property="og:type" content="website"><meta property="og:site_name" content="Rain at the GP">
<meta property="og:title" content="${esc(m.title)}"><meta property="og:description" content="${esc(m.desc)}">
<meta property="og:url" content="${SITE}${langPath(lang, m.slug)}"><meta property="og:locale" content="${W.T[lang].loc.replace("-", "_")}">
<meta property="og:image" content="${og}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${og}">
<meta name="theme-color" content="#151c24">
<link rel="icon" href="${ICON}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style>
${m.ld ? `<script type="application/ld+json">${JSON.stringify(m.ld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>`;
}

function raceMenu(lang, races, cur, slug) {
  if (!races || !cur) return "";
  const s = S[lang], list = races.filter((r) => r.season === cur.season);
  const items = list.map((r) => {
    const cls = r === cur ? "cur" : r.raceEnd < now ? "past" : "";
    return `<li><a href="${langPath(lang, r.slug)}" class="${cls}"${r.slug === slug ? ' aria-current="page"' : ""}><span class="mr">R${r.round}</span><b>${esc(r.name[lang])}</b><span class="md">${W.fmt(r.raceStart, lang, { day: "numeric", month: "short" }, "UTC")}</span></a></li>`;
  }).join("");
  return `<details class="racemenu"><summary>${s.menuRaces} <span aria-hidden="true">▾</span></summary><div class="rmenu"><p class="rmh">${s.calH(cur.season)}</p><ul>${items}</ul></div></details>`;
}

function topBar(lang, slug, races, cur) {
  const s = S[lang];
  const langs = LANGS.map((l) => `<a href="${langPath(l, slug)}" hreflang="${l}" lang="${l}" title="${S[l].langName}"${l === lang ? ' aria-current="true"' : ""}><span>${l.toUpperCase()}</span></a>`).join("");
  return `<div class="top">
<a class="brand" href="${langPath(lang)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 4.5 6 8 6 11.5A6 6 0 0 1 6 13.5C6 10 9 6.5 12 2z" fill="#7cc0ff"/><path d="M3 21h18" stroke="#fff" stroke-width="2" stroke-dasharray="3 2"/></svg>Rain at the GP</a>
<div class="topr">${raceMenu(lang, races, cur, slug)}<nav class="lang" aria-label="Language">${langs}</nav></div>
</div>`;
}

function footer(lang, D) {
  const s = S[lang], t = W.T[lang];
  const upd = D && D.state === "forecast" ? esc(t.updated(W.fDay(D.updated, lang, "UTC") + " " + W.fTime(D.updated, lang, "UTC") + " UTC")) : "";
  return `<footer><span id="updated">${upd}</span><span>${s.foot1}</span><span>${s.foot2}</span></footer>`;
}

// ---------- Circuit page ----------
function meta(lang, race, D, slug) {
  const s = S[lang], t = W.T[lang], gp = race.name[lang], h = W.hero(D, now, "W", lang);
  const upd = W.fDay(D.updated, lang, "UTC") + " " + W.fTime(D.updated, lang, "UTC");
  let title, desc;
  if (D.state === "forecast" && h.v !== "over" && h.pct !== "–") {
    title = s.metaForecast(gp, h.word.replace("\u00AD", ""), h.pct);
    desc = s.metaForecastDesc(race.short, D.sessions.filter((x) => x.rain != null).map((x) => `${t.names[x.code]} ${x.rain}%`).join(", "), upd);
  } else if (D.state === "early") {
    title = s.metaEarly(gp); desc = s.metaEarlyDesc(race.season, gp, race.circuitName, W.fLong(D.opensAt, lang, "UTC"));
  } else if (h.word !== t.over) {
    title = s.metaOver(h.q, h.word, race.season); desc = s.metaOverDesc(h.note.replace(/<a [\s\S]*$/, "").replace(/<[^>]+>/g, "").trim(), race.season, gp);
  } else {
    title = s.metaPlain(gp, race.season); desc = s.metaPlainDesc(gp, race.circuitName, race.locality);
  }
  const ld = {
    "@context": "https://schema.org", "@type": "SportsEvent", name: `${race.season} ${race.raceName}`, sport: "Motor racing",
    description: desc, image: [`${SITE}/og/${lang}-${race.slug}.png`], inLanguage: lang,
    organizer: { "@type": "Organization", name: "Formula 1", url: "https://www.formula1.com" },
    startDate: isoZ(race.firstStart), endDate: isoZ(race.raceEnd), eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", url: `${SITE}${langPath(lang, race.slug)}`,
    location: { "@type": "Place", name: race.circuitName, address: { "@type": "PostalAddress", addressLocality: race.locality, addressCountry: race.country.en },
      geo: { "@type": "GeoCoordinates", latitude: race.lat, longitude: race.lon } },
    subEvent: race.sessions.map((x) => ({ "@type": "SportsEvent", name: `${race.raceName} – ${W.T.en.names[x.code]}`, startDate: isoZ(x.start), endDate: isoZ(x.end),
      location: { "@type": "Place", name: race.circuitName } }))
  };
  return { title, desc, slug, canonical: langPath(lang, slug), og: race.slug, ld };
}

function about(lang, race, D) {
  const s = S[lang], t = W.T[lang], tz = race.tz || "UTC";
  const rows = race.sessions.map((x) => `<tr><th scope="row">${esc(t.names[x.code])}</th><td>${W.fDay(x.start, lang, tz)}</td><td>${W.fTime(x.start, lang, tz)}</td><td>${W.fTime(x.start, lang, "UTC")}</td></tr>`).join("");
  return `<section class="about" aria-labelledby="h-about"><h2 id="h-about">${esc(s.aboutH(race.name[lang]))}</h2>
<p>${esc(s.aboutP(race, D.state === "early", FORECAST_WINDOW_DAYS))}</p>
<div class="tablewrap"><table><thead><tr>${s.th.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

export function historyFor(slug, allHist) {
  return allHist.filter((h) => h.slug === slug).sort((a, b) => b.season - a.season || b.round - a.round);
}
function historySection(lang, race, hist) {
  const s = S[lang], t = W.T[lang];
  // Only weekends with verified measurements (circuit station / tyres via OpenF1, or manual corrections)
  const ok = (e) => W.verifiedOut(e && e.outcome);
  const done = hist.filter((h) => Object.values(h.sessions).some(ok));
  if (!done.length) return `<section aria-labelledby="h-hist"><h2 id="h-hist">${esc(s.histH(race.short))}</h2><p class="muted">${s.histNone}</p></section>`;
  const withRace = done.filter((h) => ok(h.sessions.R)).slice(0, 10);
  const n = withRace.length, a = withRace.filter((h) => W.wetOf(h.sessions.R.outcome)).length;
  const b = withRace.filter((h) => Object.values(h.sessions).some((e) => ok(e) && W.wetOf(e.outcome))).length;
  const order = ["FP1", "FP2", "FP3", "SQ", "S", "Q", "R"];
  const rows = done.slice(0, 10).map((h) => {
    const chips = order.filter((c) => h.sessions[c]).map((c) => {
      const o = ok(h.sessions[c]) ? W.wetOf(h.sessions[c].outcome) : null;
      const out0 = h.sessions[c].outcome || {};
      const cls = o == null ? "na" : o ? "wet" : "dry";
      const out = h.sessions[c].outcome, ty = o == null ? "" : " – " + (out.source === "manual" ? t.noteManual : o ? t.noteWetTyres(out.wetTyres) : out.rain ? t.noteDrizzle : t.noteDryTyres), man = "";
      return `<span class="chip2 ${cls}" title="${esc(t.names[c] + ": " + (o == null ? s.histLeg[2] : o ? s.histLeg[0] : s.histLeg[1]) + ty + man)}">${c}</span>`;
    }).join("");
    return `<li><b>${h.season}</b><span class="chips">${chips}</span></li>`;
  }).join("");
  return `<section aria-labelledby="h-hist"><h2 id="h-hist">${esc(s.histH(race.short))}</h2>
${n ? `<p class="lead">${esc(s.histSum(a, n, b))}</p>` : ""}
<ul class="hist">${rows}</ul>
<p class="muted small">${s.histSrc}</p>
<div class="legend"><span><i style="background:var(--wet)"></i>${s.histLeg[0]}</span><span><i style="background:var(--dry)"></i>${s.histLeg[1]}</span><span><i style="background:var(--track);outline:1px solid var(--line)"></i>${s.histLeg[2]}</span></div></section>`;
}

function calendar(lang, races, cur) {
  const s = S[lang], season = cur.season;
  return `<section aria-labelledby="h-cal"><h2 id="h-cal">${s.calH(season)}</h2><ul class="cal">${races.filter((r) => r.season === season).map((r) =>
    `<li><a href="${langPath(lang, r.slug)}" class="${r === cur ? "cur" : r.raceEnd < now ? "past" : ""}"><b>${esc(r.name[lang])}</b><span>R${r.round} · ${W.fmt(r.raceStart, lang, { day: "numeric", month: "short" }, "UTC")} · ${esc(r.short)}</span></a></li>`).join("")}</ul></section>`;
}

function radarSection(lang, D) {
  const t = W.T[lang];
  return `<section id="radar" class="radar" hidden aria-labelledby="h-radar"><h2 id="h-radar">${t.radarH}</h2>
<div id="radarMap" class="rmap" role="img" aria-label="${esc(t.radarH)}"></div>
<div class="rbar"><button type="button" id="rPlay" class="rbtn" aria-pressed="true">${t.radarPause}</button>
<button type="button" id="rPrev" class="rstep" aria-label="${t.radarPrev}">‹</button>
<input type="range" id="rSlider" class="rslider" min="0" max="0" step="1" value="0" aria-label="${t.radarTime}">
<button type="button" id="rNext" class="rstep" aria-label="${t.radarNext}">›</button>
<span id="rTime" class="rtime" aria-live="polite"></span></div>
<p class="muted small">${t.radarNote}${D.race.radar === false ? " " + t.radarSat : ""}</p></section>`;
}

export function circuitPage(lang, race, D, races, cur, isHome, hist) {
  D = { ...D, lang };
  const m = meta(lang, race, D, isHome ? "" : race.slug);
  if (isHome) m.canonical = langPath(lang);
  const h = W.hero(D, now, "W", lang), cnt = W.countdown(D, now, lang), t = W.T[lang];
  const lane = D.state !== "early" ? `<section aria-labelledby="h-wk"><h2 id="h-wk">${t.wk}</h2>
<div class="strip"><div class="days" id="days">${W.daysHTML(D, lang)}</div><div class="lane" id="lane">${W.laneHTML(D, now, "W", lang)}</div></div>
<div class="legend" id="legend">${W.legendHTML(lang)}</div></section>` : "";
  return `${head(lang, m)}
<header class="hero gut" id="hero" data-v="${h.v}">
<canvas id="rain" aria-hidden="true"></canvas>
<div class="in">
${topBar(lang, isHome ? "" : race.slug, races, cur)}
<p class="gp"><span class="chip">${esc(race.country[lang])}</span><span>${esc(race.circuitName)}</span><span class="round">R${race.round} · ${race.season}</span></p>
<h1 class="q" id="q">${esc(h.q)}</h1>
<div class="answer"><div class="word${h.word.replace("\u00AD", "").length > 5 ? " long" : ""}" id="word" aria-live="polite">${W.wordHTML(h.word)}</div>
<div class="pct" id="pctBox"${h.pct === "–" ? " hidden" : ""}><b id="pct">${h.pct}</b><span id="pctLab">${h.pctLab}</span></div></div>
<p class="note" id="note">${h.note}</p>
<div class="count" id="count"${cnt.val === "—" ? " hidden" : ""}><div class="lab"><span id="cLab">${esc(cnt.lab)}</span></div><div class="t"><span id="cT">${cnt.val}</span></div></div>
</div>
</header>
<main class="gut"><div class="in">
${D.state === "forecast" && D.race.lat != null ? radarSection(lang, D) : ""}
${lane}
<section aria-labelledby="h-sessions"><h2 id="h-sessions">${t.sessions}</h2><ul class="tower" id="tower">${W.towerHTML(D, now, "W", lang, race.tz || "UTC")}</ul></section>
${historySection(lang, race, hist)}
${about(lang, race, D)}
${calendar(lang, races, cur)}
${footer(lang, D)}
</div></main>
<script type="application/json" id="wir-data">${JSON.stringify(D).replace(/</g, "\\u003c")}</script>
<script>${SHARED}</script>
<script>${APP}</script>
</body>
</html>`;
}

// ---------- Track record ----------
export const MIN_CALLED = 20;
export function trackStats(allHist, codes = null) {
  const rows = [];
  for (const h of allHist) for (const [code, e] of Object.entries(h.sessions)) {
    if (codes && !codes.includes(code)) continue;
    if (e.forecast == null || !W.verifiedOut(e.outcome)) continue;
    rows.push({ h, code, start: e.start, forecast: e.forecast, wet: W.wetOf(e.outcome), v: W.verdict(e.forecast), source: e.outcome.source });
  }
  rows.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const b = { no: [], maybe: [], yes: [] };
  for (const r of rows) b[r.v].push(r);
  const called = b.no.length + b.yes.length;
  const right = b.no.filter((r) => !r.wet).length + b.yes.filter((r) => r.wet).length;
  // Only publish a score once there is enough to say something: below MIN_CALLED it would mostly be noise
  return { rows, buckets: b, n: rows.length, called, hit: called >= MIN_CALLED ? Math.round((right / called) * 100) : null };
}

export function trackRecordPage(lang, st) {
  const s = S[lang], tr = s.tr, t = W.T[lang];
  const d = st.hit == null ? tr.desc(0, null) : tr.desc(st.n, st.hit);
  const m = { title: tr.title, desc: d, slug: "track-record", og: "track-record",
    ld: { "@context": "https://schema.org", "@type": "WebPage", name: tr.h1, description: d } };
  const bars = ["no", "maybe", "yes"].map((k) => {
    const list = st.buckets[k], n = list.length, p = n ? Math.round((list.filter((r) => r.wet).length / n) * 100) : 0;
    return `<li><span class="bl">${tr.bucket[k]}</span><span class="bt"><i style="width:${p}%;background:var(--wet)"></i></span><span class="bv">${n ? tr.rained(p, n) : tr.none}</span></li>`;
  }).join("");
  const list = st.rows.slice(0, 40).map((r) => {
    const ok = r.v === "maybe" ? null : (r.v === "yes") === r.wet;
    return `<tr><td>${esc(gpName(r.h.raceName)[lang])} ${r.h.season}</td><td>${esc(t.names[r.code])}</td><td>${r.forecast}%</td><td class="${r.wet ? "w" : "d"}">${r.wet ? t.wet : t.dry}</td><td class="${ok == null ? "" : ok ? "ok" : "miss"}">${ok == null ? tr.na : ok ? tr.ok : tr.miss}</td></tr>`;
  }).join("");
  return `${head(lang, m)}
<header class="hero gut" id="hero" data-v="${st.hit == null ? "early" : st.hit >= 70 ? "no" : "maybe"}">
<div class="in">
${topBar(lang, "track-record")}
<p class="gp"><span>${tr.h1}</span></p>
<h1 class="q">${tr.q}</h1>
<div class="answer"><div class="word">${st.hit == null ? "–" : st.hit + "%"}</div><div class="pct"><b>${st.n}</b><span>${tr.sessions}</span></div></div>
<p class="note">${st.hit != null ? tr.hit : st.n ? tr.collecting(st.called, MIN_CALLED) : tr.empty}</p>
</div>
</header>
<main class="gut"><div class="in">
<section class="about"><p>${tr.intro}</p></section>
<section aria-labelledby="h-cal2"><h2 id="h-cal2">${tr.calH}</h2><ul class="calib">${bars}</ul></section>
<section aria-labelledby="h-list"><h2 id="h-list">${tr.listH}</h2>${st.rows.length ? `<div class="tablewrap about"><table class="trt"><thead><tr>${tr.th.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${list}</tbody></table></div>` : `<p class="muted">${tr.empty}</p>`}</section>
${footer(lang, null)}
</div></main>
</body>
</html>`;
}
