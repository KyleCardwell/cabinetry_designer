# Elevation Lab — Codex Prompts, Steps 270–279 (round 38: recesses and projections)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`SPEC-38.md`, this file, and the updated `ALCOVE-PLAN.md` and `CELLS-PLAN.md`).

| Step | What | Tests after |
|---|---|---|
| 270 | Model: `recesses.js`, the plane-aware `frontDepth` (+ panel-only runs), three readers use `runBackOffset` | 813 |
| 271 | Saves accept recesses, plane ids and recess anchors | 816 |
| 272 | Model: runs on a recess (plane, anchors, top as a soffit, conflicts by depth, warnings, flip) | 822 |
| 273 | Model: drawing, stretching and moving snap to recesses | 825 |
| 274 | Model: recesses in the elevation's wall row and the plan's face rows | 827 |
| 275 | Store: `selection.recessId` (shape only) | 828 |
| 276 | Store: recess reducers, run plane, recess anchors, opening recess, the tool | 832 |
| 277 | Elevation: draw, place, select, delete recesses | 832 |
| 278 | Properties: recess panel, "Sits on", recess anchors, "Set in", warnings | 832 |
| 279 | Plan: notch, bump-out, projection, doors at the recess back, depth from the plane | 833 |

**Branch:** `elevation-grid-run-split`. The baseline after step 269 is **802**. Confirm it with `npm test`; if it differs, shift the counts.

The SPEC's code wasn't run before these prompts were written. If a test fails, check its expected value against SPEC-38 §1 before changing the code, and say so in the summary.

**Codex can't open the app.** 270–276 change nothing on screen except panel-only run depths in plan. 277–279 have hand checks after them.

---

## Step 270 — Model: the recess module

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §1 and §2. Step 269 is in.
If `git status` shows uncommitted changes, stop and tell me.

Add the pure recess module and its tests, add runBackOffset and the plane-aware/panel-only frontDepth to corners.js, and switch three readers from `run.outset ?? 0` to runBackOffset(run). Nothing sets `_plane` yet, so the app behaves as before (except a run made only of panel cells, which now reserves just its depth).

Write recesses.js and its test file VERBATIM from the SPEC; don't mock anything.

Files (only these):
- NEW src/elevation/model/recesses.js
- NEW src/elevation/model/__tests__/recesses.test.js
- src/elevation/model/corners.js (224): the grid.js import, runBackOffset, frontDepth (20–24)
- src/elevation/model/footprints.js (134): line 9 and its corners.js import
- src/elevation/model/planPieces.js (352): line 211 and its corners.js import (line 4)
- src/elevation/model/neighborProfiles.js: line 39 and its corners.js import (line 1)
- src/elevation/model/index.js (367): runBackOffset in the corners block (221–232); the recesses export block appended at the end

DO NOT touch RunGeometrySection.jsx or persistence.js (they read the stored outset on purpose), or any other frontDepth caller (24 references; they all go through frontDepth and need nothing). DO NOT grep the repo or open other files.

First add the test file and run it: it must fail. Then write the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/recesses.test.js src/elevation/model/__tests__/outset.test.js`. At the end, run `npm test && npm run lint` once: 802 + 11 = 813. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 270 Recess module".
```

---

## Step 271 — Saves

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §1 (the shape) and §3. Step 270 is in.
If `git status` shows uncommitted changes, stop and tell me.

Saves accept wall.recesses (validated by a new isRecess), run.recessId, opening.recessId and { to: 'recess', recessId, edge, offset } run anchors, and drop a run's derived `_plane` when saving. No schema bump: every new field is optional.

Write the changes as the SPEC gives them. Add the new test file VERBATIM.

Files (only these):
- src/elevation/store/persistence.js (668): the recesses.js import (after line 18), isRunAnchor (172–190), isRun (after 252), isOpening (343–361), new isRecess after isSoffit (408–416), isWall (after 436–437), toElevationDocument (616–638)
- NEW src/elevation/store/__tests__/recessSaves.test.js

