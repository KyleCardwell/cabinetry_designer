# Elevation Lab — SPEC-36 (face frame on cells: gaps, frame regions, opening dimensions)

Steps 213–220, after 35.3 (step 212 was the room JSON size). The plan is in `CELLS-PLAN.md` (round 36). SPEC-32 through 35.3 still apply. Written against `d057326` (the fix after step 211). Baseline **678**.

| Step | What | Files | Tests after |
|---|---|---|---|
| **213** | Shape: `run.seamGap` saved; `run._seamGap` derived in `syncRoom`, never saved; column `gap` carried between grid and items; style edits resync. Inert. | `styles.js`, `grid.js`, `room.js`, `persistence.js`, `elevationSlice.js`, `index.js`, `gaps.test.js` (new), `persistence.test.js` | 681 |
| **214** | Model: root columns leave their gaps; beaded side reveals drop the bead. | `splitRun.js`, `styles.js`, `gaps.test.js`, `styles.test.js` | 683 |
| **215** | Model: nested grids leave their gaps; `cells.gaps`; stacked seams across a row gap. | `cells.js`, `faceLayouts.js`, `index.js`, `gaps.test.js` | 685 |
| **216** | Store: `setTrackGap`, `setRunSeamGap`; `setGridTrackGap`. | `cellTree.js`, `elevationSlice.js`, `index.js`, `gaps.test.js`, `elevationSlice.test.js` | 687 |
| **217** | Panel: gap fields on the run, root cabinets and cells. | `GapField.jsx` (new), `RunCabinetsSection.jsx`, `CabinetProperties.jsx`, `CellProperties.jsx` | 687 |
| **218** | Model: `frameRegions`; boxes narrow at free ends; openings; the not-a-rectangle warning. | `frames.js` (new), `faceLayouts.js`, `room.js`, `index.js`, `frames.test.js` (new) | 690 |
| **219** | Model: no part number for a filler in a frame; opening dimensions and gap segments on the inner chain. | `partNumbers.js`, `dimensions.js`, `partNumbers.test.js`, `dimensions.test.js` | 692 |
| **220** | On screen: the frame drawn with its openings cut out; framed boxes drawn without edges; box width in the panel. | `FrameOutline.jsx` (new), `RunGroup.jsx`, `PieceRect.jsx`, `CabinetStyleProperties.jsx` | 692 |

## §1 The rules (Kyle, 2026-09-26)

### Gaps between boxes (FF-004)

- **A gap is spacing after a track**, never a part. It takes width (or height) in the solve like a fixed track and is drawn as empty space.
- **Where a gap comes from**, for the seam after a column:
  1. the column's own `gap` (any number ≥ 0; `0` switches the default off), else
  2. the run's seam gap, **only between two cabinet columns** (a cabinet leaf or a nested grid on both sides; never beside a filler, panel, void or shelves), else
  3. 0.
