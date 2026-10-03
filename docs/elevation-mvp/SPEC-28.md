# Elevation Lab — SPEC-28 (end types, plan boxes, phantom dimensions)

Steps 143–149. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-26 and SPEC-27 must both be done first.

Seven corrections to what SPEC-25, SPEC-26 and SPEC-27 landed, from one round of drawing with them.

What an end of a run *is* becomes a single choice — end panel, none, filler, blind corner — instead of a type in one panel section and two loose number fields in another. A blind corner then carries its own defaults: a 6" ordered filler, no return.

Plan stops drawing a run as one slab from the wall to the back of the faces. Each cabinet box draws at its own true width, an end panel draws at its real 3/4" × full depth, and a filler sits outside the boxes rather than on top of them. The outer run border goes away; every part is still inside the run's overall dimensions.

The phantom outline a neighbouring wall casts into this elevation stops getting a dimension row of its own below the openings. Its width joins the band it belongs to — the piece row and the overall row for a base or tall neighbour, the rows above the wall for an upper one — and the overall chain grows to reach it.

## After this SPEC you can

- Pick what is at each end of a run in one place, and see only the fields that end needs.
- Pick **Blind corner** and get a 6" ordered filler with no return, without typing either number.
- Read a plan where a 42" blind box shows 42", the 6" filler beside it shows 6" and sits outside the box, and an end panel is a 3/4" × 24 7/8" rectangle beside the box rather than a stripe across its face.
- Read a phantom's width on the same dimension line as the pieces next to it, and see the overall dimension reach the far edge of the phantom.

## Not in this SPEC

- 45° and 90° corner cabinets. `'blind'` is added as a fourth end type precisely so those can be a fifth and sixth later, but nothing here draws one.
- Choosing a blind box width for you. Picking **Blind corner** leaves `run.blind[side]` empty and the existing `blind-not-past` warning stands until you type one. The ordered filler width and the return depth are what get defaults.
- Any change to the elevation drawing. A blind end still splits as a filler, at the same flex width, and draws exactly as it does today. `splitRun`'s output for an existing document is byte-for-byte what it is now.
- Any change to `runFootprint`, `findCollisions`, `footprintsAtPoint` or `depthDimension`. They keep using the run at its full installed front depth.
- Merging two phantoms that reach different distances past the same end. The one that reaches furthest is the one dimensioned, per side, per band.
- `settings.defaultEnds`. It keeps validating against the same set, which now also accepts `'blind'`; nothing writes that value.

---

## §1 A fourth end type (`model/constants.js`, `store/persistence.js`, `model/splitRun.js`, `model/room.js`, `store/elevationSlice.js`, `components/RunGroup.jsx`, `model/blind.js`)

`run.ends[side].type` gains `'blind'`. **A blind end is a filler in every place that lays out or measures a run** — same piece `kind`, same `cabinetTypeId`, same flex behaviour, same minimum. The type exists so the UI knows which fields to show and so §2 knows which defaults to apply.

### §1.1 One new setting

In `DEFAULT_SETTINGS`, after `fillerReturnThickness`:

| key | default | what it is |
|---|---|---|
| `blindFillerWidth` | `6` | the ordered width of a filler at a blind end when none is typed |

A number, so `V2_NUMERIC_SETTING_KEYS` picks it up. Add it to `V2_DEFAULTED_SETTING_KEYS` so older documents take the default.

### §1.2 `persistence.js`

- `END_TYPES` (30) becomes `new Set(['filler', 'end_panel', 'none', 'blind'])`.
- `isEndFillerSide` (210) stops requiring both numbers to be positive. `width` stays `> 0`; `returnDepth` becomes `>= 0`, so a filler can carry an explicit zero return:

