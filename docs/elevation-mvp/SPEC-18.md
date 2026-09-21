# Elevation Lab — SPEC-18 (wing walls: walls that land on another wall's face)

Steps 90–95. The earlier SPEC files still apply; this file is the source of truth for what follows.

Repo state when this was written: `feature/elevation-mvp` at `96cba0a` (step 89), 422 passing.

This is build-order item (3) of the wall configuration entry in `TODO.md`, pulled ahead of (2): the datum ranking arrives here only for wing walls (host wall ends, then earlier wing walls on the same face). Soffits are SPEC-19.

## After this SPEC you can

- Draw a wall in plan that **starts or ends on another wall's face**, not only on its end. The wall snaps to the face, and a distance from the nearer end of the host shows while you draw.
- See the host wall's plan dimension split into spans and wing thicknesses: **60 · 9 · 120 · 12 · 45**.
- Set a wing wall's position in its properties: measured **from** the host's left end, right end, or another wing wall on the same face, **to** its near face, far face or centre, **by** a distance. Changing the reference keeps it where it is.
- Draw cabinets on the host that stop at a wing wall's face exactly as they stop at a wall end (anchor, corner reserve, filler), and cabinets on the wing wall that die into the host.
- See wing walls drawn hatched on the host's elevation, with the cabinets on their faces drawn in section beside them.
- Move or lengthen the host and have wing walls follow.

## Not in this SPEC

- Typing the distance *while* drawing (you type it in properties afterwards), and clicking the plan span dimension to edit it.
- Dragging a landed end in plan. It is shown as fixed; move it with properties.
- A warning when a run passes straight through a wing wall.
- Soffits (SPEC-19), the datum ranking for doors, runs and pins, and the alcove preset.

---

## §0 Terms

| Term | Means |
|---|---|
| **landing** | One wall's end sitting on another wall's face partway along it. Stored on the wall that lands, in `wall.landings.start` / `.end`. |
| **host** | The wall whose face is landed on. |
| **wing wall** | Any wall with a landing. It is not a separate type. |
| **span** | A stretch of a host face between landings or wall ends. Derived, never stored. |
| **interval** | The stretch of the host face a landed wall's thickness occupies, `[a, b]` in the host side's elevation x. |

A connection (`wall.connections`) joins two wall **ends**. A landing joins an end to a **face**. An endpoint has one or the other, never both. Keeping landings in their own field means none of the ~25 existing connection sites (`topology.js`, `wallOps.js`, `wallOutline.js`, the plan endpoint handles) change. To all of them a landed end looks free, which is correct for topology: a wing wall is its own chain, and the host's chain is unchanged.

## §1 Shape

```js
wall.landings = {
  start: null | Landing,
  end:   null | Landing,
}
Landing = {
  wallId,              // host
  side,                // 'front' | 'back' — which face of the host
  ref,                 // 'left' | 'right' | <wallId of another wall landed on the same host face>
  to,                  // 'near' | 'far' | 'center' — which part of this wall the distance reaches
  offset,              // number, inches
}
```

`left` / `right` are the host **side's** own ends, in that side's elevation, so they swap between front and back.

New run anchor: `{ to: 'wall', wallId }` — the run's side stops at that landed wall's face on this host side.

`createWall` writes `landings: { start: null, end: null }`; `cloneRoom` copies it.

## §2 Geometry — `model/landings.js` (new)

```js
LANDING_TO = ['near', 'far', 'center']
landingInterval(room, wall, endpoint) → { wallId, endpoint, hostId, side, lineX, backX, a, b } | null
landingsOn(room, wallOrView) → intervals landed on that side, sorted by a
landingEndpoint(wall, hostId, side) → 'start' | 'end' | null
landingOffsetFor(room, wall, endpoint, ref, to) → number
resolveLandings(room) → room
landWallEnd(room, wallId, endpoint, { wallId: hostId, side, x }) → room | null
snapToWallFace(room, point, radius) → { wallId, side, x, point } | null
landingRefCreatesCycle(room, wallId, hostId, side, ref) → boolean
releaseWall(room, wallId, { deleting = true }) → room
```

**`landingInterval`.** The host side's frame is `wallSideFrame(room, host, side)`. The landed wall's drawn line and its back line (drawn line − `n × thickness`, as `wallOutline` uses) are each intersected with the host face line (`lineIntersection`, falling back to the unintersected point when parallel) and projected onto the host frame's `r`. `lineX` is the drawn line's position, `backX` the back line's, `a`/`b` the smaller and larger.

