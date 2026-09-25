# Elevation Lab — Codex Prompts, Steps 156–161 (cells round 32: grid shape)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs and `CELLS-PLAN.md`.

**Every step in this round** (round 32 is done after 161; round 33 is the vertical split):

| Step | What | Tests after |
|---|---|---|
| 156 | Grid module | 537 |
| 157 | Model code reads runs through `runItems` | 537 |
| 158 | UI code reads runs through `runItems` | 537 |
| 159 | Saves become v4 grids; old-save migration deleted | 536 |
| 160 | Prep for the flip: shape-preserving writers, store tests read through `runItems` | 540 |
| 161 | The store flips to grids | 543 |

**Branch:** `elevation-grid-run-split`, off `feature/elevation-mvp` at `9d2d166`. All of the cells work, rounds 32–38, runs on this branch; it merges back into `feature/elevation-mvp` only after round 38, if the whole thing works the way Kyle wants.

**Baseline is 522 passing** at `9d2d166` (step 155 added no tests; the commit since is docs only). Confirm with `npm test` first; if it differs, use that number in the prompts instead.

**Codex can't open the app**, so don't plan browser checks. None of these steps changes anything on screen.

**Why this many steps:** `run.items` has 54 source references and ~100 test fixtures. 156 adds the grid module alone (2 new files). 157 and 158 switch the readers, 17 and 13 sites, split model/UI to stay near the 15-site budget. 159 changes only the saved format and deletes the old-save migration (about 1,600 lines to read, under the 2,500 budget). 160 and 161 split the store flip: about 55 sites across the two largest files, so a green prep step comes first — SPEC-32 §6.

**Line numbers** in 157 and 158 are against `9d2d166`. 156 only adds a block at the end of `model/index.js`, and 157/158 touch different files, so they stay valid in order.

---
## Step 156 — The grid module

```
Repo: cabinetry_designer, branch elevation-grid-run-split (off feature/elevation-mvp). SPEC: docs/elevation-mvp/SPEC-32.md (§1–§3). Design background, only if a SPEC line is unclear: docs/elevation-mvp/CELLS-PLAN.md "A run is a grid of cells".
If `git status` shows uncommitted changes, stop and tell me.

Add a pure module and its tests. NOTHING calls it yet — no existing file changes except one export block.

Files:
- NEW src/elevation/model/grid.js — the API in SPEC-32 §2: exactly 14 exports (LEAF_KINDS, SIZE_MODES and 12 functions), as listed in the §2 code block.
- NEW src/elevation/model/__tests__/grid.test.js — the 15 tests in SPEC-32 §3, fixtures copied literally.
- src/elevation/model/index.js (247 lines) — append ONE block at the end: export { ...every grid.js export, alphabetical } from './grid.js';

Rules for grid.js (all in SPEC-32 §2, restated so you don't hunt):
- Imports nothing. Never mutates input. Returns the SAME reference when there's nothing to change (unknown leafId, empty grid for setGridBlind).
- Ids are deterministic: grid `${runId}:grid`, row `${runId}:row`, column `${leaf.id}:col`, leaf keeps the item id. No uuid.
- Cells address tracks by INDEX. Structural helpers (insertRootColumn, removeRootColumn, replaceRootItems) re-index cells 0..n-1 in column order and RE-HOME blind: read runBlind({ grid }) first, strip blind from every leaf, re-apply with setGridBlind.
- Column gets width→size (+ sizeMode 'auto' when null, 'manual' when a number), pin, absorb (only when !== undefined). Leaf gets every other item key. rootItems never includes blind.
- runItems(run) = run.items ?? (run.grid ? rootItems(run.grid) : []). run.items MUST win — splitRun builds transient sub-runs `{ ...run, items }` that still carry the parent's grid.
- runBlind(run) = run.blind ?? { left, right } from the first/last column leaves, null for an unset side, undefined when neither is set.
- updateRootItem: a patch value of undefined DELETES that key.
- isGridShape(grid, isLeaf): structure only, full rule list in §2. A node with `cols` is a nested grid (recurse); anything else is a leaf.

Keep grid.js plain and small — roughly 150–200 lines. No JSDoc essays; one line per export is plenty. Match the repo's style (2-space indent, single quotes, semicolons, trailing commas).

DO NOT open or grep any other file. You don't need splitRun.js, room.js, persistence.js or the store to write this — SPEC-32 already says everything grid.js must satisfy. Don't touch any existing test file.

While iterating, run only `npx vitest run src/elevation/model/__tests__/grid.test.js`. At the end run `npm test && npm run lint` once: 522 + 15 = 537 passing (or baseline + however many `it` blocks you wrote, if you split one of the 15 into several — say so). Don't run `npm run build`.

At most five lines of summary: what you built, anything in §2/§3 you had to interpret, anything left undone. Commit "elevation-mvp: step 156 grid shape module".
```

