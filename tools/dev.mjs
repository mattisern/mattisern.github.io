// `npm run dev` from the repo root: runs the site preview and the booking app together.
// Ctrl+C stops both.

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const procs = [
  ["site", process.execPath, ["tools/preview.mjs"]],
  ["booking", "npm", ["--prefix", "booking", "run", "dev", "--", "--port", "3000"]],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (chunk) => chunk.toString().replace(/^(?=.)/gm, `[${name}] `);
  p.stdout.on("data", (c) => process.stdout.write(prefix(c)));
  p.stderr.on("data", (c) => process.stderr.write(prefix(c)));
  p.on("exit", (code) => {
    console.log(`[${name}] stopped${code ? ` (exit ${code})` : ""}`);
    stopAll();
  });
  return p;
});

console.log("\nSite:     http://localhost:4000\nBooking:  http://localhost:3000/book\n");

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill("SIGTERM");
}
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
