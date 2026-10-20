# Operations runbook

## Normal startup

Manual:

~~~powershell
.\start.ps1
~~~

Optional startup task:

~~~powershell
.\install-startup.ps1
~~~

Remove it:

~~~powershell
.\uninstall-startup.ps1
~~~

The Scheduled Task runs with the interactive user at logon because the downstream archive path depends on a browser session and local Companion/extension stack.

## Health checks

### CatLog MCP

~~~powershell
Invoke-RestMethod http://127.0.0.1:32188/healthz
~~~

Expected shape:

~~~json
{
  "ok": true,
  "service": "catlog-mcp",
  "version": "0.1.1",
  "companion_ok": true
}
~~~

### Through MCP

Call catlog_status.

This is the better operational check because it exercises the same MCP-to-Companion path used by tools.

## Archive one conversation

Use catlog_archive_conversation.

Required:

- conversation_id

Useful optional fields:

- project_id
- archive_root
- include_timestamps
- user_label
- assistant_label
- wait
- timeout_ms

With wait=true, the MCP call waits for the Companion trigger job to finish.

With wait=false, the call returns the Companion trigger job immediately; use catlog_trigger_status later.

## Archive many conversations

Use catlog_archive_many with a conversations array.

The batch runs sequentially and returns an MCP batch job id immediately.

Poll catlog_job_status until the status becomes:

- completed
- completed_with_errors
- failed

Important: this batch object exists only in CatLog MCP memory. A server restart loses batch progress metadata. Completed archive files remain wherever the downstream archive system wrote them.

## Fresh message search

Use catlog_find_message when accuracy matters more than speed.

It does not search an arbitrary old archive. It:

1. requests a fresh archive of the target conversation
2. opens the raw JSON returned by that archive
3. searches user/assistant message text
4. returns original message create_time values
5. optionally renders them in an IANA timezone

Useful arguments:

- text
- author: user or assistant
- match_mode: contains or exact
- case_sensitive
- limit
- timezone

## Choosing an archive_root

If archive_root is omitted or empty, the Companion should use its normal configured archive location.

If a client supplies archive_root, treat that client as trusted. The MCP layer passes the requested archive root downstream.

For public examples, always use placeholder paths such as:

~~~text
C:\Archives\CatLog
~~~

Never publish a real personal archive path.

## Updating CatLog MCP

1. inspect local changes
2. pull the repository update
3. run npm install if package-lock.json changed
4. run npm run check
5. run npm test
6. run npm audit --omit=dev
7. restart the CatLog MCP process or Scheduled Task
8. call catlog_status
9. if the MCP tool schema changed, refresh tools in the MCP client
10. run one real archive smoke test

A service restart does not necessarily make an already-open MCP client refresh its tool schema. Refresh tools in the client after schema changes.

## Adding or changing tools

When a tool is added, removed, or its input schema changes:

1. update server.mjs
2. update tests
3. update README/tool documentation
4. validate locally
5. deploy/restart the MCP server
6. refresh tools in ChatGPT or the relevant MCP client
7. verify the new listTools result
8. smoke-test the changed tool

Do not confuse restarting the backend with refreshing the client's cached tool list.

## Archive-to-memory workflows

CatLog MCP only produces or locates archive material. Importing those archives into a memory system is a separate downstream concern.

Recommended separation:

~~~text
fresh archive
  -> canonical archive files
  -> branch/dedup review if needed
  -> downstream memory importer
  -> import receipt
~~~

Do not bake one private memory system into CatLog MCP. Keep the MCP usable as a general archive control plane.

If multiple conversation branches overlap heavily, deduplicate or merge at the archive/import layer rather than archiving less. Preserve the raw originals and build canonical import documents separately.