- A row takes its own `gap` only. Nothing is ever left after the last track.
- **The run's seam gap** is `run.seamGap` when set, else **2 × bead on beaded inset** (1/2" with the 1/4" bead), else 0. `syncRoom` stores it on the run as `_seamGap` (like `_pinWidths`), only when it's > 0, and `toElevationDocument` strips it.
- **Beaded inset:** the stile covers 3/4" of each box and the bead makes it wider, so the extra is a gap between the boxes. Box-to-opening on the sides is therefore 3/4" for beaded as well (it was 3/4" + bead). Top, bottom, mid rail, mullion and the stacked-seam reveals keep their bead.

### The frame (FACES-PLAN round 15, rebuilt on cells)

- **Members.** Every cabinet cell whose effective style is inset or beaded inset, and every filler (end filler, blind end filler, interior filler) touching one. Two members join when they touch, or meet across a gap. Fillers join only through a cabinet.
- **A region** is the rectangle around a group of members. It grows over a side panel cell or end panel touching its left or right edge, so the stile covers the panel's edge (3/4" over the box + the panel). On an upper whose doors overhang, a region that reaches the run's box bottom drops by `insetFrame.upperDrop` (3/4").
- **Breaks** fall wherever the members stop: a void, a panel above or below, shelves, a European cell, the run's edge.
- **A filler in a frame is part of a wider stile.** It gets no part number (a blind *panel* end keeps its number, SPEC-28/29). A blind cabinet's frame shows only its visible width, as if there were no blind.
- **Free sides.** A cabinet side with no member or covered panel beside it is free: the frame overhangs the box there by `insetFrame.stile` (3/4"). The box is 3/4" narrower on that side (a 30" frame section with two free sides → a 28 1/2" box), and the faces sit in it with the usual reveals. The piece rectangle stays the frame section.
- **Stiles and rails aren't stored.** They are what's left of the region after the openings: each member box's faces before any fit, a pair door's halves as one opening. A seam stile is therefore reveal + gap + reveal.
- **Not a rectangle:** when the members (plus the gaps between them) don't fill the region, warning `frame-not-rectangle`.

### Opening dimensions

- On the inner chain below a run, each region is dimensioned `frame | opening | frame | …` across its **bottom row** of openings (the cabinets touching the region's bottom, and in each, the lowest row of openings). Pieces outside a region stay piece segments, and a gap between two of them is a `gap` segment.
- Vertical opening chains are 36.1.

**Worked examples, used in the tests.** All are base runs at z 4, height 30.5, depth 24, x 24 on a 144" wall, unless noted.

- **A: inset, free ends.** Width 36; cabinets a and b, 18 each; no ends. One region x 24–60. The boxes are a 24.75–42 and b 42–59.25. Openings: a 25.5–41.25, b 42.75–58.5, z 5.5, height 27.5. Chain: 1 1/2 | 15 3/4 | 1 1/2 | 15 3/4 | 1 1/2.
- **B: beaded, end panel, gap, filler.** Width 40, `seamGap` 0.5; left end panel (3/4"), a 18, b auto, right filler 2. Layout: panel 24–24.75, a 24.75–42.75, gap, b 43.25–62, filler 62–64. The region covers the panel and the filler: x 24, width 40. Openings: a 25.5 (width 16.5), b 44 (width 17.25), z 5.75, height 27. Stiles: 1 1/2 (panel + 3/4), 2 (3/4 + 1/2 + 3/4), 2 3/4 (3/4 + filler).
- **C: upper, not a rectangle.** Upper at z 54, height 30, width 36: column s (18) splits into t over a 12" void, and b (18) is full height. The region is t + b, x 24–60, dropped to z 53.25, height 30.75, with a `frame-not-rectangle` warning. t's left side is free.

---

## §2 Step 213 — shape

### `src/elevation/model/styles.js` (237)

Append:

```js
/**
 * The gap a run leaves at each seam between two cabinet columns (SPEC-36, FF-004): its own
 * `seamGap`, else twice the bead on beaded inset (the stile covers 3/4" of each box and the bead
 * widens it), else 0.
 */
export function runSeamGap(room, run, settings) {
  if (Number.isFinite(run.seamGap)) return run.seamGap;
  const style = resolveStyle(settings, room, run);
  return style.cabinetStyleId === CABINET_STYLE_IDS.BEADED_INSET ? 2 * style.beadWidth : 0;
}
```

### `src/elevation/model/grid.js` (380)

- `itemParts` (6–17): the exclusion list (9) becomes `['width', 'pin', 'absorb', 'blind', 'grid', 'gap']`, and after `if (item.absorb !== undefined) col.absorb = item.absorb;` add `if (item.gap !== undefined) col.gap = item.gap;`.
- `rootItems` (116–131): after `if (col.absorb !== undefined) item.absorb = col.absorb;` add `if (col.gap !== undefined) item.gap = col.gap;`.
- `updateRootItem` (309): `key === 'pin' || key === 'absorb'` becomes `key === 'pin' || key === 'absorb' || key === 'gap'`.

### `src/elevation/model/room.js` (1663)

- Add `import { runSeamGap } from './styles.js';` after the `./stacks.js` import block (39–47).
- Right above `syncRoom`'s JSDoc (565), add:

```js
/** A run with its derived seam gap (SPEC-36), stored only when there is one. */
function withSeamGap(room, run, settings) {
  const gap = runSeamGap(room, run, settings);
  if (gap > 0) return run._seamGap === gap ? run : { ...run, _seamGap: gap };
  if (run._seamGap === undefined) return run;
  const { _seamGap, ...rest } = run;
  void _seamGap;
  return rest;
}
```

- In `syncRoom`, right after `nextRoom.walls = nextRoom.walls.map((wall) => pruneStacks(pruneFollows(pruneJoints(wall))));` (575):

```js
  nextRoom.walls = nextRoom.walls.map((wall) => ({
    ...wall,
    runs: wall.runs.map((run) => withSeamGap(nextRoom, run, settings)),
  }));
```

### `src/elevation/store/persistence.js` (645)

- `isRun` (217–240): after the `outset` line (236) add
  `&& (run.seamGap === undefined || (isFiniteNumber(run.seamGap) && run.seamGap >= 0))`.
- `isRootItem` (295–302): `const { width, ...leaf } = item;` becomes `const { width, gap, ...leaf } = item;` and add `void gap;` on the next line. (A column's gap is checked by `validTrack`; a panel item must not fail `CELL_KIND_KEYS` because of it.)
- `toElevationDocument` (596–613): the run map becomes

```js
        runs: wall.runs.map((run) => {
          const { _pinWidths, _seamGap, ...persistedRun } = run;
          void _pinWidths;
          void _seamGap;
          return persistedRun;
        }),
```

### `src/elevation/store/elevationSlice.js` (1725)

A beaded style now changes the layout, so the two style reducers resync:

- `setRoomStyle` (1505–1513): after the `withStandardDrawers(…)` call, `syncRoomAt(state, roomIndexFor(state, action.payload.roomId));`.
- `setRunStyle` (1514–1522): after the `withStandardDrawers(…)` call, `syncRoomAt(state, location.roomIndex);`.

`setItemStyle` doesn't (the seam gap is the run's).

### `src/elevation/model/index.js`

The styles block (38–56) adds `runSeamGap`.

### Tests

**New `src/elevation/model/__tests__/gaps.test.js`** (2):

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems, replaceRootItems, rootItems, updateRootItem } from '../grid.js';
import { syncRoom } from '../room.js';
import { runSeamGap } from '../styles.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });
const makeRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 60.5, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  ...overrides,
});
const withItems = (items, overrides = {}) => makeRun({ grid: gridFromItems('r', items), ...overrides });

function roomWith(run, style) {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['w'],
    ...(style ? { style } : {}),
    walls: [{
      id: 'w', name: '', numberOverride: null, elevationForced: false,
      x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [run],
      endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
    }],
  };
}

describe('SPEC-36 gap shape', () => {
  it('carries a column gap between the grid and its items', () => {
    const grid = gridFromItems('r', [
      cab('a', null, { gap: 0.5 }),
      { id: 'p', kind: 'panel', width: 0.75, gap: 1 },
      cab('b'),
    ]);
    expect(grid.cols.map((col) => col.gap)).toEqual([0.5, 1, undefined]);
    expect(grid.cells.map((cell) => 'gap' in cell.node)).toEqual([false, false, false]);
    expect(rootItems(grid).map((item) => item.gap)).toEqual([0.5, 1, undefined]);
    expect(replaceRootItems(grid, rootItems(grid))).toEqual(grid);
    expect(updateRootItem(grid, 'a', { gap: undefined }).cols[0])
      .toEqual({ id: 'a:col', size: null, sizeMode: 'auto' });
    expect(updateRootItem(grid, 'b', { gap: 0.25 }).cols[2].gap).toBe(0.25);
  });

  it('defaults the seam gap to twice the bead on beaded inset runs', () => {
    const run = withItems([cab('a'), cab('b')]);
    const BEADED = { cabinetStyleId: 15 };
    expect(runSeamGap(roomWith(run), run, S)).toBe(0);
    expect(runSeamGap(roomWith(run, BEADED), run, S)).toBe(0.5);
    expect(runSeamGap(roomWith(run, BEADED), { ...run, style: { beadWidth: 0.375 } }, S)).toBe(0.75);
    expect(runSeamGap(roomWith(run, BEADED), { ...run, seamGap: 0 }, S)).toBe(0);
    expect(runSeamGap(roomWith(run, { cabinetStyleId: 14 }), { ...run, seamGap: 0.25 }, S)).toBe(0.25);

    expect(syncRoom(roomWith(run, BEADED), S).walls[0].runs[0]._seamGap).toBe(0.5);
    expect('_seamGap' in syncRoom(roomWith(run), S).walls[0].runs[0]).toBe(false);
    expect('_seamGap' in syncRoom(roomWith({ ...run, _seamGap: 0.5 }), S).walls[0].runs[0]).toBe(false);
  });
});
```

**`src/elevation/store/__tests__/persistence.test.js`**, a describe at the end (1):

```js
describe('SPEC-36 gaps shape', () => {
  const withRun = (changes) => {
    const document = currentDocument();
    Object.assign(document.rooms[0].walls[0].runs[0], changes);
    return document;
  };

  it('saves a run seam gap and column gaps, and never the derived one', () => {
    expect(isElevationDocument(withRun({ seamGap: 0.5 }))).toBe(true);
    expect(isElevationDocument(withRun({ seamGap: -0.5 }))).toBe(false);
    expect(isElevationDocument(withRun({
      grid: gridFromItems('a', [
        { id: 'p', kind: 'panel', width: 0.75, gap: 0.5 },
        { id: 'a-cab', kind: 'cabinet', width: null },
      ]),
    }))).toBe(true);
    const state = currentDocument();
    state.rooms[0].walls[0].runs[0]._seamGap = 0.5;
    expect('_seamGap' in toElevationDocument(state).rooms[0].walls[0].runs[0]).toBe(false);
  });
});
```

**Count:** 678 + 3 = **681**.

---

## §3 Step 214 — root gaps

### `src/elevation/model/splitRun.js` (561)

1. After `isAutoItem` (12–14):

```js
/**
 * The run's items, each with `gapAfter` (SPEC-36): its column's own `gap`, else the run's seam
 * gap between two cabinet columns; 0 after the last. Items that already carry one keep it (the
 * pinned segments pass slices of this list back in).
 */
function itemsWithGaps(run) {
  const items = runItems(run);
  const seamGap = run._seamGap ?? run.seamGap ?? 0;
  return items.map((item, index) => {
    if (item.gapAfter !== undefined) return item;
    const next = items[index + 1];
    let gapAfter = 0;
    if (next) {
      gapAfter = item.gap ?? (item.kind === 'cabinet' && next.kind === 'cabinet' ? seamGap : 0);
    }
    return { ...item, gapAfter };
  });
}
```

2. `layoutInputs` (41–69): `const items = runItems(run);` becomes `const items = itemsWithGaps(run);`, and `fixedItems`:

```js
  const fixedItems = items.reduce((sum, item) => (
    sum + (item.width === null ? 0 : item.width) + item.gapAfter
  ), 0);
```

3. `splitRunLegacy` (109–269):
   - `const items = runItems(run);` (110) becomes `const items = itemsWithGaps(run);`.
   - Right after `const rawPieces = [];` (215) add `const gapsAfter = [];`.
   - In `addEnd`, after `rawPieces.push(piece);` add `gapsAfter.push(0);`.
   - In the item loop (242–252), after the `rawPieces.push({ … });` add `gapsAfter.push(item.gapAfter);`.
   - The positioning (255–266) becomes:

```js
  let x = run.x;
  const pieces = rawPieces.map((piece, index) => {
    const positioned = {
      ...piece,
      x,
      z: run.z,
      height: run.height,
      depth: piece.depth ?? (piece.kind === 'end_panel' ? settings.endPanelThickness : run.depth),
    };
    x += piece.width + gapsAfter[index];
    return positioned;
  });
```

   `gapAfter` is never copied onto a piece (`itemExtras` doesn't list it), so pieces keep their shape.

4. `itemsMinimum` (282–284):

```js
function itemsMinimum(items, settings) {
  return items.reduce((sum, item) => sum + itemMinimum(item, settings) + (item.gapAfter ?? 0), 0);
}
```

5. `interiorLayout` (332–372): `fixedWidth` adds `+ item.gapAfter` the same way as `layoutInputs`, and `x += itemWidth;` becomes `x += itemWidth + item.gapAfter;`.

6. `splitRun` (396–518):
   - `const items = runItems(run);` (397) becomes `const items = itemsWithGaps(run);`.
   - `rightMinimum` (429) becomes
     `const rightMinimum = outerMinimum(run, 'right', rightItems, settings, opts) + pins[pins.length - 1].item.gapAfter;`
   - `middleMinimums` (430–435): each entry adds `+ pin.item.gapAfter`:

```js
  const middleMinimums = pins.slice(0, -1).map((pin, index) => (
    itemsMinimum(
      items.slice(pin.itemIndex + 1, pins[index + 1].itemIndex),
      settings,
    ) + pin.item.gapAfter
  ));
```

   - `interiorLayout`'s start (500): `pin.left + pin.width,` becomes `pin.left + pin.width + pin.item.gapAfter,`.
   - The right segment (509–515):

```js
  const lastPin = actualPins[actualPins.length - 1];
  const rightStart = lastPin.left + lastPin.width + lastPin.item.gapAfter;
  appendLayout(splitRunLegacy({
    ...run,
    x: rightStart,
    width: run.x + run.width - rightStart,
    items: rightItems,
    ends: { left: { type: 'none', width: null }, right: run.ends.right },
  }, settings, opts));
```

`syncAutoItems` keeps `runItems(run)` for the list it writes back (`gapAfter` must never be saved).

### `src/elevation/model/styles.js`

`styleReveals`, the inset branch (104–105): `left: frame.stile + bead,` and `right: frame.stile + bead,` become `left: frame.stile,` and `right: frame.stile,`, with a comment above them: `// A beaded stile is wider, not deeper: the bead's extra is a gap between the boxes (FF-004).`

### Tests

**`src/elevation/model/__tests__/styles.test.js`**, test `'30 beaded, profiled upper'` (54–58): `left: 1, right: 1` becomes `left: 0.75, right: 0.75`. Nothing else in that file changes.

**`gaps.test.js`**: imports add `import { runWidthRange, splitRun } from '../splitRun.js';`. A describe at the end (2):

```js
describe('SPEC-36 root gaps', () => {
  const at = (layout) => layout.pieces.map(({ id, x, width }) => [id, x, width]);

  it('leaves the seam gap between cabinet columns and a column gap where set', () => {
    const run = withItems([cab('a'), cab('b'), { id: 'f', kind: 'filler', width: 3 }, cab('d')], { _seamGap: 0.5 });
    expect(at(splitRun(run, S))).toEqual([['a', 0, 19], ['b', 19.5, 19], ['f', 38.5, 3], ['d', 41.5, 19]]);
    expect(runWidthRange(run, S).min).toBe(30.5);

    const own = withItems([cab('a', null, { gap: 1 }), cab('b')], { width: 37, _seamGap: 0.5 });
    expect(at(splitRun(own, S))).toEqual([['a', 0, 18], ['b', 19, 18]]);
    const none = withItems([cab('a', null, { gap: 0 }), cab('b')], { width: 37, _seamGap: 0.5 });
    expect(at(splitRun(none, S))).toEqual([['a', 0, 18.5], ['b', 18.5, 18.5]]);
  });

  it('keeps the gaps either side of a pinned cabinet', () => {
    const pin = { anchor: 'left', from: 'left', openingId: null, openingAnchor: 'center', value: 25 };
    const run = withItems([cab('a'), cab('b', 20, { pin }), cab('c')], { width: 60, _seamGap: 0.5 });
    expect(at(splitRun(run, S, { pinTargets: { b: 25 } })))
      .toEqual([['a', 0, 24.5], ['b', 25, 20], ['c', 45.5, 14.5]]);
  });
});
```

Working:
- 60.5" with a filler of 3: the only default gap is a|b (b|filler and filler|d aren't two cabinets), so 60.5 − 3 − 0.5 = 57 → 19 each. The minimum width is 3 + 0.5 + 3 × 9 = 30.5.
- `gap: 1` on a: 37 − 1 = 36 → 18 each. `gap: 0` switches the default off: 18.5 each.
- The pin: a's minimum is 9 + 0.5, the right side's is 9 + b's 0.5, so b stays at 25. The left segment (0–25) holds a and its 0.5: a = 24.5. The right segment starts after b's gap: 25 + 20 + 0.5 = 45.5, so c = 14.5.

**Count:** 681 + 2 = **683**.

---

## §4 Step 215 — nested gaps

### `src/elevation/model/cells.js` (289)

1. `resolveTracks` (7–24) takes gaps:

```js
export function resolveTracks(tracks, length, gaps = []) {
```

   and `const autoSize = (length - fixed) / autoCount;` becomes

```js
  const spacing = gaps.reduce((total, gap) => total + gap, 0);
  const autoSize = (length - fixed - spacing) / autoCount;
```

2. Replace `offsets` (26–30) with:

```js
/** Where each track starts along its axis, each track's gap after it. */
function trackStarts(sizes, gaps) {
  const starts = [];
  let cursor = 0;
  sizes.forEach((size, index) => {
    starts.push(cursor);
    cursor += size + (gaps[index] ?? 0);
  });
  return starts;
}

/** What a cell covers from track `first` over `count` tracks, the gaps between them included. */
function spanLength(starts, sizes, first, count) {
  const last = first + count - 1;
  return starts[last] + sizes[last] - starts[first];
}

function isBoxNode(node) {
  return isNestedGrid(node) || node.kind === 'cabinet';
}

/**
 * The gap after each track (SPEC-36): its own `gap`, else the run's seam gap between two columns
 * of cabinets. Rows take only their own. Never after the last track.
 */
export function trackGaps(grid, key, seamGap = 0) {
  const tracks = grid[key];
  const axis = key === 'cols' ? 'col' : 'row';
  const span = key === 'cols' ? 'colSpan' : 'rowSpan';
  return tracks.map((track, index) => {
    if (index === tracks.length - 1) return 0;
    if (track.gap !== undefined) return track.gap;
    if (key !== 'cols' || !(seamGap > 0)) return 0;
    const touching = grid.cells.filter((cell) => cell[axis] + cell[span] - 1 === index
      || cell[axis] === index + 1);
    return touching.every((cell) => isBoxNode(cell.node)) ? seamGap : 0;
  });
}

/** How far apart two boxes can sit and still meet at a seam: the thickest gap. */
export function gapReach(gaps) {
  return gaps.reduce((reach, gap) => Math.max(reach, Math.min(gap.width, gap.height)), 0);
}

function axisLayout(grid, key, length, seamGap) {
  const gaps = trackGaps(grid, key, seamGap);
  const sizes = resolveTracks(grid[key], length, gaps);
  return { gaps, sizes, starts: trackStarts(sizes, gaps) };
}
```

3. `gridRecord` (36–56) becomes:

```js
function gridRecord(grid, columnId, depth, rectangle, cols, rows) {
  const axis = axisFor(grid);
  const { x, z, width, height } = rectangle;
  const tracks = axis === 'row'
    ? grid.rows.map((track, index) => ({
      id: track.id,
      start: z + height - rows.starts[index] - rows.sizes[index],
      end: z + height - rows.starts[index],
      manual: track.size !== null,
    }))
    : grid.cols.map((track, index) => ({
      id: track.id,
      start: x + cols.starts[index],
      end: x + cols.starts[index] + cols.sizes[index],
      manual: track.size !== null,
    }));

  return { id: grid.id, columnId, axis, depth, x, z, width, height, tracks };
}
```

4. `resolveGrid` (58–102): the signature becomes `resolveGrid(grid, piece, rectangle, depth, grids, gaps, seamGap)`, and everything before the leaf push becomes:

```js
  const cols = axisLayout(grid, 'cols', rectangle.width, seamGap);
  const rows = axisLayout(grid, 'rows', rectangle.height, seamGap);
  const top = rectangle.z + rectangle.height;
  const leaves = [];

  grids.push(gridRecord(grid, piece.id, depth, rectangle, cols, rows));
  cols.gaps.forEach((gap, index) => {
    if (gap > 0) {
      gaps.push({
        x: rectangle.x + cols.starts[index] + cols.sizes[index], z: rectangle.z, width: gap, height: rectangle.height,
      });
    }
  });
  rows.gaps.forEach((gap, index) => {
    if (gap > 0) {
      gaps.push({
        x: rectangle.x, z: top - rows.starts[index] - rows.sizes[index] - gap, width: rectangle.width, height: gap,
      });
    }
  });

  for (const cell of grid.cells) {
    const x = rectangle.x + cols.starts[cell.col];
    const cellTop = top - rows.starts[cell.row];
    const width = spanLength(cols.starts, cols.sizes, cell.col, cell.colSpan);
    const height = spanLength(rows.starts, rows.sizes, cell.row, cell.rowSpan);
    const childRectangle = { x, z: cellTop - height, width, height };

    if (isNestedGrid(cell.node)) {
      leaves.push(...resolveGrid(cell.node, piece, childRectangle, depth + 1, grids, gaps, seamGap));
      continue;
    }
```

   and in the leaf push, `z: top - height,` becomes `z: cellTop - height,`. The rest of the push is unchanged.

5. `cellPieces` (104–146): before it, add

```js
/** Gaps between the run's top-level pieces (SPEC-36). */
function rootGaps(run, layout) {
  const gaps = [];
  layout.pieces.forEach((piece, index) => {
    const next = layout.pieces[index + 1];
    const gap = next ? next.x - piece.x - piece.width : 0;
    if (gap > EPSILON) gaps.push({ x: piece.x + piece.width, z: run.z, width: gap, height: run.height });
  });
  return gaps;
}
```

   and in `cellPieces`:
   - the first line becomes `const gaps = rootGaps(run, layout);` then `if (!run.grid) return { pieces: layout.pieces, grids: [], warnings: [], gaps };`
   - after `const warnings = [];` add `const seamGap = run._seamGap ?? run.seamGap ?? 0;`
   - the `resolveGrid` call becomes `resolveGrid(node, piece, piece, 1, grids, gaps, seamGap)`
   - the return becomes `return { pieces: replaced ? pieces : layout.pieces, grids, warnings, gaps };`

6. `stackedSides` (152–166) takes a reach, so stacked boxes meet across a row gap:

```js
export function stackedSides(pieces, pieceId, reach = 0) {
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || piece.kind !== 'cabinet') return { top: false, bottom: false };

  let top = false;
  let bottom = false;
  for (const candidate of pieces) {
    if (candidate === piece || candidate.kind !== 'cabinet' || !rangesOverlap(piece, candidate)) {
      continue;
    }
    const above = candidate.z - piece.z - piece.height;
    const below = piece.z - candidate.z - candidate.height;
    if (above >= -EPSILON && above <= reach + EPSILON) top = true;
    if (below >= -EPSILON && below <= reach + EPSILON) bottom = true;
  }
  return { top, bottom };
}
```

### `src/elevation/model/faceLayouts.js` (85)

- The cells.js import (2) adds `gapReach`.
- `stacked: stackedSides(cells.pieces, piece.id),` (65) becomes `stacked: stackedSides(cells.pieces, piece.id, gapReach(cells.gaps)),`.

### `src/elevation/model/index.js`

The cells block (334–347) adds `gapReach`, `trackGaps`.

### Tests: `gaps.test.js`

Imports add `import { cellPieces, gapReach, stackedSides } from '../cells.js';`. Add two top-level helpers after `withItems`:

```js
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const nestedRun = (node, overrides = {}) => makeRun({
  width: 36.5, z: 0, height: 60,
  grid: {
    id: 'r:grid', cols: [{ id: `${node.id}:col`, size: null, sizeMode: 'auto' }],
    rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }], cells: [cell(0, 0, node)],
  },
  ...overrides,
});
```

A describe at the end (2):

```js
describe('SPEC-36 nested gaps', () => {
  const SIDE_BY_SIDE = {
    id: 'n',
    cols: [{ id: 'n:a', size: null, sizeMode: 'auto' }, { id: 'n:b', size: null, sizeMode: 'auto' }],
    rows: [{ id: 'n:r', size: null, sizeMode: 'auto' }],
    cells: [cell(0, 0, { id: 'x', kind: 'cabinet' }), cell(1, 0, { id: 'y', kind: 'cabinet' })],
  };

  it('leaves the seam gap between side-by-side cabinet cells', () => {
    const run = nestedRun(SIDE_BY_SIDE, { _seamGap: 0.5 });
    const cells = cellPieces(run, splitRun(run, S));
    expect(cells.pieces.map(({ id, x, width }) => [id, x, width])).toEqual([['x', 0, 18], ['y', 18.5, 18]]);
    expect(cells.gaps).toEqual([{ x: 18, z: 0, width: 0.5, height: 60 }]);
    expect(cells.grids[0].tracks.map(({ start, end }) => [start, end])).toEqual([[0, 18], [18.5, 36.5]]);

    const panel = { ...SIDE_BY_SIDE, cells: [SIDE_BY_SIDE.cells[0], cell(1, 0, { id: 'y', kind: 'panel' })] };
    const panelRun = nestedRun(panel, { _seamGap: 0.5 });
    expect(cellPieces(panelRun, splitRun(panelRun, S)).gaps).toEqual([]);
  });

  it('stacks across a row gap and reports gaps between top-level pieces', () => {
    const stack = {
      id: 'm',
      cols: [{ id: 'm:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'm:t', size: null, sizeMode: 'auto', gap: 1 }, { id: 'm:b', size: 30, sizeMode: 'manual' }],
      cells: [cell(0, 0, { id: 't', kind: 'cabinet' }), cell(0, 1, { id: 'b', kind: 'cabinet' })],
    };
    const run = nestedRun(stack, { width: 20 });
    const cells = cellPieces(run, splitRun(run, S));
    expect(cells.pieces.map(({ id, z, height }) => [id, z, height])).toEqual([['b', 0, 30], ['t', 31, 29]]);
    expect(cells.gaps).toEqual([{ x: 0, z: 30, width: 20, height: 1 }]);
    expect(stackedSides(cells.pieces, 'b')).toEqual({ top: false, bottom: false });
    expect(stackedSides(cells.pieces, 'b', gapReach(cells.gaps))).toEqual({ top: true, bottom: false });

    const root = withItems([cab('a'), cab('b')], { width: 36.5, _seamGap: 0.5 });
    expect(cellPieces(root, splitRun(root, S)).gaps).toEqual([{ x: 18, z: 4, width: 0.5, height: 30.5 }]);
  });
});
```

Working:
- 36.5 − 0.5 = 36 → x 0–18, y 18.5–36.5. With y a panel, the seam isn't between two cabinets: no gap.
- Rows: 60 − 30 − 1 = 29 for t (z 31–60), b z 0–30, the gap z 30–31. The leaves sort by x, then z, so b comes first.

**Count:** 683 + 2 = **685**.

---

## §5 Step 216 — store

### `src/elevation/model/cellTree.js` (460)

Append:

```js
function updateTrack(grid, trackId, update) {
  function visit(node) {
    for (const key of ['cols', 'rows']) {
      const index = node[key].findIndex((track) => track.id === trackId);
      if (index >= 0) {
        const track = update(node[key][index]);
        if (track === node[key][index]) return [node, true];
        const tracks = [...node[key]];
        tracks[index] = track;
        return [{ ...node, [key]: tracks }, true];
      }
    }
    for (let index = 0; index < node.cells.length; index += 1) {
      const cell = node.cells[index];
      if (!isNestedGrid(cell.node)) continue;
      const [child, found] = visit(cell.node);
      if (!found) continue;
      if (child === cell.node) return [node, true];
      const cells = [...node.cells];
      cells[index] = { ...cell, node: child };
      return [{ ...node, cells }, true];
    }
    return [node, false];
  }
  const [next, found] = visit(grid);
  return found ? next : grid;
}

/** Sets the gap after any root or nested track (SPEC-36), or clears it (null). */
export function setGridTrackGap(grid, trackId, gap) {
  if (gap !== null && !(typeof gap === 'number' && Number.isFinite(gap) && gap >= 0)) return grid;
  return updateTrack(grid, trackId, (track) => {
    if (gap === null) {
      if (track.gap === undefined) return track;
      const next = { ...track };
      delete next.gap;
      return next;
    }
    return Object.is(track.gap, gap) ? track : { ...track, gap };
  });
}
```

### `src/elevation/store/elevationSlice.js`

- The cellTree import block (18–33) adds `setGridTrackGap`.
- Right after `setMaxCabinetWidth` (1172–1179):

```js
    setRunSeamGap(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { gap = null } = action.payload;
      if (gap !== null && !(Number.isFinite(gap) && gap >= 0)) return;
      if (gap === null) {
        if (location.run.seamGap === undefined) return;
        delete location.run.seamGap;
      } else {
        if (location.run.seamGap === gap) return;
        location.run.seamGap = gap;
      }
      syncRoomAt(state, location.roomIndex);
    },
```

- Right after `setTrackSize` (1361–1370):

```js
    setTrackGap(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { trackId, gap = null } = action.payload;
      const before = location.run.grid;
      const grid = setGridTrackGap(before, trackId, gap);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
```

- The actions export list (1627–1723) adds `setRunSeamGap` after `setMaxCabinetWidth` and `setTrackGap` after `setTrackSize`.

### `src/elevation/model/index.js`

The cellTree block adds `setGridTrackGap`.

### Tests

**`gaps.test.js`**: imports add `import { setGridTrackGap } from '../cellTree.js';`. A describe at the end (1):

```js
describe('SPEC-36 track gap edits', () => {
  it('sets and clears a gap on any track', () => {
    const node = {
      id: 'n',
      cols: [{ id: 'n:a', size: null, sizeMode: 'auto' }, { id: 'n:b', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'n:r', size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, { id: 'x', kind: 'cabinet' }), cell(1, 0, { id: 'y', kind: 'cabinet' })],
    };
    const { grid } = nestedRun(node);
    const set = setGridTrackGap(grid, 'n:a', 0.25);
    expect(set.cells[0].node.cols[0]).toEqual({ id: 'n:a', size: null, sizeMode: 'auto', gap: 0.25 });
    expect(setGridTrackGap(set, 'n:a', 0.25)).toBe(set);
    expect(setGridTrackGap(set, 'n:a', null)).toEqual(grid);
    expect(setGridTrackGap(grid, 'n:a', null)).toBe(grid);
    expect(setGridTrackGap(grid, 'n:a', -1)).toBe(grid);
    expect(setGridTrackGap(grid, 'nope', 1)).toBe(grid);
    expect(setGridTrackGap(grid, 'n:col', 0).cols[0].gap).toBe(0);
  });
});
```

**`src/elevation/store/__tests__/elevationSlice.test.js`** (2394): add `setRunSeamGap`, `setTrackGap` to the `../elevationSlice.js` import (12–96). A describe at the end (1):

```js
describe('SPEC-36 gap reducers', () => {
  const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
  const NONE = { type: 'none', width: null };

  it('sets and clears the run seam gap and track gaps, and a beaded style sets the default', () => {
    let state = stateWithRun(run({
      autoCount: false, width: 36.5, ends: { left: NONE, right: NONE }, items: [auto('a'), auto('b')],
    }));
    state = elevationReducer(state, setRunSeamGap({ ...actionBase, gap: 0.5 }));
    expect(currentRun(state)).toMatchObject({ seamGap: 0.5, _seamGap: 0.5 });
    expect(elevationReducer(state, setRunSeamGap({ ...actionBase, gap: -1 }))).toBe(state);
    expect(elevationReducer(state, setRunSeamGap({ ...actionBase, gap: 0.5 }))).toBe(state);

    state = elevationReducer(state, setTrackGap({ ...actionBase, trackId: 'a:col', gap: 1 }));
    expect(currentRun(state).grid.cols[0].gap).toBe(1);
    expect(elevationReducer(state, setTrackGap({ ...actionBase, trackId: 'nope', gap: 1 }))).toBe(state);
    state = elevationReducer(state, setTrackGap({ ...actionBase, trackId: 'a:col', gap: null }));
    expect('gap' in currentRun(state).grid.cols[0]).toBe(false);

    state = elevationReducer(state, setRunSeamGap({ ...actionBase, gap: null }));
    expect('seamGap' in currentRun(state)).toBe(false);
    expect('_seamGap' in currentRun(state)).toBe(false);

    state = elevationReducer(state, setRoomStyle({ roomId: 'room-1', style: { cabinetStyleId: 15 } }));
    expect(currentRun(state)._seamGap).toBe(0.5);
    state = elevationReducer(state, setRunStyle({ ...actionBase, style: { cabinetStyleId: 13 } }));
    expect('_seamGap' in currentRun(state)).toBe(false);
  });
});
```

**Count:** 685 + 2 = **687**.

---

## §6 Step 217 — panel fields

### New `src/elevation/components/properties/GapField.jsx`

```jsx
import { formatInchesInput } from '../../model/index.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

/** A gap after a track or at a run's seams (SPEC-36). Blank clears it back to `fallback`. */
export default function GapField({ label, value, fallback = 0, onCommit, ariaLabel }) {
  return (
    <Field label={label}>
      <InchInput
        value={value ?? null}
        allowBlank
        placeholder={formatInchesInput(fallback)}
        onCommit={(gap) => {
          if (gap !== null && !(gap >= 0)) return false;
          onCommit(gap);
          return true;
        }}
        aria-label={ariaLabel}
      />
    </Field>
  );
}
```

### `src/elevation/components/properties/RunCabinetsSection.jsx` (88)

- Imports: `setRunSeamGap` from the slice; `import GapField from './GapField.jsx';`.
- After the Max cabinet width block (the `<div className="mt-2">` at 73–85):

```jsx
        <div className="mt-2">
          <GapField
            label="Gap between cabinets (blank = style)"
            value={run.seamGap}
            fallback={run._seamGap ?? 0}
            onCommit={(gap) => dispatch(setRunSeamGap({ ...actionBase, gap }))}
            ariaLabel="Gap between cabinets"
          />
        </div>
```

### `src/elevation/components/properties/CabinetProperties.jsx` (277)

- Imports: `setTrackGap` from the slice; `import GapField from './GapField.jsx';`.
- After `const itemIndex = …` (31): 

```js
  const next = items[itemIndex + 1];
  const gapFallback = next && item.kind === 'cabinet' && next.kind === 'cabinet' ? run._seamGap ?? 0 : 0;
```

- In the Cabinet section, right after the Lock/Unlock width `</button>` (80):

```jsx
        {next && (
          <div className="mt-2">
            <GapField
              label="Gap right (blank = run)"
              value={item.gap}
              fallback={gapFallback}
              onCommit={(gap) => dispatch(setTrackGap({
                wallId: wall.id, runId: run.id, trackId: `${item.id}:col`, gap,
              }))}
              ariaLabel="Gap right"
            />
          </div>
        )}
```

### `src/elevation/components/properties/CellProperties.jsx` (225)

- Imports: `setTrackGap` from the slice; `import GapField from './GapField.jsx';`.
- After `const blindSides = …` (44–46):

```js
  const trackKey = axis === 'row' ? 'rows' : 'cols';
  const span = axis === 'row' ? context.cell.rowSpan : context.cell.colSpan;
  const hasTrackAfter = context.cell[axis] + span < context.parent[trackKey].length;
  const columnIndex = runItems(run).findIndex((candidate) => candidate.id === piece.columnId);
  const hasColumnAfter = columnIndex >= 0 && columnIndex < runItems(run).length - 1;
```

- In the Size section, right after the Lock/Unlock `</button>` (83):

```jsx
        {hasTrackAfter && (
          <div className="mt-2">
            <GapField
              label={axis === 'row' ? 'Gap below (blank = none)' : 'Gap right (blank = run)'}
              value={context.track.gap}
              fallback={axis === 'row' ? 0 : run._seamGap ?? 0}
              onCommit={(gap) => dispatch(setTrackGap({ ...actionBase, trackId: context.track.id, gap }))}
              ariaLabel={axis === 'row' ? 'Cell gap below' : 'Cell gap right'}
            />
          </div>
        )}
```

- In the Column section, right after its Lock/Unlock `</button>` (118):

```jsx
          {hasColumnAfter && (
            <div className="mt-2">
              <GapField
                label="Column gap right (blank = run)"
                value={columnItem?.gap}
                fallback={run._seamGap ?? 0}
                onCommit={(gap) => dispatch(setTrackGap({
                  ...actionBase, trackId: `${piece.columnId}:col`, gap,
                }))}
                ariaLabel="Column gap right"
              />
            </div>
          )}
```

No new tests (components). **Count stays 687.**

---

## §7 Step 218 — frame regions

### New file `src/elevation/model/frames.js`

```js
import { gapReach, panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { resolveFaces } from './faces.js';
import { runItems } from './grid.js';
import { isInsetStyle, resolveStyle } from './styles.js';

const EPSILON = 1e-6;

function overlaps(start, end, otherStart, otherEnd) {
  return Math.min(end, otherEnd) - Math.max(start, otherStart) > EPSILON;
}

/** Which side of `a` `b` is on, touching or across a gap no wider than `reach`; null otherwise. */
export function sideOf(a, b, reach = 0) {
  const within = (distance) => distance >= -EPSILON && distance <= reach + EPSILON;
  const rows = overlaps(a.z, a.z + a.height, b.z, b.z + b.height);
  const cols = overlaps(a.x, a.x + a.width, b.x, b.x + b.width);
  if (rows && within(b.x - a.x - a.width)) return 'right';
  if (rows && within(a.x - b.x - b.width)) return 'left';
  if (cols && within(b.z - a.z - a.height)) return 'top';
  if (cols && within(a.z - b.z - b.height)) return 'bottom';
  return null;
}

function pieceItem(run, piece) {
  return piece.columnId
    ? findLeaf(run.grid, piece.id)
    : runItems(run).find((item) => item.id === piece.id);
}

function isSidePanel(piece) {
  return piece.kind === 'end_panel' || (piece.kind === 'panel' && panelOrientation(piece) === 'side');
}

function areaOf(rect) {
  return rect.width * rect.height;
}

function overlapArea(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z);
  return width > 0 && height > 0 ? width * height : 0;
}

function boundsOf(pieces) {
  const left = Math.min(...pieces.map((piece) => piece.x));
  const right = Math.max(...pieces.map((piece) => piece.x + piece.width));
  const bottom = Math.min(...pieces.map((piece) => piece.z));
  const top = Math.max(...pieces.map((piece) => piece.z + piece.height));
  return { x: left, z: bottom, width: right - left, height: top - bottom };
}

/**
 * Face frame regions for a run (SPEC-36). Each face frame cabinet, and each filler beside one,
 * joins a region with the boxes it touches or meets across a gap. A region is the rectangle
 * around its members, grown over a side or end panel at either side (the stile covers the
 * panel's edge) and down by the upper drop on an upper whose doors overhang. A filler in a frame
 * is part of a wider stile. A cabinet side with nothing framed or covered beside it is free.
 *
 * @returns {{regions: object[], fillerIds: Set<string>, freeSides: Map<string, {left: boolean, right: boolean}>, warnings: object[]}}
 */
export function frameRegions(room, run, cells, settings) {
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  const { pieces } = cells;
  const gaps = cells.gaps ?? [];
  const reach = gapReach(gaps);
  const regions = [];
  const fillerIds = new Set();
  const freeSides = new Map();
  const warnings = [];
  const cabinets = pieces.filter((piece) => piece.kind === 'cabinet' && piece.role === 'item'
    && isInsetStyle(resolveStyle(settings, room, run, pieceItem(run, piece))));
  if (cabinets.length === 0) return { regions, fillerIds, freeSides, warnings };

  const members = [...cabinets, ...pieces.filter((piece) => piece.kind === 'filler')];
  const parent = new Map(members.map((piece) => [piece.id, piece.id]));
  const root = (id) => (parent.get(id) === id ? id : root(parent.get(id)));
  for (const a of members) {
    for (const b of members) {
      if (a === b || (a.kind === 'filler' && b.kind === 'filler')) continue;
      if (sideOf(a, b, reach)) parent.set(root(a.id), root(b.id));
    }
  }
  const groups = new Map();
  for (const piece of members) {
    const key = root(piece.id);
    groups.set(key, [...(groups.get(key) ?? []), piece]);
  }

  const panels = pieces.filter(isSidePanel);
  for (const group of groups.values()) {
    const boxes = group.filter((piece) => piece.kind === 'cabinet');
    if (boxes.length === 0) continue;
    const bounds = boundsOf(group);
    const filled = group.reduce((total, piece) => total + areaOf(piece), 0)
      + gaps.reduce((total, gap) => total + overlapArea(gap, bounds), 0);
    if (filled < areaOf(bounds) - EPSILON) {
      warnings.push({
        code: 'frame-not-rectangle',
        pieceId: boxes[0].id,
        message: 'These face frame cabinets don\'t make a rectangle, so one frame can\'t cover them.',
      });
    }

    const region = {
      id: `frame:${boxes[0].id}`,
      ...bounds,
      cabinetIds: boxes.map((piece) => piece.id),
      fillerIds: group.filter((piece) => piece.kind === 'filler').map((piece) => piece.id),
      panelIds: [],
    };
    for (const panel of panels) {
      if (!overlaps(panel.z, panel.z + panel.height, bounds.z, bounds.z + bounds.height)) continue;
      if (Math.abs(panel.x + panel.width - bounds.x) <= EPSILON) {
        region.x = panel.x;
        region.width += panel.width;
        region.panelIds.push(panel.id);
      } else if (Math.abs(panel.x - bounds.x - bounds.width) <= EPSILON) {
        region.width += panel.width;
        region.panelIds.push(panel.id);
      }
    }
    if (run.cabinetTypeId === CABINET_TYPE_IDS.UPPER
      && (run.upperBottom ?? 'overhang') === 'overhang'
      && Math.abs(bounds.z - run.z) <= EPSILON) {
      region.z -= frame.upperDrop;
      region.height += frame.upperDrop;
    }
    regions.push(region);
    for (const id of region.fillerIds) fillerIds.add(id);

    const covering = [...group, ...panels.filter((panel) => region.panelIds.includes(panel.id))];
    for (const box of boxes) {
      const beside = (side) => covering.some((other) => other !== box && sideOf(box, other, reach) === side);
      freeSides.set(box.id, { left: !beside('left'), right: !beside('right') });
    }
  }
  return { regions, fillerIds, freeSides, warnings };
}

/** Each face's opening in the frame: its slot before any fit, a pair door's halves as one. */
export function faceOpenings(face, area, reveals) {
  const { faces } = resolveFaces(face, area, { ...reveals, fit: 0, pairFit: 0 });
  const byPath = new Map();
  for (const rect of faces) {
    const seen = byPath.get(rect.path);
    if (!seen) {
      byPath.set(rect.path, { path: rect.path, x: rect.x, z: rect.z, width: rect.width, height: rect.height });
      continue;
    }
    const right = Math.max(seen.x + seen.width, rect.x + rect.width);
    seen.x = Math.min(seen.x, rect.x);
    seen.width = right - seen.x;
  }
  return [...byPath.values()];
}
```

### `src/elevation/model/faceLayouts.js`

- Imports: `faces.js` (5) becomes `import { applyHinges, cabinetFaces, defaultFace, faceArea } from './faces.js';`; add `import { faceOpenings, frameRegions } from './frames.js';` after it.
- After `const cells = cellPieces(run, layout);` (32):

```js
  const frames = frameRegions(room, run, cells, settings);
  const overhang = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
```

- In the loop, replace `const face = item?.face ?? defaultFace(piece.width, settings);` (51) with:

```js
    const free = frames.freeSides.get(piece.id) ?? { left: false, right: false };
    const box = {
      ...piece,
      x: piece.x + (free.left ? overhang : 0),
      width: piece.width - (free.left ? overhang : 0) - (free.right ? overhang : 0),
    };
    const face = item?.face ?? defaultFace(box.width, settings);
```

- `cabinetFaces(item, piece, …)` (71) becomes `cabinetFaces(item, box, …)`.
- `result.set(piece.id, { … })` adds, after `reveals,`:

```js
      box,
      openings: faceOpenings(face, faceArea(box, reveals.values), reveals.values),
```

Capture, stacked seams, covered sides and hinge stops still read `piece`: the neighbours are found from the frame sections.

### `src/elevation/model/room.js`

- Add `import { frameRegions } from './frames.js';` after the `footprints.js` import (13).
- `roomDiagnostics`, right after the `...extendPieces(wall, run, cellPieces(run, layout).pieces).warnings,` line (730):

```js
          ...frameRegions(synced, run, cellPieces(run, layout), settings).warnings,
```

### `src/elevation/model/index.js`

At the end:

```js
export { faceOpenings, frameRegions, sideOf } from './frames.js';
```

### Tests: new `src/elevation/model/__tests__/frames.test.js` (3)

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';

const S = DEFAULT_SETTINGS;
const INSET = { cabinetStyleId: 14 };
const NONE = { type: 'none', width: null };
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 36, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: 18 }, { id: 'b', kind: 'cabinet', width: 18 }]),
  ...overrides,
});

