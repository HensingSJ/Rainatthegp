// Build: fetch calendar + weather, write static pages to dist/.
//   node scripts/build.mjs            -> live data (Jolpica F1 API + Open-Meteo)
//   node scripts/build.mjs --offline  -> fixtures + generated test weather (no network)
// History: data/history/<season>-<round>-<slug>.json keeps, per session, the last forecast
// before it started and the measured outcome (nearest METAR station). The workflow commits it.
// Env: SITE_URL (default https://rainatthegp.com), NOW (ISO date, for testing)
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OFFLINE = process.argv.includes("--offline");
const SITE = (process.env.SITE_URL || "https://rainatthegp.com").replace(/\/$/, "");
const NOW = process.env.NOW ? new Date(process.env.NOW) : new Date();
const FORECAST_WINDOW_DAYS = 7;      // show a forecast once the first session is this close
const KEEP_CURRENT_HOURS = 6;        // keep a weekend "current" this long after the race
const SESSION_MIN = { FP1: 60, FP2: 60, FP3: 60, SQ: 45, S: 60, Q: 60, R: 120 };
const FREEZE_BEFORE_MIN = 75;        // store the forecast made this close to session start
const OUTCOME_FINAL_HOURS = 3;       // keep re-checking the outcome this long after a session
const HIST_DIR = path.join(ROOT, OFFLINE ? ".offline-history" : "data/history");
const SESSION_KEYS = [["FirstPractice", "FP1"], ["SecondPractice", "FP2"], ["ThirdPractice", "FP3"],
  ["SprintQualifying", "SQ"], ["SprintShootout", "SQ"], ["Sprint", "S"], ["Qualifying", "Q"]];

await import(new URL("../src/shared.js", import.meta.url));
const W = globalThis.WIR;
const read = (p) => fs.readFile(path.join(ROOT, p), "utf8");
const CIRCUITS = JSON.parse(await read("data/circuits.json"));

async function getJSON(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "rainatthegp-build" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw new Error(`Fetch failed for ${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 2000 * i));
    }
  }
}

// ---------- Calendar ----------
async function loadRaces() {
  let raw = [];
  if (OFFLINE) raw = JSON.parse(await read("fixtures/races.json")).MRData.RaceTable.Races;
  else {
    const y = NOW.getUTCFullYear();
    raw = (await getJSON(`https://api.jolpi.ca/ergast/f1/${y}/races.json?limit=100`)).MRData.RaceTable.Races;
    try { raw = raw.concat((await getJSON(`https://api.jolpi.ca/ergast/f1/${y + 1}/races.json?limit=100`, 1)).MRData.RaceTable.Races); } catch { /* next season not published yet */ }
  }
  return raw.map(parseRace).filter((r) => r.sessions.length).sort((a, b) => a.raceStart - b.raceStart);
}
const iso = (d, t) => new Date(`${d}T${t || "12:00:00Z"}`).getTime();
function parseRace(r) {
  const meta = CIRCUITS[r.Circuit.circuitId] || {};
  const sessions = [];
  const seen = new Set();
  for (const [k, code] of SESSION_KEYS) {
    if (r[k] && !seen.has(code)) { seen.add(code); sessions.push({ code, start: iso(r[k].date, r[k].time) }); }
  }
  sessions.push({ code: "R", start: iso(r.date, r.time) });
  sessions.sort((a, b) => a.start - b.start);
  for (const s of sessions) s.end = s.start + SESSION_MIN[s.code] * 6e4;
  const name = r.raceName.replace(/Grand Prix/, "GP");
  return {
    season: r.season, round: +r.round, raceName: r.raceName,
    name: { en: name, nl: name.replace(/^(.*) GP$/, "GP van $1") },
    slug: meta.slug || r.Circuit.circuitId.replace(/_/g, "-"),
    station: meta.metar ? { id: meta.metar, name: meta.metarName || meta.metar, km: meta.metarKm ?? null } : null,
    short: meta.short || r.Circuit.Location.locality, tz: meta.tz || null,
    circuitName: r.Circuit.circuitName, locality: r.Circuit.Location.locality, country: r.Circuit.Location.country,
    lat: +r.Circuit.Location.lat, lon: +r.Circuit.Location.long,
    sessions, raceStart: sessions.at(-1).start, firstStart: sessions[0].start, raceEnd: sessions.at(-1).end
  };
}

