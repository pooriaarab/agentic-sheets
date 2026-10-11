import { describe, expect, test } from "vitest";
import { VERSION as CORE_VERSION, summarizeText as coreSummarize } from "agentic-core";
import { summarizeText } from "./core.js";

describe("published agentic-core", () => {
  test("pins the exact core release this pack builds against", () => {
    expect(CORE_VERSION).toBe("0.1.0");
  });

  test("local core matches the published core on fixed inputs", () => {
    for (const text of ["", "a b a", "Hello\nworld hello"]) {
      expect(summarizeText(text)).toEqual(coreSummarize(text));
    }
  });
});
