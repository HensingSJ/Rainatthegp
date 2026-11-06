// Data sources: calendar (Jolpica), forecast (Open-Meteo), observations (METAR + F1 trackside station).
import { OFFLINE, NOW, now, read, sleep, UA, SESSION_MIN, USE_F1_TRACK } from "./config.mjs";

const CIRCUITS = JSON.parse(await read("data/circuits.json"));
const NAMES = JSON.parse(await read("data/names.json"));

export async function getText(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 204 || r.status === 404 || r.status === 403) return { status: r.status, text: "" };
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { status: r.status, text: (await r.text()).replace(/^﻿/, "") };
    } catch (e) {
      if (i >= tries) throw new Error(`Fetch failed for ${url}: ${e.message}`);
      await sleep(2000 * i);
    }
  }
}
export async function getJSON(url, tries = 3) {
  const { status, text } = await getText(url, tries);
  if (!text) throw new Error(`Empty response (${status}) for ${url}`);
  return JSON.parse(text);
}

// ---------- Calendar ----------
const SESSION_KEYS = [["FirstPractice", "FP1"], ["SecondPractice", "FP2"], ["ThirdPractice", "FP3"],
  ["SprintQualifying", "SQ"], ["SprintShootout", "SQ"], ["Sprint", "S"], ["Qualifying", "Q"]];

export async function loadRaces(years) {
  let raw = [];
  if (OFFLINE) raw = JSON.parse(await read("fixtures/races.json")).MRData.RaceTable.Races;
  else for (const [i, y] of years.entries()) {
    try { raw = raw.concat((await getJSON(`https://api.jolpi.ca/ergast/f1/${y}/races.json?limit=100`, i === 0 ? 3 : 1)).MRData.RaceTable.Races); }
    catch (e) { if (i === 0) throw e; /* later seasons may not be published yet */ }
  }
  return raw.map(parseRace).filter((r) => r.sessions.length).sort((a, b) => a.raceStart - b.raceStart);
}
export function gpName(raceName) {
  const base = String(raceName).replace(/\s*Grand Prix$/, "");
  return NAMES.races[base] || { en: `${base} GP`, nl: `GP van ${base}`, es: `GP de ${base}` };
}
const iso = (d, t) => new Date(`${d}T${t || "12:00:00Z"}`).getTime();
export function parseRace(r) {
  const meta = CIRCUITS[r.Circuit.circuitId] || {};
  const sessions = [], seen = new Set();
  for (const [k, code] of SESSION_KEYS) {
    if (r[k] && !seen.has(code)) { seen.add(code); sessions.push({ code, start: iso(r[k].date, r[k].time) }); }
  }
  sessions.push({ code: "R", start: iso(r.date, r.time) });
  sessions.sort((a, b) => a.start - b.start);
  for (const s of sessions) s.end = s.start + SESSION_MIN[s.code] * 6e4;
  const name = gpName(r.raceName);
  const c = r.Circuit.Location.country, cn = NAMES.countries[c] || {};
  return {
    season: r.season, round: +r.round, raceName: r.raceName, name,
    slug: meta.slug || r.Circuit.circuitId.replace(/_/g, "-"), circuitId: r.Circuit.circuitId,
    short: meta.short || r.Circuit.Location.locality, tz: meta.tz || null,
    station: meta.metar ? { id: meta.metar, name: meta.metarName || meta.metar, km: meta.metarKm ?? null } : null,
    circuitName: r.Circuit.circuitName, locality: r.Circuit.Location.locality,
    country: { en: c, nl: cn.nl || c, es: cn.es || c },
    lat: +r.Circuit.Location.lat, lon: +r.Circuit.Location.long,
    sessions, raceStart: sessions.at(-1).start, firstStart: sessions[0].start, raceEnd: sessions.at(-1).end
  };
}

