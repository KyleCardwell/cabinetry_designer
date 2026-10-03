# Elevation Lab — SPEC-32 (cells round 32: the grid shape)

Steps 156–160. The earlier SPEC files still apply; this file is the source of truth for what follows.
The design is `docs/elevation-mvp/CELLS-PLAN.md`, round 32. SPEC-31 is done (`57adeb7`); the repo is at
`9d2d166` (shop rules docs only since).

Round 32 changes what a run *stores*, and nothing a user can see. `run.items` and `run.blind` are
replaced by `run.grid`. Every existing layout resolves exactly as before.

`run.items` has 54 source references and ~100 test fixtures, so per PROMPT-CONVENTIONS rules 4 and 8
the round is six small steps, each green on its own:

| Step | What | Files |
|---|---|---|
| **156** | `model/grid.js`: the shape, its constructors, the item view, blind, pure edit helpers, a validator. New file + its test file. Nothing calls it yet. | 2 new, `model/index.js` |
| **157** | Model readers switch from `run.items` / `run.blind` to `runItems(run)` / `runBlind(run)`. 17 sites. | `splitRun`, `room`, `dimensions`, `faceLayouts`, `blind` |
| **158** | UI readers switch the same way. 13 sites. | `helpers`, `ElevationCanvas`, `RunGroup`, 4 files in `properties/` |
| **159** | Saves become v4: runs hold `grid`. All old-save migration (v1–v3) is deleted — nothing saved is worth keeping. The store still holds items; two small adapters convert at load and save. | `persistence.js` + its test, 2 lines in the slice |
| **160** | Prep for the flip, no behavior change: `syncAutoItems`, `cloneRun` and the mirror accept grid runs; store tests read through `runItems`. | `splitRun`, `room`, 1 new test file, `elevationSlice.test` |
| **161** | The store flips to `grid`. Slice writers use the grid helpers; `createRun` builds a grid; the 159 adapters go. Last step of round 32. | slice, `runDefaults`, `persistence` + both store test files |

All six prompts are in `PROMPTS-32.md`. Round 33 starts after 161.

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

## §5 Step 159 — saves become v4 grids; old-save migration goes

Line numbers are against `9a40318` (step 158); `persistence.js` and its test haven't changed since
`9d2d166`.

There are no saved rooms worth keeping: local storage has been cleared and the database isn't in use
yet. So this step **removes every old-save migration** (v1, v2, v3 → current) and their tests, and
makes the one saved format v4: each run stores `grid`, never `items` or `blind`. Loading reads a v4
save or starts fresh.

The **store keeps items until 160**, so two small adapters convert at the boundary: load-side in
`createInitialElevationState`, save-side in `toElevationDocument`. Both go in 160.

### Keys and versions

- `ELEVATION_SCHEMA_VERSION` 3 → **4**; `ELEVATION_STORAGE_KEY` → **`'cd.elevationLab.v4'`**.
- Delete `V2_ELEVATION_STORAGE_KEY` and `LEGACY_ELEVATION_STORAGE_KEY`. Nothing reads
  `cd.elevationLab.v1/v2/v3` any more. (`feature/elevation-mvp` still reads v3, so switching back
  starts that branch from whatever it last saved there.)

### Delete from `persistence.js`

| Lines (at `9a40318`) | What | Why it can go |
|---|---|---|
| 1 | `uuid` import | only `migrateV1Document` used it |
| 14 | `wallFrame` import | only `migrateV1Document` used it |
| 23–26 | v2 and v1 storage keys | nothing reads them |
| 47–49 | `V2_PROFILE_KEYS` | only the v2 validator used it |
| 57–75 | `V1_NUMERIC_SETTING_KEYS` | only the v1 validator used it |
| 150–161 | `isV1Run` | folded into the new `isRun` below |
| 199–209 | `isBlind` | runs no longer carry `blind` |
| 464–471 | the `ends:` entry in the normalizer's run map (filler end + `run.blind` → blind end); the run keeps `...run` and `anchors:` | it upgrades v3 data |
| 516–532 | `isV2ElevationDocument` | nothing reads v2 saves |
| 534–554 | `isV1ElevationDocument` | nothing reads v1 saves |
| 556–566 | `migrateProfile` | only the v2 migration used it |
| 568–586 | `migrateV2Document` | |
| 588–654 | `migrateV1Document` | |