**Measuring.** For a landing, the **reference** is `{ x, direction }`:
- `ref 'left'` → `{ x: 0, direction: +1 }`; `ref 'right'` → `{ x: length, direction: −1 }`;
- `ref <wallId>` → that wall's interval on the same host face. If this wall's centre is at or right of the reference wall's centre, `{ x: ref.b, direction: +1 }`, otherwise `{ x: ref.a, direction: −1 }`. If the reference wall no longer lands there, fall back to `'left'`.

The **measured face** is `near` = `a` when direction is +1, else `b`; `far` is the other; `center` is `(a + b) / 2`. The stored `offset` is `direction × (measured face − reference x)`.

**`landingOffsetFor`** returns that number for the wall's current geometry with any `ref`/`to`. It is how a reference change keeps the wall where it is.

**`resolveLandings`** moves each landed end onto its host face at its stored distance:

1. desired = `ref.x + direction × offset`; `dx` = desired − current measured face.
2. The landed endpoint's distance off the host face line along the host side's `n` is corrected to 0.
3. The move is `r × dx − n × distanceOff`.
4. If the wall's **other** end is free (no connection, no landing), both endpoints move: the wall moves whole and keeps its length. Otherwise only the landed endpoint moves and the wall stretches.
5. Order: a landing whose `ref` is another wall waits until that wall's landing on the same face is resolved. Anything left in a cycle is skipped.

**`syncRoom` calls `resolveLandings` first**: `cloneRoom(resolveLandings(room))`. Every edit therefore re-seats wing walls: moving the host perpendicular carries them with it, lengthening the host at the end they're measured from shifts them to keep their distance, and moving a reference wing moves the ones measured from it.

