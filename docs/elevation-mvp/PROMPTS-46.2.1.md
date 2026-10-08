# Round 46.2.1 — Codex Prompts, Steps 409–412 (back panels, clearance to parts below, face frame light rails)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**; geometry and the API don't change.

Before step 409, commit `docs/elevation-mvp/SPEC-46.2.1.md` and this file.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 409 | cabinetry_designer | Back panel cells follow the room's Panels style | 1071 |
| 410 | cabinetry_designer | Face frame uppers: covered / flush parts below are the bottom rail | 1076 |
| 411 | cabinetry_designer | Clearance to the bottom of the parts below; manual runs keep parts in place | 1079 |
| 412 | cabinetry_designer | UI: face frame Doors labels, parts behind the frame dashed, Bottom select | 1079 |

---

## Step 409 — back panel cells follow the room's Panels style

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.2.1.md §1 and §2. Step 408 is in (1070 tests).
If `git status` shows uncommitted changes, stop and tell me.

A back panel cell (leaf.align === 'back') shows its face, so it isn't a sheet slab spot any more; side/top panel cells still are.
- src/elevation/model/panelThickness.js (30 lines): export isSheetCell(leaf) → leaf?.align !== 'back' (doc: sheet slab by default unless it's a back panel, whose face shows, SPEC-46.2.1).
- src/elevation/store/slices/cells.js (227 lines): setCellKind (line 117) passes { sheet: isSheetCell(findLeaf(grid, cellId)) }; setPanelType (line 172) passes { sheet: type !== 'back' }. wrapCell (159) and addPanel (184) keep { sheet: true }.
- src/elevation/model/doorDetails.js line 95: panelLevels(room, levelsWall, run, leaf) (no sheet option).
- src/elevation/components/properties/CellKindSection.jsx line 120: { sheet: isSheetCell(item) }.

Test edits, exactly as SPEC §2:
- src/elevation/store/__tests__/slicePanelThickness.test.js: line 22's title; `[0.75, 'back']` → `[0.8125, 'back']`; import isSheetCell; append the SPEC's `it` VERBATIM inside the describe.
- src/elevation/model/__tests__/runDoorDetails.test.js: replace the whole `it('draws a back panel cell as sheet slab by default, …')` block with the SPEC's block VERBATIM.

Files (only these): the four source files and the two test files above.

DO NOT change doorStyleResolve.js, wrapCell/addPanel, the end panel rules or any other test. DO NOT grep the repo.

Edit the tests first; run `npx vitest run src/elevation/store/__tests__/slicePanelThickness.test.js src/elevation/model/__tests__/runDoorDetails.test.js`. Iterate on those. At the end `npm test && npm run lint` once: 1070 + 1 = 1071, golden snapshot unchanged, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 409 Back panels follow the room's panel style".
```

---

## Step 410 — face frame uppers: covered or flush parts below are the bottom rail

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.2.1.md §1 and §3. Step 409 is in (1071 tests).
If `git status` shows uncommitted changes, stop and tell me.

- src/elevation/model/bottoms.js (91 lines; keep its imports to constants.js and uuid, CABINET_TYPE_IDS from './constants.js'):
  - frameBottomParts(run) → { height, doors, count }: zeros/null unless run.cabinetTypeId === UPPER; else the leading parts of run.bottom ?? [] with doors 'cover' or 'flush' and kind not in UNCOVERABLE_BOTTOM_PARTS, stopping at the first that isn't; height = their total, doors = the first one's, count = how many.
  - runBottomParts(run): the first part starts at run.z − extra, extra = run._frame ? Math.max(0, run._frame.drop − frameBottomParts(run).height) : 0; when run._frame, the first `count` parts get behind: true. Euro runs (no _frame) unchanged.
  - runBelowBox(run) → extra + runBottomHeight(run) (doc: what an upper's clearance is measured to).
- src/elevation/model/styles.js (318 lines): import frameBottomParts with belowRunReveal. frameDrop (line 78): on an upper, frameBottomParts(run).height when > 0, else as today. cabinetReveals, right after the hanging-base rule (~line 187): when !euro && runEdges.bottom and frameBottomParts(run).height > 0, apply('bottom', doors === 'flush' ? bead : styleReveals(style, UPPER, settings).bottom, 'rule:below-run'), bead = style.beadWidth for CABINET_STYLE_IDS.BEADED_INSET else 0. The euro below-run line stays.
- src/elevation/model/runBands.js (159 lines) line 134: each bottom part also gets behind: true when its runBottomParts entry has it (no key otherwise).

Files (only these):
- the three above
- NEW src/elevation/model/__tests__/frameBottoms.test.js: the SPEC §3 file VERBATIM (5 tests)

DO NOT change belowRunReveal, panelDrop, endPieceBottom, frames.js, profile.js, stacks.js, the UI or any existing test. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/frameBottoms.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1071 + 5 = 1076, golden snapshot UNCHANGED, lint 0 errors. If G2's frameBottom or face values in test 5 come out different, don't change the test: report what you got.

At most three lines of summary. Commit "elevation-mvp: step 410 Face frame bottom rail takes the light rail".
```

---

## Step 411 — clearance to the bottom of the parts below

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.2.1.md §1 and §4. Step 410 is in (1076 tests).
If `git status` shows uncommitted changes, stop and tell me.

An auto upper's clearance now runs to the bottom of the lowest part below it (or the face frame bottom when lower).
- src/elevation/model/profile.js (105 lines) line 88: z = counterReference + q.upperClearance + runBelowBox(run); import runBelowBox from './bottoms.js'; extend the comment ("or to the bottom of the parts below, SPEC-46.2.1"). Line 62 unchanged.
- src/elevation/model/stacks.js (144 lines): outerBottom (line 71) and stackedSpan (line 83) use runBelowBox(run) in place of runBottomHeight(run).
- src/elevation/store/slices/styles.js (97 lines) setRunBottom (line 65): for a run with heightMode 'manual' and no stack?.below: before = runBelowBox(location.run); apply the list as today; syncRoomAt; re-find the run with runLocation; after = runBelowBox(run); if |after − before| > 1e-9: run.z += after − before, run.height −= after − before, syncRoomAt again. Auto runs unchanged.

Test edits — exactly the values in SPEC §4, nothing else in those files:
- src/elevation/model/__tests__/stacks.test.js (223 lines): the listed expectations in 'fills between…', 'keeps a manual height…' (underUpper only), 'finds stacks…' (outerBottom 54), 'joins a stack…' (second), the two chain tests, 'draws into the gap…' (both height 18 — if createRun gives something else, report it, don't change it further).
- src/elevation/model/__tests__/bottoms.test.js line 84: { z: 53.875, height: 36 }.
- src/elevation/model/__tests__/runBands.test.js (G6 cap) z: 52.5 → 54; src/elevation/model/__tests__/bandParts.test.js line 56: 52.5 → 54.
- Golden snapshot: `npx vitest run src/elevation/model/__tests__/golden.test.js -u`. Only G6 may change (upper ea4373b3 z 54 → 55.5 / height 36 → 34.5, panel run b1ec1b4a height 16.5 → 18, cap 52.5 → 54, and what follows). If anything outside G6 changes, stop and tell me.

Files (only these): the three source files, the four test files, the golden snapshot, and
- NEW src/elevation/model/__tests__/belowClearance.test.js: the SPEC §4 file VERBATIM (3 tests)

DO NOT change bottoms.js, model/styles.js, roomSync.js or the UI. DO NOT grep the repo.

Write the new test file first; run `npx vitest run src/elevation/model/__tests__/belowClearance.test.js` (must fail). Then the source; then the listed test edits, running only those files. At the end `npm test && npm run lint` once: 1076 + 3 = 1079, lint 0 errors. In the summary, say which golden snapshot entries changed.

At most four lines of summary. Commit "elevation-mvp: step 411 Clearance to the bottom of the parts below".
```

---

## Step 412 — UI: face frame Doors labels, parts behind the frame, Bottom select

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.2.1.md §1 and §5. Step 411 is in (1079 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- src/elevation/components/properties/RunBottomSection.jsx (100 lines): takes room; frame = isInsetStyle(resolveStyle(settings, room, run)) (both from '../../model/index.js'). On a face frame run the Doors labels are cover "Frame rail covers it (lights behind)", flush "Frame hangs below, boxes 0\" reveal", visible "Below the frame"; a cap or corbels offer only visible (a stored flush still shows). The note under the list: face frame → "Face frame: a covered part makes the bottom rail deeper; \"hangs below\" drops the whole rail under the doors (light trough). Clearance runs to the lowest part."; Euro → today's note plus " Clearance runs to the lowest part."
- src/elevation/components/properties/RunProperties.jsx (129 lines) line 124: pass room={room}.
- src/elevation/components/RunGroup.jsx (477 lines), the bottomParts Rects (line ~253): when part.behind, fill "transparent" and dash [4, 3]; otherwise as today.
- src/elevation/components/properties/RunFaceOptions.jsx (81 lines), the upper Bottom select: only when !(run.bottom?.length), else a grey line "Bottom: set by Below the run" (text-xs text-gray-500). Options: overhang "Overhang (doors below box)", counter "Flush (on counter / nothing below)"; value = run.upperBottom === 'flush' ? 'counter' : (run.upperBottom ?? 'overhang').

Files (only these): the four above.

DO NOT change the model, the store, persistence.js or other components. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1079 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 412 Below-run UI for face frames, Bottom select".
```

---

## Running it (Kyle, after 412)

Follow SPEC-46.2.1's end-to-end check: Euro upper + light rail shrinks the boxes (doors stay); face frame light rail / trough become the bottom rail; corbels hang below the frame; manual runs shrink from the bottom; back panels show the room's door frame; the Bottom select only offers Overhang / Flush and hides when there's a part below.
