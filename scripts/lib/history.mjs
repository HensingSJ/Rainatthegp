// Per race weekend: last forecast before each session + measured outcome. Stored in data/history/.
import fs from "node:fs/promises";
import path from "node:path";
import "../../src/shared.js";
import { HIST_DIR, now, isoZ, FREEZE_BEFORE_MIN, OUTCOME_FINAL_HOURS } from "./config.mjs";
import { loadMetars, metarRain, findF1Session, trackRain, openf1Rain } from "./sources.mjs";
import { ROOT } from "./config.mjs";

const W = globalThis.WIR;
export const histFile = (r) => path.join(HIST_DIR, `${r.season}-${String(r.round).padStart(2, "0")}-${r.slug}.json`);

// Manual corrections: data/overrides.json, e.g. { "2025-interlagos": { "S": { "wet": true, "note": "damp track" } } }
let OVERRIDES = {};
try { OVERRIDES = JSON.parse(await fs.readFile(path.join(ROOT, "data/overrides.json"), "utf8")); } catch { /* none */ }
function withOverrides(h) {
  const o = h && OVERRIDES[`${h.season}-${h.slug}`];
  if (!o) return h;
  const c = structuredClone(h);
  for (const [code, v] of Object.entries(o)) {
    if (code.startsWith("_") || typeof v !== "object") continue;
    c.sessions[code] ||= { forecast: null, outcome: null, final: true };
    c.sessions[code].outcome = { ...(c.sessions[code].outcome || {}), wet: !!v.wet, source: "manual", note: v.note || null };
  }
  return c;
}
async function readHist(r) {
  try { return JSON.parse(await fs.readFile(histFile(r), "utf8")); } catch { return null; }
}
export async function loadHist(r) { return withOverrides(await readHist(r)); }
export async function loadAllHistory() {
  let files = [];
  try { files = (await fs.readdir(HIST_DIR)).filter((f) => f.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const f of files) { try { out.push(withOverrides(JSON.parse(await fs.readFile(path.join(HIST_DIR, f), "utf8")))); } catch { /* skip broken file */ } }
  return out;
}
export async function saveHist(r, h, before) {
  if (JSON.stringify(before) === JSON.stringify(h)) return;
  await fs.mkdir(HIST_DIR, { recursive: true });
  await fs.writeFile(histFile(r), JSON.stringify(h, null, 2) + "\n");
}
export function newHist(r) {
  return { season: r.season, round: r.round, slug: r.slug, circuitId: r.circuitId, raceName: r.raceName, station: r.station, sessions: {} };
}

// Measure one finished session: F1 trackside station first, METAR as fallback.
export async function measure(r, s, metars) {
  const of1 = await openf1Rain(s.code, s.start);
  if (of1) return { wet: of1.wet, source: "openf1", rain: of1.rain, wetTyres: of1.wetTyres, reports: of1.n };
  const f1s = await findF1Session(s.code, s.start);
  const tr = await trackRain(f1s);
  if (tr.wet != null) return { wet: tr.wet, source: "track", reports: tr.n };
  if (metars && r.station) {
    const m = metarRain(metars, s);
    if (m.wet != null) return { wet: m.wet, source: "metar", station: r.station.id, reports: m.n };
  }
  return null;
}

export async function updateHist(r, hasForecast) {
  const before = await readHist(r);
  const h = before ? structuredClone(before) : newHist(r);
  let open = [];
  for (const s of r.sessions) {
    const e = (h.sessions[s.code] ||= { start: isoZ(s.start), end: isoZ(s.end), forecast: null, forecastAt: null, outcome: null, final: false });
    e.start = isoZ(s.start); e.end = isoZ(s.end);
    const st = W.stateOf({ start: s.start, end: s.end }, now);
    // Freeze the last forecast before the session; when we only see it afterwards, use the past-hours value once.
    if (hasForecast && s.rain != null && ((st === "up" && s.start - now <= FREEZE_BEFORE_MIN * 6e4) || (st !== "up" && e.forecast == null))) {
      e.forecast = s.rain; e.forecastAt = isoZ(now);
    }
    if (st === "done" && !e.final) open.push(s);
  }
  if (open.length) {
    const oldest = Math.min(...open.map((s) => s.start));
    const metars = r.station ? await loadMetars(r.station.id, (now - oldest) / 36e5 + 2) : null;
    for (const s of open) {
      const e = h.sessions[s.code];
      const o = await measure(r, s, metars);
      const rank = (x) => ({ openf1: 3, track: 2, metar: 1 }[x?.source] || 0);
      if (o && rank(o) >= rank(e.outcome)) e.outcome = { ...o, checkedAt: isoZ(now) };
      if (now - s.end > OUTCOME_FINAL_HOURS * 36e5) e.final = true;
    }
  }
  await saveHist(r, h, before);
  return withOverrides(h);
}

export function applyHist(r, h) {
  if (!h) return;
  for (const s of r.sessions) {
    const e = h.sessions[s.code]; if (!e) continue;
    if (e.forecast != null && (s.rain == null || W.stateOf({ start: s.start, end: s.end }, now) !== "up")) s.rain = e.forecast;
    s.outcome = e.outcome ? { wet: e.outcome.wet, source: e.outcome.source, wetTyres: e.outcome.wetTyres ?? null } : null;
  }
}
