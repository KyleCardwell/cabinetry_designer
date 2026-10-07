# Round 42.1 — Codex Prompts, Steps 324–330 (band returns, face frame stiles, wall things)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo; from geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-42.1.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 324 | cabinetry_designer | Band ends against a touching run; toe kick side setbacks | 889 |
| 325 | cabinetry_designer | Face frame end stiles stay standard | 890 |
| 326 | cabinetry_designer_geometry | HLR: `opaque`, `outlined` | 25 |
| 327 | cabinetry_designer_geometry | Wall-thing kinds, `opaque`, `openEdges`, OPENINGS layer | 28 |
| 328 | cabinetry_designer | `wallParts`: wall end panels, doors and windows | 893 |
| 329 | cabinetry_designer | `wallParts`: soffits, recesses, projections, wing walls | 895 |
| 330 | cabinetry_designer | The payload carries `wallParts` | 895 |

The API doesn't change. Branches as in round 42: the designer on `feature/elevation-mvp`, geometry on `feature/drawing`. No new branches.

The SPEC's test values were read from the golden fixture with today's model and a reference build of these rules, and the geometry values were checked with shapely and ezdxf. If a test fails, fix the code, not the number, unless the number contradicts a SPEC rule. In that case stop and say so.

---

## Before step 324 (Kyle)

```bash
cd cabinetry_designer
git status                                   # clean, on feature/elevation-mvp
git add docs/elevation-mvp/SPEC-42.1.md docs/elevation-mvp/PROMPTS-42.1.md docs/DECISIONS.md
git commit -m "round 42.1 docs"
```

Geometry: `git status` clean on `feature/drawing`, `.venv/bin/python -m pytest` → 23 passed.

---

## Step 324 — designer: band ends against a touching run

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.1.md §1 and §2. Step 323 is in.
If `git status` shows uncommitted changes, stop and tell me.

Band ends are now worked out per band ('toeKick', 'countertop', 'topMold', 'crown') by bandEdge. Against a touching run that carries the same band, the deeper run's band returns as at a free end and the shallower one's meets it there; equal depths run straight through; a top dies into a taller run. A toe kick at a free side stops 1" from an end panel, else 1/4". Two new bandDepths settings. Write the helpers and the band closure as SPEC §2 gives them; replace bandEnd, bandStart, bandFinish and the depths const.

Files (only these):
- src/elevation/model/constants.js (132 lines): bandDepths as SPEC §2 (six keys, one per line)
- src/elevation/model/runBands.js (134): SPEC §2. Drop the joints.js import; add frontDepth from ./corners.js and isCountertop beside runTop
- src/elevation/model/__tests__/runBands.test.js (109): the five value changes in the SPEC §2 table, then append the two tests VERBATIM inside the describe
- src/elevation/model/__tests__/bandParts.test.js (60): the four value changes in the SPEC §2 table

What you need without opening them: frontDepth(run, settings) is the run's face depth from the wall face. run.ends[side].type is 'filler' | 'end_panel' | 'blind' | 'none'. runTop(wall, run, profile) → { kind, height }; isCountertop(kind) is stone or wood.
DO NOT touch bandParts.js, RunGroup.jsx or any other file. DO NOT open corners.js or tops.js. DO NOT grep the repo.

