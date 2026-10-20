# Open-source privacy checklist

Run this checklist before changing repository visibility to public.

## Never commit

- real MCP endpoint URLs
- randomized MCP paths
- tunnel tokens or tunnel configuration containing private routes
- browser cookies or session tokens
- API keys
- archive contents
- raw conversation JSON
- readable conversation exports
- conversation IDs from a personal account
- ChatGPT project IDs
- plugin/app IDs
- local usernames
- personal filesystem paths
- private domain names
- private IP addresses or overlay-network addresses
- screenshots that reveal any of the above
- generated config.json
- node_modules

## Repository examples

Use placeholders:

~~~text
https://mcp.example.com/mcp-<random-secret>
<conversation-id>
<project-id>
C:\Archives\CatLog
127.0.0.1
~~~

Do not use a real value and then redact only part of it.

## Pre-publication content scan

From the repository root:

~~~powershell
git grep -n -I -E "sk-|api[_-]?key|token|secret|password|cookie|session"
git grep -n -I -E "conversation_id|project_id|plugin_|mcp-[A-Za-z0-9_-]{20,}"
git grep -n -I -E "100\.[0-9]+\.[0-9]+\.[0-9]+|10\.[0-9]+\.[0-9]+\.[0-9]+"
~~~

Review every hit manually. Documentation words such as secret or token are expected; actual values are not.

Also search for known private domain suffixes, usernames, archive-drive names, and internal project names.

## Git history matters

A file deleted from the latest commit still exists in Git history.

Before making a repository public:

1. inspect all commits, not only the working tree
2. verify no earlier commit contained a live credential, private archive, or endpoint path
3. if a secret ever entered history, rotate it even if history is rewritten
4. if necessary, rewrite history before publication

This repository was designed to start from a sanitized first commit so publication review stays simple.

## Runtime config

The real config lives outside Git.

setup.ps1 generates the randomized MCP path. Treat that path as credential-like deployment data.

Do not add the real config back to the repository for convenience.

## Public documentation policy

Public docs should explain:

- architecture
- installation
- setup
- tool behavior
- security boundaries
- troubleshooting

Public docs should not explain:

- the operator's private infrastructure names
- personal archive organization
- internal memory-system names
- private domains
- exact routes
- personal conversation examples
- private plugin IDs

## License

Choose and add an explicit LICENSE before describing the repository as open source. Public source without a license is visible source, not automatically open source.
