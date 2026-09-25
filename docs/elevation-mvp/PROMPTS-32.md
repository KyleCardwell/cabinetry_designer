# Elevation Lab — Codex Prompts, Steps 156–158 (cells round 32: grid shape)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs and `CELLS-PLAN.md`.

**Branch:** `elevation-grid-run-split`, off `feature/elevation-mvp` at `9d2d166`. All of the cells work, rounds 32–38, runs on this branch; it merges back into `feature/elevation-mvp` only after round 38, if the whole thing works the way Kyle wants.

**Baseline is 522 passing** at `9d2d166` (step 155 added no tests; the commit since is docs only). Confirm with `npm test` first; if it differs, use that number in the prompts instead.

**Codex can't open the app**, so don't plan browser checks. None of these steps changes anything on screen.

**Why three steps:** `run.items` has 54 source references and ~100 test fixtures. 156 adds the grid module alone (2 new files). 157 and 158 switch the readers, 17 and 13 sites, split model/UI to stay near the 15-site budget. The store flip (159–160) gets its prompts after 158, with fresh line numbers — SPEC-32 §5.

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

**Then:** tell me 158 is in and I'll write 159 (disk v4) with line numbers from that commit.
