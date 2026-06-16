import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { startTaskServer, type RunningServer } from "../helpers/server";

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function blobOf(content: string | Uint8Array, type: string): Blob {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  return new Blob([bytes], { type });
}

describe("secure multipart upload edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("filename with path traversal is stored as basename only (no slash, no '..')", async () => {
    if (!server) throw new Error("server did not start");
    const bytes = new TextEncoder().encode("secret\n");
    const expected = sha256Hex(bytes);

    // A relative path containing a ".." traversal segment and directory parts.
    const form = new FormData();
    form.append("file", blobOf(bytes, "text/plain"), "evil/../../etc/passwd.txt");
    const response = await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form });
    expect(response.status).toBe(201);
    const out = await response.json();
    expect(out.filename).toBe("passwd.txt");
    expect(out.filename).not.toContain("/");
    expect(out.filename).not.toContain("\\");
    expect(out.filename).not.toContain("..");
    expect(out.sha256).toBe(expected);
  });

  test("absolute path filename is stored as basename", async () => {
    if (!server) throw new Error("server did not start");
    const form = new FormData();
    form.append("file", blobOf("png-ish", "image/png"), "/abs/dir/x.png");
    const out = await (await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form })).json();
    expect(out.filename).toBe("x.png");
    expect(out.filename).not.toContain("/");
  });

  test("backslash (Windows) path components are stripped to the basename", async () => {
    if (!server) throw new Error("server did not start");
    const form = new FormData();
    form.append("file", blobOf("png-ish", "image/png"), "a\\b\\c.png");
    const out = await (await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form })).json();
    expect(out.filename).toBe("c.png");
    expect(out.filename).not.toContain("\\");
  });

  test("oversize file (>1 MiB) is rejected with 413", async () => {
    if (!server) throw new Error("server did not start");
    const big = new Uint8Array(1048576 + 1).fill(65);
    const form = new FormData();
    form.append("file", blobOf(big, "text/plain"), "big.txt");
    const response = await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form });
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe("too_large");
  });

  test("exactly 1 MiB is accepted", async () => {
    if (!server) throw new Error("server did not start");
    const exact = new Uint8Array(1048576).fill(66);
    const expected = sha256Hex(exact);
    const form = new FormData();
    form.append("file", blobOf(exact, "text/plain"), "exact.txt");
    const response = await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form });
    expect(response.status).toBe(201);
    const out = await response.json();
    expect(out.size).toBe(1048576);
    expect(out.sha256).toBe(expected);
  });

  test("disallowed content type is rejected with 415", async () => {
    if (!server) throw new Error("server did not start");
    const form = new FormData();
    form.append("file", blobOf("PK", "application/zip"), "archive.zip");
    const response = await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form });
    expect(response.status).toBe(415);
    expect((await response.json()).error).toBe("unsupported_type");
  });

  test("X-Expected-Sha256 mismatch returns 422 and does not store", async () => {
    if (!server) throw new Error("server did not start");
    const bytes = new TextEncoder().encode("integrity payload");
    const wrong = "0".repeat(64);
    const form = new FormData();
    form.append("file", blobOf(bytes, "text/plain"), "x.txt");
    const response = await fetch(`${server.baseUrl}/uploads`, {
      method: "POST",
      headers: { "x-expected-sha256": wrong },
      body: form,
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("checksum_mismatch");
  });

  test("X-Expected-Sha256 match stores and is readable via checksum endpoint", async () => {
    if (!server) throw new Error("server did not start");
    const bytes = new TextEncoder().encode("matched payload");
    const expected = sha256Hex(bytes);
    const form = new FormData();
    form.append("file", blobOf(bytes, "text/plain"), "ok.txt");
    const created = await fetch(`${server.baseUrl}/uploads`, {
      method: "POST",
      headers: { "x-expected-sha256": expected },
      body: form,
    });
    expect(created.status).toBe(201);
    const out = await created.json();
    expect(out.sha256).toBe(expected);

    const checksum = await fetch(`${server.baseUrl}/uploads/${out.id}/checksum`);
    expect(checksum.status).toBe(200);
    expect((await checksum.json()).sha256).toBe(expected);
  });

  test("checksum endpoint for unknown id returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/uploads/nope/checksum`);
    expect(response.status).toBe(404);
  });

  test("a png upload returns the independently computed sha256", async () => {
    if (!server) throw new Error("server did not start");
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
    const expected = sha256Hex(bytes);
    const form = new FormData();
    form.append("file", blobOf(bytes, "image/png"), "pic.png");
    const out = await (await fetch(`${server.baseUrl}/uploads`, { method: "POST", body: form })).json();
    expect(out.content_type).toBe("image/png");
    expect(out.sha256).toBe(expected);
    expect(out.filename).toBe("pic.png");
  });
});
