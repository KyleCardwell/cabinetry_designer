# Elevation Lab — SPEC-15 (joined runs, live entry, sticky draw tools)

Steps 67–75. The earlier SPEC files still apply; this file is the source of truth for what follows.

Repo state when this was written: `feature/elevation-mvp` at `4dd7680`, working tree clean, 348 tests after step 66.

**Scope:**

- Runs on the same wall can be **joined** at a shared edge, so they stay connected when widths change.
- Dragging or typing a joined edge moves every run in the joint.
- End panels at a joint follow depth coverage.
- Elevation drags get the same typed-distance box as plan walls.
- The draw-run and opening tools stay active until Escape or Select.

This round doesn't write patches ahead of time. Each prompt names its files, fixtures and tests.

---

## §1 Data

### Joints

```js
wall.joints = [{ id: 'J1', x: 24 }]        // wall-local x of the joint line; default []
run.anchors[side] = { to: 'joint', jointId: 'J1', offset: 0 }   // new anchor kind
run.ends[side].auto = true                  // optional; end type was set by the joint rule (§5)
```

- **A joint stores only its id and x.** Its members are derived: every run on the wall with `anchors.left` or `anchors.right` equal to `{ to: 'joint', jointId }`. There is no member list to keep in sync.
- **A side has one anchor.** It can be free, the wall end (`true`), an opening, or a joint.
- **`offset` is signed, like opening clearance and wall-end offsets.** Positive holds the run back from the joint line, toward its own body. Negative carries it past.
  - A run whose **right** side is in the joint has its right edge at `joint.x − offset`.
  - A run whose **left** side is in the joint has its left edge at `joint.x + offset`.
- **Pruning.** A joint with fewer than 2 members is removed, and a lone remaining member's anchor becomes `false`. This happens in `syncRoom`, so deleting a run, setting an anchor to Free, or deleting a wall all clean up the same way.
- **One run can't have both sides in the same joint.**
- **Joints are per wall.** Joining across a corner is out of scope; corners keep their existing reserve logic.
- **Persistence:**
  - `wall.joints` defaults to `[]` inside schema v3 (`normalizeV3Document`), so no version bump.
  - `isRunAnchor` accepts the joint shape: `jointId` is a string, and `offset` is `null` or a finite number (`null` reads as 0).
  - `isEnd` accepts an optional boolean `auto`.
  - `isWall` validates `joints` entries (`{ id: string, x: finite }`).
  - When loading, a joint anchor whose `jointId` isn't on the wall becomes `false`.

## §2 Resolution

- `resolveRunAnchorDatum` gets a `'joint'` case that returns `{ x: joint.x ± offset, type: 'joint', jointId }`. After that, `resolveHorizontal` needs no changes: a base between two talls is a run anchored on both sides.
- A missing joint returns `{ error: { code: 'anchor-joint-missing', side } }`. `syncRoom` prunes before it resolves, so this should only happen with stale input.
- **`compensateRuns`:** when a wall's left point shifts along the wall, every `joint.x` shifts by the same amount unanchored runs do (`x − shift`). A run anchored to a joint then follows its joint.
- **`flipRunsForWall`:** `joint.x → length − joint.x`. Anchors already swap sides, so members swap with them.
- **`describeAnchor`:** "Joined to Tall · flush". With an offset, "Joined to Tall · 1/2" gap" for positive and "Joined to Tall · 1/2" past" for negative. The name comes from `runShortLabel` (§6).

## §3 Moving a joint

```js
moveJoint(room, wallId, jointId, x, settings)
  → { ok, reason, room, x, range: { min, max }, limit: { runId, reason } | null }
```

- **Only the moved joint's line changes.** Every member's joined edge moves with it, and every member's other edge stays where it resolves now. A base between two joints keeps its far joint.
- **Range.** Each member limits `joint.x`; the joint's range is the overlap of all members' limits. The target is clamped into that range and `limit` names the run that stopped it.
  - **Width.** Use `runWidthRange(run, settings, opts)`, new in `splitRun.js`:
    - `min = max(settings.minRunWidth, fixedEnds + fixedItems + flexMinimums + minAuto × settings.minCabinetWidth)`, where `minAuto` is 1 when `autoCount` is on and there are auto cabinets, otherwise the auto cabinet count.
    - `max = Infinity`, except for a **rigid** run (no auto cabinets and no flex fillers), where `max = min = fixedEnds + fixedItems`.
    - A right-side member at `[o, e]` needs `e − o` in `[min, max]`. A left-side member at `[e, o]` needs `o − e` in `[min, max]`. Convert that to a range on `joint.x` using the member's offset.
  - **Wall bounds.** Every joined edge must stay in `[−maxRunOverhang, length + maxRunOverhang]`.
  - **Limit reasons:** `'min-width'`, `'fixed-width'` (rigid run) and `'wall-bounds'`.
