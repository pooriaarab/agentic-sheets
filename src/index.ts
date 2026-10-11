export { VERSION } from "./version.js";
export {
  defineBrand,
  createLogger,
  GuardError,
  VendorError,
  createGuards,
  LocalRouterAdapter,
  HttpRouterAdapter,
  recordCost,
  getCostReport,
  resetCosts,
  createDryRunResult,
  dispatchText,
  summarizeText,
} from "./core.js";
export type {
  BrandConfig,
  LogLevel,
  Logger,
  LoggerOptions,
  CapsConfig,
  QuietHoursConfig,
  GuardsConfig,
  Guards,
  DispatchReceipt,
  RouterAdapter,
  HttpRouterOptions,
  CostEntry,
  CostReport,
  DispatchOptions,
  DispatchResult,
  TopWord,
  TextSummary,
  SummarizeOptions,
} from "./core.js";
export {
  createStore,
  serializeStore,
  parseStore,
  countCells,
  LocalSheetsAdapter,
  GoogleSheetsAdapter,
  resolveSheetsAdapter,
  pullStore,
  pushStore,
} from "./sheets.js";
export type {
  SheetValues,
  Store,
  SheetsWriteResult,
  SheetsPort,
  GoogleSheetsOptions,
  PullOptions,
  PullResult,
  PushOptions,
  PushResult,
} from "./sheets.js";

import { defineBrand, type BrandConfig } from "./core.js";
import { VERSION } from "./version.js";

export const DEFAULT_BRAND: BrandConfig = defineBrand({
  name: "Agentic sheets",
  command: "agentic-sheets",
  description: "Mirror a local store to and from Google Sheets.",
  keywords: [
    "google-sheets",
    "sync",
    "agentic-suite",
    "claude-code",
    "codex",
    "cli",
    "mcp",
  ],
  version: VERSION,
});
