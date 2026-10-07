# Elevation Lab — SPEC-22 (marker centring, dimension clearance, neighbour profiles, right-hand heights, cursors)

Steps 109–116. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-21 must be done first.

A round of drawing-clarity fixes from Kyle's pass over SPEC-21.

## After this SPEC you can

- See a plan elevation letter sit over the cabinets it names: centred on the run, or on the whole group of runs when there's more than one. A side with no runs keeps today's placement.
- Read every rotated dimension the same way round: upright text sits on its feet, rotated text has its bottom to the right.
- See the cabinets on a neighbouring wall that carry past this wall's end, drawn as an empty outline in the elevation, with this wall's dimensions outside them.
- Keep every dimension row clear of whatever the wall draws past its edges — a run that overhangs an end, a crown that runs above the ceiling line, a neighbour's profile.
- Read cabinet heights off the right-hand edge as well as the left. Each column shows the cabinets nearest its own edge, and the column nearer a selected run switches to that run.
- Watch the cursor mean one thing: crosshair while a drawing tool is armed, grab/grabbing while panning, pointer over anything selectable, ew-resize over anything that resizes sideways, move over anything that slides along the wall — and go back to where it was, every time, including when what you were hovering disappears under the pointer.

## Not in this SPEC

- Neighbour profiles from a wall this one isn't connected to, or from a landed (wing) wall. Only the walls joined at this wall's two ends are considered. Logged in `TODO.md`.
- Piece divisions, faces, molding, countertops or labels inside a neighbour profile. It is one empty rectangle per neighbouring run.
- Fitting the neighbour profiles and the pushed-out dimension rows into the viewport. `fitWallToViewport` still fits the wall itself, so a far overhang may need a zoom out, exactly as a deep dimension stack does today.
- Dragging a height column to the other edge, or hiding one. The two columns are fixed.
- The old designer canvas (`src/canvas/CanvasStage.jsx`). `WallEndpoints` is shared with it, so its new `cursor` prop is optional and that canvas passes nothing.

---

## §1 Elevation markers centre on their runs (`plan/elevationMarkers.js`)

Inside the `side` loop, replace the wall-midpoint anchor with the span of that side's runs.

```js
const sideRuns = (wall.runs ?? []).filter((run) => wallSideOf(run) === side);
const deepest = sideRuns.reduce((depth, run) => Math.max(depth, frontDepth(run, settings)), 0);
const centerX = sideRuns.length > 0
  ? (Math.min(...sideRuns.map((run) => run.x))
    + Math.max(...sideRuns.map((run) => run.x + run.width))) / 2
  : frame.length / 2;
const shift = sideRuns.length > 0 ? 0 : (side === 'front' ? 1 : -1) * MARKER_SHIFT / scale;
const anchor = {
  x: frame.leftPoint.x + frame.r.x * centerX,
  y: frame.leftPoint.y + frame.r.y * centerX,
};
const point = {
  x: anchor.x + direction.x * offset + d.x * shift,
  y: anchor.y + direction.y * offset + d.y * shift,
};
```

- `frame` stays `wallSideFrame(room, wall, side)`, `offset` and `direction` are unchanged, and `deepest` now comes from the same filtered list instead of a second pass over `wall.runs`.
- The span is every run on that side, gaps included, so a wall with cabinets at both ends of a doorway gets one letter between them. That is deliberate: one elevation, one letter.
- `MARKER_SHIFT` now only applies when the side has no runs — that's a wall with `elevationForced`, whose marker still needs to dodge the wall-number bubble. With runs, the marker is already pushed past them.
- No clamping. A run that overhangs an end pulls the letter out with it.

## §2 One text-rotation rule in plan (`plan/textRotation.js`, new, pure)

Every rotated label in plan folds its angle into `[-90, 90)`, so upright text keeps its feet down and vertical text has its bottom to the right. Today's fold is `[-90, 90]`, which puts the bottom to the left at exactly +90.

```js
export function readableRotation(degrees) {
  const wrapped = ((degrees % 360) + 360) % 360;
  if (wrapped >= 270) return wrapped - 360;
  if (wrapped >= 90) return wrapped - 180;
  return wrapped;
}

export function readableFlip(degrees) {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped >= 90 && wrapped < 270 ? -1 : 1;
}
```

