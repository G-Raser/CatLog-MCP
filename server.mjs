import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

const stateRoot = process.env.CATLOG_MCP_STATE_DIR
  ? path.resolve(process.env.CATLOG_MCP_STATE_DIR)
  : process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "CatLogMCP")
    : path.join(os.homedir(), ".catlog-mcp");
const configPath = process.env.CATLOG_MCP_CONFIG
  ? path.resolve(process.env.CATLOG_MCP_CONFIG)
  : path.join(stateRoot, "config.json");

function parseArgs(argv) {
  const out = {
    port: null,
    bindHost: null,
    mcpPath: null,
    companionUrl: "http://127.0.0.1:43129",
    triggerTimeoutMs: 240000,
    pollMs: 750
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (key === "--port") out.port = Number(value);
    else if (key === "--bind-host") out.bindHost = value;
    else if (key === "--mcp-path") out.mcpPath = value;
    else if (key === "--companion-url") out.companionUrl = value;
    else if (key === "--trigger-timeout-ms") out.triggerTimeoutMs = Number(value);
    else if (key === "--poll-ms") out.pollMs = Number(value);
    else throw new Error(`Unknown argument: ${key}`);
  }
  return out;
}

async function loadConfig() {
  const args = parseArgs(process.argv.slice(2));
  let disk = {};
  try {
    let raw = await fs.readFile(configPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    disk = JSON.parse(raw);
  } catch {}
  const port = args.port ?? Number(disk.port || 32188);
  const bindHost = args.bindHost ?? disk.bind_host ?? "127.0.0.1";
  const mcpPath = args.mcpPath ?? disk.mcp_path ?? "/mcp";
  const companionUrl = args.companionUrl || disk.companion_url || "http://127.0.0.1:43129";
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid MCP port");
  if (!/^\/[A-Za-z0-9_-]+$/.test(mcpPath)) throw new Error("Invalid MCP path");
  return { ...args, port, bindHost, mcpPath, companionUrl: companionUrl.replace(/\/$/, "") };
}

const options = await loadConfig();
const transports = new Map();
const jobs = new Map();

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error) {
  return { content: [{ type: "text", text: error?.message || String(error) }], isError: true };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateConversationId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,}$/.test(id)) throw new Error("conversation_id is invalid");
  return id;
}

async function companion(pathname, init = {}) {
  const headers = {
    Accept: "application/json",
    "X-CatLog-Control": "1",
    ...(init.headers || {})
  };
  const response = await fetch(options.companionUrl + pathname, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok || body?.ok === false) {
    throw new Error(body?.error || `CatLog Companion HTTP ${response.status}`);
  }
  return body;
}

async function health() {
  const response = await fetch(options.companionUrl + "/health", { cache: "no-store" });
  if (!response.ok) throw new Error(`CatLog Companion health HTTP ${response.status}`);
  return await response.json();
}

async function createTrigger(args) {
  const payload = {
    conversation_id: validateConversationId(args.conversation_id),
    project_id: args.project_id || null,
    archive_root: args.archive_root || "",
    include_timestamps: args.include_timestamps !== false,
    labels: {
      user: args.user_label || "User",
      assistant: args.assistant_label || "Assistant"
    }
  };
  const body = await companion("/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!body?.job?.id) throw new Error("CatLog Companion did not return a trigger job");
  return body.job;
}

async function triggerStatus(jobId) {
  const body = await companion("/trigger/status/" + encodeURIComponent(jobId));
  if (!body?.job) throw new Error("CatLog Companion did not return trigger status");
  return body.job;
}

async function waitForTrigger(jobId, timeoutMs = options.triggerTimeoutMs) {
  const deadline = Date.now() + Math.max(1000, timeoutMs);
  while (Date.now() < deadline) {
    const job = await triggerStatus(jobId);
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error || "CatLog trigger failed");
    await sleep(options.pollMs);
  }
  throw new Error(`Timed out waiting for CatLog trigger ${jobId}`);
}

async function archiveConversation(args) {
  const created = await createTrigger(args);
  if (args.wait === false) return { job_id: created.id, status: created.status };
  const done = await waitForTrigger(created.id, Number(args.timeout_ms) || options.triggerTimeoutMs);
  return {
    job_id: done.id,
    status: done.status,
    result: done.result
  };
}