DO NOT touch persistence.test.js (it stays as it is), normalizeDocument or the settings validators (there are no new settings). DO NOT grep the repo or open other files.

First add the test file and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/store/__tests__/recessSaves.test.js src/elevation/store/__tests__/persistence.test.js`. At the end, run `npm test && npm run lint` once: 813 + 3 = 816. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 271 Saves accept recesses".
```

---

## Step 272 — Model: runs on a recess

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §1 and §4. Step 271 is in.
If `git status` shows uncommitted changes, stop and tell me.

A run with recessId sits on that recess: syncRoom derives run._plane (withRunPlane) in its first runs map, so everything after it (heights, anchors, plan) sees it. Recess anchors resolve to the recess edge ± offset and make square corners (runSideCorner); describeAnchor names them; roomDiagnostics adds recessWarnings; a recess top below the ceiling is a soffit for the runs on it (soffitOverRun); runs on different planes only conflict where their plan depths overlap (runsConflict); flipping a wall mirrors its recesses and recess anchor edges.

Write the changes as the SPEC gives them. Add the new test file VERBATIM.

Files (only these; line numbers at 3ed8712, unchanged by 270–271):
- src/elevation/model/room.js (1739): the recesses.js import (after 30); runSideCorner + endMinWidthsForRun's return + endCornerAnglesForRun (190–224); resolveRunAnchorDatum (after the soffit branch, 262–267); describeAnchor (before 341); syncRoom's first runs map (643–646); roomDiagnostics (after soffitConflicts, ≈ 823); flipFollow → flipAnchor and the recesses map in flipRunsForWall (1685–1734)
- src/elevation/model/soffits.js (209): soffitOverRun only (51–61)
- src/elevation/model/overlap.js (57): the corners.js import and runsConflict
- NEW src/elevation/model/__tests__/recessRuns.test.js

Read room.js only at those line ranges; don't read it whole. DO NOT touch stretchRun, moveRun or runDefaults.js (step 273), the store, or any component. flipFollow has exactly one use (1705). DO NOT grep the repo or open other files.

First add the test file and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/recessRuns.test.js src/elevation/model/__tests__/soffits.test.js src/elevation/model/__tests__/overlap.test.js`. At the end, run `npm test && npm run lint` once: 816 + 6 = 822. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 272 Runs on a recess".
```

---

## Step 273 — Model: drawing, stretching and moving snap to recesses

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §1 (Drawing) and §5. Step 272 is in.
If `git status` shows uncommitted changes, stop and tell me.

createRun: a run drawn inside a recess's rectangle (within settings.cornerSnapDistance) gets recessId; an edge within snap of a recess edge anchors to it ({ to: 'recess', recessId, edge, offset: 0 }) after the corner and wing-wall checks, with recessEndType picking filler or end panel. stretchRun snaps to recess edges and picks the end the same way; moveRun's unjoined-run candidates include recess edges.

Write the changes as the SPEC gives them. Add the new test file VERBATIM.

Files (only these):
- src/elevation/model/runDefaults.js (≈ 180): the recesses.js import; createRun's recess lookup (before `const anchors`), the anchors map, the ends map, the run object
- src/elevation/model/room.js: add recessEdges and recessEndType to the recesses.js import from step 272; stretchRun's candidates and its `if (anchorsAtSnap)` block; moveRun's first candidates list (≈ 1463–1474 at 3ed8712, a few lines lower now)
- NEW src/elevation/model/__tests__/recessDraw.test.js

Read room.js only around stretchRun and moveRun. DO NOT touch moveRun's joined-run candidate list, joinEdges, the store or any component. DO NOT grep the repo or open other files.

First add the test file and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/recessDraw.test.js src/elevation/model/__tests__/runDefaults.test.js src/elevation/model/__tests__/stretchRun.test.js`. At the end, run `npm test && npm run lint` once: 822 + 3 = 825. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 273 Drawing snaps to recesses".
```

