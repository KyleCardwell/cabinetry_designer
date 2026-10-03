# Elevation Lab — SPEC-36.3.1 (36.3 follow-ups: counter height, hanging chain, soffits, openings in plan, islands)

Steps 244–247, after 36.3. SPEC-36 through SPEC-36.3 still apply. Written against `1694913` (step 243). Baseline **729**.

The model code below was checked in a scratch copy of the repo (its numbers are the ones in the tests), but Vitest couldn't run there. If a new test is off by a small amount, check the arithmetic before changing the code.

| Step | What | Files | Tests after |
|---|---|---|---|
| **244** | Model: the vertical chain. A hanging base's bottom rail shows whole; a `middle` chain with the counter height; the open space at the top stops at a soffit. | `dimensions.js`, `counterHeight.test.js` (new) | 732 |
| **245** | Screen: the counter height row in the elevation, between the inner chain and the wall's height. | `dimensionLayout.js`, `dimensionLayout.test.js`, `DimensionRow.jsx`, `ElevationCanvas.jsx` | 733 |
| **246** | Model: an island that runs out past the room still counts; the plan wall row with doors and windows. | `clearances.js`, `wallFaceRow.js` (new), `clearances.test.js`, `wallFaceRow.test.js` (new) | 736 |
| **247** | Screen: doors and windows in the plan wall row. | `PlanWallShape.jsx`, `PlanCanvas.jsx` | 736 |

Next: **37** (T-fillers).

## §1 The rules (Kyle, 2026-09-30)

### Hanging base on the vertical chain (a bug from 36.3)

