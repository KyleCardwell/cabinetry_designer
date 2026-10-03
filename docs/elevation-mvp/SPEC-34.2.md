# Elevation Lab — SPEC-34.2 (panel doors, hinge side, plan view from cells)

Steps 182–186, a second short fix round before round 35. The earlier SPEC files still apply; this file is the
source of truth for what follows. The repo is at `2d6da93` (step 181) on `elevation-grid-run-split`, with
**616** tests passing.

Like 34.1, this round was **not** built before it was written; the expected values were worked out against the
code at `2d6da93`. If a new test fails by a small amount, check the SPEC's arithmetic against the code before
changing the code, and say which was wrong.

| Step | What | Files |
|---|---|---|
| **182** | Model: a panel's **Doors** setting (flush / cover); panel depth rule; covered-panel reveals; hinge stops; capture ignores covered panels. | `cells.js`, `splitRun.js`, `capture.js`, `styles.js`, `cellTree.js`, `index.js`, 1 new test + 2 test files |
| **183** | Faces: **hinge side** on single doors (stored or derived), warnings for pair doors and hinges on a covered side. | `faces.js`, `faceTree.js`, `faceLayouts.js`, `index.js`, 3 test files |
| **184** | Saves accept `doors` on panels and `hinge` on doors. | `persistence.js`, its test |
| **185** | Store and UI: `setPanelDoors`; Doors select; derived depth shown; Hinge select; readable face warnings. | slice, slice test, 3 properties files |
| **186** | Plan view drawn from cells: cabinet boxes at their depth, side and back panels, dashed shelves, nothing for open cells. | `planPieces.js`, `PlanRunFootprint.jsx`, `planPieces.test.js` |

## After this round you can

