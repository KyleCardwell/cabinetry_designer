# Elevation Lab — Codex Prompts, Steps 76–81 (dimension click, zoom, joint glyphs, sliding runs, draw-join)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first (including these docs).

**Order:** 76 → 77 → 78 → 79 → 80 → 81. Steps 76, 77 and 81 are independent of the rest and can run in any order; 80 needs 79.

**Codex can't open the app** (it's behind a login), so don't plan browser checks. Kyle checks the UI steps by hand, using the list after each one.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`. Run `npm test && npm run build && npm run lint` once, at the end. Line numbers are as of `1eeb5bc`.

---
## Step 76 — Zoom to 1600%

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-16.md §2.
If `git status` shows uncommitted changes, stop and tell me.

One edit. src/elevation/canvas/transform.js line 70:
  export function zoomViewAt(base, view, pointer, factor, { min = 0.25, max = 8 } = {})
becomes max = 16. Leave min at 0.25.
Do not touch src/elevation/plan/PlanCanvas.jsx — its MAX_ZOOM = 10 (line 79) is plan view's own cap and stays.
No new tests. Run `npm test && npm run build && npm run lint`: 378 passing.

At most five lines of summary. Commit "elevation-mvp: step 76 zoom to 1600%".
```

---
## Step 77 — A dimension click selects; the second one opens the input

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-16.md §1.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/components/DimensionRow.jsx (319)
- src/elevation/components/ElevationCanvas.jsx (1467): only lines ~955–1040 (run move callbacks) and the two run DimensionRow blocks at 1348–1360 and 1386–1401. Don't read the rest of the file.

DimensionRow.jsx:
- Add an `activeRunId = null` prop next to `highlightRunId` (line 43).
- dragProps (line 91): the condition becomes
  `draggableRuns && segment.kind === 'run' && segment.runId === activeRunId`.
  Everything inside dragProps is unchanged.
- onMouseEnter in dragProps already sets 'move'. Add, to the `hitEvents` object (line 176), an onMouseEnter/onMouseLeave pair that sets 'pointer'/'default' for a clickable run segment that is NOT draggable. Keep the existing hidden-tooltip enter/leave working — merge, don't replace.
- Nothing else in this file changes. `clickable` (line 169) stays `segment.kind === 'run' && Boolean(onSegmentClick)`, so an unselected run's dimension is still clickable.

ElevationCanvas.jsx:
- New callback next to startRunMove (line 992):
  `const handleRunSegmentClick = useCallback((segment) => {
     if (tool !== 'select') return;
     if (selectionRef.current?.runId !== segment.runId) {
       dispatch(setSelection({ runId: segment.runId, pieceId: null }));
       return;
     }
     startRunMove(segment);
   }, [dispatch, startRunMove, tool]);`
  selectionRef already exists at line 142; check it is kept current and use `selection.runId` directly with `selection` in the dep list if it isn't.
- Both run DimensionRow blocks (1348–1360, 1386–1401) change identically:
    onSegmentClick={handleRunSegmentClick}
    onSegmentDragStart={startRunMove}
    activeRunId={selection.runId}
  keeping draggableRuns, onSegmentDragMove, onSegmentDragEnd, highlightRunId as they are.
- startRunMove keeps its own `dispatch(setSelection(...))` — leave it.
- The three DimensionRow blocks without onSegmentClick (lower.inner, openings, upper.inner) are not touched.

No new tests (UI). Run `npm test && npm run build && npm run lint`: 378 passing.

At most five lines of summary. Commit "elevation-mvp: step 77 dimension click selects first".
```

**Check after 77:** click a base's dimension — it selects, no input box. Click it again — the Move input opens. Drag it — it moves (and after step 79 it slides its joints). Clicking a *different* run's dimension selects that run instead of moving it.