**Keep, unchanged**: `V2_NUMERIC_SETTING_KEYS` and `V2_DEFAULTED_SETTING_KEYS` (live settings
checks and defaults, despite the names), the `profileKeys` parameters on `isCompleteProfile`,
`isWall`, `isRoom`, `isSettings` (they now only ever get the default), and every other normalization
in the normalizer — joints `[]`, opening `offsetAnchor`, part-number defaults, stale joint anchors →
`false`, wall name/number/elevationForced/openings, `wallOrder`, settings defaults. Those fill fields
added after a save was written, which will happen again within v4. Don't rename or tidy any of it.

### The run validator (`235–247`)

```js
function isRun(run) {
  return Boolean(run)
    && typeof run.id === 'string'
    // …today's isV1Run lines 152–159 (type, x/width/z/height/depth, ends, autoCount, maxCabinetWidth)…
    // …today's isRun lines 237–244 and 246 (heightMode … top, endFiller) — NOT the isBlind line…
    && run.items === undefined
    && run.blind === undefined
    && isRunGrid(run.grid);
}
```

New, next to it:

```js
function isLeafBlind(blind) {
  return blind === undefined || (
    Boolean(blind) && typeof blind === 'object' && !Array.isArray(blind)
    && Object.keys(blind).length > 0
    && Object.entries(blind).every(([side, width]) => (
      (side === 'left' || side === 'right') && isFiniteNumber(width) && width > 0
    )));
}

function isLeaf(leaf) {
  return Boolean(leaf) && typeof leaf.id === 'string'
    && ITEM_KINDS.has(leaf.kind) && isLeafBlind(leaf.blind);
}

/** Round 32 grids: one row, no spans, no nesting. Rounds 33+ relax this. */
function isRunGrid(grid) {
  return isGridShape(grid, isLeaf)
    && grid.rows.length === 1
    && grid.cells.every((cell) => (
      cell.colSpan === 1 && cell.rowSpan === 1 && !('cols' in cell.node)
    ))
    && rootItems(grid).every(isItem);
}
```

`rootItems(grid).every(isItem)` reuses every existing item rule (width; pin and absorb only on
cabinets; face, style and reveals only on cabinets) without restating them. It runs only after the
shape checks pass, so `rootItems` never meets a column without a row-0 cell. `isItem`, `isItemPin`,
`ITEM_KINDS` and the pin sets stay.

### The normalizer (`420–479`)

Rename `normalizeV3Document` → **`normalizeElevationDocument`** (no alias). Same body minus the
`ends:` entry; it still calls `normalizeDocument(document, ELEVATION_SCHEMA_VERSION)`, so it only
touches v4 documents.

### Loading (`666–681`)

```js
export function loadElevationDocument() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const current = normalizeElevationDocument(readStored(ELEVATION_STORAGE_KEY));
    return isElevationDocument(current) ? current : null;
  } catch {
    return null;
  }
}
```

`isElevationDocument` keeps its body (it calls `isRoom(room)` → `isWall` → `isRun`, now the grid one).

### The two adapters (removed in 160)

In `persistence.js`, beside `toElevationDocument`:

```js
/** Until step 160 the store holds items; saved documents hold grids. */
function runToStore(run) {
  const { grid, ...rest } = run;
  const blind = runBlind({ grid });
  return { ...rest, items: rootItems(grid), ...(blind ? { blind } : {}) };
}

export function storeRoomsFromDocument(rooms) // rooms → walls → runs.map(runToStore); new objects, input untouched
```

`toElevationDocument` (683–703): the runs map becomes

```js
const { _pinWidths, items, blind, ...persistedRun } = run;
void _pinWidths;
return { ...persistedRun, grid: gridFromItems(run.id, items, blind) };
```

