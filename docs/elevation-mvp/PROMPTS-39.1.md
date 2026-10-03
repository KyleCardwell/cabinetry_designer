# Elevation Lab — Codex Prompts, Steps 300–306 (round 39.1: fixes and click-to-pick)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session.

| Step | What | Tests after |
|---|---|---|
| 300 | Loading syncs every room (recess runs reload on their recess) | 861 |
| 301 | Pin to an opening: callout inside it, centre line down | 862 |
| 302 | Casing clearances inside the wall | 864 |
| 303 | Only the selected thing is outlined | 865 |
| 304 | `runScene()` out of RunGroup (no behavior change) | 866 |
| 305 | `pickStack()` / `defaultPick()` | 868 |
| 306 | The picker list | 868 |

**Baseline is 860** (what `npm test` reports at `622383f`). **The golden snapshot must not change in any step.** Never run vitest with `-u`; if `golden.test.js` fails, the step is wrong.

Every step's code and tests are in SPEC-39.1 and were run against a copy of the repo, so copy them verbatim rather than re-deriving them.

---

## Before step 300 (Kyle)

Merge the cells branch. `feature/elevation-mvp` hasn't moved since the branch was cut, so it's a fast-forward:

```bash
cd cabinetry_designer
git status                                   # must be clean
git tag before-cells-merge feature/elevation-mvp
git checkout feature/elevation-mvp
git merge --ff-only elevation-grid-run-split
git push origin feature/elevation-mvp --tags
```

Then copy `SPEC-39.1.md` and `PROMPTS-39.1.md` into `docs/elevation-mvp/` (already there if Claude wrote them into the repo) and commit them on `feature/elevation-mvp` ("round 39.1 docs"). Keep `elevation-grid-run-split` until you've used the merged app for a while.

---

## Step 300 — loading syncs every room

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-39.1.md §1 and §2. Round 39 (step 299) is in.
If `git status` shows uncommitted changes, stop and tell me.

Bug: derived run fields (_plane, _pinWidths, _seamGap, _frame) are stripped on save and createInitialElevationState never re-syncs, so a reloaded room draws recess runs at the wall face until any edit re-syncs it. Fix: createInitialElevationState maps every room through syncRoom.

Make the elevationSlice.js change exactly as the SPEC shows. Add initialState.test.js VERBATIM. In persistence.test.js change the three round-trip assertions (775, 844, 904) to grid comparisons exactly as the SPEC shows; nothing else in that file.

Files (only these):
- src/elevation/store/elevationSlice.js (createInitialElevationState and one import)
- NEW src/elevation/store/__tests__/initialState.test.js
- src/elevation/store/__tests__/persistence.test.js (three lines)

DO NOT touch syncRoom, persistence.js or any reducer. DO NOT grep the repo or open other files.

First add the new test and run it: it must fail (all three null). Then fix. While iterating, run only `npx vitest run src/elevation/store/__tests__/`. At the end, run `npm test && npm run lint` once: 860 + 1 = 861, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 300 Loading syncs every room".
```

**Check after 300 (by hand):** open G5, reload the page: both recess runs sit in their recesses without touching anything.

---

## Step 301 — pin callout inside the opening

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-39.1.md §1 and §3. Step 300 is in.
If `git status` shows uncommitted changes, stop and tell me.

A cabinet pinned to an opening gets its callout at z 40, inside the window casing. Put it 6" above the opening's jamb bottom (half the opening's height if shorter than 12"), and add datumZ (the opening's mid-height) so RunGroup draws a dashed extension line from there down to the callout. Wall-end pins don't change.

Make the dimensions.js changes (CENTERLINE_ABOVE_SILL, centerlineMarkers) and the RunGroup.jsx change (extensionTop and one dashed Line in the centerline block, ≈ 557–603) exactly as the SPEC shows. Append the test VERBATIM inside describe('centerlineMarkers').

Files (only these):
- src/elevation/model/dimensions.js (≈ 439–471)
- src/elevation/components/RunGroup.jsx (the centerline block only)
- src/elevation/model/__tests__/dimensions.test.js (one appended it block, ≈ 622)

DO NOT touch resolvePinTarget, openingGeometry, or any other part of RunGroup. DO NOT grep the repo or open other files.

First add the test and run it: it must fail. While iterating, run only `npx vitest run src/elevation/model/__tests__/dimensions.test.js`. At the end, run `npm test && npm run lint` once: 862, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 301 Pin callout inside the opening".
```

