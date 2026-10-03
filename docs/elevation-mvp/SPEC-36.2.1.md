# Elevation Lab — SPEC-36.2.1 (face frame follow-ups: wall end panels, chains, badges)

Steps 234–237, after 36.2. SPEC-36 through 36.2 still apply. Written against `354fa98` (step 233). Baseline **707**.

The code blocks haven't been run. If a new test is off by a small amount, check the arithmetic before changing the code.

| Step | What | Files | Tests after |
|---|---|---|---|
| **234** | Model: the frame on the wall's vertical chain; the frame badge's anchor; `wallEndPanelFramed`. | `frames.js`, `dimensions.js`, `partNumbers.js`, `wallEndPanels.js`, `index.js`, `frameParts.test.js`, `frameEnds.test.js` | 710 |
| **235** | Store: a wall end panel can be selected (`selection.endPanel`). | `elevationSlice.js`, its test | 711 |
| **236** | Screen: wall end panels drawn again, clickable, and with their own properties; the Face frame choice fixed and only shown beside a face frame run. | `WallEndPanelFields.jsx` (new), `WallEndPanelProperties.jsx` (new), `WallHeightProperties.jsx`, `PropertiesPanel.jsx`, `WallEndPanelShapes.jsx`, `ElevationCanvas.jsx` | 711 |
| **237** | Screen: the vertical chain uses the frame; no per-cabinet chains; the frame badge sits higher with a leader to a stile; open cells drawn solid. | `ElevationCanvas.jsx`, `RunGroup.jsx`, `PartNumberBadges.jsx`, `PieceRect.jsx` | 711 |

Next: **36.3** (plan clearances, the rail/mullion toggle, hanging bases).

## §1 What was wrong, and the rules (Kyle, 2026-09-28)

### Bugs from step 229

- **"Dies into" always went back to Auto.** The select sent `'cover'`, `'die'` and `'auto'`, but the reducer only accepts `'miter'`, `'butt'` or null, so every change was rejected. The values must be exactly `miter` and `butt`, and Auto sends `frame: null`.
- **Wall end panels vanished from every elevation, European too.** `WallEndPanelShapes` called `wallEndPanelSpans(room, wall, settings)`, but its signature is `(wall, panel)`. It has to map `wallEndPanels(…)` and call `wallEndPanelSpans(wall, panel)` for each one.
- **The Face frame choice showed in European rooms.** It now shows only when a face frame run meets that panel (`wallEndPanelFramed`). A stored `frame` stays saved but does nothing while no frame run meets it.

### Wall end panels are selectable

- In the elevation, a wall end panel can be clicked (with the select tool). Hovering or selecting it draws the whole panel, even the part a mitered frame covers. Otherwise only the uncovered part shows, as in 36.2.
- Selecting it opens **Wall end panel** properties: its part number, its size (width × height, depth on this side), width, the Face frame choice (beside a face frame run only), and a Remove button.
- The wall's properties keep the same per-end fields, shared through one `WallEndPanelFields` component.
- Plan view isn't clickable yet.

### Vertical chain (replaces the per-cabinet chains)

- The per-cabinet vertical chains from step 233 go away.
- On the wall's vertical chain (the one at the wall's left or right edge that shows the run heights), a face frame run's **box** segment is replaced by **rail | opening | rail …**. It's taken up the stack of openings nearest that edge (the leftmost stack for the left chain, the rightmost for the right), in the frame region nearest that edge.
- The frame starts at the frame's own bottom. On an upper whose doors overhang, that's 3/4" below the box, so the clearance above the counter ends there. Any box above or below the frame region stays a `box` segment.
- Joined stacks (`stackChain`) do the same.
- Clicking a cabinet still shows its face sizes, as now.

### Frame badge

- A frame's badge sits two levels up (it was one), straight above the **middle of the full-height stile nearest the frame's centre**. A leader line runs down to that point. With two cabinets the badge lands over the seam stile, and cabinet badges sit at each cabinet's centre, so they no longer crowd.
- With one cabinet, the nearest stile is a tie, so the left stile wins. With no stiles (members null), the anchor is the frame's centre.