---

## Step 274 — Model: recesses in the dimension rows

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §1 (Dimensions) and §6. Step 273 is in.
If `git status` shows uncommitted changes, stop and tell me.

The elevation's wall row (openingChain) and the plan's face rows (wallFaceSegments) show each recess on that face at its width, kind 'recess'. An opening inside a recess splits it: recess edge → opening → recess edge (uncoveredSpans from recesses.js). Elevation recess segments carry recessId and label; the plan's carry only kind, like the others.

Write the changes as the SPEC gives them. Append the tests VERBATIM.

Files (only these):
- src/elevation/model/dimensions.js (717): the recesses.js import and openingChain only (≈ 91–127)
- src/elevation/model/wallFaceRow.js (40): the import and wallFaceSegments
- src/elevation/model/__tests__/wallFaceRow.test.js: append the SPEC-38 describe block (no new imports)

DO NOT touch ElevationCanvas.jsx, DimensionRow.jsx or PlanWallShape.jsx (they already draw these rows; the color comes in 277), horizontalChains or verticalOpeningChain. The existing opening and wing wall tests must pass unchanged. DO NOT grep the repo or open other files.

First add the tests and run them: they must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/wallFaceRow.test.js src/elevation/model/__tests__/dimensions.test.js`. At the end, run `npm test && npm run lint` once: 825 + 2 = 827. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 274 Recesses in the dimension rows".
```

---

## Step 275 — Store: `selection.recessId`

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §7. Step 274 is in.
If `git status` shows uncommitted changes, stop and tell me.

Shape step: every selection object the slice builds gets recessId (null unless set). setSelection picks an opening first, then a recess, then a soffit, a run, an end panel; selecting a recess sets activeWallSide to its face. No reducer uses it yet.

Write the changes as the SPEC gives them. Add the new test file VERBATIM.

Files (only these):
- src/elevation/store/elevationSlice.js (1799): createInitialElevationState's selection (≈ 160–166), clearTransientSelection (≈ 288–296), addSoffit's selection (≈ 703–709), removeItem's (≈ 1352–1357) and removeCell's (≈ 1385–1388), setSelection (≈ 1635–1665)
- NEW src/elevation/store/__tests__/recesses.test.js

DO NOT touch elevationSlice.test.js: the selections it builds by hand don't need recessId (toMatchObject / undefined reads stay green). DO NOT touch any component (PlanCanvas reads selection.recessId in 279). DO NOT grep the repo or open other files.

First add the test file and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/store/__tests__/recesses.test.js`. At the end, run `npm test && npm run lint` once: 827 + 1 = 828. If an elevationSlice.test.js expectation compares a whole selection with toEqual and now fails only because of `recessId: null`, add `recessId: null` to that expectation and say so. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 275 selection.recessId".
```

---

## Step 276 — Store: recess reducers

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §8. Step 275 is in.
If `git status` shows uncommitted changes, stop and tell me.

New reducers: addRecess (validates, selects it), updateRecess (a kind change swaps an R/P label's letter; re-picks the ends anchored to it), resizeRecess, deleteRecess (lets go of run.recessId, recess anchors, opening.recessId, the selection), setRunRecess (sets or clears a run's plane and re-picks its recess-anchored ends). setRunAnchor accepts recess anchors (offset defaults to 0; the end comes from recessEndType). updateOpening accepts recessId (null clears it). setTool accepts 'recess'. A rejected add/update/resize sets state.message to the validation reason.

Write the changes as the SPEC gives them. Add the SPEC's helpers and tests to recesses.test.js VERBATIM.

Files (only these):
- src/elevation/store/elevationSlice.js (≈ 1810): the recesses.js import (after the openings.js import); RECESS_KEYS, recessLocation, recessView, refreshRecessEnds after soffitLocation; the five reducers after deleteSoffit; setRunAnchor (≈ 985–1035); updateOpening (≈ 784–818); setTool; the actions export list
- src/elevation/store/__tests__/recesses.test.js: imports, R, makeRun, wallOf, and the four tests