- The chain ended the toe kick at the **box** (4 3/4"), so the bottom rail showed as 3/4", the part below the box. The toe kick now ends where the run's first chain segment starts: the frame's bottom on a face frame run (4" on a hanging base), the box otherwise. The chain then reads toe kick 4 | rail 1 1/2 | opening | rail 1 1/2 | countertop, the same as a normal base.
- `stackChain` already did this.

### Counter height

- Every **base** run on the chain gets a second chain, `middle`: one dimension from the floor to the top of its top (the countertop, or a wood top, or its molding; the box top when it has none). A hanging base shows the same 36" as a normal one.
- It's drawn between the inner chain and the wall's height, on both the left and right chains. A column with no base (a tall, an upper only, an opening chain) has no middle chain, and its rows sit where they do today.
- In a joined stack it's the lowest run's counter height, when that run is a base.

### Soffit on the vertical chain

- The open space at the top of the inner chain stops at the **bottom of the lowest soffit over the column**, and a `soffit` segment runs from there to the ceiling. Cabinets are always dimensioned first: the split only happens above the last cabinet segment (the crown or the box top), and only when the soffit's bottom is above it.
- "Over the column" means the soffit overlaps one of the chain's runs. With no runs in the column, any soffit on that side of the wall.

### Doors and windows in plan

- The plan row that shows wing walls (between the wall and its length dimension, on the front) now also shows every door and window on the wall: from the face's end to the outside of the casing, outside casing to outside casing, on to the next one, and to the other end. With no casing it's the jamb. Wing walls and openings share the one row, in order.
- The row appears whenever there's a wing wall or an opening. As with wing walls today, the wall's length dimension moves out to make room.
- Back-face wing walls keep their own row. Openings go only in the front row (they're the same on both faces).

### Islands that run out past the room (a bug from 36.3)

- An island had to lie **wholly** inside another group's outline (the room, or an open U's bounding box). Stretching an island out through the mouth of a U broke that, and its dimensions vanished.
- Now a group is an island when its footprint **reaches inside** a larger group: some corner inside a closed room's outline, or its bounding box overlapping an open group's bounding box. "Larger" is by bounding-box area, so of two free-standing groups only the smaller is an island. Its edges out past the room have nothing across them and get no dimension, as before.

---

## §2 Step 244 — model: the vertical chain

### `src/elevation/model/dimensions.js` (589)

- Right before the `splitRun` import (20) add `import { soffitsOn } from './soffits.js';`.
- Right before `stackChain` (its doc comment, 472) add:

```js
/** Floor to the top of a base run's top: its counter height (SPEC-36.3.1). Nothing for another type. */
function counterHeight(wall, run, profile) {
  if (run?.cabinetTypeId !== CABINET_TYPE_IDS.BASE) return [];
  const top = runTop(wall, run, profile);
  return [{ start: 0, end: run.z + run.height + top.height, kind: 'counter-height' }];
}

/**
 * The lowest soffit over a vertical chain's column (SPEC-36.3.1): one over any of its runs, or with
 * no runs, any soffit on the wall.
 */
function columnSoffit(wall, runs) {
  const spans = runs.length > 0
    ? runs.map((run) => [run.x, run.x + run.width])
    : [[0, wallLength(wall)]];
  return soffitsOn(wall)
    .filter((soffit) => spans.some(([left, right]) => (
      Math.min(right, soffit.x + soffit.width) - Math.max(left, soffit.x) > SEGMENT_EPSILON
    )))
    .sort((a, b) => a.bottom - b.bottom)[0] ?? null;
}

/** Where the open space at the top of a chain stops: a soffit's bottom above `cursor`, or null. */
function soffitBreak(wall, runs, cursor) {
  const soffit = columnSoffit(wall, runs);
  if (!soffit) return null;
  return soffit.bottom > cursor - SEGMENT_EPSILON && soffit.bottom < wall.height - SEGMENT_EPSILON
    ? soffit.bottom
    : null;
}

```

- `stackChain`: replace its last lines, from `  append(wall.height, 'open');` (493) to the closing `}` of the function, with:

```js
  const soffit = soffitBreak(wall, runs, cursor);
  if (soffit !== null) append(soffit, 'open');
  append(wall.height, soffit !== null ? 'soffit' : 'open');
  const lowest = [...runs].sort((a, b) => a.z - b.z)[0];
  return {
    inner,
    middle: counterHeight(wall, lowest, profile),
    outer: wall.height > SEGMENT_EPSILON ? [{ start: 0, end: wall.height, kind: 'wall' }] : [],
  };
}
```

- `verticalChains`:
  - `const result = () => ({ inner, outer });` (518) becomes `const result = () => ({ inner, middle: counterHeight(wall, lowerRun, wallProfile), outer });`.
  - In `if (lowerRun) {`, the first three lines (527–529: the toe-kick `append`, `let drawn = false;` and the `for (const segment of runBoxSegments(…)) {` line) become:

```js
    const box = runBoxSegments(room, wall, lowerRun, settings, edge);
    // A hanging base's frame starts below its box (SPEC-36.3.1): the toe kick ends at the frame.
    append(0, Math.min(lowerRun.z, box[0]?.start ?? lowerRun.z), 'toe-kick');
    let drawn = false;
    for (const segment of box) {
```

  - The last `append(cursor, wall.height, 'open');` (564), just before `return result();`, becomes:

```js
  const soffit = soffitBreak(wall, [lowerRun, upperRun].filter(Boolean), cursor);
  if (soffit !== null) append(cursor, soffit, 'open');
  append(cursor, wall.height, soffit !== null ? 'soffit' : 'open');
```

`verticalOpeningChain` doesn't change and has no `middle`; the screen treats a missing one as empty. Every existing chain test stays green: none has a soffit or a hanging base, and none compares the whole returned object.

### New `src/elevation/model/__tests__/counterHeight.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { verticalChains } from '../dimensions.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const INSET = { cabinetStyleId: 14 };

const run = (id, cabinetTypeId, overrides = {}) => ({
  id, cabinetTypeId, x: 24, width: 48, z: 4, height: 30.5, depth: cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 12 : 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems(id, [{ id: `${id}a`, kind: 'cabinet', width: null }, { id: `${id}b`, kind: 'cabinet', width: null }]),
  ...overrides,
});

const SOFFIT = {
  id: 'SF', wallSide: 'front', x: 0, width: 144, bottom: 84, depth: 14, molding: 'none', anchors: { left: false, right: false },
};

/** SPEC-36.3.1: a 144" wall, 96" tall, with the given runs and soffits. */
function chains(style, runs, soffits = []) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs, openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits,
  };
  const room = syncRoom({
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  }, S);
  const resolved = resolveWall(room, room.walls[0]);
  const find = (type) => resolved.runs.find((entry) => entry.cabinetTypeId === type) ?? null;
  const result = verticalChains(room, resolved, {
    lowerRun: find(CABINET_TYPE_IDS.BASE) ?? find(CABINET_TYPE_IDS.TALL),
    upperRun: find(CABINET_TYPE_IDS.UPPER),
  }, S, 'left');
  const shown = (segments) => segments.map(({ start, end, kind }) => [kind, start, end]);
  return { inner: shown(result.inner), middle: shown(result.middle) };
}

