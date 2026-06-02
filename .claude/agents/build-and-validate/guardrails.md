---
name: guardrails
description: Iteration and safety constraints for the build-and-validate agent.
---

# Guardrails

- Max 5 iterations per run
- Max 2 retries per identical error signature
- Max 3 files modified per iteration
- Stop if confidence < 70%
- Escalate on repeated failure (≥2 cycles)