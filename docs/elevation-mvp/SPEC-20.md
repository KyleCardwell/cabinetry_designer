# Elevation Lab — SPEC-20 (soffit and plan polish)

Steps 101–105. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-19 (soffits) must be done first.

This is a round of fixes from Kyle's first pass over wing walls and soffits.

## After this SPEC you can

- Draw an upper that's only partly under a soffit, and its whole box drops to fit under it. When it's under two soffits, the lower one wins.
- See a soffit in plan as a thin dashed line, not a thick one.
- Look at an elevation where wing walls and soffits are drawn as plain outlines, with no hatch. When a soffit is exactly as deep as the wing wall it ends against, the line between them is gone, because they're the same plane.
- Change a soffit's left edge and width from its properties.
- Get an elevation letter for the back side of a wall that has cabinets on its back, with its marker on that side in plan and "Elevation B" (or whatever letter it gets) under that side's elevation.
- See the plan elevation markers sit just past the deepest run on their side, however far you zoom in or out.
- Read bigger plan dimension text. A run depth that's too narrow for its number (a 12" upper when zoomed out) has the number set out past the run front instead of hidden.
- Turn any face section into a drawer stack that's nested in its own group, so it gets a stack height, without using a preset. The split buttons become arrow icons.
- Set a clearance on a run anchored to a wing wall, including a negative one. Set an offset on a run anchored to a soffit side.

## Not in this SPEC

- A cabinet that's deeper than a shallow soffit, notched around its front. It's logged in `TODO.md`. For now, every upper or tall that overlaps a soffit drops under it.
- Dragging soffit edges in elevation. Width is edited in properties for now.
- Taking the hatch off cabinet returns from neighbouring walls. Only wing walls and soffits lose it.
- A forced elevation (`elevationForced`) for the back of a wall. The back gets a letter only when it has runs.

---

## §1 Soffits over part of a run (`model/soffits.js`)

- **`soffitOverRun(wall, run)`.** For an upper or tall, it returns the lowest soffit on the run's side that overlaps the run's `x` range by more than 1e-6, otherwise `null`. It used to take only soffits that covered the whole range. The name stays the same, so `profileUnderSoffit`, `runMolding` and `soffitEndType` all follow it unchanged.
- **`soffitConflicts`.** No code change. An auto run under the lowest soffit it overlaps now tops out at or below every soffit it overlaps, so it no longer conflicts. A manual-height run that's too tall still does.
- **Test 167** changes. U4 (`x 10, width 40`, overlapping SF from 40 to 50) now syncs to height 24 and has no `soffit-conflict`. M1 still has its one conflict.

## §2 Flush soffit ends

In `model/landings.js`:

```js
landingProjection(room, wallOrView, wallId) → number | null
```

This is how far the landed wall `wallId` stands out from the host face on that side. It's `|dot(freeEnd − landedEnd, wallSideFrame(room, host, side).n)|`, where `landedEnd` is the landed wall's endpoint whose `landings[endpoint]` points at this host and side, and `freeEnd` is its other endpoint. It returns `null` if no such landing exists.

In `model/soffits.js`:

```js
soffitFlushSides(room, view, soffit) → { left: boolean, right: boolean }
soffitSeams(room, view) → [{ wallId, x, bottom }]
```

- **`soffitFlushSides`.** A side is flush when its anchor is `{ to: 'wall' }`, `(anchor.offset ?? 0) <= 1e-6` (touching it or running onto it), and `|landingProjection(room, view, anchor.wallId) − soffit.depth| <= 1e-6`.
- **`soffitSeams`.** One entry for every flush side of every soffit on the view's side. `x` is the landing interval's `b` for a flush left side and `a` for a flush right side. `bottom` is the soffit's bottom.

`soffits.js` may import `wallSideFrame` from `./wallSides.js`. It still must not import `room.js` or `corners.js`.

## §3 Elevation letters for both sides (`model/topology.js`)

```js
elevationKey(wallId, side) → side === 'back' ? `${wallId}:back` : wallId
wallHasCabinets(wall, side = 'front') → runs on that side (wallSideOf) > 0
elevationLetters(room) → Map<elevationKey, letter>
elevationLabel(room, wallOrView) → 'Elevation X' | null   // uses wallOrView.side ?? 'front'
```

- **`elevationLetters`.** It keeps today's pass over fronts in wall order, where a front gets a letter when it has front runs or `elevationForced`. It then adds a second pass over backs in wall order, where a back gets a letter when it has back runs. Front letters therefore don't change when someone adds cabinets to a back.
- A wall whose only runs are on the back no longer gets a front letter. That's a bug fix.
- `ElevationCanvas` already passes the side view to `elevationLabel`, so the back elevation's title works with no canvas change.

## §4 Where plan elevation markers go (`plan/elevationMarkers.js`, new, pure)

```js
export const MARKER_RADIUS = 14;          // px
export const MARKER_FLAG_LENGTH = 10;     // px
export const MARKER_CLEARANCE = 6;        // inches past the deepest run
export const MARKER_SHIFT = 24;           // px along the wall, away from the wall-number bubble
elevationMarkers(room, settings, scale) → [{ key, wallId, side, letter, point, direction }]
```

