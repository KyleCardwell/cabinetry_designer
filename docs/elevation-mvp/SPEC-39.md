# Elevation Lab — SPEC-39 (consolidation)

Steps 287–299, after 38.3. Line numbers are at `3afa1ba` (step 283); round 38.3 (steps 284–286) keeps every file's line numbers in the ranges below except `elevationSlice.js`, where `setRunEnd` gains 2 lines, and the slice table below already allows for that. Confirm each range by its first and last names before cutting. Baseline **844**. The design is `docs/elevation-mvp/CONSOLIDATION-PLAN.md`, Part B.

**The promise of this round: no behavior changes.** Every step leaves the suite green with the same test count or more, and the golden-room snapshots from step 287 unchanged. A step that needs a snapshot change is a bug in the step: fix the step, never the snapshot.

| Step | What | Tests after |
|---|---|---|
| **287** | C1 — Golden rooms: six real rooms (drawn by Kyle) snapshotted through everything they derive | 851 |
| **288** | C2a — `elevationSlice.js` split, part 1: shared helpers, rooms, walls, UI/selection | 851 |
| **289** | C2b — `elevationSlice.js` split, part 2: soffits/recesses/openings, runs, items, cells, styles | 851 |
| **290** | C3 — `elevationSlice.test.js` split to match | 851 |
| **291** | C4a — `room.js` split, part 1: cloning, anchors, pins, sync and diagnostics | 851 |
| **292** | C4b — `room.js` split, part 2: joins, stretching and moving | 851 |
| **293** | C5a — `ElevationCanvas.jsx`: dimension and preview layers become components | 851 |
| **294** | C5b — `ElevationCanvas.jsx`: keyboard, stretch, run-move and joint-drag hooks | 851 |
| **295** | C6 — `PlanCanvas.jsx`: scene and overlay layers become components; keyboard and wall-edit hooks | 851 |
| **296** | C7 — `faceFeatures()`: everything on a wall face in one shape; the plan face row reads it | 852 |
| **297** | C8 — `parts.js`: the ordered parts list moves out of `partNumbers.js` as `roomParts()` | 853 |
| **298** | C9 — Parts carry their elevation rectangle and source | 855 |
| **299** | C10 — Housekeeping: file-size table, move-by-script rule, unused exports, TODO | 855 |

Renumbering (already in the plan docs): combine and full grids is round **40**, panel construction and nosing **41**. 38.2 (recessed cabinet laps, cutouts) is parked until Kyle comes back to it.

## §1 Decisions

- **Move code, don't rewrite it.** Every split moves existing functions, reducers, JSX and hooks verbatim: same names, same bodies, same order. The only edits allowed are imports/exports, turning a closure's free variables into a parameter object (hooks), and props (components). Logic changes are out of scope even when they look like fixes; note them in the summary instead.
- **Move by script, not by retyping.** Each split step cuts its line ranges into the new files with a small script (`sed -n 'a,bp'`, or a Node/Python read-modify-write), then fixes imports. Retyping 1,800 lines is where the cost and the mistakes come from. Line numbers are against `3afa1ba`; each step after 288 says where they've shifted.
- **Public surfaces don't change.** `elevationSlice.js` keeps exporting every action, the reducer, and `createInitialElevationState`. `room.js` keeps exporting every function it exports today. `partNumbers.js` keeps `partNumbers`. No import outside the files a step names has to change.
- **Private helpers needed by a sibling module** are exported from the module they move to, but not re-exported from the old public file.
- **The golden snapshot is the gate.** It covers the synced room, diagnostics, part numbers, plan clearances, every wall face's dimension rows, and every run's layout and plan pieces. The store and UI splits are gated by the existing store tests plus `npm run build` and a hand check.
- **One room = one JSON document** (decided 2026-10-02): the consolidation keeps the document shape exactly as it is. Organizing it into "space" and "cabinetry" sections, if ever, is a schema-versioned migration later, not part of this round.

