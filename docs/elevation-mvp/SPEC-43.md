# Round 43 — SPEC: back panels mitered into wall end panels, elevation dimensions in the DXF

Steps 342–347. Designer (342–344), then geometry (345), then designer (346–347). The API doesn't change: its schema passes unknown fields through.
Drawing rounds: 42.3 bands meet corner returns → **43 back panel miters + horizontal elevation dimensions** → 43.1 vertical dimensions, callouts, corner reach → 44 plan → 45 plan dimensions and labels → sheet layout.

**Done when:**
- A wall end panel on an island or peninsula meets a back panel run (a run that's only panels) with a miter by default. The back panel runs over the end panel to the outside corner, both cut at 45°. This works in plan, on the canvas, in the DXF and in the parts list (the back panel is ordered 3/4" longer per mitered end). The panel's existing joint choice (Auto / miter / butt) covers it.
- Every elevation DXF carries the canvas's horizontal dimension chains as real DIMENSION entities on `DIMENSIONS`: run pieces and run overall below and above, and the wall row (openings, wing walls, recesses) below. Rows start 3/8" (paper) past the drawing and are 3/8" apart. Text is 1/8", sized by the drawing scale (1/2" = 1'-0" by default, a new setting).
- Nothing about the canvas's dimensions changes.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **342** | designer | `panelRun` on each wall end panel side, `panelRunMiters`, `miteredSpan` (no drawing changes) | 912 → **915** |
| **343** | designer | The miter in plan, on the end panel, in elevation depth and spans | **918** |
| **344** | designer | The back panel runs over the end panel on the canvas, in the DXF and the parts list; the joint choice beside a back panel | **921** |
| **345** | geometry | `PayloadDimension`, `plotScale`, the FF dimstyle, DIMENSION entities, title under the dimensions | 32 → **38** |
| **346** | designer | `plotScale` setting (default 24), Settings select, `plotScale` in the payload | **923** |
| **347** | designer | `elevationDimensions` and `dimensions` on every payload elevation | **927** |

Codex writes the code. This SPEC gives contracts, rules, the code where it's short, and the tests. The literal test values come from the golden fixture with today's model and a reference build of these rules (full suite 927, lint clean, geometry 38). If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (Kyle, 2026-10-05)

### Back panels mitered into wall end panels

- **What a back panel run is.** A run whose grid leaves are all `panel` (the same test `frontDepth` uses, SPEC-38), anchored (`anchors[side] === true`) to the wall end where the panel is. Its *panel face* is how far its outermost panel sits from the wall face: `runBackOffset(run)` + (the leaf's `depth` if `align: 'back'`, else `run.depth`). Its *thickness* is that leaf's `depth` (else `run.depth`).
- **Auto miters (Kyle).** On each face of a wall end panel, the back panel run with the furthest-out panel face meets it. When that face is the end panel's depth on that side (`side.depth`, the deepest anchored run's `frontDepth`), they miter. Otherwise they butt: the end panel runs past the panel. The end panel takes the tallest anchored run's top, so a back panel is never taller than it.
- **Same override as the face frame (Kyle).** `wall.endPanels[endpoint].frame` (`'miter'` | `'butt'` | null = Auto) already chooses how a face frame meets the panel. It now chooses for a back panel too, one choice per panel. The field keeps its stored name, with no schema change. The properties field becomes **Joint** and shows beside a back panel run as well as a face frame run.
- **The geometry (Kyle: "45° on both").** Mitered, the back panel runs over the end panel's width to the outside corner on its outer face and stops at the end panel on its inner face. The end panel's inside corner on that face is cut back by the back panel's thickness. In plan both are polygons that share the cut. In elevation the back panel is wider by the end panel's width at that end, and the end panel's `front` on that face drops by the thickness, so geometry hides it behind the panel. The canvas shows only the part of the end panel the back panel leaves (the toe kick height on the islands we have). Hovered or selected, it all shows, as for a frame.
- **Parts.** A mitered back panel is ordered longer by the end panel it runs over (G2 test case: 78 1/2" not 77 3/4"). The end panel's own size doesn't change.
- **A panel-only run is not a face frame.** In an inset room every run gets a `_frame`, so G2's back panel run was being treated as a frame at the wall end panel. The plan polygon cut the back corner by 13/16", and the canvas hid the end panel on the back face. `wallEndPanels.js` now ignores `_frame` on a panel-only run (`framedRun`). As drawn, G2's back corner is square and the whole end panel shows on the back face. Nothing else reads `_frame.wallPanels` on a panel run: `splitRun` only looks at cabinets, and `wallParts` checks frame regions.
- **G2 as drawn stays butted.** Its back run is 24" deep with a 3/4" panel at the wall (`align: 'back'`), so the run reserves 24" and the end panel runs 24" past the panel. To miter it, set that run's depth to 3/4". The tests do exactly that.

### Elevation dimensions in the DXF

- **Real DIMENSION entities (Kyle).** Each dimension is an ezdxf linear dimension on layer `DIMENSIONS` in a dimstyle `FF`. The block shows the designer's text (`formatInches`, e.g. `30 1/2"`). The entity keeps `<>` so CAD re-measures it if someone edits the drawing. ezdxf doesn't write DIMPOST, so a re-measured dimension loses its inch mark.
- **Style, in paper inches × `DIMSCALE` = plot scale:** text 1/8", architectural ticks 1/16" (`dimtsz`), extension lines 1/16" off the drawing and 1/16" past the line, text 1/16" above the line (`dimtad` 1), aligned. Fractional units to 1/16", not stacked (`dimlunit` 5, `dimdec` 4, `dimfrac` 2). At 1/2" = 1'-0" text is 3" in the drawing.
- **Plot scale (DECISIONS, 2026-10-04).** A new setting, `settings.plotScale` (drawing inches per paper inch), default **24** (1/2" = 1'-0"). Choices: 12, 16, 24, 32, 48. It's in Settings as *Drawing scale* and goes in the payload as top-level `plotScale`. In geometry, `plotScale` is optional: `None` draws at 24, so round-40 to 42 payloads still round-trip exactly.
- **Round 43 is the horizontal chains only (Kyle: 43 + 43.1).** These are the rows the canvas draws, from the same functions:
  - Below the wall, nearest first: `lower.inner` (base/tall pieces), `lower.outer` (base/tall runs), `openings` (the wall row).
  - Above the wall, nearest first: `upper.inner`, `upper.outer`.

  Every segment becomes one dimension, whatever its kind (piece, frame, frame-opening, gap, open, corner-gap, tall-span, neighbor, wall, opening, recess…), so the DXF and the canvas show the same chains. An island with no uppers gets the wall length above, as on the canvas.
- **Where rows go.** The designer decides; geometry computes no positions. A row's dimension line is 3/8" (paper) past the drawing's extent (`wallExtent`), the next 3/8" further, and an empty row takes no space. At 1:24 that's 9" apart: G1 A's rows are at −9, −18, −27 below and 105, 114 above. Extension lines start at the extent's bottom (below) or top (above).
- **The record** (one per segment, in row order, left to right): `{ row, kind, start, end, base, at, text }`. `start`/`end` run along the elevation, `base` is where the extension lines start, `at` is the dimension line, and `text` is formatted by the designer. Round 43.1 adds `orientation` (default `horizontal`) for the vertical chains.
- **Title.** The title, wall label and room name move under the lowest dimension line by the same 12 / 18 / 23" they sit under the floor today. With no dimensions they stay where they are.
- **Not in 43 (→ 43.1):** the vertical chains at both wall edges, the counter-height row, split-column (cell) chains, casing clearance and pin callouts, the reach of runs past a corner on `cornerShapes` instead of `neighborProfiles` (SPEC-42.2), and staggering text that doesn't fit its segment. The elevation letter stays as the title text until round 45's labels.

---

## §2 Step 342 — designer: `panelRun` on each wall end panel side

A shape step. No drawing changes. Every wall end panel side record gains `panelRun` only when a back panel run is anchored there, so test 129 (`wallSides.test.js`) and every other `toEqual` on a panel stay as they are.

**`src/elevation/model/wallEndPanels.js`** (100 lines):

1. Imports become:

```js
import { frontDepth, runBackOffset } from './corners.js';
import { wallFrame } from './geometry.js';
import { gridLeaves } from './grid.js';
import { wallSideOf, wallSideView } from './wallSides.js';
```

2. Above `function panelSide`, add, as given:

```js
/**
 * A run that's only panels (SPEC-38), as a wall end panel meets it (SPEC-43): how far its outermost panel
 * face sits from the wall face, and that panel's thickness. Null for any other run.
 */
export function panelRunFace(run) {
  const leaves = run.grid ? gridLeaves(run.grid) : [];
  if (leaves.length === 0 || !leaves.every((leaf) => leaf.kind === 'panel')) return null;
  return leaves
    .map((leaf) => {
      const thickness = leaf.depth ?? run.depth;
      return { front: runBackOffset(run) + (leaf.align === 'back' ? thickness : run.depth), thickness };
    })
    .reduce((a, b) => (b.front > a.front ? b : a));
}

/**
 * The back panel run a wall end panel meets on one face (SPEC-43): of the panel-only runs anchored to
 * it, the one whose panel face is furthest out. Auto: mitered when that face is the end panel's depth
 * on this side, else butted. The panel's stored `frame` ('miter' or 'butt') overrides, as for a frame.
 */
function panelRunJoin(runs, depth, override) {
  const faces = runs.flatMap((run) => {
    const face = panelRunFace(run);
    return face ? [{ runId: run.id, ...face }] : [];
  });
  if (faces.length === 0) return null;
  const face = faces.reduce((a, b) => (b.front > a.front ? b : a));
  const flush = Math.abs(face.front - depth) <= EPSILON;
  return { runId: face.runId, thickness: face.thickness, join: override ?? (flush ? 'miter' : 'butt') };
}
```

3. In `panelSide`, replace from `const runs = …` to the end of the function with:

```js
  const runs = view.runs.filter((run) => run.anchors?.[side] === true);
  const depth = runs.reduce((deepest, run) => Math.max(deepest, frontDepth(run, settings)), 0);
  const panelRun = panelRunJoin(runs, depth, wall.endPanels?.[endpoint]?.frame);
  return {
    side,
    x: side === 'left' ? 0 : frame.length - width,
    depth,
    top: runs.reduce((top, run) => Math.max(top, run.z + run.height), 0),
    runIds: runs.map((run) => run.id),
    ...(panelRun ? { panelRun } : {}),
  };
}
```

(`wall` in `panelSide` is the stored wall, `source` in `wallEndPanels`, so `wall.endPanels` is there.)

4. At the end of the file, add, as given:

```js

/**
 * Where a panel-only run is mitered into a wall end panel (SPEC-43), per side of the run as seen on its
 * own face: `{ width, thickness }` (the end panel's width, the back panel's thickness) or null.
 */
export function panelRunMiters(room, wall, run, settings) {
  const face = wallSideOf(run);
  const miters = { left: null, right: null };
  for (const panel of wallEndPanels(room, wall, settings)) {
    const side = panel[face];
    if (side.panelRun?.runId === run.id && side.panelRun.join === 'miter') {
      miters[side.side] = { width: panel.width, thickness: side.panelRun.thickness };
    }
  }
  return miters;
}

/**
 * A piece's x and width with its mitered ends (SPEC-43): a panel at a run end mitered into a wall end
 * panel runs on over that panel's width to the outside corner. Any other piece is as it is.
 */
export function miteredSpan(piece, run, miters) {
  if (piece.kind !== 'panel') return { x: piece.x, width: piece.width };
  const left = miters.left && Math.abs(piece.x - run.x) <= EPSILON ? miters.left.width : 0;
  const right = miters.right && Math.abs(piece.x + piece.width - run.x - run.width) <= EPSILON
    ? miters.right.width
    : 0;
  return { x: piece.x - left, width: piece.width + left + right };
}
```

`panelRunMiters` reads the run's own face (`wallSideOf(run)`), so it works with the resolved face (elevation, `runScene`) and with the stored wall (the plan canvas passes that to `planRunPieces`).

**NEW `src/elevation/model/__tests__/panelJoins.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { miteredSpan, panelRunFace, panelRunMiters, wallEndPanels } from '../wallEndPanels.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const BACK = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';

/** G2 as drawn: the peninsula's back run is 24" deep with a 3/4" panel against the cabinet backs. */
const asDrawn = () => syncRoom(stored('G2 Face frame kitchen'), settings);

/** G2 with the back panel run as deep as its panel, so the panel's face is the end panel's back face. */
function flush(frame) {
  const copy = structuredClone(stored('G2 Face frame kitchen'));
  copy.walls[1].runs.find(({ id }) => id === BACK).depth = 0.75;
  if (frame) copy.walls[1].endPanels.end = { width: null, frame };
  return syncRoom(copy, settings);
}

describe('SPEC-43 a wall end panel meets a back panel run', () => {
  it('finds a panel-only run\'s outer panel face and that panel\'s thickness', () => {
    expect(asDrawn().walls[1].runs.map(panelRunFace)).toEqual([null, { front: 0.75, thickness: 0.75 }]);
    expect(panelRunFace(flush().walls[1].runs[1])).toEqual({ front: 0.75, thickness: 0.75 });
  });

  it('miters when the panel\'s face is the end panel\'s depth, else butts; the panel\'s joint choice overrides', () => {
    const room = asDrawn();
    const [drawn] = wallEndPanels(room, room.walls[1], settings);
    expect(drawn.back.panelRun).toEqual({ runId: BACK, thickness: 0.75, join: 'butt' });
    expect('panelRun' in drawn.front).toBe(false);

    const mitered = flush();
    const [panel] = wallEndPanels(mitered, mitered.walls[1], settings);
    expect(panel.back).toEqual({
      side: 'left', x: 0, depth: 0.75, top: 34.5, runIds: [BACK],
      panelRun: { runId: BACK, thickness: 0.75, join: 'miter' },
    });

    const butted = flush('butt');
    expect(wallEndPanels(butted, butted.walls[1], settings)[0].back.panelRun.join).toBe('butt');
  });

  it('gives a run its mitered ends, and a panel at a mitered end its span over the end panel', () => {
    const room = flush();
    const back = resolveWall(room, room.walls[1], 'back');
    const front = resolveWall(room, room.walls[1], 'front');
    const miters = { left: { width: 0.75, thickness: 0.75 }, right: null };
    expect(panelRunMiters(room, back, back.runs[0], settings)).toEqual(miters);
    // The plan passes the stored wall; the run says which face it's on.
    expect(panelRunMiters(room, room.walls[1], back.runs[0], settings)).toEqual(miters);
    expect(panelRunMiters(room, front, front.runs[0], settings)).toEqual({ left: null, right: null });

    const run = back.runs[0];
    expect([run.x, run.width]).toEqual([0.75, 77.75]);
    expect(miteredSpan({ kind: 'panel', x: 0.75, width: 77.75 }, run, miters)).toEqual({ x: 0, width: 78.5 });
    expect(miteredSpan({ kind: 'cabinet', x: 0.75, width: 77.75 }, run, miters)).toEqual({ x: 0.75, width: 77.75 });
    expect(miteredSpan({ kind: 'panel', x: 30, width: 20 }, run, miters)).toEqual({ x: 30, width: 20 });
  });
});
```

What the cases show: G2 as drawn has a 24" run with a 3/4" panel at the wall. Its panel face (3/4") isn't the end panel's back depth (24"), so it butts. Made 3/4" deep, the faces agree and it miters. The panel's joint choice `'butt'` wins over that. On the back face the end panel is on the run's left (x 0 to 3/4"), so the panel piece at x 3/4" runs on to x 0.