describe('SPEC-36.3.1 counter height, hanging base chain, soffit', () => {
  it('shows a hanging base\'s bottom rail whole, and its counter height', () => {
    expect(chains(INSET, [run('b', CABINET_TYPE_IDS.BASE, { hanging: true })]).inner.slice(0, 3)).toEqual([
      ['toe-kick', 0, 4],
      ['frame', 4, 5.5],
      ['frame-opening', 5.5, 33],
    ]);
    expect(chains(INSET, [run('b', CABINET_TYPE_IDS.BASE, { hanging: true })]).middle)
      .toEqual([['counter-height', 0, 36]]);
    expect(chains(null, [run('b', CABINET_TYPE_IDS.BASE)]).middle).toEqual([['counter-height', 0, 36]]);
  });

  it('shows no counter height for a tall', () => {
    expect(chains(null, [run('t', CABINET_TYPE_IDS.TALL)]).middle).toEqual([]);
  });

  it('stops the open space at a soffit\'s bottom, over cabinets or none', () => {
    const base = run('b', CABINET_TYPE_IDS.BASE);
    expect(chains(null, [base], [SOFFIT]).inner.slice(-3)).toEqual([
      ['countertop', 34.5, 36],
      ['open', 36, 84],
      ['soffit', 84, 96],
    ]);
    expect(chains(null, [], [SOFFIT]).inner).toEqual([['open', 0, 84], ['soffit', 84, 96]]);
    // A soffit clear of the column's runs doesn't count.
    expect(chains(null, [base], [{ ...SOFFIT, x: 96, width: 48 }]).inner.at(-1)).toEqual(['open', 36, 96]);
  });
});
```

Working:
- Hanging (SPEC-36.3): the box is z 4.75, 29.75 tall; the frame region starts at 4, so the toe kick is 0–4 and the rail 4–5.5. The countertop is 1 1/2 on top of 34.5, so the counter height is 36, the same as a normal base (4 + 30.5 + 1.5).
- Soffit: the countertop ends at 36, the soffit's bottom is 84, the wall 96.

**Count:** 729 + 3 = **732**.

---

## §3 Step 245 — screen: the counter height row

### `src/elevation/canvas/dimensionLayout.js` (89)

Replace `dimensionRowOffsets` (5–11, with its doc comment) with:

```js
/**
 * The inner and outer row offsets for an elevation dimension pair. A vertical pair can have a middle
 * row between them (the counter height, SPEC-36.3.1); the outer row moves out for it.
 */
export function dimensionRowOffsets(orientation, innerLevels = 0, middle = false) {
  if (orientation === 'vertical') {
    const next = 24 + 26 + innerLevels * 16;
    return middle ? { inner: 24, middle: next, outer: next + 26 } : { inner: 24, outer: next };
  }
  return { inner: 20, outer: 20 + 22 + innerLevels * 14 };
}
```

### `src/elevation/canvas/__tests__/dimensionLayout.test.js`

Inside `describe('dimensionRowOffsets', …)`, after its test, add (1):

```js
  it('SPEC-36.3.1 puts a middle row between the vertical inner and outer rows', () => {
    expect(dimensionRowOffsets('vertical', 0, true)).toEqual({ inner: 24, middle: 50, outer: 76 });
    expect(dimensionRowOffsets('vertical', 2, true)).toEqual({ inner: 24, middle: 82, outer: 108 });
  });
```

### `src/elevation/components/DimensionRow.jsx` (349)

In `KIND_COLORS` (12–27), after `molding: '#cbd5e1',` add:

```js
  'counter-height': '#7dd3fc',
  soffit: '#94a3b8',
```

### `src/elevation/components/ElevationCanvas.jsx` (1842)

- `baseTransform` (413–427): `right: 48,` becomes `right: dimensionChains?.vertical.right.middle?.length > 0 ? 74 : 48,` and `left: 110,` becomes `left: dimensionChains?.vertical.left.middle?.length > 0 ? 136 : 110,`. Its dependency list adds `dimensionChains?.vertical.left.middle?.length,` and `dimensionChains?.vertical.right.middle?.length,` after `dimensionChains?.upper.inner.length,`.
- In `dimensionOffsets`, the `vertical` offsets (491–494) become:

```js
    const vertical = {
      left: dimensionRowOffsets(
        'vertical',
        verticalLevels.left,
        (dimensionChains.vertical.left.middle?.length ?? 0) > 0,
      ),
      right: dimensionRowOffsets(
        'vertical',
        verticalLevels.right,
        (dimensionChains.vertical.right.middle?.length ?? 0) > 0,
      ),
    };