```js
const END_FILLER_MINIMUMS = { width: 0, returnDepth: -1 };

function isEndFillerSide(side) {
  return side === undefined || side === null || (
    Boolean(side)
    && typeof side === 'object'
    && !Array.isArray(side)
    && ['width', 'returnDepth'].every((key) => (
      side[key] === undefined
      || side[key] === null
      || (isFiniteNumber(side[key]) && side[key] > END_FILLER_MINIMUMS[key])
    ))
  );
}
```

- **Migration.** In `normalizeV3Document`'s run mapper (449–461), an old run whose blind width is set on a filler end becomes a blind end:

```js
ends: run.ends && typeof run.ends === 'object'
  ? Object.fromEntries(['left', 'right'].map((side) => [
      side,
      run.ends[side]?.type === 'filler' && run.blind?.[side] > 0
        ? { ...run.ends[side], type: 'blind' }
        : run.ends[side],
    ]))
  : run.ends,
```

placed beside the existing `anchors` key in the same returned object.

### §1.3 `splitRun.js`

Three lines, all near the top:

```js
const FILLER_END_TYPES = new Set(['filler', 'blind']);

function endWidth(end, settings) {
  if (end.type === 'end_panel') return end.width ?? settings.endPanelThickness;
  if (FILLER_END_TYPES.has(end.type) && end.width !== null) return end.width;
  return 0;
}

function isFlexEnd(end) {
  return FILLER_END_TYPES.has(end.type) && end.width === null;
}
```

and in `addEnd` (190–213) the piece keeps `kind: 'filler'` and `CABINET_TYPE_IDS.FILLER` for a blind end:

```js
const kind = FILLER_END_TYPES.has(end.type) ? 'filler' : end.type;
```

used for both `kind` and the `cabinetTypeId` ternary. Nothing else in the file changes; `splitRunLegacy`'s two synthetic `{ type: 'none' }` ends (450, 488) are untouched.

### §1.4 `room.js`

- `storedEndMinimum` (385–389): `if (end.type === 'filler' || end.type === 'blind') return end.width ?? settings.fillerMinWidth;`
- The inside-corner assignment in the drag resolver (1176–1180) must not overwrite a blind end:

```js
const inside = cornerForRunSide(room, sideWall, proposed, side).type === 'inside';
if (inside && proposed.ends[side].type !== 'blind') {
  proposed.ends[side] = { type: 'filler', width: null };
} else if (!inside && proposed.ends[side].type !== 'end_panel') {
  proposed.ends[side] = { type: 'end_panel', width: null };
}
```

`cloneRun` (57–60) and `flipRunsForWall` (1478) already copy and swap `ends` whole, so a blind end travels with them.

### §1.5 `elevationSlice.js`

- `setRunEnd` (904–914) clears what the new type cannot carry:

```js
location.run.ends[side] = { type: end.type, width: end.width };
if (end.type !== 'blind' && location.run.blind) location.run.blind[side] = null;
if (end.type === 'none' || end.type === 'end_panel') {
  if (location.run.endFiller) location.run.endFiller[side] = null;
}
syncRoomAt(state, location.roomIndex);
```

- `setRunEndFiller` (1080–1093) lets `returnDepth` hold zero:

```js
const minimum = key === 'width' ? 0 : -1;
const next = {
  ...current,
  [key]: Number.isFinite(value) && value > minimum ? value : null,
};
```

- `setRunAnchor`'s inside-corner branch (984–989) gets the same guard as §1.4:

```js
if (inside && location.run.ends[side].type !== 'blind') {
  location.run.ends[side] = { type: 'filler', width: null };
} else if (!inside && location.run.ends[side].type !== 'end_panel') {
  location.run.ends[side] = { type: 'end_panel', width: null };
}
```

The `validWallAnchor` branch (982) keeps forcing a plain filler — a run anchored to a wall face is not in a corner.

### §1.6 `RunGroup.jsx`

The `cornerFillers` memo (130–138) treats a blind end as a filler:

```js
['filler', 'blind'].includes(run.ends[side].type)
&& run.ends[side].width === null
```

### §1.7 `blind.js`

