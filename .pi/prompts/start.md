---
description: Start or resume strict Feynman learning for a project
argument-hint: "<project>"
---

/skill:feynman-coach

Follow the loaded `feynman-coach` skill.

Start learning project: `$ARGUMENTS`.

Before teaching:

1. Load `project.json`.
2. Load `indexes/docs-index.md` into context.
3. Load `outline.md`.
4. Load `progress.json`.
5. If `progress.json.current_concept_note` exists, load that concept note.
6. If diagnosis is not complete, run the required diagnosis first.
7. If current state is `WAITING_RESTATEMENT`, ask for restatement instead of explaining more.
8. Otherwise call `feynman_write_concept_note`, then continue with exactly one small concept.
9. In chat, give only a concise guided explanation, include the returned concept note path, and ask for restatement plus a learner-owned example.
10. Do not advance after the learner answers until `feynman_record_score` returns `passed: true`.