---

## §2 Step 287 — C1: golden rooms

### Kyle, before the step: draw the six rooms

In the running app (`npm run dev`), draw these as six rooms in one document, named exactly as below. They don't need to be pretty; they need to exercise the features. Then save the document:

1. In the browser's dev tools console: `copy(localStorage.getItem('cd.elevationLab.v4'))`
2. Paste into a new file `cabinetry_designer/src/elevation/model/__tests__/fixtures/golden.json` and save.
3. Commit it ("golden rooms fixture") before running step 287.

| Room name | What to put in it |
|---|---|
| `G1 Euro kitchen` | An L of two walls with an inside corner. Bases and uppers on both walls, a blind corner base, a window with a sink base pinned to its center, a tall at one end with an end panel, a filler at a wall end. An island: a free-standing short wall with bases on both faces and end panels. |
| `G2 Face frame kitchen` | One or two walls, room style beaded inset face frame. A drawer stack, a tall split down into two boxes, a door with casing, a wall end panel the frame meets. |
| `G3 Bath alcove` | A back wall with wing walls (or return walls) both sides and a soffit. A base run with a countertop between them; a panel run sitting on the counter and held under the soffit, end panels extended to the floor, a back panel cell, a top panel. |
| `G4 T-filler run` | A Euro run with T-fillers on all seams, L end panels, a cabinet split down (a stacked seam), and an inside-corner T end. |
| `G5 Recess room` | A fireplace wall with a projection between two 24" deep recesses, cabinets on the face beside them and in each recess (one base deeper than its recess), a raised medicine-cabinet recess with a cabinet on it, and a door in the back of a recess on another wall. |
| `G6 Stacked runs` | A base with a countertop, a panel run that sits on it and is held under an upper with a bottom cap, a light rail under the upper, a wood top on one run, and an outset run. |

### The step

**Files:** NEW `src/elevation/model/__tests__/golden.test.js` (and the `__snapshots__/golden.test.js.snap` vitest writes on the first run). `fixtures/golden.json` must already be committed.

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { frontDepth } from '../corners.js';
import { horizontalChains, openingChain, openingClearances } from '../dimensions.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { partNumbers } from '../partNumbers.js';
import { planClearances } from '../clearances.js';
import { planRunPieces } from '../planPieces.js';
import { resolveWall, roomDiagnostics, syncRoom } from '../room.js';
import { wallFaceSegments } from '../wallFaceRow.js';
import { WALL_SIDES } from '../wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

// Anything that creates an id while deriving gets a predictable one.
vi.mock('uuid', () => {
  let count = 0;
  return { v4: () => `golden-${(count += 1)}` };
});

const NAMES = [
  'G1 Euro kitchen', 'G2 Face frame kitchen', 'G3 Bath alcove',
  'G4 T-filler run', 'G5 Recess room', 'G6 Stacked runs',
];
const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;

/** The part fields that exist today; step 298 adds more, and the snapshot mustn't notice. */
function partsOf({ parts }) {
  return parts.map(({ key, kind, wallId, side, runId, pieceId, molding, width, number }) => ({
    key, kind, wallId, side, runId, pieceId, molding, width, number,
  }));
}

function derived(room) {
  const synced = syncRoom(room, settings);
  return {
    room: synced,
    diagnostics: roomDiagnostics(room, settings),
    parts: partsOf(partNumbers(synced, settings)),
    clearances: planClearances(synced, settings),
    walls: synced.walls.map((wall) => ({
      id: wall.id,
      faceRows: Object.fromEntries(WALL_SIDES.map((side) => [
        side, wallFaceSegments(synced, wall, side, settings),
      ])),
      sides: Object.fromEntries(WALL_SIDES.map((side) => {
        const view = resolveWall(synced, wall, side);
        return [side, {
          lower: horizontalChains(synced, view, 'lower', settings),
          upper: horizontalChains(synced, view, 'upper', settings),
          wallRow: openingChain(synced, view, settings),
          clearanceRow: openingClearances(synced, view, settings),
          runs: view.runs.map((run) => {
            const layout = layoutRun(synced, view, run, settings);
            return {
              id: run.id,
              frontDepth: frontDepth(run, settings),
              layout,
              plan: planRunPieces(synced, view, run, settings, layout,
                runFaceLayouts(synced, view, run, settings, layout)),
            };
          }),
        }];
      })),
    })),
  };
}

