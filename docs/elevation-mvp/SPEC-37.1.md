# Elevation Lab — SPEC-37.1 (T-filler ends: the corner filler, and L-shaped end panels)

Steps 260–263, after round 37. Written against `12ab414` (step 259). Baseline **791**.

This spec gives the rules, the code to write, and the tests. The code was **not** built or run first (Codex implements it). The tests are written from the rules, so if one fails, check its expected value against §1 before changing the code.

| Step | What | Tests after |
|---|---|---|
| **260** | Model: a T end at an inside corner is 3/4" narrower; an end panel keeps its own T choice | 794 |
| **261** | Model: L-shaped end panels | 798 |
| **262** | Model: the L in plan and on the dimension chain | 800 |
| **263** | Screen: draw the L, the end panel's L-shape control, shape notes | 800 |

Next: **38** (combine and full grids).

## §1 The rules (Kyle, 2026-09-30)

### A T end at an inside corner

Round 37 made an end T the filler's visible width **plus** 3/4" over the box. At an inside corner the filler is already the corner minimum (1 1/2" at 90°), so the flat came out 2 1/4", wider than a plain Euro filler. Face frames solved the same thing in SPEC-36.1: the corner filler minimum drops by the frame's side reveal, so the stile comes out 1 1/2".

- **Same fix.** On a Euro run, at an end whose type is `filler` and whose T is on (the end's own choice, else `run.tFiller`), the inside-corner filler minimum is `cornerFillerMin − teeCover`, never below 0. At 90° the filler is 3/4" and the T's flat is 1 1/2", the same look as a plain 1 1/2" filler. The boxes get the 3/4".
- **Only the corner minimum changes**, as in SPEC-36.1. Wall-scribe ends and other flex fillers keep `fillerMinWidth`, and a typed filler width is still the filler (its T is that plus 3/4").
- A face frame run is unchanged (it never has a T).

### L-shaped end panels

When a run has T-fillers, its end panels are usually **L-shaped**: a lip on the panel's front covers the box's front edge the same way a T does.

- **Face.** The panel's thickness plus `teeCover`: 1 1/2" with a 3/4" panel, **1 9/16" with a 13/16" panel**. The thickness is the end's own width (`ends[side].width`), else `endPanelThickness`.
- **When.** Automatic: an end panel is an L whenever that end would get a T, which is the run's T-filler setting. **Each end can override it** (Follow run / L-shape / Plain panel). The override is stored where an end filler's T choice already is, `run.endFiller[side].tFiller` (SPEC-37 step 250 already validates and writes it), so this round needs **no shape change**. `endCoverOn(run, side)` reads it for both.
- **Layout doesn't change.** The panel keeps its width in the run; the lip overlaps the box. The box beside it is covered 3/4" on that side, so its doors get REV-005/006 reveals (13/16" for a pair, 27/32" for a single), exactly like a box beside a T.
- **Not a T.** It is still the end panel part (same number, same width), noted `L-shape`. The box is **not** rabbeted for it (FILL-007 is for a T's return), so it adds no rabbet note.
- **Elevation.** The panel is drawn widened over the box, like an end T. It drops with the run like any end panel.
- **Plan.** The panel is drawn as today, plus the lip: in front of the box it covers, from the box face to the panel's front (the door-face line).
- **Dimensions.** The horizontal chain shows the L's full face, then what's left of the box, like a T.
- **Euro only**, like T-fillers.

### Worked examples (the tests)

A base run, x 24, z 4, height 30.5, depth 24, `tFiller: 'seams'`, boxes a 18 and b 18.

- Left end panel (3/4"), width 36.75: panel 24–24.75, a 24.75–42.75, b 42.75–60.75. The L is x 24, 1 1/2" wide; its lip 24.75–25.5. a is covered 3/4" on both sides (L and the seam T at 42–43.5), so its single door has 27/32" each side: x 25.59375, width 16.3125. a's rabbet note is `right side` only.
- The same with a 13/16" panel (width 36.8125): the L is 1 9/16" (x 24, width 1.5625), lip 24.8125–25.5625.
- End panels both ends, one 36" box, width 37.5: a pair of doors, 13/16" each side: halves at 25.5625 and 42.8125, each 17.125. Plan lips 24.75–25.5 and 60–60.75, from 24 to 24.875.
- Inner chain (first example): L 24–25.5 | a 25.5–42 | T 42–43.5 | b 43.5–60.75.
- An anchored right end at a 90° inside corner, filler end, T on: filler minimum 3/4" (was 1 1/2"). T off, a panel end, not anchored, or inset: unchanged (inset stays 3/4" from its frame reveal, not less).

---

## §2 Step 260 — Model: the T end at a corner, and the end panel keeps its choice

**Files:** `src/elevation/model/styles.js` (290), `src/elevation/model/room.js` (1734), `src/elevation/store/elevationSlice.js` (1798), `src/elevation/model/__tests__/teeEnds.test.js` (new), `src/elevation/store/__tests__/elevationSlice.test.js` (2534).

### `src/elevation/model/styles.js`

Append:

```js
/**
 * Whether a run end gets a T-filler (a filler end) or an L-shaped end panel (an end panel end)
 * (SPEC-37, 37.1): the end's own choice, `run.endFiller[side].tFiller`, else the run's setting.
 */
export function endCoverOn(run, side) {
  return run.endFiller?.[side]?.tFiller ?? Boolean(run.tFiller);
}
```

### `src/elevation/model/room.js`

Line 50: add `endCoverOn` to the `./styles.js` import.

`endMinWidthsForRun` (191–207) becomes:

```js
/** Return per-side flex-filler minimums for a run in its room context. */
export function endMinWidthsForRun(room, wall, run, settings) {
  wall = wallViewForRun(wall, run);
  const style = resolveStyle(settings, room, run);
  const inset = isInsetStyle(style);
  // A face frame's whole stile clears the corner, box-to-opening included (SPEC-36.1).
  const frameReveal = inset ? styleReveals(style, run.cabinetTypeId, settings).left : 0;
  // So does a Euro T end's flat: the filler is the cover narrower (SPEC-37.1).
  const teeCover = (side) => (!inset && run.ends?.[side]?.type === 'filler' && endCoverOn(run, side)
    ? settings.teeCover
    : 0);
  return Object.fromEntries(['left', 'right'].map((side) => {
    const corner = cornerForRunSide(room, wall, run, side);
    return [
      side,
      (run.anchors?.[side] === true || run.anchors?.[side]?.to === 'wall')
        && corner.type === 'inside'
        ? Math.max(0, cornerFillerMin(settings, corner.angle) - frameReveal - teeCover(side))
        : settings.fillerMinWidth,
    ];
  }));
}
```

### `src/elevation/store/elevationSlice.js`

In `setRunEnd` (938): an end panel keeps its own T/L choice when only its width changes. Capture the type before it's replaced, and clear `endFiller[side]` for an end panel only when the type **changes** to `end_panel`:

```js
      const previous = location.run.ends[side]?.type;
      location.run.ends[side] = ...                       // unchanged
      if (end.type !== 'blind') ...                       // unchanged
      if (end.type === 'none' || (end.type === 'end_panel' && previous !== 'end_panel')) {
        if (location.run.endFiller) location.run.endFiller[side] = null;
      }
```

(`const previous` goes right after the `end` constant, before `location.run.ends[side]` is assigned.)

### NEW `src/elevation/model/__tests__/teeEnds.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { endMinWidthsForRun } from '../room.js';
import { endCoverOn } from '../styles.js';

const S = DEFAULT_SETTINGS;
const { BASE } = CABINET_TYPE_IDS;
const NONE = { type: 'none', width: null };
const FILLER = { type: 'filler', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });

function cornerRoom(runsA, style) {
  const wall = (id, x1, y1, x2, y2, connections, runs) => ({
    id, name: `Wall ${id}`, x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
    connections, profile: {}, runs,
  });
  return {
    id: 'R', name: 'Room R', profile: { ...S.defaultProfile }, ...(style ? { style } : {}),
    walls: [
      wall('A', 0, 0, 120, 0, { start: null, end: { wallId: 'B', endpoint: 'start' } }, runsA),
      wall('B', 120, 0, 120, 96, { start: { wallId: 'A', endpoint: 'end' }, end: null }, []),
    ],
  };
}

const anchoredRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: BASE, x: 24, width: 40, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: FILLER }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: true },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a')]),
  ...overrides,
});

