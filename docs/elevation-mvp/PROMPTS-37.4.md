# Elevation Lab — Codex Prompts, Steps 267–269 (round 37.4: fixes)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-37.4.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 267 | Fix: selecting a door or window crashes the elevation | 801 |
| 268 | Model: the elevation's wall row shows wing walls too, with or without cabinets | 802 |
| 269 | Plan: a selected run isn't a selected wall, and Delete deletes the run | 802 |

**Branch:** `elevation-grid-run-split`. The baseline after step 266 is **801**. Confirm it with `npm test`; if it differs, shift the counts.

The SPEC's code wasn't run before these prompts were written. If a test fails, check its expected value against SPEC-37.4 §1 before changing the code, and say so in the summary.

---

## Step 267 — Fix: the opening's vertical chain

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.4.md §1.1 and §2. Step 266 is in.
If `git status` shows uncommitted changes, stop and tell me.

Bug: clicking a door or window in the elevation throws "Cannot read properties of undefined (reading 'length')" at ElevationCanvas.jsx:424. The vertical chain for a selected opening comes from verticalOpeningChain, which returns { inner, outer } with no `middle`; the canvas reads vertical.left.middle.length. Make verticalOpeningChain return `middle: []`.

Files (only these):
- src/elevation/model/dimensions.js (713): verticalOpeningChain's return only
- src/elevation/model/__tests__/dimensions.test.js (800): add `middle: [],` to the two verticalOpeningChain expectations in test 23 (748 and 758)

DO NOT touch ElevationCanvas.jsx: with `middle` always an array, its reads are fine. DO NOT grep the repo or open other files.

First edit the test and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/dimensions.test.js`. At the end, run `npm test && npm run lint` once: still 801. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 267 Opening vertical chain has no counter height".
```

**Check after 267 (by hand):**

1. Elevation: click a door, then a window. No crash; the vertical chain at that end shows the opening's heights.

---

## Step 268 — Model: wing walls in the elevation's wall row

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.4.md §1.2 and §3. Step 267 is in.
If `git status` shows uncommitted changes, stop and tell me.

openingChain (the elevation's row below the cabinets) becomes the wall row: every door and window as now (its measure mode, openingId and label unchanged), plus every wing wall landing on this face (landingsOn(room, wall)) as a 'wall' segment at its thickness with its wallId, and gaps between them and to the wall ends. It shows with or without cabinets; [] when the face has none of these.

Write the source change as the SPEC gives it. Append the test VERBATIM; don't mock anything.

Files (only these):
- src/elevation/model/dimensions.js (716): openingChain only
- src/elevation/model/__tests__/wallFaceRow.test.js (60): the import and the appended describe block

DO NOT touch ElevationCanvas.jsx or DimensionRow.jsx (they already draw this row and color 'wall' segments), horizontalChains, wallFaceRow.js or the plan. The existing opening tests in dimensions.test.js must pass unchanged. DO NOT grep the repo or open other files.

First add the test and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/wallFaceRow.test.js src/elevation/model/__tests__/dimensions.test.js`. At the end, run `npm test && npm run lint` once: 801 + 1 = 802. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 268 Wing walls in the elevation's wall row".
```

**Check after 268 (by hand):**

1. Elevation of a wall with a wing wall and no cabinets: the row below reads wall end → wing wall, the wing wall's thickness, → the other end.
2. Add a door and a base run: the same row also has the door, and the cabinet chains above it are unchanged.

---

## Step 269 — Plan: a selected run isn't a selected wall, and Delete deletes it

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.4.md §1.3 and §4. Step 268 is in.
If `git status` shows uncommitted changes, stop and tell me.

In plan, clicking a run sets the active wall and selects the run, so selection.wallId stays set and the wall is highlighted too; Delete then asks to delete the wall. Fix in PlanCanvas.jsx only: selectedWall is null while a run, opening, soffit or wall end panel is selected; the wall highlight uses selectedWall; and Delete/Backspace with a run selected dispatches deleteRun for it. selection.wallId itself doesn't change (the elevation still shows that wall).

Write the changes as the SPEC gives them.

Files (only these):
- src/elevation/plan/PlanCanvas.jsx (1253): line 116, the PlanWallShape isSelected prop (≈ 1019), the keydown effect (427–451) and the elevationSlice import (59–76)

DO NOT touch the store (setActiveWall, setSelection, deleteRun stay as they are), PlanWallShape.jsx, PlanRunFootprint.jsx or the elevation. DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 802.

At most five lines of summary. Commit "elevation-mvp: step 269 Plan run selection and delete".
```

**Check after 269 (by hand):**

1. Plan: click a run. Only the run is highlighted, not its wall, and the wall's move handle doesn't show. Switch to elevation: it shows that run's wall.
2. With the run selected, press Delete: the run is deleted, no wall prompt, the wall stays.
3. Click the wall itself and press Delete: the "Delete this wall and its runs?" prompt still appears.