function framesOf(run, style = INSET) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return {
    frames: frameRegions(room, run, cellPieces(run, layout), S),
    faces: runFaceLayouts(room, wall, run, S, layout),
  };
}

describe('SPEC-36 frame regions', () => {
  it('frames two inset cabinets: the stiles overhang the free ends and the boxes narrow', () => {
    const { frames, faces } = framesOf(baseRun());
    expect(frames.regions).toEqual([{
      id: 'frame:a', x: 24, z: 4, width: 36, height: 30.5, cabinetIds: ['a', 'b'], fillerIds: [], panelIds: [],
    }]);
    expect(frames.freeSides.get('a')).toEqual({ left: true, right: false });
    expect(frames.freeSides.get('b')).toEqual({ left: false, right: true });
    expect(frames.warnings).toEqual([]);

    const a = faces.get('a');
    expect([a.box.x, a.box.width]).toEqual([24.75, 17.25]);
    expect(a.faces).toEqual([{ path: 'r', type: 'door', x: 25.5, z: 5.5, width: 15.75, height: 27.5 }]);
    expect(a.openings).toEqual([{ path: 'r', x: 25.5, z: 5.5, width: 15.75, height: 27.5 }]);
    expect(faces.get('b').openings).toEqual([{ path: 'r', x: 42.75, z: 5.5, width: 15.75, height: 27.5 }]);

    expect(framesOf(baseRun(), null).frames.regions).toEqual([]);
  });

  it('covers an end panel and a filler, and the seam gap widens the stile', () => {
    const run = baseRun({
      width: 40,
      seamGap: 0.5,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: 2 } },
      grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: 18 }, { id: 'b', kind: 'cabinet', width: null }]),
    });
    const { frames, faces } = framesOf(run, { cabinetStyleId: 15 });
    expect(frames.regions).toEqual([{
      id: 'frame:a', x: 24, z: 4, width: 40, height: 30.5,
      cabinetIds: ['a', 'b'], fillerIds: ['r:right'], panelIds: ['r:left'],
    }]);
    expect([...frames.fillerIds]).toEqual(['r:right']);
    expect(frames.freeSides.get('a')).toEqual({ left: false, right: false });
    expect(frames.freeSides.get('b')).toEqual({ left: false, right: false });
    expect(faces.get('a').openings).toEqual([{ path: 'r', x: 25.5, z: 5.75, width: 16.5, height: 27 }]);
    expect(faces.get('b').openings).toEqual([{ path: 'r', x: 44, z: 5.75, width: 17.25, height: 27 }]);
  });

  it('drops the frame under an upper and warns when it isn\'t a rectangle', () => {
    const run = baseRun({
      cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12,
      grid: {
        id: 'r:grid',
        cols: [{ id: 's:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [
          cell(0, 0, {
            id: 's',
            cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
            rows: [{ id: 's:t', size: null, sizeMode: 'auto' }, { id: 's:v', size: 12, sizeMode: 'manual' }],
            cells: [cell(0, 0, { id: 't', kind: 'cabinet' }), cell(0, 1, { id: 'v', kind: 'void' })],
          }),
          cell(1, 0, { id: 'b', kind: 'cabinet' }),
        ],
      },
    });
    const { frames } = framesOf(run);
    expect(frames.regions).toEqual([{
      id: 'frame:t', x: 24, z: 53.25, width: 36, height: 30.75, cabinetIds: ['t', 'b'], fillerIds: [], panelIds: [],
    }]);
    expect(frames.freeSides.get('t')).toEqual({ left: true, right: false });
    expect(frames.warnings.map(({ code, pieceId }) => [code, pieceId])).toEqual([['frame-not-rectangle', 't']]);
  });
});
```

Working (the §1 worked examples):
- **A.** a's left and b's right are free, so a's box is 24.75 + 17.25 and b's is 42 + 17.25. Inset reveals are 3/4 on the sides and 1 1/2 top and bottom: a's opening is 25.5 → 41.25, z 5.5, height 30.5 − 3 = 27.5. The stile between them is 41.25 → 42.75 = 1 1/2, and each end stile is 1 1/2. A European room has no regions.
- **B.** Beaded: 1 3/4 top and bottom (rail + bead), 3/4 sides. a = 24.75–42.75 → opening 25.5, width 16.5. b = 43.25–62 (40 − 0.75 − 2 − 18 − 0.5 = 18.75) → opening 44, width 17.25. z 4 + 1.75 = 5.75, height 30.5 − 3.5 = 27. The members plus the 0.5 gap fill x 24.75–64, and the end panel grows the region to x 24. Nothing is free.
- **C.** The leaves sort v, t (same x, v lower), then b. t sits at z 66, height 18; b at z 54, height 30. The bounds are 24–60 × 54–84 = 1080; t + b = 324 + 540 = 864, so the warning fires. The region touches the run's bottom on an upper, so it drops 0.75.

**Count:** 687 + 3 = **690**.

---

## §8 Step 219 — part numbers and opening dimensions

### `src/elevation/model/partNumbers.js` (236)

- Add `import { frameRegions } from './frames.js';` after the `cells.js` import (3).
- `runParts` (52–78): replace from `const cells = cellPieces(run, layout);` through the `.filter(…)` line with:

```js
    const cells = cellPieces(run, layout);
    const entries = blindEntries(room, view, run, settings, layout).entries;
    const cellWidths = blindCellWidths(cells.pieces, layout.pieces, entries);
    const blindPanels = new Set(entries
      .filter((entry) => entry.panel && entry.endPieceId)
      .map((entry) => entry.endPieceId));
    const inFrame = frameRegions(room, run, cells, settings).fillerIds;
    return partPieces(cells.pieces, settings)
      .filter((piece) => PART_KINDS.has(piece.kind) && piece.width > 1e-6
        && (!inFrame.has(piece.id) || blindPanels.has(piece.id)))
