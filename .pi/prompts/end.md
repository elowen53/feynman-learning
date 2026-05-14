---
description: End a Feynman session and persist detailed progress
argument-hint: "<project>"
---

Use the `feynman-coach` skill.

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

Before ending, update the current `concept-notes/**/*.md` file with any new corrections, misconceptions, useful learner examples, and next review questions. Then update `progress.json`, `reviews.json`, and write a timestamped Markdown note in `sessions/`.
