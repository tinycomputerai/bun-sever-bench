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

describe("seqnum resume (public)", () => {
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

  test("healthz responds 200 {ok:true}", async () => {
    if (!server) throw new Error("server did not start");
    const res = await fetch(`${server.baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("publish assigns seq starting at 1 and returns 201", async () => {
    if (!server) throw new Error("server did not start");
    const channel = cid("pub");
    const first = await publish(server.baseUrl, channel, { n: 1 });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ channel, seq: 1 });
    const second = await publish(server.baseUrl, channel, { n: 2 });
    expect(second.body.seq).toBe(2);
  });

  test("live subscriber receives published messages with increasing seq from 1", async () => {
    if (!server) throw new Error("server did not start");
    const channel = cid("live");
    const sub = await connect(wsUrl(server.baseUrl, channel, 0));
    await publish(server.baseUrl, channel, { v: "a" });
    await publish(server.baseUrl, channel, { v: "b" });

    const m1 = await sub.next((m) => m.seq === 1);
    expect(m1).toEqual({ seq: 1, data: { v: "a" } });
    const m2 = await sub.next((m) => m.seq === 2);
    expect(m2).toEqual({ seq: 2, data: { v: "b" } });

    await closed(sub.ws);
  });
});