```

The `.map(…)` after it doesn't change. `wallBadgeGroups` doesn't change either: a badge is drawn only for a piece that has a number.

### `src/elevation/model/dimensions.js` (496)

- Imports: add `import { cellPieces } from './cells.js';` after the `bottoms.js` import (2), `import { runFaceLayouts } from './faceLayouts.js';` and `import { frameRegions } from './frames.js';` after the `corners.js` import (3).
- Before `horizontalChains` (170):

```js
/** A face frame region along its bottom row of openings: frame | opening | frame … (SPEC-36). */
function regionSegments(region, pieces, faceLayouts, runId) {
  const boxes = pieces.filter((piece) => region.cabinetIds.includes(piece.id));
  const bottom = Math.min(...boxes.map((piece) => piece.z));
  const openings = boxes
    .filter((piece) => Math.abs(piece.z - bottom) <= SEGMENT_EPSILON)
    .flatMap((piece) => {
      const own = faceLayouts.get(piece.id)?.openings ?? [];
      const low = Math.min(...own.map((opening) => opening.z));
      return own
        .filter((opening) => Math.abs(opening.z - low) <= SEGMENT_EPSILON)
        .map((opening) => ({ ...opening, pieceId: piece.id }));
    })
    .sort((a, b) => a.x - b.x);
  const segments = [];
  let cursor = region.x;
  for (const opening of openings) {
    if (opening.x < cursor - SEGMENT_EPSILON) continue;
    appendSegment(segments, cursor, opening.x, 'frame', { runId });
    appendSegment(segments, opening.x, opening.x + opening.width, 'frame-opening', {
      runId,
      pieceId: opening.pieceId,
    });
    cursor = opening.x + opening.width;
  }
  appendSegment(segments, cursor, region.x + region.width, 'frame', { runId });
  return segments;
}

