# Elevation Lab — SPEC-27 (boxes and faces in plan)

Steps 138–142. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-25 must be done first. SPEC-26 is independent of this file — its steps touch elevation only, these touch plan only, and either order works.

Plan stops drawing a run as one solid slab from the wall to the front of the doors. The box draws to its own depth, the faces draw in front of it at their true widths, and a filler draws as the L it actually is.

The blind corner falls out of it. Once the box is its own rectangle and the divisions in it are only where two boxes really butt, a 42" blind is one box with faces in front of part of it — no special case, no line to suppress.

## After this SPEC you can

- Read a plan that matches what gets built: a 24" box, a 1/16" bumper gap, a 13/16" door in front of it, and doors at their true face widths with the reveals showing as gaps.
- See a drawer stack as one face in plan instead of three stacked on each other.
- See a filler as a 3/4" face with a 2 1/2" return lapping each box beside it, at whatever return depth that job uses.
- Order a blind filler 6" wide, see 6" in plan and on the part list, and still see the 1 1/2" that shows on the elevation.

## Not in this SPEC

- Any change to the elevation. Faces already draw there; a filler's ordered width and its return never show there, which is the point — the face reads the same as it does today.
- Any change to `runFootprint`, `findCollisions` or `footprintsAtPoint`. They keep using the run at its full installed front depth, so nothing about what collides changes.
- The plan depth dimension. It keeps measuring the overall installed front depth, box plus bumper plus door, exactly as now.
- Interior filler ordered widths. `endFiller` is per run **side**; an interior filler item draws at its layout width. Add it to the item when a job needs it.
- Face **types** in plan. Every face draws the same; a drawer front and a door are one rectangle each.

---

## §1 Settings (`model/constants.js`, `store/persistence.js`)

Two new numbers in `DEFAULT_SETTINGS`, after `doorThickness`:

| key | default | what it is |
|---|---|---|
| `fillerReturnDepth` | `2.5` | how far a filler's return runs back behind its face |
| `fillerReturnThickness` | `0.75` | the return's thickness, measured along the wall |

Both are numbers, so `V2_NUMERIC_SETTING_KEYS` picks them up on its own. Add both to `V2_DEFAULTED_SETTING_KEYS` so older documents take the defaults.

## §2 Shape: the end filler's real width (`store/persistence.js`, `store/elevationSlice.js`, `model/room.js`)

One new persisted field on a run, optional on read.

| Field | Type | Default |
|---|---|---|
| `endFiller` | `{ left: {width, returnDepth} \| null, right: {width, returnDepth} \| null }` | absent |

Each side is `null`/absent, or an object whose `width` and `returnDepth` are each `null` or a finite number greater than zero.

- `width` is the **ordered** width of the filler at that end of the run — the 6" you buy for a blind corner, of which 1 1/2" shows. Absent means the filler is what the layout says it is.
- `returnDepth` overrides `settings.fillerReturnDepth` for that filler.

Neither ever changes the layout. `splitRun` is untouched: the filler's *visible* width is still whatever the flex rules give it, so the elevation is unchanged, and the difference lives behind the corner.

**`persistence.js`:**

```js
function isEndFillerSide(side) {
  return side === undefined || side === null || (
    Boolean(side)
    && typeof side === 'object'
    && !Array.isArray(side)
    && ['width', 'returnDepth'].every((key) => (
      side[key] === undefined
      || side[key] === null
      || (isFiniteNumber(side[key]) && side[key] > 0)
    ))
  );
}

function isEndFiller(endFiller) {
  return endFiller === undefined
    || (Boolean(endFiller)
      && typeof endFiller === 'object'
      && !Array.isArray(endFiller)
      && isEndFillerSide(endFiller.left)
      && isEndFillerSide(endFiller.right));
}
```

`isRun` (208–…) gains `&& isEndFiller(run.endFiller)`.

**`elevationSlice.js`** — one reducer beside `setRunBlind`, added to the exported action list. No `syncRoomAt`: nothing here is geometry.