**Count:** 912 + 3 = **915**. Golden snapshot unchanged.

---

## §3 Step 343 — designer: the miter in plan and on the end panel

**`src/elevation/model/wallEndPanels.js`** (~150 lines after 342):

1. Replace `panelMiters` (with its doc comment) by, as given:

```js
/** How far a mitered face frame, or back panel (SPEC-43), cuts into the panel's inside corner, front and back (SPEC-36.2). */
function panelMiters(source, panel) {
  const depth = (face) => Math.max(0, ...source.runs
    .filter((run) => panel[face].runIds.includes(run.id) && framedRun(run)
      && run._frame.wallPanels?.[panel[face].side]?.join === 'miter')
    .map((run) => run._frame.thickness), mitered(panel[face]));
  return { front: depth('front'), back: depth('back') };
}

/**
 * A face frame run (SPEC-36). A run that's only panels gets a `_frame` in an inset room too, but it
 * has no frame: it meets a wall end panel as a back panel (SPEC-43).
 */
function framedRun(run) {
  return Boolean(run._frame) && !panelRunFace(run);
}

/** How far a back panel run mitered into the panel cuts into it on one face (SPEC-43), else 0. */
function mitered(side) {
  return side.panelRun?.join === 'miter' ? side.panelRun.thickness : 0;
}
```

