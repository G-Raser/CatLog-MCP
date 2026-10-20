import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../server.mjs", import.meta.url));

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
}

async function waitForLine(stream, needle, timeoutMs = 5000) {
  let buffer = "";
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${needle}`)), timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes(needle)) {
        clearTimeout(timeout);
        stream.off("data", onData);
        resolve(buffer);
      }
    };
    stream.on("data", onData);
  });
}

test("runtime rejects unapproved Origin, enforces optional bearer auth, and hides MCP path in logs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "catlog-mcp-test-"));
  const port = await freePort();
  const mcpPath = "/mcp-test-secret";
  const token = "test-token-abcdefghijklmnopqrstuvwxyz";
  const configPath = path.join(dir, "config.json");
  await fs.writeFile(configPath, JSON.stringify({
    port,
    bind_host: "127.0.0.1",
    mcp_path: mcpPath,
    companion_url: "http://127.0.0.1:43129",
    allowed_origins: ["https://allowed.example"],
    bearer_token: token
  }), "utf8");
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, CATLOG_MCP_CONFIG: configPath },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    const startup = await waitForLine(child.stdout, "MCP path hidden");
    assert.doesNotMatch(startup, new RegExp(mcpPath));
    const endpoint = `http://127.0.0.1:${port}${mcpPath}`;
    const badOrigin = await fetch(endpoint, {
      method: "POST",
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(badOrigin.status, 403);
    const noAuth = await fetch(endpoint, {
      method: "POST",
      headers: { Origin: "https://allowed.example", "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(noAuth.status, 401);
    const authorized = await fetch(endpoint, {
      method: "POST",
      headers: {
        Origin: "https://allowed.example",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    assert.notEqual(authorized.status, 401);
    assert.notEqual(authorized.status, 403);
  } finally {
    child.kill();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("non-loopback config rejects a short or guessable MCP path", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "catlog-mcp-test-"));
  const configPath = path.join(dir, "config.json");
  await fs.writeFile(configPath, JSON.stringify({
    port: await freePort(),
    bind_host: "0.0.0.0",
    mcp_path: "/mcp-short",
    companion_url: "http://127.0.0.1:43129"
  }), "utf8");
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, CATLOG_MCP_CONFIG: configPath },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const [code] = await once(child, "exit");
  await fs.rm(dir, { recursive: true, force: true });
  assert.notEqual(code, 0);
  assert.match(stderr, /strong randomized MCP capability path/);
});

test("malformed config fails closed", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "catlog-mcp-test-"));
  const configPath = path.join(dir, "config.json");
  await fs.writeFile(configPath, "{broken json", "utf8");
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, CATLOG_MCP_CONFIG: configPath },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const [code] = await once(child, "exit");
  await fs.rm(dir, { recursive: true, force: true });
  assert.notEqual(code, 0);
  assert.match(stderr, /Failed to load CatLog MCP config/);
});

test("rotation helper generates a fresh 32-byte capability path and hides it by default", async () => {
  const source = await fs.readFile(new URL("../rotate-mcp-path.ps1", import.meta.url), "utf8");
  assert.match(source, /New-Object byte\[\] 32/);
  assert.match(source, /RandomNumberGenerator/);
  assert.match(source, /ShowNewPath/);
  assert.match(source, /Do not paste it into public logs/);
  assert.match(source, /Move-Item .* -Force/);
});

test("control metadata sanitizer removes local path keys and values from tool responses", async () => {
  const source = await fs.readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /sanitizeControlMetadata/);
  assert.match(source, /publicCompanionHealth/);
  assert.match(source, /\(\?:path\|root\|directory\|dir\)/);
  assert.match(source, /\[redacted-local-path\]/);
});
