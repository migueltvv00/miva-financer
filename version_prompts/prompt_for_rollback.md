# Rollback to v1.9.5 — Prompt & Verification

## Context

Versions v1.9.6 through v1.9.8 introduced persistent production instability:
- React error #185 (infinite update loops in `useCashFlowForecast`, `useUserSettings`)
- Stale PWA chunk imports after Vercel redeployments
- Cascading regressions where fixes caused new breakage

Decision: hard rollback to v1.9.5 (commit `2b04ce8`) — the last known stable release.

## What Was Done

```
1. Stashed all uncommitted v1.9.7 + v1.9.8 changes:
   git stash -u -m "v1.9.7+v1.9.8 uncommitted work"

2. Hard reset to v1.9.5:
   git reset --hard 2b04ce8

3. Recovered documentation files from stash (for future reference):
   - features_v1.9.5_to_v1.9.8.md (changelog of everything removed)
   - prompt_for_v_1.9.6.md
   - prompt_for_v_1.9.7.md
   - prompt_for_v_1.9.8.md

4. Verified build: pnpm build ✅
```

## What Remains in the Stash

All v1.9.6 through v1.9.8 code is preserved in `git stash list` entry 0.
It can be restored selectively with:
```bash
git stash show --include-untracked --name-only  # list files
git show stash@{0}:path/to/file                 # view a specific file
git show stash@{0}^3:path/to/file               # view an untracked file
```

## Supabase Migrations

If these migrations were applied to production, the columns remain but are harmless
(v1.9.5 code doesn't reference them). To clean up:

```sql
-- Only run these if you want to remove the unused columns:
ALTER TABLE budgets DROP COLUMN IF EXISTS rollover_cents;
ALTER TABLE transactions DROP COLUMN IF EXISTS is_subscription;
ALTER TABLE user_settings DROP COLUMN IF EXISTS theme;
```

## Deployment

After verifying the build locally:
```bash
git push --force-with-lease origin main
```
This force-pushes the rollback to origin, which triggers Vercel redeployment.

## Post-Rollback Verification Checklist

Test each of these on the deployed production app:

### Core Flow
- [ ] Login / signup works
- [ ] Dashboard loads without errors
- [ ] Add a transaction (expense) via NumPad + category selection
- [ ] Add an income transaction
- [ ] View transaction list — grouped by date
- [ ] Edit a transaction
- [ ] Delete a transaction (swipe left)
- [ ] Navigate all tabs (Dashboard, Transactions, Entry, Settings)

### Budgets
- [ ] View budget screen — per-category bars render
- [ ] Set/edit a budget limit
- [ ] Progress bars reflect actual spending

### Categories
- [ ] View category list
- [ ] Create a custom category
- [ ] Reorder categories (drag)

### Settings
- [ ] Change month start day
- [ ] Dashboard and Transactions reflect the new period
- [ ] Period label updates correctly

### Trends
- [ ] TrendsScreen loads (lazy chunk import works)
- [ ] Charts render with data

### Investments & Net Worth
- [ ] Both screens load without errors
- [ ] Data displays correctly

### PWA
- [ ] App works offline (cached pages load)
- [ ] Offline indicator shows when disconnected
- [ ] Transaction queued offline syncs when reconnected
- [ ] No "Failed to fetch dynamically imported module" errors
- [ ] No React error #185 in console

### Goals
- [ ] Goals screen loads
- [ ] Create / edit a savings goal

### Import
- [ ] Import screen loads
- [ ] CSV import works

## Re-introduction Plan

See `features_v1.9.5_to_v1.9.8.md` for the full feature list and suggested
re-introduction order. Key principle: **one feature set per PR, tested in
production before the next**.
