# End-to-end runbook

This is the recovery-oriented guide for rebuilding a CatLog MCP deployment from a clean clone.

The goal is that an operator who remembers only the broad idea can reconstruct the full chain without relying on private infrastructure names, old screenshots, or chat history.

## 1. Mental model

CatLog MCP is the remote-facing control plane. It is not the component that owns browser login or directly fetches private conversations.

```text
MCP client
  |
  | Streamable HTTP
  v
CatLog MCP
  |
  | local control requests
  v
CatLog Companion on loopback
  |
  | trigger queue
  v
Browser extension in an already logged-in browser
  |
  | authenticated conversation fetch
  v
Archive files + index
```

Keep these boundaries intact:

- CatLog MCP may be made remotely reachable through a restricted HTTPS path.
- CatLog Companion stays local and should remain on loopback.
- Browser cookies and login state stay in the browser/extension layer.
- Archive files stay outside this repository.
- Runtime config, including the randomized MCP path, stays outside this repository.

## 2. What must already exist

Before CatLog MCP can do useful work, the local archive stack needs:

1. a working CatLog Companion
2. a compatible browser extension
3. a browser session already logged into the source service
4. a writable archive destination owned by the downstream archive system

CatLog MCP deliberately does not bundle those components. It talks to them through the Companion protocol documented in `COMPANION_PROTOCOL.md`.

## 3. Clean-machine setup

Clone the repository and enter it:

```powershell
git clone https://github.com/OWNER/CatLog-MCP.git
Set-Location .\CatLog-MCP
```

Install dependencies and create external runtime config:

```powershell
.\setup.ps1
```

`setup.ps1` does two important things:

- installs Node dependencies
- creates a config outside the Git working tree if one does not already exist

Configuration lookup order is:

1. `CATLOG_MCP_CONFIG`
2. `CATLOG_MCP_STATE_DIR\config.json`
3. `%LOCALAPPDATA%\CatLogMCP\config.json`
4. `~/.catlog-mcp/config.json`

The generated config contains a randomized `mcp_path`. Treat that path as credential-like deployment data.

Do not copy the generated config into the repository.

## 4. Verify the local archive stack first

Before starting the MCP layer, verify the Companion independently.

The default Companion URL expected by this project is:

```text
http://127.0.0.1:43129
```

A healthy Companion should answer its health route locally.

If the Companion is down, fix that before debugging ChatGPT, HTTPS, or MCP tool registration. CatLog MCP cannot replace a missing browser-side archive stack.

## 5. Start CatLog MCP locally

Run:

```powershell
.\start.ps1
```

The default MCP listener is loopback on port `32188`.

Check health:

```powershell
Invoke-RestMethod http://127.0.0.1:32188/healthz
```

Expected shape:

```json
{
  "ok": true,
  "service": "catlog-mcp",
  "version": "0.1.0",
  "companion_ok": true
}
```

If `companion_ok` is false, return to the Companion/extension checks.

## 6. Optional automatic startup

For an interactive Windows installation:

```powershell
.\install-startup.ps1
```

This creates a Scheduled Task that starts CatLog MCP at user logon.

Remove it with:

```powershell
.\uninstall-startup.ps1
```

The supplied task intentionally runs in the interactive user's session. The downstream browser/extension workflow depends on a normal logged-in desktop session.

## 7. Remote HTTPS exposure

A remote MCP client normally needs HTTPS.

Preferred shape:

```text
remote MCP client
  -> HTTPS reverse proxy / secure tunnel / private network
  -> CatLog MCP
  -> loopback Companion
```

Expose only CatLog MCP. Never route the Companion itself to the public Internet.

A public-facing MCP URL should look conceptually like:

```text
https://mcp.example.com/mcp-<random-secret>
```

The real hostname and randomized path are deployment secrets and must stay out of Git.

If the proxy/tunnel terminates on the same machine, keep CatLog MCP bound to loopback when possible. If it terminates on another trusted machine, bind only to the required private interface rather than `0.0.0.0` unless the surrounding firewall design makes that intentional.

