# Tourbook

A mobile logbook for touring professionals — musicians, crew, production managers,
lighting designers, FOH/monitor/video engineers, stage managers — to build a
permanent record of their touring career by logging **tours** and the **shows**
within them.

> Working name. V1 is a personal, private logbook. The data model is intentionally
> shaped so social features (friends, shared venue pages, public tours) can be added
> later without a rewrite.

## Tech stack

- **Expo** (SDK 57) + **React Native** + **TypeScript**
- **Expo Router** — file-based navigation with typed routes
- **Supabase** — Postgres, Auth, and Row-Level Security
- **TanStack Query** — server state, caching, background refetch; the cache is
  persisted to AsyncStorage so logged data is readable offline and across restarts
- **React Hook Form** + **Zod** — forms and validation

## Prerequisites

- **Node.js** LTS (22 or 24). Newer/odd versions may emit engine warnings.
- **Expo Go** on a device or simulator, or an iOS/Android emulator.
- For the local backend:
  - A container runtime (Docker Desktop, or [Colima](https://github.com/abiosoft/colima): `brew install colima && colima start --cpu 4 --memory 6`)
  - **Supabase CLI** (`npx supabase ...` works without a global install)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the local Supabase stack (Postgres, Auth, Storage)
npx supabase start

# 3. Configure environment variables
cp .env.example .env
# Fill EXPO_PUBLIC_SUPABASE_ANON_KEY from `npx supabase status`.
# Set EXPO_PUBLIC_SUPABASE_URL for where the app runs (see .env.example).

# 4. Run the app
npm start
```

Then press `i` (iOS simulator), `a` (Android emulator), or scan the QR code with
Expo Go. If you change `.env` or hit a stale bundler cache, restart with
`npx expo start --clear`.

## Environment variables

`EXPO_PUBLIC_*` variables are inlined at build time and validated at startup
(`src/lib/env.ts`). The anon key is safe to ship in the client — Row-Level
Security is what protects data.

| Variable                         | Description                                  |
| -------------------------------- | -------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`       | Supabase API URL (host depends on target)    |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY`  | Supabase anon key from `npx supabase status` |

The URL host differs by target: `127.0.0.1` for the iOS simulator, `10.0.2.2`
for the Android emulator, and your machine's LAN IP for a physical device. See
`.env.example`.

## Project structure

```
app/                     # Expo Router routes (thin files that re-export screens)
  (auth)/                #   unauthenticated stack (sign-in / sign-up)
  (app)/                 #   authenticated stack
    tours/[id]/          #     tour detail, edit, add-show, shows/[showId]
src/
  components/            # Reusable UI primitives (Text, Button, TextField, ...)
  features/              # Feature-first modules (api, queries, schema, screens)
    auth/  tours/  shows/  acts/  venues/  profile/
  lib/                   # Cross-cutting: supabase client, env, query client, dates
  theme/                 # Design tokens (colors, spacing, radius, typography)
supabase/
  migrations/            # Version-controlled SQL schema
```

Routes stay thin and delegate to screen components in `src/features/*`, so
navigation and UI logic stay decoupled and screens remain independently testable.
Each feature owns its `api.ts` (Supabase calls), `queries.ts` (TanStack Query
hooks), `schema.ts` (Zod), and screen components.

## Data model

- **profiles** — one row per auth user (created on signup). Personal, private.
- **tours** — belong to a user, reference a shared **act**; role is per-tour.
  A one-off gig is just a tour with a single show.
- **shows** — belong to a tour, reference a shared **venue**; `user_id` is
  denormalized from the parent tour for simpler, faster RLS.
- **acts** / **venues** — shared, community-wide reference data, deduped by a
  generated normalized name (and city, for venues).

`visibility` is a first-class enum seeded with only `private`, so adding
`friends`/`public` later is additive rather than a schema rewrite. Personal data
(profiles/tours/shows) is guarded by owner-only RLS policies; shared reference
data is readable by any authenticated user and insert-only from the client.

## Database & migrations

Schema lives in `supabase/migrations/` and is applied by the local stack.

```bash
# Create a new migration
npx supabase migration new <name>

# Apply migrations by resetting the local database
npx supabase db reset

# Regenerate TypeScript types after a schema change
npm run db:types
```

## Scripts

| Script              | Description                          |
| ------------------- | ------------------------------------ |
| `npm start`         | Start the Expo dev server            |
| `npm run ios`       | Start and open the iOS simulator     |
| `npm run android`   | Start and open the Android emulator  |
| `npm test`          | Run the Jest test suite              |
| `npm run typecheck` | Type-check the project (`tsc`)       |
| `npm run db:types`  | Regenerate Supabase types (local DB) |

## Testing

Unit tests use **Jest** with the `jest-expo` preset. Test files live next to the
code they cover (e.g. `src/lib/date.test.ts`). Run them with `npm test`.

## Conventions

- **TypeScript strict mode**; import from `@/*` (aliased to `src/`).
- **Server state** lives in TanStack Query; **local UI state** in React state.
- Small, reusable components; validation with Zod at the edges.
- Prefer the simplest solution that can grow — avoid premature abstraction.
