# Elevation Lab — Codex Prompts, Steps 162–169 (cells round 33: vertical split)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Every step in this round** (round 33 is done after 169; round 34 is kinds and depth):

| Step | What | Tests after |
|---|---|---|
| 162 | Cell tree helpers (`cellTree.js`) + split columns and edge blinds in `grid.js` | 556 |
| 163 | Cell rectangles, chains data, stacked neighbours (`cells.js`); auto count keeps split columns | 563 |
| 164 | Stacked-seam reveals (REV-009/010); face layouts per cell | 566 |
| 165 | Part numbers and badges per cell; cell warnings in diagnostics | 568 |
| 166 | Saves accept split columns | 571 |
| 167 | Store reducers for cells | 577 |
| 168 | Draw and select cells; the cell panel | 578 |
| 169 | Cell chains on the canvas; type sizes on chains; Delete removes a cell | 578 |

**Branch:** `elevation-grid-run-split`, as for round 32. Nothing merges back until round 38.

**Baseline is 543 passing** at `a6aea33` (step 161). Confirm with `npm test` first; if it differs, shift every count below by the difference.

**Codex can't open the app.** 162–167 change nothing on screen. 168 and 169 have a hand check after them.

**Why this order:** the model comes first in four green steps (tree edits, rectangles, reveals, part numbers), then saves (166) *before* the store can create a split (167) or the UI can show one (168), so a saved room with a split always reloads. 169 is last because it's the only step that touches `ElevationCanvas.jsx` (1,773 lines); it reads only the listed ranges.

**Line numbers** are against `a6aea33` unless a prompt says otherwise. No file is edited in two steps except `model/index.js` (162, 163 — each appends one block), `persistence.js` (164 adds 2 lines to a list near the top, 166 edits `isRunGrid` further down), and `RunGroup.jsx` (168, 169 — 169 matches by text).

---
## Step 162 — Cell tree helpers

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-33.md §1 and §2. Background only if a SPEC line is unclear: docs/elevation-mvp/CELLS-PLAN.md.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. NOTHING calls the new code yet; the app must behave exactly as before.

Files (only these):
- src/elevation/model/grid.js (241) — four small changes, SPEC §2 "grid.js"
- NEW src/elevation/model/cellTree.js — the 8 exports in SPEC §2
- NEW src/elevation/model/__tests__/cellTree.test.js — the 13 tests in SPEC §2, fixtures copied literally
- src/elevation/model/index.js (263) — extend the grid.js export block (lines 248–263) with edgeLeaves, gridLeaves, isNestedGrid; append one `export { … } from './cellTree.js';` block, alphabetical

grid.js (line numbers at a6aea33):
1. Export isNestedGrid (line 43), body unchanged.
2. itemParts (4–14): also skip the `grid` key when building the leaf; node = item.grid ?? leaf; the column id stays `${item.id}:col`. Return { col, node } and have cellsFromParts (20–22) use node.
3. rootItems (93–102): if the column's node is a nested grid, the item is { id: node.id, kind: 'cabinet', grid: node, width: col.size } plus pin/absorb as today.
4. New exports gridLeaves(node) and edgeLeaves(node, side) — SPEC §2. Sort a COPY of cells (reducers pass immer drafts). gridLeaves returns the leaf objects themselves, not copies.
5. runBlind (108–115) reads from edgeLeaves of the outer column nodes; setGridBlind (117–138) writes to every edge leaf of the outer column, rebuilding nested grids immutably, same-reference when nothing changes. For unsplit columns both behave exactly as now — every existing grid.test.js and gridRuns.test.js test must pass UNCHANGED.