/**
 * A run's segments on the inner chain: its pieces, a gap between boxes as its own segment, and each
 * face frame region as stile and opening segments in place of the pieces it covers (SPEC-36).
 */
function runInnerSegments(room, wall, run, settings, layout) {
  const cells = cellPieces(run, layout);
  const { regions } = frameRegions(room, run, cells, settings);
  const faceLayouts = regions.length > 0 ? runFaceLayouts(room, wall, run, settings, layout) : null;
  const regionOf = (piece) => regions.find((region) => piece.x >= region.x - SEGMENT_EPSILON
    && piece.x + piece.width <= region.x + region.width + SEGMENT_EPSILON);
  const segments = [];
  let cursor = null;
  const add = (start, end, kind, metadata) => {
    if (cursor !== null && start - cursor > SEGMENT_EPSILON) {
      appendSegment(segments, cursor, start, 'gap', { runId: run.id });
    }
    appendSegment(segments, start, end, kind, metadata);
    cursor = end;
  };
  const drawn = new Set();
  for (const piece of layout.pieces) {
    const region = regionOf(piece);
    if (region) {
      if (drawn.has(region.id)) continue;
      drawn.add(region.id);
      for (const { start, end, kind, ...metadata } of regionSegments(region, cells.pieces, faceLayouts, run.id)) {
        add(start, end, kind, metadata);
      }
      continue;
    }
    add(piece.x, piece.x + piece.width, 'piece', {
      runId: run.id,
      pieceId: piece.id,
      ...(runItems(run).find((item) => item.id === piece.id)?.pin ? { pinned: true } : {}),
    });
  }
  return segments;
}
```

- In `horizontalChains`, the inner loop's piece `for` (the `for (const piece of layout.pieces) { appendSegment(inner, …) }` block, 247–255) becomes:

```js
    inner.push(...runInnerSegments(room, wall, run, settings, layout));
