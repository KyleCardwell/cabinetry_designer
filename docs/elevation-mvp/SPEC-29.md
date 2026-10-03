# Elevation Lab — SPEC-29 (the blind corner panel)

Steps 150–152. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-28 must be done first.

One correction, in three places. SPEC-25 §2.4 sized a blind corner's panel from **where the run happened to land** — `piece.x - cornerX`. That is right only by accident: it agrees with the real condition when the corner clearance is auto, and is wrong whenever the clearance is custom, the corner is angled, or there is no corner at all. On a wall with no connections it invented a panel out of the gap in front of the run.

A panel exists because something dies into the corner. So it is sized from the thing that dies in: **the deepest neighbouring run that overlaps the blind run vertically, plus the filler.** Nothing dies in, no panel.

And it gets drawn. Until now the panel was a part width and a sub-label; nothing on either view showed a board there. In plan it is a face-plane board reaching from the wall to the filler's right edge, overhanging the blind box's outer edge. In elevation it is a rectangle across the same span, full run height, sitting behind the hatched neighbour returns.

## After this SPEC you can

- See the panel on both views: in plan a board at the face plane from the corner out to the filler, overhanging the blind box and touching the wall; in elevation a rectangle across that same span, behind the neighbour shadows.
- Trust its width. A tall blind with a 24" base and a 12" upper dying into it gets a panel as wide as the base plus the filler, because the base is the deeper of the two runs that reach it.
- Have an upper that is hung low enough to meet a base counted in, and one that isn't left out — vertical overlap decides, not the band.
- Get no panel at all on a blind with nothing dying into it, and a 6" ordered filler instead.

## Not in this SPEC

- Holding the neighbouring run back by the panel's thickness. The neighbour's own corner clearance does not know the panel is there, so in plan the panel and the neighbour run overlap by its thickness, the way a blind box already overlaps its neighbour. Same reasoning as SPEC-25: the corner is drawn, not modelled.
- Any change to `cornerReserveParts`. Corner clearance still uses `bandsCompatible`; the panel uses vertical overlap. They agree on every ordinary layout, and where they disagree the panel is the one that has to match what is built.
- Reconciling a custom corner clearance with the panel. With a custom clearance the panel's right edge and the cabinet's left edge no longer coincide, on purpose — the panel is sized by the cabinetry, not by where the run drifted. No warning for it yet.
- The panel's z extent. It is the run's full height, drawn behind the neighbour returns, even where a neighbour covers it. Splitting it into only the exposed bands would draw a board that isn't a board.
- Two blinds meeting in one corner. Still deferred.

---

## §1 The panel rule (`model/blind.js`)

### §1.1 One new export

```js
/** How far the deepest overlapping neighbour reaches along this wall at a corner. */
export function panelDepth(room, wall, run, side, settings) → number
```

Zero when the corner is not `inside`, when the neighbouring wall is missing, when the corner is degenerate (`|sin(angle)| < 1e-9`), or when nothing dying into it overlaps the run vertically.

Otherwise it is the largest `frontDepth(neighborRun, settings) / sine` over the neighbouring runs that

1. are on `corner.neighborWallSide`,
2. pass `anchoredToCorner(neighborRun.anchors?.[corner.neighborSide], corner)`,
3. have `height > 0`, and
4. **overlap the run vertically** — `Math.min(nr.z + nr.height, run.z + run.height) - Math.max(nr.z, run.z) > 1e-6`.

Rules 1–3 are exactly `coveredRanges`' filter; factor them into one private helper that both use, returning the corner and the matching runs, so the two can never drift apart. Rule 4 is the new one, and it replaces any notion of band: a base and an upper only meet when they occupy the same vertical space, and when they do — an upper hung low enough to reach a base's top — both count.

### §1.2 The panel

In `blindEntries`, replacing `panelX` / `panelWidth` (95–100):

