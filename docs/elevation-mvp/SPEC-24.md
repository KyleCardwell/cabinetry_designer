# Elevation Lab — SPEC-24 (badges on top, staggered moldings, phantom widths)

Steps 124–127. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-23 must be done first.

Three drawing fixes to what SPEC-23 landed, plus one to the neighbouring-run outlines.

## After this SPEC you can

- Read every part number. Nothing on the elevation draws over one — not a run added later, not a joint marker, not a wall end panel, not a neighbour's return.
- Tell the crown badge from the top mold badge. The three molding badges step left, centre and right instead of stacking on one another.
- See how far a run on a neighbouring wall reaches past this wall's end, dimensioned, drawn with a solid line instead of a dashed one.

## Not in this SPEC

- Blind corners. Separate SPEC.
- Any change to which parts get numbers, what order they are numbered in, or what number a part gets. `partNumbers()` itself is untouched; only `wallMoldingBadges` gains a field and one new function is added beside it.
- Any change to the badge lift/level algorithm in `canvas/partNumberLayout.js`. Badges still lay out one run at a time, exactly as today; only the layer they draw in changes.
- A toggle for the phantom dimension. It draws whenever the outline draws.

---

## §1 Why the numbers hide

`PartNumberBadges` draws inside `RunGroup`, and `RunGroup` draws in `ElevationCanvas`'s second `Layer` (1482–1543) in `wall.runs` order — insertion order, not left-to-right and not bottom-to-top. Four things therefore draw over a badge that is already on the stage:

| Drawn after a run's badges | Where |
|---|---|
| any run later in `wall.runs` — its `PieceRect` fills | `ElevationCanvas` 1504–1528 |
| `JointMarkers` | `ElevationCanvas` 1529–1542 |
| `NeighborReturns` (fill `#475569` at 0.26 plus hatch), `WallEndPanelShapes` (fill at 0.55) | the overlay `Layer` 1544–1577 |
| `MoldingBadges` | same overlay `Layer` |

The fix is not to reorder any of that. It is to draw every badge in one `Layer` of its own, last in the `Stage`, so nothing can be over a number by construction.

`ElevationCanvas` also passes `partNumbers={partNumbering}` to `NeighborReturns` (1549), which has no such prop and ignores it. That goes away with the rest.

## §2 Badge groups for one elevation (`model/partNumbers.js`)

One new export. `wall` is an elevation side view — the same thing `wallMoldingBadges` takes, and the same thing `ElevationCanvas` holds in `wall`.

```js
/**
 * Every part-badge group on one elevation, in draw order.
 * Each group lays out independently, exactly as RunGroup laid one run out.
 * @returns {{key: string, lift: number, pieces: object[]}[]}
 */
export function wallBadgeGroups(room, wall, settings) {
  const groups = wall.runs.map((run) => ({
    key: `run:${run.id}`,
    lift: 0,
    pieces: splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, wall, run),
      pinTargets: pinTargetsForRun(run, wall, wallLength(wall), settings),
    }).pieces,
  })).filter((group) => group.pieces.length > 0);

  for (const panel of wallEndPanels(room, wall, settings)) {
    const side = panel[wall.side ?? 'front'];
    groups.push({
      key: `panel:${panel.endpoint}`,
      lift: 1,
      pieces: [{
        id: wallEndPanelPartKey(wall.id, panel.endpoint),
        x: side.x,
        z: 0,
        width: panel.width,
        height: panel.top,
      }],
    });
  }

  return groups;
}
```

These are the *undropped* pieces — `splitRun(...).pieces`, never `RunGroup`'s `drawnPieces`. A style drop stretches fillers and panels downward and would step their badges out of line with the cabinets beside them. This is the same options block and the same rule SPEC-23 §4 set; only the caller moves.

Runs stay in `wall.runs` order. Each group lays out on its own, so order between groups does not matter, and nothing about `layoutPartBadges` or `partBadgeLevels` changes.