`blindEntries` (89–…) reads the blind width only from an end that says it is blind, so a stale width on a document that skipped the migration draws nothing:

```js
const boxWidth = run.ends[side]?.type === 'blind' ? run.blind?.[side] : null;
if (!(boxWidth > 0)) continue;
```

## §2 A blind end's defaults (`model/planPieces.js`, `model/blind.js`)

Two resolvers, both reading the end type. Neither writes anything to the document — an untouched blind end has no `endFiller` entry at all and still behaves as described here.

```js
function endSideOf(piece) {
  if (piece.role === 'end-left') return 'left';
  if (piece.role === 'end-right') return 'right';
  return null;
}

/** The ordered width of a filler piece, or null when it is what the layout says. */
export function fillerOrderedWidth(run, piece, settings) {
  const side = endSideOf(piece);
  if (!side) return null;
  const stored = run.endFiller?.[side]?.width;
  if (stored > 0) return stored;
  return run.ends?.[side]?.type === 'blind' ? settings.blindFillerWidth : null;
}

/** How far a filler piece's return runs back behind its face. */
export function fillerReturnDepth(run, piece, settings) {
  const side = endSideOf(piece);
  const stored = side ? run.endFiller?.[side]?.returnDepth : null;
  if (stored !== undefined && stored !== null) return stored;
  if (side && run.ends?.[side]?.type === 'blind') return 0;
  return settings.fillerReturnDepth;
}
```

Both live in `planPieces.js` and replace the inline lookups in `fillerSpan` (19–30) and `fillerReturns` (76–104). `fillerReturns` emits nothing for a piece whose return depth is not greater than zero.

**`blind.js`** — `blindPartWidths`'s covered-blind rule (135–140) uses the same default, so a 6" filler is ordered and numbered even though 1 1/2" shows. It needs `settings`, which it already takes:

```js
const endFillerWidth = run.endFiller?.[entry.side]?.width ?? settings.blindFillerWidth;
```

The rule is still gated on `entry.covered`; an exposed blind still reports the corner-to-face panel width, because the panel has to reach the corner whatever you ordered. `entry.covered` only happens on a blind end after §1.7, so no extra type test is needed.

## §3 Plan draws boxes, not a slab (`model/planPieces.js`)

`planRunPieces(room, wall, run, settings, layout, faceLayouts)` returns

```js
{ span, boxes, faces, returns }
```

`box` and `divisions` are gone. All spans are wall-local x; all depths are offsets from the wall face.

```js
const faceBack  = run.depth + settings.bumperThickness;
const faceFront = frontDepth(run, settings);   // run.depth + bumper + door
```

### §3.1 `boxes`

One entry per `kind === 'cabinet'` piece, in layout order:

```js
{ key: piece.id, start, end, back: 0, front: run.depth }
```

`start`/`end` are the piece's own span — `piece.x` to `piece.x + piece.width` — **except** for a piece named by a blind entry with `extension > 1e-6`, which takes that entry's `[boxX, boxX + boxWidth]` instead. That is the whole of what the old `box` and `divisions` were doing, per cabinet instead of per run: two boxes that butt share an edge, so the line between them draws itself, and a blind is one box with faces in front of part of it.

A filler or an end panel contributes no box. The run's outer rectangle is no longer drawn at all.

### §3.2 `faces`

`[{ key, kind, start, end, back, front }]`, `kind` one of `'face' | 'filler' | 'end_panel'`, in layout order.

| kind | from | start / end | back | front |
|---|---|---|---|---|
| `face` | each cabinet piece's `faceLayouts` rectangles through `topFaces`, or one entry spanning the piece when it has no face layout | the face rectangle | `faceBack` | `faceFront` |
| `filler` | each filler piece | its **true** span (§3.3) | `faceBack` | `faceFront` |
| `end_panel` | each end panel piece | the piece | `0` | `faceFront` |