```

  The `layout` above it and everything else in `horizontalChains` stays.

### Tests

**`src/elevation/model/__tests__/partNumbers.test.js`** (410), a describe at the end (1):

```js
describe('SPEC-36 frame fillers', () => {
  it('numbers no filler inside a face frame', () => {
    const roomOf = (style) => syncRoom({
      id: 'F', name: 'Room F', profile: { ...DEFAULT_SETTINGS.defaultProfile }, wallOrder: ['A'],
      ...(style ? { style } : {}),
      walls: [makeWall('A', 0, 0, 120, 0, { height: 96, runs: [aBase()] })],
    }, DEFAULT_SETTINGS);
    const keys = (room) => partNumbers(room, DEFAULT_SETTINGS).parts
      .filter((part) => part.runId === 'A-base')
      .map((part) => part.key);
    expect(keys(roomOf())).toEqual(['A-base:left', 'a1', 'a2', 'A-base:right']);
    expect(keys(roomOf({ cabinetStyleId: 14 }))).toEqual(['A-base:left', 'a1', 'a2']);
  });
});
```

(`aBase` is end panel 0.75 | a1 28.125 | a2 28.125 | filler 3 = 60. In an inset room the filler touches a2, so it's a stile.)

**`src/elevation/model/__tests__/dimensions.test.js`** (767), a describe at the end (1):

```js
describe('SPEC-36 opening dimensions', () => {
  const wallOf = (room) => room.walls.find(({ id }) => id === 'A');
  const F = cabinetRun('F', CABINET_TYPE_IDS.BASE, {
    x: 24, width: 36, heightMode: 'manual', autoCount: false,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    items: [{ id: 'a', kind: 'cabinet', width: 18 }, { id: 'b', kind: 'cabinet', width: 18 }],
  });

  it('dimensions a face frame stile to opening, and a gap between boxes', () => {
    const inset = { ...roomR({ wallA: { runs: [F] } }), style: { cabinetStyleId: 14 } };
    expect(horizontalChains(inset, wallOf(inset), 'lower', DEFAULT_SETTINGS).inner).toEqual([
      { start: 0, end: 24, kind: 'open' },
      { start: 24, end: 25.5, kind: 'frame', runId: 'F' },
      { start: 25.5, end: 41.25, kind: 'frame-opening', runId: 'F', pieceId: 'a' },
      { start: 41.25, end: 42.75, kind: 'frame', runId: 'F' },
      { start: 42.75, end: 58.5, kind: 'frame-opening', runId: 'F', pieceId: 'b' },
      { start: 58.5, end: 60, kind: 'frame', runId: 'F' },
      { start: 60, end: 120, kind: 'open' },
    ]);

    const spaced = {
      ...F, width: 36.5, _seamGap: 0.5,
      items: [{ id: 'a', kind: 'cabinet', width: null }, { id: 'b', kind: 'cabinet', width: null }],
    };
    const euro = roomR({ wallA: { runs: [spaced] } });
    expect(horizontalChains(euro, wallOf(euro), 'lower', DEFAULT_SETTINGS).inner.slice(1, 4)).toEqual([
      { start: 24, end: 42, kind: 'piece', runId: 'F', pieceId: 'a' },
      { start: 42, end: 42.5, kind: 'gap', runId: 'F' },
      { start: 42.5, end: 60.5, kind: 'piece', runId: 'F', pieceId: 'b' },
    ]);
  });
});
```

(Worked example A: stile 1 1/2 | opening 15 3/4 | 1 1/2 | 15 3/4 | 1 1/2. The European run: 36.5 − 0.5 = 36, so 18 each.)

**Count:** 690 + 2 = **692**.

---

## §9 Step 220 — on screen

### New `src/elevation/components/FrameOutline.jsx`

```jsx
import { Shape } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';

