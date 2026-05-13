---
description: Create a strict Feynman learning project
argument-hint: "<topic>"
---

Use the `feynman-coach` skill.

Create or initialize a new Feynman learning project for: `$ARGUMENTS`.

Follow this sequence strictly:

1. Derive a lowercase slug for the project and use `~/.pi/feynman-projects/<slug>/`.
2. Ask the learner for learning goal, use case, current background, expected mastery level, and time budget.
3. Explain that only Markdown sources are supported.
4. Ask whether they want to manually place Markdown files in `sources/user-docs/` or add files through `/add-doc`.
5. Do not teach yet.
6. Create or update the project metadata and initial progress state if file tools are available.
