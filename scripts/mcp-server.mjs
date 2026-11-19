#!/usr/bin/env node
// MCP (Model Context Protocol) server for video-template.
// Supports:
//   1. Stdio transport: node scripts/mcp-server.mjs
//   2. HTTP transport: imported by scripts/init-panel.mjs (POST /mcp)
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const MCP_SERVER_INFO = {
  name: "video-template-mcp",
  version: "1.1.0",
  protocolVersion: "2024-11-05"
};

export const MCP_TOOLS = [
  {
    name: "list_artifacts",
    description: "List base artifacts in Azure Blob Storage (uksouth / dpprojects) and spec/base-artifacts.json.",
    inputSchema: {
      type: "object",
      properties: {
        account: { type: "string", description: "Azure storage account (default: dpprojects)" },
        container: { type: "string", description: "Blob container (default: video-base-artifacts)" },
        prefix: { type: "string", description: "Optional blob prefix (e.g. slug)" }
      }
    }
  },
  {
    name: "get_project_spec",
    description: "Read video.yaml, spec/project.json, spec/base-artifacts.json, and script/scenes.json summary.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "validate_project",
    description: "Run scripts/validate.mjs to verify scene timings, placeholders, and assets.",
    inputSchema: {
      type: "object",
      properties: {
        strict: { type: "boolean", description: "Fail on <<...>> placeholders or missing media" }
      }
    }
  },
  {
    name: "build_video",
    description: "Run retime.mjs, build-video.mjs, and build-storyboard.mjs.",
    inputSchema: {
      type: "object",
      properties: {
        final: { type: "boolean", description: "Build in production --final mode" }
      }
    }
  }
];

function readJsonIfExists(relPath) {
  const full = resolve(root, relPath);
  if (!existsSync(full)) return null;
  try { return JSON.parse(readFileSync(full, "utf8")); } catch { return null; }
}

export function listArtifactsData(args = {}) {
  const manifest = readJsonIfExists("spec/base-artifacts.json");
  const account = args.account || manifest?.azure?.storageAccount || "dpprojects";
  const container = args.container || manifest?.azure?.container || "video-base-artifacts";
  const prefix = args.prefix ?? manifest?.azure?.prefix ?? "";
  const region = manifest?.azure?.region || "uksouth";
  const resourceGroup = manifest?.azure?.resourceGroup || "deliverypilot-rg";
  const baseUrl = `https://${account}.blob.core.windows.net/${container}${prefix ? "/" + prefix : ""}`;

  let azureBlobs = [];
  let azureError = null;
  try {
    const azArgs = ["storage", "blob", "list", "--account-name", account, "--container-name", container, "--auth-mode", "login", "--output", "json"];
    if (prefix) azArgs.push("--prefix", `${prefix.replace(/\/+$/, "")}/`);
    const out = execFileSync("az", azArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const parsed = JSON.parse(out || "[]");
    azureBlobs = parsed.map((b) => {
      const parts = b.name.split("/");
      const name = parts[parts.length - 1];
      const category = parts.length >= 2 ? parts[parts.length - 2] : "other";
      return {
        name,
        blobName: b.name,
        category,
        sizeBytes: b.properties?.contentLength ?? 0,
        contentType: b.properties?.contentSettings?.contentType || "application/octet-stream",
        lastModified: b.properties?.lastModified || "",
        url: `https://${account}.blob.core.windows.net/${container}/${b.name}`
      };
    });
  } catch (err) {
    azureError = err.stderr?.toString().trim() || err.message;
  }

  const localItems = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const seen = new Set(azureBlobs.map((b) => b.url));
  const artifacts = [...azureBlobs, ...localItems.filter((a) => !seen.has(a.url))];

  return {
    ok: true,
    source: azureError ? "manifest" : "azure+manifest",
    azureError,
    azure: { region, resourceGroup, storageAccount: account, container, prefix, baseUrl },
    artifacts
  };
}

function callTool(name, args = {}) {
  if (name === "list_artifacts") {
    return listArtifactsData(args);
  }
  if (name === "get_project_spec") {
    const yaml = existsSync(resolve(root, "video.yaml")) ? readFileSync(resolve(root, "video.yaml"), "utf8") : "";
    const project = readJsonIfExists("spec/project.json");
    const baseArtifacts = readJsonIfExists("spec/base-artifacts.json");
    const scenes = readJsonIfExists("script/scenes.json");
    return {
      videoYaml: yaml,
      project,
      baseArtifacts,
      sceneCount: Array.isArray(scenes?.scenes) ? scenes.scenes.length : 0,
      totalSecondsApprox: scenes?.totalSecondsApprox ?? null
    };
  }
  if (name === "validate_project") {
    const cmdArgs = [resolve(root, "scripts/validate.mjs")];
    if (args.strict) cmdArgs.push("--strict");
    const out = execFileSync("node", cmdArgs, { cwd: root, encoding: "utf8" });
    return { valid: true, output: out.trim() };
  }
  if (name === "build_video") {
    const logs = [];
    logs.push(execFileSync("node", [resolve(root, "scripts/retime.mjs")], { cwd: root, encoding: "utf8" }).trim());
    const buildArgs = [resolve(root, "scripts/build-video.mjs")];
    if (args.final) buildArgs.push("--final");
    logs.push(execFileSync("node", buildArgs, { cwd: root, encoding: "utf8" }).trim());
    logs.push(execFileSync("node", [resolve(root, "scripts/build-storyboard.mjs")], { cwd: root, encoding: "utf8" }).trim());
    return { built: true, logs };
  }
  throw new Error(`Unknown tool: ${name}`);
}

export function handleMcpMessage(msg) {
  if (!msg || typeof msg !== "object") {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
  }
  const { id, method, params } = msg;
  if (method === "notifications/initialized") return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: MCP_SERVER_INFO.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: MCP_SERVER_INFO.name, version: MCP_SERVER_INFO.version }
      }
    };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
  }
  if (method === "tools/call") {
    try {
      const data = callTool(params?.name, params?.arguments || {});
      return {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        result: { isError: true, content: [{ type: "text", text: err.message }] }
      };
    }
  }
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `Method not found: ${method}` } };
}

// Stdio transport when invoked directly
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const resp = handleMcpMessage(JSON.parse(line));
        if (resp) process.stdout.write(JSON.stringify(resp) + "\n");
      } catch (err) {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: err.message } }) + "\n");
      }
    }
  });
}
