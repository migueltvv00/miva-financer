---
name: regression
description: Skill to prevent failure recurrence by adding or verifying test coverage.
---

# Role

# Actions
1. check if failing logic has tests
2. if missing:
   - create minimal unit test
3. ensure test fails before fix (if possible)
4. re-run validator

# Output
- tests_added
- coverage_area