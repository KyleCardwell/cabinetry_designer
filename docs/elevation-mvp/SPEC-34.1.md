# Elevation Lab — SPEC-34.1 (cells: kinds everywhere, panel types, add panel)

Steps 177–181, a short fix round before round 35. The earlier SPEC files still apply; this file is the
source of truth for what follows. The repo is at `a25c393` (step 176) on `elevation-grid-run-split`, with
**600** tests passing.

Why: in round 34 only nested cells could change kind, and there was no way to add a single panel. Wrap a
cabinet, delete one side panel, and the only way back was to rebuild the column. This round makes kind work on
every cell, adds a panel type, and adds "Add panel left / right / above / below".

Unlike SPEC-34, this round was **not** built before it was written. The code blocks and expected values were
worked out against the code at `a25c393`. If a test disagrees with the code by a small amount, check the
SPEC's arithmetic before changing the code, and say so in the summary.

| Step | What | Files |
|---|---|---|
| **177** | Solver: panel, void and shelves columns can be auto width; only side panels capture a cabinet. | `splitRun.js`, `capture.js`, `cells.js`, 3 test files |
| **178** | Model: kind and depth on top-level cells; panel type (side / top-bottom / back); add a panel beside a cell. | `cellTree.js`, `index.js`, 1 new test, `cellKinds.test.js` (3 lines) |
| **179** | Saves accept top-level panel, void and shelves columns. | `persistence.js`, its test |
| **180** | Store: `setCellKind` at the top level, `setPanelType`, `addPanel`. | slice, slice test |
| **181** | Panel UI: one Kind / Panel type / Add panel section for every cell; tidier cell panel. | 5 files in `properties/` (1 new) |

## After this round you can

