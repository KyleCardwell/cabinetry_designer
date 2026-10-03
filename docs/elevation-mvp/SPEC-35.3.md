# Elevation Lab — SPEC-35.3 (extensions: fillers and panels past their run)

Steps 206–211, after 35.2. The plan is in `ALCOVE-PLAN.md`. SPEC-35, 35.1 and 35.2 still apply. Written against `f61f5bd` (step 205). Baseline **671**.

| Step | What | Files | Tests after |
|---|---|---|---|
| **206** | Shape: `extend` on run ends and panel/filler leaves, validated, saved, carried onto pieces; `setGridLeafExtend`. Inert. | `extensions.js` (new), `persistence.js`, `splitRun.js`, `cells.js`, `cellTree.js`, `index.js`, `extensions.test.js` (new), `persistence.test.js` | 674 |
| **207** | Model: `extendPieces` grows pieces and warns; warnings reach the run's diagnostics. | `extensions.js`, `room.js`, `index.js`, `extensions.test.js` | 676 |
| **208** | Model: a follower stops at its leader's extended end piece, and needs no end when it's covered. | `extensions.js`, `room.js`, `joints.js`, `index.js`, `extensions.test.js` | 677 |
| **209** | Store: `setRunEndExtend`, `setCellExtend`; `setRunEnd` keeps an extension. | `elevationSlice.js`, `elevationSlice.test.js` | 678 |
| **210** | On screen: pieces drawn extended; no chip line or end notes on a piece extended down. | `RunGroup.jsx`, `PieceProperties.jsx` | 678 |
| **211** | Panel: "Extend up/down/left/right" fields for end pieces, interior fillers and panels. | `ExtendFields.jsx` (new), `EndFields.jsx`, `PieceProperties.jsx`, `CellKindSection.jsx` | 678 |

## §1 The rule (Kyle, 2026-09-26)

Any filler or panel can extend **along its long direction, past its run's edge**:

| Piece | Directions |
|---|---|
| Run end panel, end filler, blind end filler | up, down |
| Interior filler | up, down |
| Side panel cell (thin in width) | up, down |
| Top/bottom panel cell (thin in height) | left, right |
| Back panel cell, cabinet, void, shelves | none |

| Target | `extend[direction]` | Reaches |
|---|---|---|
| Floor (down) | `{ to: 'floor' }` | z = 0 |
| Ceiling (up) | `{ to: 'ceiling' }` | the lowest soffit bottom over the piece, else the wall height |
| Wall end (left/right) | `{ to: 'wall' }` | x = 0 / the wall length |
| Another run | `{ to: 'run', runId }` | that run's box bottom (down), box top (up), left edge (left), right edge (right). Same wall side, not itself. |
| A distance | `{ to: 'by', amount }` | the piece's own edge ± amount (> 0) |

- **Only from the run's edge.** A piece extends down only if its bottom is at the run's box bottom or below (end pieces drop below it); up only if its top is at the run's box top; left/right only if it's at the run's left/right edge. Otherwise: warning `extend-blocked`.
- **An extension never shrinks a piece.** If the target doesn't reach past the piece's edge: warning `extend-short`. A missing target run: warning `extend-target-missing`.
- **Extending down replaces the drop** (the drop is applied first; the extension then takes the bottom further). A piece extended down gets no chip line and no end notes.
- **Followers stop at extensions.** A run whose side follows another run's edge **from the inside** (its left side follows the leader's left edge, or right follows right) stops at the inside face of the leader's end piece on that edge when that piece is extended and reaches the follower's height (`verticalStart` to box top). Only a **fixed-width** end piece counts: an end panel (`width ?? endPanelThickness`), or a filler or blind end with a typed width. A flex filler's width isn't known until layout, so it doesn't move the follower (logged for 35.4).
- **Covered followers need no end.** When the follow offset is 0 and the extended piece covers the follower's whole box height, the follower's automatic end becomes `none`.

**Worked example (the alcove on one wall), used in the tests:** a 60" wall, soffit bottom 84. Panel run **P** (upper): x 0, width 60, z 36, height 48, end panels at both ends. Base **B**: z 4, height 30.5, its left side follows P's left edge and its right side follows P's right edge. With P's left end panel extended to the floor, it runs z 0–84, and B's left edge moves to 0.75 with no end of its own.

---

## §2 Step 206 — shape

### New file `src/elevation/model/extensions.js`

```js
import { panelOrientation } from './cells.js';

/** Where a filler or panel can extend to, per direction (SPEC-35.3). */
export const EXTEND_TARGETS = {
  up: ['ceiling', 'run', 'by'],
  down: ['floor', 'run', 'by'],
  left: ['wall', 'run', 'by'],
  right: ['wall', 'run', 'by'],
};

/** Directions in the order they are applied. */
export const EXTEND_DIRECTIONS = ['up', 'down', 'left', 'right'];

const TARGET_KEYS = {
  floor: ['to'],
  ceiling: ['to'],
  wall: ['to'],
  run: ['to', 'runId'],
  by: ['to', 'amount'],
};

/** Whether a value is a valid extension target for one direction. */
export function isExtendTarget(direction, target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return false;
  if (!EXTEND_TARGETS[direction]?.includes(target.to)) return false;
  if (Object.keys(target).some((key) => !TARGET_KEYS[target.to].includes(key))) return false;
  if (target.to === 'run') return typeof target.runId === 'string';
  if (target.to === 'by') {
    return typeof target.amount === 'number' && Number.isFinite(target.amount) && target.amount > 0;
  }
  return true;
}

/** Whether a stored `extend` is valid: undefined, or one or more valid directions. */
export function isExtend(extend) {
  if (extend === undefined) return true;
  if (!extend || typeof extend !== 'object' || Array.isArray(extend)) return false;
  const entries = Object.entries(extend);
  return entries.length > 0
    && entries.every(([direction, target]) => isExtendTarget(direction, target));
}

/** The directions a piece can extend: along its length. */
export function extendDirections(piece) {
  if (piece?.kind === 'end_panel' || piece?.kind === 'filler') return ['up', 'down'];
  const orientation = panelOrientation(piece);
  if (orientation === 'side') return ['up', 'down'];
  if (orientation === 'top') return ['left', 'right'];
  return [];
}
```

