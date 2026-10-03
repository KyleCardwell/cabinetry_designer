# Elevation Lab — SPEC-33 (cells round 33: vertical split)

Steps 162–169. The earlier SPEC files still apply; this file is the source of truth for what follows.
The design is `docs/elevation-mvp/CELLS-PLAN.md`, round 33. SPEC-32 is done: the repo is at `a6aea33`
(step 161) on `elevation-grid-run-split`, with **543** tests passing.

Round 32 made every run store `run.grid`: one row, one column per cabinet or filler. Round 33 lets a
cell be split, so a run can hold a cabinet over a cabinet, a 72" over two 36"s, or a stack of three.

| Step | What | Files |
|---|---|---|
| **162** | `model/cellTree.js`: split, remove, equalize, unsplit, size. `grid.js` learns split columns and edge blinds. Nothing calls it yet. | 1 new + test, `grid.js`, `model/index.js` |
| **163** | `model/cells.js`: resolve a run's cells into rectangles (pieces), grids for chains, stacked neighbours, blind widths. `syncAutoItems` never removes a split column. | 1 new + test, `splitRun.js` (1 line), `model/index.js` |
| **164** | Stacked-seam reveals (REV-009/010) with source `rule: stacked seam`; face layouts per cell. | `styles.js`, `constants.js`, `faceLayouts.js`, `persistence.js` (2 lines), 2 test files |
| **165** | Part numbers and badges per cell; cell warnings in room diagnostics. | `partNumbers.js`, `room.js` (2 lines), 1 test file |
| **166** | Saves accept split columns. | `persistence.js`, its test |
| **167** | Store: `splitCell`, `removeCell`, `equalizeCells`, `unsplitCell`, `setTrackSize`; face, style and reveal edits reach nested cells. | slice, slice test |
| **168** | Draw and select cells; the cell panel with split, remove, equal, unsplit and sizes. | `RunGroup`, `PropertiesPanel`, `helpers`, 4 files in `properties/` (2 new), 1 test file |
| **169** | Cell chains drawn on the run; sizes typed on the chains; Delete removes a cell. | 2 new components, `RunGroup`, `DimensionRow`, `ElevationCanvas` |

Order matters: 166 (saves accept split columns) lands before 167/168 make them possible, so a saved
room with a split can never fail to load.

## After this round you can

- Select a cabinet and split it **down** into 2–8 stacked cabinets, or **across** into 2–8 side by side.
  Split any of those again, either way.
- Type a cell's height or width, lock and unlock it, make a stack equal, remove a cell, undo a split.
- See each split column's own dimension chain inside the run, and click a chain value to type it.
- Get a part number per cell, ordered left edge then bottom edge.
- Stacked boxes get the shop's seam reveals automatically (Euro 0" upper bottom / 1/8" lower top;
  face frame 3/4" each side of a shared 1 1/2" rail), shown with the source `rule: stacked seam`.
- Draw the too-tall cabinet, the 72" over two 36"s, and the three-box oven stack (its depth is 34).

## Not in this round

- More than one root row, spans, rows × columns in one split, combine (38). The root grid stays one row;
  a vertical split always nests inside a root column.
- Cell kinds beyond `cabinet` (34). Only cabinets split; fillers stay whole-height root columns.
- `depth`, `align`, gaps between boxes (34). Joins above and below (35). Face frame drawing (36).
- **Blind per cell.** A blind still belongs to the whole outer column: every cell on the column's outer
  edge carries it (§1). Choosing which stacked cells are blind waits for 34.
- Pinning a split column. A pin set before the split stays on the column; to change it, unsplit first.
- Plan view: a split column draws as one box, as now.

---

## §1 Decisions beyond CELLS-PLAN

**The root stays one row.** Splitting a root cell *across* adds root columns (they are solved by
`splitRun`, like every column today). Splitting it *down* turns the root cell's node into a nested
grid. Nested grids are **one-dimensional** in 33: one column of 2+ rows (a stack) or one row of 2+
columns. A 1×1 grid never exists: it collapses into its only child.

**Axis.** A grid's axis is `'row'` when it has more than one row, otherwise `'col'`. The root grid's
axis is `'col'`. A cell's *track* is the track on its parent's axis: `rows[cell.row]` or
`cols[cell.col]`.

**Rows run top to bottom**, as face stacks do: row 0 is the top cell.

**Split = keep the original, add siblings.** The original leaf stays as the first new cell with its id
and every key (face, style, reveals). New leaves are `{ id, kind: 'cabinet' }`, plus a copy of the
original's `style` when it has one. Selection, part-number overrides and faces stay on the original.

- Same direction as a nested parent (`down` in a stack, `across` in a row): **flat** — the new cells
  are siblings in that parent, and the original's track becomes auto.
- Otherwise: **nest** — the cell's node becomes a new grid; the cell's own track is unchanged.
- At the root, `across` is flat (new root columns); `down` nests.
- Only `cabinet` leaves split. Count is rounded and clamped to 2…8 (`MAX_CELL_SPLIT`).

**Ids.** The store passes `uuid`; tests pass a counter. Every helper that creates ids takes `makeId`
and calls it in a fixed order (§2), so tests use literals.

**Root column ids follow their node.** Whenever a root cell's node changes identity (a leaf nests into
a grid, or a grid collapses back to one node) that column's track id becomes `` `${node.id}:col` ``,
keeping its size, sizeMode, pin and absorb. That's the id `gridFromItems`/`replaceRootItems` would give
it, so rebuilding root items never renames anything.

**The item view of a split column** is `{ id: grid.id, kind: 'cabinet', width, pin?, absorb?, grid }`.
The solver treats it as one cabinet column. `gridFromItems` / `replaceRootItems` put `item.grid` back as
the cell's node. So `syncAutoItems`, `insertRootColumn`, `removeRootColumn` and `mirrorGrid` carry split
columns through untouched. `syncAutoItems` never removes one (163).

**Blind is on the outer edge.** `setGridBlind(grid, side, width)` sets or clears the blind on **every
leaf touching that side** of the outer root column (its *edge leaves*, §2). For an unsplit column that's
the one leaf, exactly as in 32. `runBlind` reads the first edge leaf that has that side. Every
structural helper re-homes blind the same way `replaceRootItems` does: read `runBlind` first, strip
`blind` from every leaf in the tree, re-apply both sides with `setGridBlind`.

**Sizes.** Nested tracks share their length with plain auto/fixed sharing, like face groups: fixed tracks
take their size, auto tracks split the rest equally, and when every track is fixed the last one is
treated as auto. No rounding. `gap` stays inert.

**Neighbours come from positions.** A cell's stacked neighbours (REV-009/010) are found from resolved
rectangles in the same run. Its left/right capture (REV-006 captured single) is its column's capture,
kept only on a side where the cell touches the column's edge.

**Chains sit inside the split** (CELLS-PLAN Open 1, first answer): a stack's vertical chain is drawn
10px inside its left edge, a row's horizontal chain 10px above its bottom edge. Try it on a real room;
moving them is one constant in `CellChains.jsx`.

---

## §2 Step 162 — `grid.js` changes and `model/cellTree.js`

### grid.js

Line numbers at `a6aea33`.

- **Export `isNestedGrid`** (line 43; unchanged body).
- **`itemParts` (4–14):** skip `grid` as well as width/pin/absorb/blind when building the leaf; the
  node is `item.grid ?? leaf`, and the column id is `` `${item.id}:col` `` either way. Return
  `{ col, node }` and have `cellsFromParts` use `node`.