---

## Step 302 — casing clearances inside the wall

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-39.1.md §1 and §4. Step 301 is in.
If `git status` shows uncommitted changes, stop and tell me.

The casing-to-cabinet clearances move from a row below the elevation into the wall: new clearanceCallouts() (openingClearances' segments plus a height z), drawn by a new ClearanceCallouts component; the below-wall clearance row is dropped (belowRowOffsets gets clearanceRow: false) so the rows under it move up. openingClearances itself doesn't change (the golden snapshot records it).

Write clearanceCallouts, the belowRowOffsets option and ClearanceCallouts.jsx VERBATIM from the SPEC. Make the ElevationCanvas.jsx edits at the five places the SPEC lists (65, 217, 458–460, 476–481, 517) and replace the clearances DimensionRow in ElevationDimensions.jsx (25–35). Append both tests VERBATIM.

Files (only these):
- src/elevation/model/dimensions.js (new function after openingClearances)
- src/elevation/model/index.js (one export line in the dimensions block)
- src/elevation/canvas/dimensionLayout.js (belowRowOffsets, 20–32)
- NEW src/elevation/components/ClearanceCallouts.jsx
- src/elevation/components/ElevationCanvas.jsx (the five places only)
- src/elevation/components/ElevationDimensions.jsx (the first DimensionRow and one import)
- src/elevation/model/__tests__/casingAnchors.test.js (import + one appended it block)
- src/elevation/canvas/__tests__/dimensionLayout.test.js (one appended it block)

DO NOT change openingClearances, DimensionRow.jsx, layoutDimensionRow or any other row. DO NOT grep the repo or open other files.

First add the tests and run them: they must fail. While iterating, run only `npx vitest run src/elevation/model/__tests__/casingAnchors.test.js src/elevation/canvas/__tests__/dimensionLayout.test.js`. At the end, run `npm test && npm run lint && npm run build` once: 862 + 2 = 864, golden snapshot unchanged.

At most five lines of summary. Commit "elevation-mvp: step 302 Casing clearances inside the wall".
```

**Check after 301–302 (by hand):** G1, the window wall: the ℄ 0" callout sits in the window above the casing with a dashed line down from the window's middle; the 15" and 9 1/2" clearances sit inside the wall between the casing and the tall / upper, at about their middle height, and the rows below the elevation start one row higher.

---

## Step 303 — only the selected thing is outlined

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-39.1.md §1 and §5. Step 302 is in.
If `git status` shows uncommitted changes, stop and tell me.

Selecting a cabinet also outlines its run, and selecting a face also outlines its cabinet. New runHighlight(selectedRun, selectedPieceId, selectedFacePath) says what one run outlines: the run, a piece or a face, never what it sits in.

Write selectionHighlight.js and its test VERBATIM. In RunGroup.jsx: import runHighlight, compute `highlight` after cursorKeys (≈ 65), and change exactly three places (PieceRect selected ≈ 466, FaceOutlines selectedPath ≈ 516, the run outline ≈ 610) as the SPEC shows. selectedRun keeps driving stretch handles and anchor badges. In ElevationDimensions.jsx, both highlightRunId props (59, 111) become `selection.pieceId ? null : selection.runId`.

Files (only these):
- NEW src/elevation/canvas/selectionHighlight.js
- NEW src/elevation/canvas/__tests__/selectionHighlight.test.js
- src/elevation/components/RunGroup.jsx (one import, one line, three props)
- src/elevation/components/ElevationDimensions.jsx (two props)

DO NOT touch ElevationCanvas.jsx, PieceRect.jsx, FaceOutlines.jsx, JointMarkers or plan view. DO NOT grep the repo or open other files.

At the end, run `npm test && npm run lint && npm run build` once: 865, golden snapshot unchanged.

At most five lines of summary. Commit "elevation-mvp: step 303 Only the selected thing is outlined".
```

---

## Step 304 — `runScene()`

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-39.1.md §6. Step 303 is in.
If `git status` shows uncommitted changes, stop and tell me.

No behavior change. RunGroup's derived values (layout, cells, faces, frames, blind panels, sub-labels, drawn pieces) move into a pure model function runScene(room, wall, run, settings) so the click picker (step 305) can hit-test exactly what is drawn.

Write runScene.js and runScene.test.js VERBATIM. In RunGroup.jsx, delete 68–138 and 150–180 by script (check the first and last line of each range against the SPEC first), put the one useMemo + destructure the SPEC shows in the first gap, delete PANEL_LABELS, add the runScene import, and remove the imports lint reports unused (the SPEC lists them). Everything from `const runEnd = …` on is unchanged.

Files (only these):
- NEW src/elevation/model/runScene.js
- NEW src/elevation/model/__tests__/runScene.test.js
- src/elevation/components/RunGroup.jsx

DO NOT change any rendering in RunGroup or any model function runScene calls. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/runScene.test.js`. At the end, run `npm test && npm run lint && npm run build` once: 866, golden snapshot unchanged.

At most five lines of summary (RunGroup's new line count). Commit "elevation-mvp: step 304 runScene".
```

**Check after 303–304 (by hand):** G4 and G2 draw exactly as before (T-fillers, L end panels, face frames, blind labels). Click a cabinet: only the cabinet is outlined, not its run; its run's overall dimension stays white. Click the run's dimension: the run is outlined and the dimension turns blue.

---

## Step 305 — `pickStack()` and `defaultPick()`

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-39.1.md §1 and §7. Step 304 is in.
If `git status` shows uncommitted changes, stop and tell me.

New pure functions: pickStack(room, wall, settings, point) lists everything under a point on an elevation, front to back (faces, parts as drawn, runs, wall end panels, openings, soffits, recesses, the wall), each with a label, rectangle and setSelection payload; defaultPick(candidates, prefer) is what a click selects (today's target, or the preferred kind).

Write pick.js and pick.test.js VERBATIM. Add the two export lines at the end of model/index.js.

Files (only these):
- NEW src/elevation/model/pick.js
- NEW src/elevation/model/__tests__/pick.test.js
- src/elevation/model/index.js (two lines at the end)

DO NOT touch runScene.js, faceFeatures.js or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/pick.test.js`. At the end, run `npm test && npm run lint` once: 866 + 2 = 868, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 305 Pick stack".
```

---

## Step 306 — the picker

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-39.1.md §1 and §8. Step 305 is in.
If `git status` shows uncommitted changes, stop and tell me.

A click on anything in the elevation (select tool) now goes through usePicker: it selects what a click always selected (defaultPick) and, when more than one thing besides the wall is under the pointer, opens SelectionPicker, a list of everything there. Hovering a row outlines it on the canvas (PickOutline); clicking a row selects it; ↑/↓/Enter work; Esc, a click elsewhere or the wheel closes it.

Write usePicker.js and SelectionPicker.jsx VERBATIM. OpeningShape gets an onPick prop for its click (drag still calls onSelect). In ElevationCanvas.jsx: replace selectRun/selectSoffit/selectRecess (844–857) and selectEndPanel/selectPiece/selectFace (869–882) with the one usePicker call, rewire the five JSX sites, add PickOutline after RecessOutline and SelectionPicker after TrackSizeInput, exactly as the SPEC lists. Line numbers are at 622383f; step 302 removed 4 lines above 520, so subtract 4 and find each by content.

Files (only these):
- NEW src/elevation/components/canvas/usePicker.js
- NEW src/elevation/components/SelectionPicker.jsx
- src/elevation/components/OpeningShape.jsx (one prop, the onClick)
- src/elevation/components/ElevationCanvas.jsx (the places listed)

DO NOT change handleStageClick, selectFeature, selectOpening, the dimension rows, stretch handles, joint markers, RunGroup or PieceRect. DO NOT grep the repo or open other files.

There are no component tests: run `npm test && npm run lint && npm run build` once. Still 868, golden snapshot unchanged.

At most five lines of summary. Commit "elevation-mvp: step 306 Click-to-pick".
```

**Check after 306 (by hand):** the hand check at the end of SPEC-39.1 §8. In short: click a cabinet (selected, list shows Face / Part / Run / Wall); hover rows (pink outline moves); pick Run; in G6 click the panel run between base and upper and pick its run; click a face of the selected cabinet (face selected); click a window on a bare wall (selected, no list); Esc closes the list and keeps the selection; dragging an opening or a run by its dimension opens no list.