### `src/elevation/store/persistence.js` (640)

- Add `import { isExtend } from '../model/extensions.js';` after the `grid.js` import (9).
- `CELL_KIND_KEYS.panel` (32) becomes `['id', 'kind', 'depth', 'align', 'doors', 'extend']`.
- `isEnd` (104–109): add `&& isExtend(end.extend)` as the last condition.
- `isCellLeaf` (268–279): add `&& (leaf.kind !== 'panel' || isExtend(leaf.extend))` before the shelves line.
- `isRootItem` (292–293), the filler line becomes:

```js
  if (item.kind === 'filler') {
    return isItem(item) && item.depth === undefined && item.align === undefined && isExtend(item.extend);
  }
```

### `src/elevation/model/splitRun.js` (559)

- `itemExtras` (17–24): add `...(item.extend !== undefined ? { extend: item.extend } : {}),` as the last line of the object.
- `addEnd`, the piece object (227–236): add `...(end.extend ? { extend: end.extend } : {}),` after `auto: isFlexEnd(end),`.

### `src/elevation/model/cells.js` (288)

- `resolveGrid`, the leaf push (96): add `...(cell.node.extend ? { extend: cell.node.extend } : {}),` after the `shelves` line.

### `src/elevation/model/cellTree.js` (441)

- Add `import { EXTEND_DIRECTIONS, isExtendTarget } from './extensions.js';` after the `grid.js` import (1–2).
- Append:

```js
/** Sets one direction of a panel's or filler's extension, or clears it (target null). SPEC-35.3. */
export function setGridLeafExtend(grid, leafId, direction, target) {
  const found = locate(grid, leafId);
  if (!found || isNestedGrid(found.cell.node)) return grid;
  const leaf = found.cell.node;
  if (leaf.kind !== 'panel' && leaf.kind !== 'filler') return grid;
  if (!EXTEND_DIRECTIONS.includes(direction)) return grid;
  if (target !== null && !isExtendTarget(direction, target)) return grid;
  if (target === null && !leaf.extend?.[direction]) return grid;
  const extend = { ...leaf.extend };
  if (target === null) delete extend[direction];
  else extend[direction] = { ...target };
  const next = { ...leaf };
  if (Object.keys(extend).length > 0) next.extend = extend;
  else delete next.extend;
  return replaceLeaf(grid, found, next);
}
```

(`locate`, `isNestedGrid` and `replaceLeaf` are already in scope in cellTree.js. `replaceLeaf` works for a top-level filler too; its column id stays `${id}:col`.)

### `src/elevation/model/index.js`

- The cellTree block (310–332) adds `setGridLeafExtend`.
- At the end, a new block:

```js
export {
  EXTEND_DIRECTIONS,
  EXTEND_TARGETS,
  extendDirections,
  isExtend,
  isExtendTarget,
} from './extensions.js';
```

### Tests

**New `src/elevation/model/__tests__/extensions.test.js`** (2):

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { findLeaf, setGridCellKind, setGridLeafExtend, splitGridCell } from '../cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { extendDirections, isExtend } from '../extensions.js';
import { gridFromItems } from '../grid.js';
import { splitRun } from '../splitRun.js';

const S = DEFAULT_SETTINGS;
const FLOOR = { down: { to: 'floor' } };
const CEILING = { up: { to: 'ceiling' } };
const ids = () => { let n = 0; return () => `n${++n}`; };

