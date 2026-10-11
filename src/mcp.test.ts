import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, test } from "vitest";
import { createMcpServer } from "./mcp.js";
import { LocalSheetsAdapter } from "./sheets.js";

function textOf(result: unknown): string {
  const content = (result as { content: { type: string; text: string }[] }).content;
  return content[0].text;
}

async function linkedClient(server: ReturnType<typeof createMcpServer>): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "probe", version: "0.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

describe("mcp server", () => {
  test("serves five tools over a client link", async () => {
    const { client, close } = await linkedClient(createMcpServer());
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name).sort();
      expect(names).toEqual([
        "dispatch_text",
        "get_cost_report",
        "pull_store",
        "push_store",
        "summarize_text",
      ]);

      const summary = await client.callTool({
        name: "summarize_text",
        arguments: { text: "a b a" },
      });
      expect(JSON.parse(textOf(summary))).toMatchObject({ words: 3 });

      const preview = await client.callTool({
        name: "dispatch_text",
        arguments: { text: "hi", dryRun: true },
      });
      expect(JSON.parse(textOf(preview))).toMatchObject({ dryRun: true });

      const report = await client.callTool({ name: "get_cost_report", arguments: {} });
      expect(JSON.parse(textOf(report))).toHaveProperty("dispatches");
    } finally {
      await close();
    }
  });

  test("a blocked dispatch returns a tool error, not a crash", async () => {
    const { createGuards } = await import("./core.js");
    const { client, close } = await linkedClient(
      createMcpServer({ guards: createGuards({ blocklist: ["nope"] }) }),
    );
    try {
      const result = await client.callTool({
        name: "dispatch_text",
        arguments: { text: "nope" },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textOf(result)).toContain("blocklisted");
    } finally {
      await close();
    }
  });

  test("pull previews by default when dryRun is left out", async () => {
    const { client, close } = await linkedClient(createMcpServer());
    try {
      const result = await client.callTool({
        name: "pull_store",
        arguments: { spreadsheetId: "s", range: "R" },
      });
      expect(JSON.parse(textOf(result))).toMatchObject({
        dryRun: true,
        store: { values: [] },
      });
    } finally {
      await close();
    }
  });

  test("push and pull round-trip live on one sheets adapter", async () => {
    const sheets = new LocalSheetsAdapter();
    const { client, close } = await linkedClient(createMcpServer({ sheets }));
    try {
      const pushed = await client.callTool({
        name: "push_store",
        arguments: {
          spreadsheetId: "s",
          range: "R",
          values: [["a", "b"]],
          dryRun: false,
        },
      });
      expect(JSON.parse(textOf(pushed))).toMatchObject({
        dryRun: false,
        cells: 2,
      });
      const pulled = await client.callTool({
        name: "pull_store",
        arguments: { spreadsheetId: "s", range: "R", dryRun: false },
      });
      expect(JSON.parse(textOf(pulled)).store.values).toEqual([["a", "b"]]);
    } finally {
      await close();
    }
  });

  test("a bad range returns a tool error, not a crash", async () => {
    const { client, close } = await linkedClient(createMcpServer());
    try {
      const result = await client.callTool({
        name: "pull_store",
        arguments: { spreadsheetId: "", range: "R", dryRun: false },
      });
      expect((result as { isError?: boolean }).isError).toBe(true);
      expect(textOf(result)).toContain("spreadsheet id");
    } finally {
      await close();
    }
  });
});
