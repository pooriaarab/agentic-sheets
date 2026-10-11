import { describe, expect, test } from "vitest";
import {
  GoogleSheetsAdapter,
  LocalSheetsAdapter,
  countCells,
  createStore,
  parseStore,
  pullStore,
  pushStore,
  resolveSheetsAdapter,
  serializeStore,
} from "./sheets.js";
import {
  createGuards,
  getCostReport,
  GuardError,
  resetCosts,
  VendorError,
} from "./core.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface SeenCall {
  input: string;
  init?: RequestInit;
}

function stubFetch(
  respond: (call: SeenCall) => Response,
): { fetchFn: typeof fetch; calls: SeenCall[] } {
  const calls: SeenCall[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { input: String(input), init };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("store", () => {
  test("round-trips through JSON", () => {
    const store = createStore(
      [
        ["a", "b"],
        ["c"],
      ],
      "Sheet1!A1:B2",
      "sheet-id",
    );
    expect(parseStore(serializeStore(store))).toMatchObject({
      values: [
        ["a", "b"],
        ["c"],
      ],
      range: "Sheet1!A1:B2",
      spreadsheetId: "sheet-id",
    });
  });

  test("copies values on create", () => {
    const values = [["a"]];
    const store = createStore(values, "R");
    values[0][0] = "mutated";
    expect(store.values).toEqual([["a"]]);
  });

  test("rejects text that is not JSON", () => {
    expect(() => parseStore("not json")).toThrow(/not valid JSON/);
  });

  test("rejects JSON with no values array", () => {
    expect(() => parseStore("{}")).toThrow(/needs a values array/);
    expect(() => parseStore("[]")).toThrow(/needs an object/);
    expect(() => parseStore('{"values":[["a"],"nope"]}')).toThrow(
      /array of arrays/,
    );
  });

  test("counts cells across ragged rows", () => {
    expect(
      countCells([
        ["a", "b"],
        ["c"],
        [],
      ]),
    ).toBe(3);
  });
});

describe("local adapter", () => {
  test("reads back what it writes", async () => {
    const adapter = new LocalSheetsAdapter();
    expect(await adapter.readRange("s", "R")).toEqual([]);
    const write = await adapter.writeRange("s", "R", [["a", "b"]]);
    expect(write).toEqual({ updatedCells: 2, updatedRange: "R" });
    expect(await adapter.readRange("s", "R")).toEqual([["a", "b"]]);
  });

  test("keeps ranges apart", async () => {
    const adapter = new LocalSheetsAdapter();
    await adapter.writeRange("s", "R1", [["a"]]);
    expect(await adapter.readRange("s", "R2")).toEqual([]);
  });

  test("copies on read and write", async () => {
    const adapter = new LocalSheetsAdapter();
    const values = [["a"]];
    await adapter.writeRange("s", "R", values);
    values[0][0] = "mutated";
    const read = await adapter.readRange("s", "R");
    read[0][0] = "mutated";
    expect(await adapter.readRange("s", "R")).toEqual([["a"]]);
  });

  test("rejects an empty id or range", async () => {
    const adapter = new LocalSheetsAdapter();
    await expect(adapter.readRange("", "R")).rejects.toThrow(/spreadsheet id/);
    await expect(adapter.readRange("s", "")).rejects.toThrow(/A1 form/);
    await expect(adapter.writeRange("s", "", [])).rejects.toThrow(/A1 form/);
  });
});

describe("google adapter reads", () => {
  test("sends GET with a bearer token and parses values", async () => {
    const { fetchFn, calls } = stubFetch(() =>
      jsonResponse({ values: [["a", 1, null]] }),
    );
    const adapter = new GoogleSheetsAdapter({ token: "tok", fetchFn });
    const values = await adapter.readRange("sheet id", "Sheet1!A1:B2");
    expect(values).toEqual([["a", "1", ""]]);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet%20id/values/Sheet1!A1%3AB2",
    );
    expect(calls[0].init?.method).toBe("GET");
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe(
      "Bearer tok",
    );
  });

  test("reads a public sheet with an API key and no auth header", async () => {
    const { fetchFn, calls } = stubFetch(() => jsonResponse({ values: [] }));
    const adapter = new GoogleSheetsAdapter({ apiKey: "key", fetchFn });
    await adapter.readRange("s", "R");
    expect(calls[0].input).toContain("?key=key");
    expect(calls[0].init?.headers as Record<string, string>).not.toHaveProperty(
      "authorization",
    );
  });

  test("maps a missing values field to an empty store", async () => {
    const { fetchFn } = stubFetch(() => jsonResponse({ range: "R" }));
    const adapter = new GoogleSheetsAdapter({ token: "tok", fetchFn });
    expect(await adapter.readRange("s", "R")).toEqual([]);
  });

  test("throws VendorError with status on a bad status", async () => {
    const { fetchFn } = stubFetch(() => jsonResponse({ error: "no" }, 401));
    const adapter = new GoogleSheetsAdapter({ token: "bad", fetchFn });
    const error = await adapter.readRange("s", "R").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VendorError);
    expect((error as VendorError).status).toBe(401);
  });

  test("throws VendorError when the network fails", async () => {
    const fetchFn = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    const adapter = new GoogleSheetsAdapter({ token: "tok", fetchFn });
    await expect(adapter.readRange("s", "R")).rejects.toThrow(VendorError);
  });

  test("throws VendorError with no auth at all", async () => {
    const { fetchFn, calls } = stubFetch(() => jsonResponse({}));
    const adapter = new GoogleSheetsAdapter({ fetchFn });
    await expect(adapter.readRange("s", "R")).rejects.toThrow(/token or an API key/);
    expect(calls).toHaveLength(0);
  });

  test("throws VendorError on a values body with no values array", async () => {
    const { fetchFn } = stubFetch(() => jsonResponse({ values: "nope" }));
    const adapter = new GoogleSheetsAdapter({ token: "tok", fetchFn });
    await expect(adapter.readRange("s", "R")).rejects.toThrow(/no values array/);
  });
});

