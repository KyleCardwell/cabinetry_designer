# Elevation Lab — Codex Prompts, Steps 221–225 (round 36.1: face frame fixes)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-36.1.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 221 | Shape: `insetFrame.thickness`, `runFrame`, derived `run._frame` | 694 |
| 222 | Model: 13/16 front depth, clearance to the frame, corner stile minimum | 696 |
| 223 | Model: plan pieces for a frame; the mitered end panel's badge | 697 |
| 224 | Plan view: mitered pieces and the frame strip | 697 |
| 225 | Elevation: end panels on hover, clickable | 697 |

**Branch:** `elevation-grid-run-split`. Baseline after step 220 is **692**. Confirm with `npm test`; if it differs, shift the counts.

**Line numbers** are against `f3b6033` (step 220). Find functions by name where earlier steps have moved things.

If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

---
## Step 221 — Shape

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.1.md §1 and §2. Step 220 is in.
If `git status` shows uncommitted changes, stop and tell me.

Shape step, no behavior. A face frame run (run-level style inset or beaded) gets a derived `_frame = { thickness, drop }` from syncRoom: thickness is the new insetFrame.thickness (13/16), drop is insetFrame.upperDrop on an upper whose doors overhang, else 0. A European run has none. toElevationDocument strips it like _seamGap. Nothing reads it yet.

Files (only these):
- src/elevation/model/constants.js (120) — insetFrame (79) gains thickness: 0.8125.
- src/elevation/model/styles.js (255) — append runFrame verbatim.
- src/elevation/model/room.js (1680) — the styles import (49) adds runFrame; withFrame right after withSeamGap (569–576); the syncRoom runs map (590) wraps withSeamGap in withFrame. Open only those spots.
- src/elevation/store/persistence.js (648) — toElevationDocument (606–609) strips _frame too.
- src/elevation/model/index.js — runFrame in the styles block.
- src/elevation/model/__tests__/frameFixes.test.js — NEW, verbatim (1 describe, 2 tests).

DO NOT touch corners.js, profile.js, planPieces.js or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/frameFixes.test.js`. At the end `npm test && npm run lint` once: 692 + 2 = 694. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 221 frame shape".
```

---
## Step 222 — Depth, clearance, corners

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.1.md §1 and §3. Step 221 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. frontDepth: a run with _frame is outset + depth + frame thickness (no bumper, no door). resolveVertical: an auto upper's z adds _frame.drop, so the clearance runs to the frame's bottom rail. endMinWidthsForRun: at an anchored inside corner, a face frame run's minimum is the Euro minimum less its side reveal (styleReveals(...).left), never below 0.

Files (only these):
- src/elevation/model/corners.js (222) — frontDepth (20–22) verbatim. Nothing else.
- src/elevation/model/profile.js (101) — the upper branch's z line (84) and its comment. Nothing else.
- src/elevation/model/room.js — the styles import (isInsetStyle, resolveStyle, runFrame, runSeamGap, styleReveals); endMinWidthsForRun (189–201) verbatim. Open only those spots.
- src/elevation/model/__tests__/frameFixes.test.js — the imports; cornerRoom after roomWith; describe('SPEC-36.1 depth, clearance and corners') at the end, verbatim (2 tests).

DO NOT change any caller of frontDepth. DO NOT touch runDefaults.js, planPieces.js or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/frameFixes.test.js src/elevation/model/__tests__/roomsCorners.test.js src/elevation/model/__tests__/outset.test.js src/elevation/model/__tests__/profile.test.js`. At the end `npm test && npm run lint` once: 694 + 2 = 696. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 222 frame depth, clearance and corners".
```

---
## Step 223 — Plan pieces and badges

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.1.md §1 and §4. Step 222 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. planRunPieces, for each face frame region: its fillers and their returns aren't drawn; framed boxes use their face layout's box range (narrower at a free end); framed cabinets' faces are replaced by one 'frame' strip (box front to frame front, across the region) with a `polygon` mitered into the end/side panel it covers at either end, and those panels get the matching `polygon`. shift moves polygons with the outset. wallBadgeGroups now leaves out only a frame's fillers, so a mitered end panel keeps its badge.

