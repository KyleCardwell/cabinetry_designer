# Elevation Lab — SPEC-12 (selection bugs, plan depth labels, centerline dimension, move a run by its dimension)

Steps 45–50. Earlier SPEC files still apply; this file is the source of truth for what
follows. Repo state at time of writing: `feature/elevation-mvp` at `bda4309`
(step 44 elevation alignment guides), working tree clean.

Current sizes of the files this round touches:

| File | Lines |
|---|---:|
| `plan/PlanCanvas.jsx` | 1,112 |
| `store/elevationSlice.js` | 912 |
| `components/ElevationCanvas.jsx` | 850 |
| `model/room.js` | 652 |
| `model/dimensions.js` | 387 |
| `components/RunGroup.jsx` | 350 |
| `components/DimensionRow.jsx` | 275 |
| `plan/PlanRunFootprint.jsx` | 159 |
| `canvas/alignment.js` | 83 |

Five requests drive this round:

1. **Bug** — deleting a run leaves the wall unselectable until you switch walls and back.
2. **Bug** — clicking empty space doesn't deselect; only Esc does.
3. Plan view should show each run's full depth (door + bumper included, so 24 7/8" for a
   base) on top of the run.
4. The centerline callout should read as a dimension line from the edge it's measured from.
5. Clicking a run's dimension should also let you drag it — moving the whole run without
   changing its width, snapping the way the stretch handles snap, with the alignment line
   showing.

---

## §1 Bug 1 — the wall stays selected in elevation (step 45)

### §1.1 What actually happens

`PropertiesPanel.jsx` resolves everything it shows from `selection.wallId`:

```js
  const storedWall = room?.walls.find((candidate) => candidate.id === selection.wallId) ?? null;
  const wall = useMemo(() => resolveWall(room, storedWall), [room, storedWall]);
  const run = wall?.runs.find((candidate) => candidate.id === selection.runId) ?? null;
```

`deleteRun` (slice line 597) calls `clearTransientSelection`, which nulls **all four**
selection fields including `wallId`. And `setSelection` (line 816) deliberately preserves
whatever `wallId` already is:

```js
        wallId: state.selection.wallId ?? null,
```

So after deleting a run, `selection.wallId` is null, and every later click sets `runId`
on a selection whose `wallId` is still null — `wall` stays null, `run` is looked up on
`wall?.runs`, and the panel keeps showing "Select a wall, run or opening to edit it."
The clicks are landing; nothing can resolve them. `setActiveWall` (line 430) is the only
thing that puts `wallId` back, which is exactly why switching walls and back fixes it.

`deleteOpening` (line 553) has the same bug, and so does `setActiveRoom` → `activateRoom`
(line 155 area) while the elevation view is open.

### §1.2 The fix

In elevation view the wall is not a selection you can clear — it's the thing you are
inside. So `clearTransientSelection` keeps it:

```js
function clearTransientSelection(state) {
  state.selection = {
    runId: null,
    pieceId: null,
    openingId: null,
    wallId: state.view === 'elevation' ? state.activeWallId : null,
  };
}
```

That one change covers every caller, and the call-site ordering already suits it — each
caller that changes which wall is active does so *before* clearing:

| Caller | Line | Behavior after the change |
|---|---:|---|
| `activateRoom` | 155–174 | `activeWallId` is set to the new room's first wall first, so elevation lands on that wall |
| `addWall` | ~272 | plan-only gesture; `activeWallId` set first either way |
| `addWallSegment` | ~305 | same |
| `deleteWall` | ~426 | `activeWallId` is reassigned to `walls[0]` first, so elevation follows it |
| `setActiveWall` | 435 | `activeWallId` assigned first; the explicit `state.selection.wallId = wallId` on the next line becomes redundant — leave it |
| `deleteOpening` | 553 | **fixed**: the wall survives deleting one of its openings |
| `deleteRun` | 597 | **fixed**: the wall survives deleting one of its runs |
| `clearSelection` | 826 | in elevation, clears run/piece/opening and keeps the wall; in plan, clears everything as today |
| `setView` | 836 | `state.view` is assigned before the clear, so the explicit `wallId = activeWallId` two lines later is now redundant — leave it |

`clearSelection` keeping the wall in elevation is also the answer to bug 2's follow-on
question (§2.3): after an empty-space click the panel shows the wall's properties.

