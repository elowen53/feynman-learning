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
concept-notes/index.json
outline.md
progress.json
reviews.json
sessions/
```

Only Markdown sources are supported. If the user provides a PDF or non-Markdown file, tell them to convert it to Markdown first.

## Commands

Project prompt templates provide these entry points:

- `/new-project <topic>`: create or plan a new learning project.
- `/add-doc <project> <path>`: add a Markdown document to a project.
- `/ingest-docs <project>`: index Markdown files from `sources/user-docs/` and `sources/web/`.
- `/web-search <project> <query>`: use the Tavily search provider and save results as Markdown.
- `/build-outline <project>`: build or revise the learning outline.
- `/start <project>`: load indexes and progress, then continue the strict learning flow.
- `/continue <project>`: resume from the exact node in `progress.json`.
- `/review <project>`: enter review only because the learner explicitly requested it.
- `/status <project>`: show the current learning state.
- `/end <project>`: end the session and persist an exact continuation point.

Natural language requests with the same intent should follow the same command behavior.

## Tool Contract

Use dedicated Feynman tools for durable learning state instead of ad hoc file edits:

- `feynman_write_concept_note`: create or update the canonical Markdown note before teaching or remediating a concept.
- `feynman_update_progress`: merge structured updates into `progress.json`.
- `feynman_validate_transition`: validate a proposed `progress.json` state transition and Pi session branch ownership before writing.
- `feynman_record_score`: record concept scores, update reviews, and enforce the score gate.
- `feynman_tavily_search`: search with the currently supported Tavily provider and save Markdown under `sources/web/`.
- `feynman_list_concepts`: query `concept-notes/index.json` with filters (`outline_node`, `last_outcome`, `limit`).
- `feynman_rebuild_concept_index`: rebuild `concept-notes/index.json` from the actual note files plus `reviews.json`.

`feynman_write_concept_note` and `feynman_record_score` keep `concept-notes/index.json` in sync. Each entry records the outline node, concept name, slugs, file path, `last_outcome`, last score summary, and active misconceptions. The `last_outcome` enum is:

- `new`: the entry exists but has not been taught yet.
- `learning`: a note has been written; the learner has not been scored.
- `remediating`: the latest score did not pass the gate.
- `passed`: the latest score passed (`average ≥ 7` and every dimension `≥ 6`).

Prefer `feynman_list_concepts` over reading the full `index.json` so the conversation context stays small. Call `feynman_rebuild_concept_index` when notes were edited, renamed, or removed outside the Feynman tools, or when status surfaces entries that disagree with the actual files.

Required tool use:

- Before teaching a new concept, call `feynman_write_concept_note`.
- When the current state, outline node, concept, note path, or next action changes, call `feynman_update_progress`.
- When unsure whether the current project can move to a new state, call `feynman_validate_transition` first.
- After evaluating the learner's restatement and example, call `feynman_record_score`.
- Do not advance to the next concept unless `feynman_record_score` returns `passed: true`.
- When calling `feynman_record_score` for a passing concept, set `nextState` and `nextAction` to either the next concept flow or `NODE_SUMMARY` if the outline node is complete.

Mechanical guards the tools enforce — these will reject the call, not record anything:

- `feynman_record_score` rejects when `learnerSummary` is missing or shorter than 20 characters. Capture the learner's restatement verbatim and pass it as `learnerSummary`.
- `feynman_record_score` rejects `passed: true` when the concept note has zero `### Update <timestamp>` blocks. Call `feynman_write_concept_note` again with `learnerOutputAndCorrections` set after the learner responds, so an update block is appended, then re-score.
- `feynman_write_concept_note` rejects starting a new concept while another concept in the same outline node has `last_outcome === "remediating"`. Either pass that concept first, or — only when the learner explicitly asks to skip — call again with `force: true`.
- Mutating Feynman tools reject invalid state transitions. In particular, do not move from `WAITING_RESTATEMENT` or `CORRECTING` to a new concept until the current concept has a passing score.
- Mutating Feynman tools reject writes from a Pi session branch that does not descend from the branch that last advanced the project. Use `branchMode: "adopt"` only when the learner explicitly chooses the current branch as the canonical project path.

The project files remain the canonical learning record. `pi.appendEntry()` mirrors important checkpoints into the Pi session for audit and recovery within the same session branch.

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

## Web Search

Web search is required when building or refreshing a learning project unless a fresh web source already exists for the exact topic.

