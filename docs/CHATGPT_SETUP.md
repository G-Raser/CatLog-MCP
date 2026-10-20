# ChatGPT custom MCP setup

This document records the custom MCP/App-backed setup sequence that was verified on 2026-10-20. Product wording may change later, so treat exact labels as UI guidance rather than a permanent API contract.

## Before opening ChatGPT

Verify all of the following:

- CatLog Companion is healthy locally
- the browser extension is connected to the Companion
- CatLog MCP is running
- the MCP endpoint is reachable through HTTPS from the Internet or the required network
- the full endpoint includes the randomized MCP path
- the Companion itself is not remotely exposed

A typical public-facing endpoint shape is:

~~~text
https://mcp.example.com/mcp-<random-secret>
~~~

Never put a real endpoint from a private deployment into public documentation.

## Add the MCP server

In ChatGPT:

1. Open Plugins.
2. Use Add.
3. Choose Add custom MCP server.
4. Enter a clear name such as CatLog.
5. Enter a short description.
6. Enter the complete HTTPS MCP endpoint, including the randomized path.
7. Choose the authentication mode that matches the deployment.
8. Review the risk acknowledgement.
9. Create it as a plugin/app.
10. Connect it.

For a deployment with no application-layer auth, the UI may use wording such as No authentication. That does not make the endpoint safe by itself; upstream network or proxy controls still matter.

If the client and deployment support a static bearer credential, configure the same secret in CatLog MCP and the client. Do not force bearer mode when the client cannot send the header. CatLog's browser-Origin protection is independent of this choice and does not normally affect ChatGPT's server-to-server MCP connection.

## Set plugin-specific permissions

After connecting:

1. Open Settings.
2. Open Plugins.
3. Open the CatLog plugin itself.
4. Open its Permissions page.
5. Choose the tool permission level you actually want.
6. For a fully trusted personal deployment that needs archive actions, Allow all may be required.
7. Return to the plugin details.
8. Run Refresh tools.

Global ChatGPT tool permissions and the custom plugin's own permission page are separate. If tools are missing or archive actions are unavailable, check the plugin-specific permission first.

## Expected tool list

A healthy CatLog MCP exposes exactly these tools:

~~~text
catlog_status
catlog_find_message
catlog_archive_conversation
catlog_archive_many
catlog_job_status
catlog_trigger_status
~~~

## Smoke test

Run catlog_status first.

Then test one known conversation:

1. call catlog_archive_conversation with a real conversation_id
2. verify the returned result says the fresh read succeeded
3. confirm raw and readable archive files exist downstream
4. call catlog_find_message with a phrase known to occur in that conversation
5. request an IANA timezone if local timestamp rendering matters
6. verify create_time and local_time against the source

Do not use a synthetic success page as the only acceptance test. The end-to-end archive path must run.

## If Refresh tools does not appear to work

First confirm the plugin is connected and its own permission page is set correctly.

Then run Refresh tools again.

Some clients may update the current conversation's tool registry immediately; others may require a fresh chat. Do not rebuild the backend merely because one already-open chat still has an old tool registry.

## Duplicate or legacy plugin warning

If an older standalone/custom version of the same MCP service already exists, remove or disconnect it before creating the App-backed custom MCP entry. Duplicate registrations can make it difficult to tell which tool schema is actually active.

## UI automation note

If browser automation reports that it clicked Add but the menu did not visually open, treat that as an automation/control compatibility problem rather than evidence that the product requires a human confirmation. Native UI automation or a real pointer click may work where a semantic browser click does not.

Use this only as a maintenance workaround. It is not part of CatLog's runtime architecture.
