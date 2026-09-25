# Elevation Lab — SPEC-32 (cells round 32: the grid shape)

Steps 156–160. The earlier SPEC files still apply; this file is the source of truth for what follows.
The design is `docs/elevation-mvp/CELLS-PLAN.md`, round 32. SPEC-31 is done (`57adeb7`); the repo is at
`9d2d166` (shop rules docs only since).

Round 32 changes what a run *stores*, and nothing a user can see. `run.items` and `run.blind` are
replaced by `run.grid`. Every existing layout resolves exactly as before.

`run.items` has 54 source references and ~100 test fixtures, so per PROMPT-CONVENTIONS rules 4 and 8
the round is five small steps, each green on its own:

| Step | What | Files |
|---|---|---|
| **156** | `model/grid.js`: the shape, its constructors, the item view, blind, pure edit helpers, a validator. New file + its test file. Nothing calls it yet. | 2 new, `model/index.js` |
| **157** | Model readers switch from `run.items` / `run.blind` to `runItems(run)` / `runBlind(run)`. 17 sites. | `splitRun`, `room`, `dimensions`, `faceLayouts`, `blind` |
| **158** | UI readers switch the same way. 13 sites. | `helpers`, `ElevationCanvas`, `RunGroup`, 4 files in `properties/` |
| **159** | Disk format v4: saved runs hold `grid`, v3 migrates. The store still holds items; persistence converts at the boundary. | `persistence.js` + its test |
| **160** | The store flips to `grid`. Writers use the grid helpers, the adapter from 159 goes. | slice, `runDefaults`, `splitRun.syncAutoItems`, `room` clone/mirror |

Prompts for 156–158 are in `PROMPTS-32.md`. 159 and 160 get theirs after 158 lands, with line
numbers taken from that commit.

## After this round you can

- Nothing new on screen. That's the point: round 33 (vertical split) starts from a run that already
  stores cells.

## Not in this round

- Splitting, drawing or selecting cells (33). More than one root row. Spans other than 1.
- Cell kinds beyond `cabinet` and `filler` (34). `gap` is accepted by the validator but nothing sets
  or reads it (34).
- `typeId`, `depth`, `align`, `purpose`, `notes` on leaves.
- Moving faces onto the grid shape.

---

## §1 The shape

```js
run.grid = { id, cols: [track], rows: [track], cells: [cell] }
track    = { id, size: number | null, sizeMode: 'auto' | 'manual' | 'solved', gap?, pin?, absorb? }
cell     = { col, row, colSpan, rowSpan, node }     // col/row are track indexes
node     = grid | leaf                              // a node with `cols` is a grid
leaf     = { id, kind: 'cabinet' | 'filler', face?, style?, reveals?, blind? }
```

Decisions made here, beyond CELLS-PLAN:

- **Cells address tracks by index**, not id. Inserting or removing a column re-indexes cells; the
  helpers do that, callers never touch `col` by hand.
- **`pin` and `absorb` live on the root column track.** They position and size a column, not a box.
  `width` becomes the column's `size`.
- **`sizeMode`**: `size: null` ⇔ `'auto'`. A typed width is `'manual'`. `'solved'` is accepted but
  nothing writes it yet.
- **Ids are deterministic.** A leaf keeps the item's id (so selection, part-number overrides and
  face layouts keyed by piece id keep working). Its column is `` `${leaf.id}:col` ``. The grid is
  `` `${run.id}:grid` `` and its one row `` `${run.id}:row` ``. Migration is therefore repeatable and
  testable with literals.
- **Blind moves to the leaf** as `leaf.blind = { left?: number, right?: number }`, only the sides set.
  In round 32 it only ever sits on the outermost column's leaf, and the structural helpers
  **re-home it** so a run's blind behaves exactly as `run.blind` did: add a cabinet at the left end
  and the blind moves to the new outer cabinet, as today. One known difference: removing the *only*
  column drops the blind (an empty run has nowhere to hold it).

### The item view

The solver keeps working on items. `rootItems(grid)` builds, per root column in order,
`{ ...leaf without blind, width: col.size, pin?, absorb? }` — exactly the item the column came from.
`runItems(run)` is the one entry point every reader uses:

```js
runItems(run) = run.items ?? (run.grid ? rootItems(run.grid) : [])
```

`run.items` wins when present, **on purpose and permanently**: `splitRun` builds transient sub-runs
as `{ ...run, items: rightItems }` (`splitRun.js:451, 489`), which carry the parent's `grid` too, and
they must solve their slice. After step 160 no *stored* run has `items`; the key survives only as the
solver's transient view (and in model-test fixtures, which therefore don't need migrating).

