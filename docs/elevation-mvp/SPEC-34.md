# Elevation Lab — SPEC-34 (cells round 34: blind per cell, cell kinds, depth, wrap)

Steps 170–176. The earlier SPEC files still apply; this file is the source of truth for what follows.
The design is `docs/elevation-mvp/CELLS-PLAN.md`, round 34, as re-scoped in §1. SPEC-33 is done: the repo
is at `ce63915` (step 169) on `elevation-grid-run-split`, with **578** tests passing.

Every model step below was built and run against `ce63915` before this SPEC was written: the code blocks
and test files are the versions that passed (`npm test` 600, `npm run lint` clean, `vite build` ok).

| Step | What | Files |
|---|---|---|
| **170** | Blind per cell: `rehomeBlind` keeps each cell's own blind through edits; `setGridCellBlind`, `cellBlindSides`, `resizeGridBlind`; cell pieces carry `blind`. | `grid.js`, `cellTree.js`, `cells.js`, `index.js`, 1 new test + `cells.test.js` (1 test rewritten) |
| **171** | Cell kinds `panel`, `void`, `shelves`; `depth` / `align`; Wrap in panels; shelf parts, panel orientation, capture by panels. | `grid.js`, `cellTree.js`, `cells.js`, `constants.js`, `index.js`, `persistence.js` (1 line), 1 new test |
| **172** | Faces see panel cells as capture (REV-005/006); part numbers for panels and each shelf, none for a void. | `faceLayouts.js`, `partNumbers.js`, 2 test files |
| **173** | Saves accept the new kinds, depth and align. | `persistence.js`, its test |
| **174** | Store: `setCellBlind`, `setCellKind`, `setCellDepth`, `setCellShelves`, `wrapCell`; the run's blind field resizes only blind cells. | slice, slice test |
| **175** | Cell panel: kind, depth/line-up, shelves, per-cell blind; Wrap in panels on cabinets. | 5 files in `properties/` (1 new) |
| **176** | Draw the kinds: dashed void, panel labels, shelves and back. | `RunGroup.jsx`, `PieceRect.jsx` |

Order: 173 (saves) lands before 174/175 make the new kinds possible, so a saved room always reloads.

## After this round you can

- Choose, per stacked cell on a blind end, whether it's blind: the blind tall over a non-blind drawer base.
- Turn any nested cell into a **panel**, an **open space** (void) or **floating shelves** (count, optional back).
- Give a nested cell its own depth, lined up on faces or backs: the 21" oven box with backs in line, a 3/4"
  back panel sitting at the wall.
- **Wrap** a cabinet in panels, sides through or top through, with or without a bottom panel.
- Draw the desk (a pencil-drawer cell over an open cell between end panels), a back panel under it, and a
  floating-shelf cell with a back.
- Get a part number for every panel and every shelf; an open cell gets none.

## Not in this round (re-scoped from CELLS-PLAN)

- **Gaps between boxes** move to **round 36**. They matter where a wider stile or T covers a spaced seam
  (FF-004, FILL-011), which is round 36/37 work; nothing drawable before then needs them.
- **`run.outset`** moves to **round 35** (joins). It touches corners, blind panel depth and plan footprints —
  every place that assumes a run's back is at the wall — and the joined middle run is its first real use.
- **Deviation lists** (notes vs. type standards) move to the reports work after round 38. Nothing reads them yet.
- Kinds at the **root**: a root column stays `cabinet` or `filler`. To make a root cabinet a panel or void,
  split it first (or wrap it). Kind, depth and align are nested-cell settings.
- Reveals for a cabinet cell **under or over a panel cell** stay the type standard (no rule yet) — see Open.
- Plan view is unchanged: a split column still draws as one box at the run's depth.

---

## §1 Decisions

**Blind per cell.** A blind still lives on leaves (`leaf.blind = { left?, right? }`), and only a leaf on the
run's outer edge on that side (its *edge leaves*, SPEC-33 §2) can carry it. What changes is what survives an
edit. `rehomeBlind(before, after)` replaces the old strip-and-reapply:

- a leaf that was an edge leaf before and still is keeps **its own** value from `before` (or none);
- a leaf that is newly on the edge while some old edge leaf is still there keeps whatever it has (a split
  copies the original's `blind` to the new leaves, like `style`, so splitting a blind cell makes blind cells);
- when **none** of the old edge leaves is on the edge any more (a new outer column), every edge leaf takes
  the run's blind (`runBlind(before)`), as in round 33;
- any leaf not on that edge loses that side;
- `panel`, `void` and `shelves` leaves never take a blind (`setGridBlind` skips them too).

For unsplit columns this is exactly round 33's behaviour, so every existing blind test passes unchanged.
Consequences worth knowing: removing the only blind cell of a stack leaves the run with no blind width
(the end stays type `blind`, its field shows blank); unsplitting to a non-blind cell does the same.

**The run's blind field** (`setRunBlind`) now calls `resizeGridBlind`: if any edge leaf on that side is blind,
only those change width; if none is, every edge leaf gets it (round 33). Clearing clears all.

**Per-cell widths.** `blindCellWidths` uses each cell piece's own `blind[side]`, not the entry's `boxWidth`.
`blindEntries` is unchanged (column level: warnings, plan box, end panel).

**Cell kinds** (nested leaves only):

| Kind | Keys | Part | Faces |
|---|---|---|---|
| `cabinet` | as today, plus `depth?`, `align?` | one | yes |
| `panel` | `id, kind, depth?, align?` | one, kind `panel` | no |
| `void` | `id, kind` | none | no |
| `shelves` | `id, kind, depth?, align?, shelves: { count, back }` | back panel (if `back`) + one per shelf | no |

Changing kind keeps `id`, `depth` and `align` (a void keeps neither) and drops everything else (face,
style, reveals, blind). A new shelves cell gets `{ count: 2, back: false }`. `count` is an integer 1…12
(`MAX_SHELVES`).

**Depth and align.** `depth` blank = the run's; the store refuses a depth deeper than the run, and
`cellPieces` warns `cell-too-deep` if one ever is (the run got shallower). `align` is `'back'` or absent
(faces in line, the default); `'face'` or `null` clears it. They reach the piece as `piece.depth` and
`piece.align`; nothing draws them yet.

**Panel orientation** comes from the thinnest of width, height, depth: `side`, `top` (top or bottom) or
`back`, ties in that order.

**Floating shelves** use a new setting `floatingShelfThickness: 1.5` (**assumed — confirm the shop's
number**). `count` shelves split the cell height evenly with equal gaps above, between and below. The back
is `endPanelThickness` (3/4") thick and the shelves are that much shallower. Part keys: `${id}:back`,
`${id}:shelf-1` (bottom) … `${id}:shelf-n`.

**Capture by panels.** A cabinet cell with a `panel` cell directly against its left or right (touching,
overlapping vertically) is captured on that side (REV-005/006), added to the column capture from round 33.

**Wrap in panels** replaces a cabinet leaf (root or nested) with a nested grid, always nesting (at the root
too, so the root stays cabinet/filler columns):

- `sides` through: `[left panel | inner | right panel]`, inner = `[top panel / cabinet / bottom panel?]`
- `top` through: `[top panel / inner / bottom panel?]`, inner = `[left panel | cabinet | right panel]`

Panel tracks are fixed at `settings.endPanelThickness`; the middle track is auto. `makeId` order: outer grid
id, its cross track, its tracks in order, its new panel leaves in order; then the same for the inner grid.

---

## §2 Step 170 — blind per cell (model)

### grid.js (290 lines at `ce63915`)

Add, right before `insertRootColumn` (189), verbatim:

```js
function mapLeaves(node, fn) {
  if (!isNestedGrid(node)) return fn(node);
  let changed = false;
  const cells = node.cells.map((cell) => {
    const child = mapLeaves(cell.node, fn);
    if (child === cell.node) return cell;
    changed = true;
    return { ...cell, node: child };
  });
  return changed ? { ...node, cells } : node;
}

function withBlindSide(leaf, side, width) {
  if (width === null) {
    if (!leaf.blind || !Object.hasOwn(leaf.blind, side)) return leaf;
    const blind = { ...leaf.blind };
    delete blind[side];
    const next = { ...leaf };
    if (Object.keys(blind).length) next.blind = blind;
    else delete next.blind;
    return next;
  }
  if (Object.is(leaf.blind?.[side], width)) return leaf;
  return { ...leaf, blind: { ...leaf.blind, [side]: width } };
}

function outerNode(grid, side) {
  if (grid.cols.length === 0) return null;
  return rootCell(grid, side === 'left' ? 0 : grid.cols.length - 1)?.node ?? null;
}

function edgeIds(grid, side) {
  const node = outerNode(grid, side);
  return new Set(node ? edgeLeaves(node, side).map((leaf) => leaf.id) : []);
}

/**
 * Round 34: after a structural edit, each leaf still on an outer edge keeps its own blind;
 * a wholly new outer edge takes the run's blind on every edge leaf; other leaves lose it.
 */
export function rehomeBlind(before, after) {
  const previous = runBlind({ grid: before });
  const beforeLeaves = new Map(gridLeaves(before).map((leaf) => [leaf.id, leaf]));
  let next = after;
  for (const side of ['left', 'right']) {
    const width = previous?.[side] ?? null;
    const oldEdge = edgeIds(before, side);
    const newEdge = edgeIds(next, side);
    const kept = [...newEdge].some((id) => oldEdge.has(id));
    next = mapLeaves(next, (leaf) => {
      if (width === null || !newEdge.has(leaf.id)) return withBlindSide(leaf, side, null);
      if (!kept) return withBlindSide(leaf, side, width);
      if (oldEdge.has(leaf.id)) {
        return withBlindSide(leaf, side, beforeLeaves.get(leaf.id)?.blind?.[side] ?? null);
      }
      return leaf;
    });
  }
  return next;
}

/** The outer sides ('left', 'right') whose edge leaves include this leaf. */
export function cellBlindSides(grid, leafId) {
  return ['left', 'right'].filter((side) => edgeIds(grid, side).has(leafId));
}

/** Sets or clears one edge cabinet leaf's blind; same reference when nothing changes. */
export function setGridCellBlind(grid, leafId, side, width) {
  if (side !== 'left' && side !== 'right') return grid;
  const valid = typeof width === 'number' && Number.isFinite(width) && width > 0;
  if (!valid && width !== null) return grid;
  if (!edgeIds(grid, side).has(leafId)) return grid;
  return mapLeaves(grid, (leaf) => (
    leaf.id === leafId && leaf.kind === 'cabinet' ? withBlindSide(leaf, side, width) : leaf));
}

/** The run's blind width field: resizes the blind edge leaves, or sets every edge leaf when none is blind. */
export function resizeGridBlind(grid, side, width) {
  const valid = typeof width === 'number' && Number.isFinite(width) && width > 0;
  const node = outerNode(grid, side);
  if (!valid || !node) return setGridBlind(grid, side, width);
  const blindIds = new Set(edgeLeaves(node, side)
    .filter((leaf) => leaf.blind?.[side] != null)
    .map((leaf) => leaf.id));
  if (blindIds.size === 0) return setGridBlind(grid, side, width);
  return mapLeaves(grid, (leaf) => (blindIds.has(leaf.id) ? withBlindSide(leaf, side, width) : leaf));
}
```

`replaceRootItems` (232–243): drop `const blind = runBlind({ grid });` and return `rehomeBlind(grid, next)`
instead of `restoreBlind(next, blind)`. (`restoreBlind` stays; `gridFromItems` uses it.)

### cellTree.js (257 lines)

- Import (1–2) becomes `import { isNestedGrid, rehomeBlind, removeRootColumn, replaceRootItems, rootItems } from './grid.js';`
- Delete `stripBlind` (53–68) and the local `rehomeBlind` (70–75).
- `copiedStyle` (77–79) copies `blind` as well as `style`:
  ```js
  function copiedStyle(leaf) {
    return {
      ...(Object.hasOwn(leaf, 'style') ? { style: leaf.style } : {}),
      ...(Object.hasOwn(leaf, 'blind') ? { blind: leaf.blind } : {}),
    };
  }
  ```
- `splitGridCell`: delete `const blind = runBlind({ grid });` (141); root across returns
  `replaceRootItems(grid, items)` (148, it re-homes itself); the end (158) returns `rehomeBlind(grid, next)`.
- `removeGridCell`: delete 179; 180 returns `removeRootColumn(grid, leafId)`; 202 returns `rehomeBlind(grid, next)`.
- `unsplitGridCell`: delete 224; 225 returns `rehomeBlind(grid, replaceNestedGrid(grid, found.parent, found.cell.node))`.

### cells.js (176 lines)

- The leaf piece in `resolveGrid` (after `auto: track.size === null,`, ~92) gains
  `...(cell.node.blind ? { blind: { ...cell.node.blind } } : {}),`.
- `blindCellWidths` (156–176): the inner loop becomes
  ```js
    for (const entry of entries) {
      const boxWidth = piece.blind?.[entry.side];
      if (entry.pieceId !== piece.columnId || !(boxWidth > 0)) continue;
      const touches = /* unchanged */;
      if (touches) result.set(piece.id, piece.width + boxWidth - column.width);
    }
  ```

### index.js

The `grid.js` block (248–264) adds `cellBlindSides`, `rehomeBlind`, `resizeGridBlind`, `setGridCellBlind`
(alphabetical, as the block already is).

### Tests

**NEW `src/elevation/model/__tests__/cellBlind.test.js` (4 tests)**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { cellBlindSides, gridFromItems, gridLeaves, insertRootColumn, mirrorGrid, resizeGridBlind,
  runBlind, setGridBlind, setGridCellBlind } from '../grid.js';
import { removeGridCell, splitGridCell, unsplitGridCell } from '../cellTree.js';

const ids = (prefix = 'n') => { let n = 0; return () => `${prefix}${++n}`; };
const ROOT = gridFromItems('r', [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30 },
  { id: 'f', kind: 'filler', width: 3 },
], { left: 24, right: null });
// a split down into a / n6 / n7 (grid n1); all three carry blind { left: 24 }
const B = splitGridCell(ROOT, 'a', 'down', 3, ids());
// only the top cell 'a' stays blind
const C = setGridCellBlind(setGridCellBlind(B, 'n6', 'left', null), 'n7', 'left', null);
const blindIds = (grid) => gridLeaves(grid).filter((leaf) => leaf.blind).map((leaf) => leaf.id);
const leaf = (grid, id) => gridLeaves(grid).find((entry) => entry.id === id);

describe('SPEC-34 blind per cell', () => {
  it('sets and clears one cell\'s blind', () => {
    expect(blindIds(B)).toEqual(['a', 'n6', 'n7']);
    expect(blindIds(C)).toEqual(['a']);
    expect(runBlind({ grid: C })).toEqual({ left: 24, right: null });
    expect(leaf(setGridCellBlind(C, 'n6', 'left', 30), 'n6').blind).toEqual({ left: 30 });
    expect(leaf(C, 'n6')).not.toHaveProperty('blind');
    expect(setGridCellBlind(B, 'a', 'left', 24)).toBe(B);
    expect(setGridCellBlind(B, 'b', 'left', 30)).toBe(B);
    expect(setGridCellBlind(B, 'f', 'right', 30)).toBe(B);
    expect(setGridCellBlind(B, 'zz', 'left', 30)).toBe(B);
    expect(setGridCellBlind(B, 'a', 'up', 30)).toBe(B);
    expect(setGridCellBlind(B, 'a', 'left', 0)).toBe(B);
    expect(setGridCellBlind(B, 'a', 'left', Number.NaN)).toBe(B);
  });

  it('keeps each cell\'s choice through structural edits', () => {
    expect(blindIds(splitGridCell(C, 'n7', 'down', 2, ids('m')))).toEqual(['a']);
    expect(blindIds(splitGridCell(C, 'a', 'down', 2, ids('m')))).toEqual(['a', 'm2']);
    expect(blindIds(removeGridCell(C, 'n6'))).toEqual(['a']);
    expect(blindIds(removeGridCell(C, 'a'))).toEqual([]);
    expect(runBlind({ grid: removeGridCell(C, 'a') })).toBeUndefined();
    expect(blindIds(unsplitGridCell(C, 'n6'))).toEqual([]);
    expect(blindIds(insertRootColumn(C, 1, { id: 'z', kind: 'cabinet', width: null }))).toEqual(['a']);
    const front = insertRootColumn(C, 0, { id: 'z', kind: 'cabinet', width: null });
    expect(blindIds(front)).toEqual(['z']);
    expect(leaf(front, 'z').blind).toEqual({ left: 24 });
    expect(leaf(mirrorGrid(C), 'a').blind).toEqual({ right: 24 });
  });

  it('lists the outer sides a cell touches', () => {
    expect(cellBlindSides(B, 'a')).toEqual(['left']);
    expect(cellBlindSides(B, 'n6')).toEqual(['left']);
    expect(cellBlindSides(B, 'b')).toEqual([]);
    expect(cellBlindSides(B, 'f')).toEqual(['right']);
    expect(cellBlindSides(B, 'zz')).toEqual([]);
    expect(cellBlindSides(gridFromItems('s', [{ id: 'x', kind: 'cabinet', width: null }]), 'x'))
      .toEqual(['left', 'right']);
  });

  it('resizes only the blind cells from the run field', () => {
    const resized = resizeGridBlind(C, 'left', 30);
    expect(blindIds(resized)).toEqual(['a']);
    expect(leaf(resized, 'a').blind).toEqual({ left: 30 });
    const spread = resizeGridBlind(setGridBlind(B, 'left', null), 'left', 30);
    expect(blindIds(spread)).toEqual(['a', 'n6', 'n7']);
    expect(leaf(spread, 'n7').blind).toEqual({ left: 30 });
    expect(blindIds(resizeGridBlind(C, 'left', null))).toEqual([]);
  });
});
```

**`cells.test.js`**: replace the test `'resolves blind cell widths'` (lines 92–103) with:

```js
  it('resolves blind cell widths from each cell', () => {
    const blindStack = structuredClone(STACK);
    blindStack.cells[0].node.blind = { left: 80, right: 96 };
    blindStack.cells[1].node.cells[1].node.blind = { right: 96 };
    const blindRun = { ...RUN, grid: { ...GRID, cells: [GRID.cells[0], cell(1, 0, blindStack)] } };
    const { pieces } = cellPieces(blindRun, LAYOUT);
    expect(pieces.find((piece) => piece.id === 't').blind).toEqual({ left: 80, right: 96 });
    expect(pieces.find((piece) => piece.id === 'p')).not.toHaveProperty('blind');
    expect(blindCellWidths(pieces, LAYOUT.pieces, [
      { side: 'right', pieceId: 'g1', boxWidth: 96 },
    ])).toEqual(new Map([['t', 96], ['q', 60]]));
    expect(blindCellWidths(pieces, LAYOUT.pieces, [
      { side: 'left', pieceId: 'g1', boxWidth: 80 },
    ])).toEqual(new Map([['t', 80]]));
    expect(blindCellWidths(pieces, LAYOUT.pieces, [
      { side: 'left', pieceId: 'a', boxWidth: 96 },
    ])).toEqual(new Map());
  });
```

Every other existing test passes unchanged (grid, gridRuns, cellTree, blind, slice).

**Count:** 578 + 4 = **582**.

---

## §3 Step 171 — kinds, depth, align, wrap (model)

### grid.js

- Line 1: `export const LEAF_KINDS = ['cabinet', 'filler', 'panel', 'void', 'shelves'];` and right below it
  ```js
  /** Leaf kinds that never carry a blind. */
  const BLINDLESS_KINDS = new Set(['panel', 'void', 'shelves']);
  ```
- `setNodeBlind` (146), first line inside `if (!isNestedGrid(node)) {`: `if (BLINDLESS_KINDS.has(node.kind)) return node;`
- `rehomeBlind` (step 170): the spread line becomes
  `if (!kept) return withBlindSide(leaf, side, BLINDLESS_KINDS.has(leaf.kind) ? null : width);`

### cellTree.js

After `CELL_DIRECTIONS` (8):

```js
/** Kinds a nested cell can be. */
export const CELL_KINDS = ['cabinet', 'panel', 'void', 'shelves'];

/** Most floating shelves in one shelves cell. */
export const MAX_SHELVES = 12;

/** Which panels run through when a cell is wrapped. */
export const WRAP_THROUGH = ['sides', 'top'];

const DEFAULT_SHELVES = { count: 2, back: false };
```

Append at the end of the file, verbatim:

```js
function replaceLeaf(grid, found, leaf) {
  const parent = replaceCell(found.parent, found.cellIndex, leaf, found.depth === 0);
  return found.depth === 0 ? parent : replaceNestedGrid(grid, found.parent, parent);
}

function nestedLeaf(grid, leafId) {
  const found = locate(grid, leafId);
  if (!found || found.depth === 0 || isNestedGrid(found.cell.node)) return null;
  return CELL_KINDS.includes(found.cell.node.kind) ? found : null;
}

/** Changes a nested leaf's kind, keeping only id, depth and align (a void keeps neither). */
export function setGridCellKind(grid, leafId, kind) {
  const found = nestedLeaf(grid, leafId);
  if (!found || !CELL_KINDS.includes(kind) || found.cell.node.kind === kind) return grid;
  const leaf = found.cell.node;
  const next = { id: leaf.id, kind };
  if (kind !== 'void') {
    if (Object.hasOwn(leaf, 'depth')) next.depth = leaf.depth;
    if (Object.hasOwn(leaf, 'align')) next.align = leaf.align;
  }
  if (kind === 'shelves') next.shelves = { ...DEFAULT_SHELVES };
  return replaceLeaf(grid, found, next);
}

/** Sets a nested leaf's depth (null = the run's) and align ('back', or 'face'/null = default). */
export function setGridCellDepth(grid, leafId, patch) {
  const found = nestedLeaf(grid, leafId);
  if (!found || found.cell.node.kind === 'void' || !patch) return grid;
  const next = { ...found.cell.node };
  if (Object.hasOwn(patch, 'depth')) {
    const { depth } = patch;
    if (depth === null) delete next.depth;
    else if (typeof depth === 'number' && Number.isFinite(depth) && depth > 0) next.depth = depth;
    else return grid;
  }
  if (Object.hasOwn(patch, 'align')) {
    if (patch.align === 'back') next.align = 'back';
    else if (patch.align === 'face' || patch.align === null) delete next.align;
    else return grid;
  }
  const leaf = found.cell.node;
  if (Object.is(next.depth, leaf.depth) && next.align === leaf.align) return grid;
  return replaceLeaf(grid, found, next);
}

/** Sets a shelves leaf's count (rounded, 1…MAX_SHELVES) and back panel flag. */
export function setGridShelves(grid, leafId, patch) {
  const found = nestedLeaf(grid, leafId);
  if (!found || found.cell.node.kind !== 'shelves' || !patch) return grid;
  const leaf = found.cell.node;
  const shelves = { ...DEFAULT_SHELVES, ...leaf.shelves };
  if (Object.hasOwn(patch, 'count')) {
    if (!Number.isFinite(patch.count)) return grid;
    shelves.count = Math.min(MAX_SHELVES, Math.max(1, Math.round(patch.count)));
  }
  if (Object.hasOwn(patch, 'back')) {
    if (typeof patch.back !== 'boolean') return grid;
    shelves.back = patch.back;
  }
  if (shelves.count === leaf.shelves?.count && shelves.back === leaf.shelves?.back) return grid;
  return replaceLeaf(grid, found, { ...leaf, shelves });
}

function wrapGrid(axis, makeId, nodes, sizes) {
  const id = makeId();
  const cross = autoTrack(makeId());
  const tracks = sizes.map((size) => (size === null
    ? autoTrack(makeId())
    : { id: makeId(), size, sizeMode: 'manual' }));
  const leaves = nodes.map((node) => node ?? { id: makeId(), kind: 'panel' });
  return {
    id,
    cols: axis === 'col' ? tracks : [cross],
    rows: axis === 'row' ? tracks : [cross],
    cells: leaves.map((node, index) => ({ col: axis === 'col' ? index : 0,
      row: axis === 'row' ? index : 0, colSpan: 1, rowSpan: 1, node })),
  };
}

/**
 * Wraps a cabinet leaf in panels: left, right and top, plus bottom when asked.
 * 'sides' runs the side panels full height; 'top' runs the top (and bottom) full width.
 */
export function wrapGridCell(grid, leafId, through, thickness, makeId, bottom = false) {
  if (!WRAP_THROUGH.includes(through)) return grid;
  if (!(typeof thickness === 'number' && Number.isFinite(thickness) && thickness > 0)) return grid;
  const found = locate(grid, leafId);
  if (!found || isNestedGrid(found.cell.node) || found.cell.node.kind !== 'cabinet') return grid;
  const leaf = found.cell.node;
  const t = thickness;
  const downSizes = bottom ? [t, null, t] : [t, null];
  let node;
  if (through === 'sides') {
    const outer = wrapGrid('col', makeId, [null, 'inner', null], [t, null, t]);
    const inner = wrapGrid('row', makeId, bottom ? [null, leaf, null] : [null, leaf], downSizes);
    node = { ...outer, cells: outer.cells.map((cell) => (
      cell.node === 'inner' ? { ...cell, node: inner } : cell)) };
  } else {
    const outer = wrapGrid('row', makeId, bottom ? [null, 'inner', null] : [null, 'inner'], downSizes);
    const inner = wrapGrid('col', makeId, [null, leaf, null], [t, null, t]);
    node = { ...outer, cells: outer.cells.map((cell) => (
      cell.node === 'inner' ? { ...cell, node: inner } : cell)) };
  }
  return rehomeBlind(grid, replaceLeaf(grid, found, node));
}
```

(`replaceLeaf` reuses the file's `replaceCell` and `replaceNestedGrid`; `wrapGridCell` imports nothing new.)

### cells.js

- The leaf piece: `depth: cell.node.depth ?? piece.depth,` and, after `auto`, in this order:
  `align` (when set), `blind` (step 170), `shelves` (a copy, when set):
  ```js
      depth: cell.node.depth ?? piece.depth,
      auto: track.size === null,
      ...(cell.node.align ? { align: cell.node.align } : {}),
      ...(cell.node.blind ? { blind: { ...cell.node.blind } } : {}),
      ...(cell.node.shelves ? { shelves: { ...cell.node.shelves } } : {}),
  ```
- In `cellPieces`' warning loop (122), after the `cell-too-small` check:
  ```js
      if (leaf.depth > piece.depth + EPSILON) {
        warnings.push({
          code: 'cell-too-deep',
          pieceId: leaf.id,
          message: 'Cell is deeper than its run.',
        });
      }
  ```
- Append, verbatim (still importing only `isNestedGrid`; settings are passed in):

```js
function overlapsVertically(a, b) {
  return Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z) > EPSILON;
}

/** Whether a panel cell sits against each side of a piece (REV-005/006 inside a split). */
export function cellCaptureSides(pieces, pieceId) {
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return { left: false, right: false };
  const panels = pieces.filter((candidate) => (
    candidate !== piece && candidate.kind === 'panel' && overlapsVertically(candidate, piece)));
  return {
    left: panels.some((panel) => Math.abs(panel.x + panel.width - piece.x) <= EPSILON),
    right: panels.some((panel) => Math.abs(panel.x - piece.x - piece.width) <= EPSILON),
  };
}

/** A panel's orientation from its thinnest dimension: 'side', 'top' or 'back'. */
export function panelOrientation(piece) {
  if (piece?.kind !== 'panel') return null;
  const thinnest = Math.min(piece.width, piece.height, piece.depth);
  if (piece.width === thinnest) return 'side';
  if (piece.height === thinnest) return 'top';
  return 'back';
}

/** A shelves cell's parts: its back panel (if any), then each shelf bottom up, evenly spaced. */
export function shelfParts(piece, settings) {
  if (piece?.kind !== 'shelves' || !piece.shelves) return [];
  const { count, back } = piece.shelves;
  const thickness = settings.floatingShelfThickness;
  const backThickness = back ? settings.endPanelThickness : 0;
  const gap = (piece.height - count * thickness) / (count + 1);
  const parts = [];
  if (back) {
    parts.push({ id: `${piece.id}:back`, kind: 'panel', x: piece.x, z: piece.z,
      width: piece.width, height: piece.height, depth: backThickness });
  }
  for (let index = 1; index <= count; index += 1) {
    parts.push({ id: `${piece.id}:shelf-${index}`, kind: 'shelf', x: piece.x,
      z: piece.z + index * gap + (index - 1) * thickness, width: piece.width,
      height: thickness, depth: piece.depth - backThickness });
  }
  return parts;
}

/** Pieces as parts: a shelves cell becomes its shelves (and back); a void has none. */
export function partPieces(pieces, settings) {
  return pieces.flatMap((piece) => {
    if (piece.kind === 'shelves') return shelfParts(piece, settings);
    return piece.kind === 'void' ? [] : [piece];
  });
}
```

### constants.js (108 lines)

- `DEFAULT_SETTINGS`: after `stackedLowerTop: 0.125,` (84) add `floatingShelfThickness: 1.5,`
- `KIND_LABELS`: add `panel: 'Panel', void: 'Open', shelves: 'Shelves', shelf: 'Shelf',`
- `KIND_COLORS`: add `panel: '#8b5cf6', void: '#475569', shelves: '#0ea5e9', shelf: '#0ea5e9',`

### persistence.js — ONE line

`V2_DEFAULTED_SETTING_KEYS`: after `'stackedLowerTop',` (82) add `'floatingShelfThickness',`.

### index.js

`cellTree.js` block adds `CELL_KINDS`, `MAX_SHELVES`, `setGridCellDepth`, `setGridCellKind`, `setGridShelves`,
`WRAP_THROUGH`, `wrapGridCell`; `cells.js` block adds `cellCaptureSides`, `panelOrientation`, `partPieces`,
`shelfParts`. Keep each block's existing order style.

### Tests — NEW `src/elevation/model/__tests__/cellKinds.test.js` (8), verbatim

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems, gridLeaves, isGridShape, LEAF_KINDS, runBlind, setGridBlind } from '../grid.js';
import { findLeaf, setGridCellDepth, setGridCellKind, setGridShelves, setGridTrackSize,
  splitGridCell, wrapGridCell } from '../cellTree.js';
import { cellCaptureSides, cellPieces, panelOrientation, partPieces, shelfParts } from '../cells.js';

const ids = (prefix = 'n') => { let n = 0; return () => `${prefix}${++n}`; };
const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const F = (id) => ({ id, size: 0.75, sizeMode: 'manual' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const DOOR = { type: 'door', size: null };
const INSET = { cabinetStyleId: 14 };
const isLeaf = (leaf) => LEAF_KINDS.includes(leaf.kind);
const ROOT = gridFromItems('r', [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30, face: DOOR, style: INSET, reveals: { top: 0 } },
]);
// b split down: grid n1, rows n3 (b, top) and n4 (n5, bottom); n5 = { id: 'n5', kind: 'cabinet', style: INSET }
const S = splitGridCell(ROOT, 'b', 'down', 2, ids());
const blindIds = (grid) => gridLeaves(grid).filter((leaf) => leaf.blind).map((leaf) => leaf.id);

describe('SPEC-34 cell kinds, depth and wrap', () => {
  it('changes a nested cell\'s kind', () => {
    expect(findLeaf(setGridCellKind(S, 'b', 'panel'), 'b')).toEqual({ id: 'b', kind: 'panel' });
    expect(findLeaf(setGridCellKind(S, 'n5', 'shelves'), 'n5'))
      .toEqual({ id: 'n5', kind: 'shelves', shelves: { count: 2, back: false } });
    const back = setGridCellDepth(setGridCellKind(S, 'b', 'panel'), 'b', { depth: 0.75, align: 'back' });
    expect(findLeaf(back, 'b')).toEqual({ id: 'b', kind: 'panel', depth: 0.75, align: 'back' });
    expect(findLeaf(setGridCellKind(back, 'b', 'void'), 'b')).toEqual({ id: 'b', kind: 'void' });
    expect(findLeaf(setGridCellKind(back, 'b', 'cabinet'), 'b'))
      .toEqual({ id: 'b', kind: 'cabinet', depth: 0.75, align: 'back' });
    for (const [id, kind] of [['a', 'panel'], ['b', 'cabinet'], ['b', 'filler'], ['zz', 'panel'], ['n1', 'panel']]) {
      expect(setGridCellKind(S, id, kind)).toBe(S);
    }
  });

  it('sets a nested cell\'s depth and align', () => {
    const deep = setGridCellDepth(S, 'n5', { depth: 21, align: 'back' });
    expect(findLeaf(deep, 'n5')).toEqual({ id: 'n5', kind: 'cabinet', style: INSET, depth: 21, align: 'back' });
    expect(setGridCellDepth(deep, 'n5', { depth: null, align: 'face' })).toEqual(S);
    expect(findLeaf(setGridCellDepth(deep, 'n5', { align: null }), 'n5')).not.toHaveProperty('align');
    for (const patch of [{ depth: 0 }, { depth: Number.NaN }, { align: 'middle' }, {}]) {
      expect(setGridCellDepth(S, 'n5', patch)).toBe(S);
    }
    expect(setGridCellDepth(S, 'a', { depth: 12 })).toBe(S);
    const open = setGridCellKind(S, 'n5', 'void');
    expect(setGridCellDepth(open, 'n5', { depth: 12 })).toBe(open);
  });

  it('sets shelves count and back', () => {
    const shelves = setGridCellKind(S, 'n5', 'shelves');
    expect(findLeaf(setGridShelves(shelves, 'n5', { count: 3.6, back: true }), 'n5').shelves)
      .toEqual({ count: 4, back: true });
    expect(findLeaf(setGridShelves(shelves, 'n5', { count: 40 }), 'n5').shelves.count).toBe(12);
    expect(findLeaf(setGridShelves(shelves, 'n5', { count: 0 }), 'n5').shelves.count).toBe(1);
    expect(setGridShelves(shelves, 'n5', { count: 2 })).toBe(shelves);
    expect(setGridShelves(shelves, 'n5', { count: Number.NaN })).toBe(shelves);
    expect(setGridShelves(shelves, 'n5', { back: 'yes' })).toBe(shelves);
    expect(setGridShelves(S, 'b', { count: 3 })).toBe(S);
  });

  it('wraps a root cabinet with the sides running through', () => {
    const wrapped = wrapGridCell(ROOT, 'a', 'sides', 0.75, ids('w'));
    expect(wrapped.cols[0]).toEqual({ id: 'w1:col', size: null, sizeMode: 'auto' });
    expect(wrapped.cells[0].node).toEqual({
      id: 'w1', cols: [F('w3'), AUTO('w4'), F('w5')], rows: [AUTO('w2')], cells: [
        cell(0, 0, { id: 'w6', kind: 'panel' }),
        cell(1, 0, { id: 'w8', cols: [AUTO('w9')], rows: [F('w10'), AUTO('w11')], cells: [
          cell(0, 0, { id: 'w12', kind: 'panel' }),
          cell(0, 1, { id: 'a', kind: 'cabinet' }),
        ] }),
        cell(2, 0, { id: 'w7', kind: 'panel' }),
      ],
    });
    expect(isGridShape(wrapped, isLeaf)).toBe(true);
  });

  it('wraps a nested cabinet with the top running through, and a bottom', () => {
    const wrapped = wrapGridCell(S, 'n5', 'top', 0.75, ids('w'), true);
    expect(wrapped.cells[1].node.cells[1].node).toEqual({
      id: 'w1', cols: [AUTO('w2')], rows: [F('w3'), AUTO('w4'), F('w5')], cells: [
        cell(0, 0, { id: 'w6', kind: 'panel' }),
        cell(0, 1, { id: 'w8', cols: [F('w10'), AUTO('w11'), F('w12')], rows: [AUTO('w9')], cells: [
          cell(0, 0, { id: 'w13', kind: 'panel' }),
          cell(1, 0, { id: 'n5', kind: 'cabinet', style: INSET }),
          cell(2, 0, { id: 'w14', kind: 'panel' }),
        ] }),
        cell(0, 2, { id: 'w7', kind: 'panel' }),
      ],
    });
    expect(wrapped.cols[1]).toEqual(S.cols[1]);
    for (const [id, through, thickness] of [['n5', 'middle', 0.75], ['n5', 'top', 0], ['n1', 'top', 0.75], ['zz', 'top', 0.75]]) {
      expect(wrapGridCell(S, id, through, thickness, ids('w'))).toBe(S);
    }
    const panel = setGridCellKind(S, 'n5', 'panel');
    expect(wrapGridCell(panel, 'n5', 'top', 0.75, ids('w'))).toBe(panel);
  });

  it('never puts a blind on a panel, void or shelves cell', () => {
    const blind = gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }], { left: 24, right: null });
    const wrapped = wrapGridCell(blind, 'a', 'sides', 0.75, ids('w'));
    expect(blindIds(wrapped)).toEqual([]);
    expect(runBlind({ grid: wrapped })).toBeUndefined();
    expect(setGridBlind(wrapped, 'left', 24)).toBe(wrapped);
    const stack = splitGridCell(blind, 'a', 'down', 2, ids());
    expect(blindIds(stack)).toEqual(['a', 'n5']);
    expect(findLeaf(setGridCellKind(stack, 'n5', 'panel'), 'n5')).toEqual({ id: 'n5', kind: 'panel' });
  });

  it('resolves depth, align and shelves into pieces', () => {
    let grid = setGridTrackSize(S, 'n4', 30);
    grid = setGridCellDepth(grid, 'b', { depth: 21, align: 'back' });
    grid = setGridShelves(setGridCellKind(grid, 'n5', 'shelves'), 'n5', { back: true });
    const layout = { pieces: [
      { id: 'a', kind: 'cabinet', role: 'item', cabinetTypeId: 3, x: 0, width: 36, z: 4, height: 90, depth: 24, auto: true },
      { id: 'n1', kind: 'cabinet', role: 'item', cabinetTypeId: 3, x: 36, width: 30, z: 4, height: 90, depth: 24, auto: false },
    ] };
    const { pieces, warnings } = cellPieces({ id: 'r', cabinetTypeId: 3, grid }, layout);
    expect(pieces[1]).toEqual({ id: 'n5', kind: 'shelves', role: 'item', cabinetTypeId: 3, columnId: 'n1',
      x: 36, z: 4, width: 30, height: 30, depth: 24, auto: false, shelves: { count: 2, back: true } });
    expect(pieces[2]).toEqual({ id: 'b', kind: 'cabinet', role: 'item', cabinetTypeId: 3, columnId: 'n1',
      x: 36, z: 34, width: 30, height: 60, depth: 21, auto: true, align: 'back' });
    expect(warnings).toEqual([]);
    expect(shelfParts(pieces[1], DEFAULT_SETTINGS)).toEqual([
      { id: 'n5:back', kind: 'panel', x: 36, z: 4, width: 30, height: 30, depth: 0.75 },
      { id: 'n5:shelf-1', kind: 'shelf', x: 36, z: 13, width: 30, height: 1.5, depth: 23.25 },
      { id: 'n5:shelf-2', kind: 'shelf', x: 36, z: 23.5, width: 30, height: 1.5, depth: 23.25 },
    ]);
    expect(partPieces([{ ...pieces[2], kind: 'void' }, pieces[1], pieces[0]], DEFAULT_SETTINGS)
      .map(({ id }) => id)).toEqual(['n5:back', 'n5:shelf-1', 'n5:shelf-2', 'a']);
    const tooDeep = setGridCellDepth(grid, 'b', { depth: 30 });
    expect(cellPieces({ id: 'r', cabinetTypeId: 3, grid: tooDeep }, layout).warnings)
      .toEqual([{ code: 'cell-too-deep', pieceId: 'b', message: 'Cell is deeper than its run.' }]);
  });

  it('reads panel orientation and capture by panels', () => {
    const panel = (id, x, z, width, height, depth = 24) => ({ id, kind: 'panel', x, z, width, height, depth });
    const pieces = [
      panel('L', 0, 0, 0.75, 30),
      { id: 'c', kind: 'cabinet', x: 0.75, z: 0, width: 20, height: 29.25, depth: 24 },
      panel('T', 0.75, 29.25, 20, 0.75),
      panel('R', 20.75, 0, 0.75, 30),
    ];
    expect(pieces.map(panelOrientation)).toEqual(['side', null, 'top', 'side']);
    expect(panelOrientation(panel('B', 0, 0, 20, 30, 0.75))).toBe('back');
    expect(cellCaptureSides(pieces, 'c')).toEqual({ left: true, right: true });
    expect(cellCaptureSides(pieces.slice(1, 3), 'c')).toEqual({ left: false, right: false });
    expect(cellCaptureSides(pieces, 'zz')).toEqual({ left: false, right: false });
  });
});
```

**Count:** 582 + 8 = **590**.

---

## §4 Step 172 — faces and part numbers see the kinds

**`faceLayouts.js`** (67 lines): import `cellCaptureSides` beside `cellPieces, stackedSides` (2). Replace the
`captured` block (42–48) with:

```js
    const byPanels = cellCaptureSides(cells.pieces, piece.id);
    const captured = piece.columnId
      ? {
        left: byPanels.left
          || (columnCaptured.left && Math.abs(piece.x - column.x) <= 1e-6),
        right: byPanels.right || (columnCaptured.right
          && Math.abs(piece.x + piece.width - column.x - column.width) <= 1e-6),
      }
      : columnCaptured;
```

**`partNumbers.js`** (238 lines):
- line 3: `import { blindCellWidths, cellPieces, partPieces } from './cells.js';`
- line 22: `const PART_KINDS = new Set(['cabinet', 'filler', 'end_panel', 'panel', 'shelf']);`
- `runParts` (67): `return cells.pieces` → `return partPieces(cells.pieces, settings)` (filter and map unchanged)
- `wallBadgeGroups` (215–219): wrap the pieces: `pieces: partPieces(cellPieces(run, splitRun(run, settings, { … })).pieces, settings),`

### Tests

`faceLayouts.test.js` — test 51 at the end of `describe('runFaceLayouts')`, verbatim:

```js
  it('51. a cabinet between panel cells is captured', () => {
    const panel = (id) => ({ id, kind: 'panel' });
    const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
    const WRAPPED = {
      ...RUN, id: 'run-3', width: 18, items: undefined,
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      grid: {
        id: 'run-3:grid', cols: [{ id: 'w:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'run-3:row', size: null, sizeMode: 'auto' }],
        cells: [cell(0, 0, {
          id: 'w',
          cols: [{ id: 'w:l', size: 0.75, sizeMode: 'manual' }, { id: 'w:m', size: null, sizeMode: 'auto' },
            { id: 'w:r', size: 0.75, sizeMode: 'manual' }],
          rows: [{ id: 'w:row', size: null, sizeMode: 'auto' }],
          cells: [
            cell(0, 0, panel('L')),
            cell(1, 0, {
              id: 'm', cols: [{ id: 'm:c', size: null, sizeMode: 'auto' }],
              rows: [{ id: 'm:t', size: 0.75, sizeMode: 'manual' }, { id: 'm:b', size: null, sizeMode: 'auto' }],
              cells: [cell(0, 0, panel('T')), cell(0, 1, { id: 'c', kind: 'cabinet' })],
            }),
            cell(2, 0, panel('R')),
          ],
        })],
      },
    };
    const room = roomWith(WRAPPED);
    const layouts = runFaceLayouts(room, resolveWall(room, room.walls[0]), WRAPPED, DEFAULT_SETTINGS);
    expect([...layouts.keys()]).toEqual(['c']);
    const c = layouts.get('c');
    expect(c.reveals.sources.left).toBe('rule:captured-single');
    expect(c.reveals.sources.right).toBe('rule:captured-single');
    expect(c.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 16.3125, height: 29.375 }]);
  });
```

`partNumbers.test.js` — a new describe at the end of the file, verbatim:

```js
describe('SPEC-34 kind part numbers', () => {
  const cellAt = (row, node) => ({ col: 0, row, colSpan: 1, rowSpan: 1, node });
  const kindRoom = () => partRoom({
    walls: partWalls({ wallA: { runs: [{
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
            rows: ['s:r0', 's:r1', 's:r2'].map((id) => ({ id, size: null, sizeMode: 'auto' })),
            cells: [
              cellAt(0, { id: 'top', kind: 'shelves', shelves: { count: 2, back: true } }),
              cellAt(1, { id: 'mid', kind: 'void' }),
              cellAt(2, { id: 'bot', kind: 'panel' }),
            ],
          } },
        ],
      },
    }, aUpper()] } }),
  });

  it('numbers panels and each shelf, never a void', () => {
    const room = kindRoom();
    const result = partNumbers(room, DEFAULT_SETTINGS);
    expect(result.parts.map(({ key }) => key)).toEqual([
      'A-base:left', 'a1', 'bot', 'top:back', 'top:shelf-1', 'top:shelf-2', 'A-base:right', 'a3',
      'B-base:left', 'b1', 'B-base:right', 'molding:toeKick',
    ]);
    expect(result.parts.find(({ key }) => key === 'bot')).toMatchObject({ kind: 'panel', width: 28.125 });
    expect(result.parts.find(({ key }) => key === 'top:shelf-2')).toMatchObject({ kind: 'shelf', width: 28.125 });
    expect(wallBadgeGroups(
      room,
      wallSideView(room.walls.find((wall) => wall.id === 'A'), 'front'),
      DEFAULT_SETTINGS,
    )[0].pieces.map(({ id }) => id)).toEqual([
      'A-base:left', 'a1', 'bot', 'top:back', 'top:shelf-1', 'top:shelf-2', 'A-base:right',
    ]);
  });
});
```

**Count:** 590 + 2 = **592**.

---

## §5 Step 173 — saves accept kinds, depth and align

**`persistence.js`** (578 lines after 171):
- Imports (7): add `import { MAX_SHELVES } from '../model/cellTree.js';` above it, and `LEAF_KINDS` to the
  `grid.js` import.
- After `const ITEM_KINDS = …` (26):
  ```js
  const LEAF_KIND_SET = new Set(LEAF_KINDS);
  /** Keys each non-cabinet cell kind may carry. */
  const CELL_KIND_KEYS = {
    panel: ['id', 'kind', 'depth', 'align'],
    void: ['id', 'kind'],
    shelves: ['id', 'kind', 'depth', 'align', 'shelves'],
  };
  ```
- Replace `isLeaf` and `isCellLeaf` (~218–225) and the `isCellGrid` comment with:

```js
function isLeaf(leaf) {
  return Boolean(leaf) && typeof leaf.id === 'string'
    && LEAF_KIND_SET.has(leaf.kind) && isLeafBlind(leaf.blind);
}

function isShelves(shelves) {
  return Boolean(shelves) && typeof shelves === 'object' && !Array.isArray(shelves)
    && Object.keys(shelves).every((key) => key === 'count' || key === 'back')
    && Number.isInteger(shelves.count) && shelves.count >= 1 && shelves.count <= MAX_SHELVES
    && typeof shelves.back === 'boolean';
}

/** SPEC-34 cells: cabinets as before, plus panel, void and shelves; depth and align on any but a void. */
function isCellLeaf(leaf) {
  const depthOk = (leaf.depth === undefined || (isFiniteNumber(leaf.depth) && leaf.depth > 0))
    && (leaf.align === undefined || leaf.align === 'face' || leaf.align === 'back');
  if (!depthOk) return false;
  if (leaf.kind === 'cabinet') return isItem({ ...leaf, width: null });
  const keys = CELL_KIND_KEYS[leaf.kind];
  return Boolean(keys)
    && Object.keys(leaf).every((key) => keys.includes(key))
    && (leaf.kind !== 'shelves' || isShelves(leaf.shelves));
}

/** SPEC-33 nested grids: one column of 2+ rows or one row of 2+ columns, no spans. */
```

`isLeaf` now accepts every leaf kind (nested leaves go through it via `isGridShape`); root columns are still
limited to cabinet/filler by `rootItems(grid).every(isItem)`, which is unchanged.

### Tests — `persistence.test.js`, new describe at the end (3), verbatim

```js
describe('SPEC-34 cell kinds', () => {
  const cellAt = (row, node) => ({ col: 0, row, colSpan: 1, rowSpan: 1, node });
  const KINDS = {
    id: 'k',
    cols: [{ id: 'k:c', size: null, sizeMode: 'auto' }],
    rows: ['k:r0', 'k:r1', 'k:r2', 'k:r3'].map((id) => ({ id, size: null, sizeMode: 'auto' })),
    cells: [
      cellAt(0, { id: 'sh', kind: 'shelves', shelves: { count: 3, back: true }, depth: 12, align: 'back' }),
      cellAt(1, { id: 'ov', kind: 'cabinet', depth: 21, align: 'back', blind: { left: 30 } }),
      cellAt(2, { id: 'op', kind: 'void' }),
      cellAt(3, { id: 'bp', kind: 'panel', depth: 0.75, align: 'back' }),
    ],
  };
  function kindDocument() {
    const document = currentDocument();
    const run = document.rooms[0].walls[0].runs[0];
    run.grid.cols[0] = { id: 'k:col', size: 45, sizeMode: 'manual' };
    run.grid.cells[0].node = structuredClone(KINDS);
    return document;
  }

  it('saves and loads panel, void and shelves cells with depth and align', () => {
    expect(isElevationDocument(kindDocument())).toBe(true);
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(kindDocument())]]),
    };
    expect(loadElevationDocument()).toEqual(normalizeElevationDocument(kindDocument()));
  });

  it('rejects cells that break the kind rules', () => {
    const rejects = (mutate) => {
      const document = kindDocument();
      mutate(document.rooms[0].walls[0].runs[0].grid.cells[0].node.cells.map((entry) => entry.node));
      expect(isElevationDocument(document)).toBe(false);
    };
    rejects(([, , open]) => { open.depth = 12; });
    rejects(([, , , panel]) => { panel.face = { type: 'door', size: null }; });
    rejects(([, , , panel]) => { panel.blind = { left: 30 }; });
    rejects(([, , , panel]) => { panel.kind = 'shelf'; });
    rejects(([shelves]) => { shelves.shelves = { count: 0, back: true }; });
    rejects(([shelves]) => { shelves.shelves = { count: 2.5, back: true }; });
    rejects(([shelves]) => { shelves.shelves = { count: 13, back: false }; });
    rejects(([shelves]) => { shelves.shelves = { count: 2 }; });
    rejects(([shelves]) => { shelves.shelves = { count: 2, back: true, gap: 1 }; });
    rejects(([shelves]) => { delete shelves.shelves; });
    rejects(([, oven]) => { oven.depth = 0; });
    rejects(([, oven]) => { oven.align = 'middle'; });
    const root = currentDocument();
    root.rooms[0].walls[0].runs[0].grid.cells[0].node.kind = 'panel';
    expect(isElevationDocument(root)).toBe(false);
  });

  it('the store loads kinds unchanged', () => {
    const document = kindDocument();
    const state = createInitialElevationState(document);
    expect(state.rooms[0].walls[0].runs[0].grid).toEqual(document.rooms[0].walls[0].runs[0].grid);
    expect(toElevationDocument(state).rooms).toEqual(kindDocument().rooms);
  });
});
```

**Count:** 592 + 3 = **595**.

---

## §6 Step 174 — store reducers

`elevationSlice.js` (1526 lines at `ce63915`; unchanged by 170–173):

1. `grid.js` import (6–13): add `resizeGridBlind` and `setGridCellBlind` (keep `setGridBlind`, `setRunEnd` uses it).
   `cellTree.js` import (14–21): add `setGridCellDepth`, `setGridCellKind`, `setGridShelves`, `wrapGridCell`.
2. `setRunBlind` (1098): `run.grid = resizeGridBlind(run.grid, side, width);`
3. Five reducers right before `setItemFace` (1320), verbatim:

```js
    setCellBlind(state, action) {
      const location = runLocation(state, action.payload);
      const { cellId, side, width } = action.payload;
      if (!location || location.run.ends[side]?.type !== 'blind') return;
      const before = location.run.grid;
      const grid = setGridCellBlind(before, cellId, side, width ?? null);
      if (grid === before) return;
      location.run.grid = grid;
    },
    setCellKind(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, kind } = action.payload;
      const before = location.run.grid;
      const grid = setGridCellKind(before, cellId, kind);
      if (grid === before) return;
      location.run.grid = grid;
      if (state.selection.pieceId === cellId && kind !== 'cabinet') state.facePath = null;
      syncRoomAt(state, location.roomIndex);
    },
    setCellDepth(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId } = action.payload;
      const patch = {};
      if (Object.hasOwn(action.payload, 'depth')) {
        const depth = action.payload.depth ?? null;
        if (depth !== null && depth > location.run.depth + 1e-6) return;
        patch.depth = depth;
      }
      if (Object.hasOwn(action.payload, 'align')) patch.align = action.payload.align ?? null;
      const before = location.run.grid;
      const grid = setGridCellDepth(before, cellId, patch);
      if (grid === before) return;
      location.run.grid = grid;
    },
    setCellShelves(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId } = action.payload;
      const patch = {};
      if (Object.hasOwn(action.payload, 'count')) patch.count = action.payload.count;
      if (Object.hasOwn(action.payload, 'back')) patch.back = action.payload.back;
      const before = location.run.grid;
      const grid = setGridShelves(before, cellId, patch);
      if (grid === before) return;
      location.run.grid = grid;
    },
    wrapCell(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, through, bottom = false } = action.payload;
      const before = location.run.grid;
      const grid = wrapGridCell(
        before, cellId, through, state.settings.endPanelThickness, uuid, Boolean(bottom),
      );
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
```

4. Actions list: after `setTrackSize,` (1510) add `setCellBlind, setCellKind, setCellDepth, setCellShelves, wrapCell,`
   (one per line).

**Don't touch** `setRunEnd` (it already clears a side's blind when the end stops being blind), `splitCell`,
`removeCell`, the face/style/reveal reducers (they already skip non-cabinet leaves).