const minimum = (run, style) => {
  const room = cornerRoom([run], style);
  return endMinWidthsForRun(room, room.walls[0], run, S);
};

describe('SPEC-37.1 a T end at an inside corner', () => {
  it('takes the cover off the corner filler minimum, so the flat is 1 1/2" like a plain filler', () => {
    expect(minimum(anchoredRun())).toEqual({ left: 1.5, right: 0.75 });
    expect(minimum(anchoredRun({ tFiller: undefined }))).toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun({ tFiller: undefined, endFiller: { left: null, right: { tFiller: true } } })))
      .toEqual({ left: 1.5, right: 0.75 });
  });

  it('leaves plain fillers, other end types, wall-scribe ends and face frames as they were', () => {
    expect(minimum(anchoredRun({ endFiller: { left: null, right: { tFiller: false } } })))
      .toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun({ ends: { left: NONE, right: { type: 'end_panel', width: null } } })))
      .toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun({ anchors: { left: false, right: false } }))).toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun(), { cabinetStyleId: 14 })).toEqual({ left: 1.5, right: 0.75 });
    expect(endCoverOn({ tFiller: 'all' }, 'left')).toBe(true);
    expect(endCoverOn({ tFiller: 'all', endFiller: { left: { tFiller: false } } }, 'left')).toBe(false);
    expect(endCoverOn({ endFiller: { right: { tFiller: true } } }, 'right')).toBe(true);
    expect(endCoverOn({}, 'right')).toBe(false);
  });
});
```

### `src/elevation/store/__tests__/elevationSlice.test.js`

Append at the end (`stateWithRun`, `run`, `auto`, `setRunEnd` and `setRunEndFiller` are already imported or defined in the file):

```js
describe('SPEC-37.1 an end panel keeps its own T choice', () => {
  it('keeps the choice when the panel width changes, and clears it when the end type changes', () => {
    let state = stateWithRun(run({ items: [auto('a')] }));
    const base = { roomId: state.rooms[0].id, wallId: 'wall-1', runId: 'run-1' };
    const currentRun = () => state.rooms[0].walls[0].runs[0];

    state = elevationReducer(state, setRunEnd({ ...base, side: 'left', end: { type: 'end_panel', width: null } }));
    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'tFiller', value: false }));
    expect(currentRun().endFiller.left).toEqual({ width: null, returnDepth: null, tFiller: false });

    state = elevationReducer(state, setRunEnd({ ...base, side: 'left', end: { type: 'end_panel', width: 0.8125 } }));
    expect(currentRun().endFiller.left).toEqual({ width: null, returnDepth: null, tFiller: false });

    state = elevationReducer(state, setRunEnd({ ...base, side: 'left', end: { type: 'filler', width: null } }));
    state = elevationReducer(state, setRunEnd({ ...base, side: 'left', end: { type: 'end_panel', width: null } }));
    expect(currentRun().endFiller.left).toBeNull();
  });
});
```

**Count:** 791 + 3 = **794**.

---

## §3 Step 261 — Model: L-shaped end panels

`teeFillers` also returns `ells`: one per L-shaped end panel, `{ id, side, pieceId, x, z, width, height, drop, boxIds, lip: { start, end } }` (the face in wall coordinates, dropped like the fillers, and the lip's span along the wall). Each covers the box beside it, which `faceLayouts` already turns into REV-005/006 reveals. Ls add a `L-shape` note and **no** rabbet note.

**Files:** `src/elevation/model/tees.js` (268), `src/elevation/model/__tests__/teeEnds.test.js`.

### `src/elevation/model/tees.js`

1. Line 4: add `endCoverOn` to the `./styles.js` import.
2. In `teeFillers`: add `const ells = [];` beside `tees`, and return `ells` from **both** returns (the inset early return too): `{ tees, covers, notes, rabbets, ells }`.
3. Rabbets come from T covers only. Replace `addCover` with:

```js
  const rabbetCovers = new Map();
  const addCover = (id, side, amount, rabbet = true) => {
    const current = covers.get(id) ?? noCovers();
    covers.set(id, { ...current, [side]: Math.max(current[side], amount) });
    if (!rabbet) return;
    const sides = rabbetCovers.get(id) ?? noCovers();
    rabbetCovers.set(id, { ...sides, [side]: Math.max(sides[side], amount) });
  };