`runBlind(run) = run.blind ?? blind from the first column's leaf (left) and last column's leaf
(right)` — `{ left, right }` with `null` for an unset side, or `undefined` when neither is set, which
is what `run.blind` looks like today.

---

## §2 `src/elevation/model/grid.js` (step 156)

Pure. Imports nothing. Never mutates its input — every helper returns new objects (so it is safe on
immer drafts: callers assign the result). Helpers that find nothing to change return the **same
reference** they were given.

```js
export const LEAF_KINDS = ['cabinet', 'filler'];
export const SIZE_MODES = ['auto', 'manual', 'solved'];

export function gridFromItems(runId, items, blind)   // blind optional, run.blind's shape
export function rootItems(grid)
export function runItems(run)
export function runBlind(run)
export function setGridBlind(grid, side, width)      // width null / ≤0 / non-finite clears
export function insertRootColumn(grid, index, item)  // index clamped to [0, cols.length]
export function removeRootColumn(grid, leafId)
export function updateRootItem(grid, leafId, patch)
export function replaceRootItems(grid, items)
export function cloneGrid(grid)
export function mirrorGrid(grid)
export function isGridShape(grid, isLeaf)
```

- **`gridFromItems(runId, items, blind)`** — one row; one column and one cell per item, in order.
  Column from the item's `width`, `pin`, `absorb` (pin/absorb only when `!== undefined`); leaf from
  every other key. Then `blind.left` onto the first leaf and `blind.right` onto the last, skipping
  null. `items = []` gives `cols: [], cells: []` and still one row.
- **`rootItems(grid)`** — the item view (§1). Defined for one-row grids; for column `i` it uses the
  cell with `col === i && row === 0`.
- **`setGridBlind(grid, side, width)`** — sets or clears `side` on the first (`left`) or last
  (`right`) column's leaf. A leaf whose blind becomes empty loses the `blind` key. Empty grid → same
  reference.
- **`insertRootColumn` / `removeRootColumn` / `replaceRootItems`** — structural. Each reads
  `runBlind({ grid })` first, builds the new columns (leaves from items carry no blind), strips blind
  from every leaf, then re-applies the old blind with `setGridBlind`. Cells are re-indexed 0…n−1 and
  come out in column order. `mirrorGrid` keeps the cells array in its input order.
  `replaceRootItems` keeps `grid.id` and `grid.rows`; it throws
  `new Error('replaceRootItems needs a one-row grid')` when `rows.length !== 1`. Unknown `leafId` →
  same reference.
- **`updateRootItem(grid, leafId, patch)`** — patch is in item terms. `width` sets `size` and
  `sizeMode` (`null` → `'auto'`, number → `'manual'`); `pin` and `absorb` go on the column; every
  other key on the leaf. A patch value of `undefined` **deletes** that key. Callers never pass `id` or
  `blind`. Unknown `leafId` → same reference.
- **`cloneGrid(grid)`** — the depth `cloneRun` uses today (`room.js:79` copies items one level):
  new grid, new arrays, `{ ...track }` (and `{ ...pin }`), `{ ...cell }`, `{ ...leaf }` (and
  `{ ...blind }`), nested grids recursively. Face trees are shared, as now.
- **`mirrorGrid(grid)`** — for `room.js:1502`. Columns reversed; each cell's `col` becomes
  `cols.length - col - colSpan`; each leaf's blind swaps `left`/`right`; nested grids mirrored
  recursively; rows and ids unchanged.
- **`isGridShape(grid, isLeaf)`** — structure only; `isLeaf(node)` judges leaves (persistence will pass
  its own). True when: `id` is a string; `rows` has ≥ 1 track; every track has a string `id`, `size`
  `null` or a finite number ≥ 0, `sizeMode` in `SIZE_MODES`, `(sizeMode === 'auto') === (size ===
  null)`, and `gap` undefined or finite ≥ 0 (other keys allowed); every cell has integer `col, row ≥ 0`
  and `colSpan, rowSpan ≥ 1` inside the track counts; a node with `cols` passes `isGridShape`
  recursively, any other node has a string `id` and passes `isLeaf`; and every (col, row) slot is
  covered by exactly one cell (`cols: []` ⇒ `cells: []`).

`model/index.js` re-exports all of the above in a new `export { … } from './grid.js';` block at the
end.

## §3 Tests (step 156): `src/elevation/model/__tests__/grid.test.js`