### Open cells

- A void cell is drawn with a solid outline, not dashed.
- Drawing a box's inside (sides, top, bottom, partitions, shelves) needs a model of how each box is built. That's later work (see §7).

**Worked example (the tests), BW from SPEC-36.2.** An inset base at x 24, 48 wide, z 4, 30.5 tall, no end pieces, two auto cabinets a and b.
- Openings: a 25.5–47.25 and b 48.75–70.5, both z 5.5–33.
- Stiles: 24–25.5, 47.25–48.75 and 70.5–72, each 30.5 tall. Their middles are x 24.75, 48 and 71.25, at z 4 + 15.25 = 19.25.
- The frame's centre is x 48, so the badge anchor is (48, 19.25).
- Vertical chain (left): toe-kick 0–4 | frame 4–5.5 | opening 5.5–33 | frame 33–34.5 | countertop 34.5–36 | open 36–96. In a European room, box 4–34.5.

---

## §2 Step 234 — model

### `src/elevation/model/frames.js` (327)

- `frameVerticalChains` (289–327) is split: the stacking moves into a helper that both it and a new `frameEdgeTracks` use. Replace the whole function with:

```js
/** Stacks of openings (widths overlapping), left to right, each with rail | opening | rail tracks, bottom to top. */
function openingStacks(region, openings) {
  const stacks = [];
  for (const opening of [...openings].sort((a, b) => a.x - b.x)) {
    const last = stacks[stacks.length - 1];
    if (last && opening.x < last.end - EPSILON) {
      last.end = Math.max(last.end, opening.x + opening.width);
      last.openings.push(opening);
    } else {
      stacks.push({ start: opening.x, end: opening.x + opening.width, openings: [opening] });
    }
  }
  const top = region.z + region.height;
  return stacks.map((stack) => {
    const tracks = [];
    let cursor = region.z;
    for (const [start, end] of mergeSpans(stack.openings.map((opening) => [opening.z, opening.z + opening.height]))) {
      if (start - cursor > EPSILON) tracks.push({ kind: 'frame', start: cursor, end: start });
      tracks.push({ kind: 'frame-opening', start, end });
      cursor = end;
    }
    if (top - cursor > EPSILON) tracks.push({ kind: 'frame', start: cursor, end: top });
    return { ...stack, tracks };
  });
}

/**
 * A frame region's vertical opening chains (SPEC-36.2): one per stack of openings, left to right,
 * leaving out a stack whose chain repeats one already given. Shaped like a cell grid on a row axis.
 */
export function frameVerticalChains(region, openings) {
  const seen = new Set();
  return openingStacks(region, openings).flatMap((stack, index) => {
    const signature = stack.tracks
      .map((track) => `${track.kind}:${Math.round((track.end - track.start) * 10000)}`)
      .join('|');
    if (seen.has(signature)) return [];
    seen.add(signature);
    const id = `${region.id}:v${index}`;
    return [{
      id,
      axis: 'row',
      x: stack.start,
      z: region.z,
      width: stack.end - stack.start,
      height: region.height,
      tracks: stack.tracks.map((track, trackIndex) => ({ ...track, id: `${id}:${trackIndex}`, manual: false })),
    }];
  });
}

/** Rail | opening | rail up the stack of openings nearest one side of a frame (SPEC-36.2.1). */
export function frameEdgeTracks(region, openings, edge) {
  const stacks = openingStacks(region, openings);
  if (stacks.length === 0) return [];
  return (edge === 'right' ? stacks[stacks.length - 1] : stacks[0]).tracks;
}

/**
 * Where a frame's part badge points (SPEC-36.2.1): the middle of the full-height stile nearest the
 * frame's centre, clear of the cabinets' own badges; the frame's centre when there's no stile.
 */
export function frameBadgeAnchor(region, members) {
  const middle = region.x + region.width / 2;
  const stiles = (members ?? []).filter((member) => member.kind === 'stile');
  if (stiles.length === 0) return { x: middle, z: region.z + region.height / 2 };
  const offset = (stile) => Math.abs(stile.x + stile.width / 2 - middle);
  const nearest = stiles.reduce((best, stile) => (offset(stile) < offset(best) - EPSILON ? stile : best));
  return { x: nearest.x + nearest.width / 2, z: nearest.z + nearest.height / 2 };
}
```