```

and at the end, `for (const [id, sides] of covers) rabbets.set(...)` becomes `for (const [id, sides] of rabbetCovers) rabbets.set(id, rabbetNote(sides));`.

4. In the end-filler loop, `if (!(run.endFiller?.[side]?.tFiller ?? Boolean(run.tFiller))) continue;` becomes `if (!endCoverOn(run, side)) continue;`.
5. Right after the end-filler loop (before the horizontal seams, so a horizontal T stops at an L's cover too), add:

```js
  // An end panel at either end is L-shaped (SPEC-37.1): its lip covers the box's front edge like a
  // T, so its face is the panel's thickness plus the cover. The box isn't rabbeted for it.
  for (const side of ['left', 'right']) {
    const piece = cells.pieces.find((candidate) => candidate.role === `end-${side}` && candidate.kind === 'end_panel');
    if (!piece || run.ends[side].type !== 'end_panel' || !endCoverOn(run, side)) continue;
    const edge = side === 'left' ? piece.x + piece.width : piece.x;
    const beside = boxes.filter((box) => near(side === 'left' ? box.x : box.x + box.width, edge)
      && overlap(box.z, box.z + box.height, piece.z, piece.z + piece.height) > EPSILON);
    if (beside.length === 0) continue;
    const flat = dropped(piece.z, piece.height);
    const lip = side === 'left' ? { start: edge, end: edge + cover } : { start: edge - cover, end: edge };
    ells.push({
      id: piece.id,
      side,
      pieceId: piece.id,
      x: side === 'left' ? piece.x : lip.start,
      z: flat.z,
      width: piece.width + cover,
      height: flat.height,
      drop: flat.drop,
      boxIds: beside.map((box) => box.id),
      lip,
    });
    for (const box of beside) addCover(box.id, side, cover, false);
  }