Literal fixtures. `PIN` is opaque here — grid.js never looks inside it.

```js
const PIN = { anchor: 'center', from: 'left', value: 60 };
const FACE = { type: 'door' };
const ITEMS = [
  { id: 'a', kind: 'cabinet', width: null },
  { id: 'b', kind: 'cabinet', width: 30, pin: PIN },
  { id: 'f', kind: 'filler', width: 3 },
  { id: 'c', kind: 'cabinet', width: null, absorb: true, face: FACE, reveals: { top: 0.125 } },
];
const GRID = {
  id: 'r1:grid',
  cols: [
    { id: 'a:col', size: null, sizeMode: 'auto' },
    { id: 'b:col', size: 30, sizeMode: 'manual', pin: PIN },
    { id: 'f:col', size: 3, sizeMode: 'manual' },
    { id: 'c:col', size: null, sizeMode: 'auto', absorb: true },
  ],
  rows: [{ id: 'r1:row', size: null, sizeMode: 'auto' }],
  cells: [
    { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'a', kind: 'cabinet' } },
    { col: 1, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'b', kind: 'cabinet' } },
    { col: 2, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'f', kind: 'filler' } },
    { col: 3, row: 0, colSpan: 1, rowSpan: 1,
      node: { id: 'c', kind: 'cabinet', face: FACE, reveals: { top: 0.125 } } },
  ],
};
const BLIND_GRID = gridFromItems('r1', ITEMS, { left: 36, right: 24 });
// leaf a → blind { left: 36 }, leaf c → blind { right: 24 }
```

1. `gridFromItems('r1', ITEMS)` `toEqual` `GRID`.
2. `rootItems(GRID)` `toEqual` `ITEMS`. `rootItems(gridFromItems('r1', []))` is `[]`, and that grid is
   `{ id: 'r1:grid', cols: [], rows: [{ id: 'r1:row', size: null, sizeMode: 'auto' }], cells: [] }`.
3. `rootItems(BLIND_GRID)` `toEqual` `ITEMS` (blind is not in the item view). `gridFromItems('r1',
   ITEMS, { left: null, right: null })` `toEqual` `GRID`.
4. Nothing mutates: deep-freeze `ITEMS` and `GRID` (a small recursive `Object.freeze` in the test) and
   call every helper on them without a throw.
5. `runItems`: `{ items: [ITEMS[0]], grid: GRID }` → `[ITEMS[0]]`; `{ grid: GRID }` → `ITEMS`; `{}` → `[]`.
6. `runBlind`: `{ blind: { left: 5, right: null }, grid: BLIND_GRID }` → `{ left: 5, right: null }`;
   `{ grid: BLIND_GRID }` → `{ left: 36, right: 24 }`; `{ grid: GRID }` → `undefined`. One column:
   `gridFromItems('r2', [ITEMS[0]], { left: 36, right: 24 })` puts `{ left: 36, right: 24 }` on leaf
   `a` and `runBlind` returns `{ left: 36, right: 24 }`.
7. `setGridBlind(GRID, 'right', 24)` → leaf `c` blind `{ right: 24 }`. Then `setGridBlind(that,
   'right', null)` → leaf `c` has no `blind` key (`toEqual(GRID)`). `0` and `NaN` clear too.
   `setGridBlind(gridFromItems('r1', []), 'left', 36)` returns the same reference.
8. `insertRootColumn(GRID, 1, { id: 'n', kind: 'cabinet', width: null })` → col ids
   `['a:col', 'n:col', 'b:col', 'f:col', 'c:col']`, cell `col`s `[0, 1, 2, 3, 4]` in that order,
   `rootItems(...).map((i) => i.id)` `['a', 'n', 'b', 'f', 'c']`. Index `99` appends; `-3` prepends.
9. `removeRootColumn(GRID, 'b')` → item ids `['a', 'f', 'c']`, cell `col`s `[0, 1, 2]`.
   `removeRootColumn(GRID, 'zz')` is `GRID` (`toBe`).
10. Blind re-homing, on `BLIND_GRID`: `insertRootColumn(…, 0, { id: 'n', kind: 'cabinet', width:
    null })` → leaf `n` has `{ left: 36 }`, leaf `a` has no `blind`, `runBlind` unchanged.
    `removeRootColumn(…, 'c')` → leaf `f` has `{ right: 24 }`. Removing `a`, `b`, `f`, `c` in turn
    leaves `runBlind(...)` `undefined`.
