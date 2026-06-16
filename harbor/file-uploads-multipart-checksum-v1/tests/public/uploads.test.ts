import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { startTaskServer, type RunningServer } from "../helpers/server";

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("multipart upload with checksum", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("uploads a small text file and returns the correct sha256", async () => {
    if (!server) throw new Error("server did not start");
    const content = "hello bun-bench\n";
    const bytes = new TextEncoder().encode(content);
    const expected = sha256Hex(bytes);

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "text/plain" }), "note.txt");

    const response = await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form });
    expect(response.status).toBe(201);
    const out = await response.json();
    expect(out.filename).toBe("note.txt");
    expect(out.size).toBe(bytes.byteLength);
    expect(out.sha256).toBe(expected);
    expect(out.content_type).toBe("text/plain");
    expect(typeof out.id).toBe("string");
  });

  test("checksum endpoint returns the stored digest", async () => {
    if (!server) throw new Error("server did not start");
    const bytes = new TextEncoder().encode("integrity check");
    const expected = sha256Hex(bytes);

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "text/plain" }), "x.txt");
    const created = await (await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form })).json();

    const response = await fetch(`${server.baseUrl}/uploads/${created.id}/checksum`);
    expect(response.status).toBe(200);
    expect((await response.json()).sha256).toBe(expected);
  });

  test("missing file field is rejected with 400", async () => {
    if (!server) throw new Error("server did not start");
    const form = new FormData();
    form.append("notfile", "just a field");
    const response = await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("missing_file");
  });
});