- **`rootItems` (93–102):** when the column's node is a nested grid, the item is
  `{ id: node.id, kind: 'cabinet', grid: node, width: col.size }` plus pin/absorb as today. Leaves
  unchanged.
- **New exports:**

```js
/** Every leaf under a node, depth first; a grid's cells in (row, col) order. Same references. */
export function gridLeaves(node)
/** The leaves touching a node's left or right edge, in (row, col) order. A leaf → [leaf]. */
export function edgeLeaves(node, side)
```

  A cell touches `left` when `cell.col === 0`, `right` when `cell.col + cell.colSpan === cols.length`;
  recurse into nested grids. Sort a **copy** of `cells` (reducers pass immer drafts). `gridLeaves` must
  return the leaf objects themselves, not copies — the slice mutates them.
- **`runBlind` (108–115):** `left` = `blind.left` of the first leaf in
  `edgeLeaves(<col 0 node>, 'left')` that has one; `right` likewise from the last column's node and
  `'right'`. Return shape unchanged.
- **`setGridBlind` (117–138):** same guards and same-reference rule, but the change is applied to every
  leaf in `edgeLeaves(<outer column node>, side)`, rebuilding the nested grids on the path immutably. A
  leaf whose blind empties loses the key.

Every existing grid test must still pass unchanged: for unsplit columns all of this is identical.

### cellTree.js (new)

Imports only from `./grid.js`. Pure; never mutates; returns the **same reference** when it changes
nothing (unknown id, grid id where a leaf is needed, filler, bad direction/count/size, root where the
helper needs a nested parent).

```js
export const MAX_CELL_SPLIT = 8;
export const CELL_DIRECTIONS = ['across', 'down'];

export function findCell(grid, nodeId)
// → { parent, cellIndex, cell, depth, axis, track } | null
//   parent: the grid whose cells contain it (the root grid itself at depth 0)
//   axis: parent.rows.length > 1 ? 'row' : 'col';  track: parent[axis === 'row' ? 'rows' : 'cols'][cell index on that axis]
//   nodeId may be a leaf id or a nested grid id
export function findLeaf(grid, leafId)            // the leaf node, or null (never a grid)
export function splitGridCell(grid, leafId, direction, count, makeId)
export function removeGridCell(grid, leafId)
export function equalizeGridCells(grid, leafId)   // every track on the leaf's parent axis → auto
export function unsplitGridCell(grid, leafId)     // the leaf's parent grid is replaced by the leaf
export function setGridTrackSize(grid, trackId, size)
```

**`splitGridCell`** — see §1 for flat vs nest. `n = min(8, max(2, round(count)))`; non-finite count,
unknown direction, a filler or a non-leaf → same reference.

- Root `across`: rebuild root items with `replaceRootItems`: the original column's item becomes
  `{ ...item, width: null }` (keeps pin and absorb), followed by n−1 new items `{ id: makeId(), kind:
  'cabinet', width: null, style? }`. `makeId` is called n−1 times.
- Flat (nested parent, same axis): the original track becomes `{ ...track, size: null, sizeMode:
  'auto' }`; n−1 new tracks `{ id: makeId(), size: null, sizeMode: 'auto' }` go right after it; then n−1
  leaves `{ id: makeId(), kind: 'cabinet', style? }`. Cells re-indexed in track order.
- Nest: `makeId` order is **grid id, the one track on the other axis, n tracks on the split axis, n−1
  leaf ids**. `down` → `{ id, cols: [cross], rows: [n tracks], cells }`; `across` → `{ id, cols: [n
  tracks], rows: [cross], cells }`. All tracks `{ id, size: null, sizeMode: 'auto' }`. At the root, the
  column's id becomes `` `${newGrid.id}:col` `` (§1).