The end panel is the change: it is a real part that runs from the wall to the front of the doors, so in plan it is a 3/4" × `faceFront` rectangle beside the box, and the box beside it ends at the box's own width. Cabinet `key` stays `` `${piece.id}:${face.path}${face.half ?? ''}` ``; filler and end panel keys stay the piece id.

### §3.3 A filler's true width

For a filler piece whose `fillerOrderedWidth` (§2) is a number `width`:

| side | true span |
|---|---|
| `left` | `[pieceRight - width, pieceRight]` |
| `right` | `[piece.x, piece.x + width]` |

The filler grows away from the cabinets, into the corner. With no ordered width the true span is the piece. Interior fillers always span their piece.

### §3.4 `returns`

Unchanged from SPEC-27 §3.5 except for where the depth comes from and the new zero case. One entry per filler edge that meets a cabinet:

```js
{ key: `${piece.id}:${side}`, start, end, back: faceBack - returnDepth, front: faceBack }
```

with `thickness = Math.min(settings.fillerReturnThickness, trueWidth)` at that edge of the true span, and `returnDepth = fillerReturnDepth(run, piece, settings)`. **No entry at all when `returnDepth <= 0`** — which is a blind end's default, and what you can now type on any filler.

### §3.5 `span`

`{ start, end }` — the smallest interval containing every box, face and return. It is the run's whole plan footprint, wider than `run.x .. run.x + run.width` when a blind box or an ordered filler reaches past an end. Used only to place the collision tooltip.

**`model/index.js`** also exports `fillerOrderedWidth` and `fillerReturnDepth` beside `planRunPieces` and `topFaces`.

## §4 Drawing it (`plan/PlanRunFootprint.jsx`)

The single box polygon becomes one per entry in `boxes`, and the click target moves onto the drawn shapes.

- **boxes** — one closed polygon each at `back`/`front` over `[start, end]`, with the existing fill (`${color}8c`, `${color}59` for an upper) and `hitStrokeWidth={8 / scale}`, plus `footprintOutlineSegments(frame, { x: box.start, width: box.end - box.start }, run.depth)` for its outline at the existing weights and dashes. Boxes keep `listening` on: clicking any box, including the buried part of a blind, selects the run.
- **faces** — one closed polygon each, `listening` **on** so a filler or an end panel is clickable too. `fill` by kind: a `face` keeps the run colour, a `filler` uses `KIND_COLORS.filler`, an `end_panel` uses `KIND_COLORS.end_panel`, each at the run's own opacity suffix. `stroke={outline}`, `strokeWidth={0.75 / scale}`, upper dash as now.
- **returns** — unchanged, `KIND_COLORS.filler`, `listening={false}`.
- The collision tooltip anchors at the centre of `span` at the run's back edge instead of at `boxPoints`.

`KIND_COLORS.cabinet` is no longer referenced here once `divisions` is gone; drop it from the import if nothing else uses it. `runFootprint`, `depthDimension` and the collision props are untouched, and the depth dimension still measures the full installed front depth.

## §5 A phantom's width joins its band (`model/neighborProfiles.js`, `model/dimensions.js`)

### §5.1 The entry says what kind of run it came from

Each entry `neighborProfiles` returns gains `cabinetTypeId`, the neighbouring run's, beside `runId`. Nothing else in that file changes.

### §5.2 `horizontalChains` reaches past the wall

A new private helper in `dimensions.js`, importing `neighborProfiles` from `./neighborProfiles.js` (no cycle — `neighborProfiles.js` imports `corners`, `constants`, `geometry`, `profile`, `soffits`, `wallSides`, none of which import `dimensions.js`):

```js
function neighborSegments(room, wall, band, settings) {
  const inBand = band === 'lower'
    ? (id) => id === CABINET_TYPE_IDS.BASE || id === CABINET_TYPE_IDS.TALL
    : (id) => id === CABINET_TYPE_IDS.UPPER;
  return neighborProfiles(room, wall, settings)
    .filter((profile) => inBand(profile.cabinetTypeId))
    .map((profile) => ({
      start: profile.x,
      end: profile.x + profile.width,
      kind: 'neighbor',
      wallId: profile.wallId,
      neighborRunId: profile.runId,
    }));
}
```