**After 156:** `git show --stat HEAD` — two new files (grid.js ~150–200, grid.test.js ~250–300) and a few lines in `index.js`. Nothing else listed.

---
## Step 157 — Model readers use runItems / runBlind

```
Repo: cabinetry_designer, branch elevation-grid-run-split (off feature/elevation-mvp). SPEC: docs/elevation-mvp/SPEC-32.md §4 "Step 157". Step 156 is in (src/elevation/model/grid.js exists).
If `git status` shows uncommitted changes, stop and tell me.

Mechanical read-switch. NO behavior change, NO test changes. Every stored run still has run.items / run.blind, and runItems(run) / runBlind(run) return exactly those, so the suite must stay identical.

Files (only these five; line numbers are against 9d2d166 — adding an import shifts lines, so match by the text shown or edit bottom-up):

src/elevation/model/splitRun.js (537) — add `import { runItems } from './grid.js';` with the other ./ imports.
  23  layoutInputs:   add `const items = runItems(run);` as the first body line
  25  run.items.reduce(          → items.reduce(
  28  run.items.filter(          → items.filter(
  88  splitRunLegacy: add `const items = runItems(run);` as the first body line (before the destructure)
  120 run.items.find(            → items.find(
  135 run.items.map(             → items.map(
  373 splitRun:       add `const items = runItems(run);` as the first body line
  375 run.items.filter(          → items.filter(
  386 run.items.findIndex(       → items.findIndex(
  402 run.items.slice(           → items.slice(
  403 run.items.slice(           → items.slice(
  408 run.items.slice(           → items.slice(
  475 run.items.slice(           → items.slice(

src/elevation/model/room.js (1515) — add `import { runItems } from './grid.js';` with the other ./ imports.
  379 run.items.flatMap(         → runItems(run).flatMap(
  446 resolvePinnedSpan: add `const items = runItems(run);` as the first body line
  447 const pinned = run.items   → const pinned = items
  470 run.items.slice(           → items.slice(
  472 run.items.slice(           → items.slice(
  661 ...run.items.flatMap(      → ...runItems(run).flatMap(

src/elevation/model/dimensions.js (466) — add `import { runItems } from './grid.js';`
  247 run.items.find(            → runItems(run).find(
  312 run.items.find(            → runItems(run).find(

src/elevation/model/faceLayouts.js (49) — add `import { runItems } from './grid.js';`
  31  run.items.find(            → runItems(run).find(

src/elevation/model/blind.js (155) — add `import { runBlind } from './grid.js';`
  94  run.blind?.[side]          → runBlind(run)?.[side]

No local named `items` exists in layoutInputs, splitRunLegacy, splitRun or resolvePinnedSpan today — checked — so the hoisted const can't clash.

LEAVE THESE EXACTLY AS THEY ARE (they are writers, switched in step 160):
  splitRun.js:521  `const items = [...run.items];` in syncAutoItems
  splitRun.js:451, 489  `items: leftItems` / `items: rightItems` — transient sub-runs; runItems prefers run.items on purpose so these keep working
  room.js:69, 79   cloneRun's blind and items copies
  room.js:1491, 1502  the mirror's blind and items copies

DO NOT grep the repo and DO NOT open any file outside these five (grid.js only if an export name is in doubt). Don't read room.js or splitRun.js whole — go to the listed lines. Don't touch the store, persistence, components, or any test file.

After editing, `grep -n "run\.items\|run\.blind" src/elevation/model/{splitRun,room,dimensions,faceLayouts,blind}.js` must show ONLY splitRun.js:syncAutoItems' line and room.js's four cloneRun/mirror lines.

While iterating, run only `npx vitest run src/elevation/model/__tests__/splitRun.test.js src/elevation/model/__tests__/blind.test.js`. At the end, `npm test && npm run lint` once — the count must equal step 156's (537 if baseline held), with NO test file in `git diff`. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 157 model reads runs through runItems".
```

