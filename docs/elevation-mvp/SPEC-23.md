# Elevation Lab — SPEC-23 (part numbers)

Steps 117–123. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-22 must be done first.

Every part the shop builds gets a running number inside its room, drawn on the elevation and carried into the future report.

## After this SPEC you can

- Set a starting number on each room. The first part on the first wall takes it, and every part after counts up by one.
- Read a number on every cabinet, filler and end panel on the elevation — including the narrow ones whose width never fits on the face — sitting just above the width text, in a pill that stands out.
- Give one part a number of your own. Nothing else in the room takes that number, and the numbers that follow close up around it.
- See the toe kick, top mold and crown carry their own numbers, one per profile per room, badged once per elevation on the strip they name.
- Turn the whole lot on and off from the elevation toolbar.

## Not in this SPEC

- The report itself. This produces numbers and a room-wide ordered part list; nothing consumes it yet.
- Furniture base. `PART_MOLDINGS` is the list to extend when it lands; the ordering and badge code needs no other change.
- More than one crown / top mold / furniture base profile per room. One profile per kind, one number per kind. Logged in `TODO.md`.
- Soffit molding as its own numbered part. A soffit changes which molding a run carries (`runMolding`), and that feeds molding presence, but the soffit itself is not a numbered part. Logged in `TODO.md`.
- Numbers in plan, in the JSON panel, or on face outlines. Faces are part of their cabinet and never numbered.
- Pruning stale overrides. An override whose part no longer exists is ignored and reserves nothing; it is only removed when the user clears it.

---

## §1 Shape: what a room stores (`store/persistence.js`, `store/elevationSlice.js`, `model/constants.js`)

Three new persisted fields, all optional on read so existing documents load unchanged.

| Field | Where | Type | Default |
|---|---|---|---|
| `partNumberStart` | room | integer ≥ 1 | `1` |
| `partNumberOverrides` | room | `{ [partKey]: integer ≥ 1 }` | `{}` |
| `showPartNumbers` | settings | boolean | `true` |

**Part keys** are strings, unique inside one room:

| Part | Key |
|---|---|
| cabinet or interior filler item | the item's id — which is also its piece id |
| a run's left / right end piece | `` `${run.id}:left` `` / `` `${run.id}:right` `` — also the piece id |
| wall end panel | `` `${wall.id}:endPanel:${endpoint}` `` |
| molding | `molding:toeKick`, `molding:topMold`, `molding:crown` |

So for anything inside a run, `part.key === piece.id`, and the badge layer looks a number up by piece id with no extra mapping.

The override lives on the room, not on the part, because `setRunEnd` rewrites `run.ends[side]` to `{ type, width }` and `setWallEndPanel` rewrites the panel to `{ width }` — a field parked on either would be silently dropped the next time its type changed.

**`constants.js`** — `DEFAULT_SETTINGS` gains `showPartNumbers: true`. It is not a number, so `V2_NUMERIC_SETTING_KEYS` is unaffected; add `'showPartNumbers'` to `V2_DEFAULTED_SETTING_KEYS` in `persistence.js` so older documents pick the default up.

**`persistence.js`:**

```js
function isPartNumberOverrides(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value).every((number) => Number.isInteger(number) && number > 0);
}
```

- `isRoom` gains
  `&& (room.partNumberStart === undefined || (Number.isInteger(room.partNumberStart) && room.partNumberStart > 0))`
  `&& (room.partNumberOverrides === undefined || isPartNumberOverrides(room.partNumberOverrides))`.
- `isSettings` gains `&& (settings.showPartNumbers === undefined || typeof settings.showPartNumbers === 'boolean')`.
- `normalizeV3Document`'s room mapper fills `partNumberStart: room.partNumberStart ?? 1` and `partNumberOverrides: room.partNumberOverrides ?? {}`.
- The v2 → v3 room migration sets the same two fields on each room it builds.

**`elevationSlice.js`:**

- `createRoom` returns `partNumberStart: 1, partNumberOverrides: {}` alongside `profile`, `wallOrder`, `walls`.
- Two reducers, after `useAutoHeightsForRoom`. Neither changes geometry, so neither calls `syncRoomAt`:

```js
setRoomPartNumberStart(state, action) {
  const roomIndex = roomIndexFor(state, action.payload.roomId);
  if (roomIndex === -1) return;
  const value = action.payload.value ?? action.payload.start;
  state.rooms[roomIndex].partNumberStart = Number.isInteger(value) && value > 0 ? value : 1;
},
setPartNumberOverride(state, action) {
  const roomIndex = roomIndexFor(state, action.payload.roomId);
  const { key } = action.payload;
  if (roomIndex === -1 || typeof key !== 'string' || key === '') return;
  const room = state.rooms[roomIndex];
  room.partNumberOverrides ??= {};
  const number = action.payload.number ?? action.payload.value ?? null;
  if (number === null) delete room.partNumberOverrides[key];
  else if (Number.isInteger(number) && number > 0) room.partNumberOverrides[key] = number;
},
```

Both are added to the exported action list.

## §2 The ordered part list and the numbers (`model/partNumbers.js`, new, pure)

```js
export const PART_MOLDINGS = ['toeKick', 'topMold', 'crown'];
export const MOLDING_LABELS = { toeKick: 'TK', topMold: 'TM', crown: 'CR' };

export function moldingPartKey(molding) { return `molding:${molding}`; }
export function wallEndPanelPartKey(wallId, endpoint) { return `${wallId}:endPanel:${endpoint}`; }

partNumbers(room, settings) → { parts, byKey, overrideKeys, warnings }
```

- `parts` is the ordered list. Each entry is
  `{ key, number, kind, wallId, side, runId, pieceId, molding, width }` with
  `kind` one of `'cabinet' | 'filler' | 'end_panel' | 'wall_end_panel' | 'molding'`;
  `wallId` null for a molding; `side` (`'front' | 'back'`) null for a wall end panel and a molding;
  `runId` / `pieceId` null outside a run; `molding` null outside a molding; `width` in inches, null for a molding.
- `byKey` is a `Map` from key to number.
- `overrideKeys` is a `Set` of the keys whose number came from an override that matched a real part.
- `warnings` is `[{ code: 'duplicate-part-number', number, keys }]`, one entry per number claimed by two or more matched overrides, mirroring `wallNumberWarnings`.

### §2.1 The walk

**Walls**, in the order of the numbers `wallNumbers(room)` gives them, ascending. That map already puts an overridden wall where its number says and fills the rest in `wallOrder`, so a wall number override reorders the part numbers with it.

**Inside one wall:**

1. The wall end panel on the **left** of the front frame, if `wallEndPanels(room, wall, settings)` produced one there. Each entry's `front.side` says `'left'` or `'right'`; there is one entry per free endpoint that carries a panel, and it is one part regardless of how many elevations draw it.
2. `side` of `['front', 'back']`, with `view = wallSideView(wall, side)`:
   - the **lower** band — runs whose `cabinetTypeId` is `BASE` or `TALL` — then the **upper** band — `UPPER`. Same split as `runsForBand` in `dimensions.js`.
   - runs within a band sorted by `run.x` ascending, ties broken by `run.id`. Base and tall are ordered purely by position; they do not group by type.
   - pieces within a run in `splitRun` order, which is already left end → items left to right → right end. Build the layout with exactly the options `horizontalChains` uses:

     ```js
     splitRun(run, settings, {
       endMinWidths: endMinWidthsForRun(room, view, run, settings),
       endCornerAngles: endCornerAnglesForRun(room, view, run),
       pinTargets: pinTargetsForRun(run, view, wallLength(view), settings),
     })
     ```

   - a piece is a part when its `kind` is `'cabinet'`, `'filler'` or `'end_panel'` **and** `piece.width > 1e-6`. An end of type `'none'` never becomes a piece; a flex filler squeezed to zero by an over-constrained run does, and takes no number.
3. The wall end panel on the **right** of the front frame, if there is one.

**Moldings**, after every wall, in `PART_MOLDINGS` order, each included only when the room actually carries it. For each wall, with `profile = resolveProfile(settings, room, wall)`:

