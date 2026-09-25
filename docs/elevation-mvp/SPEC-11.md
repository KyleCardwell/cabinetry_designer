# Elevation Lab — SPEC-11 (label sizes, room wall height, center on origin, alignment snaps)

Steps 39–44. Earlier SPEC files still apply; this file is the source of truth for what
follows. Repo state at time of writing: `feature/elevation-mvp` at `fb2b9e7`
(step 38 centerline callout), working tree clean, 17,075 lines under `src/elevation`.

Four requests drive this round:

1. The elevation letter/label is too small to read in both plan and elevation.
2. A button to put the room back on the origin.
3. A default wall height that new walls pick up, living with the room heights.
4. Vertical/horizontal alignment snaps — plan while drawing walls, elevation while
   dragging run ends — that show a guide and pull only when the pointer is already
   within a few pixels of alignment.

**Saved documents are expendable this round.** There is nothing in localStorage worth
preserving, which is why §2 has no persistence migration in it. Read §2.4 before
deciding otherwise.

---

## §1 Elevation label sizes (step 39)

No new behavior, no new settings, no tests. Two files, both small.

### §1.1 `plan/PlanElevationMarker.jsx` (46 lines)

The marker already divides by `scale`, so it is a fixed on-screen size at any zoom.
Only the constants and the font size change:

```js
const RADIUS = 14;        // was 9
const FLAG_LENGTH = 10;   // was 7
```

and in the `<Text>`:

```jsx
fontSize={15 / scale}     // was 10 / scale
```

Leave `flagHalfWidth = radius * 0.6`, the colors, the geometry and the `1.5 / scale`
circle stroke alone — they scale off `radius` already.

### §1.2 `components/ElevationCanvas.jsx` (819 lines) — the "Elevation A" text

The block at lines 742–754 currently reads `fontSize={13}`, `offsetX={40}`,
`width={80}`. Change those three to:

```jsx
fontSize={20}
offsetX={70}
width={140}
```

`offsetX` must stay exactly half of `width` — that pairing is what centers the text on
the wall midpoint. Nothing else in that block changes, and `dimensionOffsets.label`
stays as step 34 computed it (the label sits below the opening row, and the extra
7px of text height fits in the existing 22px row gap).

### §1.3 What stays the same

The plan wall-number circle (`PlanWallShape.jsx` lines 169–189, `numberRadius = 9 / scale`,
`fontSize={10 / scale}`) does **not** change. Kyle asked for the elevation labels; the
wall number is a different marker and enlarging it would crowd the exterior dimension
string it sits next to.

---

## §2 Per-room wall height (step 40)

A default wall height stored on the room's height profile, edited in the Room heights
panel, read by newly drawn walls. `model/profile.js` line 82 already reads
`profile.wallHeight` as a fallback in `resolveVertical`, so this is the key the model was
written to expect; today it is always `undefined` there because both production callers
(`model/room.js` lines 414 and 460) pass the wall itself.

### §2.1 `model/constants.js` (80 lines)

Add to `DEFAULT_PROFILE` (lines 11–20), as the first key — it is the room envelope, not
a cabinetry dimension:

```js
export const DEFAULT_PROFILE = {
  wallHeight: 96,
  toeKickHeight: 4,
  ...
};
```

`DEFAULT_SETTINGS.defaultProfile` spreads `DEFAULT_PROFILE` (line 24), so settings pick
it up for free, and `createRoom` in the slice (line 67) already does
`profile: { ...settings.defaultProfile }`, so new rooms do too.

### §2.2 The two panels

`components/RoomHeightsPanel.jsx` (89 lines): add `['wallHeight', 'Wall height']` as the
first entry of `PROFILE_FIELDS` (lines 11–20). The panel already dispatches
`updateRoomProfile({ roomId, key, value })` for every field, and that reducer (slice lines
212–224) writes any key it is handed, so editing needs no reducer change.

`components/SettingsPanel.jsx` (207 lines): add the same pair as the first entry of
`PROFILE_SETTINGS` (lines 29–38), the list under the "Default height profile" heading
that seeds new rooms. `NUMBER_SETTINGS` and `OPENING_NUMBER_SETTINGS` don't change.