Nothing else changes. `setSelection` keeps its `?? null` passthrough, and plan view
behaves exactly as it does today.

---

## §2 Bug 2 — an empty-space click deselects (step 46)

### §2.1 What actually happens

Both canvases already dispatch the deselect. `ElevationCanvas.handleStageClick`
(line 579) does `dispatch(setSelection({}))` when the tool is `select`, and
`PlanCanvas.handleStageClick` does `dispatch(clearSelection())`. Neither is reached,
because the click is suppressed as a pan.

In select mode, pressing on empty canvas starts a pan gesture
(`handlePanPointerDown`, `selectDrag = pointerEvent.button === 0 && tool === 'select'`).
The window `pointermove` handler then marks the gesture as moved on **any** non-zero
delta:

```js
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (dx === 0 && dy === 0) return;
      panRef.current = { ...current, x: event.clientX, y: event.clientY, moved: true };
```

and `stopPanning` sets `suppressClickRef.current = true` whenever `moved` is set. One
pixel of pointer travel between press and release — which a trackpad produces almost
every time — swallows the click that would have deselected. Esc works because it is a
different code path.

### §2.2 The fix — a pan needs real travel

New pure module `canvas/panGesture.js`:

```js
/** Pointer travel, in CSS pixels, before a press counts as a pan instead of a click. */
export const PAN_THRESHOLD_PX = 3;

/**
 * Whether a press has travelled far enough from where it started to be a pan.
 *
 * @param {{x: number, y: number}} origin  where the pointer went down
 * @param {{x: number, y: number}} point   where the pointer is now
 * @param {number} [threshold]             CSS pixels
 * @returns {boolean}
 */
export function panExceedsThreshold(origin, point, threshold = PAN_THRESHOLD_PX) {
  if (!origin || !point) return false;
  return Math.hypot(point.x - origin.x, point.y - origin.y) > threshold;
}
```

Both canvases get the same two edits.

**`handlePanPointerDown`** — record where the press started, alongside the running
position (`ElevationCanvas` line 446, `PlanCanvas` line 781):

```js
    panRef.current = {
      pointerId: pointerEvent.pointerId,
      x: pointerEvent.clientX,
      y: pointerEvent.clientY,
      originX: pointerEvent.clientX,
      originY: pointerEvent.clientY,
      moved: false,
    };
```

**The window `pointermove` handler** (`ElevationCanvas` line ~240, `PlanCanvas` line 330)
— promote to a pan only past the threshold, and don't pan the view until then:

```js
      const moved = current.moved || panExceedsThreshold(
        { x: current.originX, y: current.originY },
        { x: event.clientX, y: event.clientY },
      );
      panRef.current = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        moved,
      };
      if (!moved) return;
```

then the existing `setPan(...)` / `setView(...)` line runs unchanged.

The view therefore trails the cursor by up to 3px for the first movement of a real pan.
That is deliberate and imperceptible; the alternative — panning by the full offset on the
crossing move — makes the content jump.

### §2.3 What the panel shows afterwards

With §1.2 in place, an empty-space click in elevation clears run, piece and opening and
leaves the wall as the context, so the panel switches to `WallHeightProperties` — wall
name, number, height, "Include in elevations". In plan it still clears to
"Select a wall, run or opening to edit it.", because plan lets you click the wall itself
to get back.

---

## §3 Plan-view full-depth label (step 47)

### §3.1 The number already exists

`frontDepth(run, settings)` in `model/corners.js` line 12 is
`run.depth + settings.bumperThickness + settings.doorThickness` — 24 + 1/16 + 13/16 =
**24 7/8** for a base with the shipped defaults, and `PlanRunFootprint.jsx` already
computes it at line 75 to draw the footprint. This step only labels it.

### §3.2 `plan/PlanRunFootprint.jsx` (159 lines)

A single rotated label centered in the footprint, aligned with the wall. `frame`,
`depth`, `centerX` (line 83) and `scale` are all already in scope; add `centerY` beside
`centerX`, and the label rotation from the wall direction:

```js
  const centerY = footprint.reduce((sum, point) => sum + point.y, 0) / footprint.length;
  const depthFontSize = 11 / scale;
  const depthText = formatInches(depth);
  const depthTextWidth = (depthText.length * 0.6 * 11 + 8) / scale;
  let depthRotation = Math.atan2(frame.d.y, frame.d.x) * 180 / Math.PI;
  if (depthRotation > 90 || depthRotation < -90) depthRotation += 180;
  const showsDepth = run.width > depthTextWidth;
```

and, as the last child of the outer `<Group>` (after the boundary-piece lines, before the
collision tooltip):

```jsx
      {showsDepth && (
        <Text
          x={centerX}
          y={centerY}
          width={depthTextWidth}
          offsetX={depthTextWidth / 2}
          offsetY={depthFontSize / 2}
          rotation={depthRotation}
          align="center"
          text={depthText}
          fontSize={depthFontSize}
          fill="#e2e8f0"
          listening={false}
        />
      )}
```

Import `formatInches` from `../model/units.js`. `Text` is already imported (line 2).

Notes:

- `0.6 * 11` is the same character-width estimate `canvas/dimensionLayout.js` uses, and
  the label is hidden on a run too narrow to hold it rather than letting it spill across
  neighbours.
- The `/ scale` divisions keep the label a fixed on-screen size, matching every other
  plan label.
- An upper over a base does **not** collide: each label sits at its own footprint's
  center, so a 12 7/8"-deep upper labels at ~6.4" off the wall and a 24 7/8" base at
  ~12.4", and the two read as separate rows.
- `#e2e8f0` matches the plan wall-length label rather than the run's type color, so the
  depth reads as a dimension, not as part of the run graphic.

### §3.3 What this is not

Not a dimension line: no extension lines, no ticks, no tick-to-tick geometry. The plan
already carries a wall dimension string per wall plus the elevation marker, and a
tick-and-extension depth dimension on every run buries the drawing. This is a label that
happens to be a measurement.

---

## §4 The centerline callout as a dimension line (step 48)

### §4.1 One height, three placements

The callout sits at a **fixed 40" above the floor**, whatever the run is:

- a base box tops out around 34 1/2" with its counter at 36", so 40" reads as *above* it;
- an upper starts around 54", so 40" reads as *below* it, in the backsplash zone where a
  shop drawing puts a faucet or outlet centerline;
- a tall runs 4" to ~90", so 40" reads as *inside* it.

That is the three-way placement this asks for, from one constant rather than a per-type
branch. `CENTERLINE_CALLOUT_Z` is the number to tune if 40" reads wrong in use.

### §4.2 `model/dimensions.js` — `centerlineMarkers` returns a dimension, not a tick

The function currently returns `{pieceId, x, calloutZ, value, from}` where `calloutZ` is
`piece.z + piece.height + 12` and `value` is the stored `pin.value`. It becomes:

```js
/** Height above the floor where centerline callouts are drawn. */
export const CENTERLINE_CALLOUT_Z = 40;

/**
 * Describe the centerline dimension for every center-pinned item in a run:
 * the datum it is measured from, the piece centerline, and the measured distance.
 */
export function centerlineMarkers(run, pieces, wall, wallLengthValue, settings) {
  return pieces.flatMap((piece) => {
    if (piece.role !== 'item') return [];
    const item = run.items.find((candidate) => candidate.id === piece.id);
    if (item?.pin?.anchor !== 'center') return [];
    const target = resolvePinTarget(item.pin, wall, wallLengthValue, settings);
    if (!Number.isFinite(target)) return [];
    const datumX = item.pin.from === 'right'
      ? target + item.pin.value
      : target - item.pin.value;
    const x = piece.x + piece.width / 2;
    return [{
      pieceId: piece.id,
      x,
      datumX,
      z: CENTERLINE_CALLOUT_Z,
      value: Math.abs(x - datumX),
      pieceBottom: piece.z,
      pieceTop: piece.z + piece.height,
      from: item.pin.from,
    }];
  });
}
```

Import `resolvePinTarget` from `./room.js`, in the import block that already pulls
`endCornerAnglesForRun`, `endMinWidthsForRun` and `pinTargetsForRun` from there (line 7).
`room.js` does not import `dimensions.js`, so this adds no cycle.

Two deliberate choices:

- **`datumX` is derived from the pin, not guessed.** `resolvePinTarget` (room.js line 227)
  returns the resolved anchor position: `pin.value` for `from: 'left'`,
  `length - pin.value` for `'right'`, and `openingAnchorX + pin.value` for `'opening'`.
  Subtracting (or adding, for `'right'`) `pin.value` recovers the datum itself — 0, the
  wall length, or the opening's casing/jamb/center edge.
- **`value` is the measured distance, not the stored intent.** `Math.abs(x - datumX)`
  uses the piece's real center, so a pin that got clamped (an unreachable pin at an
  anchored end) draws and labels what is actually built rather than what was asked for.
  When those differ, the panel still shows the requested pin value — the drawing tells the
  truth and the discrepancy is visible.

Export `CENTERLINE_CALLOUT_Z` from `model/index.js`'s `dimensions.js` block, beside
`centerlineMarkers`.

### §4.3 `components/RunGroup.jsx` — draw it

Replace the step-38 block at lines 311–330 (the dashed tick plus
`℄ 24" from left` text). The call site gains the new arguments —
`centerlineMarkers(run, result.pieces, wall, wall.length, settings)` — and each marker
draws four things:

```jsx
      {centerlineMarkers(run, result.pieces, wall, wall.length, settings).map((marker) => {
        const datum = wallRectToScreen({ x: marker.datumX, z: marker.z, width: 0, height: 0 }, transform);
        const center = wallRectToScreen({ x: marker.x, z: marker.z, width: 0, height: 0 }, transform);
        const spanTop = wallRectToScreen({
          x: marker.x,
          z: Math.max(marker.z, marker.pieceTop),
          width: 0,
          height: 0,
        }, transform);
        const spanBottom = wallRectToScreen({
          x: marker.x,
          z: Math.min(marker.z, marker.pieceBottom),
          width: 0,
          height: 0,
        }, transform);
        const midX = (datum.x + center.x) / 2;
        return (
          <Group key={`centerline:${marker.pieceId}`} listening={false}>
            <Line
              points={[spanBottom.x, spanBottom.y, spanTop.x, spanTop.y]}
              stroke="#facc15"
              strokeWidth={1}
              dash={[3, 2]}
            />
            <Line
              points={[datum.x, datum.y, center.x, center.y]}
              stroke="#facc15"
              strokeWidth={1}
            />
            {[datum, center].map((point, index) => (
              <Line
                key={`tick:${index}`}
                points={[point.x - 3, point.y + 3, point.x + 3, point.y - 3]}
                stroke="#facc15"
                strokeWidth={1}
              />
            ))}
            <Text
              x={midX - 40}
              y={datum.y - 14}
              width={80}
              align="center"
              text={`℄ ${formatInches(marker.value)}`}
              fontSize={11}
              fill="#facc15"
            />
          </Group>
        );
      })}
```

- The **dashed vertical** spans from the piece to the dimension line — `Math.min`/`Math.max`
  against the piece's own extents means it passes *through* the piece when 40" is inside
  it (tall), and reaches up or down to it otherwise (base, upper). That line is what ties
  the dimension to the cabinet it describes.
- The **45° slash ticks** match the dimension-row convention in `DimensionRow.jsx`.
- The label drops "from left" / "from right" / "from opening": the line now starts at the
  datum, so the direction is drawn rather than written. `℄` stays as the centerline mark.
- A very short dimension (a piece centered a few inches off its datum) puts the label over
  its own ticks. That is left alone; if it reads badly, the fix is the same pop-out
  treatment `layoutDimensionRow` does, which is more machinery than this callout warrants.

`formatInches`, `Group`, `Line`, `Text` and `wallRectToScreen` are all already imported in
`RunGroup.jsx`.

### §4.4 Existing tests change shape

`model/__tests__/dimensions.test.js` tests 11–13 (SPEC-10) call
`centerlineMarkers(run, pieces)` and assert `calloutZ: 46.5` and `value: 24`. They must be
updated to the new signature and return shape — §7 gives the new expectations.

---

## §5 `moveRun` (step 49)

### §5.1 It snaps the way the stretch handles snap