Files (only these):
- src/elevation/model/planPieces.js (241) — import frameRegions after the corners.js import (4); fillerReturns (139–162) takes `hidden`; frameStrips before planRunPieces (164), verbatim; in planRunPieces: frames and framedIds after `const cells = …` (169), frameBox and the start/end lines in boxes (201–215), the faces and returns lines (216–226), shift (228–230). Nothing else.
- src/elevation/model/partNumbers.js (250) — wallBadgeGroups: the `covered` set (222–225) becomes fillers only. Nothing else.
- src/elevation/model/__tests__/frameFixes.test.js — the imports; describe('SPEC-36.1 plan pieces') at the end, verbatim (1 test).
- src/elevation/model/__tests__/partNumbers.test.js — the SPEC-36 test: its title and last expectation as in SPEC §4. Nothing else.

DO NOT touch PlanRunFootprint.jsx or any other component. DO NOT touch frames.js or faceLayouts.js. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/frameFixes.test.js src/elevation/model/__tests__/planPieces.test.js src/elevation/model/__tests__/partNumbers.test.js src/elevation/model/__tests__/outset.test.js`. At the end `npm test && npm run lint` once: 696 + 1 = 697. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 223 frame plan pieces".
```

---
## Step 224 — Plan view

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.1.md §5. Step 223 is in.
If `git status` shows uncommitted changes, stop and tell me.

PlanRunFootprint draws a plan piece's `polygon` (u, v pairs) when it has one, so the frame strip and its end panels meet on a miter. The frame strip already takes the run's color.

Files (only these):
- src/elevation/plan/PlanRunFootprint.jsx (273) — depthRangePoints (63–70) verbatim. Nothing else.

DO NOT touch the model. DO NOT grep the repo or open other files.

No new tests. At the end `npm test && npm run lint` once: still 697. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 224 frame in plan view".
```

---
## Step 225 — Elevation end panels

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.1.md §6. Step 224 is in.
If `git status` shows uncommitted changes, stop and tell me.

A face frame's end panels (and covered side panels) are drawn again in the elevation, as "ghosts": invisible and unlabeled until hovered or selected, then drawn as a normal end panel. Always clickable. Framed cabinets stay see-through with no labels; fillers in a frame stay hidden.

Files (only these):
- src/elevation/components/RunGroup.jsx (602) — framedIds (cabinets only), hiddenIds (fillers only) and ghostIds (panels) replace the two sets at 79–84; PieceRect gets ghost. Nothing else.
- src/elevation/components/PieceRect.jsx (133) — the ghost prop; quiet and showLabels; `quiet` in the Rect's fill and stroke conditions.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end `npm test && npm run lint` once: still 697. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 225 frame end panels on hover".
```

**Check after 225 (by hand):**

1. **Clearance.** In an inset room, draw a base with a countertop and an upper above it. The frame's bottom edge (the frame rectangle's bottom) sits 18" above the counter; the upper's box is 3/4" higher. Switch the room to European: the box drops back to 18".
2. **Depth.** Select an inset base: the depth readout says 24 13/16. In plan, its front line is 13/16 in front of the boxes (no bumper, no door).
3. **Corner.** Anchor an inset base into an inside corner with a base on the return wall. The corner stile (from the return run's face to the first opening) is at least 1 1/2 on the chain: the hidden filler part can go down to 3/4 (1/2 beaded) instead of 1 1/2. The return run's reserve is its depth + 13/16.
4. **Plan view.** The inset run shows its boxes, a 13/16 frame strip across the front, and no filler. With an end panel, the strip and the panel meet on a diagonal at the front corner. A European run looks as before.
5. **End panels in the elevation.** Hover where the inset run's end panel is: it appears; move away and it disappears. Click it: it's selected and stays visible; its part number badge shows. Fillers never appear.