```js
const depth = panelDepth(room, wall, run, side, settings);
const endPiece = resolvedLayout.pieces.find(({ id }) => id === endPieceId);
const width = depth > WIDTH_EPSILON && endPiece ? depth + endPiece.width : 0;
let panel = !covered && width > WIDTH_EPSILON
  ? { x: side === 'left' ? cornerX : cornerX - width, width }
  : null;
```

`endPiece.width` is the end piece's **layout** width — what `splitRun` gave it, what the elevation shows — not its ordered width. The panel reaches from the corner to that piece's outer edge as the corner reserve would have placed it.

`covered` is unchanged: a blind with no inch of itself showing needs no panel.

**Worked example.** A north wall and a west wall, both with runs anchored into the north-west corner. The west run is a 30 1/2" base, 24" deep, 24 7/8" to the front of its door. The north run is a base with a left blind, 60" tall, its 42" blind cabinet sitting 3" off the west run's face.

- The west run overlaps the north run vertically — 4 to 34 1/2 inside 4 to 64 — so it counts, and it is the deepest thing that reaches: `panelDepth` is **24 7/8**.
- The filler is 3", so the panel is **27 7/8** wide, from x 0 to x 27 7/8.
- The north run is 60" tall and the west run 30 1/2", so it is not covered and the panel exists.

The 3" is whatever the flex rules gave the filler that pass, and it moves as the other cabinets in the north run adjust. The panel moves with it by exactly that much, and its left edge stays on the west wall — `panel.x` is `cornerX`, always.

### §1.3 The warning

`blind-needs-end` now fires on the condition that would have produced a panel but has no end piece to build it from:

```js
if (!covered && depth > WIDTH_EPSILON && !hasEndPiece) {
  warnings.push({ code: 'blind-needs-end', side });
}
```

`blind-not-past` is unchanged. The `panel && !hasEndPiece` block goes away — `width` is already zero without an end piece.

## §2 Part widths (`model/blind.js`)

`blindPartWidths`'s per-entry rule becomes a precedence, and `covered` stops being what it keys on:

```js
for (const entry of entries) {
  widths.set(entry.pieceId, entry.boxWidth);
  if (!entry.endPieceId) continue;
  widths.set(entry.endPieceId, entry.panel
    ? entry.panel.width
    : run.endFiller?.[entry.side]?.width ?? settings.blindFillerWidth);
}
```

A panel replaces the filler: one part, at the panel's width. With no panel the end piece is the 6" ordered filler SPEC-28 §2 gives it. This is the same answer as before wherever a panel and a covered blind were the only two cases; it is a different answer where SPEC-25 invented a panel from a gap.

## §3 Plan draws it (`model/planPieces.js`, `plan/PlanRunFootprint.jsx`)

### §3.1 A fourth face kind

`planRunPieces` already calls `blindEntries` for its boxes. It builds a side → panel map from the same result, and a filler piece whose side has a panel becomes a **panel** entry instead:

```js
{
  key: piece.id,          // the end piece id, unchanged
  kind: 'panel',
  start: panel.x,
  end: panel.x + panel.width,
  back: faceBack,
  front: faceFront,
}
```

The span comes straight off the panel — anchored at the corner, not grown from the piece edge — which is what makes it overhang the blind box's outer edge and touch the wall. `fillerOrderedWidth` is not consulted for it, and `fillerReturns` emits nothing for a piece that became a panel.

Everything else in §3 of SPEC-28 stands: a filler with no panel is still a `filler` entry at its ordered width, an end panel is still an `end_panel` entry from `0` to `faceFront`, boxes are unchanged.

### §3.2 Drawing it

In `PlanRunFootprint`'s face fill lookup, `panel` uses `KIND_COLORS.end_panel`, the same as `end_panel`. Nothing else in the component changes — a panel is a face entry like any other, at the face plane, one closed polygon, `listening` on.

## §4 Elevation draws it (`components/RunGroup.jsx`)

`RunGroup` already computes `blindEntries` for its sub-labels. Beside `subLabels`, one more memo:

```js
const panels = useMemo(
  () => blind.entries.filter((entry) => entry.panel).map((entry) => ({
    key: `panel:${entry.side}`,
    x: entry.panel.x,
    width: entry.panel.width,
  })),
  [blind],
);
```

and one `Rect` each, drawn **before** the `drawnPieces` map so the run's own pieces sit on top of it:

```jsx
{panels.map((panel) => (
  <Rect
    key={panel.key}
    {...wallRectToScreen({
      x: panel.x,
      z: run.z,
      width: panel.width,
      height: run.height,
    }, transform)}
    fill={KIND_COLORS.end_panel}
    opacity={0.35}
    stroke={KIND_COLORS.end_panel}
    strokeWidth={1}
    listening={false}
  />
))}
```

`NeighborReturns` renders in a later `Layer` than `RunGroup`, so the hatched neighbour shadows already draw over this with no ordering work — which is exactly where the panel belongs: visible behind them, whole, in the bands where nothing dies in.

The `Panel 27 7/8"` sub-label on the end piece is unchanged, and so is every other thing `RunGroup` draws.

---

## §5 Tests

Numbering continues from SPEC-28 (last was 229). Expect **519** passing before step 150.

### Step 150 (`model/__tests__/blind.test.js`)

A new fixture, beside `blindRoom`. Wall K1 runs `(0,0)→(120,0)` with its **start** joined to wall K2 `(0,0)→(0,96)`, the same corner test 220 already builds:

```js
const cornerRoom = (hostRun, neighborRuns) => syncRoom({
  id: 'K',
  name: 'Room K',
  profile: { ...DEFAULT_SETTINGS.defaultProfile },
  partNumberStart: 1,
  partNumberOverrides: {},
  wallOrder: ['K1', 'K2'],
  walls: [
    makeWall('K1', 0, 0, 120, 0, {
      connections: { start: { wallId: 'K2', endpoint: 'start' }, end: null },
      runs: [hostRun],
    }),
    makeWall('K2', 0, 0, 0, 96, {
      connections: { start: { wallId: 'K1', endpoint: 'start' }, end: null },
      runs: neighborRuns,
    }),
  ],
}, DEFAULT_SETTINGS);

const neighborBase = () => base('N', { anchors: { left: false, right: true } });
const neighborUpper = () => run('U', CABINET_TYPE_IDS.UPPER, 12, {
  z: 54, height: 36, heightMode: 'manual', anchors: { left: false, right: true },
});
```

`neighborBase` is test 220's neighbour exactly — z 4, height 30 1/2, depth 24, front depth 24 7/8. `neighborUpper` is z 54, height 36, depth 12, front depth 12 7/8. The corner is 90°, so `sine` is 1 and no division changes a number.

Two hosts, neither anchored, so `syncRoom` leaves `x` where it is written:

```js
const tallBlind = () => run('T', CABINET_TYPE_IDS.TALL, 24, {
  x: 25, width: 24, z: 4, height: 86, heightMode: 'manual',
  ends: { left: { type: 'blind', width: 3 }, right: { type: 'none', width: null } },
  autoCount: false,
  items: [{ id: 't1', kind: 'cabinet', width: 21 }],
  blind: { left: 42, right: null },
});

const lowUpperBlind = () => run('P', CABINET_TYPE_IDS.UPPER, 12, {
  x: 25, width: 24, z: 40, height: 50, heightMode: 'manual',
  ends: { left: { type: 'blind', width: 3 }, right: { type: 'none', width: null } },
  autoCount: false,
  items: [{ id: 'p1', kind: 'cabinet', width: 21 }],
  blind: { left: 42, right: null },
});
```

`T` lays out as `T:left` at 25–28 and `t1` at 28–49; its blind box is 7–49. `P` lays out as `P:left` at 25–28 and `p1` at 28–49.

**Changes to existing tests, all because a blind on a wall with no corner no longer invents a panel:**