`readableFlip` is `-1` when the fold turned the text around, which matters wherever a label is offset to one side of its line: turning the text 180° would otherwise move it to the other side.

Call sites:

- **`PlanWallShape`** — `labelRotation = readableRotation(Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180 / Math.PI)` and `rowRotation = readableRotation(Math.atan2(sideFrame.r.y, sideFrame.r.x) * 180 / Math.PI)`. Both labels are centred (`offsetY = fontSize / 2`), so no flip handling.
- **`PlanRunFootprint`** — `const depthAngle = Math.atan2(frame.n.y, frame.n.x) * 180 / Math.PI;`, `depthRotation = readableRotation(depthAngle)`, `depthFlip = readableFlip(depthAngle)`, and the depth label's `offsetY` becomes

  ```jsx
  offsetY={dim.fits
    ? (depthFlip > 0 ? depthFontSize + 2 / scale : -2 / scale)
    : depthFontSize / 2}
  ```

  so a fitted depth number stays on the same physical side of its line either way round.
- **`PlanOpening`** — the local `readableRotation(frame)` helper goes; the `Text` takes `readableRotation(Math.atan2(frame.r.y, frame.r.x) * 180 / Math.PI)`. Its `offsetY` becomes `PLAN_DIM_FONT_SIZE / 2 / scale` (was `5.5 / scale`) so the label centres exactly and reads the same when flipped.
- **`DimensionRow`** keeps `rotation = horizontal ? 0 : -90`. −90 already puts the bottom to the right; add a one-line comment saying so, and keep it for the right-hand column in §6.

## §3 Neighbour cabinet profiles (`model/neighborProfiles.js`, new, pure)

```js
neighborProfiles(room, wall, settings)
  → [{ key, wallId, runId, side, x, width, z, height }]
```

`wall` is an elevation side view. Each entry is the part of a neighbouring wall's run that projects **outside** this wall's `[0, length]`, in this wall's elevation coordinates.

- `view = wallSideView(wall, wall.side ?? 'front')`, `source = view.sideSource ?? view`, `frame = wallSideFrame(room, source, view.side)`, `length = frame.length`.
- For each `endpoint` of `['start', 'end']`, take `source.connections?.[endpoint]?.wallId`. Skip a missing one, and skip a wall already handled (a neighbour joined at both ends is drawn once).
- For that neighbour, for each `side` of `WALL_SIDES`, with `neighborFrame = wallSideFrame(room, neighbor, side)` and each run of `wallSideView(neighbor, side).runs`:
  - `depth = frontDepth(run, settings)`, and the four footprint corners are `elevationToPlan(neighborFrame, x, offset)` for `x` in `[run.x, run.x + run.width]` and `offset` in `[0, depth]`.
  - Skip the run when `Math.max(...corners.map((point) => dot(subtract(point, frame.leftPoint), frame.n))) <= 1e-6` — it sits behind this wall's face and isn't visible from here.
  - `xs = corners.map((point) => planPointToWallX(frame, point))`, `xMin = Math.min(...xs)`, `xMax = Math.max(...xs)`.
  - Emit `[xMin, Math.min(xMax, 0)]` and `[Math.max(xMin, length), xMax]`, each only when `end - start > 1e-6`, as `{ x: start, width: end - start, z: run.z, height: run.height }`.
  - `key` is `` `${neighbor.id}:${side}:${run.id}:${start < 0 ? 'left' : 'right'}` ``.
- Return sorted by `x`, then `z`.

