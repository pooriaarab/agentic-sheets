---
name: agentic-sheets
description: Mirror a local store to and from Google Sheets. Keywords: google-sheets, sync, agentic-suite, claude-code, codex, cli, mcp.
---

# agentic-sheets

Mirror a local store to and from Google Sheets.

## Use the SDK

```js
import { pullStore, pushStore, createStore } from "agentic-sheets";

await pullStore({ spreadsheetId: "<id>", range: "Sheet1!A1:B2" });
const store = createStore([["a"]], "Sheet1!A1");
await pushStore(store, { spreadsheetId: "<id>", range: "Sheet1!A1" });
```

## Use the CLI

```sh
agentic-sheets pull --sheet <id> --range Sheet1!A1:B2
agentic-sheets push --sheet <id> --range Sheet1!A1 --file store.json --live
```

## Use the MCP server

Start the server with `agentic-sheets mcp`. Call `pull_store`
to read, `push_store` to write, `get_cost_report` for costs.

## Rules

- Preview each mirror with dry run first.
- Report guard denials and adapter errors as failures.
- Read the cost report at the end.
