# Elevation Lab — Codex Prompts, Steps 280–283 (round 38.1: fixes)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`SPEC-38.1.md`, this file, and the renumbered `ALCOVE-PLAN.md`, `CELLS-PLAN.md`, `CONSOLIDATION-PLAN.md` and `../DECISIONS.md`).

| Step | What | Tests after |
|---|---|---|
| 280 | Model: pin callouts for any anchor; soffit returns; deep raised recesses keep their bump-out | 835 |
| 281 | Elevation: edge pin callouts, soffit returns drawn, wall row selects recesses/openings, selected recess outlined over runs | 835 |
| 282 | Toolbar: the Add menu | 835 |
| 283 | Plan: rows clear the bump-outs | 835 |

**Branch:** `elevation-grid-run-split`. The baseline after step 279 is **833**. Confirm it with `npm test`; if it differs, shift the counts.

The SPEC's code wasn't run before these prompts were written. If a test fails, check its expected value against SPEC-38.1 §1 before changing the code, and say so in the summary.

---

## Step 280 — Model

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.1.md §1 and §2. Step 279 is in.
If `git status` shows uncommitted changes, stop and tell me.

Three model changes, nothing on screen yet:
1. centerlineMarkers returns a marker for every pinned item (left edge, center or right edge, whichever the pin holds), each with its `anchor`; x is that point.
2. New soffitReturns(room, view) in soffits.js: soffits on other walls anchored into this face's inside corners or wing walls, as { key, wallId, soffitId, x, width, bottom, top }.
3. recessPlanShape fills a deep recess's bump-out whether or not it's raised.

Write the code as the SPEC gives it. Add the new test file and the test edits VERBATIM.

Files (only these):
- src/elevation/model/dimensions.js: centerlineMarkers only (≈ 437–459)
- src/elevation/model/__tests__/dimensions.test.js: the centerlineMarkers block (≈ 531–611): `anchor: 'center'` in tests 9 and 10; test 11 replaced
- src/elevation/model/soffits.js: the corners.js import; anchoredIntoCorner + soffitReturns after soffitSeams
- NEW src/elevation/model/__tests__/soffitReturns.test.js
- src/elevation/model/recesses.js: recessPlanShape's fill (≈ 263) and its JSDoc
- src/elevation/model/__tests__/recesses.test.js: one expectation added to the plan-shape test (≈ 154)
- src/elevation/model/index.js: soffitReturns in the soffits.js export block

DO NOT touch RunGroup.jsx, NeighborReturns.jsx or PlanRecess.jsx (they pick these up in 281 and on their own). DO NOT grep the repo or open other files.

First make the test changes and run them: they must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/soffitReturns.test.js src/elevation/model/__tests__/dimensions.test.js src/elevation/model/__tests__/recesses.test.js src/elevation/model/__tests__/soffits.test.js`. At the end, run `npm test && npm run lint` once: 833 + 2 = 835. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 280 Pin callouts, soffit returns, raised bump-outs".
```

---

## Step 281 — Elevation

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.1.md §1 and §3. Step 280 is in.
If `git status` shows uncommitted changes, stop and tell me.

- RunGroup: an edge pin's callout reads the distance alone; a center pin keeps "℄".
- NeighborReturns draws soffitReturns like cabinet returns (hatched, labeled "<wall> soffit").
- DimensionRow gets an onFeatureClick prop: 'recess' and 'opening' segments become clickable with it.
- ElevationCanvas: the wall row (dimensionChains.openings) selects a recess or (front face only) an opening; while a recess is selected, RecessOutline draws its outline over the runs.

Write the changes as the SPEC gives them.

