# Round 45.2 — Codex Prompts, Steps 377–378 (run depths and clearances in the plan DXF)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Both steps are in **cabinetry_designer**; geometry and the API don't change.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 377 | cabinetry_designer | `planDimensions` adds each run's depth | 966 |
| 378 | cabinetry_designer | `planDimensions` adds the clearances | 968 |

Rounds 45 and 45.1 first.

---

## Step 377 — designer: run depths

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-45.2.md §1 and §2. Step 376 is in.
If `git status` shows uncommitted changes, stop and tell me.

planDimensions also dimensions every run's depth, by type lane, on its own line.
In src/elevation/model/planDimensions.js:
- export DEPTH_LANE_SHIFT = 0.375 and DEPTH_MARGIN = 0.25 (paper inches); private DEPTH_LANES = { [CABINET_TYPE_IDS.BASE]: 0, [CABINET_TYPE_IDS.UPPER]: -1, [CABINET_TYPE_IDS.TALL]: 1 }.
- private depthRecords(room, wall, run, settings): frame = wallSideFrame(room, wall, wallSideOf(run)); back = run._plane?.offset ?? 0; depth = frontDepth(run, settings) - back; [] when depth or run.width ≤ 1e-6; lane = DEPTH_LANES[run.cabinetTypeId] ?? 0; margin = min(run.width / 2, DEPTH_MARGIN * scale); x = run's middle + lane * DEPTH_LANE_SHIFT * scale, clamped to [run.x + margin, run.x + run.width - margin]; side = lane < 0 ? -1 : 1; base(t) = elevationToPlan(frame, x, back + t); outward = frame.r * side; return rowRecords('depth', [{ start: 0, end: depth, kind: 'depth' }], base, outward, 0, scale).records.
- planDimensions: after the walls loop, for each wall in room.walls and each run in wall.runs ?? [], push its depthRecords. Doc comment adds the depths (SPEC-45.2).
- Imports: CABINET_TYPE_IDS from './constants.js'; elevationToPlan joins wallFrame from './geometry.js'.

Files (only these):
- src/elevation/model/planDimensions.js (103 lines)
- src/elevation/model/__tests__/planDimensions.test.js (87): append the SPEC §2 describe VERBATIM at the end (3 tests)
- src/elevation/model/__tests__/drawingPayload.test.js (129): in the SPEC-45 test, `toHaveLength(7)` → `toHaveLength(14)`

DO NOT change the walls loop, markerReach, plan/depthDimension.js, PlanRunFootprint.jsx, drawingPayload.js or any other test. DO NOT grep the repo.

First change the tests and run `npx vitest run src/elevation/model/__tests__/planDimensions.test.js src/elevation/model/__tests__/drawingPayload.test.js`: the 3 new tests and the SPEC-45 payload test must fail. Iterate on those files. At the end `npm test && npm run lint && npm run build` once: 963 + 3 = 966, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 377 Run depths in plan".
```

---

## Step 378 — designer: clearances

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-45.2.md §1 and §3. Step 377 is in.
If `git status` shows uncommitted changes, stop and tell me.

planDimensions also dimensions the island and aisle clearances.
In src/elevation/model/planDimensions.js, after the depths: for each { kind, from, to, length } of planClearances(room, settings) with length > 1e-6: unit = (to - from) / length; base(t) = from + unit * t; outward = { x: -unit.y, y: unit.x }; push rowRecords('clearance', [{ start: 0, end: length, kind }], base, outward, 0, scale).records. Import planClearances from './clearances.js'. Doc comment adds the clearances (SPEC-45.2).

Files (only these):
- src/elevation/model/planDimensions.js (131 lines)
- src/elevation/model/__tests__/planDimensions.test.js (119): append the SPEC §3 describe VERBATIM at the end (2 tests)
- src/elevation/model/__tests__/drawingPayload.test.js (129): `toHaveLength(14)` → `toHaveLength(17)`

What you need without opening it: planClearances(room, settings) → [{ kind: 'island' | 'aisle', from: {x, y}, to: {x, y}, length }] in canvas plan coordinates.
DO NOT change clearances.js, PlanClearances.jsx, PlanCanvas.jsx or any other test. DO NOT grep the repo.

First change the tests and run `npx vitest run src/elevation/model/__tests__/planDimensions.test.js src/elevation/model/__tests__/drawingPayload.test.js`: the first new test and the SPEC-45 payload test must fail (the "has none" test passes either way). Iterate on those files. At the end `npm test && npm run lint && npm run build` once: 966 + 2 = 968, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 378 Clearances in plan".
```

---

## Running it (Kyle, after 378)

The designer built after 378, geometry as after 374. Run the SPEC's end-to-end check on G1, G2, G5 and G6.
