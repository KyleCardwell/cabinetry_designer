# Elevation Lab — SPEC-38.1 (fixes: recesses, the Add menu, soffit returns, pin dimensions)

Steps 280–283, after 38. Written against `29255be` (step 279). Baseline **833**.

The code below wasn't run before this was written (Codex implements it). The wing wall numbers in §2 (which side each wing wall face lands on) were read off today's `spanCorner` / `cornerAt` for the fixture room. If a test fails, check its expected value against §1 before changing the code, and say so in the summary.

| Step | What | Tests after |
|---|---|---|
| **280** | Model: pin callouts for any pin anchor; soffit returns on side walls and wing walls; a deep raised recess keeps its bump-out in plan | 835 |
| **281** | Elevation: edge pin callouts; soffit returns drawn; the wall row selects recesses and openings; the selected recess outlined over the runs | 835 |
| **282** | Toolbar: Soffit, Recess, Door and Window move behind an **Add** menu | 835 |
| **283** | Plan: a wall's dimension rows move out past a recess's bump-out | 835 |

Round 38.2 (was 38.1) is the recessed cabinets and panel cutouts round; CELLS-PLAN, ALCOVE-PLAN, CONSOLIDATION-PLAN and DECISIONS are renumbered to match.

## §1 What's wrong, and the rules (Kyle, 2026-10-02)

### 1. A recess full of cabinets can't be selected

The recess is drawn under the runs, so once cabinets fill it there's nothing to click. **Its segment in the wall row below the elevation selects it.** So does a door or window's segment (front face only, as clicking the opening itself). While a recess is selected its outline is drawn again **over** the runs, in the selection blue, so you can see what you've got.

### 2. The toolbar is crowded

Soffit, Recess, Door and Window go behind one **Add ▾** button (plan: Door and Window). Select and Draw run (plan: Select and Draw wall) stay on their own. The button reads "Add: Soffit" while one of its tools is active; the soffit molding toggle still shows next to it while Soffit is active. Door and Window stay disabled on a back face, with the same title.

### 3. Plan: dimensions covered by a recess bump-out; raised deep recesses

- **A wall's plan rows move out past its bump-outs.** A recess at least as deep as the wall bumps the wall out on the other face, which is where that face's row (and, for the front, the overall length) is drawn. Each face's row moves out by the deepest such recess on it: front row offset = thickness + deepest front bump + 22 px; back row = thickness + deepest back bump + 42 px (today's 22 + 20).
- **A deep recess keeps its filled-in walls whether or not it reaches the floor.** Raised, it now draws the whole bump-out filled (the wall is solid behind it at the floor) with the notch dashed on top. Shallow raised recesses are unchanged (dashed outline only).

### 4. Soffits on side walls

A soffit that dies into a corner or a wing wall shows on that wall's elevation as a **return**, the way corner-anchored cabinets do: a hatched box at the corner, as wide as the soffit's depth (÷ sin of the corner angle), from the soffit's bottom to the ceiling, labeled with the soffit's wall. **A soffit counts when its end is anchored into the corner**, as runs are:

- a connected inside corner: the neighbour's soffit anchored `{ to: 'end' }` on that corner's side;
- a wing wall landing on this wall: the wing wall's soffit anchored `{ to: 'end' }` at its landed end (drawn beside the wing wall's thickness);
- the wing wall's own elevation: the host's soffit anchored `{ to: 'wall' }` to this wing wall.

### 5. Pin callouts for every anchor

Today only a center pin gets a callout (℄ and the distance). **A pin on the left or right edge gets one too**, from the same datum to that edge, labeled with the distance alone. `centerlineMarkers` now returns markers for every pinned item, each with its `anchor`.

---

## §2 Step 280 — Model

**Files:** `src/elevation/model/dimensions.js` (≈ 740), `src/elevation/model/__tests__/dimensions.test.js` (≈ 800), `src/elevation/model/soffits.js` (≈ 220), NEW `src/elevation/model/__tests__/soffitReturns.test.js`, `src/elevation/model/recesses.js` (≈ 320), `src/elevation/model/__tests__/recesses.test.js`, `src/elevation/model/index.js`.

### `dimensions.js` — `centerlineMarkers` (≈ 437–459)

