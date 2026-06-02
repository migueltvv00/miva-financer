# Copilot Instructions — Fluxo

## Project

Fluxo is a personal finance PWA for a single Portuguese user. All UI text is in Portuguese (pt-PT). All monetary values are stored as **euro cents (integer)** — never use floats for money. Display divides by 100 with pt-PT formatting (1.234,56 €). Fiscal year follows calendar year (Jan–Dec) for Portuguese IRS.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript (strict mode) |
| Build | Vite |
| Styling | TailwindCSS + `src/styles/tokens.css` (design system) |
| Routing | React Router v7 |
| State | Zustand (client state + optimistic cache) |
| Backend | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| Charts | Recharts |
| PWA | vite-plugin-pwa (Workbox GenerateSW) |
| Dates | date-fns with `pt-PT` locale |
| Package manager | pnpm |

Do **not** add libraries beyond these without explicit approval. Always use **context7 MCP** to fetch the latest docs for any library before writing implementation code.

## MCP Servers

Before starting any work session, confirm these are connected:
- **context7** — library docs lookup
- **Supabase MCP** — schema inspection, migration running
- **Jira** — ticket management (project key: FIN)
- **GitHub** — PR creation

## Design System

Notion-inspired palette defined in `src/styles/tokens.css`. Mobile-first: design for 375px viewport first, then enhance for desktop. Minimum tap target: 44×44px on all interactive elements.

```css
:root {
  /* Backgrounds */
  --color-bg:          #FFFFFF;
  --color-bg-secondary: #F7F6F3;
  --color-bg-tertiary:  #EEEEED;
  --color-bg-hover:     #E8E7E4;

  /* Text */
  --color-text:          #37352F;
  --color-text-secondary: #787774;
  --color-text-tertiary:  #B4B4B0;
  --color-text-inverse:   #FFFFFF;

  /* Accent */
  --color-accent:       #0F7B6C;
  --color-accent-light: #DBEDDB;
  --color-accent-hover: #0B5D52;

  /* Semantic */
  --color-success: #0F7B6C;
  --color-warning: #D9730D;
  --color-danger:  #E03E3E;

  /* Borders & Dividers */
  --color-border:  #E3E2DF;
  --color-divider: #EEEEED;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
}
```

Use these tokens via Tailwind (`theme.extend.colors` mapped to CSS vars). Never hard-code colour values in components.

## Project Structure

```
src/
  components/    # Reusable UI (Button, Modal, NumPad, Toast, etc.)
  features/      # Feature modules, each with own components/hooks
    auth/
    transactions/
    budgets/
    dashboard/
    categories/
    settings/
  hooks/         # Shared hooks (useAuth, useOnlineStatus, etc.)
  lib/           # Supabase client, utils, constants
    supabase.ts
  store/         # Zustand stores (one file per domain slice)
  styles/        # tokens.css, global styles
  types/         # Shared TypeScript types / interfaces
supabase/
  migrations/    # All schema changes as SQL migrations
```

Each feature folder is self-contained: its own components, hooks, and types. Shared logic goes in `hooks/`, `lib/`, or `store/`.

## Conventions

### TypeScript
- Strict mode enabled. No `any` — use `unknown` + type guards when necessary.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- Export types from `src/types/` for cross-feature use.

### Components
- Functional components only with named exports.
- Colocate component-specific types in the same file.
- UI components in `src/components/` are generic and feature-agnostic.

### State (Zustand)
- One store file per domain: `transactionStore.ts`, `categoryStore.ts`, etc.
- Optimistic updates: mutate local state first, then call Supabase. On error, rollback and show toast.
- Supabase Realtime subscriptions update the store directly for transactions and budgets.

### Supabase
- Client initialised in `src/lib/supabase.ts` from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars (stored in `.env.local`).
- All tables have RLS enabled — every policy scopes to `auth.uid() = user_id`. No table is readable or writable without authentication.
- Use `supabase/migrations/` for all schema changes — never alter tables directly in the dashboard.
- Run `supabase gen types typescript` after every migration and commit the updated types file.
- Monetary values: always `amount_cents integer` (positive). The `type` column (`'expense'` | `'income'`) determines sign in the UI.
- Never store sensitive data (full card numbers, bank credentials) — this app uses manual entry only.

### Offline Support
- Transactions created offline are queued in `localStorage` under key `fluxo-offline-queue`.
- On reconnect, flush the queue to Supabase and clear it.
- Show a subtle "Offline — will sync when connected" indicator when offline.
- Offline queue failures are surfaced clearly when sync resumes.

### Error Handling
- All Supabase calls wrapped in try/catch with structured logging.
- On failure: rollback optimistic state, show error toast with a user-friendly Portuguese message.
- Never swallow errors silently. Log to `console.error` in development.
- Network errors trigger the offline queue for write operations.

## Build & Run

Use the Build-and-Validate agent located at:
.claude/agents/build-and-validate/build_and_validate.agent.md

Follow its workflow strictly:
- validator → diagnose → repair loop
- update decision log after each iteration
- run regression after success
- stop on escalation conditions

## Privileged actions
If you are doing an action that will require sudo, just tell me the command you want to run.
Then open a dialogue so I can confirm that it's done before you continue.

## Environment Variables

All config in `.env.local` (Vite convention). Document every var in README with description and whether it is safe to commit.

Required:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key

## Git & Workflow

- **Branching:** `feat/FIN-123-short-description`, `fix/FIN-456-short-description`, `chore/FIN-789-short-description`
- **Commits:** Conventional Commits — `feat: add transaction entry`, `fix: budget rollback on error`, `chore: update deps`
- **PRs:** Squash-merge into `main`. PR title matches the conventional commit format. Jira ticket ID in branch name and title.
- **Boundary commits (empty):**
  - After all feature phases merged: `chore: v{version} feature complete — cleanup begins`
  - After cleanup: `chore: v{version}-cleanup complete`

## Jira

- Project key: **FIN**
- Epics: `v1.0` (features), `v1.0-cleanup` (post-feature polish)
- Check Jira for existing tickets before creating new ones.

## Development Workflow (Every Phase)

For frontend development, use the React expert agents located at:
- `~/miva-projects/awesome-copilot/agents/react19-*` - starting with `react19-migrator.agent.md` for React 18 → 19 migration, then use the remainder 'react-19*' agents to improve code quality, modularity, and maintainability

For backend developement, use the expert typescript agent located at:
- `~/miva-projects/awesome-copilot/agents/typescript-mcp-expert.agent.md

for feature development
## Cleanup Phase Structure

Each item is a separate commit, never batched:
1. Eliminate duplication
2. Modularise — one hook/service per domain, thin components
3. TypeScript hygiene — no `any`, shared types in `src/types/`
4. Error handling — every async op has try/catch, user-facing toast
5. Dead code removal
6. README and JSDoc