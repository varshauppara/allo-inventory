<!-- This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details. -->

# Allo Inventory — Take-Home Exercise

Live URL: https://allo-inventory.vercel.app  
Repo: https://github.com/yourname/allo-inventory

## Running locally

1. Clone the repo and install dependencies:
```bash
   npm install
```

2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — a hosted Postgres URL (Supabase/Neon/Railway)
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — from Upstash

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

Two mechanisms work together to prevent double-booking:

**1. Redis distributed lock** (`src/lib/redis.ts`)  
Before touching a stock row, the reservation handler acquires a Redis lock keyed
on `lock:stock:{productId}:{warehouseId}` with a 5-second TTL using `SET NX PX`.
Only one request can hold the lock at a time. Concurrent requests get a 503 and
should retry. The lock is released in a `finally` block.

**2. Postgres row-level lock** (`SELECT … FOR UPDATE`)  
Inside the Prisma transaction, a raw `SELECT … FOR UPDATE` pins the exact stock
row at the database level. Even if two Node processes somehow bypassed Redis,
Postgres serializes them here. The available units are re-checked inside the
transaction, and the update only proceeds if `total - reserved >= quantity`.

The two layers complement each other: Redis gives fast early rejection, Postgres
gives a hard correctness guarantee.

## Reservation expiry

**In production:** A [Vercel Cron Job](https://vercel.com/docs/cron-jobs) hits
`/api/cron/expire-reservations` every minute. That handler runs:

```sql
UPDATE "Reservation"
SET    status = 'RELEASED', "updatedAt" = NOW()
WHERE  status = 'PENDING'
  AND  "expiresAt" < NOW()
RETURNING "productId", "warehouseId", quantity
```

For each expired row it decrements `Stock.reserved` by the corresponding
quantity in the same transaction. This is an O(expired rows) operation and
safe to re-run (idempotent because of the `status = 'PENDING'` filter).

**Lazy cleanup (belt-and-suspenders):** The `confirm` endpoint also checks
`expiresAt` and auto-releases if the client somehow missed the timer.

## Idempotency (bonus)

Both `POST /api/reservations` and `POST /api/reservations/:id/confirm` accept an
`Idempotency-Key` header. On first call the response is computed normally and
stored in Redis for 24 hours under `idempotent:{key}` (or `idempotent:confirm:{key}`).
On a retry with the same key, the cached response is returned immediately —
no DB writes happen. This prevents double-charging on payment gateway retries.

## Trade-offs / things I'd do differently

- **GET /api/reservations/:id** is not in the spec but the checkout page needs it
  to hydrate server-side. In production this would live behind auth so users can
  only fetch their own reservations.
- **No auth layer** — a real system would attach reservations to a user session.
- **Cron job not wired in this repo** — the expiry route exists; you'd add the Vercel
  cron config to `vercel.json`.
- **Redis lock TTL is 5 s** — fine for < 1 s DB queries; would tune under load.
- **`SELECT FOR UPDATE` via raw query** — Prisma doesn't support locking hints
  natively yet. The raw SQL is isolated in one place and easy to replace.