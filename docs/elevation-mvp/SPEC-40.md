# Round 40 — SPEC: one room to a zip of DXFs (plumbing)

Steps 307–312. Three repos: `cabinetry_designer_api`, `cabinetry_designer_geometry`, `cabinetry_designer`.
First of the drawing rounds (40 plumbing → 41 elevation parts + hidden lines → 42 elevation extras → 43 elevation dimensions → 44 plan → 45 plan dimensions and labels).

**Done when:** in the Elevation Lab, *Export DXF* downloads `<room-name>.zip` holding `payload.json` and one `elevation-<letter>.dxf` per lettered wall face, each showing that wall face's rectangle and its title, in inches, and each opening in CAD.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **307** | api | Delete the drag-and-drop API; trim env and auth to "verify the login" | none yet |
| **308** | geometry | Payload v1 models + `python -m src draw` → zip of elevation DXFs | 19 → **26** |
| **309** | geometry | Delete the old placed-object path | **13** |
| **310** | api | `POST /api/drawings/preview` → runs geometry, returns the zip | **8** (`npm test`, new) |
| **311** | designer | `toDrawingPayload(room, settings)` + `drawingZipName(name)` | 868 → **870** |
| **312** | designer | *Export DXF* toolbar button | **870** |

The code in this round is written by Codex. This SPEC gives contracts, file lists, signatures, behavior and the tests (with literal values taken from the golden fixture); the implementation bodies are Codex's.

---

## §1 Decisions (Kyle, 2026-10-04)

- **The payload is built in the browser for now.** PLATFORM-PLAN D7 has the API build it from a saved revision with a shared package; there's no database and no package yet. `toDrawingPayload` is a pure model function, so it moves into the package unchanged later; only its caller changes.
- **Geometry is a renderer.** It computes no sizes. Hidden-line removal stays in geometry as general geometry (round 41): `src/projection/hlr.py`, `src/models/geometry.py`, `src/dxf/writer.py` and their tests are kept when the old path is deleted.
- **Old code goes.** The API's drag-and-drop routes, models, `parameterResolver`, `reportBuilder` and `001_create_cd_tables.sql` are deleted (they read tables that were never created; PLATFORM-PLAN says discard). Reports come back later built from the designer's parts list (`roomParts`) and face layouts, with AI on top (AI-LAYER-PLAN stage G), most likely as an API route. Geometry's `parametric/`, `reports/`, floorplan/elevation projections and examples are deleted.
- **setup-output-fix is merged first** (Kyle, before 307): its `writer.py` fixes (inches, architectural units, 1/16" precision, byte encoding) are kept.
- **Auth:** the API only verifies the designer's Supabase login, using the project URL and **anon key** (the same two values the designer's `.env` has). No service-role key, no team lookup, no tables. `DEV_SKIP_AUTH` is not in this round.
- **One zip per room.** Files inside: `payload.json` first (what was drawn, for debugging), then `elevation-A.dxf`, `elevation-B.dxf`, … in letter order. `plan.dxf` joins in round 44.
- **Which wall faces get an elevation:** exactly those `elevationLetters(room)` letters — the same A, B, C… as the plan's elevation markers (walls with cabinets or `elevationForced`, then back faces with cabinets).
- **Geometry rejects unknown fields** (`extra="forbid"`). Each later round adds fields to both sides in the same round, geometry step first.
- **Geometry stays a CLI** the API spawns from geometry's `.venv`. Two processes to run locally: the designer and the API.

---

## §2 The payload, v1 (round 40 subset)