**After 157:** `git show --stat HEAD` — five files, roughly 25 insertions and 20 deletions. More than that means it wandered.

---
## Step 158 — UI readers use runItems / runBlind

```
Repo: cabinetry_designer, branch elevation-grid-run-split (off feature/elevation-mvp). SPEC: docs/elevation-mvp/SPEC-32.md §4 "Step 158". Steps 156 and 157 are in.
If `git status` shows uncommitted changes, stop and tell me.

Mechanical read-switch in the UI. NO behavior change, NO test changes.

Files (only these seven; line numbers against 9d2d166 — none of these files changed since — match by the text shown or edit bottom-up):

src/elevation/properties/helpers.js (107) — add `import { runItems } from '../model/grid.js';`
  74       run.items.find(                          → runItems(run).find(
  93       `return run.items[run.items.length - 1] ?? null;`
           → `const items = runItems(run);` then `return items[items.length - 1] ?? null;`
  103–104  lastCabinetItem: add `const items = runItems(run);` before the for-loop; the loop and its body use `items` instead of `run.items`

src/elevation/components/ElevationCanvas.jsx (1772) — add `import { runItems } from '../model/grid.js';` right after the createRun import (line 46).
  601      selectedRun.items.find(                  → runItems(selectedRun).find(
  Touch NOTHING else in this file and don't read it beyond lines 40–50 and 595–610.

src/elevation/components/RunGroup.jsx (488) — add `import { runItems } from '../model/grid.js';` after the faceLayouts import (line 13).
  392      run.items.find(                          → runItems(run).find(

src/elevation/components/properties/RunPiecesSection.jsx — add `runItems` to the existing '../../model/index.js' import (lines 2–5).
  19       run.items.find(                          → runItems(run).find(

src/elevation/components/properties/RunCabinetsSection.jsx — add `import { runItems } from '../../model/index.js';` (it has no model import today).
  19       run.items.filter(                        → runItems(run).filter(

src/elevation/components/properties/CabinetProperties.jsx (268) — add `runItems` to the '../../model/index.js' import (line 2).
  add `const items = runItems(run);` directly above line 23, then:
  23, 25, 26, 30   run.items.            → items.

src/elevation/components/properties/EndFields.jsx (115) — add `runBlind` to the '../../model/index.js' import (line 2).
  59       run.blind?.[side]                        → runBlind(run)?.[side]

runItems and runBlind are already exported from model/index.js (step 156).

LEAVE ALONE: every run.items / run.blind site in src/elevation/store/elevationSlice.js (all 18 are writers or hand items back for mutation — step 160), src/elevation/store/persistence.js (step 159), src/elevation/model/runDefaults.js (step 160), and all tests.

DO NOT grep the repo and DO NOT open any file outside these seven. In particular not PropertiesPanel.jsx, RunProperties.jsx, the slice, or the model.

After editing, `grep -rn "\.items\b\|run\.blind" src/elevation/components src/elevation/properties --include=*.js --include=*.jsx | grep -v __tests__` must print nothing.

No new tests. Run `npm test && npm run lint` once at the end — same count as after step 157, NO test file in `git diff`. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 158 ui reads runs through runItems".
```

