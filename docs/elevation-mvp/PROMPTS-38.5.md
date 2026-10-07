# Elevation Lab — Codex Prompt, Step 286.2 (round 38.5: stacked runs leave the horizontal chains)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run it in a fresh session. Commit pending work first, including these docs (`SPEC-38.5.md`, this file, the updated `PROMPTS-39.md` and `TODO.md`).

| Step | What | Tests after |
|---|---|---|
| 286.2 | A run stacked on or under a run in the same band leaves that band's horizontal chains; DimensionRow keys are unique | 849 |

**Branch:** `elevation-grid-run-split`. The baseline after step 286.1 is **847**. Confirm it with `npm test`; if it differs, shift the counts.

The SPEC's code was run in a scratch copy of `d93e169` before this was written: 849 passing, lint clean. If a test fails, the code was copied wrong; compare it with the SPEC before changing any expectation.

---

## Step 286.2 — Stacked runs leave the horizontal chains

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.5.md. Step 286.1 is in.
If `git status` shows uncommitted changes, stop and tell me.

A run stacked on or under another run in the same band (run.stack.below / run.stack.above pointing to a run of that band) is left out of that band's horizontal chains, inner and outer; the stack's vertical chain already measures it. This removes the overlapping `run` segments that gave DimensionRow duplicate keys (`run:0:101` in G6). DimensionRow also adds the segment index to its key.

Write the code VERBATIM from the SPEC. Add the test changes VERBATIM.

Files (only these):
- src/elevation/model/dimensions.js (735): the ./stacks.js import (≈ 23) and runsForBand (≈ 67–75) only
- src/elevation/components/DimensionRow.jsx (358): the segment Group key (≈ 259) only
- src/elevation/model/__tests__/stacks.test.js (198): the ../dimensions.js import (line 3) and the appended describe block

DO NOT touch neighborSegments, pickColumnRuns, verticalChains, stacks.js, ElevationCanvas.jsx or any other file. DO NOT grep the repo or open other files.

First add the tests and run them: both new tests must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/stacks.test.js src/elevation/model/__tests__/dimensions.test.js`. At the end, run `npm test && npm run lint` once: 847 + 2 = 849. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 286.2 Stacked runs leave the horizontal chains".
```

**Check after 286.2 (by hand):** open G6 with the console open: no duplicate-key warning. Below the elevation, the base's run dimension shows once, and the panel run sitting on it has no horizontal run or piece dimensions (its height is still in the stack's vertical chain). Clicking the base's run dimension selects the base and dragging it still moves it. Clicking the panel run's body still selects it.

**Then:** if G6 or any golden room changed while you checked, re-export `golden.json`. Then start round 39 (`PROMPTS-39.md`, step 287). Every test count in round 39 is **5 higher** than written (baseline 849).
