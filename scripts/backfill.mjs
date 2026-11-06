// One-off: fill data/history with rain measurements from past seasons, using the
// F1 trackside weather station (live timing archive). No forecasts, only outcomes.
//   node scripts/backfill.mjs --from 2018 --to 2025
// Existing history files are left alone.
import fs from "node:fs/promises";
import "../src/shared.js";
import { NOW, now, isoZ, sleep, SESSION_MIN } from "./lib/config.mjs";
import { loadRaces, f1Index, f1Sessions, trackRain } from "./lib/sources.mjs";
import { histFile, newHist } from "./lib/history.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const from = arg("--from", 2018), to = arg("--to", NOW.getUTCFullYear());
let written = 0, skipped = 0, missing = 0;

for (let y = from; y <= to; y++) {
  let races;
  try { races = await loadRaces([y]); } catch (e) { console.warn(`${y}: calendar unavailable (${e.message})`); continue; }
  const idx = await f1Index(y);
  if (!idx) { console.warn(`${y}: no F1 live timing archive`); continue; }
  const all = f1Sessions(idx);
  for (const r of races) {
    if (r.raceEnd > now) continue;
    try { await fs.access(histFile(r)); skipped++; continue; } catch { /* not there yet */ }
    const race = all.find((x) => x.code === "R" && Math.abs(x.start - r.raceStart) < 6 * 36e5);
    if (!race) { console.warn(`${y} R${r.round} ${r.raceName}: not found in archive`); missing++; continue; }
    const sessions = all.filter((x) => x.meeting === race.meeting && x.start <= race.start && race.start - x.start < 5 * 864e5);
    const h = newHist(r);
    for (const s of sessions) {
      const res = await trackRain(s);
      await sleep(150);
      h.sessions[s.code] = { start: isoZ(s.start), end: isoZ(s.start + SESSION_MIN[s.code] * 6e4), forecast: null, forecastAt: null,
        outcome: res.wet == null ? null : { wet: res.wet, source: "track", reports: res.n, checkedAt: isoZ(now) }, final: true, backfill: true };
    }
    const n = Object.values(h.sessions).filter((e) => e.outcome).length;
    if (!n) { console.warn(`${y} R${r.round} ${r.raceName}: no weather data`); missing++; continue; }
    await fs.mkdir((await import("node:path")).dirname(histFile(r)), { recursive: true });
    await fs.writeFile(histFile(r), JSON.stringify(h, null, 2) + "\n");
    const wet = Object.entries(h.sessions).filter(([, e]) => e.outcome?.wet).map(([c]) => c);
    console.log(`${y} R${r.round} ${r.raceName}: ${n} sessions, rain in ${wet.join(", ") || "none"}`);
    written++;
  }
}
console.log(`Done: ${written} weekends written, ${skipped} already present, ${missing} without data.`);
