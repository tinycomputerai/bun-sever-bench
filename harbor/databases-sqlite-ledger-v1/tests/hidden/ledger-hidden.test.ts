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
  return response.json();
}

async function getBalance(baseUrl: string, id: number): Promise<number> {
  const response = await fetch(`${baseUrl}/accounts/${id}`);
  return (await response.json()).balance;
}

function transfer(baseUrl: string, from: number, to: number, amount: number) {
  return fetch(`${baseUrl}/transfers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from, to, amount }),
  });
}

describe("ledger invariants", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("insufficient-funds transfer leaves both balances unchanged (atomicity)", async () => {
    if (!server) throw new Error("server did not start");
    const from = await createAccount(server.baseUrl, "poor", 30);
    const to = await createAccount(server.baseUrl, "rich", 1000);

    const response = await transfer(server.baseUrl, from.id, to.id, 50);
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe("insufficient_funds");

    expect(await getBalance(server.baseUrl, from.id)).toBe(30);
    expect(await getBalance(server.baseUrl, to.id)).toBe(1000);
  });

  test("total balance is conserved across several transfers", async () => {
    if (!server) throw new Error("server did not start");
    const a = await createAccount(server.baseUrl, "a", 300);
    const b = await createAccount(server.baseUrl, "b", 200);
    const c = await createAccount(server.baseUrl, "c", 0);
    const total = 500;

    expect((await transfer(server.baseUrl, a.id, b.id, 120)).status).toBe(200);
    expect((await transfer(server.baseUrl, b.id, c.id, 250)).status).toBe(200);
    expect((await transfer(server.baseUrl, c.id, a.id, 50)).status).toBe(200);

    const balA = await getBalance(server.baseUrl, a.id);
    const balB = await getBalance(server.baseUrl, b.id);
    const balC = await getBalance(server.baseUrl, c.id);
    expect(balA + balB + balC).toBe(total);
    expect(balA).toBeGreaterThanOrEqual(0);
    expect(balB).toBeGreaterThanOrEqual(0);
    expect(balC).toBeGreaterThanOrEqual(0);
  });

  test("concurrent transfers from the same account never overdraw it", async () => {
    if (!server) throw new Error("server did not start");
    // Source holds 100; two simultaneous 70-transfers (total 140 > 100) are fired.
    // At most one may succeed; the balance must never go negative.
    const src = await createAccount(server.baseUrl, "src", 100);
    const d1 = await createAccount(server.baseUrl, "d1", 0);
    const d2 = await createAccount(server.baseUrl, "d2", 0);

    const [r1, r2] = await Promise.all([
      transfer(server.baseUrl, src.id, d1.id, 70),
      transfer(server.baseUrl, src.id, d2.id, 70),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // Either exactly one succeeds (200 + 422) or — if serialized such that the
    // second sees the debited balance — both could fail; both succeeding is
    // forbidden because it would overdraw the account.
    expect(statuses).not.toEqual([200, 200]);
    expect(statuses[0]).toBe(200);

    const srcBal = await getBalance(server.baseUrl, src.id);
    const d1Bal = await getBalance(server.baseUrl, d1.id);
    const d2Bal = await getBalance(server.baseUrl, d2.id);

    expect(srcBal).toBeGreaterThanOrEqual(0);
    // Conservation across the three accounts.
    expect(srcBal + d1Bal + d2Bal).toBe(100);
    // Exactly one destination received money.
    expect([d1Bal, d2Bal].sort()).toEqual([0, 70]);
    expect(srcBal).toBe(30);
  });

  test("same-account transfer is rejected and amount must be a positive integer", async () => {
    if (!server) throw new Error("server did not start");
    const acct = await createAccount(server.baseUrl, "self", 100);

    const same = await transfer(server.baseUrl, acct.id, acct.id, 10);
    expect(same.status).toBe(400);
    expect((await same.json()).error).toBe("same_account");

    const other = await createAccount(server.baseUrl, "other", 0);
    expect((await transfer(server.baseUrl, acct.id, other.id, 0)).status).toBe(422);
    expect((await transfer(server.baseUrl, acct.id, other.id, -5)).status).toBe(422);

    const notInt = await fetch(`${server.baseUrl}/transfers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: acct.id, to: other.id, amount: 2.5 }),
    });
    expect(notInt.status).toBe(422);
  });

  test("transfer to or from an unknown account returns 404 account_not_found", async () => {
    if (!server) throw new Error("server did not start");
    const acct = await createAccount(server.baseUrl, "known", 100);

    const missingTo = await transfer(server.baseUrl, acct.id, 999999, 10);
    expect(missingTo.status).toBe(404);
    expect((await missingTo.json()).error).toBe("account_not_found");

    const missingFrom = await transfer(server.baseUrl, 999999, acct.id, 10);
    expect(missingFrom.status).toBe(404);

    // The known account must be untouched by the failed transfers.
    expect(await getBalance(server.baseUrl, acct.id)).toBe(100);
  });

  test("negative or non-integer initial_balance is rejected", async () => {
    if (!server) throw new Error("server did not start");
    const negative = await fetch(`${server.baseUrl}/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x", initial_balance: -1 }),
    });
    expect(negative.status).toBe(422);

    const fractional = await fetch(`${server.baseUrl}/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "x", initial_balance: 1.5 }),
    });
    expect(fractional.status).toBe(422);
  });

  test("balances persist across a process restart", async () => {
    if (!server) throw new Error("server did not start");
    const from = await createAccount(server.baseUrl, "persist-src", 200);
    const to = await createAccount(server.baseUrl, "persist-dst", 0);
    expect((await transfer(server.baseUrl, from.id, to.id, 75)).status).toBe(200);

    await server.stop();
    server = await startTaskServer();

    expect(await getBalance(server.baseUrl, from.id)).toBe(125);
    expect(await getBalance(server.baseUrl, to.id)).toBe(75);
  });
});
