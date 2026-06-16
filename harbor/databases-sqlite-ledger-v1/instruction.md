# Money Ledger with Transactional Transfers

Build a Bun HTTP service that maintains a double-entry-style money ledger in
SQLite. Accounts hold integer balances, and transfers move money between them
atomically while preserving accounting invariants.

## Requirements

- Listen on the port provided by `PORT`.
- Persist all state in a SQLite database. Use the file path from `DATABASE_PATH`
  when it is set; otherwise default to `./data/app.db`. Data MUST survive a
  process restart.
- An account has an integer `id`, a string `name`, and an integer `balance`.
- All amounts and balances are integers (think cents). Balances MUST never go
  negative.

### Endpoints

`POST /accounts` — create an account.

- Request body: `{ "name": string, "initial_balance"?: integer }`.
- `initial_balance` is optional and defaults to `0`. When provided it MUST be an
  integer `>= 0`.
- Response `201` with `{ "id", "name", "balance" }` where `balance` equals the
  initial balance.
- Invalid JSON → `400`. Missing/non-string `name` → `422`. An `initial_balance`
  that is negative or not an integer → `422`.

`GET /accounts/:id` — read an account.

- Response `200` with `{ "id", "name", "balance" }`.
- Unknown id → `404`.

`POST /transfers` — move money from one account to another.

- Request body: `{ "from": integer, "to": integer, "amount": integer }`.
- On success: atomically debit `amount` from the `from` account and credit
  `amount` to the `to` account inside a single SQLite transaction, record the
  transfer, and return `200` with `{ "from", "to", "amount" }`.
- If `from` or `to` does not refer to an existing account → `404` with
  `{ "error": "account_not_found" }`.
- If `from` equals `to` → `400` with `{ "error": "same_account" }`.
- If `amount` is missing, not an integer, or `<= 0` → `422`.
- If the `from` account's balance is less than `amount` → `422` with
  `{ "error": "insufficient_funds" }` and NO balance change to either account.

## Invariants

- The sum of all account balances is conserved across every transfer: a transfer
  only moves money, it never creates or destroys it.
- No balance may ever become negative. A transfer that would overdraw the source
  account must fail with `422 insufficient_funds` and leave both balances
  exactly as they were (the debit and credit are all-or-nothing).
- Each successful transfer is recorded so the ledger has a durable history.
- Accounts, balances, and transfer history persist across a process restart.

## Notes

- Return JSON for every response.
- Validate the request body shape before using any value. Do not expose stack
  traces.

## Summary

Build a SQLite-backed money ledger with atomic, invariant-preserving transfers.

## Constraints

- The service must listen on the port provided by PORT.
- Persist accounts and transfers in SQLite at DATABASE_PATH, defaulting to ./data/app.db.
- Data must survive a process restart.
- Move money inside a single SQLite transaction so failures apply no partial change.

## Allowed assumptions

- The process starts from the task root.
- bun:sqlite is available; no external database server is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not store state only in memory.
