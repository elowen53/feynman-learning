# Feynman Learning Pi Agent Design

## Scope

This agent serves one learner and manages many learning projects. Project data is stored globally in:

```text
~/.pi/feynman-projects/
```

The coding repository stores only the agent protocol, prompts, skills, and extensions.

## Concept Notes

Each taught concept is persisted as a Markdown note under:

```text
~/.pi/feynman-projects/<project>/concept-notes/<outline-node-slug>/<concept-slug>.md
```

The note is the durable knowledge artifact. Chat output should stay focused on the current learning action, while the note stores the fuller explanation, boundaries, mechanism, examples, misconceptions, restatement task, and review questions.

Markdown is canonical because the rest of the project indexing pipeline is Markdown-first. HTML may be generated as an additional display artifact when requested, but it should not replace the Markdown note.

The `feynman_write_concept_note` tool owns concept-note writes. It derives the canonical path, writes the stable Markdown structure, updates `progress.json.current_concept_note`, and mirrors the checkpoint with `pi.appendEntry()`.

A separate `concept-notes/index.json` file is the canonical table of contents for these notes. Both `feynman_write_concept_note` and `feynman_record_score` upsert into it through `withFileMutationQueue()`. Upserts are keyed on the slugified `(outline_node, concept)` pair, so casing or spacing variants collapse to a single entry that always points to the same `.md` file.

Each entry has the shape:

```json
{
  "outline_node": "Transformer Basics",
  "concept": "Self Attention",
  "outline_node_slug": "transformer-basics",
  "concept_slug": "self-attention",
  "path": "/.../concept-notes/transformer-basics/self-attention.md",
  "last_outcome": "passed",
  "first_written_at": "2026-05-14T10:30:00Z",
  "last_updated_at": "2026-05-14T11:05:00Z",
  "last_touched_at": "2026-05-14T11:05:00Z",
  "last_score": { "average": 8.2, "min_dimension": 7, "passed": true, "recorded_at": "..." },
  "active_misconceptions": []
}
```

`last_outcome` is the concept's own state, distinct from the project state machine: `new` (entry exists, not taught), `learning` (note written, not yet scored), `remediating` (latest score did not pass the gate), `passed` (latest score passed). The agent reads it through:

- `feynman_list_concepts({ project, outline_node?, last_outcome?, limit? })` — filtered query that keeps the conversation context small.
- `feynman_rebuild_concept_index({ project })` — rebuilds the entire index by walking `concept-notes/**/*.md` and joining with the latest `reviews.json` entries; use after manual edits or when the index has drifted.

## Source Policy

Supported source type:

- Markdown (`.md`)

Unsupported source types:

- PDF
- images
- Office documents
- arbitrary binary files

Users must convert unsupported materials to Markdown before ingestion.

## Network Search

Tavily is the only currently supported search provider. Search results are not transient context; they are converted into Markdown and stored under:

```text
~/.pi/feynman-projects/<project>/sources/web/
```

This keeps web knowledge auditable and indexable alongside user-provided Markdown.

## State Tools

Strict learning state should be maintained by tools instead of ad hoc prompt-only file edits:

- `feynman_update_progress` updates `progress.json`.
- `feynman_record_score` records scores, updates review metadata, and enforces the pass threshold.
- Shared state writes use Pi's `withFileMutationQueue()` so concurrent tool calls do not overwrite each other.
- Important checkpoints are mirrored with `pi.appendEntry()`, while project files remain the source of truth.

## Passing Threshold

A concept is passed only when:

- average score across five dimensions is at least 7
- no individual dimension is below 6

The five dimensions are accuracy, simplicity, completeness, example ability, and transfer ability.

## Review Policy

The agent does not interrupt normal learning for scheduled review. Review starts only when the user explicitly invokes `/review <project>` or asks to review.