// ---------- Forecast ----------
export async function loadWeather(race) {
  if (OFFLINE) {
    const t0 = Math.floor(race.firstStart / 36e5) * 36e5 - 24 * 36e5, time = [], pp = [], tmp = [];
    for (let i = 0; i < 24 * 5; i++) { time.push((t0 + i * 36e5) / 1000); pp.push(Math.round(35 + 30 * Math.sin(i / 7 + race.round))); tmp.push(Math.round(18 + 6 * Math.sin(i / 4))); }
    return { utc_offset_seconds: 0, hourly: { time, precipitation_probability: pp, temperature_2m: tmp } };
  }
  const q = new URLSearchParams({ latitude: race.lat, longitude: race.lon, hourly: "precipitation_probability,precipitation,temperature_2m",
    timezone: "auto", timeformat: "unixtime", forecast_days: "16", past_days: "2" });
  return getJSON(`https://api.open-meteo.com/v1/forecast?${q}`);
}
export function applyWeather(race, wx) {
  const h = wx.hourly, n = h.time.length;
  for (const s of race.sessions) {
    let max = null; const temps = [];
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

// ---------- Observations 1: METAR from the nearest airport ----------
export async function loadMetars(station, hours) {
  if (OFFLINE) {
    const out = [];
    for (let t = Math.floor(now / 18e5) * 18e5 - hours * 36e5; t <= now; t += 18e5) {
      const d = new Date(t), wet = d.getUTCDate() % 2 === 1 && d.getUTCHours() >= 14 && d.getUTCHours() <= 16;
      out.push({ obsTime: t / 1000, wxString: wet ? "-SHRA" : null, rawOb: `${station} TEST` });
    }
    return out;
  }
  try {
    const { text } = await getText(`https://aviationweather.gov/api/data/metar?ids=${station}&format=json&hours=${Math.min(Math.ceil(hours), 168)}`);
    return text.trim() ? JSON.parse(text) : [];
  } catch (e) { console.warn(`METAR ${station} unavailable: ${e.message}`); return null; }
}
const PRECIP = /^(\+|-)?(TS|SH|FZ)?(DZ|RA|SN|SG|GR|GS|PL|UP)+$/;
const RECENT = /^RE(TS|SH|FZ)?(DZ|RA|SN|SG|GR|GS|PL|UP)+$/;
const wxTokens = (m) => (m.wxString ? String(m.wxString).split(/\s+/) : []).concat(m.rawOb ? String(m.rawOb).split(" RMK")[0].split(/\s+/) : []);
const obsTime = (m) => (typeof m.obsTime === "number" ? m.obsTime * 1000 : Date.parse(m.reportTime || ""));
// -> { wet: true|false|null, n }
export function metarRain(metars, s) {
  const inWin = metars.filter((m) => { const t = obsTime(m); return t >= s.start - 15 * 6e4 && t <= s.end + 15 * 6e4; });
  const after = metars.filter((m) => { const t = obsTime(m); return t > s.start && t <= s.end + 60 * 6e4; });
  if (!inWin.length) return { wet: null, n: 0 };
  const wet = inWin.some((m) => wxTokens(m).some((x) => PRECIP.test(x))) || after.some((m) => wxTokens(m).some((x) => RECENT.test(x)));
  return { wet, n: inWin.length };
}

// ---------- Observations 2: F1 live timing, trackside weather station (unofficial) ----------
const F1_BASE = "https://livetiming.formula1.com/static/";
const F1_NAMES = { FP1: ["Practice 1"], FP2: ["Practice 2"], FP3: ["Practice 3"], SQ: ["Sprint Qualifying", "Sprint Shootout"], S: ["Sprint"], Q: ["Qualifying"], R: ["Race"] };
const indexCache = new Map();
export async function f1Index(year) {
  if (!indexCache.has(year)) {
    indexCache.set(year, (async () => {
      try { const { text } = await getText(`${F1_BASE}${year}/Index.json`, 2); return text ? JSON.parse(text) : null; }
      catch (e) { console.warn(`F1 index ${year} unavailable: ${e.message}`); return null; }
    })());
  }
  return indexCache.get(year);
}
const gmtOffsetMs = (g) => { const m = /^(-)?(\d{1,2}):(\d{2})/.exec(g || ""); return m ? (m[1] ? -1 : 1) * (+m[2] * 60 + +m[3]) * 6e4 : 0; };
export function f1Sessions(index) {
  const out = [];
  for (const mt of index?.Meetings || []) for (const s of mt.Sessions || []) {
    if (!s.Path || !s.StartDate) continue;
    const start = Date.parse(s.StartDate.replace(/Z$/, "") + "Z") - gmtOffsetMs(s.GmtOffset);
    const code = Object.keys(F1_NAMES).find((c) => F1_NAMES[c].includes(s.Name));
    if (code) out.push({ code, start, path: s.Path, meeting: mt.Name, circuit: mt.Circuit?.ShortName });
  }
  return out;
}
export async function findF1Session(code, start) {
  if (!USE_F1_TRACK) return null;
  if (OFFLINE) return { code, start, path: "offline/" };
  const idx = await f1Index(new Date(start).getUTCFullYear());
  return f1Sessions(idx).find((x) => x.code === code && Math.abs(x.start - start) < 3 * 36e5) || null;
}
// Parse "HH:MM:SS.mmm{json}" lines
function streamLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, "");
    const m = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})(\{.*\})\s*$/.exec(line);
    if (!m) continue;
    try { out.push({ t: ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4], d: JSON.parse(m[5]) }); } catch { /* skip */ }
  }
  return out;
}
// -> { wet: true|false|null, n } using the session's own start/finish markers when available
export async function trackRain(f1s) {
  if (!USE_F1_TRACK || !f1s) return { wet: null, n: 0 };
  if (OFFLINE) {
    if (!["Q", "R"].includes(f1s.code)) return { wet: null, n: 0 };
    const d = new Date(f1s.start);
    return { wet: d.getUTCDate() % 2 === 1 && d.getUTCHours() >= 13 && d.getUTCHours() <= 16, n: 60 };
  }
  try {
    const w = await getText(`${F1_BASE}${f1s.path}WeatherData.jsonStream`, 2);
    if (!w.text) return { wet: null, n: 0 };
    const weather = streamLines(w.text).filter((x) => x.d && x.d.Rainfall != null);
    if (!weather.length) return { wet: null, n: 0 };
    let from = -Infinity, to = Infinity;
    try {
      const st = streamLines((await getText(`${F1_BASE}${f1s.path}SessionStatus.jsonStream`, 2)).text);
      const started = st.find((x) => x.d.Status === "Started");
      const ended = [...st].reverse().find((x) => ["Finished", "Finalised", "Ends"].includes(x.d.Status));
      if (started) from = started.t - 5 * 6e4;
      if (ended) to = ended.t + 5 * 6e4;
    } catch { /* no status markers: use the whole stream */ }
    const win = weather.filter((x) => x.t >= from && x.t <= to);
    const use = win.length ? win : weather;
    return { wet: use.some((x) => String(x.d.Rainfall) === "1" || x.d.Rainfall === true), n: use.length };
  } catch (e) { console.warn(`F1 track weather unavailable for ${f1s.path}: ${e.message}`); return { wet: null, n: 0 }; }
}
