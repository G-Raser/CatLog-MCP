# Changelog

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