**`removeGridCell`** — a root leaf → `removeRootColumn(grid, leafId)`. A nested leaf: drop its cell and
its track, re-index. If one cell is left, that cell's node replaces the parent grid in the grandparent's
cell (root column id follows, §1) — and if the survivor is itself a grid with the **same axis as a
nested grandparent**, its tracks and cells are spliced into the grandparent at that position instead
(the grandparent's track for that cell is dropped). Never flatten into the root grid.

**`equalizeGridCells`** — root leaf → same reference.
**`unsplitGridCell`** — root leaf → same reference. The kept leaf keeps every key.
**`setGridTrackSize`** — finds the track by id in the root or any nested grid. `null` → `{ size: null,
sizeMode: 'auto' }`; finite `> 0` → `'manual'`; anything else → same reference. Other keys (pin, absorb)
kept.

Every structural helper (split, remove, unsplit) re-homes blind (§1).

`model/index.js`: add `edgeLeaves, gridLeaves, isNestedGrid` to the `grid.js` export block, and a new
`export { … } from './cellTree.js';` block with all eight exports, alphabetical.

### Tests — `src/elevation/model/__tests__/cellTree.test.js` (13)

```js
import { gridFromItems, rootItems, replaceRootItems, insertRootColumn, mirrorGrid, runBlind,
  setGridBlind, gridLeaves, edgeLeaves, isGridShape, LEAF_KINDS } from '../grid.js';
import { findCell, findLeaf, splitGridCell, removeGridCell, equalizeGridCells, unsplitGridCell,
  setGridTrackSize } from '../cellTree.js';

const ids = (prefix = 'n') => { let n = 0; return () => `${prefix}${++n}`; };
const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const DOOR = { type: 'door', size: null };
const INSET = { cabinetStyleId: 14 };
const isLeaf = (leaf) => LEAF_KINDS.includes(leaf.kind);
const ROOT = gridFromItems('r', [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30, face: DOOR, style: INSET },
  { id: 'f', kind: 'filler', width: 3 },
], { left: 24, right: null });
// ROOT: cols a:col (auto), b:col (30 manual), f:col (3 manual); row r:row; leaf a has blind { left: 24 }
const S1 = splitGridCell(ROOT, 'b', 'down', 3, ids());
```

1. **splits a root cabinet down into a nested stack.** `S1.cols` `toEqual`
   `[ROOT.cols[0], { id: 'n1:col', size: 30, sizeMode: 'manual' }, ROOT.cols[2]]`; `S1.rows` `toEqual`
   `ROOT.rows`; `S1.cells[1].node` `toEqual`
   ```js
   { id: 'n1', cols: [AUTO('n2')], rows: [AUTO('n3'), AUTO('n4'), AUTO('n5')], cells: [
     cell(0, 0, { id: 'b', kind: 'cabinet', face: DOOR, style: INSET }),
     cell(0, 1, { id: 'n6', kind: 'cabinet', style: INSET }),
     cell(0, 2, { id: 'n7', kind: 'cabinet', style: INSET }),
   ] }
   ```
   `rootItems(S1)[1]` `toEqual` `{ id: 'n1', kind: 'cabinet', width: 30, grid: S1.cells[1].node }`;
   `isGridShape(S1, isLeaf)` true; `runBlind({ grid: S1 })` `{ left: 24, right: null }`.
2. **splits flat in the same direction.** `const flat = splitGridCell(setGridTrackSize(S1, 'n4', 12),
   'n6', 'down', 2, ids('m')).cells[1].node;` → `flat.rows` `toEqual` `[AUTO('n3'), AUTO('n4'),
   AUTO('m1'), AUTO('n5')]`; `flat.cells.map((c) => [c.row, c.node.id])` `toEqual` `[[0, 'b'], [1,
   'n6'], [2, 'm2'], [3, 'n7']]`; `flat.cells[2].node` `toEqual` `{ id: 'm2', kind: 'cabinet', style:
   INSET }`.
3. **nests across inside a stack.** `splitGridCell(S1, 'n7', 'across', 2, ids('m')).cells[1].node
   .cells[2].node` `toEqual` `{ id: 'm1', cols: [AUTO('m3'), AUTO('m4')], rows: [AUTO('m2')], cells:
   [cell(0, 0, { id: 'n7', kind: 'cabinet', style: INSET }), cell(1, 0, { id: 'm5', kind: 'cabinet',
   style: INSET })] }`.
4. **splits a root cabinet across into root columns.** `const across = splitGridCell(ROOT, 'b',
   'across', 3, ids());` → `rootItems(across)` `toEqual` `[{ id: 'a', kind: 'cabinet', width: null },
   { id: 'b', kind: 'cabinet', width: null, face: DOOR, style: INSET }, { id: 'n1', kind: 'cabinet',
   width: null, style: INSET }, { id: 'n2', kind: 'cabinet', width: null, style: INSET }, { id: 'f',
   kind: 'filler', width: 3 }]`; `runBlind({ grid: across })` `{ left: 24, right: null }`.
   `rootItems(splitGridCell(ROOT, 'a', 'across', 2, ids())).map((i) => i.id)` `['a', 'n1', 'b', 'f']`.
5. **leaves alone what it can't split.** Each is `toBe(ROOT)` (or `S1`): filler `'f'`; unknown `'zz'`;
   direction `'sideways'`; count `NaN`; grid id `splitGridCell(S1, 'n1', 'down', 2, ids())` → `S1`.
   Clamping: count `20` → `.cells[1].node.rows` length 8; count `1.4` → length 2.
6. **a blind follows the outer edge.** `const B = splitGridCell(ROOT, 'a', 'down', 2, ids());` → leaves
   `'a'` and `'n5'` both have `blind: { left: 24 }`; `runBlind({ grid: B })` `{ left: 24, right: null }`.
   `const B2 = splitGridCell(B, 'n5', 'across', 2, ids('m'));` → `findLeaf(B2, 'n5').blind` `{ left: 24
   }`, `findLeaf(B2, 'm5')` has no `blind` key. `setGridBlind(B2, 'left', 30)` → `a` and `n5` have
   `{ left: 30 }`, `m5` none. `setGridBlind(B2, 'left', null)` → `gridLeaves(result).some((l) =>
   'blind' in l)` false and `runBlind` `undefined`.
7. **removes a cell and collapses a stack of one.** `const less = removeGridCell(S1, 'n6');` → its
   `cells[1].node.rows` `[AUTO('n3'), AUTO('n5')]` and cell nodes `['b', 'n7']` at rows `0, 1`.
   `removeGridCell(less, 'n7')` `toEqual(ROOT)` (column id back to `'b:col'`, size 30 kept, blind on `a`).
   `rootItems(removeGridCell(ROOT, 'f')).map((i) => i.id)` `['a', 'b']`.
   `removeGridCell(S1, 'n1')` `toBe(S1)`.
8. **collapsing flattens a same-axis grid.**
   ```js
   let g = splitGridCell(S1, 'n6', 'across', 2, ids('m'));  // n6's cell → grid m1 [n6 | m5]
   g = splitGridCell(g, 'm5', 'down', 2, ids('k'));          // m5's cell → grid k1 [m5 / k5]
   g = removeGridCell(g, 'n6');                              // m1 keeps only k1 (down) → spliced into n1
   ```
   `g.cells[1].node.rows.map((t) => t.id)` `['n3', 'k3', 'k4', 'n5']`;
   `g.cells[1].node.cells.map((c) => [c.row, c.node.id])` `[[0, 'b'], [1, 'm5'], [2, 'k5'], [3, 'n7']]`;
   `isGridShape(g, isLeaf)` true.
9. **sizes and equalizes tracks.** `const sized = setGridTrackSize(S1, 'n4', 12);` →
   `sized.cells[1].node.rows[1]` `{ id: 'n4', size: 12, sizeMode: 'manual' }`.
   `setGridTrackSize(sized, 'n4', null)` `toEqual(S1)`; `equalizeGridCells(sized, 'n7')` `toEqual(S1)`.
   `toBe(S1)` for sizes `0`, `-2`, `NaN` and for track `'zz'`. Root:
   `setGridTrackSize(ROOT, 'a:col', 20).cols[0]` `{ id: 'a:col', size: 20, sizeMode: 'manual' }`.
   `equalizeGridCells(ROOT, 'a')` `toBe(ROOT)`.
10. **unsplits to the chosen cell.** `const one = unsplitGridCell(S1, 'n6');` → `one.cells[1].node`
    `{ id: 'n6', kind: 'cabinet', style: INSET }`, `one.cols[1]` `{ id: 'n6:col', size: 30, sizeMode:
    'manual' }`. Deeper: `unsplitGridCell(splitGridCell(S1, 'n7', 'across', 2, ids('m')), 'm5')
    .cells[1].node.cells[2].node` `{ id: 'm5', kind: 'cabinet', style: INSET }`.
    `unsplitGridCell(ROOT, 'a')` `toBe(ROOT)`.
11. **finds cells and leaves.** `findCell(S1, 'n6')` `toMatchObject({ cellIndex: 1, depth: 1, axis:
    'row', track: AUTO('n4') })` and its `parent` `toBe(S1.cells[1].node)`. `findCell(S1, 'a')` →
    `{ cellIndex: 0, depth: 0, axis: 'col', track: ROOT.cols[0] }`, `parent` `toBe(S1)`.
    `findCell(S1, 'n1')` → `{ cellIndex: 1, depth: 0, axis: 'col' }`. `findCell(S1, 'zz')` null.
    `findLeaf(S1, 'n7')` `{ id: 'n7', kind: 'cabinet', style: INSET }`; `findLeaf(S1, 'n1')` and
    `findLeaf(S1, 'zz')` null.
12. **lists leaves and edge leaves.** `gridLeaves(S1).map((l) => l.id)` `['a', 'b', 'n6', 'n7', 'f']`;
    `gridLeaves(S1)[1]` `toBe(S1.cells[1].node.cells[0].node)`. With `B2` from test 6:
    `edgeLeaves(B2.cells[0].node, 'left')` ids `['a', 'n5']`, `'right'` ids `['a', 'm5']`.
    `edgeLeaves(ROOT.cells[1].node, 'left')` `[ROOT.cells[1].node]`.
13. **root helpers carry split columns.** `replaceRootItems(S1, rootItems(S1))` `toEqual(S1)`.
    `insertRootColumn(S1, 0, { id: 'z', kind: 'cabinet', width: null })` → `cols[2].id` `'n1:col'`,
    `cells[2].node` `toEqual(S1.cells[1].node)`. `mirrorGrid(S1).cols.map((c) => c.id)`
    `['f:col', 'n1:col', 'a:col']`. Deep-freeze `ROOT` and `S1` (the helper from grid.test) and call every
    cellTree function on them without a throw.

**Count:** 543 + 13 = **556**.

---

## §3 Step 163 — `model/cells.js`

Imports only `isNestedGrid` from `./grid.js`. Pure.

```js
export const MIN_CELL_SIZE = 1;
export function resolveTracks(tracks, length)            // → number[]
export function cellPieces(run, layout)                  // → { pieces, grids, warnings }
export function stackedSides(pieces, pieceId)            // → { top, bottom }
export function blindCellWidths(pieces, columns, entries) // → Map<pieceId, boxWidth>
```

**`resolveTracks`** — §1 sharing: `isAuto(t, i) = t.size === null || (!anyAuto && i === last)`;
`autoSize = (length − fixed) / autoCount`. `[]` → `[]`. No rounding, no clamping (negative stays
negative; `cellPieces` warns).

**`cellPieces(run, layout)`** — walks `layout.pieces` in order. A piece whose `role === 'item'` and
whose root cell node (`run.grid?.cells.find((c) => c.row === 0 && c.node.id === piece.id)?.node`) is a
nested grid is replaced by its leaves; every other piece passes through as the **same object**. When
nothing was replaced, `pieces` **is** `layout.pieces` (same array). A run without `grid` (model-test
fixtures) passes everything through.

For a nested grid in rectangle `{ x, z, width, height }`: column sizes = `resolveTracks(cols, width)`,
row sizes = `resolveTracks(rows, height)`; column `j` starts at `x + Σ sizes[<j]`; row `i`'s **top** is
`z + height − Σ rowSizes[<i]` (row 0 on top). A cell's rectangle comes from its spans. Recurse into
nested grids. A leaf becomes:

```js
{ id: leaf.id, kind: leaf.kind, role: 'item', cabinetTypeId: piece.cabinetTypeId,
  columnId: piece.id, x, z, width, height, depth: piece.depth,
  auto: <the leaf's own track, on its parent's axis>.size === null }
```

A column's leaves are emitted sorted by `x`, then `z` (1e-6 tolerance) — left edge, then bottom edge,
the part-number order.

`grids` lists every nested grid, pre-order, as
`{ id, columnId, axis, depth, x, z, width, height, tracks }` where `depth` is 1 for a grid in a root
cell, and `tracks` are on the grid's axis, in track order: `{ id, start, end, manual }` — for `'row'`
`start`/`end` are the track's bottom and top `z`; for `'col'` its left and right `x`; `manual` is
`size !== null`.

`warnings`: one per leaf with width or height below `MIN_CELL_SIZE − 1e-6`:
`{ code: 'cell-too-small', pieceId: leaf.id, message: 'Cell is smaller than 1 inch.' }`.

**`stackedSides(pieces, pieceId)`** — for a `cabinet` piece: `top` when another cabinet piece's `z`
equals this piece's top and their x-ranges overlap by more than 1e-6; `bottom` when another cabinet's top
equals this piece's `z`. Anything else (unknown id, not a cabinet) → `{ top: false, bottom: false }`.

**`blindCellWidths(pieces, columns, entries)`** — `entries` are `blindEntries(...).entries`
(`{ side, pieceId, boxWidth }`), `columns` the layout's column pieces. For each piece with a
`columnId`, and each entry whose `pieceId === piece.columnId`, when the piece touches that side of its
column (left: `x` equal; right: right edges equal; 1e-6): `width + entry.boxWidth − column.width`.

**`splitRun.js` line 533**, in `syncAutoItems`: add `&& !items[index].grid` to the removal condition, so
auto count never removes a split column.

`model/index.js`: new `export { … } from './cells.js';` block, alphabetical.

### Tests — `src/elevation/model/__tests__/cells.test.js` (7)

```js
const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
// Column g1: 't' on top; below it a 30" row split across into 'p' | 'q'
const STACK = { id: 'g1', cols: [AUTO('g1c')],
  rows: [AUTO('g1r0'), { id: 'g1r1', size: 30, sizeMode: 'manual' }],
  cells: [
    cell(0, 0, { id: 't', kind: 'cabinet' }),
    cell(0, 1, { id: 'g2', cols: [AUTO('g2c0'), AUTO('g2c1')], rows: [AUTO('g2r')],
      cells: [cell(0, 0, { id: 'p', kind: 'cabinet' }), cell(1, 0, { id: 'q', kind: 'cabinet' })] }),
  ] };
const GRID = { id: 'r:grid', cols: [AUTO('a:col'), AUTO('g1:col')], rows: [AUTO('r:row')],
  cells: [cell(0, 0, { id: 'a', kind: 'cabinet' }), cell(1, 0, STACK)] };
const RUN = { id: 'r', cabinetTypeId: 3, grid: GRID };
const piece = (id, kind, role, x, width) => ({
  id, kind, role, cabinetTypeId: kind === 'cabinet' ? 3 : 5, x, width, z: 4, height: 90, depth: 24, auto: true });
const LAYOUT = { pieces: [
  piece('r:left', 'filler', 'end-left', 0, 1.5),
  piece('a', 'cabinet', 'item', 1.5, 36),
  piece('g1', 'cabinet', 'item', 37.5, 72),
] };
```

1. **resolveTracks.** `([AUTO('x'), { id: 'y', size: 30, sizeMode: 'manual' }], 90)` → `[60, 30]`;
   two fixed `20, 30` in `90` → `[20, 70]`; three auto in `90` → `[30, 30, 30]`; `([], 10)` → `[]`;
   fixed `100` + auto in `90` → `[100, -10]`.
2. **cellPieces expands a split column.** `const cells = cellPieces(RUN, LAYOUT);` →
   `cells.pieces.map((p) => p.id)` `['r:left', 'a', 'p', 't', 'q']`; `cells.pieces[0]` and `[1]`
   `toBe` the layout's; `cells.pieces[3]` `toEqual` `{ id: 't', kind: 'cabinet', role: 'item',
   cabinetTypeId: 3, columnId: 'g1', x: 37.5, z: 34, width: 72, height: 60, depth: 24, auto: true }`;
   `p` is `x 37.5, z 4, width 36, height 30`; `q` is `x 73.5, z 4, width 36, height 30`.
   `cells.grids` `toEqual`
   ```js
   [{ id: 'g1', columnId: 'g1', axis: 'row', depth: 1, x: 37.5, z: 4, width: 72, height: 90,
      tracks: [{ id: 'g1r0', start: 34, end: 94, manual: false }, { id: 'g1r1', start: 4, end: 34, manual: true }] },
    { id: 'g2', columnId: 'g1', axis: 'col', depth: 2, x: 37.5, z: 4, width: 72, height: 30,
      tracks: [{ id: 'g2c0', start: 37.5, end: 73.5, manual: false }, { id: 'g2c1', start: 73.5, end: 109.5, manual: false }] }]
   ```
   `cells.warnings` `[]`.
3. **warns on a cell under an inch.** With `g1r1` size `89.5` (build a copy) → `warnings` `toEqual`
   `[{ code: 'cell-too-small', pieceId: 't', message: 'Cell is smaller than 1 inch.' }]`.
4. **passes unsplit runs through.** For `{ id: 'r', grid: gridFromItems('r', [{ id: 'a', kind:
   'cabinet', width: null }]) }` and for `{ id: 'r', items: [] }`, `cellPieces(run, LAYOUT).pieces`
   `toBe(LAYOUT.pieces)` and `grids` `[]`.
5. **stackedSides.** On `cellPieces(RUN, LAYOUT).pieces`: `'t'` `{ top: false, bottom: true }`; `'p'`
   and `'q'` `{ top: true, bottom: false }`; `'a'`, `'r:left'` and `'zz'` both false.
6. **blindCellWidths.** `const { pieces } = cellPieces(RUN, LAYOUT);` With `[{ side: 'right', pieceId:
   'g1', boxWidth: 96 }]` → `new Map([['t', 96], ['q', 60]])`; with side `'left'` →
   `new Map([['p', 60], ['t', 96]])`; with `pieceId: 'a'` → empty Map.
7. **syncAutoItems keeps a split column.** `syncAutoItems({ id: 'r', x: 0, width: 30, ends: { left:
   NONE, right: NONE }, anchors: { left: false, right: false }, autoCount: true, maxCabinetWidth: null,
   grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }, { id: 'g1', kind: 'cabinet',
   width: null, grid: STACK }]) }, DEFAULT_SETTINGS)` (`NONE = { type: 'none', width: null }`) →
   `runItems(result).map((i) => i.id)` `['g1']` and `result.grid.cells[0].node` `toEqual(STACK)`.

**Count:** 556 + 7 = **563**.

---

## §4 Step 164 — stacked seams (REV-009/010) and face layouts per cell

**`constants.js`** — `DEFAULT_SETTINGS`, after `capturedSingleReveal` (line 82):
`stackedUpperBottom: 0,` and `stackedLowerTop: 0.125,` (REV-010, Euro).

**`persistence.js`** — `V2_DEFAULTED_SETTING_KEYS`, after `'capturedSingleReveal',` (line 80): add
`'stackedUpperBottom',` and `'stackedLowerTop',`. (Both are numbers, so `isSettings` requires them;
defaulting keeps rooms saved since 159 loading.) Nothing else in this file.

**`styles.js`**
- `REVEAL_SOURCE_LABELS` (21–28): add `'rule:stacked-seam': 'rule: stacked seam',`.
- New export:
  ```js
  /** REV-009/010: the reveals either side of a seam where one box sits on another. */
  export function stackedSeamReveals(style, settings) {
    if (!isInsetStyle(style)) {
      return {
        upperBottom: settings.stackedUpperBottom ?? DEFAULT_SETTINGS.stackedUpperBottom,
        lowerTop: settings.stackedLowerTop ?? DEFAULT_SETTINGS.stackedLowerTop,
      };
    }
    const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
    const bead = style.cabinetStyleId === CABINET_STYLE_IDS.BEADED_INSET ? style.beadWidth : 0;
    const half = frame.rail / 2 + bead;   // one shared rail covers both boxes
    return { upperBottom: half, lowerTop: half };
  }
  ```
- `cabinetReveals` (106–139): new parameter `stacked = { top: false, bottom: false }`. After the
  upper-bottom rule (line 129) and before captured-single:
  ```js
  if (stacked.top || stacked.bottom) {
    const seam = stackedSeamReveals(style, settings);
    if (stacked.top) apply('top', seam.lowerTop, 'rule:stacked-seam');
    if (stacked.bottom) apply('bottom', seam.upperBottom, 'rule:stacked-seam');
  }
  ```
  Order matters: it overrides wood-top and upper-bottom (a stacked box's seam side isn't under the top
  or over the counter) and loses to manual.

**`faceLayouts.js`** `runFaceLayouts` (lines 30–48): loop over cells instead of columns.

```js
  const cells = cellPieces(run, layout);
  for (const piece of cells.pieces) {
    if (piece.kind !== 'cabinet' || piece.role !== 'item') continue;
    const item = piece.columnId
      ? findLeaf(run.grid, piece.id)
      : runItems(run).find((candidate) => candidate.id === piece.id);
    const column = piece.columnId
      ? layout.pieces.find((candidate) => candidate.id === piece.columnId)
      : piece;
    const columnCaptured = captureSides(layout.pieces, column.id, otherPieces, tolerance);
    const captured = piece.columnId
      ? {
        left: columnCaptured.left && Math.abs(piece.x - column.x) <= 1e-6,
        right: columnCaptured.right
          && Math.abs(piece.x + piece.width - column.x - column.width) <= 1e-6,
      }
      : columnCaptured;
    // style, cabinetReveals({ …, captured, stacked: stackedSides(cells.pieces, piece.id), … }), result.set — as today
  }
