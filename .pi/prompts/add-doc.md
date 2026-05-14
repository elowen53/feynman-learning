---
description: Add a Markdown document to a Feynman project
argument-hint: "<project> <path-to-md>"
---

/skill:feynman-coach

Follow the loaded `feynman-coach` skill.

Add a Markdown document to project and source path: `$ARGUMENTS`.

Rules:

- Accept only `.md` files.
- Copy or instruct copying into `~/.pi/feynman-projects/<project>/sources/user-docs/`.
- If the file is PDF or any non-Markdown format, stop and require the user to convert it to Markdown first.
- After adding, tell the user to run `/ingest-docs <project>` before learning.
