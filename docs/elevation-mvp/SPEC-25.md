# Elevation Lab — SPEC-25 (blind corners)

Steps 128–134. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-24 must be done first.

A blind corner is an ordinary cabinet whose **box** is wider than what you see. You say how wide the box is; everything else — where the run sits, how wide the filler is, how wide the visible face is, what gets dimensioned — carries on under the rules it already follows.

That is the whole design, and it is why this SPEC changes no geometry. `splitRun`, `resolveHorizontal`, `cornerReserve`, `runFootprint`, `neighborProfiles` and the dimension chains are all untouched. A blind is a stored width plus a derived overlay on top of the layout that already exists.

## After this SPEC you can

- Tick Blind on a run's left or right corner and type the box width. A 42" blind base in a corner with 21" showing is `Blind 42` — the other 21" runs into the corner behind the filler and the neighbouring cabinets.
- Read the blind on the elevation: the visible box draws exactly as it always did, labelled `Blind 42"` under its visible width. The hidden part is not drawn.
- See the whole 42" footprint in plan, overlapping the neighbouring run, which is where you want to check it actually fits.
- Get a full-width panel automatically when the blind is taller than what dies into it — a tall blind with a base and an upper on the neighbouring wall, say. The panel reaches from the wall corner to the cabinet face; the part of it you can see still follows ordinary filler rules.
- Have both come out right on the part list: the blind cabinet's part width is the box width, the panel's part width is the panel's full width.

## Not in this SPEC

- 90° and 45° corner units. A blind belongs to one wall; a lazy-susan or diagonal unit belongs to two and shows a different face on each, which needs a piece two wall views share. Nothing here has to be undone to add it. Logged in `TODO.md`.
- Any change to run geometry, corner reserve, `cornerClearance`, collision detection or the dimension chains. A blind box never moves a run, never trips `findCollisions` (footprints are built from `run.x`/`run.width`, which do not change) and never appears as a neighbour profile on the next wall.
- Automatic blind detection. Blind is always something you turn on.
- A blind with no end piece on that side. `ends[side].type === 'none'` plus an exposed blind raises a warning and draws no panel; there is nothing to widen.
- Two blinds meeting in one corner, from both walls. Neither knows about the other; whether that wants a warning is a real question, deferred.
- DXF and the future report. They read part widths, which this SPEC makes correct, and need no other change.

---

## §1 Shape: what a run stores (`store/persistence.js`, `store/elevationSlice.js`, `model/room.js`)

One new persisted field, optional on read so every existing document loads unchanged.

| Field | Where | Type | Default |
|---|---|---|---|
| `blind` | run | `{ left: number\|null, right: number\|null }` | absent |

`blind[side]` is the **box width of the cabinet at that end of the run, in inches** — the number the shop orders, 42 for a 42" blind base. `null` or absent means that side is not blind. Zero and negative are not blinds and are rejected by the reducer.

**`persistence.js`:**

```js
function isBlind(blind) {
  return blind === undefined
    || (Boolean(blind)
      && typeof blind === 'object'
      && !Array.isArray(blind)
      && ['left', 'right'].every((side) => (
        blind[side] === undefined
        || blind[side] === null
        || (isFiniteNumber(blind[side]) && blind[side] > 0)
      )));
}
```

`isRun` (196–206) gains `&& isBlind(run.blind)`. Nothing else in the file changes: `toElevationDocument` spreads the run, so `blind` persists with no help, and `normalizeV3Document` leaves an absent `blind` absent — every reader below treats absent and `{}` the same.

**`elevationSlice.js`** — one reducer, beside `setRunCornerClearance` (1058–1071), added to the exported action list. It does **not** call `syncRoomAt`: `blind` changes no geometry, so a sync per keystroke would be waste.

```js
setRunBlind(state, action) {
  const location = runLocation(state, action.payload);
  const { side, width } = action.payload;
  if (!location || (side !== 'left' && side !== 'right')) return;
  const run = location.run;
  run.blind = { left: null, right: null, ...(run.blind ?? {}) };
  run.blind[side] = Number.isFinite(width) && width > 0 ? width : null;
},
```

**`room.js`** — two places:

- `cloneRun` (54–75): copy it, the way `cornerClearance` is copied —
  `...(run.blind ? { blind: { ...run.blind } } : {})`.
- `flipRunsForWall` (1455–1485): swap it with the other mirrored fields —
  `...(run.blind ? { blind: { left: run.blind.right, right: run.blind.left } } : {})`.

## §2 The blind overlay (`model/blind.js`, new, pure)

```js
blindEntries(room, wall, run, settings, layout) → { entries, warnings }
```

`wall` is an elevation side view. `layout` defaults to the standard `splitRun` call with the three options `horizontalChains` uses, so a caller that already has one passes it in rather than paying for a second.