// ---------- Weather ----------
async function loadWeather(race) {
  if (OFFLINE) {
    // Deterministic fake weather so pages can be checked without network.
    const t0 = Math.floor(race.firstStart / 36e5) * 36e5 - 24 * 36e5, time = [], pp = [], tmp = [];
    for (let i = 0; i < 24 * 5; i++) { time.push((t0 + i * 36e5) / 1000); pp.push(Math.round(35 + 30 * Math.sin(i / 7 + race.round))); tmp.push(Math.round(18 + 6 * Math.sin(i / 4))); }
    return { utc_offset_seconds: 0, hourly: { time, precipitation_probability: pp, temperature_2m: tmp } };
  }
  const q = new URLSearchParams({ latitude: race.lat, longitude: race.lon, hourly: "precipitation_probability,precipitation,temperature_2m",
    timezone: "auto", timeformat: "unixtime", forecast_days: "16", past_days: "1" });
  return getJSON(`https://api.open-meteo.com/v1/forecast?${q}`);
}
function applyWeather(race, wx) {
  const h = wx.hourly, n = h.time.length;
  for (const s of race.sessions) {
    let max = null, temps = [];
    for (let i = 0; i < n; i++) {
      const a = h.time[i] * 1000, b = a + 36e5;
      if (a < s.end && b > s.start) {
        const p = h.precipitation_probability[i];
        if (p != null) max = Math.max(max ?? 0, p);
        if (h.temperature_2m[i] != null) temps.push(h.temperature_2m[i]);
      }
    }
    s.rain = max; s.temp = temps.length ? Math.round(temps.reduce((x, y) => x + y) / temps.length) : null;
  }
  race.utcOffset = wx.utc_offset_seconds ?? 0;
}

// ---------- Outcome: METAR observations from the nearest airport ----------
async function loadMetars(station, hours) {
  if (OFFLINE) {
    // Fake observations: dry, except showers on the second day around midday UTC
    const out = [];
    for (let t = Math.floor(now / 18e5) * 18e5 - hours * 36e5; t <= now; t += 18e5) {
      const d = new Date(t), wetHour = d.getUTCDate() % 2 === 1 && d.getUTCHours() >= 14 && d.getUTCHours() <= 16;
      out.push({ obsTime: t / 1000, wxString: wetHour ? "-SHRA" : null, rawOb: `${station} TEST` });
    }
    return out;
  }
  const url = `https://aviationweather.gov/api/data/metar?ids=${station}&format=json&hours=${Math.min(Math.ceil(hours), 168)}`;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": "rainatthegp-build" } });
      if (r.status === 204) return [];
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = await r.text();
      return txt.trim() ? JSON.parse(txt) : [];
    } catch (e) {
      if (i === 3) { console.warn(`METAR ${station} unavailable: ${e.message}`); return null; }
      await new Promise((res) => setTimeout(res, 2000 * i));
    }
  }
}
const PRECIP = /^(\+|-)?(TS|SH|FZ)?(DZ|RA|SN|SG|GR|GS|PL|UP)+$/;
const RECENT = /^RE(TS|SH|FZ)?(DZ|RA|SN|SG|GR|GS|PL|UP)+$/;
function wxTokens(m) {
  const ws = m.wxString ? String(m.wxString).split(/\s+/) : [];
  const raw = m.rawOb ? String(m.rawOb).split(" RMK")[0].split(/\s+/) : [];
  return ws.concat(raw);
}
const obsTime = (m) => (m.obsTime ? m.obsTime * 1000 : Date.parse(m.reportTime || m.obsTime || ""));
// true = rain observed during the session, false = observations but no rain, null = no observations
function rainDuring(metars, s) {
  const inWin = metars.filter((m) => { const t = obsTime(m); return t >= s.start - 15 * 6e4 && t <= s.end + 15 * 6e4; });
  const after = metars.filter((m) => { const t = obsTime(m); return t > s.start && t <= s.end + 60 * 6e4; });
  if (!inWin.length) return { wet: null, n: 0 };
  const wet = inWin.some((m) => wxTokens(m).some((x) => PRECIP.test(x))) || after.some((m) => wxTokens(m).some((x) => RECENT.test(x)));
  return { wet, n: inWin.length };
}