`store/elevationSlice.js`: add `storeRoomsFromDocument` to the `./persistence.js` import (59–62);
line 116 `const rooms = document?.rooms ?? [fallbackRoom];` becomes
`const rooms = document?.rooms ? storeRoomsFromDocument(document.rooms) : [fallbackRoom];`. Nothing
else in the slice.

Round trip: a store run with `blind: { left: null, right: null }` saves with no leaf blind and loads
with no `blind` key. Every reader uses `run.blind?.[side]` / `runBlind`, so it's the same run.

`persistence.js` adds `import { gridFromItems, isGridShape, rootItems, runBlind } from '../model/grid.js';`
(grid.js imports nothing, so no cycle). It ends up roughly 250 lines shorter.

### Tests — `store/__tests__/persistence.test.js`

**Imports.** From `../persistence.js`: keep `ELEVATION_STORAGE_KEY`, `isElevationDocument`,
`loadElevationDocument`; rename `normalizeV3Document` → `normalizeElevationDocument`; add
`toElevationDocument`; drop `LEGACY_ELEVATION_STORAGE_KEY`, `V2_ELEVATION_STORAGE_KEY`,
`isV2ElevationDocument`, `migrateV1Document`, `migrateV2Document`. Drop the `wallFrame` import (only
test 18 used it). Add `import { gridFromItems, rootItems, runBlind } from '../../model/grid.js';` and
`import { createInitialElevationState } from '../elevationSlice.js';`.

**Fixtures.** Delete `v1Run`, `v1Document`, `v2Profile`, `v2Document`. Add, after `storageWith`,
one literal builder that returns what `migrateV1Document(v1Document())` used to (minus the v1 setting
values no test reads):

```js
function currentRun(id, x, z, height) {
  return {
    id,
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x,
    width: 48,
    z,
    height,
    depth: 24,
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems(id, [{ id: `${id}-cab`, kind: 'cabinet', width: 45 }]),
  };
}

function currentWall(id, y, length, height, runs) {
  return {
    id,
    name: '',
    numberOverride: null,
    elevationForced: false,
    x1: 0,
    y1: y,
    x2: length,
    y2: y,
    height,
    thickness: 4.5,
    flipped: false,
    connections: { start: null, end: null },
    profile: {},
    openings: [],
    runs,
  };
}

function currentDocument() {
  const settings = structuredClone(DEFAULT_SETTINGS);
  return {
    schemaVersion: 4,
    settings,
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...settings.defaultProfile },
      partNumberStart: 1,
      partNumberOverrides: {},
      wallOrder: ['wall-a', 'wall-b'],
      walls: [
        currentWall('wall-a', 0, 144, 96, [currentRun('a', 12, 4, 30.5)]),
        currentWall('wall-b', 60, 96, 90, [currentRun('b', 7, 10, 20)]),
      ],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-b',
    view: 'elevation',
  };
}
```

Then every `migrateV1Document(v1Document())` in the file becomes `currentDocument()` — in
`tbtDocument` and in each test that uses it. `tbtDocument`'s `run` helper (line 125) swaps its
`items` line for:

```js
    grid: gridFromItems(id, [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }]),
```

**Delete four tests**, all about upgrading old saves: `18.` (v1 migration), `3.` and `4.` (v2 crown
migration), `222.` (filler + blind width → blind end).

**Edit these**; every other test stays as it is (after the `currentDocument()` swap):

| Test | Change |
|---|---|
| `validates optional cabinet pins…` (335) | `const column = current.rooms[0].walls[0].runs[0].grid.cols[0];` replaces `item`; set `column.pin` / `column.absorb`; the `toMatchObject` reads `rootItems(loaded.rooms[0].walls[0].runs[0].grid)[0]`; `resolvePinTarget(loaded.rooms[0].walls[0].runs[0].grid.cols[0].pin, …)`; the last check sets `column.pin.anchor = 'top'` |
| `21.` (367) | `const item = current.rooms[0].walls[0].runs[0].grid.cells[0].node;`; the loaded check reads `loaded.rooms[0].walls[0].runs[0].grid.cells[0].node` |
| `43.` (413) | `const item = run.grid.cells[0].node;`; `loadedRun.items[0]` → `loadedRun.grid.cells[0].node` |
| `44.` (439) | `const item = run.grid.cells[0].node;` — nothing else |
| `194.`, `195.`, `215.`, `221.` | `normalizeV3Document` → `normalizeElevationDocument` |
| `206.` (717) | `present.rooms[0].walls[0].runs[0].grid.cells[0].node.blind = { left: 42 };` and the invalid loop sets `invalid.rooms[0].walls[0].runs[0].grid.cells[0].node.blind = blind;` with the same three values |

