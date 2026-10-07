# Elevation Lab — Codex Prompts, Steps 82–89 (wall sides, islands, wall end panels)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first (including these docs).

**Order:** 82 → 83 → 84 → 85 → 86 → 87 → 88 → 89. Each step needs the one before it, except 87, which only needs 82.

**Codex can't open the app** (it's behind a login), so don't plan browser checks. Kyle checks the UI steps by hand, using the list after each one.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of `b618797`; after step 83 they drift in `room.js`, so every site is also named by function.

**Vocabulary for every step:** "wall side" means `'front'` / `'back'` (`run.wallSide`, `joint.wallSide`). It is not a cabinet face (`faces.js`) and not a run side (`'left'` / `'right'`). SPEC-17 §0.

---
## Step 82 — `wallSide` field and side views

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-17.md §0, §1, §3 (joinEdges joint only), §8 tests 100–105.
If `git status` shows uncommitted changes, stop and tell me.

This step adds a field and pure helpers. No existing behaviour changes: nothing calls a side view yet.

Files:
- NEW src/elevation/model/wallSides.js
- src/elevation/model/index.js (176): add one export block
- src/elevation/model/runDefaults.js (127): createRun's run object, line 123
- src/elevation/model/room.js (1327): ONE line, 643 in joinEdges. Don't read the rest.
- src/elevation/store/persistence.js (600): isRun (180–189) and the joint check in isWall (238–243) only
- tests: NEW src/elevation/model/__tests__/wallSides.test.js;
  src/elevation/store/__tests__/persistence.test.js (563; append a describe at the end, tbtDocument() is at line 107);
  src/elevation/model/__tests__/joints.test.js line 341 only;
  src/elevation/canvas/__tests__/transform.test.js line 79 only

0. Fix the test step 76 left red: transform.test.js line 79, `const maximum = { zoom: 8, panX: 3, panY: 4 };` → zoom 16.

1. wallSides.js exports exactly: WALL_SIDES, wallSideOf, mirrorOpening, wallSideView, wallViewForRun, wallSideFrame, as SPEC §1 defines them. Import only from './geometry.js' (add, scale, wallFrame). The view spreads the source wall and overrides side, sideSource, flipped, runs, joints, openings. A view of the requested side is returned as the same object; a spread copy of a view keeps side/sideSource and is returned as-is. wallSideFrame shifts leftPoint and rightPoint by n × thickness for the back side only when thickness > 0.

2. index.js: `export { WALL_SIDES, mirrorOpening, wallSideFrame, wallSideOf, wallSideView, wallViewForRun } from './wallSides.js';`

3. runDefaults.js createRun: after `anchors,` (line 123) add `wallSide: wall?.side ?? 'front',`. A plain stored wall has no `side`, so it gives 'front'.

4. room.js joinEdges line 643: `wall.joints.push({ id: jointId, x: jointX, wallSide: wallSideOf(sourceRun) });` and import wallSideOf from './wallSides.js'. Then joints.test.js line 341 (test 73) expects `[{ id: jointId, x: 30, wallSide: 'front' }]`.

5. persistence.js:
   - isRun: add `&& (run.wallSide === undefined || run.wallSide === 'front' || run.wallSide === 'back')`.
   - isWall joint check (238–243): add the same test for `joint.wallSide`.
   - No normalization and no schema change. A missing wallSide reads as 'front' in the model (SPEC §0).

