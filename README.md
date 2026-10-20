# CatLog MCP

CatLog MCP is a small Model Context Protocol control plane for a local CatLog archive stack.

Its job is deliberately narrow: expose a stable MCP tool surface, hand archive requests to a local Companion service, wait for the browser-authenticated archive job when needed, and return structured results to the MCP client.

The project does not fetch ChatGPT conversations itself and does not depend on browser automation at runtime.

## Architecture

~~~text
MCP client
  |
  | Streamable HTTP
  v
CatLog MCP
  |
  | loopback control API
  v
CatLog Companion
  |
  | local trigger queue
  v
Browser extension in an already logged-in browser
  |
  | authenticated conversation fetch
  v
Conversation archive + index
~~~

The important trust boundary is that CatLog Companion stays local. A remote MCP client should reach CatLog MCP only; it should never reach the Companion directly.

## What this repository contains

- server.mjs — MCP server and six tools
- setup.ps1 — installs dependencies and creates an external config with a randomized MCP path
- start.ps1 — starts the server from that external config
- install-startup.ps1 — optional Windows Scheduled Task
- uninstall-startup.ps1 — removes that Scheduled Task
- config.example.json — public-safe configuration example
- tests/ — lightweight source-level regression tests
- docs/ — setup, operations, protocol, privacy, and maintainer notes

The browser extension and Companion are prerequisites and are not bundled in this repository.

## Tools

| Tool | Purpose |
| --- | --- |
| catlog_status | Check Companion health and recent in-memory MCP batch jobs |
| catlog_find_message | Fresh-read a conversation, archive it, then search the newly archived raw JSON |
| catlog_archive_conversation | Fresh-read and archive one conversation |
| catlog_archive_many | Start a sequential background batch for multiple conversations |
| catlog_job_status | Read an MCP batch job |
| catlog_trigger_status | Read the underlying Companion trigger job |

### Freshness rule

catlog_find_message intentionally archives first and searches second. This favors source freshness over speed and makes timestamp lookup reliable when the archive on disk might be stale.

### Batch durability

catlog_archive_many keeps its job state in memory. Restarting CatLog MCP loses MCP batch-job status. The underlying archives already completed by Companion remain on disk, but the MCP batch object is not durable.

## Requirements

- Windows for the included PowerShell setup/start scripts
- Node.js 20 or newer
- a compatible CatLog Companion on the same machine
- a browser extension connected to that Companion and logged into ChatGPT
- HTTPS reachability if the MCP client is remote

## Quick start

1. Install dependencies and create the local config:

~~~powershell
.\setup.ps1
~~~

2. Start the server:

~~~powershell
.\start.ps1
~~~

3. Check local health:

~~~powershell
Invoke-RestMethod http://127.0.0.1:32188/healthz
~~~

setup.ps1 creates a randomized MCP path in a config file outside the repository. Do not commit that file or paste the real path into public issues, screenshots, examples, or documentation.

Configuration resolution order:

1. CATLOG_MCP_CONFIG — exact config file path
2. CATLOG_MCP_STATE_DIR — directory containing config.json
3. %LOCALAPPDATA%\CatLogMCP\config.json on Windows
4. ~/.catlog-mcp/config.json when LOCALAPPDATA is unavailable

## Remote access

The default bind host is 127.0.0.1. If the MCP client is not on the same machine, place a restricted reverse proxy, tunnel, or private network in front of CatLog MCP.

Do not expose CatLog Companion itself.

This server does not currently implement application-layer authentication. A randomized MCP path helps prevent accidental discovery, but it should not be treated as the only security boundary for an Internet-exposed service. Prefer a private network or an upstream access-control layer.

See docs/REMOTE_ACCESS.md and SECURITY.md.

## ChatGPT custom MCP setup

A tested App-backed custom MCP flow is documented in docs/CHATGPT_SETUP.md.

The short version is:

1. expose the CatLog MCP endpoint over HTTPS
2. in ChatGPT, add a custom MCP server
3. use the full endpoint including the randomized path
4. connect the plugin/app
5. set that plugin's own tool permission to the level you intend to allow
6. refresh tools
7. run catlog_status
8. run a real archive or message lookup as a smoke test

Do not confuse global ChatGPT permissions with the custom plugin's own permission page.

## Privacy

This repository is designed so private runtime values stay outside Git:

- no archive contents
- no conversation IDs in examples
- no browser cookies or session tokens
- no real remote domain
- no real tunnel route
- no real MCP randomized path
- no local archive directory
- no plugin/app IDs
- no personal filesystem paths

Before making the repository public, run the checklist in docs/OPEN_SOURCE_CHECKLIST.md.

## Development

~~~powershell
npm run check
npm test
npm audit --omit=dev
~~~

For a real end-to-end validation, also verify:

1. Companion health is OK
2. MCP initialize succeeds
3. tools/list returns all six CatLog tools
4. a real conversation archive completes
5. catlog_find_message can return an original create_time
6. the returned local_time matches the requested IANA timezone

## Documentation map

- docs/END_TO_END_RUNBOOK.md — clean-machine setup, ChatGPT registration, smoke tests, daily workflows, recovery, and publication procedure
- docs/ARCHITECTURE.md — components, trust boundaries, data flow
- docs/CHATGPT_SETUP.md — custom MCP/App-backed setup and permissions
- docs/OPERATIONS.md — daily operation and archive workflows
- docs/COMPANION_PROTOCOL.md — minimum Companion contract
- docs/REMOTE_ACCESS.md — safe remote exposure patterns
- docs/TROUBLESHOOTING.md — common failures and recovery
- docs/OPEN_SOURCE_CHECKLIST.md — privacy review before publication
- SECURITY.md — security model and disclosure notes

## License

No open-source license has been selected yet. Add a LICENSE file before publishing the repository as an open-source project.
