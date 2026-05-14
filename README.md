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

## Agent Workflow

### Project lifecycle

```mermaid
flowchart TD
    Start(["用户: 我想学 X"]) --> NP["/new-project X"]
    NP --> G1["1. 采集学习目标<br/>COLLECTING_GOAL"]
    G1 --> G2["2. 准备资料<br/>/add-doc + /web-search<br/>→ sources/"]
    G2 --> G3["3. 建立索引<br/>/ingest-docs<br/>INGESTING_SOURCES"]
    G3 --> G4["4. 生成大纲<br/>/build-outline<br/>BUILDING_OUTLINE"]
    G4 --> G5["5. 初始诊断<br/>DIAGNOSING<br/>5 题判定水平"]
    G5 --> G6["6. 费曼循环<br/>每次只讲一个概念"]
    G6 --> G7{"大纲全部完成?"}
    G7 -->|否| G6
    G7 -->|是| G8(["ENDED"])

    G6 -.->|随时| Save["/end<br/>写入精确续点"]
    Save -.->|下次会话| Resume["/continue<br/>从续点恢复"]
    Resume -.-> G6

    G8 -.->|用户主动| Rev["/review<br/>复习低分/误解/陈旧"]
    Rev -.-> G6

    classDef phase fill:#e1f5ff,stroke:#0288d1,color:#000
    classDef cmd fill:#e8f5e9,stroke:#388e3c,color:#000
    classDef done fill:#fce4ec,stroke:#c2185b,color:#000

    class G1,G2,G3,G4,G5,G6 phase
    class NP,Save,Resume,Rev cmd
    class G8 done
```

### Per-concept Feynman loop

```mermaid
flowchart TD
    Begin(["进入一个概念"]) --> N1["feynman_write_concept_note<br/>建立概念讲义文件"]
    N1 --> Teach["对话: 精简导读 + 讲义路径<br/>LEARNING_CONCEPT"]
    Teach --> Ask["要求学习者复述 + 举自己的例子<br/>WAITING_RESTATEMENT"]
    Ask --> Diag["指出错误/模糊/跳跃/缺例<br/>CORRECTING"]
    Diag --> Remed["选择补救:<br/>降难度 · 换类比 · 拆步骤<br/>加反例 · 加边界 · 迁移题"]
    Remed --> N2["feynman_write_concept_note<br/>把纠正与例子回写讲义"]
    N2 --> Score["feynman_record_score<br/>5 维度 0-10:<br/>准确·简洁·完整·举例·迁移"]
    Score --> Gate{"avg ≥ 7 且 min ≥ 6 ?"}
    Gate -->|否 → 自动回 CORRECTING| Diag
    Gate -->|是| Pass(["本概念通过"])
    Pass --> NodeDone{"节点最后一个概念?"}
    NodeDone -->|否| Begin
    NodeDone -->|是| Sum["NODE_SUMMARY<br/>掌握/误解/有效例子/<br/>复习优先级 → progress.json"]
    Sum --> Next(["进入下一节点"])

    classDef tool fill:#fff4e1,stroke:#f57c00,color:#000
    classDef state fill:#e1f5ff,stroke:#0288d1,color:#000
    classDef gate fill:#fce4ec,stroke:#c2185b,color:#000

    class N1,N2,Score tool
    class Teach,Ask,Diag,Remed,Sum state
    class Gate,NodeDone gate
```

橙色块是机械强制的 Pi 工具调用，蓝色块是状态机节点，粉色块是判定门槛，绿色是用户命令入口。完整状态规则在 [`feynman-coach`](.pi/skills/feynman-coach/SKILL.md) skill 中。

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