`model/index.js` adds `wallBadgeGroups` to the existing `./partNumbers.js` export block (133–139).

## §3 Molding badge slots (`model/partNumbers.js`, `components/MoldingBadges.jsx`)

The top mold strip sits at `boxTop` and the crown strip starts `crownStackHeight − crownHeight` above it — with a 6" crown over a 3" top mold, 1 1/2" apart. Their pills are 20px tall and both centre on the run, so the crown pill covers the top mold pill at any normal zoom.

Each badge gets a horizontal slot instead:

```js
/** Horizontal slot for each molding badge: -1 left of centre, 0 centre, 1 right. */
export const MOLDING_BADGE_SLOTS = { toeKick: 0, topMold: -1, crown: 1 };
```

`wallMoldingBadges` returns `slot: MOLDING_BADGE_SLOTS[molding]` on every entry, alongside `molding`, `key`, `number`, `label` and the rect. Nothing else about it changes. `model/index.js` exports `MOLDING_BADGE_SLOTS`.

`MoldingBadges` offsets by its own measured width, so two neighbouring slots can never touch whatever the numbers are:

```js
const MOLDING_BADGE_GAP = 4;
...
const centerX = rect.x + rect.width / 2 + badge.slot * (width + MOLDING_BADGE_GAP);
```

`width` is the `partBadgeWidth(text)` it already computes. No clamping to the run: on a run too narrow for three pills the outer two simply hang past its edges, which reads better than three pills on top of each other.

## §4 The part number layer (`components/PartNumberLayer.jsx` new, `RunGroup`, `WallEndPanelShapes`, `ElevationCanvas`)

**`PartNumberLayer`** — new, `{ room, wall, settings, partNumbers, transform }`, returns `null` when `partNumbers` is null:

```jsx
<Group listening={false}>
  {wallBadgeGroups(room, wall, settings).map((group) => (
    <PartNumberBadges
      key={group.key}
      pieces={group.pieces}
      numbers={partNumbers.byKey}
      overrideKeys={partNumbers.overrideKeys}
      transform={transform}
      lift={group.lift}
    />
  ))}
  <MoldingBadges
    room={room}
    wall={wall}
    settings={settings}
    partNumbers={partNumbers}
    transform={transform}
  />
</Group>
```

`PartNumberBadges` and `MoldingBadges` are unchanged apart from §3's `centerX` line.

**`RunGroup`** — drop the `partNumbers` prop (37), the `PartNumberBadges` import (28) and the element after the `faceLayouts` block (318–325). Nothing else in the file changes.

**`WallEndPanelShapes`** — drop the `partNumbers` prop, the `PartNumberBadges` and `wallEndPanelPartKey` imports, and the badge element. The `piece` object it builds stays as the source of the rect it draws; it just no longer carries a badge. `wallBadgeGroups` builds the same rect from the same `wallEndPanels` entry.

**`ElevationCanvas`** — four edits, nothing else:

- the import block (45–112): add `PartNumberLayer`; `MoldingBadges` stays imported, `partNumbers` stays imported.
- the live `RunGroup` (1504–1528): remove `partNumbers={partNumbering}` (1512).
- `NeighborReturns` (1545–1551): remove `partNumbers={partNumbering}` (1549) — the component never had the prop.
- the overlay `Layer` (1544–1577): remove the `<MoldingBadges …/>` element (1564–1570).
- a new `Layer`, last in the `Stage`, after the `dragPreview` block and immediately before `</Stage>`:

```jsx
{partNumbering && (
  <Layer listening={false}>
    <PartNumberLayer
      room={room}
      wall={wall}
      settings={settings}
      partNumbers={partNumbering}
      transform={transform}
    />
  </Layer>
)}
```

Last in the `Stage` is the whole point: a number drawn there is over the runs, the joint markers, the returns, the end panels, the dimension rows and both previews. The `partNumbering` memo (190–193) is unchanged and is still computed once per render for the whole room.