cellTree.js — imports only from './grid.js'. Rules (all in SPEC §1/§2, restated so you don't hunt):
- Never mutate. Same reference back when nothing changes: unknown id, a grid id where a leaf is needed, a filler, bad direction/count/size, a root leaf for equalize/unsplit.
- Root stays one row. Split 'across' at the root = new root columns via replaceRootItems (original item gets width: null, keeps pin/absorb). Split 'down' at the root, or any split in a different direction from a nested parent = NEST: the cell's node becomes a new grid. Same direction as a nested parent = FLAT: new sibling cells/tracks right after it, and the original's track becomes auto.
- The original leaf stays first with its id and all keys. New leaves are { id, kind: 'cabinet' } plus a copy of the original's style if it has one.
- makeId call order: root across → n−1 leaf ids. Flat → n−1 track ids, then n−1 leaf ids. Nest → grid id, the one cross-axis track, n split-axis tracks, n−1 leaf ids. All new tracks { id, size: null, sizeMode: 'auto' }.
- Rows run top to bottom (row 0 is the top cell). axis = parent.rows.length > 1 ? 'row' : 'col'; root axis is 'col'.
- When a root cell's node changes identity (nest, or a collapse back to one node), that root column's id becomes `${node.id}:col`, keeping size/sizeMode/pin/absorb.
- removeGridCell: root leaf → removeRootColumn. Nested: drop cell + track, re-index. One cell left → it replaces the parent in the grandparent; if it's a grid with the same axis as a NESTED grandparent, splice its tracks and cells in instead (drop the grandparent's track for that cell). Never flatten into the root.
- Split, remove and unsplit re-home blind: read runBlind({ grid }) first, strip blind from every leaf, re-apply both sides with setGridBlind.
- count: min(8, max(2, round(count))); non-finite → same reference.

Keep both files plain: cellTree.js roughly 200–260 lines, one-line comments per export. Repo style: 2-space indent, single quotes, semicolons, trailing commas.

DO NOT open or grep any other file. SPEC-33 §2 says everything these must satisfy. Don't touch any existing test file.

While iterating, run only `npx vitest run src/elevation/model/__tests__/cellTree.test.js src/elevation/model/__tests__/grid.test.js src/elevation/model/__tests__/gridRuns.test.js`. At the end `npm test && npm run lint` once: 543 + 13 = 556. Don't run `npm run build`.

