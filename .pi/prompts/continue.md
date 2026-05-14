---
description: Continue from the exact saved learning node
argument-hint: "<project>"
---

/skill:feynman-coach

Follow the loaded `feynman-coach` skill.

Continue project: `$ARGUMENTS`.

Load the saved progress and resume from `progress.json.next_action`. If `progress.json.current_concept_note` exists, load that Markdown note first. If `sessions/` contains a latest session note, use it to recover the exact continuation sentence. Do not restart the topic unless the saved state requires rebuilding.

If the next action is to teach or remediate a concept, call `feynman_write_concept_note` before asking the learner to respond. In chat, keep the explanation concise, mention the concept note path, and require restatement plus a learner-owned example when the state calls for it. Do not advance after the learner answers until `feynman_record_score` returns `passed: true`.
