# Architecture

## Design goal

CatLog MCP is an adapter, not a second archive implementation.

The browser-authenticated part of the system already exists in CatLog Companion plus the extension. The MCP layer should therefore stay small and delegate rather than duplicate login, browser-session, fetch, archive-format, or index logic.

## Runtime components

### MCP client

Any client that can connect to a Streamable HTTP MCP server.

It sees only the tool surface exposed by CatLog MCP.

### CatLog MCP

Responsibilities:

- expose MCP initialize/session handling
- expose the six CatLog tools
- validate conversation IDs and basic arguments
- create Companion trigger jobs
- poll Companion jobs when synchronous completion is requested
- maintain lightweight in-memory batch state
- read a newly archived raw JSON file for catlog_find_message
- optionally format message timestamps in an IANA timezone

Non-responsibilities:

- browser login
- fetching ChatGPT conversations directly
- storing browser cookies
- inventing a second archive format
- owning the Companion queue
- persisting MCP batch jobs

### CatLog Companion

A local control service, expected to listen on loopback.

It owns the trigger queue and archive handoff. CatLog MCP trusts the Companion as a local privileged component.

### Browser extension

Runs inside a browser with the user's existing login context. It claims Companion jobs, retrieves the requested conversation through the browser-authenticated path, and completes the archive job.

### Archive and index

Owned by CatLog/Companion, not by this MCP layer.

The MCP server only consumes paths/results returned by the Companion.

## Primary flows

### Archive one conversation

~~~text
client
  -> catlog_archive_conversation
  -> POST Companion /trigger
  -> extension claims job
  -> extension fresh-reads conversation
  -> Companion/archive pipeline writes files
  -> MCP polls /trigger/status/:id
  -> client receives result
~~~

### Find one message

~~~text
client
  -> catlog_find_message
  -> archive one conversation first
  -> open returned raw_conversation_json
  -> search user/assistant message text
  -> return original create_time + optional local timezone rendering
~~~

This order is intentional. Searching stale archive files first would make timestamp and branch-sensitive retrieval less trustworthy.

### Archive many

~~~text
client
  -> catlog_archive_many
  -> MCP creates in-memory batch job
  -> conversations run sequentially
  -> each item uses the normal single-conversation archive flow
  -> client polls catlog_job_status
~~~

Sequential execution avoids flooding the browser-side trigger queue.

## Trust boundaries

1. Remote MCP traffic stops at CatLog MCP.
2. Companion remains loopback-only.
3. Browser credentials remain in the browser.
4. Archive files remain on the local filesystem unless the operator deliberately moves them.
5. A remote client with permission to call archive tools should be treated as trusted, because archive_root and conversation identifiers can cause local archive work.

## State

Persistent configuration lives outside the repository.

MCP session transports are in memory.

catlog_archive_many batch state is in memory.

Conversation archives and CatLog indexes are durable only because the downstream archive system writes them.

## Why browser automation is not a runtime dependency

Browser automation may be useful once during product setup, but it is not reliable enough to serve as the archive transport itself. The runtime uses the dedicated Companion/extension queue instead. This keeps the MCP surface deterministic and lets the extension operate inside the browser session that already owns authentication.