```js
/**
 * A pinned cabinet's position callout (SPEC-12, SPEC-38.1): from the pin's datum (a wall end or an opening
 * edge) to the point the pin holds, its left edge, center or right edge.
 */
export function centerlineMarkers(run, pieces, wall, wallLengthValue, settings) {
  return pieces.flatMap((piece) => {
    if (piece.role !== 'item') return [];
    const item = runItems(run).find((candidate) => candidate.id === piece.id);
    if (!item?.pin) return [];
    const target = resolvePinTarget(item.pin, wall, wallLengthValue, settings);
    if (!Number.isFinite(target)) return [];
    const datumX = item.pin.from === 'right'
      ? target + item.pin.value
      : target - item.pin.value;
    const { anchor } = item.pin;
    const x = anchor === 'left'
      ? piece.x
      : anchor === 'right' ? piece.x + piece.width : piece.x + piece.width / 2;
    return [{
      pieceId: piece.id,
      x,
      datumX,
      z: CENTERLINE_CALLOUT_Z,
      value: Math.abs(x - datumX),
      pieceBottom: piece.z,
      pieceTop: piece.z + piece.height,
      from: item.pin.from,
      anchor,
    }];
  });
}
```

### `dimensions.test.js` — the `centerlineMarkers` block (≈ 531–611)

Tests SPEC-12 9 and 10: add `anchor: 'center',` after `from: …` in each expected marker. Test SPEC-12 11 is replaced (same count):

```js
  it('SPEC-38.1 measures an edge pin to that edge; nothing without a pin', () => {
    const edgePins = {
      items: [
        { id: 'left', pin: { from: 'right', value: 96, anchor: 'right' } },
        { id: 'mid', pin: { from: 'left', value: 24, anchor: 'left' } },
      ],
    };

    expect(centerlineMarkers(
      edgePins,
      pieces,
      { openings: [] },
      120,
      DEFAULT_SETTINGS,
    )).toEqual([
      {
        pieceId: 'left', x: 24, datumX: 120, z: 40, value: 96, pieceBottom: 4, pieceTop: 34.5,
        from: 'right', anchor: 'right',
      },
      {
        pieceId: 'mid', x: 24, datumX: 0, z: 40, value: 24, pieceBottom: 4, pieceTop: 34.5,
        from: 'left', anchor: 'left',
      },
    ]);
    expect(centerlineMarkers(
      { items: [] },
      pieces,
      { openings: [] },
      120,
      DEFAULT_SETTINGS,
    )).toEqual([]);
  });
```

(`left` is the piece 0–24: its right edge 24 is 96" from the right end of a 120" wall.)

### `soffits.js` — `soffitReturns`

