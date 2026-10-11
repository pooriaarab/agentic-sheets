import {
  VendorError,
  recordCost,
  type Guards,
  type Logger,
} from "./core.js";

// Store. Plain JSON the pack mirrors to and from a sheet. Values
// stay string-only so a store round-trips through JSON unchanged.

export type SheetValues = string[][];

export interface Store {
  values: SheetValues;
  range: string;
  spreadsheetId?: string;
  updatedAt: string;
}

export function createStore(
  values: SheetValues,
  range: string,
  spreadsheetId?: string,
): Store {
  return {
    values: values.map((row) => [...row]),
    range,
    ...(spreadsheetId === undefined ? {} : { spreadsheetId }),
    updatedAt: new Date().toISOString(),
  };
}

export function serializeStore(store: Store): string {
  return JSON.stringify(store);
}

export function parseStore(raw: string): Store {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("store text is not valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("store JSON needs an object with a values array");
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.values)) {
    throw new Error("store JSON needs a values array of arrays");
  }
  const values: SheetValues = [];
  for (const row of record.values) {
    if (!Array.isArray(row)) {
      throw new Error("store JSON needs a values array of arrays");
    }
    values.push(row.map((cell) => String(cell ?? "")));
  }
  const range = typeof record.range === "string" ? record.range : "";
  const spreadsheetId =
    typeof record.spreadsheetId === "string" ? record.spreadsheetId : undefined;
  const updatedAt =
    typeof record.updatedAt === "string"
      ? record.updatedAt
      : new Date().toISOString();
  return {
    values,
    range,
    ...(spreadsheetId === undefined ? {} : { spreadsheetId }),
    updatedAt,
  };
}

export function countCells(values: SheetValues): number {
  return values.reduce((sum, row) => sum + row.length, 0);
}

function assertTarget(spreadsheetId: string, range: string): void {
  if (spreadsheetId.trim().length === 0) {
    throw new Error("sheets need a spreadsheet id");
  }
  if (range.trim().length === 0) {
    throw new Error("sheets need a range in A1 form, like Sheet1!A1:B2");
  }
}

// Adapter port. Each adapter reads and writes one range. Adapters
// throw VendorError on failure. They never swallow it.

export interface SheetsWriteResult {
  updatedCells: number;
  updatedRange: string;
}

export interface SheetsPort {
  readonly name: string;
  readRange(spreadsheetId: string, range: string): Promise<SheetValues>;
  writeRange(
    spreadsheetId: string,
    range: string,
    values: SheetValues,
  ): Promise<SheetsWriteResult>;
}

export class LocalSheetsAdapter implements SheetsPort {
  readonly name = "local";
  private readonly tables = new Map<string, SheetValues>();

  private key(spreadsheetId: string, range: string): string {
    return `${spreadsheetId}::${range}`;
  }

  async readRange(spreadsheetId: string, range: string): Promise<SheetValues> {
    assertTarget(spreadsheetId, range);
    const found = this.tables.get(this.key(spreadsheetId, range)) ?? [];
    return found.map((row) => [...row]);
  }

  async writeRange(
    spreadsheetId: string,
    range: string,
    values: SheetValues,
  ): Promise<SheetsWriteResult> {
    assertTarget(spreadsheetId, range);
    this.tables.set(
      this.key(spreadsheetId, range),
      values.map((row) => [...row]),
    );
    return { updatedCells: countCells(values), updatedRange: range };
  }
}

export interface GoogleSheetsOptions {
  token?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  valueInputOption?: "RAW" | "USER_ENTERED";
}

export class GoogleSheetsAdapter implements SheetsPort {
  readonly name = "google-sheets";
  private readonly token?: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly valueInputOption: string;