6. wallSides.test.js: copy the helpers block and the ISL and SQ fixture builders from SPEC §8 verbatim (you'll need FL from step 83 on; add it now too). Tests 100–104. Test 105 goes in persistence.test.js.

Expect 395 passing (389 today including the fixed transform test, plus 6).

At most five lines of summary. Commit "elevation-mvp: step 82 wall side field and views".
```

---
## Step 83 — Each run resolves against its own side

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-17.md §2, §8 tests 106–112.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/room.js (1327): only the functions named below
- src/elevation/model/corners.js (148): cornerAt (45–64), cornerReserveParts (67–~100)
- src/elevation/model/overlap.js (53): validateRunPlacement (47)
- src/elevation/model/faceLayouts.js (47): runFaceLayouts (21)
- test: src/elevation/model/__tests__/wallSides.test.js

The rule: a function that takes a run and its wall converts first with `wall = wallViewForRun(wall, run);`, so callers may pass the stored wall or a view. Import WALL_SIDES, wallSideOf, wallSideView, wallViewForRun from './wallSides.js' as each file needs them.

room.js — add the one-line conversion as the first statement of:
  endMinWidthsForRun (114), endCornerAnglesForRun (127), resolveRunAnchorDatum (158),
  describeAnchor (181), casingClearanceWarnings (234), pinTargetsForRun (287).
room.js syncRoom, vertical pass (line 457): the base filter becomes
  `runs.filter((candidate) => candidate.cabinetTypeId === CABINET_TYPE_IDS.BASE
     && wallSideOf(candidate) === wallSideOf(run))`
room.js roomDiagnostics (507): replace `for (const wall of synced.walls) {` with
  `for (const wall of synced.walls.flatMap((sourceWall) => (
     WALL_SIDES.map((side) => wallSideView(sourceWall, side))
   ))) {`
  and leave the loop body exactly as it is.
room.js resolveWall (1325): `resolveWall(room, wall, side = 'front')` returns
  `wall ? { ...wallSideView(wall, side), length: wallFrame(room, wall).length } : null`.

corners.js cornerAt (45–64), per SPEC §2:
- compute uA and uB first, then
  `const neighborWallSide = dot(wallFrame(room, neighbor).n, uA) > 0 ? 'front' : 'back';`
  `const neighborFrame = wallFrame(room, wallSideView(neighbor, neighborWallSide));`
  and read neighborSide from that frame (replaces line 53's frame).
- `shared` gains neighborWallSide. The outside return (63) becomes
  `return { ...shared, type: 'outside', angle: 360 - angle };`
- The inside/outside/open/straight tests are unchanged.
corners.js cornerReserveParts (67): convert on entry; in the neighbour reduce (85–86), first skip
  `wallSideOf(neighborRun) !== corner.neighborWallSide`.
overlap.js validateRunPlacement: the conflict test also requires `wallSideOf(other) === wallSideOf(run)`.
faceLayouts.js runFaceLayouts: convert on entry (the default `layout` parameter already converts through endMinWidthsForRun).

Do NOT touch, and don't open to check: jointXRange, moveJoint, resizeRun, tryPlaceRun, jointEndTypes, pruneJoints, splitRun, dimensions.js, joints.js. Joints are single-sided and the rest go through validateRunPlacement or receive a view. The edit operations (join, stretch, move, compensate) are step 84.

Tests 106–112 exactly as SPEC-17 §8 writes them. Test 110 uses toEqual on the whole cornerAt result; if an existing corner test breaks because of the extra neighborWallSide field, tell me which one rather than changing it.
Expect 402 passing.

At most five lines of summary. Commit "elevation-mvp: step 83 resolve runs per wall side".
```

---
## Step 84 — Edits and footprints stay on one side

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-17.md §3, §4 (footprints only), §8 tests 113–118.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/room.js: compensateRuns (88), joinEdges (603), joinTouchingEdges (667), stretchRun (936), moveRun (1059). Don't read other functions.
- src/elevation/model/footprints.js (129): lines 45–46 and 114–115
- test: src/elevation/model/__tests__/wallSides.test.js

room.js:
- joinEdges: right after the `!sourceWall || !sourceRun || !targetRun` check (~617), return
  `{ ok: false, reason: 'joint-other-side', room }` when `wallSideOf(sourceRun) !== wallSideOf(targetRun)`.
- joinTouchingEdges (679): the candidate filter also requires `wallSideOf(candidate) === wallSideOf(run)`.
- stretchRun: after sourceRun is found, `const sideWall = wallViewForRun(sourceWall, sourceRun);`. Use sideWall for `length` (~952), both cornerReserve calls (953–954), the candidate run list (960) and the `cornerAt` at ~1005. The temporary-room mutation and validation below keep using the stored walls.
- moveRun: the free-run candidate list (~1077) uses `wallViewForRun(sourceWall, sourceRun).runs`; the joined-run candidate list (~1152) uses `wallViewForRun(resolvedWall, resolvedRun).runs`. Nothing else in moveRun changes.
- compensateRuns (95–108): compute one shift per side,
    `const shifts = Object.fromEntries(WALL_SIDES.map((side) => { const oldFrame = wallFrame(oldRoom, wallSideView(oldWall, side)); const newFrame = wallFrame(newRoom, wallSideView(wall, side)); return [side, dot(subtract(newFrame.leftPoint, oldFrame.leftPoint), newFrame.r)]; }));`
  return the wall unchanged when both are within 1e-9, and subtract `shifts[wallSideOf(joint)]` / `shifts[wallSideOf(run)]` where it subtracted `shift`.
- flipRunsForWall is NOT changed.

footprints.js: drop the per-wall `const frame = wallFrame(room, wall);` in footprintsAtPoint (45) and findCollisions (114) and use `wallSideFrame(room, wall, wallSideOf(run))` per run. runFootprint is unchanged. Remove wallFrame from the import if it is no longer used.

Tests 113–118 exactly as SPEC-17 §8 writes them.
Expect 408 passing.

At most five lines of summary. Commit "elevation-mvp: step 84 edits and footprints per wall side".
```

---
## Step 85 — Active side in state, toolbar and properties

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-17.md §4 (thickness input), §5, §8 tests 119–123.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/store/elevationSlice.js (1137): createInitialElevationState return (102–119), activateRoom (221), updateWall (446), deleteWall (477–481), setActiveWall (487), setRunAnchor (738), setSelection (1027), the exports list (1070–1135). Don't read other reducers.
- src/elevation/components/ElevationToolbar.jsx (162)
- src/elevation/ElevationLab.jsx (77)
- src/elevation/components/PropertiesPanel.jsx (1738): ONLY lines 1628–1642 (the useSelector block and the resolveWall line). Don't read the rest.
- test: src/elevation/store/__tests__/elevationSlice.test.js (1399; append a describe at the end — the run and stateWithRun helpers are at lines 66 and 106, reuse them)

elevationSlice.js:
- initial state: `activeWallSide: 'front',` after `activeWallId,` (107).
- set `state.activeWallSide = 'front'` in activateRoom, in setActiveWall, and in deleteWall's `deletedActiveWall` branch.
- new reducer setActiveWallSide(state, action): side = action.payload.side ?? action.payload; ignore unless 'front' or 'back'; set it; clearTransientSelection(state). Export it.
- setSelection: after building state.selection, if runId is set, find the run in roomFor(state) walls and set `state.activeWallSide = wallSideOf(run)`; if openingId is set, set 'front'. Import wallSideOf, wallViewForRun from '../model/wallSides.js'.
- setRunAnchor line 738: `cornerAt(location.room, wallViewForRun(location.wall, location.run), side)`.
- updateWall (446): 'thickness' is applied only when `Number.isFinite(value) && value >= 0`; name and height unchanged.

ElevationToolbar.jsx:
- read activeWallSide from the selector; import setActiveWallSide.
- in the elevation-only block, after the wall navigation div, a two-button segmented control ("Front", "Back") styled like the plan/elevation toggle at the top of the file, dispatching setActiveWallSide.
- wall label: append ` · Back` when activeWallSide === 'back'.
- disable the 'door' and 'window' tool buttons when `view === 'elevation' && activeWallSide === 'back'`, with title "Add doors and windows from the front".

ElevationLab.jsx: read activeWallSide; `resolveWall(activeRoom, …, activeWallSide)` and add it to the useMemo deps.

PropertiesPanel.jsx: add activeWallId and activeWallSide to the useSelector destructure (1628–1635); line 1642 becomes
  `resolveWall(room, storedWall, storedWall?.id === activeWallId ? activeWallSide : 'front')`
with both in the deps. Nothing else in this file changes: with a side view, the anchor select, run-edge list and corner labels are already single-sided.

Tests 119–123 exactly as SPEC-17 §8 writes them.
Expect 413 passing.

At most five lines of summary. Commit "elevation-mvp: step 85 active wall side".
```

**Check after 85:** the elevation toolbar has Front / Back. On an empty back side you can draw a run; it shows only on the back, and the front is untouched. Door and Window are greyed out on the back. Previews while stretching are fixed in step 86.

---
## Step 86 — Canvas and plan draw the active side

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-17.md §4, §5.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/components/ElevationCanvas.jsx (1538): ONLY lines 839, 866–878, 1010–1026, 1106–1117 and 1341. Don't read the rest.
- src/elevation/components/NeighborReturns.jsx (88): line 49–50
- src/elevation/plan/PlanCanvas.jsx (1120): ONLY lines 122–133 (orderedFootprints) and its imports. Don't read the rest.
- src/elevation/plan/PlanWallShape.jsx (200): the face Line at 86–91

ElevationCanvas.jsx — `wall` is already a side view (step 85). Import wallSideView from '../model/wallSides.js'.
- previewStretch (872–877), the run-move preview (1022–1026) and previewJointDrag (1110–1116): the `wall:` passed to setStretchPreview becomes `wallSideView(previewWall /* or resolvedWall */, wall.side)`. jointMembers calls and every commit path keep the stored wall from result.room — replaceWallLayout must get every run on the wall.
- line 1341 OpeningShape: `selectable={tool === 'select' && wall.side !== 'back'}`.
- line 839: after the tool check, `if (wall.side === 'back') { showMessage('Add doors and windows from the front'); return; }`.

NeighborReturns.jsx line 49–50: also `continue` when `wallSideOf(run) !== corner.neighborWallSide`.

PlanCanvas.jsx orderedFootprints (124–128): per run, `frame: wallSideFrame(room, wall, wallSideOf(run))` instead of one wallFrame per wall. PlanRunFootprint needs no change.

PlanWallShape.jsx: when `wall.thickness === 0` the face Line (86–91) is the wall: `strokeWidth={2 / scale}`, `hitStrokeWidth={8 / scale}`, `listening`. Otherwise it stays as it is.

No new tests (UI). Run `npm test && npm run lint`: 413 passing.

At most five lines of summary. Commit "elevation-mvp: step 86 canvas and plan per wall side".
```

**Check after 86:**
- Draw a free-standing wall in plan and set its thickness to 0. It shows as a line you can still click.
- In elevation, put a base on the front and a base on the back of that wall, both anchored to both ends. In plan they sit back to back with no overlap warning.
- Click the back footprint in plan: the elevation opens on the Back side with that run selected.
- On a perimeter wall with a door, the back side shows the door mirrored and it can't be selected.
- Stretch a back run: the preview stays on the back and doesn't show front runs.

---
## Step 87 — `wall.endPanels` field

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-17.md §6 (Shape), §8 tests 124–125.
If `git status` shows uncommitted changes, stop and tell me.

Shape only; nothing reads the field yet.

Files:
- src/elevation/store/elevationSlice.js: createWall (62–81) only
- src/elevation/model/room.js: cloneRoom (56–78) only
- src/elevation/store/persistence.js: isWall (220–244) only
- tests: src/elevation/store/__tests__/elevationSlice.test.js (append), src/elevation/store/__tests__/persistence.test.js (append)

- createWall: `endPanels: values.endPanels ?? { start: null, end: null },`
- cloneRoom: copy it, `endPanels: { start: wall.endPanels?.start ? { ...wall.endPanels.start } : null, end: wall.endPanels?.end ? { ...wall.endPanels.end } : null },`
- isWall: `&& (wall.endPanels === undefined || isEndPanels(wall.endPanels))`, where isEndPanels requires an object with BOTH keys, each null or `{ width }` with width null or a finite number >= 0.
- addWallSegment goes through createWall and addWallWithConnections spreads the wall, so neither needs another change.

Tests 124–125 exactly as SPEC-17 §8 writes them.
Expect 415 passing.

At most five lines of summary. Commit "elevation-mvp: step 87 wall end panel field".
```

---
## Step 88 — Wall end panels: reserve, run ends, geometry

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-17.md §6, §8 tests 126–131.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/wallSides.js: add wallEndPanelAt
- src/elevation/model/corners.js: cornerReserveParts, the non-inside branch only
- src/elevation/model/room.js: describeAnchor (181) and the syncRoom end-type pass (~470–482) only
- NEW src/elevation/model/wallEndPanels.js
- src/elevation/model/index.js: exports
- test: src/elevation/model/__tests__/wallSides.test.js

wallSides.js: `wallEndPanelAt(room, wall, side, settings)` — wall is a side view; endpoint is frame.leftEndpoint or frame.rightEndpoint for side 'left'/'right'; return null if `wall.connections?.[endpoint]` or no `wall.endPanels?.[endpoint]`; else `{ endpoint, width: panel.width ?? settings.endPanelThickness }`.

corners.js cornerReserveParts, inside the `corner.type !== 'inside'` branch, after `custom` is computed:
  `const panel = corner.type === 'open' ? wallEndPanelAt(room, wall, side, settings) : null;`
  `if (panel && !custom) return { face: panel.width, back: 0, total: panel.width, source: 'panel' };`

room.js syncRoom end-type pass — replace the ends map with the four cases in SPEC §6 "Run ends", in that order. Case 2's check is
  `run.anchors?.[side] === true && wallEndPanelAt(nextRoom, wallViewForRun(wall, run), side, settings)`.
room.js describeAnchor: in the non-inside branch, `if (parts.source === 'panel') return \`Wall end panel ${formatInches(parts.total)}\`;` before the 'auto' line.

wallEndPanels.js: wallEndPanels and wallEndPanelPolygon exactly as SPEC §6 "Geometry" defines them. Import frontDepth from './corners.js', wallFrame from './geometry.js', wallSideView from './wallSides.js'. Accept either a stored wall or a view (use `wall.sideSource ?? wall`).

index.js: export wallEndPanelAt with the other wallSides exports, and `export { wallEndPanelPolygon, wallEndPanels } from './wallEndPanels.js';`.

Tests 126–131 exactly as SPEC-17 §8 writes them (ISP is defined there).
Expect 421 passing.

At most five lines of summary. Commit "elevation-mvp: step 88 wall end panels".
```

---
## Step 89 — Wall end panels in properties, elevation and plan

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-17.md §6 (UI), §8 test 132.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/store/elevationSlice.js: add one reducer and its export
- src/elevation/components/PropertiesPanel.jsx: ONLY WallHeightProperties (1449–~1600) and the slice import list (~53–83)
- NEW src/elevation/components/WallEndPanelShapes.jsx
- src/elevation/components/ElevationCanvas.jsx: ONLY the imports and the non-listening Layer that renders <NeighborReturns> (~1383–1395)
- src/elevation/plan/PlanCanvas.jsx: ONLY the imports and the block after orderedFootprints.map (~970–985)
- test: src/elevation/store/__tests__/elevationSlice.test.js (append)

elevationSlice.js: `setWallEndPanel(state, action)` with payload `{ wallId, endpoint, panel }`. Ignore unless endpoint is 'start' or 'end', and unless panel is null or `{ width }` with width null or finite >= 0. `location.wall.endPanels ??= { start: null, end: null };` then set `[endpoint] = panel ? { width: panel.width ?? null } : null`, then syncRoomAt.

PropertiesPanel.jsx WallHeightProperties: it already computes `frame`, `leftFree` and `rightFree` (~1457–1459). Add a <section> "Wall end panels" between the Wall section and the Heights section:
- one row per end, "Left end" → frame.leftEndpoint, "Right end" → frame.rightEndpoint;
- a checkbox bound to `Boolean(wall.endPanels?.[endpoint])`, disabled when that end isn't free, with the hint "Connected — corner";
- when checked, an InchInput for width with allowBlank and placeholder `formatInches(settings.endPanelThickness)` (read settings with useSelector);
- all changes dispatch setWallEndPanel.

WallEndPanelShapes.jsx: props { room, wall, settings, transform }. For each panel in wallEndPanels(room, wall, settings), draw a Rect from wallRectToScreen({ x: panel[wall.side].x, z: 0, width: panel.width, height: panel.top }, transform), fill KIND_COLORS.end_panel, opacity 0.55, a 1px stroke of the same colour, listening false. Render it in ElevationCanvas right after <NeighborReturns>.

PlanCanvas.jsx: after the footprints, for every wall render each wallEndPanels(room, wall, settings) polygon from wallEndPanelPolygon as a closed <Line> in KIND_COLORS.end_panel, opacity 0.7, listening false.

Test 132 exactly as SPEC-17 §8 writes it.
Expect 422 passing.

At most five lines of summary. Commit "elevation-mvp: step 89 wall end panels in the UI".
```

**Check after 89 — the island:**
- A 0"-thick free-standing wall, 96" long, with a 24" base on the front and a 12" base on the back, both anchored to both ends.
- In wall properties, tick "Left end". Both runs pull back 3/4" at that end and neither draws its own end panel there.
- The front elevation shows one purple panel at the left, floor to box top. The back elevation shows it at the right.
- Plan shows one purple strip across the full island depth, about 37 3/4".
- Untick it: both runs return to the end and get their own end panels back.
- On a wall whose left end is connected to another wall, the "Left end" checkbox is disabled.