describe('SPEC-35.3 extension shape', () => {
  it('validates extensions and says which way a piece can extend', () => {
    expect(isExtend(undefined)).toBe(true);
    expect(isExtend(FLOOR)).toBe(true);
    expect(isExtend({ up: { to: 'ceiling' }, down: { to: 'run', runId: 'b' } })).toBe(true);
    expect(isExtend({ left: { to: 'by', amount: 3 } })).toBe(true);
    expect(isExtend({})).toBe(false);
    expect(isExtend({ down: { to: 'ceiling' } })).toBe(false);
    expect(isExtend({ down: { to: 'by', amount: 0 } })).toBe(false);
    expect(isExtend({ down: { to: 'run' } })).toBe(false);
    expect(isExtend({ down: { to: 'floor', amount: 2 } })).toBe(false);
    expect(isExtend({ sideways: { to: 'floor' } })).toBe(false);

    expect(extendDirections({ kind: 'end_panel' })).toEqual(['up', 'down']);
    expect(extendDirections({ kind: 'filler' })).toEqual(['up', 'down']);
    expect(extendDirections({ kind: 'panel', width: 0.75, height: 30, depth: 24 })).toEqual(['up', 'down']);
    expect(extendDirections({ kind: 'panel', width: 30, height: 0.75, depth: 24 })).toEqual(['left', 'right']);
    expect(extendDirections({ kind: 'panel', width: 30, height: 30, depth: 0.75 })).toEqual([]);
    expect(extendDirections({ kind: 'cabinet', width: 30, height: 30, depth: 24 })).toEqual([]);
  });

  it('carries extensions onto pieces and sets them on panels and fillers only', () => {
    const run = {
      id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 48, z: 4, height: 30.5, depth: 24,
      ends: { left: { type: 'end_panel', width: null, extend: FLOOR }, right: { type: 'none', width: null } },
      autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
      anchors: { left: false, right: false },
      grid: gridFromItems('r', [
        { id: 'f', kind: 'filler', width: 3, extend: CEILING },
        { id: 'c', kind: 'cabinet', width: null },
      ]),
    };
    expect(splitRun(run, S).pieces.map(({ id, extend }) => [id, extend])).toEqual([
      ['r:left', FLOOR], ['f', CEILING], ['c', undefined],
    ]);

    let grid = setGridCellKind(splitGridCell(run.grid, 'c', 'down', 2, ids()), 'c', 'panel');
    grid = setGridLeafExtend(grid, 'c', 'up', { to: 'by', amount: 6 });
    expect(findLeaf(grid, 'c')).toEqual({ id: 'c', kind: 'panel', extend: { up: { to: 'by', amount: 6 } } });
    const split = { ...run, grid };
    const piece = cellPieces(split, splitRun(split, S)).pieces.find(({ id }) => id === 'c');
    expect(piece.extend).toEqual({ up: { to: 'by', amount: 6 } });

    const cleared = setGridLeafExtend(run.grid, 'f', 'up', null);
    expect(findLeaf(cleared, 'f')).toEqual({ id: 'f', kind: 'filler' });
    expect(setGridLeafExtend(run.grid, 'f', 'down', { to: 'ceiling' })).toBe(run.grid);
    expect(setGridLeafExtend(run.grid, 'f', 'down', null)).toBe(run.grid);
    expect(setGridLeafExtend(run.grid, 'c', 'up', CEILING.up)).toBe(run.grid);
  });
});
```

Working: the 48" run is end panel 0.75, filler 3, cabinet 44.25. Splitting `c` down keeps `c` as the top cell (SPEC-33), and it becomes a panel. Clearing `f`'s only direction removes `extend` entirely. A bad target, clearing a direction that isn't set, and a cabinet are all no-ops.

**`src/elevation/store/__tests__/persistence.test.js`**, a describe at the end (1):

```js
describe('SPEC-35.3 extensions shape', () => {
  const withRun = (changes) => {
    const document = currentDocument();
    Object.assign(document.rooms[0].walls[0].runs[0], changes);
    return document;
  };
  const endWith = (extend) => ({
    left: { type: 'end_panel', width: null, extend },
    right: { type: 'filler', width: null },
  });
  const gridWith = (item) => gridFromItems('a', [item, { id: 'a-cab', kind: 'cabinet', width: null }]);

  it('saves extensions on ends, panels and fillers, and rejects bad ones', () => {
    expect(isElevationDocument(withRun({ ends: endWith({ down: { to: 'floor' } }) }))).toBe(true);
    expect(isElevationDocument(withRun({ ends: endWith({ down: { to: 'ceiling' } }) }))).toBe(false);
    expect(isElevationDocument(withRun({ ends: endWith({}) }))).toBe(false);
    expect(isElevationDocument(withRun({
      grid: gridWith({ id: 'p', kind: 'panel', width: 0.75, extend: { up: { to: 'ceiling' } } }),
    }))).toBe(true);
    expect(isElevationDocument(withRun({
      grid: gridWith({ id: 'f', kind: 'filler', width: 3, extend: { down: { to: 'by', amount: 4 } } }),
    }))).toBe(true);
    expect(isElevationDocument(withRun({
      grid: gridWith({ id: 'f', kind: 'filler', width: 3, extend: { down: { to: 'by', amount: -4 } } }),
    }))).toBe(false);
    expect(isElevationDocument(withRun({
      grid: gridWith({
        id: 's', kind: 'shelves', width: 30, shelves: { count: 2, back: false }, extend: { up: { to: 'ceiling' } },
      }),
    }))).toBe(false);
  });
});
```

**Count:** 671 + 3 = **674**.

---

## §3 Step 207 — growing pieces

### `src/elevation/model/extensions.js`

- The imports become:

```js
import { panelOrientation } from './cells.js';
import { wallLength } from './geometry.js';
import { soffitsOn } from './soffits.js';
import { wallSideOf } from './wallSides.js';
```

- After the `TARGET_KEYS` constant: `const EPSILON = 1e-6;`
- Append:

```js
/** The lowest soffit bottom over a piece on its run's side of the wall, else the wall height. */
function ceilingOver(wall, run, piece) {
  const right = piece.x + piece.width;
  const bottoms = soffitsOn(wall, wallSideOf(run))
    .filter((soffit) => Math.min(right, soffit.x + soffit.width) - Math.max(piece.x, soffit.x) > EPSILON)
    .map((soffit) => soffit.bottom);
  return bottoms.length > 0 ? Math.min(...bottoms) : wall.height;
}

/**
 * Where an extension reaches: a z for up/down, an x for left/right. Null when its target run is gone.
 */
export function extensionEdge(wall, run, piece, direction, target) {
  if (target.to === 'by') {
    if (direction === 'down') return piece.z - target.amount;
    if (direction === 'up') return piece.z + piece.height + target.amount;
    if (direction === 'left') return piece.x - target.amount;
    return piece.x + piece.width + target.amount;
  }
  if (target.to === 'floor') return 0;
  if (target.to === 'ceiling') return ceilingOver(wall, run, piece);
  if (target.to === 'wall') return direction === 'left' ? 0 : wallLength(wall);
  const other = (wall.runs ?? []).find((candidate) => candidate.id === target.runId
    && candidate.id !== run.id
    && wallSideOf(candidate) === wallSideOf(run));
  if (!other) return null;
  if (direction === 'down') return other.z;
  if (direction === 'up') return other.z + other.height;
  if (direction === 'left') return other.x;
  return other.x + other.width;
}

