// Local web server for the New Video Bulk Setup Panel (panel/index.html).
// Usage: node scripts/init-panel.mjs [port]   (default: 4173)
import { createServer } from "node:http";
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 4173);

const json = (res, code, data) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

const server = createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(readFileSync(`${root}/panel/index.html`, "utf8"));
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    json(res, 200, { ok: true });
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
          language: d.brief.language,
          disclaimer: d.brief.disclaimer || "",
        });
        writeFileSync(`${root}/spec/project.json`, JSON.stringify(proj, null, 2) + "\n");

        // 3. presets/style.json
        const stylePath = `${root}/presets/style.json`;
        const style = existsSync(stylePath) ? JSON.parse(readFileSync(stylePath, "utf8")) : { colors: {} };
        style.colors = { ...(style.colors || {}), accent: d.style.accent, warn: d.style.warn };
        writeFileSync(stylePath, JSON.stringify(style, null, 2) + "\n");

        // 4. prompts/backgrounds.json
        const bgPath = `${root}/prompts/backgrounds.json`;
        const bg = JSON.parse(readFileSync(bgPath, "utf8"));
        bg.plates = { ...(bg.plates || {}), ...(d.plates || {}) };
        writeFileSync(bgPath, JSON.stringify(bg, null, 2) + "\n");

        // 5. script/scenes.json & plan/outline.md
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

  res.writeHead(404);
  res.end("Not found");
});

server.listen(port, () => {
  console.log(`New Video Setup Panel running at http://localhost:${port}`);
});