First change the tests and run `npx vitest run src/elevation/model/__tests__/runBands.test.js src/elevation/model/__tests__/bandParts.test.js`: the changed and new ones must fail. Iterate on those two files. At the end run `npm test && npm run lint` once: 887 + 2 = 889, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 324 Band returns between runs".
```

---

## Step 325 — designer: face frame end stiles stay standard

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.1.md §1 and §3. Step 324 is in.
If `git status` shows uncommitted changes, stop and tell me.

A face frame run with nothing flexible no longer rounds its boxes down and pushes the leftover into its end stiles. It falls through to the general branch like a European run: boxes equal to the 1/16", the last taking any odd sixteenth, with the widths-not-rounded warning. The flex branch (fillers / filler stiles) is untouched.

Files (only these):
- src/elevation/model/splitRun.js (638 lines): the four edits in SPEC §3, in splitRunLegacy only
- src/elevation/model/__tests__/faceFrameEnds.test.js (65), faceFrameDieIn.test.js (96), faceFrameEndsRoom.test.js (57), frameEnds.test.js (136), frameFixes.test.js (130): the replacements in SPEC §3, VERBATIM
- NEW src/elevation/model/__tests__/faceFrameStiles.test.js: VERBATIM from SPEC §3
- src/elevation/model/__tests__/__snapshots__/golden.test.js.snap: only via `-u`, see below

DO NOT touch frames.js, faceLayouts.js or any other source file. DO NOT open frames.js. DO NOT grep the repo.

First add the new test and make the test replacements, and run `npx vitest run src/elevation/model/__tests__/faceFrameStiles.test.js`: it must fail. Then change splitRun.js and run the six test files above until they pass. Then run `npx vitest run src/elevation/model/__tests__/golden.test.js`. The only snapshot difference allowed is G2's back-face panel run (2c8ab1e3…), now 0.75 → 78.5 (77.75 wide) instead of 0.875 → 78.375 (77.5). If that's all, update it with `npx vitest run src/elevation/model/__tests__/golden.test.js -u`; if anything else differs, stop and tell me. At the end `npm test && npm run lint` once: 889 + 1 = 890. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 325 Face frame stiles stay standard".
```

**Check after 325 (Kyle):** `npm run dev`. Your 32 7/8" G2 tall shows 1 3/4" stiles (beaded) and 1 1/2" (inset). The box goes 29 1/2" → 29 7/8", since each stile gives back 3/16". A run that can't round now shows the "widths not rounded" warning.

---

## Step 326 — geometry: outlines that hide nothing

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-42.1.md §1 and §4.
If `git status` shows uncommitted changes, stop and tell me.

HlrShape gains opaque: bool = True and outlined: bool = True, last. Only opaque shapes can hide others. A shape that isn't outlined draws only its lines (its polygon still hides, if opaque); a shape with nothing to draw gets ([], []).

Files (only these):
- src/projection/hlr.py (73 lines): SPEC §4
- tests/test_hlr.py (117): append the two SPEC §4 tests VERBATIM at the end

DO NOT touch src/drawing/, src/dxf/ or the other tests. No new dependencies.

First append the tests and run `.venv/bin/python -m pytest tests/test_hlr.py`: the two new ones must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 23 + 2 = 25 passed.

At most five lines of summary. Commit "round 42.1: step 326 Outlines that hide nothing".
```

---

## Step 327 — geometry: wall-thing kinds, opaque, openEdges

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-42.1.md §1 and §5. Step 326 is in.
If `git status` shows uncommitted changes, stop and tell me.

Parts can now be wall_end_panel (PANELS), opening and casing (new OPENINGS layer), soffit, recess, projection and wing_wall (WALLS). runId becomes optional. Any part can carry opaque (default true) and openEdges (sides of its rectangle not drawn). The elevation DXF passes opaque through, and a part with openEdges is drawn from its kept sides plus its lines (_edge_lines, as SPEC §5 gives it).

Files (only these):
- src/drawing/models.py (75 lines): the kind line, runId optional, opaque and openEdges after profileId
- src/drawing/elevation_dxf.py (83): KIND_LAYERS additions, _edge_lines VERBATIM, the three HlrShape arguments
- src/dxf/writer.py (104): "OPENINGS": (40, "CONTINUOUS") after MOLDINGS; nothing else
- NEW tests/fixtures/walls_payload.json: VERBATIM from SPEC §5
- NEW tests/test_elevation_walls.py: VERBATIM from SPEC §5 (3 tests)
- README.md (62): the Layers table rows and the one sentence from SPEC §5

DO NOT change src/projection/hlr.py, bundle.py, cli.py or any existing test. No new dependencies.

First add the fixture and tests and run `.venv/bin/python -m pytest tests/test_elevation_walls.py`: they must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 25 + 3 = 28 passed.

At most five lines of summary. Commit "round 42.1: step 327 Wall things in the DXF".
```

---

## Step 328 — designer: `wallParts`, wall end panels and openings

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.1.md §1 and §6. Step 325 is in.
If `git status` shows uncommitted changes, stop and tell me.