describe('C1 golden rooms', () => {
  it('holds the six rooms', () => {
    expect(document.rooms.map(({ name }) => name)).toEqual(NAMES);
  });

  for (const name of NAMES) {
    it(`${name} derives exactly what it did`, () => {
      const room = document.rooms.find((candidate) => candidate.name === name);
      expect(derived(room)).toMatchSnapshot();
    });
  }
});
```

Run it once to write the snapshot (`npx vitest run src/elevation/model/__tests__/golden.test.js`), run it a second time to confirm it's stable (no `-u`), and commit the snapshot with the test. If the fixture fails to load (a name missing, `normalizeElevationDocument` returning something else), stop and say so: Kyle fixes the fixture, not the test.

**Count:** 844 + 7 = **851**.

---

## §3 Steps 288–289 — C2: split `elevationSlice.js`

`createSlice` takes one `reducers` object, so the split is: each domain module exports a plain object of case reducers (including the `{ reducer, prepare }` entries as they are), and `elevationSlice.js` spreads them:

```js
const elevationSlice = createSlice({
  name: 'elevation',               // unchanged
  initialState: …,                 // unchanged
  reducers: {
    ...roomReducers,
    ...wallReducers,
    ...featureReducers,
    ...runReducers,
    ...itemReducers,
    ...cellReducers,
    ...styleReducers,
    ...uiReducers,
  },
});
```

The action export list (`export const { … } = elevationSlice.actions`, 1866–1971 after 38.3) and `export default elevationSlice.reducer` stay exactly as they are. Spread order follows today's source order, so the actions object keeps its order.

### Where everything goes (lines at `3afa1ba`, plus 2 from `setRunEnd` on)

| New file under `src/elevation/store/slices/` | Lines | Contents |
|---|---|---|
| `helpers.js` | 100–149, 180–346 | `copySettings`, `withoutAuto`, `createWall`, `createRoom`, `roomIndexFor`, `roomFor`, `wallLocation`, `runLocation`, `openingLocation`, `soffitLocation`, `RECESS_KEYS`, `recessLocation`, `recessView`, `refreshRecessEnds`, `resolvedSoffitCandidate`, `syncRoomAt`, `setCompensatedWalls`, `STYLE_FIELD_KEYS`, `cleanPartial`, `roomCabinets`, `withStandardDrawers`, `itemIndexFor`, `clearTransientSelection`, `activateRoom`. All exported. |
| `rooms.js` | 352–439 | `addRoom` … `centerRoomOnOrigin` → `export const roomReducers = { … }` |
| `walls.js` | 440–723 | `addWall` … `flipWall` → `wallReducers` |
| `features.js` | 731–1054 | `addSoffit` … `deleteOpening` (soffits, recesses, `setRunRecess`, openings) → `featureReducers` |
| `runs.js` | 724–730, 1055–1388 | `addRun`, `replaceRun` … `setItemTFiller` → `runReducers` |
| `items.js` | 1389–1522 | `setItemWidth` … `removeItem` → `itemReducers` |
| `cells.js` | 1523–1716 | `splitCell` … `setCellExtend` → `cellReducers` |
| `styles.js` | 1717–1792 | `setItemFace` … `setItemReveals` → `styleReducers` |
| `ui.js` | 1793–1863 | `setFacePath`, `setSelection`, `clearSelection`, `setTool`, `setMessage`, `setView`, `updateSettings` → `uiReducers` |

`createInitialElevationState` (150–179) stays in `elevationSlice.js` and imports `copySettings`, `createRoom` from `./slices/helpers.js`. The `runs.js` entry keeps `addRun` first, so with `...runReducers` placed after `...featureReducers` the action order changes for `addRun` only; that's fine (nothing depends on key order), but say so in the summary.

Imports (1–99) are divided by use: each new file imports only what its moved code uses. `npm run lint` (`no-unused-vars`, `no-undef`) is the check.

**Step 288** moves `helpers.js`, `rooms.js`, `walls.js` and `ui.js`. **Step 289** moves `features.js`, `runs.js`, `items.js`, `cells.js` and `styles.js`, after which `elevationSlice.js` is the imports of the nine modules, `createInitialElevationState`, the `createSlice` call, the export list and the default export (≈ 200 lines).

**Count:** unchanged, **851**.

---

## §4 Step 290 — C3: split `elevationSlice.test.js`

Lines at `3afa1ba` (the test file doesn't change in 288–289).

| New file under `src/elevation/store/__tests__/` | Lines of `elevationSlice.test.js` |
|---|---|
| `helpers/sliceFixtures.js` (not a test file) | 102–211: `auto`, `fixed`, `run`, `opening`, `stateWithRun`, `currentOpening`, `currentRun`, `pin`, all exported |
| `sliceRooms.test.js` | 212–767, 1584–1814, 1922–1966, 2443–2479 |
| `sliceRuns.test.js` | 768–942, 1221–1253, 1319–1583, 1967–2082, 2413–2442, 2480–2557 |
| `sliceFeatures.test.js` | 943–1093, 1300–1318, 1815–1921 |
| `sliceCells.test.js` | 1094–1220, 1254–1299, 2083–2412 |

Each new test file imports `describe, expect, it` from vitest, what it uses from the fixtures, and only the actions it uses from `../elevationSlice.js` (1–101 is the full list to pick from). `elevationSlice.test.js` is deleted once the four files pass. Before deleting it, check the test count: four files together must equal what the old file had (`npx vitest run src/elevation/store/__tests__/elevationSlice.test.js` reports it; record it in the summary).

`helpers/` sits inside `__tests__/`; check `vitest.config` / `vite.config.js` `test.include` so `sliceFixtures.js` isn't picked up as a test (it has no `.test.` in its name, so the default pattern skips it).

**Count:** unchanged, **851**.

---

## §5 Steps 291–292 — C4: split `room.js`

`room.js` keeps `flipAnchor`, `flipRunsForWall` and `resolveWall` (1729–1791) and re-exports everything it exports today, by name:

```js
export { compensateRuns } from './roomClone.js';
export {
  describeAnchor, endCornerAnglesForRun, endMinWidthsForRun, resolveRunAnchorDatum,
} from './runAnchors.js';
export { pinTargetsForRun, resolvePinTarget, resolvePinnedSpan } from './runPins.js';
export { roomDiagnostics, syncRoom, tryPlaceRun } from './roomSync.js';
export {
  dissolveJoint, joinEdges, joinStack, joinTouchingEdges, joinTouchingStack, moveJoint, resizeRun,
} from './runJoins.js';
export { moveRun, stretchRun } from './runMoves.js';
```

### Where everything goes (lines at `3afa1ba`)

| New file under `src/elevation/model/` | Lines | Contents | Step |
|---|---|---|---|
| `roomClone.js` | 83–201 | `cloneRun`, `cloneRoom` (both exported: sync and the edits use them), `compensateRuns` | 291 |
| `runAnchors.js` | 203–446 | `runSideCorner`, `endMinWidthsForRun`, `endCornerAnglesForRun`, `openingAnchorDatum`, `resolveRunAnchorDatum`, `describeAnchor`, `horizontalResolution` and `casingClearanceWarnings` (both exported: sync uses them) | 291 |
| `runPins.js` | 447–583 | `resolvePinTarget` … `resolvePinnedSpan` | 291 |
| `roomSync.js` | 584–900 | `resolveWallSpans`, `floorRunsWithTops`, `withSeamGap`, `withFrame`, `withWallPanels`, `syncRoom`, `roomDiagnostics`, `tryPlaceRun` | 291 |
| `runJoins.js` | 901–1321 | `joinStack`, `joinTouchingStack`, `runEdgeX`, `runsOverlapVertically` and `withoutAuto` (exported: moves use them), `joinEdges`, `joinTouchingEdges`, `dissolveJoint`, `resizeRun`, `jointXRange`, `moveJoint` | 292 |
| `runMoves.js` | 1322–1728 | `stretchRun`, `moveRun` | 292 |

The three constants (80–82) are copied into each module that uses them (`STRETCH_EDGE_SNAP_DISTANCE`, `PIN_EPSILON`, `JOIN_EDGE_TOLERANCE`); there's no shared constants module for three numbers.

Dependency direction (no cycles): `roomClone` ← `runAnchors`, `runPins` ← `roomSync` ← `runJoins` ← `runMoves`; `room.js` re-exports all and imports nothing from them except for `flipRunsForWall` / `resolveWall`'s own needs. If a moved function turns out to call something "later" in this list, say so and stop rather than introducing a cycle.

**Count:** unchanged, **851**.

---

## §6 Steps 293–294 — C5: split `ElevationCanvas.jsx`

### Step 293: layers become components (render only)

Lines at the commit after 292 (unchanged since `3afa1ba`: no earlier step touches this file).

| New component under `src/elevation/components/` | Lines | Contents |
|---|---|---|
| `ElevationDimensions.jsx` | 1700–1850 (`{dimensionChains && dimensionOffsets && ( <Layer …> … </Layer> )}`) | Every `DimensionRow` and the elevation label. |
| `ElevationPreviews.jsx` | 1851–1895 | The stretch preview layer and the drag preview layer. The part-number layer (1896–1906) stays. |

Each component receives, as props, exactly the values its JSX reads (names unchanged: `dimensionChains`, `dimensionOffsets`, `transform`, `wall`, `room`, `settings`, `tool`, `selection`, `cursor`, and each callback such as `editPieceSegment`, `handleRunSegmentClick`, `startRunMove`, `updateRunMove`, `finishRunMove`, `selectFeature`, `stretchPreview`, `dragPreview`). The canvas renders `<ElevationDimensions … />` and `<ElevationPreviews … />` in the same places. The memos (`dimensionChains`, `dimensionOffsets`, `dragPreview`) stay in the canvas: other code reads them.

### Step 294: four hooks

Lines at the commit after 293 shift by the JSX removed at the end of the file only, so these ranges (all above it) still hold.

| New hook under `src/elevation/components/canvas/` | Lines | Returns |
|---|---|---|
| `useElevationKeys.js` | 541–677 (the keydown/keyup effect) | nothing (it's an effect) |
| `useRunStretch.js` | 1125–1255 | `{ previewStretch, commitStretch, startStretch, updateStretch, finishStretch }` |
| `useRunMove.js` | 1256–1369 | `{ applyRunMove, startRunMove, handleRunSegmentClick, updateRunMove, finishRunMove }` |
| `useJointDrag.js` | 1370–1567 | `{ previewJointDrag, commitJointDrag, startJointDrag, updateJointDrag, finishJointDrag, unjoinRunSide }` and the effect at 1544–1561 |

Each hook takes one argument, an object of everything its moved code reads from the canvas (state, setters, refs, memos, `dispatch`, `showMessage`, other callbacks), destructured at the top with the same names, so the bodies don't change. The `useCallback` dependency lists stay as they are. The canvas calls the hooks where the code used to be, in the same order (hook order matters), and destructures their returns. Where one hook needs another's callback (the run move and stretch share `applyRunAlignment`, for example), pass it in; don't merge hooks.

After 294 the canvas is the state, refs, memos, view/zoom code, the draw gesture handlers and the main `<Layer>` (≈ 900 lines). Moving those is not in this round.

**Count:** unchanged, **851** both steps (no component tests; `npm run build` and the hand check are the gate).

---

## §7 Step 295 — C6: split `PlanCanvas.jsx`

Lines at `3afa1ba` (unchanged since).

| New file under `src/elevation/plan/` | Lines | Contents |
|---|---|---|
| `PlanScene.jsx` | 1030–1116 | Walls, recesses, openings, run footprints, wall end panels, clearances, soffits. |
| `PlanOverlays.jsx` | 1117–1236 | Elevation markers, the wall move preview, the selected wall's handles, the move handle, the draw preview, the face label. |
| `usePlanKeys.js` | 417–468 | The keydown effect. |
| `usePlanWallEdits.js` | 724–849 | `handleWallEndpointDrag`, `previewPerpendicularMove`, the effect at 784–789, `beginWallMove`, `beginWallLength` |

Same rules as C5: props and hook inputs are exactly what the moved code reads, with unchanged names; hooks are called where the code was, in the same order. `AxisGuides` and `PlanAlignmentGuides` (1028–1029) stay in the canvas.

**Count:** unchanged, **851**.

---

## §8 Step 296 — C7: `faceFeatures()`

The placement half of C7 is dropped: openings and recesses already share `positions.js` (`positionReadouts`, `startFromReadout`, `stretchedStart`), and soffits store a resolved `x`. What's left is the read side.

**New `src/elevation/model/faceFeatures.js`:**

```js
import { landingsOn } from './landings.js';
import { openingGeometry } from './openings.js';
import { recessGeometry, recessesOn } from './recesses.js';
import { soffitsOn } from './soffits.js';
import { wallSideFrame, wallSideView } from './wallSides.js';

