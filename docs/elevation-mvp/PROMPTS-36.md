# Elevation Lab — Codex Prompts, Steps 213–220 (round 36: face frame on cells)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-36.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 213 | Shape: `run.seamGap`, derived `_seamGap`, column `gap` round trip; style edits resync | 681 |
| 214 | Model: root columns leave their gaps; beaded side reveals drop the bead | 683 |
| 215 | Model: nested grids leave their gaps; `cells.gaps`; stacked seams across a row gap | 685 |
| 216 | Store: `setTrackGap`, `setRunSeamGap` | 687 |
| 217 | Panel: gap fields | 687 |
| 218 | Model: `frameRegions`, narrower boxes at free ends, openings, warning | 690 |
| 219 | Model: no part number for frame fillers; opening and gap segments on the chain | 692 |
| 220 | On screen: the frame, see-through framed boxes, box width | 692 |

**Branch:** `elevation-grid-run-split`. Baseline after step 212 is **678**. Confirm with `npm test`; if it differs, shift the counts.

**Line numbers** are against `d057326`. Find functions by name where earlier steps have moved things.

If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

---
## Step 213 — Shape

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.md §1 and §2. Step 212 is in.
If `git status` shows uncommitted changes, stop and tell me.

Shape step, no layout change yet. A run can store `seamGap` (the gap at each seam between two cabinet columns). syncRoom derives the effective one onto the run as `_seamGap` (run.seamGap, else 2 × bead on beaded inset, else 0; stored only when > 0), and toElevationDocument strips it like _pinWidths. A root column's `gap` travels between grid cols and items. setRoomStyle and setRunStyle now resync the room, because a beaded style will change the layout. Nothing reads _seamGap or gap yet.

Files (only these):
- src/elevation/model/styles.js (237) — append runSeamGap verbatim.
- src/elevation/model/grid.js (380) — itemParts (6–17): 'gap' in the exclusion list and col.gap; rootItems (116–131): item.gap; updateRootItem (309): 'gap' joins pin/absorb. Nothing else.
- src/elevation/model/room.js (1663) — import runSeamGap from ./styles.js after the stacks.js import block (39–47); withSeamGap right above syncRoom's JSDoc (565); the runs map in syncRoom right after the prune line (575). Open only those spots.
- src/elevation/store/persistence.js (645) — isRun (217–240): the seamGap line after outset; isRootItem (295–302): destructure and void `gap`; toElevationDocument (596–613): strip _seamGap too.
- src/elevation/store/elevationSlice.js (1725) — setRoomStyle (1505–1513) and setRunStyle (1514–1522): one syncRoomAt line each after withStandardDrawers. roomIndexFor already exists. Open only those two reducers.
- src/elevation/model/index.js — runSeamGap in the styles block (38–56).
- src/elevation/model/__tests__/gaps.test.js — NEW, verbatim (1 describe, 2 tests).
- src/elevation/store/__tests__/persistence.test.js (1047) — describe('SPEC-36 gaps shape') at the end, verbatim (1 test). currentDocument, gridFromItems, isElevationDocument and toElevationDocument are already imported.

DO NOT touch splitRun.js, cells.js or any component. DO NOT change setItemStyle. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/gaps.test.js src/elevation/store/__tests__/persistence.test.js`. At the end `npm test && npm run lint` once: 678 + 3 = 681. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 213 gap shape".
```

---
## Step 214 — Root gaps

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.md §1 and §3. Step 213 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. splitRun leaves a gap after each root column: the column's own `gap`, else the run's seam gap (`_seamGap ?? seamGap ?? 0`) between two cabinet columns, else 0; never after the last. A gap counts as fixed width everywhere widths are added up (layoutInputs, itemsMinimum, interiorLayout, the pin segments) and moves x on by its width. Pieces keep their exact shape (no new keys). Beaded inset's left/right reveals drop the bead (the bead's extra is now the gap).

