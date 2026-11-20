// Project facts for the generators, so no script hard-codes a video, a repo or a version.
//   import { P } from "./lib/project.mjs";   P.slug, P.title, P.repo, P.siteVersion, P.voice, P.root
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => (existsSync(`${root}/${p}`) ? readFileSync(`${root}/${p}`, "utf8") : "");
const yaml = (k) => ((read("video.yaml").match(new RegExp(`^${k}:\\s*"?([^"#\\n]*)"?`, "m")) || [])[1] || "").trim();
const scenes = (() => { try { return JSON.parse(read("script/scenes.json")); } catch { return {}; } })();
const spec = (() => { try { return JSON.parse(read("spec/project.json")); } catch { return {}; } })();
const real = (v) => v && !/^\{\{|^<</.test(v) ? v : "";
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const repo = (() => {
  try {
    const u = execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
    return (u.match(/github\.com[:/]([^/]+\/[^/.]+)/) || [])[1] || "";
  } catch { return ""; }
})();
const title = real(yaml("title")) || real(scenes.title) || "Untitled video";
const slug = real(yaml("slug")) || real(scenes.slug) || slugify(title) || "video";

export const P = {
  root,
  title,
  slug,
  fileSlug: slug.replace(/(^|-)([a-z])/g, (_, d, c) => d + c.toUpperCase()), // my-video -> My-Video, for download names
  repo,                                     // owner/name from the git remote, "" if none
  siteVersion: (read("VERSION").trim() || (() => { try { return JSON.parse(read("versions.json")).site; } catch { return "0.0.0"; } })()),
  voice: real(spec.voice && spec.voice.now) || "draft voice",
  reviewApi: spec.reviewApi || "",          // base URL of the review server (Fly.io) when the site runs on GitHub Pages
};
