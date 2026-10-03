# Elevation Lab — SPEC-17 (wall sides, islands, wall end panels)

Steps 82–89. The earlier SPEC files still apply; this file is the source of truth for what follows.

Repo state when this was written: `feature/elevation-mvp` at `b618797`, working tree clean except `TODO.md`. `vitest run` reports 388 passing and **1 failing** — `transform.test.js` "returns the view unchanged when zoom is already clamped" still expects the old 8× ceiling that step 76 raised to 16×. Step 82 fixes that test first.

This is build-order item (1) of the "Wall configuration" entry in `TODO.md`. Items (2)–(5) — the shared datum ranking, walls ending on faces, soffits, the alcove preset — are later SPECs.

**Scope:**

- Every wall has two sides, **front** and **back**, and every run and joint says which side it is on.
- Every existing model rule resolves a run against **its own side only**: corners, anchors, openings, joints, overlaps, pins, dimensions.
- The elevation shows one side at a time, with a Front/Back toggle. Plan draws both sides.
- A wall can be 0" thick. An island is one 0"-thick wall with runs on both sides, backs butted.
- A **wall end panel** at a free wall end is one part that spans both sides.

No backward compatibility is needed; none of this is live. Stored documents keep schema v3 with no migration.

---

## §0 Terms

These names collide with existing ones, so they are fixed here:

| Term | Means | Not to be confused with |
|---|---|---|
| **wall side** — `'front'` / `'back'` | Which face of the wall a run sits on. Front is the `+n` side of `wallFrame` (the room side of a perimeter wall, and the side every run is on today). | **Cabinet faces** (`faces.js`, `faceTree.js` — doors and drawer fronts) and **run sides** (`'left'` / `'right'`). |
| `run.wallSide`, `joint.wallSide` | The stored field. | — |
| **side view** | A wall-shaped object for one side, built by `wallSideView`. Never stored. | — |
| **wall end panel** | `wall.endPanels.start` / `.end`. One panel through both sides at a free endpoint. | A run's own `ends.left/right` end panel. |

A missing `wallSide` reads as `'front'` in the model (`wallSideOf`). That is not a compatibility rule: it keeps the ~390 existing test fixtures valid without editing 35 files. Everything that creates a run or a joint writes the field explicitly.

## §1 Side views — `model/wallSides.js` (new)

```js
WALL_SIDES = ['front', 'back']
wallSideOf(entity) → 'front' | 'back'            // entity.wallSide === 'back' ? 'back' : 'front'
mirrorOpening(opening) → opening                  // offsetFrom 'left' ↔ 'right', nothing else
wallSideView(wall, side = 'front') → view
wallViewForRun(wall, run) → wallSideView(wall, wallSideOf(run))
wallSideFrame(room, wall, side = 'front') → frame
```

**`wallSideView(wall, side)`** returns:

```js
{
  ...source,                                   // id, geometry, connections, profile, height, thickness, …
  side,
  sideSource: source,                          // the stored wall
  flipped: side === 'back' ? !source.flipped : Boolean(source.flipped),
  runs:     source.runs.filter((run) => wallSideOf(run) === side),
  joints:   (source.joints ?? []).filter((joint) => wallSideOf(joint) === side),
  openings: side === 'back' ? source.openings.map(mirrorOpening) : source.openings,
}
```

where `source = wall.sideSource ?? wall`. If `wall` is already a view of the requested side it is returned **unchanged** (same object). A view of the other side is rebuilt from `sideSource`. A spread copy of a view (`{ ...view, length }`) keeps `side`/`sideSource` and is therefore returned unchanged too.

Why this works with no other geometry changes:

- Toggling `flipped` is exactly what `wallFrame` already uses to flip `n`. With `n` flipped, `r` flips and `leftEndpoint`/`rightEndpoint` swap, so the back side's elevation reads left-to-right as you stand facing it. Every function that takes a wall and calls `wallFrame` — `cornerAt`, `createRun`, `horizontalChains` — gets the back side's frame for free.
- Openings go through the wall. Their stored offsets are front-side offsets; swapping `offsetFrom` mirrors them exactly (`startFromReadout` already resolves `'right'`, including `offsetAnchor: 'center'`). A door with its jamb at 24–60 on a 120" wall is at 60–96 from the back.
- Runs and joints on the back store `x` in **back-side coordinates**. Nothing is mirrored for them.

