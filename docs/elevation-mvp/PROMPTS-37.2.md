# Elevation Lab — Codex Prompts, Steps 264–265 (round 37.2: the L drawn over the box, mitered in plan)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-37.2.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 264 | Model: the L is mitered in plan, flush with the T-fillers | 800 |
| 265 | Screen: end Ts and Ls draw over the box they cover | 800 |

**Branch:** `elevation-grid-run-split`. The baseline after step 263 is **800**. Confirm it with `npm test`; if it differs, shift the counts.

The SPEC's code wasn't run before these prompts were written. If a test fails, check its expected value against SPEC-37.2 §1 before changing the code, and say so in the summary.

---

## Step 264 — Model: the L is mitered in plan

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.2.md §1 and §2. Step 263 is in.
If `git status` shows uncommitted changes, stop and tell me.

In planRunPieces, an L-shaped end panel (an entry in teeFillers' `ells`) is drawn as two mitered polygons instead of two rectangles: the panel runs to the T-fillers' front (run.depth + teeThickness) and gets a polygon; its lip spans the panel and the box edge it covers, from the box face to that same front, with the matching polygon. A plain end panel is unchanged.

Write the source change as the SPEC gives it. Replace the one test the SPEC names with the SPEC's version, VERBATIM; don't mock anything.

Files (only these):
- src/elevation/model/planPieces.js (337): planRunPieces only
- src/elevation/model/__tests__/teeEnds.test.js (184): the one test at 164–171 only

DO NOT touch PlanRunFootprint.jsx (it already draws `polygon`), frameStrips, planFaces, tees.js or dimensions.js. DO NOT grep the repo or open other files.

First replace the test and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/teeEnds.test.js src/elevation/model/__tests__/teePlan.test.js`. At the end, run `npm test && npm run lint` once: still 800. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 264 L-shaped end panel mitered in plan".
```

**Check after 264 (by hand):**

1. Plan view, a Euro run with T-fillers and an end panel: the panel and its lip are one L with a miter line at the corner, flush with the T-fillers' fronts.
2. Turn the end panel to Plain panel: one rectangle to the door face, as before.

---

## Step 265 — Screen: end Ts and Ls draw over the box they cover

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.2.md §3. Step 264 is in.
If `git status` shows uncommitted changes, stop and tell me.

In RunGroup's drawnPieces, draw the widened end pieces (end Ts and L-shaped end panels, the ids in `endTees`) after every other piece and before the seam Ts, so a left end's 3/4" over the box isn't hidden under the box.

Write the change as the SPEC gives it.

Files (only these):
- src/elevation/components/RunGroup.jsx (626): the last line of drawnPieces only

DO NOT touch PieceRect, the model or the store. DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 800.

At most five lines of summary. Commit "elevation-mvp: step 265 End Ts and Ls draw over the box".
```

**Check after 265 (by hand):**

1. Elevation: an L-shaped end panel at the **left** end is 1 1/2" wide (1 9/16" with a 13/16" panel) and covers the box's edge, the same as at the right end. A left end T does too.
2. Click the 3/4" over the box: it selects the end panel (or T), not the box.
