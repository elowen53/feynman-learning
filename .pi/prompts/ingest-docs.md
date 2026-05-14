---
description: Build source and concept indexes from project Markdown files
argument-hint: "<project>"
---

/skill:feynman-coach

Follow the loaded `feynman-coach` skill.

Ingest Markdown sources for project: `$ARGUMENTS`.

Read Markdown files from:

- `~/.pi/feynman-projects/<project>/sources/user-docs/`
- `~/.pi/feynman-projects/<project>/sources/web/`

Then update:

- `indexes/docs-index.md`
- `indexes/concepts-index.json`
- `indexes/source-map.json`

The index must be concise enough to load before every learning session and must include source file paths, key concepts, important claims, prerequisites, and uncertainty notes.

After indexing, call `feynman_update_progress` with `current_state: "BUILDING_OUTLINE"` and a concrete next action.
