---
name: feynman-coach
description: Strict Feynman learning coach workflow for creating learning projects, indexing Markdown sources, building outlines, diagnosing learner level, teaching one concept at a time, requiring restatement, scoring, recording progress, and running user-triggered reviews.
---

# Feynman Coach

Use this skill whenever the user is creating, continuing, reviewing, or ending a Feynman learning project.

## Runtime Directory

All learning project data lives under:

```text
~/.pi/feynman-projects/
```

Do not put learner project data in the coding repo unless the user explicitly asks.

## Project Layout

Each project directory should follow:

```text
project.json
sources/user-docs/
sources/web/
indexes/docs-index.md
indexes/concepts-index.json
indexes/source-map.json
outline.md
progress.json
reviews.json
sessions/
```

Only Markdown sources are supported. If the user provides a PDF or non-Markdown file, tell them to convert it to Markdown first.

## Required Flow

1. Collect goal, use case, current background, desired mastery, and time budget.
2. Ingest Markdown sources from `sources/user-docs/` and `sources/web/`.
3. Require web search via Tavily unless a fresh web source already exists for the exact topic.
4. Build or update `indexes/docs-index.md`.
5. Build a candidate outline.
6. Run initial diagnosis before teaching.
7. Revise the outline using diagnosis results.
8. Teach one small concept.
9. Require learner restatement and a learner-owned example.
10. Correct errors, fuzzy points, logical jumps, and missing examples.
11. Score the concept.
12. Record progress and review metadata.

## Scoring Gate

Score each concept from 0 to 10 on:

- accuracy
- simplicity
- completeness
- example ability
- transfer ability

The learner passes only when average score is at least 7 and every individual dimension is at least 6. If the learner does not pass, keep the current concept active and remediate.

## Review

Only enter review when the user explicitly invokes review or asks to review. Review should prioritize misconceptions, low scores, stale concepts, and prerequisites for upcoming outline nodes.

## Persistence

Before ending a session, ensure the project files capture the precise continuation point:

- current state
- outline node
- concept
- learner summary
- misconceptions
- latest scores
- next action
- next sentence to say when continuing

If file-writing tools are unavailable, produce the exact patch or JSON/Markdown content that must be written.