- Set a side or top/bottom panel's **Doors** to **Flush** (default) or **Cover**.
  - Flush: the panel reaches the door face, 24 7/8" on a 24" run (box + 1/16" bumper + 13/16" door), and the
    cabinet beside it is captured (REV-005/006) as now.
  - Cover: the panel is box depth (24"), and the cabinet's reveal on that side is its standard reveal minus the
    panel's thickness, source `rule: covered panel`: −11/16" beside a 3/4" side panel (1/16" back from the
    panel's face), −7/8" over a 3/4" bottom panel on an upper (REV-011), −5/8" on a base. Overridable per
    cabinet as usual.
- See the derived depth greyed in a panel's Depth box; typing a depth still overrides it.
- Pick a **Hinge side** (Left / Right) on any single door. Left blank, it defaults to the side against a filler,
  end panel or flush side panel; failing that, the side away from a covered panel; otherwise it stays blank.
- Get a warning when a pair door is next to a covered side panel (and the covered reveal isn't applied to it),
  or when a door's hinges are on the side that covers a panel.
- See plan view match the cells: a split column's cabinets at their own depth, side and back panels as strips,
  shelves as a dashed outline, nothing where a cell is open.

## Not in this round

- Top/bottom panels in plan (they're horizontal, like a countertop, and would hide the cabinets under them).
- Hinge side on pair doors (always both sides) and on lift/flip doors (not modelled yet).
- Hinge boring or any report use of the hinge side.

---

## §1 Decisions

**`doors` on a panel leaf** is `'cover'` or absent (flush). It only matters for a `side` or `top` panel; a
back panel ignores it. It reaches pieces as `piece.doors` (only when `'cover'`), from `cellPieces` for nested
cells and from `splitRun`'s `itemExtras` for top-level ones. `setGridPanelType` keeps it for side/top and
drops it for back; changing kind away from panel drops it (the new leaf has only id/kind).

**Depth rule** — `cellDepth(piece, leaf, runDepth, settings)`:
- the leaf's own `depth`, if set;
- else a side or top/bottom panel that isn't covered: `runDepth + bumperThickness + doorThickness`;
- else `runDepth`.

**Covered sides** — `coveredSides(pieces, pieceId)` → `{ top, bottom, left, right }`, each the covering
panel's thickness or 0: a `panel` piece with `doors: 'cover'`, a `side` panel touching the piece's left/right
edge and overlapping it vertically, or a `top` panel touching its top/bottom edge and overlapping it
horizontally.

**Covered-panel reveal** — `cabinetReveals` gets `covered` (default all 0). For a Euro style, each covered side
becomes `styleReveals(style, cabinetTypeId, settings)[side] − thickness`, source `'rule:covered-panel'`.
Applied after captured-single and before manual. Inset styles ignore it (a covered panel in a face frame run
isn't a thing; round 36 handles frames).

**Capture ignores covered panels.** `capture.js` and `cellCaptureSides` count a side panel only when
`doors !== 'cover'`.

**Hinge stops** — `hingeStops(pieces, pieceId)` → `{ left, right }`: a `filler`, an `end_panel`, or a flush
`side` panel touching that edge and overlapping vertically.

**Hinge side** — a `door` face node may carry `hinge: 'left' | 'right'`. For each resolved `door` face:
- a stored `hinge` wins;
- else, among the cabinet sides this face touches (no other face lies wholly to that side of it at an
  overlapping height): if exactly one touched side is a hinge stop, hinge there;
- else if exactly one touched side is covered, hinge on the other side;
- else no hinge.
A derived hinge is marked `hingeRule: true` on the resolved face. A face with a hinge on a touched, covered side
warns `{ code: 'hinge-on-covered-side', path }`.

**Pair doors** — when the cabinet's face root is a `pair_door` and a left or right side is covered, the
covered rule is skipped on the left/right sides and the layout warns `{ code: 'pair-door-covers-panel', path:
'r' }`.

---

## §2 Step 182 — panel doors, depth, covered reveals (model)

### cells.js (241)
- The leaf piece in `resolveGrid` (~88–97): after the `align` line add
  `...(cell.node.doors ? { doors: cell.node.doors } : {}),`.
- `cellCaptureSides` (194–205): the filter also requires `candidate.doors !== 'cover'`.
- Append:

```js
/** A cell's true depth: its own, else a flush side/top panel reaches the door face, else the run's box depth. */
export function cellDepth(piece, leaf, runDepth, settings) {
  if (leaf?.depth !== undefined) return leaf.depth;
  const orientation = panelOrientation(piece);
  if (piece.kind === 'panel' && orientation !== 'back' && leaf?.doors !== 'cover') {
    return runDepth + settings.bumperThickness + settings.doorThickness;
  }
  return runDepth;
}

/** How thick a covered panel is on each side of a piece (0 = not covered). */
export function coveredSides(pieces, pieceId) {
  const result = { top: 0, bottom: 0, left: 0, right: 0 };
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return result;
  for (const panel of pieces) {
    if (panel === piece || panel.kind !== 'panel' || panel.doors !== 'cover') continue;
    const orientation = panelOrientation(panel);
    if (orientation === 'side' && overlapsVertically(panel, piece)) {
      if (Math.abs(panel.x + panel.width - piece.x) <= EPSILON) result.left = panel.width;
      if (Math.abs(panel.x - piece.x - piece.width) <= EPSILON) result.right = panel.width;
    }
    if (orientation === 'top' && rangesOverlap(panel, piece)) {
      if (Math.abs(panel.z - piece.z - piece.height) <= EPSILON) result.top = panel.height;
      if (Math.abs(panel.z + panel.height - piece.z) <= EPSILON) result.bottom = panel.height;
    }
  }
  return result;
}

/** Which sides of a piece a door can hinge against: a filler, an end panel or a flush side panel. */
export function hingeStops(pieces, pieceId) {
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) return { left: false, right: false };
  const stops = pieces.filter((candidate) => candidate !== piece
    && overlapsVertically(candidate, piece)
    && (candidate.kind === 'filler' || candidate.kind === 'end_panel'
      || (candidate.kind === 'panel' && panelOrientation(candidate) === 'side'
        && candidate.doors !== 'cover')));
  return {
    left: stops.some((stop) => Math.abs(stop.x + stop.width - piece.x) <= EPSILON),
    right: stops.some((stop) => Math.abs(stop.x - piece.x - piece.width) <= EPSILON),
  };
}
```

(`rangesOverlap`, `overlapsVertically` and `panelOrientation` already exist in cells.js.)

### splitRun.js (558)
`itemExtras` (17–23): add `...(item.doors !== undefined ? { doors: item.doors } : {}),` after `align`.

### capture.js (47)
`isPanelLike`: the side-panel line becomes
`|| (panelOrientation(neighbor) === 'side' && neighbor.doors !== 'cover')`.

### styles.js (199)
- `REVEAL_SOURCE_LABELS` (21–): add `'rule:covered-panel': 'rule: covered panel',`.
- `cabinetReveals`: new parameter `covered = { top: 0, bottom: 0, left: 0, right: 0 },` after `stacked`
  (127). After the captured-single block (151–155), before the manual loop:
  ```js
  if (euro) {
    const standard = styleReveals(style, cabinetTypeId, settings);
    for (const key of ['top', 'bottom', 'left', 'right']) {
      if (covered?.[key] > 0) apply(key, standard[key] - covered[key], 'rule:covered-panel');
    }
  }
  ```

### cellTree.js (426)
- `setGridPanelType` (371–): keep a side/top panel's `doors`:
  after building `next`, `if (type !== 'back' && leaf.doors) next.doors = leaf.doors;`, and `sameLeaf` also
  requires `next.doors === leaf.doors`.
- Append:
  ```js
  /** Sets a panel's doors: 'cover', or 'flush'/null (the default) to clear it. */
  export function setGridPanelDoors(grid, leafId, doors) {
    const found = cellLeaf(grid, leafId);
    if (!found || found.cell.node.kind !== 'panel') return grid;
    if (doors !== 'cover' && doors !== 'flush' && doors !== null) return grid;
    const leaf = found.cell.node;
    if ((doors === 'cover') === (leaf.doors === 'cover')) return grid;
    const next = { ...leaf };
    if (doors === 'cover') next.doors = 'cover';
    else delete next.doors;
    return replaceLeaf(grid, found, next);
  }
  ```

### index.js
`cells.js` block adds `cellDepth`, `coveredSides`, `hingeStops`; `cellTree.js` block adds `setGridPanelDoors`.

### Tests

**NEW `src/elevation/model/__tests__/cellCover.test.js` (4):**

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { findLeaf, setGridCellKind, setGridPanelDoors, setGridPanelType } from '../cellTree.js';
import { cellCaptureSides, cellDepth, cellPieces, coveredSides, hingeStops } from '../cells.js';

const AUTO = (id) => ({ id, size: null, sizeMode: 'auto' });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const panel = (id, x, z, width, height, extra = {}) => ({ id, kind: 'panel', x, z, width, height, depth: 24, ...extra });
const CAB = { id: 'c', kind: 'cabinet', x: 0.75, z: 0, width: 20, height: 29.25, depth: 24 };
const COVER_L = panel('L', 0, 0, 0.75, 30, { doors: 'cover' });
const COVER_T = panel('T', 0.75, 29.25, 20, 0.75, { doors: 'cover' });
const FLUSH_R = panel('R', 20.75, 0, 0.75, 30);

describe('SPEC-34.2 panel doors', () => {
  it('finds covered sides and hinge stops', () => {
    const pieces = [COVER_L, CAB, COVER_T, FLUSH_R];
    expect(coveredSides(pieces, 'c')).toEqual({ top: 0.75, bottom: 0, left: 0.75, right: 0 });
    expect(hingeStops(pieces, 'c')).toEqual({ left: false, right: true });
    expect(cellCaptureSides(pieces, 'c')).toEqual({ left: false, right: true });
    const filler = { id: 'F', kind: 'filler', x: 20.75, z: 0, width: 3, height: 30, depth: 24 };
    expect(hingeStops([COVER_L, CAB, filler], 'c')).toEqual({ left: false, right: true });
    expect(coveredSides(pieces, 'zz')).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('derives a panel\'s depth from its doors', () => {
    expect(cellDepth(FLUSH_R, { id: 'R', kind: 'panel' }, 24, DEFAULT_SETTINGS)).toBe(24.875);
    expect(cellDepth(COVER_L, { id: 'L', kind: 'panel', doors: 'cover' }, 24, DEFAULT_SETTINGS)).toBe(24);
    expect(cellDepth(COVER_T, { id: 'T', kind: 'panel' }, 24, DEFAULT_SETTINGS)).toBe(24.875);
    const back = panel('B', 0, 0, 20, 30, { depth: 0.75 });
    expect(cellDepth(back, { id: 'B', kind: 'panel', depth: 0.75 }, 24, DEFAULT_SETTINGS)).toBe(0.75);
    expect(cellDepth(FLUSH_R, { id: 'R', kind: 'panel', depth: 12 }, 24, DEFAULT_SETTINGS)).toBe(12);
    expect(cellDepth(CAB, { id: 'c', kind: 'cabinet' }, 24, DEFAULT_SETTINGS)).toBe(24);
  });

  it('carries doors onto nested pieces', () => {
    const grid = gridFromItems('r', [{ id: 'g', kind: 'cabinet', width: null, grid: {
      id: 'g', cols: [AUTO('g:c')],
      rows: [{ id: 'g:t', size: 0.75, sizeMode: 'manual' }, AUTO('g:b')],
      cells: [cell(0, 0, { id: 't', kind: 'panel', doors: 'cover' }), cell(0, 1, { id: 'c', kind: 'cabinet' })],
    } }]);
    const layout = { pieces: [{ id: 'g', kind: 'cabinet', role: 'item', cabinetTypeId: 2, x: 0, width: 30, z: 54, height: 30, depth: 12, auto: true }] };
    const { pieces } = cellPieces({ id: 'r', cabinetTypeId: 2, grid }, layout);
    expect(pieces.find(({ id }) => id === 't')).toMatchObject({ doors: 'cover', z: 83.25, height: 0.75 });
    expect(pieces.find(({ id }) => id === 'c')).not.toHaveProperty('doors');
    expect(coveredSides(pieces, 'c')).toEqual({ top: 0.75, bottom: 0, left: 0, right: 0 });
  });

  it('sets a panel\'s doors and keeps them through side/top types', () => {
    const root = gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }]);
    const side = setGridPanelType(setGridCellKind(root, 'a', 'panel'), 'a', 'side', 0.75);
    const covered = setGridPanelDoors(side, 'a', 'cover');
    expect(findLeaf(covered, 'a')).toEqual({ id: 'a', kind: 'panel', doors: 'cover' });
    expect(setGridPanelDoors(covered, 'a', 'cover')).toBe(covered);
    expect(setGridPanelType(covered, 'a', 'side', 0.75)).toBe(covered);
    expect(findLeaf(setGridPanelType(covered, 'a', 'back', 0.75), 'a'))
      .toEqual({ id: 'a', kind: 'panel', depth: 0.75, align: 'back' });
    expect(findLeaf(setGridPanelDoors(covered, 'a', 'flush'), 'a')).toEqual({ id: 'a', kind: 'panel' });
    expect(findLeaf(setGridPanelDoors(covered, 'a', null), 'a')).toEqual({ id: 'a', kind: 'panel' });
    expect(setGridPanelDoors(covered, 'a', 'x')).toBe(covered);
    expect(setGridPanelDoors(root, 'a', 'cover')).toBe(root);
  });
});
```

**`styles.test.js`** — a test at the end of `describe('styles')` (uses the file's `EURO`, `INSET`, `S`,
`DOOR`, `BASE`, `UPPER`, `TALL`):

```js
  it('55 covered panel rule', () => {
    const tall = cabinetReveals({ style: EURO, cabinetTypeId: TALL, face: DOOR, covered: { left: 0.75 }, settings: S });
    expect(tall.values.left).toBe(-0.6875);
    expect(tall.sources.left).toBe('rule:covered-panel');
    expect(tall.sources.right).toBe('style');
    expect(cabinetReveals({ style: EURO, cabinetTypeId: UPPER, face: DOOR, covered: { bottom: 0.75 }, settings: S })
      .values.bottom).toBe(-0.875);
    expect(cabinetReveals({ style: EURO, cabinetTypeId: BASE, face: DOOR, covered: { bottom: 0.75 }, settings: S })
      .values.bottom).toBe(-0.625);
    expect(cabinetReveals({ style: INSET, cabinetTypeId: TALL, face: DOOR, covered: { left: 0.75 }, settings: S })
      .sources.left).toBe('style');
    const manual = cabinetReveals({ style: EURO, cabinetTypeId: TALL, face: DOOR, covered: { left: 0.75 }, manual: { left: 0 }, settings: S });
    expect(manual.values.left).toBe(0);
    expect(manual.sources.left).toBe('manual');
  });
```

**`splitRun.test.js`** — a test at the end of `describe('SPEC-34.1 auto cell kinds')` (uses its `kindRun`):

```js
  it('carries a panel\'s doors onto its piece', () => {
    const layout = splitRun(kindRun(30, [
      { id: 'p', kind: 'panel', width: 0.75, doors: 'cover' },
      { id: 'a', kind: 'cabinet', width: null },
    ]), DEFAULT_SETTINGS);
    expect(layout.pieces[0].doors).toBe('cover');
    expect(layout.pieces[1]).not.toHaveProperty('doors');
  });
```

**Count:** 616 + 6 = **622**.

---

## §3 Step 183 — hinge side and face warnings

### faces.js (142)
- `isFaceNode`, the leaf branch (34): `return node.children === undefined && node.direction === undefined
  && (node.hinge === undefined || (node.type === 'door' && (node.hinge === 'left' || node.hinge === 'right')));`
- `resolveFaces`, the single-leaf push (103): `faces.push({ path, type: node.type, ...leaf, ...(node.hinge ? { hinge: node.hinge } : {}) });`
- Append:

```js
function overlapsHeight(a, b) {
  return Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z) > 1e-6;
}

/**
 * Hinge side for each resolved 'door' face: stored, else against the one hinge stop it touches,
 * else away from the one covered side it touches. Warns when a hinge is on a covered side.
 */
export function applyHinges(faces, stops, covered) {
  const warnings = [];
  const next = faces.map((face) => {
    if (face.type !== 'door') return face;
    const beside = faces.filter((other) => other !== face && overlapsHeight(other, face));
    const touches = {
      left: !beside.some((other) => other.x + other.width <= face.x + 1e-6),
      right: !beside.some((other) => other.x >= face.x + face.width - 1e-6),
    };
    let hinge = face.hinge ?? null;
    let rule = false;
    if (!hinge) {
      const stopLeft = touches.left && stops.left;
      const stopRight = touches.right && stops.right;
      const coverLeft = touches.left && covered.left > 0;
      const coverRight = touches.right && covered.right > 0;
      if (stopLeft !== stopRight) hinge = stopLeft ? 'left' : 'right';
      else if (coverLeft !== coverRight) hinge = coverLeft ? 'right' : 'left';
      rule = hinge !== null;
    }
    if (hinge && touches[hinge] && covered[hinge] > 0) {
      warnings.push({ code: 'hinge-on-covered-side', path: face.path });
    }
    return hinge ? { ...face, hinge, ...(rule ? { hingeRule: true } : {}) } : face;
  });
  return { faces: next, warnings };
}
```

### faceTree.js (121)
- `setFaceType` (41–45): the replacer drops `hinge` when the new type isn't `'door'`:
  `(node) => { const next = { ...node, type }; if (type !== 'door') delete next.hinge; return next; }`
- Append:
  ```js
  /** Sets a door leaf's hinge side ('left' / 'right'), or clears it with null. */
  export function setFaceHinge(face, path, hinge) {
    const target = getFaceNode(face, path);
    if (target?.type !== 'door') return face;
    if (hinge !== null && hinge !== 'left' && hinge !== 'right') return face;
    if ((target.hinge ?? null) === hinge) return face;
    return replaceAt(face, path, (node) => {
      const next = { ...node };
      if (hinge) next.hinge = hinge;
      else delete next.hinge;
      return next;
    });
  }
  ```

### faceLayouts.js (69)
Import `coveredSides, hingeStops` from `./cells.js` and `applyHinges` from `./faces.js`. In the loop (51–66):

```js
    const face = item?.face ?? defaultFace(piece.width, settings);
    const covered = coveredSides(cells.pieces, piece.id);
    const pairCovers = face.type === 'pair_door' && (covered.left > 0 || covered.right > 0);
    const style = resolveStyle(settings, room, run, item);
    const reveals = cabinetReveals({
      style,
      cabinetTypeId: run.cabinetTypeId,
      run,
      face,
      captured,
      stacked: stackedSides(cells.pieces, piece.id),
      covered: pairCovers ? { ...covered, left: 0, right: 0 } : covered,
      manual: item?.reveals ?? null,
      settings,
    });
    const resolved = cabinetFaces(item, piece, run.cabinetTypeId, settings, reveals.values);
    const hinged = applyHinges(resolved.faces, hingeStops(cells.pieces, piece.id), covered);
    result.set(piece.id, {
      faces: hinged.faces,
      warnings: [
        ...resolved.warnings,
        ...hinged.warnings,
        ...(pairCovers ? [{ code: 'pair-door-covers-panel', path: 'r' }] : []),
      ],
      style,
      reveals,
    });
```

### index.js
Add `applyHinges` to the `faces.js` block and `setFaceHinge` to the `faceTree.js` block.

### Tests

**`faceLayouts.test.js`** (after test 52), verbatim:

```js
  const COVER = {
    ...RUN, id: 'run-5',
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    items: [
      { id: 'L', kind: 'panel', width: 0.75, doors: 'cover' },
      { id: 'a', kind: 'cabinet', width: 18 },
      { id: 'R', kind: 'panel', width: 0.75 },
    ],
  };
  const layoutOf = (run) => {
    const room = roomWith(run);
    return runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS).get('a');
  };

  it('53. a covered side panel pulls the door over it and sets the hinge the other way', () => {
    const a = layoutOf(COVER);
    expect(a.reveals.values.left).toBe(-0.6875);
    expect(a.reveals.sources.left).toBe('rule:covered-panel');
    expect(a.reveals.sources.right).toBe('style');
    expect(a.faces).toEqual([{
      path: 'r', type: 'door', x: 24.0625, z: 4.125, width: 18.625, height: 30.125,
      hinge: 'right', hingeRule: true,
    }]);
    expect(a.warnings).toEqual([]);
  });

  it('54. warns for a pair door or a hinge on the covered side', () => {
    const withFace = (face) => ({ ...COVER, items: [COVER.items[0], { ...COVER.items[1], face }, COVER.items[2]] });
    const pair = layoutOf(withFace({ type: 'pair_door', size: null }));
    expect(pair.reveals.sources.left).toBe('style');
    expect(pair.warnings).toContainEqual({ code: 'pair-door-covers-panel', path: 'r' });
    const hinged = layoutOf(withFace({ type: 'door', size: null, hinge: 'left' }));
    expect(hinged.faces).toEqual([{
      path: 'r', type: 'door', x: 24.0625, z: 4.125, width: 18.625, height: 30.125, hinge: 'left',
    }]);
    expect(hinged.warnings).toEqual([{ code: 'hinge-on-covered-side', path: 'r' }]);
  });
```

Working for 53: `a` is at x 24.75, 18 wide, z 4, 30.5 high; Euro base standard reveals top 1/4, bottom 1/8,
left/right 1/16. Left covered by 3/4 → 1/16 − 3/4 = −11/16. Right: R is a flush side panel, so it captures, but
captured-single needs both sides, so right stays 1/16 ('style'). Face: x 24.75 − 0.6875 = 24.0625; width
18 + 0.6875 − 0.0625 = 18.625; z 4.125; height 30.5 − 0.375 = 30.125. Hinge: R is a stop → right.

Existing tests 49–52 keep passing: their doors touch stops on both sides (or none), so no hinge is derived and
no key is added.

**`faces.test.js`** — a new `describe('applyHinges')` at the end of the file with this one test:

```js
  it('applies hinge sides and validates hinges', () => {
    const faces = [
      { path: 'r.0', type: 'door', x: 0, z: 0, width: 10, height: 30 },
      { path: 'r.1', type: 'door', x: 10.125, z: 0, width: 10, height: 30 },
    ];
    const stopped = applyHinges(faces, { left: true, right: false }, { left: 0, right: 0 });
    expect(stopped.faces[0]).toEqual({ ...faces[0], hinge: 'left', hingeRule: true });
    expect(stopped.faces[1]).toBe(faces[1]);
    const covered = applyHinges(faces, { left: false, right: false }, { left: 0, right: 0.75 });
    expect(covered.faces[0]).toBe(faces[0]);
    expect(covered.faces[1]).toEqual({ ...faces[1], hinge: 'left', hingeRule: true });
    expect(covered.warnings).toEqual([]);
    expect(isFaceNode({ type: 'door', size: null, hinge: 'left' })).toBe(true);
    expect(isFaceNode({ type: 'drawer_front', size: null, hinge: 'left' })).toBe(false);
    expect(isFaceNode({ type: 'door', size: null, hinge: 'up' })).toBe(false);
  });
```

(Add `applyHinges` to the file's `'../faces.js'` import; `isFaceNode` is already there.)

**`faceTree.test.js`** — a test at the end of `describe('faceTree')`:

```js
  it('sets and clears a door\'s hinge; a new type drops it', () => {
    const face = { direction: 'vertical', size: null, children: [
      { type: 'drawer_front', size: 6 }, { type: 'door', size: null },
    ] };
    const hinged = setFaceHinge(face, 'r.1', 'right');
    expect(hinged.children[1]).toEqual({ type: 'door', size: null, hinge: 'right' });
    expect(setFaceHinge(hinged, 'r.1', 'right')).toBe(hinged);
    expect(setFaceHinge(hinged, 'r.1', null).children[1]).toEqual({ type: 'door', size: null });
    expect(setFaceHinge(face, 'r.0', 'left')).toBe(face);
    expect(setFaceHinge(face, 'r.1', 'up')).toBe(face);
    expect(setFaceType(hinged, 'r.1', 'drawer_front').children[1]).toEqual({ type: 'drawer_front', size: null });
  });
```

(Add `setFaceHinge` to the file's faceTree import, and `setFaceType` if it isn't there.)

**Count:** 622 + 4 = **626**.

---

## §4 Step 184 — saves

**`persistence.js`** (612):
- `CELL_KIND_KEYS.panel` (31): `['id', 'kind', 'depth', 'align', 'doors']`.
- `isCellLeaf`: for a panel also require `leaf.doors === undefined || leaf.doors === 'cover' || leaf.doors === 'flush'`.
- Face hinges need nothing here: `isFaceNode` (step 183) validates them wherever a face is checked.

**`persistence.test.js`** — a describe at the end:

```js
describe('SPEC-34.2 panel doors and hinges', () => {
  function doorsDocument() {
    const document = currentDocument();
    document.rooms[0].walls[0].runs[0].grid = gridFromItems('a', [
      { id: 'side', kind: 'panel', width: 0.75, doors: 'cover' },
      { id: 'cab', kind: 'cabinet', width: null, face: { type: 'door', size: null, hinge: 'right' } },
    ]);
    return document;
  }

  it('saves panel doors and door hinges, and rejects bad ones', () => {
    expect(isElevationDocument(doorsDocument())).toBe(true);
    const rejects = (mutate) => {
      const document = doorsDocument();
      mutate(document.rooms[0].walls[0].runs[0].grid.cells.map((entry) => entry.node));
      expect(isElevationDocument(document)).toBe(false);
    };
    rejects(([side]) => { side.doors = 'x'; });
    rejects(([, cab]) => { cab.face = { type: 'drawer_front', size: null, hinge: 'right' }; });
    rejects(([, cab]) => { cab.face = { type: 'door', size: null, hinge: 'up' }; });
  });
});
```

**Count:** 626 + 1 = **627**.

---

## §5 Step 185 — store and UI

**`elevationSlice.js`** (1629):
- Add `setGridPanelDoors` to the `cellTree.js` import.
- After `addPanel` (1404–):
  ```js
    setPanelDoors(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, doors } = action.payload;
      const before = location.run.grid;
      const grid = setGridPanelDoors(before, cellId, doors ?? null);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
  ```
- Export `setPanelDoors,` after `addPanel,` (1613).

**`elevationSlice.test.js`** — import `setPanelDoors`; a test at the end of `describe('SPEC-34.1 panel reducers')`:

```js
  it('sets a panel\'s doors', () => {
    let state = elevationReducer(start(), setCellKind({ ...actionBase, cellId: 'a', kind: 'panel' }));
    state = elevationReducer(state, setPanelDoors({ ...actionBase, cellId: 'a', doors: 'cover' }));
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'panel', doors: 'cover' });
    expect(elevationReducer(state, setPanelDoors({ ...actionBase, cellId: 'a', doors: 'x' }))).toBe(state);
    state = elevationReducer(state, setPanelDoors({ ...actionBase, cellId: 'a', doors: 'flush' }));
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'panel' });
  });