```json
{
  "payloadVersion": 1,
  "units": "in",
  "room": { "id": "7ee9fabb-…", "name": "G1 Euro kitchen" },
  "elevations": [
    {
      "key": "84063fed-…:back",
      "letter": "D",
      "wallId": "84063fed-…",
      "side": "back",
      "title": "Elevation D",
      "wallLabel": "Wall 4",
      "length": 91.5,
      "height": 36
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `key` | `elevationKey(wall.id, side)`: the wall id for a front face, `<id>:back` for a back face |
| `letter` | `elevationLetters(room).get(key)` |
| `side` | `'front'` or `'back'` |
| `title` | `` `Elevation ${letter}` `` |
| `wallLabel` | `wallLabel(room, wall)` (e.g. `Wall 4`, or `Wall 2 · Sink wall` when named) |
| `length` | `resolveWall(room, wall, side).length`, inches |
| `height` | `wall.height`, inches |

Elevation coordinates for every later round: x along the wall face from its left end as seen in that elevation, z up from the floor, inches — the designer's own elevation coordinates.

**The G1 payload** (golden fixture; these exact values are the test fixture on both sides):

```json
{
  "payloadVersion": 1,
  "units": "in",
  "room": { "id": "7ee9fabb-5daf-4fb2-96f9-b24b9e1e546f", "name": "G1 Euro kitchen" },
  "elevations": [
    { "key": "cb33d774-f31e-41c1-bbe4-198cbf981619", "letter": "A", "wallId": "cb33d774-f31e-41c1-bbe4-198cbf981619", "side": "front", "title": "Elevation A", "wallLabel": "Wall 1", "length": 168, "height": 96 },
    { "key": "4afd9749-bbe8-4848-8a67-a1d063bdfce8", "letter": "B", "wallId": "4afd9749-bbe8-4848-8a67-a1d063bdfce8", "side": "front", "title": "Elevation B", "wallLabel": "Wall 2", "length": 120, "height": 96 },
    { "key": "84063fed-ab0d-4a1d-ae05-ffe67decad5e", "letter": "C", "wallId": "84063fed-ab0d-4a1d-ae05-ffe67decad5e", "side": "front", "title": "Elevation C", "wallLabel": "Wall 4", "length": 91.5, "height": 36 },
    { "key": "84063fed-ab0d-4a1d-ae05-ffe67decad5e:back", "letter": "D", "wallId": "84063fed-ab0d-4a1d-ae05-ffe67decad5e", "side": "back", "title": "Elevation D", "wallLabel": "Wall 4", "length": 91.5, "height": 36 }
  ]
}
```

(G1's third wall, `8cf88b99-…` (27"), has no cabinets and no letter, so it's not in the payload.)

---

## §3 Step 307 — api: delete the drag-and-drop API

**Delete:**

```
src/routes/projects.js  src/routes/rooms.js  src/routes/walls.js
src/routes/objects.js   src/routes/generate.js  src/routes/reports.js
src/models/project.js   src/models/room.js  src/models/wall.js  src/models/placedObject.js
src/services/parameterResolver.js  src/services/reportBuilder.js
src/config/defaults.js
supabase/migrations/001_create_cd_tables.sql
```

Add an empty `supabase/migrations/.gitkeep` (migrations land there in PLATFORM-PLAN Phase 2). Leave `src/services/geometryBridge.js` as it is; step 310 rewrites it.

**`src/config/env.js`** becomes:

```js
import 'dotenv/config';
import path from 'path';

const geometryEnginePath = path.resolve(process.env.GEOMETRY_ENGINE_PATH || '../cabinetry_designer_geometry');

export const env = {
  port: parseInt(process.env.PORT || '3001', 10),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  geometryEnginePath,
  // The geometry repo's virtualenv python, so its packages are found (SPEC-40).
  geometryPython: process.env.GEOMETRY_PYTHON
    ? path.resolve(process.env.GEOMETRY_PYTHON)
    : path.join(geometryEnginePath, '.venv', 'bin', 'python'),
  geometryTimeoutMs: parseInt(process.env.GEOMETRY_TIMEOUT_MS || '30000', 10),
};