```js
setRunEndFiller(state, action) {
  const location = runLocation(state, action.payload);
  const { side, key, value } = action.payload;
  if (!location || (side !== 'left' && side !== 'right')) return;
  if (key !== 'width' && key !== 'returnDepth') return;
  const run = location.run;
  run.endFiller = { left: null, right: null, ...(run.endFiller ?? {}) };
  const current = run.endFiller[side] ?? { width: null, returnDepth: null };
  const next = {
    ...current,
    [key]: Number.isFinite(value) && value > 0 ? value : null,
  };
  run.endFiller[side] = next.width === null && next.returnDepth === null ? null : next;
},
```

**`room.js`** — `cloneRun` copies it (deep enough to clone both sides), and `flipRunsForWall` swaps `left`/`right`, exactly as `blind` and `cornerClearance` are handled.

## §3 Plan geometry (`model/planPieces.js`, new, pure)

```js
planRunPieces(room, wall, run, settings, layout, faceLayouts) → {
  box, divisions, faces, returns
}
```

All spans are in wall-local x, all depths are offsets from the wall face the way `elevationToPlan` takes them. The component maps them; the model does no drawing.

```js
const faceBack  = run.depth + settings.bumperThickness;
const faceFront = frontDepth(run, settings);   // run.depth + bumper + door
```

### §3.1 `box`

`{ start, end, back: 0, front: run.depth }`.

`start` and `end` are the run widened by its blind boxes:

```js
const blindSpans = blindEntries(room, wall, run, settings, layout).entries
  .filter((entry) => entry.extension > 1e-6)
  .map((entry) => [entry.boxX, entry.boxX + entry.boxWidth]);
const start = Math.min(run.x, ...blindSpans.map(([left]) => left));
const end = Math.max(run.x + run.width, ...blindSpans.map(([, right]) => right));
```

The box's front is `run.depth`, not `frontDepth`. That is the whole change in one line: plan used to draw the box out to the front of the doors.

### §3.2 `divisions`

Cabinet to cabinet only: for each adjacent pair in `layout.pieces` where both are `kind === 'cabinet'`, the x where they meet. A filler or an end panel between two cabinets produces no division — the gap in the box is the filler, and drawing a line there is what made a blind look like two cabinets.

Each is `{ x, back: 0, front: run.depth }`.

### §3.3 `faces`

`[{ key, kind, start, end, back: faceBack, front: faceFront }]`, `kind` one of `'face' | 'filler' | 'end_panel'`.

- **cabinet** pieces — one entry per face that shows from above. `faceLayouts.get(piece.id).faces` are the true face rectangles in wall coordinates; `topFaces` below reduces a stack to the one on top. `key` is `` `${piece.id}:${face.path}${face.half ?? ''}` ``. A piece with no face layout falls back to one entry spanning the piece.
- **filler** pieces — one entry spanning the filler's **true** width (§3.4). `key` is the piece id.
- **end_panel** pieces — one entry spanning the piece, no return. `key` is the piece id.

```js
/** Keep only the topmost face of each vertical stack. */
export function topFaces(faces) {
  const kept = [];
  for (const face of [...faces].sort((a, b) => b.z - a.z || a.x - b.x)) {
    const overlaps = kept.some((other) => (
      Math.min(other.x + other.width, face.x + face.width)
      - Math.max(other.x, face.x) > 1e-6
    ));
    if (!overlaps) kept.push(face);
  }
  return kept.sort((a, b) => a.x - b.x);
}
```

Highest first, and a face is kept only if nothing already kept overlaps it horizontally. Three drawer fronts stacked give one entry; a pair door gives two, because its halves do not overlap.

### §3.4 A filler's true width

For an **end** filler — `piece.role` is `'end-left'` or `'end-right'` — with `width = run.endFiller?.[side]?.width`:

| side | true span |
|---|---|
| `left` | `[pieceRight - width, pieceRight]` |
| `right` | `[piece.x, piece.x + width]` |

The filler grows away from the cabinets, into the corner, the same way a blind box does. With no `width` set, the true span is the piece and nothing moves. Interior fillers always span their piece.

### §3.5 `returns`

One per filler edge that meets a cabinet. For each `kind === 'filler'` piece, look at its neighbours in `layout.pieces` by index: for each side whose neighbour is `kind === 'cabinet'`, one entry

