# Round 46.1.1 — SPEC: "Team default" picks, sheet slab panels, panels at their style's thickness

Steps 396–400, designer only, on branch `elevation-doors` (after step 395). Geometry and the API don't change.
Follows Kyle's testing of 46.1 (2026-10-07): the Drawer fronts / Panels pickers said "Inherit (Std …)" while they were really following the room's Doors pick, there was no way to choose the team default on purpose, and end panels didn't change with a 1" style. **Revised after step 396 ran** (Kyle, 2026-10-07): there are two kinds of end panel, door-matching and sheet slab, so steps 397–400 replace the earlier 397–399.

**Done when:**
- Drawer fronts and Panels pickers read **Same as doors (B · 5PC · 1")** when they follow the doors, counting the Doors pick on the same level. ✅ 396
- Every picker offers **Team default (…)**, saved as `'default'`; deleting a used style can move its uses to the team default. ✅ 396
- Panels pickers and panel parts also offer **Sheet slab (3/4")**, saved as `'sheet'`. A run end panel at a join (joined or following run) and every panel cell default to sheet slab; free run ends and wall end panels follow the Panels / Doors picks.
- End panels, wall end panels and new panel cells are their style's thickness unless a width is typed. A face frame end stile over a 13/16" end panel comes out 1/16" wider by itself; the boxes take up the difference.
- With no styles in a room, every number is what it is today.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **396** ✅ | designer | "Team default" pick; picker labels say "Same as doors" | 1040 |
| **397** | designer | "Sheet slab" pick; joined ends and panel cells default to it | **1043** |
| **398** | designer | Run end panels and wall end panels at their style's thickness | **1050** |
| **399** | designer | New and converted panel cells at their style's thickness | **1053** |
| **400** | designer | UI: pickers pass their level and spot, Team default in delete, width placeholders | 1053 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Today's values in the tests come from running the existing code read-only on the golden rooms; the new values are worked out from the rules here. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got. Values marked ⚠ are the ones to report rather than change.

---

## §1 Decisions (Kyle, 2026-10-07, unless marked)

- **Drawer fronts and panels still follow the doors** when nothing picks them (P12, P15 unchanged). The picker's blank option says so: *Same as doors (…)* when the style comes from a Doors pick or from the team (nothing picked anywhere), *Inherit (…)* when a Drawer-fronts / Panels pick above supplies it. The label counts this level's own Doors pick.
- **"Team default" is a pick**, stored as the reserved id `'default'`, resolving to `teamDoorStyle(settings)` at the level it was picked.
- **Two kinds of end panel.** *Door-matching* panels are built like the doors: a door style, its thickness (13/16" usually). *Sheet slab* panels are cut from sheet material: no stiles/rails, 3/4" (almost always; a typed width covers the rest until materials exist). Sheet slab is the reserved pick `'sheet'`, a style `sheetPanelStyle()` = the team default with `id: 'sheet'`, `label: 'Sheet'`, `name: 'Sheet slab'`, `designId: 'slab'`, `thickness: SHEET_PANEL_THICKNESS` (0.75, interim until materials). It can be picked on the **Panels** key at any level and on any panel part (run end, wall end panel, panel cell), never on Doors or Drawer fronts.
- **Where sheet slab is the default** ("the spot"): a run end panel whose end is joined to another run (a joint or follow anchor on that side — two runs with end panels at the join, or a run that dies into another), and every panel cell (panels inside a run: sides, tops, backs). There, sheet slab wins over the room / wall / run Panels and Doors picks; only the part's own pick changes it. Free run ends and wall end panels (e.g. alcove side panels) follow Panels, then Doors. *(Claude's reading of Kyle's rules; a panel under a run and a blind panel aren't covered yet — see Not in 46.1.1.)*
- **Panels are as thick as their style.** A typed width always wins.
- **Interim team panel thickness (Claude's default).** A door-matching panel that resolves to the team default style (nothing picked, or Team default picked) uses `settings.endPanelThickness`, so saved rooms and golden rooms stay as they are. Kyle sets **Settings → End panel thickness** to 13/16"; sheet slab panels stay 3/4" either way. 46.3 folds both settings into the team default style.
- **The drawn run width wins.** Thicker end panels make the boxes narrower; nothing grows the run. Face frame end stiles over a mitered end panel follow its thickness (beaded 1 3/4" → 1 13/16", inset 1 1/2" → 1 9/16"). Odd automatic box sizes are a TODO.
- **Derived, never saved:** `run._endThickness = { left?, right? }` and `wall._endPanelThickness = { start?, end? }`, only for sides that differ from `settings.endPanelThickness`, computed in the first `syncRoom` pass for each side whatever its end type.
- **Panel cells** get their thickness when they're made (add panel, wrap, kind → panel) or their panel type changes; an existing panel cell keeps its stored size until then.
- **Not in 46.1.1 (in `TODO.md`):** a door-matching panel that cabinets die into getting a tall bottom rail automatically (e.g. 42" so bases die into the flat rail; type it in the Stiles & rails block for now); a panel below a run and a blind panel defaulting to sheet slab; blind end panels sized by style; the shelves back panel; rounding or warning on box sizes; the face frame stile note on reports.

---

## §2 Step 396 — "Team default" pick; "Same as doors" ✅ (committed)

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

**Don't touch:** `DoorStylePicks.jsx`, `PartStyleFields.jsx`, `RoomDoorStylesPanel.jsx` (step 400), `persistence.js` (`'default'` already passes `isStyleRef`).

**Count:** 1037 − 1 + 2 + 2 = **1040**.

---

## §3 Step 397 — "Sheet slab" pick; the default at a join and inside a run

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorStyles.js` | ~160 | `SHEET_PANEL_THICKNESS`, `sheetPanelStyle`; `'sheet'` reserved |
| `src/elevation/model/doorStyleResolve.js` | ~105 | a `'sheet'` pick on a panel; `panelLevels(…, { sheet })` |
| `src/elevation/model/doorStyleEdits.js` | ~180 | panel pickers offer Sheet slab; "Sheet slab here" label |
| `src/elevation/store/slices/doorStyles.js` | ~130 | `'sheet'` valid on Panels picks and panel parts only |
| `src/elevation/model/__tests__/partStyleEdits.test.js` | ~170 | one expectation (below) |
| NEW `src/elevation/model/__tests__/sheetPanel.test.js` | — | 3 tests, verbatim |

**Contract.**
- `doorStyles.js`: export `SHEET_PANEL_THICKNESS = 0.75` (doc: interim sheet material thickness until materials, SPEC-46.1.1) and `sheetPanelStyle()` → `{ ...DEFAULT_DOOR_STYLE, id: 'sheet', label: 'Sheet', name: 'Sheet slab', designId: 'slab', thickness: SHEET_PANEL_THICKNESS }` (a fresh object). `isDoorStyleList` also refuses the id `'sheet'`.
- `doorStyleResolve.js`:
  - In `pick()`, an id of `'sheet'`: when `partType === 'panel'` it sets `style = sheetPanelStyle()`, `source = { level, key }` and returns true; otherwise it's treated like a missing style (`door-style-missing` warning, walk goes on).
  - `panelLevels(room, wall, run, part, { sheet = false } = {})`: when `sheet`, a `{ level: 'spot', node: { panelStyleId: 'sheet' } }` level goes right after the part's level (before run / wall / room), so sheet slab beats every Panels and Doors pick above it and only the part's own `styleId` beats it.
- `doorStyleEdits.js` `pickOptions`: for `partType === 'panel'`, `options` are Team default, then `{ id: 'sheet', text: `Sheet slab (${formatInches(SHEET_PANEL_THICKNESS)})` }`, then the room's styles. The inherit text is `` `Sheet slab here (${formatInches(SHEET_PANEL_THICKNESS)})` `` when `source.level === 'spot'`; a sheet style reached any other way uses the normal row (`Sheet · Slab · 3/4"`) and prefix.
- Store (`slices/doorStyles.js`): `'sheet'` is valid for `setDoorStylePick` only when `key === 'panelStyleId'`, and for every `setPartStyle` part (all are panels). It is not a `deleteDoorStyle` reassign target.

**Edit `partStyleEdits.test.js`**: in the `'shows drawer fronts and panels following the doors…'` test, the last expectation's options become

```js
      options: [{ id: 'default', text: 'Team default (Std · 5PC · 3/4")' }, { id: 'sheet', text: 'Sheet slab (3/4")' }],
```

Nothing else in the file changes.

**NEW `src/elevation/model/__tests__/sheetPanel.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE, SHEET_PANEL_THICKNESS, isDoorStyleList, sheetPanelStyle } from '../doorStyles.js';
import { pickOptions } from '../doorStyleEdits.js';
import { panelLevels, resolveDoorStyle } from '../doorStyleResolve.js';
import elevationReducer, { setDoorStylePick, setPartStyle } from '../../store/elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';

const S = DEFAULT_SETTINGS;
const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const T = { ...DEFAULT_DOOR_STYLE, id: 'ds-t', label: 'T', thickness: 1 };
const SHEET = { ...DEFAULT_DOOR_STYLE, id: 'sheet', label: 'Sheet', name: 'Sheet slab', designId: 'slab', thickness: 0.75 };

describe('SPEC-46.1.1 sheet slab panels', () => {
  it('is a reserved panel style, and the default at a join or inside a run', () => {
    expect([sheetPanelStyle(), SHEET_PANEL_THICKNESS]).toEqual([SHEET, 0.75]);
    expect(isDoorStyleList([{ ...P, id: 'sheet' }])).toBe(false);
    const room = { doorStyles: [P, T], doorStyleId: 'ds-t', panelStyleId: 'ds-p' };
    const runNode = { doorStyleId: 'ds-t' };
    const at = (part, options) => {
      const { style, design, source } = resolveDoorStyle(room, S, 'panel', panelLevels(room, null, runNode, part, options));
      return [style.id, design.id, source];
    };
    expect(at(null)).toEqual(['ds-p', 'five-piece-square', { level: 'room', key: 'panelStyleId' }]);
    expect(at(null, { sheet: true })).toEqual(['sheet', 'slab', { level: 'spot', key: 'panelStyleId' }]);
    expect(at({ styleId: 'ds-t' }, { sheet: true })[0]).toBe('ds-t');
    expect(at({ styleId: 'sheet' })[0]).toBe('sheet');
    const door = resolveDoorStyle(room, S, 'door', [
      { level: 'run', node: { doorStyleId: 'sheet' } }, { level: 'room', node: room },
    ]);
    expect([door.style.id, door.warnings]).toEqual(['ds-t', [{ code: 'door-style-missing', level: 'run', id: 'sheet' }]]);
  });

  it('is offered on panel pickers, and says when it is this spot\'s default', () => {
    const room = { doorStyles: [P] };
    expect([
      pickOptions(room, S, 'panel', []).options.map(({ id }) => id),
      pickOptions(room, S, 'door', []).options.map(({ id }) => id),
      pickOptions(room, S, 'drawer_front', []).options.map(({ id }) => id),
    ]).toEqual([['default', 'sheet', 'ds-p'], ['default', 'ds-p'], ['default', 'ds-p']]);
    expect(pickOptions(room, S, 'panel', []).options[1]).toEqual({ id: 'sheet', text: 'Sheet slab (3/4")' });
    const levels = panelLevels(room, null, {}, {}, { sheet: true });
    expect(pickOptions(room, S, 'panel', levels.slice(1)).inherit).toEqual({ id: 'sheet', text: 'Sheet slab here (3/4")' });
    const sheetRoom = { ...room, panelStyleId: 'sheet' };
    expect(pickOptions(sheetRoom, S, 'panel', [{ level: 'room', node: sheetRoom }]).inherit)
      .toEqual({ id: 'sheet', text: 'Inherit (Sheet · Slab · 3/4")' });
  });

  it('is stored only on Panels picks and panel parts', () => {
    const state = stateWithRun(run({
      autoCount: false,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: null } },
      items: [auto('c1')],
    }));
    state.rooms[0].doorStyles = [P];
    const at = { wallId: 'wall-1', runId: 'run-1' };
    const next = [
      setDoorStylePick({ level: 'room', key: 'panelStyleId', styleId: 'sheet' }),
      setPartStyle({ ...at, part: 'runEnd', side: 'left', styleId: 'sheet' }),
    ].reduce(elevationReducer, state);
    expect([next.rooms[0].panelStyleId, currentRun(next).ends.left.styleId]).toEqual(['sheet', 'sheet']);
    expect([
      setDoorStylePick({ level: 'room', key: 'doorStyleId', styleId: 'sheet' }),
      setDoorStylePick({ level: 'room', key: 'drawerFrontStyleId', styleId: 'sheet' }),
    ].map((action) => elevationReducer(next, action) === next)).toEqual([true, true]);
  });
});
```

**Don't touch:** `persistence.js` (`'sheet'` passes `isStyleRef`), the UI, `panelThickness` (step 398).

**Count:** 1040 + 3 = **1043**.

---

## §4 Step 398 — run end panels and wall end panels at their style's thickness

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/panelThickness.js` | — | `isJoinedEnd`, `panelThickness`, `runEndThickness`, `wallPanelThickness` |
| `src/elevation/model/roomSync.js` | 403 | `withEndThickness`, `withWallPanelThickness` in the first pass |
| `src/elevation/model/splitRun.js` | 622 | `endWidth` takes the derived thickness (lines 73–74, 90, 269, 347) |
| `src/elevation/model/runPins.js` | 145 | `storedEndMinimum` the same (lines 40–41, 125, 127) |
| `src/elevation/model/extensions.js` | 204 | `extendedEndPiece` line 167 |
| `src/elevation/model/wallSides.js` | 53 | `wallEndPanelAt` line 40 |
| `src/elevation/model/wallEndPanels.js` | 182 | `wallEndPanels` line 83 |
| `src/elevation/store/persistence.js` | 718 | `toElevationDocument` strips `_endThickness` (runs) and `_endPanelThickness` (walls) |
| NEW `src/elevation/model/__tests__/panelThickness.test.js` | — | 8 tests, verbatim |

**Contract.**
- `panelThickness.js` (imports `panelLevels`, `resolveDoorStyle` from `./doorStyleResolve.js`; `isJointAnchor`, `isFollowAnchor` from `./joints.js`; check there's no import cycle):
  - `isJoinedEnd(run, side)` → `isJointAnchor(run.anchors?.[side]) || isFollowAnchor(run.anchors?.[side])`.
  - `panelThickness(room, wall, run, part, settings, { sheet = false } = {})` → the style from `resolveDoorStyle(room, settings, 'panel', panelLevels(room, wall, run, part, { sheet }))`: `settings.endPanelThickness` when its id is `'default'`, else its `thickness` (the sheet style's is 3/4"). Doc comment: interim team panel thickness until 46.3 (SPEC-46.1.1).
  - `runEndThickness(room, wall, run, settings)` → `{ left, right }`, each `panelThickness(room, wall, run, run.ends?.[side] ?? null, settings, { sheet: isJoinedEnd(run, side) })`.
  - `wallPanelThickness(room, wall, settings)` → `{ start, end }`, each `panelThickness(room, wall, null, panel, settings)` for a non-null `wall.endPanels?.[endpoint]` (wall end panels are never "the spot"), else `null`.
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
import { isJoinedEnd } from '../panelThickness.js';
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
const pieces = (room, runId, s = settings) => layoutRun(room, wallOf(room, runId), runOf(room, runId), s).pieces
  .map(({ id, x, width }) => [id, x, width]);
const widths = (room, runId, s) => pieces(room, runId, s).map(([, , width]) => width);

/** A golden room with P (13/16") and T (1") listed, after `edit` picks where they're used, synced. */
function styled(name, edit) {
  const room = structuredClone(stored(name));
  room.doorStyles = [P, T];
  edit(room);
  return syncRoom(room, settings);
}

describe('SPEC-46.1.1 end panels at their style\'s thickness', () => {
  it('leaves a room with no styles as it was (G1 tall: free left end, joined right end, 3/4" panels)', () => {
    const room = syncRoom(stored('G1 Euro kitchen'), settings);
    const tall = runOf(room, G1_TALL);
    expect([isJoinedEnd(tall, 'left'), isJoinedEnd(tall, 'right'), '_endThickness' in tall]).toEqual([false, true, false]);
    expect(pieces(room, G1_TALL)).toEqual([
      [`${G1_TALL}:left`, 0, 0.75], [G1_CAB, 0.75, 28.5], [`${G1_TALL}:right`, 29.25, 0.75],
    ]);
  });

  it('makes the free end panel the room\'s Panels style; the joined one stays sheet slab', () => {
    const room = styled('G1 Euro kitchen', (r) => { r.panelStyleId = 'ds-p'; });
    expect(runOf(room, G1_TALL)._endThickness).toEqual({ left: 0.8125 });
    expect(pieces(room, G1_TALL)).toEqual([
      [`${G1_TALL}:left`, 0, 0.8125], [G1_CAB, 0.8125, 28.4375], [`${G1_TALL}:right`, 29.25, 0.75],
    ]);
  });

  it('follows the doors when no panel style is picked', () => {
    const room = styled('G1 Euro kitchen', (r) => { r.doorStyleId = 'ds-t'; });
    expect([runOf(room, G1_TALL)._endThickness, runOf(room, G1_TALL)._doorThickness]).toEqual([{ left: 1 }, 1]);
    expect(widths(room, G1_TALL)).toEqual([1, 28.25, 0.75]);
  });

  it('keeps a typed width and the setting for the team default; an end\'s own style beats the sheet default', () => {
    const typed = styled('G1 Euro kitchen', (r) => {
      r.panelStyleId = 'ds-p';
      runOf(r, G1_TALL).ends.left.width = 0.75;
    });
    expect(widths(typed, G1_TALL)).toEqual([0.75, 28.5, 0.75]);
    const team = styled('G1 Euro kitchen', (r) => { r.doorStyleId = 'ds-t'; r.panelStyleId = 'default'; });
    expect('_endThickness' in runOf(team, G1_TALL)).toBe(false);
    const own = styled('G1 Euro kitchen', (r) => {
      runOf(r, G1_TALL).ends.left.styleId = 'ds-t';
      runOf(r, G1_TALL).ends.right.styleId = 'ds-p';
    });
    expect([runOf(own, G1_TALL)._endThickness, widths(own, G1_TALL)])
      .toEqual([{ left: 1, right: 0.8125 }, [1, 28.1875, 0.8125]]);
  });

  it('keeps a joined end 3/4" sheet slab when End panel thickness is set to 13/16"', () => {
    const s = { ...settings, endPanelThickness: 0.8125 };
    const room = syncRoom(stored('G1 Euro kitchen'), s);
    expect(runOf(room, G1_TALL)._endThickness).toEqual({ right: 0.75 });
    expect(widths(room, G1_TALL, s)).toEqual([0.8125, 28.4375, 0.75]);
  });

  it('widens a beaded face frame\'s end stiles by the extra 1/16" (G2 tall)', () => {
    const room = styled('G2 Face frame kitchen', (r) => {
      r.panelStyleId = 'ds-p';
      runOf(r, G2_TALL).ends.right.styleId = 'ds-p';
    });
    expect(runOf(room, G2_TALL)._endThickness).toEqual({ left: 0.8125, right: 0.8125 });
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

What the numbers are: G1's tall run is 30" wide; its left end is free, its right end is joined to the base run (a joint anchor), and today both panels are 3/4" around a 28 1/2" box. A 13/16" left panel with the right one staying 3/4" sheet slab leaves 28 7/16"; a 1" left one 28 1/4"; 1" and 13/16" leave 28 3/16". G2's beaded tall run is 26 1/2" with 3/4" panels, a 1/4" bead gap each side, a 24 1/2" box at 51 and faces at 51 3/4 (1 3/4" stile) and 63 1/4, 11 1/2" wide; with both panels 13/16" (the joined right end by its own pick) the box is 24 3/8" at 51 1/16, the left face 1/16" further in (1 13/16" stile) and each leaf 1/16" narrower. ⚠ If G2's frame part or faces come out other than above, report it rather than change the test.

**Count:** 1043 + 8 = **1051**. Golden snapshot unchanged.

---

## §5 Step 399 — panel cells: sheet slab by default, or their own style

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/store/slices/cells.js` | 221 | the four `state.settings.endPanelThickness` reads (lines 115, 156, 167, 178) |
| NEW `src/elevation/store/__tests__/slicePanelThickness.test.js` | — | 3 tests, verbatim |

**Contract.** Import `panelThickness` from `../../model/panelThickness.js`. Each site passes `panelThickness(location.room, location.wall, location.run, part, state.settings, { sheet: true })` in place of `state.settings.endPanelThickness` (panels inside a run are sheet slab unless they pick a style), where `part` is:
- `setCellKind` (line 115): `findLeaf(grid, cellId)` on the grid after `setGridCellKind` (a fresh panel, no style);
- `wrapCell` (156) and `addPanel` (178): `null`;
- `setPanelType` (167): the existing leaf, `findLeaf(before, cellId)`, so its own `styleId` counts.

`findLeaf` is in `../../model/cellTree.js`. The drafts are only read.

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

/** Cabinet a (30") and b (auto), with P (13/16") and T (1") listed, the given room picks and End panel thickness. */
function base(picks, endPanelThickness = 0.75) {
  const state = plain();
  Object.assign(state.rooms[0], { doorStyles: [P, T] }, picks);
  state.settings.endPanelThickness = endPanelThickness;
  return state;
}

describe('SPEC-46.1.1 panel cells: sheet slab unless they pick a style', () => {
  it('makes new and converted panel cells 3/4" sheet slab, whatever the room picks', () => {
    const picks = { panelStyleId: 'ds-p', doorStyleId: 'ds-t' };
    const added = apply(base(picks, 0.8125), addPanel({ ...at, cellId: 'b', side: 'left' }));
    expect(runItems(currentRun(added))[1].width).toBe(0.75);
    const back = apply(
      base(picks, 0.8125),
      setCellKind({ ...at, cellId: 'a', kind: 'panel' }),
      setPanelType({ ...at, cellId: 'a', type: 'back' }),
    );
    const a = gridLeaves(currentRun(back).grid).find((node) => node.id === 'a');
    expect([a.depth, a.align]).toEqual([0.75, 'back']);
  });

  it('uses a panel\'s own style when its type is set again', () => {
    const own = (styleId) => currentRun(apply(
      base({ panelStyleId: 'ds-p' }, 0.8125),
      setCellKind({ ...at, cellId: 'a', kind: 'panel' }),
      setPartStyle({ ...at, part: 'panelCell', cellId: 'a', styleId }),
      setPanelType({ ...at, cellId: 'a', type: 'side' }),
    )).grid.cols[0].size;
    expect([own('ds-t'), own('default')]).toEqual([1, 0.8125]);
  });

  it('is 3/4" with no styles too, even with End panel thickness at 13/16"', () => {
    const state = plain();
    state.settings.endPanelThickness = 0.8125;
    expect(currentRun(apply(state, setCellKind({ ...at, cellId: 'a', kind: 'panel' }))).grid.cols[0].size).toBe(0.75);
  });
});
```

What the numbers are: a panel cell is sheet slab (3/4") unless it picks a style; T is 1"; the team default is the End panel thickness setting (13/16" here).

**Count:** 1051 + 3 = **1054**.

---

## §6 Step 400 — UI: pickers pass their level and spot; Team default in delete; width placeholders

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/properties/DoorStylePicks.jsx` | ~45 | `pickOptions(…, levelsAbove, node ?? {})` |
| `src/elevation/components/RoomDoorStylesPanel.jsx` | 156 | "Move them to" select gets **Team default** |
| `src/elevation/components/properties/EndFields.jsx` | 188 | end panel width placeholder; joined ends pass `{ sheet: true }` |
| `src/elevation/components/properties/CellKindSection.jsx` | ~150 | panel cells pass `{ sheet: true }` |
| `src/elevation/components/properties/WallEndPanelFields.jsx` | 49 | width placeholder (line 28) |

**Contract.**
- `DoorStylePicks`: pass `node ?? {}` as `pickOptions`' fifth argument. The Team default and Sheet slab options arrive from `pickOptions`.
- `RoomDoorStylesPanel`, the delete confirm's select: `Inherit` (`''` → `reassignTo: null`), `Team default` (`'default'`), then the other styles.
- `EndFields`: the `PartStyleFields` levels become `panelLevels(room, wall, run, run.ends[side], { sheet: isJoinedEnd(run, side) })` (`isJoinedEnd` from `../../model/panelThickness.js`), so a joined end's picker reads *Sheet slab here (3/4")*. The `end_panel` width placeholder is `formatInchesInput(run._endThickness?.[side] ?? settings.endPanelThickness)`.
- `CellKindSection`: the panel cell's levels pass `{ sheet: true }`.
- `WallEndPanelFields`: the placeholder is `formatInches(wall._endPanelThickness?.[endpoint] ?? settings.endPanelThickness)`.

**Don't touch:** `PartStyleFields.jsx` (it already passes the levels above the part), the store, the model.

Gate: `npm test && npm run lint && npm run build`; 1054 tests.

---

## End-to-end check (Kyle)

- **Settings → End panel thickness = 13/16"** (the door-matching team default until 46.3).
- Room: Doors = A (1"). Drawer fronts and Panels read *Same as doors (A · 5PC · 1")*; free end panels and wall end panels go to 1" and the boxes beside them get narrower.
- A tall beside a base (joined): the tall's end panel at the join stays 3/4" and its picker reads *Sheet slab here (3/4")*; pick A on it to make it match the doors. Panel cells (sides, tops, backs inside runs) come out 3/4" sheet slab when you add or change them.
- Panels = *Sheet slab* at the room: every end panel is 3/4" slab.
- Drawer fronts = *Team default*: drawers go back to 13/16" while doors stay A.
- A beaded face frame run with 13/16" end panels: end stiles 1/16" wider than with 3/4" panels.
- Delete A while used → "Move them to" offers Team default.
- An alcove side panel that bases die into: type its bottom rail (e.g. 42") in the Stiles & rails block for now.

**Known for now:** (all in `TODO.md`)
- No automatic tall bottom rail where cabinets die into a door-matching panel.
- A panel under a run and a blind panel don't default to sheet slab yet; blind end panels aren't sized by style.
- Existing panel cells keep their size until you change their kind or type.
- Odd automatic box sizes aren't flagged.

---

## §7 Step 401 — fix: selecting an end panel on the canvas crashes

Kyle, after 400: clicking an end panel piece on the canvas crashes with `Cannot read properties of undefined (reading 'doorStyles')` in `PartStyleFields`. `EndFields` is rendered from two places; step 395 gave `room` and `wall` to the one in `RunEndsSection.jsx` but not to the one in `PieceProperties.jsx` (`EndProperties`, line 56, rendering `<EndFields>` at line 63).

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/properties/PieceProperties.jsx` | 194 | `EndProperties` takes `room` and `wall` and passes them to `<EndFields>`; its caller (line ~132) passes them (`PieceProperties` already has both) |
| `src/elevation/components/properties/EndFields.jsx` | ~190 | render `PartStyleFields` only when `room` and `wall` are given |

No new tests (UI only). Gate: `npm test && npm run lint && npm run build`; still 1054.

---

## §8 Step 402 — fix: a joined end loses its picked style on every sync

Kyle, after 401: on a joined end panel the picker never shows the choice, though the panel's thickness changes once. Cause (the known gap from 46.1): `syncRoom`'s auto-end pass (roomSync.js lines ~297–309) rebuilds a joined run's auto end as `{ type, width: null, auto: true }`, dropping `styleId` and `sizes`. The first pass has already computed `_endThickness` from the pick, so the panel changes, but the stored end loses the pick at once (and the thickness falls back at the next sync).

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/roomSync.js` | 434 | the three rebuilt ends (lines ~299–308) keep the end's `styleId` and `sizes` when present |
| NEW `src/elevation/model/__tests__/autoEndPick.test.js` | — | 1 test, verbatim |

**Contract.** A private `withPartPick(next, end)` → `next` plus `end.styleId` and `end.sizes` when they're set. Each of the three rebuilt returns in that `Object.fromEntries(...)` uses it. Nothing else changes.

**NEW `src/elevation/model/__tests__/autoEndPick.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const G1_TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const runOf = (room) => room.walls.flatMap((wall) => wall.runs).find((run) => run.id === G1_TALL);

describe('SPEC-46.1.1 a joined end keeps its own style', () => {
  it('keeps styleId and sizes on an auto end through every sync (G1 tall, right end joined)', () => {
    const room = structuredClone(document.rooms.find((candidate) => candidate.name === 'G1 Euro kitchen'));
    room.doorStyles = [P];
    const stored = runOf(room).ends.right;
    runOf(room).ends.right = { ...stored, styleId: 'ds-p', sizes: { rails: { bottom: 42 } } };
    const once = syncRoom(room, settings);
    const twice = syncRoom(once, settings);
    for (const synced of [once, twice]) {
      const end = runOf(synced).ends.right;
      expect([end.type, end.auto, end.styleId, end.sizes, runOf(synced)._endThickness])
        .toEqual(['end_panel', true, 'ds-p', { rails: { bottom: 42 } }, { right: 0.8125 }]);
    }
  });
});
```

**Don't touch:** the first pass, `jointEndTypes`, the store, the UI.

**Count:** 1054 + 1 = **1055**. Golden snapshot unchanged.

---

## §9 Step 403 — fix: a typed run width or move lands where it's typed

Kyle, after 402: on a tall run with a free left end, clicking the end and typing a width with a fraction or an equation (e.g. `30 1/16`, `30+1/16`) in the canvas popup doesn't take; the Properties width field works. Cause: the popup's commit goes through the same path as a drag. `stretchRun` (runMoves.js line 94) rounds the edge to the nearest 1/2" and then snaps it to any wall end, corner reserve, landing, soffit, recess or run edge within 2"; `useRunStretch.commitStretch` also runs the 6px screen alignment snap first (about 1" when zoomed out on a tall run). Whole and half inches survive; a 16th never does. `moveRun` (lines 221 and 302) does the same to a typed Move. Joint drags (`moveJoint`) don't round and aren't touched.

**Rule.** A value typed in a canvas popup is exact: no 1/2" rounding, no 2" snap, no screen alignment snap. It still clamps (min run width, wall overhang, conflicts), and a typed edge that lands *exactly* on a snap candidate still anchors / joins, as a drag that snaps there does. Drags (and Enter without typing) behave as today.

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/runMoves.js` | 428 | `stretchRun` and `moveRun` take `{ exact = false } = {}` |
| `src/elevation/components/canvas/useRunStretch.js` | 170 | a typed commit is exact |
| `src/elevation/components/canvas/useRunMove.js` | 158 | a typed commit is exact |
| NEW `src/elevation/model/__tests__/exactEntry.test.js` | — | 2 tests, verbatim |

**Contract.**
- `stretchRun(room, wallId, runId, side, newEdgeX, settings, { exact = false } = {})`: when `exact`, `edge` starts as `newEdgeX` (no `roundTo`), and a candidate counts only when its distance is ≤ 1e-9 (instead of `STRETCH_EDGE_SNAP_DISTANCE`). Everything after (clamp, `anchorsAtSnap`, end types, sync, validation, `buttingRunEdge` join) is unchanged.
- `moveRun(room, wallId, runId, newX, settings, { exact = false } = {})`: the same in both branches (no joints, line ~221; joints, line ~302): `x` starts as `newX`, and the snap distance limit is 1e-9 when `exact`.
- `useRunStretch`: `commitStretch(runId, side, newEdgeX, { exact = false } = {})` skips `applyRunAlignment` when `exact` (uses `newEdgeX`; still clears the alignment guides) and passes `{ exact }` to `stretchRun`. In `startStretch`'s `onCommit`, `exact` = `(entryRef.current?.typed ?? null) !== null` (read before anything else, as `useJointDrag` does; the ref still holds the entry during commit).
- `useRunMove`: `applyRunMove(segment, delta, commit, { exact = false } = {})` passes `{ exact }` to `moveRun`. `startRunMove`'s `onCommit` passes `{ exact: (entryRef.current?.typed ?? null) !== null }`. Previews and drag ends don't change.

**Don't touch:** `runJoins.js` / `useJointDrag.js` (joint moves are already exact), `useLiveEntry.js`, `LiveEntryInput.jsx`, `units.js`, the existing tests, drawing new runs / soffits / recesses (their 1/2" rounding is for drawing by mouse).

**NEW `src/elevation/model/__tests__/exactEntry.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { moveRun, stretchRun } from '../room.js';

const S = DEFAULT_SETTINGS;
const EXACT = { exact: true };

function makeRun(id, overrides = {}) {
  return {
    id,
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 40,
    width: 40,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    autoCount: false,
    maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: overrides.width ?? 40 }],
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
}

function makeRoom(runs) {
  return {
    id: 'room',
    name: 'Room',
    profile: { ...S.defaultProfile },
    wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null,
      x1: 0, y1: 0, x2: 120, y2: 0, height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, runs,
    }],
  };
}

const withNeighbor = () => makeRoom([makeRun('run'), makeRun('neighbor', { x: 90, width: 20 })]);
const runIn = (result, id = 'run') => result.room.walls[0].runs.find((run) => run.id === id);
const at = (result) => [result.ok, runIn(result).x, runIn(result).width];

describe('SPEC-46.1.1 a typed width or move lands where it is typed', () => {
  it('stretches to a typed edge with no rounding or snapping, but still clamps and joins on an exact hit', () => {
    const room = makeRoom([makeRun('run')]);
    expect(at(stretchRun(room, 'A', 'run', 'left', 3.0625, S))).toEqual([true, 3, 77]);
    expect(at(stretchRun(room, 'A', 'run', 'left', 3.0625, S, EXACT))).toEqual([true, 3.0625, 76.9375]);
    const near = stretchRun(room, 'A', 'run', 'left', 1.25, S, EXACT);
    expect([...at(near), runIn(near).anchors.left]).toEqual([true, 1.25, 78.75, false]);
    const onEnd = stretchRun(room, 'A', 'run', 'left', 0, S, EXACT);
    expect([...at(onEnd), runIn(onEnd).anchors.left, runIn(onEnd).ends.left.type]).toEqual([true, 0, 80, true, 'end_panel']);
    expect(at(stretchRun(room, 'A', 'run', 'right', 42, S, EXACT))).toEqual([true, 40, 9]);
    expect(at(stretchRun(withNeighbor(), 'A', 'run', 'right', 88.5, S, EXACT))).toEqual([true, 40, 48.5]);
    const snapped = stretchRun(withNeighbor(), 'A', 'run', 'right', 88.5, S);
    const typed = stretchRun(withNeighbor(), 'A', 'run', 'right', 90, S, EXACT);
    expect([at(typed), typed.joined]).toEqual([[true, 40, 50], snapped.joined]);
  });

  it('moves to a typed x with no rounding or snapping, and reports a snap only on an exact hit', () => {
    const room = makeRoom([makeRun('run')]);
    const plain = moveRun(room, 'A', 'run', 60.0625, S, EXACT);
    expect([...at(plain), plain.snap]).toEqual([true, 60.0625, 40, null]);
    const nearEnd = moveRun(room, 'A', 'run', 1.5, S, EXACT);
    expect([...at(nearEnd), nearEnd.snap]).toEqual([true, 1.5, 40, null]);
    const onEnd = moveRun(room, 'A', 'run', 0, S, EXACT);
    expect([...at(onEnd), onEnd.snap]).toEqual([true, 0, 40, { value: 0, edge: 'left' }]);
    const nearNeighbor = moveRun(withNeighbor(), 'A', 'run', 49, S, EXACT);
    expect([...at(nearNeighbor), nearNeighbor.snap]).toEqual([true, 49, 40, null]);
  });
});
```

What the numbers are: the base run is 40" at x 40 on a 120" wall; min run width 9". Today 3 1/16 rounds to 3, 1 1/4 snaps to the wall end, 88 1/2 snaps to the neighbour at 90, and a move to 1 1/2 or 49 snaps to 0 or 50. Typed, each lands where it's typed; exactly 0 still anchors with an end panel, and exactly 90 joins as the 2" snap does.

**Count:** 1055 + 2 = **1057**. Golden snapshot unchanged.