- `toeKick` — any run whose `cabinetTypeId` is `BASE` or `TALL` and whose `run.overrides?.toeKickHeight ?? profile.toeKickHeight` is greater than zero.
- `topMold` — any run with `heightMode === 'auto'`, type `UPPER` or `TALL`, and `runMolding(wall, run, profile) !== 'none'`.
- `crown` — the same run test with `runMolding(wall, run, profile) === 'crown'`.

These are the same conditions `RunGroup` already draws by, so a strip on screen always has a number and a number always has a strip.

### §2.2 Assigning the numbers

Exactly `wallNumbers`' two passes:

```js
const start = Number.isInteger(room?.partNumberStart) && room.partNumberStart > 0
  ? room.partNumberStart
  : 1;
const overrides = room?.partNumberOverrides ?? {};
const byKey = new Map();
const taken = new Set();
for (const part of ordered) {
  const override = overrides[part.key];
  if (!Number.isInteger(override) || override <= 0) continue;
  byKey.set(part.key, override);
  taken.add(override);
}
let next = start;
for (const part of ordered) {
  if (byKey.has(part.key)) continue;
  while (taken.has(next)) next += 1;
  byKey.set(part.key, next);
  taken.add(next);
  next += 1;
}
```

An override below the start is honoured and simply reserves its number. An override on a key with no matching part reserves nothing. Two overrides on the same number both keep it and raise one warning.

### §2.3 Molding badge placement

```js
wallMoldingBadges(room, wall, settings, byKey)
  → [{ molding, key, number, label, x, z, width, height }]
```

`wall` is an elevation side view. At most one entry per molding, on the **leftmost** run of that view carrying it — one badge per molding per elevation, not one per run. Each rect is the one `RunGroup` already draws, with `profile = resolveProfile(settings, room, wall)`, `boxTop = run.z + run.height`, and `toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight`:

| molding | rect |
|---|---|
| `toeKick` | `{ x: run.x + Math.min(3, run.width / 2), z: 0, width: Math.max(0, run.width - 6), height: toeKickHeight }` |
| `topMold` | `{ x: run.x, z: boxTop, width: run.width, height: profile.topMoldHeight }` |
| `crown` | `{ x: run.x, z: boxTop + profile.crownStackHeight - profile.crownHeight, width: run.width, height: profile.crownHeight }` |

`label` comes from `MOLDING_LABELS`. An entry is dropped when no run on this view carries that molding, or when `byKey` has no number for its key.

**`model/index.js`** exports `MOLDING_LABELS`, `PART_MOLDINGS`, `moldingPartKey`, `partNumbers`, `wallEndPanelPartKey` and `wallMoldingBadges`.

## §3 Badge layout (`canvas/partNumberLayout.js`, new, pure)

A badge sits centred on its piece, just above the width text `PieceRect` draws in the middle of the face. A badge too wide for its piece — every end panel, most fillers — lifts to a clear level with a leader down to where it belongs.

```js
export const PART_BADGE_FONT_SIZE = 15;
export const PART_BADGE_HEIGHT = 20;
/** px above the piece's vertical centre where a badge rests, clear of the width text. */
export const PART_BADGE_LIFT = 20;
/** px between lift levels. */
export const PART_BADGE_STEP = 23;

export function partBadgeWidth(text, { charWidth = 9, padding = 7, minWidth = 22 } = {}) {
  return Math.max(minWidth, text.length * charWidth + 2 * padding);
}

/** How many lift levels fit above the resting badge inside a box this tall on screen. */
export function partBadgeLevels(runHeightPx) {
  return Math.max(0, Math.min(3, Math.floor(
    (runHeightPx / 2 - PART_BADGE_LIFT - PART_BADGE_HEIGHT / 2 - 2) / PART_BADGE_STEP,
  )));
}

/**
 * Lay out one run's badges in screen space.
 * entries: [{ key, text, left, right }] in left-to-right order.
 */
export function layoutPartBadges(entries, { maxLevels = 3, gap = 3 } = {}) {
  const occupied = Array.from({ length: Math.max(0, maxLevels) }, () => -Infinity);
  return entries.map((entry) => {
    const width = partBadgeWidth(entry.text);
    const center = (entry.left + entry.right) / 2;
    const fits = width <= (entry.right - entry.left) - 2;
    if (fits || occupied.length === 0) {
      return { ...entry, width, center, level: 0, lifted: !fits };
    }
    const span = { left: center - width / 2, right: center + width / 2 };
    let index = occupied.findIndex((right) => span.left >= right + gap);
    if (index === -1) index = 0;
    occupied[index] = span.right;
    return { ...entry, width, center, level: index + 1, lifted: true };
  });
}
```