**`landWallEnd`** is what drawing uses. Given the host-side x where the drawn line meets the face:
- returns `null` if the wall is within 10° of parallel to the host (it doesn't land);
- `ref` is `'left'` when `x <= length / 2`, else `'right'`;
- toggles `flipped` if needed so the wall's thickness runs **away** from that end — the drawn line is then the near face;
- stores `{ wallId: hostId, side, ref, to: 'near', offset: ref === 'left' ? x : length − x }`.

**`snapToWallFace`** checks both sides of every wall: the point's x along the side frame must be within `[0, length]`, and its distance along `n` within `radius`. The nearest face wins.

**`releaseWall`** removes references to a wall that is being deleted or detached:
- landings measured **from** it are re-measured from `'left'` at the same position (`landingOffsetFor`);
- run anchors `{ to: 'wall', wallId }` to it become `false`;
- with `deleting: true` (the default), ends landed **on** it come free (`null`);
- the wall's own landings are left to the caller.

## §3 Corners and anchors at a landing

**The landed wall's end is an inside corner.** `cornerAt` gains a branch: when the endpoint has no connection but has a landing, the neighbour is the host.

- `uA` is this wall's direction away from the end (as today).
- `uB` is the host side frame's `r` or `−r`, whichever has a positive dot with this view's `n`: the half of the host face this side of the wing faces.
- `angle = acos(uA · uB)`; if `n · uB` is 0 the corner is `open`.
- It returns `{ type: 'inside', angle, neighborWallId: host.id, neighborSide, neighborWallSide: landing.side, anchorWallId: wall.id }`, where `neighborSide` is `'left'` when `uB` is `+r` (host runs on that side meet the wing with their left side) and `'right'` otherwise.

**A host run anchored to a wing face** sees the same corner from the other direction. New in `corners.js`:

```js
spanCorner(room, hostView, run, side) → corner      // for anchors { to: 'wall' }
cornerForRunSide(room, wall, run, side) → corner    // spanCorner or cornerAt
anchoredToCorner(anchor, corner) → boolean
```

`spanCorner`: `uA` is `+r` for the run's left side and `−r` for its right; `uB` is the landed wall's direction away from its landed end. The landed wall's side facing the run is `'front'` when its front `n · uA > 0`. `neighborSide` is that end's elevation side in that side's frame. It returns `{ type: 'inside', angle, neighborWallId, neighborSide, neighborWallSide }`.

`anchoredToCorner` is `anchor?.to === 'wall' && anchor.wallId === corner.anchorWallId` for a landing corner, and `anchor === true` otherwise.

`cornerReserveParts` uses `cornerForRunSide` instead of `cornerAt`, and `anchoredToCorner` instead of `=== true` in the neighbour-run filter. Everything else — `face` / `back` / `custom` and signed custom clearances — is unchanged. The end panel lapping ½" onto a wing is a custom clearance of `−0.5`. `endMinWidthsForRun` and `endCornerAnglesForRun` also use `cornerForRunSide`, and treat `{ to: 'wall' }` like `true`.

**`resolveRunAnchorDatum`** for `{ to: 'wall', wallId }`: find the interval in `landingsOn(room, view)`; missing → `{ error: { code: 'anchor-wall-missing', side } }`. Otherwise left side → `b + reserve`, right side → `a − reserve`, with `reserve = cornerReserve(...)`, and `type: 'wall'`.

**`describeAnchor`** for `{ to: 'wall' }`: `Against <wallLabel> · <relation>`. The relation is `flush`; for a custom non-zero clearance, `<n> past` (negative) or `held back <n>` (positive); for an automatic reserve above 0, `reserve <n>`.

**Wall end panels** (`wallEndPanelAt`, `wallEndPanels`) treat a landed end like a connected one: no panel.

## §4 Drawing, snapping and dimensions (model)

- **`createRun`**: after the wall-end check, an edge within `cornerSnapDistance` of a landed wall's facing face (left edge ↔ `b`, right edge ↔ `a`) anchors `{ to: 'wall', wallId }` with end type `filler`.
- **`stretchRun`**: snap candidates gain each interval's `b` (anchors the left side) and `a` (anchors the right side). The snapped anchor is now stored as whatever the candidate carries (`true` or the wall anchor), not coerced to a boolean. The inside-corner end-type check uses `cornerForRunSide`. The two wall-end reserve candidates are computed as if that side were anchored `true`, so a run already anchored to a wing doesn't offer its wing reserve as a wall-end snap.
- **`moveRun`** (free branch): candidates gain every interval's `a` and `b`.
- **`horizontalChains`**: open gaps are split by landing intervals as they already are by tall runs, into segments of kind **`'wall'`** with `wallId`. Tall ranges become `{ kind: 'tall-span', runId }`, and the splitter uses each range's `kind`.

## §5 Store

- **`addWallSegment`** accepts `landStart` / `landEnd`: `{ wallId, side, x }`. After `addWallWithConnections`, each one whose matching `connectStart` / `connectEnd` is null goes through `landWallEnd`. A `null` result just means no landing.
- **`setWallLanding({ wallId, endpoint, ref?, to?, offset? })`**: needs an existing landing. `ref` and `to` default to the stored ones. `to` must be in `LANDING_TO`. `ref` must be `'left'`, `'right'`, or another wall that lands on the same host face and where `landingRefCreatesCycle` is false. With no `offset`, it is `landingOffsetFor(...)` so nothing moves; a given offset must be finite. Then `syncRoomAt`.
- **`detachWallLanding({ wallId, endpoint })`**: `releaseWall(room, wallId, { deleting: false })`, then that landing is `null`.
- **`deleteWall`**: `releaseWall(room, wallId)` before the splice. Find the index again after, since the walls array was replaced.
- **`connectWalls`**: both connected endpoints lose any landing.
- **`setRunAnchor`** accepts `{ to: 'wall', wallId: string }`; the end type becomes `filler`.

Persistence: `isWall` accepts `landings` when absent or `{ start, end }` with each `null` or a valid Landing (`wallId` string, `side` front/back, `ref` string, `to` in `LANDING_TO`, `offset` finite). `isRunAnchor` accepts `{ to: 'wall', wallId: string }`.

## §6 UI

**Plan — drawing.** The four duplicated snap blocks in `PlanCanvas` (first click, second click, live-entry mouse move, free mouse move) go through one helper that tries endpoint snap, then `snapToWallFace(room, point, ENDPOINT_SNAP_RADIUS)`, then alignment:

- On the first click a face snap is stored as `_landOn: { wallId, side, x }` on `wallDrawStart`. It is passed as `landStart` and only for the first segment of a chain; later segments start from the previous wall's end.
- On the end point it is carried like `connectEnd`: `landEnd`, dropped if a typed length differs from the pointer length, exactly as `connectEnd` is.
- While the snap is live, a small cyan circle marks the face point with a label `<distance> from left|right`, measured from the nearer host end of that side.

**Plan — landed ends.** `WallEndpoints` draws a landed endpoint as a non-draggable cyan square instead of a drag handle.

**Plan — dimensions.** `PlanWallShape` gains a second dimension row on each side that has landings, just outside that face: the spans and intervals from `0` to `length` in order (`60 · 9 · 120 · 12 · 45`), using `layoutDimensionRow` like the overall row.

**Elevation — sections.** `NeighborReturns`:
- neighbour runs are filtered with `anchoredToCorner` instead of `=== true`, so a wing's elevation shows host cabinets at its landed end;
- on a host side, each landed wall is drawn hatched over `[a, b]` from the floor to its height, labelled with its wall label;
- beside each interval, the landed wall's cabinets that meet the span are drawn in section, using `spanCorner` with a stand-in run anchored on that side to find them, the same way returns at wall ends are drawn.

**Properties — the wing.** `WallHeightProperties`, for each landed endpoint, shows "Lands on `<host label>` · Front|Back" and:
- **Measured from:** Left end / Right end / each other wall landed on the same face (excluding ones that would make a cycle);
- **To:** Near face / Far face / Centre;
- **Distance:** a number;
- a **Detach** button.

Changing *from* or *to* dispatches `setWallLanding` without an offset (so it holds still); typing the distance dispatches it with one. `leftFree` / `rightFree` count a landed end as not free, so the end-panel boxes and the grow-end default treat it like a corner.

**Properties — host runs.** The run anchor select gains an optgroup "Wall faces" with one option per landed wall on this side, `wall:<wallId>`, labelled with its wall label.

## §7 Deferred

Typing the landing distance during the draw gesture; clicking plan span dimensions to edit them; dragging landed ends; walls landing at an angle other than square (they work, but the corner back-reserve and the interval use the simple projection); a "passes through a wall" warning; landings on a wall whose back side is not yet truly sized at connected ends (SPEC-17 §7).

---

## §8 Tests

Numbering continues from SPEC-17 (last was 132). Model tests 133–141 and 143–153 go in a new file **`src/elevation/model/__tests__/landings.test.js`**.

### Helpers and fixtures

`base(id, overrides)` is SPEC-17's base-run helper. `makeWall` is SPEC-17's plus `landings: { start: null, end: null }`; `makeRoom` is unchanged. Also:

```js
const wallById = (room, id) => room.walls.find((wall) => wall.id === id);
const moveWall = (room, id, changes) => ({ ...room, walls: room.walls.map((wall) => (
  wall.id === id ? { ...wall, ...changes } : wall)) });
const withLanding = (room, id, changes) => ({ ...room, walls: room.walls.map((wall) => (wall.id === id
  ? { ...wall, landings: { ...wall.landings, start: { ...wall.landings.start, ...changes } } } : wall)) });
const interval = (room, id) => {
  const entry = landingInterval(room, wallById(room, id), 'start');
  return [entry.a, entry.b, entry.lineX, entry.backX];
};
```

**ALC** — Kyle's alcove. `alcove({ hostRuns = [], w1Runs = [] } = {})`:

```js
let room = makeRoom([
  makeWall('H', 0, 0, 246, 0, { runs: hostRuns }),                 // thickness 4.5
  makeWall('W1', 60, 0, 60, 30, { thickness: 9, runs: w1Runs }),
  makeWall('W2', 201, 0, 201, 30, { thickness: 12 }),
]);
room = landWallEnd(room, 'W1', 'start', { wallId: 'H', side: 'front', x: 60 });
room = landWallEnd(room, 'W2', 'start', { wallId: 'H', side: 'front', x: 201 });
```

**CHN** — `chained(room = alcove())`: ALC with W2's landing changed to `ref: 'W1', offset: 120` (via `withLanding`).

**AL** — `AL(overrides)`: `base('AL', { x: 69, width: 120, anchors: { left: { to: 'wall', wallId: 'W1' }, right: { to: 'wall', wallId: 'W2' } }, ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } }, ...overrides })`.

### Step 90: landings geometry (`landings.test.js`, `persistence.test.js`)

133. In ALC, W1's landing equals `{ wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 60 }` and `flipped` is `false`. W2's equals `{ wallId: 'H', side: 'front', ref: 'right', to: 'near', offset: 45 }` and `flipped` is `true`.
134. `interval(ALC, 'W1')` is `[60, 69, 60, 69]`; `interval(ALC, 'W2')` is `[189, 201, 201, 189]`. `landingsOn(ALC, wallSideView(H, 'front'))` as `[wallId, a, b]` is `[['W1', 60, 69], ['W2', 189, 201]]`; from the back it is `[]`.
135. `landingOffsetFor(ALC, W2, 'start', …)`: `('W1', 'near')` → `120`, `('right', 'far')` → `57`, `('left', 'center')` → `195`.
136. `resolveLandings(CHN)` leaves W2 at `[189, 201, 201, 189]`. With W1's offset set to 50: W1 `[50, 59, 50, 59]` with coordinates `(50,0)→(50,30)`, and W2 follows to `[179, 191, 191, 179]`.
137. `resolveLandings(moveWall(CHN, 'H', { y1: 10, y2: 10 }))` puts W1 at `(60,10)→(60,40)`. `resolveLandings(moveWall(CHN, 'H', { x2: 256 }))` leaves W2 at `[189, 201, 201, 189]`, because it is measured from W1.
138. Stretch: walls `H (0,0)→(246,0)`, `C (0,40)→(50,40)` with `C.end ↔ B.start`, and `B (50,40)→(50,0)` with `B.start ↔ C.end`. `landWallEnd(room, 'B', 'end', { wallId: 'H', side: 'front', x: 50 })`, then `resolveLandings` with H moved to `y −10` gives B `(50,40)→(50,−10)`.
139. Room with only `H (0,0)→(246,0)`: `snapToWallFace(room, { x: 60.3, y: 2 }, 6)` is `{ wallId: 'H', side: 'front', x: 60.3, point: { x: 60.3, y: 0 } }`; `{ x: 100, y: -6 }` gives `{ wallId: 'H', side: 'back', x: 146, point: { x: 100, y: -4.5 } }`; `{ x: 100, y: 10 }` and `{ x: 250, y: 1 }` give `null`.
140. In CHN: `landingRefCreatesCycle(room, 'W1', 'H', 'front', 'W2')` and `(…, 'W1')` are `true`; `(room, 'W2', 'H', 'front', 'left')` is `false`.
141. `chained(alcove({ hostRuns: [AL()] }))`. `releaseWall(room, 'W1')`: W2's landing becomes `{ wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 189 }`; AL's anchors become `{ left: false, right: { to: 'wall', wallId: 'W2' } }`; W1's own landing is still set. `releaseWall(room, 'H')` sets both W1's and W2's landings to `null`; `releaseWall(room, 'H', { deleting: false })` leaves W1's landing as `{ wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 60 }`.
142. `persistence.test.js`: `tbtDocument()` with `walls[0].landings = { start: null, end: null }` passes; with `start: { wallId: 'x', side: 'front', ref: 'left', to: 'near', offset: 60 }` passes; with `to: 'edge'` fails; a run anchor `{ to: 'wall', wallId: 'x' }` passes and `{ to: 'wall' }` fails.

### Step 91: corners and anchors (`landings.test.js`)

143. `cornerAt(ALC, wallSideView(W1, 'front'), 'left')` equals `{ type: 'inside', angle: 90, neighborWallId: 'H', neighborSide: 'right', neighborWallSide: 'front', anchorWallId: 'W1' }` and `'right'` equals `{ type: 'open' }`. From the back, `'right'` equals `{ type: 'inside', angle: 90, neighborWallId: 'H', neighborSide: 'left', neighborWallSide: 'front', anchorWallId: 'W1' }` and `'left'` equals `{ type: 'open' }`.
144. `syncRoom(alcove({ hostRuns: [AL()] }))`: AL `x 69 w 120`. `describeAnchor(…, 'left')` is `'Against Wall 2 · flush'` and `'right'` is `'Against Wall 3 · flush'`.
145. Add on W1 `WR = base('WR', { width: 30, wallSide: 'back', anchors: { left: false, right: true }, cornerClearance: { left: 'auto', right: 0 } })` (`alcove({ hostRuns: [AL()], w1Runs: [WR] })`): AL `x 93.875 w 95.125`, its left description is `'Against Wall 2 · reserve 24 7/8"'`, and WR stays `x 0 w 30`.
146. The same with WR's `cornerClearance` removed: `cornerReserveParts(room, W1, 'right', WR)` equals `{ face: 24.875, back: 0, total: 24.875, source: 'auto' }` and WR's width is `5.125`.
147. `AL({ cornerClearance: { left: -0.5, right: 'auto' } })`: AL `x 68.5 w 120.5`, described `'Against Wall 2 · 1/2" past'`.
148. ALC with W1's `endPanels: { start: { width: null }, end: { width: null } }`: `wallEndPanelAt(room, wallSideView(W1, 'front'), 'left')` is `null` (landed end) and `'right'` is `{ endpoint: 'end', width: 0.75 }`.
149. `syncRoom(withLanding(alcove(), 'W1', { offset: 50 }))`: W1's interval is `[50, 59, 50, 59]`.

### Step 92: drawing, snapping and dimensions (`landings.test.js`)

150. `createRun({ x: 69.5, width: 100, bottomZ: 4, topZ: 34.5 }, { settings, room: syncRoom(ALC), wall: wallSideView(H, 'front') })`: anchors `{ left: { to: 'wall', wallId: 'W1' }, right: false }`, `ends.left` `{ type: 'filler', width: null }`.
151. `horizontalChains(synced alcove({ hostRuns: [AL()] }), wallSideView(H, 'front'), 'lower').inner` as `[kind, start, end, wallId ?? runId ?? '']` is
     `[['open',0,60,''], ['wall',60,69,'W1'], ['piece',69,70.5,'AL'], ['piece',70.5,187.5,'AL'], ['piece',187.5,189,'AL'], ['wall',189,201,'W2'], ['open',201,246,'']]`.
152. `alcove({ hostRuns: [base('ST', { x: 70, width: 100, anchors: { left: { to: 'wall', wallId: 'W1' }, right: false } })] })`, synced. `stretchRun(room, 'H', 'ST', 'right', 188)` gives ST `x 69 w 120`, `anchors.right` `{ to: 'wall', wallId: 'W2' }`, `ends.right` `{ type: 'filler', width: null }`.
153. `alcove({ hostRuns: [base('F', { x: 100, width: 30 })] })`, synced. `moveRun(room, 'H', 'F', 158.5)` puts F at `x 159` with `snap: { value: 189, edge: 'right' }`.

### Step 93: store (`elevationSlice.test.js`)

The host is `stateWithRun()`'s `wall-1` `(0,0)→(144,0)`, thickness 4.5.

154. `addWallSegment({ id: 'W1', x1: 60, y1: 0, x2: 60, y2: 30, thickness: 9, landStart: { wallId: 'wall-1', side: 'front', x: 60 } })`: W1's `landings.start` equals `{ wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 60 }`, `flipped` false. Then `addWallSegment({ id: 'W2', x1: 120, y1: 0, x2: 120, y2: 30, thickness: 9, landStart: { wallId: 'wall-1', side: 'front', x: 120 } })`: `{ …, ref: 'right', to: 'near', offset: 24 }`, `flipped` true.
155. From 154: `setWallLanding({ wallId: 'W2', endpoint: 'start', ref: 'W1' })` gives `offset 42` and W2's `x1` stays `120`. `setWallLanding({ wallId: 'W1', endpoint: 'start', ref: 'W2' })` is ignored (cycle). `{ to: 'side' }` is ignored. `setWallLanding({ wallId: 'W2', endpoint: 'start', offset: 30 })` moves W2's `x1` to `108`.
156. From 154 plus `setWallLanding({ wallId: 'W2', endpoint: 'start', ref: 'W1' })` (so W2 is measured from W1, offset 42), with `wall-1` holding a run anchored `left: { to: 'wall', wallId: 'W1' }`: `deleteWall('W1')` leaves W2's landing `{ wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 111 }` and the run's `anchors.left` `false`.
157. From 154: `detachWallLanding({ wallId: 'W2', endpoint: 'start' })` sets W2's `landings.start` to `null`, and a `wall-1` run anchored `right: { to: 'wall', wallId: 'W2' }` gets `anchors.right` `false`.
158. `setRunAnchor({ wallId: 'wall-1', runId: 'run-1', side: 'right', anchor: { to: 'wall', wallId: 'W2' } })`: `anchors.right` `{ to: 'wall', wallId: 'W2' }`, `ends.right` `{ type: 'filler', width: null }`. `anchor: { to: 'wall' }` (no `wallId`) is ignored.
159. From 154, add `addWallSegment({ id: 'C', x1: 200, y1: 50, x2: 250, y2: 50 })`, then `connectWalls({ wallId1: 'W1', endpoint1: 'start', wallId2: 'C', endpoint2: 'start' })`: W1's `landings.start` is `null`.

Steps 94 and 95 are UI, checked by hand.
