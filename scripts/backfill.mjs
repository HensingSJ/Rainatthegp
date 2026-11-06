// One-off: fill data/history with rain measurements from past seasons. No forecasts, only outcomes.
//   node scripts/backfill.mjs --from 2018 --to 2026
// Source per weekend: F1 trackside weather station (live timing archive) if reachable,
// otherwise the METAR archive of the nearest airport (Iowa Environmental Mesonet).
// Existing history files are left alone.
import fs from "node:fs/promises";
import path from "node:path";
import "../src/shared.js";
import { NOW, now, isoZ, sleep, SESSION_MIN } from "./lib/config.mjs";
import { loadRaces, f1Index, f1Sessions, trackRain, loadIemMetars, metarRain } from "./lib/sources.mjs";
import { histFile, newHist } from "./lib/history.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const from = arg("--from", 2018), to = arg("--to", NOW.getUTCFullYear());
const count = { track: 0, metar: 0, skipped: 0, missing: 0 };

for (let y = from; y <= to; y++) {
  let races;
  try { races = await loadRaces([y]); } catch (e) { console.warn(`${y}: calendar unavailable (${e.message})`); continue; }
  await sleep(500);
  const idx = await f1Index(y);
  const all = idx ? f1Sessions(idx) : [];
  console.log(`${y}: ${races.length} races, F1 archive ${idx ? "available" : "not reachable, using airport archive"}`);
  for (const r of races) {
    if (r.raceEnd > now - 6 * 36e5) continue;
    try { await fs.access(histFile(r)); count.skipped++; continue; } catch { /* not there yet */ }
    const h = newHist(r);
    let source = null;

    // 1. F1 trackside station
    const race = all.find((x) => x.code === "R" && Math.abs(x.start - r.raceStart) < 6 * 36e5);
    if (race) {
      for (const s of all.filter((x) => x.meeting === race.meeting && x.start <= race.start && race.start - x.start < 5 * 864e5)) {
        const res = await trackRain(s); await sleep(150);
        if (res.wet == null) continue;
        h.sessions[s.code] = { start: isoZ(s.start), end: isoZ(s.start + SESSION_MIN[s.code] * 6e4), forecast: null, forecastAt: null,
          outcome: { wet: res.wet, source: "track", reports: res.n, checkedAt: isoZ(now) }, final: true, backfill: true };
        source = "track";
      }
    }
    // 2. Airport METAR archive
    if (!source && r.station) {
      const timed = r.sessions.filter((s) => s.timed);
      const metars = timed.length ? await loadIemMetars(r.station.id, Math.min(...timed.map((s) => s.start)), r.raceEnd) : null;
      await sleep(1000); // be gentle with the archive
      if (metars) for (const s of timed) {
        const m = metarRain(metars, s);
        if (m.wet == null) continue;
        h.sessions[s.code] = { start: isoZ(s.start), end: isoZ(s.end), forecast: null, forecastAt: null,
          outcome: { wet: m.wet, source: "metar", station: r.station.id, reports: m.n, checkedAt: isoZ(now) }, final: true, backfill: true };
        source = "metar";
      }
    }
    if (!source) { console.warn(`  R${r.round} ${r.raceName}: no data`); count.missing++; continue; }
    await fs.mkdir(path.dirname(histFile(r)), { recursive: true });
    await fs.writeFile(histFile(r), JSON.stringify(h, null, 2) + "\n");
    const wet = Object.entries(h.sessions).filter(([, e]) => e.outcome?.wet).map(([c]) => c);
    console.log(`  R${r.round} ${r.raceName}: ${Object.keys(h.sessions).join(" ")} via ${source}, rain in ${wet.join(", ") || "none"}`);
    count[source]++;
  }
}
console.log(`Done: ${count.track} weekends from the F1 archive, ${count.metar} from airports, ${count.skipped} already present, ${count.missing} without data.`);
