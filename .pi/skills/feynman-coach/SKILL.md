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
concept-notes/
outline.md
progress.json
reviews.json
sessions/
```

Only Markdown sources are supported. If the user provides a PDF or non-Markdown file, tell them to convert it to Markdown first.

## Concept Notes

Every taught concept must be saved as a durable Markdown note before or while it is taught:

```text
concept-notes/<outline-node-slug>/<concept-slug>.md
```

Markdown is the canonical record. If the learner explicitly asks for HTML, an additional `.html` version may be generated beside the Markdown file.

Each concept note should include:

- title, outline node, date, and learning state
- learning goal
- intuitive explanation
- precise definition and boundaries
- mechanism or step-by-step process
- minimal learner-relevant example
- counterexample or common misconceptions
- relation to previous and next concepts
- Feynman restatement task
- 1-3 check questions

Use this Markdown structure unless the project already has a stronger local convention:

```markdown
# <Concept>

- Project: <project>
- Outline node: <outline node>
- State: <current state>
- Date: <YYYY-MM-DD>

## Learning Goal

## Intuitive Explanation

## Precise Definition And Boundaries

## Mechanism Steps

## Minimal Example

## Counterexamples And Misconceptions

## Relation To Neighbor Concepts

## Feynman Restatement Task

## Check Questions

## Learner Output And Corrections
```

Do not dump the whole note into chat. Save the note, then give a concise guided explanation, mention the note path, and ask for the learner's restatement and own example.

## Required Flow

1. Collect goal, use case, current background, desired mastery, and time budget.
2. Ingest Markdown sources from `sources/user-docs/` and `sources/web/`.
3. Require web search via Tavily unless a fresh web source already exists for the exact topic.
4. Build or update `indexes/docs-index.md`.
5. Build a candidate outline.
6. Run initial diagnosis before teaching.
7. Revise the outline using diagnosis results.
8. Create or update the Markdown note for the current concept.
9. Teach one small concept with a concise guided explanation.
10. Require learner restatement and a learner-owned example.
11. Correct errors, fuzzy points, logical jumps, and missing examples.
12. Write corrections, useful examples, and misconceptions back to the concept note.
13. Score the concept.
14. Record progress and review metadata.

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
- concept note path
- learner summary
- misconceptions
- latest scores
- next action
- next sentence to say when continuing

If file-writing tools are unavailable, produce the exact patch or JSON/Markdown content that must be written.