Files (only these):
- src/elevation/model/splitRun.js (561) — itemsWithGaps after isAutoItem (12–14), verbatim; layoutInputs (41–69); splitRunLegacy (109–269): items, gapsAfter, addEnd, the item loop, positioning; itemsMinimum (282–284); interiorLayout (332–372); splitRun (396–518): items, rightMinimum, middleMinimums, the interior start, the right segment. All as in SPEC §3. syncAutoItems keeps runItems(run).
- src/elevation/model/styles.js — styleReveals (104–105): left/right become frame.stile, with the one-line comment.
- src/elevation/model/__tests__/styles.test.js (202) — test '30 beaded, profiled upper' (54–58): left: 0.75, right: 0.75. Nothing else.
- src/elevation/model/__tests__/gaps.test.js — the splitRun import; describe('SPEC-36 root gaps') at the end, verbatim (2 tests).

DO NOT touch cells.js, room.js, faceLayouts.js or any component. DO NOT add gapAfter or gap to pieces. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/gaps.test.js src/elevation/model/__tests__/splitRun.test.js src/elevation/model/__tests__/styles.test.js`. At the end `npm test && npm run lint` once: 681 + 2 = 683. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 214 root gaps".
```

---
## Step 215 — Nested gaps

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.md §1 and §4. Step 214 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. Nested grids leave gaps too: a track's own `gap`, else the run's seam gap between two columns whose touching cells are all cabinets or nested grids (rows take only their own). resolveTracks takes the gaps; track starts and cell spans include them; grid records' track start/end skip them. cellPieces returns `gaps` (rectangles): between top-level pieces and inside nested grids. stackedSides takes a reach, and faceLayouts passes gapReach(cells.gaps), so stacked boxes still get the stacked-seam reveals across a row gap.

Files (only these):
- src/elevation/model/cells.js (289) — resolveTracks (7–24) takes gaps; replace offsets (26–30) with trackStarts, spanLength, isBoxNode, trackGaps, gapReach, axisLayout; gridRecord (36–56) and resolveGrid (58–102) as in SPEC; rootGaps before cellPieces and the cellPieces changes (104–146); stackedSides (152–166) replaced verbatim. Nothing else.
- src/elevation/model/faceLayouts.js (85) — gapReach in the cells.js import (2); the stackedSides call (65). Nothing else.
- src/elevation/model/index.js — gapReach, trackGaps in the cells block (334–347).
- src/elevation/model/__tests__/gaps.test.js — the cells.js import; the two top-level helpers (cell, nestedRun) after withItems; describe('SPEC-36 nested gaps') at the end, verbatim (2 tests).

DO NOT touch splitRun.js, cellTree.js, room.js or any component. DO NOT change any caller of resolveTracks other than axisLayout (the default gaps = [] keeps them as they are). DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/gaps.test.js src/elevation/model/__tests__/cells.test.js src/elevation/model/__tests__/faceLayouts.test.js`. At the end `npm test && npm run lint` once: 683 + 2 = 685. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 215 nested gaps".
```

---
## Step 216 — Store

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.md §5. Step 215 is in.
If `git status` shows uncommitted changes, stop and tell me.

Store step. setGridTrackGap(grid, trackId, gap|null) sets or clears the gap after any root or nested track (via a private updateTrack walker). setTrackGap({ wallId, runId, trackId, gap|null }) and setRunSeamGap({ wallId, runId, gap|null }) store them and resync the room; a negative gap or no change is a no-op.

Files (only these):
- src/elevation/model/cellTree.js (460) — append updateTrack and setGridTrackGap verbatim. isNestedGrid is already imported. Do not change setGridTrackSize.
- src/elevation/store/elevationSlice.js (1725) — setGridTrackGap in the cellTree import block (18–33); setRunSeamGap right after setMaxCabinetWidth (1172–1179); setTrackGap right after setTrackSize (1361–1370); both in the actions export list (1627–1723). Open only these spots.
- src/elevation/model/index.js — setGridTrackGap in the cellTree block (310–333).
- src/elevation/model/__tests__/gaps.test.js — the cellTree.js import; describe('SPEC-36 track gap edits') at the end, verbatim (1 test).
- src/elevation/store/__tests__/elevationSlice.test.js (2394) — setRunSeamGap, setTrackGap in the ../elevationSlice.js import (12–96); describe('SPEC-36 gap reducers') at the end, verbatim (1 test). run, auto, stateWithRun, currentRun, setRoomStyle and setRunStyle already exist in the file.