// ---------- History ----------
const histFile = (r) => path.join(HIST_DIR, `${r.season}-${String(r.round).padStart(2, "0")}-${r.slug}.json`);
async function loadHist(r) {
  try { return JSON.parse(await fs.readFile(histFile(r), "utf8")); } catch { return null; }
}
async function updateHist(r, hasForecast) {
  const before = await loadHist(r);
  const h = before ? structuredClone(before) : { season: r.season, round: r.round, slug: r.slug, raceName: r.raceName, station: r.station, sessions: {} };
  let needObs = false;
  for (const s of r.sessions) {
    const e = (h.sessions[s.code] ||= { start: isoZ(s.start), end: isoZ(s.end), forecast: null, forecastAt: null, outcome: null, final: false });
    e.start = isoZ(s.start); e.end = isoZ(s.end);
    const st = W.stateOf({ start: s.start, end: s.end }, now);
    // Freeze the last forecast before the session; if we start mid-weekend, use the past-hours value once.
    if (hasForecast && s.rain != null && ((st === "up" && s.start - now <= FREEZE_BEFORE_MIN * 6e4) || (st !== "up" && e.forecast == null))) {
      e.forecast = s.rain; e.forecastAt = isoZ(now);
    }
    if (st === "done" && !e.final) needObs = true;
  }
  if (needObs && r.station) {
    const oldest = Math.min(...r.sessions.filter((s) => !h.sessions[s.code].final).map((s) => s.start));
    const metars = await loadMetars(r.station.id, (now - oldest) / 36e5 + 2);
    if (metars) for (const s of r.sessions) {
      const e = h.sessions[s.code];
      if (e.final || W.stateOf({ start: s.start, end: s.end }, now) !== "done") continue;
      const res = rainDuring(metars, s);
      if (res.wet != null) e.outcome = { wet: res.wet, reports: res.n, station: r.station.id, checkedAt: isoZ(now) };
      if (now - s.end > OUTCOME_FINAL_HOURS * 36e5) e.final = true;
    }
  }
  if (JSON.stringify(before) !== JSON.stringify(h)) {
    await fs.mkdir(HIST_DIR, { recursive: true });
    await fs.writeFile(histFile(r), JSON.stringify(h, null, 2) + "\n");
  }
  return h;
}
function applyHist(r, h) {
  if (!h) return;
  for (const s of r.sessions) {
    const e = h.sessions[s.code]; if (!e) continue;
    if (W.stateOf({ start: s.start, end: s.end }, now) !== "up" && e.forecast != null) s.rain = e.forecast;
    if (s.rain == null && e.forecast != null) s.rain = e.forecast;
    s.outcome = e.outcome ? { wet: e.outcome.wet } : null;
  }
}

// ---------- Helpers ----------
function tzOffsetMs(tz, at) {
  if (!tz) return null;
  const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(at)).find((p) => p.type === "timeZoneName").value;
  const m = s.match(/GMT([+-])(\d{2}):?(\d{2})?/); if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * ((+m[2]) * 60 + (+(m[3] || 0))) * 6e4;
}
const isoZ = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");