  constructor(options: GoogleSheetsOptions = {}) {
    this.token = options.token;
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://sheets.googleapis.com").replace(
      /\/+$/,
      "",
    );
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchFn = options.fetchFn ?? fetch;
    this.valueInputOption = options.valueInputOption ?? "RAW";
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.token !== undefined && this.token.length > 0) {
      headers.authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private url(path: string, extra = ""): string {
    const keyed =
      this.token !== undefined && this.token.length > 0
        ? ""
        : this.apiKey !== undefined && this.apiKey.length > 0
          ? `key=${encodeURIComponent(this.apiKey)}`
          : "";
    const query = [extra, keyed].filter((part) => part.length > 0).join("&");
    return `${this.baseUrl}${path}${query.length > 0 ? `?${query}` : ""}`;
  }

  private async requestJson(
    input: string,
    init: RequestInit,
    label: string,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchFn(input, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new VendorError(`google-sheets request failed: ${String(error)}`, {
        cause: error,
      });
    }
    if (!response.ok) {
      throw new VendorError(
        `google-sheets ${label} got status ${response.status}`,
        { status: response.status },
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw new VendorError("google-sheets sent a body that is not JSON", {
        cause: error,
      });
    }
  }

  async readRange(spreadsheetId: string, range: string): Promise<SheetValues> {
    assertTarget(spreadsheetId, range);
    const authed =
      (this.token !== undefined && this.token.length > 0) ||
      (this.apiKey !== undefined && this.apiKey.length > 0);
    if (!authed) {
      throw new VendorError("google-sheets reads need a token or an API key");
    }
    const path = `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
    const body = await this.requestJson(
      this.url(path),
      { method: "GET", headers: this.headers() },
      `values.get ${range}`,
    );
    const values = (body as { values?: unknown }).values ?? [];
    if (!Array.isArray(values)) {
      throw new VendorError("google-sheets sent a values body with no values array");
    }
    return values.map((row) =>
      Array.isArray(row)
        ? row.map((cell) => String(cell ?? ""))
        : [String(row ?? "")],
    );
  }

  async writeRange(
    spreadsheetId: string,
    range: string,
    values: SheetValues,
  ): Promise<SheetsWriteResult> {
    assertTarget(spreadsheetId, range);
    if (this.token === undefined || this.token.length === 0) {
      throw new VendorError(
        "google-sheets writes need an OAuth token; an API key reads only",
      );
    }
    const path = `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
    const extra = `valueInputOption=${encodeURIComponent(this.valueInputOption)}`;
    const body = await this.requestJson(
      this.url(path, extra),
      {
        method: "PUT",
        headers: { ...this.headers(), "content-type": "application/json" },
        body: JSON.stringify({ range, majorDimension: "ROWS", values }),
      },
      `values.update ${range}`,
    );
    const record = (body ?? {}) as {
      updatedCells?: unknown;
      updatedRange?: unknown;
    };
    return {
      updatedCells:
        typeof record.updatedCells === "number"
          ? record.updatedCells
          : countCells(values),
      updatedRange:
        typeof record.updatedRange === "string" ? record.updatedRange : range,
    };
  }
}

export function resolveSheetsAdapter(
  env: NodeJS.ProcessEnv = process.env,
): SheetsPort {
  const token = env.GOOGLE_SHEETS_TOKEN;
  const apiKey = env.GOOGLE_SHEETS_API_KEY;
  const hasToken = token !== undefined && token.length > 0;
  const hasKey = apiKey !== undefined && apiKey.length > 0;
  if (hasToken || hasKey) {
    return new GoogleSheetsAdapter({ token, apiKey });
  }
  return new LocalSheetsAdapter();
}

// Mirror entries. Pull reads a range into a store. Push writes a
// store to a range. Both preview with dry run unless told to go
// live, check guards first, and record cost on real mirrors only.

export interface PullOptions {
  adapter?: SheetsPort;
  guards?: Guards;
  logger?: Logger;
  spreadsheetId: string;
  range: string;
  dryRun?: boolean;
}

export interface PullResult {
  dryRun: boolean;
  adapter: string;
  store: Store;
}

export async function pullStore(options: PullOptions): Promise<PullResult> {
  assertTarget(options.spreadsheetId, options.range);
  const adapter = options.adapter ?? resolveSheetsAdapter();
  options.guards?.checkDispatch(`${options.spreadsheetId} ${options.range}`);
  const dryRun = options.dryRun ?? true;
  if (dryRun) {
    options.logger?.info(`dry run: would pull ${options.range}`);
    return {
      dryRun: true,
      adapter: adapter.name,
      store: createStore([], options.range, options.spreadsheetId),
    };
  }
  const values = await adapter.readRange(options.spreadsheetId, options.range);
  options.guards?.recordDispatch();
  recordCost({
    kind: "pull",
    adapter: adapter.name,
    units: countCells(values),
  });
  options.logger?.info(
    `pulled ${countCells(values)} cells from ${options.range} via ${adapter.name}`,
  );
  return {
    dryRun: false,
    adapter: adapter.name,
    store: createStore(values, options.range, options.spreadsheetId),
  };
}

export interface PushOptions {
  adapter?: SheetsPort;
  guards?: Guards;
  logger?: Logger;
  spreadsheetId: string;
  range: string;
  dryRun?: boolean;
}

export interface PushResult {
  dryRun: boolean;
  adapter: string;
  range: string;
  rows: number;
  cells: number;
  write?: SheetsWriteResult;
}

export async function pushStore(
  store: Store,
  options: PushOptions,
): Promise<PushResult> {
  assertTarget(options.spreadsheetId, options.range);
  const adapter = options.adapter ?? resolveSheetsAdapter();
  options.guards?.checkDispatch(`${options.spreadsheetId} ${options.range}`);
  const cells = countCells(store.values);
  const dryRun = options.dryRun ?? true;
  if (dryRun) {
    options.logger?.info(`dry run: would push ${cells} cells to ${options.range}`);
    return {
      dryRun: true,
      adapter: adapter.name,
      range: options.range,
      rows: store.values.length,
      cells,
    };
  }
  const write = await adapter.writeRange(
    options.spreadsheetId,
    options.range,
    store.values,
  );
  options.guards?.recordDispatch();
  recordCost({ kind: "push", adapter: adapter.name, units: cells });
  options.logger?.info(
    `pushed ${cells} cells to ${options.range} via ${adapter.name}`,
  );
  return {
    dryRun: false,
    adapter: adapter.name,
    range: options.range,
    rows: store.values.length,
    cells,
    write,
  };
}
