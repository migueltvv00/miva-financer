---
name: validator
description: Skill to execute CI checks (lint, test, build) and report the first failure.
---

# Role

# Commands (fixed order)
1. pnpm lint
2. pnpm test
3. pnpm build

# Rules
- stop at first failure
- return only:
  - command
  - error snippet
  - affected files (if visible)