`stretchRun` (room.js line 533) rounds the dragged edge to ½", then snaps it to the
nearest of `0`, the wall length, the two corner reserves, and every other run's two edges
within `STRETCH_EDGE_SNAP_DISTANCE` (2", line 23). `moveRun` uses the same candidate list
and the same tolerance, with one difference: a move has two edges that can catch, so both
are tested and the nearest pairing wins.

```js
/**
 * Move a run along its wall without changing its width, snapping either edge to the
 * same candidates stretchRun snaps to, then resolve and validate the room.
 *
 * @returns {{ok:boolean,reason:string|null,room:object,snap:{value:number,edge:string}|null}}
 */
export function moveRun(room, wallId, runId, newX, settings) {
  const sourceWall = room.walls.find((wall) => wall.id === wallId);
  const sourceRun = sourceWall?.runs.find((run) => run.id === runId);
  if (!sourceWall || !sourceRun || !Number.isFinite(newX)) {
    return { ok: false, reason: 'run-not-found', room, snap: null };
  }
  if (sourceRun.anchors?.left || sourceRun.anchors?.right) {
    return { ok: false, reason: 'anchored', room, snap: null };
  }

  const length = wallLength(sourceWall);
  const candidates = [
    0,
    length,
    cornerReserve(room, sourceWall, 'left', sourceRun, settings),
    length - cornerReserve(room, sourceWall, 'right', sourceRun, settings),
    ...sourceWall.runs
      .filter((run) => run.id !== runId)
      .flatMap((run) => [run.x, run.x + run.width]),
  ];

  let x = roundTo(newX, 0.5);
  let snap = null;
  for (const candidate of candidates) {
    for (const edge of ['left', 'right']) {
      const edgeX = edge === 'left' ? x : x + sourceRun.width;
      const distance = Math.abs(candidate - edgeX);
      if (distance > STRETCH_EDGE_SNAP_DISTANCE + 1e-9) continue;
      if (snap && distance >= snap.distance - 1e-9) continue;
      snap = { value: candidate, edge, distance };
    }
  }
  if (snap) x = snap.edge === 'left' ? snap.value : snap.value - sourceRun.width;

  const maxRunOverhang = settings.maxRunOverhang ?? DEFAULT_SETTINGS.maxRunOverhang;
  if (x < -maxRunOverhang || x + sourceRun.width > length + maxRunOverhang) {
    return { ok: false, reason: 'out-of-bounds', room, snap: null };
  }

  const temporary = cloneRoom(room);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const runIndex = wall.runs.findIndex((candidate) => candidate.id === runId);
  wall.runs[runIndex] = cloneRun({ ...sourceRun, x });
  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const resolvedRun = resolvedWall.runs.find((candidate) => candidate.id === runId);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedRun,
    settings,
  );
  return validation.ok
    ? { ok: true, reason: null, room: synced, snap: snap ? { value: snap.value, edge: snap.edge } : null }
    : { ok: false, reason: validation.reason, room, snap: null };
}
```

Place it immediately after `stretchRun` (which ends at line 617) and export it from
`model/index.js`'s `room.js` block, beside `stretchRun`.

### §5.2 Differences from `stretchRun`, all intentional

- **It never sets an anchor.** `stretchRun` sets `anchors[side] = true` and swaps the end
  to a filler or end panel when a *resize* lands on a wall end or corner reserve, because
  that is a statement about how the run meets the wall. Sliding a run to the same place is
  not that statement, and `resolveHorizontal` (corners.js line 115) would then derive `x`
  from the datum and ignore the drag entirely.
- **It refuses an anchored run** (`reason: 'anchored'`) for the same reason: with
  `anchors.left` set, `x` is recomputed from the left datum on every sync, so the move
  would be silently undone. The UI reports this rather than eating the gesture (§6.3).
- **`width` never changes**, so there's no `minRunWidth` clamp — only the overhang bounds.
- **It reports its snap** so the canvas can draw the alignment line at the candidate it
  caught. `stretchRun` doesn't, and isn't changed here.

Tie-breaking is by iteration order: candidates in the order listed above, and `left`
before `right` at equal distance. `0` and the wall length therefore win over a
coincident run edge, which is the same preference `stretchRun` expresses through its
`anchor` flag.

### §5.3 A run with a pinned item

`splitRun` holds a center-pinned item at its absolute target. Moving a run that contains
one keeps the pin satisfied by redistributing the neighbouring cabinet widths, so the run
slides while the pinned cabinet stays put and its neighbours change size. That follows
from what a pin means, but it is worth watching in use: if it reads wrong, the answer is
probably that a move should shift the pin's `value` with the run, which would be its own
step.

---

## §6 Dragging a run by its dimension (step 50)

### §6.1 Which surface drags

`DimensionRow.jsx` already builds three invisible hit rects for every `kind === 'run'`
segment (lines ~213–235): `band` (28px deep, spanning the dimension line between its
ticks), the label rect, and `leader` for a popped-out label. Those three are the drag
surface — hovering the dimension, never the run body. The run's own `Rect` in
`RunGroup.jsx` and its stretch handles are untouched, so dragging a handle still resizes.

### §6.2 `components/DimensionRow.jsx` — new optional props

```js
  draggableRuns = false,
  onSegmentDragStart,
  onSegmentDragMove,
  onSegmentDragEnd,
```

A module-level ref tracks whether the current gesture moved, so the trailing Konva click
after a drag doesn't also re-fire selection:

```js
  const dragMovedRef = useRef(false);
```

The three hit rects gain the same handler set. For a horizontal row, the drag is locked to
the row's own line and the delta is converted from screen pixels to inches with
`transform.scale`; `origin` is the rect's own `x` as rendered:

```js
  const dragProps = (segment, origin) => (draggableRuns && segment.kind === 'run' ? {
    draggable: true,
    dragBoundFunc: (position) => (horizontal
      ? { x: position.x, y: origin.y }
      : { x: origin.x, y: position.y }),
    onMouseEnter: () => setResizeCursor('move'),
    onMouseLeave: () => setResizeCursor('default'),
    onDragStart: (event) => {
      event.cancelBubble = true;
      dragMovedRef.current = false;
      onSegmentDragStart?.(segment);
    },
    onDragMove: (event) => {
      event.cancelBubble = true;
      dragMovedRef.current = true;
      onSegmentDragMove?.(segment, dragDelta(event, origin));
    },
    onDragEnd: (event) => {
      event.cancelBubble = true;
      const delta = dragDelta(event, origin);
      event.target.position(origin);
      onSegmentDragEnd?.(segment, delta);
    },
  } : {});
```

where `dragDelta` is `(event.target.x() - origin.x) / transform.scale` for a horizontal
row and `-(event.target.y() - origin.y) / transform.scale` for a vertical one (screen y
grows downward, wall z grows upward), and `setResizeCursor` mirrors the helper
`RunGroup.jsx` already uses.

`onDragStart` also selects the run — the panel should follow what you're dragging — so it
calls `onSegmentClick?.(segment)` once. The existing `onClick` then guards against the
trailing click:

```js
          onClick: clickable ? (event) => {
            event.cancelBubble = true;
            if (dragMovedRef.current) {
              dragMovedRef.current = false;
              return;
            }
            onSegmentClick(segment);
          } : undefined,
```

`event.target.position(origin)` on drag end is the same reset the stretch handle does —
the rect returns to where the layout puts it and the run's new position comes back through
the store.

Only the two `outer` rows carry run segments, so only they get the new props
(`ElevationCanvas.jsx` lines 755–763 and ~795–805, the two `DimensionRow`s that already
pass `onSegmentClick`). Pass `draggableRuns={tool === 'select'}`.

### §6.3 `components/ElevationCanvas.jsx` — preview, snap line, commit

The canvas already owns a preview of a modified run: `stretchPreview` (line 95) holds
`{room, wall, run}` and renders a ghost `RunGroup`. The move reuses it rather than adding
a parallel preview — the visual is identical and the render path already exists.

```js
  const moveOriginRef = useRef(null);

  const startRunMove = useCallback((segment) => {
    if (!room || !wall) return;
    const run = wall.runs.find((candidate) => candidate.id === segment.runId);
    if (!run) return;
    moveOriginRef.current = { runId: run.id, x: run.x };
    setStretchPreview({ room, wall, run });
  }, [room, wall]);

  const applyRunMove = useCallback((segment, delta, commit) => {
    const origin = moveOriginRef.current;
    if (!origin || !room || !wall || origin.runId !== segment.runId) return;
    const result = moveRun(room, wall.id, segment.runId, origin.x + delta, settings);
    if (!result.ok) {
      if (commit) {
        moveOriginRef.current = null;
        setStretchPreview(null);
        setAlignmentGuides([]);
        showMessage(result.reason === 'anchored'
          ? 'Anchored — set Anchor to Free to move'
          : result.reason);
      }
      return;
    }
    const resolvedWall = result.room.walls.find((candidate) => candidate.id === wall.id);
    const resolvedRun = resolvedWall?.runs.find((candidate) => candidate.id === segment.runId);
    if (!resolvedRun) return;
    setAlignmentGuides(result.snap ? [{ axis: 'x', value: result.snap.value }] : []);
    if (!commit) {
      setStretchPreview({ room: result.room, wall: resolvedWall, run: resolvedRun });
      return;
    }
    moveOriginRef.current = null;
    setStretchPreview(null);
    setAlignmentGuides([]);
    dispatch(setMessage(null));
    dispatch(replaceRun({ wallId: wall.id, run: resolvedRun }));
  }, [dispatch, room, settings, showMessage, wall]);
```

wired as `onSegmentDragStart={startRunMove}`,
`onSegmentDragMove={(segment, delta) => applyRunMove(segment, delta, false)}`,
`onSegmentDragEnd={(segment, delta) => applyRunMove(segment, delta, true)}`.

The snap line comes free: `ElevationAlignmentGuides` (rendered at line 730) already takes
`{axis: 'x', value}` in wall coordinates and draws the dashed pink vertical, so the
candidate edge the move caught shows the same way step 44's alignment snaps do. The
guides clear on commit, on a rejected commit, and on Esc (the handler at line ~356
already calls `setAlignmentGuides([])`).

Import `moveRun` from `../model/room.js` beside the existing `stretchRun` import, and
`useRef` if it isn't already imported.

### §6.4 What stays as it is

- Stretch handles keep both their snaps — step 44's 6px alignment snap on the way in and
  `stretchRun`'s 2" candidate snap inside, which is also what sets anchors. That behavior
  is liked as shipped and is not touched.
- `canvas/alignment.js` is not changed. The move gets its snapping from `moveRun`, and only
  borrows the guide *rendering*.
- Opening drags (`OpeningShape` → `moveOpening`) are untouched.

---

## §7 Tests

Tests 1–3 in a new `canvas/__tests__/panGesture.test.js` (step 46); 4–8 in
`store/__tests__/elevationSlice.test.js` (step 45); 9–11 rewrite the existing
`centerlineMarkers` tests in `model/__tests__/dimensions.test.js` (step 48); 12–16 in
`model/__tests__/stretchRun.test.js`, reusing its `makeRun`/`makeRoom`/`makeOutsideRoom`
helpers (step 49). Steps 47 and 50 add none — both are Konva rendering.

1. **Travel at the threshold is still a click.**
   `panExceedsThreshold({x: 0, y: 0}, {x: 3, y: 0})` → `false`;
   `panExceedsThreshold({x: 0, y: 0}, {x: 4, y: 0})` → `true`.
2. **Diagonal jitter is measured as distance, not per-axis.**
   `{x: 2, y: 2}` (2.83) → `false`; `{x: 3, y: 3}` (4.24) → `true`.
3. **A custom threshold is honored, and a missing point is not a pan.**
   `panExceedsThreshold({x: 0, y: 0}, {x: 6, y: 0}, 8)` → `false`;
   `panExceedsThreshold(null, {x: 99, y: 99})` → `false`.
4. **Deleting a run keeps the wall selected in elevation.** State with `view: 'elevation'`,
   `activeWallId: 'wall-1'`, `selection: {wallId: 'wall-1', runId: 'run-1', pieceId: null,
   openingId: null}` → `deleteRun({wallId: 'wall-1', runId: 'run-1'})` →
   `selection` is `{runId: null, pieceId: null, openingId: null, wallId: 'wall-1'}`.
5. **And a later selection resolves against that wall.** Continuing from test 4,
   `setSelection({runId: 'run-2'})` → `selection.wallId === 'wall-1'` and
   `selection.runId === 'run-2'` — the condition the panel needs to show the run.
6. **Deleting a run in plan clears the wall, as before.** Same state with `view: 'plan'` →
   after `deleteRun`, `selection.wallId === null`.
7. **Deleting an opening keeps the wall in elevation.** `view: 'elevation'`,
   `selection: {wallId: 'wall-1', openingId: 'door-1', …}` → after
   `deleteOpening({wallId: 'wall-1', openingId: 'door-1'})`, `selection.wallId === 'wall-1'`
   and `selection.openingId === null`.
8. **`clearSelection` keeps the wall in elevation and clears it in plan.** From
   `view: 'elevation'`, `activeWallId: 'wall-1'`, a run selected → `clearSelection()` →
   `{runId: null, pieceId: null, openingId: null, wallId: 'wall-1'}`. From `view: 'plan'` →
   all four null.
9. **`centerlineMarkers` returns a dimension from the left wall end.** Pieces
   `[{id: 'left', role: 'item', x: 0, width: 24, z: 4, height: 30.5},
   {id: 'mid', role: 'item', x: 24, width: 24, z: 4, height: 30.5}]`, run
   `{items: [{id: 'left', pin: null}, {id: 'mid', pin: {from: 'left', value: 36, anchor: 'center'}}]}`,
   called as `centerlineMarkers(run, pieces, {openings: []}, 120, DEFAULT_SETTINGS)` →
   `[{pieceId: 'mid', x: 36, datumX: 0, z: 40, value: 36, pieceBottom: 4, pieceTop: 34.5,
   from: 'left'}]`.
10. **A right-hand datum measures from the wall length.** Same pieces, run
    `{items: [{id: 'left', pin: null}, {id: 'mid', pin: {from: 'right', value: 84, anchor: 'center'}}]}`,
    wall length 120 → one marker with `datumX: 120`, `x: 36`, `value: 84`, `z: 40`.
11. **Edge-anchored pins and pinless runs still return nothing.** A pin with
    `anchor: 'left'` yields `[]`, and `centerlineMarkers({items: []}, pieces, {openings: []},
    120, DEFAULT_SETTINGS)` yields `[]`.
12. **A clean move shifts `x` and keeps `width`.** `makeRoom()` (one run at
    `x: 40, width: 40` on a 120" wall) → `moveRun(room, 'A', 'run', 60, DEFAULT_SETTINGS)` →
    `ok`, the resolved run is `{x: 60, width: 40}`, and `snap` is `null`.
13. **A move snaps its left edge to the wall end.** `moveRun(room, 'A', 'run', 1.5, …)` →
    `x: 0`, `width: 40`, `snap: {value: 0, edge: 'left'}`.
14. **A move snaps its right edge to a neighbour's left edge.** Room with
    `makeRun('run')` (`x: 40, width: 40`) and `makeRun('other', {x: 90, width: 20})` →
    `moveRun(room, 'A', 'run', 49, …)` → the right edge lands on 90, so `x: 50` and
    `snap: {value: 90, edge: 'right'}`.
15. **A conflicting or out-of-bounds move is refused, with the room untouched.**
    Same two-run room → `moveRun(room, 'A', 'run', 80, …)` → `ok: false`,
    `reason: 'conflict'`, and the returned `room` is the input room.
    `moveRun(makeRoom(), 'A', 'run', 200, …)` → `ok: false`, `reason: 'out-of-bounds'`.
16. **An anchored run refuses to move.** `makeRoom([makeRun('run', {anchors: {left: true,
    right: false}})])` → `moveRun(room, 'A', 'run', 60, …)` → `ok: false`,
    `reason: 'anchored'`, `snap: null`, and no room change.

---

## §8 Step budget

| Step | Files | Lines read | Tests |
|---|---|---:|---|
| 45 selection keeps its wall | elevationSlice + its test | ~1,700 | 4–8 |
| 46 pan threshold | new panGesture.js, PlanCanvas, ElevationCanvas | ~1,960 | 1–3 |
| 47 plan depth label | PlanRunFootprint | ~160 | none |
| 48 centerline dimension | dimensions.js, RunGroup, dimensions.test | ~1,300 | 9–11 |
| 49 `moveRun` | room.js, index.js, stretchRun.test | ~950 | 12–16 |
| 50 drag by dimension | DimensionRow, ElevationCanvas | ~1,125 | none |

Step 50 depends on 49. Step 46 should not be split across the two canvases — the same two
edits in both, and one of them alone would leave the two views behaving differently.
`PropertiesPanel.jsx` (1,656 lines) is not opened by any of the six.