```

**`CellKindSection.jsx`** (87): when the panel's type (`panelOrientation(piece)`) is `side` or `top`, a
**Doors** select under Panel type: `Flush — panel to door face` (value `flush`, selected when `item.doors` is
absent) / `Cover — doors lap over` (`cover`) → `setPanelDoors({ …, doors })`.

**`CellProperties.jsx`** (224): the Depth input's placeholder (129) becomes
`formatInchesInput(cellDepth(piece, item, run.depth, settings))` (import `cellDepth` from `'../../model/index.js'`).

**`FaceProperties.jsx`** (298):
- Import `setFaceHinge` with the other faceTree imports.
- In the selected-leaf area, when `selected?.type === 'door'`: a **Hinge** select with options
  `Auto` (value `''`; label `Auto (left)` / `Auto (right)` when the resolved face at this path has
  `hingeRule`, else `Auto`), `Left`, `Right`; value `selected.hinge ?? ''` →
  `commitIfChanged(setFaceHinge(face, facePath, value || null))`. The resolved face is
  `faceLayout?.faces.find((entry) => entry.path === facePath)`.
- The warnings line (293–296): one line per distinct code:
  - `face-too-small`: "Sections don't fit. Reduce a fixed size." (as now)
  - `pair-door-covers-panel`: "A pair door can't cover a side panel — it's hinged on both sides."
  - `hinge-on-covered-side`: "This door is hinged on the side that covers a panel."

**Count:** 627 + 1 = **628**.

---

## §6 Step 186 — plan view from cells

**`planPieces.js`** (174). Imports: `cellDepth, cellPieces, blindCellWidths, panelOrientation` from
`./cells.js`; `findLeaf` from `./cellTree.js`; `runItems` from `./grid.js`.

In `planRunPieces` (137–174), work from `const cells = cellPieces(run, layout);` and a leaf lookup
`const leafOf = (piece) => (piece.columnId ? findLeaf(run.grid, piece.id) : runItems(run).find((item) => item.id === piece.id));`

**The depth band of a piece** (from the wall, 0, outwards):

```js
  const band = (piece) => {
    const depth = cellDepth(piece, leafOf(piece), run.depth, settings);
    if (piece.align === 'back') return { back: 0, front: depth };
    const flushPanel = piece.kind === 'panel' && panelOrientation(piece) !== 'back'
      && piece.doors !== 'cover';
    const frontLine = flushPanel ? frontDepth(run, settings) : run.depth;
    return { back: frontLine - depth, front: frontLine };
  };