`frameVerticalChains` returns exactly what it did before. Its SPEC-36.2 test stays green.

### `src/elevation/model/wallEndPanels.js` (93)

Append:

```js
/** Whether a face frame run meets this wall end panel on either side (SPEC-36.2.1). */
export function wallEndPanelFramed(wall, panel) {
  const source = wall.sideSource ?? wall;
  const ids = [...panel.front.runIds, ...panel.back.runIds];
  return source.runs.some((run) => ids.includes(run.id) && Boolean(run._frame));
}
```

### `src/elevation/model/dimensions.js` (561)

- Imports: line 5 becomes `import { layoutRun, runFaceLayouts } from './faceLayouts.js';` and line 6 becomes `import { frameEdgeTracks, frameRegions, regionOpenings } from './frames.js';`.
- Right before `stackChain` (449) add:

```js
/**
 * A run's box on the vertical chain (SPEC-36.2.1). On a face frame run, the frame region nearest
 * the chain's edge is dimensioned rail | opening | rail up its outermost stack of openings, from the
 * frame's own bottom (below an upper's box when it drops), with any box above or below the frame.
 * Otherwise the box.
 */
function runBoxSegments(room, wall, run, settings, edge) {
  const box = [{ start: run.z, end: run.z + run.height, kind: 'box' }];
  const layout = layoutRun(room, wall, run, settings);
  const { regions } = frameRegions(room, run, cellPieces(run, layout), settings);
  if (regions.length === 0) return box;
  const region = regions.reduce((best, candidate) => (edge === 'right'
    ? (candidate.x + candidate.width > best.x + best.width + SEGMENT_EPSILON ? candidate : best)
    : (candidate.x < best.x - SEGMENT_EPSILON ? candidate : best)));
  const openings = regionOpenings(region, runFaceLayouts(room, wall, run, settings, layout));
  const tracks = frameEdgeTracks(region, openings, edge);
  if (tracks.length === 0) return box;
  return [
    { start: run.z, end: region.z, kind: 'box' },
    ...tracks.map(({ start, end, kind }) => ({ start, end, kind })),
    { start: region.z + region.height, end: run.z + run.height, kind: 'box' },
  ].filter((segment) => segment.end - segment.start > SEGMENT_EPSILON);
}
```

- `stackChain` (449): the signature becomes `export function stackChain(room, wall, runs, settings, edge = 'left') {`. Lines 462–464:

```js
    const box = runBoxSegments(room, wall, run, settings, edge);
    append(parts.length > 0 ? parts.at(-1).z : box[0].start, index === 0 && lower ? 'toe-kick' : 'open');
    for (const part of [...parts].reverse()) append(part.z + part.height, 'bottom');
    for (const segment of box) append(segment.end, segment.kind);
```

- `verticalChains` (476): the signature becomes
  `export function verticalChains(room, wall, { lowerRun, upperRun, stack = null }, settings, edge = 'left') {`,
  and its first line passes `edge` to `stackChain(room, wall, stack, settings, edge)`.
  - The lower box (503–505) becomes:

```js
    let drawn = false;
    for (const segment of runBoxSegments(room, wall, lowerRun, settings, edge)) {
      drawn = append(segment.start, segment.end, segment.kind) || drawn;
    }
    if (drawn) rememberBox(lowerRun);
```

  - The upper block (516–527) becomes:

```js
  if (upperRun) {
    const parts = runBottomParts(upperRun);
    const box = runBoxSegments(room, wall, upperRun, settings, edge);
    append(
      cursor,
      parts.length > 0 ? parts.at(-1).z : box[0].start,
      lowerRun?.cabinetTypeId === CABINET_TYPE_IDS.BASE ? 'clearance' : 'open',
    );
    for (const part of [...parts].reverse()) append(part.z, part.z + part.height, 'bottom');
    let drawn = false;
    for (const segment of box) drawn = append(segment.start, segment.end, segment.kind) || drawn;
    if (drawn) rememberBox(upperRun);
  }
```

