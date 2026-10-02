# Elevation Lab — Codex Prompts, Steps 287–299 (round 39: consolidation)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`SPEC-39.md`, this file, and the updated `CONSOLIDATION-PLAN.md`, `CELLS-PLAN.md`, `ALCOVE-PLAN.md`, `../DECISIONS.md`, `../platform/PLATFORM-PLAN.md`).

| Step | What | Tests after |
|---|---|---|
| 287 | C1 Golden rooms (Kyle draws and commits `fixtures/golden.json` first) | 851 |
| 288 | C2a Slice split: helpers, rooms, walls, UI | 851 |
| 289 | C2b Slice split: features, runs, items, cells, styles | 851 |
| 290 | C3 Slice test split | 851 |
| 291 | C4a `room.js` split: clone, anchors, pins, sync | 851 |
| 292 | C4b `room.js` split: joins, moves | 851 |
| 293 | C5a ElevationCanvas: dimension and preview components | 851 |
| 294 | C5b ElevationCanvas: four hooks | 851 |
| 295 | C6 PlanCanvas: scene, overlays, two hooks | 851 |
| 296 | C7 `faceFeatures()` | 852 |
| 297 | C8 `roomParts()` in `parts.js` | 853 |
| 298 | C9 Parts carry rectangle and source | 855 |
| 299 | C10 Housekeeping | 855 |

**Branch:** `elevation-grid-run-split`. The baseline after step 286 (round 38.3) is **844**, **847 after step 286.1 (round 38.4)** and **849 after step 286.2 (round 38.5)**: every count below is then 5 higher, and `room.js` is 27 lines longer (SPEC-38.4 §3). 38.5 moves no line range used here (SPEC-38.5, "Effect on round 39"). Confirm it with `npm test`; if it differs, shift the counts.

**This round changes no behavior.** From step 288 on, the golden snapshot written in 287 must pass unchanged. Never run vitest with `-u` after step 287; if the snapshot fails, the step is wrong.

**Moving code:** every split step cuts code by the line ranges given, with a script, and then fixes imports. Never retype moved code. Check line ranges by looking at the first and last line of each range before cutting.

---

## Before step 287 (Kyle)

Draw the six rooms in SPEC-39 §2 in the app (named exactly `G1 Euro kitchen` … `G6 Stacked runs`), then in the browser console run `copy(localStorage.getItem('cd.elevationLab.v4'))`, paste it into `src/elevation/model/__tests__/fixtures/golden.json`, and commit it ("golden rooms fixture").

---

## Step 287 — C1: golden rooms

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §1 and §2. Step 286 is in, and src/elevation/model/__tests__/fixtures/golden.json is committed.
If `git status` shows uncommitted changes, or golden.json is missing, stop and tell me.