See `REMOTE_ACCESS.md` for the security model.

## 8. Register the server in ChatGPT

The tested App-backed flow is:

1. Open **Plugins**.
2. Choose **Add**.
3. Choose **Add custom MCP server**.
4. Enter a display name and description.
5. Enter the complete HTTPS endpoint including the randomized path.
6. Select the authentication mode that matches the deployment.
7. Review the risk acknowledgement.
8. Create/connect the plugin or app.
9. Open that plugin's own permissions page.
10. Select the permission level required for archive actions.
11. Run **Refresh tools**.

Important operational lessons:

- The plugin-specific permission page is separate from global ChatGPT tool settings.
- Restarting CatLog MCP does not refresh a client's cached tool schema.
- After adding, removing, or changing a tool schema, always run **Refresh tools** in the client.
- Avoid keeping duplicate registrations of the same MCP service; remove or disconnect obsolete entries so you know which schema is active.
- A UI automation click that reports success without changing the screen can be a UI-control compatibility problem. It is not evidence that the product requires a manual-only step.

The expected tool list is:

```text
catlog_status
catlog_find_message
catlog_archive_conversation
catlog_archive_many
catlog_job_status
catlog_trigger_status
```

## 9. First real smoke test

Do not stop at “the plugin connected.”

Run the full chain.

### 9.1 Status

Call:

```text
catlog_status
```

Confirm the Companion is reported healthy.

### 9.2 Archive one real conversation

Call `catlog_archive_conversation` with a real conversation identifier.

Confirm the downstream result reports a successful fresh read and archive output.

### 9.3 Verify one known message

Call `catlog_find_message` with:

- the same conversation identifier
- a distinctive phrase known to exist
- `match_mode=contains`
- an IANA timezone if local rendering matters

Acceptance criteria:

- at least one real match is returned
- `create_time` comes from the fresh source data
- `create_time_iso` is plausible
- `local_time` matches the requested timezone
- the returned text is the expected source message

This is the strongest practical proof that the whole chain works:

```text
MCP client
  -> CatLog MCP
  -> Companion
  -> browser extension
  -> authenticated conversation source
  -> archive
  -> fresh raw JSON
  -> message search
```

## 10. Normal daily workflows

### Archive one conversation

Use `catlog_archive_conversation`.

Use `wait=true` when the caller should receive the completed archive result in one tool call.

Use `wait=false` when you want the trigger job immediately and will inspect it later with `catlog_trigger_status`.

### Find an original message timestamp

Use `catlog_find_message`.

This tool intentionally fresh-archives first and searches second. It is appropriate when the archive on disk may be stale and original message timestamps matter.

### Archive several conversations

Use `catlog_archive_many`.

It starts a sequential in-memory MCP batch and returns a batch job id.

Poll with `catlog_job_status`.

Terminal states include:

- `completed`
- `completed_with_errors`
- `failed`

The batch object's metadata is not durable. A CatLog MCP restart loses in-memory batch status. Archive files already written by the downstream system remain durable.

## 11. Branches, duplicates, and canonical archives

Archive raw sources first. Deduplicate later.

If several conversations are branches of the same long conversation:

1. archive every source that may contain unique messages
2. preserve the raw originals
3. compare branch paths or message identifiers
4. select a canonical branch
5. append only branch-unique material to a separate canonical document
6. keep a merge report explaining source lineage

Do not destroy or rewrite the raw archives merely to simplify a downstream importer.

A useful separation is:

```text
raw fresh archives
  -> branch comparison
  -> canonical import documents
  -> downstream importer
  -> import receipt
```

CatLog MCP stops at the archive layer. A memory system or research pipeline belongs downstream and should remain independently replaceable.

## 12. Downstream memory-import pattern

If archived conversations are later imported into a memory system, keep the stages explicit:

1. **Source** — immutable raw/readable archive output.
2. **Canonicalization** — branch merge/dedup documents created separately.
3. **Import** — downstream extraction or indexing.
4. **Receipt** — record source hashes, chunk counts, created/merged counts, errors, and model/provider notes.

This makes it possible to re-run imports without losing provenance.

Do not put private memory-system names, private archive paths, or personal conversation examples into this public repository.

## 13. Updating CatLog MCP safely

Before an update:

1. inspect local changes
2. fetch/pull the intended branch
3. review the diff
4. run dependency install if the lockfile changed
5. run checks
6. restart the MCP process
7. verify local health
8. verify `catlog_status`
9. refresh tools in the MCP client if any tool definition changed
10. run a real archive smoke test

Commands:

```powershell
npm install
npm run check
npm test
npm audit --omit=dev
```

A green unit-test suite is necessary but not sufficient. The browser-authenticated end-to-end archive path should also be tested after meaningful runtime changes.

## 14. Tool-schema change rule

When adding, removing, or changing a tool schema:

1. update `server.mjs`
2. update tests
3. update README and relevant docs
4. run local checks
5. deploy/restart CatLog MCP
6. open the MCP client/plugin settings
7. run **Refresh tools**
8. verify the actual tool list
9. run a smoke test for the changed tool

Backend restart and client schema refresh are separate operations.

## 15. Recovery decision tree

### No tools appear in the client

Check:

1. MCP process
2. HTTPS endpoint
3. full randomized path
4. plugin/app connection
5. plugin-specific permissions
6. Refresh tools

Only after these checks should you investigate server code.

### Tools exist but `catlog_status` fails

Check Companion health and `companion_url`.

### Trigger stays queued

Check browser process, extension state, Companion connection, login session, and whether the extension can reach the requested conversation.

### `catlog_find_message` returns no match

Try a shorter distinctive phrase, disable case sensitivity, and remove the author filter. Confirm the fresh archive succeeded.

### Batch job disappeared

The MCP process probably restarted. Inspect completed archive files and start a new batch only for remaining items.

### A schema changed but an existing chat still looks stale

Run Refresh tools first. Some clients hot-update the current chat; others may need a fresh chat. Do not rewrite the server simply because one client session cached an old registry.

## 16. Privacy and publication procedure

Keep the repository private while preparing a public release.

Before changing visibility:

1. run all tests
2. inspect the current working tree for secrets
3. inspect all reachable Git history, not only `HEAD`
4. confirm runtime config is outside Git
5. confirm archives and exports are ignored
6. confirm documentation uses placeholders only
7. confirm no screenshots expose private values
8. choose and add a LICENSE if the project is intended to be open source
9. review `SECURITY.md`
10. run the checklist in `OPEN_SOURCE_CHECKLIST.md`

If a real secret was ever committed, deleting the file in a later commit is not enough. Rotate the secret and rewrite history before publication.

## 17. What should never be committed

Never commit:

- real MCP randomized paths
- real deployment domains
- tunnel credentials
- browser cookies/session material
- conversation or project identifiers from personal accounts
- archive contents
- private plugin/app identifiers
- local usernames
- personal filesystem paths
- private IP/overlay-network addresses
- private downstream memory-system details
- generated runtime `config.json`

## 18. “Everything is broken and I forgot how this works” checklist

Use this exact order:

1. Is the browser logged in?
2. Is the archive extension enabled?
3. Is the Companion healthy on loopback?
4. Is CatLog MCP healthy locally?
5. Is the secure HTTPS route reaching CatLog MCP?
6. Does the client/plugin contain the complete randomized endpoint?
7. Are plugin-specific tool permissions correct?
8. Has **Refresh tools** been run?
9. Does `catlog_status` work?
10. Can one known conversation be archived?
11. Can one known message be found with `catlog_find_message`?
12. Only after those pass, debug batch jobs or downstream import workflows.

That order prevents wasting time rebuilding working layers while the failure is actually one layer above or below.