for (const key of ['supabaseUrl', 'supabaseAnonKey']) {
  if (!env[key]) throw new Error(`Missing required env var for ${key} (see .env.example)`);
}
```

**`src/config/supabase.js`:** one anon client, `export const supabaseAuth = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });`. `supabaseAdmin` and `supabaseForUser` go.

**`src/middleware/auth.js`:** `requireAuth` keeps the Bearer check and `supabaseAuth.auth.getUser(token)`; sets `req.user` and `req.accessToken`; drops the `team_members` lookup, `req.teamId` and `req.userRole` (team checks return with the design tables, PLATFORM-PLAN Phase 2). 401 messages unchanged.

**`src/server.js`:** cors, `express.json({ limit: '5mb' })`, `GET /api/health`, error handler. No other routes (step 310 adds one).

**`.env.example`:**

```
PORT=3001
# Same values as VITE_FF_JS_SUPABASE_URL / VITE_FF_JS_SUPABASE_ANON_KEY in cabinetry_designer/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
GEOMETRY_ENGINE_PATH=../cabinetry_designer_geometry
# Optional: defaults to $GEOMETRY_ENGINE_PATH/.venv/bin/python
# GEOMETRY_PYTHON=
# GEOMETRY_TIMEOUT_MS=30000
```

**`README.md`:** rewrite to: what the API is now (verifies the designer's login, turns a drawing payload into DXFs via geometry; later: reports, revisions); getting started (`npm install`, copy `.env.example` to `.env` and fill the two Supabase values, `npm run dev`); env table matching `.env.example`; routes: `GET /api/health` only (step 310 adds its row). Delete the fallback-chain and migration sections.

`package.json` is untouched (no dependency changes). There is no eslint config in this repo: don't run `npm run lint`.

**Check:** `npm run dev` starts; `curl localhost:3001/api/health` → `{"status":"ok",…}`.

---

## §4 Step 308 — geometry: payload v1 and `draw`

**NEW package `src/drawing/`:**

- `__init__.py` (empty)
- `models.py` — Pydantic v2, every model `model_config = ConfigDict(extra="forbid")`:
  - `PayloadRoom`: `id: str` (min length 1), `name: str`
  - `PayloadElevation`: `key: str`, `letter: str` (min 1), `wallId: str`, `side: Literal["front", "back"]`, `title: str`, `wallLabel: str`, `length: float` (> 0), `height: float` (> 0)
  - `DrawingPayload`: `payloadVersion: Literal[1]`, `units: Literal["in"]`, `room: PayloadRoom`, `elevations: list[PayloadElevation]`
- `elevation_dxf.py` — `build_elevation_dxf(elevation: PayloadElevation, room: PayloadRoom) -> bytes`, using `create_dxf_document()` and `doc_to_bytes()` from `src/dxf/writer.py`:
  - the wall face as one closed `LWPOLYLINE` on layer `WALLS`: `(0,0) (length,0) (length,height) (0,height)`;
  - `TEXT` on layer `TEXT`: `elevation.title.upper()` at `(0, -12)`, height 4; then the wall label at `(0, -18)`, height 3: `wallLabel`, plus `" (back)"` when `side == "back"`; then `room.name` at `(0, -23)`, height 3.
- `bundle.py` — `draw(payload: dict) -> dict`:
  1. `DrawingPayload.model_validate(payload)` (raises `ValidationError` on bad input);
  2. one DXF per elevation, in payload order, named `elevation-{letter}.dxf`;
  3. a zip (stdlib `zipfile`, `ZIP_DEFLATED`) written in memory with fixed `ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))` per entry: `payload.json` first (`model.model_dump_json(indent=2)`), then the DXFs;
  4. returns `{"payloadVersion": 1, "files": [the DXF names], "zip_base64": <base64 str>}`.

**`src/cli.py`:** add a `draw` command beside `generate` (step 309 removes `generate`): read stdin JSON, `json.dump(draw(data), sys.stdout)`. A `pydantic.ValidationError` writes `{"error": "Invalid drawing payload", "details": json.loads(e.json(include_url=False))}` to **stderr** and exits **2**; any other exception writes `{"error": str(e)}` to stderr and exits **1**. Update the usage text.

**NEW `tests/fixtures/g1_payload.json`:** the G1 payload in §2, verbatim.

**NEW `tests/test_draw.py`** (7 tests):

```python
"""Tests for the drawing payload v1 and the draw command (SPEC-40)."""

