# Round 42.3 — Codex Prompts, Steps 339–341 (bands meet corner returns, denser hatch)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-42.3.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 339 | cabinetry_designer_geometry | `HATCH_SCALE` 24 → 8 | 32 |
| 340 | cabinetry_designer | Move `bandDepths` / `hasToeKick` into `bandDepths.js` | 908 |
| 341 | cabinetry_designer | `cornerBandEdge`: bands meet a corner return's | 912 |

The API doesn't change. Branches as before: the designer on `feature/elevation-mvp`, geometry on `feature/drawing`. No new branches.

The SPEC's test values come from the golden fixture with today's model and a reference build of these rules. If a test fails, fix the code, not the number, unless the number contradicts a SPEC rule. In that case, stop and say so.

---

## Before step 339 (Kyle)

```bash
cd cabinetry_designer
git status                                   # clean, on feature/elevation-mvp
git add docs/elevation-mvp/SPEC-42.3.md docs/elevation-mvp/PROMPTS-42.3.md docs/DECISIONS.md
git commit -m "round 42.3 docs"
```

Geometry: `git status` clean on `feature/drawing`, and `.venv/bin/python -m pytest` → 32 passed.

---

## Step 339 — geometry: denser section hatch

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-42.3.md §1 and §2. Step 333 is in.
If `git status` shows uncommitted changes, stop and tell me.

Section hatching (ANSI31 on SECTIONS) goes from scale 24 (lines 3" apart) to scale 8 (1" apart). One constant and its comment, plus one test line.

Files (only these):
- src/drawing/elevation_dxf.py (140 lines): the comment line above HATCH_SCALE and HATCH_SCALE = 8, VERBATIM from SPEC §2
- tests/test_elevation_corners.py (81): line 51, both 24s → 8

DO NOT change anything else: no other constant, no hatch code, no README. No new dependencies.

Change the test first and run `.venv/bin/python -m pytest tests/test_elevation_corners.py`: test_sections_are_outlined_and_hatched_on_sections must fail. Then the constant. At the end `.venv/bin/python -m pytest` once: 32 passed.

At most three lines of summary. Commit "round 42.3: step 339 Denser section hatch".
```

---

## Step 340 — designer: `bandDepths.js`

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.3.md §1 and §3. Step 338 is in.
If `git status` shows uncommitted changes, stop and tell me.

A pure move with no behaviour change. bandDepths and hasToeKick move out of runBands.js into a new bandDepths.js, so runSide.js no longer imports runBands.js. Step 341 has runBands import cornerShapes, and this breaks the cycle that would make. runBands.js re-exports both, so every other importer stays as it is.

Files (only these):
- NEW src/elevation/model/bandDepths.js: VERBATIM from SPEC §3
- src/elevation/model/runBands.js (158 lines): delete bandDepths (lines 8–11, with its comment) and hasToeKick (lines 15–18); drop the constants.js import (nothing else uses it); add `import { bandDepths, hasToeKick } from './bandDepths.js';` after the bottoms.js import; add `export { bandDepths, hasToeKick } from './bandDepths.js';` before `const EPSILON`
- src/elevation/model/runSide.js (42): its runBands.js import → './bandDepths.js'

DO NOT change index.js, bandParts.js, any test or any other file: they import bandDepths from runBands.js, which still works. DO NOT grep the repo.

No new tests. At the end `npm test && npm run lint` once: 908, golden snapshot unchanged. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 340 bandDepths.js".
```

---

## Step 341 — designer: a band at a corner meets the return's

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.3.md §1 and §4. Step 340 is in.
If `git status` shows uncommitted changes, stop and tell me.

At an end anchored into an inside corner (anchors[side] === true) or to a wing wall (anchors[side].to === 'wall'), a run's band meets the return from the other wall. If a cornerShapes return at that end has the same band kind at the same z (toe_kick, countertop, top_mold, crown), this run's band ends where the return's band does: the right edge of the return's part at a left end, its left edge at a right end. With no match, today's bandEdge decides. A blind panel still comes first. New file cornerBands.js as SPEC §4 gives it, and runBands' band helper checks cornerBandEdge between panelStart/panelEnd and bandEdge.

Files (only these):
- NEW src/elevation/model/cornerBands.js: VERBATIM from SPEC §4
- src/elevation/model/runBands.js (~155 lines after 340): the cornerBands.js import, and the band helper replaced with the SPEC §4 block, VERBATIM. Nothing else in the file
- src/elevation/model/__tests__/runBands.test.js (141): the four replacements in SPEC §4 (lines 37–42, 53–54, 132–136, 139)
- src/elevation/model/__tests__/bandParts.test.js (60): the four rows in SPEC §4
- NEW src/elevation/model/__tests__/cornerBands.test.js: VERBATIM from SPEC §4 (4 tests)

What you need without opening them: cornerShapes(room, wall, side, settings) (cornerParts.js) returns shapes { key, kind: 'return' | 'profile', wallId, runId?, soffitId?, parts }. Return keys start `left:` / `right:` at a corner and `landing:${wallId}:${side}:` at a wing wall. Parts are { id, kind, runId, x, z, width, height, back, front, ... } in this face's elevation coordinates. runBands' `wall` is the resolved wall face (it has .side).
DO NOT open or change cornerParts.js, runSide.js, corners.js, bandParts.js, RunGroup.jsx, elevationParts.js or any other file. DO NOT grep the repo.

First add the new test and the test changes, and run `npx vitest run src/elevation/model/__tests__/cornerBands.test.js src/elevation/model/__tests__/runBands.test.js src/elevation/model/__tests__/bandParts.test.js`: the new and changed ones must fail. Iterate on those three files. At the end `npm test && npm run lint` once: 908 + 4 = 912, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 341 Bands meet corner returns".
```

---

## Running it (Kyle, after 341)

`npm run build` once in the designer. Then start the API and designer as in round 42, and run the end-to-end check at the end of the SPEC: the canvas on G1 A/B and G2, then *Export DXF* on G1.

If anything looks wrong, export the room, keep the zip (its `payload.json` shows what was sent), and bring it back.