DO NOT touch the model outside cellTree.js and index.js, or any component. DO NOT read the whole slice or the whole test file. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/gaps.test.js` and `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js -t "SPEC-36"`, then the whole slice test file once. At the end `npm test && npm run lint` once: 685 + 2 = 687. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 216 gap reducers".
```

---
## Step 217 — Panel fields

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.md §6. Step 216 is in.
If `git status` shows uncommitted changes, stop and tell me.

A shared GapField (an InchInput that allows blank, placeholder = the fallback, rejects negatives). Shown as: "Gap between cabinets" in the run's Cabinets section (setRunSeamGap); "Gap right" on a root cabinet that isn't the last column (setTrackGap on `${item.id}:col`); on a cell, "Gap right" or "Gap below" when its track isn't the last in its grid, and "Column gap right" in its Column section when that column isn't the last.

Files (only these):
- src/elevation/components/properties/GapField.jsx — NEW, verbatim from SPEC §6.
- src/elevation/components/properties/RunCabinetsSection.jsx (88) — imports; the GapField block after the Max cabinet width block (73–85).
- src/elevation/components/properties/CabinetProperties.jsx (277) — imports; next and gapFallback after itemIndex (31); the GapField block after the Lock/Unlock width button (80).
- src/elevation/components/properties/CellProperties.jsx (225) — imports; the five consts after blindSides (44–46); the GapField block after the Size section's Lock/Unlock button (83); the Column GapField after the Column section's Lock/Unlock button (118).

Match the classes already used in these files. DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end `npm test && npm run lint` once: still 687. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 217 gap fields".
```

---
## Step 218 — Frame regions

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.md §1 and §7. Step 217 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. New frames.js: frameRegions(room, run, cells, settings) groups face frame cabinet cells (effective style inset or beaded) and the fillers touching them into regions (touching, or across a gap up to gapReach); each region is their bounding rectangle, grown over a side/end panel at either side and dropped by insetFrame.upperDrop on an overhanging upper; frame fillers are listed (they're part of a wider stile); a cabinet side with nothing framed or covered beside it is free; a region the members don't fill warns frame-not-rectangle. faceOpenings(face, area, reveals) gives each face's slot before fit (pair halves merged). runFaceLayouts narrows a free-sided box by insetFrame.stile, lays the faces out in the box, and adds `box` and `openings` to each entry. roomDiagnostics adds the frame warnings.

Files (only these):
- src/elevation/model/frames.js — NEW, verbatim from SPEC §7.
- src/elevation/model/faceLayouts.js (85) — imports (faceArea; faceOpenings, frameRegions); frames and overhang after `const cells = …` (32); free/box before face (51); cabinetFaces takes box (71); box and openings in result.set. Nothing else: capture, stacked, covered and hinge stops still read piece.
- src/elevation/model/room.js — import frameRegions after the footprints.js import (13); one line in roomDiagnostics right after the extendPieces warnings line (730). Open only those two spots.
- src/elevation/model/index.js — the frames.js export line at the end.
- src/elevation/model/__tests__/frames.test.js — NEW, verbatim (1 describe, 3 tests).

DO NOT change faces.js (resolveFaces keeps its return shape). DO NOT touch cells.js, splitRun.js, partNumbers.js, dimensions.js or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/frames.test.js src/elevation/model/__tests__/faceLayouts.test.js`. At the end `npm test && npm run lint` once: 687 + 3 = 690. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 218 frame regions".
```

---
## Step 219 — Part numbers and opening dimensions

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.md §1 and §8. Step 218 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. A filler inside a face frame gets no part number (a blind panel end keeps its number). The inner horizontal chain goes through runInnerSegments: each face frame region becomes frame | frame-opening | frame … along its bottom row of openings (frame-opening segments carry pieceId), pieces outside regions stay 'piece' segments (with pinned as before), and a gap between segments becomes a 'gap' segment.

Files (only these):
- src/elevation/model/partNumbers.js (236) — import frameRegions after the cells.js import (3); runParts (52–78): the cells/entries/cellWidths/blindPanels/inFrame lines and the filter, verbatim. The .map after it and wallBadgeGroups stay as they are.
- src/elevation/model/dimensions.js (496) — imports (cellPieces; runFaceLayouts; frameRegions); regionSegments and runInnerSegments before horizontalChains (170), verbatim; in horizontalChains the piece loop (247–255) becomes the one inner.push line. Everything else in the file stays.
- src/elevation/model/__tests__/partNumbers.test.js (410) — describe('SPEC-36 frame fillers') at the end, verbatim (1 test). makeWall, aBase and syncRoom already exist in the file.
- src/elevation/model/__tests__/dimensions.test.js (767) — describe('SPEC-36 opening dimensions') at the end, verbatim (1 test). cabinetRun and roomR already exist in the file.

DO NOT touch DimensionRow.jsx or ElevationCanvas.jsx (new segment kinds draw with the default color and aren't clickable). DO NOT touch frames.js, faceLayouts.js or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/partNumbers.test.js src/elevation/model/__tests__/dimensions.test.js`. At the end `npm test && npm run lint` once: 690 + 2 = 692. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 219 frame part numbers and opening dimensions".
```

---
## Step 220 — On screen

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.md §9. Step 219 is in.
If `git status` shows uncommitted changes, stop and tell me.

RunGroup draws each face frame region with FrameOutline (a Konva Shape: the region filled, each opening cut out by winding it the other way; listening false), right before the pieces. Framed cabinets, frame fillers and covered panels are drawn see-through by PieceRect (framed prop): no fill, no edge unless selected or warned, still clickable, width label kept. The cabinet style panel shows "Box … wide" for inset cabinets.

Files (only these):
- src/elevation/components/FrameOutline.jsx — NEW, verbatim from SPEC §9.
- src/elevation/components/RunGroup.jsx (580) — imports (frameRegions after the faceLayouts.js import; FrameOutline after FaceOutlines); frames and framedIds after faceLayouts (69–72); the FrameOutline map right before drawnPieces.map (423); PieceRect gets framed. Nothing else.
- src/elevation/components/PieceRect.jsx (127) — the framed prop; the Rect (51–58) as in SPEC.
- src/elevation/components/properties/CabinetStyleProperties.jsx (67) — isInsetStyle import; the Box line right after StyleFields.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end `npm test && npm run lint` once: still 692. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 220 face frame on screen".
```

