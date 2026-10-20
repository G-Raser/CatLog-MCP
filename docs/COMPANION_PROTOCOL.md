# Companion protocol

CatLog MCP expects a local Companion service. This document describes the minimum contract used by server.mjs.

The exact Companion implementation is intentionally outside this repository.

## Base URL

Default:

~~~text
http://127.0.0.1:43129
~~~

The Companion should remain on loopback.

## Control header

Archive-control requests use:

~~~text
X-CatLog-Control: 1
~~~

## Health

~~~http
GET /health
~~~

Expected: HTTP 200 JSON.

The MCP status tool treats a non-200 response as a Companion health failure.

## Create trigger

~~~http
POST /trigger
Content-Type: application/json
X-CatLog-Control: 1
~~~

Payload shape:

~~~json
{
  "conversation_id": "<conversation-id>",
  "project_id": null,
  "archive_root": "",
  "include_timestamps": true,
  "labels": {
    "user": "User",
    "assistant": "Assistant"
  }
}
~~~

Expected response shape:

~~~json
{
  "ok": true,
  "job": {
    "id": "<job-id>",
    "status": "queued"
  }
}
~~~

The only field CatLog MCP strictly requires from creation is job.id.

## Trigger status

~~~http
GET /trigger/status/<job-id>
X-CatLog-Control: 1
~~~

Expected response:

~~~json
{
  "ok": true,
  "job": {
    "id": "<job-id>",
    "status": "completed",
    "result": {}
  }
}
~~~

Recognized terminal states:

- completed
- failed

For failed jobs, job.error should contain a useful message.

## Archive result requirement

catlog_find_message needs the completed job result to include a file entry with:

~~~json
{
  "kind": "raw_conversation_json",
  "path": "C:\\Archives\\CatLog\\example.raw.json"
}
~~~

The raw JSON is expected to contain a ChatGPT-style mapping object whose nodes may contain message.author.role, message.content.parts, and message.create_time.

## Why the MCP reads the raw file path returned by Companion

The Companion is already the source of truth for archive naming and layout. Returning the exact path avoids duplicating archive-discovery logic in the MCP layer.

This also means the Companion is a trusted local component. Do not point CatLog MCP at an untrusted remote Companion.