**New** `describe('SPEC-32 grid persistence', …)` at the end, three tests. `PIN` is
`{ anchor: 'center', from: 'left', openingId: null, openingAnchor: 'center', value: 60 }`.

1. **ignores saves under the old keys.** `ELEVATION_STORAGE_KEY` is `'cd.elevationLab.v4'`. With
   storage holding only `['cd.elevationLab.v3', JSON.stringify({ ...currentDocument(), schemaVersion:
   3 })]`, `loadElevationDocument()` is `null`. With `currentDocument()` under `ELEVATION_STORAGE_KEY`,
   it `toEqual`s `currentDocument()`.
2. **rejects v4 runs that keep items or blind, or hold a malformed grid.**
   `isElevationDocument(currentDocument())` is true; then, each on a fresh `currentDocument()` with
   `run = doc.rooms[0].walls[0].runs[0]`, each of these makes it false: `run.items = []`;
   `run.blind = { left: 36, right: null }`; `delete run.grid`;
   `run.grid.cols[0].pin = { ...PIN, anchor: 'top' }`; leaf (`run.grid.cells[0].node`) `blind` set to
   `{ left: 0 }`, then `[]`, then `{ top: 36 }`; leaf `kind = 'shelves'`; leaf
   `face = { type: 'shelf', size: null }`; `run.grid.rows.push({ id: 'r2', size: null, sizeMode: 'auto' })`.
3. **the store adapter reads grids as items and saves them back unchanged.**
   `const document = currentDocument();` set its `runs[0].grid = gridFromItems('a', [{ id: 'p',
   kind: 'cabinet', width: null, pin: PIN }, { id: 'l', kind: 'cabinet', width: 30 }, { id: 'f', kind:
   'filler', width: 3 }], { left: 36, right: null })`; `isElevationDocument(document)` true.
   `const state = createInitialElevationState(document);` — its run has `items` `toEqual`
   `rootItems(document…grid)`, `blind` `toEqual` `{ left: 36, right: null }`, and no `grid` property;
   `document`'s run still has `grid` and no `items`. `toElevationDocument(state).rooms` `toEqual`
   `document.rooms`.

**Count:** 537 before; 4 deleted, 3 added → **536**. No other test file changes.

## §6 Steps 160 and 161 — the store flips to grids

The flip touches ~55 sites across the two largest files in the repo (`elevationSlice.js` 1,438,
`elevationSlice.test.js` 1,912). That's well over the ~15-site budget in PROMPT-CONVENTIONS rule 8,
so it's split into a green, no-behavior-change prep step (160) and the flip itself (161). Nothing
else is left in round 32 after 161.

Line numbers are against `9a40318`. Step 159 adds one line to the slice's persistence import
(lines 59–62), so slice lines after 62 are **+1** by the time 161 runs. The prompts give the code
text to match as well, so an off-by-one never matters.

### Step 160 — prep: writers that accept both shapes, store tests that read through `runItems`