Files (only these):
- src/elevation/components/RunGroup.jsx (626): the callout text (≈ 599) only
- src/elevation/components/NeighborReturns.jsx: the soffits.js import; the loop before `return returns.map(`
- src/elevation/components/DimensionRow.jsx (352): the prop list, `clickable` (≈ 187), the click handler (≈ 198–208)
- src/elevation/components/RecessShapes.jsx: append RecessOutline
- src/elevation/components/ElevationCanvas.jsx: the RecessShapes import (127), selectFeature after selectRecess (≈ 989), the wall row DimensionRow (≈ 1728), the listening-false Layer (≈ 1670–1686)

Read ElevationCanvas.jsx only at those line ranges. DO NOT touch the model, the store, the other DimensionRow uses (they don't pass onFeatureClick, so nothing changes for them) or the plan. DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 835.

At most five lines of summary. Commit "elevation-mvp: step 281 Recess selection from the wall row, soffit returns, edge pin callouts".
```

**Check after 281 (by hand):**

1. Fill a recess with cabinets. Click its segment in the row below the elevation: the recess is selected, its panel opens, and its outline shows in blue over the cabinets. Click a door's segment: the door is selected.
2. Pin a cabinet's left edge 24" from the left wall: a yellow callout reads 24" from the wall end to that edge. Switch the pin to the right edge and to center: the callout follows ("℄" only on center).
3. A soffit on the side wall, anchored into the corner: on this wall's elevation a hatched return shows at that end, the soffit's depth wide, from its bottom to the ceiling, labeled "<wall> soffit". Unanchor it: the return goes away.
4. A soffit on the host wall anchored to a wing wall: the wing wall's elevation shows it at that end.

---

## Step 282 — The Add menu

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.1.md §1.2 and §4. Step 281 is in.
If `git status` shows uncommitted changes, stop and tell me.

The toolbar keeps Select and Draw run (plan: Select and Draw wall) as buttons; Soffit, Recess, Door and Window (plan: Door, Window) move into a new AddToolMenu dropdown ("Add ▾", "Add: Soffit ▾" while one is active). Door and Window stay disabled on a back face with the same title. The soffit molding toggle shows after the menu while Soffit is active. The menu closes on a pick, a click outside, or Escape.

Write the changes as the SPEC gives them.

Files (only these):
- NEW src/elevation/components/AddToolMenu.jsx
- src/elevation/components/ElevationToolbar.jsx (222)

DO NOT touch setTool or any canvas (the tool names are unchanged). DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 835.

At most five lines of summary. Commit "elevation-mvp: step 282 Add menu".
```

**Check after 282 (by hand):**

1. Elevation toolbar: Select, Draw run, Add ▾. Open Add: Soffit, Recess, Door, Window. Pick Recess: the button reads "Add: Recess" and clicking the wall adds one.
2. Pick Soffit: the Crown / Top mold / None toggle shows next to the menu.
3. Switch to the back face: Door and Window are greyed out in the menu.
4. Plan toolbar: Select, Draw wall, Add ▾ with Door and Window, then Ortho and Center room.
5. Open the menu and click elsewhere, or press Escape: it closes.

---

## Step 283 — Plan: rows clear the bump-outs

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.1.md §1.3 and §5. Step 282 is in.
If `git status` shows uncommitted changes, stop and tell me.

A recess at least as deep as the wall bumps the wall out on the other face, under that face's dimension row (and for the front, the overall length and its extension lines). Each face's row moves out by its deepest such recess. With no deep recess the offsets are exactly today's.

Write the change as the SPEC gives it.

Files (only these):
- src/elevation/plan/PlanWallShape.jsx (348): the import, lines 42 and 50, and line 88

DO NOT touch wallFaceSegments, PlanRecess.jsx or PlanCanvas.jsx. DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 835.

At most five lines of summary. Commit "elevation-mvp: step 283 Plan rows clear recess bump-outs".
```

**Check after 283 (by hand):**

1. Plan, a 24" deep recess on a wall's front: the wall row and the overall dimension sit outside the bump-out, not over it.
2. Raise the recess off the floor (bottom 48): the bump-out stays filled, the notch is dashed.
3. A 3" recess (shallower than the wall): the rows are where they were.