function onRunEdge(run, piece, direction) {
  if (direction === 'down') return piece.z <= run.z + EPSILON;
  if (direction === 'up') return piece.z + piece.height >= run.z + run.height - EPSILON;
  if (direction === 'left') return piece.x <= run.x + EPSILON;
  return piece.x + piece.width >= run.x + run.width - EPSILON;
}

/** The piece grown to an edge, or null when the edge isn't past the piece. */
function grow(piece, direction, edge) {
  if (direction === 'down') {
    return edge < piece.z - EPSILON
      ? { ...piece, z: edge, height: piece.z + piece.height - edge }
      : null;
  }
  if (direction === 'up') {
    return edge > piece.z + piece.height + EPSILON ? { ...piece, height: edge - piece.z } : null;
  }
  if (direction === 'left') {
    return edge < piece.x - EPSILON
      ? { ...piece, x: edge, width: piece.x + piece.width - edge }
      : null;
  }
  return edge > piece.x + piece.width + EPSILON ? { ...piece, width: edge - piece.x } : null;
}

const WARNINGS = {
  'extend-blocked': (direction) => `Can't extend ${direction} from here: only along the piece, from the run's edge.`,
  'extend-target-missing': () => 'The run this piece extends to is gone.',
  'extend-short': (direction) => `Extending ${direction} doesn't reach past this piece.`,
};

function extendWarning(code, piece, direction) {
  return { code, pieceId: piece.id, direction, message: WARNINGS[code](direction) };
}

/**
 * Grow every piece that has an `extend` past its run's edge (SPEC-35.3). A piece grows only along
 * its length, only from the run's edge, and never shrinks. A grown piece lists its directions in
 * `extended`; every other piece is returned as is.
 */
export function extendPieces(wall, run, pieces) {
  const warnings = [];
  const next = pieces.map((piece) => {
    if (!piece.extend) return piece;
    const allowed = extendDirections(piece);
    const extended = [];
    let current = piece;
    for (const direction of EXTEND_DIRECTIONS) {
      const target = piece.extend[direction];
      if (!target) continue;
      if (!allowed.includes(direction) || !onRunEdge(run, piece, direction)) {
        warnings.push(extendWarning('extend-blocked', piece, direction));
        continue;
      }
      const edge = extensionEdge(wall, run, current, direction, target);
      if (edge === null) {
        warnings.push(extendWarning('extend-target-missing', piece, direction));
        continue;
      }
      const grown = grow(current, direction, edge);
      if (!grown) {
        warnings.push(extendWarning('extend-short', piece, direction));
        continue;
      }
      current = grown;
      extended.push(direction);
    }
    return extended.length > 0 ? { ...current, extended } : piece;
  });
  return { pieces: next, warnings };
}
```

### `src/elevation/model/room.js` (1656)

- Add `import { extendPieces } from './extensions.js';` after the `corners.js` import (4–11).
- `roomDiagnostics`, right after `...cellPieces(run, layout).warnings,` (728):

```js
          ...extendPieces(wall, run, cellPieces(run, layout).pieces).warnings,
