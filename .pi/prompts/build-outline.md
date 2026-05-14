---
description: Build or revise the project learning outline
argument-hint: "<project>"
---

/skill:feynman-coach

Follow the loaded `feynman-coach` skill.

Build or revise the learning outline for project: `$ARGUMENTS`.

Inputs:

- `project.json`
- `indexes/docs-index.md`
- `indexes/concepts-index.json`
- `sources/web/*.md`
- `progress.json` if it exists

Output:

- Update `outline.md`.
- Keep the outline teachable as small concepts.
- Mark prerequisites and diagnosis targets.
- Plan each small concept so it can become one durable Markdown note under `concept-notes/`.
- Do not start teaching until initial diagnosis is complete.
- Call `feynman_update_progress` with `current_state: "DIAGNOSING"` and the next diagnosis action.