2. In `wallEndPanelSpans`, the `covers` chain becomes:

```js
  const covers = (wall.runs ?? [])
    .filter((run) => side.runIds.includes(run.id)
      && ((framedRun(run) && run._frame.wallPanels?.[side.side]?.join === 'miter')
        || (side.panelRun?.runId === run.id && side.panelRun.join === 'miter')))
    .map((run) => [run.z - (run._frame?.drop ?? 0), run.z + run.height])
    .sort((a, b) => a[0] - b[0]);
```

and its doc comment's "less where a face frame run on this side is mitered over its edge" becomes "less where a face frame run or back panel (SPEC-43) on this side is mitered over its edge". `wallEndPanelFramed` doesn't change here (step 344).

**`src/elevation/model/wallParts.js`** (90 lines), lines 33–37 (`const miter = Math.max(0, ...view.runs … .map((run) => run._frame.thickness));`): the last line becomes

```js
      .map((run) => run._frame.thickness),
    // A back panel mitered into it does the same (SPEC-43).
    mine.panelRun?.join === 'miter' ? mine.panelRun.thickness : 0);
```

**`src/elevation/model/planPieces.js`** (352 lines):
- Imports: after the `tees.js` import add `import { miteredSpan, panelRunMiters } from './wallEndPanels.js';`.
- Above `/** Return the boxes, faces, filler returns, and their overall span used by the plan view. */` add, as given:

```js
/**
 * A back panel mitered into a wall end panel (SPEC-43): it runs over the end panel to the outside
 * corner on its outer face and stops at the end panel on its inner face, the 45° cut between.
 */
function miterPanels(faces, run, miters) {
  return faces.map((range) => {
    const { x, width } = miteredSpan(
      { kind: range.kind, x: range.start, width: range.end - range.start }, run, miters,
    );
    if (Math.abs(x - range.start) <= WIDTH_EPSILON && Math.abs(x + width - range.end) <= WIDTH_EPSILON) return range;
    return {
      ...range,
      start: x,
      end: x + width,
      polygon: [[x, range.front], [x + width, range.front], [range.end, range.back], [range.start, range.back]],
    };
  });
}
```

- In `planRunPieces`, line 266 `const faces = frameStrips(frames, cells.pieces, planFaces(` → `const faces = miterPanels(frameStrips(frames, cells.pieces, planFaces(`, and line 275 `), run.depth, faceFront);` → `), run.depth, faceFront), run, panelRunMiters(room, wall, run, settings));`. Nothing else.

No import cycle: `wallEndPanels.js` imports only `corners.js`, `geometry.js`, `grid.js` and `wallSides.js`.

