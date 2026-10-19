# MealTrack

A meal management app for shared living or mess-style meal tracking. It supports member deposits, meal logs, expenses, cycle closing with pending settlement, authentication with Supabase, and public read-only share links.

## Features

- Email/password login, signup, password recovery, and Google OAuth via Supabase Auth
- Active meal cycle tracking for:
  - members
  - deposits
  - meal logs
  - meal and fixed expenses
- Cycle workflow with three states:
  - `active`
  - `pending`
  - `closed`
- Pending-cycle settlement flow:
  - close current cycle and start a new clean cycle
  - keep the previous cycle editable for settlement and corrections
  - mark the pending cycle as fully closed when done
- Public read-only share link for the active or pending cycle
- Manager editing for:
  - expenses
  - meal logs
  - settlement deposits

## Tech Stack

- React 19
- Vite
- TypeScript
- Express
- Supabase
- Tailwind CSS
- Radix UI / shadcn-style UI components
- Wouter

## Project Structure

```text
client/     Frontend app
server/     Express server and public share API
supabase/   SQL setup scripts
shared/     Shared schema/util files
```

## Requirements

- Node.js 20+
- npm
- Supabase project

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
VAPID_PUBLIC_KEY=your_web_push_vapid_public_key
VAPID_PRIVATE_KEY=your_web_push_vapid_private_key
VAPID_SUBJECT=mailto:admin@example.com
NOTIFICATION_TIMEZONE=Asia/Dhaka
PORT=5000
```

Notes:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are used by the client.
- `SUPABASE_SERVICE_ROLE_KEY` is required by the Express server for public share-link reads.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` are required for Web Push notifications.
- `NOTIFICATION_TIMEZONE` controls the daily meal reminder schedule and defaults to `Asia/Dhaka`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code.

## Supabase Setup

Run these files in numeric order in the Supabase SQL Editor:

```text
supabase/01_tables.sql
supabase/02_indexes.sql
supabase/03_functions.sql
supabase/04_triggers.sql
supabase/05_rls_policies.sql
```

The sequence contains the complete consolidated schema, indexes, RPCs,
triggers, and final RLS/RBAC policies. It is safe to run against a fresh
database and is designed to be repeatable.


## Auth Configuration

In Supabase Auth, enable the providers you want:

- Email + Password
- Google

Make sure your redirect URLs include your app origin. For local development this is usually:

```text
http://localhost:5000
```

If you use password recovery or OAuth callbacks through the auth page, also ensure `/auth` works in your configured redirect flow.

## Install and Run

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Type-check:

```bash
npm run check
```

Build for production:

```bash
npm run build
```

Start production build:

```bash
npm run start
```

## Current Cycle Logic

The app now uses cycle-based history instead of snapshot-only archives.

### `active`

- This is the live cycle used by Dashboard, Members, Meals, and Expenses.
- New expenses, meal logs, and deposits go into this cycle.

### `pending`

- When you close the active cycle, it becomes `pending`.
- A fresh empty `active` cycle is created immediately.
- The pending cycle remains editable for:
  - settlement deposits
  - expense corrections
  - meal log corrections

### `closed`

- When settlement is complete, the pending cycle can be marked `closed`.
- Closed cycles are read-only in History.

Only one pending cycle is allowed at a time.

## Share Links

The share link is read-only and does not require login.

Current behavior:

- if a `pending` cycle exists, the shared page shows that cycle
- otherwise it shows the current `active` cycle

The shared view includes:

- meal rate
- total costs
- total meals
- remaining cash
- meal logs
- expenses
- member summary

## Notes

- `members.deposit` is no longer the source of truth for cycle settlement totals.
- Cycle-specific money movement is stored in `cycle_deposits`.
- The app now relies on `cycles` + `cycle_deposits` + `cycle_id` on expenses and meal logs.

## Server Scaling

The current server is designed to run as one instance. Shared-page SSE clients and their broadcast timers are stored in process memory, and cron jobs start inside the web process. Running multiple instances would split SSE subscribers and start duplicate schedulers. Before scaling horizontally, move event fanout to Redis Pub/Sub or Postgres `LISTEN`/`NOTIFY`, and run scheduled jobs through a single worker or a distributed lock.

## Scripts

- `npm run dev` - start the Express + Vite development server
- `npm run dev:client` - run Vite client only on port 5000
- `npm run build` - build client and server
- `npm run start` - run the production server
- `npm run check` - run TypeScript type-checking
- `npm run db:push` - run Drizzle push