/**
 * Everything placed on one face of a wall (SPEC-39 C7), in that face's coordinates, left to right:
 * { kind: 'landing' | 'opening' | 'recess' | 'projection' | 'soffit', id, x, width, bottom, top, depth }.
 * Openings are on the front face only, by their outside (casing, else jamb). New hosts (a floor step,
 * a column face, a cutout filled with cabinetry) are added here.
 */
export function faceFeatures(room, wall, side, settings) {
  const view = wallSideView(wall, side);
  const { length } = wallSideFrame(room, wall, side);
  const features = landingsOn(room, view).map(({ wallId, a, b }) => ({
    kind: 'landing',
    id: wallId,
    x: a,
    width: b - a,
    bottom: 0,
    top: room.walls.find((candidate) => candidate.id === wallId)?.height ?? wall.height,
    depth: null,
  }));
  if (side === 'front') {
    for (const opening of wall.openings ?? []) {
      const geometry = openingGeometry(opening, length, settings);
      const outside = geometry.casing ?? geometry.jamb;
      features.push({
        kind: 'opening',
        id: opening.id,
        x: outside.x,
        width: outside.width,
        bottom: outside.z,
        top: outside.z + outside.height,
        depth: wall.thickness,
      });
    }
  }
  for (const recess of recessesOn(view)) {
    const geometry = recessGeometry(recess, length, wall.height);
    features.push({
      kind: recess.kind === 'projection' ? 'projection' : 'recess',
      id: recess.id,
      x: geometry.x,
      width: geometry.width,
      bottom: geometry.bottom,
      top: geometry.top,
      depth: geometry.depth,
    });
  }
  for (const soffit of soffitsOn(view)) {
    features.push({
      kind: 'soffit',
      id: soffit.id,
      x: soffit.x,
      width: soffit.width,
      bottom: soffit.bottom,
      top: wall.height,
      depth: soffit.depth,
    });
  }
  return features.sort((a, b) => a.x - b.x || a.kind.localeCompare(b.kind));
}
```

**`wallFaceRow.js` reads it.** `wallFaceSegments` builds its spans from `faceFeatures(room, wall, side, settings)`: landings → `'landing'`, openings → `'opening'`, recesses and projections → `'recess'` split around the openings inside them (as today), soffits ignored. The rest (from `if (spans.length === 0) return [];`) is unchanged. Its output must not change: the golden snapshot (`faceRows`) and `wallFaceRow.test.js` say so.

Export `faceFeatures` from `model/index.js` (new block at the end).

**Test,** appended to `wallFaceRow.test.js` (its `makeWall`, `makeRoom`, `host`, `DOOR`, `WINDOW`, `S` are already there):

```js
import { faceFeatures } from '../faceFeatures.js';

