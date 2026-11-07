// data/overrides.json: manual corrections, per "<season>-<circuit slug>" and session code.
//   "wet": true/false        -> overrides the measured result
//   "start": "...Z", "end"   -> moved session (postponed, delayed); times in UTC
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";

export let OVERRIDES = {};
try { OVERRIDES = JSON.parse(await fs.readFile(path.join(ROOT, "data/overrides.json"), "utf8")); } catch { /* none */ }
export const overridesFor = (season, slug) => OVERRIDES[`${season}-${slug}`] || null;
