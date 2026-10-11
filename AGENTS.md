# agentic-sheets agent guide

Mirror a local store to and from Google Sheets.

## Mental model

A range goes in, and a store comes out. A store goes in, and
a receipt comes out. One core serves all three faces, so each
face returns the same shape.

## The three faces

- SDK: `import { pullStore, pushStore } from "agentic-sheets"`.
- CLI: `npx agentic-sheets pull --sheet <id> --range <r>`.
- MCP: `npx agentic-sheets mcp`, then call a tool below.

Keywords: google-sheets, sync, agentic-suite, claude-code, codex, cli, mcp.

## MCP tools

| Tool | Use it for |
| --- | --- |
| pull_store | Pull a range into a store. Previews by default. |
| push_store | Push a store to a range. Previews by default. |
| summarize_text | Count chars, words, lines, top words. |
| dispatch_text | Route one text. Pass dryRun to preview. |
| get_cost_report | Read session cost totals. |

## The loop

1. Discover the tools with `tools/list`.
2. Pull a range with `pull_store` and dryRun left on.
3. Push a store with `push_store` and dryRun left on.
4. Run the real mirror with dryRun false when the preview looks right.
5. Read `get_cost_report` and state the cost.

## Rules

- Preview with dry run before each real mirror.
- Stop when a guard denies the call. State the reason.
- Never retry a denied call with a changed range to dodge a guard.
- Report adapter errors as errors. Never present them as success.
- State the cost report before you claim the task is done.
- Live runs need GOOGLE_SHEETS_TOKEN. Say so when it is missing.