```js
{
  key: `${piece.id}:${side}`,
  start, end,                     // thickness wide, at that edge of the TRUE span
  back: faceBack - returnDepth,
  front: faceBack,
}
```

with `thickness = Math.min(settings.fillerReturnThickness, trueWidth)` and
`returnDepth = run.endFiller?.[side]?.returnDepth ?? settings.fillerReturnDepth` for an end filler, `settings.fillerReturnDepth` for an interior one.

The return runs back from the **back of the face**, so a filler's face plus its return is `doorThickness + returnDepth` deep in total. An interior filler between two cabinets gets two returns, one lapping each box.

**`model/index.js`** exports `planRunPieces` and `topFaces`.

## §4 The ordered filler width reaches the part list (`model/blind.js`)

`blindPartWidths` gains one rule, before the panel rule it already has: when a side's blind is **covered** and `run.endFiller?.[side]?.width` is set, the end piece's id maps to that width.

Order, per side:

1. exposed blind → the corner-to-face panel width (SPEC-25 §2.4, unchanged);
2. covered blind with an `endFiller` width → that width;
3. otherwise → absent, and the caller falls back to `piece.width`.

An exposed blind ignores the typed width, because the panel has to reach the corner whatever you ordered.

## §5 Drawing it (`plan/PlanRunFootprint.jsx`)

The component stops building spans of its own and draws what `planRunPieces` hands it. The separate blind polygon SPEC-25 §5 added, the `blindEntries` call and the `runFootprint` call all come out; the model supplies what they were for.

- **box** — the closed polygon at `box.back`/`box.front` over `[box.start, box.end]`, with the existing fill and `hitStrokeWidth`, and `footprintOutlineSegments(frame, { x: box.start, width: box.end - box.start }, run.depth)` for its outline. It is still the click target, so clicking the buried part of a blind selects its run.
- **divisions** — the line `boundaryPieces` used to draw, now only where two boxes butt, from `back` to `front`, `stroke={KIND_COLORS.cabinet}`, `strokeWidth={0.75 / scale}`, `opacity={0.9}`.
- **faces** — one closed polygon each, `fill={color}` at the run's own opacity, `stroke={outline}`, `strokeWidth={0.75 / scale}`, `listening={false}`. Upper runs keep their dash.
- **returns** — the same, at `KIND_COLORS.filler`.

`runFootprint`, `depthDimension` and the collision props are untouched; `depthDimension` still takes the run and still measures the full installed front depth.

## §6 Editing it (`components/PropertiesPanel.jsx`)

In the per-side card of `Corners & anchors`, under the `Blind box` field from SPEC-25 §6, two more:

```jsx
<Field label="Filler width">
  <InchInput
    value={run.endFiller?.[side]?.width ?? null}
    allowBlank
    placeholder="from layout"
    onCommit={(value) => dispatch(setRunEndFiller({ ...actionBase, side, key: 'width', value }))}
    aria-label={`${side} end filler ordered width`}
  />
</Field>
<Field label="Filler return">
  <InchInput
    value={run.endFiller?.[side]?.returnDepth ?? null}
    allowBlank
    placeholder={formatInchesInput(settings.fillerReturnDepth)}
    onCommit={(value) => dispatch(setRunEndFiller({ ...actionBase, side, key: 'returnDepth', value }))}
    aria-label={`${side} end filler return depth`}
  />
</Field>
<p className="mt-1.5 text-xs text-gray-500">
  Ordered width and return depth. The elevation still shows what fits.
</p>
```

---

## §7 Tests

Numbering continues from SPEC-25 (last was 212). Expect 502 passing before step 138 — or 504 if SPEC-26 is already in, in which case add 2 to every count below. SPEC-26's own tests are numbered 213 and 214, which is why this file starts at 215.

### Step 138 (`store/__tests__/persistence.test.js`, `store/__tests__/elevationSlice.test.js`)