```

  and in its returned `vertical` (505–512) each side gains a middle, between `inner` and `outer`:
  `middle: (vertical.left.middle ?? 0) + clear.left,` and `middle: (vertical.right.middle ?? 0) + clear.right,`.
- After the left inner `<DimensionRow segments={dimensionChains.vertical.left.inner} … />` (1721–1729) add:

```jsx
              <DimensionRow
                segments={dimensionChains.vertical.left.middle ?? []}
                orientation="vertical"
                side="left"
                offsetPx={dimensionOffsets.vertical.left.middle}
                transform={transform}
                edgeGapPx={dimensionOffsets.clear.left}
                cursor={cursor}
              />
```

- After the right inner `<DimensionRow segments={dimensionChains.vertical.right.inner} … />` (1739–1748) add:

```jsx
              <DimensionRow
                segments={dimensionChains.vertical.right.middle ?? []}
                orientation="vertical"
                side="right"
                offsetPx={dimensionOffsets.vertical.right.middle}
                transform={transform}
                edgeGapPx={dimensionOffsets.clear.right}
                wallLength={wall.length}
                cursor={cursor}
              />
```

- Last, delete the `  dissolveJoint,` line (93) from the store import. Nothing uses it, and `npm run lint` fails on it at `1694913`.

`DimensionRow` draws nothing for an empty list, and with no middle the offsets are the ones used today.

**Count:** 732 + 1 = **733**.

---

## §4 Step 246 — model: islands, the plan wall row

### `src/elevation/model/clearances.js` (336)

Replace `within` and `islandGroups` (300–329: from the doc comment that starts `/** Whether` above `within`, to the closing `}` of `islandGroups`) with:

```js
function boundsOf(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys),
  };
}

const boundsArea = (bounds) => (bounds.right - bounds.left) * (bounds.top - bounds.bottom);

/**
 * Whether a group's footprint `points` reaches inside the walls `ids` (SPEC-36.3.1): some point inside a
 * closed room's outline, or bounds overlapping an open group's bounding box. Part of it may lie outside.
 */
function reaches(room, parts, ids, points) {
  const cycle = wallComponents(room).find((component) => component.kind === 'cycle'
    && component.walls.every((entry) => ids.includes(entry.wallId)));
  if (cycle) {
    const byId = new Map(room.walls.map((wall) => [wall.id, wall]));
    const outline = cycle.walls.map((entry) => {
      const wall = byId.get(entry.wallId);
      return entry.from === 'start' ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };
    });
    return points.some((point) => insidePolygon(point, outline));
  }
  const outer = boundsOf(parts.filter((part) => ids.includes(part.wallId)).flatMap((part) => part.points));
  const own = boundsOf(points);
  return Math.min(own.right, outer.right) - Math.max(own.left, outer.left) > EPSILON
    && Math.min(own.top, outer.top) - Math.max(own.bottom, outer.bottom) > EPSILON;
}

/**
 * Island groups (SPEC-36.3, 36.3.1): walls joined only to each other (connections, or a wing wall's
 * landing) whose footprint, cabinets included, reaches inside a larger group's outline, even if it
 * runs out past it. Each is a list of wall ids.
 */
