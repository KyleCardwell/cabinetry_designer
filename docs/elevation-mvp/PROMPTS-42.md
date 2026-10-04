# Round 42 — Codex Prompts, Steps 318–323 (run bands in the elevation DXF)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo; from geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-42.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 318 | cabinetry_designer_geometry | HLR: detail lines, never-dashed shapes | 20 |
| 319 | cabinetry_designer_geometry | Band kinds, `lines`, `profileId`, COUNTERTOPS/MOLDINGS | 23 |
| 320 | cabinetry_designer | `runBands`: RunGroup's band code moved to the model | 880 |
| 321 | cabinetry_designer | Band ends and `bandDepths` | 883 |
| 322 | cabinetry_designer | `bandParts` | 886 |
| 323 | cabinetry_designer | Chip lines on parts; bands in the payload | 887 |

The API doesn't change. Geometry goes first: it accepts the new kinds before the designer sends them.

The SPEC's test values were read from the golden fixture with today's model and a reference build of these rules, and the geometry values were checked with shapely and ezdxf. If a test fails, fix the code, not the number, unless the number contradicts a SPEC rule. In that case stop and say so.

---

## Branches (from now on)

No new branch or PR per round.

- **Designer:** keep committing on `feature/elevation-mvp`, as before.
- **Geometry:** one long-lived `feature/drawing` branch, created once below. Every drawing round (42 → 45, sheets) commits there. Open a PR into `main` only when you want `main` caught up, e.g. after round 45. The API runs geometry from its folder, so whatever is checked out is what runs. Nothing has to be merged to test end to end.
- **API:** stays on `main` until a round changes it. Then it gets the same treatment (`feature/drawing`).

---

## Before step 318 (Kyle)

**Designer** — commit the round docs:

```bash
cd cabinetry_designer
git status                                   # clean, on feature/elevation-mvp
git add docs/elevation-mvp/SPEC-42.md docs/elevation-mvp/PROMPTS-42.md docs/DECISIONS.md
git commit -m "round 42 docs"
```

**Geometry** — the long-lived branch, once:

```bash
cd ../cabinetry_designer_geometry
git status                                   # clean
git checkout main && git pull
git checkout -b feature/drawing
.venv/bin/python -m pytest                   # 18 passed
```

(Optional tidy-up: `git branch -d drawing-payload elevation-parts`. Both are merged.)

---

## Step 318 — geometry: detail lines and never-dashed shapes

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-42.md §1 and §3.
If `git status` shows uncommitted changes, stop and tell me.

HlrShape gains two fields, last: drop_hidden: bool = False and lines: tuple = () (((x1, z1), (x2, z2)) pairs). In hidden_line_removal, a shape's edges are its polygon boundary unioned with LineStrings of its lines (only when it has any), so a detail line is visible/hidden/dashed exactly like the outline. When drop_hidden is true, hidden is [] (skip the dashing step). Nothing else changes.

Files (only these):
- src/projection/hlr.py (69 lines): SPEC §3
- tests/test_hlr.py (88): append the two SPEC §3 tests VERBATIM at the end

DO NOT touch src/drawing/, src/dxf/, src/models/, src/cli.py or the other tests. No new dependencies.

First append the tests and run `.venv/bin/python -m pytest tests/test_hlr.py`: the two new ones must fail. Iterate on that file only. At the end run `.venv/bin/python -m pytest` once: 18 + 2 = 20 passed.

At most five lines of summary. Commit "round 42: step 318 Detail lines and never-dashed shapes".
```

---

## Step 319 — geometry: band kinds, lines and layers

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-42.md §1, §2 and §4. Step 318 is in.
If `git status` shows uncommitted changes, stop and tell me.

Parts can now be toe_kick, countertop, top_mold, crown, light_rail, light_trough, bottom_cap or corbels; any part can carry `lines` ([{x1, z1, x2, z2}], default []) and `profileId` (str | None = None, ignored). The elevation DXF passes each part's lines to its HlrShape, sets drop_hidden for toe_kick/top_mold/crown (NEVER_DASHED), and draws countertop on COUNTERTOPS and the other new kinds on MOLDINGS. Two new layers in LAYER_DEFS.

Files (only these):
- src/drawing/models.py (60 lines): PayloadLine (extra="forbid"), the wider kind Literal, lines and profileId after holes (SPEC §4)
- src/drawing/elevation_dxf.py (70): KIND_LAYERS additions, NEVER_DASHED, drop_hidden and lines on each HlrShape
- src/dxf/writer.py (102): add "COUNTERTOPS": (9, "CONTINUOUS") and "MOLDINGS": (1, "CONTINUOUS") after SHELVES; nothing else
- NEW tests/fixtures/g6_bands_payload.json: VERBATIM from SPEC §4
- NEW tests/test_elevation_bands.py: VERBATIM from SPEC §4 (3 tests)
- README.md (58): the Layers table rows and the one sentence from SPEC §4

DO NOT change src/projection/hlr.py, src/drawing/bundle.py, src/cli.py or any existing test; all of them must still pass. No new dependencies.

First add the fixture and tests and run `.venv/bin/python -m pytest tests/test_elevation_bands.py`: they must fail. Iterate on that file only. At the end run `.venv/bin/python -m pytest` once: 20 + 3 = 23 passed.

At most five lines of summary. Commit "round 42: step 319 Band parts in the DXF".
```