### Tests — `elevationSlice.test.js`

Import `setCellBlind`, `setCellDepth`, `setCellKind`, `setCellShelves` (after `resizeRun,`) and `wrapCell`
(after `useAutoHeightsForRoom,`). New describe at the end (5), verbatim:

```js
describe('SPEC-34 cell kind reducers', () => {
  const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
  const BLIND_ENDS = { left: { type: 'blind', width: null }, right: { type: 'filler', width: null } };
  const splitA = (overrides = {}) => elevationReducer(stateWithRun(run({
    autoCount: false, items: [fixed('a', 30), auto('b')], ...overrides,
  })), splitCell({ ...actionBase, cellId: 'a', direction: 'down', count: 2 }));
  const stackOf = (state) => currentRun(state).grid.cells[0].node;
  const leafOf = (state, id) => gridLeaves(currentRun(state).grid).find((leaf) => leaf.id === id);
  const blindIds = (state) => gridLeaves(currentRun(state).grid)
    .filter((leaf) => leaf.blind).map((leaf) => leaf.id);

  it('sets blind per cell, and the run field resizes only blind cells', () => {
    let state = splitA({ ends: BLIND_ENDS, blind: { left: 36, right: null } });
    const lower = stackOf(state).cells[1].node.id;
    expect(blindIds(state)).toEqual(['a', lower]);
    state = elevationReducer(state, setCellBlind({ ...actionBase, cellId: lower, side: 'left', width: null }));
    expect(blindIds(state)).toEqual(['a']);
    state = elevationReducer(state, setRunBlind({ ...actionBase, side: 'left', width: 30 }));
    expect(leafOf(state, 'a').blind).toEqual({ left: 30 });
    expect(blindIds(state)).toEqual(['a']);
    expect(elevationReducer(state, setCellBlind({ ...actionBase, cellId: 'b', side: 'right', width: 30 })))
      .toBe(state);
  });

  it('changes a cell\'s kind and clears the face path', () => {
    let state = splitA();
    const lower = stackOf(state).cells[1].node.id;
    state = elevationReducer(state, setSelection({ runId: 'run-1', pieceId: lower }));
    state = elevationReducer(state, setFacePath('r'));
    state = elevationReducer(state, setCellKind({ ...actionBase, cellId: lower, kind: 'shelves' }));
    expect(leafOf(state, lower)).toEqual({ id: lower, kind: 'shelves', shelves: { count: 2, back: false } });
    expect(state.facePath).toBeNull();
    expect(elevationReducer(state, setCellKind({ ...actionBase, cellId: 'b', kind: 'panel' }))).toBe(state);
  });

  it('sets shelves count and back', () => {
    let state = splitA();
    const lower = stackOf(state).cells[1].node.id;
    state = elevationReducer(state, setCellKind({ ...actionBase, cellId: lower, kind: 'shelves' }));
    state = elevationReducer(state, setCellShelves({ ...actionBase, cellId: lower, count: 4, back: true }));
    expect(leafOf(state, lower).shelves).toEqual({ count: 4, back: true });
    expect(elevationReducer(state, setCellShelves({ ...actionBase, cellId: lower, count: Number.NaN })))
      .toBe(state);
  });

  it('sets depth and align, never deeper than the run', () => {
    let state = splitA();
    const lower = stackOf(state).cells[1].node.id;
    state = elevationReducer(state, setCellDepth({ ...actionBase, cellId: lower, depth: 21, align: 'back' }));
    expect(leafOf(state, lower)).toMatchObject({ depth: 21, align: 'back' });
    expect(elevationReducer(state, setCellDepth({ ...actionBase, cellId: lower, depth: 30 }))).toBe(state);
    state = elevationReducer(state, setCellDepth({ ...actionBase, cellId: lower, depth: null }));
    expect(leafOf(state, lower)).not.toHaveProperty('depth');
    expect(leafOf(state, lower).align).toBe('back');
  });

  it('wraps a cell in panels at the run\'s end panel thickness', () => {
    const state = elevationReducer(
      stateWithRun(run({ autoCount: false, items: [fixed('a', 30), auto('b')] })),
      wrapCell({ ...actionBase, cellId: 'a', through: 'sides', bottom: true }),
    );
    const outer = stackOf(state);
    expect(currentRun(state).grid.cols[0]).toEqual({ id: `${outer.id}:col`, size: 30, sizeMode: 'manual' });
    expect(outer.cols.map((col) => col.size)).toEqual([0.75, null, 0.75]);
    expect(outer.cells.map((entry) => entry.node.kind ?? 'grid')).toEqual(['panel', 'grid', 'panel']);
    const inner = outer.cells[1].node;
    expect(inner.rows.map((row) => row.size)).toEqual([0.75, null, 0.75]);
    expect(inner.cells.map((entry) => entry.node.id === 'a' ? 'a' : entry.node.kind))
      .toEqual(['panel', 'a', 'panel']);
  });
});
```