function pageData(race, state, next) {
  const off = tzOffsetMs(race.tz, race.firstStart) ?? (race.utcOffset || 0) * 1000;
  const localMidnight = Math.floor((race.firstStart + off) / 864e5) * 864e5 - off;
  return {
    state, updated: isoZ(NOW), opensAt: isoZ(race.firstStart - FORECAST_WINDOW_DAYS * 864e5),
    race: { name: race.name, short: race.short, slug: race.slug, round: race.round, season: race.season, country: race.country, locality: race.locality, tz: race.tz, station: race.station },
    laneStart: isoZ(localMidnight), laneEnd: isoZ(localMidnight + 3 * 864e5),
    sessions: race.sessions.map((s) => ({ code: s.code, start: isoZ(s.start), end: isoZ(s.end), rain: s.rain ?? null, temp: s.temp ?? null, outcome: s.outcome ?? null })),
    next: next ? { name: next.name, slug: next.slug } : null
  };
}

// ---------- Page ----------
const [CSS, SHARED, APP] = await Promise.all([read("src/style.css"), read("src/shared.js"), read("src/app.js")]);
const FONTS = "https://fonts.googleapis.com/css2?family=Saira+Extra+Condensed:wght@700;800;900&family=Titillium+Web:wght@400;600;700&family=Chivo+Mono:wght@400;500&display=swap";

function seo(D, race, isHome) {
  const now = NOW.getTime(), gp = race.name.en, h = W.hero(D, now, "W", "en");
  let title, desc;
  if (D.state === "forecast") {
    const parts = D.sessions.filter((s) => s.rain != null).map((s) => `${W.T.en.names[s.code]} ${s.rain}%`);
    title = `Will it rain at the ${gp}? ${h.word} – ${h.pct}`;
    desc = `Chance of rain per session at ${race.short}: ${parts.join(", ")}. Hourly forecast, updated ${W.fDay(D.updated, "en", "UTC")} ${W.fTime(D.updated, "en", "UTC")} UTC.`;
  } else if (D.state === "early") {
    title = `Will it rain at the ${gp}? Rain chance per session`;
    desc = `Live chance of rain for every session of the ${race.season} ${race.raceName} at ${race.circuitName}. Forecast opens ${W.fLong(D.opensAt, "en", "UTC")}.`;
  } else if (h.word !== W.T.en.over) {
    title = `${h.q} ${h.word} – ${race.season} results`;
    desc = h.note.replace(/<[^>]+>/g, "").replace(/\s*Next up:.*$/, "").trim() + ` Rain forecast vs. result for every session of the ${race.season} ${race.raceName}.`;
  } else {
    title = `Will it rain at the ${gp}? ${race.season} weekend`;
    desc = `Rain chance per session for the ${race.raceName} at ${race.circuitName}, ${race.locality}.`;
  }
  const url = isHome ? `${SITE}/` : `${SITE}/${race.slug}/`;
  const ld = {
    "@context": "https://schema.org", "@type": "SportsEvent", name: `${race.season} ${race.raceName}`, sport: "Motor racing",
    startDate: isoZ(race.firstStart), endDate: isoZ(race.raceEnd), eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", url: `${SITE}/${race.slug}/`,
    location: { "@type": "Place", name: race.circuitName, address: { "@type": "PostalAddress", addressLocality: race.locality, addressCountry: race.country },
      geo: { "@type": "GeoCoordinates", latitude: race.lat, longitude: race.lon } },
    subEvent: race.sessions.map((s) => ({ "@type": "SportsEvent", name: `${race.raceName} – ${W.T.en.names[s.code]}`, startDate: isoZ(s.start), endDate: isoZ(s.end),
      location: { "@type": "Place", name: race.circuitName } }))
  };
  return { title, desc, url, canonical: `${SITE}/${race.slug}/`, ld, isHome };
}

