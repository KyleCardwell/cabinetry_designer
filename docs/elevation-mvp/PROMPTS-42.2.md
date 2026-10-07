# Round 42.2 — Codex Prompts, Steps 331–338 (angled walls, corner returns, profiles)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-42.2.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 331 | cabinetry_designer | Plan walls: an angled wall gives | 900 |
| 332 | cabinetry_designer_geometry | `visible_regions` | 29 |
| 333 | cabinetry_designer_geometry | `section` / `profile` kinds, hatching, SECTIONS layer | 32 |
| 334 | cabinetry_designer | `runSide` | 903 |
| 335 | cabinetry_designer | `cornerShapes` / `cornerParts`: returns | 906 |
| 336 | cabinetry_designer | `cornerShapes`: profiles | 908 |
| 337 | cabinetry_designer | The payload carries `cornerParts` | 908 |
| 338 | cabinetry_designer | Canvas draws returns and profiles from `cornerShapes` | 908 |

The API doesn't change. Branches as before: the designer on `feature/elevation-mvp`, geometry on `feature/drawing`. No new branches.

The SPEC's test values come from the golden fixture with today's model and a reference build of these rules. The geometry values were checked with shapely and ezdxf. If a test fails, fix the code, not the number, unless the number contradicts a SPEC rule. In that case, stop and say so.

---

## Before step 331 (Kyle)

```bash
cd cabinetry_designer
git status                                   # clean, on feature/elevation-mvp
git add docs/elevation-mvp/SPEC-42.2.md docs/elevation-mvp/PROMPTS-42.2.md docs/DECISIONS.md
git commit -m "round 42.2 docs"
```

Geometry: `git status` clean on `feature/drawing`, and `.venv/bin/python -m pytest` → 28 passed.

---

## Step 331 — designer: an angled wall gives

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.2.md §1 and §2. Step 330 is in.
If `git status` shows uncommitted changes, stop and tell me.

In plan, a wall that's neither horizontal nor vertical (angled) gives: when a neighbour is typed (setWallLength) or dragged (moveWallPerpendicular), only their shared corner moves, so the angled wall changes angle and length and nothing past it moves. Square neighbours keep their angle as today. A typed or dragged wall keeps its own angle (setWallLength passes keepAngle: [wallId] when it moves a square neighbour).

Files (only these):
- src/elevation/plan/wallOps.js (247 lines): ORTHO_EPSILON, isAngledWall (exported) and wallsHold as SPEC §2; moveWallPerpendicular's keepAngle option, angled branch and wallsHold check; setWallLength's angled branch and keepAngle; the two JSDoc changes
- src/elevation/plan/__tests__/wallOps.test.js (199): test 9's title and last two expects (SPEC §2)
- src/elevation/plan/__tests__/wallMove.test.js (141): test 14's title and its three expects (SPEC §2)
- NEW src/elevation/plan/__tests__/angledWalls.test.js: VERBATIM from SPEC §2 (5 tests)

What you need without opening them: wallFrame(room, wall) → { length, d, n, r, leftEndpoint, rightEndpoint }. lineIntersection(p, d, q, e) returns a point or null. The helpers cloneWalls, wallById, setEndpoint, endpointPoint and moveConnectedEndpoint already live in wallOps.js.
DO NOT touch store/slices/walls.js, usePlanWallEdits.js or any other file: their calls don't change. DO NOT grep the repo.

First add the new test file and the test changes, and run `npx vitest run src/elevation/plan/__tests__/angledWalls.test.js src/elevation/plan/__tests__/wallOps.test.js src/elevation/plan/__tests__/wallMove.test.js`: the new and changed ones must fail. Iterate on those three files. At the end run `npm test && npm run lint` once: 895 + 5 = 900, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 331 Angled walls give".
```

**Check after 331 (Kyle):** `npm run dev`. Open your 5-wall room and run the plan checks in the SPEC's end-to-end section.

---

## Step 332 — geometry: `visible_regions`

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-42.2.md §1 and §3.
If `git status` shows uncommitted changes, stop and tell me.

New function visible_regions(shapes, ids): for each shape whose id is in ids, its polygon minus every nearer opaque shape's polygon (front > its front + EPSILON). Write it as SPEC §3 gives it.

Files (only these):
- src/projection/hlr.py (78 lines): visible_regions above hidden_line_removal, VERBATIM
- tests/test_hlr.py (141): the import line, and append the SPEC §3 test VERBATIM at the end

DO NOT change hidden_line_removal, src/drawing/, src/dxf/ or any other test. No new dependencies.

First append the test and run `.venv/bin/python -m pytest tests/test_hlr.py`: the new one must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 28 + 1 = 29 passed.

At most five lines of summary. Commit "round 42.2: step 332 Visible regions".
```

