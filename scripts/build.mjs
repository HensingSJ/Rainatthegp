// Build: fetch calendar, forecast and measurements, write static pages to dist/.
//   node scripts/build.mjs            -> live data
//   node scripts/build.mjs --offline  -> fixtures + generated test data (no network)
// Env: SITE_URL (default https://rainatthegp.com), NOW (ISO date, for testing),
//      F1_TRACK_WEATHER=off (don't use the F1 trackside weather station)
import fs from "node:fs/promises";
import path from "node:path";
import "../src/shared.js";
import { DIST, SITE, LANGS, NOW, now, OFFLINE, isoZ, langPath, FORECAST_WINDOW_DAYS, KEEP_CURRENT_HOURS, USE_F1_TRACK } from "./lib/config.mjs";
import { loadRaces, loadWeather, applyWeather } from "./lib/sources.mjs";
import { updateHist, loadHist, applyHist, loadAllHistory } from "./lib/history.mjs";
import { circuitPage, trackRecordPage, trackStats, historyFor } from "./lib/render.mjs";
import { S } from "./lib/i18n.mjs";

const W = globalThis.WIR;
let ogImage = null;
try { ({ ogImage } = await import("./lib/og.mjs")); } catch (e) { console.warn(`Share images disabled (${e.message}). Run "npm ci" first.`); }

// ---------- Data ----------
const y = NOW.getUTCFullYear();
const races = await loadRaces([y, y + 1]);
const cur = races.find((r) => r.raceEnd + KEEP_CURRENT_HOURS * 36e5 > now) || races.at(-1);
const stateFor = (r) => (r.raceEnd + KEEP_CURRENT_HOURS * 36e5 <= now ? "over" : r.firstStart - FORECAST_WINDOW_DAYS * 864e5 <= now ? "forecast" : "early");

for (const r of races) {
  const st = stateFor(r);
  if (st === "forecast") applyWeather(r, await loadWeather(r));
  if (st === "forecast" || (st === "over" && now - r.raceEnd < 48 * 36e5)) applyHist(r, await updateHist(r, st === "forecast"));
  else applyHist(r, await loadHist(r));
}
const allHist = await loadAllHistory();

function tzOffsetMs(tz, at) {
  if (!tz) return null;
  const v = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(at)).find((p) => p.type === "timeZoneName").value;
  const m = v.match(/GMT([+-])(\d{2}):?(\d{2})?/); if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) * 6e4;
}
function pageData(race, state, next) {
  const off = tzOffsetMs(race.tz, race.firstStart) ?? (race.utcOffset || 0) * 1000;
  const localMidnight = Math.floor((race.firstStart + off) / 864e5) * 864e5 - off;
  return {
    state, updated: isoZ(NOW), opensAt: isoZ(race.firstStart - FORECAST_WINDOW_DAYS * 864e5),
    race: { name: race.name, short: race.short, slug: race.slug, round: race.round, season: race.season, tz: race.tz, station: race.station },
    laneStart: isoZ(localMidnight), laneEnd: isoZ(localMidnight + 3 * 864e5),
    sessions: race.sessions.map((s) => ({ code: s.code, start: isoZ(s.start), end: isoZ(s.end), rain: s.rain ?? null, temp: s.temp ?? null, outcome: s.outcome ?? null })),
    next: next ? { name: next.name, slug: next.slug } : null
  };
}

// ---------- Write ----------
await fs.rm(DIST, { recursive: true, force: true });
const write = async (rel, body) => { const f = path.join(DIST, rel); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, body); };
const urls = [];
let images = 0;

async function og(lang, key, D, race) {
  if (!ogImage) return;
  const h = W.hero(D, now, "W", lang);
  const png = await ogImage({ v: h.v, word: h.word, q: h.q, pct: h.pct, pctLab: h.pctLab,
    topLeft: race.circuitName, topRight: `R${race.round} · ${race.season}`, footer: race.country[lang] });
  await write(`og/${lang}-${key}.png`, png); images++;
}

for (const r of races.filter((x) => x.season === cur.season)) {
  const st = stateFor(r);
  const nxt = races.find((x) => x.raceStart > r.raceStart && x.raceEnd + KEEP_CURRENT_HOURS * 36e5 > now) || null;
  const D = pageData(r, st, st === "over" ? nxt : null);
  const hist = historyFor(r.slug, allHist);
  for (const lang of LANGS) {
    await write(`${langPath(lang, r.slug).slice(1)}index.html`, circuitPage(lang, r, D, races, cur, false, hist));
    await og(lang, r.slug, D, r);
    if (r === cur) await write(`${langPath(lang).slice(1)}index.html`, circuitPage(lang, r, D, races, cur, true, hist));
  }
  urls.push(r.slug);
  if (r === cur) {
    const h = W.hero(D, now, "W", "en");
    await write("api/next.json", JSON.stringify({ ...D, verdict: h.v, maxRain: h.rain, url: `${SITE}/${r.slug}/` }, null, 2));
  }
}

// Track record
const stats = trackStats(allHist);
for (const lang of LANGS) {
  await write(`${langPath(lang, "track-record").slice(1)}index.html`, trackRecordPage(lang, stats));
  if (ogImage) {
    const tr = S[lang].tr;
    await write(`og/${lang}-track-record.png`, await ogImage({ v: stats.hit == null ? "early" : "maybe", word: stats.hit == null ? "–" : `${stats.hit}%`,
      q: tr.q, pct: String(stats.n), pctLab: tr.sessions, topLeft: tr.h1, topRight: "Rain at the GP", footer: "" }));
    images++;
  }
}
urls.push("track-record");

// Sitemap with language alternates
const lastmod = isoZ(NOW).slice(0, 10);
const entry = (slug) => LANGS.map((l) => `<url><loc>${SITE}${langPath(l, slug)}</loc><lastmod>${lastmod}</lastmod>
${LANGS.map((a) => `  <xhtml:link rel="alternate" hreflang="${a}" href="${SITE}${langPath(a, slug)}"/>`).join("\n")}
  <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${langPath("en", slug)}"/>
</url>`).join("\n");
await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${["", ...urls].map(entry).join("\n")}
</urlset>
`);
await write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
await write("_headers", `/*\n  Cache-Control: public, max-age=300\n/og/*\n  Cache-Control: public, max-age=3600\n/api/*\n  Access-Control-Allow-Origin: *\n`);
await write("404.html", `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found – Rain at the GP</title><style>body{font:16px system-ui;background:#151c24;color:#f3f6f9;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}a{color:#7cc0ff}</style><p>This page doesn't exist. <a href="/">See if it will rain this weekend →</a></p>`);

console.log(`Built ${urls.length} pages × ${LANGS.length} languages, ${images} share images. Current: ${cur.raceName} (${stateFor(cur)}). Track weather: ${USE_F1_TRACK ? "on" : "off"}. Track record: ${stats.n} sessions.${OFFLINE ? " [OFFLINE TEST DATA]" : ""}`);
