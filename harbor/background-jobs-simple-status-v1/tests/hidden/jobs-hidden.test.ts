import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("job status edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("looks up an existing job by id", async () => {
    if (!server) throw new Error("server did not start");

    const created = await fetch(`${server.baseUrl}/jobs`, { method: "POST" });
    const job = await created.json();
    const fetched = await fetch(`${server.baseUrl}/jobs/${job.id}`);

    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toEqual(job);
  });

  test("returns 404 for missing jobs", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/jobs/job_missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