One entry per side that is blind:

```js
{
  side,          // 'left' | 'right'
  pieceId,       // the blind cabinet piece
  boxWidth,      // what the user typed
  boxX,          // wall-local left edge of the BOX
  extension,     // how far the box runs past the run's own layout, >= 0
  visibleWidth,  // the piece's width, straight from splitRun
  cornerX,       // 0 on the left, wallLength(wall) on the right
  covered,       // is every inch of the blind's height hidden by the neighbour
  endPieceId,    // the run's end piece on that side, or null
  panel,         // { x, width } in wall coordinates, or null
}
```

### §2.1 Which piece is the blind

The outermost `kind === 'cabinet'` piece on that side of `layout.pieces` — the first for `left`, the last for `right`. A side whose run holds no cabinet piece produces no entry and no warning; there is nothing to make blind.

### §2.2 Geometry

With `piece` the blind cabinet and `W = run.blind[side]`:

| | left | right |
|---|---|---|
| `boxX` | `piece.x + piece.width - W` | `piece.x` |
| box right edge | `piece.x + piece.width` | `piece.x + W` |
| `cornerX` | `0` | `wallLength(wall)` |

`extension = Math.max(0, W - piece.width)` and `visibleWidth = piece.width`. The box is anchored at the face and grows away from the room — left blinds grow left, right blinds grow right. It does not matter whether `boxX` lands inside the wall, at zero, or past it; the box simply reaches as far as its width says.

### §2.3 Coverage

Two exports, so the rule can be tested without a room:

```js
/** Merge z-ranges and report whether they cover [z, top] with no gap. */
export function isBlindCovered(ranges, z, top) { … }

/** The z-ranges of neighbouring runs that die into this run's corner. */
export function coveredRanges(room, wall, run, side, settings) { … }
```

`coveredRanges` takes `corner = cornerForRunSide(room, wall, run, side)`. When `corner.type !== 'inside'` it is `[]` — nothing dies into an open end, so a blind there is always exposed. Otherwise it is one `[neighborRun.z, neighborRun.z + neighborRun.height]` per run on the neighbouring wall that is on `corner.neighborWallSide`, passes `anchoredToCorner(neighborRun.anchors?.[corner.neighborSide], corner)`, and has `height > 0`. Bands are **not** filtered: an upper that dies into a tall blind covers the part of it that it reaches, which is the whole point of the test.

`covered = isBlindCovered(coveredRanges(...), run.z, run.z + run.height)`. Box ranges, not `verticalStart` — a toe kick is recessed and hides nothing.

`isBlindCovered` sorts the ranges by start, walks them merging anything that touches or overlaps, and returns true only if one merged range reaches from `z` to `top`. Empty ranges are never covered.

### §2.4 The panel

`panel` is `null` when `covered` is true. Otherwise it is the piece between the wall corner and the cabinet's face — corner to face, whatever the blind width turned out to be:

| | left | right |
|---|---|---|
| `panel.x` | `cornerX` | `piece.x + piece.width` |
| `panel.width` | `piece.x - cornerX` | `cornerX - (piece.x + piece.width)` |

A width of zero or less means the face already meets the corner and there is nothing to panel: `panel` is `null`.

`endPieceId` is `` `${run.id}:${side}` `` when `layout.pieces` holds that piece, else `null`. A panel with no end piece cannot be built, so when `panel` would be set and `endPieceId` is `null`, `panel` is forced to `null` and a warning is raised instead.

### §2.5 Warnings

`warnings` is `[{ code, side }]`:

- `blind-not-past` — `extension <= 1e-6`. The box is no wider than what shows, so it is not blind at all.
- `blind-needs-end` — the blind is exposed and the run has no end piece on that side to widen into the panel.

### §2.6 Part widths

```js
blindPartWidths(room, wall, run, settings, layout) → Map<pieceId, number>
```

Built from `blindEntries`: the blind cabinet's piece id maps to `boxWidth`, and the end piece's id maps to `panel.width` when a panel applies. Every other piece is absent — a caller reads `widths.get(piece.id) ?? piece.width`.

**`model/index.js`** exports `blindEntries`, `blindPartWidths`, `coveredRanges` and `isBlindCovered`.

## §3 Part widths follow the box (`model/partNumbers.js`)

`runParts` (49–70) gains one line: `const widths = blindPartWidths(room, view, run, settings, layout);` after the layout, and reports `width: widths.get(piece.id) ?? piece.width`.

That is the only change to numbering. Which parts exist, their order and their numbers are all unchanged — a blind cabinet is one part and its panel is one part, exactly as the filler it replaces was.

## §4 Elevation: labels, nothing else (`components/PieceRect.jsx`, `components/RunGroup.jsx`)

