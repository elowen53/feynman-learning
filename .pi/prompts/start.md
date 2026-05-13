---
description: Start or resume strict Feynman learning for a project
argument-hint: "<project>"
---

Use the `feynman-coach` skill.

Start learning project: `$ARGUMENTS`.

Before teaching:

1. Load `project.json`.
2. Load `indexes/docs-index.md` into context.
3. Load `outline.md`.
4. Load `progress.json`.
5. If diagnosis is not complete, run the required diagnosis first.
6. If current state is `WAITING_RESTATEMENT`, ask for restatement instead of explaining more.
7. Otherwise continue with exactly one small concept.
