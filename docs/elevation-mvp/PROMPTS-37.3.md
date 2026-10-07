# Elevation Lab — Codex Prompts, Step 266 (round 37.3: T-fillers numbered beside their seam)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-37.3.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 266 | Model: a seam T's part number comes right after the cabinets it splits off | 801 |

**Branch:** `elevation-grid-run-split`. The baseline after step 265 is **800**. Confirm it with `npm test`; if it differs, shift the counts.

The SPEC's code wasn't run before this prompt was written. If a test fails, check its expected value against SPEC-37.3 §1 before changing the code, and say so in the summary.

---

## Step 266 — Model: number a seam T beside its seam

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.3.md. Step 265 is in.
If `git status` shows uncommitted changes, stop and tell me.

In partNumbers.js runParts, a seam T-filler is no longer appended after all the run's pieces: it goes right after the part it follows (teeAnchor). A vertical T follows the last part of the boxes on its left, a horizontal T the first of the boxes below it. A T with no anchor still goes after the pieces. End Ts, L-shaped end panels and face frames are unchanged.

Write the source change as the SPEC gives it. Make the test edits exactly as the SPEC gives them, and append the new test VERBATIM; don't mock anything.

Files (only these):
- src/elevation/model/partNumbers.js (303): add teeAnchor above runParts; runParts' return only
- src/elevation/model/__tests__/teeParts.test.js (133): the two expectation edits and the one new test

DO NOT touch wallBadgeGroups, orderedParts, tees.js, cells.js or any component. DO NOT grep the repo or open other files.

First make the test edits and run them: the changed and new tests must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/teeParts.test.js src/elevation/model/__tests__/partNumbers.test.js`. At the end, run `npm test && npm run lint` once: 800 + 1 = 801. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 266 T-fillers numbered beside their seam".
```

**Check after 266 (by hand):**

1. A Euro run with T-fillers: the badges read cabinet, T, cabinet, T, cabinet left to right (e.g. 2, 3, 4, 5, 6), not all the Ts at the end.
2. A stacked column with a horizontal T: lower cabinet, T, upper cabinet.
