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

async function version(baseUrl: string) {
  const response = await fetch(`${baseUrl}/schema/version`);
  return { status: response.status, body: await response.json() };
}

describe("idempotent migrations", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("version is exactly 3 and applied list is correct after boot", async () => {
    if (!server) throw new Error("server did not start");
    const { status, body } = await version(server.baseUrl);
    expect(status).toBe(200);
    expect(body.version).toBe(3);
    expect(Array.isArray(body.applied)).toBe(true);
    expect(body.applied).toEqual([
      "create_users",
      "add_users_email",
      "index_users_email",
    ]);
  });

  test("creating a user with an email succeeds (proves migration 2 ran)", async () => {
    if (!server) throw new Error("server did not start");
    const { response, user } = await createUser(server.baseUrl, "bob", "bob@example.com");
    expect(response.status).toBe(201);
    expect(user.email).toBe("bob@example.com");

    const read = await (await fetch(`${server.baseUrl}/users/${user.id}`)).json();
    expect(read.email).toBe("bob@example.com");
  });

  test("invalid bodies are rejected with 422", async () => {
    if (!server) throw new Error("server did not start");
    const missingEmail = await fetch(`${server.baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "no-email" }),
    });
    expect(missingEmail.status).toBe(422);

    const missingName = await fetch(`${server.baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@example.com" }),
    });
    expect(missingName.status).toBe(422);

    const nonString = await fetch(`${server.baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: 5, email: 6 }),
    });
    expect(nonString.status).toBe(422);
  });

  test("after a restart the server still starts, version is still 3, and migrations are not re-applied", async () => {
    if (!server) throw new Error("server did not start");
    // Create a user before the restart so we can prove data persistence too.
    const { user } = await createUser(server.baseUrl, "carol", "carol@example.com");

    await server.stop();
    // A naive unconditional `ALTER TABLE users ADD COLUMN email` would throw
    // "duplicate column name" on this second boot and the server would never
    // become reachable, making startTaskServer reject.
    server = await startTaskServer();

    const { status, body } = await version(server.baseUrl);
    expect(status).toBe(200);
    expect(body.version).toBe(3);
    expect(body.applied).toEqual([
      "create_users",
      "add_users_email",
      "index_users_email",
    ]);

    // Users created before the restart are still readable afterward.
    const read = await fetch(`${server.baseUrl}/users/${user.id}`);
    expect(read.status).toBe(200);
    const persisted = await read.json();
    expect(persisted.name).toBe("carol");
    expect(persisted.email).toBe("carol@example.com");
  });

  test("a second restart still does not re-apply migrations", async () => {
    if (!server) throw new Error("server did not start");
    const { user } = await createUser(server.baseUrl, "dave", "dave@example.com");

    await server.stop();
    server = await startTaskServer();
    await server.stop();
    server = await startTaskServer();

    const { body } = await version(server.baseUrl);
    expect(body.version).toBe(3);

    const read = await fetch(`${server.baseUrl}/users/${user.id}`);
    expect(read.status).toBe(200);
    expect((await read.json()).email).toBe("dave@example.com");
  });
});