**Check after 220 (by hand):**

1. **Inset, free ends.** Set a room to Inset face frame and draw a 36" base with no ends, split into two 18s. A frame is drawn over both: 1 1/2" stiles at both ends and in the middle, 1 1/2" rails top and bottom, the doors in the openings. The chain below reads 1 1/2 | 15 3/4 | 1 1/2 | 15 3/4 | 1 1/2. Select a cabinet: the panel says "Box 17 1/4 wide".
2. **End panel and filler.** Give the run an end panel on the left and a fixed 2" filler on the right. The frame covers the panel's edge (1 1/2" stile) and the filler (2 3/4" stile). The filler has no part number.
3. **Beaded.** Switch the room to Beaded inset. The run's cabinets move apart by 1/2" (the Cabinets section's gap field shows 1/2 as its placeholder), and the seam stile reads 2". Type 0 in the field: the boxes close up. Clear it: back to 1/2.
4. **Gap on one seam.** On a European run, set one cabinet's "Gap right" to 1". The boxes move apart and the chain shows a 1" gap segment between them.
5. **Stacks.** In an inset tall run, split a cabinet down into two. One 1 1/2" rail sits between them (REV-009). Set the upper cell's "Gap below" to 1/2": the rail becomes 2".
6. **Upper.** An inset upper run's frame drops 3/4" below the boxes, flush with the end panels.
7. **Breaks and the warning.** Split a column of an inset run into a cabinet over a void: the frame goes around the cabinet and its neighbour, and the run shows "These face frame cabinets don't make a rectangle…".
8. **Mixed.** Set one cabinet in an inset run to European: the frame breaks there, and that cabinet draws as before.