```

(`wall` there is the side view from the `for` loop; its `runs` are synced.)

### `src/elevation/model/index.js`

The extensions block adds `extendPieces`, `extensionEdge`.

### Tests: `extensions.test.js`, add `extendPieces` to the extensions import and a describe at the end (2)

```js
describe('SPEC-35.3 extending pieces', () => {
  const { BASE, UPPER } = CABINET_TYPE_IDS;
  const P = { id: 'P', cabinetTypeId: UPPER, x: 0, width: 60, z: 36, height: 48 };
  const B = { id: 'B', cabinetTypeId: BASE, x: 0.75, width: 58.5, z: 4, height: 30.5 };
  const WALL = {
    id: 'A', x1: 0, y1: 0, x2: 60, y2: 0, height: 96, openings: [],
    soffits: [{ id: 's', x: 0, width: 60, bottom: 84 }],
    runs: [P, B],
  };

  it('grows to the floor, a run, the ceiling, the wall end or by a distance', () => {
    const panels = [
      { id: 'P:left', kind: 'end_panel', x: 0, z: 36, width: 0.75, height: 48, extend: FLOOR },
      { id: 'P:right', kind: 'end_panel', x: 59.25, z: 36, width: 0.75, height: 48,
        extend: { down: { to: 'run', runId: 'B' } } },
      { id: 'back', kind: 'panel', x: 0.75, z: 36, width: 58.5, height: 48, depth: 0.75 },
    ];
    const above = extendPieces(WALL, P, panels);
    expect(above.warnings).toEqual([]);
    expect(above.pieces[0]).toMatchObject({ z: 0, height: 84, extended: ['down'] });
    expect(above.pieces[1]).toMatchObject({ z: 4, height: 80, extended: ['down'] });
    expect(above.pieces[2]).toBe(panels[2]);

    const below = extendPieces(WALL, B, [
      { id: 'f', kind: 'filler', x: 30, z: 4, width: 3, height: 30.5, extend: CEILING },
      { id: 'g', kind: 'filler', x: 10, z: 4, width: 3, height: 30.5, extend: { down: { to: 'by', amount: 4 } } },
    ]);
    expect(below.pieces[0]).toMatchObject({ z: 4, height: 80, extended: ['up'] });
    expect(below.pieces[1]).toMatchObject({ z: 0, height: 34.5, extended: ['down'] });

    const T = { id: 'T', cabinetTypeId: UPPER, x: 12, width: 36, z: 36, height: 24.75 };
    const [top] = extendPieces(WALL, T, [{
      id: 't', kind: 'panel', x: 12, z: 60, width: 36, height: 0.75, depth: 24,
      extend: { left: { to: 'wall' }, right: { to: 'by', amount: 6 } },
    }]).pieces;
    expect(top).toMatchObject({ x: 0, width: 54, extended: ['left', 'right'] });
  });

  it('warns and leaves the piece when it can\'t extend', () => {
    const { pieces, warnings } = extendPieces(WALL, P, [
      { id: 'mid', kind: 'panel', x: 20, z: 50, width: 0.75, height: 10, depth: 24, extend: FLOOR },
      { id: 'side', kind: 'panel', x: 0.75, z: 36, width: 0.75, height: 48, depth: 24,
        extend: { left: { to: 'wall' } } },
      { id: 'gone', kind: 'end_panel', x: 0, z: 36, width: 0.75, height: 48,
        extend: { down: { to: 'run', runId: 'X' } } },
      { id: 'short', kind: 'end_panel', x: 59.25, z: 36, width: 0.75, height: 48, extend: CEILING },
    ]);
    expect(warnings.map(({ code, pieceId, direction }) => [code, pieceId, direction])).toEqual([
      ['extend-blocked', 'mid', 'down'],
      ['extend-blocked', 'side', 'left'],
      ['extend-target-missing', 'gone', 'down'],
      ['extend-short', 'short', 'up'],
    ]);
    expect(pieces.some((piece) => piece.extended)).toBe(false);
  });
});
```

Working:
- P's left end panel runs from the floor to P's top: z 0, height 84. Its right end panel stops at B's box bottom: z 4, height 36 + 48 − 4 = 80. The back panel has no `extend` and comes back unchanged.
- B's filler grows up to the soffit at 84: height 84 − 4 = 80. The `by` filler grows down 4 to z 0: height 34.5.
- The top panel (T's top edge is 36 + 24.75 = 60.75) grows left to the wall end (x 0, width 48), then right by 6: width 54.
- Warnings, in order:
  - `mid` sits 14" above P's bottom, so it can't extend down.
  - `side` is a side panel, so it can't extend left.
  - Run X doesn't exist.
  - `short`'s top is already at the soffit (84).

**Count:** 674 + 2 = **676**.

---

## §4 Step 208 — followers stop at extensions

### `src/elevation/model/extensions.js`

- The imports add `import { DEFAULT_SETTINGS } from './constants.js';` (after cells.js) and `import { verticalStart } from './overlap.js';` (after geometry.js).
- Append:

```js
/** A run's end piece on one side, extended; null when that end has no extension or no fixed width. */
export function extendedEndPiece(wall, run, side, settings = DEFAULT_SETTINGS) {
  const end = run.ends?.[side];
  if (!end?.extend) return null;
  let width = null;
  if (end.type === 'end_panel') width = end.width ?? settings.endPanelThickness;
  else if (end.type === 'filler' || end.type === 'blind') width = end.width;
  if (!(width > 0)) return null;
  const piece = {
    id: `${run.id}:${side}`,
    kind: end.type === 'end_panel' ? 'end_panel' : 'filler',
    x: side === 'left' ? run.x : run.x + run.width - width,
    z: run.z,
    width,
    height: run.height,
    extend: end.extend,
  };
  const [extended] = extendPieces(wall, run, [piece]).pieces;
  return extended.extended ? extended : null;
}

/**
 * How far a follower's edge moves in (+ for a left side, − for a right side) to clear its leader's
 * extended end piece: only when it follows that edge from the inside and the piece reaches it.
 */
export function followInset(wall, leader, anchorSide, follower, side, settings = DEFAULT_SETTINGS) {
  if (side !== anchorSide) return 0;
  const piece = extendedEndPiece(wall, leader, anchorSide, settings);
  if (!piece) return 0;
  const overlap = Math.min(piece.z + piece.height, follower.z + follower.height)
    - Math.max(piece.z, verticalStart(follower));
  if (overlap <= EPSILON) return 0;
  return side === 'left' ? piece.width : -piece.width;
}

/** Whether a leader's extended end piece covers a follower's whole box height from the inside. */
export function extensionCoversEnd(wall, leader, anchorSide, follower, side) {
  if (side !== anchorSide) return false;
  const piece = extendedEndPiece(wall, leader, anchorSide);
  return Boolean(piece)
    && piece.z <= follower.z + EPSILON
    && piece.z + piece.height >= follower.z + follower.height - EPSILON;
}
```

### `src/elevation/model/room.js`

- The extensions import becomes `import { extendPieces, followInset } from './extensions.js';`.
- `resolveRunAnchorDatum`, the follow branch (269–274) becomes:

```js
  if (isFollowAnchor(anchor)) {
    const leader = wall.runs.find((candidate) => candidate.id === anchor.runId);
    if (!leader) return { error: { code: 'anchor-run-missing', side } };
    const edge = anchor.side === 'left' ? leader.x : leader.x + leader.width;
    const inset = followInset(wall, leader, anchor.side, run, side, settings);
    return {
      x: jointEdgeX({ x: edge }, side, anchor.offset) + inset,
      type: 'follow',
      runId: anchor.runId,
    };
  }