A badge that fits stays at level 0 inside its own piece, so it can never collide with a lifted one. Lifted badges only have to clear each other, which the single left-to-right sweep does. When every level is full the badge reuses level 1 and overlaps — at that zoom the numbers are unreadable anyway and the toggle exists.

## §4 Drawing the badges (`components/PartNumberBadges.jsx` new, `RunGroup`, `WallEndPanelShapes`)

**`PartNumberBadges`** takes `{ pieces, numbers, overrideKeys, transform, lift = 0 }` and draws one pill per piece that `numbers` has a key for. It is `listening={false}` throughout.

- Geometry comes from `wallRectToScreen(piece, transform)` over `result.pieces` — the **undropped** pieces, not `drawnPieces`. A style drop stretches fillers and panels downward, and using the dropped rects would step their badges out of line with the cabinets beside them.
- `entries` are `{ key: piece.id, text: String(numbers.get(piece.id)), left: rect.x, right: rect.x + rect.width }`, in piece order, through `layoutPartBadges(entries, { maxLevels: partBadgeLevels(rect.height) })` using the first piece's screen height.
- The resting centre is `restY = rect.y + rect.height / 2 - PART_BADGE_LIFT`; a badge at level `L` draws at `restY - (L + lift) * PART_BADGE_STEP`.
- Each badge is a `Rect` — `x: center - width / 2`, `y: y - PART_BADGE_HEIGHT / 2`, `height: PART_BADGE_HEIGHT`, `cornerRadius: PART_BADGE_HEIGHT / 2`, `fill: '#0f172a'`, `strokeWidth: 1.25`, `stroke` `#facc15` when `overrideKeys.has(key)` else `#f8fafc` — plus a centred `Text` at `fontSize: PART_BADGE_FONT_SIZE`, `fontStyle: 'bold'`, `fill: '#f8fafc'`.
- A badge with `level + lift > 0` gets a leader: a `Line` from `(center, y + PART_BADGE_HEIGHT / 2)` to `(center, restY)`, `stroke="#94a3b8"`, `strokeWidth={0.75}`.

**`RunGroup`** takes a new optional prop `partNumbers` (`{ byKey, overrideKeys }` or `null`) and renders `<PartNumberBadges pieces={result.pieces} numbers={partNumbers.byKey} overrideKeys={partNumbers.overrideKeys} transform={transform} />` after the `PieceRect` list and after `FaceOutlines`, when the prop is set. Nothing else in the file changes.

**`WallEndPanelShapes`** takes the same optional `partNumbers` prop and draws one badge per panel through the same component, with `lift={1}` and a single-entry list built from the panel's screen rect and `wallEndPanelPartKey(wall.id, panel.endpoint)`. The fixed lift puts it one level above the run end-filler badge it stands next to, which is the only badge it could ever overlap.

## §5 Molding badges (`components/MoldingBadges.jsx`, new)

Takes `{ room, wall, settings, partNumbers, transform }` and draws one labelled pill per `wallMoldingBadges` entry, centred on that entry's rect:

- text is `` `${badge.label} ${badge.number}` `` — "TK 41", "TM 42", "CR 43" — so a strip says which molding it is as well as which part.
- same pill as §4 with `fill: '#1e293b'` and `stroke: '#cbd5e1'`, sized by `partBadgeWidth(text)`, centred on `wallRectToScreen(badge, transform)`. No lift, no leader; it draws over the strip even when the strip is thinner than the pill.
- `listening={false}`.

It renders in `ElevationCanvas`'s non-listening `Layer`, after `WallEndPanelShapes`.

