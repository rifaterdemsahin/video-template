import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { requestHandler } from "../server.mjs";
import { P } from "../scripts/lib/project.mjs";
import fs from "node:fs";
import path from "node:path";

const root = P.root;

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.bodyChunks = [];
    this.headersSent = false;
  }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  getHeader(name) { return this.headers[name.toLowerCase()]; }
  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    for (const [k, v] of Object.entries(headers)) this.setHeader(k, v);
    this.headersSent = true;
    return this;
  }
  write(chunk) {
    if (chunk) this.bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }
  end(chunk) {
    if (chunk) this.write(chunk);
    this.emit("finish");
    return this;
  }
  get body() { return Buffer.concat(this.bodyChunks).toString("utf8"); }
}

function createMockRequest({ method = "GET", url = "/", headers = {}, body = "" } = {}) {
  const stream = new Readable({
    read() {
      if (body) this.push(Buffer.from(body));
      this.push(null);
    },
  });
  stream.method = method;
  stream.url = url;
  stream.headers = { host: "localhost:30080", ...headers };
  return stream;
}

test("Server requestHandler: Health endpoint", async () => {
  const req = createMockRequest({ method: "GET", url: "/api/health" });
  const res = new MockResponse();

  await requestHandler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader("access-control-allow-origin"), "*");
  const data = JSON.parse(res.body);
  assert.equal(data.status, "ok");
  assert.equal(data.app, `${P.slug}-review`);
  assert.equal(data.version, P.siteVersion);
});

test("Server requestHandler: CORS preflight (OPTIONS)", async () => {
  const req = createMockRequest({ method: "OPTIONS", url: "/api/verification" });
  const res = new MockResponse();

  await requestHandler(req, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader("access-control-allow-origin"), "*");
  assert.ok(res.getHeader("access-control-allow-methods").includes("POST"));
});

test("Server requestHandler: Azure config endpoint (server-proxy mode, never leaks SAS)", async () => {
  const req = createMockRequest({ method: "GET", url: "/api/azure-config" });
  const res = new MockResponse();

  await requestHandler(req, res);
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body);
  assert.ok("configured" in data);
  assert.equal(data.mode, "server-proxy");
  assert.equal("sasUrl" in data, false, "SAS URL must never be exposed in /api/azure-config");
});

test("Server requestHandler: HTTP 206 Partial Content range streaming & draft fallback", async () => {
  const tmpDir = path.join(root, "draft", "v1");
  const tmpMp4 = path.join(tmpDir, "video.mp4");
  const existed = fs.existsSync(tmpMp4);
  if (!existed) {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(tmpMp4, Buffer.alloc(1024, 0x41));
  }
  try {
    // Direct HTTP 206 range request
    const req = createMockRequest({ method: "GET", url: "/draft/v1/video.mp4", headers: { range: "bytes=0-100" } });
    const res = new MockResponse();
    await new Promise(async (resolve) => {
      res.on("finish", resolve);
      await requestHandler(req, res);
      setTimeout(resolve, 300);
    });
    assert.equal(res.statusCode, 206, "Must return HTTP 206 Partial Content for range requests");
    assert.equal(res.getHeader("accept-ranges"), "bytes");
    assert.equal(res.getHeader("content-type"), "video/mp4");
    assert.ok((res.getHeader("content-range") || "").startsWith("bytes 0-100/"));
    assert.equal(res.getHeader("content-length"), 101);

    // Fallback for unrendered v99
    const req2 = createMockRequest({ method: "GET", url: "/draft/v99/video.mp4", headers: { range: "bytes=0-50" } });
    const res2 = new MockResponse();
    await new Promise(async (resolve) => {
      res2.on("finish", resolve);
      await requestHandler(req2, res2);
      setTimeout(resolve, 300);
    });
    assert.equal(res2.statusCode, 206);
    assert.equal(res2.getHeader("x-draft-video-requested"), "v99");
    assert.ok((res2.getHeader("x-draft-video-fallback") || "").startsWith("v"));
    assert.equal(res2.getHeader("content-length"), 51);
  } finally {
    if (!existed) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});

test("Server requestHandler: 404 for non-existent non-draft file", async () => {
  const req = createMockRequest({ method: "GET", url: "/non-existent-file-xyz.html" });
  const res = new MockResponse();

  await requestHandler(req, res);
  assert.equal(res.statusCode, 404);
});

test("Server requestHandler: never serves dotfiles or dot-folders (.env, .git)", async () => {
  for (const url of ["/.env", "/.git/config", "/video/.hyperframes/x", "/%2e%2e/etc/passwd"]) {
    const req = createMockRequest({ method: "GET", url });
    const res = new MockResponse();
    await requestHandler(req, res);
    assert.ok([403, 404].includes(res.statusCode), `${url} must not be served, got ${res.statusCode}`);
  }
});