```

### `src/elevation/model/joints.js` (267)

- Add `import { extensionCoversEnd } from './extensions.js';` after the constants import (1).
- `endIsCovered` (101–127): right after the `const edge = runEdgeX(run, side);` line:

```js
  if (isFollowAnchor(anchor) && (anchor.offset ?? 0) === 0) {
    const leader = (wall.runs ?? []).find((candidate) => candidate.id === anchor.runId);
    if (leader && extensionCoversEnd(wall, leader, anchor.side, run, side)) return true;
  }
```

### `src/elevation/model/index.js`

The extensions block adds `extendedEndPiece`, `extensionCoversEnd`, `followInset`.

### Tests: `extensions.test.js`

Imports add `extendedEndPiece`, `followInset` (extensions), `import { jointEndTypes } from '../joints.js';` and `import { resolveRunAnchorDatum } from '../room.js';`. A describe at the end (1):

```js
describe('SPEC-35.3 followers stop at extensions', () => {
  const { BASE, UPPER } = CABINET_TYPE_IDS;
  const follow = (runId, side, offset = 0) => ({ to: 'follow', runId, side, offset });
  const AUTO = { type: 'none', width: null, auto: true };
  const P = {
    id: 'P', cabinetTypeId: UPPER, x: 0, width: 60, z: 36, height: 48, depth: 26,
    ends: {
      left: { type: 'end_panel', width: null, extend: FLOOR },
      right: { type: 'end_panel', width: null },
    },
    anchors: { left: false, right: false },
  };
  const B = {
    id: 'B', cabinetTypeId: BASE, x: 0, width: 60, z: 4, height: 30.5, depth: 24,
    ends: { left: { ...AUTO }, right: { ...AUTO } },
    anchors: { left: follow('P', 'left'), right: follow('P', 'right') },
  };
  const wallWith = (runs) => ({
    id: 'A', x1: 0, y1: 0, x2: 60, y2: 0, height: 96, openings: [],
    soffits: [{ id: 's', x: 0, width: 60, bottom: 84 }], runs,
  });

  it('moves a follower inside an extended end piece and drops its end when covered', () => {
    const wall = wallWith([P, B]);
    const room = { walls: [wall] };
    expect(extendedEndPiece(wall, P, 'left', S)).toMatchObject({ x: 0, width: 0.75, z: 0, height: 84 });
    expect(extendedEndPiece(wall, P, 'right', S)).toBeNull();
    expect(followInset(wall, P, 'left', B, 'left', S)).toBe(0.75);
    expect(followInset(wall, P, 'left', B, 'right', S)).toBe(0);
    expect(resolveRunAnchorDatum(room, wall, B, 'left', S)).toEqual({ x: 0.75, type: 'follow', runId: 'P' });
    expect(resolveRunAnchorDatum(room, wall, B, 'right', S)).toEqual({ x: 60, type: 'follow', runId: 'P' });
    expect(jointEndTypes(wall).get('B')).toEqual({ left: 'none', right: 'end_panel' });

    const gap = { ...B, anchors: { left: follow('P', 'left', 1), right: follow('P', 'right') } };
    const gapWall = wallWith([P, gap]);
    expect(resolveRunAnchorDatum({ walls: [gapWall] }, gapWall, gap, 'left', S).x).toBe(1.75);
    expect(jointEndTypes(gapWall).get('B').left).toBe('end_panel');

    const partP = { ...P, ends: { ...P.ends, right: { type: 'end_panel', width: null, extend: { down: { to: 'by', amount: 10 } } } } };
    const partWall = wallWith([partP, B]);
    expect(resolveRunAnchorDatum({ walls: [partWall] }, partWall, B, 'right', S).x).toBe(59.25);
    expect(jointEndTypes(partWall).get('B').right).toBe('end_panel');
  });
});
```

Working:
- P's left end panel extends to the floor: x 0, width 0.75, z 0, height 84. It overlaps B (floor to 34.5), so B's left edge moves in 0.75. It also covers B's box (4 to 34.5), so B's left end is `none`.
- P's right end panel isn't extended, so B's right edge stays at 60. Nothing covers it there, so the end is `end_panel` (the existing rule).
- With a 1" follow offset, the edge is 0 + 1 + 0.75 = 1.75, and the gap needs an end panel.
- Extended down only by 10 (to z 26), P's right panel still reaches B's height, so B's right edge moves to 59.25. It doesn't cover B's box from 4, so B keeps an end panel.

**Count:** 676 + 1 = **677**.

---

## §5 Step 209 — store

### `src/elevation/store/elevationSlice.js` (1692)

- Imports: the cellTree import block (17–31) adds `setGridLeafExtend`. Add `import { isExtendTarget } from '../model/extensions.js';` after the `corners.js` import (5).
- `setRunEnd` (931–945): the line `location.run.ends[side] = { type: end.type, width: end.width };` becomes:

```js
      const kept = end.type !== 'none' ? location.run.ends[side]?.extend : undefined;
      location.run.ends[side] = { type: end.type, width: end.width, ...(kept ? { extend: kept } : {}) };
