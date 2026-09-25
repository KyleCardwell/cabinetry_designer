# Elevation Lab — Codex Prompts, Steps 15–17 (dimensions + plan selection fix)

Commit any pending work first. Run in order. After each step, check it in the browser, and optionally ask Claude to "review step N".
Each step should stay under ~700 changed lines. If one grows much past that, stop and say why.

---
## Step 15 — Plan view: footprint selection fix + exterior dimensions

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-4.md completely (source of truth; earlier SPEC files still apply). This step covers SPEC-4 §1, §2, §4.2 and tests 1, 12–14.
If `git status` shows uncommitted changes, stop and tell me.

1. model/footprints.js: add footprintsAtPoint(room, point, settings) (point-in-polygon, topmost first per §1).
2. PlanCanvas.jsx:
   - Render walls, then every base/tall footprint, then every upper footprint.
   - Footprint click: use footprintsAtPoint with the pointer's world position. If the topmost id is already selected, select the next one (wrapping); otherwise select the topmost.
3. canvas/dimensionLayout.js: layoutDimensionRow per §4.2 (pure). It's used here for the single plan label, and again in step 17.
4. PlanWallShape.jsx (or a new PlanWallDimension.jsx):
   - Move the length dimension to the exterior per §2, with extension lines, ticks, a readable rotated label, and a pop-out when it doesn't fit.
   - Remove the interior length label (keep the interior tick).
   - Move the wall number circle per §2.
   - Nothing new listens for events.
5. PlanCanvas.jsx: move the wall move-handle position (and its preview delta label) to the exterior per §2. The drag math is unchanged.
6. Tests: SPEC-4 tests 1, 12, 13, 14. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 15 plan dims + footprint selection" and summarize. Manual test: add a base run, then an upper run, on the same wall → click the upper, click again → the base gets selected. Dimensions and handles sit outside the walls in an L-shaped room and don't overlap the cabinets.
```
---
## Step 16 — Dimension chain model

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-4.md §3 and tests 2–11.

Pure model only. No UI changes in this step.
1. Create src/elevation/model/dimensions.js with horizontalChains, verticalChains and pickColumnRuns exactly per §3. Reuse the existing helpers (splitRun, endMinWidthsForRun, cornerAt, wallLength, resolveProfile, moldingStack); don't duplicate their logic.
2. Export them from model/index.js.
3. Tests 2–11 in src/elevation/model/__tests__/dimensions.test.js. Also add a property-style test: for several random valid rooms (fixed seed), every chain is contiguous and its horizontal chains sum to the wall length.
4. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 16 dimension chains" and summarize.
```
---
## Step 17 — Elevation dimension rows

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-4.md §4 (and §3 for the data).

1. components/DimensionRow.jsx per §4.3: horizontal or vertical, extension lines and ticks at every boundary, inline or pop-out labels from layoutDimensionRow (pop-outs with leaders; hidden labels shown on hover), colors by kind. Only 'run' segments are clickable.
2. ElevationCanvas.jsx:
   - Compute `horizontalChains` for the 'lower' and 'upper' bands, and `verticalChains` using `pickColumnRuns(wall, selection.runId)`. Memoize on wall, room, settings and selection.
   - Render:
     - the lower band's inner and outer rows below the floor line
     - the upper band's rows above the wall's top edge
     - the vertical inner and outer rows left of the wall's left edge
   - Use the §4.1 offsets. The outer row's offset accounts for the inner row's pop-out levels.
   - Pass the §4.1 padding to fitWallToViewport (top 96 only when the upper band has runs).
   - Clicking an outer 'run' segment selects that run. The selected run's segment is highlighted.
3. RunGroup.jsx: remove the per-run DimensionLine above each run. Delete DimensionLine.jsx if nothing else uses it. Keep the in-cabinet width labels.
4. Make sure the stretch handles, draw tool and neighbor returns still work, and that no dimension row intercepts clicks meant for runs or pieces.
5. Add unit tests for any new pure helpers (e.g. row offset calculation). `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 17 elevation dimension rows" and summarize, with a manual test: in an L-shaped room with corner-anchored base runs on both walls, wall A shows the inner row [open, fillers/cabinets, 24 7/8 corner gap] and the outer row [open, run incl. corner]. Selecting an upper run changes the left height stack to that column. Narrow fillers pop out without overlapping.
```