---

## Step 333 — geometry: `section` and `profile` kinds, hatching

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-42.2.md §1 and §4. Step 332 is in.
If `git status` shows uncommitted changes, stop and tell me.

Two new part kinds. A section (a neighbour cut where it meets this wall face) goes on a new SECTIONS layer, outlined and hatched with ANSI31 at scale 24, but only where no nearer opaque part covers it (visible_regions). A profile (a neighbour seen from the side) goes on CABINETS. Hidden-line removal treats both like any other part.

Files (only these):
- src/drawing/models.py (78 lines): add "section", "profile" to PayloadPart.kind
- src/dxf/writer.py (105): "SECTIONS": (8, "CONTINUOUS") after OPENINGS; nothing else
- src/drawing/elevation_dxf.py (107): the imports, KIND_LAYERS additions, HATCHED and HATCH_SCALE, _polygons and _add_hatch VERBATIM, and the hatch loop after the line-writing loop (SPEC §4)
- NEW tests/fixtures/corners_payload.json: VERBATIM from SPEC §4
- NEW tests/test_elevation_corners.py: VERBATIM from SPEC §4 (3 tests)
- README.md (66): the Layers table rows and the one sentence from SPEC §4

DO NOT change src/projection/hlr.py, bundle.py, cli.py or any existing test. No new dependencies.

First add the fixture and tests and run `.venv/bin/python -m pytest tests/test_elevation_corners.py`: they must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 29 + 3 = 32 passed.

At most five lines of summary. Commit "round 42.2: step 333 Sections and profiles in the DXF".
```

---

## Step 334 — designer: `runSide`

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.2.md §1 and §5. Step 331 is in.
If `git status` shows uncommitted changes, stop and tell me.

New pure model function runSide(room, wall, run, settings): a run seen from its side, as pieces { piece, z, height, back, front } with depths from its wall face: toe_kick, box, faces, then countertop or top_mold and crown. The top mold stops under the crown. Write the file as SPEC §5 gives it.

Files (only these):
- src/elevation/model/runBands.js (158 lines): `function hasToeKick` → `export function hasToeKick`; nothing else
- NEW src/elevation/model/runSide.js: VERBATIM from SPEC §5
- NEW src/elevation/model/__tests__/runSide.test.js: VERBATIM from SPEC §5 (3 tests)
- src/elevation/model/index.js (402): one line at the end: `export { runSide } from './runSide.js';`

DO NOT open corners.js, tops.js or profile.js, and DO NOT change any other file. DO NOT grep the repo.

First add the test and run it: it must fail. Iterate with `npx vitest run src/elevation/model/__tests__/runSide.test.js`. At the end `npm test && npm run lint` once: 900 + 3 = 903, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 334 A run seen from its side".
```

---

## Step 335 — designer: `cornerShapes` / `cornerParts`, returns

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.2.md §1 and §6. Step 334 is in.
If `git status` shows uncommitted changes, stop and tell me.

New pure model functions cornerShapes(room, wall, side, settings) and cornerParts (its parts flattened). This step does the returns. Runs on the next wall anchored into this face's inside corner, and runs on a wing wall anchored into the host face, are cut where they meet this face. Their box and faces become `section` parts and their bands keep their kinds with opaque: false. Soffits that die into the corner (soffitReturns) are one section each. Profiles come in step 336. Write the file as SPEC §6 gives it, ending in `return shapes;`.