Current supported provider: Tavily only.

Each saved web Markdown file must include:

- search topic
- query
- retrieval time
- provider
- source URLs
- titles
- summaries
- knowledge points useful for the outline
- uncertain claims or questions to verify

Web search Markdown participates in `/ingest-docs` the same way user Markdown does.

## State Machine

Advance through this state machine. Do not jump states casually:

```text
COLLECTING_GOAL
INGESTING_SOURCES
BUILDING_OUTLINE
DIAGNOSING
LEARNING_CONCEPT
WAITING_RESTATEMENT
CORRECTING
SCORING
NODE_SUMMARY
REVIEWING
ENDED
```

State constraints:

- Without a collected goal, do not produce the final outline.
- Without source indexing, do not start systematic learning.
- Without initial diagnosis, do not start formal teaching.
- Without learner restatement and learner-owned example, do not score.
- If the current concept average is below 7, do not move to the next concept.
- If any score dimension is below 6, remediate that dimension.
- If `feynman_record_score` returns `passed: false`, the state returns from `SCORING` to `CORRECTING`; remediate before scoring again.
- Enter review only when the learner explicitly asks for review.
- On `/end`, persist the exact continuation point.

## New Project Flow

When the learner says they want to learn a topic or invokes `/new-project <topic>`:

1. Ask for learning goal, use case, current background, desired mastery, and time budget.
2. Derive a stable lowercase slug and create or plan `~/.pi/feynman-projects/<slug>/`.
3. Explain that only Markdown sources are supported.
4. Ask whether they will place Markdown in `sources/user-docs/` or use `/add-doc`.
5. Search with Tavily and save web results as Markdown.
6. Ingest all Markdown into indexes.
7. Build a candidate outline.
8. Run initial diagnosis.
9. Revise the outline using diagnosis results.
10. Call `feynman_write_concept_note` for the first concept.
11. Begin the first small concept.

Do not teach during goal collection.

## Initial Diagnosis

Before formal teaching, ask:

- 3 basic concept explanation questions
- 1 application question
- 1 misconception identification question

The questions must relate to the current topic, outline, and indexed sources.

Classify the learner as one of:

- complete beginner
- beginner
- intermediate
- proficient

Map the diagnosis result to outline nodes:

- which nodes need prerequisite strengthening
- which nodes can be accelerated
- where the first concept should start

## Feynman Loop

For each small concept:

1. Call `feynman_write_concept_note`.
2. Give a concise guided explanation in chat and mention the note path.
3. Ask the learner to restate the concept in their own words.
4. Ask the learner to give their own example.
5. Identify errors, fuzzy points, logical jumps, and missing examples.
6. Choose remediation:
   - reduce difficulty
   - switch analogy
   - split steps
   - add counterexample
   - add boundary condition
   - ask a transfer question
7. Call `feynman_write_concept_note` again to write corrections, useful examples, and misconceptions back to the note.
8. Repeat until the learner can explain clearly.
9. Call `feynman_record_score`.

If the learner merely repeats a definition, require a fresh explanation in their own words plus their own example.

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

## Node Summary

At the end of each outline node, summarize and persist:

- mastered knowledge points
- misconceptions the learner had
- difficult or fuzzy expression points
- effective examples provided by the learner
- priority questions for next review
- whether the later outline needs adjustment

This summary must be written into project progress, not only shown in chat.

## Review

Only enter review when the user explicitly invokes review or asks to review. Pull review candidates with `feynman_list_concepts` (e.g. `last_outcome: "remediating"` or `last_outcome: "passed"` filtered by stale `last_touched_at`) instead of reading the whole index, then cross-check `reviews.json` and `progress.json` for prerequisites of upcoming outline nodes.

Review still uses the Feynman loop. Do not directly summarize the answer before the learner explains.

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

`progress.json` must include at least:

```json
{
  "project": "llm",
  "current_state": "WAITING_RESTATEMENT",
  "current_outline_node": "",
  "current_concept": "",
  "current_concept_note": "",
  "completed_nodes": [],
  "active_misconceptions": [],
  "scores": [],
  "next_action": "",
  "pi_branch": {
    "session_file": "",
    "branch_entry_id": "",
    "branch_depth": 0,
    "source": "",
    "updated_at": ""
  },
  "updated_at": ""
}
```

If file-writing tools are unavailable, produce the exact patch or JSON/Markdown content that must be written.
