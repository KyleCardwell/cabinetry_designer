# Elevation Lab — Codex Prompts, Steps 124–127 (badges on top, staggered moldings, phantom widths)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Order:** 124 first. 125 needs 124. 126 needs 124 and 125 (it edits a file 125 moved the caller of). 127 is independent of all three and can run any time.

**Codex can't open the app**, so don't plan browser checks. Kyle checks each step by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`, or `npx vitest run` once at the end for the steps with no tests. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of `4712fdc`.

**One step reads a big file** — 125 touches `ElevationCanvas.jsx` (1,759 lines, ~22k tokens to read whole). It writes little and has no test loop, so it should cost one read, not four: its prompt names the four regions to open, and the point of naming them is that the rest of the file is never opened. Nothing about it is risky — it is a ~35-line new file and five deletions.

---
## Step 124 — Badge groups and molding slots, model only

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-24.md §2, §3 (the model half only), §6 test 205.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/partNumbers.js (188): three additions only —
  - MOLDING_BADGE_SLOTS beside MOLDING_LABELS (16)
  - `slot: MOLDING_BADGE_SLOTS[molding]` on every entry wallMoldingBadges returns (160–188)
  - a new wallBadgeGroups export at the end of the file, exactly as SPEC §2
- src/elevation/model/index.js (232): add MOLDING_BADGE_SLOTS and wallBadgeGroups to the existing './partNumbers.js' export block (133–139)
- test: src/elevation/model/__tests__/partNumbers.test.js (244): edit test 202, add test 205

No component changes in this step. Nothing calls wallBadgeGroups yet; step 125 does.

wallBadgeGroups needs no new imports — splitRun, wallLength, wallEndPanels, wallEndPanelPartKey, endMinWidthsForRun, endCornerAnglesForRun and pinTargetsForRun are all already imported at the top of partNumbers.js. Copy the function body from SPEC §2; don't invent a different shape.

Three things to get right and nothing else:

1. wallBadgeGroups takes an elevation SIDE VIEW as `wall`, the same as wallMoldingBadges does — it reads wall.runs, wall.id and wall.side directly and must not call wallSideView itself.

2. The pieces are splitRun(...).pieces, undropped. Do not filter them by kind or width: the drawing side already skips a piece with no number, and partBadgeLevels reads pieces[0]'s height. Drop a GROUP only when its pieces array is empty.

3. Runs stay in wall.runs order — do not sort them. runsInWalkOrder is for numbering, not for drawing, and using it here would change which badge lifts over which.

Test 202 (188–210) gains one field per expected object: slot 0 on toeKick, -1 on topMold, 1 on crown, on both walls. Nothing else in 202 changes.

Test 205 exactly as SPEC-24 §6. It needs room E, which test 203 (211–243) builds inline — lift that syncRoom({...}) literal into a module-level helper (call it `panelRoom`) and have both 203 and 205 use it, so the fixture exists once. Don't change anything about what 203 asserts.
Expect 495 passing.

At most five lines of summary. Commit "elevation-mvp: step 124 badge groups and molding slots".
```

**Check after 124:** nothing visible. The suite is the check.

---
## Step 125 — Draw every badge in a layer of its own

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-24.md §1, §4.
If `git status` shows uncommitted changes, stop and tell me. Step 124 must be in.

Files:
- NEW src/elevation/components/PartNumberLayer.jsx (~35 lines) exactly as SPEC §4
- src/elevation/components/RunGroup.jsx (425): three deletions only — the PartNumberBadges import (28), the `partNumbers = null` prop (37), and the `{partNumbers && (<PartNumberBadges …/>)}` block (318–325)
- src/elevation/components/WallEndPanelShapes.jsx (47): whole file — remove the partNumbers prop, the PartNumberBadges and wallEndPanelPartKey imports, and the badge element; keep the `piece` object and the Rect exactly as they are
- src/elevation/components/ElevationCanvas.jsx (1,759): four regions only —
  - the import block (45–112): add PartNumberLayer from './PartNumberLayer.jsx'
  - the live RunGroup (1504–1528): delete line 1512, `partNumbers={partNumbering}`
  - the overlay Layer (1544–1577): delete line 1549, `partNumbers={partNumbering}` on NeighborReturns, and delete the whole <MoldingBadges …/> element (1564–1570)
  - the end of the Stage: add the new <Layer> after the `{dragPreview && (…)}` block (1718–1739) and immediately before `</Stage>`

ElevationCanvas.jsx is 1,759 lines. Open only those four regions.

This step moves drawing, it does not change it. PartNumberBadges.jsx, MoldingBadges.jsx and canvas/partNumberLayout.js are untouched — each badge group still lays out on its own with the same lifts and the same leaders. The only difference is the Layer it lands in.