A neighbour segment deliberately carries **no `runId`** — the run it names is on another wall, and the overall row's click and drag handlers key off `runId`.

`horizontalChains` then bounds each end by the furthest phantom on that side, clamped so the chain stays contiguous:

```js
const neighbors = neighborSegments(room, wall, band, settings);
const outermost = (segments, side, limit) => {
  const reaching = side === 'left'
    ? segments.filter((segment) => segment.start < limit - SEGMENT_EPSILON)
    : segments.filter((segment) => segment.end > limit + SEGMENT_EPSILON);
  if (reaching.length === 0) return null;
  const furthest = side === 'left'
    ? reaching.reduce((a, b) => (b.start < a.start ? b : a))
    : reaching.reduce((a, b) => (b.end > a.end ? b : a));
  return side === 'left'
    ? { ...furthest, end: limit }
    : { ...furthest, start: limit };
};
```

With no runs in the band, the early return (166–175) becomes

```js
const left = outermost(neighbors, 'left', 0);
const right = outermost(neighbors, 'right', length);
const wallRow = length > SEGMENT_EPSILON ? [{ start: 0, end: length, kind: 'wall' }] : [];
return {
  inner: [left, right].filter(Boolean),
  outer: [left, ...wallRow, right].filter(Boolean),
};
```

With runs, `rangeStart` and `rangeEnd` (179–180) stay exactly as they are — they are now the *runs'* range, and are what the phantoms clamp to:

```js
const left = outermost(neighbors, 'left', rangeStart);
const right = outermost(neighbors, 'right', rangeEnd);
```

`left` is pushed onto `inner` and `outer` before their loops, `right` after them. The loops themselves, `cursor`, `appendGap`, `appendOpenGap`, the corner gaps and the tall ranges are all unchanged.

Result: a base or tall neighbour reaching 30" past the right end of the wall puts a 30" segment at the end of the lower piece row *and* at the end of the lower overall row, so the overall dimension covers it; an upper neighbour does the same in the two rows drawn above the wall; and a phantom no longer measures on a line of its own.

## §6 The phantom row goes away (`canvas/dimensionLayout.js`, `components/ElevationCanvas.jsx`)

`belowRowOffsets` drops its `neighbors` level and returns to four rows plus the label:

```js
export function belowRowOffsets({
  clearances: clearanceLevels = 0,
  pieces: pieceLevels = 0,
  overall: overallLevels = 0,
  openings: openingLevels = 0,
} = {}) {
  const clearances = 20;
  const pieces = clearances + 22 + clearanceLevels * 14;
  const overall = pieces + 22 + pieceLevels * 14;
  const openings = overall + 22 + overallLevels * 14;
  const label = openings + 22 + openingLevels * 14;
  return { clearances, pieces, overall, openings, label };
}
```

**`ElevationCanvas`** loses, all of it added by SPEC-26 §3.1:

- the `neighborProfiles` import (66) — `NeighborProfiles.jsx` still draws the outlines and imports it itself;
- the `seen` / `neighbors` block in the `dimensionChains` memo (217–232) and the `neighbors` key it returns;
- `+ (dimensionChains?.neighbors.length > 0 ? 28 : 0)` in `fitWallToViewport`'s bottom padding (427) and `dimensionChains?.neighbors.length` from its dependency list (432);
- `neighborLevels` (476), the `neighbors` argument to `belowRowOffsets` (502) and the `neighbors` key of `dimensionOffsets` (529);
- the neighbours `DimensionRow` (1642–1650).

`DimensionRow`'s `KIND_COLORS.neighbor` stays — the kind now appears in the four band rows.