### §2.3 `store/elevationSlice.js` (889 lines) — new walls read the room

Two reducers create walls, and neither passes a height today, so both fall through to
`createWall`'s hardcoded `values.height ?? 96` (line 53).

`addWall` (lines 233–256) — pass the room's height into the `createWall` call:

```js
        const wall = createWall(
          action.payload.name ?? '',
          y,
          action.payload.length ?? 144,
          {
            ...action.payload,
            height: action.payload.height ?? room.profile.wallHeight,
          },
        );
```

`addWallSegment` (lines 257–287) — same idea, in the explicit values object it already
builds at lines 265–273:

```js
            height: action.payload.height ?? room.profile.wallHeight,
```

Leave `createWall`'s `?? 96` in place as the last-resort default — it is what keeps the
function usable without a room, and `model/room.js` is untouched.

### §2.4 No persistence work, and what that costs

`PROFILE_KEYS` is `Object.keys(DEFAULT_PROFILE)` (`store/persistence.js` line 38), so
adding the key makes `isCompleteProfile` require `wallHeight` on `settings.defaultProfile`
and on every `room.profile`. A document already sitting in localStorage doesn't have it,
so it fails `isElevationDocument`, `loadElevationDocument` returns `null`, and the app
starts from a fresh default room — losing the saved rooms **and** the tuned Settings
values in that same document. Same for a v2 document two schemas back, whose
`V2_PROFILE_KEYS` check now includes the new key.

That is accepted: there are no saved rooms worth keeping, and a fresh start is one
redraw. The step is therefore constants + two panels + two reducers, and
`store/persistence.js` is not opened at all.

**The test suite should not care.** Every fixture in the suite derives its profiles from
`DEFAULT_PROFILE` or `DEFAULT_SETTINGS.defaultProfile` — `migrateV1Document` builds
`defaultProfile` from `{ ...DEFAULT_PROFILE }` and sets `profile: { ...defaultProfile }`,
`persistence.test.js`'s `v2Profile` helper (lines 76–89) spreads `...rest`, and the 16
other test files listed in the step prompt all spread `DEFAULT_SETTINGS.defaultProfile` —
so the new key flows into every document a test builds, and `isCompleteProfile` is
satisfied. If `store/__tests__/persistence.test.js` nonetheless needs an edit, stop and
say so rather than working around it; the fallback is in §7.

### §2.5 What this deliberately does not do

Changing a room's wall height does **not** restyle existing walls. Kyle asked for "new
walls drawn will get that height"; retrofitting every wall would silently move crowns on
finished elevations. Per-wall height stays editable where it already is
(`PropertiesPanel.jsx` line ~1500, `updateWall({ changes: { height } })`), and
`WALL_OVERRIDE_FIELDS` is an explicit list so no new override row appears.

---

## §3 Center the room on the origin (step 41)

The room's geometry moves; the camera is a second, separate effect.

### §3.1 `store/elevationSlice.js` — `centerRoomOnOrigin`

A new reducer beside `useAutoHeightsForRoom` (ends line 232). `roundTo` is already
imported (line 21); `roomIndexFor` (line 100) and `syncRoomAt` (line 141) are in the file.

```js
    centerRoomOnOrigin(state, action) {
      const roomId = action.payload?.roomId ?? action.payload ?? state.activeRoomId;
      const roomIndex = roomIndexFor(state, roomId);
      if (roomIndex === -1) return;
      const room = state.rooms[roomIndex];
      if (room.walls.length === 0) return;
      const xs = room.walls.flatMap((wall) => [wall.x1, wall.x2]);
      const ys = room.walls.flatMap((wall) => [wall.y1, wall.y2]);
      const dx = roundTo(-(Math.min(...xs) + Math.max(...xs)) / 2, state.settings.planGrid);
      const dy = roundTo(-(Math.min(...ys) + Math.max(...ys)) / 2, state.settings.planGrid);
      if (dx === 0 && dy === 0) return;
      for (const wall of room.walls) {
        wall.x1 += dx;
        wall.y1 += dy;
        wall.x2 += dx;
        wall.y2 += dy;
      }
      syncRoomAt(state, roomIndex);
    },
```