Import `import { cornerAt, spanCorner } from './corners.js';` (no cycle: `corners.js` doesn't import soffits). Add after `soffitSeams`:

```js
function anchoredIntoCorner(anchor, corner) {
  return corner.anchorWallId
    ? anchor?.to === 'wall' && anchor.wallId === corner.anchorWallId
    : anchor?.to === 'end';
}

/**
 * Soffits on another wall that die into this face's corners or wing walls (SPEC-38.1), as returns for its
 * elevation, like corner-anchored cabinets: { key, wallId, soffitId, x, width, bottom, top }. A soffit counts
 * when its end is anchored into the corner: to its wall end at a connected inside corner or at a wing wall's
 * landed end, or, seen from the wing wall, to the wing wall from the host it lands on.
 */
export function soffitReturns(room, view) {
  const length = wallLength(view);
  const returns = [];
  const add = (key, neighbor, soffit, x, width) => returns.push({
    key,
    wallId: neighbor.id,
    soffitId: soffit.id,
    x,
    width,
    bottom: soffit.bottom,
    top: view.height,
  });

  for (const side of ['left', 'right']) {
    const corner = cornerAt(room, view, side);
    if (corner.type !== 'inside') continue;
    const neighbor = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
    const sine = Math.sin(corner.angle * Math.PI / 180);
    if (!neighbor || Math.abs(sine) < SPAN_EPSILON) continue;
    for (const soffit of soffitsOn(neighbor, corner.neighborWallSide)) {
      if (!anchoredIntoCorner(soffit.anchors?.[corner.neighborSide], corner)) continue;
      const width = Math.min(length, soffit.depth / sine);
      add(`${side}:${neighbor.id}:${soffit.id}`, neighbor, soffit, side === 'left' ? 0 : length - width, width);
    }
  }

  for (const { wallId, a, b } of landingsOn(room, view)) {
    const landed = room.walls.find((candidate) => candidate.id === wallId);
    if (!landed) continue;
    for (const side of ['left', 'right']) {
      const corner = spanCorner(room, view, {
        wallSide: view.side,
        anchors: { [side]: { to: 'wall', wallId } },
      }, side);
      const sine = Math.sin(corner.angle * Math.PI / 180);
      if (corner.type !== 'inside' || Math.abs(sine) < SPAN_EPSILON) continue;
      for (const soffit of soffitsOn(landed, corner.neighborWallSide)) {
        if (soffit.anchors?.[corner.neighborSide]?.to !== 'end') continue;
        const width = soffit.depth / sine;
        add(`landing:${wallId}:${side}:${soffit.id}`, landed, soffit, side === 'left' ? b : a - width, width);
      }
    }
  }
  return returns;
}
```

Add `soffitReturns,` to the `./soffits.js` export block in `model/index.js`.

### NEW `src/elevation/model/__tests__/soffitReturns.test.js`

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { landWallEnd } from '../landings.js';
import { soffitReturns } from '../soffits.js';
import { wallSideView } from '../wallSides.js';

const S = DEFAULT_SETTINGS;
const makeWall = (id, x1, y1, x2, y2, extra = {}) => ({
  id, name: '', numberOverride: null, elevationForced: false, x1, y1, x2, y2, height: 108, thickness: 4.5,
  flipped: false, connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [],
  endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [], ...extra,
});
const makeRoom = (walls) => ({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: walls.map(({ id }) => id), walls,
});
const END = { to: 'end', offset: 0 };
const soffit = (id, anchors, extra = {}) => ({
  id, wallSide: 'front', x: 0, width: 30, bottom: 84, depth: 14, molding: 'crown', anchors, ...extra,
});

describe('SPEC-38.1 soffit returns', () => {
  it('shows a soffit anchored into a connected inside corner on the other wall', () => {
    // A (0,0)→(120,0), B (120,0)→(120,96): A's right corner is inside, B's left side.
    const room = makeRoom([
      makeWall('A', 0, 0, 120, 0, {
        height: 96,
        connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
        soffits: [soffit('SA', { left: false, right: END }, { x: 60, width: 60, bottom: 80, depth: 12 })],
      }),
      makeWall('B', 120, 0, 120, 96, {
        height: 96,
        connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
        soffits: [
          soffit('SB', { left: END, right: false }),
          soffit('SX', { left: false, right: false }, { x: 40 }),
        ],
      }),
    ]);
    expect(soffitReturns(room, room.walls[0])).toEqual([
      { key: 'right:B:SB', wallId: 'B', soffitId: 'SB', x: 106, width: 14, bottom: 84, top: 96 },
    ]);
    expect(soffitReturns(room, room.walls[1])).toEqual([
      { key: 'left:A:SA', wallId: 'A', soffitId: 'SA', x: 0, width: 12, bottom: 80, top: 96 },
    ]);
  });

  it('shows soffits between a host and its wing wall on each other\'s elevation', () => {
    // W1 lands on H's front at 120 (its 9" thickness covers 120–129). W1's front faces H's 0–120 part,
    // its back faces 129–240; its start (at H) is the left end of its front and the right end of its back.
    let room = makeRoom([
      makeWall('H', 0, 0, 240, 0, {
        soffits: [soffit('SH', { left: false, right: { to: 'wall', wallId: 'W1', offset: 0 } }, {
          x: 60, width: 60, bottom: 90, depth: 12,
        })],
      }),
      makeWall('W1', 120, 0, 120, 30, {
        thickness: 9,
        soffits: [
          soffit('SW', { left: END, right: false }),
          soffit('SWB', { left: false, right: END }, { wallSide: 'back' }),
        ],
      }),
    ]);
    room = landWallEnd(room, 'W1', 'start', { wallId: 'H', side: 'front', x: 120 });
    const host = room.walls.find(({ id }) => id === 'H');
    const wing = room.walls.find(({ id }) => id === 'W1');
    expect(soffitReturns(room, wallSideView(host, 'front'))).toEqual([
      { key: 'landing:W1:left:SWB', wallId: 'W1', soffitId: 'SWB', x: 129, width: 14, bottom: 84, top: 108 },
      { key: 'landing:W1:right:SW', wallId: 'W1', soffitId: 'SW', x: 106, width: 14, bottom: 84, top: 108 },
    ]);
    expect(soffitReturns(room, wallSideView(wing, 'front'))).toEqual([
      { key: 'left:H:SH', wallId: 'H', soffitId: 'SH', x: 0, width: 12, bottom: 90, top: 108 },
    ]);
  });
});
```

### `recesses.js` — `recessPlanShape`

A deep recess keeps its bump-out filled whether or not it reaches the floor: `fill: deep && !dashed ? … : null` becomes `fill: deep ? … : null` (≈ 263). Its JSDoc's `fill` line: "wall added: a deep recess's bump-out (raised or not), or a projection on the floor".

### `recesses.test.js`

In the plan-shape test (≈ 154), after the `M` expectation, add:

```js
    expect(recessPlanShape({ ...R, bottom: 48, height: 26 }, 240, 108, 4.5)).toEqual({
      dashed: true,
      knockout: null,
      fill: [[55.5, -4.5], [112.5, -4.5], [112.5, -28.5], [55.5, -28.5]],
      lines: [
        [[60, 0], [60, -24]], [[60, -24], [108, -24]], [[108, -24], [108, 0]],
        [[55.5, -4.5], [55.5, -28.5]], [[55.5, -28.5], [112.5, -28.5]], [[112.5, -28.5], [112.5, -4.5]],
      ],
      label: [84, -12],
    });
```

**Count:** 833 + 2 = **835**.

---

## §3 Step 281 — Elevation

**Files:** `src/elevation/components/RunGroup.jsx` (626), `src/elevation/components/NeighborReturns.jsx` (≈ 140), `src/elevation/components/DimensionRow.jsx` (352), `src/elevation/components/RecessShapes.jsx` (≈ 50), `src/elevation/components/ElevationCanvas.jsx` (≈ 1910).

### `RunGroup.jsx` — the pin callout text (≈ 599)

`text={`℄ ${formatInches(marker.value)}`}` becomes
`text={marker.anchor === 'center' ? `℄ ${formatInches(marker.value)}` : formatInches(marker.value)}`.
The dashed line through the piece and the leader already use `marker.x`, so they move to the edge on their own. Rename nothing.

### `NeighborReturns.jsx` — soffit returns

Change the soffits import to `import { soffitReturns, soffitSeams } from '../model/soffits.js';`. Right before `return returns.map(…)`:

```js
  // SPEC-38.1: soffits on other walls that die into this one, drawn like cabinet returns.
  for (const entry of soffitReturns(room, wall)) {
    const neighbor = room.walls.find((candidate) => candidate.id === entry.wallId);
    returns.push({
      key: `soffit:${entry.key}`,
      kind: 'return',
      label: neighbor ? `${wallLabel(room, neighbor)} soffit` : 'Soffit',
      rect: wallRectToScreen({
        x: entry.x,
        z: entry.bottom,
        width: entry.width,
        height: entry.top - entry.bottom,
      }, transform),
    });
  }
```

### `DimensionRow.jsx` — clickable recess and opening segments

1. New prop `onFeatureClick` (after `onPieceClick` in the props list).
2. `clickable` (≈ 187):

```js
        const feature = segment.kind === 'recess' || segment.kind === 'opening';
        const clickable = (segment.kind === 'run' && Boolean(onSegmentClick))
          || (segment.kind === 'piece' && Boolean(onPieceClick))
          || (feature && Boolean(onFeatureClick));
```

3. The click handler (≈ 198–208): `if (segment.kind === 'piece') { … } else if (feature) { onFeatureClick(segment); } else { onSegmentClick(segment); }`.

### `RecessShapes.jsx` — the selected outline over the runs

Append a named export:

```jsx
/** The selected recess's outline, drawn over the runs (SPEC-38.1) so it shows when cabinets fill it. */
export function RecessOutline({ wall, transform, recessId }) {
  const recess = recessesOn(wall).find((candidate) => candidate.id === recessId);
  if (!recess) return null;
  const geometry = recessGeometry(recess, wall.length, wall.height);
  const rect = wallRectToScreen({
    x: geometry.x,
    z: geometry.bottom,
    width: geometry.width,
    height: geometry.top - geometry.bottom,
  }, transform);
  return (
    <Group listening={false}>
      <Rect
        {...rect}
        fillEnabled={false}
        stroke="#60a5fa"
        strokeWidth={2}
        dash={recess.kind === 'projection' ? undefined : [6, 4]}
      />
      <Text x={rect.x + 4} y={rect.y + 4} text={recess.label} fontSize={10} fill="#93c5fd" />
    </Group>
  );
}
```

### `ElevationCanvas.jsx`

1. The import (127) becomes `import RecessShapes, { RecessOutline } from './RecessShapes.jsx';`
2. After `selectRecess` (≈ 989–992):

```js
  // The wall row selects what's in it (SPEC-38.1): a recess full of cabinets can't be clicked otherwise.
  const selectFeature = useCallback((segment) => {
    if (tool !== 'select') return;
    if (segment.kind === 'recess') {
      dispatch(setSelection({ recessId: segment.recessId }));
    } else if (segment.kind === 'opening' && wallRef.current?.side !== 'back') {
      dispatch(setSelection({ openingId: segment.openingId }));
    }
  }, [dispatch, tool]);
```

3. The wall row's `DimensionRow` (`segments={dimensionChains.openings}`, ≈ 1728) gets `onFeatureClick={tool === 'select' ? selectFeature : undefined}`.
4. In the `<Layer listening={false}>` after `<NeighborProfiles … />` (≈ 1680):

```jsx
            {selection.recessId && (
              <RecessOutline wall={wall} transform={transform} recessId={selection.recessId} />
            )}
```

**Count:** unchanged, **835**.

---

## §4 Step 282 — The Add menu

**Files:** NEW `src/elevation/components/AddToolMenu.jsx`, `src/elevation/components/ElevationToolbar.jsx` (222).

### NEW `src/elevation/components/AddToolMenu.jsx`

```jsx
import { useEffect, useRef, useState } from 'react';

/**
 * The tools that add a detail to a wall (SPEC-38.1), behind one "Add" button so the toolbar stays short.
 * `tools` is [[name, label]]; the button reads "Add: <label>" while one of them is the active tool.
 */
export default function AddToolMenu({ tools, tool, disabledTools = [], disabledTitle, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const active = tools.find(([name]) => name === tool);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`rounded px-3 py-1.5 text-sm transition-colors ${
          active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
      >
        {active ? `Add: ${active[1]}` : 'Add'} ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1 min-w-36 rounded border border-gray-700 bg-gray-900 py-1 shadow-lg"
        >
          {tools.map(([name, label]) => {
            const disabled = disabledTools.includes(name);
            return (
              <button
                key={name}
                type="button"
                role="menuitem"
                disabled={disabled}
                title={disabled ? disabledTitle : undefined}
                onClick={() => {
                  onPick(name);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                  tool === name ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

### `ElevationToolbar.jsx`

1. `import AddToolMenu from './AddToolMenu.jsx';`
2. `toolNames` (39–41) becomes the two standalone tools, plus the menu's list:

```js
  const toolNames = view === 'plan' ? ['select', 'wall'] : ['select', 'draw'];
  const addTools = view === 'plan'
    ? [['door', 'Door'], ['window', 'Window']]
    : [['soffit', 'Soffit'], ['recess', 'Recess'], ['door', 'Door'], ['window', 'Window']];
```

3. The `toolNames.map(…)` block (≈ 60–110): each standalone button keeps its classes and labels ("Draw run", "Draw wall", "select"), without the `disabled`/`title` props and without the soffit toggle. After the map:

```jsx
      <AddToolMenu
        tools={addTools}
        tool={tool}
        disabledTools={view === 'elevation' && activeWallSide === 'back' ? ['door', 'window'] : []}
        disabledTitle="Add doors and windows from the front"
        onPick={(name) => dispatch(setTool(name))}
      />
      {view === 'elevation' && tool === 'soffit' && (
        … the existing "Default soffit molding" toggle, unchanged …
      )}
```

`Fragment` is then unused: drop it from the `react` import.

**Count:** unchanged, **835**.

---

## §5 Step 283 — Plan: rows clear the bump-outs

**Files:** `src/elevation/plan/PlanWallShape.jsx` (348).

1. Import `import { recessesOn } from '../model/recesses.js';`
2. Replace `innerRowOffset` (42) and `extensionStartOffset` (50):

```js
  // SPEC-38.1: a recess at least as deep as the wall bumps the wall out on the other face, where that face's
  // row (and on the front, the overall length) is drawn, so those move out past the deepest one.
  const bumpOut = (side) => Math.max(0, ...recessesOn(wall, side)
    .filter((recess) => recess.kind !== 'projection' && recess.depth >= wall.thickness - 1e-6)
    .map((recess) => recess.depth));
  const innerRowOffset = wall.thickness + bumpOut('front') + 22 / scale;
```

   and `const extensionStartOffset = wall.thickness + bumpOut('front') + 2 / scale;`.
3. The face row offset (88): `const offset = side === 'front' ? innerRowOffset : wall.thickness + bumpOut('back') + 42 / scale;` (no recess: the same `thickness + 42 px` as today).

**Count:** unchanged, **835**.