For every wall and each side that has a letter in `elevationLetters(room)`:

- `frame = wallSideFrame(room, wall, side)`. The face midpoint `mid` is the midpoint of `frame.leftPoint` and `frame.rightPoint`, and `direction = frame.n`.
- `deepest` is the largest `frontDepth(run, settings)` over the wall's runs on that side, or 0 if there are none.
- `offset = deepest + MARKER_CLEARANCE + (MARKER_RADIUS + MARKER_FLAG_LENGTH) / scale`. That puts the flag's tip 6" past the deepest run at any zoom.
- `point = mid + direction × offset + d × s × MARKER_SHIFT / scale`, where `d = wallFrame(room, wall).d`, and `s` is `+1` for the front and `−1` for the back. The back shifts the other way, so its marker stays clear of the wall-number bubble on the exterior side.
- `key = elevationKey(wall.id, side)`.

Walls go in `room.walls` order, front before back.

`PlanElevationMarker` takes its radius and flag length from these constants. `PlanWallShape` stops drawing the marker, and `PlanCanvas` draws them all from `elevationMarkers`.

## §5 Drawer stacks by hand (`model/faceTree.js`)

```js
makeDrawerStack(face, path, count) → face
```

- If the node at `path` isn't a leaf, it returns `face` unchanged, as the same reference.
- Otherwise the leaf becomes `{ direction: 'vertical', size: leaf.size, children: n × { type: 'drawer_front', size: null } }`, with `n` clamped to `2..MAX_FACE_SPLIT` and rounded.
- It always nests, even when the parent is vertical. That's the difference from `splitFace`, which flattens into a parent of the same direction, and it's why there was no way to get a stack height by hand.

It's exported from `model/index.js`.

## §6 UI

**Plan (step 103).**
- The soffit outline gets `strokeWidth={1 / scale}`. It had none, so Konva drew it 1" wide in world units.
- `plan/constants.js` gains `PLAN_DIM_FONT_SIZE = 13`. It replaces the 11 in `PlanWallShape` (the `fontSize` const and both `layoutDimensionRow` calls), `PlanRunFootprint` (the depth label) and `PlanOpening` (the label).
- `PlanWallShape` moves its rows out:
  - `dimensionOffset`: 18 → 22 px;
  - `extensionEndOffset`: 22 → 26;
  - the landing rows: `+16` → `+20`;
  - `labelDistance`: 9 → 10, and 12 → 14 per pop-out level;
  - `numberOffset`: 38 → 46.
- **The depth label in `PlanRunFootprint` is always shown.**
  - `textPx = depthText.length × 0.6 × PLAN_DIM_FONT_SIZE + 8`.
  - It fits when `depth × scale >= textPx + 4`. Then it's placed as today.
  - Otherwise it's **set out**: centred on the dimension line's axis at `depth + (4 + textPx / 2) / scale` from the face, with `offsetY = fontSize / 2`, and a leader line (`strokeWidth 0.75 / scale`, `#64748b`) from the front tick to `depth + 4 / scale`.

**Elevation (step 104).**
- `SoffitShapes`:
  - no `Hatch`, and the rect's fill is `rgba(0,0,0,0)` so it still takes clicks (Konva hit-tests by having a fill, not by its colour), with `strokeEnabled={false}`;
  - the outline is drawn as separate `Line` edges: top and bottom always, left unless `soffitFlushSides(...).left`, and right unless `.right`;
  - the stroke is `#60a5fa` 2px when selected and `#94a3b8` 1.5px otherwise.
- `NeighborReturns` landing entries (the wing walls):
  - no fill and no hatch, only edges;
  - for a vertical edge at `x === seam.x` for a seam with `seam.wallId === wallId`, the edge runs from `z 0` to `seam.bottom` only;
  - edges are wall-space segments converted with `wallToScreen`;
  - corner-return entries are unchanged.

**Properties (step 105).**
- `RunProperties`: the clearance block that today shows only for `anchor === true` also shows for a wing-wall anchor. The model already honours `run.cornerClearance` there through `cornerReserveParts`. A soffit anchor gets an Offset box (`allowBlank`, placeholder `0`), which dispatches `setRunAnchor` with `{ ...soffitAnchor, offset: value ?? 0 }`, plus the "Positive holds back…" hint and `describeAnchor`.
- `SoffitProperties` gains **Left** and **Width** at the top of the Soffit section.
  - Left is an `InchInput` bound to `x` only when both ends are Free. Otherwise it's `ReadOnlyValue`.
  - Width is an `InchInput` unless both ends are anchored, in which case it's `ReadOnlyValue`.
  - Both dispatch `updateSoffit`, which already resolves and validates.
- `FaceProperties`:
  - the Stack and Side-by-side buttons become 28px icon buttons, with an inline SVG, `title` and `aria-label` of "Split side by side" / "Split into a stack". Side by side is a vertical bar between a left and a right chevron (`‹|›`). Stack is the same turned 90°: a horizontal bar between up and down chevrons;
  - a third button, "Drawer stack", calls `makeDrawerStack(face, facePath, splitCount)`;
  - `groupLabel` reads "Drawer stack × N" for a vertical group whose children are all `drawer_front` leaves.