`handleRunSegmentClick` (1253–1260) gains a first line so a phantom in the overall row cannot deselect the run:

```js
if (tool !== 'select' || segment.kind !== 'run') return;
```

Dragging is already gated on `segment.kind === 'run'` in `DimensionRow`.

## §7 One card per end (`components/PropertiesPanel.jsx`)

The standalone **Ends** section (1147–1164 heading through the two `EndEditor`s) is deleted, `EndEditor` with it. What it held moves to the top of the matching side card in **Corners & anchors**, renamed **Ends & corners**, so everything about one end of a run is in one place.

`END_TYPES` (111–115) becomes, in this order:

```js
const END_TYPES = [
  ['end_panel', 'End panel'],
  ['none', 'None'],
  ['filler', 'Filler'],
  ['blind', 'Blind corner'],
];
```

Each side card opens with the type select, before the corner label and the anchor field it already shows:

```jsx
<Field label="End">
  <select
    value={run.ends[side].type}
    onChange={(event) => dispatch(setRunEnd({
      ...actionBase,
      side,
      end: { type: event.target.value, width: null },
    }))}
    aria-label={`${side} end type`}
    className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
  >
    {END_TYPES.map(([value, label]) => (
      <option key={value} value={value}>{label}</option>
    ))}
  </select>
</Field>
```

Changing the type always clears the stored width, and the reducer (§1.5) clears the blind width and the end filler the new type cannot carry.

Then, by type, and nothing when the type is `none`:

| field | shown for | value | placeholder | aria-label |
|---|---|---|---|---|
| `Width` | `end_panel` | `run.ends[side].width` | `formatInchesInput(settings.endPanelThickness)` | `` `${side} end width` `` |
| `Width` | `filler`, `blind` | `run.ends[side].width` | `auto` | `` `${side} end width` `` |
| `Blind box` | `blind` | `run.blind?.[side] ?? null` | `none` | `` `${side} blind box width` `` |
| `Ordered width` | `filler`, `blind` | `run.endFiller?.[side]?.width ?? null` | `blind` → `formatInchesInput(settings.blindFillerWidth)`, `filler` → `from layout` | `` `${side} end filler ordered width` `` |
| `Return` | `filler`, `blind` | `run.endFiller?.[side]?.returnDepth ?? null` | `blind` → `0"`, `filler` → `formatInchesInput(settings.fillerReturnDepth)` | `` `${side} end filler return depth` `` |

Every one is an `InchInput` with `allowBlank`, dispatching what it dispatches today: `setRunEnd` for `Width`, `setRunBlind` for `Blind box`, `setRunEndFiller` with `key: 'width'` or `key: 'returnDepth'` for the last two. `Return` also accepts `0`.

The helper lines under them, replacing the two SPEC-25/27 paragraphs:

- for `blind`: *"Box width of the cabinet at this end. The extra runs into the corner. The filler is ordered 6" with no return; the elevation still shows what fits."*
- for `filler`: *"Ordered width and return depth. The elevation still shows what fits."*

The anchor select, the clearance fields, the anchor description and the blind warnings all stay where they are, below the new fields, unchanged.

---

## §8 Tests

Numbering continues from SPEC-27 (last was 220). Expect **510** passing before step 143 — verify with `npm test` before starting, and shift every count below by the difference if it is not 510.

### Step 143 (`store/__tests__/persistence.test.js`, `store/__tests__/elevationSlice.test.js`, `model/__tests__/blind.test.js`)

`blind.test.js` fixture change first, so the rest of that file keeps passing: `leftRun`'s left end and `rightRun`'s right end become `{ type: 'blind', width: 3 }`. Nothing else in tests 208–212 or 220 changes — a blind end splits exactly as a 3" filler did, and `leftRun({ left: null, right: null })` still produces no blind entries.