**Check after 319 (Kyle):**

```bash
.venv/bin/python -m src draw < tests/fixtures/g6_bands_payload.json \
  | .venv/bin/python -c "import sys,json,base64;open('/tmp/g6.zip','wb').write(base64.b64decode(json.load(sys.stdin)['zip_base64']))"
open /tmp/g6.zip
```

Open `elevation-A.dxf`. You should see the base's toe kick and countertop, one upper box with its two doors between a filler and an end panel (each with a line 1/8" up from its bottom), the bottom cap under them, and the top mold with the crown over it (no dashed lines).

---

## Step 320 — designer: `runBands`

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.md §5. Step 317 is in.
If `git status` shows uncommitted changes, stop and tell me.

A pure move: the toe kick, countertop, top mold, crown, parts-below and chip-line code in RunGroup becomes the model function runBands(room, wall, run, settings, scene) → { top, toeKick, countertop, topMold, crown, bottomParts, chipLines } in elevation coordinates, with today's rules word for word (SPEC §5 table). RunGroup then draws from it. Nothing the canvas draws changes.

Files (only these):
- NEW src/elevation/model/runBands.js: SPEC §5. Imports: bottomPartSpan, runBottomParts (./bottoms.js), CABINET_TYPE_IDS (./constants.js), resolveProfile (./profile.js), runTop (./tops.js)
- src/elevation/components/RunGroup.jsx (526 lines): the import changes, the replacement block VERBATIM from SPEC §5, delete the hasToeKick…countertop block, and the four JSX conditions
- NEW src/elevation/model/__tests__/runBands.test.js: VERBATIM from SPEC §5 (3 tests)
- src/elevation/model/index.js (399): one line at the end: `export { runBands } from './runBands.js';`

What you need without opening them: runScene's scene has { drawnPieces, hiddenIds, panelBySide: { left, right } (each null or { x, width }), endBottom: { drop, chip } }. runBottomParts(run) returns run.bottom top to bottom with each part's z; bottomPartSpan(run, pieces, { start, end }, underEndPanels) returns { start, end }. wallRectToScreen and wallToScreen are already imported in RunGroup.
DO NOT open bottoms.js, tops.js, profile.js, runScene.js or any other component, and DO NOT change them. DO NOT grep the repo.

First add the test and run it: it must fail. While iterating, run only `npx vitest run src/elevation/model/__tests__/runBands.test.js`. At the end run `npm test && npm run lint` once: 877 + 3 = 880, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 320 Run bands in the model".
```

---

## Step 321 — designer: band ends and band depths

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.md §1 and §6. Step 320 is in.
If `git status` shows uncommitted changes, stop and tell me.

A band now runs past a run end only where that end is free, by its own projection (a toe kick stops short by its setback); it stops at the run end where the end is closed (a wall, the side of the run's own recess, a joined run that carries the band on); a top runs past a wall end panel. Projections come from a new setting bandDepths (toe kick 3, countertop 3/4, top mold 1/4, crown 3). Add bandDepths(settings) and the bandEnd helper (write it as SPEC §6 gives it), and change only the x spans per the SPEC §6 table.

Files (only these):
- src/elevation/model/constants.js (131 lines): the bandDepths line in DEFAULT_SETTINGS right after bottomPartHeights
- src/elevation/model/runBands.js: SPEC §6. New imports: DEFAULT_SETTINGS (./constants.js), isJointAnchor and jointMembers (./joints.js), wallEndPanelAt (./wallSides.js)
- src/elevation/model/__tests__/runBands.test.js: REPLACE with the SPEC §6 file VERBATIM (6 tests)
- src/elevation/model/index.js: the runBands export line becomes `export { bandDepths, runBands } from './runBands.js';`

What you need without opening them: run.anchors[side] is true (the wall), false, or an object with `to`: 'wall' | 'joint' (jointId) | 'recess' (recessId) | 'follow' | 'soffit' | …; run._plane?.recessId is the recess the run sits in. jointMembers(wall, jointId) returns [{ runId, side, offset }]. wallEndPanelAt(room, wall, side, settings) returns null or { endpoint, width }. wall.length is the face's length.
DO NOT touch persistence.js (bandDepths(settings) fills in what's missing), RunGroup.jsx or any other file. DO NOT open joints.js or wallSides.js. DO NOT grep the repo.

First replace the test and run it: the four new cases must fail. Iterate with `npx vitest run src/elevation/model/__tests__/runBands.test.js`. At the end `npm test && npm run lint` once: 880 − 3 + 6 = 883, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 321 Band ends and depths".
```

