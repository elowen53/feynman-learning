---
description: Search the web with Tavily and store results as Markdown
argument-hint: "<project> <query>"
---

/skill:feynman-coach

Follow the loaded `feynman-coach` skill.

Search the web for project and query: `$ARGUMENTS`.

Use `feynman_tavily_search`. Tavily is the only currently supported provider. Save the result as Markdown under:

```text
~/.pi/feynman-projects/<project>/sources/web/
```

The Markdown must include source URLs, retrieval time, provider, title, summary, useful knowledge points, and open questions. After searching, tell the learner to run `/ingest-docs <project>`.
