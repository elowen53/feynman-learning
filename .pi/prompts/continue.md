---
description: Continue from the exact saved learning node
argument-hint: "<project>"
---

Use the `feynman-coach` skill.

Continue project: `$ARGUMENTS`.

Load the saved progress and resume from `progress.json.next_action`. If `progress.json.current_concept_note` exists, load that Markdown note first. If `sessions/` contains a latest session note, use it to recover the exact continuation sentence. Do not restart the topic unless the saved state requires rebuilding.

If the next action is to teach or remediate a concept, update the concept note before asking the learner to respond. In chat, keep the explanation concise, mention the concept note path, and require restatement plus a learner-owned example when the state calls for it.