- **221.** `DEFAULT_SETTINGS.blindFillerWidth` is `6`, and a v3 document whose settings omit it comes out of `normalizeV3Document` carrying `6`. A run with `ends.left = { type: 'blind', width: null }` passes `isElevationDocument`; `{ type: 'corner', width: null }` fails. `endFiller: { left: { returnDepth: 0 }, right: null }` round-trips; `{ left: { width: 0 } }` and `{ left: { returnDepth: -1 } }` each fail.
- **222.** The migration. A v3 document whose run has `ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } }` and `blind: { left: 42, right: null }` comes out of `normalizeV3Document` with `ends.left.type === 'blind'`, `ends.left.width === null` and `ends.right.type === 'filler'`. A run with no `blind` key is returned with both ends untouched.
- **223.** `setRunEnd({ …, side: 'left', end: { type: 'filler', width: null } })` on a run carrying `blind: { left: 42, right: 30 }` and `endFiller: { left: { width: 6 }, right: null }` leaves `blind` `{ left: null, right: 30 }` and `endFiller` `{ left: { width: 6 }, right: null }`; the same call with `end: { type: 'end_panel', width: null }` leaves `endFiller` `{ left: null, right: null }`. `setRunEndFiller({ …, side: 'left', key: 'returnDepth', value: 0 })` gives `endFiller.left` `{ width: null, returnDepth: 0 }`; `value: -1` clears it back to `null`.

Expect 513 passing.

### Step 144 (`model/__tests__/planPieces.test.js`, `model/__tests__/blind.test.js`)

Add to `planPieces.test.js` a `blindFixture` built like `fixture` but with the run `base('P', { x: 12, width: 24, ends: { left: { type: 'blind', width: 3 }, right: { type: 'none', width: null } }, autoCount: false, items: [{ id: 'w1', kind: 'cabinet', width: 21 }], blind: { left: 42, right: null } })` on the same 120" wall. Its pieces are `P:left` at 12–15 and `w1` at 15–36.

- **224.** On `blindFixture`, with no `endFiller` on the run: the one `kind: 'filler'` face entry is `{ key: 'P:left', kind: 'filler', start: 9, end: 15, back: 24.0625, front: 24.875 }` — 6" wide, grown into the corner — and `returns` is `[]`. With `endFiller: { left: { returnDepth: 2.5 }, right: null }` on the same run, `returns` is `[{ key: 'P:left:right', start: 14.25, end: 15, back: 21.5625, front: 24.0625 }]` and the filler face is still 9–15. With `endFiller: { left: { width: 3 }, right: null }`, the filler face is `start: 12, end: 15`.
- **225.** A covered blind with no ordered width still orders 6. On test 220's covered fixture, with `coveredRun.endFiller` left unset, `blindPartWidths(...).get('L:left')` is `6`. On its exposed fixture with `endFiller` unset it is still `15`.

Expect 515 passing.

### Step 145 (`model/__tests__/planPieces.test.js`)

Test 217 loses its `result.box` and `result.divisions` assertions and gains `expect(result.boxes).toEqual([{ key: 'c1', start: 3, end: 30, back: 0, front: 24 }])`. Test 218 loses its `result.box` assertion and gains the same one. Test 219 is untouched.

- **226.** Boxes and an end panel. On a fixture whose run is `base('P', { x: 0, width: 30, ends: { left: { type: 'end_panel', width: null }, right: { type: 'none', width: null } }, autoCount: false, items: [{ id: 'c1', kind: 'cabinet', width: 29.25 }] })`:
  - `boxes` equals `[{ key: 'c1', start: 0.75, end: 30, back: 0, front: 24 }]`;
  - the one `kind: 'end_panel'` face entry equals `{ key: 'P:left', kind: 'end_panel', start: 0, end: 0.75, back: 0, front: 24.875 }`;
  - every `kind: 'face'` entry has `back` `24.0625` and `front` `24.875`;
  - `span` equals `{ start: 0, end: 30 }`.
