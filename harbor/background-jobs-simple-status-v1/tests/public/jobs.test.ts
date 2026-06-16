import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("jobs API", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("creates a completed job", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/jobs`, { method: "POST" });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ id: "job_1", status: "completed" });
  });
});
