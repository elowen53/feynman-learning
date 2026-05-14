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

A separate `concept-notes/index.json` file is the canonical table of contents for these notes. Both `feynman_write_concept_note` and `feynman_record_score` upsert into it through `withFileMutationQueue()`, so each entry stays current with the concept's path, state, last score, and active misconceptions. The agent reads this file first when locating a note, choosing review targets, or reporting status, instead of scanning the directory.

Each entry has the shape:

```json
{
  "outline_node": "transformer-basics",
  "concept": "self-attention",
  "path": "/.../concept-notes/transformer-basics/self-attention.md",
  "state": "LEARNING_CONCEPT",
  "first_written_at": "2026-05-14T10:30:00Z",
  "last_updated_at": "2026-05-14T11:05:00Z",
  "last_score": { "average": 8.2, "min_dimension": 7, "passed": true, "recorded_at": "..." },
  "active_misconceptions": []
}
```

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