**`wallSideFrame(room, wall, side)`** is `wallFrame(room, wallSideView(wall, side))`, and for the back side with `thickness > 0` it moves `leftPoint` and `rightPoint` by `n × thickness` so plan geometry starts on the back face. For a 0"-thick wall the two sides share the face line.

**Back-side length.** A back side is as long as the wall (`wallLength`). At a connected end the true back face runs past that point by the neighbour's thickness (outside corner) or stops short (inside). Runs that need to reach it use the signed corner clearance from SPEC-9. The true extent arrives with "walls ending on faces".

## §2 Resolution per side

**Rule:** every model function that takes a run together with its wall converts on entry with `wall = wallViewForRun(wall, run)`. Callers may pass either the stored wall or a view.

| Function | File | Change |
|---|---|---|
| `endMinWidthsForRun`, `endCornerAnglesForRun`, `resolveRunAnchorDatum`, `describeAnchor`, `pinTargetsForRun` | room.js | Convert on entry. |
| `casingClearanceWarnings` (internal) | room.js | Convert on entry. |
| `cornerReserveParts` | corners.js | Convert on entry; filter the neighbour's runs by side (below). |
| `runFaceLayouts` | faceLayouts.js | Convert on entry (its `otherPieces` read `wall.runs`). |
| `validateRunPlacement` | overlap.js | A run only conflicts with runs on **the same side**. |

**`syncRoom`.** The vertical pass passes `baseRunsBelow` from `runs.filter(BASE)` — add `&& wallSideOf(candidate) === wallSideOf(run)`, so an upper on the back doesn't read the front's counter height. Every other pass already hands each run to a function that converts.

**`roomDiagnostics`.** The outer loop iterates side views instead of walls:

```js
for (const wall of synced.walls.flatMap((sourceWall) => (
  WALL_SIDES.map((side) => wallSideView(sourceWall, side))
))) {
```

The loop body is unchanged. `bases`, `openings`, `validateRunPlacement`, `runBlocksOpening` and the pin checks are all per-side as a result.

**`cornerAt`.** Two changes; the classification (`inside` / `outside` / `open` / `straight`) is untouched:

- New field **`neighborWallSide`**: the neighbour side that faces this wall, `dot(wallFrame(room, neighbor).n, uA) > 0 ? 'front' : 'back'`, where `uA` is this wall's direction away from the corner (already computed).
- `neighborSide` (`'left'`/`'right'`) is read from **that side's** frame: `wallFrame(room, wallSideView(neighbor, neighborWallSide))`.
- The `outside` branch returns the same shared fields: `{ ...shared, type: 'outside', angle: 360 - angle }`.

`cornerReserveParts` then skips neighbour runs where `wallSideOf(neighborRun) !== corner.neighborWallSide`. Two back sides can form an inside corner — two flipped walls in an L — and the reserve then reads the neighbour's back runs. The back of a perimeter wall sees `outside` corners at its connected ends, which is geometrically correct and reserves nothing unless a custom clearance is set.

**`resolveWall(room, wall, side = 'front')`** returns `{ ...wallSideView(wall, side), length }`. It is how `ElevationLab`, `PropertiesPanel` and `SampleRunsButton` get the wall they render.

**Left alone deliberately:** `jointXRange`, `moveJoint`, `resizeRun`, `tryPlaceRun`, `jointEndTypes`, `pruneJoints`, `splitRun`, all of `dimensions.js`. Joints are single-sided by construction (§3), so joint-id lookups stay on one side. Everything else either receives a view from its caller or goes through `validateRunPlacement`.

## §3 Edit operations stay on one side

- **`joinEdges`** refuses runs on different sides: `{ ok: false, reason: 'joint-other-side', room }`, checked right after the run-not-found check. A new joint is pushed as `{ id, x, wallSide: wallSideOf(sourceRun) }`.
- **`joinTouchingEdges`** only considers candidates on the run's own side.
- **`stretchRun`** builds its snap candidates from `wallViewForRun(sourceWall, sourceRun)`: length, both corner reserves, the other runs' edges, and the `cornerAt` used when an anchor snaps.
- **`moveRun`** builds both snap-candidate lists (free run and joined run) from the same side view.
- **`compensateRuns`** computes one shift per side from that side's frame and applies each run's and joint's own side's shift. Extending a wall at its start moves front `x` values and leaves back `x` values alone, because the back side's left end is the wall's end.
- **`flipRunsForWall`** is unchanged. It mirrors every run on both sides and toggles `flipped`, so every run moves to the opposite face at the same plan position. That is still what "Flip interior side" means.