**Check after 158:** nothing should look different. Quick pass: select a run's cabinet (properties panel shows width, pin, absorb as before); add and remove a cabinet from the run panel; Delete key removes a selected cabinet; a pinned cabinet still shows its centerline marker; a blind-corner end still shows its "Blind box" value.

**After:** `git show --stat HEAD` — seven files, roughly 15 insertions and 12 deletions, no test file.

---
## Step 159 — Saves become v4 grids; old-save migration goes

```
Repo: cabinetry_designer, branch elevation-grid-run-split (off feature/elevation-mvp). SPEC: docs/elevation-mvp/SPEC-32.md §5 "Step 159" — it has every deletion by line, every new body, and every test edit. This prompt is the checklist. Steps 156–158 are in.
If `git status` shows uncommitted changes, stop and tell me.

There are no saved rooms worth keeping. So: delete ALL old-save migration (v1, v2, v3), and make the one saved format schema v4, where each run stores `grid` instead of `items` and `blind`. The Redux store KEEPS items/blind until step 160, so two small adapters convert at load and save. The app must behave exactly as before, just starting with no saved rooms.

Files (only these; line numbers against HEAD 9a40318):
- src/elevation/store/persistence.js (733) — ends ~250 lines shorter
- src/elevation/store/__tests__/persistence.test.js (825)
- src/elevation/store/elevationSlice.js — ONLY the './persistence.js' import (59–62) and line 116. Don't read the rest.
You may open src/elevation/model/grid.js to confirm a signature (gridFromItems, isGridShape, rootItems, runBlind). Nothing else.

persistence.js:
1. Delete exactly the blocks in the SPEC §5 "Delete from persistence.js" table: uuid and wallFrame imports, v2/v1 storage keys, V2_PROFILE_KEYS, V1_NUMERIC_SETTING_KEYS, isV1Run, isBlind, the normalizer's `ends:` entry (464–471), isV2ElevationDocument, isV1ElevationDocument, migrateProfile, migrateV2Document, migrateV1Document.
2. KEEP as they are (the SPEC says why): V2_NUMERIC_SETTING_KEYS, V2_DEFAULTED_SETTING_KEYS, the profileKeys params, isItem/isItemPin/ITEM_KINDS and the pin sets, and every other normalization. Don't rename or tidy any of it.
3. ELEVATION_STORAGE_KEY = 'cd.elevationLab.v4'; ELEVATION_SCHEMA_VERSION = 4.
4. Import { gridFromItems, isGridShape, rootItems, runBlind } from '../model/grid.js'.
5. isRun = today's isV1Run field checks (152–158) + today's isRun checks (237–244, 246 — not the isBlind line) + run.items === undefined + run.blind === undefined + isRunGrid(run.grid).
6. Add isLeafBlind, isLeaf, isRunGrid verbatim from SPEC §5. isRunGrid reuses isItem through rootItems(grid); don't restate item rules.
7. Rename normalizeV3Document → normalizeElevationDocument (no alias).
8. loadElevationDocument reads ELEVATION_STORAGE_KEY only — the block in SPEC §5.
9. Adapters: private runToStore + export storeRoomsFromDocument(rooms); toElevationDocument's runs map strips items/blind/_pinWidths and adds grid: gridFromItems(run.id, items, blind). A one-line "until step 160" comment on each.

elevationSlice.js: add storeRoomsFromDocument to the './persistence.js' import; line 116 becomes
  const rooms = document?.rooms ? storeRoomsFromDocument(document.rooms) : [fallbackRoom];

persistence.test.js — follow SPEC §5 literally:
- imports: rename normalizeV3Document, add toElevationDocument, drop the v1/v2 keys, isV2ElevationDocument, migrateV1Document, migrateV2Document and wallFrame; add grid.js (gridFromItems, rootItems, runBlind) and createInitialElevationState from '../elevationSlice.js'
- delete fixtures v1Run, v1Document, v2Profile, v2Document; add currentRun, currentWall, currentDocument copied from the SPEC
- replace every `migrateV1Document(v1Document())` with `currentDocument()` (in tbtDocument and in the tests); tbtDocument's run helper builds `grid` instead of `items`
- delete tests 18, 3, 4 and 222
- edit ONLY the pins test, 21, 43, 44, 194, 195, 215, 221 and 206, as the SPEC table says
- add describe('SPEC-32 grid persistence') with its 3 tests
Every other test is only touched by the currentDocument() swap. If one of those fails, the implementation or the currentDocument fixture is wrong, not the test. Fix that, and say so in the summary.

DO NOT grep the repo or open any other file, and don't touch any other test file. No UI change, no change to how any run lays out.

While iterating, run only `npx vitest run src/elevation/store/__tests__/persistence.test.js`. At the end, `npm test && npm run lint` once: 537 − 4 + 3 = 536 passing. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 159 persist runs as grids, drop old-save migration".
```

