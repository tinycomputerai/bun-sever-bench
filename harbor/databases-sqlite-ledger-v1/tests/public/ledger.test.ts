import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function createAccount(baseUrl: string, name: string, initial_balance?: number) {
  const body: Record<string, unknown> = { name };
  if (initial_balance !== undefined) body.initial_balance = initial_balance;
  const response = await fetch(`${baseUrl}/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, account: await response.json() };
}

describe("money ledger", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("creates an account at balance 0", async () => {
    if (!server) throw new Error("server did not start");
    const { response, account } = await createAccount(server.baseUrl, "alice");
    expect(response.status).toBe(201);
    expect(account.name).toBe("alice");
    expect(account.balance).toBe(0);
    expect(typeof account.id).toBe("number");
  });

  test("creates a funded account and reads it back", async () => {
    if (!server) throw new Error("server did not start");
    const { account } = await createAccount(server.baseUrl, "bank", 500);
    const read = await fetch(`${server.baseUrl}/accounts/${account.id}`);
    expect(read.status).toBe(200);
    const fetched = await read.json();
    expect(fetched.balance).toBe(500);
    expect(fetched.name).toBe("bank");
  });

  test("a transfer moves money between accounts", async () => {
    if (!server) throw new Error("server did not start");
    const { account: from } = await createAccount(server.baseUrl, "src", 100);
    const { account: to } = await createAccount(server.baseUrl, "dst", 0);

    const transfer = await fetch(`${server.baseUrl}/transfers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: from.id, to: to.id, amount: 40 }),
    });
    expect(transfer.status).toBe(200);
    const result = await transfer.json();
    expect(result).toEqual({ from: from.id, to: to.id, amount: 40 });

    const fromAfter = await (await fetch(`${server.baseUrl}/accounts/${from.id}`)).json();
    const toAfter = await (await fetch(`${server.baseUrl}/accounts/${to.id}`)).json();
    expect(fromAfter.balance).toBe(60);
    expect(toAfter.balance).toBe(40);
  });

  test("unknown account returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/accounts/0`);
    expect(response.status).toBe(404);
  });
});
