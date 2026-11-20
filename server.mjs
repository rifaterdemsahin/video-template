import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { P } from "./scripts/lib/project.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env locally if present
if (fs.existsSync(path.join(__dirname, ".env"))) {
  try {
    const envLines = fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n");
    for (const line of envLines) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m) {
        let v = (m[2] || "").trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[m[1]]) process.env[m[1]] = v;
      }
    }
  } catch (_) {}
}

const PORT = parseInt(process.env.PORT || "8080", 10);
const HOST = "0.0.0.0";

// Azure SAS URL from environment / Azure Key Vault
// The SAS URL of ONE storage container (e.g. https://acct.blob.core.windows.net/review-notes?sv=...&sig=...).
// It stays on the server: the browser never receives it. Uploads and reads go through /api/upload-drawing, /api/drawing/<name>
// and /api/verification. Put it in .env (local) or as a Fly secret: fly secrets set AZURE_STORAGE_SAS='...'
let AZURE_SAS = process.env.AZURE_STORAGE_SAS || "";
const BLOB_PREFIX = (process.env.AZURE_BLOB_PREFIX || P.slug).replace(/[^\w.-]/g, "-") + "/";
const SLUG = P.fileSlug;
const safeName = (n) => /^[\w.-]{1,200}$/.test(n || "") && !n.startsWith(".");
const KEY_VAULT_NAME = process.env.KEY_VAULT_NAME || "";