describe('SPEC-39 face features', () => {
  it('lists landings, openings, recesses and soffits on a face, left to right', () => {
    const R = {
      id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
      offset: 120, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
    };
    const SF = {
      id: 'SF', wallSide: 'front', x: 180, width: 40, bottom: 84, depth: 14, molding: 'crown',
      anchors: { left: false, right: false },
    };
    const room = makeRoom([makeWall('H', 0, 0, 246, 0, { openings: [DOOR], recesses: [R], soffits: [SF] })]);
    expect(faceFeatures(room, host(room), 'front', S)).toEqual([
      { kind: 'opening', id: 'D', x: 21, width: 42, bottom: 0, top: 83, depth: 4.5 },
      { kind: 'recess', id: 'R', x: 120, width: 48, bottom: 0, top: 108, depth: 24 },
      { kind: 'soffit', id: 'SF', x: 180, width: 40, bottom: 84, top: 108, depth: 14 },
    ]);
    expect(faceFeatures(room, host(room), 'back', S)).toEqual([]);
  });
});
```

(`DOOR` is the file's 36" door, jamb 24–60, 3" casing on three sides: outside 21–63, 0 to 83. The import goes with the file's other imports.)

**Count:** 851 + 1 = **852**.

---

## §9 Step 297 — C8: `roomParts()` moves out of `partNumbers.js`

**New `src/elevation/model/parts.js`.** Move from `partNumbers.js` (lines at `3afa1ba`): `PART_KINDS`, `LOWER_TYPES`, `compareRuns`, `runsInWalkOrder`, `carriesMolding`, `teeAnchor`, `runParts`, `wallPanelPart`, `orderedParts` (≈ 25–186), plus `PART_MOLDINGS`, `moldingPartKey` and `wallEndPanelPartKey` (which `orderedParts` uses). `orderedParts` is renamed and exported as **`roomParts(room, settings)`**, with this JSDoc:

```js
/**
 * Every part the shop makes for a room, in numbering order (SPEC-39 C8): wall by wall (left wall end
 * panels, then each face's runs in walk order, then right end panels), then one per molding kind in the
 * room. The single list part numbers, reports, the estimator and the AI layer read.
 */