**Model writers become shape-preserving.** Each keeps doing exactly what it does for a run with
`items` (model-test fixtures, splitRun's transient sub-runs), and does the grid equivalent for a run
with `grid`. The store still holds items after 160, so the grid branch is exercised only by the new
tests until 161.

- `model/splitRun.js`, `syncAutoItems` (504–540). Line 525 `const items = [...run.items];` →
  `const items = [...runItems(run)];`. Line 540 `return { ...run, items };` →
  `return run.items ? { ...run, items } : { ...run, grid: replaceRootItems(run.grid, items) };`. Add
  `replaceRootItems` to the existing `./grid.js` import (line 3). `replaceRootItems` keeps the grid's
  id and row and re-homes blind (SPEC §2).
- `model/room.js`, `cloneRun` (54–82). Line 80 `items: run.items.map((item) => ({ ...item })),`
  becomes:

  ```js
      ...(run.items ? { items: run.items.map((item) => ({ ...item })) } : {}),
      ...(run.grid ? { grid: cloneGrid(run.grid) } : {}),
  ```

- `model/room.js`, `flipRunsForWall` (1470–1511). Line 1504
  `items: [...run.items].reverse().map((item) => ({ ...item })),` becomes:

  ```js
        ...(run.items ? { items: [...run.items].reverse().map((item) => ({ ...item })) } : {}),
        ...(run.grid ? { grid: mirrorGrid(run.grid) } : {}),
  ```

  Add `cloneGrid, mirrorGrid` to `room.js`'s `./grid.js` import (line 12).
- **Leave** the `run.blind` copy lines (`room.js:70` and `1493–1495`). They only fire for runs that
  still carry `blind` (fixtures); a grid run has none.

**New test file** `src/elevation/model/__tests__/gridRuns.test.js`, 4 tests, `DEFAULT_SETTINGS`
(`maxCabinetWidth` 36):

```js
const auto = (id) => ({ id, kind: 'cabinet', width: null });
const NONE = { type: 'none', width: null };
function gridRun(width, items, blind) {
  return {
    id: 'r', x: 10, width, ends: { left: NONE, right: NONE },
    anchors: { left: false, right: false },
    autoCount: true, maxCabinetWidth: null,
    grid: gridFromItems('r', items, blind),
  };
}
```

1. **syncAutoItems grows a grid run's columns and keeps its blind.**
   `syncAutoItems(gridRun(96, [auto('a')], { left: 36, right: null }), DEFAULT_SETTINGS)` → no `items`
   property; `runItems(result)` has length 3 (96 / 36 → 3), first id `'a'`, all `width: null`;
   `runBlind(result)` `{ left: 36, right: null }`; `result.grid.id` `'r:grid'`;
   `result.grid.rows[0].id` `'r:row'`.
2. **syncAutoItems shrinks a grid run and re-homes its right blind.**
   `gridRun(30, [auto('a'), auto('b'), auto('c')], { left: null, right: 24 })` → `runItems` ids
   `['a']`; `runBlind` `{ left: null, right: 24 }`.
3. **syncAutoItems keeps an items run as items.** `{ ...gridRun(96, []), grid: undefined, items:
   [auto('a')] }` → `result.items` length 3; `result.grid` undefined.
4. **flipRunsForWall mirrors a grid run.** Wall
   `{ id: 'w', x1: 0, y1: 0, x2: 120, y2: 0, flipped: false, joints: [], openings: [], runs: [gridRun(60,
   [auto('a'), auto('b')], { left: 36, right: null })] }` → the run's `x` is `50` (120 − 10 − 60);
   `runItems` ids `['b', 'a']`; `runBlind` `{ left: null, right: 36 }`; no `items` property.

**Store tests read through `runItems` / `runBlind`** — `store/__tests__/elevationSlice.test.js`.
Add `import { runBlind, runItems } from '../../model/grid.js';`. Then, reads only (every one of
these is an `expect` or a helper's `return`):

| Lines | Today | Becomes |
|---|---|---|
| 535, 543, 552, 560, 743, 744, 758, 769, 770, 782, 798, 814, 830, 831, 1024, 1207 | `currentRun(X).items` | `runItems(currentRun(X))` |
| 1069, 1129, 1200 | `return currentRun(state).items.find(` | `return runItems(currentRun(state)).find(` |
| 1809, 1814, 1819, 1824, 1829, 1886 | `currentRun().blind` | `runBlind(currentRun())` |

And two fixtures get one cabinet, because a blind now lives on a cabinet and an empty run has
nowhere to hold one (SPEC §1). Both still pass today.

- test `207.` (line 1801): `stateWithRun(run())` → `stateWithRun(run({ items: [auto('a')] }))`
- test `223.` (line 1873, the `run({` whose next line is the blind): add `items: [auto('a')],` above `blind: { left: 42, right: 30 },`

**Count:** 536 after 159; 4 added → **540**. No source file besides `splitRun.js` and `room.js`.

### Step 161 — the flip

After 161 the store holds `grid`; no stored run has `items` or `blind`.

**`model/runDefaults.js`** (`createRun`, the `const run = {` object at 134–149): hoist `const id = uuid();` above the run object;
`id: uuid(),` → `id,`; `items: [],` → `grid: gridFromItems(id, []),`. Add
`import { gridFromItems } from './grid.js';`. `syncAutoItems` (grid branch, from 160) fills it.

**`store/elevationSlice.js`** — add
`import { insertRootColumn, removeRootColumn, runItems, setGridBlind, updateRootItem } from '../model/grid.js';`
and, right after `roomCabinets`:

```js
/** A run's root leaves in column order: drafts, so reducers can edit them in place. */
function rootLeaves(run) {
  return run.grid.cells
    .filter((cell) => cell.row === 0)
    .sort((a, b) => a.col - b.col)
    .map((cell) => cell.node);
}
```

Every write goes either to a leaf draft (face, style, reveals) or through a `grid.js` helper assigned
back to `location.run.grid` (width, pin, absorb, structure, blind). Sites (line at `9a40318`, +1
after 159):

| Where | Today | Becomes |
|---|---|---|
| `roomCabinets` 234 | `run.items` | `rootLeaves(run)` (the `item.face = …` in `withStandardDrawers` then edits the leaf) |
| `itemIndexFor` 255 | `run.items.findIndex(` | `runItems(run).findIndex(` |
| `deleteOpening` 864–869 | loop `item of run.items`, `item.pin = null` | loop `column of run.grid.cols`, same test on `column.pin`, `column.pin = null` |
| `setRunEnd` 913 | `if (end.type !== 'blind' && location.run.blind) location.run.blind[side] = null;` | `if (end.type !== 'blind') location.run.grid = setGridBlind(location.run.grid, side, null);` |
| `setRunBlind` 1082–1083 | the two `run.blind` lines | `run.grid = setGridBlind(run.grid, side, width);` (it clears on null, 0, NaN) |
| `setItemWidth` 1119 | `location.run.items[itemIndex].width = X;` | `location.run.grid = updateRootItem(location.run.grid, action.payload.itemId, { width: X });` |
| `setItemPin` 1126–1159 | see below | |
| `setItemAbsorb` 1169–1171 | `const item = location.run.items[itemIndex]`; `item.absorb = X` | `const item = runItems(location.run)[itemIndex]`; `location.run.grid = updateRootItem(location.run.grid, item.id, { absorb: X })` |
| `lockItem` 1179 / `unlockItem` 1189 | `location.run.items[itemIndex].width = X` | `location.run.grid = updateRootItem(location.run.grid, action.payload.itemId, { width: X })` |
| `splitItem` 1196–1202 | kind check + `splice(itemIndex, 1, a, b)` | see below |
| `addItemAfter` 1210, 1215 | `location.run.items.length`; `splice(i, 0, item)` | `runItems(location.run).length`; `location.run.grid = insertRootColumn(location.run.grid, appendToEmptyRun ? 0 : itemIndex + 1, item)` |
| `removeItem` 1224 | `location.run.items.splice(itemIndex, 1)` | `location.run.grid = removeRootColumn(location.run.grid, action.payload.itemId)` |
| `setItemFace` 1241, `setItemStyle` 1280, `setItemReveals` 1292 | `for (const item of location.run.items)` | `for (const item of rootLeaves(location.run))` — loop bodies unchanged |

`setItemPin`: `item` becomes `runItems(location.run)[itemIndex]` (a read-only view) and
`pinCountBefore` reads `runItems(location.run)`. The splitRun block is unchanged. Then:

```js
      location.run.grid = updateRootItem(location.run.grid, item.id, {
        pin: pin ? { ...pin } : null,
      });
      if (pin) location.run.autoCount = false;
      if (addsPinToPinnedRun) {
        const itemsToLock = addsSecondPin
          ? runItems(location.run).filter((candidate) => candidate.pin)
          : [item];
        for (const pinnedItem of itemsToLock) {
          const width = currentWidths.get(pinnedItem.id);
          if (Number.isFinite(width)) {
            location.run.grid = updateRootItem(location.run.grid, pinnedItem.id, {
              width: roundTo(width, state.settings.roundTo),
            });
          }
        }
      }
```

`itemsToLock` must read `runItems` **after** the pin is written, as today's code reads `run.items`
after `item.pin = …`, so the new pin is included.

`splitItem`: insert the two new cabinets **after** the original, then remove it. Removing first would
empty a one-cabinet run and drop its blind.

```js
      if (itemIndex === -1 || runItems(location.run)[itemIndex].kind !== 'cabinet') return;
      let grid = insertRootColumn(location.run.grid, itemIndex + 1, { id: uuid(), kind: 'cabinet', width: null });
      grid = insertRootColumn(grid, itemIndex + 2, { id: uuid(), kind: 'cabinet', width: null });
      location.run.grid = removeRootColumn(grid, action.payload.itemId);
```

The two 159 adapters go:

- `elevationSlice.js` `createInitialElevationState`:
  `document?.rooms ? storeRoomsFromDocument(document.rooms) : [fallbackRoom]` →
  `document?.rooms ?? [fallbackRoom]`, and `storeRoomsFromDocument` leaves the import.
- `persistence.js`: delete `runToStore` and `storeRoomsFromDocument`; `toElevationDocument`'s runs map
  goes back to `const { _pinWidths, ...persistedRun } = run; void _pinWidths; return persistedRun;`.
  `gridFromItems` and `runBlind` drop out of its `grid.js` import (lint will say so; `isGridShape` and
  `rootItems` stay for `isRunGrid`).

**Stay as they are:** `splitRun.js` and `room.js` (160 already made them shape-preserving), and all
model tests (their fixtures keep `items`, §1).

**Tests.**

- `elevationSlice.test.js`, `run()` (lines 79–100): the last line of the object stays `...overrides`,
  and the function returns a grid run:

  ```js
  function run(overrides = {}) {
    const { items, blind, ...rest } = {
      /* today's object literal, unchanged, including items: [] */
    };
    return { ...rest, grid: gridFromItems(rest.id, items, blind) };
  }
  ```

  Add `gridFromItems` to the `grid.js` import from 160. Every store test builds runs through `run()`,
  so nothing else in the existing tests changes.
- `elevationSlice.test.js`, new `describe('SPEC-32 store holds grids')`, 3 tests:
  1. `stateWithRun(run({ autoCount: false, items: [fixed('a', 30)], blind: { left: 36, right: 24 } }))`,
     `splitItem` on `a` → the stored run has no `items` and no `blind` property; `runItems` has 2
     cabinets, neither `'a'`; `runBlind` `{ left: 36, right: 24 }`.
  2. Same start without blind: `lockItem` `a` width 20 → the column `'a:col'` is
     `{ id: 'a:col', size: 20, sizeMode: 'manual' }`; `unlockItem` → `size: null, sizeMode: 'auto'`.
  3. `setItemFace({ …actionBase, itemIds: ['a'], face: { type: 'door', size: null } })` →
     `currentRun(state).grid.cells[0].node.face` `toEqual` `{ type: 'door', size: null }`.
- `persistence.test.js`, SPEC-32 test 3 becomes **the store keeps grids and saves them unchanged**: same
  `document`; the state's run `grid` `toEqual` the document's, and it has no `items` or `blind`;
  `toElevationDocument(state).rooms` `toEqual` `document.rooms`.

**Count:** 540 after 160; 3 added → **543**.

**Done when (round):** no stored run has `items` or `blind`, saves are v4 only, `npm test` and
`npm run lint` are clean, and every run in the sample layouts draws exactly as at `9d2d166`.