- **215.** `DEFAULT_SETTINGS.fillerReturnDepth` is `2.5` and `fillerReturnThickness` is `0.75`; a v3 document whose settings omit both passes `isElevationDocument` and comes out of `normalizeV3Document` carrying them. A run omitting `endFiller` still passes; `endFiller: { left: { width: 6, returnDepth: 3 }, right: null }` round-trips; `{ left: { width: 0 } }` and `{ left: [] }` each fail.
- **216.** `setRunEndFiller({ …, side: 'left', key: 'width', value: 6 })` gives `endFiller` `{ left: { width: 6, returnDepth: null }, right: null }`; a second call with `key: 'returnDepth', value: 3` gives `{ width: 6, returnDepth: 3 }`; clearing both with `value: null` leaves `{ left: null, right: null }`; `key: 'depth'` and `side: 'middle'` change nothing.

Expect 504 passing.

### Step 139 (new `src/elevation/model/__tests__/planPieces.test.js`)

Copy `makeWall` and the `run` / `base` helpers from `src/elevation/model/__tests__/blind.test.js`. Every fixture run is `autoCount: false`, `heightMode: 'manual'`, no anchors, on a wall with no connections.

The run for 217 and 218 is `base('P', { x: 0, width: 30, ends: { left: { type: 'filler', width: 3 }, right: { type: 'none', width: null } }, autoCount: false, items: [{ id: 'c1', kind: 'cabinet', width: 27 }] })` — so `P:left` spans 0–3 and `c1` spans 3–30, at `depth: 24`.

Under `DEFAULT_SETTINGS`, `faceBack` is `24.0625` and `faceFront` is `24.875`; `faceBack - 2.5` is `21.5625`.

**217.** `planRunPieces(room, wall, run, DEFAULT_SETTINGS, layout, faceLayouts)`:

- `box` equals `{ start: 0, end: 30, back: 0, front: 24 }`;
- `divisions` is `[]` — one cabinet, nothing butts;
- `faces.filter(({ kind }) => kind === 'filler')` is
  `[{ key: 'P:left', kind: 'filler', start: 0, end: 3, back: 24.0625, front: 24.875 }]`;
- every entry in `faces` has `back` `24.0625` and `front` `24.875`;
- `returns` equals
  `[{ key: 'P:left:right', start: 2.25, end: 3, back: 21.5625, front: 24.0625 }]`
  — one return, on the cabinet side, 3/4" wide at the filler's inner edge.

**218.** The ordered width and the return depth. With `endFiller: { left: { width: 6, returnDepth: 4 }, right: null }` on the same run:

- the filler face entry is `{ key: 'P:left', kind: 'filler', start: -3, end: 3, back: 24.0625, front: 24.875 }` — 6" wide, grown away from the cabinet;
- `returns` equals `[{ key: 'P:left:right', start: 2.25, end: 3, back: 20.0625, front: 24.0625 }]`;
- `box` is unchanged at `{ start: 0, end: 30, back: 0, front: 24 }` — an ordered filler width never moves the run.

**219.** `topFaces`, pure, with literal rectangles:

- three stacked drawer fronts — `[{x:0,z:0,width:20,height:8},{x:0,z:9,width:20,height:8},{x:0,z:18,width:20,height:8}]` — give one face, the one at `z: 18`;
- a pair door — `[{x:0,z:0,width:10,height:30},{x:10,z:0,width:10,height:30}]` — gives both, in x order;
- two columns each with a stack — `[{x:0,z:0,width:10,height:8},{x:0,z:9,width:10,height:20},{x:12,z:0,width:10,height:8},{x:12,z:9,width:10,height:20}]` — give two, at `x: 0` and `x: 12`, both at `z: 9`;
- `topFaces([])` is `[]`.

Assert cabinet face entries by count and by each lying inside its piece, not by exact span: those come from the reveal rules, which have their own tests.

Expect 507 passing.

### Step 140 (`src/elevation/model/__tests__/blind.test.js`)

**220.** On the covered-blind fixture, a run with `endFiller: { left: { width: 6 }, right: null }` gives `blindPartWidths` an entry mapping the end piece id to `6`. On the exposed fixture from test 208, the same `endFiller` is ignored and the entry is still the corner-to-face panel width, `15`.

Expect 508 passing.

### Steps 141–142

No tests. Drawing and UI, checked by hand.