Files (only these):
- NEW src/elevation/model/cornerParts.js: VERBATIM from SPEC §6
- NEW src/elevation/model/__tests__/cornerParts.test.js: VERBATIM from SPEC §6 (3 tests)
- src/elevation/model/index.js: one line at the end: `export { cornerParts, cornerShapes } from './cornerParts.js';`

DO NOT open or change corners.js, landings.js, soffits.js, NeighborReturns.jsx or any other file. DO NOT grep the repo.

First add the test and run it: it must fail. Iterate with `npx vitest run src/elevation/model/__tests__/cornerParts.test.js`. At the end `npm test && npm run lint` once: 903 + 3 = 906, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 335 Corner returns".
```

---

## Step 336 — designer: profiles past the wall's ends

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.2.md §1 and §7. Step 335 is in.
If `git status` shows uncommitted changes, stop and tell me.

cornerShapes adds profiles after the returns. Runs on a connected wall that reach past this face's ends are seen from the side: each runSide piece is projected and clipped to beyond each end, box and faces become `profile` parts, and bands keep their kinds. Runs in the neighbour's recess are skipped. Replace `return shapes;` with the block SPEC §7 gives.

Files (only these):
- src/elevation/model/cornerParts.js: the two import additions and the SPEC §7 block, VERBATIM
- NEW src/elevation/model/__tests__/cornerProfiles.test.js: VERBATIM from SPEC §7 (2 tests)

DO NOT open or change neighborProfiles.js, dimensions.js, wallExtent.js or any other file. DO NOT grep the repo.

First add the test and run it: it must fail. Iterate with `npx vitest run src/elevation/model/__tests__/cornerProfiles.test.js src/elevation/model/__tests__/cornerParts.test.js`. At the end `npm test && npm run lint` once: 906 + 2 = 908, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 336 Neighbour profiles".
```

---

## Step 337 — designer: the payload carries the neighbours

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.2.md §8. Step 336 is in.
If `git status` shows uncommitted changes, stop and tell me.

Each elevation's parts become [...elevationParts, ...bandParts, ...wallParts, ...cornerParts]. payloadVersion stays 1.

Files (only these):
- src/elevation/model/drawingPayload.js (52 lines): import cornerParts from ./cornerParts.js; the parts array; the doc comment line (SPEC §8)
- src/elevation/model/__tests__/drawingPayload.test.js (76): the import, and in the last test the title, counts [40, 34, 13, 13] and the cornerParts line (SPEC §8)

DO NOT touch cornerParts.js, ExportDxfButton.jsx, src/api/ or any other file. DO NOT grep the repo.

Run `npx vitest run src/elevation/model/__tests__/drawingPayload.test.js` while iterating. At the end `npm test && npm run lint` once: 908, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 337 Neighbours in the payload".
```

---

## Step 338 — designer: the canvas draws from `cornerShapes`

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.2.md §9. Step 337 is in.
If `git status` shows uncommitted changes, stop and tell me.

NeighborReturns draws each return from cornerShapes: section parts filled and hatched, band parts outlined, and the wall's label in the box. It keeps drawing each wing wall's outline from landingsOn. NeighborProfiles draws each profile's parts from cornerShapes. Replace both files with the SPEC §9 versions.

Files (only these):
- src/elevation/components/NeighborReturns.jsx (166 lines): replace with SPEC §9, VERBATIM
- src/elevation/components/NeighborProfiles.jsx (31): replace with SPEC §9, VERBATIM

DO NOT touch ElevationCanvas.jsx (it already passes room, wall, settings and transform), Hatch.jsx, neighborProfiles.js or any model file. DO NOT grep the repo.

No new tests. At the end `npm test && npm run lint && npm run build` once: 908, golden snapshot unchanged, no new lint errors.

At most five lines of summary. Commit "elevation-mvp: step 338 Canvas returns and profiles from cornerShapes".
```

---

## Running it (Kyle, after 338)

Geometry on `feature/drawing` with 332–333 in. Start the API and designer as in round 42, and run the end-to-end check at the end of the SPEC: the plan checks, then *Export DXF* on G1 and G2.

If anything looks wrong, export the room, keep the zip (its `payload.json` shows what was sent), and bring it back.
