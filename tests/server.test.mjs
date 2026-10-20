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
