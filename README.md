# Fluxo

Personal finance PWA for a single Portuguese user. Log transactions in under 10 seconds, set monthly budget limits, track instalment plans, and review a monthly summary dashboard — all synced in real time via Supabase.

## Tech Stack

- **Framework:** React 18 + TypeScript (strict mode)
- **Build:** Vite
- **Styling:** TailwindCSS + design tokens (`src/styles/tokens.css`)
- **Routing:** React Router v7
- **State:** Zustand
- **Backend:** Supabase (Postgres, Auth, Realtime)
- **Charts:** Recharts
- **PWA:** vite-plugin-pwa (Workbox GenerateSW)
- **Dates:** date-fns with pt-PT locale
- **Package manager:** pnpm

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
   - `VITE_SUPABASE_URL` — Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — Your Supabase anonymous/publishable key
3. Install dependencies and start:

```bash
pnpm install
pnpm dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm preview` | Preview production build |
| `pnpm lint` | ESLint |
| `pnpm type-check` | TypeScript type checking |

## Environment Variables

| Variable | Description | Safe to commit? |
|----------|-------------|-----------------|
| `VITE_SUPABASE_URL` | Supabase project URL | No |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | No |

## Project Structure

```
src/
  components/    # Reusable UI (Button, Modal, NavBar, etc.)
  features/      # Feature modules
    auth/        # Login, signup
    transactions/ # Entry, list
    budgets/     # Budget limits
    dashboard/   # Monthly summary
    categories/  # Category management
    settings/    # App settings
  hooks/         # Shared hooks
  lib/           # Supabase client, utils, constants
  store/         # Zustand stores
  styles/        # Design tokens, global CSS
  types/         # Shared TypeScript types
```

## Development Progress

### v1.0

- [x] **Phase 1 — Project scaffold** (FIN-3): Vite + React + TS + Tailwind + Supabase client + Zustand skeleton + PWA + navigation shell
- [x] **Phase 2 — Auth** (FIN-6): Login/signup, useAuth, protected routes, category seed on first login
- [x] **Phase 3 — Categories management** (FIN-9): CRUD, reorder, emoji/color picker, defaults protected
- [x] **Phase 4 — Quick transaction entry** (FIN-7): Custom NumPad, category grid, optimistic submit, offline queue
- [x] **Phase 5 — Transaction list** (FIN-4): Grouped by date, month/category filters, swipe delete, edit modal
- [x] **Phase 6 — Budget limits** (FIN-5): Per-category monthly limits, copy from last month
- [x] **Phase 7 — Monthly summary dashboard** (FIN-8): Recharts donut, progress bars, realtime sync
- [x] **Phase 8 — Recurring transactions** (FIN-10): Toggle, frequency, auto-creation, delete one/all future

### v1.3

- [x] **Phase 2 — Prestação tracking**: Create instalment plans in settings, auto-generate monthly expense transactions, surface instalment badges in the transaction list, and show active plans on the dashboard.
