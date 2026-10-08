# Muffler Parts CRM

A CRM for a muffler parts delivery business. Office staff manage orders, stock, customer balances, and driver assignments; drivers use a separate interface to record deliveries, payments, and sales visits.

The workflow follows a parts order from assignment through delivery, keeping inventory and the customer's outstanding balance attached to the same records.

## How it works

The Next.js application talks directly to Supabase from its client components. [The query hooks](hooks/useRealtimeOrders.ts) combine TanStack Query with Supabase Postgres change subscriptions, periodic refetching, and cache updates. Admin and driver screens share the same underlying tables.

[The database schema](supabase/schema.sql) holds customers, inventory, orders, order items, payments, and pitch attempts. Postgres generates order numbers and balance fields. Triggers recalculate customer balances after amount changes or payment inserts. A separate trigger reserves or deducts stock as order status changes.

Delivery and sales visit screens call [the location helper](lib/location-tracking.ts) to record browser geolocation. [Compressed local storage](lib/offline/compression.ts) keeps cached records available during connection loss, and a service worker caches application pages.

Built with Next.js 15, React 19, TypeScript, Tailwind CSS 4, Supabase, TanStack Query, React Hook Form, and Zod.

## Local setup

Use Node.js, npm, and a separate Supabase development project.

1. Review and run [`supabase/schema.sql`](supabase/schema.sql), then [`database-indexes.sql`](database-indexes.sql). The schema includes development users and permissive access policies; use test data and replace the seeded access keys.
2. Enable Supabase Postgres change subscriptions for `orders`, `customers`, `payments`, `inventory`, and `pitch_attempts`, which the hooks subscribe to.
3. Create `.env.local` in the repository root:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-project-anon-key
```

```sh
npm ci
npm run dev
```

Open `http://localhost:3000` and use an active access key from your development database's `users` table. Allow browser location access when testing delivery and sales visit logging.

## Current limits

The order, inventory, payment, delivery, and pitch workflows are implemented. Login currently looks up an access key and stores client state; the admin and driver views are not backed by server-enforced role isolation. The included RLS policies are development defaults, so access control needs work before using real business data.

Offline support covers cached reads and some local state. The service worker's queued-write sync functions are placeholders. No automated test suite is included.