The hidden part of the box is not drawn. `PieceRect` draws the piece it is given, which is the visible piece, and that is already right. What the elevation needs is a way to say *this is a blind, and here is how wide the box really is*.

**`PieceRect`** gains one optional prop, `subLabel = null`. When it is set and the piece is not `narrow`, the width text moves up and the sub-label draws under it:

- width `Text`: `y: rect.y`, `height: rect.height - 13`, everything else unchanged — so it stays centred in the space above the sub-label.
- sub-label `Text`: `x: rect.x`, `y: rect.y + rect.height / 2 + 2`, `width: rect.width`, `align="center"`, `text={subLabel}`, `fill="#cbd5e1"`, `fontSize={10}`, `listening={false}`.

When `subLabel` is null nothing moves and nothing new draws. The hover `Label` for a narrow piece appends `` ` · ${subLabel}` `` to its text when there is one.

**`RunGroup`** computes the overlay once, beside `faceLayouts`:

```js
const blind = useMemo(
  () => blindEntries(room, wall, run, settings, result),
  [result, room, run, settings, wall],
);
const subLabels = useMemo(() => {
  const labels = new Map();
  for (const entry of blind.entries) {
    labels.set(entry.pieceId, `Blind ${formatInches(entry.boxWidth)}`);
    if (entry.panel && entry.endPieceId) {
      labels.set(entry.endPieceId, `Panel ${formatInches(entry.panel.width)}`);
    }
  }
  return labels;
}, [blind]);
```

and passes `subLabel={subLabels.get(piece.id) ?? null}` to each `PieceRect` in the `drawnPieces` map (290–303). Nothing else in `RunGroup` changes — not the faces, not the badges, not the centerline markers.

Plain text, deliberately, not a dimension line: the inner chain measures what you can see, and the blind width is a note on the part, not a measurement of the elevation.

## §5 Plan: the whole footprint (`plan/PlanRunFootprint.jsx`)

Plan is where the overlap matters, so plan draws the box in full.

Per entry with `extension > 1e-6`, one extra closed polygon at the run's `depth`, drawn immediately **before** the existing footprint `Line` so the run itself stays on top:

| | left | right |
|---|---|---|
| span | `boxX` → `run.x` | `run.x + run.width` → `boxX + boxWidth` |

```js
<Line
  key={`blind:${entry.side}`}
  points={linePoints([
    elevationToPlan(frame, spanStart, 0),
    elevationToPlan(frame, spanEnd, 0),
    elevationToPlan(frame, spanEnd, depth),
    elevationToPlan(frame, spanStart, depth),
  ])}
  closed
  fill={upper ? `${color}59` : `${color}8c`}
  stroke={outline}
  strokeWidth={(collision || selected ? 2.5 : 1.5) / scale}
  listening={false}
/>
```

Same fill and same outline as the run, so it reads as one cabinet reaching into the corner rather than as a separate object. `footprintOutlineSegments`, `runFootprint`, the depth dimension and the collision test are all untouched — the extension is drawn, not modelled.

## §6 Turning it on (`components/PropertiesPanel.jsx`)

In the `Corners & anchors` section (717–…), inside the per-side card and below the clearance control, one field:

```jsx
<Field label="Blind box">
  <InchInput
    value={run.blind?.[side] ?? null}
    allowBlank
    placeholder="none"
    onCommit={(width) => dispatch(setRunBlind({ ...actionBase, side, width }))}
    aria-label={`${side} blind box width`}
  />
</Field>
<p className="mt-1.5 text-xs text-gray-500">
  Box width of the cabinet at this end. The extra runs into the corner.
</p>
```

Blank clears it. It is offered on every side, whatever the corner is — a blind past an open wall end is unusual but not wrong, and nothing here should decide for you.

Under it, the warnings from `blindEntries` for that side, one amber line each:

| code | line |
|---|---|
| `blind-not-past` | `Blind box is no wider than the cabinet.` |
| `blind-needs-end` | `Blind is exposed — add a filler or panel at this end.` |

`setRunBlind` joins the existing action imports; `blindEntries` comes from `../model/index.js`, which `PropertiesPanel` already imports from.

---

## §7 Tests

Numbering continues from SPEC-24 (last was 205). Expect 495 passing before step 128.

### Step 128 (`store/__tests__/persistence.test.js`)

- **206.** A valid v3 document whose runs omit `blind` still passes `isElevationDocument`; one whose run carries `blind: { left: 42, right: null }` round-trips unchanged; `blind: { left: 0 }`, `blind: { left: -42 }` and `blind: []` each fail.
Expect 496 passing.

### Step 129 (`store/__tests__/elevationSlice.test.js`)

