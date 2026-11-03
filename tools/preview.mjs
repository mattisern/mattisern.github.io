// Local preview of lightly.io: serves the repo's static pages on http://localhost:4000.
// Links to the live booking site are rewritten to the local booking app (localhost:3000),
// so the whole flow can be clicked through before anything is pushed.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT) || 4000;
const LIVE_BOOKING = "https://book.lightly.io";
const LOCAL_BOOKING = "http://localhost:3000";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  // Never serve the booking app's source or anything outside the repo.
  if (path.startsWith("/booking") || path.includes("..")) return notFound(res);

  let file = join(ROOT, path);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    let body = await readFile(file);
    if (extname(file) === ".html") body = body.toString().replaceAll(LIVE_BOOKING, LOCAL_BOOKING);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    notFound(res);
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`lightly.io preview: http://localhost:${PORT}  (booking links point to ${LOCAL_BOOKING})`);
});

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
}
