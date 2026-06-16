import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function createUser(baseUrl: string, name: string, email: string) {
  const response = await fetch(`${baseUrl}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  return { response, user: await response.json() };
}

describe("schema migrations", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("reports version 3 with the applied migrations in order", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/schema/version`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.version).toBe(3);
    expect(body.applied).toEqual([
      "create_users",
      "add_users_email",
      "index_users_email",
    ]);
  });

  test("creates a user with name and email and reads it back", async () => {
    if (!server) throw new Error("server did not start");
    const { response, user } = await createUser(server.baseUrl, "alice", "alice@example.com");
    expect(response.status).toBe(201);
    expect(user.name).toBe("alice");
    expect(user.email).toBe("alice@example.com");
    expect(typeof user.id).toBe("number");

    const read = await fetch(`${server.baseUrl}/users/${user.id}`);
    expect(read.status).toBe(200);
    const fetched = await read.json();
    expect(fetched).toEqual({ id: user.id, name: "alice", email: "alice@example.com" });
  });

  test("unknown user returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/users/999999`);
    expect(response.status).toBe(404);
  });
});
