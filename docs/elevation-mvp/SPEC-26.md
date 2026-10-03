# Elevation Lab — SPEC-26 (phantom moldings, phantom dimension)

Steps 135–137. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-25 must be done first. SPEC-27 is independent of this file and its steps may be run before, after, or between these.

Three corrections to what SPEC-24 landed, all about the outline a neighbouring wall's run casts into this elevation.

## After this SPEC you can

- Read the width a neighbouring run reaches into this elevation in the dimension stack below the floor, with every other horizontal dimension, instead of floating in the middle of the drawing.
- See the toe kick, top mold and crown on that run's outline, so it reads as the cabinet it is rather than a bare rectangle.
- Get a dimension row that has been pushed out to clear something that draws the same size it would against a bare wall — the row moves out, its leader lines do not stretch to follow.

## Not in this SPEC

- The countertop on a neighbouring run's outline. Toe kick, top mold and crown only, which is what reads as "cabinet" in elevation. Easy to add later in the same place.
- Any change to which parts exist, their numbers, or the horizontal chains on this wall. The neighbour dimension is its own row, built from `neighborProfiles`; `horizontalChains` is untouched.
- The toe kick's 3" end inset on a neighbour outline. The outline is a slice of a run, and which end of the run it came from is not tracked; the strip spans the slice.

---

## §1 The neighbour outline carries its moldings (`model/neighborProfiles.js`, `model/wallExtent.js`)

Each entry `neighborProfiles` returns gains one field:

```js
moldings: [{ kind, z, height }]   // kind: 'toeKick' | 'topMold' | 'crown'
```

built from the neighbouring run by the same tests `RunGroup` draws by, with `profile = resolveProfile(settings, room, neighbor)` and `view = wallSideView(neighbor, side)`:

| kind | when | rect |
|---|---|---|
| `toeKick` | `cabinetTypeId` is `BASE` or `TALL`, and `run.overrides?.toeKickHeight ?? profile.toeKickHeight` is greater than zero | `{ z: 0, height: that toe kick height }` |
| `topMold` | `heightMode === 'auto'`, type `UPPER` or `TALL`, and `runMolding(view, run, profile) !== 'none'` | `{ z: boxTop, height: profile.topMoldHeight }` |
| `crown` | the same test with `runMolding(view, run, profile) === 'crown'` | `{ z: boxTop + profile.crownStackHeight - profile.crownHeight, height: profile.crownHeight }` |

`boxTop` is `run.z + run.height`. The entries are in `['toeKick', 'topMold', 'crown']` order and the array is `[]` when the run carries none. Every strip spans the profile's own `x` and `width` — a neighbour outline is a slice of a run, and the drawing side reads the span off the entry, so `moldings` carries only the vertical band.

New imports in `neighborProfiles.js`: `CABINET_TYPE_IDS` from `./constants.js`, `resolveProfile` from `./profile.js`, `runMolding` from `./soffits.js`. Neither `profile.js` nor `soffits.js` imports `neighborProfiles.js` or `wallExtent.js`, so there is no cycle.

**`wallExtent.js`** — its `neighborProfiles` loop (42–45) also grows the top for the strips, so a phantom with crown is not clipped:

```js
for (const molding of profile.moldings) {
  extent.top = Math.max(extent.top, molding.z + molding.height);
}
```

The bottom does not move: a toe kick starts at zero.

## §2 Drawing them, and dropping the inline dimension (`components/NeighborProfiles.jsx`)

The width dimension SPEC-24 §5 put across the middle of each outline goes away entirely — §3 puts it in the dimension stack instead. `DIMENSION_FONT_SIZE`, `TICK_HALF_LENGTH`, `TEXT_BOX_WIDTH`, `MIN_DIMENSION_PX`, the `Line`s, the `Text` and the `formatInches` import all go with it.

What is left is the outline, unchanged — solid, `stroke="#64748b"`, `strokeWidth={1}` — plus one `Rect` per molding, drawn after it:

| kind | fill | opacity | stroke |
|---|---|---|---|
| `toeKick` | `#111827` | 1 | `#334155` |
| `topMold` | `#94a3b8` | 0.55 | `#cbd5e1` |
| `crown` | `#e2e8f0` | 0.5 | `#f8fafc` |

Each at `wallRectToScreen({ x: profile.x, z: molding.z, width: profile.width, height: molding.height }, transform)`, `strokeWidth={1}`, `listening={false}`. Same colours `RunGroup` uses, at lower opacity for the two molding strips so a neighbour still reads as behind rather than as part of this wall.

## §3 The phantom width joins the dimension stack (`canvas/dimensionLayout.js`, `components/DimensionRow.jsx`, `components/ElevationCanvas.jsx`)

### §3.1 A row of its own

**`dimensionLayout.js`** — `belowRowOffsets` gains a `neighbors` level between `openings` and `label`, so the elevation label stays below everything:

```js
export function belowRowOffsets({
  clearances: clearanceLevels = 0,
  pieces: pieceLevels = 0,
  overall: overallLevels = 0,
  openings: openingLevels = 0,
  neighbors: neighborLevels = 0,
} = {}) {
  const clearances = 20;
  const pieces = clearances + 22 + clearanceLevels * 14;
  const overall = pieces + 22 + pieceLevels * 14;
  const openings = overall + 22 + overallLevels * 14;
  const neighbors = openings + 22 + openingLevels * 14;
  const label = neighbors + 22 + neighborLevels * 14;
  return { clearances, pieces, overall, openings, neighbors, label };
}
```