**NEW `src/elevation/model/__tests__/panelMiters.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planRunPieces } from '../planPieces.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { wallEndPanelPolygon, wallEndPanelSpans, wallEndPanels } from '../wallEndPanels.js';
import { wallParts } from '../wallParts.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const BACK = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';
const PANEL = 'ec0ad482-c6b9-4d8a-9d94-4e785ade9129';
const PENINSULA = '64da569f-6c94-408d-809a-37c6e1f9755f';

const asDrawn = () => syncRoom(stored('G2 Face frame kitchen'), settings);
function flush(frame) {
  const copy = structuredClone(stored('G2 Face frame kitchen'));
  copy.walls[1].runs.find(({ id }) => id === BACK).depth = 0.75;
  if (frame) copy.walls[1].endPanels.end = { width: null, frame };
  return syncRoom(copy, settings);
}
const row = ({ id, kind, x, z, width, height, back, front }) => [id, kind, x, z, width, height, back, front];
const spansOf = (room, side) => wallEndPanelSpans(
  resolveWall(room, room.walls[1], side), wallEndPanels(room, room.walls[1], settings)[0],
);
function backPanelPlan(room) {
  const view = resolveWall(room, room.walls[1], 'back');
  const run = view.runs[0];
  const scene = runScene(room, view, run, settings);
  return planRunPieces(room, view, run, settings, scene.result, scene.faceLayouts).faces;
}

describe('SPEC-43 a back panel mitered into a wall end panel', () => {
  it('cuts the end panel\'s inside corner by the back panel\'s thickness in plan', () => {
    const room = flush();
    expect(wallEndPanelPolygon(room, room.walls[1], wallEndPanels(room, room.walls[1], settings)[0])).toEqual([
      { x: 86, y: 62.75 }, { x: 86.75, y: 63.5 }, { x: 61.1875, y: 63.5 }, { x: 62, y: 62.75 },
    ]);
    // As drawn it's butted: the back corner is square. (A panel-only run in an inset room is not a frame.)
    const drawn = asDrawn();
    expect(wallEndPanelPolygon(drawn, drawn.walls[1], wallEndPanels(drawn, drawn.walls[1], settings)[0])).toEqual([
      { x: 110, y: 62.75 }, { x: 110, y: 63.5 }, { x: 61.1875, y: 63.5 }, { x: 62, y: 62.75 },
    ]);
  });

  it('runs the back panel over the end panel to the outside corner in plan, cut at 45°', () => {
    expect(backPanelPlan(flush())).toEqual([{
      key: PANEL, kind: 'panel', start: 0, end: 78.5, back: 0, front: 0.75,
      polygon: [[0, 0.75], [78.5, 0.75], [78.5, 0], [0.75, 0]],
    }]);
    expect(backPanelPlan(flush('butt'))).toEqual([{
      key: PANEL, kind: 'panel', start: 0.75, end: 78.5, back: 0, front: 0.75,
    }]);
  });

  it('puts the end panel behind the back panel in elevation and shows only what it leaves', () => {
    const room = flush();
    expect(wallParts(room, room.walls[1], 'back', settings).map(row)).toEqual([
      [`${PENINSULA}:endPanel:end`, 'wall_end_panel', 0, 0, 0.75, 34.5, -24.8125, 0],
    ]);
    expect(wallParts(room, room.walls[1], 'front', settings).map(row)).toEqual([
      [`${PENINSULA}:endPanel:end`, 'wall_end_panel', 77.75, 0, 0.75, 34.5, -0.75, 24],
    ]);
    expect(spansOf(room, 'back')).toEqual([{ z: 0, height: 4 }]);
    expect(spansOf(room, 'front')).toEqual([{ z: 0, height: 4 }]);
    const butted = flush('butt');
    expect(wallParts(butted, butted.walls[1], 'back', settings).map(row)[0][7]).toBe(0.75);
    // As drawn the back run is butted, so the whole panel shows on the back face.
    expect(spansOf(asDrawn(), 'back')).toEqual([{ z: 0, height: 34.5 }]);
  });
});
```