import base64
import copy
import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import ezdxf
import pytest
from ezdxf import units
from pydantic import ValidationError

from src.drawing.bundle import draw

ROOT = Path(__file__).resolve().parent.parent
PAYLOAD = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())


def _zip(result):
    return zipfile.ZipFile(io.BytesIO(base64.b64decode(result["zip_base64"])))


def _dxf(archive, name):
    return ezdxf.read(io.StringIO(archive.read(name).decode("utf-8")))


def test_one_dxf_per_elevation_in_letter_order():
    result = draw(PAYLOAD)
    names = ["elevation-A.dxf", "elevation-B.dxf", "elevation-C.dxf", "elevation-D.dxf"]
    assert result["payloadVersion"] == 1
    assert result["files"] == names
    assert _zip(result).namelist() == ["payload.json", *names]


def test_elevation_dxf_draws_the_wall_face_and_its_title():
    archive = _zip(draw(PAYLOAD))
    for name, size in [("elevation-A.dxf", (168, 96)), ("elevation-C.dxf", (91.5, 36))]:
        doc = _dxf(archive, name)
        assert doc.units == units.IN
        outlines = list(doc.modelspace().query('LWPOLYLINE[layer=="WALLS"]'))
        assert len(outlines) == 1
        assert outlines[0].closed
        length, height = size
        assert [tuple(p) for p in outlines[0].get_points("xy")] == [
            (0, 0), (length, 0), (length, height), (0, height),
        ]
    texts = [t.dxf.text for t in _dxf(archive, "elevation-D.dxf").modelspace().query("TEXT")]
    assert texts == ["ELEVATION D", "Wall 4 (back)", "G1 Euro kitchen"]


def test_zip_carries_the_payload_it_drew():
    assert json.loads(_zip(draw(PAYLOAD)).read("payload.json")) == PAYLOAD


def test_rejects_unknown_fields():
    payload = copy.deepcopy(PAYLOAD)
    payload["elevations"][0]["depth"] = 24
    with pytest.raises(ValidationError):
        draw(payload)


def test_rejects_other_payload_versions():
    with pytest.raises(ValidationError):
        draw({**PAYLOAD, "payloadVersion": 2})


def _cli(payload):
    return subprocess.run(
        [sys.executable, "-m", "src", "draw"],
        input=json.dumps(payload), capture_output=True, text=True, cwd=ROOT,
    )


def test_cli_draw_writes_the_result_to_stdout():
    run = _cli(PAYLOAD)
    assert run.returncode == 0, run.stderr
    assert json.loads(run.stdout)["files"][0] == "elevation-A.dxf"


def test_cli_draw_rejects_a_bad_payload_with_exit_2():
    run = _cli({**PAYLOAD, "units": "mm"})
    assert run.returncode == 2
    assert json.loads(run.stderr)["error"] == "Invalid drawing payload"