function aboutHTML(race, D) {
  const tz = race.tz || "UTC", rows = race.sessions.map((s) =>
    `<tr><th scope="row">${W.T.en.names[s.code]}</th><td>${W.fDay(s.start, "en", tz)}</td><td>${W.fTime(s.start, "en", tz)}</td><td>${W.fTime(s.start, "en", "UTC")}</td></tr>`).join("");
  return `<section class="about" aria-labelledby="h-about">
<h2 id="h-about">${W.esc(race.raceName)} weather</h2>
<p>The ${W.esc(race.season)} ${W.esc(race.raceName)} is round ${race.round} of the season, held at ${W.esc(race.circuitName)} in ${W.esc(race.locality)}, ${W.esc(race.country)}. This page gives the chance of rain for each session, taken from the hourly forecast for the circuit's exact location and refreshed every hour${D.state === "early" ? ` once the weekend is ${FORECAST_WINDOW_DAYS} days away` : ""}.</p>
<div class="tablewrap"><table><thead><tr><th>Session</th><th>Day</th><th>Local time</th><th>UTC</th></tr></thead><tbody>${rows}</tbody></table></div>
</section>`;
}

function calHTML(races, cur) {
  const now = NOW.getTime(), season = cur.season;
  return `<section aria-labelledby="h-cal"><h2 id="h-cal">${season} calendar</h2><ul class="cal">${races.filter((r) => r.season === season).map((r) =>
    `<li><a href="/${r.slug}/" class="${r === cur ? "cur" : r.raceEnd < now ? "past" : ""}"><b>${W.esc(r.name.en)}</b><span>R${r.round} · ${W.fmt(r.raceStart, "en", { day: "numeric", month: "short" }, "UTC")} · ${W.esc(r.short)}</span></a></li>`).join("")}</ul></section>`;
}

