# Elevation Lab — Codex Prompts, Steps 226–233 (round 36.2: wall end panels, box widths, the frame as a part)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-36.2.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 226 | Model: wall end panels in the frame (`_frame.wallPanels`, the region grows over a mitered panel) | 699 |
| 227 | Model: plan miters, the chain over the panel, the panel's visible spans | 701 |
| 228 | Store and saves: a wall end panel's `frame` | 703 |
| 229 | Screen: the "Face frame" choice; the elevation draws the uncovered part | 703 |
| 230 | Model: `boxInsets` | 704 |
| 231 | Panel: box widths | 704 |
| 232 | Model: stiles/rails/mullions, vertical opening chains, frame part numbers | 707 |
| 233 | Screen: the Face frame section; vertical opening chains | 707 |

**Branch:** `elevation-grid-run-split`. The baseline after step 225 is **697**. Confirm it with `npm test`; if it differs, shift the counts.

**Line numbers** are against `9b1b664` (step 225). Where earlier steps have moved things, find functions by name.

If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

---
## Step 226 — Wall end panels in the frame

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.md §1 and §2. Step 225 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. syncRoom's last pass gives each face frame run beside a wall end panel `_frame.wallPanels = { left, right }` (each { width, top, join } or null; only when one side has a panel). join is wall.endPanels[endpoint].frame if set. Otherwise it's 'miter' when the panel is no deeper than the run's frontDepth and no taller than its box top, else 'butt'. frameRegions treats a mitered wall panel as a side panel just outside the run's edge: the region grows over it (region.wallPanels, only when present), and the box beside it isn't free.

Files (only these):
- src/elevation/model/room.js (1696) — the corners import adds frontDepth; import wallEndPanels after the wallSides import block (62–68); withWallPanels right after withFrame (581–592), verbatim; the new pass just before `return nextRoom;` in syncRoom (718). Open only those spots.
- src/elevation/model/frames.js (160) — the panels line (92) becomes the wallPanels + panels block; the panels loop (114–124) becomes the `covered` loop; `covering` (134) uses `covered`; the JSDoc line. All verbatim.
- src/elevation/model/__tests__/frameEnds.test.js — NEW, verbatim (1 describe, 2 tests).

DO NOT touch wallEndPanels.js, planPieces.js, dimensions.js, faceLayouts.js or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/frameEnds.test.js src/elevation/model/__tests__/frames.test.js src/elevation/model/__tests__/frameFixes.test.js src/elevation/model/__tests__/wallSides.test.js`. At the end, run `npm test && npm run lint` once: 697 + 2 = 699. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 226 wall end panels in the frame".
```

---
## Step 227 — Plan, chain, elevation spans

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.md §1 and §3. Step 226 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. wallEndPanelPolygon pulls the panel's inside corner in by the frame thickness on each face where a run's frame is mitered into it. wallEndPanelSpans (new) gives the heights of a wall end panel left showing on one elevation, less the mitered runs' spans. frameStrips miters the frame strip into region.wallPanels as it already does into run end panels. horizontalChains starts a run's inner segments where they really start, so a frame over a wall end panel doesn't overlap an `open` gap.

Files (only these):
- src/elevation/model/wallEndPanels.js (55) — EPSILON and panelMiters after the imports; wallEndPanelPolygon (40–55) verbatim; append wallEndPanelSpans verbatim.
- src/elevation/model/planPieces.js (292) — in frameStrips (169–200): the panels line (174), the two mitered.set lines (191–192), the JSDoc. Nothing else.
- src/elevation/model/dimensions.js (559) — the inner runs.forEach in horizontalChains (305–320) verbatim. Nothing else.
- src/elevation/model/index.js — wallEndPanelSpans in the wallEndPanels export (176).
- src/elevation/model/__tests__/frameEnds.test.js — the imports; the second describe at the end, verbatim (2 tests).

DO NOT touch frames.js, room.js, PlanCanvas.jsx or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/frameEnds.test.js src/elevation/model/__tests__/wallSides.test.js src/elevation/model/__tests__/dimensions.test.js src/elevation/model/__tests__/frameFixes.test.js`. At the end, run `npm test && npm run lint` once: 699 + 2 = 701. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 227 wall end panel miters, chain and spans".
```