```

6. After the notes loop over `tees`: `for (const ell of ells) notes.set(ell.id, ['L-shape']);`
7. Add one sentence to the JSDoc: "`ells` are the L-shaped end panels (SPEC-37.1): `{ id, side, pieceId, x, z, width, height, drop, boxIds, lip }`; they cover their box like a T but add no rabbet note." and add `ells: object[]` to `@returns`.

Nothing else reads `ells` yet. `faceLayouts` needs no change: it already reads `covers`.

### `src/elevation/model/__tests__/teeEnds.test.js`

Replace the import block with:

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { endMinWidthsForRun, resolveWall } from '../room.js';
import { endCoverOn } from '../styles.js';
import { teeFillers } from '../tees.js';
```

change `const { BASE } = CABINET_TYPE_IDS;` to `const { BASE, UPPER } = CABINET_TYPE_IDS;`, and append:

```js
const PANEL = { type: 'end_panel', width: null };

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

const panelRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: BASE, x: 24, width: 36.75, z: 4, height: 30.5, depth: 24,
  ends: { left: PANEL, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a', 18), cab('b', 18)]),
  ...overrides,
});

const pairRun = (overrides = {}) => panelRun({
  width: 37.5, ends: { left: PANEL, right: PANEL }, grid: gridFromItems('r', [cab('a', 36)]), ...overrides,
});

function context(run, style) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return { room, wall, layout, cells: cellPieces(run, layout) };
}

const ellsOf = (run, style) => {
  const { room, cells } = context(run, style);
  return teeFillers(room, run, cells, S);
};

describe('SPEC-37.1 L-shaped end panels', () => {
  it('makes an end panel L-shaped: its thickness plus 3/4" over the box, with no rabbet', () => {
    const { ells, tees, covers, rabbets, notes } = ellsOf(panelRun());
    expect(ells).toEqual([{
      id: 'r:left', side: 'left', pieceId: 'r:left', x: 24, z: 4, width: 1.5, height: 30.5, drop: 0,
      boxIds: ['a'], lip: { start: 24.75, end: 25.5 },
    }]);
    expect(tees.map((tee) => tee.id)).toEqual(['tee:a|b']);
    expect(covers.get('a')).toEqual({ left: 0.75, right: 0.75, top: 0, bottom: 0 });
    expect(rabbets.get('a')).toBe('FF to rabbet right side for T-filler');
    expect(notes.get('r:left')).toEqual(['L-shape']);
  });

  it('is 1 9/16" with a 13/16" panel, mirrors on the right, and drops with an upper', () => {
    const thick = ellsOf(panelRun({ width: 36.8125, ends: { left: { type: 'end_panel', width: 0.8125 }, right: NONE } }));
    expect(thick.ells[0]).toMatchObject({ x: 24, width: 1.5625, lip: { start: 24.8125, end: 25.5625 } });
    expect(ellsOf(panelRun({ ends: { left: NONE, right: PANEL } })).ells).toEqual([{
      id: 'r:right', side: 'right', pieceId: 'r:right', x: 59.25, z: 4, width: 1.5, height: 30.5, drop: 0,
      boxIds: ['b'], lip: { start: 59.25, end: 60 },
    }]);
    const upper = ellsOf(panelRun({ cabinetTypeId: UPPER, z: 54, height: 30, depth: 12 }));
    expect(upper.ells[0]).toMatchObject({ z: 53.875, height: 30.125, drop: 0.125 });
  });

  it('follows the run unless the end has its own choice, and only on Euro', () => {
    expect(ellsOf(panelRun({ tFiller: undefined })).ells).toEqual([]);
    const own = panelRun({ tFiller: undefined, endFiller: { left: { tFiller: true }, right: null } });
    expect(ellsOf(own).ells.map((ell) => ell.id)).toEqual(['r:left']);
    const off = ellsOf(panelRun({ endFiller: { left: { tFiller: false }, right: null } }));
    expect(off.ells).toEqual([]);
    expect(off.covers.get('a').left).toBe(0);
    expect(ellsOf(panelRun(), { cabinetStyleId: 14 }).ells).toEqual([]);
  });

  it('gives the doors beside an L the REV-005/006 reveals', () => {
    const faces = (run) => {
      const { room, wall, layout } = context(run);
      return runFaceLayouts(room, wall, run, S, layout);
    };
    const single = faces(panelRun()).get('a');
    expect(single.reveals.values).toMatchObject({ left: 0.84375, right: 0.84375 });
    expect(single.faces[0]).toMatchObject({ x: 25.59375, width: 16.3125 });
    const pair = faces(pairRun()).get('a');
    expect(pair.reveals.values).toMatchObject({ left: 0.8125, right: 0.8125 });
    expect(pair.faces.map((face) => [face.half, face.x, face.width])).toEqual([
      ['left', 25.5625, 17.125], ['right', 42.8125, 17.125],
    ]);
  });
});
```

