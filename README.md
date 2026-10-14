# agentic-sheets

[![npm version](https://img.shields.io/npm/v/agentic-sheets)](https://www.npmjs.com/package/agentic-sheets)
[![Monthly downloads](https://img.shields.io/npm/dm/agentic-sheets)](https://www.npmjs.com/package/agentic-sheets)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/license/mit)

[Package](https://www.npmjs.com/package/agentic-sheets) · [Source](https://github.com/pooriaarab/agentic-sheets) · [Support](https://github.com/pooriaarab/agentic-sheets/issues)

agentic-sheets is an open-source Google Sheets values API wrapper for developers who move JSON rows through a TypeScript SDK, CLI, or Model Context Protocol (MCP) server.

## Install

```sh
npm install agentic-sheets
```

Requires Node.js 18 or later. Includes TypeScript declarations and three direct runtime dependencies.

## Preview your first write

No credentials or environment variables are required for this preview.

```sh
npx agentic-sheets push --sheet demo --range 'Sheet1!A1' --text '{"values":[["hello"]]}'
```

Success prints `dryRun: true`, `rows: 1`, and `cells: 1`. No sheet is changed.
For a credential-free SDK example, save this as `sheets-demo.mjs` and run `node sheets-demo.mjs`.

```js
import { createStore, LocalSheetsAdapter, pushStore, pullStore, getCostReport } from "agentic-sheets";
const adapter = new LocalSheetsAdapter();
const target = { adapter, spreadsheetId: "demo", range: "Sheet1!A1" };
const store = createStore([["hello"]], target.range);
console.log(await pushStore(store, target)); // Preview first.
await pushStore(store, { ...target, dryRun: false });
const result = await pullStore({ ...target, dryRun: false });
console.log(result.store.values); // [["hello"]]
console.log(getCostReport().units); // 2 cell units, not money.
```

## Connect Google Sheets

Set `GOOGLE_SHEETS_TOKEN` to a valid OAuth access token with permission for your spreadsheet.
CLI and MCP read this variable. The package does not load `.env` files; export variables before starting it.
`GOOGLE_SHEETS_API_KEY` selects key-based reads; writes require a token. Token authentication takes precedence over an API key.
With neither variable set, CLI and SDK adapter resolution selects process memory, including for live calls.

```sh
export GOOGLE_SHEETS_TOKEN='YOUR_OAUTH_ACCESS_TOKEN'
npx agentic-sheets pull --sheet YOUR_SPREADSHEET_ID --range 'Sheet1!A1:B2'
npx agentic-sheets pull --sheet YOUR_SPREADSHEET_ID --range 'Sheet1!A1:B2' --live
```

A successful live pull prints `adapter: "google-sheets"`, `dryRun: false`, and the returned values.

## Features and runtime surfaces

- **Sheet adapters:** Two implementations: Google Sheets values GET/PUT and an in-memory local adapter.
- **Stores:** String rows with range, optional spreadsheet ID, timestamp, JSON parsing, and serialization.
- **Previews:** SDK and MCP pull/push default to dry-run; CLI mirrors require `--live` for execution.
- **SDK controls:** Inject adapters, fetch, logging, guards, timeout, and `RAW` or `USER_ENTERED` write handling.
- **CLI:** `pull`, `push`, `summary`, `dispatch`, `costs`, `mcp`; `--help` and `--version` also work.
- **MCP:** `pull_store`, `push_store`, `summarize_text`, `dispatch_text`, `get_cost_report`.
- **Worker scaffold:** Four source routes: `GET /health`, `POST /summarize`, `POST /pull`, `POST /push`; users deploy it themselves.

Start MCP with `npx agentic-sheets mcp`. Mirror tools accept `spreadsheetId`, `range`, and optional `dryRun`; push also takes string `values` rows.
Push accepts store JSON through `--text` or `--file`. Summary accepts text/files and `--top`; local dispatch supports `--dry-run`.

## Limits and status

One vendor integration is implemented: Google Sheets. Tests use local and mocked adapters; live credentials are not verified here.
There is no automatic synchronization, conflict resolution, OAuth login, token refresh, retry, or file persistence.
Google requests default to a ten-second timeout. Writes update a range; they do not append rows or format cells.
The local adapter matches exact range strings and loses data with its instance. Separate CLI calls do not share that memory.
Cost reports count cells and text units in process memory, rather than Google billing charges.
Worker live mirrors require a body token or `GOOGLE_SHEETS_TOKEN`; Worker routes do not support API keys.
Version 0.1.0 is an early release.

## License

MIT.
