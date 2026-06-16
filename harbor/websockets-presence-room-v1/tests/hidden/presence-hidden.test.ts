import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

let server: RunningServer | undefined;
const sockets: WebSocket[] = [];

function wsUrl(base: string, room: string, user: string): string {
  return `${base.replace("http", "ws")}/ws?room=${encodeURIComponent(room)}&user=${encodeURIComponent(user)}`;
}

// A recorder buffers every message from the moment the socket opens, so no
// message is ever dropped between awaits. `next` consumes from the buffer (or
// waits with a timeout); `snapshot` returns currently-buffered messages.
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

function rid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

describe("presence room (hidden)", () => {
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

  test("second join causes the first member to receive presence listing both users", async () => {
    if (!server) throw new Error("server did not start");
    const room = rid("both");
    const a = await connect(wsUrl(server.baseUrl, room, "alice"));
    await a.next((m) => m.type === "presence");

    const b = await connect(wsUrl(server.baseUrl, room, "bob"));
    const updated = await a.next((m) => m.type === "presence" && m.users.length === 2);
    expect(updated.room).toBe(room);
    expect(updated.users).toEqual(["alice", "bob"]);

    const snap = await (await fetch(`${server.baseUrl}/rooms/${room}`)).json();
    expect(snap.users).toEqual(["alice", "bob"]);

    await closed(a.ws);
    await closed(b.ws);
  });

  test("chat reaches the other member of the same room but never the sender or a different room", async () => {
    if (!server) throw new Error("server did not start");
    const roomX = rid("roomx");
    const roomY = rid("roomy");

    const a = await connect(wsUrl(server.baseUrl, roomX, "alice"));
    await a.next((m) => m.type === "presence");
    const b = await connect(wsUrl(server.baseUrl, roomX, "bob"));
    await b.next((m) => m.type === "presence");
    const c = await connect(wsUrl(server.baseUrl, roomY, "carol"));
    await c.next((m) => m.type === "presence");

    a.ws.send(JSON.stringify({ type: "chat", text: "hello room x" }));

    const received = await b.next((m) => m.type === "chat");
    expect(received).toEqual({ type: "chat", user: "alice", text: "hello room x" });

    // Give any erroneous fan-out time to arrive, then assert it did not.
    await a.settle(600);
    expect(a.snapshot().find((m) => m.type === "chat")).toBeUndefined();
    expect(c.snapshot().find((m) => m.type === "chat")).toBeUndefined();

    await closed(a.ws);
    await closed(b.ws);
    await closed(c.ws);
  });

  test("disconnect removes the user from presence and from GET /rooms/:room (no leak)", async () => {
    if (!server) throw new Error("server did not start");
    const room = rid("leave");
    const a = await connect(wsUrl(server.baseUrl, room, "alice"));
    await a.next((m) => m.type === "presence");
    const b = await connect(wsUrl(server.baseUrl, room, "bob"));
    await a.next((m) => m.type === "presence" && m.users.length === 2);

    await closed(b.ws);
    const after = await a.next(
      (m) => m.type === "presence" && m.users.length === 1 && m.users[0] === "alice",
    );
    expect(after.users).toEqual(["alice"]);

    const snap = await (await fetch(`${server.baseUrl}/rooms/${room}`)).json();
    expect(snap.users).toEqual(["alice"]);

    await closed(a.ws);

    // Allow the close to propagate, then the room should be empty.
    await new Promise((r) => setTimeout(r, 200));
    const empty = await (await fetch(`${server.baseUrl}/rooms/${room}`)).json();
    expect(empty.users).toEqual([]);
  });

  test("rooms are isolated: presence never crosses rooms", async () => {
    if (!server) throw new Error("server did not start");
    const roomA = rid("isoa");
    const roomB = rid("isob");

    const a = await connect(wsUrl(server.baseUrl, roomA, "alice"));
    await a.next((m) => m.type === "presence");

    const b = await connect(wsUrl(server.baseUrl, roomB, "bob"));
    await b.next((m) => m.type === "presence");

    // alice must not have received any presence mentioning bob.
    await a.settle(600);
    const sawBob = a.snapshot().some((m) => m.type === "presence" && m.users.includes("bob"));
    expect(sawBob).toBe(false);

    const snapA = await (await fetch(`${server.baseUrl}/rooms/${roomA}`)).json();
    expect(snapA.users).toEqual(["alice"]);

    await closed(a.ws);
    await closed(b.ws);
  });

  test("connecting without room or user does not upgrade (400)", async () => {
    if (!server) throw new Error("server did not start");
    const res = await fetch(`${server.baseUrl}/ws`);
    expect(res.status).toBe(400);
  });
});