---
## Step 228 — Store and saves

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.md §4. Step 227 is in.
If `git status` shows uncommitted changes, stop and tell me.

A wall end panel can store `frame: 'miter' | 'butt'` (absent = auto). setWallEndPanel accepts it (null clears it; anything else is rejected), and saved documents validate it.

Files (only these):
- src/elevation/model/constants.js (127) — FRAME_JOINS after DEFAULT_SETTINGS (98).
- src/elevation/store/elevationSlice.js (1754) — the constants import (4); setWallEndPanel (554–567) verbatim. Nothing else.
- src/elevation/store/persistence.js (649) — the constants import (1–5) adds FRAME_JOINS; one condition in isEndPanels (346–360).
- src/elevation/store/__tests__/elevationSlice.test.js — describe('SPEC-36.2 wall end panel frame join') at the end, verbatim (1 test).
- src/elevation/store/__tests__/persistence.test.js — describe('SPEC-36.2 wall end panel frame join') at the end, verbatim (1 test).

DO NOT touch the model beyond constants.js, and don't touch any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js src/elevation/store/__tests__/persistence.test.js`. At the end, run `npm test && npm run lint` once: 701 + 2 = 703. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 228 wall end panel frame join".
```

---
## Step 229 — Wall end panel on screen

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.md §5. Step 228 is in.
If `git status` shows uncommitted changes, stop and tell me.

In wall properties, each wall end panel gets a "Face frame" select (Auto / Frame covers the panel edge / Frame dies into the panel), and the width field keeps the panel's frame choice. The elevation draws a wall end panel only where no mitered face frame covers it (wallEndPanelSpans).

Files (only these):
- src/elevation/components/properties/WallHeightProperties.jsx (356) — the `{panel && ( … )}` block in "Wall end panels" (306–321) verbatim. Nothing else.
- src/elevation/components/WallEndPanelShapes.jsx (34) — the whole file, verbatim.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end, run `npm test && npm run lint` once: still 703. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 229 wall end panel frame on screen".
```

---
## Step 230 — Box insets

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.md §1 and §6. Step 229 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. boxInsets(frames, cells, settings) says how much narrower than its slot each framed box is on each side: the stile overhang (insetFrame.stile) on a free side, else 0. It's keyed by cabinet cell id, and by column id for a split column (from its cells along the outside edges).

Files (only these):
- src/elevation/model/frames.js — append boxInsets verbatim.
- src/elevation/model/index.js — boxInsets in the frames export (365).
- src/elevation/model/__tests__/frameParts.test.js — NEW, verbatim (1 describe, 1 test).

DO NOT touch any other model file or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/frameParts.test.js`. At the end, run `npm test && npm run lint` once: 703 + 1 = 704. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 230 box insets".
```

---
## Step 231 — Box widths in the panel

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.md §7. Step 230 is in.
If `git status` shows uncommitted changes, stop and tell me.

Bug fix: a face frame cabinet's width field and the run's Pieces list showed the slot (frame section), not the box. Two auto bases in a 48" space showed 24" instead of 23 1/4". They now show the box width (slot − boxInsets). Typing a box width stores slot = box + insets. Locking still stores the slot. The label says "Box width" and shows the frame section under it when they differ.

