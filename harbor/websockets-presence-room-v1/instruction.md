# Room Presence over WebSocket

Build a Bun service that tracks live "presence" of users in named rooms over
WebSocket, relays chat between members of the same room, and keeps an accurate
roster as users connect and disconnect.

## Requirements

- Listen on the port provided by `PORT`.
- Use Bun's native WebSocket server: `Bun.serve({ websocket, fetch })`.
- State is in memory; no database or persistence is required.

### WebSocket endpoint

Clients connect at `ws://<host>/ws?room=<room>&user=<user>`.

- `room` and `user` are required query parameters. If either is missing, do not
  upgrade the connection (respond to the HTTP request with status `400`).
- A "room" is identified by the exact `room` string. Rooms are fully isolated:
  no message or presence information may ever cross from one room to another.

#### On join (connection open)

- Send to the joining socket exactly one message:
  `{ "type": "presence", "room": <room>, "users": [<sorted usernames currently in the room>] }`.
  The `users` array MUST include the joining user and MUST be sorted in
  ascending (lexicographic) order.
- Broadcast the updated presence message
  `{ "type": "presence", "room": <room>, "users": [<sorted usernames>] }` to
  every OTHER socket currently in the same room.

#### Incoming chat message

- A client may send `{ "type": "chat", "text": <string> }`.
- Broadcast `{ "type": "chat", "user": <sender's user>, "text": <text> }` to all
  OTHER sockets in the same room. The sender does NOT receive its own chat
  message. Sockets in other rooms never receive it.
- Ignore malformed messages (non-JSON, or missing/invalid `type`/`text`).

#### On disconnect (connection close)

- Remove the user from the room.
- Broadcast the updated presence message
  `{ "type": "presence", "room": <room>, "users": [<sorted remaining usernames>] }`
  to every remaining socket in the same room. The departed user MUST NOT appear
  in the roster after disconnect.

### HTTP endpoints

`GET /rooms/:room` — current roster snapshot for a room.

- Response `200` with `{ "room": <room>, "users": [<sorted current usernames>] }`.
- If the room has no current members, return `{ "room": <room>, "users": [] }`.

`GET /healthz` — health check.

- Response `200` with `{ "ok": true }`.

## Notes

- The roster returned by `GET /rooms/:room` and the `users` array in every
  presence message MUST always reflect the set of currently-connected users,
  sorted ascending. When a socket disconnects, its user must be gone from both
  immediately — no stale or leaked entries.
- Multiple rooms operate independently and concurrently.

## Summary

Build a WebSocket presence service with per-room rosters, chat relay, and disconnect cleanup.

## Constraints

- The service must listen on the port provided by PORT.
- Use Bun's native WebSocket server via Bun.serve.
- Presence rosters must always list currently-connected users sorted ascending.
- Rooms must be fully isolated from one another.

## Allowed assumptions

- The process starts from the task root.
- State may be kept in memory; no persistence is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not echo a chat message back to its own sender.