**Count:** 595 + 5 = **600**.

---

## §7 Step 175 — the cell panel

Line numbers at `ce63915`; none of these files change in 170–174.

**NEW `components/properties/CellWrapSection.jsx`** — `({ wall, run, cellId })`: a "Wrap in panels" heading
with a **Bottom panel** checkbox (local state, default off) and two buttons, **Sides through** / **Top
through**, dispatching `wrapCell({ wallId, runId, cellId, through, bottom })`. Same classes as
`CellSplitSection`.

**`CellSplitSection.jsx`** (82): new prop `canSplit = true` (15). When false, hide the heading/count row and
the Split across / Split down row (27–53); the `nested` row (55–) stays.

**`CellProperties.jsx`** (115) — imports from `'../../model/index.js'`: `cellBlindSides, findCell,
formatInchesInput, MAX_SHELVES, panelOrientation, runItems`; actions `setCellBlind, setCellDepth, setCellKind,
setCellShelves` (plus the existing three). After `columnLocked` (26):

```js
  const cellBase = { ...actionBase, cellId: item.id };
  const isCabinet = item.kind === 'cabinet';
  const blindSides = isCabinet
    ? cellBlindSides(run.grid, item.id).filter((side) => run.ends[side].type === 'blind')
    : [];
  const orientation = panelOrientation(piece);
```