function page(race, D, races, cur, isHome) {
  const S = seo(D, race, isHome), now = NOW.getTime(), h = W.hero(D, now, "W", "en"), cnt = W.countdown(D, now, "en");
  const lane = D.state === "forecast" ? `<section aria-labelledby="h-wk"><h2 id="h-wk">Weekend</h2>
<div class="strip"><div class="days" id="days">${W.daysHTML(D, "en")}</div><div class="lane" id="lane">${W.laneHTML(D, now, "W", "en")}</div></div>
<div class="legend" id="legend">${W.legendHTML("en")}</div></section>` : "";
  const json = JSON.stringify(D).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${W.esc(S.title)}</title>
<meta name="description" content="${W.esc(S.desc)}">
<link rel="canonical" href="${isHome ? SITE + "/" : S.canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Rain at the GP">
<meta property="og:title" content="${W.esc(S.title)}"><meta property="og:description" content="${W.esc(S.desc)}"><meta property="og:url" content="${S.url}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#151c24">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2c3 4.5 6 8 6 11.5A6 6 0 0 1 6 13.5C6 10 9 6.5 12 2z" fill="#2f8dff"/></svg>')}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(S.ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<header class="hero gut" id="hero" data-v="${h.v}">
<canvas id="rain" aria-hidden="true"></canvas>
<div class="in">
<div class="top">
<a class="brand" href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c3 4.5 6 8 6 11.5A6 6 0 0 1 6 13.5C6 10 9 6.5 12 2z" fill="#7cc0ff"/><path d="M3 21h18" stroke="#fff" stroke-width="2" stroke-dasharray="3 2"/></svg>Will it rain?</a>
<div class="lang" role="group" aria-label="Language"><button type="button" data-l="en" aria-pressed="true"><span>EN</span></button><button type="button" data-l="nl" aria-pressed="false"><span>NL</span></button></div>
</div>
<p class="gp"><span class="chip">${W.esc(race.country)}</span><span>${W.esc(race.circuitName)}</span><span class="round">R${race.round} · ${race.season}</span></p>
<h1 class="q" id="q">${W.esc(h.q)}</h1>
<div class="answer"><div class="word${h.word.length > 6 ? " long" : ""}" id="word" aria-live="polite">${W.wordHTML(h.word)}</div>
<div class="pct"><b id="pct">${h.pct}</b><span id="pctLab">${h.pctLab}</span></div></div>
<p class="note" id="note">${h.note}</p>
<div class="count"><div class="lab"><span id="cLab">${W.esc(cnt.lab)}</span></div><div class="t"><span id="cT">${cnt.val}</span></div></div>
</div>
</header>
<main class="gut"><div class="in">
${lane}
<section aria-labelledby="h-sessions"><h2 id="h-sessions">Sessions</h2><ul class="tower" id="tower">${W.towerHTML(D, now, "W", "en", race.tz || "UTC")}</ul></section>
${aboutHTML(race, D)}
${calHTML(races, cur)}
<footer>
<span id="updated">${D.state === "forecast" ? W.esc(W.T.en.updated(W.fDay(D.updated, "en", "UTC") + " " + W.fTime(D.updated, "en", "UTC") + " UTC")) : ""}</span>
<span>Weather data by <a href="https://open-meteo.com/" rel="noopener">Open-Meteo.com</a> (CC BY 4.0). Calendar via the <a href="https://github.com/jolpica/jolpica-f1" rel="noopener">Jolpica F1 API</a>.</span>
<span>An independent fan site. Not affiliated with Formula 1, the FIA or any team.</span>
</footer>
</div></main>
<script type="application/json" id="wir-data">${json}</script>
<script>${SHARED}</script>
<script>${APP}</script>
</body>
</html>`;
}

// ---------- Main ----------
const races = await loadRaces();
const now = NOW.getTime();
const cur = races.find((r) => r.raceEnd + KEEP_CURRENT_HOURS * 36e5 > now) || races.at(-1);
const stateFor = (r) => (r.raceEnd + KEEP_CURRENT_HOURS * 36e5 <= now ? "over" : r.firstStart - FORECAST_WINDOW_DAYS * 864e5 <= now ? "forecast" : "early");

for (const r of races) {
  const st = stateFor(r);
  if (st === "forecast") applyWeather(r, await loadWeather(r));
  if (st === "forecast" || (st === "over" && now - r.raceEnd < 48 * 36e5)) applyHist(r, await updateHist(r, st === "forecast"));
  else applyHist(r, await loadHist(r));
}

await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });
const seasonRaces = races.filter((r) => r.season === cur.season);
const written = [];
for (const r of seasonRaces) {
  const nxt = races.find((x) => x.raceEnd + KEEP_CURRENT_HOURS * 36e5 > now && x !== r && x.raceStart > r.raceStart) || null;
  const D = pageData(r, stateFor(r), stateFor(r) === "over" ? (nxt || cur) : null);
  await fs.mkdir(path.join(DIST, r.slug), { recursive: true });
  await fs.writeFile(path.join(DIST, r.slug, "index.html"), page(r, D, races, cur, false));
  written.push(r.slug);
  if (r === cur) {
    await fs.writeFile(path.join(DIST, "index.html"), page(r, D, races, cur, true));
    await fs.mkdir(path.join(DIST, "api"), { recursive: true });
    const h = W.hero(D, now, "W", "en");
    await fs.writeFile(path.join(DIST, "api", "next.json"), JSON.stringify({ ...D, verdict: h.v, maxRain: h.rain, url: `${SITE}/${r.slug}/` }, null, 2));
  }
}
const lastmod = isoZ(NOW).slice(0, 10);
await fs.writeFile(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE}/</loc><lastmod>${lastmod}</lastmod><changefreq>hourly</changefreq></url>
${written.map((s) => `<url><loc>${SITE}/${s}/</loc><lastmod>${lastmod}</lastmod></url>`).join("\n")}
</urlset>
`);
await fs.writeFile(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
await fs.writeFile(path.join(DIST, "_headers"), `/*\n  Cache-Control: public, max-age=300\n/api/*\n  Access-Control-Allow-Origin: *\n`);
await fs.writeFile(path.join(DIST, "404.html"), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found – Rain at the GP</title><style>body{font:16px system-ui;background:#151c24;color:#f3f6f9;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}a{color:#7cc0ff}</style><p>This page doesn't exist. <a href="/">See if it will rain this weekend →</a></p>`);

console.log(`Built ${written.length} circuit pages + home (${cur.raceName}, state: ${stateFor(cur)}) ${OFFLINE ? "[OFFLINE TEST DATA]" : ""}`);
