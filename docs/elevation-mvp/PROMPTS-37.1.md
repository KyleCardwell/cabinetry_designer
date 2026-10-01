# Elevation Lab — Codex Prompts, Steps 260–263 (round 37.1: T-filler ends)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-37.1.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 260 | Model: a T end at an inside corner is 3/4" narrower; an end panel keeps its own T choice | 794 |
| 261 | Model: L-shaped end panels | 798 |
| 262 | Model: the L in plan and on the dimension chain | 800 |
| 263 | Screen: draw the L, the end panel's L-shape control, shape notes | 800 |

**Branch:** `elevation-grid-run-split`. The baseline after step 259 is **791**. Confirm it with `npm test`; if it differs, shift the counts.

The SPEC gives the code to write and the tests. The code wasn't run before these prompts were written, so if a test fails, check its expected value against SPEC-37.1 §1 before changing the code, and say so in the summary.

---

## Step 260 — Model: the T end at a corner, and the end panel keeps its choice

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.1.md §1 and §2. Step 259 is in.
If `git status` shows uncommitted changes, stop and tell me.

Add endCoverOn(run, side) to styles.js. In room.js endMinWidthsForRun, a Euro run's filler end whose T is on takes settings.teeCover (3/4") off the inside-corner minimum, like SPEC-36.1's face frame reveal. In elevationSlice setRunEnd, clear endFiller[side] for an end panel only when the end type changes to end_panel, so an end panel keeps its T/L choice when its width changes.

Write the source changes as the SPEC gives them. Copy the tests VERBATIM, and don't mock anything.

Files (only these):
- src/elevation/model/styles.js (290): append endCoverOn
- src/elevation/model/room.js (1734): the styles import (line 50) and endMinWidthsForRun (191–207) only
- src/elevation/store/elevationSlice.js (1798): setRunEnd (938–954) only
- src/elevation/model/__tests__/teeEnds.test.js: NEW, verbatim
- src/elevation/store/__tests__/elevationSlice.test.js (2534): append the SPEC's describe block only

DO NOT touch cornerFillerMin, storedEndMinimum, the solver, tees.js or any component. Every caller of endMinWidthsForRun picks the change up as it is; don't edit them. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/teeEnds.test.js src/elevation/store/__tests__/elevationSlice.test.js`. At the end, run `npm test && npm run lint` once: 791 + 3 = 794. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 260 T end at a corner, end panel keeps its choice".
```

**Check after 260 (by hand):**

1. A Euro run anchored into an inside corner with a filler end and T-fillers on: the T's flat is 1 1/2" (it was 2 1/4") and the boxes are 3/4" wider. Turn the end's T-filler to Plain filler: the filler goes back to 1 1/2".

---

## Step 261 — Model: L-shaped end panels

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.1.md §1 and §3. Step 260 is in.
If `git status` shows uncommitted changes, stop and tell me.

In tees.js, teeFillers also returns `ells`: an end panel at a run end whose endCoverOn is true is L-shaped, its face the panel's width plus teeCover, and it covers the box beside it (so the existing reveal code gives REV-005/006). Ls get an 'L-shape' note and no rabbet note: rabbets now come from T covers only. Use endCoverOn in the end-filler loop too.

Write the source changes as the SPEC gives them (items 1–7). Copy the tests VERBATIM, and don't mock anything.

Files (only these):
- src/elevation/model/tees.js (268)
- src/elevation/model/__tests__/teeEnds.test.js: the import hunk and the appended block in the SPEC

DO NOT touch faceLayouts.js or styles.js: they already read `covers`. DO NOT touch partNumbers, planPieces, dimensions or any component (steps 262–263). Every existing SPEC-37 test must still pass unchanged. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/teeEnds.test.js src/elevation/model/__tests__/tees.test.js src/elevation/model/__tests__/teeParts.test.js`. At the end, run `npm test && npm run lint` once: 794 + 4 = 798. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 261 L-shaped end panels".
```

**Check after 261 (by hand):**

1. A Euro run with an end panel and T-fillers on: the door beside the panel sits 27/32" (single) or 13/16" (pair) in from the box edge. The panel itself still draws at its own width until step 263.

---

## Step 262 — Model: the L in plan and on the dimension chain

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.1.md §1 and §4. Step 261 is in.
If `git status` shows uncommitted changes, stop and tell me.

planRunPieces adds each L's lip to the faces (key `${id}:lip`, kind 'end_panel', from the box face to the panel's front). runInnerSegments gives an L-shaped end panel one 'piece' segment across its whole face.

Write the source changes as the SPEC gives them. Copy the tests VERBATIM, and don't mock anything.

Files (only these):
- src/elevation/model/planPieces.js (333): planRunPieces only
- src/elevation/model/dimensions.js (705): runInnerSegments only
- src/elevation/model/__tests__/teeEnds.test.js: the two imports and the appended block in the SPEC

DO NOT touch PlanRunFootprint.jsx (it draws faces generically), the end panel's own plan piece, the vertical chains or the outer chains. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/teeEnds.test.js src/elevation/model/__tests__/teePlan.test.js src/elevation/model/__tests__/teeChains.test.js`. At the end, run `npm test && npm run lint` once: 798 + 2 = 800. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 262 The L in plan and on the chain".
```

**Check after 262 (by hand):**

1. Plan view: an L-shaped end panel shows its lip across the front of the box beside it.
2. The horizontal chain reads L (1 1/2", or 1 9/16" with a 13/16" panel) | box | T | box.

---

## Step 263 — Screen: draw the L, the L-shape control, shape notes

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.1.md §5. Step 262 is in.
If `git status` shows uncommitted changes, stop and tell me.

RunGroup draws an L-shaped end panel at its face width (the Ls join the end-T map in drawnPieces). EndFields gets an "L-shape" select for an end panel (Follow run / L-shape / Plain panel), dispatching setRunEndFiller with key 'tFiller' like the end filler's T-filler select. PieceProperties shows 'T-shape' or 'L-shape' first in an end piece's notes line.

Write the changes as the SPEC gives them.

Files (only these):
- src/elevation/components/RunGroup.jsx (623): the tees memo and drawnPieces (154–175) only
- src/elevation/components/properties/EndFields.jsx (150)
- src/elevation/components/properties/PieceProperties.jsx (189): the notes line only

DO NOT touch the store or the model: every action and value these use already exists. DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 800.

At most five lines of summary. Commit "elevation-mvp: step 263 L-shaped end panel controls".
```

**Check after 263 (by hand):**

1. A Euro run with T-fillers and an end panel: the panel draws 1 1/2" wide over the box edge (1 9/16" with a 13/16" panel width).
2. The end panel's L-shape: Plain panel draws it at its own width again and the door moves back to its normal reveal; L-shape turns it on even with the run's T-fillers off.
3. Change the panel's width: the L-shape choice stays. Change the end to a filler and back: it's Follow run again.
4. Select the end panel: its notes start with "L-shape"; select an end T: "T-shape".
