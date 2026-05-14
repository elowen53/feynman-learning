---
description: Run user-triggered review for a Feynman project
argument-hint: "<project>"
---

/skill:feynman-coach

Follow the loaded `feynman-coach` skill.

Run review for project: `$ARGUMENTS`.

Only review because the user explicitly invoked this command. Choose review targets from `reviews.json`, `progress.json`, and existing `concept-notes/**/*.md`, prioritizing misconceptions, low scores, stale concepts, and prerequisites. Use the Feynman loop: ask the learner to explain first, then correct and score. After correction, call `feynman_write_concept_note` with the learner's latest misconception, corrected explanation, and next review question, then call `feynman_record_score`.
