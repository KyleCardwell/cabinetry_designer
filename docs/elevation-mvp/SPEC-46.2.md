# Round 46.2 — SPEC: door details on the canvas

Steps 404–408, designer only, on branch `elevation-doors` (after step 403, 1057 tests). Geometry and the API don't change.
Doors & profiles rounds (DOORS-PROFILES-PLAN §10): 46 ✅ → 46.1 ✅ → 46.1.1 ✅ → **46.2 canvas door details** → 46.3 library screens → 46.4 door details in the DXF → 47+ profiles.

**Done when:**
- Every door, drawer front, false front and panel face on the elevation canvas draws its frame opening(s): the outline inset by its final stile/rail sizes (short-face rule, typed overrides), split by mid rails and mid stiles. Slab AM faces draw their molding rectangle(s) the same way. Slabs (by design or under the cutoff) draw nothing extra.
- Face-on panels do the same: back panel cells and blind corner panels.
- A room can switch to **Outlines only** (P8); the default is **Door details**. A room can turn on **style tags** (A, B, Std, Sheet) on each part; off by default.
- The stacking check and the resolver's warnings show: an amber dashed outline on the part on the canvas, and a message in the face properties.
- With no styles, rooms look the same as today plus the standard 3" frame openings (that's the new default). Plan view, DXF and the golden snapshot don't change.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **404** | designer | `partDetail`: a part's frame openings in wall coordinates | 1057 → **1062** |
| **405** | designer | `runDoorDetails`: every face-on part in a run, with its style label, openings and warnings | **1067** |
| **406** | designer | Room choices: `doorDetails`, `doorStyleTags` (helper, store, saved and validated) | **1070** |
| **407** | designer | Canvas: `DoorDetails.jsx` layer in `RunGroup` | 1070 |
| **408** | designer | UI: the two checkboxes in Door styles; door warnings in face properties | 1070 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. The face rectangles and piece ids in the tests come from running the existing code read-only on the golden rooms; the openings are worked out from the rules here. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got. Values marked ⚠ are the ones to report rather than change.

---

## §1 Decisions (Kyle, 2026-10-07, unless marked)