## §4 Plan

- **Footprints.** `footprintsAtPoint` and `findCollisions` in `footprints.js`, and `orderedFootprints` in `PlanCanvas`, use `wallSideFrame(room, wall, wallSideOf(run))` **per run** instead of one `wallFrame` per wall. `runFootprint` itself is unchanged. `findCollisions` already skips same-wall pairs, so the two sides of an island never collide.
- **Zero-thickness walls.** `wallOutline` needs no change: with both thicknesses 0 the miter math returns the face corner. `PlanWallShape`'s filled outline has no area at 0", so the face line becomes the visible, clickable wall when `wall.thickness === 0`: `strokeWidth` `2 / scale`, `hitStrokeWidth` `8 / scale`, listening. At any other thickness it stays as it is.
- **Thickness input.** `updateWall` accepts `thickness` only when it is finite and `>= 0`.

## §5 Active side

**State.** `elevation.activeWallSide: 'front' | 'back'`, initial `'front'`. It is not persisted.

- `setActiveWall`, `activateRoom` and deleting the active wall reset it to `'front'`.
- New reducer **`setActiveWallSide(side)`**: ignores anything that isn't `'front'`/`'back'`; otherwise sets it and calls `clearTransientSelection`.
- **`setSelection`** keeps it in sync. With a `runId`, find the run in the active room and set `activeWallSide = wallSideOf(run)`. With an `openingId`, set `'front'`. So clicking a back footprint in plan (which dispatches `setActiveWall` then `setSelection`) opens the back elevation.
- **`setRunAnchor`**'s `cornerAt` call uses `wallViewForRun(location.wall, location.run)`.

**Rendering the side.**

- `ElevationLab` passes `resolveWall(activeRoom, wall, activeWallSide)` to `ElevationCanvas`.
- `PropertiesPanel` resolves its wall with `activeWallSide` when `storedWall.id === activeWallId`, and with `'front'` otherwise. The selected run is always on the active side (`setSelection` guarantees it), and the anchor select, corner labels and run-edge list are then all single-sided.
- In `ElevationCanvas`, every live preview built from a `result.room` wall (`previewStretch`, the run-move preview, `previewJointDrag`) is wrapped in `wallSideView(previewWall, wall.side)` before it goes into `setStretchPreview`. Commits keep using the stored walls from `result.room` — `replaceWallLayout` must receive **every** run on the wall, never a view's filtered list.
- `NeighborReturns` skips neighbour runs where `wallSideOf(run) !== corner.neighborWallSide`.

**Openings are edited from the front.** On the back side they draw mirrored and appear in the dimension chains, but they are not selectable, and the door and window tools do nothing except show "Add doors and windows from the front". The toolbar disables those two tools while the back side is active in elevation view.

**Toolbar.** A Front / Back segmented toggle next to the wall arrows (elevation view only). The wall label becomes `Wall 3 / 4 · Back` when the back side is active. `[` and `]` still step between walls and land on the front.

## §6 Wall end panels

A shape step (87) and then behaviour (88, 89).

**Shape.** `wall.endPanels = { start: null | { width: number | null }, end: null | { width: number | null } }`, keyed by **wall endpoint**, not by left/right, because left and right swap between sides. `width: null` means `settings.endPanelThickness`. `createWall` writes `{ start: null, end: null }`; `cloneRoom` copies it; persistence validates it when present.

**A panel only exists at a free endpoint.** At a connected endpoint it is ignored (not deleted), and the properties toggle is disabled.

```js
wallEndPanelAt(room, wallView, elevationSide, settings) → { endpoint, width } | null   // wallSides.js
```

`elevationSide` is `'left'`/`'right'` in the view's own frame; `endpoint = frame.leftEndpoint` or `frame.rightEndpoint`.

**Reserve.** In `cornerReserveParts`, a non-inside corner whose type is `'open'` and that has a wall end panel returns `{ face: width, back: 0, total: width, source: 'panel' }` — unless the run has a custom numeric `cornerClearance` on that side, which still wins. Every run anchored `true` to that end, on either side, therefore stops `width` short of it.