- **227.** A blind box is one box at its ordered width. On step 144's `blindFixture`:
  - `boxes` equals `[{ key: 'w1', start: -6, end: 36, back: 0, front: 24 }]` — 42" wide, reaching 6" past the left end of the run at 12;
  - `span` equals `{ start: -6, end: 36 }`;
  - no entry in `boxes` has `key` `'P:left'`.

On a two-cabinet run — `fixture({ items: [{ id: 'c1', kind: 'cabinet', width: 13.5 }, { id: 'c2', kind: 'cabinet', width: 13.5 }] })` — `boxes` equals `[{ key: 'c1', start: 3, end: 16.5, back: 0, front: 24 }, { key: 'c2', start: 16.5, end: 30, back: 0, front: 24 }]`.

Expect 517 passing.

### Step 146

No tests. Drawing, checked by hand.

### Step 147 (`model/__tests__/wallExtent.test.js`, `model/__tests__/dimensions.test.js`)

Test 189's two expected entries gain `cabinetTypeId: CABINET_TYPE_IDS.BASE`; test 213's gains `cabinetTypeId: CABINET_TYPE_IDS.UPPER`. Test 190's `[]` results and test 191 do not change.

`dimensions.test.js` gains `straightRoom`, `view`, `run`, `base` and `makeWall` copied from `wallExtent.test.js` — wall A `(0,0)→(120,0)` joined end-to-start to wall B `(120,0)→(240,0)`, both 96" tall.

- **228.** A base neighbour lands in the lower rows. With `straightRoom({ wallA: { runs: [base('A1', { x: 90 })] }, wallB: { runs: [base('B1')] } })`:
  - on wall A, `horizontalChains(room, view(room, 'A'), 'lower', DEFAULT_SETTINGS)` has `inner.at(-1)` and `outer.at(-1)` both equal to `{ start: 120, end: 150, kind: 'neighbor', wallId: 'B', neighborRunId: 'B1' }`, and no segment in either chain has a `runId` of `'B1'`;
  - on wall B, `inner[0]` and `outer[0]` both equal `{ start: -30, end: 0, kind: 'neighbor', wallId: 'A', neighborRunId: 'A1' }`;
  - both of wall A's chains are contiguous from 0 to 150 and both of wall B's from −30 to 120.
- **229.** An upper neighbour lands in the upper rows. With `straightRoom({ wallA: { runs: [base('A1', { x: 90 })] }, wallB: { runs: [run('U1', CABINET_TYPE_IDS.UPPER, 12, { x: 0, width: 30, z: 54, height: 36, heightMode: 'auto' })] } })`, on wall A:
  - `horizontalChains(room, view(room, 'A'), 'lower', DEFAULT_SETTINGS)` has no segment of kind `'neighbor'` in either chain, and both chains end at 120;
  - `horizontalChains(room, view(room, 'A'), 'upper', DEFAULT_SETTINGS)` equals
    `{ inner: [{ start: 120, end: 150, kind: 'neighbor', wallId: 'B', neighborRunId: 'U1' }], outer: [{ start: 0, end: 120, kind: 'wall' }, { start: 120, end: 150, kind: 'neighbor', wallId: 'B', neighborRunId: 'U1' }] }`
    — wall A has no upper run of its own.

Expect 519 passing.

### Step 148 (`canvas/__tests__/dimensionLayout.test.js`)

The three `belowRowOffsets` cases lose their `neighbors` key and their `label` moves up one row:

- `belowRowOffsets()` → `{ clearances: 20, pieces: 42, overall: 64, openings: 86, label: 108 }`
- `belowRowOffsets({ clearances: 2 })` → `{ clearances: 20, pieces: 70, overall: 92, openings: 114, label: 136 }`
- `belowRowOffsets({ pieces: 1, openings: 2 })` → `{ clearances: 20, pieces: 42, overall: 78, openings: 100, label: 150 }`

Expect 519 passing.

### Step 149

No tests. UI, checked by hand.