- **Collisions.** After clamping, every member goes through `validateRunPlacement`. If any member collides with a run outside the joint, return `ok:false, reason:'conflict'` and leave the room unchanged.
- **Empty range.** If the range is empty (for example, a wall shortened until the chain can't fit), `moveJoint` returns `ok:false, reason:'over-constrained'`. `roomDiagnostics` doesn't change: the tight run already reports `anchor-too-narrow` or `over-constrained` from the existing code. **Joints are never broken to resolve this.**
- **Pins.** Pinned cabinets don't narrow the range in v1. `resolvePinnedSpan` still can't grow a joined side, just like any other anchored side.
- **`stretchRun`** on a side anchored to a joint calls `moveJoint` and returns its result, so the existing stretch handle wiring works. It must **not** clear the joint anchor the way it resets `anchors[side] = anchorsAtSnap` for free sides.
- **`moveRun`** still refuses any anchored run, joints included. The UI message becomes "Joined — drag the joint, or set Anchor to Free" when either side is a joint. Moving a joined run while its neighbors stretch is deferred (§9).
- **Width input** uses `resizeRun(room, wallId, runId, width, grow, settings) → { ok, reason, room }`:
  - With › or ‹ toward a joined side, it moves that joint to the new edge.
  - With ↔, it moves each joined side by half the change. A non-joined side keeps the existing `stretchedStart` path.
  - It's all one resolve-and-validate.

## §4 Creating and removing joints

```js
joinEdges(room, wallId, { runId, side }, { runId: targetRunId, side: targetSide }, settings)
  → { ok, reason, room }
```

- **Target already in a joint.** The source side joins that joint with offset 0, and the source run stretches its joined edge to the line. Its other edge stays put.
- **Target is free.** A new joint is created at the target edge's current x, and both sides get `{ to: 'joint', jointId, offset: 0 }`. The target run doesn't move.
- **Target anchored to a wall end or opening.** Refuse with `'joint-target-anchored'`. Two runs anchored to the same wall end already move together.
- **Refusals:**
  - same run → `'joint-same-run'`
  - `runId` or `side` not found → `'run-not-found'`
  - the result fails `validateRunPlacement` → that reason, with the room unchanged
- **Any pair of sides can be joined through the Anchor select**, including aligned edges (base.left with upper.left).
- **Automatic joining only happens for butting edges.** That means opposite sides (my right to their left, or the reverse) at the same x (within 1e-6), where the runs overlap vertically (`z` spans, using `verticalStart` for base/tall). It happens in two places:
  - **Stretch snap.** The stretch snap candidates carry `{ runId, side }`. When the final snapped edge is a butting run edge, and the snap wasn't clamped by min width, `stretchRun` calls `joinEdges` and returns `joined: { runId, side }`.
  - **Drawing.** After a run is placed, `joinTouchingEdges(room, wallId, runId, settings)` joins each side of the new run to the first butting edge it finds. Existing joints come first, then free edges.
- **Moving a run and snapping it to an edge doesn't join.** A joined run can't move, so joining on move would lock it on release.
- **Leaving.** Setting a side's anchor to anything else through the existing `setRunAnchor` removes it; pruning handles the rest. The canvas link icon disconnects the whole joint: `dissolveJoint(room, wallId, jointId)` sets every member's anchor to `false`, removes the joint, and keeps every edge where it is.

## §5 End panels at a joint

A run's end at a joint is **covered** when the runs touching it across the joint cover that whole side:

- A neighbor **touches** when it is on the opposite side of the same joint and its resolved edge equals this run's edge (within 1e-6). With a positive offset on either run there's a gap, so nothing touches.
- A touching neighbor **covers** a vertical span when `neighbor.depth >= run.depth`. Equal depth counts as covering.
- The end is covered when the union of covering spans (`[neighbor.z, neighbor.z + neighbor.height]`) contains `[run.z, run.z + run.height]`.

A covered end gets `{ type: 'none', width: null, auto: true }`. An uncovered end gets `{ type: 'end_panel', width: null, auto: true }`. A filler is never chosen automatically.

- `jointEndTypes(wall)` in `joints.js` returns `Map(runId → { left?, right? })` with the auto types for sides in joints.
- `syncRoom` applies it **only** to ends where `auto === true` **and** that side is anchored to a joint. It runs after horizontal resolution and before `syncAutoItems`, so end widths are included in the layout.
- `joinEdges` and `joinTouchingEdges` set `auto: true` on every side they join.
- `setRunEnd` (the user picking an end type) writes the end **without** `auto`, so a manual choice wins and stays when depths change.
- When a side leaves a joint, `auto` is dropped and its current type is kept.

**Worked cases** (wall A, joint J1 at x 24: tall on the left, base and upper on the right):

| Tall depth | Base 24 d | Upper 15 d | Result |
|---|---|---|---|
| 12 | end panel | end panel | tall: end panel |
| 25 | none | none | tall: end panel (uncovered between base top and upper bottom) |
| 12, upper 12 | end panel | none | tall: end panel |
| 25, base offset 1/2 | end panel (gap) | none | tall: end panel |

## §6 Properties panel

- **Anchor select.** Add an `<optgroup label="Run edges">` after the openings. It gets one option per side of every other run on the wall, with value `joint:<runId>:<side>` and a label from `runShortLabel(run)` plus the side, e.g. "Tall 0–24 · right edge". `runShortLabel` is new in `joints.js` and formats as `${type} ${formatInches(x)}–${formatInches(x + width)}`.
- **Current value.** When the side is already in a joint, the select shows the first other member's edge. Choosing another run edge dispatches `joinRunEdges`. Choosing Free, Corner or an opening goes through `setRunAnchor` as it does today.
- **Joint anchor block.** Under the select, a joint anchor shows:
  - an **Offset** `InchInput` (`allowBlank`, blank = 0) dispatching `setRunJointOffset`, with the existing hint "Positive holds the run back; negative carries it past";
  - the `describeAnchor` text.
- **Width.** `runGrowLocked` locks only non-joint anchored sides. `bothAnchored` (the read-only width) is true only when both sides are anchored and neither is a joint. The width commit dispatches `resizeRun` when either side is a joint, otherwise the existing `updateRun` path.

## §7 Canvas

- **Joint handle.** In the select tool, when a run in the joint is selected, the joint gets one handle. It spans the members' combined vertical extent (min bottom to max top) at `joint.x` and uses the same style as the stretch handle.
  - For joint sides, `RunGroup` draws neither the ▌ anchor glyph nor a stretch handle.
  - The handle lives in a new `components/JointMarkers.jsx`, rendered in the select layer.
- **Dragging the joint** previews the whole wall. `stretchPreview` becomes `{ room, wall, runIds }`, and the preview layer draws every run in `runIds`.
  - Release calls `moveJoint` and dispatches `replaceWallLayout({ wallId, runs, joints })` with the resolved wall.
  - A clamped result keeps the clamped position and shows the limit message: "Base can't go below 9"", or "Base is fixed at 36" (all cabinets fixed)".
- **Link icon.** A small chain glyph sits at the joint's vertical middle and is always visible, not only when a member is selected.
  - Hovering it highlights every member's outline.
  - Clicking it dispatches `dissolveJoint`.
  - Tooltip: "Joined edge — click to disconnect".
- **Stretch snap-join.** `finishStretch` dispatches `replaceWallLayout` when the result has `joined`, otherwise `replaceRun` as today.
- **Draw-join.** After `addRun`, the canvas runs `joinTouchingEdges` on the placed room and dispatches `replaceWallLayout` when anything was joined. Placement and joining go through one room result, so it's a single undo-able change.

## §8 Live entry and sticky tools

**Sticky tools (step 67).**

- After a run is drawn, the draw tool stays active and the new run is selected.
- After a door or window is placed, that tool stays active.
- A failed placement shows its message and also stays in the tool.

**Escape** in the elevation canvas works like plan view:

1. If a live entry is open, cancel it. Nothing else happens.
2. Otherwise, if the tool isn't Select: cancel any drag in progress, set the tool to Select, and clear the selection.
3. Otherwise, the existing order applies (drag → stretch preview → face path → selection).

**Live entry in elevation (step 74).** This reuses `useLiveEntry` and `LiveEntryInput` from plan view.

| Gesture | Entry kind | Label | Value | min / max |
|---|---|---|---|---|
| Joint or edge drag | `run-edge` | "<Type> width", for the run whose handle was grabbed | that run's width | from the joint range (§3), or `runWidthRange` plus wall bounds for a free edge |
| Run move | `run-move` | "Move" | signed delta from the start, like `wall-perpendicular` | −∞ / ∞ |
| Drawing a run | `run-draw` | "Width" | the drag width | `minRunWidth` / ∞ |

- **Press–drag–release** commits on release, as today, **unless a value has been typed**. Then release leaves the entry open, and Enter commits the typed value.
- **Pressing a handle and releasing without moving** keeps the entry open and following the pointer, like plan's click–move–click. A click on empty canvas commits it.
- **Typing a value** previews that value live, through the same preview path as dragging.
- **Commit** turns the typed width into an edge x for the grabbed run's dragged side, then calls `moveJoint` or `stretchRun`.

**Tab cycling (step 75).** `useLiveEntry` gains optional `modes`: `[{ key, label, value, min, max }]`, with `cycle()` bound to Tab while an entry is open. It keeps the typed text cleared on cycle, and `onCommit(value, modeKey)` receives the active mode.

- The `run-edge` modes are the grabbed run's width, each other member's width, the edge from the left wall end, and the edge from the right wall end.
- The commit converts whichever is active into the joint x.

## §9 Deferred

- pushing through rigid runs (moving the far joint of a run whose cabinets are all fixed width)
- moving a joined run so its neighbors stretch (v1 refuses)
- joints across corners
- pinned-cabinet reach narrowing the joint range
- face frame joint stiles (the wider-stile rule for anchored face frame runs)

---

## §10 Tests

Numbering continues from SPEC-14 (last was 59). Unless stated, the fixture is **wall A** `(0,0)→(120,0)`, height 96, not flipped, no connections: `makeRoom` in `stretchRun.test.js`. Runs use `makeRun` from that file, with these overrides:

```
T1  TALL  x 0   w 24  z 4   h 80    depth 24  anchors { left: false, right: {to:'joint', jointId:'J1', offset:0} }
B   BASE  x 24  w 36  z 4   h 30.5  depth 24  anchors { left: J1, right: {to:'joint', jointId:'J2', offset:0} }
T2  TALL  x 60  w 24  z 4   h 80    depth 24  anchors { left: J2, right: false }
wall.joints = [{ id:'J1', x:24 }, { id:'J2', x:60 }]
```

Every run has ends `none`/`none` (no `auto`), `autoCount: false`, and one **auto** cabinet `{ id, kind:'cabinet', width:null }`, unless the test says otherwise. Call this **fixture TBT**.

### Step 68: shape (`persistence.test.js`, `joints.test.js`)

60. A v3 document with a wall that has no `joints` loads with `joints: []`. A document with fixture TBT round-trips unchanged.
61. A run anchor `{ to:'joint', jointId:'J9', offset:0 }` where the wall has no J9 loads as `false`. `{ to:'joint', jointId:'J1', offset:'x' }` fails validation.
62. `jointMembers(wall, 'J1')` on TBT returns `[{ runId:'T1', side:'right', offset:0 }, { runId:'B', side:'left', offset:0 }]`, sorted by run order on the wall. `pruneJoints(wall)` returns TBT unchanged.

### Step 69: resolution and moving (`joints.test.js`)

63. TBT with B stored as `x 20, w 30`: `syncRoom` resolves B to `x 24, w 36` and T2 to `x 60, w 24`.
64. `moveJoint(TBT, 'A', 'J1', 30)`: T1 `w 30`, B `x 30 w 30`, T2 `x 60 w 24`, J1 `x 30`, J2 `x 60`, `limit null`.
65. `moveJoint(TBT, 'A', 'J1', 70)`: clamps to `x 51` (B at `minRunWidth` 9). Result `ok:true, x:51, range:{min:9, max:51}, limit:{ runId:'B', reason:'min-width' }`. The range min 9 comes from T1's minimum.
66. TBT with B's cabinet fixed at `width 36`: `moveJoint(..., 'J1', 30)` returns `x 24, range {min:24, max:24}, limit { runId:'B', reason:'fixed-width' }`.
67. TBT with `B.anchors.left.offset = 1.5`: `syncRoom` gives B `x 25.5, w 34.5`, and T1 stays `w 24`.
68. TBT plus **U** (`UPPER x 24 w 36 z 54 h 30 depth 12`, anchors `{ left: J1, right: false }`, ends `none`): `moveJoint(..., 'J1', 30)` gives T1 `w 30`, B `x 30 w 30`, U `x 30 w 30`.
69. TBT with `T1.anchors.left = false`, then wall A's `x1` changed from 0 to −10 through `compensateRuns(old, new)` + `syncRoom`: T1 `x 10 w 24`, J1 `34`, B `x 34 w 36`, J2 `70`, T2 `x 70`.
70. `flipRunsForWall` on TBT: J1 `96`, J2 `60`. T1 `x 96 w 24` with `anchors { left: J1, right: false }`, B `x 60 w 36` with `anchors { left: J2, right: J1 }`, T2 `x 36 w 24`.
71. Deleting T2 from TBT, then `syncRoom`: J2 is gone, `B.anchors.right === false`, B stays `x 24 w 36`.
72. `stretchRun(TBT, 'A', 'B', 'right', 66)`: B `w 42`, T2 `x 66 w 18`, J2 `66`, and B's right anchor is still `{ to:'joint', jointId:'J2' }`.

### Step 70: joining (`joints.test.js`, `elevationSlice.test.js`)

73. Free runs P `BASE x 0 w 30` and Q `TALL x 30 w 24`, no joints: `joinEdges(room, 'A', {runId:'P', side:'right'}, {runId:'Q', side:'left'})` gives one joint at x 30. Both sides are `{ to:'joint', offset:0 }` with the same id, and both ends have `auto: true`.
74. TBT plus U (`UPPER x 26 w 30 z 54 h 30 depth 12`, free sides): `joinEdges(..., {runId:'U', side:'left'}, {runId:'T1', side:'right'})` puts U in J1 with `x 24`, and U's right edge is unchanged at 56 (`w 32`).
75. `joinEdges(..., {runId:'B', side:'left'}, {runId:'B', side:'right'})` returns `ok:false, reason:'joint-same-run'`.
76. P `BASE x 0 w 30`, Q `TALL x 40 w 24`: `stretchRun(room, 'A', 'P', 'right', 39)` snaps to 40, gives P `w 40`, returns `joined: { runId:'Q', side:'left' }`, and makes one joint at 40.
77. Base R `BASE x 40 w 24`, upper S `UPPER x 0 w 30 z 54 h 30`: `stretchRun(room, 'A', 'S', 'right', 39)` snaps to 40 with no join, because the two don't overlap vertically.
78. Room with only T1 (`x 0 w 24`, free sides), then `tryPlaceRun` of base `x 24 w 36`, then `joinTouchingEdges(..., newId)`: one joint at 24.
79. Slice: `setRunAnchor({ runId:'B', side:'left', anchor:false })` on TBT removes J1 and sets `T1.anchors.right` to `false`.
80. Slice: `resizeRun({ runId:'B', width:42, grow:'right' })` gives J2 `66` and T2 `x 66 w 18`. `resizeRun({ runId:'B', width:40, grow:'both' })` gives J1 `22`, J2 `62`, T1 `w 22`, T2 `x 62 w 22`.
81. Slice: `setRunJointOffset({ runId:'B', side:'left', offset:1.5 })` gives B `x 25.5`. `dissolveJoint({ wallId:'A', jointId:'J1' })` leaves T1 `x 0 w 24` and B `x 24 w 36`, both with free sides at 24, and J1 gone.

### Step 71: end panels (`joints.test.js`)

Fixture **TBU**:

```
T  TALL   x 0   w 24  z 4   h 80    depth 12  anchors.right J1
B  BASE   x 24  w 36  z 4   h 30.5  depth 24  anchors.left J1
U  UPPER  x 24  w 36  z 54  h 30    depth 15  anchors.left J1
J1 x 24
```

All joined ends start as `{ type:'none', width:null, auto:true }`.

82. `syncRoom(TBU)`: T right, B left and U left are all `end_panel`.
83. TBU with T `depth 25`: T right `end_panel`, B left `none`, U left `none`.
84. TBU with U `depth 12`: U left `none`, B left `end_panel`, T right `end_panel`.
85. TBU with T `depth 25` and `B.anchors.left.offset = 0.5`: B left `end_panel`, U left `none`, T right `end_panel`.
86. Slice: `setRunEnd` on B left `{ type:'none', width:null }`, then `updateRun` T `depth 12`: B left is still `none`, and `B.ends.left.auto` is undefined.

Steps 67, 72, 73, 74 and 75 are UI steps checked by hand. Step 75 adds tests 87–88 in `useLiveEntry.test.js`:

87. `begin` with two `modes`, then `cycle()`: `entry.label` and `entry.value` switch to mode 2, and a second `cycle()` returns to mode 1.
88. After `setTyped('30')` and `cycle()`, `entry.typed` is `null`. `commit()` calls `onCommit(value, 'mode2key')`.