New pure model function wallParts(room, wall, side, settings): the wall's own parts on one face. This step: wall end panels (real parts, behind a face frame mitered over them) and each door or window as its casing then its opening (outlines, opaque: false). No runId on any of them. Write the file as SPEC §6 gives it.

Files (only these):
- NEW src/elevation/model/wallParts.js: VERBATIM from SPEC §6
- NEW src/elevation/model/__tests__/wallParts.test.js: VERBATIM from SPEC §6 (3 tests)
- src/elevation/model/index.js (401 lines): one line at the end: `export { wallParts } from './wallParts.js';`

DO NOT open or change wallEndPanels.js, openings.js, recesses.js, runScene.js or any component. DO NOT grep the repo.

First add the test and run it: it must fail. Iterate with `npx vitest run src/elevation/model/__tests__/wallParts.test.js`. At the end `npm test && npm run lint` once: 890 + 3 = 893, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 328 Wall parts: end panels and openings".
```

---

## Step 329 — designer: soffits, recesses, projections, wing walls

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.1.md §1 and §7. Step 328 is in.
If `git status` shows uncommitted changes, stop and tell me.

wallParts adds, after the openings: each soffit (open on a side where it runs flush into a wing wall), each recess (front 0, back −depth) or projection (back 0, front depth), then each wing wall (top and bottom drawn; its sides as lines that stop under a flush soffit). All outlines. Add the three loops as SPEC §7 gives them.

Files (only these):
- src/elevation/model/wallParts.js: SPEC §7, with its new imports (landings.js, recesses.js, soffits.js)
- src/elevation/model/__tests__/wallParts.test.js: append the two SPEC §7 tests VERBATIM inside the describe

DO NOT open landings.js, recesses.js, soffits.js or any component, and DO NOT change any other file or grep the repo.

First append the tests and run `npx vitest run src/elevation/model/__tests__/wallParts.test.js`: the two new ones must fail. Iterate on that file. At the end `npm test && npm run lint` once: 893 + 2 = 895, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 329 Wall parts: soffits, recesses, wing walls".
```

---

## Step 330 — designer: the payload carries the wall's parts

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.1.md §8. Step 329 is in.
If `git status` shows uncommitted changes, stop and tell me.

Each elevation's parts become [...elevationParts, ...bandParts, ...wallParts]. payloadVersion stays 1.

Files (only these):
- src/elevation/model/drawingPayload.js (50 lines): import wallParts from ./wallParts.js; the parts array; the doc comment line (SPEC §8)
- src/elevation/model/__tests__/drawingPayload.test.js (74): the import, and in the last test the title, counts [32, 26, 13, 13] and the wallParts line (SPEC §8)

DO NOT touch wallParts.js, ExportDxfButton.jsx, src/api/ or any other file. DO NOT grep the repo.

Run `npx vitest run src/elevation/model/__tests__/drawingPayload.test.js` while iterating. At the end `npm test && npm run lint && npm run build` once: 895, golden snapshot unchanged.

At most five lines of summary. Commit "elevation-mvp: step 330 Wall parts in the payload".
```

---

## Running it (Kyle, after 330)

Geometry on `feature/drawing` with 326–327 in. Start the API and designer as in round 42.

**End-to-end check:**

- **G1 A:** the window's casing and opening on OPENINGS. The tall's toe kick stops 1" short of its right end panel, and the base's toe kick runs on to meet it.
- **G1 C / D (island):** both wall end panels on PANELS, with the countertop 3/4" past them.
- **G2 A:** the door with its casing. The tall's crown returns 3" past its right side over the upper, and the upper's crown starts there.
- **G2 B:** the peninsula's wall end panel dashed where the frame covers it.
- **G3:** the soffit and the wing wall on WALLS.
- **G5:** both recesses on WALLS, with R1's left edge dashed behind the face run's cabinet. The face run's countertop returns 3/4" into R1, and the recess run's starts there.

Expected for now (42.2): corner profiles and returns, and the blind box extension into the G1 B corner still solid.

If anything looks wrong, export the room, keep the zip (its `payload.json` shows what was sent), and bring it back.