**Check after 159 (by hand):** the app starts with no rooms, since nothing reads the old saves any more. Draw a room with a run, pin a cabinet, lock a width and set a blind corner, then reload. Everything should come back. In DevTools → Application → Local Storage, `cd.elevationLab.v4` holds the room, and its runs have `grid` instead of `items`.

**After:** `git show --stat HEAD` — three files. `persistence.js` should show far more deletions than insertions (roughly −250 / +60), the test file about even, the slice 2 lines.

---
## Step 160 — Prep for the flip (no behavior change)

```
Repo: cabinetry_designer, branch elevation-grid-run-split (off feature/elevation-mvp). SPEC: docs/elevation-mvp/SPEC-32.md §6 "Step 160". Steps 156–159 are in.
If `git status` shows uncommitted changes, stop and tell me.

Prep for step 161, which flips the store to grids. NO behavior change: the store still holds items after this step. Two things:
(a) three model writers learn to preserve a run's shape: items in → items out (as today), grid in → grid out;
(b) the store tests stop reading run.items / run.blind directly, so they work in both worlds.

Files (only these; line numbers against 9a40318, and neither file below changed in 159):
- src/elevation/model/splitRun.js (541) — syncAutoItems only
- src/elevation/model/room.js (1515) — cloneRun line 80 and flipRunsForWall line 1504 only
- NEW src/elevation/model/__tests__/gridRuns.test.js — 4 tests, SPEC §6
- src/elevation/store/__tests__/elevationSlice.test.js (1912) — reads and two fixtures only

splitRun.js:
  3    add replaceRootItems to the existing './grid.js' import
  525  const items = [...run.items];      → const items = [...runItems(run)];
  540  return { ...run, items };          → return run.items ? { ...run, items } : { ...run, grid: replaceRootItems(run.grid, items) };

room.js:
  12   add cloneGrid, mirrorGrid to the existing './grid.js' import
  80   items: run.items.map((item) => ({ ...item })),
       → the two spread lines in SPEC §6 (items only when run.items, grid: cloneGrid(run.grid) only when run.grid)
  1504 items: [...run.items].reverse().map((item) => ({ ...item })),
       → the two spread lines in SPEC §6 (grid: mirrorGrid(run.grid))
  LEAVE the run.blind lines at 70 and 1493–1495 alone.

gridRuns.test.js: the fixture helpers and 4 tests in SPEC §6, literally. Imports: DEFAULT_SETTINGS from '../constants.js', gridFromItems/runItems/runBlind from '../grid.js', syncAutoItems from '../splitRun.js', flipRunsForWall from '../room.js'.

elevationSlice.test.js — add `import { runBlind, runItems } from '../../model/grid.js';`, then ONLY these edits:
  535, 543, 552, 560, 743, 744, 758, 769, 770, 782, 798, 814, 830, 831, 1024, 1207
       currentRun(X).items          → runItems(currentRun(X))
  1069, 1129, 1200
       return currentRun(state).items.find(   → return runItems(currentRun(state)).find(
  1809, 1814, 1819, 1824, 1829, 1886
       currentRun().blind            → runBlind(currentRun())
  1801 (test 207)  stateWithRun(run())  → stateWithRun(run({ items: [auto('a')] }))
  1873 (test 223)  add `items: [auto('a')],` as the first line inside that run({ … }), above `blind: { left: 42, right: 30 },`
After editing, `grep -n "\.items\b\|\.blind\b" src/elevation/store/__tests__/elevationSlice.test.js` must print nothing.

DO NOT grep the repo and DO NOT open other files. Don't touch the slice, persistence, runDefaults or any other test file. Don't read room.js or the slice test whole; go to the listed lines.

While iterating, run only `npx vitest run src/elevation/model/__tests__/gridRuns.test.js src/elevation/store/__tests__/elevationSlice.test.js`. At the end, `npm test && npm run lint` once: 536 + 4 = 540 passing (or 4 more than after step 159, if that number differs). Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 160 shape-preserving run writers and grid-safe store tests".
```

