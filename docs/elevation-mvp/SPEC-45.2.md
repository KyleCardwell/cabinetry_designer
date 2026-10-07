# Round 45.2 — SPEC: run depths and clearances in the plan DXF

Steps 377–378, designer only. Geometry and the API don't change (geometry draws any `plan.dimensions` since 371).
Drawing rounds: 45 wall dimensions in plan → 45.1 elevation markers and labels in plan → **45.2 run depths and clearances in plan** → sheet layout.

**Done when:**
- Every run's depth is dimensioned in `plan.dxf` as the plan view does it: from the plane the run sits on (wall face or recess back) to its front, across the run, bases at the middle, uppers 3/8" (paper) left of it, talls 3/8" right. On its own line, no extension lines; text that doesn't fit beside the line, toward the lane.
- Island and aisle clearances (`planClearances`, SPEC-36.3) are dimensioned on their own lines, as on the canvas.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **377** | designer | `planDimensions` adds each run's depth | 963 → **966** |
| **378** | designer | `planDimensions` adds the clearances | **968** |

Codex writes the code (PROMPT-CONVENTIONS rule 10). The test values were checked against a throwaway build of these rules (designer 968, lint 0 errors, build OK; geometry 63; golden snapshot unchanged). That build isn't in this SPEC. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (Kyle, 2026-10-06)

- **Depths and clearances in the DXF (Kyle: both).**
- **Depth (as `PlanRunFootprint` + `plan/depthDimension.js`, in paper units).** Per run on every wall: `frame = wallSideFrame(room, wall, wallSideOf(run))`; `back = run._plane?.offset ?? 0` (a recess back); `depth = frontDepth(run, settings) − back`. Lane: base 0, upper −1, tall +1 (others 0). Along the run, `x` = its middle + lane × 3/8" × plot scale, kept at least `min(width / 2, 1/4" × plot scale)` inside each end. The dimension runs from `(x, back)` to `(x, back + depth)` in the face's frame, `offset: 0` (geometry leaves out extension lines). Text that doesn't fit moves along the wall (`frame.r`), toward the lane (−r for uppers, +r otherwise), as `placeLabels` moves it. Row `'depth'`, kind `'depth'`. A run with no width or depth sends nothing.
  - The canvas pops a label out with a short leader; the DXF moves it, no leader (SPEC-43.1's rule).
- **Clearance.** Each `{ kind, from, to, length }` of `planClearances(room, settings)` with a length: from `from` to `to`, `offset: 0`, text `formatInches(length)`; text that doesn't fit moves to start→end's left in canvas terms (`(−u.y, u.x)`). Row `'clearance'`, kind the clearance's (`island`, `aisle`).
- **Order.** After every wall's rows (round 45): each wall's runs' depths (walls in `room.walls` order, runs in `wall.runs` order), then the clearances in `planClearances` order.
- **Same record, same rules.** Both go through round 45's `rowRecords` with one segment `{ start: 0, end: length }` and `at = 0`, so they're readable (left to right or up) and moved text uses the same levels. `offset` is `sign × 0 + 0`: never −0.
- Overlaps the canvas has, the DXF has too: stacked runs share a lane (G6's two uppers), and a marker can sit on a clearance (G1's C on the island's 36"). Say if you want either moved.

---

## §2 Step 377 — designer: run depths

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/planDimensions.js` | 103 | depth records after the wall rows |
| `src/elevation/model/__tests__/planDimensions.test.js` | 87 | one `describe` appended, verbatim |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 129 | the SPEC-45 test: `toHaveLength(7)` → `toHaveLength(14)` |

