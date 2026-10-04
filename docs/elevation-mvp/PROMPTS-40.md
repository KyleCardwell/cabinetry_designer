# Round 40 — Codex Prompts, Steps 307–312 (one room to a zip of DXFs: plumbing)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names** (this round spans three repos). The SPEC lives in the designer repo; from the API and geometry repos it's `../cabinetry_designer/docs/elevation-mvp/SPEC-40.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 307 | cabinetry_designer_api | Delete the drag-and-drop API; env + auth only verify the login | — |
| 308 | cabinetry_designer_geometry | Payload v1 + `python -m src draw` | 26 |
| 309 | cabinetry_designer_geometry | Delete the old placed-object path | 13 |
| 310 | cabinetry_designer_api | `POST /api/drawings/preview` | 8 |
| 311 | cabinetry_designer | `toDrawingPayload` + `drawingZipName` | 870 |
| 312 | cabinetry_designer | *Export DXF* button | 870 |

The SPEC's tests were written from the golden fixture, not run. Codex writes the code; if a test value contradicts the SPEC's §2 payload, stop and say so rather than changing the number.

---

## Before step 307 (Kyle)

**Designer** — commit the round docs:

```bash
cd cabinetry_designer
git status                                   # clean, on feature/elevation-mvp
# SPEC-40.md and PROMPTS-40.md are already in docs/elevation-mvp/
git add docs/elevation-mvp/SPEC-40.md docs/elevation-mvp/PROMPTS-40.md
git commit -m "round 40 docs"
```

**Geometry** — keep setup-output-fix's writer fixes, branch, and check the venv:

```bash
cd ../cabinetry_designer_geometry
git status                                   # clean
git checkout main
git merge setup-output-fix                   # fast-forward if main hasn't moved
git checkout -b drawing-payload
.venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest                   # 19 passed
```

(If `.venv` is broken or from another Python: `rm -rf .venv && python3 -m venv .venv` first. Needs Python 3.10+.)

**API** — branch:

```bash
cd ../cabinetry_designer_api
git status                                   # clean
git checkout main
git checkout -b drawing-preview
npm install
```

---

## Step 307 — api: delete the drag-and-drop API

Run in **cabinetry_designer_api**.

```
Repo: cabinetry_designer_api, branch drawing-preview. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-40.md §1 and §3.
If `git status` shows uncommitted changes, stop and tell me.

This API was built for an old drag-and-drop designer whose cd_* tables were never created. Remove all of it. What stays: Express, cors, JSON body, GET /api/health, the error handler, and requireAuth trimmed to verifying a Supabase login with the anon key (no team lookup). Step 310 adds the one new route; geometryBridge.js stays untouched until then.

Delete these files (git rm):
src/routes/projects.js src/routes/rooms.js src/routes/walls.js src/routes/objects.js src/routes/generate.js src/routes/reports.js
src/models/project.js src/models/room.js src/models/wall.js src/models/placedObject.js
src/services/parameterResolver.js src/services/reportBuilder.js src/config/defaults.js
supabase/migrations/001_create_cd_tables.sql
Add an empty supabase/migrations/.gitkeep.

Rewrite (SPEC §3 gives env.js and .env.example verbatim; the rest is described there):
- src/config/env.js (17 lines) — VERBATIM from the SPEC
- src/config/supabase.js (12) — one anon client, `supabaseAuth`
- src/middleware/auth.js (37) — verify the token only; set req.user and req.accessToken
- src/server.js (37) — health + error handler, no other routes
- .env.example — VERBATIM from the SPEC
- README.md — as the SPEC describes

DO NOT touch src/services/geometryBridge.js, src/middleware/errorHandler.js, package.json, package-lock.json or .github/. DO NOT open the deleted files before deleting them. There's no eslint config here: don't run `npm run lint`. There are no tests yet.

Check: `node -e "process.env.SUPABASE_URL='http://x';process.env.SUPABASE_ANON_KEY='y';import('./src/server.js')"` prints the listening line (Ctrl-C it, or kill it after 2 s), and `grep -rn "supabaseAdmin\|cd_\|teamId\|defaults.js" src` prints nothing.

At most five lines of summary. Commit "round 40: step 307 Remove the drag-and-drop API".
```