**Run ends.** The `syncRoom` pass that sets automatic joint end types becomes, per side of each run:

1. joint anchor and `end.auto === true` → the joint end type, exactly as today;
2. anchored `true` and `wallEndPanelAt(...)` is non-null → `{ type: 'none', width: null, auto: true }`;
3. not a joint anchor and `end.auto === true` → `{ type: 'end_panel', width: null }` (the panel was removed, so the run gets its own end panel back);
4. otherwise unchanged.

Case 3 cannot fire for a joint: every path that frees a joint side already strips `auto` (SPEC-16 §3).

**`describeAnchor`**, for `source === 'panel'`: `Wall end panel <width>`, e.g. `Wall end panel 3/4"`.

**Geometry — `model/wallEndPanels.js` (new):**

```js
wallEndPanels(room, wall, settings) → [{
  endpoint, width, top, thickness,
  front: { side, x, depth, top, runIds },
  back:  { side, x, depth, top, runIds },
}]
wallEndPanelPolygon(room, wall, panel) → [4 plan points]
```

- Per side: `side` is the elevation side that endpoint is on in that side's frame; `x` is `0` on the left or `length − width` on the right; `runIds` are that side's runs anchored `true` at that side; `depth` is the largest `frontDepth` of those runs (0 if none); `top` is the largest `z + height` of those runs.
- `top` overall is the larger of the two; a panel with `top <= 0` (no anchored runs on either side) is omitted.
- The panel runs from the floor (`z 0`) to `top`.
- The polygon uses the **front** frame: along the wall `panel.front.x` to `+ width`; across it from `−(thickness + back.depth)` to `front.depth`.

It is imported from `wallEndPanels.js` (not `corners.js`) because it needs `frontDepth`, and `corners.js` already imports `wallSides.js`.

**UI.** Wall properties gain a "Wall end panels" section: one checkbox per end, labelled by the front view's Left end / Right end, disabled with "Connected — corner" when that endpoint is connected, plus a blank-able width input (placeholder `settings.endPanelThickness`). The elevation draws each panel as a rect in `KIND_COLORS.end_panel` from the floor to `top`, on whichever side is showing. Plan draws the polygon in the same colour.

## §7 Deferred