export function islandGroups(room, parts) {
  const groups = wallGroups(room);
  const footprint = (ids) => parts.filter((part) => ids.includes(part.wallId)).flatMap((part) => part.points);
  return groups.filter((ids) => {
    const points = footprint(ids);
    if (points.length === 0) return false;
    const size = boundsArea(boundsOf(points));
    return groups.some((other) => {
      if (other === ids) return false;
      const around = footprint(other);
      return around.length > 0 && boundsArea(boundsOf(around)) > size + EPSILON
        && reaches(room, parts, other, points);
    });
  });
}
```

`within` goes; nothing else uses it. `wallGroups`, `insidePolygon` and `planClearances` stay as they are.

### New `src/elevation/model/wallFaceRow.js`

```js
import { landingsOn } from './landings.js';
import { openingGeometry } from './openings.js';
import { wallSideFrame, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;

/**
 * The plan dimension row along one face of a wall (SPEC-36.3.1), between the wall and its length:
 * each wing wall landing on that face and, on the front, each door or window from outside casing to
 * outside casing (its jamb when it has no casing), with the spaces between them and the face's ends.
 * Returns segments { start, end, kind: 'space' | 'landing' | 'opening' } left to right along the face,
 * or [] when the face has nothing to dimension.
 */
export function wallFaceSegments(room, wall, side, settings) {
  const view = wallSideView(wall, side);
  const { length } = wallSideFrame(room, wall, side);
  const spans = landingsOn(room, view).map(({ a, b }) => ({ a, b, kind: 'landing' }));
  if (side === 'front') {
    for (const opening of wall.openings ?? []) {
      const geometry = openingGeometry(opening, length, settings);
      const outside = geometry.casing ?? geometry.jamb;
      spans.push({ a: outside.x, b: outside.x + outside.width, kind: 'opening' });
    }
  }
  if (spans.length === 0) return [];
  const segments = [];
  let cursor = 0;
  const push = (start, end, kind) => {
    if (end - start > EPSILON) segments.push({ start, end, kind });
  };
  for (const span of [...spans].sort((one, two) => one.a - two.a)) {
    const start = Math.max(cursor, Math.min(length, span.a));
    const end = Math.min(length, span.b);
    push(cursor, start, 'space');
    push(start, end, span.kind);
    cursor = Math.max(cursor, end);
  }
  push(cursor, length, 'space');
  return segments;
}
```

### Tests

**`src/elevation/model/__tests__/clearances.test.js`:** at the end of the file (1):

```js
describe('SPEC-36.3.1 an island that runs out past the room', () => {
  const openU = () => [
    wall('U1', 0, 0, 240, 0, { thickness: 4.5, connections: { start: null, end: link('U2', 'start') } }),
    wall('U2', 240, 0, 240, 180, { thickness: 4.5, connections: { start: link('U1', 'end'), end: link('U3', 'start') } }),
    wall('U3', 240, 180, 0, 180, { thickness: 4.5, connections: { start: link('U2', 'end'), end: null } }),
  ];
  const islandFrom = (x1, x2) => wall('I', x1, 96, x2, 96, {
    runs: [run('F', 'front', { width: x2 - x1 }), run('K', 'back', { width: x2 - x1 })],
    endPanels: { start: { width: null }, end: { width: null } },
  });

  it('still counts, and measures where something is across', () => {
    const room = build([...openU(), islandFrom(-60, 168)]);
    expect(islandGroups(room, clearanceParts(room, S))).toEqual([['I']]);
    expect(rows(planClearances(room, S))).toEqual([
      ['island', 84, 120.8125, 84, 180, 59.1875],
      ['island', 84, 71.1875, 84, 0, 71.1875],
      ['island', 168, 96, 240, 96, 72],
    ]);
    const clear = build([...openU(), islandFrom(400, 496)]);
    expect(islandGroups(clear, clearanceParts(clear, S))).toEqual([]);
  });
});
```

**New `src/elevation/model/__tests__/wallFaceRow.test.js`** (2):

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { landWallEnd } from '../landings.js';
import { wallFaceSegments } from '../wallFaceRow.js';

const S = DEFAULT_SETTINGS;

const makeWall = (id, x1, y1, x2, y2, extra = {}) => ({
  id, name: '', numberOverride: null, elevationForced: false, x1, y1, x2, y2, height: 108, thickness: 4.5,
  flipped: false, connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [],
  endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [], ...extra,
});

const makeRoom = (walls) => ({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: walls.map(({ id }) => id), walls,
});

/** A 36" door, 3" casing, its jamb 24" from the left: casing 21 to 63. */
const DOOR = {
  id: 'D', kind: 'door', label: 'D1', measureMode: 'jamb', width: 36, height: 80, sillZ: 0,
  offset: 24, offsetFrom: 'left', casing: { width: 3, thickness: 0.75 },
};
/** A 36" window, no casing, its jamb 12" from the right of a 246" wall: 198 to 234. */
const WINDOW = {
  id: 'W', kind: 'window', label: 'W1', measureMode: 'jamb', width: 36, height: 48, sillZ: 36,
  offset: 12, offsetFrom: 'right', casing: null,
};

const shown = (segments) => segments.map(({ start, end, kind }) => [kind, start, end]);
const host = (room) => room.walls.find(({ id }) => id === 'H');

describe('SPEC-36.3.1 the wall face row in plan', () => {
  it('dimensions each opening from outside casing to outside casing, or its jamb', () => {
    const room = makeRoom([makeWall('H', 0, 0, 246, 0, { openings: [DOOR, WINDOW] })]);
    expect(shown(wallFaceSegments(room, host(room), 'front', S))).toEqual([
      ['space', 0, 21],
      ['opening', 21, 63],
      ['space', 63, 198],
      ['opening', 198, 234],
      ['space', 234, 246],
    ]);
    expect(wallFaceSegments(room, host(room), 'back', S)).toEqual([]);
    const bare = makeRoom([makeWall('H', 0, 0, 246, 0)]);
    expect(wallFaceSegments(bare, host(bare), 'front', S)).toEqual([]);
  });

  it('puts the openings in one row with the wing walls on that face', () => {
    let room = makeRoom([
      makeWall('H', 0, 0, 246, 0, { openings: [DOOR] }),
      makeWall('W1', 120, 0, 120, 30, { thickness: 9 }),
    ]);
    room = landWallEnd(room, 'W1', 'start', { wallId: 'H', side: 'front', x: 120 });
    expect(shown(wallFaceSegments(room, host(room), 'front', S))).toEqual([
      ['space', 0, 21],
      ['opening', 21, 63],
      ['space', 63, 120],
      ['landing', 120, 129],
      ['space', 129, 246],
    ]);
  });
});
```

Working:
- The island runs from x −60 to 168 at y 96. The U's bounding box runs x 0 to 240, so the old rule (every corner inside) failed. Its front and back overlap the U's north and south faces from 0 to 168, so the dimensions sit at x 84; the depths are those of SPEC-36.3's island (59 3/16" to the north wall face, 71 3/16" to the south). The east end is 72" from U2. The west end has nothing across.
- The far wall (x 400 to 496) doesn't overlap the U's box, so it isn't an island.
- Door: jamb 24 to 60, casing 3 each side, 21 to 63. Window: 246 − 12 − 36 = 198 to 234, no casing. The wing wall is 9" thick, landing at 120: 120 to 129.

**Count:** 733 + 1 + 2 = **736**.

---

## §5 Step 247 — screen: doors and windows in the plan wall row

### `src/elevation/plan/PlanWallShape.jsx` (351)

- Imports: delete `import { landingsOn } from '../model/landings.js';` (5); line 8 becomes `import { wallSideFrame } from '../model/wallSides.js';`; after the `wallOutline` import (7) add `import { wallFaceSegments } from '../model/wallFaceRow.js';`.
- Props (12–20): add `settings,` after `cursor,`.
- Line 35, `const hasFrontLandings = landingsOn(room, wallSideView(wall, 'front')).length > 0;`, becomes:

```js
  // SPEC-36.3.1: wing walls and, on the front, doors and windows share one row inside the wall's length.
  const faceRows = {
    front: wallFaceSegments(room, wall, 'front', settings),
    back: wallFaceSegments(room, wall, 'back', settings),
  };
  const hasFrontLandings = faceRows.front.length > 0;
```

- In `landingRows` (77–91), replace the lines from `const sideView = wallSideView(wall, side);` to `segments.push({ start: cursor, end: sideFrame.length });` with:

```js
    const segments = faceRows[side];
    if (segments.length === 0) return [];
    const sideFrame = wallSideFrame(room, wall, side);
    const outward = side === 'front' ? exterior : frame.n;
    const offset = side === 'front' ? innerRowOffset : innerRowOffset + 20 / scale;
```

  Everything after it (`rowLayout`, the ticks, labels and drawing) stays: it already works from `segments`.

### `src/elevation/plan/PlanCanvas.jsx` (1252)

`<PlanWallShape … />` (1015–1024) gains `settings={settings}` after `cursor={cursor}`. Nothing else.

No new tests (components). **Count stays 736.**

**Done when (round):** `npm test` (736) and `npm run lint` clean.

## §6 Check by hand

See the end of PROMPTS-36.3.1.

## §7 Left for later

- **Counter height on talls and uppers.** Only base runs get it. A floor-to-top dimension for an upper or a tall would be another segment in the same middle row.
- **The soffit on an opening's chain.** A selected door or window's chain still runs to the ceiling.
- **Openings on the back face row.** Openings go only in the front row. Casing on one face only isn't modelled.
- **Islands by bounding-box area.** Of two free-standing groups whose boxes overlap, the smaller is the island. An island bigger than the open layout around it wouldn't count.
