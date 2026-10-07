# Round 46.1.1 — SPEC: "Team default" picks, panels at their style's thickness

Steps 396–399, designer only, on branch `elevation-doors` (after step 395). Geometry and the API don't change.
Follows Kyle's testing of 46.1 (2026-10-07): the Drawer fronts / Panels pickers said "Inherit (Std …)" while they were really following the room's Doors pick, there was no way to choose the team default on purpose, and end panels didn't change with a 1" style.

**Done when:**
- Drawer fronts and Panels pickers read **Same as doors (B · 5PC · 1")** when they follow the doors, counting the Doors pick on the same level.
- Every picker (Doors, Drawer fronts, Panels, and a part's own picker) offers **Team default (…)**, saved as `'default'`; deleting a used style can move its uses to the team default.
- End panels, wall end panels and new panel cells are their panel style's thickness (Same as doors by default) unless a width is typed. A face frame end stile over a 13/16" end panel comes out 1/16" wider by itself; the boxes take up the difference.
- With no styles in a room, every number is what it is today.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **396** | designer | "Team default" pick; picker labels say "Same as doors" | 1037 → **1040** |
| **397** | designer | Run end panels and wall end panels at their style's thickness | **1047** |
| **398** | designer | New and converted panel cells at their style's thickness | **1050** |
| **399** | designer | UI: pickers pass their level, Team default in delete, width placeholders | 1050 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Today's values in the tests come from running the existing code read-only on the golden rooms; the new values are worked out from the rules here. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got. Values marked ⚠ are the ones to report rather than change.

---

## §1 Decisions (Kyle, 2026-10-07, unless marked)

- **Drawer fronts and panels still follow the doors** when nothing picks them (P12, P15 unchanged). The picker's blank option says so: *Same as doors (…)* when the style comes from a Doors pick or from the team (nothing picked anywhere), *Inherit (…)* when a Drawer-fronts / Panels pick above supplies it. The label now counts this level's own Doors pick (the room's Drawer fronts picker sees the room's Doors pick).
- **"Team default" is a pick**, stored as the reserved id `'default'` (already refused as a room style id). It resolves to `teamDoorStyle(settings)` with the level and key it was picked at, at any level and on any part, and stops the walk like any other pick. A missing-style warning never fires for it.
- **Panels are as thick as their style** (panel chain, then the door chain). A typed width always wins.
- **Interim team panel thickness (Claude's default).** When a panel resolves to the team default style (nothing picked, or Team default picked), it's `settings.endPanelThickness`, not `settings.doorThickness`. Every saved room and golden room stays as it is; Kyle sets **Settings → End panel thickness** to 13/16" to get 13/16" panels everywhere now. 46.3 folds both settings into the team default style. Pickers show 3/4" (or whatever the setting is) for the team default on the Panels picker.
- **The drawn run width wins.** Thicker end panels make the boxes narrower; nothing grows the run or rounds the boxes. Face frame end stiles over a mitered end panel follow the panel's thickness on their own (beaded 1 3/4" → 1 13/16", inset 1 1/2" → 1 9/16"). Odd automatic box sizes are a TODO (`TODO.md`, idea inbox: "Odd box sizes from end panel thickness").
- **Derived, never saved:** `run._endThickness = { left?, right? }` and `wall._endPanelThickness = { start?, end? }`, only for sides whose thickness differs from `settings.endPanelThickness`; computed in the first `syncRoom` pass, for each side whatever its end type (joined runs rebuild auto ends later in the same pass).
- **Panel cells** get the style's thickness when they're made (add panel, wrap, kind → panel) or their panel type changes. An existing panel cell keeps its size until then (its size is a stored track size).
- **Not in 46.1.1:** blind end panels (sized by the blind rules), the shelves back panel, `splitRun.js` line 319 (end panel piece depth), rounding or warning on box sizes (TODO), the face frame stile note on reports (reports round).

---

## §2 Step 396 — "Team default" pick; "Same as doors"

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorStyleResolve.js` | 102 | a pick of `'default'` is the team style |
| `src/elevation/model/doorStyleEdits.js` | 172 | `pickOptions` takes the level's own node; Team default option; labels |
| `src/elevation/store/slices/doorStyles.js` | 125 | `'default'` is a valid pick and reassign target |
| `src/elevation/model/__tests__/partStyleEdits.test.js` | ~150 | replace one `it` block with two (below) |
| NEW `src/elevation/model/__tests__/teamDefaultPick.test.js` | — | 2 tests, verbatim |

**Contract.**
- `resolveDoorStyle`, in `pick()`: an id of `'default'` sets `style = teamDoorStyle(settings)` and `source = { level, key }` and returns true, before the room-list lookup. Nothing else changes.
- `pickOptions(room, settings, partType, levelsAbove, node = null)`:
  - `ownKey` = `doorStyleId` / `drawerFrontStyleId` / `panelStyleId` for `door` / `drawer_front` / `panel`.
  - `levels` = `node ? [{ level: 'here', node: <node without ownKey> }, ...levelsAbove] : levelsAbove`; `{ style, design, source } = resolveDoorStyle(room, settings, partType, levels)`.
  - `prefix` = `'Same as doors'` when `partType !== 'door'` and (`source.level === 'team'` or `source.key === 'doorStyleId'`), else `'Inherit'`. `inherit = { id: style.id, text: `${prefix} (${row})` }`.
  - `options` = `[{ id: 'default', text: `Team default (${teamRow})` }, ...room styles as today]`, `teamRow` from `teamDoorStyle(settings)` and `findDoorDesign(DEFAULT_DESIGN_ID)`.
  - A row's thickness is `settings.endPanelThickness` when `partType === 'panel'` and the row's style id is `'default'`; otherwise the style's thickness (the private `styleRow` gets the thickness passed in, or the partType and settings).
- Store (`slices/doorStyles.js`): a private `isChoice(room, id)` = `id === 'default'` or a listed id. `setDoorStylePick` and `setPartStyle` use it for a non-null `styleId`. `deleteDoorStyle`'s `reassignTo` may be `null`, `'default'` or another listed id (still not `styleId`).

**Edit `partStyleEdits.test.js`**: replace the whole `it('lists the room\'s styles and what a level inherits from the levels above it', …)` block with these two, verbatim (imports unchanged):

```js
  it('lists the team default and the room\'s styles, and what a level inherits from above', () => {
    const room = { doorStyles: [A, B, C], doorStyleId: 'ds-b' };
    expect(pickOptions(room, DEFAULT_SETTINGS, 'door', [])).toEqual({
      inherit: { id: 'default', text: 'Inherit (Std · 5PC · 13/16")' },
      options: [
        { id: 'default', text: 'Team default (Std · 5PC · 13/16")' },
        { id: 'ds-a', text: 'A · 5PC · 13/16"' },
        { id: 'ds-b', text: 'B · 5PC · 1"' },
        { id: 'ds-c', text: 'C · Slab AM · 3/4"' },
      ],
    });
    expect(pickOptions(room, DEFAULT_SETTINGS, 'door', [{ level: 'room', node: room }], {}).inherit)
      .toEqual({ id: 'ds-b', text: 'Inherit (B · 5PC · 1")' });
    expect(pickOptions({}, { ...DEFAULT_SETTINGS, doorThickness: 1 }, 'door', [])).toEqual({
      inherit: { id: 'default', text: 'Inherit (Std · 5PC · 1")' },
      options: [{ id: 'default', text: 'Team default (Std · 5PC · 1")' }],
    });
  });

  it('shows drawer fronts and panels following the doors, counting this level\'s own Doors pick', () => {
    const room = { doorStyles: [A, B, C], doorStyleId: 'ds-b', drawerFrontStyleId: 'ds-a' };
    expect(pickOptions(room, DEFAULT_SETTINGS, 'drawer_front', [], room).inherit)
      .toEqual({ id: 'ds-b', text: 'Same as doors (B · 5PC · 1")' });
    expect(pickOptions(room, DEFAULT_SETTINGS, 'panel', [], room).inherit)
      .toEqual({ id: 'ds-b', text: 'Same as doors (B · 5PC · 1")' });
    const above = [{ level: 'room', node: { ...room, drawerFrontStyleId: 'default', panelStyleId: 'ds-c' } }];
    expect(pickOptions(room, DEFAULT_SETTINGS, 'drawer_front', above, {}).inherit)
      .toEqual({ id: 'default', text: 'Inherit (Std · 5PC · 13/16")' });
    expect(pickOptions(room, DEFAULT_SETTINGS, 'panel', above, {}).inherit)
      .toEqual({ id: 'ds-c', text: 'Inherit (C · Slab AM · 3/4")' });
    expect(pickOptions({}, DEFAULT_SETTINGS, 'panel', [], {})).toEqual({
      inherit: { id: 'default', text: 'Same as doors (Std · 5PC · 3/4")' },
      options: [{ id: 'default', text: 'Team default (Std · 5PC · 3/4")' }],
    });
  });
```

**NEW `src/elevation/model/__tests__/teamDefaultPick.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { cabinetFaceLevels, resolveDoorStyle } from '../doorStyleResolve.js';
import { gridLeaves } from '../grid.js';
import elevationReducer, { deleteDoorStyle, setDoorStylePick, setPartStyle } from '../../store/elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';

const S = DEFAULT_SETTINGS;
const T = { ...DEFAULT_DOOR_STYLE, id: 'ds-t', label: 'T', thickness: 1 };

describe('SPEC-46.1.1 picking the team default on purpose', () => {
  it('resolves a "default" pick to the team style, at the level it was picked', () => {
    const room = { doorStyles: [T], doorStyleId: 'ds-t', drawerFrontStyleId: 'default' };
    const door = resolveDoorStyle(room, S, 'door', cabinetFaceLevels(room, null, null, { doorStyleId: 'default' }, { type: 'door' }));
    expect([door.style, door.source, door.warnings])
      .toEqual([DEFAULT_DOOR_STYLE, { level: 'cabinet', key: 'doorStyleId' }, []]);
    const drawer = resolveDoorStyle(room, S, 'drawer_front', cabinetFaceLevels(room, null, null, {}, { type: 'drawer_front' }));
    expect([drawer.style.id, drawer.source]).toEqual(['default', { level: 'room', key: 'drawerFrontStyleId' }]);
    const face = resolveDoorStyle(room, S, 'door', cabinetFaceLevels(room, null, null, {}, { type: 'door', styleId: 'default' }));
    expect([face.style.id, face.source]).toEqual(['default', { level: 'face', key: 'styleId' }]);
    expect(resolveDoorStyle(room, { ...S, doorThickness: 1 }, 'door', [{ level: 'run', node: { doorStyleId: 'default' } }]).style.thickness)
      .toBe(1);
  });

  it('accepts the team default as a pick, a part\'s style and a reassign target in the store', () => {
    const at = { wallId: 'wall-1', runId: 'run-1' };
    const state = stateWithRun(run({
      autoCount: false,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: null } },
      items: [auto('c1')],
    }));
    state.rooms[0].doorStyles = [T];
    state.rooms[0].doorStyleId = 'ds-t';
    const picked = [
      setDoorStylePick({ level: 'cabinet', ...at, itemIds: ['c1'], key: 'doorStyleId', styleId: 'default' }),
      setPartStyle({ ...at, part: 'runEnd', side: 'left', styleId: 'default' }),
    ].reduce(elevationReducer, state);
    const c1 = gridLeaves(currentRun(picked).grid).find((node) => node.id === 'c1');
    expect([c1.doorStyleId, currentRun(picked).ends.left.styleId, '_doorThickness' in currentRun(picked)])
      .toEqual(['default', 'default', false]);
    const deleted = elevationReducer(picked, deleteDoorStyle({ styleId: 'ds-t', reassignTo: 'default' }));
    expect([deleted.rooms[0].doorStyleId, 'doorStyles' in deleted.rooms[0]]).toEqual(['default', false]);
  });
});
```

What the numbers are: the room picks T (1") for doors, but the cabinet picks the team default, so its only door is 13/16" and the run has no `_doorThickness`. Panels' team default reads 3/4" because `DEFAULT_SETTINGS.endPanelThickness` is 3/4".

**Don't touch:** `DoorStylePicks.jsx`, `PartStyleFields.jsx`, `RoomDoorStylesPanel.jsx` (step 399), `persistence.js` (`'default'` already passes `isStyleRef`).

**Count:** 1037 − 1 + 2 + 2 = **1040**.

---

## §3 Step 397 — run end panels and wall end panels at their style's thickness

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/panelThickness.js` | — | `panelThickness`, `runEndThickness`, `wallPanelThickness` |
| `src/elevation/model/roomSync.js` | 403 | `withEndThickness`, `withWallPanelThickness` in the first pass |
| `src/elevation/model/splitRun.js` | 622 | `endWidth` takes the derived thickness (lines 73–74, 90, 269, 347) |
| `src/elevation/model/runPins.js` | 145 | `storedEndMinimum` the same (lines 40–41, 125, 127) |
| `src/elevation/model/extensions.js` | 204 | `extendedEndPiece` line 167 |
| `src/elevation/model/wallSides.js` | 53 | `wallEndPanelAt` line 40 |
| `src/elevation/model/wallEndPanels.js` | 182 | `wallEndPanels` line 83 |
| `src/elevation/store/persistence.js` | 718 | `toElevationDocument` strips `_endThickness` (runs) and `_endPanelThickness` (walls) |
| NEW `src/elevation/model/__tests__/panelThickness.test.js` | — | 7 tests, verbatim |

**Contract.**
- `panelThickness.js` (imports `panelLevels`, `resolveDoorStyle` from `./doorStyleResolve.js`):
  - `panelThickness(room, wall, run, part, settings)` → `resolveDoorStyle(room, settings, 'panel', panelLevels(room, wall, run, part)).style`; its `thickness`, except `settings.endPanelThickness` when the style's id is `'default'`. Doc comment: interim team panel thickness until 46.3 (SPEC-46.1.1).
  - `runEndThickness(room, wall, run, settings)` → `{ left, right }`, each `panelThickness(room, wall, run, run.ends?.[side] ?? null, settings)`.
  - `wallPanelThickness(room, wall, settings)` → `{ start, end }`, each `panelThickness(room, wall, null, panel, settings)` for a non-null `wall.endPanels?.[endpoint]`, else `null`.
- `roomSync.js`, following `withDoorThickness` (line 96):
  - `withEndThickness(room, wall, run, settings)`: keep each side of `runEndThickness` that differs from `settings.endPanelThickness` by more than 1e-9; none → remove `_endThickness` (same run when it has none); else set it (same run when equal by `JSON.stringify`).
  - `withWallPanelThickness(room, wall, settings)`: the same with `wallPanelThickness` (skip `null`) and `_endPanelThickness`.
  - The first pass (lines ~173–181) becomes: `nextRoom.walls.map((wall) => ({ ...withWallPanelThickness(nextRoom, wall, settings), runs: wall.runs.map((run) => withRunPlane(wall, withEndThickness(nextRoom, wall, withDoorThickness(…as today…), settings))) }))`.
- Readers (the typed width always first):
  - `splitRun.js`: `endWidth(end, settings, thickness)` → `end.width ?? thickness ?? settings.endPanelThickness` for `end_panel` (fillers unchanged). Line 90 passes `run._endThickness?.left` / `?.right`; `addEnd` (line 269) and `outerMinimum` (line 347) pass `run._endThickness?.[side]`.
  - `runPins.js`: `storedEndMinimum(end, settings, thickness)` the same; lines 125/127 pass `run._endThickness?.left` / `?.right`.
  - `extensions.js` line 167: the `end_panel` branch uses `run._endThickness?.[side] ?? settings.endPanelThickness`.
  - `wallSides.js` line 40 and `wallEndPanels.js` line 83: `width ?? (wall.sideSource ?? wall)._endPanelThickness?.[endpoint] ?? settings.endPanelThickness` (`source` in `wallEndPanels`).
- `persistence.js` `toElevationDocument`: strip `_endThickness` with the other run keys (and its `void`), and map each wall to drop `_endPanelThickness`.

**Don't touch:** `splitRun.js` line 319, `cells.js`, `blind.js`, `frames.js` (the stile follows the boxes), `isElevationDocument`, the store, the UI, other tests. The golden snapshot must not change.

**NEW `src/elevation/model/__tests__/panelThickness.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { elevationParts } from '../elevationParts.js';
import { layoutRun } from '../faceLayouts.js';
import { syncRoom } from '../room.js';
import { wallEndPanels } from '../wallEndPanels.js';
import { normalizeElevationDocument, toElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const T = { ...DEFAULT_DOOR_STYLE, id: 'ds-t', label: 'T', thickness: 1 };
const G1_TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const G1_CAB = '28072a7d-e691-40d1-a005-4d0ed1c9e825';
const G2_TALL = 'a42e9a57-a98f-47f0-b6b4-9076b513db6e';
const G2_CAB = '34fe234e-6748-40a7-87f1-fcdfa88a707d';
const G2_FRAME_CAB = '352bd8c0-79a1-4210-a428-cfe95038118f';
const G2_PANEL_WALL = '64da569f-6c94-408d-809a-37c6e1f9755f';
const G2_PANEL_RUN = '4b49c071-463c-461e-b750-005d3fe8bec7';

const wallOf = (room, runId) => room.walls.find((wall) => wall.runs.some((run) => run.id === runId));
const runOf = (room, runId) => wallOf(room, runId).runs.find((run) => run.id === runId);
const pieces = (room, runId) => layoutRun(room, wallOf(room, runId), runOf(room, runId), settings).pieces
  .map(({ id, x, width }) => [id, x, width]);

/** A golden room with P (13/16") and T (1") listed, after `edit` picks where they're used, synced. */
function styled(name, edit) {
  const room = structuredClone(stored(name));
  room.doorStyles = [P, T];
  edit(room);
  return syncRoom(room, settings);
}

describe('SPEC-46.1.1 end panels at their panel style\'s thickness', () => {
  it('leaves a room with no styles as it was (G1 tall: 3/4" panels, 28 1/2" box)', () => {
    const room = syncRoom(stored('G1 Euro kitchen'), settings);
    expect('_endThickness' in runOf(room, G1_TALL)).toBe(false);
    expect(pieces(room, G1_TALL)).toEqual([
      [`${G1_TALL}:left`, 0, 0.75], [G1_CAB, 0.75, 28.5], [`${G1_TALL}:right`, 29.25, 0.75],
    ]);
  });

  it('makes both end panels 13/16" with a 13/16" panel style; the box takes up the difference', () => {
    const room = styled('G1 Euro kitchen', (r) => { r.panelStyleId = 'ds-p'; });
    expect(runOf(room, G1_TALL)._endThickness).toEqual({ left: 0.8125, right: 0.8125 });
    expect(pieces(room, G1_TALL)).toEqual([
      [`${G1_TALL}:left`, 0, 0.8125], [G1_CAB, 0.8125, 28.375], [`${G1_TALL}:right`, 29.1875, 0.8125],
    ]);
  });

  it('follows the doors when no panel style is picked', () => {
    const room = styled('G1 Euro kitchen', (r) => { r.doorStyleId = 'ds-t'; });
    expect([runOf(room, G1_TALL)._endThickness, runOf(room, G1_TALL)._doorThickness])
      .toEqual([{ left: 1, right: 1 }, 1]);
    expect(pieces(room, G1_TALL).map(([, , width]) => width)).toEqual([1, 28, 1]);
  });

  it('keeps a typed width, the setting for the team default, and an end\'s own style', () => {
    const typed = styled('G1 Euro kitchen', (r) => {
      r.panelStyleId = 'ds-p';
      runOf(r, G1_TALL).ends.left.width = 0.75;
    });
    expect(pieces(typed, G1_TALL).map(([, , width]) => width)).toEqual([0.75, 28.4375, 0.8125]);
    const team = styled('G1 Euro kitchen', (r) => { r.doorStyleId = 'ds-t'; r.panelStyleId = 'default'; });
    expect('_endThickness' in runOf(team, G1_TALL)).toBe(false);
    const own = styled('G1 Euro kitchen', (r) => { runOf(r, G1_TALL).ends.left.styleId = 'ds-t'; });
    expect([runOf(own, G1_TALL)._endThickness, pieces(own, G1_TALL).map(([, , width]) => width)])
      .toEqual([{ left: 1 }, [1, 28.25, 0.75]]);
  });

  it('widens a beaded face frame\'s end stiles by the extra 1/16" (G2 tall)', () => {
    const room = styled('G2 Face frame kitchen', (r) => { r.panelStyleId = 'ds-p'; });
    expect(pieces(room, G2_TALL)).toEqual([
      [`${G2_TALL}:left`, 50, 0.8125], [G2_CAB, 51.0625, 24.375], [`${G2_TALL}:right`, 75.6875, 0.8125],
    ]);
    const parts = elevationParts(room, wallOf(room, G2_TALL), 'front', settings);
    const at = (id) => parts.find((part) => part.id === id);
    expect([at(`frame:${G2_FRAME_CAB}`).x, at(`frame:${G2_FRAME_CAB}`).width]).toEqual([50, 26.5]);
    expect([at(`${G2_FRAME_CAB}:rleft`).x, at(`${G2_FRAME_CAB}:rleft`).width, at(`${G2_FRAME_CAB}:rright`).x])
      .toEqual([51.8125, 11.4375, 63.25]);
  });

  it('makes a wall end panel its style\'s thickness, and the mitered frame sees it (G2)', () => {
    const room = styled('G2 Face frame kitchen', (r) => { r.panelStyleId = 'ds-p'; });
    const wall = room.walls.find((candidate) => candidate.id === G2_PANEL_WALL);
    expect([wall._endPanelThickness, wallEndPanels(room, wall, settings).map(({ width }) => width)])
      .toEqual([{ end: 0.8125 }, [0.8125]]);
    expect(runOf(room, G2_PANEL_RUN)._frame.wallPanels.right.width).toBe(0.8125);
    const typed = styled('G2 Face frame kitchen', (r) => {
      r.panelStyleId = 'ds-p';
      r.walls.find((candidate) => candidate.id === G2_PANEL_WALL).endPanels.end.width = 0.75;
    });
    const typedWall = typed.walls.find((candidate) => candidate.id === G2_PANEL_WALL);
    expect(wallEndPanels(typed, typedWall, settings).map(({ width }) => width)).toEqual([0.75]);
  });

  it('never saves the derived thicknesses', () => {
    const room = styled('G2 Face frame kitchen', (r) => { r.panelStyleId = 'ds-p'; });
    const saved = toElevationDocument({ ...document, rooms: [room] }).rooms[0];
    expect('_endThickness' in runOf(saved, G2_TALL)).toBe(false);
    expect('_endPanelThickness' in saved.walls.find((wall) => wall.id === G2_PANEL_WALL)).toBe(false);
    expect(saved.panelStyleId).toBe('ds-p');
  });
});
```

What the numbers are: today G1's tall run is 30" wide with 3/4" end panels and one 28 1/2" box; G2's beaded tall run is 26 1/2" with 3/4" panels, a 1/4" bead gap each side, a 24 1/2" box at 51, and faces at 51 3/4 (1 3/4" stile) and 63 1/4, 11 1/2" wide. A 13/16" panel takes 1/16" more at each end: G1's box 28 3/8" at 13/16; G2's box 24 3/8" at 51 1/16, the left face 1/16" further in (1 13/16" stile) and each leaf 1/16" narrower, so the right leaf still starts at 63 1/4. With 1" panels G1's box is 28". One end typed at 3/4" with the other at 13/16" leaves 28 7/16"; a 1" left end with a 3/4" right one leaves 28 1/4". ⚠ If G2's frame part or faces come out other than above, report it rather than change the test.

**Count:** 1040 + 7 = **1047**. Golden snapshot unchanged.

---

## §4 Step 398 — panel cells at their style's thickness

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/store/slices/cells.js` | 221 | the four `state.settings.endPanelThickness` reads (lines 115, 156, 167, 178) |
| NEW `src/elevation/store/__tests__/slicePanelThickness.test.js` | — | 3 tests, verbatim |

**Contract.** Import `panelThickness` from `../../model/panelThickness.js`. Each site passes `panelThickness(location.room, location.wall, location.run, part, state.settings)` in place of `state.settings.endPanelThickness`, where `part` is:
- `setCellKind` (line 115): the new leaf in `grid` after `setGridCellKind` (`findLeaf(grid, cellId)`, no style yet), so the run/wall/room picks decide;
- `wrapCell` (156) and `addPanel` (178): `null` (new cells);
- `setPanelType` (167): the existing leaf, `findLeaf(before, cellId)`, so a panel's own style counts.

The drafts are only read (`resolveDoorStyle` doesn't mutate). Existing panel cells keep their stored sizes until one of these actions runs.

**Don't touch:** `cellTree.js`, other reducers, the model.

**NEW `src/elevation/store/__tests__/slicePanelThickness.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import { gridLeaves, runItems } from '../../model/grid.js';
import elevationReducer, { addPanel, setCellKind, setPanelType, setPartStyle } from '../elevationSlice.js';
import { auto, currentRun, fixed, run, stateWithRun } from './helpers/sliceFixtures.js';

const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const T = { ...DEFAULT_DOOR_STYLE, id: 'ds-t', label: 'T', thickness: 1 };
const at = { wallId: 'wall-1', runId: 'run-1' };
const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const plain = () => stateWithRun(run({ autoCount: false, items: [fixed('a', 30), auto('b')] }));

/** Cabinet a (30") and b (auto), with P (13/16") and T (1") listed and the given room picks. */
function base(picks) {
  const state = plain();
  Object.assign(state.rooms[0], { doorStyles: [P, T] }, picks);
  return state;
}

describe('SPEC-46.1.1 panel cells at their panel style\'s thickness', () => {
  it('adds and converts panel cells at the room\'s panel style', () => {
    const added = apply(base({ panelStyleId: 'ds-p' }), addPanel({ ...at, cellId: 'b', side: 'left' }));
    expect(runItems(currentRun(added))[1].width).toBe(0.8125);
    const turned = apply(base({ panelStyleId: 'ds-p' }), setCellKind({ ...at, cellId: 'a', kind: 'panel' }));
    expect(currentRun(turned).grid.cols[0].size).toBe(0.8125);
  });

  it('follows the doors, and keeps the setting for the team default or no styles', () => {
    const doors = apply(
      base({ doorStyleId: 'ds-t' }),
      setCellKind({ ...at, cellId: 'a', kind: 'panel' }),
      setPanelType({ ...at, cellId: 'a', type: 'back' }),
    );
    const a = gridLeaves(currentRun(doors).grid).find((node) => node.id === 'a');
    expect([a.depth, a.align]).toEqual([1, 'back']);
    const kind = setCellKind({ ...at, cellId: 'a', kind: 'panel' });
    expect([
      currentRun(apply(plain(), kind)).grid.cols[0].size,
      currentRun(apply(base({ doorStyleId: 'ds-t', panelStyleId: 'default' }), kind)).grid.cols[0].size,
    ]).toEqual([0.75, 0.75]);
  });

  it('uses a panel\'s own style when its type is set again', () => {
    const state = apply(
      base({ panelStyleId: 'ds-p' }),
      setCellKind({ ...at, cellId: 'a', kind: 'panel' }),
      setPartStyle({ ...at, part: 'panelCell', cellId: 'a', styleId: 'ds-t' }),
      setPanelType({ ...at, cellId: 'a', type: 'side' }),
    );
    expect(currentRun(state).grid.cols[0].size).toBe(1);
  });
});
```

**Count:** 1047 + 3 = **1050**.

---

## §5 Step 399 — UI: pickers pass their level; Team default in delete; width placeholders

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/properties/DoorStylePicks.jsx` | ~45 | `pickOptions(…, levelsAbove, node ?? {})` |
| `src/elevation/components/RoomDoorStylesPanel.jsx` | 156 | "Move them to" select gets **Team default** |
| `src/elevation/components/properties/EndFields.jsx` | 188 | end panel width placeholder (line ~55) |
| `src/elevation/components/properties/WallEndPanelFields.jsx` | 49 | width placeholder (line 28) |

**Contract.**
- `DoorStylePicks`: pass `node ?? {}` as `pickOptions`' fifth argument, so the room's Drawer fronts / Panels pickers read *Same as doors (…)* from the room's own Doors pick. The Team default option arrives from `pickOptions`; nothing else changes (a stored `'default'` is in the options, so it never shows as Missing).
- `RoomDoorStylesPanel`, the delete confirm's select: options become `Inherit` (`''` → `reassignTo: null`), `Team default` (`'default'`), then the other styles. The "No door styles yet" line is unchanged.
- `EndFields`: the `end_panel` width placeholder is `formatInchesInput(run._endThickness?.[side] ?? settings.endPanelThickness)`.
- `WallEndPanelFields`: the placeholder is `formatInches(wall._endPanelThickness?.[endpoint] ?? settings.endPanelThickness)`.

**Don't touch:** `PartStyleFields.jsx` (its picker already passes the levels above the part), the store, the model.

Gate: `npm test && npm run lint && npm run build`; 1050 tests.

---

## End-to-end check (Kyle)

- **Settings → End panel thickness = 13/16"** (the team default panel thickness until 46.3).
- Room: Doors = A (1"). Drawer fronts and Panels read *Same as doors (A · 5PC · 1")*; end panels go to 1" and the boxes beside them get narrower; wall end panels too.
- Drawer fronts = *Team default*: drawers go back to 13/16" while doors stay A. Same for Panels.
- A beaded face frame run with end panels: end stiles 1/16" wider than before when its panels are 13/16" and the setting was 3/4".
- Delete A while used → "Move them to" offers Team default.
- A 90" island with end panels both ends now shows odd box widths; widen the island (90 1/8") to get them back. The TODO tracks a warning for this.

**Known for now:**
- Existing panel cells keep their size until you change their kind or type.
- Blind end panels aren't sized by style yet.
- Odd automatic box sizes aren't flagged (TODO).