## §6 Wiring (`components/ElevationCanvas.jsx`, `components/ElevationToolbar.jsx`)

**`ElevationCanvas`** gains one memo beside `diagnostics`:

```js
const partNumbering = useMemo(
  () => (room && settings.showPartNumbers ? partNumbers(room, settings) : null),
  [room, settings],
);
```

and passes `partNumbers={partNumbering}` to the live `RunGroup` (not the stretch preview), to `WallEndPanelShapes`, and to the new `MoldingBadges`. One walk of the room per render, shared by every run — a run must never compute this for itself.

**`ElevationToolbar`** gains one button in the `view === 'elevation'` group, styled like the plan view's `Ortho` button:

```jsx
<button
  type="button"
  aria-pressed={settings.showPartNumbers}
  onClick={() => dispatch(updateSettings({ showPartNumbers: !settings.showPartNumbers }))}
  className={...}
>
  Part #
</button>
```

## §7 Editing the numbers (`components/RoomPartNumbersPanel.jsx` new, `components/properties/PartNumberField.jsx` new, `PropertiesPanel`, `ElevationLab`)

**`RoomPartNumbersPanel`** — a "Part numbers" section in the left sidebar, rendered by `ElevationLab` directly after `RoomHeightsPanel`. One `type="number"` input (`min="1"`, `step="1"`) bound to `room.partNumberStart`, dispatching `setRoomPartNumberStart({ roomId, value })`; an empty field commits `1`. Below it, the count of numbered parts, and — when `partNumbers(room, settings).warnings` is non-empty — one amber line per duplicate: `Number N is used by M parts.`

**`PartNumberField`** — takes `{ roomId, partKey, autoNumber, override, duplicate }` and renders a `Field label="Part number"` holding a `type="number"` input whose `value` is `override ?? ''` and whose `placeholder` is `String(autoNumber ?? '')`, dispatching `setPartNumberOverride({ roomId, key: partKey, number })` with `null` on an empty field. Amber border when `duplicate`. It is the wall `Number` field in `WallHeightProperties`, one level down.

**`PropertiesPanel`** — `PieceProperties` takes a new `room` prop, computes `partNumbers(room, settings)` in a memo, and renders `<PartNumberField …/>` above whichever of `EndProperties`, `InteriorFillerProperties` or `CabinetProperties` it was going to render, with `partKey = selectionContext.piece.id`. The three editors themselves are untouched, so the field appears once for every kind of selected piece. The panel's render call passes `room={room}`.

---

## §8 Tests

Numbering continues from SPEC-22 (last was 193). Expect 483 passing before step 117.

### Step 117 (`store/__tests__/persistence.test.js`)

- **194.** A valid v3 document whose room omits `partNumberStart` and `partNumberOverrides` still passes `isElevationDocument`; `normalizeV3Document` fills them with `1` and `{}`; a room carrying `partNumberStart: 100` and `partNumberOverrides: { 'piece-1': 7 }` round-trips unchanged; `partNumberStart: 0`, `partNumberStart: 1.5` and `partNumberOverrides: { 'piece-1': 0 }` each fail `isElevationDocument`.
- **195.** `DEFAULT_SETTINGS.showPartNumbers` is `true`; a v3 document whose settings omit it passes `isElevationDocument` and comes out of `normalizeV3Document` with `showPartNumbers: true`; one carrying `false` keeps `false`; one carrying `'yes'` fails.

Expect 485 passing.

### Step 118 (`store/__tests__/elevationSlice.test.js`)

- **196.** After `addRoom`, the new room has `partNumberStart: 1` and `partNumberOverrides: {}`. `setRoomPartNumberStart({ roomId, value: 100 })` sets `100`; `value: 0` and `value: 2.5` each leave it at `1`.
- **197.** `setPartNumberOverride({ roomId, key: 'piece-1', number: 12 })` sets `{ 'piece-1': 12 }`; a second call with `number: null` removes the key and leaves `{}`; `number: 0` and a missing `key` change nothing.

Expect 487 passing.

### Step 119 (new `src/elevation/model/__tests__/partNumbers.test.js`)

