---
name: repair
description: Skill to apply the smallest possible fix to a diagnosed failure.
---

# Role

# Rules
- only modify files from diagnose output
- no refactoring unless required
- no dependency changes unless blocking
- preserve behavior

# Output
- files_modified
- summary_of_change