# Security

## Security model

CatLog MCP is a privileged local-control adapter.

A caller that can use its archive tools can trigger browser-authenticated archive work through the local Companion. Treat access to the MCP endpoint as trusted access.

## Important boundaries

- CatLog Companion should remain loopback-only.
- `companion_url` is validated at startup and must use HTTP on a loopback host.
- Browser authentication stays in the browser/extension layer.
- Runtime configuration stays outside the repository.
- Archive data stays outside the repository.
- The MCP server should be exposed remotely only through an intentionally restricted network/proxy/tunnel.

## Request authentication and origin validation

CatLog MCP supports an optional shared bearer token through `bearer_token` or `CATLOG_MCP_BEARER_TOKEN`. The token is not generated into the repository and should remain outside source control. When configured, all MCP transport methods require `Authorization: Bearer <token>`.

Browser requests that carry an `Origin` header are rejected unless the exact origin appears in `allowed_origins` or `CATLOG_MCP_ALLOWED_ORIGINS`. Requests without an `Origin` header remain compatible with normal server-to-server MCP clients.

The randomized MCP path generated during setup is credential-like and must remain private, but path secrecy alone is not sufficient for an Internet-reachable deployment. Combine it with a private network, upstream identity/access control, or the optional bearer token.

Control-plane responses are minimized before they leave the MCP server: Companion health omits archive-root details, and archive/trigger/batch metadata has local path/root fields removed. Message text returned by `catlog_find_message` is not altered by this sanitizer because returning matched conversation text is that tool's explicit purpose.

## Health endpoint

The public health route reports only service health and whether the Companion is reachable. Companion exception details, archive roots, browser state, tokens, and other Companion internals are intentionally omitted.

## Reporting a vulnerability

If this repository becomes public, prefer GitHub private vulnerability reporting or another private channel configured by the repository owner. Do not place live endpoints, credentials, conversation data, or archive samples in a public issue.

## Supported scope

Security fixes should preserve the core design:

- remote clients talk to CatLog MCP
- CatLog MCP talks to Companion locally
- Companion/extension own browser-authenticated fetching
- private archive data does not enter source control