**Count:** 794 + 4 = **798**.

---

## §4 Step 262 — Model: the L in plan and on the dimension chain

**Files:** `src/elevation/model/planPieces.js` (333), `src/elevation/model/dimensions.js` (705), `src/elevation/model/__tests__/teeEnds.test.js`.

### `src/elevation/model/planPieces.js`

In `planRunPieces`, `const { tees } = teeFillers(...)` becomes `const { tees, ells } = teeFillers(...)`. Append the lips to the end of `teeFaces` (after the seam Ts):

```js
    // An L-shaped end panel's lip (SPEC-37.1): in front of the box it covers, out to the panel's front.
    ...ells.map((ell) => ({
      key: `${ell.id}:lip`, kind: 'end_panel', start: ell.lip.start, end: ell.lip.end, back: teeBack, front: faceFront,
    })),
```

The end panel's own plan piece stays as it is. The outset `shift` already applies to `teeFaces`.

### `src/elevation/model/dimensions.js`

In `runInnerSegments` (209): `const { tees, covers } = ...` becomes `const { tees, covers, ells } = ...`, add
`const endElls = new Map(ells.map((ell) => [ell.pieceId, ell]));` beside `endTees`, and in the piece loop, before the `endTees` check:

```js
    const ell = endElls.get(piece.id);
    if (ell) {
      entries.push({
        start: ell.x, end: ell.x + ell.width, kind: 'piece', metadata: { runId: run.id, pieceId: piece.id },
      });
      continue;
    }
```

The box beside it is already trimmed by `coverAt` (it reads `covers`).

### `src/elevation/model/__tests__/teeEnds.test.js`

Add to the imports: `import { horizontalChains } from '../dimensions.js';` and `import { planRunPieces } from '../planPieces.js';` (in alphabetical position). Append:

```js
describe('SPEC-37.1 L-shaped end panels in plan and on the chain', () => {
  const plan = (run) => {
    const { room, wall, layout } = context(run);
    return planRunPieces(room, wall, run, S, layout, runFaceLayouts(room, wall, run, S, layout));
  };
  const byKey = (pieces, key) => pieces.find((piece) => piece.key === key);

  it('draws the lip in front of the box, out to the panel\'s front', () => {
    const { faces } = plan(pairRun());
    expect(byKey(faces, 'r:left')).toEqual({ key: 'r:left', kind: 'end_panel', start: 24, end: 24.75, back: 0, front: 24.875 });
    expect(byKey(faces, 'r:left:lip')).toEqual({ key: 'r:left:lip', kind: 'end_panel', start: 24.75, end: 25.5, back: 24, front: 24.875 });
    expect(byKey(faces, 'r:right:lip')).toEqual({ key: 'r:right:lip', kind: 'end_panel', start: 60, end: 60.75, back: 24, front: 24.875 });
    expect(plan(panelRun({ tFiller: undefined })).faces.some((face) => face.key.endsWith(':lip'))).toBe(false);
    expect(byKey(plan(panelRun({ outset: 2 })).faces, 'r:left:lip')).toMatchObject({ back: 26, front: 26.875 });
  });

  it('dimensions the L like a T: its face, then what\'s left of the box', () => {
    const room = roomWith(panelRun());
    const inner = horizontalChains(room, resolveWall(room, room.walls[0]), 'lower', S).inner
      .filter(({ kind }) => kind !== 'open');
    expect(inner.map(({ start, end, kind, pieceId }) => [start, end, kind, pieceId])).toEqual([
      [24, 25.5, 'piece', 'r:left'],
      [25.5, 42, 'piece', 'a'],
      [42, 43.5, 't-filler', 'tee:a|b'],
      [43.5, 60.75, 'piece', 'b'],
    ]);
  });
});
```

**Count:** 798 + 2 = **800**.

---

## §5 Step 263 — Screen: draw the L, the L-shape control, shape notes

**Files:** `src/elevation/components/RunGroup.jsx` (623), `src/elevation/components/properties/EndFields.jsx` (150), `src/elevation/components/properties/PieceProperties.jsx` (189).

### `RunGroup.jsx` (154–175)

The `tees` memo returns the whole result: `const { tees, ells } = useMemo(() => teeFillers(room, run, cells, settings), [cells, room, run, settings]);`. In `drawnPieces`, `endTees` also holds the Ls, so an L-shaped end panel is drawn at its face width, the same way an end T is:

```js
    const endTees = new Map([
      ...tees.filter((tee) => tee.end).map((tee) => [tee.pieceId, tee]),
      ...ells.map((ell) => [ell.pieceId, ell]),
    ]);
```

Add `ells` to that memo's dependencies. Nothing else changes: the drop and the `end_panel` kind are applied after the width, as now.

### `EndFields.jsx`

After the width field (the `endType !== 'none'` `InchInput` block, 42–57), add a select for an end panel, the same as the end filler's T-filler select (the same classes, the same `setRunEndFiller` `key: 'tFiller'` dispatch):

- shown when `endType === 'end_panel'`
- label **L-shape**, `aria-label={`${side} end panel L-shape`}`
- options: `follow` "Follow run", `yes` "L-shape", `no` "Plain panel"

### `PieceProperties.jsx`

Import `teeFillers` is already there. For an end piece, show its shape note first in the notes line: after `const endNotes = ...` (110–113), add

```js
  const shapeNotes = side
    ? (teeFillers(room, run, cells, settings).notes.get(piece.id) ?? [])
      .filter((note) => note === 'T-shape' || note === 'L-shape')
    : [];
```

and build `notesLine` from `[...shapeNotes, ...endNotes]` instead of `endNotes`.

**Count:** unchanged, **800**.

---

## §6 Assumptions to confirm

1. Only the **inside-corner** minimum shrinks for a T end (like SPEC-36.1). A wall-scribe end T is still `fillerMinWidth` + 3/4" (2 1/4"), and a typed filler width still means the filler.
2. An L's lip runs from the box face to the panel's front (the door-face line, 7/8" in front of the box), so the panel's front edge stays where it is today.
3. The L-shape choice shares `run.endFiller[side].tFiller` with the end filler's T choice. Switching an end between filler and end panel resets it to Follow run.
4. An L adds no rabbet note to the box, and the end panel's part width doesn't change.
5. Wall end panels (island ends, `wall.endPanels`) aren't run end panels and don't become Ls.