// In-memory verification cache for sub-millisecond UX response
let verificationCache = {
  data: null,
  timestamp: 0,
  ttlMs: 20000 // 20s cache
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8"
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-ms-blob-type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB max
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export async function requestHandler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = reqUrl.pathname;
  // GitHub Pages serves the site under /<repo>/: accept the same paths here
  const repoBase = P.repo ? "/" + P.repo.split("/")[1] : "";
  if (repoBase && pathname.startsWith(repoBase + "/")) pathname = pathname.slice(repoBase.length);
  else if (repoBase && pathname === repoBase) pathname = "/";

  // Read live from the repo so /health never reports a stale hard-coded version.
  const readJsonSafe = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, rel), "utf8")); } catch { return {}; } };

  // --- API: Health ---
  if (pathname === "/health" || pathname === "/api/health") {
    return sendJson(res, 200, {
      status: "ok",
      app: P.slug + "-review",
      version: P.siteVersion,
      latestDraft: readJsonSafe("draft/versions.json").latest || null,
      azureConfigured: !!AZURE_SAS,
      keyVault: KEY_VAULT_NAME,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  }

  // --- API: Azure Config (Provides SAS securely from Key Vault to Frontend) ---
  if (pathname === "/api/azure-config") {
    return sendJson(res, 200, {
      configured: !!AZURE_SAS,
      source: KEY_VAULT_NAME ? "Azure Key Vault (" + KEY_VAULT_NAME + ")" : "server environment",
      mode: "server-proxy",
      prefix: BLOB_PREFIX
    });
  }

  // --- API: Read a drawing through the server (the SAS never leaves the server) ---
  if (pathname.startsWith("/api/drawing/") && req.method === "GET") {
    const name = decodeURIComponent(pathname.slice("/api/drawing/".length));
    if (!AZURE_SAS || !safeName(name)) return sendJson(res, 404, { error: "not found" });
    try {
      const u = new URL(AZURE_SAS);
      const blobRes = await fetch(u.origin + u.pathname.replace(/\/$/, "") + "/" + BLOB_PREFIX + name + u.search);
      if (!blobRes.ok) return sendJson(res, blobRes.status, { error: "not found" });
      res.writeHead(200, { "Content-Type": blobRes.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, max-age=300" });
      return res.end(Buffer.from(await blobRes.arrayBuffer()));
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- API: Verification Get (Cached & Ultra-fast) ---
  if (pathname === "/api/verification" && req.method === "GET") {
    const draftN = reqUrl.searchParams.get("draft") || "10";
    const filename = `${SLUG}-Draft-v${draftN}-Verification.json`;

    // Serve from cache if fresh
    const now = Date.now();
    if (verificationCache.data && (now - verificationCache.timestamp < verificationCache.ttlMs)) {
      if (verificationCache.data.draft === `Draft v${draftN}`) {
        return sendJson(res, 200, { ...verificationCache.data, _cached: true });
      }
    }

    if (!AZURE_SAS) {
      return sendJson(res, 200, { verifiedMap: {}, verifiedCount: 0, _local: true });
    }

    try {
      const u = new URL(AZURE_SAS);
      const cleanPath = u.pathname.replace(/\/$/, "");
      const getUrl = u.origin + cleanPath + "/" + BLOB_PREFIX + filename + u.search;

      let blobRes = await fetch(getUrl);
      if (blobRes.ok) {
        const data = await blobRes.json();
        verificationCache = { data, timestamp: now, ttlMs: 20000 };
        return sendJson(res, 200, data);
      } else {
        // Fallback: search backwards for latest draft verification in Azure
        let prevN = parseInt(draftN, 10) - 1;
        while (prevN >= 1) {
          const prevFile = `${SLUG}-Draft-v${prevN}-Verification.json`;
          const prevUrl = u.origin + cleanPath + "/" + BLOB_PREFIX + prevFile + u.search;
          try {
            const prevRes = await fetch(prevUrl);
            if (prevRes.ok) {
              const prevData = await prevRes.json();
              return sendJson(res, 200, {
                ...prevData,
                _inheritedFrom: `Draft v${prevN}`,
                _inheritedFor: `Draft v${draftN}`
              });
            }
          } catch (_) {}
          prevN--;
        }
        return sendJson(res, 200, { verifiedMap: {}, verifiedCount: 0, status: blobRes.status });
      }
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- API: Verification Save (Backend Proxy for 100% Reliability) ---
  if (pathname === "/api/verification" && req.method === "POST") {
    if (!AZURE_SAS) {
      return sendJson(res, 500, { error: "Azure SAS not configured in backend environment" });
    }

    try {
      const bodyText = await readBody(req);
      const payload = JSON.parse(bodyText);
      const draftN = payload.draft ? String(payload.draft).replace(/[^0-9]/g, "") || "9" : "9";
      const filename = `${SLUG}-Draft-v${draftN}-Verification.json`;

      const u = new URL(AZURE_SAS);
      const cleanPath = u.pathname.replace(/\/$/, "");
      const putUrl = u.origin + cleanPath + "/" + BLOB_PREFIX + filename + u.search;

      const blobRes = await fetch(putUrl, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload, null, 2)
      });

      if (blobRes.ok) {
        verificationCache = { data: payload, timestamp: Date.now(), ttlMs: 20000 };
        return sendJson(res, 200, { ok: true, filename, count: payload.verifiedCount || 0 });
      } else {
        return sendJson(res, blobRes.status, { error: `Azure PUT failed HTTP ${blobRes.status}` });
      }
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- API: Upload Drawing (Backend Proxy avoiding Client CORS) ---
  if (pathname === "/api/upload-drawing" && req.method === "POST") {
    if (!AZURE_SAS) {
      return sendJson(res, 500, { error: "Azure SAS not configured" });
    }

    try {
      const bodyText = await readBody(req);
      const { filename, dataUrl, contentType = "image/jpeg" } = JSON.parse(bodyText);

      if (!safeName(filename) || !dataUrl) {
        return sendJson(res, 400, { error: "Missing or invalid filename or dataUrl" });
      }

      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      const u = new URL(AZURE_SAS);
      const cleanPath = u.pathname.replace(/\/$/, "");
      const putUrl = u.origin + cleanPath + "/" + BLOB_PREFIX + filename + u.search;

      const blobRes = await fetch(putUrl, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": contentType
        },
        body: buffer
      });

      if (blobRes.ok) {
        return sendJson(res, 200, { ok: true, url: "/api/drawing/" + encodeURIComponent(filename), filename });
      } else {
        return sendJson(res, blobRes.status, { error: `Upload failed HTTP ${blobRes.status}` });
      }
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- Static File Serving ---
  let filePath = path.join(__dirname, pathname === "/" ? "index.html" : pathname);

  // Security: stay inside the repo, and never serve dotfiles or dot-folders (.env holds API keys, .git the history)
  const rel = path.relative(__dirname, filePath);
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel.split(path.sep).some((seg) => seg.startsWith("."))) {
    res.writeHead(404);
    return res.end("Not found");
  }

  // Resolve directory or .html extensions
  let stat;
  try {
    stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      stat = fs.statSync(filePath);
    }
  } catch (e) {
    if (fs.existsSync(filePath + ".html")) {
      filePath = filePath + ".html";
      try { stat = fs.statSync(filePath); } catch (_) {}
    } else {
      // Automatic fallback for draft video/frame assets if the latest draft is still pending render
      const vidMatch = pathname.match(/^\/draft\/v(\d+)\/video\.mp4$/);
      if (vidMatch) {
        let fallbackN = parseInt(vidMatch[1], 10) - 1;
        while (fallbackN >= 1) {
          const testPath = path.join(__dirname, "draft", `v${fallbackN}`, "video.mp4");
          if (fs.existsSync(testPath)) {
            filePath = testPath;
            try { stat = fs.statSync(filePath); } catch (_) {}
            res.setHeader("X-Draft-Video-Fallback", `v${fallbackN}`);
            res.setHeader("X-Draft-Video-Requested", `v${vidMatch[1]}`);
            break;
          }
          fallbackN--;
        }
      }
      const frameMatch = pathname.match(/^\/draft\/v(\d+)\/frames\/(.+)$/);
      if (frameMatch && !stat) {
        let fallbackN = parseInt(frameMatch[1], 10) - 1;
        while (fallbackN >= 1) {
          const testPath = path.join(__dirname, "draft", `v${fallbackN}`, "frames", frameMatch[2]);
          if (fs.existsSync(testPath)) {
            filePath = testPath;
            try { stat = fs.statSync(filePath); } catch (_) {}
            res.setHeader("X-Draft-Frame-Fallback", `v${fallbackN}`);
            break;
          }
          fallbackN--;
        }
      }
    }
  }

  if (!stat) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<h1>404 Not Found</h1><p>Path: ${pathname}</p>`);
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const totalSize = stat.size;
  const range = req.headers.range;

  // HTTP 206 Partial Content streaming for sample-accurate video/audio seeking
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (isNaN(start) || start >= totalSize || (parts[1] && isNaN(end)) || end >= totalSize || start > end) {
      res.writeHead(416, {
        "Content-Range": `bytes */${totalSize}`,
        "Accept-Ranges": "bytes"
      });
      return res.end();
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${totalSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": contentType
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": totalSize,
      "Accept-Ranges": "bytes",
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

export const server = http.createServer(requestHandler);

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  server.listen(PORT, HOST, () => {
    console.log(`🚀 Hyperframes Backend Server running on http://${HOST}:${PORT}`);
    console.log(`☁️ Azure Storage SAS: ${AZURE_SAS ? "Configured (from Key Vault)" : "Not configured"}`);
  });
}
