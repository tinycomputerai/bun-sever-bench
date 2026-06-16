# Sequenced Messages with Resumable Catch-up

Build a Bun service that accepts published messages over HTTP and delivers them
over WebSocket. Each message is tagged with a server-assigned, monotonically
increasing sequence number scoped to its channel. Subscribers that reconnect
can resume from where they left off and receive exactly the messages they
missed — in order, with no gaps and no duplicates.

## Requirements

- Listen on the port provided by `PORT`.
- Use Bun's native WebSocket server: `Bun.serve({ websocket, fetch })`.
- State is in memory; no database or persistence is required.
- Channels are fully isolated: a subscriber to one channel must never receive
  another channel's messages, and sequence numbers are independent per channel.

### HTTP endpoint

`POST /publish` — publish a message to a channel.

- Request body: `{ "channel": string, "data": <any JSON value> }`.
- Assign the next sequence number for that channel. The first message on a
  channel gets `seq = 1`, the next `seq = 2`, and so on. Sequence numbers are
  strictly increasing by exactly one per published message and are never reused
  or skipped.
- Append the message (its `seq` and `data`) to that channel's buffer so it can
  be replayed later.
- Deliver `{ "seq": <number>, "data": <data> }` to every currently-connected
  subscriber of that channel.
- Response `201` with `{ "channel": <channel>, "seq": <number> }`.
- Invalid JSON → `400`. Missing/non-string `channel` or missing `data` → `422`.

`GET /healthz` — health check.

- Response `200` with `{ "ok": true }`.

### WebSocket endpoint

Clients subscribe at `ws://<host>/ws?channel=<channel>&last_seq=<n>`.

- `channel` is required. If it is missing, do not upgrade (respond `400`).
- `last_seq` is optional and defaults to `0`. It is the highest sequence number
  the client has already received on this channel.
- On connect, immediately replay every buffered message for that channel whose
  `seq` is strictly greater than `last_seq`, in ascending `seq` order, each as
  `{ "seq": <number>, "data": <data> }`.
- After the replay, deliver live messages as they are published, in order.

## Notes

- A subscriber connected with `last_seq=0` on a fresh channel receives every
  message published while it is connected, with seq starting at `1` and
  increasing by one.
- A subscriber that disconnects, then reconnects with `last_seq` set to the last
  seq it received, must receive exactly the messages published in the gap — no
  message repeated, none skipped.
- A subscriber connecting with `last_seq=0` to a channel that already has a
  buffer receives all buffered messages, in order, before any live message.

## Summary

Build a WebSocket pub/sub with per-channel sequence numbers and resumable catch-up replay.

## Constraints

- The service must listen on the port provided by PORT.
- Use Bun's native WebSocket server via Bun.serve.
- Sequence numbers are per channel, start at 1, and increase by exactly one.
- Channels must be fully isolated from one another.

## Allowed assumptions

- The process starts from the task root.
- State may be kept in memory; no persistence is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not deliver buffered messages out of order or with gaps.