```

(These tests were written against this SPEC, not run: the values come from the golden fixture, so if one fails, fix the code, not the number — unless the number contradicts §2, then say so.)

**Count:** 19 + 7 = **26** (`.venv/bin/python -m pytest`).

**Check:** `.venv/bin/python -m src draw < tests/fixtures/g1_payload.json > /tmp/g1.json`, then decode `zip_base64` to a .zip and open `elevation-A.dxf` in CAD: a 168 × 96 rectangle, "ELEVATION A" under it, units inches.

---

## §5 Step 309 — geometry: delete the old placed-object path

**Delete:**

```
src/models/room.py  src/models/cabinet.py
src/parametric/  (whole folder)
src/projection/floorplan.py  src/projection/elevation.py  src/projection/section.py
src/reports/  (whole folder)
src/dxf/floorplan_dxf.py  src/dxf/elevation_dxf.py
examples/  (whole folder)
tests/test_cabinet_builder.py
```

**Keep:** `src/projection/hlr.py` (+ `tests/test_hlr.py`), `src/models/geometry.py`, `src/dxf/writer.py` (+ `tests/test_dxf_writer.py`), `src/utils/`, `src/drawing/`, `tests/test_draw.py`.

**`src/cli.py`:** remove `generate` and every import it used; `draw` is the only command. **`src/__main__.py`:** docstring says `python -m src draw`.

**`README.md`:** rewrite around the payload: input is a drawing payload v1 built by the designer (`toDrawingPayload`), output is a zip of DXFs; getting started (`python -m venv .venv`, `.venv/bin/pip install -r requirements.txt pytest`, `.venv/bin/python -m pytest`, `.venv/bin/python -m src draw < tests/fixtures/g1_payload.json`); architecture: `drawing/` (payload models, DXF per elevation, zip), `dxf/writer.py` (document, layers, units), `projection/hlr.py` (kept for round 41's hidden lines). Delete the parametric-expansion pipeline and report sections.

**Count:** 26 − 13 = **13**.

---

## §6 Step 310 — api: `POST /api/drawings/preview`

**`src/services/geometryBridge.js`** — rewrite:

```js
/**
 * Run a geometry command (SPEC-40): JSON on stdin, JSON on stdout.
 * Resolves the parsed stdout. Rejects with an Error carrying `status`:
 *   422 + `details` when geometry exits 2 (invalid payload; stderr is {error, details}),
 *   504 when it runs past timeoutMs (the child is killed),
 *   502 for any other failure (spawn error, other exit code, unparseable stdout), message includes stderr.
 */
export function runGeometry(command, input, {
  python = env.geometryPython,
  args = ['-m', 'src', command],
  cwd = env.geometryEnginePath,
  timeoutMs = env.geometryTimeoutMs,
} = {}) { … }
```

Collect stdout as Buffer chunks (the zip's base64 can be large); write `JSON.stringify(input)` to stdin and end it. A spawn `ENOENT` gives a 502 whose message names the python path and says to create the venv (README).

**NEW `src/services/fileNames.js`:**

```js
/** "G1 Euro kitchen" → "g1-euro-kitchen.zip" (SPEC-40); same rule as the designer's drawingZipName. */
export function drawingZipName(roomName) { … }
```

Lowercase; every run of characters outside `a-z0-9` becomes one `-`; trim leading/trailing `-`; empty → `room`; append `.zip`.

**NEW `src/schemas/drawingPayload.js`:** a light Zod check (geometry is the strict validator):

```js
export const drawingPayloadSchema = z.object({
  payloadVersion: z.literal(1),
  units: z.literal('in'),
  room: z.object({ id: z.string().min(1), name: z.string() }).passthrough(),
  elevations: z.array(z.object({}).passthrough()),
}).passthrough();
```

**NEW `src/routes/drawings.js`:** `POST /preview`: `drawingPayloadSchema.parse(req.body)` (a ZodError reaches the existing error handler → 400); `runGeometry('draw', payload)`; respond with `Buffer.from(result.zip_base64, 'base64')`, `Content-Type: application/zip`, `Content-Disposition: attachment; filename="<drawingZipName(room.name)>"`, and `X-Drawing-Files: <result.files joined by ",">`. Errors go to `next(err)`; the error handler already uses `err.status`; make it also send `details` when the error has them.

**`src/server.js`:** `app.use('/api/drawings', requireAuth, drawingRoutes);`. **README:** add the route row and a curl example.

**`package.json`:** `"test": "node --test test/"` (Node's built-in runner; no new dependencies).

**NEW `test/fixtures/fakeEngine.mjs`** — stands in for geometry: reads stdin JSON and by `input.mode`: `ok` → stdout `{"payloadVersion":1,"files":["elevation-A.dxf"],"zip_base64":"UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA=="}` exit 0; `invalid` → stderr `{"error":"Invalid drawing payload","details":[{"loc":["units"]}]}` exit 2; `crash` → stderr `boom` exit 1; `hang` → never exits.

**NEW `test/geometryBridge.test.js`** (4 tests), each calling `runGeometry('draw', { mode }, { python: process.execPath, args: [<fakeEngine path>], cwd: <test dir>, timeoutMs: 500 })`:
1. `ok` resolves `files: ['elevation-A.dxf']`;
2. `invalid` rejects with `status` 422 and `details[0].loc` `['units']`;
3. `crash` rejects with `status` 502 and a message containing `boom`;
4. `hang` rejects with `status` 504.

**NEW `test/drawings.test.js`** (4 tests):
1. `drawingZipName('G1 Euro kitchen')` → `'g1-euro-kitchen.zip'`;
2. `drawingZipName('  ')` → `'room.zip'` and `drawingZipName('Bath #2 / Main')` → `'bath-2-main.zip'`;
3. the schema accepts the G1 payload from SPEC-40 §2 (inline it in the test);
4. the schema rejects `payloadVersion: 2` and a missing `room`.

Importing `src/config/env.js` in a test throws without Supabase values: tests import `geometryBridge.js`, which imports `env.js`, so set `process.env.SUPABASE_URL ??= 'http://localhost'` and `process.env.SUPABASE_ANON_KEY ??= 'test'` at the top of `geometryBridge.test.js` **before** a dynamic `await import(...)` of the bridge.

**Count:** **8** (`npm test`).

**Check:** with `.env` filled and geometry's venv set up, `npm run dev`; `curl -X POST localhost:3001/api/drawings/preview` → 401 (no token). The end-to-end check is after step 312.

---

## §7 Step 311 — designer: `toDrawingPayload`

**NEW `src/elevation/model/drawingPayload.js`:**

```js
export const DRAWING_PAYLOAD_VERSION = 1;