**Check after 307 (Kyle):** create `.env` from `.env.example`, filling `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the values of `VITE_FF_JS_SUPABASE_URL` and `VITE_FF_JS_SUPABASE_ANON_KEY` in `cabinetry_designer/.env`. `npm run dev`, then `curl localhost:3001/api/health` → `{"status":"ok",…}`.

---

## Step 308 — geometry: payload v1 and `draw`

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch drawing-payload. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-40.md §1, §2 and §4.
If `git status` shows uncommitted changes, stop and tell me.

Geometry gets a new input: the drawing payload v1 the designer builds (SPEC §2). New command `python -m src draw` reads it on stdin and prints {"payloadVersion", "files", "zip_base64"}: a zip holding payload.json then one elevation-<letter>.dxf per elevation, each drawing the wall face as a closed LWPOLYLINE on WALLS plus three TEXT lines. Pydantic models forbid unknown fields. Bad payload → stderr JSON + exit 2; other errors → exit 1. The old `generate` command stays for now (step 309 deletes it).

Files (only these):
- NEW src/drawing/__init__.py (empty)
- NEW src/drawing/models.py — PayloadRoom, PayloadElevation, DrawingPayload as SPEC §4 lists (pydantic v2, ConfigDict(extra="forbid"))
- NEW src/drawing/elevation_dxf.py — build_elevation_dxf(elevation, room) -> bytes, using create_dxf_document() and doc_to_bytes() from src/dxf/writer.py (104 lines; read only those two functions and LAYER_DEFS)
- NEW src/drawing/bundle.py — draw(payload: dict) -> dict, zip with fixed ZipInfo date_time
- src/cli.py (90 lines) — add the `draw` command beside `generate`, with the exit codes above
- NEW tests/fixtures/g1_payload.json — the G1 payload from SPEC §2, VERBATIM
- NEW tests/test_draw.py — VERBATIM from SPEC §4

DO NOT change src/dxf/writer.py, anything under src/parametric, src/projection, src/reports, src/models, or the existing tests. DO NOT read the old pipeline files; nothing in them is needed. No new dependencies (zipfile, base64 and json are stdlib; ezdxf and pydantic are already installed).

Use the venv: `.venv/bin/python -m pytest`. First add the tests and fixture and run `.venv/bin/python -m pytest tests/test_draw.py`: they must fail on the missing module. While iterating, run only that file. At the end run `.venv/bin/python -m pytest` once: 19 + 7 = 26 passed.

At most five lines of summary. Commit "round 40: step 308 Drawing payload v1 and draw".
```

**Check after 308 (Kyle):**

```bash
.venv/bin/python -m src draw < tests/fixtures/g1_payload.json \
  | .venv/bin/python -c "import sys,json,base64;open('/tmp/g1.zip','wb').write(base64.b64decode(json.load(sys.stdin)['zip_base64']))"
open /tmp/g1.zip
```

Open `elevation-A.dxf` in your CAD program: a 168" × 96" rectangle, "ELEVATION A / Wall 1 / G1 Euro kitchen" under it; measure it in inches.

---

## Step 309 — geometry: delete the old path

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch drawing-payload. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-40.md §1 and §5. Step 308 is in.
If `git status` shows uncommitted changes, stop and tell me.

Remove the old placed-object pipeline (it laid out cabinets and faces itself; the designer does that now). Keep hidden-line removal and the DXF writer: round 41 uses them.

Delete (git rm -r):
src/models/room.py src/models/cabinet.py src/parametric/ src/projection/floorplan.py src/projection/elevation.py src/projection/section.py src/reports/ src/dxf/floorplan_dxf.py src/dxf/elevation_dxf.py examples/ tests/test_cabinet_builder.py

Edit:
- src/cli.py — remove `generate` and its imports; `draw` is the only command
- src/__main__.py — docstring: `python -m src draw`
- README.md — rewrite as SPEC §5 describes

KEEP, untouched: src/projection/hlr.py, src/models/geometry.py, src/dxf/writer.py, src/utils/, src/drawing/, tests/test_hlr.py, tests/test_dxf_writer.py, tests/test_draw.py, pyproject.toml, requirements.txt.
DO NOT open the files you're deleting.

Then `grep -rn "parametric\|reports\|models.room\|models.cabinet\|floorplan\|generate" src tests` must print nothing. Run `.venv/bin/python -m pytest` once: 26 − 13 = 13 passed.

