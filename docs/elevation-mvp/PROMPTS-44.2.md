# Round 44.2 — Codex Prompt, Step 370 (plan layout fix)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. One step, in **cabinetry_designer**. Geometry and the API don't change.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 370 | cabinetry_designer | `planParts` lays each run out on its resolved wall face | 952 |

---

## Before step 370 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on feature/elevation-mvp; only the two docs below changed
npm test                                     # 951 passed
git add docs/elevation-mvp/SPEC-44.2.md docs/elevation-mvp/PROMPTS-44.2.md docs/DECISIONS.md
git commit -m "round 44.2 docs"
```

---

## Step 370 — plan runs lay out as the elevation does

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-44.2.md. Step 369 is in.
If `git status` shows uncommitted changes, stop and tell me.

Bug: planParts lays runs out on the stored wall, which has no `length`, so layoutRun's pinTargetsForRun(run, wall, wall.length, ...) loses pins to openings and wall ends (G1 wall 1's base comes out 23/36/23/23 instead of 17 3/4/36/25 1/2/25 1/2).

In src/elevation/model/planParts.js, in the run loop only (`for (const wall of room.walls) { for (const run of wall.runs ?? []) ...`): rename the loop's wall to `stored`; per run, side = wallSideOf(run); frame = wallSideFrame(room, stored, side) as now; wall = resolveWall(room, stored, side) (import { resolveWall } from './room.js', placed after the recesses.js import). layoutRun, runFaceLayouts and planRunPieces take that `wall`. Add the one-line comment from the SPEC. Nothing else in the file changes.

Files (only these):
- src/elevation/model/planParts.js (134 lines): the run loop and the import
- src/elevation/model/__tests__/planParts.test.js (117): add `import { layoutRun } from '../faceLayouts.js';` after the planParts import; `import { syncRoom } from '../room.js';` → `import { resolveWall, syncRoom } from '../room.js';`; the G1 row of the counts test → the SPEC's row; append the SPEC's describe at the end, VERBATIM. No other change.
- src/elevation/model/__tests__/drawingPayload.test.js (113): line 110, 77 → 76. No other change.

DO NOT change faceLayouts.js, room.js, PlanRunFootprint.jsx or any other file or test. DO NOT grep the repo.

First change the tests and run `npx vitest run src/elevation/model/__tests__/planParts.test.js src/elevation/model/__tests__/drawingPayload.test.js`: the new test, the counts test and the payload plan test must fail. Iterate on those files. At the end `npm test && npm run lint && npm run build` once: 951 + 1 = 952, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 370 Plan runs lay out as the elevation does".
```

---

## Running it (Kyle, after 370)

Build the designer, then *Export DXF* on your edited G1 and check wall 1's base in `plan.dxf` (17 3/4", 36", 25 1/2", 25 1/2", the 36" centred on the window).
