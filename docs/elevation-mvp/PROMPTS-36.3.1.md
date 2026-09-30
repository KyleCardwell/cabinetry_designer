# Elevation Lab — Codex Prompts, Steps 244–247 (round 36.3.1: counter height, hanging chain, soffits, openings in plan, islands)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-36.3.1.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 244 | Model: hanging base chain fix, counter height `middle` chain, soffit on the chain | 732 |
| 245 | Screen: the counter height row in the elevation (and a stale import that fails lint) | 733 |
| 246 | Model: islands that run out past the room; the plan wall row with doors and windows | 736 |
| 247 | Screen: doors and windows in the plan wall row | 736 |

**Branch:** `elevation-grid-run-split`. The baseline after step 243 is **729**. Confirm it with `npm test`; if it differs, shift the counts.

**Line numbers** are against `1694913` (step 243). Where earlier steps have moved things, find functions by name.

Copy code blocks exactly, including string values and numbers. The SPEC's model code and tests were checked in a scratch copy, and every changed file passed ESLint there, but Vitest couldn't run. If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

---
## Step 244 — Model: the vertical chain

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.1.md §1 and §2. Step 243 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step, in verticalChains and stackChain:
- A hanging base's toe kick ends at the frame's bottom, not the box, so the bottom rail shows as 1 1/2".
- Both return a new `middle` chain: floor to the top of a base run's top (counter height). Empty for a tall or no base.
- The open space at the top stops at the lowest soffit over the column, then a 'soffit' segment to the ceiling.

Files (only these):
- src/elevation/model/dimensions.js (589) — the soffitsOn import before the splitRun import (20); counterHeight, columnSoffit and soffitBreak before stackChain; stackChain's ending (493 to its closing brace); in verticalChains the result line (518), the first lines of the lowerRun block (527–529) and the last append (564). All verbatim. verticalOpeningChain doesn't change.
- src/elevation/model/__tests__/counterHeight.test.js — NEW, verbatim (3 tests).

DO NOT touch any component or the store. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/counterHeight.test.js src/elevation/model/__tests__/dimensions.test.js src/elevation/model/__tests__/stacks.test.js src/elevation/model/__tests__/tops.test.js src/elevation/model/__tests__/frameParts.test.js`. At the end, run `npm test && npm run lint` once: 729 + 3 = 732. Lint has one error already (`dissolveJoint` unused in ElevationCanvas.jsx); step 245 removes it, so ignore only that one. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 244 counter height, hanging chain, soffit on the chain".
```

---
## Step 245 — Screen: the counter height row

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.1.md §1 and §3. Step 244 is in.
If `git status` shows uncommitted changes, stop and tell me.

The elevation draws each vertical chain's `middle` (the counter height) as its own row between the inner chain and the wall height. The outer row moves out only when there is a middle row, and the left/right margins grow by 26 px for it. Also removes an unused import that fails lint.

Files (only these):
- src/elevation/canvas/dimensionLayout.js (89) — replace dimensionRowOffsets (5–11) verbatim.
- src/elevation/canvas/__tests__/dimensionLayout.test.js — the new test inside describe('dimensionRowOffsets') (+1).
- src/elevation/components/DimensionRow.jsx (349) — two KIND_COLORS entries after molding.
- src/elevation/components/ElevationCanvas.jsx (1842) — baseTransform's right/left margins and deps (413–427); the vertical offsets (491–494) and the middle lines in the returned vertical (505–512); a middle DimensionRow after each vertical inner row (after 1729 and after 1748); last, delete the unused `dissolveJoint,` import line (93). Nothing else.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/canvas/__tests__/dimensionLayout.test.js`. At the end, run `npm test && npm run lint` once: 732 + 1 = 733, lint clean. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 245 counter height row".
```

---
## Step 246 — Model: islands, the plan wall row

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.1.md §1 and §4. Step 245 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step.
- clearances.js: a group is an island when its footprint reaches inside a larger group (a corner inside a closed room, or bounding boxes overlapping an open one), even when part of it runs out past. `within` is replaced by boundsOf, boundsArea, reaches and a new islandGroups.
- wallFaceRow.js (new): wallFaceSegments(room, wall, side, settings) — the plan row of wing walls and, on the front, each door or window (outside casing to outside casing, or jamb), with the spaces between.

Files (only these):
- src/elevation/model/clearances.js (336) — replace 300–329 (from the doc comment above `within` to the end of islandGroups) with the SPEC block verbatim. Nothing else in the file.
- src/elevation/model/wallFaceRow.js — NEW, verbatim.
- src/elevation/model/__tests__/clearances.test.js — the new describe at the end, verbatim (+1).
- src/elevation/model/__tests__/wallFaceRow.test.js — NEW, verbatim (2 tests).

DO NOT touch index.js, any component or the store. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/clearances.test.js src/elevation/model/__tests__/wallFaceRow.test.js`. At the end, run `npm test && npm run lint` once: 733 + 3 = 736. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 246 islands past the room, plan wall row model".
```

---
## Step 247 — Screen: doors and windows in the plan wall row

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.1.md §5. Step 246 is in.
If `git status` shows uncommitted changes, stop and tell me.

PlanWallShape builds its wing wall rows from wallFaceSegments, so the front row also shows doors and windows, and the wall's length dimension moves out whenever that row exists. PlanCanvas passes settings to it.

Files (only these):
- src/elevation/plan/PlanWallShape.jsx (351) — imports (5, 7, 8); the settings prop; line 35 becomes the faceRows block; in landingRows the lines from `const sideView` to the last `segments.push` (78–91) become the SPEC's five lines. All verbatim. Nothing else.
- src/elevation/plan/PlanCanvas.jsx (1252) — `settings={settings}` on <PlanWallShape> (1015–1024). Nothing else.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end, run `npm test && npm run lint` once: still 736. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 247 doors and windows in the plan wall row".
```

**Check after 247 (by hand):**

1. **Hanging base chain.** On an inset base run, tick Hanging. The chain at the wall's edge reads toe kick 4 | 1 1/2 | opening | 1 1/2 | countertop, the same as without the tick. It no longer shows 4 3/4 and 3/4.
2. **Counter height.** Beside every base run's chain, between it and the wall height, there's a light blue 36" (floor to the top of the counter). It stays 36" with Hanging on. Change the countertop thickness: it follows. A tall-only or upper-only column has no counter height, and its rows sit where they did.
3. **Soffit.** Add a soffit over a base and upper run. Above the crown, the chain shows open space to the soffit's bottom, then the soffit to the ceiling. On a wall with a soffit and no cabinets, the chain shows floor to soffit, then soffit. A soffit off to the side of the column's runs doesn't split the chain.
4. **Doors and windows in plan.** On a wall with a door and a window, a row between the wall and its length reads: end → casing | casing to casing | → next casing | … → other end. A window with no casing measures its jamb. With a wing wall on the same wall, both are in the one row, in order. The length dimension sits outside the row.
5. **Island out past a U.** Stretch an island from inside a U out through its open side. Its dimensions to the U's walls stay, now centred on the part that's inside, and the end out past the U has none. Drag it all the way out of the U: they go.