Export it from the `elevationSlice.actions` destructuring block (lines 837–886), next to
`useAutoHeightsForRoom`.

Notes that matter:

- Translation only. No rotation, no scaling, so `wallFrame`, `chainOrientation`,
  `wallOrder`, `flipped` and every corner type are unchanged by construction.
- Runs and openings are wall-local (`run.x` along the wall, `opening.offset`), so they
  need no adjustment and must not be touched.
- `connections` are by wall id, so they survive.
- The delta is rounded to `settings.planGrid` so coordinates stay on the grid the wall
  tools snap to. A room already centered is a no-op, which is what makes the button safe
  to press twice.
- `syncRoomAt` at the end matches every other geometry reducer in the file.

### §3.2 `components/ElevationToolbar.jsx` (148 lines)

A plan-only button beside `Ortho` (after the block at lines 71–84), disabled with no
walls, that centers and then refits the view — otherwise the room jumps out of frame:

```jsx
      {view === 'plan' && (
        <button
          type="button"
          disabled={(room?.walls.length ?? 0) === 0}
          onClick={() => {
            dispatch(centerRoomOnOrigin({ roomId: activeRoomId }));
            onZoomToFit?.();
          }}
          className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Center room
        </button>
      )}
```

Import `centerRoomOnOrigin` in the existing import block from
`../store/elevationSlice.js` (lines 3–8). `room`, `activeRoomId`, `dispatch` and
`onZoomToFit` are all already in scope.

`plan/PlanCanvas.jsx` needs no change: its `zoomToFit` (lines 218–245) already centers on
the room's bounding box, so the existing `fitRequest` path in `ElevationLab.jsx` does the
right thing once the geometry has moved.

---

## §4 The alignment snap module (step 42)

A new pure module, `canvas/alignment.js`, used by both canvases in steps 43 and 44.
Nothing imports it yet at the end of this step except its test.

Design rules:

- **Per-axis and independent.** x may snap while y does not.
- **Tolerance is in inches**, and callers convert from screen pixels by dividing by the
  current scale, so the pull feels the same at every zoom. `ALIGNMENT_SNAP_PX = 6` is the
  constant each canvas uses locally (matching `ENDPOINT_SNAP_RADIUS`'s feel in plan).
- **Nearest candidate wins; ties go to the smaller value**, so the result is
  deterministic and a test can pin it.
- **It reports what it did.** `guides` is what the canvases draw; an empty array means
  nothing aligned and nothing should be drawn.
- Axis names come from the caller's own point shape: `{x, y}` in plan, `{x, z}` in
  elevation. The module never assumes `y`.

```js
/**
 * Soft alignment snapping shared by the plan and elevation canvases.
 *
 * Values are inches. `tolerance` is inches too — callers divide a pixel budget by the
 * current scale so the pull is constant on screen. Snapping is per-axis: each axis of a
 * point resolves against its own candidate list, independently of the others.
 */

const TIE_EPSILON = 1e-9;

/**
 * Snap one coordinate to the nearest candidate within tolerance.
 *
 * @param {number} value
 * @param {number[]} candidates
 * @param {number} tolerance
 * @returns {number|null} the candidate, or null when none is close enough
 */
export function snapAxis(value, candidates = [], tolerance = 0) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate)) continue;
    const distance = Math.abs(value - candidate);
    if (distance > tolerance + TIE_EPSILON) continue;
    if (distance < bestDistance - TIE_EPSILON
      || (Math.abs(distance - bestDistance) <= TIE_EPSILON && candidate < best)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Snap a point's axes to nearby alignment candidates.
 *
 * @param {object} point     {x, y} in plan, {x, z} in elevation
 * @param {object} targets   candidate arrays keyed by the same axis names
 * @param {number} tolerance inches
 * @param {string[]} [axes]  axes allowed to snap; defaults to every key in targets
 * @returns {{point: object, guides: {axis: string, value: number}[]}}
 */
export function snapToAlignment(
  point,
  targets = {},
  tolerance = 0,
  axes = Object.keys(targets),
) {
  const snapped = { ...point };
  const guides = [];
  for (const axis of axes) {
    const value = snapAxis(point[axis], targets[axis], tolerance);
    if (value === null) continue;
    snapped[axis] = value;
    guides.push({ axis, value });
  }
  return { point: snapped, guides };
}

/** Alignment candidates from every wall endpoint, x and y kept separate. */
export function endpointAlignmentTargets(walls = [], excludeWallId = null) {
  const x = [];
  const y = [];
  for (const wall of walls) {
    if (wall.id === excludeWallId) continue;
    x.push(wall.x1, wall.x2);
    y.push(wall.y1, wall.y2);
  }
  return { x, y };
}

/** Alignment candidates from every run box on a wall, in wall-local x and z. */
export function runAlignmentTargets(wall, excludeRunId = null) {
  const x = [];
  const z = [];
  for (const run of wall?.runs ?? []) {
    if (run.id === excludeRunId) continue;
    x.push(run.x, run.x + run.width);
    z.push(run.z, run.z + run.height);
  }
  return { x, z };
}
```

`run.z` and `run.height` are the resolved values `syncRoom` writes, so the targets are
the boxes as drawn.

---

## §5 Plan alignment guides (step 43)

### §5.1 Order of precedence

The plan pointer pipeline today is `toWorld` → `gridAndOrtho` → `snapToEndpoint`.
Alignment is **weakest** and goes last, and only when no endpoint snap fired:

1. grid + ortho (unchanged),
2. endpoint snap within `ENDPOINT_SNAP_RADIUS` — if it fires, use it, draw no guide
   (it already creates a connection, which is a stronger statement than alignment),
3. otherwise alignment snap, and draw a guide for each axis that moved.

### §5.2 Ortho must not be broken

Under Ortho the drawn point shares one coordinate with the fixed start, and snapping
that coordinate would tilt the wall. So only the free axis may snap: a horizontal segment
(`y` equal to the fixed `y`) may snap `x`; a vertical one may snap `y`. With Ortho off,
both axes are free.

### §5.3 `plan/PlanCanvas.jsx` (1,068 lines) — the four sites

Add beside `ENDPOINT_SNAP_RADIUS` (line 70):

```js
const ALIGNMENT_SNAP_PX = 6;
```

Add state beside `wallDrawStart` (line 148):

```js
  const [alignmentGuides, setAlignmentGuides] = useState([]);
```

Add one callback after `gridAndOrtho` (lines 410–415), which owns both the axis rule and
the guide state:

```js
  const applyAlignment = useCallback((point, { fixed = null, excludeWallId = null } = {}) => {
    const axes = !fixed || !settings.orthoWalls
      ? ['x', 'y']
      : (Math.abs(point.y - fixed.y) <= 1e-6 ? ['x'] : ['y']);
    const result = snapToAlignment(
      point,
      endpointAlignmentTargets(walls, excludeWallId),
      ALIGNMENT_SNAP_PX / scale,
      axes,
    );
    setAlignmentGuides(result.guides);
    return result.point;
  }, [scale, settings.orthoWalls, walls]);
```

The four places that compute `const point = endpointSnap ? … : snapped` each become
"endpoint snap wins, else align":

| Site | Lines | Call |
|---|---|---|
| `handleStageClick`, wall tool | 431–436 | `applyAlignment(snapped, { fixed })` when no endpoint snap; `setAlignmentGuides([])` when there is one |
| `handleMouseMove`, `entry.kind === 'wall-draw'` | 489–497 | `applyAlignment(snapped, { fixed: wallDrawStart })` |
| `handleMouseMove`, preview tail | 526–530 | `applyAlignment(snapped, { fixed: wallDrawStart })` |
| `handleWallEndpointDrag` | 606–619 | `applyAlignment(snapped, { fixed, excludeWallId: wallId })` |

In the `wall-draw` entry branch the aligned point must be the one the length readout is
computed from (lines 499–504 `dx`/`dy`/`length`), so the typed number matches the drawn
wall. In `handleWallEndpointDrag` the aligned point is what goes to
`event.target.position(point)` and `moveWallEndpoint`, and `excludeWallId` keeps the
dragged wall's own endpoints out of the candidate list.

Clear the guides in three places: `cancelDrawing` (lines 262–265), the `dragend` branch
of `handleWallEndpointDrag`, and right after each `dispatch(addWallSegment(...))` in
`handleStageClick`.

### §5.4 `plan/PlanAlignmentGuides.jsx` (new)

```jsx
import { Line } from 'react-konva';

const GUIDE_EXTENT = 10000;

/** Dashed full-canvas lines marking the axes that a snap aligned to. */
export default function PlanAlignmentGuides({ guides = [], scale }) {
  return (
    <>
      {guides.map((guide) => (
        <Line
          key={`${guide.axis}:${guide.value}`}
          points={guide.axis === 'x'
            ? [guide.value, -GUIDE_EXTENT, guide.value, GUIDE_EXTENT]
            : [-GUIDE_EXTENT, guide.value, GUIDE_EXTENT, guide.value]}
          stroke="#f472b6"
          strokeWidth={1 / scale}
          dash={[6 / scale, 4 / scale]}
          listening={false}
        />
      ))}
    </>
  );
}
```

`GUIDE_EXTENT` matches `canvas/components/AxisGuides.jsx`, which is the same trick.
Pink (`#f472b6`) is unused elsewhere in the plan canvas — the axes are red/green, wall
previews cyan, selection blue — so a guide reads as its own thing.

Render it immediately after `<AxisGuides scale={scale} />` (line 891):

```jsx
            <PlanAlignmentGuides guides={alignmentGuides} scale={scale} />
```

---

## §6 Elevation alignment guides (step 44)

### §6.1 Everything happens in `ElevationCanvas.jsx`

`RunGroup.jsx` reports the dragged handle's wall x through
`onStretchMove(run.id, side, wallXFromHandle(event))` and `ElevationCanvas` turns that
into a `stretchRun` call. So the snap belongs in `previewStretch` and `finishStretch`,
and `RunGroup.jsx` is not opened at all this step.

Add near the top of the component file:

```js
const ALIGNMENT_SNAP_PX = 6;
```

State beside `stretchPreview` (line 91):

```js
  const [alignmentGuides, setAlignmentGuides] = useState([]);
```

Helper, near `wallPointFromEvent` (line 473):

```js
  const applyRunAlignment = useCallback((point, excludeRunId = null, axes = ['x']) => {
    if (!wall || !transform) return point;
    const result = snapToAlignment(
      point,
      runAlignmentTargets(wall, excludeRunId),
      ALIGNMENT_SNAP_PX / transform.scale,
      axes,
    );
    setAlignmentGuides(result.guides);
    return result.point;
  }, [transform, wall]);
```

### §6.2 Stretching a run end

In `previewStretch` (lines 592–604) and `finishStretch` (lines 612–630), snap the incoming
edge before it reaches `stretchRun`:

```js
    const alignedEdgeX = applyRunAlignment({ x: newEdgeX }, runId).x;
```

then pass `alignedEdgeX` to `stretchRun`. `excludeRunId = runId` keeps the dragged run's
own two edges out of its candidate list. `finishStretch` clears the guides
(`setAlignmentGuides([])`) in the same place it clears `stretchPreview` (line 613), and so
does the Esc handler at line 356.

Only the `x` axis snaps here — the handle's `dragBoundFunc` locks `y`, so a z guide would
be a line the drag can never reach.

### §6.3 Drawing a new run

`handleMouseDown` (line 487), `handleMouseMove` (line 496) and `handleMouseUp` (line 503)
all funnel through `wallPointFromEvent` (line 473). Align its result on both axes there —
a new run being dragged out has no id to exclude:

```js
    const point = applyRunAlignment(raw, null, ['x', 'z']);
```

`handleMouseUp` clears the guides alongside `cancelDrag()`, and so does the existing
`cancelDrag` path in the keydown handler (line 355).

Note that `screenPointToWallSnapped` rounds to the ½" draw increment first, so an
alignment snap can land the point off that increment — on the neighbouring run's actual
edge, for example 30 5/8. That is the point of the feature and is not a bug.

### §6.4 `components/ElevationAlignmentGuides.jsx` (new)

Elevation guides are drawn in screen space, since that canvas draws everything through
`wallToScreen` rather than a scaled Layer:

```jsx
import { Line } from 'react-konva';
import { wallToScreen } from '../canvas/transform.js';

/** Dashed full-canvas lines marking the axes that a run snap aligned to. */
export default function ElevationAlignmentGuides({
  guides = [],
  transform,
  width,
  height,
}) {
  if (!transform) return null;
  return (
    <>
      {guides.map((guide) => {
        const point = wallToScreen(
          guide.axis === 'x' ? { x: guide.value, z: 0 } : { x: 0, z: guide.value },
          transform,
        );
        return (
          <Line
            key={`${guide.axis}:${guide.value}`}
            points={guide.axis === 'x'
              ? [point.x, 0, point.x, height]
              : [0, point.y, width, point.y]}
            stroke="#f472b6"
            strokeWidth={1}
            dash={[6, 4]}
            listening={false}
          />
        );
      })}
    </>
  );
}
```

Render it inside the existing `<Layer listening={false}>` that holds `NeighborReturns`
(line ~700), after it:

```jsx
            <ElevationAlignmentGuides
              guides={alignmentGuides}
              transform={transform}
              width={viewport.width}
              height={viewport.height}
            />
```

### §6.5 Out of scope on purpose

Openings are not alignment candidates this round. A run end landing on a casing edge is
what `run.anchors[side] = {to: 'opening', …}` with a clearance already does properly
(step 31), and a soft snap that mimics it without recording it would be misleading.
`model/dimensions.js`, `model/splitRun.js` and `model/stretchRun.js` are not touched.

---

## §7 Fallback: only if step 40 breaks `persistence.test.js`

§2.4 argues no persistence change is needed. If the suite disagrees, the smallest fix
that preserves saved documents is a fill in `normalizeV3Document`
(`store/persistence.js` lines 264–295), which `loadElevationDocument` (line 479) already
runs before `isElevationDocument`:

```js
    settings: normalized.settings && typeof normalized.settings === 'object'
      ? {
        ...normalized.settings,
        defaultProfile: normalized.settings.defaultProfile
          && typeof normalized.settings.defaultProfile === 'object'
          ? {
            ...normalized.settings.defaultProfile,
            wallHeight: normalized.settings.defaultProfile.wallHeight
              ?? DEFAULT_PROFILE.wallHeight,
          }
          : normalized.settings.defaultProfile,
      }
      : normalized.settings,
```

plus, in the room map that already normalizes openings:

```js
        profile: room.profile && typeof room.profile === 'object'
          ? { ...room.profile, wallHeight: room.profile.wallHeight ?? DEFAULT_PROFILE.wallHeight }
          : room.profile,
```

and, if v2 documents are the thing complaining, excluding the key from `V2_PROFILE_KEYS`
(line 39): `.filter((key) => key !== 'crownStackHeight' && key !== 'wallHeight')`.

Do **not** fill `wall.profile` — it is an optional override object
(`isOptionalNumericObject`, line 205) where an absent key correctly means "inherit from
the room". Treat this section as a rescue, not as part of the step: if it is needed, say
so in the summary.

---

## §8 Tests

New file `canvas/__tests__/alignment.test.js` for tests 1–7; tests 8–10 go in
`store/__tests__/elevationSlice.test.js` (step 40); tests 11–14 likewise (step 41).
No new persistence test — see §2.4.

1. **`snapAxis` takes the nearest candidate inside tolerance.**
   `snapAxis(12.4, [0, 12, 24], 1)` → `12`. `snapAxis(12.4, [0, 24], 1)` → `null`.
2. **A tie goes to the smaller candidate.** `snapAxis(12, [11.5, 12.5], 1)` → `11.5`.
3. **`snapToAlignment` moves both axes and reports both guides.**
   `snapToAlignment({x: 12.4, y: 47.6}, {x: [12], y: [48]}, 1)` →
   `point` `{x: 12, y: 48}`, `guides` `[{axis: 'x', value: 12}, {axis: 'y', value: 48}]`.
4. **The `axes` argument restricts snapping.** Same inputs with `['x']` →
   `point` `{x: 12, y: 47.6}`, `guides` `[{axis: 'x', value: 12}]`.
5. **Nothing in range leaves the point alone.**
   `snapToAlignment({x: 5, z: 5}, {x: [40], z: [40]}, 1)` → `point` `{x: 5, z: 5}`,
   `guides` `[]`.
6. **`endpointAlignmentTargets` excludes a named wall.** Walls
   `A {id: 'a', x1: 0, y1: 0, x2: 120, y2: 0}` and
   `B {id: 'b', x1: 120, y1: 0, x2: 120, y2: 96}`. With no exclusion:
   `{x: [0, 120, 120, 120], y: [0, 0, 0, 96]}`. Excluding `'b'`: `{x: [0, 120], y: [0, 0]}`.
7. **`runAlignmentTargets` reads resolved run boxes and excludes one.** Runs
   `{id: 'r1', x: 12, width: 36, z: 4, height: 30.5}` and
   `{id: 'r2', x: 60, width: 24, z: 54, height: 30}` on one wall. Excluding `'r1'`:
   `{x: [60, 84], z: [54, 84]}`.
8. **`updateRoomProfile` sets the room's wall height without touching walls.**
   `updateRoomProfile({roomId: 'room-1', key: 'wallHeight', value: 108})` →
   `room.profile.wallHeight === 108`, and the existing wall's `height` is still `96`.
9. **`addWall` uses the room's wall height.** With `room.profile.wallHeight = 108`,
   `addWall({roomId: 'room-1'})` → the new wall's `height === 108`.
10. **`addWallSegment` uses it too, and an explicit height still wins.** With
    `room.profile.wallHeight = 108`,
    `addWallSegment({roomId: 'room-1', x1: 0, y1: 60, x2: 120, y2: 60})` → `height === 108`;
    the same payload plus `height: 84` → `height === 84`.
11. **`centerRoomOnOrigin` translates every wall.** Room with
    `A {x1: 0, y1: 0, x2: 120, y2: 0}` and `B {x1: 120, y1: 0, x2: 120, y2: 96}`
    (bounding box x `0…120`, y `0…96`, so the delta is `(-60, -48)`) →
    A becomes `(-60, -48) → (60, -48)` and B becomes `(60, -48) → (60, 48)`.
12. **Centering twice changes nothing.** Dispatching it again on the result of test 11
    leaves all eight coordinates as test 11 left them.
13. **Centering preserves wall-local content and topology.** With a run
    `{x: 12, width: 36}` on wall A and A/B connected, after centering the run's `x` is
    still `12`, `wallOrder` is unchanged, and `A.connections.end` still points at B.
14. **An empty room is a no-op.** `centerRoomOnOrigin` on a room with no walls leaves the
    room object's `walls` empty and does not throw.

---

## §9 Step budget

| Step | Files | Lines read | Tests |
|---|---|---:|---|
| 39 labels | PlanElevationMarker, ElevationCanvas | ~865 | none |
| 40 wall height | constants, RoomHeightsPanel, SettingsPanel, elevationSlice | ~1,265 | 8–10 |
| 41 center room | elevationSlice, ElevationToolbar | ~1,040 | 11–14 |
| 42 alignment module | new file only | ~0 | 1–7 |
| 43 plan guides | PlanCanvas, new guides file | ~1,070 | none |
| 44 elevation guides | ElevationCanvas, new guides file | ~820 | none |

No step exceeds the ~2,500-line read budget from `PROMPT-CONVENTIONS.md`, and
`PropertiesPanel.jsx` (1,656 lines) is not opened by any of the six.