What the cases show. In plan, the peninsula wall runs from (86, −15) to (86, 63.5) and the end panel is its last 3/4". On the front face the frame's 13/16" miter cuts the inside corner from 24 13/16" to 24" (x 62). On the back face the back panel's 3/4" miter cuts it from 3/4" to 0 (x 86): it was 23 3/16", from the frame bug. In elevation from the back, the end panel's front drops from 3/4" to 0, so the back panel (front 3/4") hides it from z 4" to 34 1/2". The toe kick height (z 0 to 4") still shows.

**Count:** 915 + 3 = **918**. Golden snapshot unchanged (it doesn't hold wall end panel polygons or spans). `wallParts.test.js` (G2 rows) and `frameEnds.test.js` don't change.

---

## §4 Step 344 — designer: the back panel runs over the end panel; the joint choice

**`src/elevation/model/runScene.js`** (85 lines):
- Imports: after the `units.js` import add `import { miteredSpan, panelRunMiters } from './wallEndPanels.js';`.
- Line 66 `const base = cells.pieces.map((piece) => {`: insert above it `const miters = panelRunMiters(room, wall, run, settings);`. Line 68 `const shaped = tee ? { ...piece, x: tee.x, width: tee.width } : piece;` becomes

```js
    // A back panel mitered into a wall end panel runs over it (SPEC-43).
    const shaped = tee ? { ...piece, x: tee.x, width: tee.width } : { ...piece, ...miteredSpan(piece, run, miters) };
```

The canvas (`RunGroup`), the picker (`pick.js`) and `elevationParts` (the DXF) all draw `drawnPieces`, so all three pick it up, with no other change.

**`src/elevation/model/parts.js`** (212 lines):
- The `wallEndPanels.js` import becomes `import { miteredSpan, panelRunMiters, wallEndPanels } from './wallEndPanels.js';`.
- Above line 88 `const pieceParts = partPieces(cells.pieces, settings)` add `const miters = panelRunMiters(room, view, run, settings);`.
- Lines 99–100 (`width: teeWidths.get(piece.id) ?? … ?? piece.width,` and `x: piece.x,`) become:

```js
        // A back panel mitered into a wall end panel is longer by the panel it runs over (SPEC-43).
        width: teeWidths.get(piece.id) ?? cellWidths.get(piece.id) ?? widths.get(piece.id)
          ?? miteredSpan(piece, run, miters).width,
        x: miteredSpan(piece, run, miters).x,
```

**`src/elevation/model/wallEndPanels.js`**: `wallEndPanelFramed` (with its doc comment) becomes:

```js
/**
 * Whether a face frame run (SPEC-36.2.1) or a back panel run (SPEC-43) meets this wall end panel on
 * either side, so its joint can be chosen.
 */
export function wallEndPanelFramed(wall, panel) {
  const source = wall.sideSource ?? wall;
  const ids = [...panel.front.runIds, ...panel.back.runIds];
  return Boolean(panel.front.panelRun || panel.back.panelRun)
    || source.runs.some((run) => ids.includes(run.id) && framedRun(run));
}
```

The name stays (two callers, `WallHeightProperties.jsx:53` and `WallEndPanelProperties.jsx:41`, both just pass it on as `framed`).

**`src/elevation/components/properties/WallEndPanelFields.jsx`** (47 lines):
- The doc comment becomes `A wall end panel's width and, beside a face frame run (SPEC-36.2.1) or a back panel run (SPEC-43), how that run meets it.`, as a 3-line JSDoc.
- The second `Field`: `label="Joint"`, `aria-label={`${label} panel joint`}`, options `Auto` / `Mitered (frame or back panel covers the edge)` / `Butted (dies into the panel)`. Same values (`auto`, `miter`, `butt`) and the same `update({ frame: … })`.

**NEW `src/elevation/model/__tests__/panelMiterParts.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationParts } from '../elevationParts.js';
import { roomParts } from '../parts.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { wallEndPanelFramed, wallEndPanels } from '../wallEndPanels.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const BACK = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';
const PANEL = 'ec0ad482-c6b9-4d8a-9d94-4e785ade9129';

function flush(frame) {
  const copy = structuredClone(stored('G2 Face frame kitchen'));
  copy.walls[1].runs.find(({ id }) => id === BACK).depth = 0.75;
  if (frame) copy.walls[1].endPanels.end = { width: null, frame };
  return syncRoom(copy, settings);
}
const row = ({ id, kind, x, z, width, height, back, front }) => [id, kind, x, z, width, height, back, front];

describe('SPEC-43 a mitered back panel in elevation and the parts list', () => {
  it('draws the back panel to the outside corner on the canvas and in the DXF', () => {
    const room = flush();
    const view = resolveWall(room, room.walls[1], 'back');
    expect(runScene(room, view, view.runs[0], settings).drawnPieces
      .map(({ id, kind, x, z, width, height }) => [id, kind, x, z, width, height]))
      .toEqual([[PANEL, 'panel', 0, 4, 78.5, 30.5]]);
    expect(elevationParts(room, room.walls[1], 'back', settings).map(row))
      .toEqual([[PANEL, 'panel', 0, 4, 78.5, 30.5, 0, 0.75]]);
    const butted = flush('butt');
    expect(elevationParts(butted, butted.walls[1], 'back', settings).map(row))
      .toEqual([[PANEL, 'panel', 0.75, 4, 77.75, 30.5, 0, 0.75]]);
  });

  it('orders the back panel longer by the end panel it runs over', () => {
    const part = roomParts(flush(), settings).find(({ key }) => key === PANEL);
    expect([part.x, part.width, part.height]).toEqual([0, 78.5, 30.5]);
    const butted = roomParts(flush('butt'), settings).find(({ key }) => key === PANEL);
    expect([butted.x, butted.width]).toEqual([0.75, 77.75]);
  });

  it('offers the joint choice beside a back panel run as well as a face frame', () => {
    const room = flush();
    expect(wallEndPanelFramed(room.walls[1], wallEndPanels(room, room.walls[1], settings)[0])).toBe(true);
    const g1 = syncRoom(stored('G1 Euro kitchen'), settings);
    expect(wallEndPanels(g1, g1.walls[3], settings)
      .map((panel) => wallEndPanelFramed(g1.walls[3], panel))).toEqual([false, false]);
  });
});
```

**Count:** 918 + 3 = **921**. Golden and parts snapshots unchanged: no golden room has a mitered back panel.

---

## §5 Step 345 — geometry: dimensions in the DXF

**`src/drawing/models.py`** (79 lines):
- Above `class PayloadElevation`, add, as given:

```python
class PayloadDimension(BaseModel):
    """One linear dimension (SPEC-43): from start to end along the elevation, extension lines from
    `base`, the dimension line at `at`, its text as the designer formats it."""

    model_config = ConfigDict(extra="forbid")

    row: str = Field(min_length=1)
    kind: str = Field(min_length=1)
    start: float
    end: float
    base: float
    at: float
    text: str = Field(min_length=1)
```

- `PayloadElevation`: after `parts: list[PayloadPart] = []` add `dimensions: list[PayloadDimension] = []`.
- `DrawingPayload`: after `elevations: list[PayloadElevation]` add

```python
    # Drawing scale (SPEC-43): 24 is 1/2" = 1'-0". None draws at 24, so a payload without it round-trips.
    plotScale: float | None = Field(default=None, gt=0)
```

**`src/dxf/writer.py`** (106 lines): between `create_dxf_document` and `write_lines_to_layer`, add, as given:

```python
# The dimension style (SPEC-43). Sizes are paper inches; DIMSCALE (the plot scale) makes them drawing inches.
DIMSTYLE = "FF"
DIMSTYLE_PAPER = {
    "dimtxt": 0.125,    # 1/8" text
    "dimtsz": 0.0625,   # architectural ticks, not arrows
    "dimexo": 0.0625,   # extension lines start 1/16" off the drawing
    "dimexe": 0.0625,   # and run 1/16" past the dimension line
    "dimgap": 0.0625,   # text 1/16" above the line
}


def add_dimstyle(doc: Drawing, plot_scale: float) -> None:
    """The FF dimension style (SPEC-43): fractional inches to 1/16", ticks, text above the line. The inch mark
    comes with the designer's text; ezdxf doesn't write DIMPOST, so a dimension CAD re-measures has none."""
    style = doc.dimstyles.new(DIMSTYLE)
    for key, value in DIMSTYLE_PAPER.items():
        style.dxf.set(key, value)
    style.dxf.dimscale = plot_scale
    style.dxf.dimtad = 1        # text above the dimension line
    style.dxf.dimtih = 0        # text aligned with the line, inside
    style.dxf.dimtoh = 0        # and outside
    style.dxf.dimlunit = 5      # fractional
    style.dxf.dimdec = 4        # to 1/16"
    style.dxf.dimfrac = 2       # not stacked: 30 1/2
    style.dxf.dimdsep = ord(".")
```

**NEW `src/drawing/dimensions.py`**, as given:

```python
"""Elevation dimensions (SPEC-43): one DIMENSION per record the designer sends, on DIMENSIONS."""

from src.dxf.writer import DIMSTYLE
from src.projection.hlr import EPSILON

# 1/2" = 1'-0" when the payload doesn't say (SPEC-43).
DEFAULT_PLOT_SCALE = 24


def add_dimensions(modelspace, dimensions) -> None:
    """Horizontal linear dimensions in the FF style. The block shows the designer's text; the entity keeps
    `<>` so CAD re-measures it if the drawing is edited."""
    for dimension in dimensions:
        if dimension.end - dimension.start <= EPSILON:
            continue
        override = modelspace.add_linear_dim(
            base=(dimension.start, dimension.at),
            p1=(dimension.start, dimension.base),
            p2=(dimension.end, dimension.base),
            dimstyle=DIMSTYLE,
            text=dimension.text,
            dxfattribs={"layer": "DIMENSIONS"},
        )
        override.render()
        override.dimension.dxf.text = "<>"
```

**`src/drawing/elevation_dxf.py`** (140 lines):
- `from src.dxf.writer import create_dxf_document, …` → add `add_dimstyle` (alphabetical: `add_dimstyle, create_dxf_document, doc_to_bytes, write_lines_to_layer`).
- Above `from .models import …` add `from .dimensions import DEFAULT_PLOT_SCALE, add_dimensions`.
- `build_elevation_dxf` becomes `def build_elevation_dxf(elevation: PayloadElevation, room: PayloadRoom, plot_scale: float = DEFAULT_PLOT_SCALE) -> bytes:` (wrap the parameters over three lines), and `add_dimstyle(doc, plot_scale)` right after `doc = create_dxf_document()`.
- After the hatch loop and before `wall_label = elevation.wallLabel`:

```python
    add_dimensions(modelspace, elevation.dimensions)

    # The title sits under the lowest dimension line (SPEC-43); with none, where it always has.
    low = min([0.0, *(dimension.at for dimension in elevation.dimensions)])
```

- The three title positions become `(0, low - 12)`, `(0, low - 18)`, `(0, low - 23)`.

**`src/drawing/bundle.py`** (28 lines): import `DEFAULT_PLOT_SCALE` from `.dimensions` (above the `.elevation_dxf` import); in `draw`, `plot_scale = model.plotScale or DEFAULT_PLOT_SCALE` after `model = …`, and pass it as `build_elevation_dxf(elevation, model.room, plot_scale)`.

`DIMENSIONS` is already a layer (colour 2). The README doesn't change.

**NEW `tests/test_elevation_dimensions.py`**, verbatim:

```python
"""Elevation dimensions in the DXF (SPEC-43)."""

import base64
import copy
import io
import json
import zipfile
from pathlib import Path

import ezdxf
import pytest
from pydantic import ValidationError

from src.drawing.bundle import draw

ROOT = Path(__file__).resolve().parent.parent
PAYLOAD = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())

# G1 elevation A's run overall row and its wall row, as the designer sends them (SPEC-43).
DIMENSIONS = [
    {"row": "lower.outer", "kind": "run", "start": 0, "end": 30, "base": 0, "at": -18, "text": '30"'},
    {"row": "lower.outer", "kind": "run", "start": 30, "end": 168, "base": 0, "at": -18, "text": '138"'},
    {"row": "openings", "kind": "gap", "start": 0, "end": 48, "base": 0, "at": -27, "text": '48"'},
    {"row": "openings", "kind": "opening", "start": 48, "end": 96, "base": 0, "at": -27, "text": '48"'},
    {"row": "upper.outer", "kind": "run", "start": 108.5, "end": 168, "base": 96, "at": 114, "text": '59 1/2"'},
]


def _payload(plot_scale=None):
    payload = copy.deepcopy(PAYLOAD)
    payload["elevations"][0]["dimensions"] = copy.deepcopy(DIMENSIONS)
    if plot_scale is not None:
        payload["plotScale"] = plot_scale
    return payload


def _dxf(payload, letter="A"):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    return ezdxf.read(io.StringIO(archive.read(f"elevation-{letter}.dxf").decode("utf-8")))


def _shown_text(doc, dimension):
    """The text the dimension's block shows."""
    return [entity.dxf.text for entity in doc.blocks.get(dimension.dxf.geometry) if entity.dxftype() == "MTEXT"]


def test_each_record_is_a_dimension_on_dimensions():
    doc = _dxf(_payload())
    dimensions = list(doc.modelspace().query("DIMENSION"))
    assert len(dimensions) == 5
    assert {dimension.dxf.layer for dimension in dimensions} == {"DIMENSIONS"}
    assert {dimension.dxf.dimstyle for dimension in dimensions} == {"FF"}
    first = dimensions[0]
    assert tuple(first.dxf.defpoint2)[:2] == (0, 0)
    assert tuple(first.dxf.defpoint3)[:2] == (30, 0)
    assert tuple(first.dxf.defpoint)[:2] == (0, -18)
    assert [dimension.get_measurement() for dimension in dimensions] == [30, 138, 48, 48, 59.5]
    above = dimensions[4]
    assert tuple(above.dxf.defpoint2)[:2] == (108.5, 96)
    assert tuple(above.dxf.defpoint)[:2] == (108.5, 114)


def test_the_block_shows_the_designers_text_and_cad_can_remeasure():
    doc = _dxf(_payload())
    dimensions = list(doc.modelspace().query("DIMENSION"))
    assert [_shown_text(doc, dimension) for dimension in dimensions] == [
        ['30"'], ['138"'], ['48"'], ['48"'], ['59 1/2"'],
    ]
    assert {dimension.dxf.text for dimension in dimensions} == {"<>"}


def test_the_style_is_paper_sizes_times_the_plot_scale():
    style = _dxf(_payload()).dimstyles.get("FF")
    assert style.dxf.dimscale == 24
    assert (style.dxf.dimtxt, style.dxf.dimtsz, style.dxf.dimexo, style.dxf.dimexe, style.dxf.dimgap) == (
        0.125, 0.0625, 0.0625, 0.0625, 0.0625,
    )
    assert (style.dxf.dimlunit, style.dxf.dimdec, style.dxf.dimfrac, style.dxf.dimtad) == (5, 4, 2, 1)
    doc = _dxf(_payload(plot_scale=48))
    assert doc.dimstyles.get("FF").dxf.dimscale == 48
    dimension = next(iter(doc.modelspace().query("DIMENSION")))
    heights = [entity.dxf.char_height for entity in doc.blocks.get(dimension.dxf.geometry) if entity.dxftype() == "MTEXT"]
    assert heights == [6]


def test_the_title_moves_under_the_lowest_dimension_line():
    texts = {text.dxf.text: tuple(text.dxf.insert)[:2] for text in _dxf(_payload()).modelspace().query("TEXT")}
    assert texts == {"ELEVATION A": (0, -39), "Wall 1": (0, -45), "G1 Euro kitchen": (0, -50)}
    plain = {text.dxf.text: tuple(text.dxf.insert)[:2] for text in _dxf(_payload(), "B").modelspace().query("TEXT")}
    assert plain == {"ELEVATION B": (0, -12), "Wall 2": (0, -18), "G1 Euro kitchen": (0, -23)}
    assert list(_dxf(_payload(), "B").modelspace().query("DIMENSION")) == []


def test_payload_json_keeps_the_dimensions_and_the_plot_scale():
    payload = _payload(plot_scale=24)
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    assert json.loads(archive.read("payload.json")) == payload


def test_rejects_a_bad_plot_scale_or_an_unknown_dimension_field():
    with pytest.raises(ValidationError):
        draw(_payload(plot_scale=0))
    payload = _payload()
    payload["elevations"][0]["dimensions"][0]["offset"] = 9
    with pytest.raises(ValidationError):
        draw(payload)
```

The values: ezdxf's `defpoint` is the dimension line's location (`base` in `add_linear_dim`), and `defpoint2`/`defpoint3` are the two measured points. At 1:48 the 1/8" text is 6" tall in the drawing. The lowest line in the test payload is −27, so the title is at −39.

**Count:** 32 + 6 = **38**. `test_draw.py` doesn't change: its payload has no dimensions, so the titles stay put and `payload.json` round-trips.

---

## §6 Step 346 — designer: the drawing scale

**`src/elevation/model/constants.js`** (139 lines): in `DEFAULT_SETTINGS`, after the `bandDepths` block (line 107 `},`), add

```js
  // Drawing scale for the DXF: 24 is 1/2" = 1'-0" (SPEC-43). Text and dimension sizes are paper inches times this.
  plotScale: 24,
```

**NEW `src/elevation/model/drawingScale.js`**, as given:

```js
import { DEFAULT_SETTINGS } from './constants.js';

/** The DXF's drawing scales (SPEC-43), as [plotScale, label]: plotScale is drawing inches per paper inch. */
export const PLOT_SCALES = [
  [12, '1" = 1\'-0"'],
  [16, '3/4" = 1\'-0"'],
  [24, '1/2" = 1\'-0"'],
  [32, '3/8" = 1\'-0"'],
  [48, '1/4" = 1\'-0"'],
];

/** The drawing scale (SPEC-43): settings.plotScale, else 24 (1/2" = 1'-0"). */
export function plotScale(settings) {
  return settings?.plotScale ?? DEFAULT_SETTINGS.plotScale;
}
```

**`src/elevation/store/persistence.js`** (694 lines): `V2_DEFAULTED_SETTING_KEYS` gets `'plotScale',` after `'bottomPartHeights',` (line 102). `plotScale` is numeric, so `isElevationDocument` requires it, and a document saved before this round gets 24 on load.

**`src/elevation/components/SettingsPanel.jsx`** (209 lines):
- Import `PLOT_SCALES` from `'../model/drawingScale.js'` (above the `profile.js` import).
- Between the `NUMBER_SETTINGS` grid's closing `</div>` and the `Default height profile` block (line 97, `<div>` above `<p …>Default height profile</p>`), add:

```jsx
          <label className="block text-xs text-gray-400">
            Drawing scale
            <select
              value={settings.plotScale}
              onChange={(event) => update({ plotScale: Number(event.target.value) })}
              aria-label="Drawing scale"
              className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              {PLOT_SCALES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

```

**`src/elevation/model/drawingPayload.js`** (54 lines): import `{ plotScale }` from `'./drawingScale.js'`; the returned object gets `plotScale: plotScale(settings),` after `elevations,`. The doc comment's last sentence becomes "Round 43 adds the drawing scale and each face's dimensions; later rounds add the plan to the same records."

**Tests.**

**NEW `src/elevation/model/__tests__/drawingScale.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { PLOT_SCALES, plotScale } from '../drawingScale.js';

describe('SPEC-43 drawing scale', () => {
  it('defaults to 1/2" = 1\'-0" and offers the usual scales', () => {
    expect(DEFAULT_SETTINGS.plotScale).toBe(24);
    expect(plotScale({ plotScale: 48 })).toBe(48);
    expect(plotScale({})).toBe(24);
    expect(plotScale(undefined)).toBe(24);
    expect(PLOT_SCALES.map(([value]) => value)).toEqual([12, 16, 24, 32, 48]);
    expect(PLOT_SCALES.find(([value]) => value === 24)[1]).toBe('1/2" = 1\'-0"');
  });
});
```

`src/elevation/store/__tests__/persistence.test.js` (1142 lines): append at the end of the file, verbatim:

```js

describe('SPEC-43 drawing scale setting', () => {
  it('defaults the drawing scale on documents saved before it', () => {
    const current = currentDocument();
    delete current.settings.plotScale;
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    expect(loadElevationDocument().settings.plotScale).toBe(24);
  });
});
```

(`currentDocument`, `storageWith`, `ELEVATION_STORAGE_KEY` and `loadElevationDocument` are already in that file; the file's `afterEach` clears `window`.)

`src/elevation/model/__tests__/drawingPayload.test.js` (78 lines), test 1: after `units: 'in',` (line 32) add `plotScale: 24,`.

**Count:** 921 + 2 = **923**. Golden snapshot unchanged (it doesn't hold settings).

---

## §7 Step 347 — designer: the dimensions in the payload

**NEW `src/elevation/model/elevationDimensions.js`**, as given:

```js
import { horizontalChains, openingChain } from './dimensions.js';
import { plotScale } from './drawingScale.js';
import { resolveWall } from './room.js';
import { formatInches } from './units.js';
import { wallExtent } from './wallExtent.js';

/** Paper inches from the drawing to its first dimension row, and between rows (SPEC-43). */
export const DIMENSION_ROW_SPACING = 0.375;

const EPSILON = 1e-6;

/** The rows the DXF dimensions, nearest the drawing first on each side (the canvas's order, SPEC-43). */
const ROWS = [
  ['lower.inner', 'below'],
  ['lower.outer', 'below'],
  ['openings', 'below'],
  ['upper.inner', 'above'],
  ['upper.outer', 'above'],
];

/**
 * One wall face's horizontal dimensions as geometry draws them (SPEC-43): the canvas's chains (run
 * pieces and run overall below and above, the wall row of openings below), one record per segment.
 * Rows start 3/8" (paper) past everything drawn and stack 3/8" apart; an empty row takes no space.
 * `base` is where the extension lines start (the drawing's bottom or top), `at` the dimension line.
 */
export function elevationDimensions(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const lower = horizontalChains(room, view, 'lower', settings);
  const upper = horizontalChains(room, view, 'upper', settings);
  const chains = {
    'lower.inner': lower.inner,
    'lower.outer': lower.outer,
    openings: openingChain(room, view, settings),
    'upper.inner': upper.inner,
    'upper.outer': upper.outer,
  };
  const extent = wallExtent(room, view, settings);
  const step = DIMENSION_ROW_SPACING * plotScale(settings);
  const levels = { below: 0, above: 0 };
  const dimensions = [];
  for (const [row, where] of ROWS) {
    const segments = chains[row].filter((segment) => segment.end - segment.start > EPSILON);
    if (segments.length === 0) continue;
    levels[where] += 1;
    const base = where === 'below' ? extent.bottom : extent.top;
    const at = where === 'below' ? base - levels[where] * step : base + levels[where] * step;
    for (const segment of segments) {
      dimensions.push({
        row,
        kind: segment.kind,
        start: segment.start,
        end: segment.end,
        base,
        at,
        text: formatInches(segment.end - segment.start),
      });
    }
  }
  return dimensions;
}
```

**`src/elevation/model/drawingPayload.js`**: import `{ elevationDimensions }` from `'./elevationDimensions.js'`; each elevation gets `dimensions: elevationDimensions(room, wall, side, settings),` after `parts: [ … ],`.

**NEW `src/elevation/model/__tests__/elevationDimensions.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationDimensions } from '../elevationDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const row = ({ row: name, kind, start, end, base, at, text }) => [name, kind, start, end, base, at, text];

describe('SPEC-43 elevation dimensions', () => {
  it('dimensions every segment of the canvas\'s chains, rows 9" apart at 1/2" = 1\'-0" (G1 elevation A)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(elevationDimensions(g1, g1.walls[0], 'front', settings).map(row)).toEqual([
      ['lower.inner', 'piece', 0, 0.75, 0, -9, '3/4"'],
      ['lower.inner', 'piece', 0.75, 29.25, 0, -9, '28 1/2"'],
      ['lower.inner', 'piece', 29.25, 30, 0, -9, '3/4"'],
      ['lower.inner', 'piece', 30, 54, 0, -9, '24"'],
      ['lower.inner', 'piece', 54, 90, 0, -9, '36"'],
      ['lower.inner', 'piece', 90, 115.5, 0, -9, '25 1/2"'],
      ['lower.inner', 'piece', 115.5, 141, 0, -9, '25 1/2"'],
      ['lower.inner', 'piece', 141, 143.125, 0, -9, '2 1/8"'],
      ['lower.inner', 'corner-gap', 143.125, 168, 0, -9, '24 7/8"'],
      ['lower.outer', 'run', 0, 30, 0, -18, '30"'],
      ['lower.outer', 'run', 30, 168, 0, -18, '138"'],
      ['openings', 'gap', 0, 48, 0, -27, '48"'],
      ['openings', 'opening', 48, 96, 0, -27, '48"'],
      ['openings', 'gap', 96, 168, 0, -27, '72"'],
      ['upper.inner', 'tall-span', 0, 30, 96, 105, '30"'],
      ['upper.inner', 'open', 30, 108.5, 96, 105, '78 1/2"'],
      ['upper.inner', 'piece', 108.5, 109.25, 96, 105, '3/4"'],
      ['upper.inner', 'piece', 109.25, 131.25, 96, 105, '22"'],
      ['upper.inner', 'piece', 131.25, 153.25, 96, 105, '22"'],
      ['upper.inner', 'piece', 153.25, 155.125, 96, 105, '1 7/8"'],
      ['upper.inner', 'corner-gap', 155.125, 168, 96, 105, '12 7/8"'],
      ['upper.outer', 'tall-span', 0, 30, 96, 114, '30"'],
      ['upper.outer', 'open', 30, 108.5, 96, 114, '78 1/2"'],
      ['upper.outer', 'run', 108.5, 168, 96, 114, '59 1/2"'],
    ]);
  });

  it('skips an empty row and spaces rows by the plot scale (G1 elevation B at 1/4" = 1\'-0")', () => {
    const g1 = room('G1 Euro kitchen');
    const dimensions = elevationDimensions(g1, g1.walls[1], 'front', { ...settings, plotScale: 48 });
    // No openings: the wall row takes no space. 3/8" on paper is 18" at 1:48.
    expect([...new Set(dimensions.map(({ row: name, at }) => `${name} ${at}`))]).toEqual([
      'lower.inner -18', 'lower.outer -36', 'upper.inner 114', 'upper.outer 132',
    ]);
    expect(dimensions).toHaveLength(14);
  });

  it('dimensions the wall above when there are no uppers, and recesses in the wall row (G1 island, G5)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(elevationDimensions(g1, g1.walls[3], 'back', settings).map(row).slice(5)).toEqual([
      ['lower.outer', 'open', 0, 0.75, 0, -18, '3/4"'],
      ['lower.outer', 'run', 0.75, 90.75, 0, -18, '90"'],
      ['lower.outer', 'open', 90.75, 91.5, 0, -18, '3/4"'],
      ['upper.outer', 'wall', 0, 91.5, 36, 45, '91 1/2"'],
    ]);
    const g5 = room('G5 Recess room');
    expect(elevationDimensions(g5, g5.walls[1], 'front', settings)
      .filter(({ row: name }) => name === 'openings').map(row)).toEqual([
      ['openings', 'gap', 0, 32, 0, -27, '32"'],
      ['openings', 'recess', 32, 80, 0, -27, '48"'],
      ['openings', 'gap', 80, 140, 0, -27, '60"'],
      ['openings', 'recess', 140, 188, 0, -27, '48"'],
      ['openings', 'gap', 188, 200, 0, -27, '12"'],
    ]);
  });
});
```

`src/elevation/model/__tests__/drawingPayload.test.js`:
- import `{ elevationDimensions }` from `'../elevationDimensions.js'` after the `cornerParts.js` import;
- in `withoutParts`, after `delete copy.parts;` add `delete copy.dimensions;`;
- append inside the `describe`, after the SPEC-42.2 test, verbatim:

```js

  it('SPEC-43 carries each wall face\'s dimensions', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.dimensions.length)).toEqual([24, 14, 9, 9]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.dimensions).toEqual(elevationDimensions(synced, wall, elevation.side, settings));
    }
  });
```

What the cases show: G1 A's three rows below are at −9, −18 and −27 (pieces, runs, the window row), and its two above are at 105 and 114 (the extent's top is the 96" wall). G1 B has no openings, so its runs row is the last one below. At 1:48 the rows are 18" apart. The island (C/D) has no uppers, so the canvas's above row is the wall's length. G5's wall row dimensions the two recesses.

**Count:** 923 + 4 = **927**. Golden snapshot unchanged.

---

## End-to-end check (Kyle)

Geometry on `feature/drawing` with 345 in. Start the API and designer as in round 42.

**Back panel miter (after 344), G2 or a copy of it:**
- Select the peninsula's back run (wall 2, back face) and set its depth to 3/4".
- **Plan:** at the peninsula's free end, the back panel runs to the outside corner and the end panel's back corner is cut at 45°. The front still shows the frame's 13/16" miter.
- **Elevation, back face:** the back panel runs to the end. The end panel shows only below it (the toe kick height), and all of it on hover.
- **Wall end panel properties:** the field is now **Joint**. *Butted* puts the panel back at 77 3/4" with a square corner.
- **Parts list:** the back panel is 78 1/2" wide.
- Before you change the depth, G2 as drawn now has a square back corner in plan, and the whole end panel shows on the back face. That's the bug fix in §1.

**Export DXF (after 347), G1:**
- **`elevation-A.dxf`:** a `DIMENSIONS` layer with three rows under the floor (pieces at −9", runs at −18", the window row at −27") and two over the wall (105", 114").
- Text is 3" tall (1/8" at 1/2" = 1'-0") with ticks, reading like `28 1/2"`. The title block now starts at −39".
- Stretching a dimension in CAD re-measures it, without the inch mark.
- **Settings:** *Drawing scale* → 1/4" = 1'-0", then export again: rows 18" apart, text 6".
- `payload.json` has `plotScale` and each elevation's `dimensions`.

**Known for now:**
- On short segments (3/4" end panels), text doesn't fit between the ticks and can overlap its neighbours. 43.1 staggers them like the canvas's pop-outs.
- A run past a corner is still reached through `neighborProfiles` (43.1 moves it to `cornerShapes`).
- A panel-only run deeper than its panel (G2 as drawn) still reserves its whole depth, so it butts.
- A back panel mitered under a taller end panel (when the front run is taller) has a square corner above the back panel.

---

## Next: 43.1 (sketch, not specified yet)

Vertical chains at both wall edges, chosen as the canvas does with nothing selected (`orientation: 'vertical'` on the record, default `horizontal`), and the counter-height row. Cell (split-column) chains. Casing clearance and pin callouts. Corner reach dimensions and `wallExtent` move from `neighborProfiles` to `cornerShapes`, on both the canvas and the DXF. Text that doesn't fit its segment is staggered like the canvas's pop-outs.