/**
 * What geometry draws for one room (SPEC-40, payload v1): one elevation per lettered wall face, in
 * letter order. Takes a synced room (every room in the store is). Round 40 carries each face's
 * outline; later rounds add parts, faces, dimensions and the plan to the same records.
 */
export function toDrawingPayload(room, settings) { … }

/** "G1 Euro kitchen" → "g1-euro-kitchen.zip" (SPEC-40); the API uses the same rule. */
export function drawingZipName(roomName) { … }
```

`toDrawingPayload` builds §2 exactly: iterate `elevationLetters(room)` (a Map, already in letter order); find each key's wall and side by matching `elevationKey(wall.id, side)` over `room.walls` × `WALL_SIDES`; `length` from `resolveWall(room, wall, side).length`, `height` from `wall.height`; `room: { id, name }`. Imports: `elevationKey`, `elevationLetters`, `wallLabel` from `./topology.js`; `resolveWall` from `./room.js`; `WALL_SIDES` from `./wallSides.js`. `settings` is unused this round (keep the parameter; later rounds need it). `drawingZipName`: same rule as §6.

Export both functions and the constant from `model/index.js`, at the end.

**NEW `src/elevation/model/__tests__/drawingPayload.test.js`:**

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawingZipName, toDrawingPayload } from '../drawingPayload.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);

describe('SPEC-40 drawing payload', () => {
  it('has one elevation per lettered wall face, in letter order', () => {
    const island = '84063fed-ab0d-4a1d-ae05-ffe67decad5e';
    expect(toDrawingPayload(room('G1 Euro kitchen'), settings)).toEqual({
      payloadVersion: 1,
      units: 'in',
      room: { id: '7ee9fabb-5daf-4fb2-96f9-b24b9e1e546f', name: 'G1 Euro kitchen' },
      elevations: [
        {
          key: 'cb33d774-f31e-41c1-bbe4-198cbf981619', letter: 'A', wallId: 'cb33d774-f31e-41c1-bbe4-198cbf981619',
          side: 'front', title: 'Elevation A', wallLabel: 'Wall 1', length: 168, height: 96,
        },
        {
          key: '4afd9749-bbe8-4848-8a67-a1d063bdfce8', letter: 'B', wallId: '4afd9749-bbe8-4848-8a67-a1d063bdfce8',
          side: 'front', title: 'Elevation B', wallLabel: 'Wall 2', length: 120, height: 96,
        },
        {
          key: island, letter: 'C', wallId: island,
          side: 'front', title: 'Elevation C', wallLabel: 'Wall 4', length: 91.5, height: 36,
        },
        {
          key: `${island}:back`, letter: 'D', wallId: island,
          side: 'back', title: 'Elevation D', wallLabel: 'Wall 4', length: 91.5, height: 36,
        },
      ],
    });
    expect(toDrawingPayload(room('G3 Bath alcove'), settings).elevations.map(
      ({ letter, wallLabel, length, height }) => [letter, wallLabel, length, height],
    )).toEqual([['A', 'Wall 2', 168, 96]]);
  });

  it('names the zip after the room', () => {
    expect(drawingZipName('G1 Euro kitchen')).toBe('g1-euro-kitchen.zip');
    expect(drawingZipName('Bath #2 / Main')).toBe('bath-2-main.zip');
    expect(drawingZipName('  ')).toBe('room.zip');
  });
});
```

