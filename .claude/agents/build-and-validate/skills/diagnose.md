---
name: diagnose
description: Skill to find the minimal root cause of a build or test failure.
---

# Role

# Inputs
- error output
- changed files

# Strategy
1. classify failure:
   - Type error
   - runtime error
   - test failure
   - build failure
   - dependency issue

2. map error → file
3. identify single root cause

# Output format
- root_cause
- confidence (0-100)
- fix_strategy (single sentence)
- risk_level (low/med/high)

# Constraints
- no speculation beyond observed evidence