```

- Right after `setPanelDoors` (1455–1464), two reducers:

```js
    setRunEndExtend(state, action) {
      const location = runLocation(state, action.payload);
      const { side, direction, target = null } = action.payload;
      if (!location || (side !== 'left' && side !== 'right')) return;
      const end = location.run.ends[side];
      if (end.type === 'none' || (direction !== 'up' && direction !== 'down')) return;
      if (target !== null && !isExtendTarget(direction, target)) return;
      if (target === null && !end.extend?.[direction]) return;
      const extend = { ...end.extend };
      if (target === null) delete extend[direction];
      else extend[direction] = { ...target };
      if (Object.keys(extend).length > 0) end.extend = extend;
      else delete end.extend;
      syncRoomAt(state, location.roomIndex);
    },
    setCellExtend(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { cellId, direction, target = null } = action.payload;
      const before = location.run.grid;
      const grid = setGridLeafExtend(before, cellId, direction, target);
      if (grid === before) return;
      location.run.grid = grid;
      syncRoomAt(state, location.roomIndex);
    },
```

- The actions export list (1637–1690) adds `setRunEndExtend` after `setRunEnd`, and `setCellExtend` after `setPanelDoors`.

### Tests: `src/elevation/store/__tests__/elevationSlice.test.js` (2328)

Add `setCellExtend`, `setRunEndExtend` to the `../elevationSlice.js` import (11–94). A describe at the end (1):

```js
describe('SPEC-35.3 extension reducers', () => {
  const actionBase = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
  const FLOOR = { to: 'floor' };
  const leafOf = (state, id) => gridLeaves(currentRun(state).grid).find((leaf) => leaf.id === id);

  it('sets and clears extensions on ends, fillers and panels', () => {
    let state = stateWithRun(run({
      autoCount: false,
      items: [{ id: 'f', kind: 'filler', width: 3 }, fixed('a', 30), auto('b')],
    }));
    state = elevationReducer(state, setRunEndExtend({ ...actionBase, side: 'left', direction: 'down', target: FLOOR }));
    expect(currentRun(state).ends.left).toEqual({ type: 'filler', width: null, extend: { down: FLOOR } });
    state = elevationReducer(state, setRunEnd({ ...actionBase, side: 'left', end: { type: 'end_panel', width: null } }));
    expect(currentRun(state).ends.left).toEqual({ type: 'end_panel', width: null, extend: { down: FLOOR } });
    expect(elevationReducer(state, setRunEndExtend({ ...actionBase, side: 'left', direction: 'left', target: { to: 'wall' } }))).toBe(state);
    expect(elevationReducer(state, setRunEndExtend({ ...actionBase, side: 'left', direction: 'down', target: { to: 'ceiling' } }))).toBe(state);
    state = elevationReducer(state, setRunEndExtend({ ...actionBase, side: 'left', direction: 'down', target: null }));
    expect(currentRun(state).ends.left).toEqual({ type: 'end_panel', width: null });

    state = elevationReducer(state, setRunEndExtend({ ...actionBase, side: 'right', direction: 'up', target: { to: 'ceiling' } }));
    state = elevationReducer(state, setRunEnd({ ...actionBase, side: 'right', end: { type: 'none', width: null } }));
    expect(currentRun(state).ends.right).toEqual({ type: 'none', width: null });
    expect(elevationReducer(state, setRunEndExtend({ ...actionBase, side: 'right', direction: 'up', target: { to: 'ceiling' } }))).toBe(state);

    state = elevationReducer(state, setCellExtend({ ...actionBase, cellId: 'f', direction: 'down', target: { to: 'by', amount: 4 } }));
    expect(leafOf(state, 'f')).toEqual({ id: 'f', kind: 'filler', extend: { down: { to: 'by', amount: 4 } } });
    expect(elevationReducer(state, setCellExtend({ ...actionBase, cellId: 'a', direction: 'down', target: FLOOR }))).toBe(state);
    state = elevationReducer(state, setCellKind({ ...actionBase, cellId: 'a', kind: 'panel' }));
    state = elevationReducer(state, setCellExtend({ ...actionBase, cellId: 'a', direction: 'up', target: { to: 'ceiling' } }));
    expect(leafOf(state, 'a')).toEqual({ id: 'a', kind: 'panel', extend: { up: { to: 'ceiling' } } });
  });
});
```

`run()`'s ends are flex fillers, so the first `setRunEndExtend` keeps `{ type: 'filler', width: null }`. Changing the end to an end panel keeps the extension. Clearing its only direction removes `extend`. Changing an end to `none` drops it, and a `none` end can't take one. A cabinet can't take one.

**Count:** 677 + 1 = **678**.

---

## §6 Step 210 — on screen

### `src/elevation/components/RunGroup.jsx` (578)

- Add `import { extendPieces } from '../model/extensions.js';` after the `dimensions.js` import (21).
- `drawnPieces` (134–142) becomes:

```js
  const drawnPieces = useMemo(() => extendPieces(wall, run, cells.pieces.map((piece) => {
    const dropped = drop > 0
      && (piece.kind === 'filler' || piece.kind === 'end_panel')
      ? { ...piece, z: piece.z - drop, height: piece.height + drop }
      : piece;
    return panelPieceIds.has(piece.id)
      ? { ...dropped, kind: 'end_panel' }
      : dropped;
  })).pieces, [cells, drop, panelPieceIds, run, wall]);
```

- `chipLines` (179–187): its `.filter(…)` becomes:

```js
      .filter((piece) => (piece.kind === 'filler' || piece.kind === 'end_panel')
        && !piece.extended?.includes('down'))
```

Nothing else. The part below still stops inside end panels, and selection and hit areas already use `drawnPieces`.

### `src/elevation/components/properties/PieceProperties.jsx` (137)

- `endNotes` (76–78): the condition becomes
  `(piece.kind === 'filler' || piece.kind === 'end_panel') && !piece.extend?.down`.

No new tests (components). **Count stays 678.**

---

## §7 Step 211 — panel fields

### New file `src/elevation/components/properties/ExtendFields.jsx`

```jsx
import { EXTEND_TARGETS, runShortLabel } from '../../model/index.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const DIRECTION_LABELS = {
  up: 'Extend up',
  down: 'Extend down',
  left: 'Extend left',
  right: 'Extend right',
};
const TARGET_LABELS = {
  floor: 'To the floor',
  ceiling: 'To the ceiling / soffit',
  wall: 'To the wall end',
};
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