DO NOT touch elevationSlice.test.js or any component. DO NOT grep the repo or open other files.

First add the tests and run them: they must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/store/__tests__/recesses.test.js`. At the end, run `npm test && npm run lint` once: 828 + 4 = 832. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 276 Recess reducers".
```

---

## Step 277 — Elevation: draw, place, select, delete

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §9. Step 276 is in.
If `git status` shows uncommitted changes, stop and tell me.

New RecessShapes component draws each recess on the elevation's face (dashed over a dark fill; a projection solid over a light fill) with its label and depth, under the openings and runs; clicking it with the select tool selects it. The elevation toolbar gets a Recess tool: clicking the wall creates a 36" × 12" floor-to-ceiling recess centered on the click (createRecess) and adds it, or shows the validation message. A door or window placed inside a recess (front face, kind 'recess') gets its recessId. Delete/Backspace deletes a selected recess. Dimension rows color 'recess' segments.

Write the changes as the SPEC gives them.

Files (only these):
- NEW src/elevation/components/RecessShapes.jsx
- src/elevation/components/ElevationCanvas.jsx (1872): imports (55–59, 86–100, 118), the keydown handler (≈ 586–612), selectRecess after selectSoffit (≈ 970), handleStageClick (≈ 1032–1072), the second Layer (≈ 1550)
- src/elevation/components/ElevationToolbar.jsx (222): toolNames (39–41)
- src/elevation/components/DimensionRow.jsx (352): KIND_COLORS only

Read ElevationCanvas.jsx only at those line ranges; don't read it whole. DO NOT touch the store, the model, PropertiesPanel or the plan. DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 832.

At most five lines of summary. Commit "elevation-mvp: step 277 Recesses in the elevation".
```

**Check after 277 (by hand):**

1. Elevation: pick **Recess** and click the middle of a wall. A dashed 36" box, floor to ceiling, appears with "R1 · 12" deep"; the wall row below gains a recess segment.
2. Click Recess again on top of it: "Recesses can't overlap."
3. Pick Select, click the recess: it highlights. Press Delete: it's gone.
4. Add a recess, then pick Door and click inside it: the door lands. (Its plan view comes in 279.)
5. Draw an upper inside the recess: it snaps to the sides with fillers. Draw a base inside it: the base (24") is deeper than the recess (12"), so it gets end panels. Draw a base from the wall end to the recess's left edge: it ends there with an end panel.

---

## Step 278 — Properties

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §10. Step 277 is in.
If `git status` shows uncommitted changes, stop and tell me.

New RecessProperties panel (label, kind, width with grow, depth, bottom, up to the ceiling or a height, the molding under its top, position by edge or center from either end, the placement message). PropertiesPanel shows it for selection.recessId. A run gets a "Sits on" select (wall face or a recess) when its face has recesses; its ends can anchor to a recess's left or right side, with an offset like a soffit anchor. An opening gets a "Set in" select for the front face's recesses. WarningsList has text for recess-overflow, projection-conflict and anchor-recess-missing.

Write the changes as the SPEC gives them.

Files (only these):
- NEW src/elevation/components/properties/RecessProperties.jsx
- src/elevation/components/PropertiesPanel.jsx (180)
- src/elevation/components/properties/RunGeometrySection.jsx (≈ 150): imports and the "Sits on" field after Outset
- src/elevation/components/properties/RunEndsSection.jsx (362): the model import (3–16), recessAnchor (69), anchorValue (86–96), onChange (114–161), the Recess sides optgroup (after 188–194), the offset block (279–300)
- src/elevation/components/properties/OpeningProperties.jsx (288): import, `recesses`, the "Set in" field
- src/elevation/components/properties/WarningsList.jsx (54): the two message maps

DO NOT touch the store or the model (every reducer and helper used here exists since 270–276), the canvases, EndFields.jsx or SoffitProperties.jsx. DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 832.

At most five lines of summary. Commit "elevation-mvp: step 278 Recess properties".
```

