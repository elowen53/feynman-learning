---
description: Search the web with Tavily and store results as Markdown
argument-hint: "<project> <query>"
---

Use the `feynman-coach` skill.

Search the web for project and query: `$ARGUMENTS`.

Use the Tavily provider through the available Pi extension/tool when possible. Save the result as Markdown under:

```text
~/.pi/feynman-projects/<project>/sources/web/
```

The Markdown must include source URLs, retrieval time, provider, title, summary, useful knowledge points, and open questions. After searching, tell the learner to run `/ingest-docs <project>`.