- **Default is Door details** (open question 5). Stored per room as `room.doorDetails: false` only when the room is switched to Outlines only; absent = details. No team setting yet.
- **Which parts:** faces (`door`, `pair_door` halves, `drawer_front`, `false_front`, `panel` faces; never `open`) and **face-on panels**: back panel cells (`panelOrientation(piece) === 'back'`) and blind corner panels (`scene.blind.entries` with a `panel`). Run end panels, wall end panels, side and top panel cells are seen edge-on in a front elevation and get nothing (their faces show in end elevations, a later TODO).
- **Style tags:** a room toggle, off by default, stored as `room.doorStyleTags: true` only when on. The tag is the resolved style's `label` (`Std` for the team default, `Sheet` for sheet slab).
- **What's drawn (Claude's defaults):** each opening is a thin rectangle (P4 loop 3 with every profile square; Slab AM's molding rectangle is §3.6 loop 3). Mid rails are on centre from the part's bottom edge, mid stiles from its left edge; both cut across the whole opening (a grid), and pieces smaller than 1e-6 are dropped, so a mid placed over a rail just trims the opening. Pair doors: each leaf gets its own detail with the face's `sizes`. Sheet slab panels and slab faces: no openings.
- **Rects:** a face's rect is its resolved face (`runFaceLayouts`); a back panel cell's is its drawn piece (`scene.drawnPieces`, after miters); a blind panel's is `{ x: panel.x, z: run.z, width: panel.width, height: run.height }`.
- **Styles:** faces resolve as `runFaceLayouts` does (`cabinetFaceLevels` on the face node, wall = `wallViewForRun(wall, run)`); back panel cells with `panelLevels(room, wall, run, leaf, { sheet: true })` (step 399's rule); blind panels with `panelLevels(room, wall, run, run.ends[side])` (no sheet default yet, TODO).
- **Warnings:** the resolver's warnings (`door-style-missing`, `door-design-missing`), one per part, tagged with the part's `key` and `pieceId`; the stacking check (`frontStackWarnings`) per cabinet over its non-slab faces, tagged with `pieceId` (pair halves give one warning, not two). Warned parts get an amber dashed outline even when details are off. Face properties list `front-panel-over-taller` and `door-design-missing`; `door-style-missing` is already shown by the Stiles & rails block.
- **Not in 46.2 (in `TODO.md`):** door details in the DXF (46.4); end elevations showing end panel / wall end panel faces; a test fixture with a blind corner panel (none of the golden rooms has one — Kyle checks it on the canvas); arched rails (51); profiles (50).

---

## §2 Step 404 — `partDetail`

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/doorDetails.js` | — | `partDetail` |
| NEW `src/elevation/model/__tests__/doorDetails.test.js` | — | 5 tests, verbatim |

**Contract.** Imports `partSizes` from `./doorSizes.js` only.

`partDetail(style, design, rect, sizes)` — `rect = { x, z, width, height }` in wall coordinates (z up), `sizes` the part's stored `sizes` or `undefined`.
- `r = partSizes(style, design, { width: rect.width, height: rect.height, sizes })` (pass `sizes` through as is; `partSizes` defaults it).
- `r.construction === 'slab'` → `{ ...r, openings: [] }`.
- Otherwise the opening `O = { x: rect.x + r.stiles.left, z: rect.z + r.rails.bottom, width: r.opening.width, height: r.opening.height }`.
  - Rows: the interval `[O.z, O.z + O.height]` minus the union of `[rect.z + at − width/2, rect.z + at + width/2]` for each of `r.midRails`; keep pieces longer than 1e-6, bottom to top.
  - Columns: the same across `[O.x, O.x + O.width]` with `r.midStiles` measured from `rect.x`, left to right.
  - `openings` = for each row (bottom first), each column (left first): `{ x, z, width, height }`.
  - Result: `{ construction: r.construction, openings, sizes: r }`.

Doc comment: frame openings (5-piece) or molding rectangles (Slab AM) of one part, in wall coordinates (SPEC-46.2, DOORS-PROFILES-PLAN §3.6).

**Don't touch:** `doorSizes.js`, anything else.

**NEW `src/elevation/model/__tests__/doorDetails.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { partSizes } from '../doorSizes.js';
import { partDetail } from '../doorDetails.js';

const [SQUARE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const S = DEFAULT_DOOR_STYLE;
const box = (x, z, width, height) => ({ x, z, width, height });

describe('SPEC-46.2 a part\'s door detail: frame openings in wall coordinates', () => {
  it('insets a 5-piece door by its stiles and rails (G1 base door)', () => {
    expect(partDetail(S, SQUARE, box(30.0625, 4.125, 23.875, 30.125))).toEqual({
      construction: 'five_piece',
      openings: [box(33.0625, 7.125, 17.875, 24.125)],
      sizes: partSizes(S, SQUARE, { width: 23.875, height: 30.125 }),
    });
  });

  it('uses the short-face rails, and gives a slab no openings', () => {
    expect(partDetail(S, SQUARE, box(1.5625, 28.375, 19.375, 5.875)).openings)
      .toEqual([box(4.5625, 30.25, 13.375, 2.125)]);
    expect(partDetail(S, SQUARE, box(0, 0, 15, 10), { rails: { top: 2 } }).openings)
      .toEqual([box(3, 3, 9, 5)]);
    expect([
      partDetail(S, SQUARE, box(0, 0, 15, 4.75)),
      partDetail(S, SLAB, box(0, 0, 15, 30)),
      partDetail(S, SLAB_AM, box(0, 0, 15, 4.75)),
    ]).toEqual([
      { construction: 'slab', slab: 'rule', openings: [] },
      { construction: 'slab', slab: 'design', openings: [] },
      { construction: 'slab', slab: 'rule', molding: false, openings: [] },
    ]);
  });

  it('splits the opening at a mid rail, on centre from the bottom edge (G1 tall leaf)', () => {
    expect(partDetail(S, SQUARE, box(0.8125, 4.125, 14.125, 85.75), { midRails: [{ at: 42 }] }).openings).toEqual([
      box(3.8125, 7.125, 8.125, 37.5),
      box(3.8125, 47.625, 8.125, 39.25),
    ]);
  });

  it('makes a grid of mid rails and stiles, in any order, and trims a mid that lands on a rail', () => {
    const rect = box(0, 0, 30, 40);
    expect(partDetail(S, SQUARE, rect, { midRails: [{ at: 20 }], midStiles: [{ at: 15, width: 2 }] }).openings)
      .toEqual([box(3, 3, 11, 15.5), box(16, 3, 11, 15.5), box(3, 21.5, 11, 15.5), box(16, 21.5, 11, 15.5)]);
    expect(partDetail(S, SQUARE, rect, { midRails: [{ at: 30 }, { at: 10 }] }).openings)
      .toEqual([box(3, 3, 24, 5.5), box(3, 11.5, 24, 17), box(3, 31.5, 24, 5.5)]);
    expect(partDetail(S, SQUARE, rect, { midRails: [{ at: 2 }] }).openings).toEqual([box(3, 3.5, 24, 33.5)]);
  });

  it('gives Slab AM its molding rectangles the same way', () => {
    const molding = partDetail(S, SLAB_AM, box(0, 0, 15, 30));
    expect([molding.construction, molding.openings]).toEqual(['slab_applied', [box(3, 3, 9, 24)]]);
    expect(partDetail(S, SLAB_AM, box(0, 0, 15, 30), { midStiles: [{ at: 7.5 }] }).openings)
      .toEqual([box(3, 3, 3, 24), box(9, 3, 3, 24)]);
  });
});
```

What the numbers are: 3" stiles and rails all round. The 5 7/8" drawer front's rails are 1 7/8" by the short-face rule (panel 2 1/8"). A 3" mid rail at 42" on a leaf starting at 4 1/8 cuts 44 5/8 to 47 5/8; the opening runs 7 1/8 to 86 7/8. A mid rail at 2" cuts 1/2 to 3 1/2, so only the opening above 3 1/2 is left.

**Count:** 1057 + 5 = **1062**.

---

## §3 Step 405 — `runDoorDetails`

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorDetails.js` | ~40 | `runDoorDetails` |
| NEW `src/elevation/model/__tests__/runDoorDetails.test.js` | — | 5 tests, verbatim |

**Contract.** New imports in `doorDetails.js`: `runScene` (`./runScene.js`), `panelOrientation` (`./cells.js`), `findLeaf` (`./cellTree.js`), `runItems` (`./grid.js`), `cabinetFaceLevels`, `facePartType`, `panelLevels`, `resolveDoorStyle` (`./doorStyleResolve.js`), `defaultFace` (`./faces.js`), `getFaceNode` (`./faceTree.js`), `frontStackWarnings` (`./doorSizes.js`), `wallViewForRun` (`./wallSides.js`). Check there's no import cycle (nothing imports `doorDetails.js` yet).

`runDoorDetails(room, wall, run, settings, scene = runScene(room, wall, run, settings))` → `{ parts, warnings }`. `levelsWall = wallViewForRun(wall, run)` for every level list.

Each part: `{ key, kind, pieceId, path, styleId, label, construction, x, z, width, height, openings }` — `styleId` / `label` from the resolved style, `construction` and `openings` from `partDetail(style, design, rect, sizes)`, `x…height` the rect. In this order:

1. **Faces**, `kind: 'face'`: for each `[pieceId, layout]` of `scene.faceLayouts` (map order), for each face of `layout.faces` (array order) whose `facePartType(face.type)` isn't null:
   - `item` = `layout.box.columnId ? findLeaf(run.grid, pieceId) : runItems(run).find((c) => c.id === pieceId)` (as `runFaceLayouts` does);
   - `node = getFaceNode(item?.face ?? defaultFace(layout.box.width, settings), face.path)`;
   - style from `resolveDoorStyle(room, settings, partType, cabinetFaceLevels(room, levelsWall, run, item, node))`; `sizes = node?.sizes`;
   - `key` = `${pieceId}:${face.path}` plus `:${face.half}` for a pair-door leaf; `path = face.path`.
2. **Back panel cells**, `kind: 'panelCell'`: each piece of `scene.drawnPieces` with `kind === 'panel'` and `panelOrientation(piece) === 'back'`; `leaf = findLeaf(run.grid, piece.id)`; style from `resolveDoorStyle(room, settings, 'panel', panelLevels(room, levelsWall, run, leaf, { sheet: true }))`; `sizes = leaf?.sizes`; `key` `panel:${piece.id}`, `pieceId` the piece id, `path: null`.
3. **Blind panels**, `kind: 'blindPanel'`: each `scene.blind.entries` entry with a `panel`; rect `{ x: panel.x, z: run.z, width: panel.width, height: run.height }`; `part = run.ends?.[entry.side] ?? null`; style from `panelLevels(room, levelsWall, run, part)`; `sizes = part?.sizes`; `key` `blind:${entry.side}`, `pieceId` `entry.endPieceId`, `path: null`.

`warnings`, in this order:
- every part's resolver warnings, in part order, each `{ ...warning, pieceId, key }`;
- then, for each `pieceId` of `scene.faceLayouts` in map order: `frontStackWarnings` over that piece's face parts whose `construction !== 'slab'`, each as `{ path, x, z, width, height, sizes }` (`sizes` = the `partDetail` result's `sizes`); keep the first of each `path`/`below` pair (pair-door halves repeat); each `{ code, pieceId, path, below }`.

**Don't touch:** `runScene.js`, `faceLayouts.js`, `doorSizes.js`, `doorStyleResolve.js`, anything else.

**NEW `src/elevation/model/__tests__/runDoorDetails.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { runDoorDetails } from '../doorDetails.js';
import { gridLeaves } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const C = { ...DEFAULT_DOOR_STYLE, id: 'ds-c', label: 'C', designId: 'slab-applied' };
const SL = { ...DEFAULT_DOOR_STYLE, id: 'ds-s', label: 'S', designId: 'slab' };

const G1_BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const CAB_24 = 'cfc9c904-3a11-43ee-a48d-88bef061b5ae';
const CAB_36 = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
const CAB_C = '0624c9d5-b951-4191-95f2-1562a6b32343';
const CAB_D = 'e3bfb331-0a5d-4cf2-aaba-929c53ca8c54';
const G3_BASE = '02c88254-9a83-4002-9fda-912cd06a2a21';
const G3_DRAWERS = '2648a74b-7f13-44c5-af7d-d1b88ae0d75c';
const G3_UPPER = 'bcdd4e78-0d52-40d0-9f5d-2901e590e98a';
const G3_BACK = '5f4db696-00e1-4303-9881-23a4d8ae7a64';

const box = (x, z, width, height) => ({ x, z, width, height });
const runOf = (room, id) => room.walls.flatMap((wall) => wall.runs).find((run) => run.id === id);
const leafOf = (run, id) => gridLeaves(run.grid).find((node) => node.id === id);
const part = (result, key) => result.parts.find((entry) => entry.key === key);

/** A golden room with P, C (Slab AM) and S (slab) listed, after `edit`, synced; one run's door details. */
function details(name, runId, edit = () => {}) {
  const room = structuredClone(stored(name));
  room.doorStyles = [P, C, SL];
  edit(room);
  const synced = syncRoom(room, settings);
  const wall = synced.walls.find((candidate) => candidate.runs.some((run) => run.id === runId));
  const view = resolveWall(synced, wall, 'front');
  return runDoorDetails(synced, view, view.runs.find((run) => run.id === runId), settings);
}

describe('SPEC-46.2 door details for a run', () => {
  it('gives every face in G1\'s base run the team default 5-piece detail', () => {
    const result = details('G1 Euro kitchen', G1_BASE);
    expect(result.parts.map(({ key }) => key)).toEqual([
      `${CAB_24}:r`, `${CAB_36}:r:left`, `${CAB_36}:r:right`,
      `${CAB_C}:r:left`, `${CAB_C}:r:right`, `${CAB_D}:r:left`, `${CAB_D}:r:right`,
    ]);
    expect(part(result, `${CAB_24}:r`)).toEqual({
      key: `${CAB_24}:r`,
      kind: 'face',
      pieceId: CAB_24,
      path: 'r',
      styleId: 'default',
      label: 'Std',
      construction: 'five_piece',
      ...box(30.0625, 4.125, 23.875, 30.125),
      openings: [box(33.0625, 7.125, 17.875, 24.125)],
    });
    expect(part(result, `${CAB_36}:r:right`).openings).toEqual([box(75.0625, 7.125, 11.875, 24.125)]);
    expect(result.warnings).toEqual([]);
  });

  it('labels each part with its style; Slab AM gets its molding rectangle, a slab face none', () => {
    const result = details('G1 Euro kitchen', G1_BASE, (r) => {
      r.doorStyleId = 'ds-c';
      leafOf(runOf(r, G1_BASE), CAB_36).face = { type: 'pair_door', size: null, styleId: 'ds-s' };
    });
    const cab24 = part(result, `${CAB_24}:r`);
    expect([cab24.styleId, cab24.label, cab24.construction, cab24.openings])
      .toEqual(['ds-c', 'C', 'slab_applied', [box(33.0625, 7.125, 17.875, 24.125)]]);
    expect(['left', 'right'].map((half) => {
      const leaf = part(result, `${CAB_36}:r:${half}`);
      return [leaf.label, leaf.construction, leaf.openings];
    })).toEqual([['S', 'slab', []], ['S', 'slab', []]]);
  });

  it('follows the short-face rule on G3\'s drawers, and warns when a shorter front above has a bigger panel', () => {
    const plain = details('G3 Bath alcove', G3_BASE);
    expect([0, 1, 2].map((index) => part(plain, `${G3_DRAWERS}:r.${index}`).openings)).toEqual([
      [box(4.5625, 30.25, 13.375, 2.125)],
      [box(4.5625, 19.25, 13.375, 6)],
      [box(4.5625, 7.125, 13.375, 6)],
    ]);
    expect(plain.warnings).toEqual([]);
    const tight = details('G3 Bath alcove', G3_BASE, (r) => {
      leafOf(runOf(r, G3_BASE), G3_DRAWERS).face.children[1].sizes = { rails: { top: 5, bottom: 5 } };
    });
    expect(part(tight, `${G3_DRAWERS}:r.1`).openings).toEqual([box(4.5625, 21.25, 13.375, 2)]);
    expect(tight.warnings).toEqual([
      { code: 'front-panel-over-taller', pieceId: G3_DRAWERS, path: 'r.0', below: 'r.1' },
    ]);
  });

  it('draws a back panel cell as sheet slab by default, and 5-piece when it picks a style (G3)', () => {
    expect(details('G3 Bath alcove', G3_UPPER).parts).toEqual([{
      key: `panel:${G3_BACK}`,
      kind: 'panelCell',
      pieceId: G3_BACK,
      path: null,
      styleId: 'sheet',
      label: 'Sheet',
      construction: 'slab',
      ...box(0.75, 36, 70.5, 41.25),
      openings: [],
    }]);
    const styled = details('G3 Bath alcove', G3_UPPER, (r) => {
      leafOf(runOf(r, G3_UPPER), G3_BACK).styleId = 'ds-p';
    });
    expect(styled.parts.map(({ label, construction, openings }) => [label, construction, openings]))
      .toEqual([['P', 'five_piece', [box(3.75, 39, 64.5, 35.25)]]]);
  });

  it('passes on the resolver\'s warnings, one per part, with the part\'s key', () => {
    const result = details('G1 Euro kitchen', G1_BASE, (r) => { r.doorStyleId = 'gone'; });
    expect(result.warnings.length).toBe(7);
    expect(result.warnings[0]).toEqual({
      code: 'door-style-missing', level: 'room', id: 'gone', pieceId: CAB_24, key: `${CAB_24}:r`,
    });
    expect(part(result, `${CAB_24}:r`).label).toBe('Std');
  });
});
```

What the numbers are: the face rectangles are what the existing code draws (G1's base run on its front view; G3's drawer stack 5 7/8 over two 12"s, x 1 9/16, 19 3/8 wide). 12" fronts keep 3" rails (6" panel). Typing 5" rails on the middle front leaves it a 2" panel, under the 2 1/8" panel of the shorter front above it, so the top front warns. G3's back panel cell is 70 1/2 × 41 1/4 at (3/4, 36); with style P its opening is 64 1/2 × 35 1/4. The top panel cell above it is edge-on (orientation `top`) and isn't a part. ⚠ If the back panel's rect comes out other than this, report it rather than change the test.

**Count:** 1062 + 5 = **1067**. Golden snapshot unchanged.

---

## §4 Step 406 — the room's choices: Door details, style tags

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorDetails.js` | ~110 | `doorDrawing` |
| `src/elevation/store/slices/doorStyles.js` | 114 | `setRoomDoorDrawing` |
| `src/elevation/store/elevationSlice.js` | 182 | export `setRoomDoorDrawing` (next to `setDoorStylePick`, line ~171) |
| `src/elevation/store/persistence.js` | 723 | `isRoom` (line 495) accepts the two keys |
| NEW `src/elevation/store/__tests__/sliceDoorDrawing.test.js` | — | 3 tests, verbatim |

**Contract.**
- `doorDrawing(room)` → `{ details: room?.doorDetails !== false, tags: room?.doorStyleTags === true }`. Doc comment: P8, Door details by default; style tags off by default (SPEC-46.2).
- `setRoomDoorDrawing({ roomId, doorDetails, doorStyleTags })`: `room = roomFor(state, roomId)`; return without a room. Each key counts only when it's an own key of the payload, and must then be a boolean, else return without changes. `doorDetails`: `true` deletes the key, `false` stores `false`. `doorStyleTags`: `true` stores `true`, `false` deletes. No sync (nothing in the model reads them).
- `isRoom`: add `&& (room.doorDetails === undefined || typeof room.doorDetails === 'boolean') && (room.doorStyleTags === undefined || typeof room.doorStyleTags === 'boolean')`.

**Don't touch:** `toElevationDocument` (room keys pass through), the schema version, other reducers, the UI.

**NEW `src/elevation/store/__tests__/sliceDoorDrawing.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { doorDrawing } from '../../model/doorDetails.js';
import elevationReducer, { setRoomDoorDrawing } from '../elevationSlice.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

const golden = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8')),
);
const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const withFirstRoom = (patch) => ({ ...golden, rooms: [{ ...golden.rooms[0], ...patch }, ...golden.rooms.slice(1)] });

describe('SPEC-46.2 door details on or off, style tags', () => {
  it('draws door details and hides style tags unless the room says otherwise', () => {
    expect([doorDrawing({}), doorDrawing(null), doorDrawing({ doorDetails: false, doorStyleTags: true })]).toEqual([
      { details: true, tags: false },
      { details: true, tags: false },
      { details: false, tags: true },
    ]);
  });

  it('stores only the choices that differ from the default', () => {
    const state = stateWithRun(run({ items: [auto('c1')] }));
    const off = apply(state, setRoomDoorDrawing({ doorDetails: false, doorStyleTags: true }));
    expect([off.rooms[0].doorDetails, off.rooms[0].doorStyleTags]).toEqual([false, true]);
    const back = apply(off, setRoomDoorDrawing({ doorDetails: true }), setRoomDoorDrawing({ doorStyleTags: false }));
    expect(['doorDetails' in back.rooms[0], 'doorStyleTags' in back.rooms[0]]).toEqual([false, false]);
    expect([
      setRoomDoorDrawing({ doorDetails: 'no' }),
      setRoomDoorDrawing({ doorDetails: false, doorStyleTags: 1 }),
      setRoomDoorDrawing({ roomId: 'gone', doorDetails: false }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true]);
  });

  it('saves and validates the choices', () => {
    const saved = withFirstRoom({ doorDetails: false, doorStyleTags: true });
    expect(isElevationDocument(saved)).toBe(true);
    expect(toElevationDocument(saved).rooms[0]).toMatchObject({ doorDetails: false, doorStyleTags: true });
    expect([withFirstRoom({ doorDetails: 'off' }), withFirstRoom({ doorStyleTags: 1 })].map(isElevationDocument))
      .toEqual([false, false]);
  });
});
```

**Count:** 1067 + 3 = **1070**.

---

## §5 Step 407 — canvas: the door details layer

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/components/DoorDetails.jsx` | — | draws openings, tags, warning outlines |
| `src/elevation/components/RunGroup.jsx` | 462 | compute and mount it (imports lines 1–24; mount between the `shelves` block, line ~322, and the `faceLayouts` / `FaceOutlines` block, line ~334) |

**`DoorDetails`** — props `{ parts, warnings, transform, showDetails, showTags }`; everything `listening={false}` (clicks go to faces and pieces as today). Follow `FaceOutlines.jsx` (`wallRectToScreen`, `Fragment` keyed by `part.key`). For each part:
- `showDetails`: each opening as a `Rect` from `wallRectToScreen(opening, transform)`, `stroke="#94a3b8"`, `strokeWidth={1}`, no fill; skip an opening whose screen width or height is under 2px.
- Warned: when some warning has `key === part.key`, or `code === 'front-panel-over-taller'` with `pieceId === part.pieceId` and `path === part.path`: a `Rect` over the part's own rect, `stroke="#f59e0b"`, `strokeWidth={1.5}`, `dash={[4, 2]}`. Drawn whether or not `showDetails`.
- `showTags`: a `Text` with `part.label` at the part's screen rect `x + 3`, `y + 3`, `fontSize={9}`, `fill="#c4b5fd"`, only when the screen rect is at least 14px wide and 12px tall.

**`RunGroup`**:
- Imports: `doorDrawing`, `runDoorDetails` from `../model/doorDetails.js`; `DoorDetails` from `./DoorDetails.jsx`.
- After `scene`: `const drawing = doorDrawing(room);` and `const doorDetails = useMemo(() => runDoorDetails(room, wall, run, settings, scene), [room, run, scene, settings, wall]);`.
- Mount `<DoorDetails parts={doorDetails.parts} warnings={doorDetails.warnings} transform={transform} showDetails={drawing.details} showTags={drawing.tags} />` between the shelves and the face outlines, so selected face outlines stay on top.

**Don't touch:** `FaceOutlines.jsx`, `PieceRect.jsx`, `ElevationCanvas.jsx`, the plan canvas, the model, the store.

UI only, no new tests. Gate: `npm test && npm run lint && npm run build`; 1070 tests.

---

## §6 Step 408 — UI: the room's checkboxes; door warnings in face properties

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/RoomDoorStylesPanel.jsx` | 157 | two checkboxes at the top of the section's `space-y-3` div (line 24) |
| `src/elevation/components/properties/FaceProperties.jsx` | 370 | door warnings join the face warnings (line 66); two messages (line 37) |

**`RoomDoorStylesPanel`**, first inside the `space-y-3` div, one row each (`flex items-center gap-2 text-xs text-gray-300`, a plain `<input type="checkbox">`):
- **Draw door details** — `checked={doorDrawing(room).details}`, change → `dispatch(setRoomDoorDrawing({ roomId: room.id, doorDetails: event.target.checked }))`; `aria-label` `Draw door details`.
- **Show style tags** — `checked={doorDrawing(room).tags}`, → `doorStyleTags`; `aria-label` `Show style tags`.
They show whether or not the room has styles (the team default draws details too).

**`FaceProperties`**:
- Import `runDoorDetails` from `../../model/doorDetails.js`.
- Line 66 becomes: the face layout's warnings, then `runDoorDetails(room, wall, run, settings).warnings` filtered to `pieceId === piece.id` and `code !== 'door-style-missing'` (the Stiles & rails block already says that one).
- `WARNING_MESSAGES` adds `'front-panel-over-taller': 'A shorter front above has a bigger panel than the one below it — adjust its rails.'` and `'door-design-missing': 'This face\'s door design is missing — drawn as 5-piece square.'`

**Don't touch:** `DoorStylePicks.jsx`, `PartStyleFields.jsx`, the store, the model.

UI only, no new tests. Gate: `npm test && npm run lint && npm run build`; 1070 tests.

---

## End-to-end check (Kyle)

- Open G1 (or any room): every door and drawer front shows a 3" frame opening; short drawer fronts show narrower rails; drawer fronts under 4 13/16" show no opening (slab).
- Room → Door styles → uncheck **Draw door details**: back to outlines only. Check **Show style tags**: each part shows `Std` (or its style's label).
- A style with design **Slab AM**: its faces show the molding rectangle; a **Slab** style: outlines only.
- Select a door, add a mid rail (Stiles & rails block): the opening splits on the canvas. Add a mid stile: a 2 × 2 grid.
- A drawer stack: type 5" rails on a lower 12" front → the shorter front above gets an amber dashed outline and the face properties say why.
- A back panel cell: plain (sheet slab) until you pick a 5-piece style on it; then it shows its frame.
- A blind corner with a visible blind panel: pick a 5-piece Panels style; the panel shows its frame (no golden room covers this — check it here).
- Plan view and DXF export: unchanged.

**Known for now (in `TODO.md`):**
- DXF doesn't show door details yet (46.4).
- End panels and wall end panels are edge-on here; their faces wait for end elevations.
- Profiles all square; arches later.