- **207.** `setRunBlind({ roomId, wallId, runId, side: 'left', width: 42 })` sets `run.blind` to `{ left: 42, right: null }`; a second call with `side: 'right', width: 30` gives `{ left: 42, right: 30 }`; `width: null` on the left gives `{ left: null, right: 30 }`; `width: 0` also clears; `side: 'middle'` changes nothing.

Expect 497 passing.

### Step 130 (new `src/elevation/model/__tests__/blind.test.js`)

Copy `makeWall` and the `run` / `base` helpers from `src/elevation/model/__tests__/partNumbers.test.js` (lines 7–58). Every fixture run is `autoCount: false`, `heightMode: 'manual'`, `anchors: { left: false, right: false }` and fixed item widths, and the wall has no connections — so `syncRoom` leaves the layouts exactly as written and no corner is `inside`.

```js
const blindRoom = (runs) => syncRoom({
  id: 'K',
  name: 'Room K',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  partNumberStart: 1,
  partNumberOverrides: {},
  wallOrder: ['K1'],
  walls: [makeWall('K1', 0, 0, 120, 0, { runs })],
}, DEFAULT_SETTINGS);

const leftRun = (blind) => base('L', {
  x: 12,
  width: 24,
  ends: { left: { type: 'filler', width: 3 }, right: { type: 'none', width: null } },
  autoCount: false,
  items: [{ id: 'w1', kind: 'cabinet', width: 21 }],
  blind,
});

const rightRun = (blind) => base('R', {
  x: 84,
  width: 24,
  ends: { left: { type: 'none', width: null }, right: { type: 'filler', width: 3 } },
  autoCount: false,
  items: [{ id: 'w2', kind: 'cabinet', width: 21 }],
  blind,
});
```

`base` gives `z: 4`, `height: 30.5`, `depth: 24`. Run `L` lays out as filler `L:left` at x 12 width 3, then `w1` at x 15 width 21. Run `R` lays out as `w2` at x 84 width 21, then filler `R:right` at x 105 width 3.

**208.** A left blind and a right blind, both exposed.

- `blindEntries(room, wall, runL, DEFAULT_SETTINGS).entries` for `leftRun({ left: 42, right: null })` is one entry matching
  `{ side: 'left', pieceId: 'w1', boxWidth: 42, boxX: -6, extension: 21, visibleWidth: 21, cornerX: 0, covered: false, endPieceId: 'L:left', panel: { x: 0, width: 15 } }`,
  and its `warnings` is `[]`.
- the same call for `rightRun({ left: null, right: 42 })` is one entry matching
  `{ side: 'right', pieceId: 'w2', boxWidth: 42, boxX: 84, extension: 21, visibleWidth: 21, cornerX: 120, covered: false, endPieceId: 'R:right', panel: { x: 105, width: 15 } }`.
- `wall` is `wallSideView(room.walls[0], 'front')` in both.

**209.** The two warnings.

- `leftRun({ left: 21, right: null })` gives one entry with `extension: 0` and `warnings` equal to `[{ code: 'blind-not-past', side: 'left' }]`.
- `leftRun({ left: 42, right: null })` with the run's left end changed to `{ type: 'none', width: null }` — so the layout is `w1` alone at x 12 width 24 — gives one entry with `panel: null`, `endPieceId: null` and `warnings` equal to `[{ code: 'blind-needs-end', side: 'left' }]`.
- `leftRun({ left: null, right: null })` gives `{ entries: [], warnings: [] }`.

**210.** `isBlindCovered`, pure:

- `isBlindCovered([[4, 34.5]], 4, 34.5)` is `true`;
- `isBlindCovered([[4, 34.5]], 4, 90)` is `false`;
- `isBlindCovered([[4, 34.5], [54, 90]], 4, 90)` is `false`;
- `isBlindCovered([[4, 54], [50, 90]], 4, 90)` is `true`;
- `isBlindCovered([], 4, 34.5)` is `false`;
- `isBlindCovered([[0, 96]], 4, 34.5)` is `true`.

**211.** `blindPartWidths(room, wall, runL, DEFAULT_SETTINGS)` for `leftRun({ left: 42, right: null })` equals `new Map([['w1', 42], ['L:left', 15]])`; for `leftRun({ left: null, right: null })` it is an empty `Map`.

Expect 501 passing.

### Step 131 (`src/elevation/model/__tests__/partNumbers.test.js`)

**212.** With the room from test 208's left case, `partNumbers(room, DEFAULT_SETTINGS).parts` has `width` `15` on the part keyed `L:left` and `42` on the part keyed `w1`, while `parts.map(({ key }) => key)` is unchanged — `['L:left', 'w1', 'molding:toeKick']` — and the numbers are `[1, 2, 3]`.

Expect 502 passing.

### Steps 132–134

No tests. Drawing and UI, checked by hand.
