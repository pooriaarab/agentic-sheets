import { describe, expect, test } from "vitest";
import worker from "./worker.js";

function post(path: string, body: unknown): Request {
  return new Request(`https://pack.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("worker", () => {
  test("GET /health reports ok", async () => {
    const response = await worker.fetch(new Request("https://pack.test/health"), {
      PACK_NAME: "probe",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, pack: "probe" });
  });

  test("POST /summarize returns stats", async () => {
    const response = await worker.fetch(post("/summarize", { text: "one two two" }), {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ words: 3 });
  });

  test("POST /summarize rejects a bad body", async () => {
    const response = await worker.fetch(post("/summarize", { text: 42 }), {});
    expect(response.status).toBe(400);
  });

  test("POST /pull previews a dry run plan", async () => {
    const response = await worker.fetch(
      post("/pull", { spreadsheetId: "s", range: "R" }),
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dryRun: true,
      adapter: "local",
      store: { values: [], range: "R" },
    });
  });

  test("POST /push previews row and cell counts", async () => {
    const response = await worker.fetch(
      post("/push", {
        spreadsheetId: "s",
        range: "R",
        values: [
          ["a", "b"],
          ["c"],
        ],
      }),
      {},
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dryRun: true,
      rows: 2,
      cells: 3,
    });
  });

  test("live mirror routes refuse a missing token", async () => {
    const pulled = await worker.fetch(
      post("/pull", { spreadsheetId: "s", range: "R", dryRun: false }),
      {},
    );
    expect(pulled.status).toBe(400);
    expect(await pulled.json()).toMatchObject({ error: expect.stringContaining("token") });
    const pushed = await worker.fetch(
      post("/push", { spreadsheetId: "s", range: "R", values: [["a"]], dryRun: false }),
      {},
    );
    expect(pushed.status).toBe(400);
  });

  test("mirror routes reject bad bodies", async () => {
    const missing = await worker.fetch(post("/pull", { range: "R" }), {});
    expect(missing.status).toBe(400);
    const badValues = await worker.fetch(
      post("/push", { spreadsheetId: "s", range: "R", values: "nope" }),
      {},
    );
    expect(badValues.status).toBe(400);
    const badFlag = await worker.fetch(
      post("/pull", { spreadsheetId: "s", range: "R", dryRun: "soon" }),
      {},
    );
    expect(badFlag.status).toBe(400);
  });

  test("unknown routes return 404", async () => {
    const response = await worker.fetch(new Request("https://pack.test/nowhere"), {});
    expect(response.status).toBe(404);
  });
});