This is a plain orthographic projection onto the wall plane, which is what an elevation is. It falls out that a square inside corner contributes nothing (the neighbour's run projects to a sliver inside `[0, length]`), a straight joint contributes the neighbour's runs one-for-one past the end, and an outside corner contributes whatever wraps around it.

## §4 What the wall draws past its edges (`model/wallExtent.js`, new, pure)

```js
wallExtent(room, wall, settings) → { left, right, top, bottom }
```

In wall coordinates, starting at `{ left: 0, right: wall.length, top: wall.height, bottom: 0 }` and growing outward only:

- Every run on the view: `left = min(left, run.x)`, `right = max(right, run.x + run.width)`, `bottom = min(bottom, run.z)`, and `top = max(top, run.z + run.height + stack)` where `stack` is `moldingStack(profileForRun)` when `run.heightMode === 'auto'` and the type is `UPPER` or `TALL`, else 0. `profileForRun` is the same shape `dimensions.js` uses: `resolveProfile({ defaultProfile: resolveProfile(settings, room, wall) }, null, { profile: run.overrides })`.
- Every soffit on the view: `resolveSoffitSpan(room, view, soffit)` gives `{ x, width }`; take `left`/`right` from it. Soffits hang from the ceiling, so they never move `top`.
- Every `neighborProfiles(room, wall, settings)` entry: `left`/`right` from `x` and `x + width`. Their heights are ignored — a neighbour's tall cabinet doesn't push this wall's top row.

## §5 Dimension rows clear the drawing (`components/NeighborProfiles.jsx` new, `ElevationCanvas`)

**`NeighborProfiles`** takes `{ room, wall, settings, transform }` and draws one `Rect` per `neighborProfiles` entry, `{...wallRectToScreen(profile, transform)}`, `stroke="#475569"`, `strokeWidth={1}`, `dash={[4, 4]}`, no fill, `listening={false}`. It renders in the existing `<Layer listening={false}>` beside `NeighborReturns`, before `WallEndPanelShapes`. Empty outlines only — nothing here is selectable, and nothing here enters any dimension chain.

**`ElevationCanvas`**, in the `dimensionOffsets` memo, after the level counts:

```js
const extent = wallExtent(room, wall, settings);
const clear = {
  below: Math.max(0, -extent.bottom) * transform.scale,
  above: Math.max(0, extent.top - wall.height) * transform.scale,
  left: Math.max(0, -extent.left) * transform.scale,
  right: Math.max(0, extent.right - wall.length) * transform.scale,
};
```

`clear.below` is added to `clearances`, `lower.inner`, `lower.outer`, `openings` and `label`; `clear.above` to both `upper` offsets; `clear.left` to both `vertical` offsets. `clear.right` is computed here and first used in §6. The memo's dependency list gains `room`, `wall` and `settings`.

Every row keeps its own stacking; the whole stack slides out by one number per side.

## §6 A right-hand height column (`model/dimensions.js`, `DimensionRow`, `ElevationCanvas`)

**`dimensions.js`:**

```js
export function nearerEdge(center, wallLengthValue) {
  return center * 2 <= wallLengthValue ? 'left' : 'right';
}

pickColumnRuns(wall, selectedRunId, edge = 'left')
```

- A `rightmost(runs)` helper mirrors `leftmost`, comparing `run.x + run.width`.
- The selected-run branches run **only** when a run is selected and `nearerEdge(selected.x + selected.width / 2, wallLength(wall)) === edge`. Their bodies are unchanged.
- Otherwise the default pair is `leftmost` for `'left'` and `rightmost` for `'right'`.

So selecting a run switches the column on the edge it sits nearer, and the other column keeps showing its own edge's cabinets. A tie goes to the left.

**`DimensionRow`** gains `wallLength = 0` and a `side === 'right'` case:

- `outward` is `{ x: 1, y: 0 }`;
- `edgePoint(value)` for a vertical row returns `wallToScreen({ x: side === 'right' ? wallLength : 0, z: value }, transform)`.

Everything else — `axis`, `tickDirection`, label distance, hit bands, rotation — already follows `outward` and needs no change.

**`ElevationCanvas`:**

- `dimensionChains.vertical` becomes `{ left, right }`. For each edge:

  ```js
  const openingCenter = selectedOpening
    ? (() => {
      const jamb = openingGeometry(selectedOpening, wall.length, settings).jamb;
      return jamb.x + jamb.width / 2;
    })()
    : null;
  const verticalFor = (edge) => (selectedOpening
    && nearerEdge(openingCenter, wall.length) === edge
    ? verticalOpeningChain(wall, selectedOpening, wall.length, settings)
    : verticalChains(room, wall, pickColumnRuns(wall, selection.runId, edge), settings));
  ```

  A selected opening takes over the column nearer to it; the other column stays on its runs.
- `dimensionOffsets.vertical` becomes `{ left, right }`, each `dimensionRowOffsets('vertical', levelsForThatEdge)` with `clear.left` / `clear.right` added.
- Two more `DimensionRow` elements after the two existing ones, `side="right"`, `wallLength={wall.length}`, fed from `dimensionChains.vertical.right` and `dimensionOffsets.vertical.right`. The existing two read `.left`.

## §7 One cursor authority (`canvas/cursor.js`, new)

Today every hover handler writes `stage.container().style.cursor` directly and resets to `'default'` — which wipes the `crosshair` React put on the container, leaves the cursor stuck whenever the hovered node unmounts under the pointer, and resets mid-drag. One owner per canvas fixes all three.

```js
export const CURSORS = {
  draw: 'crosshair',
  panReady: 'grab',
  panning: 'grabbing',
  select: 'pointer',
  move: 'move',
  resizeX: 'ew-resize',
  explain: 'help',
  idle: 'default',
};

/** A held gesture wins, then the newest hover, then the canvas's resting cursor. */
export function resolveCursor({ base = CURSORS.idle, hover = null, hold = null }) {
  return hold ?? hover ?? base;
}

export function elevationBaseCursor(tool, pointerMode) {
  if (pointerMode === 'panning') return CURSORS.panning;
  if (pointerMode === 'pan-ready') return CURSORS.panReady;
  return ['draw', 'door', 'window'].includes(tool) ? CURSORS.draw : CURSORS.idle;
}

export function planBaseCursor(tool, pointerMode) {
  if (pointerMode === 'panning') return CURSORS.panning;
  if (pointerMode === 'pan-ready') return CURSORS.panReady;
  return tool === 'wall' ? CURSORS.draw : CURSORS.idle;
}

/** Own one canvas's cursor: `style` goes on the container, `controller` goes to children. */
export function useCanvasCursor(base) {
  const requests = useRef(new Map());
  const [hover, setHover] = useState(null);
  const [hold, setHold] = useState(null);
  const settle = useCallback(() => {
    const values = [...requests.current.values()];
    setHover(values.length > 0 ? values[values.length - 1] : null);
  }, []);
  const controller = useMemo(() => ({
    request(key, cursor) {
      requests.current.delete(key);
      requests.current.set(key, cursor);
      settle();
    },
    release(key) {
      if (requests.current.delete(key)) settle();
    },
    hold(cursor) { setHold(cursor); },
    releaseHold() { setHold(null); },
  }), [settle]);
  return { style: resolveCursor({ base, hover, hold }), controller };
}

/** Bind a child to a canvas cursor. Its keys are released when it unmounts. */
export function useCursorKeys(controller) {
  const owner = useId();
  const held = useRef(new Set());
  useEffect(() => () => {
    held.current.forEach((key) => controller?.release(key));
    held.current.clear();
  }, [controller]);
  return useMemo(() => ({
    request(name, cursor) {
      const key = `${owner}:${name}`;
      held.current.add(key);
      controller?.request(key, cursor);
    },
    release(name) {
      const key = `${owner}:${name}`;
      held.current.delete(key);
      controller?.release(key);
    },
  }), [controller, owner]);
}
```

**No React context.** react-konva's `Stage` mounts its own reconciler root and does not bridge context to Konva children, so the `controller` is passed down as a prop. Every consumer's `cursor` prop is optional and `useCursorKeys(null)` is a no-op, so a component can be migrated in any order and `WallEndpoints` keeps working inside the old canvas.

**The vocabulary.** Every site uses one of these and nothing else:

| Over | Cursor |
|---|---|
| Nothing, select tool | `default` |
| A drawing tool armed (`draw`/`door`/`window`, or plan `wall`) | `crosshair` |
| Space held, ready to pan | `grab` |
| Panning | `grabbing` |
| Anything selectable — run body, piece, face, wall, footprint, opening, a run's dimension bar, a joint badge | `pointer` |
| Anything that slides along the wall — the selected run's dimension bar, the plan move handle | `move` |
| Anything that resizes sideways — run stretch edges, joint handles, opening edges | `ew-resize` |
| A diagnostic badge or a hidden-label tooltip | `help` |

**Gestures are held, not hovered.** The canvas holds a cursor for the whole gesture and releases it at the end, so leaving the node mid-drag changes nothing:

- `startRunMove` → `hold(CURSORS.move)`, `finishRunMove` → `releaseHold()`;
- `startStretch` / `finishStretch` and `startJointDrag` / `finishJointDrag` → `hold(CURSORS.resizeX)` / `releaseHold()`;
- the `Escape` branch of `handleKeyDown`, and every path that cancels a gesture, calls `releaseHold()`.

**Pan state.** Both canvases keep their `spacePressedRef` / `panRef` logic and mirror it into one new `pointerMode` state (`'idle' | 'pan-ready' | 'panning'`): space down sets `'pan-ready'`, space up and blur set `'idle'`, the pan pointer-move sets `'panning'` the first time it moves, and `stopPanning` returns to `'pan-ready'` when space is still down, else `'idle'`.

## §8 Cursor call sites

Each of these drops its local `setResizeCursor` / `setCursor` / inline `style.cursor` write and takes an optional `cursor` prop, used through `useCursorKeys`.

**Elevation (step 114):** `ElevationCanvas` (container style, base cursor, pan state, gesture holds, passes `cursor` down), `DimensionRow` (run segment: `pointer`, or `move` when it's the active draggable; hidden-label band: `help`), `JointMarkers` (handles `ew-resize`, badges `pointer`), `OpeningShape` (`ew-resize` when draggable, else `pointer`).

**Elevation (step 115):** `RunGroup` (diagnostic badge `help`, stretch edges `ew-resize`, and the run body `pointer` — it sets nothing today), `PieceRect` (`pointer`, new).

**Plan (step 116):** `PlanCanvas` (container style, base cursor, pan state, passes `cursor` down), `PlanWallShape` (`pointer`, new), `PlanRunFootprint` (`pointer`, new), `PlanOpening` (`move` when draggable, else `pointer`), `WallEndpoints` (`pointer`, optional prop), and the wall move handle (`move`).

---

## §9 Tests

Numbering continues from SPEC-21 (last was 184). Expect 474 passing before step 109.

### Step 109 (`plan/__tests__/elevationMarkers.test.js`)

**Test 178 changes.** The same room, the same two runs, new points: the front marker centres on `B1` (20 → 50, centre 35) and the back marker on `U1` (100 → 130, centre 115, measured from the back frame's left point at `(246, -4.5)`).

```js
point: { x: 35, y: 42.875 },     // front, direction { x: 0, y: 1 }
point: { x: 131, y: -35.375 },   // back,  direction { x: 0, y: -1 }
```

- **185.** A wall `H` `(0,0)→(246,0)` with two front bases, `B1` `{ x: 20, width: 30, depth: 24 }` and `B2` `{ x: 140, width: 40, depth: 24 }`. `elevationMarkers(room, DEFAULT_SETTINGS, 2)` is one marker: `{ key: 'H', wallId: 'H', side: 'front', letter: 'A', point: { x: 100, y: 42.875 }, direction: { x: 0, y: 1 } }`.
- **186.** The same wall with no runs and `elevationForced: true`. One marker, `point: { x: 135, y: 18 }` — the wall centre plus the 24 px shift, 6″ of clearance plus 12 px of marker.

Expect 476 passing.

### Step 110 (new `src/elevation/plan/__tests__/textRotation.test.js`)

- **187.** One `it` looping the table with `expect(readableRotation(input), String(input)).toBeCloseTo(expected, 9)`:

  | input | expected | input | expected |
  |---:|---:|---:|---:|
  | 0 | 0 | −45 | −45 |
  | 45 | 45 | −90 | −90 |
  | 89.9 | 89.9 | −135 | 45 |
  | 90 | −90 | −180 | 0 |
  | 90.1 | −89.9 | 225 | 45 |
  | 135 | −45 | 270 | −90 |
  | 180 | 0 | 315 | −45 |

- **188.** `[0, 45, -45, -90, 270, 315].map(readableFlip)` is all `1`; `[90, 135, 180, -135, -180, 269.9].map(readableFlip)` is all `-1`.

Expect 478 passing.

### Step 111 (new `src/elevation/model/__tests__/wallExtent.test.js`)

Copy `makeWall` and the run helper from `plan/__tests__/elevationMarkers.test.js`, add `heightMode`, `overrides`, `autoCount`, `maxCabinetWidth` to the run helper as `dimensions.test.js` has them, and build:

```js
const straightRoom = ({ wallA = {}, wallB = {} } = {}) => syncRoom({
  id: 'S',
  name: 'Room S',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  wallOrder: ['A', 'B'],
  walls: [
    makeWall('A', 0, 0, 120, 0, {
      connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
      ...wallA,
    }),
    makeWall('B', 120, 0, 240, 0, {
      connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
      ...wallB,
    }),
  ],
}, DEFAULT_SETTINGS);
```

Bases are `{ cabinetTypeId: BASE, depth: 24, z: 4, height: 30.5, heightMode: 'manual' }`; the view is `wallSideView(room.walls.find(({ id }) => id === 'A'), 'front')`.

- **189.** With `A1` `{ x: 90, width: 30 }` on A and `B1` `{ x: 0, width: 30 }` on B:
  - `neighborProfiles(room, viewA, DEFAULT_SETTINGS)` equals `[{ key: 'B:front:B1:right', wallId: 'B', runId: 'B1', side: 'front', x: 120, width: 30, z: 4, height: 30.5 }]`;
  - `neighborProfiles(room, viewB, DEFAULT_SETTINGS)` equals `[{ key: 'A:front:A1:left', wallId: 'A', runId: 'A1', side: 'front', x: -30, width: 30, z: 4, height: 30.5 }]`.
- **190.** Nothing is drawn when it isn't visible:
  - the same room with `B1` moved to the back (`wallSide: 'back'`, `cabinetTypeId: UPPER`, `depth: 12`, `z: 54`, `height: 36`, `heightMode: 'manual'`) gives `[]` for `viewA` — it sits behind the wall face;
  - a room with `B` at `(120,0)→(120,96)` instead (same connections) and a front base `B1` `{ x: 0, width: 30 }` gives `[]` for `viewA` — a square corner projects to nothing outside `[0, 120]`.
- **191.** `wallExtent(room, viewA, DEFAULT_SETTINGS)`:
  - with test 189's room: `{ left: 0, right: 150, top: 96, bottom: 0 }`;
  - with `A1` at `{ x: -6, width: 30 }` and no runs on B: `{ left: -6, right: 120, top: 96, bottom: 0 }`;
  - with wall A's `height: 90`, no runs on B, and one auto upper `{ x: 10, width: 30, cabinetTypeId: UPPER, depth: 12, heightMode: 'auto' }` (so `syncRoom` gives it `z: 54`, `height: 36`): `{ left: 0, right: 120, top: 96, bottom: 0 }` — box top 90 plus a 6″ stack.

Expect 481 passing.

### Step 112

No tests. UI, checked by hand.

### Step 113 (`model/__tests__/dimensions.test.js`)

**Test 11 changes.** `pickColumnRuns(wall, 'upper-right')` now has to name the edge: `pickColumnRuns(wall, 'upper-right', 'right')`, with the same expectation. The `null` case is unchanged.

- **192.** On test 11's wall (`A`, 120″, `base-left` `{ x: 0, width: 30 }`, `upper-left` `{ x: 5, width: 20 }`, `base-right` `{ x: 60, width: 30 }`, `upper-right` `{ x: 65, width: 20 }`):
  - `pickColumnRuns(wall, null, 'right')` matches `{ lowerRun: { id: 'base-right' }, upperRun: { id: 'upper-right' } }`;
  - `pickColumnRuns(wall, 'upper-right', 'left')` matches `{ lowerRun: { id: 'base-left' }, upperRun: { id: 'upper-left' } }`;
  - `pickColumnRuns(wall, 'upper-left', 'right')` matches `{ lowerRun: { id: 'base-right' }, upperRun: { id: 'upper-right' } }`;
  - `nearerEdge(60, 120)` is `'left'` and `nearerEdge(60.1, 120)` is `'right'`.

Expect 482 passing.

### Step 114 (new `src/elevation/canvas/__tests__/cursor.test.js`)

- **193.**
  - `resolveCursor({ base: 'crosshair' })` is `'crosshair'`; `resolveCursor({ base: 'crosshair', hover: 'pointer' })` is `'pointer'`; `resolveCursor({ base: 'crosshair', hover: 'pointer', hold: 'move' })` is `'move'`; `resolveCursor({ base: 'default', hold: 'ew-resize' })` is `'ew-resize'`;
  - `elevationBaseCursor('draw', 'idle')` is `'crosshair'`, `elevationBaseCursor('select', 'idle')` is `'default'`, `elevationBaseCursor('draw', 'pan-ready')` is `'grab'`, `elevationBaseCursor('select', 'panning')` is `'grabbing'`;
  - `planBaseCursor('wall', 'idle')` is `'crosshair'`, `planBaseCursor('select', 'idle')` is `'default'`, `planBaseCursor('wall', 'panning')` is `'grabbing'`.

Expect 483 passing.

### Steps 115–116

No tests. UI, checked by hand.