(Values checked against the golden fixture with today's model.) **Count:** 868 + 2 = **870**. Golden snapshot unchanged.

---

## §8 Step 312 — designer: the *Export DXF* button

**`src/api/apiClient.js`:** the fallback `baseURL` becomes `'http://localhost:3001'` (every caller already passes paths starting `/api/`; the old `'/api'` fallback doubled it). Nothing else.

**NEW `src/api/drawings.js`:**

```js
/** POST a drawing payload to the API; resolves the zip as a Blob (SPEC-40). */
export async function requestRoomDrawings(payload) { … }      // apiClient.post('/api/drawings/preview', payload, { responseType: 'blob' })

/** A readable message from a failed request: the API's JSON `error` (the body is a Blob), or "Could not reach the API at <baseURL>" when there was no response. */
export async function drawingErrorMessage(error) { … }

/** Save a Blob as a download via a temporary object URL and <a download>. */
export function saveBlob(blob, fileName) { … }
```

**NEW `src/elevation/components/ExportDxfButton.jsx`:** reads `rooms`, `activeRoomId`, `settings` from `state.elevation`. A button styled like *Zoom to fit* (`rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 …`), label *Export DXF*, *Exporting…* while busy; disabled while busy or with no active room. On click:
- `payload = toDrawingPayload(room, settings)`; with no elevations, show *Nothing to export: no wall has cabinets* and stop;
- otherwise `requestRoomDrawings(payload)` → `saveBlob(blob, drawingZipName(room.name))` → show *Exported N elevations*;
- on failure show `DXF export failed: <drawingErrorMessage(error)>`.

"Show" = `dispatch(setMessage(text))`, then clear it with `dispatch(setMessage(null))` after 4 s (keep the timeout in a ref; clear it on unmount), the same way `ElevationCanvas` does.

**`src/elevation/components/ElevationToolbar.jsx`:** import it and render `<ExportDxfButton />` immediately before the *Zoom to fit* button (≈ 215). Shown in both plan and elevation view. Nothing else in the toolbar changes.

**Count:** unchanged, **870**. Gate: `npm test && npm run lint && npm run build`.

**End-to-end check (Kyle):** three terminals' worth of setup is in PROMPTS-40 "Running it". Open G1, *Export DXF*: `g1-euro-kitchen.zip` downloads with `payload.json` and `elevation-A.dxf` … `elevation-D.dxf`; open A in CAD: 168 × 96, "ELEVATION A / Wall 1 / G1 Euro kitchen" under it, measures in inches. Stop the API and export again: *DXF export failed: Could not reach the API at http://localhost:3001*. Log out/in if the API answers 401.