```

`partNumbers.js` imports `roomParts` plus the moved helpers it still uses (`compareRuns` and `carriesMolding` for `wallMoldingBadges`, `PART_MOLDINGS`, `moldingPartKey`, `wallEndPanelPartKey`; `parts.js` exports them), calls `roomParts` where it called `orderedParts`, and **re-exports** `PART_MOLDINGS`, `moldingPartKey` and `wallEndPanelPartKey` so every existing import of them keeps working. `MOLDING_LABELS`, `MOLDING_BADGE_SLOTS`, `partNumbers`, `wallMoldingBadges`, `wallBadgeGroups` stay in `partNumbers.js`.

Export `roomParts` from `model/index.js` (beside the partNumbers block).

**NEW `src/elevation/model/__tests__/parts.test.js`:**

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { partNumbers } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

vi.mock('uuid', () => {
  let count = 0;
  return { v4: () => `parts-${(count += 1)}` };
});

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const synced = document.rooms.map((room) => syncRoom(room, settings));

describe('SPEC-39 the parts list', () => {
  it('is what part numbers number, in the same order, in every golden room', () => {
    for (const room of synced) {
      expect(roomParts(room, settings).map(({ key }) => key))
        .toEqual(partNumbers(room, settings).parts.map(({ key }) => key));
    }
  });
});
```

