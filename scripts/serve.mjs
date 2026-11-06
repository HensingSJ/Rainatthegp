// Local preview of dist/: node scripts/serve.mjs  ->  http://localhost:8080
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain" };
const PORT = +process.env.PORT || 8080;
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(DIST, path.normalize(p));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    try { res.writeHead(404, { "content-type": TYPES[".html"] }).end(await fs.readFile(path.join(DIST, "404.html"))); }
    catch { res.writeHead(404).end("Not found"); }
  }
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}`));
