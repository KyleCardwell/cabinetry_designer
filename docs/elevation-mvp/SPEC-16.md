# Elevation Lab — SPEC-16 (dimension click, zoom, joint glyphs, sliding runs, draw-join)

Steps 76–81. The earlier SPEC files still apply; this file is the source of truth for what follows.

Repo state when this was written: `feature/elevation-mvp` at `1eeb5bc`, working tree clean, 378 tests after step 75.

**Scope:**

- A click on a run's dimension **selects** it; the move input comes from the second interaction.
- Elevation zoom goes to 1600%.
- The link glyph is bigger, and there is **one per joined pair**, placed in the shorter run. Clicking it frees that run's edge instead of dissolving the whole joint.
- A joined run can be **dragged**. Its own width never changes; its joints move with it and the neighbours absorb.
- Drawing a run against an existing edge actually joins, because the alignment snap survives `createRun`.

Each prompt names its files, fixtures and tests.

---

## §1 Dimension click selects before it moves

Today `DimensionRow` gives every `kind: 'run'` segment both an `onClick` and a `draggable` hit rect, and both route to `onSegmentClick`, which `ElevationCanvas` has wired to `startRunMove`. So a single click on a run's dimension opens the `run-move` live entry, whether or not the run was selected.

New behaviour, for horizontal run dimension segments only:

- A run segment is **draggable only when it is the selected run** (`segment.runId === selection.runId`). `DimensionRow` gains a `activeRunId` prop; `draggableRuns && segment.kind === 'run' && segment.runId === activeRunId` is the new `dragProps` condition. `highlightRunId` keeps its current meaning and is passed the same value.
- `onSegmentClick(segment)` fires on every run segment click as it does today. `ElevationCanvas` routes it:
  - the run is **not** the selected run → `dispatch(setSelection({ runId: segment.runId, pieceId: null }))` and nothing else;
  - the run **is** the selected run → `startRunMove(segment)`, exactly as today.
- `onSegmentDragStart` is wired to `startRunMove` (it is currently unused; drag start reaches `startRunMove` only through `onSegmentClick`). `startRunMove` keeps its own `setSelection` dispatch.
- Cursor: `move` when the segment is draggable, `pointer` when it is only clickable.

So: click a run's dimension once to select it, then click again (or drag) to get the input. Everything else about `run-move` — the live entry, Tab, Escape, commit on release — is unchanged.

## §2 Zoom ceiling

`zoomViewAt(base, view, pointer, factor, { min = 0.25, max = 8 })` in `canvas/transform.js` is the only cap. `max` becomes **16** (1600%). `min` stays `0.25`.

Plan view's own `MAX_ZOOM = 10` in `PlanCanvas.jsx` **does not change**. There is no zoom percentage readout in the UI, so nothing else is affected.

## §3 Link glyphs, one per joined pair

Today `JointMarkers` draws one `⛓` at `fontSize 12` per joint, at the vertical middle of every member's combined extent, and clicking it dissolves the whole joint. With a tall joined to both a base and an upper that is a single glyph floating between them.

### Pairs and owners

New in `joints.js`:

```js
jointGlyphs(wall, jointId) → [{ ownerRunId, z }]   // sorted by z ascending
```