**Count:** 852 + 1 = **853**.

---

## §10 Step 298 — C9: parts carry their rectangle and source

Every record from `roomParts` gains `source`, and, where it has one, its elevation rectangle on its face (`x`, `z`, `height`; `width` already exists):

| `source` | Records | `x`, `z`, `height` from |
|---|---|---|
| `'piece'` | cabinets, fillers, end panels, panels, shelves | the part piece (`piece.x`, `piece.z`, `piece.height`) |
| `'tee'` | seam T-fillers | the tee (`tee.x`, `tee.z`, `tee.height`) |
| `'frame'` | face frames | the region (`region.x`, `region.z`, `region.height`) |
| `'wall_end_panel'` | wall end panels | the panel's front side: `x` = `panel.front.x`, `z` = 0, `height` = `panel.top` |
| `'molding'` | toe kick, top mold, crown | none: `x`, `z`, `height` are `null` |

Field order in each record: the existing fields as they are, then `x`, `z`, `height`, `source`. `partNumbers()` passes them through (it spreads each part), and the golden snapshot doesn't see them (it picks the old fields). Nothing else reads them yet: plan depth (`planFrom` / `planTo`) is added with the drawing payload in platform Phase 1, where the geometry engine needs it.

**Tests,** appended to `parts.test.js`:

```js
  it('gives every part its source, and every part but moldings a rectangle', () => {
    for (const room of synced) {
      for (const part of roomParts(room, settings)) {
        expect(['piece', 'tee', 'frame', 'wall_end_panel', 'molding']).toContain(part.source);
        if (part.source === 'molding') {
          expect([part.x, part.z, part.height]).toEqual([null, null, null]);
        } else {
          expect([part.x, part.z, part.height, part.width].every(Number.isFinite)).toBe(true);
          expect(part.height).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps the G4 parts list as it is now', () => {
    const room = synced.find(({ name }) => name === 'G4 T-filler run');
    expect(roomParts(room, settings)).toMatchSnapshot();
  });
```

**Count:** 853 + 2 = **855**.

---

## §11 Step 299 — C10: housekeeping

1. **`docs/elevation-mvp/PROMPT-CONVENTIONS.md`:**
   - Replace the file-size table ("Why cost grows…") with the current five largest source files and the largest test file, from `find src \( -name "*.js" -o -name "*.jsx" \) | xargs wc -l | sort -rn | sed -n 2,9p`, with rough token costs at ~12 tokens a line.
   - Add rule **9. Move code by script.** "A step that moves code between files cuts it by line range with a script (`sed -n 'a,bp'` or a short Node/Python read-modify-write) and then fixes imports. It never retypes moved code. The prompt gives the line ranges."
   - Replace "Standing structural cost" (PropertiesPanel was split long ago) with one line naming what's still large after this round, if anything is over 1,000 lines.
2. **Unused exports — list, don't delete.** Run, from `cabinetry_designer`:

   ```bash
   for name in $(grep -rhoE "^export (function|const) [A-Za-z0-9_]+" src/elevation --include=*.js \
     | awk '{print $3}' | sort -u); do
     uses=$(grep -rlw "$name" src --include=*.js --include=*.jsx | grep -v __tests__ | wc -l)
     [ "$uses" -le 1 ] && echo "$name"
   done
   ```

   and put the names it prints in the summary (they're exported but used only by their own file and tests). Delete nothing.
3. **`TODO.md`:** move items this round finished (the PropertiesPanel / big-file notes, if present) to its Done section. Nothing else in it changes.

No source changes. **Count:** unchanged, **855**.