11. `updateRootItem`: `(GRID, 'a', { width: 24 })` → col `a` `{ id: 'a:col', size: 24, sizeMode:
    'manual' }`; then `{ width: null }` → back to `GRID` (`toEqual`). `(GRID, 'b', { pin: null })` → col
    `b` `pin: null`. `(GRID, 'b', { pin: undefined })` → col `b` has no `pin` key. `(GRID, 'c', { face:
    { type: 'drawer' } })` → leaf `c` face `{ type: 'drawer' }`, col unchanged. `(GRID, 'zz', { width:
    1 })` is `GRID` (`toBe`).
12. `replaceRootItems(BLIND_GRID, [...ITEMS, { id: 'd', kind: 'cabinet', width: null }])` → `id` and
    `rows` equal `BLIND_GRID`'s, item ids `['a', 'b', 'f', 'c', 'd']`, leaf `d` has `{ right: 24 }`,
    leaf `c` no `blind`. With `rows` of length 2 it throws `'replaceRootItems needs a one-row grid'`.
13. `cloneGrid(BLIND_GRID)` `toEqual` `BLIND_GRID`, and `not.toBe` for the grid, `cols`, `cols[1]`,
    `cols[1].pin`, `cells`, `cells[0]`, `cells[0].node`, `cells[0].node.blind`. `cells[3].node.face`
    **is** `toBe` the original (shared, as today).
14. `mirrorGrid(BLIND_GRID)` → col ids `['c:col', 'f:col', 'b:col', 'a:col']`; the cells holding
    `c, f, b, a` have `col` `0, 1, 2, 3`; leaf `a` blind `{ right: 36 }`, leaf `c` `{ left: 24 }`;
    `runBlind` `{ left: 24, right: 36 }`; `rootItems` ids `['c', 'f', 'b', 'a']`.
    `mirrorGrid(mirrorGrid(BLIND_GRID))` `toEqual` `BLIND_GRID`.
15. `isGridShape(x, (leaf) => LEAF_KINDS.includes(leaf.kind))` is true for `GRID`, `BLIND_GRID` and the
    empty grid, and false for each of:
    - `GRID` with `cells` minus its last cell (slot uncovered)
    - `GRID` with a fifth cell `{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'x', kind:
      'cabinet' } }` (slot covered twice)
    - `GRID` with `cols[0]` `{ id: 'a:col', size: 30, sizeMode: 'auto' }`
    - `GRID` with `cols[1]` `{ ...GRID.cols[1], sizeMode: 'auto' }` (auto with a size)
    - `GRID` with `cols[0].gap = -1` (and **true** with `gap: 0.5`)
    - `GRID` with `rows: []`
    - `GRID` with `cells[0].colSpan = 2` (slot 1 covered twice)
    - `GRID` with leaf `f`'s `kind` `'shelf'` (the `isLeaf` callback says no)
    - `GRID` whose `cells[0].node` is the nested grid `{ id: 'n', cols: [{ id: 'n0', size: null,
      sizeMode: 'bogus' }], rows: [{ id: 'nr', size: null, sizeMode: 'auto' }], cells: [{ col: 0, row: 0,
      colSpan: 1, rowSpan: 1, node: { id: 'a', kind: 'cabinet' } }] }` — and **true** with
      `sizeMode: 'auto'` there.

---

## §4 Readers (steps 157, 158)

Mechanical: `run.items` → `runItems(run)`, `run.blind` → `runBlind(run)`. Until 160 every stored run
has `items` and `blind` (or not) exactly as now, and `runItems`/`runBlind` return them unchanged, so
**no behavior changes and no test changes**. Line numbers are against `9d2d166`.

### Step 157 — model (17 sites, 5 files)

Where a function uses the list more than once, hoist `const items = runItems(run);` and use `items`.

| File | Line(s) | Today | Becomes |
|---|---|---|---|
| `model/splitRun.js` | 23 `layoutInputs` | — | add `const items = runItems(run);` as the first body line |
| | 25, 28 | `run.items.reduce` / `run.items.filter` | `items.reduce` / `items.filter` |
| | 88 `splitRunLegacy` | — | add `const items = runItems(run);` as the first body line |
| | 120, 135 | `run.items.find` / `run.items.map` | `items.find` / `items.map` |
| | 373 `splitRun` | — | add `const items = runItems(run);` as the first body line |
| | 375, 386, 402, 403, 408, 475 | `run.items.…` | `items.…` |
| `model/room.js` | 379 | `run.items.flatMap` | `runItems(run).flatMap` |
| | 446 `resolvePinnedSpan` | — | add `const items = runItems(run);` as the first body line |
| | 447, 470, 472 | `run.items` / `run.items.slice` | `items` / `items.slice` |
| | 661 | `...run.items.flatMap` | `...runItems(run).flatMap` |
| `model/dimensions.js` | 247, 312 | `run.items.find` | `runItems(run).find` |
| `model/faceLayouts.js` | 31 | `run.items.find` | `runItems(run).find` |
| `model/blind.js` | 94 | `run.blind?.[side]` | `runBlind(run)?.[side]` |

