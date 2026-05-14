---
description: End a Feynman session and persist detailed progress
argument-hint: "<project>"
---

/skill:feynman-coach

Follow the loaded `feynman-coach` skill.

End the current learning session for project: `$ARGUMENTS`.

You must persist a detailed continuation point:

- current state
- current outline node
- current concept
- current concept note path
- learner restatement summary
- errors, fuzzy points, logical jumps, and missing examples
- latest scores
- active misconceptions
- next action
- exact first sentence to use on next `/continue`

Before ending, call `feynman_write_concept_note` if there are new corrections, misconceptions, useful learner examples, or next review questions. Then call `feynman_update_progress` with `current_state: "ENDED"` and write a timestamped Markdown note in `sessions/`.