- The **box span** of a run is `[run.z, run.z + run.height]` — the drawn rectangle, *not* `verticalStart`.
- A **pair** is two members of the joint on opposite sides (one with `side: 'right'`, i.e. the run ends at the line; one with `side: 'left'`, i.e. the run starts at it) whose box spans overlap by more than 0.
- A pair's **glyph z** is the middle of that overlap.
- A pair's **owner** is the member with the smaller box height. On a tie, the one later in `wall.runs` order.
- **At most one glyph per owner.** If a run owns two pairs at the same joint, keep the pair with the larger overlap.
- **Fallback.** Every member that appears in no pair at all gets its own glyph, owned by itself, at the middle of its own box span. (This covers aligned-edge joins made through the Anchor select, where both members are on the same side, and joins between runs whose boxes don't overlap.)

Worked case — wall A, joint J1 at x 24, `T TALL z 4 h 80` ending at the line, `B BASE z 4 h 30.5` and `U UPPER z 54 h 30` starting at it:

| Pair | Overlap | Owner | Glyph z |
|---|---|---|---|
| T · B | 4 – 34.5 | B | 19.25 |
| T · U | 54 – 84 | U | 69 |

Two glyphs, one in the middle of the base and one in the middle of the upper, and none floating in the tall. That is the rule Kyle asked for, stated generally.

### Drawing and clicking

- `fontSize` goes from 12 to **18**, with a transparent 24×24 hit `Rect` centred on the glyph carrying the handlers (the `Text` itself keeps `listening={false}`). The glyph stays screen-constant; it does not scale with zoom.
- Hovering a glyph still outlines the joint's members and shows a tooltip. The text becomes **"Joined edge — click to free the \<Type\>"**, where `<Type>` is the owner's type word from `runShortLabel`.
- Clicking a glyph **frees the owner's joined side**: `dispatch(setRunAnchor({ wallId, runId: ownerRunId, side, anchor: false }))`. It does not touch the other members.
  - A two-member joint therefore behaves exactly as `dissolveJoint` did: freeing one member leaves one, and `pruneJoints` in `syncRoom` drops the joint and frees the survivor.
  - A three-member joint keeps going: freeing the upper leaves the tall and the base joined, with one glyph left in the base.
  - Nothing moves. `setRunAnchor(false)` keeps the run's stored `x`/`width`, so the edge stays where it was.

### `auto` when a side leaves a joint

SPEC-15 §5 says a side that leaves a joint drops `ends[side].auto` and keeps its current type. `dissolveJoint` does this; `setRunAnchor` and `pruneJoints` do not, so a run freed through the Anchor select or through pruning keeps a stale `auto: true`. Fix both in this step:

- `setRunAnchor`, when the previous value was a joint anchor and the new one isn't, strips `auto` from `ends[side]`.
- `pruneJoints`, for every side whose joint anchor it clears, strips `auto` from `ends[side]`.

`dissolveJoint` stays in `room.js` and in the slice. Nothing calls it after this step; do not delete it.

## §4 Sliding a run through its joints

`moveRun` currently refuses any run with an anchor on either side, joints included. It now slides a joined run.

```js
moveRun(room, wallId, runId, newX, settings)
  → { ok, reason, room, snap, x, range: { min, max } | null, limit: { runId, reason } | null, joints: boolean }
```

**The sliding run's own width never changes.** Sliding is not stretching: a stretch handle still resizes the run it is attached to, and the joined neighbour absorbs. A slide moves every joint the run belongs to by the same `dx`, so the run translates and the neighbours change width.

- **Refuse, as today (`reason: 'anchored'`)**, when either side is anchored to something that is not a joint — the wall end (`true`) or an opening. `joints` is `false` and nothing else runs.
- **Plain free run**: both sides free. The existing code path is unchanged and returns `joints: false`.
- **Slide**: at least one side is a joint anchor, and no side is a non-joint anchor.

Steps:

1. Resolve: `syncRoom(room, settings)`, take the resolved run. `dx` is measured from the resolved `run.x`.
2. **Snap.** Same candidate list and same `STRETCH_EDGE_SNAP_DISTANCE` as today (wall ends 0 and `length`, both corner reserves, every other run's two edges), **minus every edge that moves with the run**: the run itself, and for every joint the run is in, each other member's joined edge. Snapping to an edge that follows you is meaningless.
3. **Range on `dx`.** Start `[−Infinity, Infinity]`.
   - Extract the per-member range loop that `moveJoint` already has (`room.js` lines ~826–851) into `jointXRange(resolvedRoom, wall, jointId, settings, { excludeRunId = null })` → `{ min, max, minLimit, maxLimit }`, and call it from `moveJoint` unchanged.
   - For each joint `J` the run is a member of: `jointXRange(..., J.id, ..., { excludeRunId: runId })`, contributing `[min − J.x, max − J.x]`. The sliding run is excluded from its own joints' constraints because its width is fixed; both of its joints move by the same `dx`, so its width is satisfied by construction.
   - Wall bounds for the run's own edges: `dx ≥ −maxRunOverhang − run.x` and `dx ≤ length + maxRunOverhang − (run.x + run.width)`, limit `{ runId, reason: 'wall-bounds' }`.
   - Empty range → `{ ok: false, reason: 'over-constrained', room }`.
4. **Clamp** `dx` into the range. `limit` names the run that stopped it, with the same reasons as `moveJoint`: `'min-width'`, `'fixed-width'`, `'wall-bounds'`. `x` in the result is the resolved `run.x + dx`.
5. **Apply.** Clone the resolved room. For each of the run's joints, `joint.x += dx`; for every *other* member of those joints, keep its far edge and let its joined edge follow, the same mutation `moveJoint` makes. Set the sliding run's `x = run.x + dx` and keep its `width`. `syncRoom`.
6. **Validate.** Every affected run (the sliding run and every member of its joints) through `validateRunPlacement` against the runs outside that set, as `moveJoint` does. A collision returns `{ ok: false, reason: 'conflict', room }` with the room unchanged.
7. Return `joints: true` so the caller knows the wall's joints moved, and `range` as the clamped `dx` range so the caller can bound a typed distance. A free run returns `joints: false` and `range: null`.

Consequences worth being explicit about:

- Joined on both sides: one neighbour grows by `dx`, the other shrinks by `dx`. The run's own cabinets are untouched, so **a run whose cabinets are all fixed width still slides**.
- A third member of one of those joints (the upper in a tall | base + upper stack) **stretches with the joint** — its joined edge follows, its far edge stays. That is what a joint means; it does not slide alongside.
- A **rigid neighbour** (no auto cabinets, no flex fillers) pins its joint in both directions, so `dx` clamps to 0 and `limit` is `{ runId, reason: 'fixed-width' }`. Pushing the rigid neighbour along instead of stretching it stays deferred (SPEC-15 §9).

### Canvas

- `applyRunMove` calls `moveRun` as it does now. On commit it dispatches `replaceWallLayout({ wallId, runs, joints })` when `result.joints` is true, and `replaceRun` otherwise — the same shape as `finishStretch`'s `result.joined` branch.
- The preview already uses `setStretchPreview({ room, wall, runIds })`. `runIds` becomes the sliding run plus every member of its joints, so the neighbours preview too.
- A clamped slide shows the same limit messages as a joint drag: `"<Type> can't go below <min>"` for `'min-width'`, `"<Type> is fixed at <w>" (all cabinets fixed)` for `'fixed-width'`. `'wall-bounds'` shows nothing; the run simply stops.
- The `run-move` live entry's `min`/`max` come from the `dx` range instead of `±Infinity`, so a typed distance clamps the same way a drag does.
- The "Joined — drag the joint, or set Anchor to Free" message is **removed**; a joined run now moves. The plain "Anchored — set Anchor to Free to move" message stays for wall-end and opening anchors.

## §5 Drawing a run onto an edge joins it

`joinTouchingEdges` is already called after a successful draw (step 73), and it already matches butting edges within `1e-6`. It rarely fires, and the cause is upstream:

`ElevationCanvas` snaps the draw point to an existing run's edge with `applyRunAlignment` (6 px), and then `createRun` does `roundTo(x, 0.5)` and `roundTo(width, 0.5)` on the result. Any snapped edge that isn't already on a 1/2" boundary is rounded off it. The alignment guide says the edges met; the model says they are 1/4" apart; no join happens and a gap is left behind.

Fix, in two parts:

- **`createRun` takes exact edges.** `createRun({ x, width, bottomZ, topZ }, ctx)` accepts `ctx.exactEdges = { left?: number, right?: number }`. An edge given there is clamped to the overhang bounds but **not rounded**; the other edge rounds as it does today. `width` is then `right − left`. With no `exactEdges` the function behaves exactly as it does now.
- **`ElevationCanvas` remembers which x's were snapped.** `applyRunAlignment` returns `{ point, guides }` instead of just `point` (it already computes `guides`; `snapToAlignment` returns `{ point, guides }` with `{ axis, value }` entries). The `run-draw` gesture records `snappedStartX` and `snappedCurrentX` — the guide value when an `x` guide fired at that point, otherwise `null`. `commitRunDraw` and `dragPreview` map those two points to left/right by the drag direction and pass the snapped ones as `exactEdges`.

Also raise `joinTouchingEdges`'s match tolerance from `PIN_EPSILON` to **1/64" (0.015625)**, so an edge typed or resolved a rounding crumb away still joins. `joinEdges` pulls the source's edge onto the joint line, so a join within 1/64" closes the crumb rather than preserving it.

Everything else about `joinTouchingEdges` stays: a side already anchored (including a run drawn within `cornerSnapDistance` of a wall end) is skipped, existing joints are preferred over free edges, and vertical overlap is required.

## §6 Deferred

Still deferred from SPEC-15 §9, unchanged: pushing through rigid runs, joints across corners, pinned-cabinet reach narrowing the joint range, face frame joint stiles. Added here:

- dragging a run **body** in the canvas (slides are reached through the dimension segment only)
- a "disconnect every member" affordance now that the glyph frees one side at a time

---

## §7 Tests

Numbering continues from SPEC-15 (last was 88). The `makeRoom`/`makeRun` helpers and **fixture TBT** are as SPEC-15 §10 defines them, already in `model/__tests__/joints.test.js`. Fixture **TBU** is also already there (SPEC-15 §10, step 71).

For reference, TBT is wall A `(0,0)→(120,0)`, height 96:

```
T1  TALL  x 0   w 24  z 4  h 80    depth 24  anchors { left: false, right: J1 }
B   BASE  x 24  w 36  z 4  h 30.5  depth 24  anchors { left: J1, right: J2 }
T2  TALL  x 60  w 24  z 4  h 80    depth 24  anchors { left: J2, right: false }
wall.joints = [{ id:'J1', x:24 }, { id:'J2', x:60 }]
```

and TBU is wall A with `T TALL x 0 w 24 z 4 h 80 depth 12` (right side J1), `B BASE x 24 w 36 z 4 h 30.5 depth 24` (left side J1), `U UPPER x 24 w 36 z 54 h 30 depth 15` (left side J1), `J1` at 24.

### Step 78: joint glyphs (`joints.test.js`, `elevationSlice.test.js`)

89. `jointGlyphs(TBU wall, 'J1')` returns `[{ ownerRunId: 'B', z: 19.25 }, { ownerRunId: 'U', z: 69 }]`, in that order.
90. `jointGlyphs(TBT wall, 'J1')` returns `[{ ownerRunId: 'B', z: 19.25 }]`, and `jointGlyphs(TBT wall, 'J2')` returns `[{ ownerRunId: 'B', z: 19.25 }]`. The tall is never the owner.
91. Fallback: wall A with `P BASE x 0 w 30 z 4 h 30.5` (`anchors.right` J1) and `Q UPPER x 30 w 20 z 54 h 30` (`anchors.left` J1), `joints [{ id:'J1', x:30 }]`. The boxes don't overlap, so `jointGlyphs` returns `[{ ownerRunId: 'P', z: 19.25 }, { ownerRunId: 'Q', z: 69 }]` — one per member.
92. Slice, on TBU: `setRunAnchor({ runId: 'U', side: 'left', anchor: false })` leaves J1 on the wall with T and B still joined, `U.x === 24`, `U.anchors.left === false`, and `U.ends.left.auto === undefined`.

### Step 79: sliding a run (`joints.test.js`)

93. `moveRun(TBT, 'A', 'B', 30)`: J1 `30`, J2 `66`, T1 `x 0 w 30`, B `x 30 w 36`, T2 `x 66 w 18`. `ok: true`, `x: 30`, `limit: null`, `joints: true`.
94. `moveRun(TBT, 'A', 'B', 44)` clamps to `x 39` — T2 is at `minRunWidth` 9 with its far edge at 84. J1 `39`, J2 `75`, T1 `w 39`, B `x 39 w 36`, T2 `x 75 w 9`, `limit: { runId: 'T2', reason: 'min-width' }`.
95. TBT with T2's single cabinet fixed at `width: 24` and `autoCount: false`: `moveRun(TBT, 'A', 'B', 30)` returns `ok: true`, `x: 24`, nothing moved, `limit: { runId: 'T2', reason: 'fixed-width' }`.
96. TBT with T2 deleted (so J2 is pruned and `B.anchors.right` is `false`): `moveRun(..., 'B', 30)` gives J1 `30`, T1 `w 30`, B `x 30 w 36`, and B's right edge free at 66.
97. TBT with `T1.anchors.left = true`: `moveRun(..., 'T1', 4)` returns `{ ok: false, reason: 'anchored' }` and the room unchanged. A single free run in an otherwise empty wall still moves, with `joints: false`.

### Step 81: exact draw edges (`runDefaults.test.js`, `joints.test.js`)

98. `createRun({ x: 23.7, width: 36.3, bottomZ: 4, topZ: 34.5 }, { settings, room, wall, exactEdges: { left: 23.7 } })` gives `x: 23.7` and a right edge rounded to 60 (`width: 36.3`). With no `exactEdges` the same input gives `x: 23.5, width: 36.5` — today's behaviour.
99. Wall A with `T1 TALL x 0 w 23.7 z 4 h 80`, free sides. `tryPlaceRun` a base at `x 23.7 w 36`, then `joinTouchingEdges`: one joint at `23.7` with both sides `{ to: 'joint', offset: 0 }`. With the base at `x 23.71` it still joins (inside 1/64"); at `x 23.8` it does not.

Steps 76, 77 and 80 are UI steps, checked by hand.