```

Imports: `cellPieces, stackedSides` from `./cells.js`; `findLeaf` from `./cellTree.js`.

### Tests

`styles.test.js`, two tests at the end of `describe('styles')` (`BEADED = { cabinetStyleId: 15,
beadWidth: 0.25, profiledEdge: false }`, `TALL = CABINET_TYPE_IDS.TALL`):

1. **`53 stackedSeamReveals`.** `(EURO, S)` → `{ upperBottom: 0, lowerTop: 0.125 }`;
   `(INSET, S)` → `{ upperBottom: 0.75, lowerTop: 0.75 }`; `(BEADED, S)` → `{ upperBottom: 1, lowerTop: 1 }`;
   `(EURO, { ...S, stackedUpperBottom: 0.0625 })` → `upperBottom` `0.0625`.
2. **`54 stacked seam rule`.** `cabinetReveals({ style: EURO, cabinetTypeId: TALL, face: DOOR,
   stacked: { top: true, bottom: false }, settings: S })` → `values.top` `0.125`, `sources.top`
   `'rule:stacked-seam'`, `sources.bottom` `'style'`. Upper, Euro, `run: { upperBottom: 'flush' }`,
   `stacked.bottom` → `values.bottom` `0`, source `'rule:stacked-seam'`. Base, Euro, `run: { top:
   'wood' }`, `stacked.top` → source `'rule:stacked-seam'`. Inset tall, both sides → `top` and `bottom`
   `0.75`. Manual `{ bottom: -0.25 }` with `stacked.bottom` → `-0.25`, `'manual'`.

`faceLayouts.test.js`, one test (`TALL` run, both ends 3/4" end panels, one 18" column split down):

```js
const STACKED = {
  id: 'run-2', cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 24, width: 19.5, z: 4, height: 90, depth: 24,
  ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
  autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
  anchors: { left: false, right: false },
  grid: {
    id: 'run-2:grid', cols: [{ id: 's:col', size: 18, sizeMode: 'manual' }],
    rows: [{ id: 'run-2:row', size: null, sizeMode: 'auto' }],
    cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: {
      id: 's', cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 's:r0', size: null, sizeMode: 'auto' }, { id: 's:r1', size: 30, sizeMode: 'manual' }],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 't', kind: 'cabinet' } },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'b', kind: 'cabinet' } },
      ],
    } }],
  },
};
```

**`50. stacked cells get seam reveals, European and inset`.** Euro (`roomWith(STACKED)`):
`b` → `reveals.sources.top` `'rule:stacked-seam'`, `reveals.sources.left` `'rule:captured-single'`,
`faces` `[{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 17.8125, height: 29.75 }]`;
`t` → `reveals.values.bottom` `0`, `faces` `[{ path: 'r', type: 'door', x: 24.84375, z: 34, width:
17.8125, height: 59.875 }]`; the map has no key `'s'`. Inset room (`{ cabinetStyleId: 14 }`): `b` faces
`[{ path: 'r', type: 'door', x: 25.5, z: 5.5, width: 16.5, height: 27.75 }]`; `t` faces
`[{ path: 'r', type: 'door', x: 25.5, z: 34.75, width: 16.5, height: 57.75 }]` (one 1 1/2" rail
between, 33.25 → 34.75).

**Count:** 563 + 3 = **566**.

---

## §5 Step 165 — part numbers and diagnostics per cell

**`partNumbers.js`**
- `runParts` (53–74): after `const widths = blindPartWidths(…)` (61):
  ```js
      const cells = cellPieces(run, layout);
      const cellWidths = blindCellWidths(
        cells.pieces, layout.pieces, blindEntries(room, view, run, settings, layout).entries,
      );
      return cells.pieces
        .filter(/* unchanged */)
        .map((piece) => ({ /* unchanged */, width: cellWidths.get(piece.id) ?? widths.get(piece.id) ?? piece.width }));
  ```
  Import `blindEntries` beside `blindPartWidths` (line 2) and `blindCellWidths, cellPieces` from
  `./cells.js`.
- `wallBadgeGroups` (206–215): `pieces:` becomes `cellPieces(run, splitRun(run, settings, { … }))
  .pieces` — the same splitRun call, wrapped.

**`room.js`** `roomDiagnostics`: after `...layout.warnings,` (line 663) add
`...cellPieces(run, layout).warnings,`; import `cellPieces` from `./cells.js` (cells.js imports only
grid.js, so no cycle).

### Tests — `partNumbers.test.js`, new `describe('SPEC-33 cell part numbers')` (2)

```js
const splitBase = (bottomRow = { id: 's:r1', size: null, sizeMode: 'auto' }) => ({
  ...aBase(),
  items: undefined,
  grid: {
    id: 'A-base:grid',
    cols: [{ id: 'a1:col', size: 28.125, sizeMode: 'manual' }, { id: 's:col', size: 28.125, sizeMode: 'manual' }],
    rows: [{ id: 'A-base:row', size: null, sizeMode: 'auto' }],
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'a1', kind: 'cabinet' } },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1, node: {
        id: 's', cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
        rows: [{ id: 's:r0', size: null, sizeMode: 'auto' }, bottomRow],
        cells: [
          { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'top', kind: 'cabinet' } },
          { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'bot', kind: 'cabinet' } },
        ],
      } },
    ],
  },
});
const splitRoom = (bottomRow) => partRoom({
  walls: partWalls({ wallA: { runs: [splitBase(bottomRow), aUpper()] } }),
});
```

1. **numbers split cells left edge first, then bottom up.** `partNumbers(splitRoom(), DEFAULT_SETTINGS)`
   → keys `['A-base:left', 'a1', 'bot', 'top', 'A-base:right', 'a3', 'B-base:left', 'b1',
   'B-base:right', 'molding:toeKick']`, numbers 1–10; the part `top` `toMatchObject({ kind: 'cabinet',
   runId: 'A-base', pieceId: 'top', width: 28.125 })`. `wallBadgeGroups(room, wallSideView(room.walls.find((wall) => wall.id === 'A'),
   'front'), DEFAULT_SETTINGS)[0].pieces.map(({ id }) => id)` `['A-base:left', 'a1', 'bot', 'top',
   'A-base:right']`.
2. **room diagnostics carry cell warnings.** `roomDiagnostics(splitRoom({ id: 's:r1', size: 30,
   sizeMode: 'manual' }), DEFAULT_SETTINGS)['A-base'].warnings` `toContainEqual({ code:
   'cell-too-small', pieceId: 'top', message: 'Cell is smaller than 1 inch.' })` (30.5" run, 30" bottom
   row → a 1/2" top cell).

**Count:** 566 + 2 = **568**.

---

## §6 Step 166 — saves accept split columns

`persistence.js` — `isRunGrid` (220–228) and a new validator beside it:

```js
function isCellLeaf(leaf) {
  return leaf.kind === 'cabinet' && isItem({ ...leaf, width: null });
}