**`ElevationCanvas`** — the `dimensionChains` memo (198–225) gains one chain, built straight from `neighborProfiles` and deduplicated, because a base and an upper on the same neighbouring run project the same span at different heights and want one dimension, not two:

```js
const seen = new Set();
const neighbors = neighborProfiles(room, wall, settings)
  .map((profile) => ({
    start: profile.x,
    end: profile.x + profile.width,
    kind: 'neighbor',
  }))
  .filter((segment) => {
    const key = `${segment.start.toFixed(4)}:${segment.end.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .sort((a, b) => a.start - b.start);
```

returned as `neighbors` alongside `lower`, `upper`, `openings`, `clearances` and `vertical`.

The chain is not contiguous — a left-hand phantom and a right-hand one leave a gap across the wall — and `DimensionRow` handles that already: it draws a leader and a tick per boundary value and a line per segment, with nothing in between.

`dimensionOffsets` (444–510) measures its levels like the others and returns `neighbors: below.neighbors + clear.below`. `label` keeps its `below.label + clear.below`, which now sits one row lower.

The row renders after the openings row and before the elevation label:

```jsx
<DimensionRow
  segments={dimensionChains.neighbors}
  orientation="horizontal"
  side="below"
  offsetPx={dimensionOffsets.neighbors}
  transform={transform}
  edgeGapPx={dimensionOffsets.clear.below}
  wallEndMarks={[0, wall.length]}
  cursor={cursor}
/>
```

`DimensionRow`'s `KIND_COLORS` gains `neighbor: '#94a3b8'`.

`fitWallToViewport`'s bottom padding (405–419) grows for the extra row:
`bottom: (dimensionChains?.openings.length > 0 ? 152 : 96) + (dimensionChains?.neighbors.length > 0 ? 28 : 0)`,
with `dimensionChains?.neighbors.length` added to the memo's dependency list.

### §3.2 A row that moved out keeps its leader length

`dimensionOffsets` already pushes a row outward by `clear.*` — `Math.max(0, -extent.left) * scale` and its three siblings — so the row itself clears whatever hangs past the wall. But `DimensionRow` draws every leader from the wall edge out to the row, so the leaders stretch by the same amount and run straight through the thing the row moved out to clear.

**`DimensionRow`** gains one optional prop, `edgeGapPx = 0`: how far outward from the wall edge a leader starts. In the `boundaries` map (125–146), the leader `Line` runs from

```js
{ x: edge.x + outward.x * edgeGapPx, y: edge.y + outward.y * edgeGapPx }
```

to `row` instead of from `edge` to `row`. Its length is `offsetPx - edgeGapPx` — the same length it would be against a bare wall. Nothing else in the component changes: `rowPoint`, the ticks, the wall end marks, the segments and the labels are all measured from `offsetPx` as they are now.

**`ElevationCanvas`** — `dimensionOffsets` returns the clearances it already computes, `clear: { below, above, left, right }`, and every `DimensionRow` is passed the one for its side: `clear.below` for the four below-wall rows and the new neighbour row, `clear.above` for the two upper rows, `clear.left` and `clear.right` for the vertical columns.

---

## §4 Tests

Numbering continues from SPEC-25 (last was 212). Expect 502 passing before step 135.

### Step 135 (`src/elevation/model/__tests__/wallExtent.test.js`)

**Test 189 changes.** Both expected `neighborProfiles` entries gain `moldings: [{ kind: 'toeKick', z: 0, height: 4 }]` — `base()` is a `BASE` run at `heightMode: 'manual'`, so it carries a toe kick and nothing else, and 4 is `DEFAULT_SETTINGS.defaultProfile.toeKickHeight`. Test 190's expectations are `[]` either way and do not change. Test 191 does not change.

**213.** A neighbouring upper carries its top mold and crown.

```js
const crownRoom = straightRoom({
  wallB: {
    runs: [run('U1', CABINET_TYPE_IDS.UPPER, 12, {
      x: 0, width: 30, z: 54, height: 36, heightMode: 'auto',
    })],
  },
});
```

`neighborProfiles(crownRoom, view(crownRoom, 'A'), DEFAULT_SETTINGS)` equals

```js
[{
  key: 'B:front:U1:right',
  wallId: 'B',
  runId: 'U1',
  side: 'front',
  x: 120,
  width: 30,
  z: 54,
  height: 36,
  moldings: [
    { kind: 'topMold', z: 90, height: 3 },
    { kind: 'crown', z: 91.5, height: 4.5 },
  ],
}]
```

Those are the same numbers SPEC-23 test 202 asserts for an auto upper under `DEFAULT_SETTINGS.defaultProfile`: box top 90, a 3" top mold on it, and the crown 1 1/2" above that at 4 1/2" tall.

**214.** The extent grows for a neighbour's crown. With the same room built on a shorter wall A —
`straightRoom({ wallA: { height: 90 }, wallB: { runs: [ the same U1 ] } })` —
`wallExtent(room, view(room, 'A'), DEFAULT_SETTINGS)` equals `{ left: 0, right: 150, top: 96, bottom: 0 }`.

Wall A is 90 tall and carries nothing; 96 is the top of the neighbour's crown, and 150 is the far end of its outline.

Expect 504 passing.

### Steps 136–137

No tests. Drawing only, checked by hand.