- **Cell** section (30–): first a **Kind** `<select>` (Cabinet / Panel / Open (nothing) / Floating shelves →
  `setCellKind`), under it for a panel a grey line `Side panel` / `Top / bottom panel` / `Back panel`; then the
  existing size grid and lock button.
- After the Column section, three new sections:
  - **Depth** (not for a void): `InchInput` Depth, `allowBlank`, placeholder `formatInchesInput(run.depth)` →
    `setCellDepth({ …cellBase, depth })`; a **Line up** select Faces / Backs (`item.align ?? 'face'`) →
    `setCellDepth({ …cellBase, align })`.
  - **Shelves** (kind shelves): a number input Count 1…`MAX_SHELVES` → `setCellShelves({ …, count: Number(value) })`;
    a **Back panel** checkbox → `setCellShelves({ …, back })`.
  - **Blind** (when `blindSides` isn't empty): one `InchInput` per side, label `Blind box (left)`, `allowBlank`,
    placeholder `not blind` → `setCellBlind({ …cellBase, side, width })`.
- `<CellSplitSection … nested canSplit={isCabinet} />`; `{isCabinet && <CellWrapSection … />}`;
  `FaceProperties` only when `isCabinet`.

**`CabinetProperties.jsx`** (273): import `CellWrapSection`; render
`<CellWrapSection wall={wall} run={run} cellId={item.id} />` right after the `CellSplitSection` (236).

**`PieceProperties.jsx`** (127): `partNumberField` (65) is `null` when `piece.kind` is `'void'` or
`'shelves'` (their parts are the shelves; the badges show those numbers).

No tests. **Count stays 600.**

---

## §8 Step 176 — draw the kinds

**`RunGroup.jsx`** (504):
- Import `panelOrientation, shelfParts` beside `blindCellWidths, cellPieces` (11).
- Above `function RunGroup`: `const PANEL_LABELS = { side: 'Side', top: 'Top', back: 'Back' };`
- `subLabels` (71): before the blind loop, label cells:
  ```js
    for (const piece of cells.pieces) {
      if (piece.kind === 'void') labels.set(piece.id, 'Open');
      if (piece.kind === 'panel') labels.set(piece.id, `${PANEL_LABELS[panelOrientation(piece)]} panel`);
      if (piece.kind === 'shelves') {
        labels.set(piece.id, `${piece.shelves.count} shelves${piece.shelves.back ? ' + back' : ''}`);
      }
    }
  ```
- Before `drawnPieces` (117):
  `const shelves = useMemo(() => cells.pieces.flatMap((piece) => shelfParts(piece, settings)), [cells, settings]);`
- Right before the `{[...faceLayouts].map(` block (387): one `Rect` per shelf part,
  `{...wallRectToScreen(part, transform)}`, `fill={KIND_COLORS[part.kind]}`, `opacity` 0.9 for a shelf and
  0.25 for the back, stroke `#1e293b` width 1, `listening={false}`.

**`PieceRect.jsx`** (125): after `fixedCabinet` (33) `const hollow = piece.kind === 'void' || piece.kind === 'shelves';`
The main `Rect` (50–56): `fill={hollow ? 'transparent' : cornerFiller ? '#fbbf24' : KIND_COLORS[piece.kind]}`,
`dash={piece.kind === 'void' ? [6, 4] : undefined}`, and a void's resting stroke is `KIND_COLORS.void`
(`stroke={piece.kind === 'void' && outline === '#1e293b' ? KIND_COLORS.void : outline}`). A transparent fill
still takes clicks in Konva, so voids and shelves stay selectable.

No tests. **Count stays 600.**

**Done when (round):** `npm test` (600) and `npm run lint` clean; every room without panel/void/shelves cells
draws as at `ce63915`; the layouts in "After this round" can be drawn and reloaded.

## Open after this round

1. **Floating shelf thickness** — 1 1/2" assumed. What does the shop use, and is the bottom gap equal to the
   others, or do shelves start at the bottom of the cell?
2. **A cabinet under a top panel or over a bottom panel** (a wrap): which reveal? Standard for now. Like a wood
   top (REV-002, 1/8")?
3. Chain placement (round 33 Open 1) — still as built; no change requested.