describe("google adapter writes", () => {
  test("sends PUT with the range body and parses the reply", async () => {
    const { fetchFn, calls } = stubFetch(() =>
      jsonResponse({ updatedCells: 4, updatedRange: "Sheet1!A1:B2" }),
    );
    const adapter = new GoogleSheetsAdapter({ token: "tok", fetchFn });
    const write = await adapter.writeRange("s", "R", [["a", "b"]]);
    expect(write).toEqual({ updatedCells: 4, updatedRange: "Sheet1!A1:B2" });
    expect(calls[0].input).toContain("/values/R?valueInputOption=RAW");
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(calls[0].init?.body as string)).toEqual({
      range: "R",
      majorDimension: "ROWS",
      values: [["a", "b"]],
    });
  });

  test("falls back to local counts when the reply lacks them", async () => {
    const { fetchFn } = stubFetch(() => jsonResponse({}));
    const adapter = new GoogleSheetsAdapter({ token: "tok", fetchFn });
    const write = await adapter.writeRange("s", "R", [["a", "b"]]);
    expect(write).toEqual({ updatedCells: 2, updatedRange: "R" });
  });

  test("refuses writes with an API key alone", async () => {
    const { fetchFn, calls } = stubFetch(() => jsonResponse({}));
    const adapter = new GoogleSheetsAdapter({ apiKey: "key", fetchFn });
    await expect(adapter.writeRange("s", "R", [["a"]])).rejects.toThrow(
      /API key reads only/,
    );
    expect(calls).toHaveLength(0);
  });

  test("throws VendorError with status on a bad status", async () => {
    const { fetchFn } = stubFetch(() => jsonResponse({}, 429));
    const adapter = new GoogleSheetsAdapter({ token: "tok", fetchFn });
    const error = await adapter
      .writeRange("s", "R", [["a"]])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VendorError);
    expect((error as VendorError).status).toBe(429);
  });
});