function rawFileFromResult(result) {
  const file = result?.files?.find((item) => item?.kind === "raw_conversation_json");
  if (!file?.path) throw new Error("CatLog archive result has no raw conversation file");
  return file.path;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function renderPart(part) {
  if (typeof part === "string") return part;
  if (part == null) return "";
  try { return JSON.stringify(part); } catch { return String(part); }
}

function formatLocalTime(iso, timezone) {
  if (!iso || !timezone) return null;
  try {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      hour12: false
    }).format(new Date(iso));
    return parts;
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

async function findMessage(args) {
  const archive = await archiveConversation({ ...args, wait: true, include_timestamps: true });
  const rawPath = rawFileFromResult(archive.result);
  const raw = JSON.parse(await fs.readFile(rawPath, "utf8"));
  const needleText = normalizeText(args.text);
  if (!needleText) throw new Error("text is required");
  const caseSensitive = args.case_sensitive === true;
  const needle = caseSensitive ? needleText : needleText.toLocaleLowerCase();
  const exact = args.match_mode === "exact";
  const author = ["user", "assistant"].includes(args.author) ? args.author : null;
  const limit = Math.max(1, Math.min(Number(args.limit) || 20, 100));
  const matches = [];
  for (const [nodeId, node] of Object.entries(raw.mapping || {})) {
    const message = node?.message;
    if (!message) continue;
    const role = message?.author?.role || null;
    if (author && role !== author) continue;
    const fullText = (message?.content?.parts || []).map(renderPart).join("\n");
    const compact = normalizeText(fullText);
    const haystack = caseSensitive ? compact : compact.toLocaleLowerCase();
    if (!(exact ? haystack === needle : haystack.includes(needle))) continue;
    const seconds = Number(message.create_time);
    const createIso = Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;
    matches.push({
      node_id: nodeId,
      message_id: message.id || nodeId,
      role,
      create_time: Number.isFinite(seconds) ? seconds : null,
      create_time_iso: createIso,
      local_time: args.timezone ? formatLocalTime(createIso, args.timezone) : null,
      timezone: args.timezone || null,
      text: fullText.length > 6000 ? fullText.slice(0, 6000) + "…" : fullText
    });
    if (matches.length >= limit) break;
  }
  return {
    conversation_id: archive.result?.conversation_id || args.conversation_id,
    source_ref: archive.result?.source_ref || null,
    api_mode: archive.result?.api_mode || null,
    archive_job_id: archive.job_id,
    match_count: matches.length,
    matches
  };
}

async function startBatch(args) {
  const id = `catlog-batch-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const job = {
    job_id: id,
    status: "running",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    total: args.conversations.length,
    current_index: 0,
    completed: 0,
    failed: 0,
    items: []
  };
  jobs.set(id, job);
  void (async () => {
    for (let index = 0; index < args.conversations.length; index += 1) {
      const item = args.conversations[index];
      job.current_index = index;
      job.updated_at = new Date().toISOString();
      try {
        const result = await archiveConversation({
          ...item,
          archive_root: args.archive_root || "",
          include_timestamps: args.include_timestamps !== false,
          wait: true,
          timeout_ms: args.timeout_ms
        });
        job.items.push({ conversation_id: item.conversation_id, ok: true, result });
        job.completed += 1;
      } catch (error) {
        job.items.push({ conversation_id: item.conversation_id, ok: false, error: error?.message || String(error) });
        job.failed += 1;
      }
      job.updated_at = new Date().toISOString();
    }
    job.status = job.failed ? (job.completed ? "completed_with_errors" : "failed") : "completed";
    job.updated_at = new Date().toISOString();
  })();
  return { job_id: id, status: job.status, total: job.total };
}

function tools() {
  return [
    {
      name: "catlog_status",
      description: "Check CatLog Companion health and recent MCP background archive jobs.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "catlog_find_message",
      description: "Fresh-read one ChatGPT conversation through CatLog, archive it, then find matching user/assistant messages and return original create_time values.",
      inputSchema: {
        type: "object",
        properties: {
          conversation_id: { type: "string" },
          project_id: { type: ["string", "null"] },
          text: { type: "string", minLength: 1 },
          author: { type: ["string", "null"], enum: ["user", "assistant", null] },
          match_mode: { type: "string", enum: ["contains", "exact"], default: "contains" },
          case_sensitive: { type: "boolean", default: false },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          timezone: { type: ["string", "null"], description: "Optional IANA timezone, e.g. Australia/Sydney." },
          archive_root: { type: ["string", "null"] },
          timeout_ms: { type: "integer", minimum: 1000, maximum: 900000 }
        },
        required: ["conversation_id", "text"],
        additionalProperties: false
      }
    },
    {
      name: "catlog_archive_conversation",
      description: "Fresh-read and archive one ChatGPT conversation through CatLog Companion. Can wait for completion or return the Companion job immediately.",
      inputSchema: {
        type: "object",
        properties: {
          conversation_id: { type: "string" },
          project_id: { type: ["string", "null"] },
          archive_root: { type: ["string", "null"] },
          include_timestamps: { type: "boolean", default: true },
          user_label: { type: "string", default: "User" },
          assistant_label: { type: "string", default: "Assistant" },
          wait: { type: "boolean", default: true },
          timeout_ms: { type: "integer", minimum: 1000, maximum: 900000 }
        },
        required: ["conversation_id"],
        additionalProperties: false
      }
    },
    {
      name: "catlog_archive_many",
      description: "Start a sequential background archive job for multiple ChatGPT conversations. Returns immediately; use catlog_job_status later.",
      inputSchema: {
        type: "object",
        properties: {
          conversations: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: {
              type: "object",
              properties: {
                conversation_id: { type: "string" },
                project_id: { type: ["string", "null"] }
              },
              required: ["conversation_id"],
              additionalProperties: false
            }
          },
          archive_root: { type: ["string", "null"] },
          include_timestamps: { type: "boolean", default: true },
          timeout_ms: { type: "integer", minimum: 1000, maximum: 900000 }
        },
        required: ["conversations"],
        additionalProperties: false
      }
    },
    {
      name: "catlog_job_status",
      description: "Read one CatLog MCP background batch job.",
      inputSchema: {
        type: "object",
        properties: { job_id: { type: "string" } },
        required: ["job_id"],
        additionalProperties: false
      }
    },
    {
      name: "catlog_trigger_status",
      description: "Read one underlying CatLog Companion trigger job by job_id.",
      inputSchema: {
        type: "object",
        properties: { job_id: { type: "string" } },
        required: ["job_id"],
        additionalProperties: false
      }
    }
  ];
}

async function callTool(name, args) {
  if (name === "catlog_status") {
    let companionHealth = null, companionError = null;
    try { companionHealth = await health(); } catch (error) { companionError = error?.message || String(error); }
    return {
      ok: Boolean(companionHealth?.ok),
      companion: companionHealth,
      companion_error: companionError,
      batch_jobs: [...jobs.values()].slice(-10).map(({ items, ...job }) => ({ ...job, item_count: items.length }))
    };
  }
  if (name === "catlog_find_message") return await findMessage(args);
  if (name === "catlog_archive_conversation") return await archiveConversation(args);
  if (name === "catlog_archive_many") return await startBatch(args);
  if (name === "catlog_job_status") {
    const job = jobs.get(String(args.job_id || ""));
    if (!job) throw new Error("Unknown MCP batch job_id");
    return job;
  }
  if (name === "catlog_trigger_status") return await triggerStatus(String(args.job_id || ""));
  throw new Error(`Unknown tool: ${name}`);
}

function makeServer() {
  const server = new Server({ name: "catlog-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try { return textResult(await callTool(request.params.name, request.params.arguments || {})); }
    catch (error) { return errorResult(error); }
  });
  return server;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.get("/healthz", async (_req, res) => {
  try {
    const companionHealth = await health();
    res.json({ ok: true, service: "catlog-mcp", version: "0.1.0", companion_ok: Boolean(companionHealth?.ok) });
  } catch (error) {
    res.status(503).json({ ok: false, service: "catlog-mcp", version: "0.1.0", companion_ok: false, error: error?.message || String(error) });
  }
});

app.post(options.mcpPath, async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport = sessionId ? transports.get(sessionId) : null;
    if (!transport && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => transports.set(id, transport)
      });
      const server = makeServer();
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
        void server.close().catch(() => {});
      };
      await server.connect(transport);
    }
    if (!transport) return res.status(400).json({ error: "Unknown or missing MCP session" });
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: error?.message || String(error) });
  }
});

async function sessionRequest(req, res) {
  const id = req.headers["mcp-session-id"];
  const transport = id ? transports.get(id) : null;
  if (!transport) return res.status(400).json({ error: "Unknown or missing MCP session" });
  await transport.handleRequest(req, res);
}
app.get(options.mcpPath, sessionRequest);
app.delete(options.mcpPath, sessionRequest);

app.listen(options.port, options.bindHost, () => {
  process.stdout.write(`catlog-mcp listening on http://${options.bindHost}:${options.port}${options.mcpPath}\n`);
  process.stdout.write(`CatLog Companion: ${options.companionUrl}\n`);
});
