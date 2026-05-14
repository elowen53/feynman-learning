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
5. If `progress.json.current_concept_note` exists, load that concept note.
6. If diagnosis is not complete, run the required diagnosis first.
7. If current state is `WAITING_RESTATEMENT`, ask for restatement instead of explaining more.
8. Otherwise create or update the current concept Markdown note under `concept-notes/`, then continue with exactly one small concept.
9. In chat, give only a concise guided explanation, include the concept note path, and ask for restatement plus a learner-owned example.
