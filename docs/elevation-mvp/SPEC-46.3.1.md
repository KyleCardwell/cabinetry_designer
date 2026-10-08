# Round 46.3.1 — SPEC: depth on any cabinet; a room asks about missing door designs when it opens

Steps 417–419, designer only, on branch `elevation-doors` (after step 416, 1095 tests). Geometry and the API don't change.

**Done when:**
- Clicking any cabinet shows **Depth** and **Line up**, including a cabinet that was never split. Today only split cells and non-cabinet cells (panel, shelves…) show them.
- Opening a room whose door styles name a design the Library doesn't have shows a notice above the canvas. It names the design and the styles that use it, and has a **Move them to** select with a **Move** button. Moving fixes those styles in that room only.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **417** | designer | UI: Depth / Line up moved into `CellDepthSection`, shown for cabinets too | 1095 → **1096** |
| **418** | designer | `missingDoorDesigns` + `moveMissingDoorDesign` | **1099** |
| **419** | designer | UI: the missing-design notice above the canvas | 1099 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Today's values come from running the existing code read-only:
- `setCellDepth` on cabinet `a` of a never-split run (`[fixed('a', 30), auto('b')]`) already gives `{ id: 'a', kind: 'cabinet', depth: 21, align: 'back' }`.
- The golden document with `rooms[0].doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A', designId: 'gone' }]` normalizes and passes `isElevationDocument`.

If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got.

---

## §1 Decisions (2026-10-08)

### Depth on a cabinet that was never split (bug)

- **What's wrong.** `PieceProperties` sends a cabinet that isn't inside a split column (no `piece.columnId`) to `CabinetProperties`. The Depth section (SPEC-34) was only ever added to `CellProperties`, so plain cabinets have no depth fields. The reducer (`setCellDepth` → `setGridCellDepth`) already handles a whole-column cabinet; only the UI is missing.
- **Fix.** Move the Depth section out of `CellProperties` into a shared `CellDepthSection` and render it in both panels. In `CabinetProperties` it goes right after `CellKindSection`. Same fields, same labels, same aria-labels. It renders nothing for a void.

### Loading rooms, and door designs deleted while a room is closed (Kyle's question)

