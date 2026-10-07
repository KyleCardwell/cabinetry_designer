# Elevation Lab — SPEC-39.1 (fixes and click-to-pick)

Steps 300–306, after round 39. Branch **`feature/elevation-mvp`** (merged from `elevation-grid-run-split` before step 300; see PROMPTS-39.1). Line numbers are at `622383f` (step 299). Baseline **860** (`npx vitest run` at `622383f`; round 38's small rounds added five tests beyond SPEC-39's count); **868** after.

| Step | What | Tests after |
|---|---|---|
| **300** | Loading a saved document syncs its rooms (recess runs reload on their recess) | 861 |
| **301** | A pin to an opening: callout inside the opening, centre line down to it | 862 |
| **302** | Casing clearances drawn inside the wall, at their run's height | 864 |
| **303** | Only the selected thing is outlined | 865 |
| **304** | `runScene()`: what RunGroup draws, derived in the model (no behavior change) | 866 |
| **305** | `pickStack()` / `defaultPick()`: everything under a point | 868 |
| **306** | The picker: a click opens a list of everything under it | 868 |

**The golden snapshot doesn't change in any step.** None of these touch `syncRoom`, the chains the snapshot records (`openingClearances` keeps its output; the in-wall height is a new function), part numbers or layouts. If `golden.test.js` fails, the step is wrong.

**Verified.** Every step below was applied to a throwaway copy of the repo at `622383f` and run: 868 tests pass, lint has no errors, `vite build` succeeds, the golden snapshot is unchanged, and the picker, outlines, pin callout and in-wall clearances were checked in a browser on G1 and G6.

## §1 Decisions (Kyle, 2026-10-03)

- **Loading a document syncs every room.** Derived fields (`_plane`, `_pinWidths`, `_seamGap`, `_frame`) are stripped on save and were only rebuilt by the next edit, so a reloaded room drew recess runs at the wall face (and pinned widths, seam gaps and frames were stale) until something was touched. Any edit re-synced the whole room, which is why fixing one run fixed the other.
- **Pin callout to an opening:** the callout line sits inside the opening, 6" above its jamb bottom (or at half its height if it's shorter than 12"), clear of the casing; a dashed extension line runs from the opening's mid-height at the datum down to it, so a centre-to-centre pin reads as ℄ even at 0". Pins to a wall end keep the callout at 40".
- **Casing clearances move inside the wall.** Each clearance (casing to the nearest run, or to the wall end) is drawn at the middle of where that run and the casing overlap vertically; with no run, at the casing's middle. Amber with the required value when too tight, as before. The below-wall clearance row goes away and the rows under it move up one row.
- **Only the selected thing is outlined.** Selecting a cabinet doesn't outline its run; selecting a face doesn't outline its cabinet; the run's overall dimension turns blue only when the run itself is selected. A selected cabinet's run still shows its stretch handles and anchor badges (those are tools, not highlight).
- **Click-to-pick.** A click anywhere on the elevation (select tool) finds everything under the pointer: faces, parts (cabinets, fillers, end panels, panels, shelves, T-fillers), runs, wall end panels, openings, soffits, recesses/projections, and the wall. It **selects what a click selected before** (the front-most thing that isn't a face; on a face of the already-selected cabinet, the face) and, when there's more than one thing besides the wall, **opens a list of all of them** at the pointer. Hovering a row outlines that thing on the canvas (pink, dashed); clicking a row selects it; ↑/↓ and Enter work; Esc, a click elsewhere or the mouse wheel closes it. A stacked run whose dimension is gone (SPEC-38.5) is picked from this list. This supersedes SPEC-38.5's "right-click or Alt-click list; a plain click keeps today's behavior": a plain click keeps today's selection *and* opens the list.
- Not this round: picking in plan view; picking moldings, toe kicks and countertops (a click on them falls through to the wall); click-to-cycle.

---

## §2 Step 300 — loading syncs every room

**`src/elevation/store/elevationSlice.js`** (173 lines). Import `syncRoom` from `'../model/room.js'` and, in `createInitialElevationState` (21–49), replace

```js
  const rooms = document?.rooms ?? [fallbackRoom];
```

with

```js
  // Derived fields aren't saved (SPEC-39.1): rebuild them, or recess runs load at the wall face.
  const rooms = (document?.rooms ?? [fallbackRoom]).map((room) => syncRoom(room, settings));
```

Nothing else changes. `addRoom` already syncs a new room; switching rooms doesn't need to, since every room is synced at load.

**NEW `src/elevation/store/__tests__/initialState.test.js`:**

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInitialElevationState } from '../elevationSlice.js';
import { normalizeElevationDocument } from '../persistence.js';

const document = normalizeElevationDocument(JSON.parse(readFileSync(
  new URL('../../model/__tests__/fixtures/golden.json', import.meta.url),
  'utf8',
)));

describe('SPEC-39.1 loading a saved document', () => {
  it('syncs every room, so runs in a recess load on their recess', () => {
    const state = createInitialElevationState(document);
    const room = state.rooms.find(({ name }) => name === 'G5 Recess room');
    const wall = room.walls.find(({ id }) => id === '9574ded4-3b8f-470a-afad-2ea36e0ef64c');
    expect(Object.fromEntries(wall.runs.map((run) => [run.id, run._plane?.recessId ?? null]))).toEqual({
      '98b55b5e-3f4c-4e37-8597-f8f7a46b3412': null,
      '1549b66c-9a22-4150-8aa2-ca7bdc54dd2c': '61c07d7e-ec8b-4306-9825-9f3decfb5fa1',
      'e9abb5dc-e72c-44c9-ac96-d3279b7752d9': '56ed5f83-a17f-4d5b-9bcf-b72501cecc4d',
    });
  });
});
```

(Checked against today's code: without the fix all three are `null`.)

**`src/elevation/store/__tests__/persistence.test.js`:** three hand-built fixtures there have walls without `joints`, `landings`, `endPanels` and `soffits`, and one has a run whose stored width sync re-solves (48 → 88 1/2), so loading now fills those in. Their point is that grids load and save unchanged, so each one's last line (775, 844, 904)

```js
    expect(toElevationDocument(state).rooms).toEqual(document.rooms);   // 844: splitDocument().rooms, 904: kindDocument().rooms
