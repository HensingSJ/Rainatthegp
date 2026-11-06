import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DIST = path.join(ROOT, "dist");
export const OFFLINE = process.argv.includes("--offline");
export const SITE = (process.env.SITE_URL || "https://rainatthegp.com").replace(/\/$/, "");
export const NOW = process.env.NOW ? new Date(process.env.NOW) : new Date();
export const now = NOW.getTime();

export const LANGS = ["en", "nl", "es"];                 // en lives at /, the others at /nl/ and /es/
export const FORECAST_WINDOW_DAYS = 7;                   // show a forecast once the first session is this close
export const KEEP_CURRENT_HOURS = 6;                     // keep a weekend "current" this long after the race
export const FREEZE_BEFORE_MIN = 75;                     // store the forecast made this close to session start
export const OUTCOME_FINAL_HOURS = 3;                    // keep re-checking the outcome this long after a session
// F1 live timing (trackside weather station). Unofficial source: set F1_TRACK_WEATHER=off to switch it off.
export const USE_F1_TRACK = (process.env.F1_TRACK_WEATHER || "on").toLowerCase() !== "off";

export const SESSION_MIN = { FP1: 60, FP2: 60, FP3: 60, SQ: 45, S: 60, Q: 60, R: 120 };
export const HIST_DIR = path.join(ROOT, OFFLINE ? ".offline-history" : "data/history");

export const read = (p) => fs.readFile(path.join(ROOT, p), "utf8");
export const isoZ = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const UA = { "user-agent": "rainatthegp-build (+https://rainatthegp.com)" };

// Path of a page for a language: langPath("nl", "spa") -> "/nl/spa/"
export const langPath = (lang, slug = "") => `${lang === "en" ? "" : "/" + lang}/${slug ? slug + "/" : ""}`;
