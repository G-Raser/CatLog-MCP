# Security

## Security model

CatLog MCP is a privileged local-control adapter.

A caller that can use its archive tools can trigger browser-authenticated archive work through the local Companion. Treat access to the MCP endpoint as trusted access.

## Important boundaries

- CatLog Companion should remain loopback-only.
- Browser authentication stays in the browser/extension layer.
- Runtime configuration stays outside the repository.
- Archive data stays outside the repository.
- The MCP server should be exposed remotely only through an intentionally restricted network/proxy/tunnel.

## Authentication note

The current server does not implement its own OAuth or bearer-token layer.

The randomized MCP path generated during setup is credential-like and must remain private, but it should be combined with stronger upstream controls when the service is reachable from the public Internet.

## Health endpoint

The public health route should report only service health and whether the Companion is reachable. It should not return archive roots, browser state, tokens, or other Companion internals.

## Reporting a vulnerability

If this repository becomes public, prefer GitHub private vulnerability reporting or another private channel configured by the repository owner. Do not place live endpoints, credentials, conversation data, or archive samples in a public issue.

## Supported scope

Security fixes should preserve the core design:

- remote clients talk to CatLog MCP
- CatLog MCP talks to Companion locally
- Companion/extension own browser-authenticated fetching
- private archive data does not enter source control