```

becomes a comparison of the run's grid:

```js
    expect(toElevationDocument(state).rooms[0].walls[0].runs[0].grid)
      .toEqual(document.rooms[0].walls[0].runs[0].grid);                // 844: splitDocument()…, 904: kindDocument()…
```

Nothing else in that file changes. **Count:** 860 + 1 = **861**.

---

## §3 Step 301 — pin callout inside the opening

**`src/elevation/model/dimensions.js`** (743 lines). `openingGeometry` is already imported. Beside `CENTERLINE_CALLOUT_Z` (439) add:

```js
/** How far above an opening's jamb bottom a pin callout to that opening sits (SPEC-39.1). */
export const CENTERLINE_ABOVE_SILL = 6;
```

In `centerlineMarkers` (445–471), after `const { anchor } = item.pin;` add:

```js
    const opening = item.pin.from === 'opening'
      ? (wall.openings ?? []).find((candidate) => candidate.id === item.pin.openingId) ?? null
      : null;
    const jamb = opening ? openingGeometry(opening, wallLengthValue, settings).jamb : null;
```

and change the returned record's `z` and end:

```js
      z: jamb ? jamb.z + Math.min(CENTERLINE_ABOVE_SILL, jamb.height / 2) : CENTERLINE_CALLOUT_Z,
      …                                   // value, pieceBottom, pieceTop, from, anchor unchanged
      anchor,
      ...(jamb ? { datumZ: jamb.z + jamb.height / 2 } : {}),
```

Wall-end pins come out exactly as today (the three existing `centerlineMarkers` tests don't change).

**`src/elevation/components/RunGroup.jsx`** (626 lines), the centerline block (557–603). After `const midX = …` add

```js
        const extensionTop = Number.isFinite(marker.datumZ)
          ? wallRectToScreen({ x: marker.datumX, z: marker.datumZ, width: 0, height: 0 }, transform)
          : null;
```

and, as the Group's first child (before the dashed span line):

```jsx
            {extensionTop && (
              <Line
                points={[datum.x, extensionTop.y, datum.x, datum.y]}
                stroke="#facc15"
                strokeWidth={1}
                dash={[3, 2]}
              />
            )}
```

**Test,** appended inside `describe('centerlineMarkers', …)` in `src/elevation/model/__tests__/dimensions.test.js` (after the SPEC-38.1 test, ≈ 622):

```js
  it('SPEC-39.1 puts a pin to an opening inside the opening, with a centre line down from its middle', () => {
    const sinkWindow = {
      id: 'W', kind: 'window', label: 'W1', measureMode: 'jamb', width: 36, height: 48, sillZ: 42,
      offset: 12, offsetFrom: 'right', offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 },
    };
    const run = {
      items: [
        { id: 'left', pin: null },
        { id: 'sink', pin: { from: 'opening', openingId: 'W', openingAnchor: 'center', value: 0, anchor: 'center' } },
      ],
    };
    const sinkPieces = [
      { id: 'left', role: 'item', x: 0, width: 24, z: 4, height: 30.5 },
      { id: 'sink', role: 'item', x: 78, width: 24, z: 4, height: 30.5 },
    ];

    expect(centerlineMarkers(run, sinkPieces, { openings: [sinkWindow] }, 120, DEFAULT_SETTINGS)).toEqual([{
      pieceId: 'sink',
      x: 90,
      datumX: 90,
      z: 48,
      value: 0,
      pieceBottom: 4,
      pieceTop: 34.5,
      from: 'opening',
      anchor: 'center',
      datumZ: 66,
    }]);
  });
```

(The window's jamb is 72–108 × 42–90 on a 120" wall, casing 69–111 × 39–93: today the callout is at 40, inside the casing.) **Count:** **862**.

---

## §4 Step 302 — casing clearances inside the wall

**`src/elevation/model/dimensions.js`.** `verticalStart`, `openingGeometry` and `wallLength` are already imported. After `openingClearances` (155–199) add:

```js
/**
 * The casing clearances as drawn inside the wall (SPEC-39.1): each openingClearances segment plus the
 * height `z` it sits at, the middle of where its run and the casing overlap vertically, or the
 * casing's middle when it runs to the wall end.
 */
