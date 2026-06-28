# Allo Inventory — Reservation System
Live URL: https://allo-inventory-orcin-omega.vercel.app
Repo: https://github.com/varshauppara/allo-inventory
## Running locally
1. Clone the repo and install dependencies:
```bash
npm install
```
2. Create a `.env` file in the project root with:
Note: `.env` is gitignored and not committed. Use your own hosted Postgres + Upstash Redis instances.
3. Run migrations and seed:
```bash
npx prisma migrate deploy
npm run db:seed
```
4. Start the dev server:
```bash
npm run dev
```
## How concurrency safety works
Reservation creation is wrapped in a single Postgres transaction that takes a
row-level lock on the relevant stock row:
```sql
SELECT id, total, reserved
FROM "Stock"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```
Concurrent requests for the same product/warehouse queue up at this lock rather
than racing. The first transaction to acquire the lock reads the current
`available = total - reserved`, and if `available >= quantity`, increments
`reserved` and creates the reservation, then commits and releases the lock.
Every subsequent transaction then sees the updated `reserved` value and
correctly returns `409 Not enough stock available` if there isn't room.
**Why not a Redis lock?** An earlier version used a Redis `SET NX` lock in
front of the DB transaction. Under real concurrent load this caused requests
to fail fast with `503` instead of queuing correctly, which doesn't match the
spec (it asks for `409`, not `503`, when stock is unavailable). The Postgres
row lock alone is sufficient for correctness and simpler, so the Redis lock
was removed. Redis is still used for idempotency caching (see below).
**Verified under load:** ran 15 concurrent `POST /api/reservations` requests
against a stock row with exactly 1 available unit. Result: 1 success (`201`),
14 conflicts (`409`), zero overselling, zero `503`s — repeated across multiple
runs.
## Reservation expiry
Reservations that aren't confirmed before `expiresAt` are released so the
units return to available stock. Two mechanisms:
- **`/api/cron/expire-reservations`** — a route that finds all `PENDING`
  reservations past their `expiresAt`, marks them `RELEASED`, and decrements
  `Stock.reserved` accordingly, in a transaction. Designed to be triggered on a
  schedule (e.g. Vercel Cron hitting this route every minute).
- **Lazy cleanup on confirm** — the `confirm` endpoint checks `expiresAt`
  itself and returns `410` (and releases the reservation) if it has already
  expired, even if the cron hasn't run yet. This guarantees correctness even
  if the scheduled job is delayed or not configured in a given environment.
> Note: there is no `vercel.json` cron entry wired up in this deployment yet.
> The cron route (`/api/cron/expire-reservations`) exists and is ready to be
> scheduled, but in this submission expiry correctness is enforced via the
> lazy check on confirm — a reservation past `expiresAt` is always rejected
> with `410` and released at that point, regardless of whether a scheduled
> job has run.
## Idempotency (bonus)
Both `POST /api/reservations` and `POST /api/reservations/:id/confirm` accept
an `Idempotency-Key` header. On the first call, the response is computed
normally and cached in Redis for 24 hours under `idempotent:{key}`. On a retry
with the same key, the cached response is returned immediately with no
additional side effects — this prevents double-reservation or double-charging
if a client retries a request (e.g. after a network timeout).
## Trade-offs / things I'd do differently with more time
- **No auth layer** — reservations aren't tied to a user session. In
  production, reservations would be scoped to an authenticated user.
- **Cron scheduling** — the expiry route exists but isn't wired into a
  `vercel.json` cron schedule yet; lazy cleanup on confirm covers correctness
  in the meantime. With more time I'd add the cron config so stock is
  reclaimed proactively, not just at the moment someone tries to confirm.
- **`SELECT ... FOR UPDATE` via raw SQL** — Prisma doesn't natively support
  row-locking hints, so this one query is raw SQL, kept isolated to a single
  place in the codebase for clarity.
- **Stock reset/test scripts** (`reset-stock.js`) were added during
  development to support manual concurrency testing and aren't part of the
  application itself — kept in the repo for transparency, not meant for
  production use.