At most five lines of summary. Commit "round 40: step 309 Remove the placed-object pipeline".
```

---

## Step 310 — api: `POST /api/drawings/preview`

Run in **cabinetry_designer_api**.

```
Repo: cabinetry_designer_api, branch drawing-preview. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-40.md §1, §2 and §6. Step 307 is in (and geometry 308–309, but you don't need that repo).
If `git status` shows uncommitted changes, stop and tell me.

One new route: POST /api/drawings/preview (behind requireAuth) takes a drawing payload v1, does a light Zod check, runs geometry's `draw` through runGeometry (spawn the venv python, JSON in/out, exit 2 → 422 with details, timeout → 504, anything else → 502), and answers with the zip as application/zip plus Content-Disposition and X-Drawing-Files headers. Tests use Node's built-in runner and a fake engine script, no new dependencies.

Files (only these):
- src/services/geometryBridge.js (43 lines) — rewrite as runGeometry(command, input, options) per SPEC §6
- NEW src/services/fileNames.js — drawingZipName(roomName)
- NEW src/schemas/drawingPayload.js — VERBATIM schema from SPEC §6
- NEW src/routes/drawings.js
- src/middleware/errorHandler.js (19) — also send err.details when present
- src/server.js — mount the route
- package.json — add "test": "node --test test/" (scripts only)
- README.md — add the route row and a curl example
- NEW test/fixtures/fakeEngine.mjs, NEW test/geometryBridge.test.js (4 tests), NEW test/drawings.test.js (4 tests) — as SPEC §6 lists; geometryBridge.test.js sets SUPABASE_URL/SUPABASE_ANON_KEY defaults before a dynamic import of the bridge

DO NOT touch src/config/*, src/middleware/auth.js or package-lock.json. DO NOT add dependencies. DO NOT open ../cabinetry_designer_geometry. No eslint config: don't run lint.

First add the tests and run `npm test`: they must fail. Iterate with `node --test test/<file>`. At the end `npm test` once: 8 passing. Then check `node -e` import of src/server.js with dummy SUPABASE env starts without error (kill it after 2 s).

At most five lines of summary. Commit "round 40: step 310 Drawing preview route".
```

**Check after 310 (Kyle):** `npm run dev`; `curl -i -X POST localhost:3001/api/drawings/preview` → 401. The real check is after 312.

---

## Step 311 — designer: `toDrawingPayload`

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-40.md §1, §2 and §7. Step 306 is in.
If `git status` shows uncommitted changes, stop and tell me.

New pure model function toDrawingPayload(room, settings): the drawing payload v1 for one room — one record per lettered wall face (elevationLetters order) with key, letter, wallId, side, title, wallLabel, length (resolveWall) and height (wall.height). Plus drawingZipName(roomName). No UI this step.

Files (only these):
- NEW src/elevation/model/drawingPayload.js — as SPEC §7 describes (imports: elevationKey, elevationLetters, wallLabel from ./topology.js; resolveWall from ./room.js; WALL_SIDES from ./wallSides.js)
- NEW src/elevation/model/__tests__/drawingPayload.test.js — VERBATIM from SPEC §7
- src/elevation/model/index.js — one export line at the end: `export { DRAWING_PAYLOAD_VERSION, drawingZipName, toDrawingPayload } from './drawingPayload.js';`

DO NOT change topology.js, room.js, wallSides.js or any component. DO NOT grep the repo or open other files.

First add the test and run it: it must fail. While iterating, run only `npx vitest run src/elevation/model/__tests__/drawingPayload.test.js`. At the end run `npm test && npm run lint` once: 868 + 2 = 870, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 311 Drawing payload".
```

---

## Step 312 — designer: *Export DXF*

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-40.md §8. Step 311 is in.
If `git status` shows uncommitted changes, stop and tell me.

An "Export DXF" toolbar button sends the active room's toDrawingPayload to the API (POST /api/drawings/preview, responseType blob) and downloads the zip as drawingZipName(room.name); messages go through setMessage and clear after 4 s. Also fix apiClient's fallback baseURL to 'http://localhost:3001' (callers already pass '/api/...').

Files (only these):
- src/api/apiClient.js (20 lines) — the fallback baseURL only
- NEW src/api/drawings.js — requestRoomDrawings, drawingErrorMessage, saveBlob (SPEC §8)
- NEW src/elevation/components/ExportDxfButton.jsx — SPEC §8; import toDrawingPayload and drawingZipName from ../model/drawingPayload.js, setMessage from ../store/elevationSlice.js
- src/elevation/components/ElevationToolbar.jsx (225 lines) — one import, and <ExportDxfButton /> immediately before the "Zoom to fit" button (≈ 215)

DO NOT touch src/api/supabaseClient.js, src/store/slices/*, ElevationCanvas.jsx, MessageToast.jsx or anything in model/. DO NOT grep the repo or open other files.

No component tests: run `npm test && npm run lint && npm run build` once at the end. Still 870, golden snapshot unchanged.

At most five lines of summary. Commit "elevation-mvp: step 312 Export DXF".
```

---

## Running it (Kyle, after 312)

1. **Geometry:** nothing to start. The API runs `cabinetry_designer_geometry/.venv/bin/python -m src draw` for each export.
2. **API:** `cd cabinetry_designer_api && npm run dev` (port 3001; `.env` from the check after 307).
3. **Designer:** `cd cabinetry_designer && npm run dev`, log in, open `/elevation-lab`.

**End-to-end check:** open G1 → *Export DXF* → `g1-euro-kitchen.zip` downloads with `payload.json` and `elevation-A.dxf` … `elevation-D.dxf`. Open A in CAD: 168 × 96, three lines of text under it, inches. Open D: 91.5 × 36, "Wall 4 (back)". Stop the API and export again: *DXF export failed: Could not reach the API at http://localhost:3001*. If the API answers 401, log out and back in (expired token).

When it all works, merge `drawing-payload` (geometry) and `drawing-preview` (API) into their `main`s.