- **208.** Both entries' `panel` becomes `null`. Everything else in both objects, and both empty `warnings` arrays, is unchanged.
- **209.** The first and third cases are unchanged. The second — the missing-end case — moves onto `cornerRoom(host, [neighborBase()])` with a host built like `tallBlind()` but with `ends.left` of `{ type: 'none', width: null }` and one item of width 24, so there is a corner for the warning to be about. It still expects `entries: [{ panel: null, endPieceId: null }]` and `warnings: [{ code: 'blind-needs-end', side: 'left' }]`.
- **211.** `blindPartWidths` for the exposed `leftRun({ left: 42, right: null })` becomes `new Map([['w1', 42], ['L:left', 6]])` — no corner, so no panel, so the 6" ordered filler. The empty-Map case is unchanged.
- **220.** The covered half is unchanged and still gives `6`. The exposed half moves onto `cornerRoom(tallBlind(), [neighborBase(), neighborUpper()])`, where `blindPartWidths(...).get('T:left')` is `27.875` and an `endFiller` width of `6` on the run does **not** change it — a panel always wins over an ordered filler.
- **225.** Same move: the covered half is unchanged at `6`; the exposed half becomes the same corner room with no `endFiller` at all, still `27.875`.

**230.** The panel is the deepest overlapping neighbour plus the filler. On `cornerRoom(tallBlind(), [neighborBase(), neighborUpper()])`, with `wall = wallSideView(room.walls[0], 'front')`:

```js
{
  entries: [{
    side: 'left',
    pieceId: 't1',
    boxWidth: 42,
    boxX: 7,
    extension: 21,
    visibleWidth: 21,
    cornerX: 0,
    covered: false,
    endPieceId: 'T:left',
    panel: { x: 0, width: 27.875 },
  }],
  warnings: [],
}
```

24 7/8 from the base — the deeper of the two runs that reach the tall — plus the 3" filler. Note it is **not** 28, which is what the run's own left edge plus its filler would give: the panel is sized by what dies in, not by where the run sits.

`panelDepth(room, wall, room.walls[0].runs[0], 'left', DEFAULT_SETTINGS)` is `24.875`, and `'right'` is `0`.

**231.** Vertical overlap decides which neighbours count.

- On `cornerRoom(lowUpperBlind(), [neighborBase(), neighborUpper()])` the entry's `panel` is `{ x: 0, width: 15.875 }` and `panelDepth(…, 'left', …)` is `12.875`. The 24" base tops out at 34 1/2 and the host starts at 40, so it never meets it and is left out.
- On `cornerRoom(lowUpperBlind(), [neighborBase()])` — the base alone — the entry's `panel` is `null`, `panelDepth` is `0`, `warnings` is `[]`, and `blindPartWidths(...).get('P:left')` is `6`.

Expect 521 passing.

### Step 151 (`model/__tests__/planPieces.test.js`)

Copy `cornerRoom`, `neighborBase`, `neighborUpper` and `tallBlind` from step 150's `blind.test.js` into `planPieces.test.js`, and resolve the layout and face layouts for `T` the way the existing `fixture` does.

**232.** The panel is a face entry at the face plane. On that room, `planRunPieces(room, wall, run, DEFAULT_SETTINGS, layout, faceLayouts)`:

- `faces.filter(({ kind }) => kind === 'panel')` equals
  `[{ key: 'T:left', kind: 'panel', start: 0, end: 27.875, back: 24.0625, front: 24.875 }]`;
- no entry in `faces` has `kind` `'filler'`;
- `returns` is `[]`;
- `boxes` equals `[{ key: 't1', start: 7, end: 49, back: 0, front: 24 }]`;
- `span` equals `{ start: 0, end: 49 }` — the panel reaches the wall, so the run's plan footprint starts at the corner, not at the blind box's edge.

Expect 522 passing.

### Step 152

No tests. Drawing, checked by hand.