export function clearanceCallouts(room, wall, settings) {
  const length = wallLength(wall);
  return openingClearances(room, wall, settings).map((segment) => {
    const opening = wall.openings.find((candidate) => candidate.id === segment.openingId);
    const geometry = openingGeometry(opening, length, settings);
    const casing = geometry.casing ?? geometry.jamb;
    const run = wall.runs.find((candidate) => candidate.id === segment.targetRunId) ?? null;
    const bottom = run ? Math.max(casing.z, verticalStart(run)) : casing.z;
    const top = run
      ? Math.min(casing.z + casing.height, run.z + run.height)
      : casing.z + casing.height;
    return { ...segment, z: (bottom + top) / 2 };
  });
}
```

Export it from `model/index.js` in the dimensions block, just before `openingClearances` (247).

**`src/elevation/canvas/dimensionLayout.js`** (92 lines), `belowRowOffsets` (20–32): add an option for no clearance row.

```js
export function belowRowOffsets({
  clearances: clearanceLevels = 0,
  pieces: pieceLevels = 0,
  overall: overallLevels = 0,
  openings: openingLevels = 0,
  clearanceRow = true,
} = {}) {
  const clearances = 20;
  const pieces = clearanceRow ? clearances + 22 + clearanceLevels * 14 : clearances;
  … // overall, openings, label unchanged
```

**NEW `src/elevation/components/ClearanceCallouts.jsx`:**

```jsx
import { Group, Line, Text } from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';
import { formatInches } from '../model/units.js';

/** Casing clearances drawn inside the wall at their own height (SPEC-39.1); amber when too tight. */
export default function ClearanceCallouts({ callouts, transform }) {
  return (
    <Group listening={false}>
      {callouts.filter((callout) => callout.end - callout.start > 1e-6).map((callout) => {
        const from = wallToScreen({ x: callout.start, z: callout.z }, transform);
        const to = wallToScreen({ x: callout.end, z: callout.z }, transform);
        const color = callout.violated ? '#f59e0b' : '#cbd5e1';
        const length = callout.end - callout.start;
        const text = callout.violated && Number.isFinite(callout.required)
          ? `${formatInches(length)} (${formatInches(callout.required)})`
          : formatInches(length);
        return (
          <Group key={`${callout.openingId}:${callout.side}`}>
            <Line points={[from.x, from.y, to.x, to.y]} stroke={color} strokeWidth={1} />
            {[from, to].map((point, index) => (
              <Line
                key={`tick:${index}`}
                points={[point.x - 3, point.y + 3, point.x + 3, point.y - 3]}
                stroke={color}
                strokeWidth={1}
              />
            ))}
            <Text
              x={(from.x + to.x) / 2 - 40}
              y={from.y - 14}
              width={80}
              align="center"
              text={text}
              fontSize={11}
              fill={color}
            />
          </Group>
        );
      })}
    </Group>
  );
}
```

**`src/elevation/components/ElevationCanvas.jsx`** (1272 lines):
- 65: import `clearanceCallouts` instead of `openingClearances` (it's the only use).
- 217: `clearances: clearanceCallouts(room, wall, settings),`
- 458–460: delete `clearanceLevels`.
- 476–481: `belowRowOffsets({ clearanceRow: false, pieces: lowerLevels, overall: lowerOuterLevels, openings: openingLevels })`.
- 517: delete `clearances: below.clearances + clear.below,`.

**`src/elevation/components/ElevationDimensions.jsx`** (177 lines): replace the first `DimensionRow` (the `dimensionChains.clearances` one, 25–35) with `<ClearanceCallouts callouts={dimensionChains.clearances} transform={transform} />` and import it. The Layer, every other row and every prop stay.

**Tests.** Append to `describe('openingClearances', …)` in `src/elevation/model/__tests__/casingAnchors.test.js` (import `clearanceCallouts` beside `openingClearances`):

```js
  it('SPEC-39.1 draws each clearance at the middle of its run and the casing, or of the casing', () => {
    const room = testRoom({
      runs: [
        cabinetRun({ x: 20, width: 40 }),
        cabinetRun({
          id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 114, width: 6, z: 54, height: 30, depth: 12,
        }),
      ],
    });
    expect(clearanceCallouts(room, room.walls[0], DEFAULT_SETTINGS)).toEqual([
      { openingId: 'window-1', label: 'W1', side: 'left', start: 60, end: 69,
        targetRunId: 'base', required: 0, violated: false, z: 34.75 },
      { openingId: 'window-1', label: 'W1', side: 'right', start: 111, end: 114,
        targetRunId: 'upper', required: 0, violated: false, z: 69 },
    ]);
    const alone = testRoom({ runs: [cabinetRun({ x: 20, width: 40 })] });
    expect(clearanceCallouts(alone, alone.walls[0], DEFAULT_SETTINGS)[1]).toMatchObject({ end: 120, z: 60 });
  });
```

(Casing 69–111 × 33–87. The base spans 0–36.5 from the floor, so 33–36.5 → 34.75; the upper 54–84 → 69; nothing right of the window → the casing's middle, 60.)

Append to `describe('belowRowOffsets', …)` in `src/elevation/canvas/__tests__/dimensionLayout.test.js`:

```js
  it('SPEC-39.1 drops the clearance row when clearances are drawn in the wall', () => {
    expect(belowRowOffsets({ clearanceRow: false })).toEqual({
      clearances: 20,
      pieces: 20,
      overall: 42,
      openings: 64,
      label: 86,
    });
  });
```

**Count:** 862 + 2 = **864**.

---

## §5 Step 303 — only the selected thing is outlined

**NEW `src/elevation/canvas/selectionHighlight.js`:**

```js
/**
 * What one run outlines (SPEC-39.1): only the selected thing. The run when the run itself is
 * selected, a piece when a piece is, a face when a face is; never the things it sits in.
 */
export function runHighlight(selectedRun, selectedPieceId = null, selectedFacePath = null) {
  if (!selectedRun) return { run: false, pieceId: null, facePath: null };
  if (!selectedPieceId) return { run: true, pieceId: null, facePath: null };
  if (selectedFacePath === null || selectedFacePath === undefined) {
    return { run: false, pieceId: selectedPieceId, facePath: null };
  }
  return { run: false, pieceId: null, facePath: selectedFacePath };
}
```

**`src/elevation/components/RunGroup.jsx`:** import it; after `const cursorKeys = …` (65) add `const highlight = runHighlight(selectedRun, selectedPieceId, selectedFacePath);`. Then exactly three changes:
- `PieceRect` (≈ 466): `selected={highlight.pieceId === piece.id}`
- `FaceOutlines` (≈ 516): `selectedPath={selectedPieceId === pieceId ? highlight.facePath : null}`. `selectable` and `showSizes` stay on `selectedPieceId` (a selected face keeps its cabinet's faces clickable).
- The run outline (≈ 610): `{highlight.run && (`

`selectedRun` keeps driving the stretch handles (335) and anchor badges (290). `ElevationCanvas.jsx` doesn't change.

**`src/elevation/components/ElevationDimensions.jsx`:** both `highlightRunId={selection.runId}` (59, 111) become `highlightRunId={selection.pieceId ? null : selection.runId}`. `activeRunId` stays.

**NEW `src/elevation/canvas/__tests__/selectionHighlight.test.js`:**

```js
import { describe, expect, it } from 'vitest';
import { runHighlight } from '../selectionHighlight.js';

describe('SPEC-39.1 only the selected thing is outlined', () => {
  it('outlines the run, a piece or a face, never what it sits in', () => {
    expect(runHighlight(false, null, null)).toEqual({ run: false, pieceId: null, facePath: null });
    expect(runHighlight(true, null, null)).toEqual({ run: true, pieceId: null, facePath: null });
    expect(runHighlight(true, 'cab-1', null)).toEqual({ run: false, pieceId: 'cab-1', facePath: null });
    expect(runHighlight(true, 'cab-1', 'r.0')).toEqual({ run: false, pieceId: null, facePath: 'r.0' });
  });
});
```

**Count:** **865**.

---

## §6 Step 304 — `runScene()`

The picker has to hit-test exactly what RunGroup draws, and today that's computed inside RunGroup's memos. Move it to the model. **No behavior change.**

**NEW `src/elevation/model/runScene.js`** (the bodies are RunGroup's 66–136 and 148–178 with the `useMemo` wrappers removed; `splitRun(run, settings, {…})` is `layoutRun`, which is the same call):

```js
import { blindEntries } from './blind.js';
import { blindCellWidths, cellPieces, panelOrientation, shelfParts } from './cells.js';
import { extendPieces } from './extensions.js';
import { layoutRun, runFaceLayouts } from './faceLayouts.js';
import { frameRegions } from './frames.js';
import { endPieceBottom, resolveStyle } from './styles.js';
import { teeFillers } from './tees.js';
import { formatInches } from './units.js';

const PANEL_LABELS = { side: 'Side', top: 'Top', back: 'Back' };

/**
 * Everything RunGroup draws for a run, derived once (SPEC-39.1): the layout, cells, faces, frames,
 * blind panels and the pieces as drawn (T-fillers, extensions and end drops applied). The canvas
 * draws from it and the click picker hit-tests it, so the two can't disagree.
 */
export function runScene(room, wall, run, settings) {
  const result = layoutRun(room, wall, run, settings);
  const cells = cellPieces(run, result);
  const faceLayouts = runFaceLayouts(room, wall, run, settings, result);
  const frames = frameRegions(room, run, cells, settings);
  const framedIds = new Set(frames.regions.flatMap((region) => region.cabinetIds));
  const hiddenIds = new Set(frames.regions.flatMap((region) => region.fillerIds));
  const ghostIds = new Set(frames.regions.flatMap((region) => region.panelIds));
  const blind = blindEntries(room, wall, run, settings, result);
  const subLabels = new Map();
  for (const piece of cells.pieces) {
    if (piece.kind === 'void') subLabels.set(piece.id, 'Open');
    if (piece.kind === 'panel') subLabels.set(piece.id, `${PANEL_LABELS[panelOrientation(piece)]} panel`);
    if (piece.kind === 'shelves') {
      subLabels.set(piece.id, `${piece.shelves.count} shelves${piece.shelves.back ? ' + back' : ''}`);
    }
  }
  for (const entry of blind.entries) {
    subLabels.set(entry.pieceId, `Blind ${formatInches(entry.boxWidth)}`);
    for (const [id, width] of blindCellWidths(cells.pieces, result.pieces, [entry])) {
      subLabels.set(id, `Blind ${formatInches(width)}`);
    }
    if (entry.panel && entry.endPieceId) {
      subLabels.set(entry.endPieceId, `Panel ${formatInches(entry.panel.width)}`);
    }
  }
  const panels = blind.entries.filter((entry) => entry.panel).map((entry) => ({
    key: `panel:${entry.side}`,
    x: entry.panel.x,
    width: entry.panel.width,
  }));
  const panelPieceIds = new Set(blind.entries
    .filter((entry) => entry.panel && entry.endPieceId)
    .map((entry) => entry.endPieceId));
  const panelBySide = { left: null, right: null };
  for (const entry of blind.entries) {
    if (entry.panel) panelBySide[entry.side] = entry.panel;
  }
  const endBottom = endPieceBottom(run, resolveStyle(settings, room, run), settings);
  const { drop } = endBottom;
  const shelves = cells.pieces.flatMap((piece) => shelfParts(piece, settings));
  const { tees, ells } = teeFillers(room, run, cells, settings);
  const endTees = new Map([
    ...tees.filter((tee) => tee.end).map((tee) => [tee.pieceId, tee]),
    ...ells.map((ell) => [ell.pieceId, ell]),
  ]);
  const seamTees = tees.filter((tee) => !tee.end).map((tee) => ({
    id: tee.id, kind: 'filler', role: 'tee', x: tee.x, z: tee.z, width: tee.width, height: tee.height,
  }));
  const base = cells.pieces.map((piece) => {
    const tee = endTees.get(piece.id);
    const shaped = tee ? { ...piece, x: tee.x, width: tee.width } : piece;
    const dropped = drop > 0
      && (shaped.kind === 'filler' || shaped.kind === 'end_panel')
      ? { ...shaped, z: shaped.z - drop, height: shaped.height + drop }
      : shaped;
    return panelPieceIds.has(piece.id)
      ? { ...dropped, kind: 'end_panel' }
      : dropped;
  });
  const drawnPieces = [
    ...extendPieces(wall, run, base).pieces.sort((a, b) => endTees.has(a.id) - endTees.has(b.id)),
    ...seamTees,
  ];
  return {
    result, cells, faceLayouts, frames, framedIds, hiddenIds, ghostIds, blind, subLabels,
    panels, panelPieceIds, panelBySide, endBottom, shelves, tees, ells, drawnPieces,
  };
}
```

**`src/elevation/components/RunGroup.jsx`:** delete 68–138 (`const result = useMemo(() => splitRun(…` through the `panelBySide` memo's `}, [blind]);`) and 150–180 (`const endBottom = endPieceBottom(…` through `}, [cells, drop, ells, panelPieceIds, run, tees, wall]);`), by script. (Those are 66–136 and 148–178 at `622383f`; step 303 adds two lines above them. Check the first and last line of each range before cutting.) In the first gap put:

```js
  const scene = useMemo(() => runScene(room, wall, run, settings), [room, run, settings, wall]);
  const {
    result, cells, faceLayouts, frames, framedIds, hiddenIds, ghostIds, subLabels,
    panels, panelPieceIds, panelBySide, endBottom, shelves, drawnPieces,
  } = scene;
```

Delete `PANEL_LABELS` (42) and every import lint then reports unused (expected: `blindEntries`, `blindCellWidths`, `cellPieces`, `panelOrientation`, `shelfParts`, `runFaceLayouts`, `frameRegions`, `endPieceBottom`, `resolveStyle`, `teeFillers`, `extendPieces`, `splitRun`, `endCornerAnglesForRun`, `endMinWidthsForRun`; keep whatever is still used, checked: `pinTargetsForRun` goes too). Add `import { runScene } from '../model/runScene.js';`. Everything from `const runEnd = …` on is unchanged.

**NEW `src/elevation/model/__tests__/runScene.test.js`:**

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { WALL_SIDES } from '../wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;

describe('SPEC-39.1 run scene', () => {
  it('derives every golden run as RunGroup did: same layout and faces, every drawn piece a rectangle', () => {
    for (const stored of document.rooms) {
      const room = syncRoom(stored, settings);
      for (const wall of room.walls) {
        for (const side of WALL_SIDES) {
          const view = resolveWall(room, wall, side);
          for (const run of view.runs) {
            const scene = runScene(room, view, run, settings);
            expect(scene.result).toEqual(layoutRun(room, view, run, settings));
            expect(scene.faceLayouts).toEqual(runFaceLayouts(room, view, run, settings));
            for (const piece of scene.drawnPieces) {
              expect([piece.x, piece.z, piece.width, piece.height].every(Number.isFinite)).toBe(true);
            }
          }
        }
      }
    }
  });
});
```

(22 runs across the six rooms; checked.) **Count:** **866**.

---

## §7 Step 305 — `pickStack()` and `defaultPick()`

**NEW `src/elevation/model/pick.js`:**

```js
import { CABINET_TYPE_IDS, KIND_LABELS } from './constants.js';
import { faceFeatures } from './faceFeatures.js';
import { FACE_TYPE_LABELS } from './faces.js';
import { runScene } from './runScene.js';
import { wallLabel } from './topology.js';
import { formatInches } from './units.js';
import { wallEndPanels } from './wallEndPanels.js';

const PICK_EPSILON = 1e-6;
const RUN_LABELS = {
  [CABINET_TYPE_IDS.BASE]: 'Base run',
  [CABINET_TYPE_IDS.UPPER]: 'Upper run',
  [CABINET_TYPE_IDS.TALL]: 'Tall run',
};
const RECESS_LABELS = { recess: 'Recess', projection: 'Projection' };
const FEATURE_ORDER = { opening: 0, soffit: 1, recess: 2 };

function contains(rect, point) {
  return point.x >= rect.x - PICK_EPSILON
    && point.x <= rect.x + rect.width + PICK_EPSILON
    && point.z >= rect.z - PICK_EPSILON
    && point.z <= rect.z + rect.height + PICK_EPSILON;
}

function size(rect) {
  return `${formatInches(rect.width)} × ${formatInches(rect.height)}`;
}

/**
 * Everything under a point on an elevation (SPEC-39.1), front to back: faces, then pieces (as drawn,
 * T-fillers first), then runs, wall end panels, openings, soffits, recesses and projections, and last
 * the wall itself. `point` is in the view's coordinates ({ x, z }, inches). Each candidate:
 * { kind, key, label, rect, selection, facePath }, where `selection` is a setSelection payload
 * (null for the wall: clear the selection) and `facePath` is set only on faces.
 */
export function pickStack(room, wall, settings, point) {
  const faces = [];
  const pieces = [];
  const runs = [];
  for (const run of wall.runs) {
    const runRect = { x: run.x, z: run.z, width: run.width, height: run.height };
    const scene = runScene(room, wall, run, settings);
    for (const [pieceId, layout] of scene.faceLayouts) {
      const face = layout.faces.find((candidate) => contains(candidate, point));
      if (!face) continue;
      faces.push({
        kind: 'face',
        key: `face:${run.id}:${pieceId}:${face.path}`,
        label: `${FACE_TYPE_LABELS[face.type] ?? 'Face'} ${size(face)}`,
        rect: { x: face.x, z: face.z, width: face.width, height: face.height },
        selection: { runId: run.id, pieceId },
        facePath: face.path,
      });
    }
    const drawn = scene.drawnPieces.filter((piece) => !scene.hiddenIds.has(piece.id));
    for (const piece of [...drawn].reverse()) {
      if (!contains(piece, point)) continue;
      const name = piece.role === 'tee'
        ? 'T-filler'
        : scene.subLabels.get(piece.id) ?? KIND_LABELS[piece.kind] ?? 'Piece';
      pieces.push({
        kind: 'piece',
        key: `piece:${run.id}:${piece.id}`,
        label: `${name} ${size(piece)}`,
        rect: { x: piece.x, z: piece.z, width: piece.width, height: piece.height },
        selection: { runId: run.id, pieceId: piece.id },
        facePath: null,
      });
    }
    if (contains(runRect, point)) {
      runs.push({
        kind: 'run',
        key: `run:${run.id}`,
        label: `${RUN_LABELS[run.cabinetTypeId] ?? 'Run'} ${formatInches(run.width)}`,
        rect: runRect,
        selection: { runId: run.id },
        facePath: null,
      });
    }
  }
  const side = wall.side ?? 'front';
  const endPanels = wallEndPanels(room, wall, settings).flatMap((panel) => {
    const rect = { x: panel[side].x, z: 0, width: panel.width, height: panel.top };
    return contains(rect, point) ? [{
      kind: 'end_panel',
      key: `end_panel:${panel.endpoint}`,
      label: `Wall end panel ${size(rect)}`,
      rect,
      selection: { endPanel: panel.endpoint },
      facePath: null,
    }] : [];
  });
  const stored = wall.sideSource ?? wall;
  const features = faceFeatures(room, stored, side, settings).flatMap((feature) => {
    if (feature.kind === 'landing') return [];
    const rect = { x: feature.x, z: feature.bottom, width: feature.width, height: feature.top - feature.bottom };
    if (!contains(rect, point)) return [];
    if (feature.kind === 'opening') {
      const opening = stored.openings.find((candidate) => candidate.id === feature.id);
      return [{
        kind: 'opening',
        key: `opening:${feature.id}`,
        label: `${opening.kind === 'door' ? 'Door' : 'Window'} ${opening.label}`,
        rect,
        selection: { openingId: feature.id },
        facePath: null,
      }];
    }
    if (feature.kind === 'soffit') {
      return [{
        kind: 'soffit', key: `soffit:${feature.id}`, label: 'Soffit', rect,
        selection: { soffitId: feature.id }, facePath: null,
      }];
    }
    const recess = (stored.recesses ?? []).find((candidate) => candidate.id === feature.id);
    return [{
      kind: 'recess',
      key: `recess:${feature.id}`,
      label: `${RECESS_LABELS[feature.kind]} ${recess?.label ?? ''}`.trim(),
      rect,
      selection: { recessId: feature.id },
      facePath: null,
    }];
  }).sort((a, b) => FEATURE_ORDER[a.kind] - FEATURE_ORDER[b.kind]);
  return [
    ...faces,
    ...pieces,
    ...runs,
    ...endPanels,
    ...features,
    {
      kind: 'wall',
      key: 'wall',
      label: wallLabel(room, stored),
      rect: { x: 0, z: 0, width: wall.length, height: wall.height },
      selection: null,
      facePath: null,
    },
  ];
}

/**
 * What a click selects (SPEC-39.1): the `prefer`red kind if it's under the click (the canvas prefers
 * 'face' when the click landed on a face of the selected cabinet), else the front-most candidate that
 * isn't a face, which is what a click always selected.
 */
export function defaultPick(candidates, prefer = null) {
  return (prefer && candidates.find((candidate) => candidate.kind === prefer))
    || candidates.find((candidate) => candidate.kind !== 'face')
    || null;
}
```

**NEW `src/elevation/model/__tests__/pick.test.js`** (every expectation below was checked against the golden fixture with this code):

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultPick, pickStack } from '../pick.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { WALL_SIDES } from '../wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;

function face(name, wallId = null) {
  const room = syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
  const wall = wallId
    ? room.walls.find(({ id }) => id === wallId)
    : room.walls.find(({ runs }) => runs.length > 0);
  return { room, view: resolveWall(room, wall, 'front') };
}

const summary = (stack) => stack.map(({ kind, label }) => [kind, label]);

describe('SPEC-39.1 everything under a click', () => {
  it('lists faces, parts, runs, end panels, openings, recesses and the wall, front to back', () => {
    const g6 = face('G6 Stacked runs');
    const panelRun = pickStack(g6.room, g6.view, settings, { x: 50, z: 44 });
    expect(summary(panelRun)).toEqual([
      ['piece', 'Back panel 101" × 16 1/2"'],
      ['run', 'Upper run 101"'],
      ['wall', 'Wall 2'],
    ]);
    expect(panelRun[1].selection).toEqual({ runId: 'b1ec1b4a-de2b-4a28-a694-77675f913ebd' });

    const base = pickStack(g6.room, g6.view, settings, { x: 10, z: 20 });
    expect(summary(base)).toEqual([
      ['face', 'Pair door 16 1/8" × 30 1/8"'],
      ['piece', 'Cabinet 32 1/2" × 30 1/2"'],
      ['run', 'Base run 101"'],
      ['wall', 'Wall 2'],
    ]);
    expect(base[0]).toMatchObject({
      selection: {
        runId: '677ec7a5-d97a-4cfd-8843-f960e3334ea2',
        pieceId: '4217b8dc-e0af-4e39-8f3e-efb6ec6b09c4',
      },
      facePath: 'r',
    });

    const g5 = face('G5 Recess room', '9574ded4-3b8f-470a-afad-2ea36e0ef64c');
    expect(pickStack(g5.room, g5.view, settings, { x: 60, z: 20 }).map(({ kind }) => kind))
      .toEqual(['face', 'piece', 'run', 'recess', 'wall']);
    expect(pickStack(g5.room, g5.view, settings, { x: 60, z: 70 }).map(({ selection }) => selection))
      .toEqual([{ recessId: '61c07d7e-ec8b-4306-9825-9f3decfb5fa1' }, null]);

    const kitchen = face('G1 Euro kitchen', 'cb33d774-f31e-41c1-bbe4-198cbf981619');
    expect(summary(pickStack(kitchen.room, kitchen.view, settings, { x: 72, z: 66 })))
      .toEqual([['opening', 'Window W1'], ['wall', 'Wall 1']]);
    const island = face('G1 Euro kitchen', '84063fed-ab0d-4a1d-ae05-ffe67decad5e');
    const endPanel = pickStack(island.room, island.view, settings, { x: 0.375, z: 10 });
    expect(summary(endPanel)).toEqual([['end_panel', 'Wall end panel 3/4" × 34 1/2"'], ['wall', 'Wall 4']]);
    expect(endPanel[0].selection).toEqual({ endPanel: 'end' });
  });

  it('finds every drawn part at its centre, and a click selects what it always did', () => {
    for (const stored of document.rooms) {
      const room = syncRoom(stored, settings);
      for (const wall of room.walls) {
        for (const side of WALL_SIDES) {
          const view = resolveWall(room, wall, side);
          for (const run of view.runs) {
            const scene = runScene(room, view, run, settings);
            for (const piece of scene.drawnPieces.filter(({ id }) => !scene.hiddenIds.has(id))) {
              const stack = pickStack(room, view, settings, {
                x: piece.x + piece.width / 2,
                z: piece.z + piece.height / 2,
              });
              expect(stack.some((candidate) => candidate.kind === 'piece'
                && candidate.selection.pieceId === piece.id)).toBe(true);
              expect(stack.at(-1).kind).toBe('wall');
            }
          }
        }
      }
    }
    const g6 = face('G6 Stacked runs');
    const base = pickStack(g6.room, g6.view, settings, { x: 10, z: 20 });
    expect(defaultPick(base).kind).toBe('piece');
    expect(defaultPick(base, 'face').kind).toBe('face');
    expect(defaultPick(pickStack(g6.room, g6.view, settings, { x: 150, z: 70 })).kind).toBe('wall');
  });
});
```

(85 drawn parts across the golden rooms, every one found.) Export them from `model/index.js` at the end: `export { runScene } from './runScene.js';` and `export { defaultPick, pickStack } from './pick.js';`. **Count:** 866 + 2 = **868**.

---

## §8 Step 306 — the picker

**NEW `src/elevation/components/canvas/usePicker.js`:**

```js
import { useCallback, useState } from 'react';
import { screenToWall } from '../../canvas/transform.js';
import { defaultPick, pickStack } from '../../model/pick.js';
import { setFacePath, setSelection } from '../../store/elevationSlice.js';

/**
 * Click-to-pick (SPEC-39.1). A click on anything in the elevation selects what a click always
 * selected and, when more than one thing besides the wall is under the pointer, opens a list of all
 * of them. The list belongs to the room, wall face and tool it opened on, and closes when they change.
 */
export default function usePicker({
  room, wall, settings, transform, stageRef, tool, suppressClickRef, dispatch,
}) {
  const [picker, setPicker] = useState(null);
  const context = `${room?.id}:${wall?.id}:${wall?.side ?? 'front'}:${tool}`;

  const apply = useCallback((candidate) => {
    if (!candidate?.selection) {
      dispatch(setSelection({}));
      return;
    }
    dispatch(setSelection(candidate.selection));
    if (candidate.facePath) dispatch(setFacePath(candidate.facePath));
  }, [dispatch]);

  const pickWith = useCallback((prefer) => {
    if (tool !== 'select' || suppressClickRef.current || !room || !wall || !transform) return;
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const candidates = pickStack(room, wall, settings, screenToWall(pointer, transform));
    const chosen = defaultPick(candidates, prefer);
    apply(chosen);
    setPicker(candidates.length > 2 ? {
      context,
      x: pointer.x,
      y: pointer.y,
      candidates,
      activeKey: chosen?.key ?? null,
      hoverKey: null,
    } : null);
  }, [apply, context, room, settings, stageRef, suppressClickRef, tool, transform, wall]);

  const pick = useCallback(() => pickWith(null), [pickWith]);
  const pickFace = useCallback(() => pickWith('face'), [pickWith]);
  const closePicker = useCallback(() => setPicker(null), []);
  const hoverPick = useCallback((key) => {
    setPicker((current) => (current ? { ...current, hoverKey: key } : current));
  }, []);
  const choosePick = useCallback((key) => {
    const candidate = picker?.candidates.find((entry) => entry.key === key);
    if (candidate) apply(candidate);
    setPicker(null);
  }, [apply, picker]);

  const open = picker?.context === context ? picker : null;
  return {
    picker: open,
    hovered: open?.candidates.find((candidate) => candidate.key === open.hoverKey) ?? null,
    pick,
    pickFace,
    choosePick,
    hoverPick,
    closePicker,
  };
}
```

**NEW `src/elevation/components/SelectionPicker.jsx`:**

```jsx
import { useEffect, useRef } from 'react';
import { Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';

const KIND_NAMES = {
  face: 'Face', piece: 'Part', run: 'Run', end_panel: 'Wall end', opening: 'Opening',
  soffit: 'Soffit', recess: 'Recess', wall: 'Wall',
};

/** The list of everything under a click (SPEC-39.1): ↑/↓ to move, Enter to choose, Esc to close. */
export default function SelectionPicker({ picker, onChoose, onHover, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!picker) return undefined;
    const keys = picker.candidates.map(({ key }) => key);
    const handleKeyDown = (event) => {
      if (!['Escape', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      const current = keys.indexOf(picker.hoverKey ?? picker.activeKey);
      if (event.key === 'Enter') {
        if (current >= 0) onChoose(keys[current]);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      onHover(keys[(current + step + keys.length) % keys.length]);
    };
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('wheel', onClose, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('wheel', onClose, true);
    };
  }, [onChoose, onClose, onHover, picker]);

  if (!picker) return null;
  return (
    <div
      ref={menuRef}
      className="absolute z-20 min-w-48 rounded border border-gray-600 bg-gray-950/95 py-1 text-sm shadow-xl"
      style={{ left: picker.x + 12, top: picker.y + 12 }}
    >
      {picker.candidates.map((candidate) => (
        <button
          key={candidate.key}
          type="button"
          className={`flex w-full items-baseline gap-2 px-3 py-1 text-left ${
            candidate.key === picker.hoverKey ? 'bg-gray-800' : ''
          } ${candidate.key === picker.activeKey ? 'text-cyan-300' : 'text-gray-200'}`}
          onMouseEnter={() => onHover(candidate.key)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onChoose(candidate.key)}
        >
          <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-gray-500">
            {KIND_NAMES[candidate.kind]}
          </span>
          <span className="truncate">{candidate.label}</span>
        </button>
      ))}
      <p className="px-3 pt-1 text-[10px] text-gray-500">↑↓ Enter · Esc to close</p>
    </div>
  );
}

/** The canvas outline of the row being hovered in the picker (SPEC-39.1). */
export function PickOutline({ candidate, transform }) {
  if (!candidate || !transform) return null;
  return (
    <Rect
      {...wallRectToScreen(candidate.rect, transform)}
      stroke="#f472b6"
      strokeWidth={2}
      dash={[6, 4]}
      listening={false}
    />
  );
}
```

(The window `keydown` listener is on the capture phase, so while the list is open Esc closes it instead of reaching `useElevationKeys`, which listens on the bubble phase.)

**`src/elevation/components/OpeningShape.jsx`** (109 lines): add an `onPick` prop. The Group's `onClick` becomes `stopEvent(event); if (onPick) onPick(); else onSelect?.(opening.id);`. `onDragStart` keeps calling `onSelect` (dragging an opening selects it directly, no list).

**`src/elevation/components/ElevationCanvas.jsx`** (1268 lines after step 302, which removed 4 lines above 520; the line numbers below are at `622383f`, so subtract 4 and check each by its content):
- Imports: `usePicker` from `./canvas/usePicker.js`; `SelectionPicker, { PickOutline }` from `./SelectionPicker.jsx`.
- Replace `selectRun`, `selectSoffit`, `selectRecess` (844–857) and `selectEndPanel`, `selectPiece`, `selectFace` (869–882) with one call, placed where `selectRun` was:

  ```js
  const {
    picker, hovered, pick, pickFace, choosePick, hoverPick, closePicker,
  } = usePicker({ room, wall, settings, transform, stageRef, tool, suppressClickRef, dispatch });
  ```

  `selectFeature` (859–867) and `selectOpening` (916–919) stay.
- JSX: `RecessShapes onSelect={tool === 'select' ? pick : undefined}` (1118); `OpeningShape` keeps `onSelect={selectOpening}` and gains `onPick={pick}` (1128); `SoffitShapes onSelect={tool === 'select' ? pick : undefined}` (1139); `RunGroup onSelectRun={pick} onSelectPiece={pick} onSelectFace={pickFace}` (1154–1157); `WallEndPanelShapes onSelect={tool === 'select' ? pick : undefined}` (1172).
- In the `listening={false}` Layer, after the `RecessOutline` block (≈ 1205): `<PickOutline candidate={hovered} transform={transform} />`.
- After the `TrackSizeInput` block (≈ 1268): `<SelectionPicker picker={picker} onChoose={choosePick} onHover={hoverPick} onClose={closePicker} />`.

`handleStageClick` doesn't change: a click on empty canvas still clears the selection, and the list's own pointer-down listener has already closed it. The dimension rows' clicks (`handleRunSegmentClick`, `selectFeature`), stretch handles, joint glyphs and cell chains keep selecting directly; they stop their events before the shapes beneath see them.

**Count:** unchanged, **868** (no component tests; `npm run build`, lint and the hand check are the gate).

**Hand check:** click a cabinet: it's selected (outlined alone) and the list shows Face / Part / Run / Wall. Hover each row: the pink outline moves. Pick Run: the run alone is outlined and its overall dimension turns blue. Click a stacked panel run in G6 and pick its run from the list. Click a selected cabinet's door: the face is selected. Click a recess with cabinets in it and pick the recess. Click a window on a bare wall: selected, no list. Esc closes the list without clearing the selection; Esc again clears it as before. Drag an opening: it moves, no list. Drag a run by its dimension: no list.
