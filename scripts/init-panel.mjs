// Local web server for the New Video Bulk Setup Panel (panel/index.html).
// Usage: node scripts/init-panel.mjs [port]   (default: 4173)
import { createServer } from "node:http";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { handleMcpMessage, listArtifactsData, MCP_SERVER_INFO, MCP_TOOLS } from "./mcp-server.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || process.env.PORT || 4173);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const layoutsPath = `${root}/presets/layouts.json`;
const readLayoutsDoc = () => JSON.parse(readFileSync(layoutsPath, "utf8"));

const json = (res, code, data) => {
  res.writeHead(code, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(data));
};

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(readFileSync(`${root}/panel/index.html`, "utf8"));
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    json(res, 200, { ok: true, mcp: MCP_SERVER_INFO });
    return;
  }

  if (req.method === "GET" && req.url === "/mcp") {
    json(res, 200, { ok: true, server: MCP_SERVER_INFO, tools: MCP_TOOLS });
    return;
  }

  if (req.method === "POST" && req.url === "/mcp") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      try {
        const resp = handleMcpMessage(JSON.parse(body || "{}"));
        if (!resp) { res.writeHead(204, CORS); res.end(); return; }
        json(res, 200, resp);
      } catch (err) {
        json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: err.message } });
      }
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/artifacts")) {
    const u = new URL(req.url, `http://localhost:${port}`);
    const data = listArtifactsData({
      account: u.searchParams.get("account") || undefined,
      container: u.searchParams.get("container") || undefined,
      prefix: u.searchParams.get("prefix") ?? undefined
    });
    json(res, 200, data);
    return;
  }

  if (req.method === "GET" && req.url.split("?")[0] === "/api/layouts") {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const doc = readLayoutsDoc();
      const allLayouts = Array.isArray(doc.layouts) ? doc.layouts : [];
      const enabledFilter = u.searchParams.get("enabled");
      const categoryFilter = u.searchParams.get("category");
      let filtered = allLayouts;
      if (enabledFilter === "true" || enabledFilter === "false") {
        const want = enabledFilter === "true";
        filtered = filtered.filter((l) => Boolean(l.enabled) === want);
      }
      if (categoryFilter) {
        filtered = filtered.filter((l) => String(l.category || "").toLowerCase() === categoryFilter.toLowerCase());
      }
      const enabledIds = allLayouts.filter((l) => l.enabled).map((l) => l.id);
      json(res, 200, {
        ok: true,
        canvas: doc.canvas || { width: 1920, height: 1080, safeAreaPaddingPx: 60 },
        total: allLayouts.length,
        enabledCount: enabledIds.length,
        enabledIds,
        layouts: filtered
      });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/layouts/")) {
    try {
      const id = decodeURIComponent(req.url.split("?")[0].slice("/api/layouts/".length));
      const doc = readLayoutsDoc();
      const layout = (doc.layouts || []).find((l) => l.id === id);
      if (!layout) return json(res, 404, { error: `Layout '${id}' not found` });
      json(res, 200, { ok: true, canvas: doc.canvas, layout });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
    return;
  }

  if ((req.method === "POST" || req.method === "PUT") && req.url.split("?")[0] === "/api/layouts") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const doc = readLayoutsDoc();
        const layouts = Array.isArray(doc.layouts) ? doc.layouts : [];

        if (Array.isArray(payload.enabledIds)) {
          const wanted = new Set(payload.enabledIds);
          layouts.forEach((l) => { l.enabled = wanted.has(l.id); });
        } else if (payload.toggleId) {
          const target = layouts.find((l) => l.id === payload.toggleId);
          if (!target) return json(res, 404, { error: `Layout '${payload.toggleId}' not found` });
          target.enabled = typeof payload.enabled === "boolean" ? payload.enabled : !target.enabled;
        } else if (Array.isArray(payload.layouts)) {
          const byId = new Map(payload.layouts.map((l) => [l.id, l]));
          layouts.forEach((l) => {
            const upd = byId.get(l.id);
            if (upd && typeof upd.enabled === "boolean") l.enabled = upd.enabled;
          });
        } else {
          return json(res, 400, { error: "Provide enabledIds[], toggleId, or layouts[]" });
        }

        doc.layouts = layouts;
        writeFileSync(layoutsPath, JSON.stringify(doc, null, 2) + "\n");
        const enabledIds = layouts.filter((l) => l.enabled).map((l) => l.id);
        json(res, 200, {
          ok: true,
          total: layouts.length,
          enabledCount: enabledIds.length,
          enabledIds,
          layouts
        });
      } catch (err) {
        json(res, 400, { error: err.message });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/init") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      try {
        const d = JSON.parse(body);
        const slug = d.video?.slug;
        if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
          return json(res, 400, { error: "Invalid slug (use lowercase letters, digits, dashes)" });
        }

        // 1. video.yaml
        const yaml = [
          `title: ${JSON.stringify(d.video.title)}`,
          `series: ${JSON.stringify(d.video.series)}`,
          `publish_date: ${JSON.stringify(d.video.publish_date)}`,
          `slug: "{{SLUG}}"`,
        ].join("\n") + "\n";
        writeFileSync(`${root}/video.yaml`, yaml);

        // 2. spec/project.json
        const proj = JSON.parse(readFileSync(`${root}/spec/project.json`, "utf8"));
        Object.assign(proj, {
          title: d.video.title,
          series: d.video.series,
          slug,
          owner: d.brief.owner,
          audience: d.brief.audience,
          goal: d.brief.goal,
          singleCallToAction: d.brief.singleCallToAction,
          tone: d.brief.tone,
          targetLengthSeconds: d.totalSecondsApprox,
          budgetMaxUsd: d.brief.budgetMaxUsd || 1.5,
          language: d.brief.language,
          disclaimer: d.brief.disclaimer || "",
        });
        proj.format = { ...(proj.format || {}), videoFormat: d.video.videoFormat || "long" };
        writeFileSync(`${root}/spec/project.json`, JSON.stringify(proj, null, 2) + "\n");

        // 3. presets/style.json
        const stylePath = `${root}/presets/style.json`;
        const style = existsSync(stylePath) ? JSON.parse(readFileSync(stylePath, "utf8")) : { colors: {} };
        style.colors = { ...(style.colors || {}), accent: d.style.accent, warn: d.style.warn };
        if (d.style?.artDirection) style.artDirection = { ...(style.artDirection || {}), ...d.style.artDirection };
        writeFileSync(stylePath, JSON.stringify(style, null, 2) + "\n");

        // 4. prompts/backgrounds.json
        const bgPath = `${root}/prompts/backgrounds.json`;
        const bg = JSON.parse(readFileSync(bgPath, "utf8"));
        bg.plates = { ...(bg.plates || {}), ...(d.plates || {}) };
        writeFileSync(bgPath, JSON.stringify(bg, null, 2) + "\n");

        // 5. script/scenes.json, spec/base-artifacts.json & plan/outline.md
        if (d.baseArtifacts) {
          writeFileSync(`${root}/spec/base-artifacts.json`, JSON.stringify(d.baseArtifacts, null, 2) + "\n");
        }
        if (d.draftScript) {
          writeFileSync(`${root}/plan/outline.md`, `# Outline: ${d.video.title}\n\n${d.draftScript}\n`);
        }
        const existingScenes = JSON.parse(readFileSync(`${root}/script/scenes.json`, "utf8"));
        const scenesDoc = {
          title: d.video.title,
          slug,
          totalSecondsApprox: d.totalSecondsApprox || existingScenes.totalSecondsApprox,
          scenes: Array.isArray(d.scenes) && d.scenes.length ? d.scenes : existingScenes.scenes,
        };
        writeFileSync(`${root}/script/scenes.json`, JSON.stringify(scenesDoc, null, 2) + "\n");

        // 6. Run placeholder filler, meta.json, retime, build-video, build-storyboard
        const logs = [];
        logs.push(execFileSync("node", [`${root}/scripts/fill-placeholders.mjs`, slug], { encoding: "utf8" }).trim());
        writeFileSync(`${root}/video/meta.json`, JSON.stringify({ id: slug, name: slug, createdAt: new Date().toISOString() }, null, 2) + "\n");
        if (!existsSync(`${root}/.env`) && existsSync(`${root}/.env.example`)) {
          copyFileSync(`${root}/.env.example`, `${root}/.env`);
        }
        if (d.keys?.falKey || d.keys?.deepinfraKey) {
          const envLines = [
            `FAL_KEY=${d.keys.falKey || ""}`,
            `DEEPINFRA_API_KEY=${d.keys.deepinfraKey || ""}`,
          ];
          writeFileSync(`${root}/.env`, envLines.join("\n") + "\n");
        }
        logs.push(execFileSync("node", [`${root}/scripts/retime.mjs`], { encoding: "utf8" }).trim());
        logs.push(execFileSync("node", [`${root}/scripts/build-video.mjs`], { encoding: "utf8" }).trim());
        logs.push(execFileSync("node", [`${root}/scripts/build-storyboard.mjs`], { encoding: "utf8" }).trim());

        json(res, 200, { ok: true, log: logs.join("\n") });
      } catch (err) {
        json(res, 500, { error: err.message });
      }
    });
    return;
  }

  if (req.method === "GET") {
    const cleanPath = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
    const target = resolve(root, cleanPath || "panel/index.html");
    const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };
    const ext = target.slice(target.lastIndexOf("."));
    if (target.startsWith(root) && existsSync(target) && mime[ext]) {
      res.writeHead(200, { "Content-Type": mime[ext] });
      res.end(readFileSync(target));
      return;
    }
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`New Video Setup Panel & MCP Server running at http://0.0.0.0:${port}`);
});
