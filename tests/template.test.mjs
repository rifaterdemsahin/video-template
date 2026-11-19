import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, cpSync, rmSync, mkdtempSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

test("all core JSON configs parse and contain required schema fields", () => {
  const scenes = readJson("script/scenes.json");
  assert.ok(Array.isArray(scenes.scenes) && scenes.scenes.length >= 3);

  const project = readJson("spec/project.json");
  assert.ok(project.budgetMaxUsd <= 2, "budgetMaxUsd must be <= 2.00");
  assert.ok(project.format?.videoFormat, "format.videoFormat must be present");

  const style = readJson("presets/style.json");
  assert.ok(style.colors?.accent && style.colors?.warn);
  for (const k of ["visualStyle", "soundVoice", "musicBgm", "soundEffects", "backgrounds", "greenKey", "lowerThirds", "transitions"]) {
    assert.ok(style.artDirection?.[k], `Missing artDirection.${k}`);
  }

  readJson("spec/publish.json");
  readJson("presets/render.json");
  readJson("prompts/backgrounds.json");
  readJson("video/package.json");
});

test("all website pages, thumbnails, and shared assets exist and wire nav.js", () => {
  const rootPages = [
    "index.html", "master-spec.html", "script.html", "review.html",
    "kanban.html", "publish.html", "release-checklist.html", "recommendations.html", "agents.html"
  ];
  for (const p of rootPages) {
    const html = read(p);
    assert.ok(html.includes('src="nav.js"'), `${p} must include nav.js`);
    assert.ok(html.includes('href="site.css"'), `${p} must include site.css`);
  }

  const panelHtml = read("panel/index.html");
  assert.ok(panelHtml.includes('src="../nav.js"'), "panel/index.html must include ../nav.js");
  for (const id of ["videoFormat", "audience", "falKey", "deepinfraKey", "budgetMaxUsd", "draftScript", "promptPreview", "dlPromptBtn", "resetBtn"]) {
    assert.ok(panelHtml.includes(`id="${id}"`), `panel/index.html missing #${id}`);
  }
  for (const opt of ["short", "long", "course", "podcast", "Consumer", "Professional", "Business"]) {
    assert.ok(panelHtml.includes(opt), `panel/index.html missing option ${opt}`);
  }

  for (const t of ["thumbnails/thumb-a.html", "thumbnails/thumb-b.html", "thumbnails/thumb-c.html"]) {
    const html = read(t);
    assert.ok(html.includes("1280px") && html.includes("720px"), `${t} must be 1280x720`);
  }
});

test("all .mjs and .sh scripts pass syntax checks", () => {
  const mjs = execSync("ls scripts/*.mjs tests/*.mjs", { cwd: root, encoding: "utf8" }).trim().split(/\s+/);
  for (const f of mjs) execFileSync("node", ["--check", f], { cwd: root });
  execSync("bash -n new-video.sh scripts/*.sh", { cwd: root });
});

test("end-to-end scaffolding, retime, build-video, build-storyboard, and validate on temp copy", () => {
  const tmp = mkdtempSync(join(tmpdir(), "vt-test-"));
  try {
    cpSync(root, tmp, {
      recursive: true,
      filter: (src) => !src.includes("/node_modules") && !src.includes("/.git") && !src.includes("/.hyperframes")
    });

    execSync(`sed -i 's/{{VIDEO_TITLE}}/Eval Test Video/; s/{{SERIES}}/Standalone/; s/{{PUBLISH_DATE}}/2026-11-19/' video.yaml`, { cwd: tmp });
    execFileSync("./new-video.sh", ["eval-test"], { cwd: tmp });

    // Second run must be refused
    assert.throws(() => execFileSync("./new-video.sh", ["eval-test-2"], { cwd: tmp, stdio: "pipe" }));

    execFileSync("node", ["scripts/retime.mjs"], { cwd: tmp });
    execFileSync("node", ["scripts/build-video.mjs"], { cwd: tmp });
    execFileSync("node", ["scripts/build-storyboard.mjs"], { cwd: tmp });
    execFileSync("node", ["scripts/validate.mjs"], { cwd: tmp });

    // Strict mode must fail when <<...>> placeholders or media are missing
    assert.throws(() => execFileSync("node", ["scripts/validate.mjs", "--strict"], { cwd: tmp, stdio: "pipe" }));

    // Verify generated Hyperframes HTML & storyboard
    const indexHtml = readFileSync(join(tmp, "video/index.html"), "utf8");
    assert.ok(indexHtml.includes('window.__timelines["main"]'), "video/index.html missing root timeline");
    assert.ok(indexHtml.includes("DRAFT V1"), "draft build should include DRAFT V1");

    const sceneHtml = readFileSync(join(tmp, "video/compositions/s01-hook.html"), "utf8");
    assert.ok(sceneHtml.includes('window.__timelines["s01-hook"]'), "s01-hook.html missing timeline");
    assert.ok(!sceneHtml.includes("Math.random") && !sceneHtml.includes("Date.now"), "scene must be deterministic");

    const storyboardHtml = readFileSync(join(tmp, "plan/storyboard.html"), "utf8");
    assert.ok(storyboardHtml.includes('src="../nav.js"'), "storyboard.html must include ../nav.js");

    const pub = JSON.parse(readFileSync(join(tmp, "spec/publish.json"), "utf8"));
    assert.ok(Array.isArray(pub.chapters) && pub.chapters.length === 3, "retime.mjs must export chapters");

    const filledNav = readFileSync(join(tmp, "nav.js"), "utf8");
    assert.ok(filledNav.includes("Eval Test Video") && !filledNav.includes("{{VIDEO_TITLE}}"), "nav.js placeholders must be replaced");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