- Pick **Kind** on any cabinet, including a top-level one: Cabinet, Panel, Open, Floating shelves.
- Pick a **Panel type**: **Side** (width 3/4"), **Top/bottom** (height 3/4"), or **Back** (width and height
  auto, depth 3/4", backs in line). You're offered Side for a cell in a row or its own column, Top/bottom for a
  cell in a stack, Back anywhere.
- **Add panel** left, right, above or below any cell: a 3/4" side or top/bottom panel that joins the row or
  stack it's in, or nests the cell when there isn't one.
- A top-level back panel, open space or shelves column shares the leftover width like an auto cabinet.
- A cabinet next to a top-level side panel gets the captured reveals (REV-005/006); a back panel doesn't
  capture anything.

## Not in this round

- Plan view: top-level panel, open and shelves columns draw no face line in plan (the run's footprint is
  unchanged). Round 35 touches plan footprints for `outset`; it can add them then.
- Auto count still only adds and removes cabinets. Changing a top-level cell's kind, or adding a top-level side
  panel, turns auto count off (as a top-level split already does).

---

## §1 Decisions

**Panel type is derived, not stored.** A panel's type is still `panelOrientation(piece)`: its thinnest
dimension. Choosing a type just sets sizes so that dimension is the thin one:

| Type | Offered when the cell's own track is… | Sets |
|---|---|---|
| `side` | a column (a top-level cell, or a cell in a row) | its track `size: thickness, sizeMode: 'manual'`; removes `depth`, `align` |
| `top` | a row (a cell in a stack) | the same, on its row track |
| `back` | anywhere | its track auto; `depth: thickness`, `align: 'back'` |

Left vs right and top vs bottom come from where the panel sits, so there's nothing else to store.

**Choosing Kind = Panel** applies the default type at once: `top` for a cell in a stack, `side` otherwise.

**Leaving Panel** (to any other kind) makes the cell's track auto again and drops `depth` and `align`, so a
back panel turned into a cabinet doesn't stay 3/4" deep. (Round 34 kept them; one test line changes.)

**Auto width for non-cabinets.** In `splitRun`, an item is auto when `width === null` and its kind is
`cabinet`, `panel`, `void` or `shelves`. Fillers never are. Width warnings (`wide-cabinet`,
`narrow-cabinet`, `widths-not-rounded`) stay cabinet-only. `syncAutoItems` counts and removes auto
**cabinets** only.

**Top-level pieces carry their cell settings.** An item piece from `splitRun` copies `depth` (instead of the
run's), `align` and `shelves` when the item has them, so `shelfParts`, `panelOrientation` and part numbers
work for top-level cells exactly as for nested ones. A non-filler, non-cabinet item's `cabinetTypeId` is the
run's (as nested cells already are).

**Capture needs a side panel.** `capture.js` treats a neighbour as panel-like when it's a filler, an end
panel, a **side** panel (`panelOrientation(neighbor) === 'side'`) or deeper. `cellCaptureSides` only counts
side panels too.

**Add panel** (`addGridPanel`), for any cell of a cell kind (not a filler), with `thickness` =
`settings.endPanelThickness`:

- top-level cell, left/right → a new top-level column `{ id, kind: 'panel', width: thickness }` beside it
  (`insertRootColumn`); one `makeId` call;
- nested cell whose parent runs the same way (left/right in a row, above/below in a stack) → **flat**: a new
  fixed track `{ id, size: thickness, sizeMode: 'manual' }` and a panel cell beside it; the other tracks are
  unchanged; `makeId` order: track, then leaf;
- otherwise → **nest**: the cell becomes a two-cell grid; `makeId` order: grid id, cross track, the two tracks
  in visual order (left→right, top→bottom), the panel leaf. At the top level the column id follows
  (`${grid.id}:col`).
- Blind re-homes as for every structural edit (`rehomeBlind`); a panel added outside a blind cell takes the
  run's edge, and the blind is dropped (panels never take one).

---

## §2 Step 177 — solver, capture

### splitRun.js (541 lines, unchanged since round 32)

Add near the top (after `FILLER_END_TYPES`, line 8):

```js
const AUTO_KINDS = new Set(['cabinet', 'panel', 'void', 'shelves']);

/** An item that shares leftover width: a cabinet or cell kind with no width. Never a filler. */
function isAutoItem(item) {
  return item.width === null && AUTO_KINDS.has(item.kind);
}

/** A top-level cell's own settings, copied onto its piece. */
function itemExtras(item) {
  return {
    ...(item.depth !== undefined ? { depth: item.depth } : {}),
    ...(item.align !== undefined ? { align: item.align } : {}),
    ...(item.shelves !== undefined ? { shelves: { ...item.shelves } } : {}),
  };
}
```

Then, by line:

- `layoutInputs` (24–50): `nAuto = items.filter(isAutoItem).length`; also compute
  `nAutoCabinets = items.filter((item) => item.kind === 'cabinet' && item.width === null).length` and return it.
- `splitRunLegacy`, the rounding warning (122–130): keep `firstAuto` as the first auto **cabinet**; push the
  `widths-not-rounded` warning only `if (firstAuto)`.
- `computedItems` (138–149): the non-auto branch is `if (!isAutoItem(item))`.
- The width-warning loop (152–168): `if (!item.auto || item.kind !== 'cabinet') continue;`
- The item raw piece (220–231): `cabinetTypeId: item.kind === 'filler' ? CABINET_TYPE_IDS.FILLER : run.cabinetTypeId,`
  and `...itemExtras(item),` after `auto`.
- Positioning (235–245): `depth: piece.depth ?? (piece.kind === 'end_panel' ? settings.endPanelThickness : run.depth),`
- `positionedItemPiece` (273–289): the same `cabinetTypeId` rule, `...itemExtras(item),` after `auto`, and
  `depth: item.depth ?? run.depth,`.
- `cabinetWidthWarnings` (291–293): `if (!auto || item.kind !== 'cabinet') return [];`
- `interiorLayout` (312–352): `autos = items.filter(isAutoItem)` (318) and `const auto = isAutoItem(item);` (340).
- `syncAutoItems` (508–541): destructure `nAutoCabinets` and use it wherever `nAuto` is used (523, 527).

Leave `itemMinimum`, `runWidthRange`, the pin logic (pins stay cabinet-only) and `splitRun` itself alone.

### capture.js (44)

`import { panelOrientation } from './cells.js';` and `isPanelLike` (3–9) gains
`|| panelOrientation(neighbor) === 'side'` after the `end_panel` line.

### cells.js (240)

`cellCaptureSides` (194–203): the filter also requires `panelOrientation(candidate) === 'side'`
(`panelOrientation` is declared further down the file; it's a hoisted function).

### Tests

`splitRun.test.js` (460) — a new describe at the end:

```js
describe('SPEC-34.1 auto cell kinds', () => {
  const NONE = { type: 'none', width: null };
  const kindRun = (width, items, overrides = {}) => ({
    id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width, z: 4, height: 30.5, depth: 24,
    ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null, items, ...overrides,
  });

  it('shares auto width with panel, void and shelves items', () => {
    const layout = splitRun(kindRun(60, [
      { id: 'a', kind: 'cabinet', width: null },
      { id: 'p', kind: 'panel', width: null, depth: 0.75, align: 'back' },
      { id: 'c', kind: 'cabinet', width: 20 },
    ]), DEFAULT_SETTINGS);
    expect(layout.pieces.map(({ id, kind, x, width, depth }) => [id, kind, x, width, depth])).toEqual([
      ['a', 'cabinet', 0, 20, 24], ['p', 'panel', 20, 20, 0.75], ['c', 'cabinet', 40, 20, 24],
    ]);
    expect(layout.pieces[1]).toEqual({
      id: 'p', kind: 'panel', role: 'item', cabinetTypeId: CABINET_TYPE_IDS.BASE, width: 20, auto: true,
      align: 'back', x: 20, z: 4, height: 30.5, depth: 0.75,
    });
    expect(layout.warnings).toEqual([]);
    expect(layout.errors).toEqual([]);
  });

  it('never warns about the width of a panel', () => {
    const layout = splitRun(kindRun(36.75, [
      { id: 'a', kind: 'cabinet', width: 36 },
      { id: 'p', kind: 'panel', width: null },
    ]), DEFAULT_SETTINGS);
    expect(layout.pieces.map(({ id, width }) => [id, width])).toEqual([['a', 36], ['p', 0.75]]);
    expect(layout.warnings).toEqual([]);
  });

  it('auto count never removes a panel', () => {
    const synced = syncAutoItems(kindRun(30, [
      { id: 'a', kind: 'cabinet', width: null },
      { id: 'b', kind: 'cabinet', width: null },
      { id: 'p', kind: 'panel', width: null },
    ], { autoCount: true }), DEFAULT_SETTINGS);
    expect(synced.items.map(({ id }) => id)).toEqual(['a', 'p']);
  });
});
```

`faceLayouts.test.js` (110) — test 52 at the end of `describe('runFaceLayouts')`:

```js
  it('52. top-level side panels capture a cabinet; a back panel does not', () => {
    const PANELS = {
      ...RUN, id: 'run-4',
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      items: [
        { id: 'L', kind: 'panel', width: 0.75 },
        { id: 'a', kind: 'cabinet', width: 18 },
        { id: 'R', kind: 'panel', width: 0.75 },
      ],
    };
    const room = roomWith(PANELS);
    const a = runFaceLayouts(room, resolveWall(room, room.walls[0]), PANELS, DEFAULT_SETTINGS).get('a');
    expect(a.reveals.sources.left).toBe('rule:captured-single');
    expect(a.reveals.sources.right).toBe('rule:captured-single');
    expect(a.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 17.8125, height: 30.125 }]);

    const BACK = { ...PANELS, items: [PANELS.items[0], PANELS.items[1], { id: 'R', kind: 'panel', width: 0.75, depth: 0.5 }] };
    const backRoom = roomWith(BACK);
    const b = runFaceLayouts(backRoom, resolveWall(backRoom, backRoom.walls[0]), BACK, DEFAULT_SETTINGS).get('a');
    expect(b.reveals.sources.left).toBe('style');
    expect(b.reveals.sources.right).toBe('style');
  });
```

`cellKinds.test.js` (151) — one test at the end of the describe (import `cellCaptureSides` is already there):

```js
  it('only side panels capture a cell', () => {
    const side = { id: 'L', kind: 'panel', x: 0, z: 0, width: 0.75, height: 30, depth: 24 };
    const cab = { id: 'c', kind: 'cabinet', x: 0.75, z: 0, width: 20, height: 30, depth: 24 };
    const back = { id: 'B', kind: 'panel', x: 20.75, z: 0, width: 20, height: 30, depth: 0.75 };
    expect(cellCaptureSides([side, cab, back], 'c')).toEqual({ left: true, right: false });
  });
```

**Count:** 600 + 5 = **605**.

---

## §3 Step 178 — kind everywhere, panel type, add panel (model)

### cellTree.js (351)

- Import (1–2): add `insertRootColumn`.
- After `WRAP_THROUGH`:
  ```js
  /** Sides addGridPanel accepts. */
  export const PANEL_SIDES = ['left', 'right', 'above', 'below'];
  ```
- Replace `nestedLeaf` (251–256) with `cellLeaf` — the same without the `found.depth === 0` check — and use
  it in `setGridCellKind`, `setGridCellDepth`, `setGridShelves` (259, 273, 294). Their doc comments say "a
  cell's" instead of "a nested leaf's". Depth, align and shelves now work on top-level cells too.
- `setGridCellKind` (258–270) becomes:

```js
/**
 * Changes a cell's kind, keeping id, depth and align. A void keeps neither; neither does a former
 * panel, whose track also goes back to auto.
 */
export function setGridCellKind(grid, leafId, kind) {
  const found = cellLeaf(grid, leafId);
  if (!found || !CELL_KINDS.includes(kind) || found.cell.node.kind === kind) return grid;
  const leaf = found.cell.node;
  const wasPanel = leaf.kind === 'panel';
  const next = { id: leaf.id, kind };
  if (kind !== 'void' && !wasPanel) {
    if (Object.hasOwn(leaf, 'depth')) next.depth = leaf.depth;
    if (Object.hasOwn(leaf, 'align')) next.align = leaf.align;
  }
  if (kind === 'shelves') next.shelves = { ...DEFAULT_SHELVES };
  const replaced = replaceLeaf(grid, found, next);
  return wasPanel && found.track.size !== null
    ? setGridTrackSize(replaced, found.track.id, null)
    : replaced;
}
```

- Append:

```js
/** The panel types a cell could take: 'side' in a column or row, 'top' in a stack, 'back' anywhere. */
export function panelTypes(grid, leafId) {
  const found = cellLeaf(grid, leafId);
  if (!found) return [];
  return found.axis === 'row' ? ['top', 'back'] : ['side', 'back'];
}

/** Sizes a panel cell so its type's dimension is `thickness`; same reference when nothing changes. */
export function setGridPanelType(grid, leafId, type, thickness) {
  const found = cellLeaf(grid, leafId);
  if (!found || found.cell.node.kind !== 'panel') return grid;
  if (!panelTypes(grid, leafId).includes(type)) return grid;
  if (!(typeof thickness === 'number' && Number.isFinite(thickness) && thickness > 0)) return grid;
  const leaf = found.cell.node;
  const next = { id: leaf.id, kind: 'panel' };
  if (type === 'back') {
    next.depth = thickness;
    next.align = 'back';
  }
  const sameLeaf = Object.is(next.depth, leaf.depth) && next.align === leaf.align;
  const withLeaf = sameLeaf ? grid : replaceLeaf(grid, found, next);
  return setGridTrackSize(withLeaf, found.track.id, type === 'back' ? null : thickness);
}

/** Adds a `thickness` panel cell beside a cell: a top-level column, a flat sibling, or a nested pair. */
export function addGridPanel(grid, leafId, side, thickness, makeId) {
  if (!PANEL_SIDES.includes(side)) return grid;
  if (!(typeof thickness === 'number' && Number.isFinite(thickness) && thickness > 0)) return grid;
  const found = cellLeaf(grid, leafId);
  if (!found) return grid;
  const axis = side === 'left' || side === 'right' ? 'col' : 'row';
  const before = side === 'left' || side === 'above';
  if (found.depth === 0 && axis === 'col') {
    return insertRootColumn(grid, found.cell.col + (before ? 0 : 1),
      { id: makeId(), kind: 'panel', width: thickness });
  }
  let next;
  if (found.depth > 0 && found.axis === axis) {
    const { parent, cell } = found;
    const key = trackKey(axis);
    const at = cell[axis] + (before ? 0 : 1);
    const tracks = [...parent[key]];
    tracks.splice(at, 0, { id: makeId(), size: thickness, sizeMode: 'manual' });
    const panel = { ...cell, [axis]: at, node: { id: makeId(), kind: 'panel' } };
    const cells = parent.cells.map((entry) => (
      entry[axis] >= at ? { ...entry, [axis]: entry[axis] + 1 } : entry));
    next = replaceNestedGrid(grid, parent, { ...parent, [key]: tracks, cells: ordered([...cells, panel]) });
  } else {
    const id = makeId();
    const cross = autoTrack(makeId());
    const fixed = () => ({ id: makeId(), size: thickness, sizeMode: 'manual' });
    const tracks = before ? [fixed(), autoTrack(makeId())] : [autoTrack(makeId()), fixed()];
    const panel = { id: makeId(), kind: 'panel' };
    const nodes = before ? [panel, found.cell.node] : [found.cell.node, panel];
    next = replaceLeaf(grid, found, {
      id,
      cols: axis === 'col' ? tracks : [cross],
      rows: axis === 'row' ? tracks : [cross],
      cells: nodes.map((node, index) => ({ col: axis === 'col' ? index : 0,
        row: axis === 'row' ? index : 0, colSpan: 1, rowSpan: 1, node })),
    });
  }
  return rehomeBlind(grid, next);
}
```

(`trackKey`, `autoTrack`, `ordered`, `replaceNestedGrid`, `replaceLeaf` and `setGridTrackSize` already exist in
this file.)

### index.js

The `cellTree.js` block (272–288) adds `addGridPanel`, `PANEL_SIDES`, `panelTypes`, `setGridPanelType`.

### Tests

**`cellKinds.test.js`** — three existing lines change because top-level cells and former panels now behave
differently:
- line 32: `.toEqual({ id: 'b', kind: 'cabinet', depth: 0.75, align: 'back' });` → `.toEqual({ id: 'b', kind: 'cabinet' });`
- line 33: drop `['a', 'panel'], ` from the list.
- line 46: `setGridCellDepth(S, 'a', { depth: 12 })` → `setGridCellDepth(S, 'zz', { depth: 12 })`.

**`elevationSlice.test.js`** — line 2106 (round 34): `cellId: 'b', kind: 'panel'` → `cellId: 'b', kind: 'filler'`. The store's `setCellKind` calls `setGridCellKind`, so once the model allows top-level cells this round-34 assertion fails; it changes here, not in step 180.

**NEW `src/elevation/model/__tests__/cellPanels.test.js` (6):**

```js
import { describe, expect, it } from 'vitest';
import { gridFromItems, isGridShape, LEAF_KINDS, rootItems, runBlind } from '../grid.js';
import { addGridPanel, findLeaf, panelTypes, setGridCellKind, setGridPanelType,
  splitGridCell } from '../cellTree.js';

const ids = (prefix = 'n') => { let n = 0; return () => `${prefix}${++n}`; };
const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const F = (id) => ({ id, size: 0.75, sizeMode: 'manual' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const DOOR = { type: 'door', size: null };
const isLeaf = (leaf) => LEAF_KINDS.includes(leaf.kind);
const ROOT = gridFromItems('r', [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30, face: DOOR },
]);
// b split down: grid n1 (column n1:col, 30 manual), rows n3 (b, top) and n4 (n5, bottom)
const S = splitGridCell(ROOT, 'b', 'down', 2, ids());

describe('SPEC-34.1 kinds everywhere and panels', () => {
  it('changes a top-level cell\'s kind', () => {
    const open = setGridCellKind(ROOT, 'a', 'void');
    expect(open.cells[0].node).toEqual({ id: 'a', kind: 'void' });
    expect(open.cols[0]).toEqual(ROOT.cols[0]);
    const side = setGridPanelType(setGridCellKind(ROOT, 'a', 'panel'), 'a', 'side', 0.75);
    expect(side.cols[0]).toEqual({ id: 'a:col', size: 0.75, sizeMode: 'manual' });
    expect(side.cells[0].node).toEqual({ id: 'a', kind: 'panel' });
    const cabinet = setGridCellKind(side, 'a', 'cabinet');
    expect(cabinet.cols[0]).toEqual({ id: 'a:col', size: null, sizeMode: 'auto' });
    expect(cabinet.cells[0].node).toEqual({ id: 'a', kind: 'cabinet' });
    const filler = gridFromItems('f', [{ id: 'x', kind: 'filler', width: 3 }]);
    expect(setGridCellKind(filler, 'x', 'panel')).toBe(filler);
  });

  it('offers and sets panel types by the cell\'s axis', () => {
    const P = setGridCellKind(S, 'n5', 'panel');
    expect(panelTypes(P, 'n5')).toEqual(['top', 'back']);
    expect(panelTypes(P, 'a')).toEqual(['side', 'back']);
    expect(panelTypes(P, 'n1')).toEqual([]);
    expect(panelTypes(P, 'zz')).toEqual([]);
    const top = setGridPanelType(P, 'n5', 'top', 0.75);
    expect(top.cells[1].node.rows[1]).toEqual(F('n4'));
    expect(setGridPanelType(top, 'n5', 'top', 0.75)).toBe(top);
    expect(setGridPanelType(P, 'n5', 'side', 0.75)).toBe(P);
    expect(setGridPanelType(P, 'n5', 'top', 0)).toBe(P);
    expect(setGridPanelType(S, 'b', 'top', 0.75)).toBe(S);
    const back = setGridPanelType(top, 'n5', 'back', 0.75);
    expect(back.cells[1].node.rows[1]).toEqual(AUTO('n4'));
    expect(findLeaf(back, 'n5')).toEqual({ id: 'n5', kind: 'panel', depth: 0.75, align: 'back' });
    expect(findLeaf(setGridPanelType(back, 'n5', 'top', 0.75), 'n5')).toEqual({ id: 'n5', kind: 'panel' });
  });

  it('adds a panel beside a top-level cell', () => {
    expect(rootItems(addGridPanel(ROOT, 'b', 'left', 0.75, ids('p')))).toEqual([
      { id: 'a', kind: 'cabinet', width: null },
      { id: 'p1', kind: 'panel', width: 0.75 },
      { id: 'b', kind: 'cabinet', width: 30, face: DOOR },
    ]);
    expect(rootItems(addGridPanel(ROOT, 'b', 'right', 0.75, ids('p'))).map(({ id }) => id))
      .toEqual(['a', 'b', 'p1']);
    const below = addGridPanel(ROOT, 'a', 'below', 0.75, ids('p'));
    expect(below.cols[0]).toEqual({ id: 'p1:col', size: null, sizeMode: 'auto' });
    expect(below.cells[0].node).toEqual({
      id: 'p1', cols: [AUTO('p2')], rows: [AUTO('p3'), F('p4')], cells: [
        cell(0, 0, { id: 'a', kind: 'cabinet' }),
        cell(0, 1, { id: 'p5', kind: 'panel' }),
      ],
    });
    expect(isGridShape(below, isLeaf)).toBe(true);
  });

  it('adds a panel into a stack it belongs to', () => {
    const under = addGridPanel(S, 'n5', 'below', 0.75, ids('p'));
    expect(under.cells[1].node.rows).toEqual([AUTO('n3'), AUTO('n4'), F('p1')]);
    expect(under.cells[1].node.cells.map((entry) => [entry.row, entry.node.id]))
      .toEqual([[0, 'b'], [1, 'n5'], [2, 'p2']]);
    const over = addGridPanel(S, 'n5', 'above', 0.75, ids('p'));
    expect(over.cells[1].node.rows).toEqual([AUTO('n3'), F('p1'), AUTO('n4')]);
    expect(over.cells[1].node.cells.map((entry) => [entry.row, entry.node.id]))
      .toEqual([[0, 'b'], [1, 'p2'], [2, 'n5']]);
    expect(findLeaf(over, 'p2')).toEqual({ id: 'p2', kind: 'panel' });
  });

  it('nests a cell to add a panel across a stack', () => {
    const beside = addGridPanel(S, 'n5', 'left', 0.75, ids('p'));
    expect(beside.cells[1].node.cells[1].node).toEqual({
      id: 'p1', cols: [F('p3'), AUTO('p4')], rows: [AUTO('p2')], cells: [
        cell(0, 0, { id: 'p5', kind: 'panel' }),
        cell(1, 0, { id: 'n5', kind: 'cabinet' }),
      ],
    });
    expect(beside.cells[1].node.rows).toEqual(S.cells[1].node.rows);
  });

  it('leaves alone what it can\'t add to, and re-homes blind', () => {
    for (const [id, side, thickness] of [
      ['zz', 'left', 0.75], ['n1', 'left', 0.75], ['n5', 'up', 0.75], ['n5', 'left', Number.NaN],
    ]) {
      expect(addGridPanel(S, id, side, thickness, ids('p'))).toBe(S);
    }
    const filler = gridFromItems('f', [{ id: 'x', kind: 'filler', width: 3 }]);
    expect(addGridPanel(filler, 'x', 'left', 0.75, ids('p'))).toBe(filler);
    const blind = gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }], { left: 24, right: null });
    expect(runBlind({ grid: addGridPanel(blind, 'a', 'right', 0.75, ids('p')) }))
      .toEqual({ left: 24, right: null });
    expect(runBlind({ grid: addGridPanel(blind, 'a', 'left', 0.75, ids('p')) })).toBeUndefined();
  });
});
```

**Count:** 605 + 6 = **611**.

---

## §4 Step 179 — saves accept top-level cell kinds

**`persistence.js`** (601 lines):

- Pull the depth/align check out of `isCellLeaf` (~239) into its own function and use it there:
  ```js
  function isCellDepth(leaf) {
    return (leaf.depth === undefined || (isFiniteNumber(leaf.depth) && leaf.depth > 0))
      && (leaf.align === undefined || leaf.align === 'face' || leaf.align === 'back');
  }
  ```
- Add, above `isRunGrid` (261):
  ```js
  /** SPEC-34.1: a top-level column may be a cabinet, a filler, or any cell kind. */
  function isRootItem(item) {
    if (item.kind === 'filler') return isItem(item) && item.depth === undefined && item.align === undefined;
    if (item.kind === 'cabinet') return isItem(item) && isCellDepth(item);
    const { width, ...leaf } = item;
    return (width === null || (isFiniteNumber(width) && width > 0)) && isCellLeaf(leaf);
  }
  ```
- `isRunGrid` (268): `rootItems(grid).every(isRootItem)`; its comment says a root cell may be any kind.

(`rootItems` adds `pin` / `absorb` only when the column has them; `CELL_KIND_KEYS` doesn't list them, so a
pinned panel is rejected — pins stay cabinet-only.)

### Tests — `persistence.test.js` (901)

- Line 891, in round 34's rejects test: `node.kind = 'panel';` → `node.kind = 'shelf';` (a top-level panel is
  valid now; `shelf` is still no leaf kind).
- New describe at the end:

```js
describe('SPEC-34.1 top-level cell kinds', () => {
  function rootKindDocument() {
    const document = currentDocument();
    document.rooms[0].walls[0].runs[0].grid = gridFromItems('a', [
      { id: 'side', kind: 'panel', width: 0.75 },
      { id: 'cab', kind: 'cabinet', width: null, depth: 21, align: 'back' },
      { id: 'open', kind: 'void', width: null },
      { id: 'shelf', kind: 'shelves', width: null, shelves: { count: 2, back: false } },
      { id: 'back', kind: 'panel', width: null, depth: 0.75, align: 'back' },
    ]);
    return document;
  }

  it('saves and loads top-level panel, void and shelves columns', () => {
    expect(isElevationDocument(rootKindDocument())).toBe(true);
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(rootKindDocument())]]),
    };
    expect(loadElevationDocument()).toEqual(normalizeElevationDocument(rootKindDocument()));
  });

  it('rejects top-level cells that break the kind rules', () => {
    const rejects = (mutate) => {
      const document = rootKindDocument();
      mutate(document.rooms[0].walls[0].runs[0].grid.cells.map((entry) => entry.node));
      expect(isElevationDocument(document)).toBe(false);
    };
    rejects(([side]) => { side.face = { type: 'door', size: null }; });
    rejects(([side]) => { side.kind = 'shelf'; });
    rejects(([, cab]) => { cab.depth = 0; });
    rejects(([, , open]) => { open.depth = 3; });
    rejects(([, , , shelf]) => { delete shelf.shelves; });
  });
});
```

**Count:** 611 + 2 = **613**.

---

## §5 Step 180 — store

`elevationSlice.js` (1597 lines at `a25c393`):

1. `cellTree.js` import (the block ending `} from '../model/cellTree.js';`): add `addGridPanel`, `setGridPanelType`.
2. `setCellKind` (1335–1345) becomes:
   ```js
    setCellKind(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, kind } = action.payload;
      const before = location.run.grid;
      const found = findCell(before, cellId);
      let grid = setGridCellKind(before, cellId, kind);
      if (grid === before) return;
      if (kind === 'panel') {
        grid = setGridPanelType(grid, cellId, found.axis === 'row' ? 'top' : 'side',
          state.settings.endPanelThickness);
      }
      location.run.grid = grid;
      if (found.depth === 0) location.run.autoCount = false;
      if (state.selection.pieceId === cellId && kind !== 'cabinet') state.facePath = null;
      syncRoomAt(state, location.roomIndex);
    },
   ```
3. Two reducers right after `wrapCell` (1374):
   ```js
    setPanelType(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, type } = action.payload;
      const before = location.run.grid;
      const grid = setGridPanelType(before, cellId, type, state.settings.endPanelThickness);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
    addPanel(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, side } = action.payload;
      const before = location.run.grid;
      const found = findCell(before, cellId);
      const grid = addGridPanel(before, cellId, side, state.settings.endPanelThickness, uuid);
      if (grid === before) return;
      location.run.grid = grid;
      if (found.depth === 0 && (side === 'left' || side === 'right')) location.run.autoCount = false;
      syncRoomAt(state, location.roomIndex);
    },
   ```
4. Actions list: after `wrapCell,` (1581) add `setPanelType,` and `addPanel,`.

### Tests — `elevationSlice.test.js` (2144)

- (Line 2106 was changed in step 178.)
- Import `addPanel` and `setPanelType` into the existing import list.
- New describe at the end:

```js
describe('SPEC-34.1 panel reducers', () => {
  const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
  const start = (overrides = {}) => stateWithRun(run({
    autoCount: true, items: [fixed('a', 30), auto('b')], ...overrides,
  }));
  const stackOf = (state) => currentRun(state).grid.cells[0].node;
  const leafOf = (state, id) => gridLeaves(currentRun(state).grid).find((leaf) => leaf.id === id);

  it('turns a top-level cabinet into a side panel, a back panel, and back', () => {
    let state = elevationReducer(start(), setCellKind({ ...actionBase, cellId: 'a', kind: 'panel' }));
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'panel' });
    expect(currentRun(state).grid.cols[0]).toEqual({ id: 'a:col', size: 0.75, sizeMode: 'manual' });
    expect(currentRun(state).autoCount).toBe(false);
    state = elevationReducer(state, setPanelType({ ...actionBase, cellId: 'a', type: 'back' }));
    expect(currentRun(state).grid.cols[0]).toEqual({ id: 'a:col', size: null, sizeMode: 'auto' });
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'panel', depth: 0.75, align: 'back' });
    state = elevationReducer(state, setCellKind({ ...actionBase, cellId: 'a', kind: 'cabinet' }));
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'cabinet' });
  });

  it('gives a stacked panel the top/bottom type', () => {
    let state = elevationReducer(start({ autoCount: false }), splitCell({
      ...actionBase, cellId: 'a', direction: 'down', count: 2,
    }));
    const lower = stackOf(state).cells[1].node.id;
    const trackId = stackOf(state).rows[1].id;
    state = elevationReducer(state, setCellKind({ ...actionBase, cellId: lower, kind: 'panel' }));
    expect(stackOf(state).rows[1]).toEqual({ id: trackId, size: 0.75, sizeMode: 'manual' });
    expect(elevationReducer(state, setPanelType({ ...actionBase, cellId: lower, type: 'side' }))).toBe(state);
  });

  it('adds panels beside and above cells', () => {
    let state = elevationReducer(start(), addPanel({ ...actionBase, cellId: 'b', side: 'left' }));
    const items = runItems(currentRun(state));
    expect(items.map(({ kind }) => kind)).toEqual(['cabinet', 'panel', 'cabinet']);
    expect(items[1].width).toBe(0.75);
    expect(items[2].id).toBe('b');
    expect(currentRun(state).autoCount).toBe(false);
    state = elevationReducer(state, addPanel({ ...actionBase, cellId: 'a', side: 'above' }));
    expect(stackOf(state).rows.map(({ size }) => size)).toEqual([0.75, null]);
    expect(stackOf(state).cells.map((entry) => entry.node.kind)).toEqual(['panel', 'cabinet']);
  });
});
```

**Count:** 613 + 3 = **616**.

---

## §6 Step 181 — one Kind / Panel type / Add panel section

**NEW `components/properties/CellKindSection.jsx`** (~90 lines) — `({ wall, run, piece, item })`:
- `KIND_OPTIONS` (moved here from CellProperties): Cabinet / Panel / Open (nothing) / Floating shelves →
  `setCellKind({ wallId, runId, cellId: item.id, kind })`.
- When `item.kind === 'panel'`: a **Panel type** select. Options: `panelTypes(run.grid, item.id)`, plus the
  current `panelOrientation(piece)` if it isn't in that list (a panel sized by hand). Labels: Side, Top /
  bottom, Back. Value: `panelOrientation(piece)`. → `setPanelType({ …, type })`.
- **Add panel**: four buttons in one row, Left / Right / Above / Below → `addPanel({ …, side })`.
- Heading "Kind"; the button class from `CellSplitSection` and the select class CellProperties uses.

**`CellProperties.jsx`** (239):
- Remove `KIND_OPTIONS`, `ORIENTATION_LABELS` (25–31), `orientation` (54), the Kind select and the orientation
  line (60–74), and `setCellKind` / `panelOrientation` from the imports if nothing else uses them.
- Render `<CellKindSection wall={wall} run={run} piece={piece} item={item} />` first; the old Cell section
  follows with the heading **Size**.
- Order after that: Column (nested only, as now), Depth, Shelves, Blind, Split, Wrap, Faces.
- `CellSplitSection` (223): `nested={context.depth > 0} removable canSplit={isCabinet}`.

**`CellSplitSection.jsx`** (88): new prop `removable = nested`. The bottom row shows **Make equal** and
**Unsplit** only when `nested`, and **Remove cell** when `removable`; the row renders when either is true.

**`CabinetProperties.jsx`** (275) — a top-level cabinet: import `CellKindSection`; render
`<CellKindSection wall={wall} run={run} piece={piece} item={item} />` right above `CellSplitSection` (237).

**`PieceProperties.jsx`** (127): the `if (piece.columnId)` branch (~97) becomes
`if (piece.columnId || item.kind !== 'cabinet')` — a top-level panel, open or shelves column gets the cell
panel (the filler branch above it is unchanged).

No tests. **Count stays 616.**

**Done when (round):** `npm test` (616) and `npm run lint` clean; rooms drawn before this round look the same.

## Open after this round

1. Plan view face lines for top-level panel columns (with round 35's outset work).
2. Carried from SPEC-34: floating shelf thickness (1 1/2" assumed); reveal for a cabinet under a top panel.
