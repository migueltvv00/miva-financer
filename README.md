# Fluxo

Personal finance PWA for a single Portuguese user. Log transactions in under 10 seconds, set monthly budget limits, track instalment plans, manage investments, and review spending trends — all synced in real time via Supabase.

## Tech Stack

- **Framework:** React 18 + TypeScript (strict mode)
- **Build:** Vite
- **Styling:** TailwindCSS + design tokens (`src/styles/tokens.css`)
- **Routing:** React Router v7
- **State:** Zustand
- **Backend:** Supabase (Postgres, Auth, Realtime)
- **Charts:** Recharts
- **PDF:** @react-pdf/renderer (client-side report generation)
- **CSV:** papaparse (bank statement import)
- **PWA:** vite-plugin-pwa (Workbox GenerateSW)
- **Dates:** date-fns with pt-PT locale
- **Package manager:** pnpm

## Prerequisites

### On your PC (development)

| Requirement | How to install |
|-------------|---------------|
| **Node.js** ≥ 18 | [nodejs.org](https://nodejs.org) or `nvm install 18` |
| **pnpm** ≥ 8 | `npm install -g pnpm` |
| **Git** | [git-scm.com](https://git-scm.com) |
| A **Supabase** project | [supabase.com](https://supabase.com) — create a free project in eu-central-1 (Frankfurt) or eu-west-1 |
| A modern **browser** | Chrome, Firefox, or Edge (for PWA support) |

### On your phone (mobile use)

| Platform | What you need |
|----------|---------------|
| **Android** | Chrome → open your deployed URL → tap "Add to Home Screen" from the ⋮ menu |
| **iOS** | Safari → open your deployed URL → tap Share (↑) → "Add to Home Screen" |

> **Note:** The app must be served over **HTTPS** for the PWA to work on mobile. Use Vercel, Netlify, or Supabase Hosting for free deployment. Locally, `pnpm dev` serves on `http://localhost:5173` which works fine for development but won't install as a PWA on phones.

## Setup

1. Clone the repository:
```bash
git clone https://github.com/migueltvv00/miva-financer.git
cd miva-financer
```

2. Create `.env.local` with your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

3. Install dependencies and start:
```bash
pnpm install
pnpm dev
```

4. Open `http://localhost:5173` in your browser. Create an account on first visit — default categories are seeded automatically.

## Deployment (so you can use it on your phone)

### Vercel (recommended, free)
```bash
pnpm build
npx vercel --prod
```
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the Vercel dashboard.

### Manual
```bash
pnpm build
# Upload the `dist/` folder to any static hosting with HTTPS
```

After deploying, open the URL on your phone and add it to your home screen for the full app experience.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (http://localhost:5173) |
| `pnpm build` | Production build to `dist/` |
| `pnpm preview` | Preview production build locally |
| `pnpm lint` | ESLint |
| `pnpm type-check` | TypeScript type checking |
| `pnpm test:e2e` | Run Playwright E2E tests (requires `sudo npx playwright install-deps chromium`) |

## Environment Variables

| Variable | Description | Safe to commit? |
|----------|-------------|-----------------|
| `VITE_SUPABASE_URL` | Supabase project URL | No |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/publishable key | No |

## Project Structure

```
src/
  components/    # Reusable UI (BottomNav, Sidebar, NumPad, etc.)
  features/      # Feature modules
    auth/        # Login, signup
    transactions/ # Entry, list, edit
    budgets/     # Budget limits
    dashboard/   # Monthly summary, PDF export
    categories/  # Category management
    settings/    # App settings
    goals/       # Savings goals
    trends/      # Spending trend analysis
    planning/    # Monthly budget planning
    income-sources/ # Income source management
    net-worth/   # Net worth snapshot
    investments/ # Investment portfolio tracking
    import/      # Bank statement CSV import
    instalments/ # Instalment/split tracking
    reports/     # PDF report generation
  hooks/         # Shared hooks (useAuth, useOnlineStatus, useCategorySuggestion)
  lib/           # Supabase client, utils, constants
  store/         # Zustand stores (one per domain)
  styles/        # Design tokens, global CSS
  types/         # Shared TypeScript types
```

## Features

### v1.0 — Core
- ✅ Auth (login/signup with Supabase Auth)
- ✅ Category management (CRUD, emoji/color, reorder)
- ✅ Quick transaction entry (NumPad, category grid, offline queue)
- ✅ Transaction list (grouped by date, filters, swipe delete, edit)
- ✅ Budget limits (per-category monthly, copy from last month)
- ✅ Monthly summary dashboard (charts, progress bars, realtime sync)
- ✅ Recurring transactions (weekly/monthly/yearly, auto-creation)

### v1.1 — Planning & Goals
- ✅ Income sources (salary/freelance/other, IRS Categoria B widget)
- ✅ Monthly budget planning (plan vs actual comparison)
- ✅ Savings goals (progress tracking, add funds, completion celebration)

### v1.2 — Intelligence & Insights
- ✅ Spending trends (3m/6m averages, sparklines, insight labels)
- ✅ Monthly PDF report (income, expenses, budget variance, IRS disclaimer)
- ✅ Smart category suggestions (note-based frequency analysis)
- ✅ Net worth snapshot (manual assets/liabilities, line chart)

### v1.3 — Power Features
- ✅ Bank statement CSV import (CGD, BPI, Millennium BCP, Novo Banco)
- ✅ Instalment tracking (auto-creates N monthly transactions)
- ✅ Investment portfolio (accounts, snapshots, gain/loss, sync to net worth)