Copy `makeWall` and the `run` / `base` helpers from `src/elevation/model/__tests__/wallExtent.test.js`. Every run below has `autoCount: false`, `heightMode: 'manual'` unless stated, and `anchors: { left: false, right: false }`, so `syncRoom` and `syncAutoItems` leave the layouts exactly as written.

```js
const partRoom = (overrides = {}) => syncRoom({
  id: 'P',
  name: 'Room P',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  partNumberStart: 1,
  partNumberOverrides: {},
  wallOrder: ['A', 'B'],
  walls: [
    makeWall('A', 0, 0, 120, 0, {
      connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
      runs: [aBase(), aUpper()],
    }),
    makeWall('B', 120, 0, 120, 96, {
      connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
      runs: [bBase()],
    }),
  ],
  ...overrides,
}, DEFAULT_SETTINGS);
```

- `aBase()` — `BASE`, `x: 0`, `width: 60`, `z: 4`, `height: 30.5`, `depth: 24`, ends `{ left: { type: 'end_panel', width: 0.75 }, right: { type: 'filler', width: 3 } }`, items `[{ id: 'a1', kind: 'cabinet', width: 28.125 }, { id: 'a2', kind: 'cabinet', width: 28.125 }]`, id `A-base`.
- `aUpper()` — `UPPER`, `x: 0`, `width: 48`, `z: 54`, `height: 36`, `depth: 12`, ends both `{ type: 'none', width: null }`, items `[{ id: 'a3', kind: 'cabinet', width: 48 }]`, id `A-upper`.
- `bBase()` — `BASE`, `x: 0`, `width: 30`, `z: 4`, `height: 30.5`, `depth: 24`, ends both `{ type: 'filler', width: 1.5 }`, items `[{ id: 'b1', kind: 'cabinet', width: 27 }]`, id `B-base`.

**198.** `partNumbers(partRoom(), DEFAULT_SETTINGS)`:

- `parts.map(({ key }) => key)` is
  `['A-base:left', 'a1', 'a2', 'A-base:right', 'a3', 'B-base:left', 'b1', 'B-base:right', 'molding:toeKick']`;
- `parts.map(({ number }) => number)` is `[1, 2, 3, 4, 5, 6, 7, 8, 9]`;
- `parts.map(({ kind }) => kind)` is
  `['end_panel', 'cabinet', 'cabinet', 'filler', 'cabinet', 'filler', 'cabinet', 'filler', 'molding']`;
- `parts[0]` matches `{ wallId: 'A', side: 'front', runId: 'A-base', pieceId: 'A-base:left', molding: null, width: 0.75 }`;
- `parts[8]` matches `{ wallId: null, side: null, runId: null, pieceId: null, molding: 'toeKick', width: null }`;
- `byKey.get('b1')` is `7`; `overrideKeys.size` is `0`; `warnings` is `[]`.

Only the toe kick appears: every run is `heightMode: 'manual'`, so no run draws top mold or crown.

**199.** `partNumbers(partRoom({ partNumberStart: 101 }), DEFAULT_SETTINGS).parts.map(({ number }) => number)` is `[101, 102, 103, 104, 105, 106, 107, 108, 109]`.

**200.** Overrides:

- with `partNumberOverrides: { a1: 5, 'A-base:right': 1 }`, the numbers in part order are `[2, 5, 3, 1, 4, 6, 7, 8, 9]`, `overrideKeys` equals `new Set(['a1', 'A-base:right'])`, and `warnings` is `[]`;
- with `partNumberOverrides: { a1: 5, a2: 5 }`, `byKey.get('a1')` and `byKey.get('a2')` are both `5`, and `warnings` equals `[{ code: 'duplicate-part-number', number: 5, keys: ['a1', 'a2'] }]`;
- with `partNumberOverrides: { 'no-such-part': 3 }`, the numbers are `[1, 2, 3, 4, 5, 6, 7, 8, 9]` and `overrideKeys.size` is `0` — an override with no part reserves nothing.

**201.** A wall number override reorders the walk. With wall `B` given `numberOverride: 1`, `parts.map(({ key }) => key)` is
`['B-base:left', 'b1', 'B-base:right', 'A-base:left', 'a1', 'a2', 'A-base:right', 'a3', 'molding:toeKick']`
and the numbers are `[1 … 9]`.

