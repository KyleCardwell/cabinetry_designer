# Round 46.2.1 — SPEC: back panels match, clearance to the parts below, face frame light rails

Steps 409–412, designer only, on branch `elevation-doors` (after step 408, 1070 tests). Geometry and the API don't change.
Follows Kyle's testing of 46.2 (2026-10-08).

**Done when:**
- A back panel cell (its face shows) follows the room's Panels / Doors styles like a free end panel; side and top panel cells stay 3/4" sheet slab unless they pick a style.
- An auto upper's clearance (18") runs to the bottom of the parts below it: a 1 1/2" light rail makes the boxes 1 1/2" shorter at the bottom, so the light rail's bottom is 18" over the counter. Euro doors don't move (they already hung over the rail). A manual-height run keeps its parts where its box bottom was. Runs stacked on others already worked this way.
- On a face frame upper, a light rail / trough / panel below whose Doors is **cover** or **flush** *is* the frame's bottom rail:
  - **cover** — the bottom rail grows down by the part (e.g. 3/4" over the box + 1 1/2" hanging = 2 1/4" rail); the boxes keep the normal 3/4" bottom reveal; lights go behind.
  - **flush** — the frame hangs the part's height below the boxes; the boxes get a 0" bottom reveal (plus the bead), so the whole rail shows below the doors and a light trough goes behind.
  - **visible** (and caps, corbels) — the frame keeps its normal drop and the part hangs below the frame.
  Parts behind the frame still exist (they're still numbered parts) and draw dashed.
- The upper **Bottom** select in Cabinet style offers **Overhang** and **Flush (on counter / nothing below)**, and is hidden while the run has parts below (they set the bottom). "Below the run" says what each Doors choice means on a face frame run.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **409** | designer | Back panel cells follow the room's Panels style | 1070 → **1071** |
| **410** | designer | Face frame uppers: covered / flush parts below become the frame's bottom rail | **1076** |
| **411** | designer | Clearance to the bottom of the parts below; manual runs keep their parts in place | **1079** (golden snapshot: G6 changes) |
| **412** | designer | UI: Doors labels on face frame runs, parts behind the frame dashed, Bottom select | 1079 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Today's values in the tests come from running the existing code read-only on the golden rooms; the new values are worked out from the rules here. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got. Values marked ⚠ are the ones to report rather than change.

---

## §1 Decisions (Kyle, 2026-10-08, unless marked)

- **Back panels show their face**, so a back panel cell (`leaf.align === 'back'`) isn't "the spot" for sheet slab: it follows its own pick, then Panels, then Doors, then the team default. Side and top panel cells (sides inside a run, tops) stay sheet slab by default (46.1.1). `isSheetCell(leaf)` = `leaf?.align !== 'back'`.
- **Clearance is measured to the lowest thing under an upper's box**: the bottom of the last part below it, or the face frame's bottom rail when that's lower. A part's Doors choice doesn't change this. Only auto-height uppers are re-solved (as today); `resolveVertical`'s `z = counter + clearance + runBelowBox(run)`.
- **Manual-height runs** (drawn into a gap, or with Snap heights off): changing the parts below keeps the lowest point where it was: the box bottom moves by the change in `runBelowBox` and the box top stays. A run stacked on another (`stack.below`) is left alone; its link already allows for its parts.
- **Face frame (Kyle's shop practice):** a light rail usually isn't a separate part on a face frame upper — the frame's bottom rail is the light rail's face. So on an **upper** with a face frame, the leading parts below with Doors `cover` or `flush` (light rail, light trough, panel; never a cap or corbels) are absorbed into the frame: the frame drops by their total height (`frameDrop`), and the boxes' bottom reveal is the normal upper one (`cover`, 3/4" + bead) or 0" + bead (`flush`, the frame hung below the boxes). The first absorbed part's Doors decides. Remaining parts hang below the frame. Not for bases or talls (no change there).
- **Upper Bottom select (Claude's default; Kyle didn't pick):** *Flush (light rail / trough)* and *On counter* already behave the same (tall reveals, no drop), and the light rail case is now a part below. The select keeps **Overhang** and **Flush (on counter / nothing below)** (`'counter'`); a saved `'flush'` shows as the second. Hidden while `run.bottom` has parts. No data change.
- **Golden room G6** has an auto upper with a 1 1/2" bottom cap: its box moves from z 54 / 36" to 55.5 / 34.5", the cap from 52.5 to 54, and the panel run held between the base and that upper grows from 16 1/2" to 18". That's the fix, so the snapshot is updated in step 411.
- **Not in 46.2.1:** absorbed parts on face frame bases/talls; a part's own reveal or depth on face frame; recalculating parts already drawn on manual runs (only changes from now on).

---

## §2 Step 409 — back panel cells follow the room's Panels style

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/panelThickness.js` | 30 | `isSheetCell` |
| `src/elevation/store/slices/cells.js` | 227 | lines 117 and 172 |
| `src/elevation/model/doorDetails.js` | 120 | line 95 |
| `src/elevation/components/properties/CellKindSection.jsx` | 144 | line 120 |
| `src/elevation/store/__tests__/slicePanelThickness.test.js` | 50 | one title, one value, one `it` appended (below) |
| `src/elevation/model/__tests__/runDoorDetails.test.js` | 125 | test 4 replaced (below) |

**Contract.**
- `panelThickness.js`: export `isSheetCell(leaf)` → `leaf?.align !== 'back'`. Doc: a panel cell is sheet slab by default unless it's a back panel, whose face shows (SPEC-46.2.1).
- `cells.js`: `setCellKind` (line 117) passes `{ sheet: isSheetCell(findLeaf(grid, cellId)) }`; `setPanelType` (line 172) passes `{ sheet: type !== 'back' }` (the type being set). `wrapCell` (159) and `addPanel` (184) keep `{ sheet: true }` (they make side panels).
- `doorDetails.js` line 95: `panelLevels(room, levelsWall, run, leaf)` (only back cells get there).
- `CellKindSection.jsx` line 120: `{ sheet: isSheetCell(item) }`.

**Edit `slicePanelThickness.test.js`:**
- line 22's title becomes `'makes new side panel cells 3/4" sheet slab; a back panel takes the room\'s Panels style'`;
- in that test, `expect([a.depth, a.align]).toEqual([0.75, 'back']);` becomes `expect([a.depth, a.align]).toEqual([0.8125, 'back']);`;
- add `isSheetCell` to the imports (`import { isSheetCell } from '../../model/panelThickness.js';`) and append inside the `describe`, verbatim:

```js

  it('makes a back panel its Panels style, or 3/4" when it picks sheet slab (SPEC-46.2.1)', () => {
    expect([isSheetCell({ kind: 'panel' }), isSheetCell({ kind: 'panel', align: 'back' }), isSheetCell(null)])
      .toEqual([true, false, true]);
    const back = (styleId) => {
      const steps = [setCellKind({ ...at, cellId: 'a', kind: 'panel' })];
      if (styleId) steps.push(setPartStyle({ ...at, part: 'panelCell', cellId: 'a', styleId }));
      steps.push(setPanelType({ ...at, cellId: 'a', type: 'back' }));
      const leaves = gridLeaves(currentRun(apply(base({ doorStyleId: 'ds-t' }), ...steps)).grid);
      return leaves.find((node) => node.id === 'a').depth;
    };
    expect([back(null), back('sheet'), back('ds-p')]).toEqual([1, 0.75, 0.8125]);
  });
```

**Edit `runDoorDetails.test.js`:** replace the whole `it('draws a back panel cell as sheet slab by default, and 5-piece when it picks a style (G3)', …)` block with, verbatim:

```js
  it('draws a back panel cell in the room\'s styles by default, and plain when it picks sheet slab (G3)', () => {
    expect(details('G3 Bath alcove', G3_UPPER).parts).toEqual([{
      key: `panel:${G3_BACK}`,
      kind: 'panelCell',
      pieceId: G3_BACK,
      path: null,
      styleId: 'default',
      label: 'Std',
      construction: 'five_piece',
      ...box(0.75, 36, 70.5, 41.25),
      openings: [box(3.75, 39, 64.5, 35.25)],
    }]);
    const sheet = details('G3 Bath alcove', G3_UPPER, (r) => {
      leafOf(runOf(r, G3_UPPER), G3_BACK).styleId = 'sheet';
    });
    expect(sheet.parts.map(({ label, construction, openings }) => [label, construction, openings]))
      .toEqual([['Sheet', 'slab', []]]);
  });
```

What the numbers are: the room picks T (1") for doors and nothing for panels, so a back panel follows the doors: 1". Picking sheet slab keeps it 3/4"; picking P makes it 13/16". G3's back panel with nothing picked is the team default 5-piece: 3" frame on 70 1/2 × 41 1/4.

**Don't touch:** `wrapCell`, `addPanel`, `doorStyleResolve.js`, the end panel rules, other tests.

**Count:** 1070 + 1 = **1071**.

---

## §3 Step 410 — face frame uppers: covered or flush parts are the bottom rail

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/bottoms.js` | 91 | `frameBottomParts`, `runBelowBox`; `runBottomParts` frame-aware |
| `src/elevation/model/styles.js` | 318 | `frameDrop` (line 78); `cabinetReveals` (after line 187) |
| `src/elevation/model/runBands.js` | 159 | `bottomParts` carry `behind` (line 134) |
| NEW `src/elevation/model/__tests__/frameBottoms.test.js` | — | 5 tests, verbatim |

**Contract.**
- `bottoms.js` (imports stay `constants.js` and `uuid`; use `CABINET_TYPE_IDS.UPPER` from `./constants.js`):
  - `frameBottomParts(run)` → `{ height, doors, count }`: 0 / `null` / 0 unless `run.cabinetTypeId === UPPER`; otherwise the leading parts of `run.bottom ?? []` whose `doors` is `'cover'` or `'flush'` and whose kind isn't in `UNCOVERABLE_BOTTOM_PARTS`, stopping at the first that isn't; `height` their total, `doors` the first one's `doors` (or `null`), `count` how many. Doc: on a face frame upper these parts are the frame's bottom rail (SPEC-46.2.1). It doesn't look at the style; callers only use it for face frame runs.
  - `runBottomParts(run)`: the first part starts at `run.z − extra`, `extra = run._frame ? Math.max(0, run._frame.drop − frameBottomParts(run).height) : 0`, and when `run._frame` the first `count` parts get `behind: true`. Euro runs (no `_frame`) are unchanged.
  - `runBelowBox(run)` → how far the lowest thing under the box hangs: `extra + runBottomHeight(run)` (same `extra`). Doc: what an upper's clearance is measured to (SPEC-46.2.1).
- `styles.js` (import `frameBottomParts` with `belowRunReveal`):
  - `frameDrop(run, settings)`: on an upper, `frameBottomParts(run).height` when it's > 0; otherwise as today.
  - `cabinetReveals`, right after the hanging-base rule (line ~187): when `!euro && runEdges.bottom` and `frameBottomParts(run).height > 0`, `apply('bottom', doors === 'flush' ? bead : styleReveals(style, UPPER, settings).bottom, 'rule:below-run')`, `bead` = `style.beadWidth` for beaded inset, else 0. The euro `below-run` line after it is unchanged.
- `runBands.js` line 134: each bottom part also gets `behind: true` when its `runBottomParts` entry has it (no key otherwise, so existing results stay equal).

**Don't touch:** `belowRunReveal`, `panelDrop`, `endPieceBottom` (inset already uses `frameDrop`), `frames.js` (it already drops the region by `frameDrop`), `profile.js` and `stacks.js` (step 411), the UI, other tests. The golden snapshot must not change (no golden face frame run has parts below).

**NEW `src/elevation/model/__tests__/frameBottoms.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frameBottomParts, runBelowBox, runBottomParts } from '../bottoms.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { cabinetReveals, frameDrop } from '../styles.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const S = DEFAULT_SETTINGS;
const { BASE, UPPER } = CABINET_TYPE_IDS;
const INSET = { cabinetStyleId: 14, beadWidth: 0.25, profiledEdge: false };
const BEADED = { cabinetStyleId: 15, beadWidth: 0.25, profiledEdge: false };
const DOOR = { type: 'door', size: null };
const RAIL = { id: 'rail', kind: 'light_rail', height: 1.5, doors: 'cover' };
const TROUGH = { id: 'trough', kind: 'light_trough', height: 3, doors: 'flush' };
const PANEL = { id: 'panel', kind: 'panel', height: 0.75, doors: 'flush' };
const CAP = { id: 'cap', kind: 'bottom_cap', height: 1.5, doors: 'visible' };
const CORBELS = { id: 'corbels', kind: 'corbels', height: 6, doors: 'visible' };
const upper = (bottom, extra = {}) => ({ cabinetTypeId: UPPER, bottom, ...extra });

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const G2_UPPER = 'ab0981ca-8621-45ba-a924-dbe318646f67';
const G2_CAB = '2db19921-bc7f-4f28-9610-0d0f46729a46';

/** G2's face frame upper with `bottom` below it: box, first face, frame bottom and parts below. */
function g2Upper(bottom) {
  const room = structuredClone(document.rooms.find((candidate) => candidate.name === 'G2 Face frame kitchen'));
  room.walls.flatMap((wall) => wall.runs).find((run) => run.id === G2_UPPER).bottom = bottom;
  const synced = syncRoom(room, document.settings);
  const view = resolveWall(synced, synced.walls[0], 'front');
  const run = view.runs.find((candidate) => candidate.id === G2_UPPER);
  const scene = runScene(synced, view, run, document.settings);
  const face = scene.faceLayouts.get(G2_CAB).faces[0];
  return {
    box: [run.z, run.height],
    face: [face.z, face.height],
    frameBottom: Math.min(...scene.frames.regions.map((region) => region.z)),
    parts: runBands(synced, view, run, document.settings, scene).bottomParts
      .map(({ kind, z, height, behind }) => [kind, z, height, behind === true]),
  };
}

describe('SPEC-46.2.1 a face frame upper\'s bottom rail is its light rail or trough', () => {
  it('takes an upper\'s leading covered or flush parts as the frame', () => {
    expect([
      frameBottomParts(upper([])),
      frameBottomParts({ cabinetTypeId: UPPER }),
      frameBottomParts(upper([RAIL])),
      frameBottomParts(upper([TROUGH, CAP])),
      frameBottomParts(upper([RAIL, PANEL])),
      frameBottomParts(upper([{ ...CAP, doors: 'flush' }])),
      frameBottomParts(upper([{ ...RAIL, doors: 'visible' }, PANEL])),
      frameBottomParts({ cabinetTypeId: BASE, bottom: [RAIL] }),
    ]).toEqual([
      { height: 0, doors: null, count: 0 },
      { height: 0, doors: null, count: 0 },
      { height: 1.5, doors: 'cover', count: 1 },
      { height: 3, doors: 'flush', count: 1 },
      { height: 2.25, doors: 'cover', count: 2 },
      { height: 0, doors: null, count: 0 },
      { height: 0, doors: null, count: 0 },
      { height: 0, doors: null, count: 0 },
    ]);
  });

  it('drops the frame by those parts, else as today', () => {
    expect([
      frameDrop(upper([RAIL]), S),
      frameDrop(upper([TROUGH]), S),
      frameDrop(upper([CORBELS]), S),
      frameDrop(upper([], { upperBottom: 'counter' }), S),
      frameDrop(upper([RAIL], { upperBottom: 'counter' }), S),
      frameDrop({ cabinetTypeId: BASE, bottom: [RAIL] }, S),
    ]).toEqual([1.5, 3, 0.75, 0, 1.5, 0]);
  });

  it('hangs the other parts below the frame, marks the ones behind it, and measures the drop below the box', () => {
    const placed = (run) => runBottomParts(run).map(({ id, z, behind }) => [id, z, behind === true]);
    expect(placed(upper([CORBELS], { z: 54.75, _frame: { drop: 0.75 } }))).toEqual([['corbels', 48, false]]);
    expect(placed(upper([RAIL, CORBELS], { z: 55.5, _frame: { drop: 1.5 } })))
      .toEqual([['rail', 54, true], ['corbels', 48, false]]);
    expect(placed(upper([RAIL, CAP], { z: 54 }))).toEqual([['rail', 52.5, false], ['cap', 51, false]]);
    expect([
      runBelowBox(upper([RAIL], { z: 54 })),
      runBelowBox(upper([], { z: 54.75, _frame: { drop: 0.75 } })),
      runBelowBox(upper([RAIL], { z: 55.5, _frame: { drop: 1.5 } })),
      runBelowBox(upper([CORBELS], { z: 54.75, _frame: { drop: 0.75 } })),
      runBelowBox({ cabinetTypeId: BASE, z: 4 }),
    ]).toEqual([1.5, 0.75, 1.5, 6.75, 0]);
  });

  it('gives the boxes the normal bottom reveal over a rail, and 0" plus the bead over a frame hung for a trough', () => {
    const bottom = (style, run) => {
      const { values, sources } = cabinetReveals({ style, cabinetTypeId: UPPER, run, face: DOOR, settings: S });
      return [values.bottom, sources.bottom];
    };
    expect([
      bottom(INSET, upper([RAIL])),
      bottom(INSET, upper([TROUGH])),
      bottom(BEADED, upper([TROUGH])),
      bottom(BEADED, upper([RAIL])),
      bottom(INSET, upper([CORBELS])),
      bottom(INSET, upper([RAIL], { upperBottom: 'counter' })),
    ]).toEqual([
      [0.75, 'rule:below-run'],
      [0, 'rule:below-run'],
      [0.25, 'rule:below-run'],
      [1, 'rule:below-run'],
      [0.75, 'style'],
      [0.75, 'rule:below-run'],
    ]);
  });

  it('raises G2\'s face frame upper by a covered rail or a flush trough; the frame keeps its bottom at 54"', () => {
    expect(g2Upper([])).toEqual({ box: [54.75, 35.25], face: [55.75, 32.5], frameBottom: 54, parts: [] });
    expect(g2Upper([RAIL])).toEqual({
      box: [55.5, 34.5], face: [56.5, 31.75], frameBottom: 54, parts: [['light_rail', 54, 1.5, true]],
    });
    expect(g2Upper([TROUGH])).toEqual({
      box: [57, 33], face: [57.25, 31], frameBottom: 54, parts: [['light_trough', 54, 3, true]],
    });
  });
});
```

What the numbers are: G2's counter is at 36", so its upper sits 18" up to the frame bottom: 54. Today the frame hangs 3/4" (box at 54 3/4); a covered 1 1/2" rail makes the frame hang 1 1/2" (box 55 1/2, 2 1/4" bottom rail), a flush 3" trough 3" (box 57). The box top stays at 90. G2 is beaded (1/4"): the bottom reveal is 3/4 + 1/4 = 1" over a rail and 0 + 1/4 over a trough; the faces' top stays at 88 1/4. ⚠ If `frameBottom` or the faces come out other than this, report it rather than change the test.

**Count:** 1071 + 5 = **1076**. Golden snapshot unchanged.

---

## §4 Step 411 — clearance to the bottom of the parts below

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/profile.js` | 105 | line 88: `+ runBelowBox(run)` in place of `+ (run._frame?.drop ?? 0)`; import from `./bottoms.js` |
| `src/elevation/model/stacks.js` | 144 | lines 71 and 83: `runBelowBox(run)` in place of `runBottomHeight(run)` |
| `src/elevation/store/slices/styles.js` | 97 | `setRunBottom` (line 65): manual runs keep their parts in place |
| `src/elevation/model/__tests__/stacks.test.js` | 223 | expected values (below) |
| `src/elevation/model/__tests__/bottoms.test.js` | ~150 | line 84 |
| `src/elevation/model/__tests__/runBands.test.js` | — | line ~90: `z: 52.5` → `z: 54` |
| `src/elevation/model/__tests__/bandParts.test.js` | — | line 56: the row's `52.5` → `54` |
| `src/elevation/model/__tests__/__snapshots__/golden.test.js.snap` | — | regenerated (G6 only) |
| NEW `src/elevation/model/__tests__/belowClearance.test.js` | — | 3 tests, verbatim |

**Contract.**
- `profile.js` line 88: `z = counterReference + q.upperClearance + runBelowBox(run);` (keep the comment, adding "or to the bottom of the parts below (SPEC-46.2.1)"). Line 62 (hanging base) unchanged.
- `stacks.js`: `outerBottom(run)` → `run.z − runBelowBox(run)`; `stackedSpan` line 83 adds `runBelowBox(run)`. For Euro runs these equal today's values.
- `setRunBottom`: when the run's `heightMode === 'manual'` and it has no `stack?.below`: `before = runBelowBox(location.run)` (the synced run), apply the new list as today, `syncRoomAt`; then find the run again (`runLocation`), `after = runBelowBox(run)`; when `|after − before| > 1e-9`, `run.z += after − before`, `run.height −= after − before`, and `syncRoomAt` again. Auto runs are unchanged (sync re-solves them).

**Test edits (the values that follow from the rule; nothing else changes):**
- `stacks.test.js`:
  - test 'fills between a countertop and a cap…': `U` `{ z: 55.5, height: 34.5 }`, `M` `{ z: 36, height: 18 }`; moved: `U` `{ z: 59, height: 31 }`, `M` `{ z: 37.5, height: 20 }` (`B` unchanged);
  - 'keeps a manual height…': `underUpper` `M` `{ z: 42, height: 10 }` (onBase and hutch unchanged);
  - 'finds stacks…': `outerBottom(runOf(room, 'U'))` `54`;
  - 'joins a stack…': `second` `M` `{ z: 36, height: 18 }`;
  - 'draws one chain up a joined stack': `['box', 18]` for M and `['box', 34.5]` for U;
  - 'shows an upper\'s parts below…': `['clearance', 18]` and `['box', 34.5]`;
  - 'draws into the gap…': both `{ z: 36, height: 16.5 }` become `{ z: 36, height: 18 }` ⚠ (the drawn run snaps to the gap; report if `createRun` gives something else).
- `bottoms.test.js` line 84: `expect(faces[0]).toMatchObject({ z: 53.875, height: 36 });` (the box moved up 1 1/2" and got shorter; the doors stay).
- `runBands.test.js` (G6 cap) `z: 52.5` → `z: 54`; `bandParts.test.js` line 56 the cap row's `52.5` → `54`.
- Golden snapshot: `npx vitest run src/elevation/model/__tests__/golden.test.js -u`. Only G6 may change: its upper `ea4373b3…` z 54 → 55.5, height 36 → 34.5; the held panel run `b1ec1b4a…` height 16.5 → 18; the cap 52.5 → 54; and what follows from those (faces, dimensions, part sizes). ⚠ If anything outside G6 changes, stop and report.

**Don't touch:** `bottoms.js`, `styles.js` (model), `roomSync.js`, the UI.

**NEW `src/elevation/model/__tests__/belowClearance.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import elevationReducer, { setRunBottom } from '../../store/elevationSlice.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { auto, currentRun, run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const RAIL = { id: 'rail', kind: 'light_rail', height: 1.5, doors: 'cover' };
const CORBELS = { id: 'corbels', kind: 'corbels', height: 6, doors: 'visible' };
const G1_UPPER = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';
const G2_UPPER = 'ab0981ca-8621-45ba-a924-dbe318646f67';

/** A golden upper with `bottom` below it: its box, each cabinet's first face, the parts below and the frame bottom. */
function upperWith(name, runId, bottom) {
  const room = structuredClone(document.rooms.find((candidate) => candidate.name === name));
  room.walls.flatMap((wall) => wall.runs).find((candidate) => candidate.id === runId).bottom = bottom;
  const synced = syncRoom(room, settings);
  const wall = synced.walls.find((candidate) => candidate.runs.some((entry) => entry.id === runId));
  const view = resolveWall(synced, wall, 'front');
  const upper = view.runs.find((candidate) => candidate.id === runId);
  const scene = runScene(synced, view, upper, settings);
  return {
    box: [upper.z, upper.height],
    faces: [...scene.faceLayouts.values()].map((layout) => [layout.faces[0].z, layout.faces[0].height]),
    parts: runBands(synced, view, upper, settings, scene).bottomParts.map(({ kind, z, height }) => [kind, z, height]),
    frameBottom: scene.frames.regions.length ? Math.min(...scene.frames.regions.map((region) => region.z)) : null,
  };
}

describe('SPEC-46.2.1 an upper\'s clearance runs to the bottom of the parts below it', () => {
  it('shrinks a Euro upper by the light rail below it; the doors stay put (G1)', () => {
    expect(upperWith('G1 Euro kitchen', G1_UPPER, [])).toEqual({
      box: [54, 36], faces: [[53.875, 36], [53.875, 36]], parts: [], frameBottom: null,
    });
    expect(upperWith('G1 Euro kitchen', G1_UPPER, [RAIL])).toEqual({
      box: [55.5, 34.5], faces: [[53.875, 36], [53.875, 36]], parts: [['light_rail', 54, 1.5]], frameBottom: null,
    });
  });

  it('hangs corbels below a face frame upper\'s frame, with their bottom 18" over the counter (G2)', () => {
    expect(upperWith('G2 Face frame kitchen', G2_UPPER, [CORBELS])).toEqual({
      box: [60.75, 29.25],
      faces: [[61.75, 26.5], [61.75, 26.5], [61.75, 26.5]],
      parts: [['corbels', 54, 6]],
      frameBottom: 60,
    });
  });

  it('keeps a manual upper\'s parts where its box bottom was; the box gets shorter', () => {
    const at = { wallId: 'wall-1', runId: 'run-1' };
    const state = stateWithRun(run({
      cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 36, depth: 12, autoCount: false, items: [auto('a')],
    }));
    const added = elevationReducer(state, setRunBottom({ ...at, bottom: [RAIL] }));
    expect([currentRun(added).heightMode, currentRun(added).z, currentRun(added).height]).toEqual(['manual', 55.5, 34.5]);
    const removed = elevationReducer(added, setRunBottom({ ...at, bottom: [] }));
    expect([currentRun(removed).z, currentRun(removed).height]).toEqual([54, 36]);
  });
});
```

What the numbers are: counter 36 + 18 = 54 is where the lowest part's bottom goes. G1 (Euro): a 1 1/2" rail puts the box at 55 1/2 (top stays 90); its doors already hung 1 1/8" below the rail, so they stay at 53 7/8, 36" tall. G2 (face frame, beaded): corbels 6" hang below the frame's normal 3/4" drop, so the frame bottom is at 60, the box at 60 3/4 (29 1/4" tall), faces 1" up at 61 3/4 and 88 1/4 − 61 3/4 = 26 1/2" tall.

**Count:** 1076 + 3 = **1079**. Golden snapshot: G6 only.

---

## §5 Step 412 — UI

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/properties/RunBottomSection.jsx` | 100 | Doors labels and options by style; a face frame note |
| `src/elevation/components/properties/RunProperties.jsx` | 129 | line 124 passes `room` |
| `src/elevation/components/RunGroup.jsx` | 477 | a part behind the frame draws dashed, unfilled (line ~253) |
| `src/elevation/components/properties/RunFaceOptions.jsx` | 81 | the upper Bottom select |

**Contract.**
- `RunBottomSection({ room, run, settings, actionBase })`: `frame = isInsetStyle(resolveStyle(settings, room, run))` (both from `../../model/index.js`).
  - Face frame labels: `cover` *Frame rail covers it (lights behind)*, `flush` *Frame hangs below, boxes 0" reveal*, `visible` *Below the frame*. On a face frame run, a cap or corbels offer only `visible` (its stored value shows as-is if it's `flush`).
  - The note under the list on a face frame upper: *Face frame: a covered part makes the bottom rail deeper; "hangs below" drops the whole rail under the doors (light trough). Clearance runs to the lowest part.* Euro keeps today's note plus *Clearance runs to the lowest part.*
- `RunProperties` line 124: `<RunBottomSection room={room} run={run} settings={settings} actionBase={actionBase} />`.
- `RunGroup` bottom parts (line ~253): when `part.behind`, `fill="transparent"`, `dash={[4, 3]}`, same stroke; otherwise as today.
- `RunFaceOptions`, the upper **Bottom** select: rendered only when `!(run.bottom?.length)`; otherwise a grey line *Bottom: set by Below the run*. Options `overhang` *Overhang (doors below box)* and `counter` *Flush (on counter / nothing below)*; `value = run.upperBottom === 'flush' ? 'counter' : (run.upperBottom ?? 'overhang')`.

**Don't touch:** the model, the store, `persistence.js` (`'flush'` stays valid), other components.

UI only, no new tests. Gate: `npm test && npm run lint && npm run build`; 1079 tests.

---

## End-to-end check (Kyle)

- Euro upper: add a light rail (cover) → the boxes get 1 1/2" shorter at the bottom, the doors don't move, the rail's bottom is 18" over the counter. Remove it → back.
- Face frame upper: add a light rail (Frame rail covers it) → bottom rail 2 1/4" (3/4 over the box), rail dashed behind the frame, frame bottom at 18". Switch it to *Frame hangs below* → the boxes' bottom reveal goes to 0 (plus bead) and the full 1 1/2" rail shows under the doors. Light trough 3" the same way. Corbels → hang below the frame.
- A run drawn into a gap (manual height): add a part below → the box shrinks from the bottom.
- A back panel cell: shows the room's door frame and is as thick as the style (13/16" etc.); pick *Sheet slab* on it → plain, 3/4".
- Cabinet style → Bottom shows only *Overhang* / *Flush (on counter…)*, and disappears when there's a part below.
- G6-style stacks (base / panel run / upper with a cap): the panel run now ends at the cap's bottom, 18" over the counter.

**Known for now:**
- Face frame bases/talls with parts below aren't absorbed into the frame.
- Manual runs only adjust when the parts change from now on.