describe("adapter resolution", () => {
  test("uses google sheets when a token is set", () => {
    expect(
      resolveSheetsAdapter({ GOOGLE_SHEETS_TOKEN: "tok" }).name,
    ).toBe("google-sheets");
  });

  test("uses google sheets when only a key is set", () => {
    expect(
      resolveSheetsAdapter({ GOOGLE_SHEETS_API_KEY: "key" }).name,
    ).toBe("google-sheets");
  });

  test("falls back to local with no auth", () => {
    expect(resolveSheetsAdapter({}).name).toBe("local");
  });
});

describe("pull and push entries", () => {
  test("pull previews by default and calls no adapter", async () => {
    const fetchFn = (async () => {
      throw new Error("must not run");
    }) as typeof fetch;
    const adapter = new GoogleSheetsAdapter({ token: "tok", fetchFn });
    const result = await pullStore({
      adapter,
      spreadsheetId: "s",
      range: "R",
    });
    expect(result).toMatchObject({
      dryRun: true,
      adapter: "google-sheets",
      store: { values: [], range: "R", spreadsheetId: "s" },
    });
  });

  test("push previews by default with row and cell counts", async () => {
    const result = await pushStore(createStore([["a", "b"], ["c"]], "R"), {
      adapter: new LocalSheetsAdapter(),
      spreadsheetId: "s",
      range: "R",
    });
    expect(result).toMatchObject({
      dryRun: true,
      adapter: "local",
      rows: 2,
      cells: 3,
    });
    expect(result.write).toBeUndefined();
  });

  test("live pull and push round-trip on the local adapter", async () => {
    resetCosts();
    const adapter = new LocalSheetsAdapter();
    const pushed = await pushStore(createStore([["a"]], "R"), {
      adapter,
      spreadsheetId: "s",
      range: "R",
      dryRun: false,
    });
    expect(pushed).toMatchObject({ dryRun: false, write: { updatedCells: 1 } });
    const pulled = await pullStore({
      adapter,
      spreadsheetId: "s",
      range: "R",
      dryRun: false,
    });
    expect(pulled.store.values).toEqual([["a"]]);
    const report = getCostReport();
    expect(report.units).toBe(2);
    expect(report.entries.map((entry) => entry.kind).sort()).toEqual([
      "pull",
      "push",
    ]);
  });

  test("live pull records no cost when the read is empty", async () => {
    resetCosts();
    const pulled = await pullStore({
      adapter: new LocalSheetsAdapter(),
      spreadsheetId: "s",
      range: "missing",
      dryRun: false,
    });
    expect(pulled.store.values).toEqual([]);
    expect(getCostReport().units).toBe(0);
  });

  test("a guard denial stops the mirror before any call", async () => {
    const guards = createGuards({ blocklist: ["secret-sheet"] });
    await expect(
      pullStore({
        adapter: new LocalSheetsAdapter(),
        guards,
        spreadsheetId: "secret-sheet",
        range: "R",
        dryRun: false,
      }),
    ).rejects.toThrow(GuardError);
    expect(guards.dispatchCount).toBe(0);
  });

  test("a denied dry run counts nothing either", async () => {
    const guards = createGuards({ caps: { maxDispatches: 0 } });
    await expect(
      pushStore(createStore([["a"]], "R"), {
        adapter: new LocalSheetsAdapter(),
        guards,
        spreadsheetId: "s",
        range: "R",
      }),
    ).rejects.toThrow(/cap reached/);
  });

  test("real mirrors count toward the cap", async () => {
    const guards = createGuards({ caps: { maxDispatches: 1 } });
    const adapter = new LocalSheetsAdapter();
    await pushStore(createStore([["a"]], "R"), {
      adapter,
      guards,
      spreadsheetId: "s",
      range: "R",
      dryRun: false,
    });
    await expect(
      pullStore({ adapter, guards, spreadsheetId: "s", range: "R", dryRun: false }),
    ).rejects.toThrow(GuardError);
  });

  test("empty targets throw before guards run", async () => {
    await expect(
      pullStore({ spreadsheetId: "", range: "R", dryRun: false }),
    ).rejects.toThrow(/spreadsheet id/);
    await expect(
      pushStore(createStore([], ""), { spreadsheetId: "s", range: "" }),
    ).rejects.toThrow(/A1 form/);
  });
});
