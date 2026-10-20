import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("server exposes the CatLog MCP tool surface", async () => {
  const source = await fs.readFile(new URL("../server.mjs", import.meta.url), "utf8");
  for (const name of [
    "catlog_status",
    "catlog_find_message",
    "catlog_archive_conversation",
    "catlog_archive_many",
    "catlog_job_status",
    "catlog_trigger_status"
  ]) assert.match(source, new RegExp(name));
});

test("server delegates to CatLog Companion instead of Browser MCP", async () => {
  const source = await fs.readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /127\.0\.0\.1:43129/);
  assert.doesNotMatch(source, /Browser MCP|browser_workspace|browser_dom_/i);
});

test("server defaults to loopback but supports an explicit private bind host", async () => {
  const source = await fs.readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /disk\.bind_host \?\? "127\.0\.0\.1"/);
  assert.match(source, /app\.listen\(options\.port, options\.bindHost/);
});

test("server rejects unapproved browser origins on every MCP transport method", async () => {
  const source = await fs.readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(origin && !options\.allowedOrigins\.includes\(origin\)\)/);
  assert.match(source, /app\.post\(options\.mcpPath, protectMcpRoute/);
  assert.match(source, /app\.get\(options\.mcpPath, protectMcpRoute/);
  assert.match(source, /app\.delete\(options\.mcpPath, protectMcpRoute/);
});

test("server supports optional bearer auth without logging the secret MCP path", async () => {
  const source = await fs.readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /CATLOG_MCP_BEARER_TOKEN/);
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /WWW-Authenticate/);
  assert.match(source, /MCP path hidden/);
  assert.doesNotMatch(source, /listening on http:\/\/\$\{options\.bindHost\}:\$\{options\.port\}\$\{options\.mcpPath\}/);
});

test("malformed runtime config fails closed instead of silently falling back", async () => {
  const source = await fs.readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /error\?\.code !== "ENOENT"/);
  assert.match(source, /Failed to load CatLog MCP config/);
});