/** SPEC-33 nested grids: one column of 2+ rows or one row of 2+ columns, no spans, cabinet leaves. */
function isCellGrid(grid) {
  const stack = grid.cols.length === 1 && grid.rows.length >= 2;
  const row = grid.rows.length === 1 && grid.cols.length >= 2;
  return (stack || row) && grid.cells.every((cell) => (
    cell.colSpan === 1 && cell.rowSpan === 1
    && ('cols' in cell.node ? isCellGrid(cell.node) : isCellLeaf(cell.node))
  ));
}

/** Round 33: the root is one row with no spans; a root cell may hold a nested cell grid. */
function isRunGrid(grid) {
  return isGridShape(grid, isLeaf)
    && grid.rows.length === 1
    && grid.cells.every((cell) => (
      cell.colSpan === 1 && cell.rowSpan === 1
      && (!('cols' in cell.node) || isCellGrid(cell.node))
    ))
    && rootItems(grid).every(isItem);
}
```

`isGridShape` already checks every nested track, coverage and `isLeaf` (blind shape) recursively.
`rootItems` gives a split column as a cabinet item with a `grid` key, which `isItem` accepts.

### Tests — `persistence.test.js`, new `describe('SPEC-33 split columns')` (3)

```js
const NESTED = {
  id: 'g',
  cols: [{ id: 'g:c', size: null, sizeMode: 'auto' }],
  rows: [{ id: 'g:r0', size: null, sizeMode: 'auto' }, { id: 'g:r1', size: 12, sizeMode: 'manual' }],
  cells: [
    { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'top', kind: 'cabinet', face: { type: 'door', size: null } } },
    { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: {
      id: 'h',
      cols: [{ id: 'h:c0', size: null, sizeMode: 'auto' }, { id: 'h:c1', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'h:r', size: null, sizeMode: 'auto' }],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'l', kind: 'cabinet' } },
        { col: 1, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'r', kind: 'cabinet', reveals: { top: 0 } } },
      ],
    } },
  ],
};
function splitDocument() {
  const document = currentDocument();
  const run = document.rooms[0].walls[0].runs[0];
  run.grid.cols[0] = { id: 'g:col', size: 45, sizeMode: 'manual' };
  run.grid.cells[0].node = structuredClone(NESTED);
  return document;
}
```

1. **saves and loads a run with a split column.** `isElevationDocument(splitDocument())` true; with it
   stored under `ELEVATION_STORAGE_KEY` (as SPEC-32 test 1 does), `loadElevationDocument()`
   `toEqual(splitDocument())`.
2. **rejects nested grids the model doesn't allow yet.** Each on a fresh `splitDocument()` with
   `node = run.grid.cells[0].node` makes `isElevationDocument` false:
   - 2 × 2: `node.cols.push({ id: 'g:c2', size: null, sizeMode: 'auto' })` and
     `node.cells.push({ col: 1, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'x', kind: 'cabinet' } },
     { col: 1, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'y', kind: 'cabinet' } })`
   - 1 × 1: `node.rows = [node.rows[0]]; node.cells = [node.cells[0]];`
   - `node.cells[0].node.kind = 'filler'`
   - `node.cells[0].node.face = { type: 'shelf', size: null }`
   - `node.cells[0].node.blind = { left: 0 }`
   - `node.cells[1].node.cells[1].node.reveals = { top: 'x' }`
   - `node.rows[1] = { id: 'g:r1', size: 12, sizeMode: 'auto' }`
3. **the store loads a split column unchanged.** `createInitialElevationState(splitDocument())` — its
   first run's `grid` `toEqual` the document's; `toElevationDocument(state).rooms` `toEqual`
   `splitDocument().rooms`.

**Count:** 568 + 3 = **571**.

---

## §7 Step 167 — store reducers

Line numbers at `a6aea33` (the slice hasn't changed since 161).

**Imports** (`../model/grid.js`, lines 6–12): add `gridLeaves`. New import:
```js
import {
  equalizeGridCells,
  findCell,
  removeGridCell,
  setGridTrackSize,
  splitGridCell,
  unsplitGridCell,
} from '../model/cellTree.js';
```

**Leaves anywhere.** Delete `rootLeaves` (246–253). `roomCabinets` (241) and the loops in
`setItemFace` (1264), `setItemStyle` (1303), `setItemReveals` (1315) use `gridLeaves(run.grid)` /
`gridLeaves(location.run.grid)` instead. Loop bodies unchanged. (`gridLeaves` returns the draft leaves
themselves, so the in-place edits still land.)

**Five reducers**, after `removeItem` (ends 1259). Payloads all carry `{ roomId?, wallId, runId }`:

```js
    splitCell(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, direction, count } = action.payload;
      const before = location.run.grid;
      const rootAcross = direction === 'across' && findCell(before, cellId)?.depth === 0;
      const grid = splitGridCell(before, cellId, direction, count, uuid);
      if (grid === before) return;
      location.run.grid = grid;
      if (rootAcross) location.run.autoCount = false;
      syncRoomAt(state, location.roomIndex);
    },
    removeCell(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId } = action.payload;
      const before = location.run.grid;
      const atRoot = findCell(before, cellId)?.depth === 0;
      const grid = removeGridCell(before, cellId);
      if (grid === before) return;
      location.run.grid = grid;
      if (atRoot) location.run.autoCount = false;
      if (state.selection.pieceId === cellId) {
        state.selection = {
          runId: location.run.id, pieceId: null, openingId: null, soffitId: null,
          wallId: state.selection.wallId,
        };
        state.facePath = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    equalizeCells   // location guard; grid = equalizeGridCells(grid, cellId); assign if changed; syncRoomAt
    unsplitCell     // same shape with unsplitGridCell
    setTrackSize    // payload { trackId, size }; setGridTrackSize(grid, trackId, size ?? null); same shape
```

Export the five in the `elevationSlice.actions` list, after `removeItem,` (line 1445).

**Don't touch** `splitItem` (still tested; the UI stops using it in 168), `removeItem`, the width/pin/
absorb reducers (they act on root columns, which is right), `itemIndexFor`.

### Tests — `elevationSlice.test.js`, new `describe('SPEC-33 cell reducers')` (6)

Import the five actions and `gridLeaves` (add to the `grid.js` import).

```js
const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const start = (overrides = {}) => stateWithRun(run({
  autoCount: false, items: [fixed('a', 30), auto('b')], ...overrides,
}));
const stackOf = (state) => currentRun(state).grid.cells[0].node;
const split = (state, cellId, direction, count = 2) => elevationReducer(
  state, splitCell({ ...actionBase, cellId, direction, count }),
);
```

1. **splits a root cabinet down, then sizes and equalizes its rows.** `let state = split(start(), 'a',
   'down', 3);` → `stackOf(state).rows` length 3, `stackOf(state).cells[0].node.id` `'a'`,
   `currentRun(state).grid.cols[0]` `toEqual` `{ id: `${stackOf(state).id}:col`, size: 30, sizeMode:
   'manual' }`, `autoCount` false. `setTrackSize` on `rows[2].id` with `10` → that row `{ id, size: 10,
   sizeMode: 'manual' }`. `equalizeCells({ cellId: 'a' })` → every row `size` null.
2. **splits across into root columns and turns auto count off.** `split(start({ autoCount: true }),
   'b', 'across')` → `runItems(currentRun(state))` length 3, ids `[0]` `'a'` and `[1]` `'b'`;
   `autoCount` false.
3. **removes a nested cell, collapsing the stack and its selection.** Split `a` down 2; `second =
   stackOf(state).cells[1].node.id`; `setSelection({ runId: 'run-1', pieceId: second })`;
   `removeCell({ cellId: second })` → `currentRun(state).grid.cells[0].node` `toEqual` `{ id: 'a',
   kind: 'cabinet' }`, `grid.cols[0].id` `'a:col'`, `state.selection.pieceId` null, `state.facePath`
   null. Then `removeCell({ cellId: 'b' })` → `runItems` ids `['a']`.
4. **unsplits to the chosen cell.** Split `a` down 3; `mid = stackOf(state).cells[1].node.id`;
   `unsplitCell({ cellId: mid })` → `grid.cells[0].node` `{ id: mid, kind: 'cabinet' }`,
   `grid.cols[0]` `{ id: `${mid}:col`, size: 30, sizeMode: 'manual' }`.
5. **face, style and reveal edits reach nested cells.** Split `a` down 2; `lower =
   stackOf(state).cells[1].node.id`; `setItemFace({ itemIds: [lower], face: { type: 'drawer_front', size:
   null } })`, `setItemReveals({ itemIds: [lower], reveals: { top: 0.25 } })`, `setItemStyle({ itemIds:
   [lower], style: { cabinetStyleId: 14 } })` → that leaf has `face`, `reveals: { top: 0.25 }`, `style:
   { cabinetStyleId: 14 }`; leaf `a` has none of them.
6. **a blind column stays blind when split down.** `split(start({ blind: { left: 36, right: null } }),
   'a', 'down')` → `gridLeaves(currentRun(state).grid).filter((l) => l.blind).map((l) => l.id)`
   `['a', <the new leaf's id>]`; `runBlind(currentRun(state))` `{ left: 36, right: null }`.

**Count:** 571 + 6 = **577**.

---

## §8 Step 168 — draw and select cells; the cell panel

Line numbers at `a6aea33`; none of these files changed in 162–167.

**`components/RunGroup.jsx`**
- Import `blindCellWidths, cellPieces` from `'../model/cells.js'`.
- After `result` (54–58): `const cells = useMemo(() => cellPieces(run, result), [result, run]);`
- `subLabels` (67–76): inside the loop, also label split cells:
  `for (const [id, width] of blindCellWidths(cells.pieces, result.pieces, [entry])) labels.set(id, `Blind ${formatInches(width)}`);`
  Add `cells` and `result` to its deps.
- `drawnPieces` (110–118): map over `cells.pieces` instead of `result.pieces`; deps `cells` for
  `result`.
- `warningPieceIds` (145–150): also add `cells.warnings`.
- `PieceRect` (362–377): `warning={warningPieceIds.has(piece.id) || warningPieceIds.has(piece.columnId)}`.
- Leave the pin markers (391–418) and centerline markers (420) on `result.pieces`: they are column
  things.

**`components/PropertiesPanel.jsx`**
- Import `cellPieces` from `'../model/index.js'` (add to the existing import, 8–12).
- After `layout` (58–65): `const cells = useMemo(() => (run && layout ? cellPieces(run, layout) : null), [run, layout]);`
- `selectionContext` (73–78): `resolveSelectedPiece(run, cells, selection.pieceId)` (a `{ pieces }`
  object is all it reads); deps `cells`.
- `PieceProperties` (136–143): add `cells={cells}`. `RunProperties` keeps `displayLayout`.

**`properties/helpers.js`** `resolveSelectedPiece` (67–85): the item is
`runItems(run).find(…) ?? (piece.columnId ? findLeaf(run.grid, piece.id) : null) ?? null`. Import
`findLeaf` from `'../model/cellTree.js'`.

**`components/properties/PieceProperties.jsx`** — take `cells`; pass it to `CabinetProperties`; before
the `CabinetProperties` return (94), when `piece.columnId` return `partNumberField` +
`<CellProperties wall run piece item layout cells settings />`.

**NEW `components/properties/CellSplitSection.jsx`** (~60 lines) — `({ wall, run, cellId, nested })`:
a count input (`type="number"`, 2…`MAX_CELL_SPLIT`, default 2) and buttons **Split across**, **Split
down** (dispatch `splitCell({ wallId, runId, cellId, direction, count })`). When `nested`, a second row:
**Make equal** (`equalizeCells`), **Unsplit** (`unsplitCell`), **Remove cell** (`removeCell`, red like
Remove). Same button classes as `CabinetProperties`.

**NEW `components/properties/CellProperties.jsx`** (~110 lines) — `({ wall, run, piece, item, layout,
cells, settings })`:
- `const context = findCell(run.grid, piece.id)`; `axis = context.axis`; its size is `piece.height` for
  `'row'`, `piece.width` for `'col'`; `locked = context.track.size !== null`.
- **Cell** section: an `InchInput` labelled Height (row) or Width (col) → `setTrackSize({ …, trackId:
  context.track.id, size })`; a Lock/Unlock button (unlock → `size: null`; lock → the current size); the
  other dimension as `ReadOnlyValue`.
- **Column** section: `column = layout.pieces.find((p) => p.id === piece.columnId)`; Column width
  `InchInput` → `setItemWidth({ …, itemId: piece.columnId, width })`, and Lock/Unlock like
  `CabinetProperties` (unlock → `setItemWidth` width null; lock → `lockItem` with `computedWidth:
  column.width`).
- `<CellSplitSection wall run cellId={item.id} nested />`
- `<FaceProperties wall run piece item layout cells settings />`

**`components/properties/CabinetProperties.jsx`** — take `cells` and pass it to `FaceProperties`
(265). Remove the **Split in 2** button (235–241) and `splitItem` from the import (10). Add
`<CellSplitSection wall={wall} run={run} cellId={item.id} nested={false} />` right above that button grid
(before 234); the grid keeps its three buttons.

**`components/properties/FaceProperties.jsx`** — take `cells`; `sameWidthIds` (56) reads
`(cells?.pieces ?? layout.pieces)`. Nothing else (its `runFaceLayouts(…, layout)` call gets column
pieces, which is what it needs).

### Test — `properties/__tests__/helpers.test.js` (1)

**finds a nested cell's leaf.** `const selected = { ...run(), items: undefined, grid:
gridFromItems('run-1', [{ id: 'g', kind: 'cabinet', width: null, grid: { id: 'g', cols: [{ id: 'g:c',
size: null, sizeMode: 'auto' }], rows: [{ id: 'g:r0', size: null, sizeMode: 'auto' }, { id: 'g:r1',
size: null, sizeMode: 'auto' }], cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'up',
kind: 'cabinet' } }, { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'dn', kind: 'cabinet' } }]
} }]) };` and a literal `{ pieces: [{ id: 'dn', kind: 'cabinet', role: 'item', columnId: 'g', x: 0,
width: 30, z: 4, height: 15, depth: 24 }] }` → `resolveSelectedPiece(selected, cells, 'dn')`
`toMatchObject({ item: { id: 'dn', kind: 'cabinet' }, side: null })`.

**Count:** 577 + 1 = **578**.

---

## §9 Step 169 — cell chains, typing sizes on chains, Delete

**NEW `components/CellChains.jsx`** (~120 lines) — `({ grids, transform, editable, onEditTrack })`.
For each grid (`cellPieces(...).grids`):
- `'row'`: a vertical line at screen x = `wallToScreen({ x: grid.x }).x + 10`, from the grid's bottom to
  its top; a 6px tick at every track boundary; per track a label `formatInches(end − start)` rotated −90,
  3px right of the line, centred on the track, font 10.
- `'col'`: a horizontal line at screen y = `wallToScreen({ z: grid.z }).y − 10`; ticks; unrotated labels
  3px above.
- Colour `#7dd3fc` for manual tracks, `#e2e8f0` for auto. Skip a label when its track is under 24px on
  screen.