const FRAME_FILL = '#a8a29e';
const FRAME_STROKE = '#e7e5e4';

/**
 * One face frame region (SPEC-36): the frame filled, each opening cut out. Drawn under the pieces
 * (framed ones are see-through), so clicks and the selection outline stay on the pieces.
 */
export default function FrameOutline({ region, openings, transform }) {
  const outer = wallRectToScreen(region, transform);
  const holes = openings.map((opening) => wallRectToScreen(opening, transform));
  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        context.rect(outer.x, outer.y, outer.width, outer.height);
        for (const hole of holes) {
          // Wound the other way round, so the non-zero fill leaves each opening empty.
          context.moveTo(hole.x, hole.y);
          context.lineTo(hole.x, hole.y + hole.height);
          context.lineTo(hole.x + hole.width, hole.y + hole.height);
          context.lineTo(hole.x + hole.width, hole.y);
          context.closePath();
        }
        context.fillStrokeShape(shape);
      }}
      fill={FRAME_FILL}
      opacity={0.85}
      stroke={FRAME_STROKE}
      strokeWidth={1}
      listening={false}
    />
  );
}
```

### `src/elevation/components/RunGroup.jsx` (580)

- Imports: `import { frameRegions } from '../model/frames.js';` after the `faceLayouts.js` import (17); `import FrameOutline from './FrameOutline.jsx';` after the `FaceOutlines.jsx` import (35).
- After `faceLayouts` (69–72):

```js
  const frames = useMemo(
    () => frameRegions(room, run, cells, settings),
    [cells, room, run, settings],
  );
  const framedIds = useMemo(() => new Set(frames.regions.flatMap((region) => [
    ...region.cabinetIds, ...region.fillerIds, ...region.panelIds,
  ])), [frames]);
