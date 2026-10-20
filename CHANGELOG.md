# Changelog

## 0.1.2 - 2026-10-20

Capability-URL hardening and rotation support:

- require a long `/mcp-<random>` capability path for every non-loopback bind
- reject short or guessable remote MCP routes at startup
- add `rotate-mcp-path.ps1` for cryptographically secure path rotation without storing secrets in the repository
- document the current ChatGPT reconnect flow when an endpoint path is rotated
- clarify that HTTPS encrypts transport while the randomized path acts as a credential-like access-control boundary

## 0.1.1 - 2026-10-20

Security and privacy hardening for public release preparation:

- reject MCP requests carrying unapproved browser `Origin` headers
- add optional bearer-token authentication with constant-time comparison
- fail closed when an existing runtime config is malformed
- require the Companion URL to remain HTTP loopback-only
- require a randomized MCP path when binding outside loopback
- stop printing the real MCP path in startup logs
- minimize Companion health output and redact local path/root metadata from control-plane results
- add runtime security regression tests

## 0.1.0 - 2026-10-20

Initial CatLog MCP control-plane release candidate.