## §5 Neighbour outlines: solid, with a width (`components/NeighborProfiles.jsx`)

`neighborProfiles(room, wall, settings)` already returns one rect per neighbouring run per span that reaches past this wall's end, with `x` negative on the left or `> length` on the right and `width` equal to how far it reaches. The model is right; only the drawing changes.

- The rect loses `dash` and draws solid, `stroke="#64748b"`, `strokeWidth={1}`.
- Each rect wide enough on screen gains a width dimension across its middle: a line from edge to edge, a tick at each end, and `formatInches(profile.width)` centred above the line.

```js
const DIMENSION_FONT_SIZE = 11;
const TICK_HALF_LENGTH = 4;
const TEXT_BOX_WIDTH = 80;
/** Below this on-screen span the dimension is dropped and the outline draws alone. */
const MIN_DIMENSION_PX = 10;
```

Per profile, with `rect = wallRectToScreen(profile, transform)` and `y = rect.y + rect.height / 2`:

| element | geometry |
|---|---|
| dimension line | `points={[rect.x, y, rect.x + rect.width, y]}`, `stroke="#94a3b8"`, `strokeWidth={1}` |
| left tick | `points={[rect.x, y - TICK_HALF_LENGTH, rect.x, y + TICK_HALF_LENGTH]}`, same stroke |
| right tick | the same at `rect.x + rect.width` |
| text | `text={formatInches(profile.width)}`, `x: rect.x + rect.width / 2 - TEXT_BOX_WIDTH / 2`, `y: y - DIMENSION_FONT_SIZE - 4`, `width: TEXT_BOX_WIDTH`, `align="center"`, `fontSize={DIMENSION_FONT_SIZE}`, `fill="#e2e8f0"` |

The text box is a fixed 80px so a number wider than a narrow profile still reads, centred, rather than being wrapped by Konva into the rect. The whole thing stays `listening={false}` in the same overlay `Layer` it draws in now.

`formatInches` comes from `../model/units.js`.

---

## §6 Tests

Numbering continues from SPEC-23 (last was 204). Expect 494 passing before step 124.

### Step 124 (`src/elevation/model/__tests__/partNumbers.test.js`)

**Test 202 changes.** `wallMoldingBadges` now returns a `slot`, so the three wall-A entries gain `slot: 0`, `slot: -1` and `slot: 1` in `toeKick`/`topMold`/`crown` order, and the single wall-B entry gains `slot: 0`. Nothing else in 202 changes.

**205.** `wallBadgeGroups`, using the fixtures already in the file.

- On room P's wall A front view — `wallBadgeGroups(partRoom(), wallSideView(wallA, 'front'), DEFAULT_SETTINGS)`:
  - `.map(({ key }) => key)` is `['run:A-base', 'run:A-upper']`;
  - `.map(({ lift }) => lift)` is `[0, 0]`;
  - `.map(({ pieces }) => pieces.map(({ id }) => id))` is
    `[['A-base:left', 'a1', 'a2', 'A-base:right'], ['a3']]`.
- On room E's wall W front view — the room built in test 203, `wallBadgeGroups(room, wallSideView(wallW, 'front'), DEFAULT_SETTINGS)`:
  - `.map(({ key }) => key)` is `['run:W-base', 'panel:start', 'panel:end']`;
  - `.map(({ lift }) => lift)` is `[0, 1, 1]`;
  - the `panel:start` group's `pieces` is
    `[{ id: 'W:endPanel:start', x: 0, z: 0, width: 0.75, height: 34.5 }]`;
  - the `panel:end` group's `pieces` is
    `[{ id: 'W:endPanel:end', x: 119.25, z: 0, width: 0.75, height: 34.5 }]`.

  119.25 is `frame.length - panel.width`; 34.5 is the anchored run's `z + height`, 4 + 30.5. Build room E by lifting test 203's `syncRoom({...})` literal into a helper both tests call — don't duplicate it.

Expect 495 passing.

### Steps 125–127

No tests. Drawing only, checked by hand.