- The back side's true extent at connected ends (it is the wall's length until "walls ending on faces").
- Editing or placing doors and windows from the back.
- Walls ending on another wall's face, spans, wing and pony walls, soffits, the shared datum ranking — later SPECs.
- The wall end panel as a part in an estimate or cut list, and an island countertop. When the countertop arrives it needs box depth (`run.depth`), not `frontDepth`, which includes bumper and door.
- A dimension-chain segment kind for a wall end panel (it currently shows as a 3/4" gap).
- Per-side wall numbering beyond the "· Back" label.

---

## §8 Tests

Numbering continues from SPEC-16 (last was 99). Model tests 100–118 and 126–131 go in a new file, **`src/elevation/model/__tests__/wallSides.test.js`**. Every coordinate below is literal.

### Helpers and fixtures (top of `wallSides.test.js`)

```js
const settings = DEFAULT_SETTINGS;
function base(id, overrides = {}) {
  return {
    id, cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 0, width: 96, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
    autoCount: false, maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    wallSide: 'front',
    ...overrides,
  };
}
function makeWall(id, x1, y1, x2, y2, overrides = {}) {
  return {
    id, name: '', numberOverride: null, elevationForced: false,
    x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
    connections: { start: null, end: null }, profile: {},
    openings: [], joints: [], runs: [], endPanels: { start: null, end: null },
    ...overrides,
  };
}
function makeRoom(walls) {
  return { id: 'room', name: 'Room', profile: { ...DEFAULT_SETTINGS.defaultProfile },
    wallOrder: walls.map((wall) => wall.id), walls };
}
function door(overrides = {}) {
  return { id: 'D1', kind: 'door', label: 'D1', measureMode: 'jamb', width: 36, height: 80,
    sillZ: 0, offset: 24, offsetFrom: 'left', offsetAnchor: 'edge',
    casing: { width: 3, thickness: 0.75 }, ...overrides };
}
const byId = (wall, id) => wall.runs.find((run) => run.id === id);
```

**ISL** — an island. `isl(overrides)` returns `makeRoom([makeWall('I', 0, 0, 96, 0, { thickness: 0, runs: [F, K], ...overrides })])` with

```
F  base('F', { anchors: { left: true, right: true } })                      front
K  base('K', { anchors: { left: true, right: true }, wallSide: 'back' })    back
```

**SQ** — a 120×96 room, thickness 4.5, connected in a cycle:

```
A (0,0)→(120,0)     start ↔ D.end,   end ↔ B.start
B (120,0)→(120,96)  start ↔ A.end,   end ↔ C.start
C (120,96)→(0,96)   start ↔ B.end,   end ↔ D.start
D (0,96)→(0,0)      start ↔ C.end,   end ↔ A.start
```

**FL** — two **flipped** walls in an L, thickness 4.5, so their back sides face the inside of the L. `flippedL(pRuns, qRuns)`:

```
P (0,0)→(96,0)    flipped: true   start null,        end ↔ Q.start   runs: pRuns
Q (96,0)→(96,96)  flipped: true   start ↔ P.end,     end null        runs: qRuns
```

### Step 82: shape and views (`wallSides.test.js`, `persistence.test.js`)

100. `wallSideOf({})` is `'front'`, `wallSideOf({ wallSide: 'back' })` is `'back'`, `wallSideOf({ wallSide: 'front' })` is `'front'`.
101. Wall W = `makeWall('W', 0, 0, 120, 0, { openings: [door()], joints: [{ id: 'JF', x: 10 }, { id: 'JB', x: 20, wallSide: 'back' }], runs: [base('F'), base('K', { wallSide: 'back' })] })`. The front view has runs `['F']`, joints `['JF']`, `flipped: false`. The back view has runs `['K']`, joints `['JB']`, `flipped: true` and `openings[0].offsetFrom === 'right'`, while `W.openings[0].offsetFrom` is still `'left'`. `wallSideView(back, 'back')` **is** `back` (same object); `wallSideView(back, 'front').runs` is `['F']`.
102. `openingGeometry(mirrorOpening(door()), 120, settings).jamb.x` is `60`. With `door({ offset: 42, offsetFrom: 'right', offsetAnchor: 'center' })`, `jamb.x` is `60`, and mirrored it is `24`.
103. `wallSideFrame(isl(), I, 'back')`: `leftEndpoint 'end'`, `leftPoint { x: 96, y: 0 }`, `r { x: -1, y: 0 }`, `n { x: 0, y: -1 }`. `wallSideFrame(SQ, A, 'back').leftPoint` is `{ x: 120, y: -4.5 }`.
104. `createRun({ x: 10, width: 30, bottomZ: 4, topZ: 34.5 }, { settings, room: isl(), wall: wallSideView(I, 'back') }).wallSide` is `'back'`. With `wall: I` it is `'front'`.
105. `persistence.test.js`, new `describe` at the end of the file: `tbtDocument()` with `rooms[0].walls[0].runs[0].wallSide = 'back'` passes `isElevationDocument`; with `'side'` it fails; with `rooms[0].walls[0].joints[0].wallSide = 'up'` it fails.

Also in step 82: `joints.test.js` line 341 (test 73) expects `[{ id: jointId, x: 30, wallSide: 'front' }]`, and `transform.test.js` line 79's `maximum` becomes `{ zoom: 16, panX: 3, panY: 4 }`.

### Step 83: resolution per side (`wallSides.test.js`)

106. `syncRoom(isl())`: F `x 0 w 96`, K `x 0 w 96`. `roomDiagnostics(isl())` has `errors: []` for both F and K — no `conflict`.
107. `isl()` with only F: `tryPlaceRun(room, 'I', K)` is `ok: true`; `tryPlaceRun(room, 'I', base('G', { x: 10, width: 30 }))` is `{ ok: false, reason: 'conflict' }`.
108. A back run anchored to a mirrored door: `makeWall('W', 0, 0, 120, 0, { openings: [door()], runs: [base('BK', { x: 70, width: 40, wallSide: 'back', anchors: { left: false, right: { to: 'opening', openingId: 'D1', edge: 'casing', clearance: 0 } } })] })`. After `syncRoom`, BK is `x 17 w 40` (the casing's left edge is at 57 from the back).
109. SQ: `cornerAt(SQ, wallSideView(A, 'front'), 'left')` matches `{ type: 'inside', angle: 90, neighborWallId: 'D' }` and `'right'` matches `{ type: 'inside', angle: 90, neighborWallId: 'B' }`. From the back, `'left'` matches `{ type: 'outside', angle: 270, neighborWallId: 'B' }` and `'right'` matches `{ type: 'outside', angle: 270, neighborWallId: 'D' }`.
110. FL: `cornerAt(FL, wallSideView(P, 'back'), 'right')` **equals** `{ type: 'inside', angle: 90, neighborWallId: 'Q', neighborSide: 'left', neighborWallSide: 'back' }`. `cornerAt(FL, wallSideView(P, 'front'), 'left').type` is `'outside'`.
111. FL with
    ```
    PB  base('PB', { wallSide: 'back', anchors: { left: false, right: true },
                     ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: null } } })   on P
    QB  base('QB', { width: 60, wallSide: 'back', anchors: { left: true, right: false },
                     ends: { left: { type: 'none', width: null }, right: { type: 'end_panel', width: null } } })     on Q
    QF  base('QF', { width: 60 })                                                                                     on Q
    ```
    `syncRoom`: PB `x 0 w 71.125`, QB `x 24.875 w 60`, QF `x 0 w 60`. The same room without QB: PB `w 96` (QF is on the front and never reserves on the back).
112. `makeWall('W', 0, 0, 120, 0, { openings: [door()], runs: [base('FR', { x: 70, width: 40 }), base('BK', { width: 30, wallSide: 'back' })] })`, synced. `resolveWall(room, W, 'back')` has runs `['BK']` and `length 120`. `openingChain(room, backView)` mapped to `[kind, start, end]` is `[['gap', 0, 60], ['opening', 60, 96], ['gap', 96, 120]]`. Every `piece` segment of `horizontalChains(room, backView, 'lower').inner` has `runId 'BK'`.

### Step 84: edits and footprints (`wallSides.test.js`)

113. `makeWall('J', 0, 0, 96, 0, { thickness: 0, runs: [base('P', { width: 48 }), base('Q', { x: 48, width: 48, wallSide: 'back' }), base('R', { x: 48, width: 48 })] })`. `joinEdges(P right → Q left)` matches `{ ok: false, reason: 'joint-other-side' }`. `joinEdges(P right → R left)` leaves joints `[[48, 'front']]` as `[x, wallSide]`.
114. Wall J with only P (front, x 0 w 48) and Q (back, x 48 w 48): `joinTouchingEdges(room, 'J', 'Q')` returns `joined: []` and the wall's joints stay `[]`.
115. `makeWall('W', 0, 0, 96, 0, { thickness: 0, runs: [base('F', { width: 40 }), base('K', { width: 30, wallSide: 'back' })] })`. `stretchRun(room, 'W', 'K', 'right', 39)` leaves K `x 0 w 39` — it does **not** snap to F's edge at 40. `moveRun(room, 'W', 'K', 11)` puts K at `x 11` with `snap: null` — without the fix its right edge snaps to 40 and x is 10.
116. Before: `makeWall('W', 0, 0, 120, 0, { thickness: 0, runs: [base('f1', { x: 10, width: 30 }), base('b1', { x: 10, width: 30, wallSide: 'back' })] })`. After: the same wall with `x1: -12`. `compensateRuns(before, after)` gives `[['f1', 22], ['b1', 10]]`.
117. `syncRoom(isl())`: `runFootprint(wallSideFrame(room, I, 'front'), F)` is `[{0,0},{96,0},{96,24.875},{0,24.875}]`; `runFootprint(wallSideFrame(room, I, 'back'), K)` is `[{96,0},{0,0},{0,-24.875},{96,-24.875}]` (as `{ x, y }` objects). `footprintsAtPoint(room, { x: 48, y: 10 })` is `['F']`, at `{ x: 48, y: -10 }` it is `['K']`. `findCollisions(room)` is `[]`.
118. `runFootprint(wallSideFrame(SQ, A, 'back'), base('Z', { width: 30, wallSide: 'back' }))` is `[{120,-4.5},{90,-4.5},{90,-29.375},{120,-29.375}]`.

### Step 85: active side (`elevationSlice.test.js`)

The slice test file's `stateWithRun(run)` helper builds `wall-1` `(0,0)→(144,0)`; its `run(overrides)` helper builds a base run.

119. `createInitialElevationState().activeWallSide` is `'front'`.
120. `stateWithRun(run({ id: 'F', wallSide: 'front' }))` → `setSelection({ runId: 'F' })` → `setActiveWallSide('back')`: `activeWallSide 'back'`, `selection.runId null`. Then `setActiveWallSide('side')` leaves it `'back'`.
121. `stateWithRun(run({ id: 'F', wallSide: 'front' }))` with `run({ id: 'K', x: 0, width: 60, wallSide: 'back' })` pushed onto the same wall. `setSelection({ runId: 'K' })` → `'back'`; `setSelection({ runId: 'F' })` → `'front'`; after `setActiveWallSide('back')`, `setSelection({ openingId: 'door-1' })` → `'front'`.
122. From `activeWallSide 'back'`, `setActiveWall('wall-1')` → `'front'`.
123. `updateWall({ wallId: 'wall-1', changes: { thickness: 0 } })` → thickness `0`; then `{ thickness: -1 }` → still `0`.

### Step 87: end panel shape (`elevationSlice.test.js`, `persistence.test.js`)

124. `addWall({})` and `addWallSegment({ x1: 0, y1: 0, x2: 96, y2: 0, thickness: 0 })` both create a wall with `endPanels: { start: null, end: null }`.
125. `tbtDocument()` with `rooms[0].walls[0].endPanels = { start: { width: null }, end: null }` passes `isElevationDocument`; `{ start: { width: 'x' }, end: null }` fails; `{ start: null }` (missing `end`) fails; no `endPanels` at all passes.

### Step 88: end panel behaviour (`wallSides.test.js`)

**ISP** is `isl({ endPanels: { start: { width: null }, end: null } })` with K's `depth` set to `12`.

126. `syncRoom(ISP)`: F `x 0.75 w 95.25`, K `x 0 w 95.25`. `F.ends.left` equals `{ type: 'none', width: null, auto: true }`, `F.ends.right` equals `{ type: 'end_panel', width: null }`, `K.ends.right` equals `{ type: 'none', width: null, auto: true }`. `splitRun(F, settings, {}).pieces` as `[kind, width]` is `[['cabinet', 94.5], ['end_panel', 0.75]]`.
127. The synced ISP with `endPanels: { start: null, end: null }`, synced again: F matches `{ x: 0, width: 96, ends: { left: { type: 'end_panel', width: null } } }` and `F.ends.left.auto` is `undefined`.
128. `isl({ endPanels: { start: { width: 1 }, end: { width: 1 } } })`: F `x 1 w 94`, K `x 1 w 94`.
129. `wallEndPanels(synced ISP, I)` **equals**
    ```js
    [{ endpoint: 'start', width: 0.75, top: 34.5, thickness: 0,
       front: { side: 'left',  x: 0,     depth: 24.875, top: 34.5, runIds: ['F'] },
       back:  { side: 'right', x: 95.25, depth: 12.875, top: 34.5, runIds: ['K'] } }]
    ```
    and `wallEndPanelPolygon(room, I, panels[0])` is `[{0,-12.875},{0.75,-12.875},{0.75,24.875},{0,24.875}]`.
130. ISP with `F.cornerClearance = { left: 2, right: 'auto' }`: F `x 2 w 94` — a custom clearance still wins. `describeAnchor(synced ISP, I, F, 'left')` is `'Wall end panel 3/4"'`.
131. FL with `P.endPanels = { start: null, end: { width: null } }` (P's end is connected) and `PB = base('PB', { wallSide: 'back', anchors: { left: false, right: true } })` on P, nothing on Q: `wallEndPanels(FL, P)` is `[]` and PB stays `w 96`.

### Step 89: end panel UI (`elevationSlice.test.js`)

132. `stateWithRun()`: `setWallEndPanel({ wallId: 'wall-1', endpoint: 'start', panel: { width: null } })` → `endPanels.start` `{ width: null }`; `endpoint: 'end', panel: { width: 1 }` → `endPanels.end` `{ width: 1 }`; `endpoint: 'start', panel: null` → `endPanels.start` `null`; `endpoint: 'middle'` and `panel: { width: -1 }` are both ignored.

Steps 86 and 89's drawing are UI, checked by hand.