```

For an ordinary cabinet this is `{ back: 0, front: run.depth }`, exactly as now.

**Boxes** — one per `cabinet` or `shelves` piece in `cells.pieces`:
`{ key: piece.id, start, end, ...band(piece), ...(piece.kind === 'shelves' ? { dashed: true } : {}) }`.
`start`/`end` as now for a column blind (`blindBoxes`); for a blind cell use
`blindCellWidths(cells.pieces, layout.pieces, <that side's entries>)`: a left-blind cell starts at
`piece.x + piece.width − width`, a right-blind cell ends at `piece.x + width`.

**Faces** (`planFaces`, 70–108) loops over `cells.pieces`:
- fillers and end panels: unchanged;
- `panel` pieces with orientation `side` or `back`: `{ key: piece.id, kind: 'panel', start: piece.x,
  end: piece.x + piece.width, ...band(piece) }`; `top` panels: none;
- `void`, `shelves`: none;
- cabinets: the cabinet pieces of one column are handled together (a top-level cabinet is a column of one).
  Tag each resolved face with its piece (`faceLayouts.get(piece.id)?.faces`, or the one-face fallback, now
  with the piece's `z` and `height`), run `topFaces` over the column's tagged faces, and emit each kept face as
  `{ key: `${piece.id}:${face.path}${face.half ?? ''}`, kind: 'face', start, end, back: faceBack,
  front: faceBack + settings.doorThickness }` with `faceBack = band(piece).front + settings.bumperThickness`.
  For an ordinary cabinet that is 24.0625 / 24.875, as now.

`fillerReturns` keeps using `layout.pieces`. The `span` covers boxes, faces and returns as now.

**`PlanRunFootprint.jsx`** (268):
- `footprintOutlineSegments(frame, span, depth)` (30–61) becomes `(frame, span, back, front)`: the two long
  edges at `back` and `front`, the ends from `back` to `front`. Its caller (148–152) passes `box.back, box.front`.
- A `dashed` box: no fill (the fill `Line`, 140–147, skips it) and its outline uses
  `dash={[4 / scale, 3 / scale]}`.

### Tests — `planPieces.test.js`, a describe at the end (2); import `gridFromItems` from `'../grid.js'`

```js
describe('SPEC-34.2 plan from cells', () => {
  const planOf = (overrides) => {
    const input = fixture({
      x: 0, width: 30,
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      ...overrides,
    });
    return planRunPieces(input.room, input.wall, input.run, DEFAULT_SETTINGS, input.layout, input.faceLayouts);
  };

  it('draws a top-level side panel at the door face, or box depth when covered', () => {
    const items = (doors) => [
      { id: 'c1', kind: 'cabinet', width: 14.25 },
      { id: 'p', kind: 'panel', width: 0.75, ...(doors ? { doors } : {}) },
      { id: 'c2', kind: 'cabinet', width: 15 },
    ];
    const flush = planOf({ items: items() });
    expect(flush.boxes).toEqual([
      { key: 'c1', start: 0, end: 14.25, back: 0, front: 24 },
      { key: 'c2', start: 15, end: 30, back: 0, front: 24 },
    ]);
    expect(flush.faces.filter(({ kind }) => kind === 'panel')).toEqual([
      { key: 'p', kind: 'panel', start: 14.25, end: 15, back: 0, front: 24.875 },
    ]);
    expect(planOf({ items: items('cover') }).faces.filter(({ kind }) => kind === 'panel')).toEqual([
      { key: 'p', kind: 'panel', start: 14.25, end: 15, back: 0, front: 24 },
    ]);
  });

  it('draws a split column\'s cells, not one cabinet', () => {
    const stack = {
      id: 'g', cols: [{ id: 'g:c', size: null, sizeMode: 'auto' }],
      rows: [
        { id: 'g:r0', size: null, sizeMode: 'auto' },
        { id: 'g:r1', size: 10, sizeMode: 'manual' },
        { id: 'g:r2', size: 6, sizeMode: 'manual' },
      ],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'sh', kind: 'shelves', shelves: { count: 2, back: false } } },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'ov', kind: 'cabinet', depth: 21, align: 'back' } },
        { col: 0, row: 2, colSpan: 1, rowSpan: 1, node: { id: 'op', kind: 'void' } },
      ],
    };
    const plan = planOf({
      items: undefined,
      grid: gridFromItems('P', [{ id: 'g', kind: 'cabinet', width: null, grid: stack }]),
    });
    expect(plan.boxes).toEqual([
      { key: 'ov', start: 0, end: 30, back: 0, front: 21 },
      { key: 'sh', start: 0, end: 30, back: 0, front: 24, dashed: true },
    ]);
    const faces = plan.faces.filter(({ kind }) => kind === 'face');
    expect(faces).toHaveLength(2);
    expect(faces.every(({ key, back, front }) => (
      key.startsWith('ov:') && back === 21.0625 && front === 21.875
    ))).toBe(true);
  });
});
```

Working for the second test: the 30.5" base column, rows top to bottom: shelves 14.5 (z 20–34.5), oven box 10
(z 10–20), open 6 (z 4–10). Cells are ordered left edge then bottom edge: op, ov, sh. The void has no box; the
oven box is backs-in-line, 21 deep → 0–21; its default face (30" > 24") is a pair door → two faces at
21 + 1/16 = 21.0625 to 21.875.

**Count:** 628 + 2 = **630**.

**Done when (round):** `npm test` (630) and `npm run lint` clean; rooms without panels or split columns look
the same in elevation and plan.

## Open after this round

1. Top/bottom panels in plan, if they're wanted (a dashed outline?).
2. Carried: floating shelf thickness (1 1/2" assumed); reveal for a cabinet under a flush top panel (still the
   standard reveal).
