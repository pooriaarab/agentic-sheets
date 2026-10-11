#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  dispatchText,
  getCostReport,
  GuardError,
  LocalRouterAdapter,
  summarizeText,
  VendorError,
  type RouterAdapter,
} from "./core.js";
import { DEFAULT_BRAND } from "./index.js";
import {
  parseStore,
  pullStore,
  pushStore,
  resolveSheetsAdapter,
  type SheetsPort,
  type Store,
} from "./sheets.js";
import { VERSION } from "./version.js";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type CliCommand =
  | "summary"
  | "dispatch"
  | "costs"
  | "mcp"
  | "pull"
  | "push"
  | "help"
  | "version";

export interface CliRequest {
  command: CliCommand;
  text?: string;
  file?: string;
  dryRun: boolean;
  topN?: number;
  sheet?: string;
  range?: string;
}

function isMirrorCommand(command: string): command is "pull" | "push" {
  return command === "pull" || command === "push";
}

export function parseArgs(argv: string[]): CliRequest {
  const args = [...argv];
  const first = args.shift();
  if (first === undefined || first === "--help" || first === "-h") {
    return { command: "help", dryRun: false };
  }
  if (first === "--version" || first === "-V") {
    return { command: "version", dryRun: false };
  }
  if (
    first !== "summary" &&
    first !== "dispatch" &&
    first !== "costs" &&
    first !== "mcp" &&
    !isMirrorCommand(first)
  ) {
    throw new UsageError(`unknown command "${first}"`);
  }
  const request: CliRequest = {
    command: first,
    dryRun: isMirrorCommand(first),
  };
  while (args.length > 0) {
    const flag = args.shift() as string;
    if (
      flag === "--dry-run" &&
      (request.command === "dispatch" || isMirrorCommand(request.command))
    ) {
      request.dryRun = true;
      continue;
    }
    if (flag === "--live" && isMirrorCommand(request.command)) {
      request.dryRun = false;
      continue;
    }
    if (
      (flag === "--text" || flag === "--file" || flag === "--top") &&
      args.length > 0
    ) {
      const value = args.shift() as string;
      if (flag === "--text") request.text = value;
      if (flag === "--file") request.file = value;
      if (flag === "--top") {
        const topN = Number.parseInt(value, 10);
        if (!Number.isInteger(topN) || topN < 0) {
          throw new UsageError(`--top needs an integer of 0 or more, got "${value}"`);
        }
        request.topN = topN;
      }
      continue;
    }
    if ((flag === "--sheet" || flag === "--range") && args.length > 0) {
      const value = args.shift() as string;
      if (flag === "--sheet") request.sheet = value;
      if (flag === "--range") request.range = value;
      continue;
    }
    throw new UsageError(`unknown flag "${flag}" for "${request.command}"`);
  }
  if (
    (request.command === "summary" ||
      request.command === "dispatch" ||
      request.command === "push") &&
    request.text === undefined &&
    request.file === undefined
  ) {
    throw new UsageError(`${request.command} needs --text or --file`);
  }
  if (
    isMirrorCommand(request.command) &&
    (request.sheet === undefined || request.range === undefined)
  ) {
    throw new UsageError(`${request.command} needs --sheet and --range`);
  }
  return request;
}

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  readFile(path: string): string;
  router: RouterAdapter;
  sheets: SheetsPort;
}

function defaultIo(): CliIo {
  return {
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    readFile: (path) => readFileSync(path, "utf8"),
    router: new LocalRouterAdapter(),
    sheets: resolveSheetsAdapter(),
  };
}

function helpText(): string {
  const command = DEFAULT_BRAND.command;
  return [
    `${DEFAULT_BRAND.name} ${VERSION}`,
    `${DEFAULT_BRAND.description}`,
    "",
    `Usage: ${command} <command> [flags]`,
    "",
    "Commands:",
    "  summary --text <t> [--file <p>] [--top <n>]  Print text stats as JSON.",
    "  dispatch --text <t> [--file <p>] [--dry-run] Route one text, print the receipt.",
    "  pull --sheet <id> --range <r> [--live]      Pull a range into a store as JSON.",
    "  push --sheet <id> --range <r> --text <j>    Push a store. Dry run unless --live.",
    "    [--file <p>] [--live]",
    "  costs                                      Print the cost report as JSON.",
    "  mcp                                        Start the MCP server on stdio.",
    "",
    "Flags:",
    "  --help, -h       Print this help.",
    "  --version, -V    Print the version.",
    "",
    "Mirror auth: set GOOGLE_SHEETS_TOKEN for reads and writes, or",
    "GOOGLE_SHEETS_API_KEY to read public sheets. With neither set,",
    "pull and push run against process memory.",
  ].join("\n");
}

function readInput(request: CliRequest, io: CliIo): string {
  if (request.file !== undefined) {
    return io.readFile(request.file);
  }
  return request.text ?? "";
}

function readStore(request: CliRequest, io: CliIo): Store {
  try {
    return parseStore(readInput(request, io));
  } catch (error) {
    throw new UsageError(
      `bad store JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function runCli(argv: string[], io: CliIo = defaultIo()): Promise<number> {
  let request: CliRequest;
  try {
    request = parseArgs(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    io.err(`Run "${DEFAULT_BRAND.command} --help" for usage.`);
    return 2;
  }
  try {
    switch (request.command) {
      case "help":
        io.out(helpText());
        return 0;
      case "version":
        io.out(VERSION);
        return 0;
      case "summary": {
        const summary = summarizeText(readInput(request, io), { topN: request.topN });
        io.out(JSON.stringify(summary));
        return 0;
      }
      case "dispatch": {
        const result = await dispatchText(readInput(request, io), {
          adapter: io.router,
          dryRun: request.dryRun,
        });
        io.out(JSON.stringify(result));
        return 0;
      }
      case "pull": {
        const result = await pullStore({
          adapter: io.sheets,
          spreadsheetId: request.sheet as string,
          range: request.range as string,
          dryRun: request.dryRun,
        });
        io.out(JSON.stringify(result));
        return 0;
      }
      case "push": {
        const result = await pushStore(readStore(request, io), {
          adapter: io.sheets,
          spreadsheetId: request.sheet as string,
          range: request.range as string,
          dryRun: request.dryRun,
        });
        io.out(JSON.stringify(result));
        return 0;
      }
      case "costs":
        io.out(JSON.stringify(getCostReport()));
        return 0;
      case "mcp": {
        const { startMcp } = await import("./mcp.js");
        await startMcp();
        return 0;
      }
    }
  } catch (error) {
    if (error instanceof GuardError || error instanceof VendorError || error instanceof UsageError) {
      io.err(`${error.name}: ${error.message}`);
      return 1;
    }
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      io.err(`file not found: ${request.file ?? ""}`);
      return 1;
    }
    throw error;
  }
}

function isMainModule(): boolean {
  const invoked = process.argv[1];
  if (typeof invoked !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(invoked)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      // Exit nonzero at once. On zero, fall off the end so a running
      // server (mcp) keeps its stdio handles open. Plain commands
      // hold no handles and exit 0 on their own.
      if (code !== 0) process.exit(code);
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