- When `editable`, each label gets a transparent hit `Rect`; click → `event.cancelBubble = true` and
  `onEditTrack({ trackId, label: axis === 'row' ? 'Height' : 'Width', value: end − start, x, y })`
  where `{ x, y }` is `event.target.getStage().getPointerPosition()`.
- Everything else `listening={false}`.

**NEW `components/TrackSizeInput.jsx`** (~60 lines) — `({ edit, onCommit, onCancel })`: an absolutely
positioned box at `edit.x + 12, edit.y + 12` (same classes as `LiveEntryInput`'s popup), a label
`edit.label`, a text input prefilled with `formatInchesInput(edit.value)`, autofocused and selected.
Enter: blank or `auto` → `onCommit(null)`; otherwise `parseInches(text)`, and a finite value > 0 →
`onCommit(value)`; anything else does nothing. Escape or blur → `onCancel()`. Stop pointerdown and
keydown propagation.

**`components/RunGroup.jsx`** — new prop `onEditTrack`. Render
`<CellChains grids={cells.grids} transform={transform} editable={stretchable && !preview && Boolean(onEditTrack)} onEditTrack={(edit) => onEditTrack(run.id, edit)} />`
right after the face outlines (after 389).

**`components/DimensionRow.jsx`** — new prop `onPieceClick`. At line 182 `clickable` becomes
`(segment.kind === 'run' && Boolean(onSegmentClick)) || (segment.kind === 'piece' && Boolean(onPieceClick))`,
and the `onClick` handler (192–199) calls `onPieceClick(segment, event.target.getStage().getPointerPosition())`
for a `piece` segment instead of `onSegmentClick`. Drag stays `run`-only (it already checks
`segment.kind === 'run'`).

**`components/ElevationCanvas.jsx`** — read only the listed ranges.
1. Imports: `removeCell, setItemWidth, setTrackSize` into the slice import (86–103); `TrackSizeInput`
   after `LiveEntryInput` (108); `findLeaf` from `'../model/cellTree.js'` after the `grid.js` import (48).
2. State after line 160: `const [trackEdit, setTrackEdit] = useState(null);`
3. Two callbacks after `selectFace` (951–954):
   ```js
   const editTrack = useCallback((runId, edit) => setTrackEdit({ ...edit, runId }), []);
   const editPieceSegment = useCallback((segment, point) => {
     if (!segment.runId || !segment.pieceId || segment.pieceId.startsWith(`${segment.runId}:`)) return;
     setTrackEdit({ runId: segment.runId, itemId: segment.pieceId, label: 'Width',
       value: segment.end - segment.start, x: point.x, y: point.y });
   }, []);
   const commitTrackEdit = useCallback((size) => {
     if (trackEdit && wall) {
       dispatch(trackEdit.trackId
         ? setTrackSize({ wallId: wall.id, runId: trackEdit.runId, trackId: trackEdit.trackId, size })
         : setItemWidth({ wallId: wall.id, runId: trackEdit.runId, itemId: trackEdit.itemId, width: size }));
     }
     setTrackEdit(null);
   }, [dispatch, trackEdit, wall]);
   ```
4. The main `RunGroup` (1507): add `onEditTrack={editTrack}`. Not the stretch-preview one (1705).
5. The `lower.inner` (1583–1592) and `upper.inner` (1633–1642) `DimensionRow`s: add
   `onPieceClick={tool === 'select' ? editPieceSegment : undefined}`.
6. Next to `LiveEntryInput` (1757–1767):
   `{trackEdit && <TrackSizeInput edit={trackEdit} onCommit={commitTrackEdit} onCancel={() => setTrackEdit(null)} />}`
7. Delete key (600–611): when `selectedItem` isn't found, instead of `return`: if
   `findLeaf(selectedRun.grid, currentSelection.pieceId)` → `event.preventDefault()` and
   `dispatch(removeCell({ wallId: currentWall.id, runId: selectedRun.id, cellId: currentSelection.pieceId }))`;
   then `return`.

No tests (canvas components aren't unit-tested). **Count stays 578.**

**Done when (round):** `npm test` (578) and `npm run lint` clean; every sample layout draws as at
`a6aea33` until a cell is split; the three target layouts (§ After this round) can be drawn and reloaded.

## Open after this round

1. Chain placement (CELLS-PLAN Open 1): inside the split, as built — or on the column edge nearest the
   wall? Decide with a real room on screen.
2. Blind per cell (some stacked cells blind, some not): proposed for round 34.
