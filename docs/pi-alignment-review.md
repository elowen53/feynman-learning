# Pi Alignment Review

This document records the main gaps between the current Feynman Learning agent design and the latest Pi design philosophy.

Reviewed against: https://pi.dev/docs/latest

## Summary

The project generally fits Pi's extension model: it is packaged as a Pi package and uses TypeScript extensions, skills, and prompt templates instead of modifying Pi core behavior.

The main improvement area is strictness. Today, the learning state machine is mostly enforced through prompts and long protocol text. For a stricter and more Pi-native design, critical state transitions and file writes should move into extension tools.

## Gaps And Recommendations

### 1. System Prompt Injection Is Too Heavy

Current design:

- `.pi/extensions/feynman-protocol.ts` injects the full `AGENTS.md` into the system prompt through `before_agent_start`.
- `AGENTS.md` contains the complete learning protocol, state machine, scoring rules, persistence rules, and output style.

Why this is not ideal:

- Pi encourages keeping the core small and loading workflow-specific behavior through extensions, skills, prompt templates, and packages.
- Pi skills are designed for on-demand capability loading. A very large always-on protocol weakens that progressive-disclosure model.
- Injecting the full protocol every turn increases context cost and makes the agent less flexible when only a narrow command is being used.

Recommendation:

- Keep only hard, always-on rules in `AGENTS.md` or the injected prompt.
- Move detailed state machine guidance, scoring rubrics, and concept-note templates into `.pi/skills/feynman-coach/SKILL.md`.
- Let prompt templates explicitly require the `feynman-coach` skill for learning commands.

Target shape:

```text
AGENTS.md
  - role identity
  - non-negotiable constraints
  - where learning projects live

.pi/skills/feynman-coach/SKILL.md
  - full workflow
  - state machine details
  - scoring rules
  - concept-note template
  - persistence protocol
```

### 2. State Machine Is Prompt-Enforced, Not Tool-Enforced

Current design:

- The learning states are defined in text:
  - `COLLECTING_GOAL`
  - `INGESTING_SOURCES`
  - `BUILDING_OUTLINE`
  - `DIAGNOSING`
  - `LEARNING_CONCEPT`
  - `WAITING_RESTATEMENT`
  - `CORRECTING`
  - `SCORING`
  - `NODE_SUMMARY`
  - `REVIEWING`
  - `ENDED`
- The agent is instructed not to skip steps, but there is no tool-level validation.

Why this is not ideal:

- A model can still skip a step, forget to write progress, or move to the next concept without satisfying the score gate.
- The stricter the workflow, the less it should depend on prompt obedience alone.

Recommendation:

Add extension tools that make the workflow explicit and validate transitions:

```text
feynman_read_project
feynman_update_progress
feynman_write_concept_note
feynman_record_score
feynman_validate_transition
feynman_append_session_note
```

Expected benefits:

- Invalid state transitions can be rejected.
- Progress writes become structured and auditable.
- Score gates can be enforced mechanically.
- Prompt templates can become shorter because tools carry the strict contract.

### 3. Concept Notes Are Prompt-Required But Not Mechanically Guaranteed

Current design:

- The protocol requires every concept to produce a Markdown note under `concept-notes/`.
- The requirement is enforced by instructions in `AGENTS.md`, the skill, and prompt templates.

Why this is not ideal:

- The agent may still forget to write a note before teaching.
- The note structure may drift unless the model follows the template exactly.

Recommendation:

Create a dedicated concept-note tool:

```text
feynman_write_concept_note({
  project,
  outlineNode,
  concept,
  state,
  learningGoal,
  intuitiveExplanation,
  preciseDefinition,
  mechanismSteps,
  minimalExample,
  misconceptions,
  relationToNeighborConcepts,
  restatementTask,
  checkQuestions,
  learnerOutputAndCorrections
})
```

The tool should:

- derive the canonical file path
- create missing directories
- write or update Markdown using a stable template
- return the note path
- optionally update `progress.json.current_concept_note`

### 4. File Mutation Safety Could Be Better

Current design:

- `feynman_tavily_search` writes Markdown files directly with Node's `writeFile`.
- It writes timestamped files, so collision risk is low.

Why this is not ideal:

- Pi extension documentation recommends file mutation coordination for custom tools that modify files.
- Future tools will likely update shared files such as `progress.json`, `reviews.json`, and concept notes, where concurrent writes are more likely.

Recommendation:

- Use Pi's file mutation queue utilities for tools that write project state.
- At minimum, use a single serialized write path for:
  - `progress.json`
  - `reviews.json`
  - `outline.md`
  - `concept-notes/**/*.md`

### 5. Runtime State Is External Only

Current design:

- Durable learning state is stored in `~/.pi/feynman-projects/<project>/`.
- Pi session files still capture conversation history, but the learning state is not mirrored into Pi session entries.

Why this is not ideal:

- Pi has a session tree, branching, compaction, and custom extension entries.
- If a user branches a session, the external `progress.json` remains global to the project and may not reflect the branch.

Recommendation:

- Keep project files as the canonical learning record.
- Also call `pi.appendEntry("feynman-progress", data)` at important checkpoints:
  - project created
  - diagnosis completed
  - concept note written
  - score recorded
  - session ended

Expected benefits:

- Better auditability inside Pi sessions.
- Easier recovery after compaction within the same session branch.
- Clearer relation between chat turns and durable learning files.

Branch note:

- Project files under `~/.pi/feynman-projects/<project>/` remain the global source of truth.
- `pi.appendEntry()` mirrors checkpoints into the current Pi session branch. It should not be treated as cross-branch synchronization.

### 6. Search Provider Extensibility Was Claimed But Not Implemented

Current design:

- Earlier docs said Tavily was the default provider and should be extensible.
- Implementation only supports Tavily directly inside `.pi/extensions/feynman-tavily.ts`.

Why this is not ideal:

- The design promise and implementation are slightly misaligned.
- Adding another provider later would require editing the Tavily-specific extension.

Recommendation:

- Short term: narrow the documentation to say Tavily is the only supported provider for now.
- Longer term: introduce a provider abstraction only when a second provider is needed.

Possible shape:

```text
.pi/extensions/search/
  index.ts
  providers/
    tavily.ts
```

The public tool can stay stable:

```text
feynman_web_search({
  project,
  query,
  provider,
  maxResults,
  searchDepth
})
```

## Suggested Implementation Order

1. Add `feynman_write_concept_note` and make `/start` and `/continue` require it before teaching.
2. Split the heavy always-on protocol into a short hard-rule prompt plus a fuller skill, and force-load it from prompt templates with `/skill:feynman-coach`.
3. Add `feynman_update_progress` and `feynman_record_score`, using `withFileMutationQueue()` for shared state writes.
4. Mirror key checkpoints with `pi.appendEntry()`, while keeping project files as the source of truth.
5. Document Tavily as the only currently supported provider.
6. Reconsider `feynman_validate_transition` only after the smaller tool-backed workflow has been exercised.

## Decision

Do not abandon the current package design. It is aligned with Pi at the architecture level.

The next step is to make the strict learning workflow more tool-backed and less dependent on long prompt instructions.
