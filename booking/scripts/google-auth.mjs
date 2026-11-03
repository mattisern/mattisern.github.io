// One-time: connect your Google account so the site can read busy times and send invites.
// Reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from .env.local, opens Google's consent
// screen, and writes GOOGLE_REFRESH_TOKEN back into .env.local.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";

const ENV_FILE = ".env.local";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error(`Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in ${ENV_FILE} first (see SETUP.md).`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== "/") return res.writeHead(404).end();
  const code = url.searchParams.get("code");
  if (!code) {
    res.end(`Google said: ${url.searchParams.get("error") ?? "no code"}. You can close this tab.`);
    return finish(1, "Authorisation was cancelled or failed.");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = await tokenRes.json();
  if (!json.refresh_token) {
    res.end("Something went wrong — check the terminal. You can close this tab.");
    return finish(1, `No refresh token returned: ${JSON.stringify(json)}`);
  }

  saveEnv("GOOGLE_REFRESH_TOKEN", json.refresh_token);
  res.end("Connected! You can close this tab and go back to the terminal.");
  finish(0, `Saved GOOGLE_REFRESH_TOKEN to ${ENV_FILE}. For production, copy it into your host's environment variables.`);
});

let redirectUri;
server.listen(0, "127.0.0.1", () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  console.log(`Opening Google sign-in. If nothing opens, visit:\n\n${auth}\n`);
  execFile(process.platform === "darwin" ? "open" : "xdg-open", [auth.toString()], () => {});
});

function saveEnv(key, value) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n") : [];
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(ENV_FILE, lines.join("\n"));
}

function finish(code, message) {
  console[code ? "error" : "log"](message);
  server.close();
  process.exitCode = code;
}