Add the golden-room snapshot test: it loads fixtures/golden.json, checks the six room names, and for each room snapshots everything it derives (synced room, diagnostics, part numbers' existing fields, plan clearances, plan face rows, each face's dimension rows, each run's layout and plan pieces). uuid is mocked so derived ids are stable.

Write golden.test.js VERBATIM from the SPEC.

Files (only these):
- NEW src/elevation/model/__tests__/golden.test.js
- the __snapshots__/golden.test.js.snap vitest writes

Run `npx vitest run src/elevation/model/__tests__/golden.test.js` once (it writes the snapshot), then again without -u: it must pass unchanged. If the fixture doesn't load or a room name is missing, stop and tell me; don't edit golden.json. Then run `npm test && npm run lint` once: 844 + 7 = 851. Don't run `npm run build`.

At most five lines of summary (include the snapshot file's size). Commit the test and the snapshot: "elevation-mvp: step 287 Golden rooms".
```

---

## Step 288 — C2a: split the slice, part 1

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §1 and §3. Step 287 is in.
If `git status` shows uncommitted changes, stop and tell me.

Split src/elevation/store/elevationSlice.js (1971 lines). This step moves four modules into src/elevation/store/slices/; step 289 moves the rest. Move by line range with a script, then fix imports. Never retype code.

Lines at 3afa1ba; 38.3 added 2 lines inside setRunEnd (≈ 1083), so the ui.js range below is already shifted by 2 and the others are above it:
- slices/helpers.js ← 100–149 and 180–346 (copySettings … activateRoom; createInitialElevationState at 150–179 stays). Export every function and constant.
- slices/rooms.js ← 352–439 (addRoom … centerRoomOnOrigin) as `export const roomReducers = { … }`
- slices/walls.js ← 440–723 (addWall … flipWall) as `wallReducers`
- slices/ui.js ← 1793–1863 (setFacePath … updateSettings) as `uiReducers`

Moved reducers keep their exact bodies; entries written as `name: { reducer, prepare }` stay that way. In elevationSlice.js, `reducers:` becomes `{ ...roomReducers, ...wallReducers, <the rest still inline, in today's order>, ...uiReducers }`. The action export list (1866–1971) and the default export don't change. Each new file imports only what it uses (lint is the check).

Files (only these): src/elevation/store/elevationSlice.js; NEW src/elevation/store/slices/{helpers,rooms,walls,ui}.js.

DO NOT change any reducer body, action name or anything outside src/elevation/store/. DO NOT touch the test files. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/`. At the end, run `npm test && npm run lint` once: still 851, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary (the new line count of elevationSlice.js). Commit "elevation-mvp: step 288 Slice split, part 1".
```

---

## Step 289 — C2b: split the slice, part 2

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §3. Step 288 is in.
If `git status` shows uncommitted changes, stop and tell me.

Move the remaining inline reducers out of src/elevation/store/elevationSlice.js into src/elevation/store/slices/, by script, using helpers.js from step 288. The reducers are still in today's order; their line numbers moved in 288, so find each block by its first and last reducer name:
- slices/features.js ← addSoffit … deleteOpening (soffits, recesses, setRunRecess, openings) as `featureReducers`
- slices/runs.js ← addRun, then replaceRun … setItemTFiller, as `runReducers`
- slices/items.js ← setItemWidth … removeItem as `itemReducers`
- slices/cells.js ← splitCell … setCellExtend as `cellReducers`
- slices/styles.js ← setItemFace … setItemReveals as `styleReducers`

`reducers:` becomes `{ ...roomReducers, ...wallReducers, ...featureReducers, ...runReducers, ...itemReducers, ...cellReducers, ...styleReducers, ...uiReducers }`. elevationSlice.js ends up as the module imports, createInitialElevationState, the createSlice call, the unchanged action export list and the default export (≈ 200 lines). Each file imports only what it uses.

Files (only these): src/elevation/store/elevationSlice.js; NEW src/elevation/store/slices/{features,runs,items,cells,styles}.js; slices/helpers.js only if an export is missing.

DO NOT change any reducer body or action name. DO NOT touch the test files or anything outside src/elevation/store/. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/`. At the end, run `npm test && npm run lint && npm run build` once: still 851, golden snapshot unchanged.

At most five lines of summary (each new file's line count). Commit "elevation-mvp: step 289 Slice split, part 2".
```

**Check after 289 (by hand):** draw a run, add a recess and a door, split a cabinet, switch styles, undo nothing: everything behaves as before.

---

## Step 290 — C3: split the slice tests

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §4. Step 289 is in.
If `git status` shows uncommitted changes, stop and tell me.

Split src/elevation/store/__tests__/elevationSlice.test.js (2557 lines, unchanged since 3afa1ba) by script into the files and line ranges in SPEC §4: helpers/sliceFixtures.js (102–211, exported) and sliceRooms / sliceRuns / sliceFeatures / sliceCells .test.js. Each test file imports vitest, the fixtures it uses, and only the actions it uses from ../elevationSlice.js (lines 1–101 list them all). Test bodies are moved verbatim.

First run `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js` and note its test count. After the split the four new files must add up to that count; then delete elevationSlice.test.js.

Files (only these): src/elevation/store/__tests__/elevationSlice.test.js (deleted); NEW src/elevation/store/__tests__/{sliceRooms,sliceRuns,sliceFeatures,sliceCells}.test.js and helpers/sliceFixtures.js.

DO NOT change any test body or expectation. DO NOT touch source files. DO NOT grep the repo or open other files.

At the end, run `npm test && npm run lint` once: still 851. Don't run `npm run build`.

At most five lines of summary (the old file's count and each new file's count). Commit "elevation-mvp: step 290 Slice test split".
```

---

## Step 291 — C4a: split `room.js`, part 1

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §1 and §5. Step 290 is in.
If `git status` shows uncommitted changes, stop and tell me.

Split src/elevation/model/room.js (1791 lines, unchanged since 3afa1ba) by script. This step moves four modules; 292 moves joins and moves:
- roomClone.js ← 83–201 (cloneRun and cloneRoom exported, compensateRuns)
- runAnchors.js ← 203–446 (runSideCorner … casingClearanceWarnings; horizontalResolution and casingClearanceWarnings exported)
- runPins.js ← 447–583
- roomSync.js ← 584–900 (resolveWallSpans … tryPlaceRun)
Copy the constants at 80–82 into the modules that use them. room.js re-exports every function it exported before, by name (SPEC §5); the joins and moves (901–1728) stay in room.js for now and import what they need from the new modules.

Dependency direction must stay roomClone ← runAnchors, runPins ← roomSync ← (room.js joins/moves). If a moved function needs something that would create a cycle, stop and tell me.

Files (only these): src/elevation/model/room.js; NEW src/elevation/model/{roomClone,runAnchors,runPins,roomSync}.js.

DO NOT change any function body or exported name. DO NOT touch model/index.js or any importer of room.js (they keep importing from room.js). DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/golden.test.js src/elevation/model/__tests__/roomsCorners.test.js src/elevation/model/__tests__/recessRuns.test.js`. At the end, run `npm test && npm run lint` once: still 851, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 291 room.js split, part 1".
```

---

## Step 292 — C4b: split `room.js`, part 2

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §5. Step 291 is in.
If `git status` shows uncommitted changes, stop and tell me.

Move the rest out of src/elevation/model/room.js by script:
- runJoins.js ← joinStack … moveJoint (runEdgeX, runsOverlapVertically, withoutAuto exported)
- runMoves.js ← stretchRun, moveRun
Find each block by its first and last function name (line numbers moved in 291). room.js ends up as flipAnchor, flipRunsForWall, resolveWall and the by-name re-exports in SPEC §5.

Files (only these): src/elevation/model/room.js; NEW src/elevation/model/{runJoins,runMoves}.js; one of the 291 modules only if an export is missing.

DO NOT change any function body or exported name. DO NOT touch importers of room.js. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/golden.test.js src/elevation/model/__tests__/joints.test.js src/elevation/model/__tests__/stretchRun.test.js src/elevation/model/__tests__/recessDraw.test.js`. At the end, run `npm test && npm run lint && npm run build` once: still 851, golden snapshot unchanged.

At most five lines of summary (each new file's line count). Commit "elevation-mvp: step 292 room.js split, part 2".
```

---

## Step 293 — C5a: ElevationCanvas layers become components

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §1 and §6 (step 293). Step 292 is in.
If `git status` shows uncommitted changes, stop and tell me.

Move two render-only blocks out of src/elevation/components/ElevationCanvas.jsx (1932 lines, unchanged since 3afa1ba) into new components:
- ElevationDimensions.jsx ← 1700–1850 (the dimension Layer)
- ElevationPreviews.jsx ← 1851–1895 (stretch preview and drag preview layers; the part-number layer at 1896–1906 stays)
Each component takes as props exactly the values its JSX reads, with the same names; the canvas renders it in the same place. Move the JSX by script; don't retype it. Memos and callbacks stay in the canvas.

Files (only these): src/elevation/components/ElevationCanvas.jsx; NEW src/elevation/components/{ElevationDimensions,ElevationPreviews}.jsx.

DO NOT change any JSX, prop value or callback. DO NOT touch DimensionRow.jsx, RunGroup.jsx or anything else. DO NOT grep the repo or open other files.

There are no component tests: run `npm test && npm run lint && npm run build` once. Still 851.

At most five lines of summary (the canvas's new line count). Commit "elevation-mvp: step 293 ElevationCanvas layers as components".
```

**Check after 293 (by hand):** the elevation's dimension rows, clicking a run's dimension and typing, dragging a run by its dimension, clicking a recess segment, stretching a run (the preview), and drawing a run (the drag preview) all work as before.

---

## Step 294 — C5b: ElevationCanvas hooks

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §6 (step 294). Step 293 is in.
If `git status` shows uncommitted changes, stop and tell me.

Move four groups out of src/elevation/components/ElevationCanvas.jsx into hooks under src/elevation/components/canvas/ (the ranges are above the JSX 293 removed, so unchanged since 3afa1ba):
- useElevationKeys.js ← 541–677 (the key handler effect)
- useRunStretch.js ← 1125–1255 → { previewStretch, commitStretch, startStretch, updateStretch, finishStretch }
- useRunMove.js ← 1256–1369 → { applyRunMove, startRunMove, handleRunSegmentClick, updateRunMove, finishRunMove }
- useJointDrag.js ← 1370–1567 → { previewJointDrag, commitJointDrag, startJointDrag, updateJointDrag, finishJointDrag, unjoinRunSide } plus the effect at 1544–1561
Each hook takes one object of everything its code reads from the canvas, destructured with the same names, so the moved bodies and their useCallback dependency lists don't change. The canvas calls each hook where its code was, in the same order. If one hook needs another's callback, pass it in.

Files (only these): src/elevation/components/ElevationCanvas.jsx; NEW src/elevation/components/canvas/{useElevationKeys,useRunStretch,useRunMove,useJointDrag}.js.

DO NOT change any callback body, dependency list or behavior. DO NOT grep the repo or open other files.

Run `npm test && npm run lint && npm run build` once (react-hooks lint rules are the main check). Still 851.

At most five lines of summary (the canvas's new line count). Commit "elevation-mvp: step 294 ElevationCanvas hooks".
```

**Check after 294 (by hand):** Delete/Backspace on a run, a cell, an opening, a recess, a soffit; arrow keys and zoom keys; stretch a run edge and type a width; drag a run by its dimension; drag a joint glyph and unjoin from it. All as before.

---

## Step 295 — C6: PlanCanvas split

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §7. Step 294 is in.
If `git status` shows uncommitted changes, stop and tell me.

Split src/elevation/plan/PlanCanvas.jsx (1279 lines, unchanged since 3afa1ba) by script:
- PlanScene.jsx ← 1030–1116 (walls, recesses, openings, footprints, wall end panels, clearances, soffits)
- PlanOverlays.jsx ← 1117–1236 (markers, wall move preview, handles, move handle, draw preview, face label)
- usePlanKeys.js ← 417–468 (the key handler effect)
- usePlanWallEdits.js ← 724–849 → { handleWallEndpointDrag, previewPerpendicularMove, beginWallMove, beginWallLength } plus the effect at 784–789
Same rules as 293/294: props and hook inputs are what the code reads, same names, called/rendered where the code was, in order. Bottom-up so line numbers hold: move 1117–1236, then 1030–1116, then 724–849, then 417–468.

Files (only these): src/elevation/plan/PlanCanvas.jsx; NEW src/elevation/plan/{PlanScene,PlanOverlays}.jsx and {usePlanKeys,usePlanWallEdits}.js.

DO NOT change any JSX, callback body or dependency list. DO NOT grep the repo or open other files.

Run `npm test && npm run lint && npm run build` once. Still 851.

At most five lines of summary (PlanCanvas's new line count). Commit "elevation-mvp: step 295 PlanCanvas split".
```

**Check after 295 (by hand):** in plan, draw a wall, drag a wall endpoint, move a wall, type a wall length, place a door, select and delete a run and a wall, and check a recess and soffits still draw.

---

## Step 296 — C7: `faceFeatures()`

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §8. Step 295 is in.
If `git status` shows uncommitted changes, stop and tell me.

New faceFeatures(room, wall, side, settings) lists everything on a wall face (landings, front-face openings by outside casing, recesses and projections, soffits) as { kind, id, x, width, bottom, top, depth }, left to right. wallFaceSegments builds its spans from it; its output must not change (wallFaceRow.test.js and the golden snapshot check that).

Write faceFeatures.js VERBATIM from the SPEC. Append the test VERBATIM.

Files (only these):
- NEW src/elevation/model/faceFeatures.js
- src/elevation/model/wallFaceRow.js (≈ 55): wallFaceSegments' span building only
- src/elevation/model/index.js: a faceFeatures export block at the end
- src/elevation/model/__tests__/wallFaceRow.test.js: the import and the appended describe block

DO NOT touch openingChain, soffits.js, recesses.js or any canvas. DO NOT grep the repo or open other files.

First add the test and run it: it must fail. Then write the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/wallFaceRow.test.js src/elevation/model/__tests__/golden.test.js`. At the end, run `npm test && npm run lint` once: 851 + 1 = 852, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 296 Face features".
```

---

## Step 297 — C8: `roomParts()`

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §9. Step 296 is in.
If `git status` shows uncommitted changes, stop and tell me.

Move the ordered parts list out of src/elevation/model/partNumbers.js (≈ 329 lines) into NEW parts.js by script: PART_KINDS, LOWER_TYPES, compareRuns, runsInWalkOrder, carriesMolding, teeAnchor, runParts, wallPanelPart, orderedParts (≈ 25–186), plus PART_MOLDINGS, moldingPartKey, wallEndPanelPartKey. orderedParts becomes the exported roomParts(room, settings) with the SPEC's JSDoc. partNumbers.js imports roomParts and the helpers it still uses, and re-exports PART_MOLDINGS, moldingPartKey and wallEndPanelPartKey so existing imports keep working. Add the new test file VERBATIM.

Files (only these): src/elevation/model/partNumbers.js; NEW src/elevation/model/parts.js; src/elevation/model/index.js (roomParts beside the partNumbers block); NEW src/elevation/model/__tests__/parts.test.js.

DO NOT change any function body. DO NOT touch partNumbers.test.js, the badge code or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/parts.test.js src/elevation/model/__tests__/partNumbers.test.js src/elevation/model/__tests__/golden.test.js`. At the end, run `npm test && npm run lint` once: 852 + 1 = 853, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 297 Parts list".
```

---

## Step 298 — C9: parts carry their rectangle and source

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §10. Step 297 is in.
If `git status` shows uncommitted changes, stop and tell me.

Every roomParts record gains x, z, height (its elevation rectangle on its face; width is already there) and source ('piece' | 'tee' | 'frame' | 'wall_end_panel' | 'molding'), per the SPEC's table, appended after the existing fields. Moldings get null x, z, height. Nothing reads the new fields yet. Append the two tests VERBATIM; the second writes a new snapshot (G4's parts list) on its first run.

Files (only these): src/elevation/model/parts.js (runParts, wallPanelPart, the molding push in roomParts); src/elevation/model/__tests__/parts.test.js (and the snapshot file it writes).

DO NOT touch partNumbers.js (it spreads each part, so the fields pass through) or golden.test.js. DO NOT grep the repo or open other files.

First add the tests and run them: the first must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/parts.test.js src/elevation/model/__tests__/golden.test.js`. At the end, run `npm test && npm run lint` once: 853 + 2 = 855, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 298 Parts carry rectangle and source".
```

---

## Step 299 — C10: housekeeping

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-39.md §11. Step 298 is in.
If `git status` shows uncommitted changes, stop and tell me.

Docs only: update PROMPT-CONVENTIONS.md (the file-size table from the current `wc -l`, new rule 9 "Move code by script", and the "Standing structural cost" section), run the unused-exports loop from the SPEC and list its output in the summary (delete nothing), and move finished big-file items in TODO.md to its Done section.

Files (only these): docs/elevation-mvp/PROMPT-CONVENTIONS.md, TODO.md.

DO NOT change any source or test file.

Run `npm test && npm run lint` once to confirm: still 855.

Summary: the unused-export names (as many lines as it takes), then at most three lines. Commit "elevation-mvp: step 299 Consolidation housekeeping".
```

**After 299:** the round is done. Kyle decides whether `elevation-grid-run-split` merges into `feature/elevation-mvp`; then platform Phase 0.
