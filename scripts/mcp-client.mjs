#!/usr/bin/env node
// Lightweight MCP client for video-template.
// Usage:
//   node scripts/mcp-client.mjs list
//   node scripts/mcp-client.mjs call list_artifacts '{"prefix":"shared-base"}'
//   node scripts/mcp-client.mjs --url https://video-template-panel.fly.dev/mcp list
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function callMcpHttp(url, method, params = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

export async function callMcpStdio(method, params = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("node", [resolve(root, "scripts/mcp-server.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
    let buf = "";
    const req = { jsonrpc: "2.0", id: 1, method, params };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl !== -1) {
        const line = buf.slice(0, nl).trim();
        child.kill();
        try { resolvePromise(JSON.parse(line)); } catch (e) { reject(e); }
      }
    });
    child.on("error", reject);
    child.stdin.write(JSON.stringify(req) + "\n");
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let url = "";
  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1) {
    url = args[urlIdx + 1] || "";
    args.splice(urlIdx, 2);
  }
  const cmd = args[0] || "list";
  const send = (method, params) => (url ? callMcpHttp(url, method, params) : callMcpStdio(method, params));

  (async () => {
    if (cmd === "list") {
      const resp = await send("tools/list");
      console.log(JSON.stringify(resp, null, 2));
    } else if (cmd === "call") {
      const toolName = args[1];
      if (!toolName) { console.error("Usage: mcp-client.mjs call <toolName> [jsonArgs]"); process.exit(1); }
      const toolArgs = args[2] ? JSON.parse(args[2]) : {};
      const resp = await send("tools/call", { name: toolName, arguments: toolArgs });
      console.log(JSON.stringify(resp, null, 2));
    } else {
      console.error("Unknown command. Use: list | call <toolName> [jsonArgs]");
      process.exit(1);
    }
  })().catch((err) => { console.error(err.message); process.exit(1); });
}