At most five lines of summary: what you built, anything in §2 you had to interpret, anything left undone. Commit "elevation-mvp: step 162 cell tree helpers".
```

**After 162:** `git show --stat HEAD` — two new files (cellTree.js ~200–260, test ~250–320), grid.js +40 or so, index.js a few lines. Nothing else.

---
## Step 163 — Cell rectangles

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-33.md §3. Step 162 is in (model/cellTree.js exists; grid.js exports isNestedGrid).
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. Nothing calls cells.js yet.

Files (only these):
- NEW src/elevation/model/cells.js — MIN_CELL_SIZE, resolveTracks, cellPieces, stackedSides, blindCellWidths (SPEC §3)
- NEW src/elevation/model/__tests__/cells.test.js — the 7 tests in SPEC §3, fixtures copied literally
- src/elevation/model/splitRun.js (541) — ONE line: 533 `if (items[index].kind === 'cabinet' && items[index].width === null) {` gains `&& !items[index].grid`
- src/elevation/model/index.js — append one `export { … } from './cells.js';` block, alphabetical

cells.js rules (SPEC §3):
- Imports only isNestedGrid from './grid.js'.
- resolveTracks: fixed tracks take their size; auto tracks share the rest equally; if every track is fixed, the LAST is treated as auto. No rounding, no clamping.
- cellPieces walks layout.pieces in order. A role 'item' piece whose root cell node (row 0, node.id === piece.id) is a nested grid is replaced by its leaves; everything else passes through as the SAME object, and when nothing was replaced `pieces` IS layout.pieces. A run without `grid` passes everything through.
- Row 0 is the top: row i's top = z + height − Σ rowSizes[<i]. Column j's left = x + Σ colSizes[<j].
- Leaf piece shape is literal in SPEC §3 (columnId = the column piece's id; auto = its own track on its parent's axis has size null). A column's leaves are sorted by x, then z (1e-6).
- grids: every nested grid, pre-order, { id, columnId, axis, depth, x, z, width, height, tracks: [{ id, start, end, manual }] } — row tracks use z (bottom, top), col tracks use x.
- warnings: { code: 'cell-too-small', pieceId, message: 'Cell is smaller than 1 inch.' } for a leaf under MIN_CELL_SIZE in width or height.
- stackedSides and blindCellWidths: SPEC §3, 1e-6 tolerances.

Test 7 imports syncAutoItems from '../splitRun.js', runItems and gridFromItems from '../grid.js', DEFAULT_SETTINGS from '../constants.js'.

DO NOT open or grep other files. You don't need blind.js, faceLayouts.js or the store — SPEC §3 fixes every input shape. Don't touch any existing test file.

While iterating, run only `npx vitest run src/elevation/model/__tests__/cells.test.js`. At the end `npm test && npm run lint` once: 556 + 7 = 563. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 163 resolve cells into pieces".
```

**After 163:** two new files (~130 and ~150 lines), 1 line in splitRun.js, a few in index.js.

---
## Step 164 — Stacked-seam reveals and face layouts per cell

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-33.md §4. Steps 162–163 are in (cellTree.js, cells.js).
If `git status` shows uncommitted changes, stop and tell me.

REV-009/010: where one box sits on another, the seam reveals come from a rule with source 'rule:stacked-seam'. And runFaceLayouts works per cell instead of per column. Nothing is split in the store yet, so the app must look exactly as before.

Files (only these; line numbers at a6aea33):
- src/elevation/model/constants.js (106) — after `capturedSingleReveal: 0.09375,` (82) add `stackedUpperBottom: 0,` and `stackedLowerTop: 0.125,`
- src/elevation/store/persistence.js (560) — ONLY the V2_DEFAULTED_SETTING_KEYS list: after `'capturedSingleReveal',` (80) add `'stackedUpperBottom',` and `'stackedLowerTop',`. Nothing else in this file.
- src/elevation/model/styles.js (178) — REVEAL_SOURCE_LABELS (21–28) gains 'rule:stacked-seam': 'rule: stacked seam'; new export stackedSeamReveals verbatim from SPEC §4; cabinetReveals (106–139) gets the `stacked = { top: false, bottom: false }` parameter and the block from SPEC §4, placed after the upper-bottom rule (ends 129) and before the captured-single rule (130).
- src/elevation/model/faceLayouts.js (50) — runFaceLayouts' loop (30–48) per SPEC §4: iterate cellPieces(run, layout).pieces; item from findLeaf for cells, runItems for columns; capture from the column, kept only on a side the cell touches; stacked: stackedSides(cells.pieces, piece.id). Style, cabinetFaces and result.set stay as they are. Imports: cellPieces, stackedSides from './cells.js'; findLeaf from './cellTree.js'.
- src/elevation/model/__tests__/styles.test.js — 2 tests (53, 54) at the end of describe('styles'), SPEC §4
- src/elevation/model/__tests__/faceLayouts.test.js — test 50 with the STACKED fixture, SPEC §4, literally

The order in cabinetReveals matters: style → wood top → upper bottom → STACKED SEAM → captured single → manual.

LEAVE ALONE: capture.js, faces.js, every caller of runFaceLayouts (RunGroup, FaceProperties) — they keep passing the column layout, which is what runFaceLayouts wants. Don't touch any other test.

DO NOT grep the repo or open other files (cells.js / cellTree.js only to check an export name).

While iterating, run only `npx vitest run src/elevation/model/__tests__/styles.test.js src/elevation/model/__tests__/faceLayouts.test.js`. At the end `npm test && npm run lint` once: 563 + 3 = 566. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 164 stacked seam reveals and per-cell face layouts".
```

**After 164:** six files, roughly +90 lines, most of them tests.

---
## Step 165 — Part numbers per cell

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-33.md §5. Steps 162–164 are in.
If `git status` shows uncommitted changes, stop and tell me.

Every cell gets its own part number and badge, ordered left edge then bottom edge (cellPieces already sorts that way). Room diagnostics carry cell-too-small warnings. Nothing is split in the store yet — no visible change.

Files (only these; line numbers at a6aea33):
- src/elevation/model/partNumbers.js (233)
  - line 2: import blindEntries beside blindPartWidths; add `import { blindCellWidths, cellPieces } from './cells.js';`
  - runParts (53–74): after `const widths = blindPartWidths(…)` (61) build `cells` and `cellWidths` as in SPEC §5; iterate `cells.pieces` instead of `layout.pieces`; width = cellWidths.get(piece.id) ?? widths.get(piece.id) ?? piece.width. The filter and the rest of the part object are unchanged.
  - wallBadgeGroups (206–215): wrap the existing splitRun(...) call: `pieces: cellPieces(run, splitRun(run, settings, { … })).pieces,`
- src/elevation/model/room.js (1519) — ONLY: add `import { cellPieces } from './cells.js';` with the other ./ imports, and `...cellPieces(run, layout).warnings,` right after `...layout.warnings,` (663). Don't read the rest of room.js.
- src/elevation/model/__tests__/partNumbers.test.js — new describe('SPEC-33 cell part numbers') at the end with splitBase / splitRoom and 2 tests, literally from SPEC §5. Import roomDiagnostics from '../room.js' (add to the existing syncRoom import).

cells.js imports only grid.js, so room.js → cells.js is not a cycle.

DO NOT grep the repo or open other files. Don't touch blind.js, splitRun.js, the store or any component.

While iterating, run only `npx vitest run src/elevation/model/__tests__/partNumbers.test.js`. At the end `npm test && npm run lint` once: 566 + 2 = 568. Every existing partNumbers test must pass unchanged (unsplit runs give the same pieces). Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 165 part numbers per cell".
```

**After 165:** three files, about +20 source lines and +60 test lines.

---
## Step 166 — Saves accept split columns

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-33.md §6. Steps 162–165 are in.
If `git status` shows uncommitted changes, stop and tell me.

A run whose root cell holds a nested cell grid must save and load. This lands BEFORE the store can create one (167), so a split room can never fail to reload.

Files (only these):
- src/elevation/store/persistence.js (562 after step 164) — replace isRunGrid (the function with the comment "Round 32 grids: one row, no spans, no nesting", ~222–230) with the three functions in SPEC §6 (isCellLeaf, isCellGrid, isRunGrid), verbatim. Nothing else changes.
- src/elevation/store/__tests__/persistence.test.js — new describe('SPEC-33 split columns') at the end: NESTED, splitDocument and 3 tests from SPEC §6, literally. Store the document in the test the same way the 'ignores saves under the old keys' test in describe('SPEC-32 grid persistence') does (globalThis.window = { localStorage: storageWith([...]) }).

isGridShape already validates nested tracks, coverage and leaf blinds; rootItems gives a split column as a cabinet item with a `grid` key, which isItem accepts. Don't restate either.

DO NOT grep the repo or open other files (model/grid.js only to confirm a name). No other test file.

While iterating, run only `npx vitest run src/elevation/store/__tests__/persistence.test.js`. At the end `npm test && npm run lint` once: 568 + 3 = 571. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 166 saves accept split columns".
```

**After 166:** two files; `persistence.js` about +20 / −8.

---
## Step 167 — Store reducers for cells

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-33.md §7. Steps 162–166 are in.
If `git status` shows uncommitted changes, stop and tell me.

Five new reducers (splitCell, removeCell, equalizeCells, unsplitCell, setTrackSize) and face/style/reveal edits that reach nested cells. No UI yet.

Files (only these; slice line numbers at a6aea33 — it hasn't changed since step 161; match by the text shown):
- src/elevation/store/elevationSlice.js (1461) — ONLY these sites:
  1. grid.js import (6–12): add gridLeaves. New import block from '../model/cellTree.js': equalizeGridCells, findCell, removeGridCell, setGridTrackSize, splitGridCell, unsplitGridCell.
  2. Delete rootLeaves and its comment (246–253).
  3. roomCabinets (241): `rootLeaves(run)` → `gridLeaves(run.grid)`.
  4. setItemFace (1264), setItemStyle (1303), setItemReveals (1315): `for (const item of rootLeaves(location.run))` → `for (const item of gridLeaves(location.run.grid))`. Loop bodies unchanged.
  5. The five reducers from SPEC §7, right after removeItem (ends 1259). splitCell and removeCell are verbatim in the SPEC; equalizeCells, unsplitCell, setTrackSize follow the same shape (location guard, compute, return if same reference, assign, syncRoomAt). setTrackSize reads { trackId, size } and passes size ?? null.
  6. Export the five in the actions list after `removeItem,` (1445).
  After editing, `grep -n "rootLeaves" src/elevation/store/elevationSlice.js` must print nothing.
- src/elevation/store/__tests__/elevationSlice.test.js (1964) — import the five actions (alphabetical in the existing list) and add gridLeaves to the grid.js import (line 5); new describe('SPEC-33 cell reducers') at the end with the helpers and 6 tests from SPEC §7. Leaf ids created by the store are uuids, so the tests read them from state as the SPEC shows.

LEAVE ALONE: splitItem (the UI stops using it in step 168, its tests stay), removeItem, setItemWidth/Pin/Absorb, lockItem/unlockItem, itemIndexFor — they act on root columns, which is right. Every existing store test must pass unchanged.

DO NOT grep the repo beyond the check above, and DO NOT open other files (cellTree.js only for a signature). Don't read the slice or its test whole.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. At the end `npm test && npm run lint` once: 571 + 6 = 577. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 167 cell reducers".
```

**After 167:** two files: slice roughly +80 / −12, test +110.

---
## Step 168 — Draw and select cells; the cell panel

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-33.md §8. Steps 162–167 are in.
If `git status` shows uncommitted changes, stop and tell me.

The first visible step: a split column draws its cells, each cell is selectable, and the properties panel can split, size, equalize, unsplit and remove cells.

Files (only these; none changed since a6aea33):
- src/elevation/components/RunGroup.jsx (489) — SPEC §8: import cells.js; `cells` memo after `result` (54–58); subLabels (67–76) also labels blind cells; drawnPieces (110–118) maps cells.pieces; warningPieceIds (145–150) adds cells.warnings; PieceRect's warning prop (367) also checks piece.columnId. LEAVE the pin markers (391–418) and centerline markers (420) on result.pieces.
- src/elevation/components/PropertiesPanel.jsx (157) — import cellPieces (add to the '../model/index.js' import, 8–12); `cells` memo after layout (58–65); resolveSelectedPiece(run, cells, …) (73–78); PieceProperties gets cells={cells} (136–143). RunProperties unchanged.
- src/elevation/properties/helpers.js (110) — resolveSelectedPiece (67–85): item falls back to findLeaf(run.grid, piece.id) when piece.columnId is set. Import findLeaf from '../model/cellTree.js'.
- src/elevation/components/properties/PieceProperties.jsx (108) — take `cells`; pass it to CabinetProperties; if piece.columnId, return partNumberField + CellProperties (before the CabinetProperties return at 94).
- NEW src/elevation/components/properties/CellSplitSection.jsx — SPEC §8
- NEW src/elevation/components/properties/CellProperties.jsx — SPEC §8
- src/elevation/components/properties/CabinetProperties.jsx (269) — take `cells`, pass it to FaceProperties (265); remove the "Split in 2" button (235–241) and splitItem from the import (10); add <CellSplitSection … nested={false} /> right above that button grid (234).
- src/elevation/components/properties/FaceProperties.jsx (298) — take `cells`; sameWidthIds (56) reads (cells?.pieces ?? layout.pieces). Nothing else.
- src/elevation/properties/__tests__/helpers.test.js — 1 test, SPEC §8, literally. Add gridFromItems from '../../model/grid.js' to the imports.

Imports: components use '../../model/index.js' for model names (cellTree.js and cells.js exports are there since 162/163) and '../../store/elevationSlice.js' for actions (splitCell, removeCell, equalizeCells, unsplitCell, setTrackSize, setItemWidth, lockItem). Match the markup and Tailwind classes CabinetProperties already uses (section headings, Field, InchInput, ReadOnlyValue, button classes).

DO NOT touch ElevationCanvas.jsx, DimensionRow.jsx (step 169), the model, the store, or RunProperties/RunPiecesSection. DO NOT grep the repo. Open Field.jsx or InchInput.jsx only if a prop name is in doubt.

While iterating, run only `npx vitest run src/elevation/properties/__tests__/helpers.test.js`. At the end `npm test && npm run lint` once: 577 + 1 = 578. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 168 draw, select and edit cells".
```

**Check after 168 (by hand):**

1. Nothing split: every room draws exactly as before; selecting a cabinet shows the usual panel, now with a count box and **Split across** / **Split down** instead of "Split in 2".
2. Tall run: select a cabinet, **Split down** with 2. Two boxes stack with a 1/8" gap between their faces (Euro: 0" under the upper box, 1/8" over the lower), and the reveal panel shows `rule: stacked seam`.
3. Select the lower cell: the panel says **Cell**, Height editable, Width read-only, plus Column width. Type 30 for height: it locks (the chain colour comes in 169).
4. **Split across** on the lower cell with 2: the 72" over two 36"s. Part numbers: lower-left, top, lower-right.
5. Split a cell down 3, then **Make equal**, **Remove cell**, **Unsplit** — the stack collapses back to one cabinet when one cell is left.
6. Switch the room to inset face frame: seams become 3/4" + 3/4" (one 1 1/2" rail).
7. Blind corner run: split the blind cabinet down; both cells show "Blind …".
8. Reload: the splits come back.

**After:** `git show --stat HEAD` — nine files, two of them new (~60 and ~110 lines), roughly +250 / −15.

---
## Step 169 — Cell chains, typing sizes on chains, Delete

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-33.md §9. Steps 162–168 are in.
If `git status` shows uncommitted changes, stop and tell me.

Each split draws its own dimension chain inside the run; clicking a chain value (or a cabinet width on the run's inner chain) opens a small input to type the size; Delete removes a selected nested cell.

Files (only these):
- NEW src/elevation/components/CellChains.jsx — SPEC §9
- NEW src/elevation/components/TrackSizeInput.jsx — SPEC §9. Use parseInches and formatInchesInput from '../model/units.js'.
- src/elevation/components/RunGroup.jsx — new prop onEditTrack; render <CellChains …> right after the FaceOutlines map (the `{[...faceLayouts].map(` block). Match by text; step 168 moved lines.
- src/elevation/components/DimensionRow.jsx (343) — new prop onPieceClick; `clickable` (182) and the onClick handler (192–199) per SPEC §9. Drag stays run-only.
- src/elevation/components/ElevationCanvas.jsx (1773) — the seven edits in SPEC §9, at: imports (48, 86–103, 108), state (after 160), callbacks (after selectFace, 951–954), the main RunGroup (1507), the lower.inner and upper.inner DimensionRows (1583–1592, 1633–1642), next to LiveEntryInput (1757–1767), and the Delete-key branch (600–611). Read ONLY those ranges; don't read the file whole. Leave the stretch-preview RunGroup (1705) alone.

Details that matter:
- Konva: pointer position for the popup comes from event.target.getStage().getPointerPosition() — it's container-relative, which is what TrackSizeInput's absolute positioning needs.
- TrackSizeInput: Enter with blank or "auto" → onCommit(null) (unlocks); a parsed value > 0 → onCommit(value); Escape or blur → onCancel. Stop pointerdown/keydown propagation so canvas shortcuts don't fire (the canvas key handler already ignores events from inputs).
- editPieceSegment ignores end pieces: their ids are `${runId}:left` / `${runId}:right`.
- CellChains labels are clickable only when `editable`; everything else listening={false}.

DO NOT touch the model, the store, PieceRect, FaceOutlines or any properties component. DO NOT grep the repo.

No new tests. At the end `npm test && npm run lint` once: still 578. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 169 cell chains and on-chain sizes".
```

**Check after 169 (by hand):**

1. A stack shows a vertical chain just inside its left edge; a row split shows a horizontal chain just above its bottom. Locked sizes are light blue.
2. Click a chain value, type `24`, Enter: that cell locks at 24 and the others share the rest. Click it again, clear it, Enter: back to auto.
3. Click a cabinet width on the run's inner chain below the wall and type a width: same as typing it in the panel. End-piece values don't open anything.
4. Select a nested cell and press Delete: it goes; the last one left collapses the split.
5. With neighbouring stacks of different heights side by side, are the chains where you want them? That's CELLS-PLAN Open 1 — tell me, and it's a one-line move.

**After:** five files, two new (~120 and ~60 lines); ElevationCanvas about +35, DimensionRow about +8.

**Then round 33 is done.** Tell me when 169 is in (and what you think of the chain placement and whether stacked cells need their own blind setting), and I'll write SPEC-34 and PROMPTS-34 (kinds and depth), with every step listed and every prompt written up front.