---
## Step 78 — One link glyph per joined pair, bigger, frees one side

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-16.md §3, §7 tests 89–92.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/joints.js (105): add jointGlyphs, edit pruneJoints (line 80)
- src/elevation/model/index.js (175): export jointGlyphs
- src/elevation/store/elevationSlice.js (1127): setRunAnchor only (line 711)
- src/elevation/components/JointMarkers.jsx (150)
- src/elevation/components/ElevationCanvas.jsx (1467): only the dissolve callback (~1228–1233) and the <JointMarkers> render. Don't read the rest.
- tests: src/elevation/model/__tests__/joints.test.js (484), src/elevation/store/__tests__/elevationSlice.test.js (1335; append a describe at the end, don't read the whole file)

joints.js — `jointGlyphs(wall, jointId)` → [{ ownerRunId, z }] sorted by z ascending, per SPEC §3:
- box span of a run is [run.z, run.z + run.height]. Do NOT use verticalStart here.
- pairs: one member with side 'right' and one with side 'left' whose box spans overlap by > 0. z is the middle of the overlap. Owner is the smaller box height; tie → later in wall.runs order.
- one glyph per owner: if a run owns two pairs, keep the one with the larger overlap.
- every member in no pair gets its own glyph at its own box middle, owned by itself.

joints.js — pruneJoints: for every side whose joint anchor it clears (both the missing-joint pass and the under-subscribed pass), also strip `auto` from `run.ends[side]`. There is a `withoutAuto` helper in room.js line 595 — copy it into joints.js rather than importing (joints.js is pure and must not import room.js).

elevationSlice.js setRunAnchor (711–735): before assigning, if the previous `location.run.anchors[side]` was a joint anchor and the new value is not, set `location.run.ends[side] = withoutAuto(location.run.ends[side])`. isJointAnchor is already importable from model.

JointMarkers.jsx:
- Replace the single `middle` glyph with one per entry of jointGlyphs(wall, joint.id). Position each at wallToScreen({ x: joint.x, z: glyph.z }).
- fontSize 12 → 18 on the Text; give the Text `listening={false}` and put a transparent 24×24 Rect (fill "rgba(0,0,0,0.001)") centred on the same point carrying onClick / onMouseEnter / onMouseLeave / onMouseDown / onMouseUp.
- Rename the prop `onDissolve` to `onUnjoin` and call `onUnjoin(glyph.ownerRunId, side)`, where `side` is that member's side from jointMembers(wall, joint.id).
- Hover state is per glyph, not per joint: `hoveredJointId` / `setHoveredJointId` become `hoveredGlyphId` / `setHoveredGlyphId` keyed `${joint.id}:${ownerRunId}`. Hovering still outlines every member of that joint (unchanged Rect loop).
- Tooltip text becomes `Joined edge — click to free the ${type}`, where type is the first word of runShortLabel(ownerRun).
- The draggable joint handle (the `selected &&` Rect) is unchanged — still one per joint, still spanning all members.

ElevationCanvas.jsx:
- The onDissolve callback (~1228–1233) becomes
  `(runId, side) => dispatch(setRunAnchor({ wallId: wall.id, runId, side, anchor: false }))`
  and is passed as `onUnjoin`. setRunAnchor is already imported in this file; check before adding it.
- Leave `dissolveJoint` imported and exported everywhere it is now (room.js 706, index.js 157, elevationSlice.js 762/1098). Nothing calls it after this step; do not delete it.

Tests 89–92 exactly as SPEC-16 §7 writes them. TBT and TBU fixtures are already in joints.test.js — reuse them, don't redefine.
Expect 382 passing.

At most five lines of summary. Commit "elevation-mvp: step 78 a link glyph per joined pair".
```

**Check after 78:** join a tall to both a base and an upper at the same x. Two chain icons appear — one in the middle of the base, one in the middle of the upper. Click the upper's icon: the upper comes free, the tall and base stay joined, and one icon is left in the base. Click that one: both come free.

---
## Step 79 — moveRun slides a joined run

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-16.md §4 (model half), §7 tests 93–97.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/room.js (1143): moveJoint (780–~910) and moveRun (1046–~1110) only
- test: src/elevation/model/__tests__/joints.test.js (484)

Nothing outside room.js changes in this step. moveRun's only caller is ElevationCanvas.jsx:955, and it keeps working: the result still carries { ok, reason, room, snap }. Step 80 wires the new fields.

1. Extract, don't rewrite. The per-member range loop inside moveJoint (lines ~826–851, from `for (const member of members)` through the `constrainMin/constrainMax` calls) becomes

   `jointXRange(resolvedRoom, wall, jointId, settings, { excludeRunId = null } = {})
      → { min, max, minLimit, maxLimit }`

   skipping `member.runId === excludeRunId`. moveJoint calls it with no options and is otherwise untouched — its return shape, clamping, validation and messages all stay. Do not export jointXRange from model/index.js; it's internal to room.js.

2. moveRun (1046). The guard at 1052–1054 becomes: refuse with 'anchored' only when a side is truthy and NOT a joint anchor. Then:
   - no joint anchors at all → the existing body, unchanged, plus `joints: false` and `x` on the result.
   - at least one joint anchor → the slide path in SPEC §4, steps 1–7. Return { ok, reason, room, snap, x, range: { min, max } (the clamped dx range), limit, joints: true }.
   Reuse cloneRoom / syncRoom / validateRunPlacement / wallLength / runWidthRange the way moveJoint already does; the member mutation in step 5 is the same one moveJoint makes at lines ~870–882.
   Snap candidates: keep the existing list and STRETCH_EDGE_SNAP_DISTANCE, but drop the moving run and every other member's joined edge (SPEC §4 step 2).

Tests 93–97 exactly as SPEC-16 §7 writes them, appended to joints.test.js. TBT is already in that file.
Expect 387 passing.

At most five lines of summary. Commit "elevation-mvp: step 79 moveRun slides joined runs".
```

---
## Step 80 — Canvas: dragging a joined run

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-16.md §4 "Canvas".
If `git status` shows uncommitted changes, stop and tell me.

File: src/elevation/components/ElevationCanvas.jsx (1467) only — read lines 940–1080 (applyRunMove, startRunMove, updateRunMove, finishRunMove, previewJointDrag, commitJointDrag) and nothing else. commitJointDrag at ~1050 is the model for every dispatch and message shape here; copy it.

applyRunMove (~948–989):
- Preview branch: `runIds` becomes the moved run plus every member of every joint it belongs to (jointMembers on the resolved wall, both sides). It is currently `[resolvedRun.id]`.
- Commit branch: when `result.joints` is true, dispatch replaceWallLayout({ wallId, runs: resolvedWall.runs, joints: resolvedWall.joints }) instead of replaceRun. Otherwise keep replaceRun.
- When `result.limit` is set, showMessage the same two strings commitJointDrag uses:
    'min-width'   → `${type} can't go below ${formatInches(min)}`
    'fixed-width' → `${type} is fixed at ${formatInches(width)} (all cabinets fixed)`
  'wall-bounds' shows nothing.
- Delete the `joined` branch of the 'anchored' message (~960–968): the "Joined — drag the joint, or set Anchor to Free" string goes away entirely, along with its isJointAnchor lookup. Keep "Anchored — set Anchor to Free to move" for wall-end and opening anchors.

startRunMove (992–1036): call `moveRun(room, wall.id, run.id, run.x, settings)` once at gesture start and use its `range` (the dx range, added in step 79) as the entry's min/max. A run that returns `joints: false` keeps -Infinity / Infinity.

No other callbacks change. Don't touch JointMarkers.jsx, RunGroup.jsx or DimensionRow.jsx.
No new tests (UI). 387 passing.

At most five lines of summary. Commit "elevation-mvp: step 80 drag a joined run".
```

**Check after 80:**

1. Tall | base | tall, all joined. Select the base, drag its dimension right 6". The base stays 36", the left tall grows 6", the right tall shrinks 6".
2. Do it again with the right tall's cabinets all fixed width. The base won't move, and the message names the fixed run.
3. Drag the base until the right tall hits its minimum. It stops there.
4. A base joined only on its left slides and takes its left neighbour with it; its right edge stays free.
5. A run anchored to a wall end still refuses, with the old message.

---
## Step 81 — Drawing onto an edge joins it

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-16.md §5, §7 tests 98–99.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/runDefaults.js (122): createRun only (55–122)
- src/elevation/model/room.js (1143): joinTouchingEdges only (666–703)
- src/elevation/components/ElevationCanvas.jsx (1467): only applyRunAlignment (591–600), wallPointFromEvent (604–618), dragPreview (577–589), handleMouseDown (~666–704), handleMouseMove run-draw branch (~711–722), handleMouseUp (~738–760), commitRunDraw (~629–668). Don't read the rest.
- tests: src/elevation/model/__tests__/runDefaults.test.js (213), src/elevation/model/__tests__/joints.test.js (484)

runDefaults.js createRun: accept `ctx.exactEdges = { left?, right? }`. Lines 64–68 currently round both edges to 0.5. An edge present in exactEdges is clamped to [minimumX, maximumX] but not rounded; the other still rounds. width = right − left. With no exactEdges the output is byte-identical to today — test 98 pins both halves.

room.js joinTouchingEdges line 684: `<= PIN_EPSILON` becomes `<= 0.015625` (1/64"). Define it as a module constant JOIN_EDGE_TOLERANCE next to PIN_EPSILON (line 34). Nothing else in that function changes.

ElevationCanvas.jsx — the three sites of applyRunAlignment are 616, 826 and 839; that's the whole fan-out:
- applyRunAlignment returns `{ point, guides }` (snapToAlignment already gives it both; it currently throws the guides away after setAlignmentGuides).
- 826 and 839: `applyRunAlignment({ x: newEdgeX }, runId).x` → `.point.x`.
- wallPointFromEvent (604) returns `{ point, snappedX }`, where snappedX is the guide value when a guide with axis 'x' fired and null otherwise. Update its three callers (handleMouseDown, handleMouseMove run-draw branch, handleMouseUp) to destructure.
- The run-draw gesture gains `snappedStartX` (set in handleMouseDown) and `snappedCurrentX` (set in handleMouseMove and handleMouseUp).
- commitRunDraw and dragPreview: map the two gesture points to left/right by gesture.direction, and pass whichever of them was snapped as exactEdges to createRun. Everything after createRun — tryPlaceRun, joinTouchingEdges, the replaceWallLayout / addRun branch — is unchanged.

Leave SampleRunsButton.jsx's three createRun calls alone; they pass no exactEdges and keep rounding.
Tests 98–99 exactly as SPEC-16 §7 writes them.
Expect 389 passing.

At most five lines of summary. Commit "elevation-mvp: step 81 drawing onto an edge joins it".
```

**Check after 81:** draw a tall, stretch it so its right edge lands somewhere odd like 23 3/4". Draw a base starting on that edge — the guide fires, the base starts exactly at 23 3/4" with no gap, and the chain icon appears. Draw a third run 2" away from an edge: no guide, no join.