- **What loads.** Edit one room at a time. A project or phase page lists its rooms (names, dates), but only the open room's JSON document is in the editor. The team library (designs, team door style, profiles later) loads once per session, separately from rooms. Rooms refer to it by id. Today everything (rooms and library) sits in one localStorage document, so the Library's delete flow can move every room's styles at once. Once rooms live in Supabase, that's no longer true: a room that isn't open can't be fixed by a delete.
- **Ask when the room opens (Kyle).** When the open room has a style naming a design the library doesn't have, the room asks where to move it. That needs no stored "what to change to" rule, so each room can answer differently. Until it's answered, those faces draw with the built-in 5-piece design (today's fallback, warning `door-design-missing`). The room still loads and saves as it is.
- **Planned for the Supabase round (47.1), not built here:** deleting a design that any saved room uses **retires** it (a flag on the row) instead of removing it. A retired design leaves the pickers and the New list but still resolves, so a room drawn years ago draws and reports exactly as it was. Opening a room that uses a retired design shows the same notice with **Keep** beside **Move**. A design that's truly gone (bad data, a hard delete) gets **Move** only, which is what this round builds.
- **Open for 47.1:** editing a design (code, vendor) or the team door style (thickness) also reaches rooms drawn long ago. Whether a phase pins the library as it was when the phase was sent or approved is not decided.

### This round

- `missingDoorDesigns(room, designs)` → `[{ designId, styles: [{ styleId, label }] }]`. Each design id is listed once, in the order its first style appears in `room.doorStyles`. Its styles are in style order. Empty when nothing is missing or the room has no styles.
- `moveMissingDoorDesign({ roomId, designId, reassignTo })` sets `designId = reassignTo` on every style in that room naming `designId`, then re-syncs that room. It does nothing (returns before writing) when:
  - the room isn't found;
  - `designId` is in `settings.doorDesigns` (it's not missing; use the Library's delete instead);
  - no style in the room names it;
  - `reassignTo` isn't in `settings.doorDesigns`.
  Picks, other rooms and the settings are untouched.
- The team door style can't name a missing design (`isSettings` rejects it, step 413), so only room styles are checked.

---

## §2 Step 417 — UI: Depth and Line up on every cabinet

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/properties/CellProperties.jsx` | 280 | lines 177–203 moved out, replaced by `<CellDepthSection … />`; unused imports dropped |
| NEW `src/elevation/components/properties/CellDepthSection.jsx` | — | the moved section |
| `src/elevation/components/properties/CabinetProperties.jsx` | 303 | render it after `CellKindSection` (line 264) |
| NEW `src/elevation/store/__tests__/cabinetDepth.test.js` | — | 1 test, verbatim |

**Contract.**
- Move by script (rule 9), don't retype: cut `CellProperties.jsx` lines 177–203 (`{item.kind !== 'void' && (` through its closing `)}`) into NEW `CellDepthSection.jsx`:
  - `export default function CellDepthSection({ wall, run, piece, item, settings })`;
  - `if (item.kind === 'void') return null;`, then return the `<section>` (drop the `{item.kind !== 'void' && (` … `)}` wrapper);
  - `const dispatch = useDispatch();` and `const cellBase = { wallId: wall.id, runId: run.id, cellId: item.id };`;
  - copy `SELECT_CLASS` and `HEADING_CLASS` from `CellProperties.jsx` (lines 29–30);
  - imports: `useDispatch` (react-redux), `cellDepth` and `formatInchesInput` (`../../model/index.js`), `runFaceThickness` (`../../model/corners.js`), `setCellDepth` (`../../store/elevationSlice.js`), `InchInput` (`../InchInput.jsx`), `Field` (`./Field.jsx`).
- `CellProperties.jsx`: at the cut, `<CellDepthSection wall={wall} run={run} piece={piece} item={item} settings={settings} />`. Remove the imports only the moved section used: `cellDepth`, `formatInchesInput`, `runFaceThickness` (and its whole import line), `setCellDepth`. Keep everything else.
- `CabinetProperties.jsx`: import `CellDepthSection` and render `<CellDepthSection wall={wall} run={run} piece={piece} item={item} settings={settings} />` on the line after `<CellKindSection … />` (line 264). `settings` is already a prop.

**NEW `src/elevation/store/__tests__/cabinetDepth.test.js`**, verbatim. It pins the reducer the new fields rely on. It already passes before the UI change.

```js
import { describe, expect, it } from 'vitest';
import { gridLeaves } from '../../model/grid.js';
import elevationReducer, { setCellDepth } from '../elevationSlice.js';
import { auto, currentRun, fixed, run, stateWithRun } from './helpers/sliceFixtures.js';

const at = { wallId: 'wall-1', runId: 'run-1' };

describe('SPEC-46.3.1 depth on a cabinet that was never split', () => {
  it('sets depth and line-up on a whole-column cabinet, never deeper than the run', () => {
    const state = stateWithRun(run({ autoCount: false, items: [fixed('a', 30), auto('b')] }));
    const set = elevationReducer(state, setCellDepth({ ...at, cellId: 'a', depth: 21, align: 'back' }));
    expect(gridLeaves(currentRun(set).grid)).toEqual([
      { id: 'a', kind: 'cabinet', depth: 21, align: 'back' },
      { id: 'b', kind: 'cabinet' },
    ]);
    expect(elevationReducer(state, setCellDepth({ ...at, cellId: 'a', depth: 30 }))).toBe(state);
    const cleared = elevationReducer(set, setCellDepth({ ...at, cellId: 'a', depth: null, align: 'face' }));
    expect(gridLeaves(currentRun(cleared).grid)[0]).toEqual({ id: 'a', kind: 'cabinet' });
  });
});
```

**Don't touch:** `PieceProperties.jsx` (the routing stays), the store, the model, `CellKindSection.jsx`, other components.

**Count:** 1095 + 1 = **1096**. Golden snapshot unchanged.

---

## §3 Step 418 — `missingDoorDesigns` and `moveMissingDoorDesign`

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorDesigns.js` | 89 | add `missingDoorDesigns` |
| `src/elevation/store/slices/doorDesigns.js` | 64 | add `moveMissingDoorDesign` |
| `src/elevation/store/elevationSlice.js` | 189 | export it (next to `setTeamDoorStyle`, line 176) |
| NEW `src/elevation/store/__tests__/missingDoorDesigns.test.js` | — | 3 tests, verbatim |

**Contract.**
- `doorDesigns.js`: `export function missingDoorDesigns(room, designs)` as §1. A style is missing when no design in `designs` has its `designId`. Doc: *the designs a room's styles name that the library doesn't have (SPEC-46.3.1)*.
- `slices/doorDesigns.js`: `moveMissingDoorDesign(state, action)` as §1. Read with `current()` like the others. Find the room with `roomIndexFor(state, roomId)` from `./helpers.js` (add it to the import), then call `syncRoomAt(state, index)` after writing.
- `elevationSlice.js`: add `moveMissingDoorDesign` to the exported actions (the reducers object is already spread in).

**NEW `src/elevation/store/__tests__/missingDoorDesigns.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { missingDoorDesigns } from '../../model/doorDesigns.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import elevationReducer, { moveMissingDoorDesign } from '../elevationSlice.js';
import { isElevationDocument, normalizeElevationDocument } from '../persistence.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const style = (id, label, designId) => ({ ...DEFAULT_DOOR_STYLE, id, label, designId });
const A = style('ds-a', 'A', 'gone');
const B = style('ds-b', 'B', 'slab');
const C = style('ds-c', 'C', 'gone');
const D = style('ds-d', 'D', 'old');

/** A room with styles A–D: A and C name 'gone', D names 'old', B is fine. The room picks A. */
function base() {
  const state = stateWithRun(run({ autoCount: false, items: [auto('c1')] }));
  state.rooms[0].doorStyles = [A, B, C, D];
  state.rooms[0].doorStyleId = 'ds-a';
  return state;
}

describe('SPEC-46.3.1 door designs a room names that the library no longer has', () => {
  it('lists each missing design once with the styles that use it, in style order', () => {
    expect(missingDoorDesigns({ doorStyles: [A, B, C, D] }, DOOR_DESIGNS)).toEqual([
      { designId: 'gone', styles: [{ styleId: 'ds-a', label: 'A' }, { styleId: 'ds-c', label: 'C' }] },
      { designId: 'old', styles: [{ styleId: 'ds-d', label: 'D' }] },
    ]);
    expect([missingDoorDesigns({ doorStyles: [B] }, DOOR_DESIGNS), missingDoorDesigns({}, DOOR_DESIGNS)]).toEqual([[], []]);
  });

  it('still loads a room whose style names a missing design (it asks when it opens)', () => {
    const document = structuredClone(golden);
    document.rooms[0].doorStyles = [A];
    document.rooms[0].doorStyleId = 'ds-a';
    const loaded = normalizeElevationDocument(document);
    expect([isElevationDocument(loaded), loaded.rooms[0].doorStyles[0].designId, loaded.rooms[0].doorStyleId])
      .toEqual([true, 'gone', 'ds-a']);
  });

  it('moves one missing design\'s styles in that room to a listed design, and nothing else', () => {
    const state = base();
    const moved = elevationReducer(state, moveMissingDoorDesign({ roomId: 'room-1', designId: 'gone', reassignTo: 'slab' }));
    expect(moved.rooms[0].doorStyles.map(({ id, designId }) => [id, designId])).toEqual([
      ['ds-a', 'slab'], ['ds-b', 'slab'], ['ds-c', 'slab'], ['ds-d', 'old'],
    ]);
    expect(moved.rooms[0].doorStyleId).toBe('ds-a');
    expect(missingDoorDesigns(moved.rooms[0], moved.settings.doorDesigns).map(({ designId }) => designId)).toEqual(['old']);
    expect([
      moveMissingDoorDesign({ roomId: 'room-x', designId: 'gone', reassignTo: 'slab' }),
      moveMissingDoorDesign({ roomId: 'room-1', designId: 'gone', reassignTo: 'gone' }),
      moveMissingDoorDesign({ roomId: 'room-1', designId: 'gone', reassignTo: 'nope' }),
      moveMissingDoorDesign({ roomId: 'room-1', designId: 'slab', reassignTo: 'five-piece-square' }),
      moveMissingDoorDesign({ roomId: 'room-1', designId: 'unused', reassignTo: 'slab' }),
    ].every((action) => elevationReducer(state, action) === state)).toBe(true);
  });
});
```

**Don't touch:** `doorStyles.js`, `doorStyleResolve.js`, `persistence.js`, `slices/doorStyles.js`, the existing reducers in `slices/doorDesigns.js`, components, other tests.

**Count:** 1096 + 3 = **1099**. Golden snapshot unchanged.

---

## §4 Step 419 — UI: the notice when a room opens

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/components/MissingDoorDesignsNotice.jsx` | — | the notice |
| `src/elevation/ElevationLab.jsx` | 85 | render it between `<ElevationToolbar … />` and the canvas `div` (line 64) |

**Contract.**
- `MissingDoorDesignsNotice()` reads `rooms`, `activeRoomId` and `settings` from `state.elevation`. Room = the active room; `missing = missingDoorDesigns(room, settings.doorDesigns)`. It renders nothing when there's no room or `missing` is empty.
- Otherwise it renders a block `border-b border-amber-700 bg-amber-900/40 px-4 py-2 text-xs text-amber-100 space-y-2`, one row per missing design (`flex flex-wrap items-center gap-2`):
  - text: *Door design* `<code>{designId}</code>` *isn't in the Library any more. Style(s)* **A, C** *use it and draw as the built-in 5-piece until moved.* (Labels joined with `, `; "Style" when one, "Styles" when more.)
  - *Move them to* select (`aria-label={`Move styles using ${designId} to`}`) with every design in `settings.doorDesigns` as `<option value={id}>{code}</option>` (with ` · {vendor}` when the vendor isn't null), default the first. Keep the choice in local state keyed by `designId`.
  - **Move** button → `dispatch(moveMissingDoorDesign({ roomId: room.id, designId, reassignTo }))`.
  - Select and button classes: the `SELECT_CLASS` / `BUTTON_CLASS` look from `RoomDoorStylesPanel.jsx` lines 11–12. The select gets `w-auto` instead of `w-full`.
- `ElevationLab.jsx`: import it and render `<MissingDoorDesignsNotice />` right after `<ElevationToolbar … />`, before `<div className="relative min-h-0 flex-1">`. It shows in plan and elevation views.

**Don't touch:** the model, the store, `RoomDoorStylesPanel.jsx`, the Library pages, other components. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1099 tests.

---

## End-to-end check (Kyle)

**Cabinet depth (after 417):**
- Click a plain cabinet (never split). **Depth** and **Line up** show under the kind section. Type `21` with Line up = Backs: the box pulls forward from the wall in plan, faces still in line. Blank the field to go back to the run depth.
- A split cell still shows the same section in the same place as before.

**Missing door design (after 419).** Nothing in the app can cause this today, because the Library's delete moves every room's styles first. To see it:
1. In a room, make a style (Doors → New) and pick it for the room.
2. DevTools → Application → Local Storage → key `cd.elevationLab.v4`. In that room's `doorStyles`, change the style's `"designId"` to `"gone"`. Reload.
3. Open that room: the amber notice names `gone` and the style. The faces draw as 5-piece. Pick Slab and press **Move**: the notice goes, the faces turn slab, and the style tool shows Slab.
4. Another room using the same style id is not touched.

**Known for now:**
- No Keep / retired designs until the Supabase round (47.1).
- Library edits (rename, team thickness) still reach every room, old or new. Pinning per phase is still open (47.1).