Why last in the Stage: badges drew inside RunGroup, in the same Layer as the runs, in wall.runs order — so a run added later, the joint markers, the wall end panel fills and the neighbour returns all drew over them. A Layer of its own, last, makes that impossible. Do not instead reorder wall.runs, change any existing Layer's contents beyond the two deletions above, or give RunGroup a z-index.

NeighborReturns never had a partNumbers prop — 1549 has been passing one into nothing since step 121. Deleting it is a fix, not a behaviour change.

Keep MoldingBadges imported in ElevationCanvas only if it is still referenced there after the deletion; it is not, so remove that import too. PartNumberLayer imports it instead.

Don't touch PieceRect.jsx, FaceOutlines.jsx, JointMarkers.jsx, NeighborProfiles.jsx (step 127), the dimension rows, the toolbar or PropertiesPanel.jsx.

No tests in this step. Run `npx vitest run` once at the end; 495 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 125 part number layer".
```

**Check after 125:**
- Every number is readable. Nothing draws over one — add a second run that overlaps an existing one horizontally and its badges still show; select a run so the joint markers appear and the badges still show.
- A wall with end panels: the panel badges sit one step above the run's end fillers, same as before.
- Badges still lift and still step up in threes exactly as they did after step 121 — this step must change nothing about where a badge sits, only what can cover it.
- Part # in the toolbar still turns everything off and on.
- Drag a run and stretch a run: the previews draw under the numbers now, which is fine; say so if it reads badly.

---
## Step 126 — Stagger the molding badges

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-24.md §3 (the drawing half).
If `git status` shows uncommitted changes, stop and tell me. Steps 124 and 125 must be in.

Files:
- src/elevation/components/MoldingBadges.jsx (53): one constant and one line

Add `const MOLDING_BADGE_GAP = 4;` beside the imports, and change

  const centerX = rect.x + rect.width / 2;

to

  const centerX = rect.x + rect.width / 2 + badge.slot * (width + MOLDING_BADGE_GAP);

`width` is the partBadgeWidth(text) already computed two lines above, and `badge.slot` comes from wallMoldingBadges as of step 124. That is the entire step.

The problem this fixes: the top mold strip sits at the cabinet top and the crown strip starts about 1 1/2" above it, so at any normal zoom the CR pill covered the TM pill. Offsetting by each pill's own width means they cannot touch however long the numbers get.

Do not clamp centerX to the run. On a run too narrow for three pills the outer two hang past its edges on purpose — three pills stacked on each other is worse.

Don't touch partNumbers.js, PartNumberBadges.jsx or PartNumberLayer.jsx.

No tests in this step — test 202 already covers the slots. Run `npx vitest run` once at the end; 495 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 126 stagger molding badges".
```

**Check after 126:**
- TM sits left of centre, CR right of centre, TK centred, and all three read at once on a wall with crown.
- A wall with a topMold soffit over the uppers shows TM off to the left and no CR.
- Zoom in and out: they stay clear of each other.

---
## Step 127 — Neighbour outlines: solid, with a width dimension

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-24.md §5.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/components/NeighborProfiles.jsx (16): whole file, rewritten to ~55 lines

This is the only file in the step. The model is already correct: neighborProfiles(room, wall, settings) returns one rect per neighbouring run per span that reaches past this wall's end, `x` negative on the left or greater than the wall length on the right, and `width` equal to how far it reaches. Do not open or change src/elevation/model/neighborProfiles.js, wallExtent.js, or their tests.

Two changes:
1. The Rect loses `dash` and draws solid: stroke "#64748b", strokeWidth 1.
2. Each profile gains a width dimension across its middle — a line edge to edge, a tick at each end, and formatInches(profile.width) centred above the line. The four constants and the exact geometry for all four elements are in SPEC-24 §5; copy them.

Each profile becomes a <Group listening={false}> holding the Rect and, when rect.width >= MIN_DIMENSION_PX, the line, two ticks and the Text. Below that span, draw the Rect alone.

The Text gets a fixed 80px box centred on the profile, NOT `width: rect.width` — a 1 1/2" phantom is narrower than its own number, and a rect-width box makes Konva wrap it.

formatInches comes from '../model/units.js'. The component stays listening={false} throughout and stays in the overlay Layer it is already rendered in — don't touch ElevationCanvas.jsx.

No tests in this step. Run `npx vitest run` once at the end; 495 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 127 phantom width dimensions".
```

**Check after 127:**
- A run that reaches past a wall's end shows as a solid outline on the neighbouring elevation with its width dimensioned across the middle.
- The number is the amount that shows through, not the whole run's width.
- A very narrow phantom shows the outline and no dimension rather than a clipped one; say if that threshold is wrong.
- Zoom out far: the dimension drops out cleanly instead of turning into overlapping text.