**202.** Moldings and their badges. The same room with `A-upper`'s `heightMode` set to `'auto'` (so `syncRoom` resolves it to `z: 54`, `height: 36`):

- the last three keys are `['molding:toeKick', 'molding:topMold', 'molding:crown']` with numbers `9`, `10`, `11`;
- `wallMoldingBadges(room, wallSideView(wallA, 'front'), DEFAULT_SETTINGS, byKey)` equals

  ```js
  [
    { molding: 'toeKick', key: 'molding:toeKick', number: 9, label: 'TK', x: 3, z: 0, width: 54, height: 4 },
    { molding: 'topMold', key: 'molding:topMold', number: 10, label: 'TM', x: 0, z: 90, width: 48, height: 3 },
    { molding: 'crown', key: 'molding:crown', number: 11, label: 'CR', x: 0, z: 91.5, width: 48, height: 4.5 },
  ]
  ```

- `wallMoldingBadges(room, wallSideView(wallB, 'front'), DEFAULT_SETTINGS, byKey)` equals
  `[{ molding: 'toeKick', key: 'molding:toeKick', number: 9, label: 'TK', x: 3, z: 0, width: 24, height: 4 }]`.

**203.** Wall end panels bracket their wall. A one-wall room `W`:

```js
syncRoom({
  id: 'E', name: 'Room E', profile: { ...DEFAULT_SETTINGS.defaultProfile },
  partNumberStart: 1, partNumberOverrides: {}, wallOrder: ['W'],
  walls: [makeWall('W', 0, 0, 120, 0, {
    endPanels: { start: { width: 0.75 }, end: { width: 0.75 } },
    runs: [wBase()],
  })],
}, DEFAULT_SETTINGS)
```

with `wBase()` — `BASE`, id `W-base`, `x: 0`, `width: 120`, `z: 4`, `height: 30.5`, `depth: 24`, `anchors: { left: true, right: true }`, ends both `{ type: 'filler', width: 1.5 }`, items `[{ id: 'w1', kind: 'cabinet', width: 120 }]`. `syncRoom` replaces both anchored ends with `{ type: 'none' }` because the wall carries a panel there, which is why `w1` is the full 120.

`parts.map(({ key }) => key)` is
`['W:endPanel:start', 'w1', 'W:endPanel:end', 'molding:toeKick']`, numbers `[1, 2, 3, 4]`, and
`parts[0]` matches `{ kind: 'wall_end_panel', wallId: 'W', side: null, runId: null, pieceId: null, width: 0.75 }`.

Wall `W` runs left to right from its `start`, so `start` is the left-hand panel.

Expect 493 passing.

### Step 120 (new `src/elevation/canvas/__tests__/partNumberLayout.test.js`)

**204.** With

```js
const entries = [
  { key: 'wide', text: '1', left: 0, right: 100 },
  { key: 'thin-a', text: '2', left: 100, right: 108 },
  { key: 'thin-b', text: '3', left: 108, right: 116 },
  { key: 'thin-c', text: '4', left: 116, right: 124 },
];
```

- `partBadgeWidth('1')` is `23` and `partBadgeWidth('123')` is `41`;
- `layoutPartBadges(entries).map(({ level }) => level)` is `[0, 1, 2, 3]` and `.map(({ lifted }) => lifted)` is `[false, true, true, true]`;
- the first entry's `center` is `50` and its `width` is `23`;
- `layoutPartBadges(entries, { maxLevels: 1 }).map(({ level }) => level)` is `[0, 1, 1, 1]`;
- `layoutPartBadges(entries, { maxLevels: 0 }).map(({ level }) => level)` is `[0, 0, 0, 0]` with `lifted` `[false, true, true, true]`;
- `partBadgeLevels(305)` is `3`, `partBadgeLevels(150)` is `1`, `partBadgeLevels(100)` is `0`, `partBadgeLevels(0)` is `0`.

Expect 494 passing.

### Steps 121–123

No tests. UI, checked by hand.
