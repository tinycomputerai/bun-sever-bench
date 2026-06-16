import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

let server: RunningServer | undefined;
const sockets: WebSocket[] = [];

function wsUrl(base: string, channel: string, lastSeq?: number): string {
  const q = lastSeq === undefined ? "" : `&last_seq=${lastSeq}`;
  return `${base.replace("http", "ws")}/ws?channel=${encodeURIComponent(channel)}${q}`;
}

type Recorder = {
  ws: WebSocket;
  next: (predicate: (m: any) => boolean, ms?: number) => Promise<any>;
  settle: (ms?: number) => Promise<void>;
  snapshot: () => any[];
};

function connect(url: string): Promise<Recorder> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    sockets.push(ws);
    const buffer: any[] = [];
    let waiter: { predicate: (m: any) => boolean; resolve: (m: any) => void } | null = null;

    ws.addEventListener("message", (event: MessageEvent) => {
      let parsed: any;
      try {
        parsed = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      } catch {
        return;
      }
      if (waiter && waiter.predicate(parsed)) {
        const w = waiter;
        waiter = null;
        w.resolve(parsed);
        return;
      }
      buffer.push(parsed);
    });

    const openTimer = setTimeout(() => reject(new Error("ws open timeout")), 4000);
    ws.addEventListener("open", () => {
      clearTimeout(openTimer);
      resolve({
        ws,
        next(predicate, ms = 4000) {
          const idx = buffer.findIndex(predicate);
          if (idx >= 0) {
            const [found] = buffer.splice(idx, 1);
            return Promise.resolve(found);
          }
          return new Promise((res, rej) => {
            const t = setTimeout(() => {
              waiter = null;
              rej(new Error("next timeout"));
            }, ms);
            waiter = {
              predicate,
              resolve: (m) => {
                clearTimeout(t);
                res(m);
              },
            };
          });
        },
        settle(ms = 600) {
          return new Promise((res) => setTimeout(res, ms));
        },
        snapshot() {
          return buffer.slice();
        },
      });
    });
    ws.addEventListener("error", () => {
      clearTimeout(openTimer);
      reject(new Error("ws error"));
    });
  });
}

function closed(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.addEventListener("close", () => resolve());
    ws.close();
  });
}

async function publish(base: string, channel: string, data: unknown) {
  const res = await fetch(`${base}/publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel, data }),
  });
  return { status: res.status, body: await res.json() };
}

function cid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

// Collect the next N messages in arrival order via repeated `next`.
async function take(sub: Recorder, n: number): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(await sub.next(() => true));
  }
  return out;
}

describe("seqnum resume (hidden)", () => {
  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {}
    }
    await server?.stop();
  });

  test("live delivery: connected at last_seq=0 receives strictly increasing seq from 1", async () => {
    if (!server) throw new Error("server did not start");
    const channel = cid("livestrict");
    const sub = await connect(wsUrl(server.baseUrl, channel, 0));
    for (let i = 0; i < 4; i += 1) await publish(server.baseUrl, channel, { i });
    const got = await take(sub, 4);
    expect(got.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    expect(got.map((m) => m.data.i)).toEqual([0, 1, 2, 3]);
    await closed(sub.ws);
  });

  test("resume: reconnect with last_seq receives EXACTLY the missed messages, in order, no gaps or dupes", async () => {
    if (!server) throw new Error("server did not start");
    const channel = cid("resume");

    // First subscriber receives seq 1 and 2, then disconnects.
    const first = await connect(wsUrl(server.baseUrl, channel, 0));
    await publish(server.baseUrl, channel, { v: 1 });
    await publish(server.baseUrl, channel, { v: 2 });
    const a = await take(first, 2);
    expect(a.map((m) => m.seq)).toEqual([1, 2]);
    const lastReceived = a[a.length - 1].seq;
    await closed(first.ws);

    // Publish more while nobody (with this resume point) is connected.
    await publish(server.baseUrl, channel, { v: 3 });
    await publish(server.baseUrl, channel, { v: 4 });
    await publish(server.baseUrl, channel, { v: 5 });

    // Reconnect resuming from the last received seq.
    const second = await connect(wsUrl(server.baseUrl, channel, lastReceived));
    const replayed = await take(second, 3);
    expect(replayed.map((m) => m.seq)).toEqual([3, 4, 5]);
    expect(replayed.map((m) => m.data.v)).toEqual([3, 4, 5]);

    // No earlier message should be replayed (no duplicate of seq 1 or 2).
    await second.settle(500);
    const seqs = second.snapshot().map((m) => m.seq);
    expect(seqs.includes(1)).toBe(false);
    expect(seqs.includes(2)).toBe(false);

    await closed(second.ws);
  });

  test("last_seq=0 on a channel with an existing buffer replays all of them in order", async () => {
    if (!server) throw new Error("server did not start");
    const channel = cid("fullreplay");
    // Build a buffer with no subscriber connected.
    await publish(server.baseUrl, channel, { v: "x" });
    await publish(server.baseUrl, channel, { v: "y" });
    await publish(server.baseUrl, channel, { v: "z" });

    const sub = await connect(wsUrl(server.baseUrl, channel, 0));
    const got = await take(sub, 3);
    expect(got.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(got.map((m) => m.data.v)).toEqual(["x", "y", "z"]);
    await closed(sub.ws);
  });

  test("last_seq beyond the buffer replays nothing, then delivers live", async () => {
    if (!server) throw new Error("server did not start");
    const channel = cid("beyond");
    await publish(server.baseUrl, channel, { v: 1 });
    await publish(server.baseUrl, channel, { v: 2 });

    const sub = await connect(wsUrl(server.baseUrl, channel, 99));
    // Nothing replayed.
    await sub.settle(400);
    expect(sub.snapshot()).toEqual([]);

    // A new live publish (seq 3) is delivered.
    await publish(server.baseUrl, channel, { v: 3 });
    const live = await sub.next((m) => m.seq === 3);
    expect(live).toEqual({ seq: 3, data: { v: 3 } });
    await closed(sub.ws);
  });

  test("channel isolation: a subscriber to channel A never receives channel B messages", async () => {
    if (!server) throw new Error("server did not start");
    const chA = cid("isoA");
    const chB = cid("isoB");

    const subA = await connect(wsUrl(server.baseUrl, chA, 0));

    // Publish to B; A must not see it. Sequence on B is independent.
    await publish(server.baseUrl, chB, { from: "B" });
    await publish(server.baseUrl, chA, { from: "A" });

    const a1 = await subA.next((m) => true);
    expect(a1).toEqual({ seq: 1, data: { from: "A" } });

    await subA.settle(500);
    const sawB = subA.snapshot().some((m) => m.data && m.data.from === "B");
    expect(sawB).toBe(false);

    await closed(subA.ws);
  });

  test("per-channel sequencing is independent (each channel starts at 1)", async () => {
    if (!server) throw new Error("server did not start");
    const chA = cid("seqA");
    const chB = cid("seqB");
    const a = await publish(server.baseUrl, chA, {});
    const b = await publish(server.baseUrl, chB, {});
    expect(a.body.seq).toBe(1);
    expect(b.body.seq).toBe(1);
  });

  test("connecting without a channel does not upgrade (400)", async () => {
    if (!server) throw new Error("server did not start");
    const res = await fetch(`${server.baseUrl}/ws`);
    expect(res.status).toBe(400);
  });
});