---

## §7 Tests

Numbering continues from SPEC-19 (last was 173). Expect 463 passing before step 101.

### Step 101 (`soffits.test.js`)

The helpers are SPEC-19's (`upper`, `makeWall`, `makeRoom`, `wallById`, `alcove`, `SF`, `soffitWall`, `runById`).

- **167 (changed).** Synced heights are `[24, 36, 36, 24]`. U1, U2, U3 and U4 have no `soffit-conflict`. M1 still has exactly `[{ code: 'soffit-conflict', soffitId: 'SF' }]`.
- **174.** `syncRoom(makeRoom([makeWall('S', 0, 0, 144, 0, { soffits: [SF(), SF({ id: 'SG', x: 100, width: 40, bottom: 90, molding: 'none' })], runs: [upper('U5', { x: 90, width: 30 })] })]))`:
  - U5 is `z 54`, `height 24`;
  - `runMolding(S, U5)` is `'crown'`;
  - `roomDiagnostics` gives U5 no `soffit-conflict`.
- **175.** With `room = alcove()` and `view = wallSideView(wallById(room, 'H'), 'front')`, `landingProjection(room, view, 'W1')` is `30`, `landingProjection(room, view, 'W2')` is `30`, and `landingProjection(room, view, 'nope')` is `null`.
- **176.** With `room = alcove()`, `flush = SF({ x: 69, width: 120, depth: 30, anchors: { left: { to: 'wall', wallId: 'W1', offset: 0 }, right: { to: 'wall', wallId: 'W2', offset: 0 } } })`, `H2 = { ...wallById(room, 'H'), soffits: [flush] }` and `view = wallSideView(H2, 'front')`:
  - `soffitFlushSides(room, view, flush)` → `{ left: true, right: true }`;
  - with `depth: 14` → `{ left: false, right: false }`;
  - with the left offset `1` → `{ left: false, right: true }`;
  - with the left offset `-4.5` → `{ left: true, right: true }`;
  - `soffitSeams(room, view)` → `[{ wallId: 'W1', x: 69, bottom: 84 }, { wallId: 'W2', x: 189, bottom: 84 }]`.

Expect 466 passing.

### Step 102

**177** (`topology.test.js`). Use `roomR()` with `wallOrder ['A', 'B']`, A's runs `[{ id: 'af' }, { id: 'ab', wallSide: 'back' }]`, and B's runs `[{ id: 'bb', wallSide: 'back' }]`:
- `elevationLetters(room)` equals `new Map([['A', 'A'], ['A:back', 'B'], ['B:back', 'C']])`;
- `elevationLabel(room, { ...room.walls[0], side: 'back' })` is `'Elevation B'`;
- `elevationLabel(room, room.walls[1])` is `null`;
- `wallHasCabinets(room.walls[1])` is `false`, and `wallHasCabinets(room.walls[1], 'back')` is `true`.

**178** (new `src/elevation/plan/__tests__/elevationMarkers.test.js`). `makeWall` and `makeRoom` are copied from SPEC-19's soffit helpers, and:

```js
const run = (id, cabinetTypeId, depth, overrides = {}) => ({ id, cabinetTypeId, x: 0, width: 30, z: 0, height: 30, depth,
  ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
  anchors: { left: false, right: false }, items: [], wallSide: 'front', ...overrides });
const room = makeRoom([makeWall('H', 0, 0, 246, 0, { runs: [
  run('B1', CABINET_TYPE_IDS.BASE, 24, { x: 20 }),
  run('U1', CABINET_TYPE_IDS.UPPER, 12, { x: 100, wallSide: 'back' }),
] })]);
```

`elevationMarkers(room, DEFAULT_SETTINGS, 2)` equals:

```js
[
  { key: 'H', wallId: 'H', side: 'front', letter: 'A', point: { x: 135, y: 42.875 }, direction: { x: 0, y: 1 } },
  { key: 'H:back', wallId: 'H', side: 'back', letter: 'B', point: { x: 111, y: -35.375 }, direction: { x: 0, y: -1 } },
]
```

The base's `frontDepth` is 24.875 and the upper's is 12.875. The back face is at `y −4.5`.

**179** (`faceTree.test.js`). With `face = { direction: 'vertical', size: null, children: [{ type: 'door', size: null }, { type: 'door', size: 30.25 }] }`:
- `makeDrawerStack(face, 'r.1', 3)` equals `{ direction: 'vertical', size: null, children: [{ type: 'door', size: null }, { direction: 'vertical', size: 30.25, children: [3 × { type: 'drawer_front', size: null }] }] }`;
- `makeDrawerStack({ type: 'door', size: null }, 'r', 1)` gives a vertical group of 2 drawer fronts with `size: null`;
- `makeDrawerStack(face, 'r', 3)` returns `face` itself (`toBe`).

Expect 469 passing.

Steps 103–105 are UI, checked by hand.
