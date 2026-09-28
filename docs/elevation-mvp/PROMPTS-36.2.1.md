# Elevation Lab — Codex Prompts, Steps 234–237 (round 36.2.1: face frame follow-ups)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-36.2.1.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 234 | Model: the frame on the wall chain, the frame badge anchor, `wallEndPanelFramed` | 710 |
| 235 | Store: wall end panel selection | 711 |
| 236 | Screen: wall end panels drawn, clickable, their own properties; Face frame choice fixed | 711 |
| 237 | Screen: wall chain uses the frame, no per-cabinet chains, frame badge with leader, solid open cells | 711 |

**Branch:** `elevation-grid-run-split`. The baseline after step 233 is **707**. Confirm it with `npm test`; if it differs, shift the counts.

**Line numbers** are against `354fa98` (step 233). Where earlier steps have moved things, find functions by name.

Copy code blocks exactly, including string values: step 229 changed the select's option values, and the setting stopped working. If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

---
## Step 234 — Model

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.1.md §1 and §2. Step 233 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step.
- frames.js: frameVerticalChains is split into openingStacks + frameVerticalChains (same output), plus new frameEdgeTracks (rail | opening | rail up the stack nearest one edge) and frameBadgeAnchor (the middle of the stile nearest the frame's centre).
- dimensions.js: verticalChains and stackChain take an `edge` (default 'left'), and a face frame run's 'box' segment becomes the frame's tracks via runBoxSegments.
- partNumbers.js: wallBadgeGroups gives each frame group lift 2 and an `anchor`.
- wallEndPanels.js: wallEndPanelFramed says whether a face frame run meets a wall end panel.

Files (only these):
- src/elevation/model/frames.js (327) — replace frameVerticalChains (289–327) with the SPEC block verbatim (openingStacks, frameVerticalChains, frameEdgeTracks, frameBadgeAnchor).
- src/elevation/model/wallEndPanels.js (93) — append wallEndPanelFramed verbatim.
- src/elevation/model/dimensions.js (561) — imports (5–6); runBoxSegments before stackChain (449); stackChain's signature and lines 462–464; verticalChains' signature, first line, lower box (503–505) and upper block (516–527). All verbatim.
- src/elevation/model/partNumbers.js (269) — the runFaceLayouts import; the frames import (4); in wallBadgeGroups, the lazy faceLayouts and the frame groups, verbatim.
- src/elevation/model/index.js — wallEndPanelFramed (176), frameBadgeAnchor and frameEdgeTracks (365).
- src/elevation/model/__tests__/frameParts.test.js — the imports; the SPEC-36.2 badge expectation's lift 1 → 2; describe('SPEC-36.2.1 the frame on the wall chain and its badge') at the end, verbatim (2 tests).
- src/elevation/model/__tests__/frameEnds.test.js — the import; describe('SPEC-36.2.1 which wall end panels meet a frame') at the end, verbatim (1 test).

DO NOT touch any component or the store. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/frameParts.test.js src/elevation/model/__tests__/frameEnds.test.js src/elevation/model/__tests__/dimensions.test.js src/elevation/model/__tests__/partNumbers.test.js`. At the end, run `npm test && npm run lint` once: 707 + 3 = 710. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 234 frame on the wall chain and badge anchor".
```

---
## Step 235 — Wall end panel selection

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.1.md §3. Step 234 is in.
If `git status` shows uncommitted changes, stop and tell me.

setSelection accepts `endPanel: 'start' | 'end'`, but only when no opening, soffit or run is being selected. It's added to the selection only when set (`...(endPanel ? { endPanel } : {})`), so every existing selection shape and test is unchanged.

Files (only these):
- src/elevation/store/elevationSlice.js (1758) — setSelection only: the endPanel const after the runId line, and the last line of the selection object. Nothing else.
- src/elevation/store/__tests__/elevationSlice.test.js — describe('SPEC-36.2.1 wall end panel selection') at the end, verbatim (1 test).

DO NOT touch the model or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. At the end, run `npm test && npm run lint` once: 710 + 1 = 711. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 235 wall end panel selection".
```

---
## Step 236 — Wall end panels on screen

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.1.md §1 and §4. Step 235 is in.
If `git status` shows uncommitted changes, stop and tell me.

Three bugs and one feature:
(1) The wall end panel "Face frame" select sent 'cover'/'die'/'auto', which the store rejects, so it always showed Auto. The new WallEndPanelFields sends exactly 'miter', 'butt', or null for Auto.
(2) WallEndPanelShapes called wallEndPanelSpans with the wrong arguments, so no wall end panel was drawn in any elevation. It's rewritten to map wallEndPanels and call wallEndPanelSpans(wall, panel).
(3) The Face frame select shows only when wallEndPanelFramed says a face frame run meets the panel.
(4) Wall end panels are clickable in the elevation. Hovering or selecting one draws the whole panel. Selecting opens WallEndPanelProperties: part number, size, WallEndPanelFields, Remove.

Files (only these):
- src/elevation/components/properties/WallEndPanelFields.jsx — NEW, verbatim.
- src/elevation/components/properties/WallEndPanelProperties.jsx — NEW, verbatim.
- src/elevation/components/properties/WallHeightProperties.jsx (372) — imports; framedEnds after rightFree (47–48); the `{panel && ( … )}` block (306–338) becomes the WallEndPanelFields block. Remove an import only if lint says it's unused.
- src/elevation/components/PropertiesPanel.jsx (163) — imports; the endPanel const after soffit (55–57); the endPanel branch between soffit and `!run || !displayLayout` (137–138).
- src/elevation/components/WallEndPanelShapes.jsx — the whole file, verbatim.
- src/elevation/components/ElevationCanvas.jsx (1834) — selectEndPanel after selectSoffit (959–962); move <WallEndPanelShapes> from the non-listening layer (1609–1614) into the run layer, right after the RunGroup map and before JointMarkers, with the new props. Nothing else.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end, run `npm test && npm run lint` once: still 711. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 236 wall end panels selectable, face frame choice fixed".
```

---
## Step 237 — Chains, badges, open cells

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.2.1.md §1 and §5. Step 236 is in.
If `git status` shows uncommitted changes, stop and tell me.

- The wall's vertical chain now gets its edge, so a face frame run shows rail | opening | rail there instead of its box height.
- The per-cabinet frame chains from step 233 are removed.
- PartNumberBadges draws a piece with an `anchor` (a face frame) straight above that point, 2 levels up, with a leader line down to it. Every other badge is drawn as before.
- Open (void) cells get a solid outline.

Files (only these):
- src/elevation/components/ElevationCanvas.jsx — pass `edge` as verticalChains' 5th argument (222). Nothing else.
- src/elevation/components/RunGroup.jsx (622) — remove the frameChains memo (91–94) and its CellChains block (515–522); the frames import (18) back to frameRegions only.
- src/elevation/components/PartNumberBadges.jsx (89) — the whole file, verbatim.
- src/elevation/components/PieceRect.jsx (136) — delete the void `dash` line (62). Nothing else.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end, run `npm test && npm run lint` once: still 711. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 237 frame on the wall chain, badge leaders, solid open cells".
```

**Check after 237 (by hand):**

1. **Face frame choice.** On an inset island's wall end panel, pick "Frame dies into the panel": it stays picked, the front frame pulls back 3/4", and the whole panel shows. Pick Auto: it goes back. Switch the room to European: the panel still shows (purple, full height) and the Face frame choice is gone.
2. **Selecting.** Click a wall end panel in the elevation (in an inset room, hover the toe-kick part or where the frame covers it).
   - Wall end panel properties open with its part number, size, width and Face frame choice.
   - While selected, the panel is outlined and drawn full height.
   - Remove deletes it.
3. **Vertical chain.** In an inset room, the chain at the wall's edge shows toe kick | 1 1/2 | opening | 1 1/2 | countertop in place of the 30 1/2 box. With a drawer stack at the left end of the run, the left chain shows each drawer opening and rail. A European run's chain is unchanged. There are no chains inside the cabinets. Clicking a cabinet still shows its face sizes.
4. **Frame badge.** With two inset cabinets, the frame's badge sits above the seam stile, higher than the cabinet badges, with a line down to the middle of that stile. With one cabinet, it sits over the left stile.
5. **Open cell.** A void cell has a solid outline and still says "Open".
