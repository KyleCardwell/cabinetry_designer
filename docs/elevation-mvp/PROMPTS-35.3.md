# Elevation Lab — Codex Prompts, Steps 206–211 (round 35.3: extensions)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs (`ALCOVE-PLAN.md`, `SPEC-35.3.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 206 | Shape: `extend` validated, saved, carried onto pieces; `setGridLeafExtend` | 674 |
| 207 | Model: `extendPieces` and its warnings | 676 |
| 208 | Model: followers stop at extended end pieces | 677 |
| 209 | Store: `setRunEndExtend`, `setCellExtend` | 678 |
| 210 | On screen: extended pieces, no chip/notes when extended down | 678 |
| 211 | Panel: Extend fields | 678 |

**Branch:** `elevation-grid-run-split`. Baseline after step 205 is **671**. Confirm with `npm test`; if it differs, shift the counts.

**Line numbers** are against `f61f5bd` (step 205). Find functions by name where earlier steps have moved things.

If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

---
## Step 206 — Shape

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.3.md §1 and §2. Step 205 is in.
If `git status` shows uncommitted changes, stop and tell me.

Shape step, no behavior. Fillers and panels can store an `extend` ({ down: { to: 'floor' } } etc.) on a run end (run.ends.left.extend) or on a panel/filler leaf (leaf.extend). This step validates it, saves it, copies it onto layout pieces, and adds setGridLeafExtend. Nothing reads it yet.

Files (only these):
- src/elevation/model/extensions.js — NEW, verbatim from SPEC §2 (EXTEND_TARGETS, EXTEND_DIRECTIONS, isExtendTarget, isExtend, extendDirections).
- src/elevation/store/persistence.js (640) — import isExtend after the grid.js import (9); CELL_KIND_KEYS.panel (32) adds 'extend'; isEnd (104–109) adds `&& isExtend(end.extend)`; isCellLeaf (268–279) adds the panel extend check before the shelves line; isRootItem's filler line (292–293) as in SPEC.
- src/elevation/model/splitRun.js (559) — itemExtras (17–24) adds extend; addEnd's piece (227–236) adds extend after `auto: isFlexEnd(end),`. Nothing else.
- src/elevation/model/cells.js (288) — resolveGrid's leaf push (96): extend after the shelves line. Nothing else.
- src/elevation/model/cellTree.js (441) — import from ./extensions.js after the grid.js import; append setGridLeafExtend verbatim (locate, isNestedGrid, replaceLeaf are already in the file).
- src/elevation/model/index.js — setGridLeafExtend in the cellTree block (310–332); a new extensions block at the end.
- src/elevation/model/__tests__/extensions.test.js — NEW, verbatim (1 describe, 2 tests).
- src/elevation/store/__tests__/persistence.test.js (1014) — describe('SPEC-35.3 extensions shape') at the end, verbatim (1 test). currentDocument and gridFromItems are already in the file.

DO NOT bump schemaVersion (extend is optional). DO NOT touch room.js, joints.js, the store slice or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/extensions.test.js src/elevation/store/__tests__/persistence.test.js`. At the end `npm test && npm run lint` once: 671 + 3 = 674. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 206 extension shape".
```

---
## Step 207 — Growing pieces

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.3.md §1 and §3. Step 206 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. extendPieces(wall, run, pieces) grows each piece with an `extend` along its length, past its run's edge: to the floor (z 0), the ceiling (lowest soffit over the piece, else wall height), the wall end, another run's box edge, or by a distance. Only from the run's edge, never shrinking. Grown pieces get `extended: [directions]`. Warnings: extend-blocked, extend-target-missing, extend-short. roomDiagnostics adds those warnings to the run.

Files (only these):
- src/elevation/model/extensions.js — the four imports from SPEC §3; `const EPSILON = 1e-6;` after TARGET_KEYS; append ceilingOver, extensionEdge, onRunEdge, grow, WARNINGS, extendWarning, extendPieces verbatim.
- src/elevation/model/room.js (1656) — import extendPieces from ./extensions.js after the corners.js import (4–11); in roomDiagnostics, one line right after `...cellPieces(run, layout).warnings,` (728). Open only those two spots; nothing else in room.js changes.
- src/elevation/model/index.js — extendPieces, extensionEdge in the extensions block.
- src/elevation/model/__tests__/extensions.test.js — add extendPieces to the extensions import; describe('SPEC-35.3 extending pieces') at the end, verbatim (2 tests).

DO NOT touch splitRun.js, cells.js, joints.js, styles.js or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/extensions.test.js`. At the end `npm test && npm run lint` once: 674 + 2 = 676. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 207 extend pieces past their run".
```

---
## Step 208 — Followers stop at extensions

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.3.md §1 and §4. Step 207 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. When a run follows another run's edge from the inside (left follows left, or right follows right; SPEC-34.3 follow anchors) and the leader's end piece on that edge is extended and reaches the follower's height, the follower's edge moves to the piece's inside face (followInset). When the offset is 0 and the piece covers the follower's whole box height, the follower's automatic end becomes 'none' (extensionCoversEnd in endIsCovered).

Files (only these):
- src/elevation/model/extensions.js — imports DEFAULT_SETTINGS (./constants.js) and verticalStart (./overlap.js); append extendedEndPiece, followInset, extensionCoversEnd verbatim.
- src/elevation/model/room.js — the extensions import adds followInset; resolveRunAnchorDatum's follow branch (269–274) replaced verbatim. Open only that function; nothing else in room.js changes.
- src/elevation/model/joints.js (267) — import extensionCoversEnd from ./extensions.js after the constants import; in endIsCovered (101–127) the four-line check right after `const edge = runEdgeX(run, side);`. Nothing else.
- src/elevation/model/index.js — extendedEndPiece, extensionCoversEnd, followInset in the extensions block.
- src/elevation/model/__tests__/extensions.test.js — imports (extendedEndPiece, followInset; jointEndTypes from ../joints.js; resolveRunAnchorDatum from ../room.js); describe('SPEC-35.3 followers stop at extensions') at the end, verbatim (1 test).