```

- Right before `{drawnPieces.map((piece) => (` (423):

```jsx
      {frames.regions.map((region) => (
        <FrameOutline
          key={region.id}
          region={region}
          openings={region.cabinetIds.flatMap((id) => faceLayouts.get(id)?.openings ?? [])}
          transform={transform}
        />
      ))}
```

- `<PieceRect …>` gains `framed={framedIds.has(piece.id)}`.

### `src/elevation/components/PieceRect.jsx` (127)

- Props gain `framed = false,` after `subLabel = null,`.
- The `<Rect>` (51–58):

```jsx
      <Rect
        {...rect}
        fill={framed
          ? 'rgba(0, 0, 0, 0.001)'
          : hollow ? 'transparent' : cornerFiller ? '#fbbf24' : KIND_COLORS[piece.kind]}
        opacity={0.82}
        dash={piece.kind === 'void' ? [6, 4] : undefined}
        stroke={framed && outline === '#1e293b'
          ? undefined
          : piece.kind === 'void' && outline === '#1e293b' ? KIND_COLORS.void : outline}
        strokeWidth={selected ? 3 : error || warning ? 2 : 1}
      />
```

A framed piece is see-through and has no edge unless it's selected or has a warning. Its width label stays.

### `src/elevation/components/properties/CabinetStyleProperties.jsx` (67)

- Imports from `'../../model/index.js'` add `isInsetStyle`.
- Right after `<StyleFields … />`:

```jsx
      {isInsetStyle(faceLayout.style) && faceLayout.box && (
        <p className="text-xs text-gray-400">
          {`Box ${formatInches(faceLayout.box.width)} wide`}
        </p>
      )}
```

No new tests (components). **Count stays 692.**

**Done when (round):** `npm test` (692) and `npm run lint` clean.

## §10 Left for 36.1 and later (not in this round)

- **36.1:** vertical opening chains (rail | opening | rail); the per-split rail/mullion toggle (drawers with no rail between them; a shared opening's gap 0 square or 1/16 profiled); a 3/4" bottom rail on hanging bases.
- The run's seam gap applies only to columns; a gap between stacked boxes is set per row.
- `resolvePinnedSpan` ignores gaps when it grows a free end toward a pin, and auto count doesn't count the gaps its new cabinets add. Both can be off by a gap.
- **Beaded end stiles:** with 3/4" box-to-opening everywhere, a beaded stile at a free end or over a 3/4" end panel is 1 1/2" including the bead. If the shop wants 1 1/2" flat plus the bead there, that's an end-side reveal rule.
- A blind *panel* end (SPEC-28/29) in a face frame run keeps its part number but is drawn under the frame like a filler.
- The frame isn't a part in reports yet, and neither are its stiles and rails (later, with reports).
- Plan view shows gaps (the pieces move apart) but no frame.
