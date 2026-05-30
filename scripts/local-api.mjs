/**
 * Local dev API server — mimics Vercel Functions for /api routes.
 * Reads .env.local, serves on port 3001, Vite proxies /api to here.
 * Usage: node scripts/local-api.mjs
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env.local into process.env
const envFile = resolve(root, ".env.local");
if (existsSync(envFile)) {
  const lines = readFileSync(envFile, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
  console.log("Loaded .env.local");
} else {
  console.warn("No .env.local found — API calls may fail without DATABASE_URL");
}

// Route table: maps URL path prefix → handler module. Order matters: more-specific routes first.
const routes = [
  ["/api/auth/signin",        "../api/auth/signin.js"],
  ["/api/auth/signup",        "../api/auth/signup.js"],
  ["/api/auth/check-username","../api/auth/check-username.js"],
  ["/api/saves/",             "../api/saves/[recipeId].js"], // /api/saves/:recipeId
  ["/api/saves",              "../api/saves.js"],            // POST /api/saves
  ["/api/recipes/parse",      "../api/recipes/parse.js"],    // POST parse
  ["/api/recipes/",           "../api/recipes/[id].js"],     // /api/recipes/:id
  ["/api/recipes",            "../api/recipes.js"],
  ["/api/ingredients",        "../api/ingredients.js"],
];

function makeReq(nodeReq, body) {
  const url = new URL(nodeReq.url, "http://localhost");
  const query = {};
  for (const [k, v] of url.searchParams) query[k] = v;

  // Extract dynamic params: /api/recipes/:id  and  /api/saves/:recipeId
  const recipeIdMatch = url.pathname.match(/^\/api\/recipes\/(.+)$/);
  const saveIdMatch = url.pathname.match(/^\/api\/saves\/(.+)$/);
  let query2 = query;
  if (recipeIdMatch) query2 = { ...query, id: recipeIdMatch[1] };
  else if (saveIdMatch) query2 = { ...query, recipeId: saveIdMatch[1] };

  return {
    method: nodeReq.method,
    url: nodeReq.url,
    headers: nodeReq.headers,
    query: query2,
    body,
  };
}

function makeRes(nodeRes) {
  let statusCode = 200;
  const res = {
    status(code) { statusCode = code; return res; },
    setHeader(k, v) { nodeRes.setHeader(k, v); return res; },
    json(data) {
      nodeRes.writeHead(statusCode, { "Content-Type": "application/json" });
      nodeRes.end(JSON.stringify(data));
    },
    send(data) {
      nodeRes.writeHead(statusCode);
      nodeRes.end(data);
    },
    end(data) {
      nodeRes.writeHead(statusCode);
      nodeRes.end(data);
    },
  };
  return res;
}

const server = createServer(async (nodeReq, nodeRes) => {
  // CORS for local dev
  nodeRes.setHeader("Access-Control-Allow-Origin", "*");
  nodeRes.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  nodeRes.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (nodeReq.method === "OPTIONS") { nodeRes.writeHead(204); nodeRes.end(); return; }

  // Parse body
  let body = {};
  if (nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
    await new Promise((resolve) => {
      let raw = "";
      nodeReq.on("data", (chunk) => (raw += chunk));
      nodeReq.on("end", () => {
        try { body = JSON.parse(raw); } catch { body = {}; }
        resolve();
      });
    });
  }

  const pathname = new URL(nodeReq.url, "http://localhost").pathname;
  let handlerPath = null;
  for (const [prefix, mod] of routes) {
    if (pathname === prefix || pathname.startsWith(prefix)) {
      handlerPath = mod;
      break;
    }
  }

  if (!handlerPath) {
    nodeRes.writeHead(404, { "Content-Type": "application/json" });
    nodeRes.end(JSON.stringify({ error: `No handler for ${pathname}` }));
    return;
  }

  try {
    const modUrl = new URL(handlerPath, import.meta.url).href;
    const { default: handler } = await import(`${modUrl}?t=${Date.now()}`);
    await handler(makeReq(nodeReq, body), makeRes(nodeRes));
  } catch (err) {
    console.error("Handler error:", err);
    nodeRes.writeHead(500, { "Content-Type": "application/json" });
    nodeRes.end(JSON.stringify({ error: String(err) }));
  }
});

const PORT = 3001;
server.listen(PORT, () => console.log(`Local API server running on http://localhost:${PORT}`));
