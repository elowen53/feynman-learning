---
description: Build or revise the project learning outline
argument-hint: "<project>"
---

Use the `feynman-coach` skill.

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
- Do not start teaching until initial diagnosis is complete.