Every existing call without `edge` still gets the left edge. A European run's chain is unchanged.

### `src/elevation/model/partNumbers.js` (269)

- Add `import { runFaceLayouts } from './faceLayouts.js';` after the constants import. The frames import (4) becomes `import { frameBadgeAnchor, frameMembers, frameRegions, regionOpenings } from './frames.js';`.
- In `wallBadgeGroups`, the frame groups (the `...frames.regions.map(…)` in the flatMap's return) become:

```js
      // Each frame's badge sits two levels up, over the stile nearest its centre (SPEC-36.2.1).
      ...frames.regions.map((region) => {
        const openings = regionOpenings(region, faceLayouts());
        return {
          key: region.id,
          lift: 2,
          pieces: [{
            id: region.id,
            x: region.x,
            z: region.z,
            width: region.width,
            height: region.height,
            anchor: frameBadgeAnchor(region, frameMembers(region, openings)),
          }],
        };
      }),
```

  Above the `return`, add `let layouts = null;` and `const faceLayouts = () => (layouts ??= runFaceLayouts(room, wall, run, settings, layout));`, so a run with no frame never computes face layouts. (`layout` is the `splitRun` result already there.)

### `src/elevation/model/index.js`

- The wallEndPanels export (176) adds `wallEndPanelFramed`.
- The frames export (365) adds `frameBadgeAnchor` and `frameEdgeTracks`.

### Tests

**`src/elevation/model/__tests__/frameParts.test.js`:**
- The frames import adds `frameBadgeAnchor`, and add `import { verticalChains } from '../dimensions.js';`.
- In the SPEC-36.2 test `'numbers each frame once after its run\'s pieces, and badges it'`, `['frame:a', 1, ['frame:a']]` becomes `['frame:a', 2, ['frame:a']]`.
- At the end (2):

```js
describe('SPEC-36.2.1 the frame on the wall chain and its badge', () => {
  it('dimensions the frame up the wall in place of the box', () => {
    const room = roomWith(baseRun(), INSET);
    const wall = resolveWall(room, room.walls[0]);
    expect(verticalChains(room, wall, { lowerRun: room.walls[0].runs[0], upperRun: null }, S, 'left').inner)
      .toEqual([
        { start: 0, end: 4, kind: 'toe-kick' },
        { start: 4, end: 5.5, kind: 'frame' },
        { start: 5.5, end: 33, kind: 'frame-opening' },
        { start: 33, end: 34.5, kind: 'frame' },
        { start: 34.5, end: 36, kind: 'countertop' },
        { start: 36, end: 96, kind: 'open' },
      ]);
    const euro = roomWith(baseRun());
    expect(verticalChains(euro, resolveWall(euro, euro.walls[0]), { lowerRun: euro.walls[0].runs[0], upperRun: null }, S, 'right')
      .inner[1]).toEqual({ start: 4, end: 34.5, kind: 'box' });
  });

  it('points the frame badge at the stile nearest the frame\'s centre', () => {
    expect(frameBadgeAnchor(REGION_A, frameMembers(REGION_A, OPENINGS_A))).toEqual({ x: 42, z: 19.25 });
    expect(frameBadgeAnchor({ x: 24, z: 4, width: 18, height: 30.5 }, [
      { kind: 'stile', x: 24, z: 4, width: 1.5, height: 30.5 },
      { kind: 'stile', x: 40.5, z: 4, width: 1.5, height: 30.5 },
    ])).toEqual({ x: 24.75, z: 19.25 });
    expect(frameBadgeAnchor(REGION_A, null)).toEqual({ x: 42, z: 19.25 });

    const room = roomWith(baseRun(), INSET);
    const frame = wallBadgeGroups(room, resolveWall(room, room.walls[0]), S)
      .find(({ key }) => key === 'frame:a');
    expect(frame.lift).toBe(2);
    expect(frame.pieces[0].anchor).toEqual({ x: 48, z: 19.25 });
  });
});
```

**`src/elevation/model/__tests__/frameEnds.test.js`:** the wallEndPanels import adds `wallEndPanelFramed`. At the end (1):

```js
describe('SPEC-36.2.1 which wall end panels meet a frame', () => {
  it('says a panel meets a frame only beside a face frame run', () => {
    const inset = island();
    const [framed] = wallEndPanels(inset, inset.walls[0], S);
    expect(wallEndPanelFramed(inset.walls[0], framed)).toBe(true);
    const euro = island({ style: null });
    const [plain] = wallEndPanels(euro, euro.walls[0], S);
    expect(wallEndPanelFramed(euro.walls[0], plain)).toBe(false);
  });
});
```

Working:
- MEM-A (SPEC-36.2): the stiles' middles are 24.75, 42 and 59.25, and the centre is 42. With one cabinet (24–42), the two stiles are equally far from 33, so the first, 24.75, wins.
- BW: see §1. The toe kick and countertop come from the default profile (4 + 30.5 + 1.5 = 36).

**Count:** 707 + 3 = **710**.

---

## §3 Step 235 — store

### `src/elevation/store/elevationSlice.js` (1758)

`setSelection`: after the `runId` line add

```js
      const endPanel = openingId || soffitId || runId || !['start', 'end'].includes(action.payload.endPanel)
        ? null
        : action.payload.endPanel;
```

and the `state.selection = { … }` object gains a last line `...(endPanel ? { endPanel } : {}),`.

Nothing else sets `endPanel`, so every other place that rebuilds the selection clears it. It refers to an endpoint of `selection.wallId`'s wall.

### Tests: `src/elevation/store/__tests__/elevationSlice.test.js`, a describe at the end (1)

```js
describe('SPEC-36.2.1 wall end panel selection', () => {
  it('selects a wall end panel and drops it for anything else', () => {
    let state = elevationReducer(stateWithRun(), setSelection({ endPanel: 'start' }));
    expect(state.selection).toMatchObject({
      runId: null, pieceId: null, openingId: null, soffitId: null, endPanel: 'start',
    });
    state = elevationReducer(state, setSelection({ endPanel: 'middle' }));
    expect('endPanel' in state.selection).toBe(false);
    state = elevationReducer(state, setSelection({ endPanel: 'end', soffitId: 's1' }));
    expect(state.selection.soffitId).toBe('s1');
    expect('endPanel' in state.selection).toBe(false);
  });
});
```

**Count:** 710 + 1 = **711**.

---

## §4 Step 236 — wall end panels on screen

### New `src/elevation/components/properties/WallEndPanelFields.jsx`

```jsx
import { useDispatch } from 'react-redux';
import { formatInches } from '../../model/index.js';
import { setWallEndPanel } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

/** A wall end panel's width and, beside a face frame run, how the frame meets it (SPEC-36.2.1). */
export default function WallEndPanelFields({
  wall, endpoint, panel, label, framed, settings,
}) {
  const dispatch = useDispatch();
  const update = (changes) => dispatch(setWallEndPanel({
    wallId: wall.id,
    endpoint,
    panel: { width: panel.width ?? null, frame: panel.frame ?? null, ...changes },
  }));

  return (
    <div className="space-y-2.5">
      <Field label="Width">
        <InchInput
          value={panel.width}
          allowBlank
          placeholder={formatInches(settings.endPanelThickness)}
          onCommit={(width) => update({ width })}
          aria-label={`${label} panel width`}
        />
      </Field>
      {framed && (
        <Field label="Face frame">
          <select
            value={panel.frame ?? 'auto'}
            onChange={(event) => update({ frame: event.target.value === 'auto' ? null : event.target.value })}
            aria-label={`${label} panel face frame`}
            className={SELECT_CLASS}
          >
            <option value="auto">Auto</option>
            <option value="miter">Frame covers the panel edge</option>
            <option value="butt">Frame dies into the panel</option>
          </select>
        </Field>
      )}
    </div>
  );
}
```

The option values are `miter` and `butt`, exactly: they're what the store and the saves accept (`FRAME_JOINS`).

### New `src/elevation/components/properties/WallEndPanelProperties.jsx`

```jsx
import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import {
  formatInches, partNumbers, wallEndPanelFramed, wallEndPanelPartKey,
} from '../../model/index.js';
import { setWallEndPanel } from '../../store/elevationSlice.js';
import PartNumberField from './PartNumberField.jsx';
import WallEndPanelFields from './WallEndPanelFields.jsx';

/** A selected wall end panel (SPEC-36.2.1). `panel` is one entry of wallEndPanels. */
export default function WallEndPanelProperties({
  room, wall, panel, settings,
}) {
  const dispatch = useDispatch();
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  const key = wallEndPanelPartKey(wall.id, panel.endpoint);
  const side = panel[wall.side ?? 'front'];
  const label = side.side === 'left' ? 'Left end' : 'Right end';
  const stored = wall.endPanels?.[panel.endpoint] ?? { width: null };

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Wall end panel · {label}
      </h3>
      <PartNumberField
        roomId={room.id}
        partKey={key}
        autoNumber={numbers.byKey.get(key)}
        override={room.partNumberOverrides?.[key]}
        duplicate={numbers.warnings.some((warning) => warning.keys.includes(key))}
      />
      <p className="text-xs text-gray-300">
        {formatInches(panel.width)} × {formatInches(panel.top)} · {formatInches(side.depth)} deep on this side
      </p>
      <WallEndPanelFields
        wall={wall}
        endpoint={panel.endpoint}
        panel={stored}
        label={label}
        framed={wallEndPanelFramed(wall, panel)}
        settings={settings}
      />
      <button
        type="button"
        onClick={() => dispatch(setWallEndPanel({ wallId: wall.id, endpoint: panel.endpoint, panel: null }))}
        className="w-full rounded bg-red-900/70 px-3 py-2 text-sm text-red-100 hover:bg-red-800"
      >
        Remove panel
      </button>
    </div>
  );
}
```

### `src/elevation/components/properties/WallHeightProperties.jsx` (372)

- The model import (3–12) adds `wallEndPanelFramed, wallEndPanels`. Add `import WallEndPanelFields from './WallEndPanelFields.jsx';` after the Field import.
- After the `rightFree` lines (47–48):

```js
  const framedEnds = new Set(wallEndPanels(room, wall, settings)
    .filter((candidate) => wallEndPanelFramed(wall, candidate))
    .map((candidate) => candidate.endpoint));
```

- The `{panel && ( … )}` block in "Wall end panels" (306–338) becomes:

```jsx
                {panel && (
                  <div className="mt-2">
                    <WallEndPanelFields
                      wall={wall}
                      endpoint={endpoint}
                      panel={panel}
                      label={label}
                      framed={framedEnds.has(endpoint)}
                      settings={settings}
                    />
                  </div>
                )}
```

- If lint then reports an import as unused (`InchInput`, `formatInches`), remove only that import.

### `src/elevation/components/PropertiesPanel.jsx` (163)

- The model import (8–13) adds `wallEndPanels`. Add `import WallEndPanelProperties from './properties/WallEndPanelProperties.jsx';` after the WallHeightProperties import (30).
- After `soffit` (55–57):

```js
  const endPanel = wall && selection.endPanel
    ? wallEndPanels(room, wall, settings).find((candidate) => candidate.endpoint === selection.endPanel) ?? null
    : null;
```

- In the JSX, between the `soffit ? ( <SoffitProperties … /> )` branch and `!run || !displayLayout ?` (137–138):

```jsx
        ) : endPanel ? (
          <WallEndPanelProperties
            room={room}
            wall={wall}
            panel={endPanel}
            settings={settings}
          />
```

### `src/elevation/components/WallEndPanelShapes.jsx`

The whole file:

```jsx
import { useState } from 'react';
import { Group, Rect } from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { wallRectToScreen } from '../canvas/transform.js';
import { KIND_COLORS } from '../model/constants.js';
import { wallEndPanelSpans, wallEndPanels } from '../model/wallEndPanels.js';

function WallEndPanelShape({
  wall, panel, transform, selected, onSelect, cursor,
}) {
  const [hovered, setHovered] = useState(false);
  const cursorKeys = useCursorKeys(cursor);
  const side = panel[wall.side ?? 'front'];
  const cursorKey = `wall-end-panel:${panel.endpoint}`;
  const rect = (z, height) => wallRectToScreen({ x: side.x, z, width: panel.width, height }, transform);
  // A mitered face frame covers part of the panel (SPEC-36.2); hovered or selected, it all shows.
  const spans = hovered || selected ? [{ z: 0, height: panel.top }] : wallEndPanelSpans(wall, panel);

  return (
    <Group
      listening={Boolean(onSelect)}
      onMouseEnter={() => {
        setHovered(true);
        cursorKeys.request(cursorKey, CURSORS.select);
      }}
      onMouseLeave={() => {
        setHovered(false);
        cursorKeys.release(cursorKey);
      }}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect?.(panel.endpoint);
      }}
    >
      <Rect {...rect(0, panel.top)} fill="rgba(0, 0, 0, 0.001)" />
      {spans.map((span) => (
        <Rect
          key={span.z}
          {...rect(span.z, span.height)}
          fill={KIND_COLORS.end_panel}
          opacity={0.55}
          stroke={selected ? '#7dd3fc' : KIND_COLORS.end_panel}
          strokeWidth={selected ? 3 : 1}
          listening={false}
        />
      ))}
    </Group>
  );
}

export default function WallEndPanelShapes({
  room, wall, settings, transform, selectedEndpoint = null, onSelect, cursor,
}) {
  return wallEndPanels(room, wall, settings).map((panel) => (
    <WallEndPanelShape
      key={panel.endpoint}
      wall={wall}
      panel={panel}
      transform={transform}
      selected={selectedEndpoint === panel.endpoint}
      onSelect={onSelect}
      cursor={cursor}
    />
  ));
}
```

### `src/elevation/components/ElevationCanvas.jsx` (1834)

- After `selectSoffit` (959–962):

```js
  const selectEndPanel = useCallback((endPanel) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ endPanel }));
  }, [dispatch, tool]);
```

- Remove `<WallEndPanelShapes … />` from the non-listening layer (1609–1614) and put it in the run layer, right after the `{wall.runs.map((run) => ( <RunGroup … /> ))}` block and before `{tool === 'select' && ( <JointMarkers`:

```jsx
            <WallEndPanelShapes
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
              selectedEndpoint={selection.endPanel ?? null}
              onSelect={tool === 'select' ? selectEndPanel : undefined}
              cursor={cursor}
            />
```

No new tests (components). **Count stays 711.**

---

## §5 Step 237 — chains, badges, open cells

### `src/elevation/components/ElevationCanvas.jsx`

`verticalChains(room, wall, pickColumnRuns(wall, selection.runId, edge), settings)` (222) becomes
`verticalChains(room, wall, pickColumnRuns(wall, selection.runId, edge), settings, edge)`.

### `src/elevation/components/RunGroup.jsx` (622)

Undo step 233's per-cabinet chains:
- The `frameChains` memo (91–94) goes.
- The `{!preview && ( <CellChains grids={frameChains} … /> )}` block (515–522) goes.
- The frames import (18) goes back to `import { frameRegions } from '../model/frames.js';`.

### `src/elevation/components/PartNumberBadges.jsx` (89)

The whole file:

```jsx
import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import {
  layoutPartBadges,
  partBadgeLevels,
  partBadgeWidth,
  PART_BADGE_FONT_SIZE,
  PART_BADGE_HEIGHT,
  PART_BADGE_LIFT,
  PART_BADGE_STEP,
} from '../canvas/partNumberLayout.js';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';

function Badge({
  badge, y, leaderTo, override,
}) {
  return (
    <Group listening={false}>
      {leaderTo !== null && (
        <Line
          points={[badge.center, y + PART_BADGE_HEIGHT / 2, badge.center, leaderTo]}
          stroke="#94a3b8"
          strokeWidth={0.75}
          listening={false}
        />
      )}
      <Rect
        x={badge.center - badge.width / 2}
        y={y - PART_BADGE_HEIGHT / 2}
        width={badge.width}
        height={PART_BADGE_HEIGHT}
        cornerRadius={PART_BADGE_HEIGHT / 2}
        fill="#0f172a"
        stroke={override ? '#facc15' : '#f8fafc'}
        strokeWidth={1.25}
        listening={false}
      />
      <Text
        x={badge.center - badge.width / 2}
        y={y - PART_BADGE_HEIGHT / 2}
        width={badge.width}
        height={PART_BADGE_HEIGHT}
        text={badge.text}
        align="center"
        verticalAlign="middle"
        fontSize={PART_BADGE_FONT_SIZE}
        fontStyle="bold"
        fill="#f8fafc"
        listening={false}
      />
    </Group>
  );
}

export default function PartNumberBadges({
  pieces,
  numbers,
  overrideKeys,
  transform,
  lift = 0,
}) {
  if (pieces.length === 0) return null;
  // A piece with an anchor (a face frame, SPEC-36.2.1) gets its badge straight above that point, with
  // a leader down to it.
  const anchored = pieces
    .filter((piece) => piece.anchor && numbers.has(piece.id))
    .map((piece) => {
      const point = wallToScreen(piece.anchor, transform);
      const text = String(numbers.get(piece.id));
      return { key: piece.id, text, width: partBadgeWidth(text), center: point.x, anchorY: point.y };
    });
  const loose = pieces.filter((piece) => !piece.anchor);
  const rects = new Map(loose.map((piece) => [piece.id, wallRectToScreen(piece, transform)]));
  const entries = loose.flatMap((piece) => {
    if (!numbers.has(piece.id)) return [];
    const rect = rects.get(piece.id);
    return [{
      key: piece.id,
      text: String(numbers.get(piece.id)),
      left: rect.x,
      right: rect.x + rect.width,
    }];
  });
  const badges = loose.length > 0
    ? layoutPartBadges(entries, { maxLevels: partBadgeLevels(rects.get(loose[0].id).height) })
    : [];

  return (
    <Group listening={false}>
      {badges.map((badge) => {
        const rect = rects.get(badge.key);
        const restY = rect.y + rect.height / 2 - PART_BADGE_LIFT;
        const y = restY - (badge.level + lift) * PART_BADGE_STEP;
        return (
          <Badge
            key={badge.key}
            badge={badge}
            y={y}
            leaderTo={badge.level + lift > 0 ? restY : null}
            override={overrideKeys.has(badge.key)}
          />
        );
      })}
      {anchored.map((badge) => (
        <Badge
          key={badge.key}
          badge={badge}
          y={badge.anchorY - PART_BADGE_LIFT - lift * PART_BADGE_STEP}
          leaderTo={badge.anchorY}
          override={overrideKeys.has(badge.key)}
        />
      ))}
    </Group>
  );
}
```

Other badges are drawn exactly as before. The frame badge is 20 + 2 × 23 = 66 px above the stile's middle, with a line down to it.

### `src/elevation/components/PieceRect.jsx` (136)

Delete the `dash={piece.kind === 'void' ? [6, 4] : undefined}` line (62). The void keeps its colour and its "Open" label.

No new tests (components). **Count stays 711.**

**Done when (round):** `npm test` (711) and `npm run lint` clean.

## §6 Check by hand

See the end of PROMPTS-36.2.1.

## §7 Left for later

- **Box interiors.** Drawing sides, top, bottom, back, partitions and shelves inside a cabinet (and an open cell) needs a model of how each box is built: construction per cabinet type and style, material thicknesses, and where partitions and fixed or adjustable shelves go. That's the "interior, separately later" work. It should be planned as its own round with the reports, because it's the same data the cut list needs.
- Wall end panels aren't clickable in plan view yet.
- Clicking a framed cabinet shows its face sizes, not its own rail | opening | rail chain. That's easy to add if the face sizes aren't enough.
- The frame badge anchors to a stile only. A frame with no stile (members null) points at its centre.