DO NOT change describeAnchor, joinEdges, followGlyphs or any other follow code: only the datum and the covered check move. DO NOT touch components or the store. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/extensions.test.js src/elevation/model/__tests__/follow.test.js src/elevation/model/__tests__/joints.test.js`. At the end `npm test && npm run lint` once: 676 + 1 = 677. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 208 followers stop at extended end pieces".
```

---
## Step 209 — Store

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.3.md §5. Step 208 is in.
If `git status` shows uncommitted changes, stop and tell me.

Store step. setRunEndExtend({ wallId, runId, side, direction: 'up'|'down', target|null }) sets or clears one direction of a run end's extension (not on a 'none' end). setCellExtend({ wallId, runId, cellId, direction, target|null }) does the same for a panel or filler leaf through setGridLeafExtend. setRunEnd keeps an end's extension unless the new type is 'none'.

Files (only these):
- src/elevation/store/elevationSlice.js (1692) — imports (setGridLeafExtend in the cellTree block 17–31; isExtendTarget from ../model/extensions.js after the corners.js import); setRunEnd (931–945): the one assignment line replaced as in SPEC; the two reducers right after setPanelDoors (1455–1464), verbatim; setRunEndExtend and setCellExtend added to the actions export list (1637–1690). Open only these spots.
- src/elevation/store/__tests__/elevationSlice.test.js (2328) — add setCellExtend, setRunEndExtend to the ../elevationSlice.js import (11–94); describe('SPEC-35.3 extension reducers') at the end, verbatim (1 test). run, fixed, auto, stateWithRun, currentRun and gridLeaves already exist in the file.

DO NOT touch the model or components. DO NOT read the whole slice or the whole test file. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js -t "SPEC-35.3"`, then the whole file once. At the end `npm test && npm run lint` once: 677 + 1 = 678. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 209 extension reducers".
```

---
## Step 210 — On screen

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.3.md §6. Step 209 is in.
If `git status` shows uncommitted changes, stop and tell me.

RunGroup draws pieces through extendPieces (after the drop), so extended end panels, fillers and panels are drawn at their full length and select as usual. A piece extended down gets no chip line, and the piece panel shows no end notes for it.

Files (only these; find the spots by name):
- src/elevation/components/RunGroup.jsx (578) — import extendPieces from ../model/extensions.js after the dimensions.js import; drawnPieces (134–142) replaced verbatim; the chipLines .filter (181) replaced verbatim. Nothing else.
- src/elevation/components/properties/PieceProperties.jsx (137) — the endNotes condition (76–78) adds `&& !piece.extend?.down`. Nothing else.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end `npm test && npm run lint` once: still 678. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 210 extended pieces on screen".
```

---
## Step 211 — Panel fields

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.3.md §7. Step 210 is in.
If `git status` shows uncommitted changes, stop and tell me.

A shared ExtendFields component: one "Extend up/down/left/right" select per direction (No, floor/ceiling/wall end, each other run on this wall side, By a distance + an inch input). Shown for run end pieces (up/down), interior fillers (up/down) and panel cells (their directions from extendDirections).

Files (only these):
- src/elevation/components/properties/ExtendFields.jsx — NEW, verbatim from SPEC §7.
- src/elevation/components/properties/EndFields.jsx (115) — imports; `extendRuns = []` prop; the ExtendFields block right after the width field.
- src/elevation/components/properties/PieceProperties.jsx — imports; extendRuns after notesLine; EndProperties and InteriorFillerProperties take extendRuns; ExtendFields in InteriorFillerProperties after the Width field; the side and filler branches pass extendRuns.
- src/elevation/components/properties/CellKindSection.jsx (108) — imports; the ExtendFields block after the Doors field.

RunEndsSection.jsx stays as it is (it doesn't pass extendRuns; it offers floor, ceiling and distance only). Match the classes already used in these files. DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end `npm test && npm run lint` once: still 678. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 211 extend fields".
```

**Check after 211 (by hand):**

1. **The alcove on one wall.**
   - Set up a 60" wall between two return walls, with a soffit at 84".
   - Draw a base run across it with a countertop.
   - Draw an upper panel run that sits on the countertop and is held under the soffit, with end panels at both ends and one back panel cell (3/4", backs aligned).
   - Select each end panel and set **Extend down → To the floor**. Both panels now run from the floor to the soffit.
   - Join the base's left edge to the panel run's left edge, and its right edge to the right edge (follow). The base shrinks to 3/4" inside each panel, has no end panels of its own, and the countertop stops at the panels.
2. **By a distance.** Set one end panel to **By a distance, 10"**. It grows 10" below the panel run. Where it doesn't cover the base's full height, the base keeps an end panel on that side.
3. **Run targets.** On an upper run, set a filler to **Extend down → To Base …**. It stops at that base's box bottom (above the toe kick).
4. **Panels.** Split a desk run so a side panel cell sits at the bottom of the run, and set it **Extend down → To the floor**: it becomes a leg. A top panel cell at the run's top shows **Extend left/right** instead.
5. **Warnings.** A side panel cell in the middle of a stack set to extend down shows "Can't extend down from here…". Extending an end panel up to a soffit it already touches shows "…doesn't reach past this piece."
6. **Chip detail.** With the doors flush above a light rail, an end panel shows its chip line. Extend it down and the chip line and the "chip detail" note disappear.
