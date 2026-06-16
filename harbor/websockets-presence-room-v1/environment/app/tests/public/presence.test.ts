import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

let server: RunningServer | undefined;
const sockets: WebSocket[] = [];

function wsUrl(base: string, room: string, user: string): string {
  return `${base.replace("http", "ws")}/ws?room=${encodeURIComponent(room)}&user=${encodeURIComponent(user)}`;
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

describe("presence room (public)", () => {
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

  test("joining socket receives its own presence with itself listed", async () => {
    if (!server) throw new Error("server did not start");
    const room = `pub-${Math.random().toString(36).slice(2)}`;
    const a = await connect(wsUrl(server.baseUrl, room, "alice"));
    const presence = await a.next((m) => m.type === "presence");
    expect(presence.room).toBe(room);
    expect(presence.users).toEqual(["alice"]);
    await closed(a.ws);
  });

  test("GET /rooms/:room reflects a connected member", async () => {
    if (!server) throw new Error("server did not start");
    const room = `pub-${Math.random().toString(36).slice(2)}`;
    const a = await connect(wsUrl(server.baseUrl, room, "bob"));
    await a.next((m) => m.type === "presence");
    const snap = await (await fetch(`${server.baseUrl}/rooms/${room}`)).json();
    expect(snap.room).toBe(room);
    expect(snap.users).toEqual(["bob"]);
    await closed(a.ws);
  });

  test("GET /rooms/:room on an unknown room returns empty users", async () => {
    if (!server) throw new Error("server did not start");
    const res = await fetch(`${server.baseUrl}/rooms/nobody-${Math.random()}`);
    expect(res.status).toBe(200);
    expect((await res.json()).users).toEqual([]);
  });
});