Files (only these):
- src/elevation/components/properties/PieceProperties.jsx (157) — import boxInsets, frameRegions; frames and insets memos after `numbers` (76); `insets` to CellProperties (131–139) and `inset` to CabinetProperties (146–154).
- src/elevation/components/properties/CabinetProperties.jsx (294) — NO_INSET, the inset prop, trim/boxWidth after actualCenter (28), the Width field (68–74). Nothing else.
- src/elevation/components/properties/CellProperties.jsx (256) — NO_INSET, the insets prop, the size block (39), the size commit (68), the read-only width (75), the lock's size, the Column width field (110–117).
- src/elevation/components/properties/RunProperties.jsx (105) — useMemo and model imports, the insets memo after actionBase (25), `insets` to RunPiecesSection (96).
- src/elevation/components/properties/RunPiecesSection.jsx (49) — the insets prop; the width shown (34).

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end, run `npm test && npm run lint` once: still 704. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 231 box widths in the panel".
```

---
## Step 232 — The frame as a part

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.md §1 and §8. Step 231 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. frames.js gains regionOpenings; frameMembers (a guillotine cut: full-height stiles, then rails between them, then mullions between the rails, …; null for a pinwheel); groupMembers; and frameVerticalChains (rail | opening | rail per stack of openings, repeated stacks skipped, in CellChains' row-grid shape). partNumbers numbers each frame region once, key region.id, kind 'frame', right after its run's pieces. wallBadgeGroups adds a badge group per region at lift 1.

Files (only these):
- src/elevation/model/frames.js — append regionOpenings, mergeSpans, fills, frameMembers, MEMBER_ORDER, groupMembers, frameVerticalChains, verbatim.
- src/elevation/model/partNumbers.js (247) — runParts: `frames`, and the return becomes the array with frame parts (68–81); wallBadgeGroups: map → flatMap and the two-group return (214–229). Nothing else.
- src/elevation/model/index.js — the frames export as in SPEC §8.
- src/elevation/model/__tests__/frameParts.test.js — the imports; the constants and describe('SPEC-36.2 the frame as a part') at the end, verbatim (3 tests).
- src/elevation/model/__tests__/partNumbers.test.js — the SPEC-36 test's last expectation adds 'frame:a1', as in SPEC §8. Nothing else.

DO NOT touch any component, faceLayouts.js, planPieces.js or dimensions.js. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/frameParts.test.js src/elevation/model/__tests__/partNumbers.test.js src/elevation/model/__tests__/frames.test.js`. At the end, run `npm test && npm run lint` once: 704 + 3 = 707. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 232 frame members and part numbers".
```

---
## Step 233 — The frame on screen

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.md §9. Step 232 is in.
If `git status` shows uncommitted changes, stop and tell me.

Selecting a face frame cabinet (root or cell) shows a "Face frame" section under its properties: the frame's part number field (key region.id), its size, and the grouped stiles/rails/mullions (or a warning when they can't be cut). RunGroup draws each region's vertical opening chains with CellChains (not editable, not in previews).

Files (only these):
- src/elevation/components/properties/FrameSection.jsx — NEW, verbatim.
- src/elevation/components/properties/PieceProperties.jsx — import FrameSection; region and frameSection after the insets memo; {frameSection} after CellProperties and after CabinetProperties.
- src/elevation/components/RunGroup.jsx (609) — the frames import (18); the frameChains memo after ghostIds (87–90); the second CellChains right after the first (504–509). Nothing else.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end, run `npm test && npm run lint` once: still 707. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 233 face frame part on screen".
```

**Check after 233 (by hand):**

1. **Island, mitered.** In an inset room, draw a 0"-thick free-standing wall, 96" long, with a 24" base on the front and one on the back, both anchored to both ends. Tick "Left end" under Wall end panels.
   - Front elevation: the frame's outline runs to the wall end, over the panel. The first stile is 1 1/2 on the chain, and there's no 3/4" gap before it. Only the toe-kick part of the panel (below the frame) is purple.
   - Select the first cabinet: its box width is 47 1/4. It was 46 1/2 before this round.
   - Plan: the panel's inside corner stops at the box fronts on both faces, and each frame strip miters into it.
2. **Dies into.** Set the panel's Face frame to "Frame dies into the panel". The front frame pulls back 3/4", the box loses 3/4" again, and the whole panel shows. On Auto, raise the back run's height: the front run butts and the back run still miters.
3. **Box widths.** Put two talls 48" apart and draw an inset base between them, anchored to both, with two cabinets.
   - Each cabinet shows "Box width 23 1/4" with "Frame section 24" under it. Type 23 in one: its frame section becomes 23 3/4.
   - The run's Pieces list shows 23 1/4 for each.
   - A European run still shows "Width".
4. **The frame as a part.** Select any cabinet in an inset run: the "Face frame" section shows its part number, size, and the counts (e.g. 3 × Stile 1 1/2 × 30 1/2, 4 × Rail 1 1/2 × 15 3/4). The frame's badge shows a level up on the frame. Override the number, and the badge follows.
5. **Vertical chains.** Give one inset cabinet a drawer stack and leave the next as a door. One vertical chain shows in the door's opening and one in the drawers'. A third, identical door cabinet gets no chain of its own.