**Check after 321 (Kyle):** `npm run dev`, open G1 wall 1. The base's countertop no longer pokes 1" into the tall or the corner. The toe kick runs the full base and tall. The tall's crown returns 3" past its right side above the base. The upper's crown runs 3" past its left end panel. On the island (elevation C) the countertop runs 3/4" past both wall end panels.

---

## Step 322 — designer: `bandParts`

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.md §2 and §7. Step 321 is in.
If `git status` shows uncommitted changes, stop and tell me.

New pure model function bandParts(room, wall, side, settings): for each run of resolveWall(room, wall, side).runs, runBands(room, view, run, settings, runScene(room, view, run, settings)) → part records in this order: toe kick, parts below, countertop, top mold, crown. back = runBackOffset(run) for all; front: toe kick = box front − toeKickSetback, parts below = box front, countertop/top mold/crown = frontDepth(run, settings) + overhang/projection (bandDepths). coversBoxEdges false. Skip null or zero-size rectangles.

Files (only these):
- NEW src/elevation/model/bandParts.js: SPEC §7. Imports: frontDepth, runBackOffset (./corners.js), bandDepths, runBands (./runBands.js), resolveWall (./room.js), runScene (./runScene.js)
- NEW src/elevation/model/__tests__/bandParts.test.js: VERBATIM from SPEC §7 (3 tests)
- src/elevation/model/index.js: one line at the end: `export { bandParts } from './bandParts.js';`

DO NOT open corners.js, runScene.js, elevationParts.js or any component. DO NOT change any other file or grep the repo.

First add the test and run it: it must fail. Iterate with `npx vitest run src/elevation/model/__tests__/bandParts.test.js`. At the end `npm test && npm run lint` once: 883 + 3 = 886, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 322 Band parts".
```

---

## Step 323 — designer: chip lines and the payload

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-42.md §2 and §8. Step 322 is in.
If `git status` shows uncommitted changes, stop and tell me.

Two small changes. (1) elevationParts: per run, `const { chipLines } = runBands(room, view, run, settings, scene);`; a filler/end panel/panel record whose piece has a chip line gets, last, `lines: [{ x1, z1: z, x2, z2: z }]`; records without one get no `lines` key. (2) toDrawingPayload: parts = [...elevationParts(...), ...bandParts(...)]. payloadVersion stays 1.

Files (only these):
- src/elevation/model/elevationParts.js (144 lines): import runBands from ./runBands.js; the chip lines; one sentence in the doc comment (SPEC §8)
- src/elevation/model/drawingPayload.js (44): import bandParts from ./bandParts.js; parts; doc comment
- src/elevation/model/__tests__/elevationParts.test.js (118): append the SPEC §8 test VERBATIM inside the describe
- src/elevation/model/__tests__/drawingPayload.test.js (70): the bandParts import; REPLACE the 'SPEC-41 carries each wall face's parts' test with the SPEC §8 one VERBATIM

DO NOT touch runBands.js, bandParts.js, ExportDxfButton.jsx, src/api/ or any other file. DO NOT grep the repo.

First change the tests and run `npx vitest run src/elevation/model/__tests__/elevationParts.test.js src/elevation/model/__tests__/drawingPayload.test.js`: the new chip test and the payload test must fail. Iterate on those two files. At the end run `npm test && npm run lint && npm run build` once: 886 + 1 = 887, golden snapshot unchanged.

At most five lines of summary. Commit "elevation-mvp: step 323 Bands in the payload".
```

---

## Running it (Kyle, after 323)

Geometry checked out on `feature/drawing` with 318–319 in. Start the API and designer as in round 41.

**End-to-end check:**

- **G1:** *Export DXF*, then open `elevation-A.dxf`. COUNTERTOPS and MOLDINGS have lines. The tall's crown runs 3" past its right side above the base, and the upper's crown 3" past its left end panel. The base's countertop and toe kick run from the tall to the corner with no overhang. HIDDEN is empty. `elevation-C.dxf` (island): the countertop runs 3/4" past both ends.
- **G2 A:** crowns over the tall and upper frames, the tall's crown returning 3" past its free left side.
- **G6:** the bottom cap under the upper (its top edge dashed where the doors overhang it by 1/8"), the stacked panel run between the countertop and the cap, and the wood top 3/4" past its left end panel.

Expected for now: no wall end panels, openings, soffits or recess outlines yet (42.1), and G1 B's blind box still solid into the corner (42.2).

If anything looks wrong, export the room, keep the zip (its `payload.json` shows exactly what was sent), and bring it back.
