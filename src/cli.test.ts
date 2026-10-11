import { describe, expect, test } from "vitest";
import { parseArgs, runCli, UsageError, type CliIo } from "./cli.js";
import { LocalRouterAdapter } from "./core.js";
import { LocalSheetsAdapter } from "./sheets.js";

function testIo(overrides: Partial<CliIo> = {}): CliIo & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    outLines,
    errLines,
    out: (line) => outLines.push(line),
    err: (line) => errLines.push(line),
    readFile: (path) => `file:${path}`,
    router: new LocalRouterAdapter(),
    sheets: new LocalSheetsAdapter(),
    ...overrides,
  };
}

const STORE_JSON = JSON.stringify({
  values: [
    ["a", "b"],
    ["c"],
  ],
  range: "Sheet1!A1:B2",
});

describe("parseArgs", () => {
  test("empty args print help", () => {
    expect(parseArgs([]).command).toBe("help");
  });

  test("--version selects version", () => {
    expect(parseArgs(["--version"]).command).toBe("version");
  });

  test("summary takes text and top", () => {
    expect(parseArgs(["summary", "--text", "hi", "--top", "2"])).toEqual({
      command: "summary",
      text: "hi",
      topN: 2,
      dryRun: false,
    });
  });

  test("dispatch takes dry run", () => {
    const request = parseArgs(["dispatch", "--text", "hi", "--dry-run"]);
    expect(request.command).toBe("dispatch");
    expect(request.dryRun).toBe(true);
  });

  test("pull previews by default and takes sheet and range", () => {
    expect(parseArgs(["pull", "--sheet", "s", "--range", "R"])).toEqual({
      command: "pull",
      dryRun: true,
      sheet: "s",
      range: "R",
    });
  });

  test("pull goes live only with --live", () => {
    const request = parseArgs(["pull", "--sheet", "s", "--range", "R", "--live"]);
    expect(request.dryRun).toBe(false);
  });

  test("push needs input plus sheet and range", () => {
    const request = parseArgs([
      "push",
      "--sheet",
      "s",
      "--range",
      "R",
      "--text",
      STORE_JSON,
    ]);
    expect(request.command).toBe("push");
    expect(request.dryRun).toBe(true);
    expect(() => parseArgs(["push", "--sheet", "s", "--range", "R"])).toThrow(
      /needs --text or --file/,
    );
    expect(() => parseArgs(["push", "--text", STORE_JSON])).toThrow(
      /needs --sheet and --range/,
    );
  });

  test("unknown command throws UsageError", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(UsageError);
  });

  test("summary without input throws", () => {
    expect(() => parseArgs(["summary"])).toThrow(/needs --text or --file/);
  });

  test("bad top value throws", () => {
    expect(() => parseArgs(["summary", "--text", "hi", "--top", "many"])).toThrow(/--top/);
  });

  test("--live outside a mirror command throws", () => {
    expect(() => parseArgs(["summary", "--text", "hi", "--live"])).toThrow(
      /unknown flag/,
    );
  });
});

describe("runCli", () => {
  test("summary prints JSON stats", async () => {
    const io = testIo();
    const code = await runCli(["summary", "--text", "hello world hello"], io);
    expect(code).toBe(0);
    expect(JSON.parse(io.outLines[0])).toMatchObject({ words: 3 });
  });

  test("summary reads a file when asked", async () => {
    const io = testIo();
    const code = await runCli(["summary", "--file", "note.txt"], io);
    expect(code).toBe(0);
    expect(JSON.parse(io.outLines[0])).toMatchObject({ words: 1 });
  });

  test("dispatch dry run prints a preview", async () => {
    const io = testIo();
    const code = await runCli(["dispatch", "--text", "hi", "--dry-run"], io);
    expect(code).toBe(0);
    expect(JSON.parse(io.outLines[0])).toMatchObject({ dryRun: true, chars: 2 });
  });

  test("pull prints a dry run preview by default", async () => {
    const io = testIo();
    const code = await runCli(["pull", "--sheet", "s", "--range", "R"], io);
    expect(code).toBe(0);
    expect(JSON.parse(io.outLines[0])).toMatchObject({
      dryRun: true,
      adapter: "local",
      store: { values: [], range: "R" },
    });
  });

  test("push and pull round-trip live on one adapter", async () => {
    const io = testIo();
    const pushed = await runCli(
      ["push", "--sheet", "s", "--range", "R", "--text", STORE_JSON, "--live"],
      io,
    );
    expect(pushed).toBe(0);
    expect(JSON.parse(io.outLines[0])).toMatchObject({
      dryRun: false,
      rows: 2,
      cells: 3,
    });
    const pulled = await runCli(
      ["pull", "--sheet", "s", "--range", "R", "--live"],
      io,
    );
    expect(pulled).toBe(0);
    expect(JSON.parse(io.outLines[1]).store.values).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  test("push with bad store JSON exits 1", async () => {
    const io = testIo();
    const code = await runCli(
      ["push", "--sheet", "s", "--range", "R", "--text", "nope"],
      io,
    );
    expect(code).toBe(1);
    expect(io.errLines.join("\n")).toContain("bad store JSON");
  });

  test("bad usage exits 2", async () => {
    const io = testIo();
    const code = await runCli(["bogus"], io);
    expect(code).toBe(2);
    expect(io.errLines.length).toBeGreaterThan(0);
  });

  test("version prints a version string", async () => {
    const io = testIo();
    const code = await runCli(["--version"], io);
    expect(code).toBe(0);
    expect(io.outLines[0]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