Each file gets `import { runItems } from './grid.js';` (`runBlind` for `blind.js`) beside its other
`./` imports. No name clashes: none of the three `splitRun` functions or `resolvePinnedSpan` has a
local called `items` today (checked).

**Stay as they are** (writers; step 160): `splitRun.js:521` (`syncAutoItems`), `room.js:69, 79`
(`cloneRun`), `room.js:1491, 1502` (mirror), and the `items: leftItems` / `items: rightItems` keys at
`splitRun.js:451, 489` — those build the transient sub-runs §1 depends on.

### Step 158 — UI (13 sites, 7 files)

| File | Line(s) | Today | Becomes |
|---|---|---|---|
| `properties/helpers.js` | 74 | `run.items.find` | `runItems(run).find` |
| | 93 | `return run.items[run.items.length - 1] ?? null;` | `const items = runItems(run);` + `return items[items.length - 1] ?? null;` |
| | 103–104 | loop over `run.items` | `const items = runItems(run);` before the loop, loop over `items` |
| `components/ElevationCanvas.jsx` | 601 | `selectedRun.items.find(` | `runItems(selectedRun).find(` |
| `components/RunGroup.jsx` | 392 | `run.items.find` | `runItems(run).find` |
| `components/properties/RunPiecesSection.jsx` | 19 | `run.items.find` | `runItems(run).find` |
| `components/properties/RunCabinetsSection.jsx` | 19 | `run.items.filter` | `runItems(run).filter` |
| `components/properties/CabinetProperties.jsx` | 23, 25, 26, 30 | `run.items.…` | add `const items = runItems(run);` above line 23; `items.…` |
| `components/properties/EndFields.jsx` | 59 | `run.blind?.[side]` | `runBlind(run)?.[side]` |

Imports follow each file's habit: `helpers.js`, `ElevationCanvas.jsx`, `RunGroup.jsx` import
`'../model/grid.js'` directly; the four `properties/` files use `'../../model/index.js'` (add to the
existing import where there is one; `RunCabinetsSection.jsx` has none from the model, so add one line).

**Stay as they are:** all 18 sites in `store/elevationSlice.js`. None is a pure read: 234
(`roomCabinets`) and 864 hand back items that are then mutated, 255 (`itemIndexFor`) indexes writes,
and the rest write. They flip in 160. Also `persistence.js` (159) and `runDefaults.js:143` (160).

---

## §5 Steps 159 and 160 (prompts later)

- **159 — disk v4.** `ELEVATION_SCHEMA_VERSION` 3 → 4. A saved run holds `grid` and no `items` /
  `blind`; `isV4Run` validates with `isGridShape` and an `isLeaf` built from today's `isItem` rules
  (face, style, reveals on cabinet leaves) plus pins/absorb on root columns. v3 → v4 is
  `gridFromItems(run.id, run.items, run.blind)`; v1/v2 already chain into v3. Until 160, load
  converts grid → items/blind for the store and save converts back — the adapter lives only in
  `persistence.js`. Test: a v3 document with a pinned, a locked, a filler and a blind-left run
  round-trips through save/load unchanged in the store.
- **160 — the store flips.** `createRun` builds `grid: gridFromItems(id, [])`; `syncAutoItems` ends in
  `replaceRootItems`; `cloneRun`/mirror use `cloneGrid`/`mirrorGrid`; the slice's item and blind
  reducers use `updateRootItem`, `insertRootColumn`, `removeRootColumn`, `setGridBlind`, and
  `roomCabinets`/pin-clearing iterate leaves and root columns; the 159 adapter goes. Store tests that
  read `run.items` read `runItems(run)`. Model-test fixtures keep `items` (§1). Likely two sessions:
  measure with the PROMPT-CONVENTIONS commands after 159.

**Done when (round):** no stored run has `items` or `blind`, a v3 save loads as v4, `npm test` and
`npm run lint` are clean, and every run in the sample layouts draws exactly as at `9d2d166`.