**Check after 278 (by hand):**

1. Select a recess: the panel shows its label, kind, size and position. Type a width with "both": it grows about its center. Type 24 from the right edge: it moves there.
2. Untick "Up to the ceiling" and type a height of 84: the box drops to 84; a tall drawn inside it stops under it with crown. Set "Under its top" to None: the tall grows to 84.
3. Set Kind to Projection: the label becomes P1 and the outline turns solid. An upper drawn beside it ends with a filler (a 24" base, deeper than its 12", gets an end panel); a run drawn across its front on the wall face shows "Runs into a projection".
4. Select a base on the wall face: "Sits on" lists the recess; pick it and the run moves back into the recess in plan (after 279) and its recess-anchored ends re-pick.
5. Anchor a run end to "R1 right side", type an offset of 1/2": the run holds back 1/2" and the description reads "R1 right side · 1/2" gap".
6. Select a door: "Set in" lists the front recesses; pick one and back to "Wall face".

---

## Step 279 — Plan

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.md §1 (Plan) and §11. Step 278 is in.
If `git status` shows uncommitted changes, stop and tell me.

New PlanRecess draws each recess from recessPlanShape: a deep recess's bump-out filled like the wall, the notch knocked out (its face edge lifted a pixel into the room so the wall's face line disappears too), the outline (dashed when raised), the label "R1 · 48" × 24"". It isn't clickable; it highlights when the recess is selected. PlanOpening and openingsAtPoint use openingPlanDepths, so a door in a recess is drawn and hit at the recess back. A run's plan depth dimension is measured from its plane. A selected recess isn't a selected wall.

Write the changes as the SPEC gives them. Append the test VERBATIM.

Files (only these):
- NEW src/elevation/plan/PlanRecess.jsx
- src/elevation/plan/PlanCanvas.jsx (1268): the PlanRecess import (83), wallItselfSelected (119), the recess map after the PlanWallShape map (1029–1041)
- src/elevation/plan/PlanOpening.jsx (163): the import and the depth lines (38–63)
- src/elevation/plan/PlanRunFootprint.jsx (279): 108–119 and the leader (225–230)
- src/elevation/model/openings.js (314): the import and openingsAtPoint (288–314)
- src/elevation/model/__tests__/recesses.test.js: the openings.js import and one appended test

Read PlanCanvas.jsx only at those line ranges. DO NOT touch PlanWallShape.jsx, wallOutline.js, depthDimension.js, the store or the elevation. DO NOT grep the repo or open other files.

First add the test and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/recesses.test.js src/elevation/model/__tests__/openings.test.js`. At the end, run `npm test && npm run lint && npm run build` once: 832 + 1 = 833.

At most five lines of summary. Commit "elevation-mvp: step 279 Recesses in plan".
```

**Check after 279 (by hand):**

1. Plan, a 24" deep floor-to-ceiling recess: a notch in the wall with the wall bumped out behind it, 4 1/2" thick around it, labeled "R1 · 48" × 24"".
2. Change its depth to 3": the notch gets shallow and the bump-out goes away. Set its bottom to 48: the wall is solid again and the notch is dashed.
3. A base inside the recess sits at its back; its depth dimension starts at the recess back. An upper inside a 24" recess is behind the wall face.
4. A door set in the recess is drawn at its back, through the wall behind it, and still selects when clicked there.
5. A projection is a solid block in front of the wall; raised off the floor, it's a dashed outline.
6. Select the recess in the elevation, then switch to plan: it's highlighted and the wall isn't.
7. A side panel drawn as its own panel-only run (from 270) reserves only its thickness: the base next to it on the return wall stops at its face.