**After 160:** nothing changes in the app. `git show --stat HEAD` should list four files: about 8 lines changed across `splitRun.js` and `room.js`, a new test file of roughly 70–90 lines, and about 25 lines changed in the slice test.

---
## Step 161 — The store flips to grids

```
Repo: cabinetry_designer, branch elevation-grid-run-split (off feature/elevation-mvp). SPEC: docs/elevation-mvp/SPEC-32.md §6 "Step 161" — it has every site, every replacement and every test. Steps 156–160 are in.
If `git status` shows uncommitted changes, stop and tell me.

The flip. After this step the Redux store holds run.grid; no run in the store has items or blind. createRun builds a grid, every slice reducer that wrote items/blind writes the grid instead, and the two temporary adapters from step 159 go. The app must behave exactly as before.

Files (only these). Slice line numbers are at 9a40318 PLUS ONE, because step 159 added a line to its persistence import. Every site below also shows the code to match, so match by text:
- src/elevation/model/runDefaults.js — createRun's `const run = {` object (~134–149) and one import
- src/elevation/store/elevationSlice.js — only the sites in the SPEC §6 table, the grid.js import, the new rootLeaves helper, and createInitialElevationState's `const rooms =` line. Don't read the file whole.
- src/elevation/store/persistence.js — delete runToStore and storeRoomsFromDocument; toElevationDocument's runs map goes back to stripping _pinWidths only
- src/elevation/store/__tests__/elevationSlice.test.js — run() fixture + 3 new tests
- src/elevation/store/__tests__/persistence.test.js — rewrite only SPEC-32 test 3

elevationSlice.js, in order (SPEC §6 has each replacement):
1. import { insertRootColumn, removeRootColumn, runItems, setGridBlind, updateRootItem } from '../model/grid.js'.
2. Add rootLeaves(run) right after roomCabinets, verbatim from the SPEC.
3. roomCabinets: `run.items` → `rootLeaves(run)`.
4. itemIndexFor: `run.items.findIndex(` → `runItems(run).findIndex(`.
5. deleteOpening: the `for (const item of run.items)` pin-clearing loop → loop over `run.grid.cols` and clear `column.pin`.
6. setRunEnd: `if (end.type !== 'blind' && location.run.blind) location.run.blind[side] = null;` → `if (end.type !== 'blind') location.run.grid = setGridBlind(location.run.grid, side, null);`
7. setRunBlind: the two `run.blind` lines → `run.grid = setGridBlind(run.grid, side, width);`
8. setItemWidth, lockItem, unlockItem: `location.run.items[itemIndex].width = X` → `location.run.grid = updateRootItem(location.run.grid, action.payload.itemId, { width: X })`. Keep their itemIndex === -1 guards.
9. setItemPin: replace from `const item = location.run.items[itemIndex];` to the end of the lock loop as in the SPEC. itemsToLock must read runItems(location.run) AFTER the pin is written.
10. setItemAbsorb: item from runItems; write absorb with updateRootItem.
11. splitItem: insert the two new cabinets at itemIndex + 1 and itemIndex + 2, THEN removeRootColumn the original — the order matters for blind (SPEC §6).
12. addItemAfter: `location.run.items.length` → `runItems(location.run).length`; the splice → insertRootColumn.
13. removeItem: the splice → removeRootColumn.
14. setItemFace, setItemStyle, setItemReveals: `for (const item of location.run.items)` → `for (const item of rootLeaves(location.run))`. Loop bodies unchanged.
15. createInitialElevationState: `document?.rooms ? storeRoomsFromDocument(document.rooms) : [fallbackRoom]` → `document?.rooms ?? [fallbackRoom]`; remove storeRoomsFromDocument from the './persistence.js' import.
After editing: `grep -n "\.items\b\|\.blind\b" src/elevation/store/elevationSlice.js` must print nothing.

runDefaults.js: `const id = uuid();` above `const run = {`; `id: uuid(),` → `id,`; `items: [],` → `grid: gridFromItems(id, []),`; import gridFromItems from './grid.js'.

persistence.js: delete runToStore and storeRoomsFromDocument; toElevationDocument's runs map becomes `const { _pinWidths, ...persistedRun } = run; void _pinWidths; return persistedRun;`. Drop gridFromItems and runBlind from its grid.js import. isGridShape and rootItems stay.

Tests:
- elevationSlice.test.js: run() destructures { items, blind, ...rest } from today's literal and returns { ...rest, grid: gridFromItems(rest.id, items, blind) } (SPEC §6). Add gridFromItems to the grid.js import. Add describe('SPEC-32 store holds grids') with its 3 tests. Every other store test builds runs through run(), so leave them alone.
- persistence.test.js: rewrite SPEC-32 test 3 as "the store keeps grids and saves them unchanged" (SPEC §6). Nothing else.
If an existing test outside these fails, the source edit is wrong. Fix the source, not the test, and say which one in the summary.

DO NOT touch splitRun.js, room.js (step 160 already handled them), any component, or any model test. DO NOT grep the repo beyond the two checks above.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js src/elevation/store/__tests__/persistence.test.js`. At the end, `npm test && npm run lint` once: 540 + 3 = 543 passing. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 161 store holds run grids".
```

**Check after 161 (by hand).** This is the one step in round 32 that could visibly break something. Work through a room:

1. Draw a run: it auto-splits as before. Stretch it past a max-width boundary and a cabinet is added.
2. Select a cabinet, then lock, unlock and type a width. Split it, then add a cabinet and a filler after it and delete a cabinet.
3. Pin a cabinet to the wall and then to an opening. Delete the opening and the pin clears.
4. Pin a second cabinet: both pinned widths lock.
5. Set a blind corner end and a blind box width. Split the outer cabinet and the blind stays on the new outer cabinet.
6. Change a cabinet's faces, style and reveals, then switch the run between European and face frame. Drawer fronts reset as before.
7. Flip the wall's elevation side: cabinets mirror and the blind moves to the other end.
8. Reload: everything comes back.

**After:** `git show --stat HEAD` should list five files: about 60–80 lines changed in the slice, a handful in `runDefaults.js`, `persistence.js` about 20 lines shorter, and two test files.

**Then round 32 is done.** Tell me when 161 is in, and I'll write SPEC-33 and PROMPTS-33 (vertical split), with every step listed and every prompt written up front.
