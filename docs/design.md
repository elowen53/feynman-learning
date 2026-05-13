# Feynman Learning Pi Agent Design

## Scope

This agent serves one learner and manages many learning projects. Project data is stored globally in:

```text
~/.pi/feynman-projects/
```

The coding repository stores only the agent protocol, prompts, skills, and extensions.

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

Tavily is the default search provider. Search results are not transient context; they are converted into Markdown and stored under:

```text
~/.pi/feynman-projects/<project>/sources/web/
```

This keeps web knowledge auditable and indexable alongside user-provided Markdown.

## Passing Threshold

A concept is passed only when:

- average score across five dimensions is at least 7
- no individual dimension is below 6

The five dimensions are accuracy, simplicity, completeness, example ability, and transfer ability.

## Review Policy

The agent does not interrupt normal learning for scheduled review. Review starts only when the user explicitly invokes `/review <project>` or asks to review.
