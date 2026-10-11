# Agentic sheets

Mirror a local store to and from Google Sheets.

One core serves three faces: a terminal command, an npm import,
and an MCP server. Each mirror previews first, so you see the
plan before it reads or writes a sheet.

## Install

```sh
npm install agentic-sheets
```

## Quick start

Preview a pull. This reads nothing yet:

```sh
npx agentic-sheets pull --sheet <id> --range Sheet1!A1:B2
```

Add `--live` to run it:

```sh
npx agentic-sheets pull --sheet <id> --range Sheet1!A1:B2 --live
```

Push a store file. This previews too:

```sh
npx agentic-sheets push --sheet <id> --range Sheet1!A1 --file store.json
```

A store is plain JSON:

```json
{"values": [["a", "b"], ["c"]], "range": "Sheet1!A1:B2"}
```

## Auth

Set one of these before a live run:

```sh
export GOOGLE_SHEETS_TOKEN="<oauth-token>"
export GOOGLE_SHEETS_API_KEY="<api-key>"
```

The token reads and writes. The key reads public sheets only.
With neither set, pull and push run against process memory.
They still run, and they still preview.

## Three usecases

1. You pull a range to JSON for a script.
2. You push JSON rows from a file to a range.
3. You let an agent call the same mirror as an MCP tool.

## Commands

```sh
agentic-sheets pull --sheet <id> --range <r> [--live]
agentic-sheets push --sheet <id> --range <r> --file <p> [--live]
agentic-sheets summary --text <t> [--top <n>]
agentic-sheets dispatch --text <t> [--dry-run]
agentic-sheets costs
agentic-sheets mcp
```

## Library

```js
import { pullStore, pushStore, createStore } from "agentic-sheets";

await pullStore({ spreadsheetId: "<id>", range: "Sheet1!A1:B2" });
const store = createStore([["a"]], "Sheet1!A1");
await pushStore(store, { spreadsheetId: "<id>", range: "Sheet1!A1" });
```

Both calls preview unless you pass `dryRun: false`.

## MCP server

Start the server:

```sh
npx agentic-sheets mcp
```

Tools: `pull_store`, `push_store`, `summarize_text`,
`dispatch_text`, `get_cost_report`. Each mirror tool previews
unless you pass `dryRun: false`.

Add it to a client config:

```json
{"mcpServers": {"agentic-sheets": {"command": "npx", "args": ["-y", "agentic-sheets", "mcp"]}}}
```

## Worker

`src/worker.ts` serves the same core over HTTP. It answers
`GET /health`, `POST /summarize`, `POST /pull`, and `POST /push`.
Live mirror routes need a token in the body or in
`GOOGLE_SHEETS_TOKEN`. See `wrangler.jsonc`.

## Contract

This pack builds against `agentic-core@0.1.0` and the frozen
contract in `agentic-core.d.ts`. See `docs/agentic-core.md`.

## Gates

```sh
npm run build && npm run typecheck && npm test
```

## Release flow

Push to `main` for review. Merge to `release` to publish. The
publish workflow ships only when the version is new.

## Layout

- `src/index.ts`: the library face.
- `src/cli.ts`: the terminal face.
- `src/mcp.ts`: the MCP server. `src/mcp-bin.ts` starts it.
- `src/worker.ts`: the edge worker face.
- `src/sheets.ts`: the store and the sheet adapters.
- `src/core.ts`: the shared core.
- `agentic-core.d.ts`: the frozen contract.
- `docs/agentic-core.md`: the contract in plain words.

## License

MIT. See `LICENSE`.
