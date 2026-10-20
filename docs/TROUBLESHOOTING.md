# Troubleshooting

## MCP client shows no CatLog tools

Check in this order:

1. CatLog MCP process is running
2. HTTPS endpoint reaches the MCP server
3. the full randomized MCP path is correct
4. the custom MCP plugin/app is connected
5. plugin-specific permissions are correct
6. Refresh tools has been run
7. if necessary, test from a fresh chat/session

Do not rewrite the backend just because one open client session still has an old tool registry.

## catlog_status says Companion is unavailable

Verify the local Companion first.

Typical causes:

- Companion process is stopped
- Companion port changed
- companion_url in config is wrong
- browser-side archive stack is not running

Keep the Companion on loopback.

## Trigger remains queued

The browser extension may not be claiming jobs.

Check:

- the browser is running
- the extension is enabled
- the extension is connected to the Companion
- the browser login session is valid
- the extension can reach the requested conversation

## Trigger fails

Read catlog_trigger_status for the underlying error.

A failure belongs to the downstream archive pipeline unless the MCP could not contact the Companion at all.

## catlog_find_message finds zero matches

Remember that the tool normalizes whitespace before matching.

Try:

- a shorter distinctive phrase
- author=null
- match_mode=contains
- case_sensitive=false

Also confirm that the fresh archive result used api_mode/full-source data expected by the deployment.

## Batch job disappeared

MCP batch jobs are intentionally in memory.

If CatLog MCP restarted, the batch object is gone. Check the archive destination for conversations that had already completed, then start a new batch for the remaining items.

## Tool schema changed but ChatGPT still shows the old schema

Restarting the MCP server is not enough. Refresh tools in the ChatGPT plugin/app settings.

If Refresh tools still does not update the already-open chat, try a new chat after confirming the plugin itself shows the new tool list.

## Setup script created a new unexpected endpoint

Stop before replacing the MCP URL in a client.

Check CATLOG_MCP_CONFIG, CATLOG_MCP_STATE_DIR, and the default external config location. A newly generated mcp_path means the previous config was not found. Restore the intended config instead of casually creating multiple live endpoint paths.

## Port already in use

Find the process already listening on the configured port. Do not start a second CatLog MCP instance on the same endpoint.

On Windows:

~~~powershell
Get-NetTCPConnection -LocalPort 32188 -State Listen
~~~

## Testing

~~~powershell
npm run check
npm test
npm audit --omit=dev
~~~

A passing unit test suite does not replace one real end-to-end archive smoke test.