**Contract.**
- Exported constants: `DEPTH_LANE_SHIFT = 0.375` and `DEPTH_MARGIN = 0.25` (paper inches), and a private `DEPTH_LANES` map `{ [CABINET_TYPE_IDS.BASE]: 0, [UPPER]: -1, [TALL]: 1 }` (as `plan/depthDimension.js`; the model doesn't import from `plan/`).
- Private `depthRecords(room, wall, run, settings)` → records, as §1: `base(t) = elevationToPlan(frame, x, back + t)`, `outward = frame.r × side` (side −1 for lane < 0, else +1), `rowRecords('depth', [{ start: 0, end: depth, kind: 'depth' }], base, outward, 0, scale).records`.
- `planDimensions`: after the walls loop, for each wall in `room.walls`, each run in `wall.runs ?? []`, push its `depthRecords`.
- Doc comment adds: then each run's depth across it, by type lane (SPEC-45.2).

**Reuse:** `CABINET_TYPE_IDS` (`./constants.js`), `elevationToPlan` (`./geometry.js`), and what the file already imports.

**Don't touch:** the walls loop, `markerReach`, `plan/depthDimension.js`, `PlanRunFootprint.jsx`, `drawingPayload.js`, other tests.

**Tests.** Append at the end of `planDimensions.test.js`, verbatim:

```js

describe('SPEC-45.2 run depths in plan', () => {
  const depths = (room) => dimensions(room).filter(({ row }) => row === 'depth');
  const depth = (start, end, text, textAt) => ({
    row: 'depth', kind: 'depth', start, end, offset: 0, text, ...(textAt ? { textAt } : {}),
  });

  it('dimensions every run\'s depth on its own line: bases centred, uppers 3/8" (paper) left, talls right (G1)', () => {
    expect(depths(stored('G1 Euro kitchen'))).toEqual([
      depth([-60, -60], [-34.125, -60], '25 7/8"'),
      depth([-60, 2.5625], [-35.125, 2.5625], '24 7/8"'),
      depth([-60, 38.8125], [-47.125, 38.8125], '12 7/8"'),
      depth([-2.5625, 71.125], [-2.5625, 84], '12 7/8"'),
      depth([12.4375, 59.125], [12.4375, 84], '24 7/8"'),
      depth([55.25, -3.875], [55.25, 21], '24 7/8"'),
      depth([55.25, -16.75], [55.25, -3.875], '12 7/8"'),
    ]);
  });

  it('moves text that doesn\'t fit beside the line, toward its lane (G2 upper)', () => {
    expect(depths(stored('G2 Face frame kitchen'))[2])
      .toEqual(depth([29.25, 2.1875], [29.25, 15], '12 13/16"', [22.875, 8.59375]));
  });

  it('measures a recessed run from the recess back (G5)', () => {
    expect(depths(stored('G5 Recess room'))).toEqual([
      depth([-88.875, -9.875], [-88.875, 15], '24 7/8"'),
      depth([-48.875, 2.125], [-48.875, 27], '24 7/8"'),
      depth([54, 17.125], [54, 39], '21 7/8"'),
    ]);
  });
});
```

and in `drawingPayload.test.js`, the SPEC-45 test's `expect(plan.dimensions).toHaveLength(7);` → `expect(plan.dimensions).toHaveLength(14);`.

What the numbers are: G1's tall is 30" wide at the left of wall 1 (y −84 to −54); its lane puts the line 9" right of its middle, at y −60, 25 7/8" from the wall face (x −60 → −34.125). The base on the same wall is centred (y 2.5625). G2's upper is 12 13/16" deep; its label (9 characters, 10 1/8" wide, plus a 1 1/2" gap each side) doesn't fit, so it moves 6 3/8" toward the upper lane (x 29.25 → 22.875), centred on the line (y 8.59375). G5's middle run sits in R1, 12" back: its depth is from y 27 (the recess back) to 2 1/8.

**Count:** 963 + 3 = **966**. Golden snapshot unchanged.

---

## §3 Step 378 — designer: clearances

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/planDimensions.js` | 131 | clearance records last |
| `src/elevation/model/__tests__/planDimensions.test.js` | 119 | one `describe` appended, verbatim |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 129 | `toHaveLength(14)` → `toHaveLength(17)` |

**Contract.** `planDimensions`: after the depths, for each `{ kind, from, to, length }` of `planClearances(room, settings)` with `length > 1e-6`: `unit = (to − from) / length`, `base(t) = from + unit × t`, `outward = (−unit.y, unit.x)`, push `rowRecords('clearance', [{ start: 0, end: length, kind }], base, outward, 0, scale).records`. Doc comment adds: then the island and aisle clearances (SPEC-45.2).

**Reuse:** `planClearances` (`./clearances.js`).

**Don't touch:** `clearances.js`, `PlanClearances.jsx`, `PlanCanvas.jsx`, other tests.

**Tests.** Append at the end of `planDimensions.test.js`, verbatim:

```js

describe('SPEC-45.2 clearances in plan', () => {
  const clearances = (room) => dimensions(room).filter(({ row }) => row === 'clearance');

  it('dimensions each island and aisle gap on its own line, after the depths (G1)', () => {
    const all = dimensions(stored('G1 Euro kitchen'));
    expect(all.slice(-3)).toEqual(clearances(stored('G1 Euro kitchen')));
    expect(clearances(stored('G1 Euro kitchen'))).toEqual([
      { row: 'clearance', kind: 'island', start: [62.25, 21], end: [62.25, 57], offset: 0, text: '36"' },
      { row: 'clearance', kind: 'island', start: [-35.125, 2.125], end: [9.5, 2.125], offset: 0, text: '44 5/8"' },
      { row: 'clearance', kind: 'aisle', start: [35.125, 21], end: [35.125, 59.125], offset: 0, text: '38 1/8"' },
    ]);
  });

  it('has none where the canvas shows none (G2–G6)', () => {
    expect(document.rooms.slice(1).map((room) => clearances(room).length)).toEqual([0, 0, 0, 0, 0]);
  });
});
```

and in `drawingPayload.test.js`, `toHaveLength(14)` → `toHaveLength(17)`.

What the numbers are: G1's three clearances exactly as the canvas finds them (`planClearances`), flipped to y up; every label fits on its line. No other golden room has an island or facing runs.

**Count:** 966 + 2 = **968**. Gate: `npm test && npm run lint && npm run build`.

---

## End-to-end check (Kyle)

The designer built after 378 (geometry as after 374).

- **G1** — every run's depth on its own line: the tall's 25 7/8" toward the right of the run, the bases' 24 7/8" in the middle, the uppers' 12 7/8" to the left; the island's front and back runs each dimensioned. The 36", 44 5/8" and 38 1/8" clearances as on the canvas. No extension lines on any of them.
- **G2** — the 12 13/16" upper's text beside its line, toward the upper lane.
- **G5** — the run in R1 measured from the recess back (24 7/8").
- **G6** — the two uppers on the stacked run share a lane (as on the canvas).

**Known for now:**
- G1's marker C sits on the island's 36" clearance, as on the canvas. Say if you want markers to move off clearances.
- Next: sheet layout (PLATFORM-PLAN Phase 3), then the doors & profiles rounds (46+).
