# Feynman Learning Pi Agent

A strict Feynman learning coach for [Pi Coding Agent](https://pi.dev/).

This package turns Pi into a single-learner, multi-project learning coach that:

- creates persistent learning projects under `~/.pi/feynman-projects/`
- ingests Markdown learning materials
- searches the web with Tavily and stores search results as Markdown
- builds a learning outline from indexed sources
- diagnoses the learner before teaching
- teaches one small concept at a time
- saves a durable Markdown note for every taught concept
- requires restatement and learner-owned examples
- scores each concept before advancing
- enforces progress and score writes through dedicated Pi tools
- records detailed progress for continuation
- runs review only when the learner explicitly asks

## Requirements

- Node.js compatible with Pi Coding Agent
- Pi Coding Agent installed
- Tavily API key for web search

```bash
npm install -g @earendil-works/pi-coding-agent
export TAVILY_API_KEY="your_tavily_api_key"
```

## Install From GitHub

Install this package from GitHub:

```bash
pi install git:github.com/elowen53/feynman-learning
```

Or pin a tag:

```bash
pi install git:github.com/elowen53/feynman-learning@v0.1.0
```

You can also test a checkout directly:

```bash
pi install /absolute/path/to/feynman-learning
```

## Local Development

From this repository:

```bash
pi
```

Pi will auto-discover project-local resources in `.pi/`.

## Main Commands

Prompt templates:

- `/new-project <topic>`: create a new learning project
- `/add-doc <project> <path-to-md>`: add a Markdown source
- `/web-search <project> <query>`: ask the agent to search and save results
- `/ingest-docs <project>`: index Markdown sources
- `/build-outline <project>`: build or revise the learning outline
- `/start <project>`: start strict learning
- `/continue <project>`: continue from the saved node
- `/review <project>`: run user-triggered review
- `/status <project>`: show current learning state
- `/end <project>`: persist the exact continuation point

Extension command:

- `/feynman-search <project> <query>`: queue a Tavily search request

Use `/web-search` when you want the prompt template to guide the agent through the search workflow. Use `/feynman-search` when you want the extension command to queue a Tavily tool request directly.

Custom tools:

- `feynman_tavily_search`: searches Tavily and saves results to Markdown
- `feynman_write_concept_note`: writes the durable Markdown note for a concept
- `feynman_update_progress`: updates project progress with serialized file writes
- `feynman_record_score`: records scores and enforces the pass threshold

The package also includes a protocol extension that appends the short `AGENTS.md` hard rules to Pi's system prompt when the package is installed globally or from GitHub. Detailed workflow rules live in the `feynman-coach` skill and are loaded by the prompt templates with `/skill:feynman-coach`. When you run Pi inside this repository, Pi may already load `AGENTS.md`; the extension avoids duplicating it.

## Strict Workflow Guarantees

`feynman_record_score` mechanically enforces the pass threshold: average score must be at least 7 and every dimension must be at least 6. If a concept does not pass, the tool moves the project state back to `CORRECTING`, so the agent must remediate before advancing. Full state rules live in the `feynman-coach` skill.

## Project Data Layout

Learner data is stored outside this repository:

```text
~/.pi/feynman-projects/<project>/
  project.json
  sources/
    user-docs/
    web/
  indexes/
    docs-index.md
    concepts-index.json
    source-map.json
  concept-notes/
  outline.md
  progress.json
  reviews.json
  sessions/
```

Only Markdown sources are supported. Convert PDFs or other formats to Markdown before ingestion.

Concept notes are saved under:

```text
~/.pi/feynman-projects/<project>/concept-notes/<outline-node-slug>/<concept-slug>.md
```

They are the long-term knowledge base for taught concepts. The chat stays concise, while each note captures the explanation, definition, mechanism, examples, misconceptions, restatement task, and review questions.

## Recommended Workflow

```text
/new-project llm
/add-doc llm /path/to/notes.md
/feynman-search llm "large language model fundamentals"
/ingest-docs llm
/build-outline llm
/start llm
```

At the end of a session:

```text
/end llm
```

Later:

```text
/continue llm
```

Review is explicit:

```text
/review llm
```

## Package Contents

- `AGENTS.md`: short hard-rule protocol for project-local use
- `.pi/extensions/feynman-protocol.ts`: injects short hard rules when used as a Pi package
- `.pi/extensions/feynman-state.ts`: concept note, progress, and score tools
- `.pi/skills/feynman-coach/SKILL.md`: reusable Feynman workflow skill
- `.pi/prompts/*.md`: command prompt templates
- `.pi/extensions/feynman-tavily.ts`: Tavily search extension
- `docs/pi-alignment-review.md`: Pi alignment review and optimization plan
- `docs/design.md`: design notes

## Publish To GitHub

Initialize git if needed:

```bash
git init
git add .
git commit -m "Initial Feynman learning Pi agent"
```

Create a GitHub repository, then:

```bash
git remote add origin https://github.com/elowen53/feynman-learning.git
git branch -M main
git push -u origin main
```

Tag a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Then install with:

```bash
pi install git:github.com/elowen53/feynman-learning@v0.1.0
```
