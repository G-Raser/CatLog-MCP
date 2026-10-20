# AGENTS.md

## Scope

This repository is the MCP control plane for CatLog.

## Boundaries

- Keep browser-authenticated conversation fetching inside the local Companion/extension layer.
- Do not add browser automation as a runtime dependency.
- Reuse the Companion trigger/archive API on loopback.
- Keep `companion_url` loopback-only; do not relax this without an explicit architecture/security decision.
- Do not duplicate conversation-fetch logic here.
- Do not expose the Companion directly to remote clients.
- Keep remote MCP URLs, randomized paths, tunnel configuration, archive locations, conversation IDs, and credentials outside the repository.
- Treat the full randomized MCP capability URL as a credential. Non-loopback binds must require a long `/mcp-<random>` path; do not weaken this to a short or guessable route.
- Do not return local filesystem paths or archive-root metadata through MCP control-plane responses; keep such paths internal to the local process.
- Preserve the downstream archive/index format rather than inventing a second archive format.
- Batch-job state is intentionally in memory unless durability is explicitly designed and documented.

## Public documentation

- Use generic example domains, paths, IDs, usernames, and IP addresses.
- Do not document private infrastructure names or personal filesystem layouts.
- Keep architecture and operational guidance detailed enough for a new maintainer to reproduce the flow.

## Validation

Before finishing changes:

- run npm run check
- run npm test
- run npm audit --omit=dev
- verify MCP initialize/listTools against a local test listener
- when a logged-in Companion is available, verify at least one real archive trigger end to end
- run the privacy scan described in docs/OPEN_SOURCE_CHECKLIST.md
