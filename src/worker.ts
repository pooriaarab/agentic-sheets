import { summarizeText, VendorError } from "./core.js";
import {
  GoogleSheetsAdapter,
  LocalSheetsAdapter,
  parseStore,
  pullStore,
  pushStore,
  type SheetsPort,
} from "./sheets.js";
import { VERSION } from "./version.js";

export interface WorkerEnv {
  PACK_NAME?: string;
  GOOGLE_SHEETS_TOKEN?: string;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type ReadBody =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

async function readBody(request: Request): Promise<ReadBody> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: "body must be JSON" };
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  return { ok: true, body: body as Record<string, unknown> };
}

function readTarget(body: Record<string, unknown>): {
  spreadsheetId: string;
  range: string;
} {
  const spreadsheetId = body.spreadsheetId;
  const range = body.range;
  if (typeof spreadsheetId !== "string" || spreadsheetId.trim().length === 0) {
    throw new Error("body needs a spreadsheetId string");
  }
  if (typeof range !== "string" || range.trim().length === 0) {
    throw new Error("body needs a range string");
  }
  return { spreadsheetId, range };
}

function readDryRun(body: Record<string, unknown>): boolean {
  if (body.dryRun === undefined) return true;
  if (typeof body.dryRun !== "boolean") {
    throw new Error("body dryRun must be a boolean");
  }
  return body.dryRun;
}

function mirrorError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof VendorError) {
    return json({ error: message }, 502);
  }
  return json({ error: message }, 400);
}

function sheetsAdapter(token: string | undefined): SheetsPort {
  if (token !== undefined && token.length > 0) {
    return new GoogleSheetsAdapter({ token });
  }
  return new LocalSheetsAdapter();
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, pack: env.PACK_NAME ?? "agentic-sheets", version: VERSION });
    }
    if (request.method === "POST" && url.pathname === "/summarize") {
      const read = await readBody(request);
      if (!read.ok) return json({ error: read.error }, 400);
      const { text } = read.body;
      if (typeof text !== "string") {
        return json({ error: "body needs a text string" }, 400);
      }
      return json(summarizeText(text));
    }
    if (request.method === "POST" && url.pathname === "/pull") {
      const read = await readBody(request);
      if (!read.ok) return json({ error: read.error }, 400);
      try {
        const { spreadsheetId, range } = readTarget(read.body);
        const dryRun = readDryRun(read.body);
        const token =
          typeof read.body.token === "string" && read.body.token.length > 0
            ? read.body.token
            : env.GOOGLE_SHEETS_TOKEN;
        if (!dryRun && (token === undefined || token.length === 0)) {
          return json({ error: "live pull needs a token" }, 400);
        }
        return json(
          await pullStore({ adapter: sheetsAdapter(token), spreadsheetId, range, dryRun }),
        );
      } catch (error) {
        return mirrorError(error);
      }
    }
    if (request.method === "POST" && url.pathname === "/push") {
      const read = await readBody(request);
      if (!read.ok) return json({ error: read.error }, 400);
      try {
        const { spreadsheetId, range } = readTarget(read.body);
        const dryRun = readDryRun(read.body);
        if (!Array.isArray(read.body.values)) {
          return json({ error: "body needs a values array of arrays" }, 400);
        }
        const store = parseStore(
          JSON.stringify({ values: read.body.values, range, spreadsheetId }),
        );
        const token =
          typeof read.body.token === "string" && read.body.token.length > 0
            ? read.body.token
            : env.GOOGLE_SHEETS_TOKEN;
        if (!dryRun && (token === undefined || token.length === 0)) {
          return json({ error: "live push needs a token" }, 400);
        }
        return json(
          await pushStore(store, {
            adapter: sheetsAdapter(token),
            spreadsheetId,
            range,
            dryRun,
          }),
        );
      } catch (error) {
        return mirrorError(error);
      }
    }
    return json({ error: "not found" }, 404);
  },
};