function optionValue(target) {
  if (!target) return '';
  return target.to === 'run' ? `run:${target.runId}` : target.to;
}

/**
 * One "Extend …" select per direction: no, a fixed target, another run on this wall, or a distance.
 * `onChange(direction, target | null)`.
 */
export default function ExtendFields({ directions, extend, runs = [], label, onChange }) {
  return directions.map((direction) => {
    const target = extend?.[direction] ?? null;
    const fixed = EXTEND_TARGETS[direction].filter((to) => to !== 'run' && to !== 'by');
    return (
      <div key={direction}>
        <Field label={DIRECTION_LABELS[direction]}>
          <select
            value={optionValue(target)}
            onChange={(event) => {
              const { value } = event.target;
              if (value === '') onChange(direction, null);
              else if (value.startsWith('run:')) onChange(direction, { to: 'run', runId: value.slice(4) });
              else if (value === 'by') onChange(direction, { to: 'by', amount: target?.to === 'by' ? target.amount : 1 });
              else onChange(direction, { to: value });
            }}
            aria-label={`${label} extend ${direction}`}
            className={SELECT_CLASS}
          >
            <option value="">No</option>
            {fixed.map((to) => (
              <option key={to} value={to}>{TARGET_LABELS[to]}</option>
            ))}
            {runs.map((other) => (
              <option key={other.id} value={`run:${other.id}`}>{`To ${runShortLabel(other)}`}</option>
            ))}
            <option value="by">By a distance</option>
          </select>
        </Field>
        {target?.to === 'by' && (
          <Field label="Distance">
            <InchInput
              value={target.amount}
              onCommit={(amount) => {
                if (!(amount > 0)) return false;
                onChange(direction, { to: 'by', amount });
                return true;
              }}
              aria-label={`${label} extend ${direction} distance`}
            />
          </Field>
        )}
      </div>
    );
  });
}
```

### `src/elevation/components/properties/EndFields.jsx` (115)

- Imports: `setRunEndExtend` from the slice; `import ExtendFields from './ExtendFields.jsx';`.
- Props gain `extendRuns = []`.
- Right after the width field (the `endType !== 'none' && (<Field …>)` block):

```jsx
      {endType !== 'none' && (
        <ExtendFields
          directions={['up', 'down']}
          extend={run.ends[side].extend}
          runs={extendRuns}
          label={`${side} end`}
          onChange={(direction, target) => dispatch(setRunEndExtend({
            ...actionBase, side, direction, target,
          }))}
        />
      )}
```

`RunEndsSection` doesn't pass `extendRuns`, so it shows floor, ceiling and distance only. That's fine; the piece panel offers the runs.

### `src/elevation/components/properties/PieceProperties.jsx`

- Imports: `wallSideOf` from `'../../model/index.js'`; `setCellExtend` from the slice; `import ExtendFields from './ExtendFields.jsx';`.
- In `PieceProperties`, after `notesLine`:

```js
  const extendRuns = wall.runs.filter((other) => other.id !== run.id && wallSideOf(other) === wallSideOf(run));
```

- `EndProperties` takes `extendRuns` and passes it to `<EndFields … extendRuns={extendRuns} />`. The `side` branch passes `extendRuns={extendRuns}` to `<EndProperties>`.
- `InteriorFillerProperties` takes `extendRuns`. Inside its section, after the Width field:

```jsx
        <ExtendFields
          directions={['up', 'down']}
          extend={item.extend}
          runs={extendRuns}
          label="Interior filler"
          onChange={(direction, target) => dispatch(setCellExtend({
            wallId, runId: run.id, cellId: item.id, direction, target,
          }))}
        />
```

  The filler branch passes `extendRuns={extendRuns}`.

### `src/elevation/components/properties/CellKindSection.jsx` (108)

- Imports: `extendDirections`, `wallSideOf` from `'../../model/index.js'`; `setCellExtend` from the slice; `import ExtendFields from './ExtendFields.jsx';`.
- After the Doors field (the `item.kind === 'panel' && (orientation === 'side' || orientation === 'top')` block):

```jsx
      {item.kind === 'panel' && extendDirections(piece).length > 0 && (
        <ExtendFields
          directions={extendDirections(piece)}
          extend={item.extend}
          runs={wall.runs.filter((other) => other.id !== run.id && wallSideOf(other) === wallSideOf(run))}
          label="Panel"
          onChange={(direction, target) => dispatch(setCellExtend({
            ...actionBase, direction, target,
          }))}
        />
      )}
```

No new tests (components). **Count stays 678.**

**Done when (round):** `npm test` (678) and `npm run lint` clean.

## §8 Left for 35.4 (not in this round)

- A run that overlaps another run's extended piece gets no collision warning yet.
- Flipping a run doesn't swap left/right extensions on its cells.
- Neighbouring walls' profiles and plan view don't show extended pieces.
- An automatic end (`auto: true`, set by joints, follows and wall end panels) is rebuilt by `syncRoom` without its `extend`. Set extensions on ends you chose yourself.
- A flex filler end doesn't move a follower (its width isn't known before layout).
- Changing a panel from side to top keeps its up/down extension, which then warns `extend-blocked`.
