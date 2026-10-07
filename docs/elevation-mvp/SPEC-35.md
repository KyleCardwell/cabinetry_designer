# Elevation Lab — SPEC-35 (run tops, parts below a run, stacked runs, outset)

Steps 191–201, round 35 of CELLS-PLAN. The earlier SPEC files still apply; this file is the source of truth for
what follows. The repo is at `127d7bc` (step 190) on `elevation-grid-run-split`, with **642** tests passing.

Like 34.1–34.3, this round was **not** built before it was written; the expected values were worked out against
the code at `127d7bc` (existing-behaviour numbers were checked by running the current model). If a new test fails
by a small amount, check the SPEC's arithmetic against the code before changing the code, and say which was wrong.

| Step | What | Files |
|---|---|---|
| **191** | Shape: `run.top` takes any top, `run.bottom`, `run.stack`, `run.outset`, three settings. Saves accept them. Nothing reads them yet. | `constants.js`, `styles.js`, NEW `bottoms.js`, `index.js`, `room.js` (cloneRun), `persistence.js`, its test |
| **192** | Model: `runTop` — the top a run carries, decoupled from type. REV-002 follows a wood top on any type, top cells only. | NEW `tops.js`, `styles.js`, `faceLayouts.js`, `index.js`, NEW `tops.test.js` |
| **193** | Tops in chains, part numbers, neighbour profiles and extents. | `dimensions.js`, `partNumbers.js`, `neighborProfiles.js`, `wallExtent.js`, `tops.test.js` |
| **194** | Tops on screen: drawn from `runTop`; the Top select on every run type. | `RunGroup.jsx`, `RunFaceOptions.jsx`, slice, slice test |
| **195** | Model: parts below a run; REV-011 bottom reveals; end panels drop to the doors. | `bottoms.js`, `styles.js`, `index.js`, NEW `bottoms.test.js` |
| **196** | Parts below on screen: drawn; "Below the run" list in the panel. | `RunGroup.jsx`, NEW `RunBottomSection.jsx`, `RunProperties.jsx`, slice, slice test |
| **197** | Model: stacked runs — a run sits on another's top and/or is held under another's bottom, one-way; fills between. | NEW `stacks.js`, `room.js`, `overlap.js`, `index.js`, NEW `stacks.test.js` |
| **198** | One vertical chain per stack; parts below in the pair chain. | `dimensions.js`, `stacks.test.js` |
| **199** | Stacks in the panel: Sits on / Held under, gap, description; no toe kick under a stacked run. | slice, slice test, `RunHeightsSection.jsx`, `RunGroup.jsx` |
| **200** | `run.outset`: distance off the wall, in plan, corners and the panel. | `corners.js`, `footprints.js`, `planPieces.js`, `neighborProfiles.js`, `RunGeometrySection.jsx`, NEW `outset.test.js` |
| **201** | An auto upper's clearance measures from the real top of whatever stands below it (base or tall, manual or auto, with whatever top it carries). | `profile.js`, `room.js`, `WarningsList.jsx`, `tops.test.js` |

## After this round you can

- Give any run any top: a base with crown, a tall with a shop-built wood top, an upper with a top mold or
  nothing. Leave it on Default and it does exactly what it does today.
- Hang parts below a run, listed top to bottom: light rail, light trough, panel, bottom cap, corbels. Each has a
  height and says whether the doors **cover** it, stop **flush** above it, or leave it **visible**. The bottom
  reveal follows (REV-011): −1 5/8" over a covered 1 1/2" light rail, −7/8" over a covered 3/4" panel, 1/8" when
  flush. End panels and fillers drop to the doors.
- Build the budgeted room: a base with a countertop; an upper with a bottom cap; a run between them that **sits
  on** the countertop and is **held under** the cap, with end panels at both ends and one 3/4" back panel between
  them. Change the base height or the upper's clearance and the middle run refits.
- Read that wall as one vertical chain: toe kick | box | countertop | box | cap | box | crown.
- Set a run's **outset** (distance off the wall) and see it in plan, in corner reserves and blind panels.
- Type a 42" or 30" base (manual height), give a base no top, or put a short tall under an upper: the upper's
  "Clearance above counter" now measures from what's really there.

## Not in this round

- Drawing a run between two others doesn't stack it; you pick Sits on / Held under in the panel. No ⛓ glyph for
  stacks yet.
- Auto heights still assume today's tops: an auto tall or upper leaves room for the crown even if you pick a
  wood top or none. Use manual heights for those, or a stack.
- Parts below a run get no part numbers and don't show in plan.
- Face frame runs ignore REV-011 until round 36.
- The horizontal lower/upper chains are unchanged.

---

## §1 Decisions

**Tops (`run.top`).** `'stone' | 'wood' | 'crown' | 'topMold' | 'none'`, or unset. Unset means the default, which
is exactly today's behaviour: `none` on a run that's held under another run, `stone` on a base, the soffit's
molding (or crown) on an **auto-height** upper or tall, otherwise `none`. The type only chooses that default.
Heights: stone and wood are the countertop thickness (`run.overrides.countertopThickness`, else the profile's),
crown is the crown stack (`crownStackHeight`), top mold is `topMoldHeight`, none is 0. REV-002 (1/8" top reveal
below a wood top) now applies on any run type, Euro only as before, and only to cabinets whose top is the run's
top.

**Parts below a run (`run.bottom`).** A list, top to bottom, of `{ id, kind, height, doors }`. Kinds:
`light_rail`, `light_trough`, `panel`, `bottom_cap`, `corbels`. `doors`: `cover`, `flush` or `visible`; a bottom
cap and corbels can't be covered. The parts hang below the box (`run.z` is still the box bottom; an upper's auto
height doesn't change). Defaults (new settings, **please confirm the values**): light rail 1 1/2" cover, light
trough 3" cover, panel 3/4" cover, bottom cap 1 1/2" visible, corbels 6" visible.

**REV-011.** For Euro cabinets whose bottom is the run's bottom: add up the parts the doors cover, from the top
down, stopping at the first part they don't. If that's more than 0, the bottom reveal is
`−covered + belowRunOverhang` (−1/8"), so −1 5/8" over a 1 1/2" light rail and −7/8" over a 3/4" panel, as the
rule says. Otherwise, if the top part is flush, the reveal is `belowRunFlushReveal` (1/8"). Otherwise
(visible) it's the standard reveal — the plan's assumption, still to confirm on a real room. Source
`rule:below-run`; a stacked seam, a covered cell panel or a manual value still win, in that order, as now. Euro
end panels and fillers drop to the doors: `max(0, −reveal)`. The upper's existing Bottom select
(overhang / flush / counter) stays; REV-011 overrides it when the run has parts.

**Stacked runs (`run.stack`) — a change from the plan.** CELLS-PLAN said vertical joins would be joints in
`run.anchors`, like side-to-side joints. They're one-way links instead, like 34.3's follow anchors:
`run.stack = { below: { runId, offset } | null, above: { runId, offset } | null }`.

- `below`: this run's lowest point (the bottom of its lowest part below, else the box) sits on the top of the
  other run's top part (its countertop, crown…, else its box), plus `offset` (the gap).
- `above`: this run's highest point (the top of its top part, else the box) sits under the bottom of the other
  run's lowest part below, minus `offset`.
- Both: the run fills between them. One only: a manual-height run keeps its height and moves; an auto-height
  run keeps its other (auto) edge and stretches.

Why not joints: a side-to-side joint has a free x that both runs follow. Vertically, almost every run's position
already comes from somewhere (a base's auto height, an upper's clearance over the counter, the box top under the
crown), and a free joint z would fight it. With one-way links the leader keeps its rules and the stacked run
follows. "Resizing either run adjusts the other" still holds for the run in the middle, which is the one the
budgeted room needs. It also keeps `run.anchors` left/right only, so none of the side-to-side code changes.

Resolution: after the auto-height pass in `syncRoom`, leaders first (as 34.3 does for follows); a loop keeps its
stored heights. Links whose leader is missing, the run itself, or on the other wall side are pruned. A stacked
run starts at its own `z` for overlap checks (a tall stacked on a base doesn't collide with it). Making a link
refuses `stack-no-overlap` (the runs don't overlap side to side), `stack-cycle`, and any placement error
(`conflict`, `out-of-bounds`).

**Outset (`run.outset`).** Distance from the wall to the back of the run, default 0. `frontDepth` includes it, so
corner reserves, blind panels, neighbour returns and wall end panels all see the run's real front. Plan boxes,
faces and returns shift out by it.

---

## §2 Step 191 — shape

**`model/constants.js`** — `DEFAULT_SETTINGS`, after `standardDrawerBelow: 6,` (87):

```js
  belowRunOverhang: -0.125,
  belowRunFlushReveal: 0.125,
  bottomPartHeights: { light_rail: 1.5, light_trough: 3, panel: 0.75, bottom_cap: 1.5, corbels: 6 },
```

**`model/styles.js`** (207) — line 19:
`export const RUN_TOP_OPTIONS = ['stone', 'wood', 'crown', 'topMold', 'none'];`

**NEW `model/bottoms.js`:**

```js
import { v4 as uuid } from 'uuid';
import { DEFAULT_SETTINGS } from './constants.js';

/** What can hang below a run, listed top to bottom in run.bottom. */
export const BOTTOM_PART_KINDS = ['light_rail', 'light_trough', 'panel', 'bottom_cap', 'corbels'];
/** How the doors meet a part below the run (REV-011). */
export const BOTTOM_PART_DOORS = ['cover', 'flush', 'visible'];
/** Parts the doors never cover. */
export const UNCOVERABLE_BOTTOM_PARTS = ['bottom_cap', 'corbels'];

export const BOTTOM_PART_LABELS = {
  light_rail: 'Light rail',
  light_trough: 'Light trough',
  panel: 'Panel',
  bottom_cap: 'Bottom cap',
  corbels: 'Corbels',
};

const DEFAULT_DOORS = {
  light_rail: 'cover',
  light_trough: 'cover',
  panel: 'cover',
  bottom_cap: 'visible',
  corbels: 'visible',
};

/** Whether a value is a valid stored part below a run. */
export function isBottomPart(part) {
  return Boolean(part) && typeof part === 'object' && !Array.isArray(part)
    && typeof part.id === 'string'
    && BOTTOM_PART_KINDS.includes(part.kind)
    && typeof part.height === 'number' && Number.isFinite(part.height) && part.height > 0
    && BOTTOM_PART_DOORS.includes(part.doors)
    && !(part.doors === 'cover' && UNCOVERABLE_BOTTOM_PARTS.includes(part.kind));
}

/** A new part of one kind, at the shop's default height and door setting. */
export function createBottomPart(kind, settings) {
  const heights = { ...DEFAULT_SETTINGS.bottomPartHeights, ...settings?.bottomPartHeights };
  return { id: uuid(), kind, height: heights[kind], doors: DEFAULT_DOORS[kind] };
}
```

**`model/index.js`** — after `export { layoutRun, runFaceLayouts } from './faceLayouts.js';` (56):

```js
export {
  BOTTOM_PART_DOORS,
  BOTTOM_PART_KINDS,
  BOTTOM_PART_LABELS,
  UNCOVERABLE_BOTTOM_PARTS,
  createBottomPart,
  isBottomPart,
} from './bottoms.js';
```

**`model/room.js`** (1564) — `cloneRun` (59–88): after the `endFiller` spread (76–84), before the `items` line:

```js
    ...(run.bottom ? { bottom: run.bottom.map((part) => ({ ...part })) } : {}),
    ...(run.stack
      ? {
          stack: {
            below: run.stack.below ? { ...run.stack.below } : null,
            above: run.stack.above ? { ...run.stack.above } : null,
          },
        }
      : {}),
```

**`store/persistence.js`** (620):
- Import `{ isBottomPart } from '../model/bottoms.js';`.
- `V2_DEFAULTED_SETTING_KEYS`: after `'standardDrawerBelow',` (93) add `'belowRunOverhang'`, `'belowRunFlushReveal'`,
  `'bottomPartHeights'`. (The two numbers are required by `isSettings` through `V2_NUMERIC_SETTING_KEYS`; this
  fills them on older saves.)
- Just above `isRun` (198):

```js
function isStackLink(link) {
  return link === null || (Boolean(link) && typeof link === 'object'
    && typeof link.runId === 'string'
    && (link.offset === null || isFiniteNumber(link.offset)));
}

function isRunStack(stack) {
  return stack === undefined || (Boolean(stack) && typeof stack === 'object' && !Array.isArray(stack)
    && Object.keys(stack).every((key) => key === 'below' || key === 'above')
    && isStackLink(stack.below ?? null)
    && isStackLink(stack.above ?? null));
}
```

- `isRun`, after the `run.top` line (214):

```js
    && (run.bottom === undefined || (Array.isArray(run.bottom) && run.bottom.every(isBottomPart)))
    && isRunStack(run.stack)
    && (run.outset === undefined || (isFiniteNumber(run.outset) && run.outset >= 0))
```

**`store/__tests__/persistence.test.js`** — a describe at the end (2):

```js
describe('SPEC-35 run shape', () => {
  const withRun = (changes) => {
    const document = currentDocument();
    Object.assign(document.rooms[0].walls[0].runs[0], changes);
    return document;
  };
  const RAIL = { id: 'rail', kind: 'light_rail', height: 1.5, doors: 'cover' };
  const CAP = { id: 'cap', kind: 'bottom_cap', height: 1.5, doors: 'visible' };

  it('saves tops, parts below, stack links and outset, and rejects bad ones', () => {
    expect(isElevationDocument(withRun({ top: 'crown' }))).toBe(true);
    expect(isElevationDocument(withRun({ top: 'none' }))).toBe(true);
    expect(isElevationDocument(withRun({ top: 'marble' }))).toBe(false);
    expect(isElevationDocument(withRun({ bottom: [RAIL, CAP] }))).toBe(true);
    expect(isElevationDocument(withRun({ bottom: [{ ...CAP, doors: 'cover' }] }))).toBe(false);
    expect(isElevationDocument(withRun({ bottom: [{ ...RAIL, height: 0 }] }))).toBe(false);
    expect(isElevationDocument(withRun({ stack: { below: { runId: 'b', offset: 0 }, above: null } }))).toBe(true);
    expect(isElevationDocument(withRun({ stack: { below: { offset: 0 }, above: null } }))).toBe(false);
    expect(isElevationDocument(withRun({ outset: 2 }))).toBe(true);
    expect(isElevationDocument(withRun({ outset: -1 }))).toBe(false);
  });

  it('defaults the parts-below settings on documents saved before them', () => {
    const current = currentDocument();
    delete current.settings.belowRunOverhang;
    delete current.settings.belowRunFlushReveal;
    delete current.settings.bottomPartHeights;
    globalThis.window = {
      localStorage: storageWith([[ELEVATION_STORAGE_KEY, JSON.stringify(current)]]),
    };

    const loaded = loadElevationDocument();
    expect(loaded.settings.belowRunOverhang).toBe(-0.125);
    expect(loaded.settings.belowRunFlushReveal).toBe(0.125);
    expect(loaded.settings.bottomPartHeights).toEqual({
      light_rail: 1.5, light_trough: 3, panel: 0.75, bottom_cap: 1.5, corbels: 6,
    });
  });
});
```

(Adding the settings and top options to the current code leaves all 642 tests passing; that was run.)

**Count:** 642 + 2 = **644**.

---

## §3 Step 192 — `runTop` and REV-002 on any type

**NEW `model/tops.js`:**

```js
import { CABINET_TYPE_IDS } from './constants.js';
import { moldingStack } from './profile.js';
import { runMolding } from './soffits.js';

export const TOP_LABELS = {
  stone: 'Stone countertop',
  wood: 'Shop-built wood top',
  crown: 'Crown',
  topMold: 'Top mold',
  none: 'None',
};

/** Whether a top is a countertop (stone or shop-built wood) rather than a molding. */
export function isCountertop(kind) {
  return kind === 'stone' || kind === 'wood';
}

/**
 * The top a run gets when run.top is unset — today's behaviour: none under a run it's held under,
 * stone on a base, the soffit's molding (or crown) on an auto-height upper or tall, otherwise none.
 */
export function defaultRunTop(wall, run, profile) {
  if (run.stack?.above) return 'none';
  if (run.cabinetTypeId === CABINET_TYPE_IDS.BASE) return 'stone';
  if (run.heightMode !== 'auto') return 'none';
  return runMolding(wall, run, profile);
}

/** The part on top of a run: its kind and height. `profile` is the wall's resolved profile. */
export function runTop(wall, run, profile) {
  const kind = run.top ?? defaultRunTop(wall, run, profile);
  const countertop = run.overrides?.countertopThickness ?? profile.countertopThickness;
  const height = isCountertop(kind) ? countertop
    : kind === 'crown' ? moldingStack(profile)
      : kind === 'topMold' ? profile.topMoldHeight
        : 0;
  return { kind, height };
}
```

**`model/index.js`** — after the bottoms block from 191:
`export { TOP_LABELS, defaultRunTop, isCountertop, runTop } from './tops.js';`

**`model/styles.js`** — `cabinetReveals` (122–168):
- Its parameters gain `runEdges = { top: true, bottom: true },` after `covered = …,` (129). `runEdges` says whether
  the cabinet's top / bottom is the run's top / bottom.
- The wood-top rule (141–143) becomes:

```js
  if (euro && run.top === 'wood' && runEdges.top) {
    apply('top', settings.woodTopReveal ?? DEFAULT_SETTINGS.woodTopReveal, 'rule:wood-top');
  }
```

Line 4 becomes `const { UPPER, TALL } = CABINET_TYPE_IDS;` — the wood rule was the only use of `BASE`.

**`model/faceLayouts.js`** (80) — in the loop, before `cabinetReveals` (55):

```js
    const runEdges = {
      top: Math.abs(piece.z + piece.height - run.z - run.height) <= 1e-6,
      bottom: Math.abs(piece.z - run.z) <= 1e-6,
    };
```
and pass `runEdges,` after `covered: …,` (62).

### Tests — NEW `src/elevation/model/__tests__/tops.test.js` (4)

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { resolveProfile } from '../profile.js';
import { resolveWall, syncRoom } from '../room.js';
import { cabinetReveals } from '../styles.js';
import { runTop } from '../tops.js';

const S = DEFAULT_SETTINGS;
const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;
const EURO = { cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false };
const DOOR = { type: 'door', size: null };

function makeRun(id, cabinetTypeId, overrides = {}) {
  return {
    id, cabinetTypeId, x: 0, width: 60, z: 4, height: 30.5, depth: cabinetTypeId === UPPER ? 12 : 24,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    autoCount: false, maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
    ...overrides,
  };
}

/** One 120" × 96" wall, default profile. */
function makeRoom(runs) {
  return syncRoom({
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], runs,
    }],
  }, S);
}

function topsOf(room) {
  const wall = room.walls[0];
  const profile = resolveProfile(S, room, wall);
  return Object.fromEntries(wall.runs.map((run) => [run.id, runTop(wall, run, profile)]));
}

describe('SPEC-35 run tops', () => {
  it('defaults to today: stone on a base, crown on an auto upper, none on a manual tall or under a run', () => {
    const tops = topsOf(makeRoom([
      makeRun('B', BASE),
      makeRun('U', UPPER),
      makeRun('T', TALL, { x: 70, width: 24, heightMode: 'manual', z: 4, height: 80 }),
      makeRun('C', BASE, { x: 96, width: 24, overrides: { countertopThickness: 3 } }),
      makeRun('M', UPPER, {
        heightMode: 'manual', z: 40, height: 10,
        stack: { below: null, above: { runId: 'U', offset: 0 } },
      }),
    ]));
    expect(tops.B).toEqual({ kind: 'stone', height: 1.5 });
    expect(tops.U).toEqual({ kind: 'crown', height: 6 });
    expect(tops.T).toEqual({ kind: 'none', height: 0 });
    expect(tops.C).toEqual({ kind: 'stone', height: 3 });
    expect(tops.M).toEqual({ kind: 'none', height: 0 });
  });

  it('takes any top on any type', () => {
    const tops = topsOf(makeRoom([
      makeRun('B', BASE, { top: 'crown' }),
      makeRun('U', UPPER, { top: 'wood' }),
      makeRun('T', TALL, { x: 70, width: 24, top: 'topMold' }),
      makeRun('N', UPPER, { x: 96, width: 24, top: 'none' }),
    ]));
    expect(tops.B).toEqual({ kind: 'crown', height: 6 });
    expect(tops.U).toEqual({ kind: 'wood', height: 1.5 });
    expect(tops.T).toEqual({ kind: 'topMold', height: 3 });
    expect(tops.N).toEqual({ kind: 'none', height: 0 });
  });

  it('REV-002 follows a wood top on any type, at the run top only', () => {
    const tall = cabinetReveals({ style: EURO, cabinetTypeId: TALL, run: { top: 'wood' }, face: DOOR, settings: S });
    expect(tall.sources.top).toBe('rule:wood-top');
    const inner = cabinetReveals({
      style: EURO, cabinetTypeId: BASE, run: { top: 'wood' }, face: DOOR,
      runEdges: { top: false, bottom: true }, settings: S,
    });
    expect(inner.values.top).toBe(0.25);
    expect(inner.sources.top).toBe('style');
  });

  it('gives the top cell of a split run the wood top reveal', () => {
    const run = {
      id: 'run-2', cabinetTypeId: BASE, top: 'wood', x: 24, width: 19.5, z: 4, height: 60, depth: 24,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
      autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
      anchors: { left: false, right: false },
      grid: {
        id: 'run-2:grid', cols: [{ id: 's:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'run-2:row', size: null, sizeMode: 'auto' }],
        cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: {
          id: 's', cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
          rows: [{ id: 's:r0', size: null, sizeMode: 'auto' }, { id: 's:r1', size: 30, sizeMode: 'manual' }],
          cells: [
            { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 't', kind: 'cabinet' } },
            { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'b', kind: 'cabinet' } },
          ],
        } }],
      },
    };
    const room = {
      id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, wallOrder: ['wall-1'],
      walls: [{
        id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
        flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
      }],
    };
    const layouts = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, S);
    expect(layouts.get('t').reveals.sources.top).toBe('rule:wood-top');
    expect(layouts.get('t').reveals.values.top).toBe(0.125);
    expect(layouts.get('b').reveals.sources.top).toBe('rule:stacked-seam');
  });
});
```

Working: profile defaults — counter 1 1/2", crown stack 6", top mold 3". U is an auto upper with no soffit →
`runMolding` gives crown. T is manual → none. M is held under U → none (step 197 will also move M, but its top
stays none). The split base: `t` is the top cell (z 34–64), so it gets the wood reveal; `b` gets the stacked seam
as before (checked against the current code, which gives the same sources).

**Count:** 644 + 4 = **648**.

---

## §4 Step 193 — tops in chains, part numbers, profiles and extents

Every place that decided "countertop on a base, molding on an auto upper or tall" now asks `runTop`. With
`run.top` unset every result is the same as now.

**`model/dimensions.js`** (467):
- Line 9 becomes `import { resolveProfile } from './profile.js';` and add
  `import { isCountertop, runTop } from './tops.js';`.
- Delete `profileForRun` (370–377); nothing else uses it.
- `verticalChains`: the countertop block (408–416) becomes

```js
    const lowerTop = runTop(wall, lowerRun, wallProfile);
    if (isCountertop(lowerTop.kind)) {
      append(
        lowerRun.z + lowerRun.height,
        lowerRun.z + lowerRun.height + lowerTop.height,
        'countertop',
      );
    }
```

  and the molding block (430–440) becomes

```js
  if (highestBox) {
    const top = runTop(wall, highestBox.run, wallProfile);
    if (top.kind === 'crown' || top.kind === 'topMold') {
      append(highestBox.top, highestBox.top + top.height, 'molding');
    }
  }
```

**`model/partNumbers.js`**: drop the `runMolding` import (11) and `MOLDING_TYPES` (24); import
`{ runTop } from './tops.js'`. `carriesMolding` (44–52), after the unchanged `toeKick` branch:

```js
  const top = runTop(wall, run, profile).kind;
  return molding === 'topMold' ? top === 'crown' || top === 'topMold' : top === 'crown';
```

**`model/neighborProfiles.js`**: drop the `runMolding` import (10); import `{ runTop } from './tops.js'`. Lines
55–58 (`showsMolding`, `molding`) become `const top = runTop(neighborView, run, profile).kind;`; line 67's
condition becomes `top === 'crown' || top === 'topMold'`; line 70's becomes `top === 'crown'`.

**`model/wallExtent.js`** (51): replace the file with

```js
import { wallFrame } from './geometry.js';
import { neighborProfiles } from './neighborProfiles.js';
import { resolveProfile } from './profile.js';
import { resolveSoffitSpan, soffitsOn } from './soffits.js';
import { runTop } from './tops.js';
import { wallSideView } from './wallSides.js';

/** Return the bounds of everything drawn in one wall elevation. */
export function wallExtent(room, wall, settings) {
  const view = wallSideView(wall, wall.side ?? 'front');
  const length = wallFrame(room, view).length;
  const profile = resolveProfile(settings, room, wall);
  const extent = {
    left: 0,
    right: length,
    top: wall.height,
    bottom: 0,
  };

  for (const run of view.runs) {
    const top = runTop(view, run, profile);
    extent.left = Math.min(extent.left, run.x);
    extent.right = Math.max(extent.right, run.x + run.width);
    extent.bottom = Math.min(extent.bottom, run.z);
    extent.top = Math.max(extent.top, run.z + run.height + top.height);
  }

  for (const soffit of soffitsOn(view)) {
    const span = resolveSoffitSpan(room, view, soffit);
    extent.left = Math.min(extent.left, span.x);
    extent.right = Math.max(extent.right, span.x + span.width);
  }

  for (const profileShape of neighborProfiles(room, wall, settings)) {
    extent.left = Math.min(extent.left, profileShape.x);
    extent.right = Math.max(extent.right, profileShape.x + profileShape.width);
    for (const molding of profileShape.moldings) {
      extent.top = Math.max(extent.top, molding.z + molding.height);
    }
  }

  return extent;
}
```

(A base's countertop now counts toward the extent too; it's always below the wall top, so no existing extent
changes.)

### Tests — `tops.test.js`: add `import { verticalChains } from '../dimensions.js';` and
`import { partNumbers } from '../partNumbers.js';`; a describe at the end (2)

```js
describe('SPEC-35 tops in chains and part numbers', () => {
  const kindsAndLengths = (chain) => chain.inner.map(({ kind, start, end }) => [kind, end - start]);

  it('chains the top each run carries', () => {
    const plain = makeRoom([makeRun('B', BASE), makeRun('U', UPPER, { top: 'none' })]);
    const wall = plain.walls[0];
    expect(kindsAndLengths(verticalChains(plain, wall, { lowerRun: wall.runs[0], upperRun: wall.runs[1] }, S)))
      .toEqual([['toe-kick', 4], ['box', 30.5], ['countertop', 1.5], ['clearance', 18], ['box', 36], ['open', 6]]);

    const tall = makeRoom([makeRun('T', TALL, { heightMode: 'manual', z: 4, height: 80, top: 'crown' })]);
    const tallWall = tall.walls[0];
    expect(kindsAndLengths(verticalChains(tall, tallWall, { lowerRun: tallWall.runs[0], upperRun: null }, S)))
      .toEqual([['toe-kick', 4], ['box', 80], ['molding', 6], ['open', 6]]);
  });

  it('numbers the moldings a top brings', () => {
    const moldings = (room) => partNumbers(room, S).parts
      .filter((part) => part.kind === 'molding')
      .map((part) => part.molding);
    expect(moldings(makeRoom([makeRun('B', BASE)]))).toEqual(['toeKick']);
    expect(moldings(makeRoom([makeRun('B', BASE, { top: 'crown' })]))).toEqual(['toeKick', 'topMold', 'crown']);
    expect(moldings(makeRoom([makeRun('B', BASE), makeRun('U', UPPER, { top: 'none' })]))).toEqual(['toeKick']);
  });
});
```

Working: today the base+upper chain is toe kick 4 | box 30 1/2 | countertop 1 1/2 | clearance 18 | box 36 |
molding 6; with the upper's top set to none the last 6" is open. The manual tall alone today gives toe kick 4 |
box 80 | open 12; with crown it's molding 6 then open 6. A base alone numbers only the toe kick today.

**Count:** 648 + 2 = **650**.

---

## §5 Step 194 — tops on screen

**`components/RunGroup.jsx`** (533):
- Replace `import { runMolding } from '../model/soffits.js';` (23) with `import { runTop } from '../model/tops.js';`.
- Lines 146–151 (`countertopThickness`, `showsMolding`, `molding`) become `const top = runTop(wall, run, profile);`.
- Delete `isBase` (177).
- The countertop rect (187–193): `height: top.height,`.
- JSX: `{isBase && (` (330) becomes `{(top.kind === 'stone' || top.kind === 'wood') && (`, and that rect's fill
  becomes `fill={top.kind === 'wood' ? '#c8a27a' : '#cbd5e1'}`; `{showsMolding && molding !== 'none' && (` (341)
  becomes `{(top.kind === 'crown' || top.kind === 'topMold') && (`; `{showsMolding && molding === 'crown' && (`
  (351) becomes `{top.kind === 'crown' && (`.

**`components/properties/RunFaceOptions.jsx`** (60): replace with

```jsx
import { useDispatch } from 'react-redux';
import {
  CABINET_TYPE_IDS,
  RUN_TOP_OPTIONS,
  TOP_LABELS,
  defaultRunTop,
  resolveProfile,
  resolveStyle,
} from '../../model/index.js';
import { setRunFaceOptions, setRunStyle } from '../../store/elevationSlice.js';
import StyleFields from './StyleFields.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

const UPPER_BOTTOM_LABELS = {
  overhang: 'Overhang (doors below box)',
  flush: 'Flush (light rail / trough)',
  counter: 'On counter (tall reveals)',
};

export default function RunFaceOptions({ room, wall, run, settings }) {
  const dispatch = useDispatch();
  const at = { wallId: wall.id, runId: run.id };
  const defaultTop = defaultRunTop(wall, run, resolveProfile(settings, room, wall));

  return (
    <section className="space-y-3 border-t border-gray-700 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cabinet style</h3>
      <StyleFields
        label="Run"
        value={run.style}
        inherited={resolveStyle(settings, room)}
        onChange={(style) => dispatch(setRunStyle({ ...at, style }))}
      />

      <label className="block text-xs text-gray-400">
        Top
        <select
          value={run.top ?? ''}
          onChange={(event) => dispatch(setRunFaceOptions({ ...at, top: event.target.value || null }))}
          aria-label="Run top"
          className={`mt-1 ${SELECT_CLASS}`}
        >
          <option value="">{`Default · ${TOP_LABELS[defaultTop]}`}</option>
          {RUN_TOP_OPTIONS.map((value) => (
            <option key={value} value={value}>{TOP_LABELS[value]}</option>
          ))}
        </select>
      </label>

      {run.cabinetTypeId === CABINET_TYPE_IDS.UPPER && (
        <label className="block text-xs text-gray-400">
          Bottom
          <select
            value={run.upperBottom ?? 'overhang'}
            onChange={(event) => dispatch(setRunFaceOptions({ ...at, upperBottom: event.target.value }))}
            aria-label="Upper bottom"
            className={`mt-1 ${SELECT_CLASS}`}
          >
            {Object.entries(UPPER_BOTTOM_LABELS).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
```

**`store/elevationSlice.js`** (1643) — `setRunFaceOptions` (1456–1465): add `syncRoomAt(state, location.roomIndex);`
after the loop (a top can move a stacked run from step 197 on). Nothing else.

**`store/__tests__/elevationSlice.test.js`** — a describe after `describe('styles and reveals')` (ends 1196):

```js
describe('SPEC-35 run top reducer', () => {
  it('sets any top on any run type and clears it back to the default', () => {
    const at = { wallId: 'wall-1', runId: 'run-1' };
    let state = elevationReducer(
      stateWithRun(run({ cabinetTypeId: CABINET_TYPE_IDS.TALL, autoCount: false, items: [auto('a')] })),
      setRunFaceOptions({ ...at, top: 'crown' }),
    );
    expect(currentRun(state).top).toBe('crown');
    state = elevationReducer(state, setRunFaceOptions({ ...at, top: 'marble' }));
    expect(currentRun(state).top).toBe('crown');
    state = elevationReducer(state, setRunFaceOptions({ ...at, top: null }));
    expect('top' in currentRun(state)).toBe(false);
  });
});
```

**Count:** 650 + 1 = **651**.

---

## §6 Step 195 — parts below a run and REV-011

**`model/bottoms.js`** — append:

```js
/** The parts below a run, top to bottom, each with the z of its bottom edge. */
export function runBottomParts(run) {
  let top = run.z;
  return (run.bottom ?? []).map((part) => {
    top -= part.height;
    return { ...part, z: top };
  });
}

/** The total height of the parts below a run. */
export function runBottomHeight(run) {
  return (run.bottom ?? []).reduce((total, part) => total + part.height, 0);
}

/**
 * REV-011: the bottom reveal the parts below a run give the cabinets at its bottom, or null for the
 * standard reveal. Covered parts count from the top down to the first part the doors don't cover.
 */
export function belowRunReveal(run, settings) {
  const parts = run.bottom ?? [];
  let covered = 0;
  for (const part of parts) {
    if (part.doors !== 'cover') break;
    covered += part.height;
  }
  if (covered > 0) {
    return -covered + (settings.belowRunOverhang ?? DEFAULT_SETTINGS.belowRunOverhang);
  }
  if (parts[0]?.doors === 'flush') {
    return settings.belowRunFlushReveal ?? DEFAULT_SETTINGS.belowRunFlushReveal;
  }
  return null;
}
```

**`model/index.js`** — the bottoms block adds `belowRunReveal`, `runBottomHeight`, `runBottomParts`.

**`model/styles.js`**:
- Import `{ belowRunReveal } from './bottoms.js';`.
- `REVEAL_SOURCE_LABELS` (21–30): add `'rule:below-run': 'rule: part below',`.
- `cabinetReveals`: right after the upper-bottom rule (144–147):

```js
  const below = euro && runEdges.bottom ? belowRunReveal(run, settings) : null;
  if (below !== null) apply('bottom', below, 'rule:below-run');
```

- `panelDrop` (203–207) becomes:

```js
/** How far a run's fillers and end panels extend below the box: to the doors. */
export function panelDrop(run, style, settings) {
  if (!isInsetStyle(style)) {
    const below = belowRunReveal(run, settings);
    if (below !== null) return Math.max(0, -below);
  }
  if (run.cabinetTypeId !== UPPER || (run.upperBottom ?? 'overhang') !== 'overhang') return 0;
  if (!isInsetStyle(style)) return Math.max(0, -faceRevealsFor(UPPER, settings).bottom);
  return { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.upperDrop;
}
```

### Tests — NEW `src/elevation/model/__tests__/bottoms.test.js` (3)

```js
import { describe, expect, it } from 'vitest';
import {
  belowRunReveal,
  createBottomPart,
  isBottomPart,
  runBottomHeight,
  runBottomParts,
} from '../bottoms.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { syncRoom } from '../room.js';
import { cabinetReveals, panelDrop } from '../styles.js';

const S = DEFAULT_SETTINGS;
const { UPPER } = CABINET_TYPE_IDS;
const EURO = { cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false };
const INSET = { cabinetStyleId: 14, beadWidth: 0.25, profiledEdge: false };
const DOOR = { type: 'door', size: null };
const RAIL = { id: 'rail', kind: 'light_rail', height: 1.5, doors: 'cover' };
const PANEL = { id: 'panel', kind: 'panel', height: 0.75, doors: 'cover' };
const CAP = { id: 'cap', kind: 'bottom_cap', height: 1.5, doors: 'visible' };

describe('SPEC-35 parts below a run', () => {
  it('lists parts top to bottom, totals them and makes new ones', () => {
    const run = { z: 54, bottom: [RAIL, CAP] };
    expect(runBottomParts(run).map(({ id, z }) => [id, z])).toEqual([['rail', 52.5], ['cap', 51]]);
    expect(runBottomHeight(run)).toBe(3);
    expect(runBottomHeight({ z: 54 })).toBe(0);
    expect(createBottomPart('light_rail', S)).toMatchObject({ kind: 'light_rail', height: 1.5, doors: 'cover' });
    expect(createBottomPart('corbels', S)).toMatchObject({ kind: 'corbels', height: 6, doors: 'visible' });
    expect(isBottomPart(createBottomPart('panel', S))).toBe(true);
    expect(isBottomPart({ ...CAP, doors: 'cover' })).toBe(false);
  });

  it('REV-011: covered, flush and visible parts set the bottom reveal', () => {
    expect(belowRunReveal({ bottom: [RAIL] }, S)).toBe(-1.625);
    expect(belowRunReveal({ bottom: [PANEL, CAP] }, S)).toBe(-0.875);
    expect(belowRunReveal({ bottom: [{ ...RAIL, doors: 'flush' }] }, S)).toBe(0.125);
    expect(belowRunReveal({ bottom: [{ ...RAIL, doors: 'visible' }] }, S)).toBeNull();
    expect(belowRunReveal({}, S)).toBeNull();

    const covered = cabinetReveals({ style: EURO, cabinetTypeId: UPPER, run: { bottom: [RAIL] }, face: DOOR, settings: S });
    expect(covered.values.bottom).toBe(-1.625);
    expect(covered.sources.bottom).toBe('rule:below-run');
    const notAtBottom = cabinetReveals({
      style: EURO, cabinetTypeId: UPPER, run: { bottom: [RAIL] }, face: DOOR,
      runEdges: { top: true, bottom: false }, settings: S,
    });
    expect(notAtBottom.values.bottom).toBe(-0.125);
    expect(notAtBottom.sources.bottom).toBe('style');
    const inset = cabinetReveals({ style: INSET, cabinetTypeId: UPPER, run: { bottom: [RAIL] }, face: DOOR, settings: S });
    expect(inset.values.bottom).toBe(0.75);
    const manual = cabinetReveals({
      style: EURO, cabinetTypeId: UPPER, run: { bottom: [RAIL] }, face: DOOR, manual: { bottom: -1 }, settings: S,
    });
    expect(manual.values.bottom).toBe(-1);
    expect(manual.sources.bottom).toBe('manual');
  });

  it('drops end panels to the doors and moves the faces', () => {
    expect(panelDrop({ cabinetTypeId: UPPER, bottom: [RAIL] }, EURO, S)).toBe(1.625);
    expect(panelDrop({ cabinetTypeId: UPPER, bottom: [{ ...RAIL, doors: 'flush' }] }, EURO, S)).toBe(0);
    expect(panelDrop({ cabinetTypeId: UPPER, bottom: [{ ...RAIL, doors: 'visible' }] }, EURO, S)).toBe(0.125);

    const run = {
      id: 'U', cabinetTypeId: UPPER, x: 0, width: 60, z: 54, height: 36, depth: 12,
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      autoCount: false, maxCabinetWidth: null,
      items: [{ id: 'U-cabinet', kind: 'cabinet', width: null }],
      heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
      bottom: [RAIL],
    };
    const room = syncRoom({
      id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
      walls: [{
        id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
        height: 96, thickness: 4.5, flipped: false,
        connections: { start: null, end: null }, profile: {}, openings: [], runs: [run],
      }],
    }, S);
    const wall = room.walls[0];
    const faces = runFaceLayouts(room, wall, wall.runs[0], S).get('U-cabinet').faces;
    expect(faces[0]).toMatchObject({ z: 52.375, height: 37.5 });
  });
});
```

Working: covered rail 1 1/2 → −1 1/2 − 1/8 = −1 5/8. Covered panel 3/4 then a visible cap → −3/4 − 1/8 = −7/8.
Flush → 1/8. The inset upper keeps its style bottom (1 1/2 rail − 3/4 drop = 3/4). The auto upper (no base below)
sits at 54, 36 tall; its pair-door faces today start at 53 7/8 (54 − 1/8) and are 36 tall (checked); with the
covered rail they start at 54 − 1 5/8 = 52 3/8 and reach the same top (89 7/8), so 37 1/2 tall.

**Count:** 651 + 3 = **654**.

---

## §7 Step 196 — parts below on screen

**`components/RunGroup.jsx`**: import `{ runBottomParts } from '../model/bottoms.js'`. After `crown` (the
`wallRectToScreen` ending at 166, line numbers after step 194 will have shifted — find it by name):

```js
  const bottomParts = runBottomParts(run).map((part) => ({
    ...part,
    rect: wallRectToScreen({ x: bandX, z: part.z, width: bandWidth, height: part.height }, transform),
  }));
```

and in the JSX, right after the crown `Rect` block:

```jsx
      {bottomParts.map((part) => (
        <Rect
          key={part.id}
          {...part.rect}
          fill="#94a3b8"
          opacity={0.9}
          stroke="#cbd5e1"
          strokeWidth={1}
          dash={part.kind === 'corbels' ? [4, 3] : undefined}
          listening={false}
        />
      ))}
```

**NEW `components/properties/RunBottomSection.jsx`:**

```jsx
import { useDispatch } from 'react-redux';
import {
  BOTTOM_PART_DOORS,
  BOTTOM_PART_KINDS,
  BOTTOM_PART_LABELS,
  UNCOVERABLE_BOTTOM_PARTS,
  createBottomPart,
} from '../../model/index.js';
import { setRunBottom } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-200 hover:bg-gray-600 disabled:opacity-40';
const DOORS_LABELS = {
  cover: 'Doors cover it',
  flush: 'Doors stop flush above',
  visible: 'Visible',
};

export default function RunBottomSection({ run, settings, actionBase }) {
  const dispatch = useDispatch();
  const parts = run.bottom ?? [];
  const commit = (next) => dispatch(setRunBottom({ ...actionBase, bottom: next }));
  const change = (index, changes) => commit(parts.map((part, at) => (
    at === index ? { ...part, ...changes } : part
  )));
  const move = (index, delta) => {
    const next = [...parts];
    const [part] = next.splice(index, 1);
    next.splice(index + delta, 0, part);
    commit(next);
  };

  return (
    <section className="space-y-3 border-t border-gray-700 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Below the run</h3>
      {parts.map((part, index) => {
        const label = BOTTOM_PART_LABELS[part.kind];
        return (
          <div key={part.id} className="space-y-2 rounded border border-gray-700 bg-gray-900/45 p-3">
            <div className="flex items-center justify-between text-xs text-gray-300">
              <span>{label}</span>
              <span className="flex gap-1">
                <button type="button" className={BUTTON_CLASS} disabled={index === 0}
                  onClick={() => move(index, -1)} aria-label={`Move ${label} up`}>↑</button>
                <button type="button" className={BUTTON_CLASS} disabled={index === parts.length - 1}
                  onClick={() => move(index, 1)} aria-label={`Move ${label} down`}>↓</button>
                <button type="button" className={BUTTON_CLASS}
                  onClick={() => commit(parts.filter((_, at) => at !== index))}
                  aria-label={`Remove ${label}`}>✕</button>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Height">
                <InchInput
                  value={part.height}
                  onCommit={(value) => {
                    if (!(value > 0)) return false;
                    change(index, { height: value });
                    return true;
                  }}
                  aria-label={`${label} height`}
                />
              </Field>
              <Field label="Doors">
                <select
                  value={part.doors}
                  onChange={(event) => change(index, { doors: event.target.value })}
                  aria-label={`${label} doors`}
                  className={SELECT_CLASS}
                >
                  {BOTTOM_PART_DOORS
                    .filter((doors) => doors !== 'cover' || !UNCOVERABLE_BOTTOM_PARTS.includes(part.kind))
                    .map((doors) => <option key={doors} value={doors}>{DOORS_LABELS[doors]}</option>)}
                </select>
              </Field>
            </div>
          </div>
        );
      })}
      <select
        value=""
        onChange={(event) => {
          if (event.target.value) commit([...parts, createBottomPart(event.target.value, settings)]);
        }}
        aria-label="Add a part below the run"
        className={SELECT_CLASS}
      >
        <option value="">Add a part below…</option>
        {BOTTOM_PART_KINDS.map((kind) => (
          <option key={kind} value={kind}>{BOTTOM_PART_LABELS[kind]}</option>
        ))}
      </select>
      <p className="text-xs text-gray-500">
        Listed top to bottom. The bottom reveal follows the parts the doors cover (REV-011).
      </p>
    </section>
  );
}
```

**`components/properties/RunProperties.jsx`** (102): import it and render
`<RunBottomSection run={run} settings={settings} actionBase={actionBase} />` right after `<RunFaceOptions … />` (97).

**`store/elevationSlice.js`**: import `{ isBottomPart } from '../model/bottoms.js'`. After `setRunFaceOptions`:

```js
    setRunBottom(state, action) {
      const location = runLocation(state, action.payload);
      const { bottom } = action.payload;
      if (!location || !Array.isArray(bottom) || !bottom.every(isBottomPart)) return;
      if (bottom.length === 0) delete location.run.bottom;
      else location.run.bottom = bottom.map((part) => ({ ...part }));
      syncRoomAt(state, location.roomIndex);
    },
```

and export `setRunBottom` after `setRunFaceOptions,` in the actions list.

**`store/__tests__/elevationSlice.test.js`** — add `setRunBottom` to the slice import; a describe after
`describe('SPEC-35 run top reducer')`:

```js
describe('SPEC-35 parts below reducer', () => {
  it('sets the list, rejects a bad one and clears it', () => {
    const at = { wallId: 'wall-1', runId: 'run-1' };
    const RAIL = { id: 'rail', kind: 'light_rail', height: 1.5, doors: 'cover' };
    let state = elevationReducer(
      stateWithRun(run({
        cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 36, depth: 12, autoCount: false, items: [auto('a')],
      })),
      setRunBottom({ ...at, bottom: [RAIL] }),
    );
    expect(currentRun(state).bottom).toEqual([RAIL]);
    const refused = elevationReducer(state, setRunBottom({ ...at, bottom: [{ ...RAIL, kind: 'bottom_cap' }] }));
    expect(currentRun(refused).bottom).toEqual([RAIL]);
    state = elevationReducer(state, setRunBottom({ ...at, bottom: [] }));
    expect('bottom' in currentRun(state)).toBe(false);
  });
});
```

**Count:** 654 + 1 = **655**.

---

## §8 Step 197 — stacked runs (model)

**NEW `model/stacks.js`:**

```js
import { runBottomHeight } from './bottoms.js';
import { runShortLabel } from './joints.js';
import { runTop } from './tops.js';
import { formatInches } from './units.js';
import { wallSideOf } from './wallSides.js';

/** `below`: the run this one sits on. `above`: the run this one is held under. */
export const STACK_EDGES = ['below', 'above'];

/** The stack link on one edge of a run — { runId, offset } — or null. */
export function stackLink(run, edge) {
  const link = run.stack?.[edge];
  return link && typeof link.runId === 'string' ? link : null;
}

/** Ids of the runs a run is stacked on or under. */
export function stackLeaders(run) {
  return STACK_EDGES.map((edge) => stackLink(run, edge)?.runId).filter(Boolean);
}

/** Ids of every run stacked on or under any of runIds, directly or through another stacked run. */
export function stackFollowersOf(wall, runIds) {
  const found = [];
  const queue = [...runIds];
  while (queue.length > 0) {
    const leaderId = queue.shift();
    for (const run of wall.runs ?? []) {
      if (found.includes(run.id) || runIds.includes(run.id)) continue;
      if (stackLeaders(run).includes(leaderId)) {
        found.push(run.id);
        queue.push(run.id);
      }
    }
  }
  return found;
}

/** Whether stacking sourceRunId on or under leaderRunId would close a loop. */
export function stackCreatesCycle(wall, sourceRunId, leaderRunId) {
  return leaderRunId === sourceRunId || stackFollowersOf(wall, [sourceRunId]).includes(leaderRunId);
}

/** Every run linked to runId above or below, directly or through others, bottom to top. */
export function stackOf(wall, runId) {
  const runs = wall.runs ?? [];
  const found = new Set([runId]);
  const queue = [runId];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const run of runs) {
      const linked = run.id === id
        ? stackLeaders(run)
        : stackLeaders(run).includes(id) ? [run.id] : [];
      for (const otherId of linked) {
        if (found.has(otherId) || !runs.some((candidate) => candidate.id === otherId)) continue;
        found.add(otherId);
        queue.push(otherId);
      }
    }
  }
  return runs.filter((run) => found.has(run.id)).sort((a, b) => a.z - b.z);
}

/** The top of a run's top part (countertop, crown, …), or of its box. */
export function outerTop(wall, run, profile) {
  return run.z + run.height + runTop(wall, run, profile).height;
}

/** The bottom of a run's lowest part below it (light rail, cap, …), or of its box. */
export function outerBottom(run) {
  return run.z - runBottomHeight(run);
}

/** A run's z and height from its links; leaders are already resolved. */
function stackedSpan(wall, run, resolved, profile) {
  const below = stackLink(run, 'below');
  const above = stackLink(run, 'above');
  const belowLeader = below ? resolved.get(below.runId) : null;
  const aboveLeader = above ? resolved.get(above.runId) : null;
  let z = run.z;
  let top = run.z + run.height;
  if (belowLeader) {
    z = outerTop(wall, belowLeader, profile) + (below.offset ?? 0) + runBottomHeight(run);
  }
  if (aboveLeader) {
    top = outerBottom(aboveLeader) - (above.offset ?? 0) - runTop(wall, run, profile).height;
  }
  // One link only: a manual run keeps its height; an auto run keeps its other, auto edge.
  if (belowLeader && !aboveLeader && run.heightMode !== 'auto') top = z + run.height;
  if (aboveLeader && !belowLeader && run.heightMode !== 'auto') z = top - run.height;
  return { z, height: top - z };
}

/** Resolve stacked runs' heights, leaders first. A loop keeps its stored heights. */
export function resolveStacks(wall, profile) {
  const runs = wall.runs ?? [];
  if (!runs.some((run) => stackLeaders(run).length > 0)) return wall;
  const resolved = new Map();
  let pending = runs;
  while (pending.length > 0) {
    const waiting = new Set(pending.map((run) => run.id));
    const ready = pending.filter((run) => stackLeaders(run).every((id) => !waiting.has(id)));
    if (ready.length === 0) break;
    for (const run of ready) {
      resolved.set(run.id, stackLeaders(run).length > 0
        ? { ...run, ...stackedSpan(wall, run, resolved, profile) }
        : run);
    }
    pending = pending.filter((run) => !resolved.has(run.id));
  }
  return { ...wall, runs: runs.map((run) => resolved.get(run.id) ?? run) };
}

/** Clear every link whose leader is missing, the run itself, or on the other wall side. */
export function pruneStacks(wall) {
  const runs = wall.runs ?? [];
  const sides = new Map(runs.map((run) => [run.id, wallSideOf(run)]));
  let changed = false;
  const next = runs.map((run) => {
    const dropped = STACK_EDGES.filter((edge) => {
      const link = stackLink(run, edge);
      return link && (link.runId === run.id || sides.get(link.runId) !== wallSideOf(run));
    });
    if (dropped.length === 0) return run;
    changed = true;
    return {
      ...run,
      stack: { ...run.stack, ...Object.fromEntries(dropped.map((edge) => [edge, null])) },
    };
  });
  return changed ? { ...wall, runs: next } : wall;
}

/** "Sits on Base 0"–60" · flush" / "Held under Upper 0"–60" · 1" gap". */
export function describeStack(wall, run, edge) {
  const link = stackLink(run, edge);
  if (!link) return null;
  const leader = (wall.runs ?? []).find((candidate) => candidate.id === link.runId);
  const offset = link.offset ?? 0;
  const relation = offset > 0
    ? `${formatInches(offset)} gap`
    : offset < 0 ? `${formatInches(Math.abs(offset))} overlap` : 'flush';
  return `${edge === 'below' ? 'Sits on' : 'Held under'} ${leader ? runShortLabel(leader) : 'a missing run'} · ${relation}`;
}
```

**`model/room.js`**:
- Import `{ pruneStacks, resolveStacks, stackCreatesCycle } from './stacks.js';`.
- `syncRoom`, line 542: `nextRoom.walls = nextRoom.walls.map((wall) => pruneStacks(pruneFollows(pruneJoints(wall))));`
- The vertical pass's `return { ...wall, runs };` (609) becomes `return resolveStacks({ ...wall, runs }, profile);`
  (`profile` is the one declared at 589).
- New export, just after `tryPlaceRun` (734–748):

```js
/** Stack a run on another run's top (edge 'below') or under another run's bottom (edge 'above'), one-way. */
export function joinStack(room, wallId, runId, edge, leaderRunId, settings) {
  if (edge !== 'below' && edge !== 'above') return { ok: false, reason: 'stack-edge', room };
  const resolvedRoom = syncRoom(room, settings);
  const wall = resolvedRoom.walls.find((candidate) => candidate.id === wallId);
  const run = wall?.runs.find((candidate) => candidate.id === runId);
  const leader = wall?.runs.find((candidate) => candidate.id === leaderRunId);
  if (!run || !leader) return { ok: false, reason: 'run-not-found', room };
  if (wallSideOf(run) !== wallSideOf(leader)) return { ok: false, reason: 'stack-wall-side', room };
  if (Math.min(run.x + run.width, leader.x + leader.width) - Math.max(run.x, leader.x) <= PIN_EPSILON) {
    return { ok: false, reason: 'stack-no-overlap', room };
  }
  if (stackCreatesCycle(wall, runId, leaderRunId)) return { ok: false, reason: 'stack-cycle', room };

  const temporary = cloneRoom(resolvedRoom);
  const mutableRun = temporary.walls.find((candidate) => candidate.id === wallId)
    .runs.find((candidate) => candidate.id === runId);
  mutableRun.stack = {
    below: null,
    above: null,
    ...mutableRun.stack,
    [edge]: { runId: leaderRunId, offset: 0 },
  };
  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedWall.runs.find((candidate) => candidate.id === runId),
    settings,
  );
  return validation.ok
    ? { ok: true, reason: null, room: synced }
    : { ok: false, reason: validation.reason, room };
}
```

**`model/overlap.js`** (56) — `verticalStart` (6–11): a stacked run starts at its own z:

```js
export function verticalStart(run) {
  if (run.stack?.below) return run.z;
  return run.cabinetTypeId === CABINET_TYPE_IDS.BASE
    || run.cabinetTypeId === CABINET_TYPE_IDS.TALL
    ? 0
    : run.z;
}
```

**`model/index.js`**: add

```js
export {
  STACK_EDGES,
  describeStack,
  outerBottom,
  outerTop,
  pruneStacks,
  resolveStacks,
  stackCreatesCycle,
  stackFollowersOf,
  stackLeaders,
  stackLink,
  stackOf,
} from './stacks.js';
```

and `joinStack` in the room.js block (after `joinEdges`).

### Tests — NEW `src/elevation/model/__tests__/stacks.test.js` (5)

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { resolveProfile } from '../profile.js';
import { joinStack, syncRoom } from '../room.js';
import {
  describeStack,
  outerBottom,
  outerTop,
  stackCreatesCycle,
  stackFollowersOf,
  stackOf,
} from '../stacks.js';

const S = DEFAULT_SETTINGS;
const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;
const CAP = { id: 'cap', kind: 'bottom_cap', height: 1.5, doors: 'visible' };
const link = (runId, offset = 0) => ({ runId, offset });

function makeRun(id, cabinetTypeId, overrides = {}) {
  return {
    id, cabinetTypeId, x: 0, width: 60, z: 4, height: 30.5, depth: cabinetTypeId === UPPER ? 12 : 24,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    autoCount: false, maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
    ...overrides,
  };
}

function rawRoom(runs) {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], runs,
    }],
  };
}

const base = (overrides) => makeRun('B', BASE, overrides);
const upper = (overrides) => makeRun('U', UPPER, { bottom: [CAP], ...overrides });
const middle = (stack, overrides) => makeRun('M', UPPER, {
  heightMode: 'manual', z: 40, height: 10, stack, ...overrides,
});
/** The budgeted room: base with a countertop, upper with a cap, a middle run between them. */
const budgeted = (overrides = {}) => rawRoom([
  base(overrides.base), upper(overrides.upper),
  middle({ below: link('B'), above: link('U') }, overrides.middle),
]);
const runOf = (room, id) => room.walls[0].runs.find((run) => run.id === id);

describe('SPEC-35 stacked runs', () => {
  it('fills between a countertop and a cap, and refits when either moves', () => {
    const synced = syncRoom(budgeted(), S);
    expect(runOf(synced, 'B')).toMatchObject({ z: 4, height: 30.5 });
    expect(runOf(synced, 'U')).toMatchObject({ z: 54, height: 36 });
    expect(runOf(synced, 'M')).toMatchObject({ z: 36, height: 16.5 });

    const moved = syncRoom(budgeted({
      base: { overrides: { baseBoxHeight: 32 } },
      upper: { overrides: { upperClearance: 20 } },
    }), S);
    expect(runOf(moved, 'B')).toMatchObject({ z: 4, height: 32 });
    expect(runOf(moved, 'U')).toMatchObject({ z: 57.5, height: 32.5 });
    expect(runOf(moved, 'M')).toMatchObject({ z: 37.5, height: 18.5 });
  });

  it('keeps a manual height or an auto edge when only one side is linked', () => {
    const onBase = syncRoom(rawRoom([base(), upper(), middle({ below: link('B', 1), above: null })]), S);
    expect(runOf(onBase, 'M')).toMatchObject({ z: 37, height: 10 });

    const underUpper = syncRoom(rawRoom([base(), upper(), middle({ below: null, above: link('U', 2) })]), S);
    expect(runOf(underUpper, 'M')).toMatchObject({ z: 40.5, height: 10 });

    const hutch = syncRoom(rawRoom([base(), upper({ stack: { below: link('B'), above: null } })]), S);
    expect(runOf(hutch, 'U')).toMatchObject({ z: 37.5, height: 52.5 });
  });

  it('frees links to missing or other-side runs, and leaves a loop where it was', () => {
    const missing = runOf(syncRoom(rawRoom([middle({ below: link('X'), above: null })]), S), 'M');
    expect(missing.stack.below).toBeNull();
    expect(missing).toMatchObject({ z: 40, height: 10 });

    const otherSide = syncRoom(rawRoom([
      base({ wallSide: 'back' }), middle({ below: link('B'), above: null }),
    ]), S);
    expect(runOf(otherSide, 'M').stack.below).toBeNull();

    const loop = syncRoom(rawRoom([
      makeRun('P', UPPER, { heightMode: 'manual', z: 40, height: 10, stack: { below: link('Q'), above: null } }),
      makeRun('Q', UPPER, { heightMode: 'manual', z: 60, height: 10, stack: { below: link('P'), above: null } }),
    ]), S);
    expect(runOf(loop, 'P')).toMatchObject({ z: 40, height: 10 });
    expect(runOf(loop, 'Q')).toMatchObject({ z: 60, height: 10 });
  });

  it('finds stacks, followers and loops, and describes a link', () => {
    const room = syncRoom(budgeted(), S);
    const wall = room.walls[0];
    const profile = resolveProfile(S, room, wall);
    expect(outerTop(wall, runOf(room, 'B'), profile)).toBe(36);
    expect(outerBottom(runOf(room, 'U'))).toBe(52.5);
    expect(stackOf(wall, 'U').map((run) => run.id)).toEqual(['B', 'M', 'U']);
    expect(stackFollowersOf(wall, ['B'])).toEqual(['M']);
    expect(stackFollowersOf(wall, ['U'])).toEqual(['M']);
    expect(stackCreatesCycle(wall, 'B', 'M')).toBe(true);
    expect(stackCreatesCycle(wall, 'M', 'B')).toBe(false);
    expect(stackCreatesCycle(wall, 'M', 'M')).toBe(true);
    expect(describeStack(wall, runOf(room, 'M'), 'below')).toBe('Sits on Base 0"–60" · flush');

    const gapped = syncRoom(budgeted({ middle: { stack: { below: link('B'), above: link('U', 1) } } }), S);
    expect(describeStack(gapped.walls[0], runOf(gapped, 'M'), 'above')).toBe('Held under Upper 0"–60" · 1" gap');
  });

  it('joins a stack, and refuses a loop, no overlap or a collision', () => {
    const room = rawRoom([base(), upper(), middle(undefined)]);
    const first = joinStack(room, 'A', 'M', 'below', 'B', S);
    expect(first.ok).toBe(true);
    expect(runOf(first.room, 'M')).toMatchObject({ z: 36, height: 10 });
    expect(runOf(first.room, 'M').stack).toEqual({ below: link('B'), above: null });

    const second = joinStack(first.room, 'A', 'M', 'above', 'U', S);
    expect(second.ok).toBe(true);
    expect(runOf(second.room, 'M')).toMatchObject({ z: 36, height: 16.5 });

    expect(joinStack(second.room, 'A', 'B', 'below', 'M', S)).toMatchObject({ ok: false, reason: 'stack-cycle' });
    expect(joinStack(room, 'A', 'U', 'below', 'B', S)).toMatchObject({ ok: false, reason: 'conflict' });
    expect(joinStack(rawRoom([base(), makeRun('X', UPPER, { x: 70, width: 24 })]), 'A', 'X', 'below', 'B', S))
      .toMatchObject({ ok: false, reason: 'stack-no-overlap' });

    const tall = joinStack(
      rawRoom([base(), makeRun('T', TALL, { heightMode: 'manual', z: 40, height: 20 })]),
      'A', 'T', 'below', 'B', S,
    );
    expect(tall.ok).toBe(true);
    expect(runOf(tall.room, 'T')).toMatchObject({ z: 36, height: 20 });
  });
});
```

Working (default profile: toe kick 4, base box 30 1/2, counter 1 1/2, clearance 18, crown top 96, stack 6; the
auto numbers for B and U were checked against the current code):
- Budgeted: B 4–34 1/2, stone top to 36. U auto: counter 36 + 18 = 54, box top 96 − 6 = 90 → 36 tall; its cap
  hangs 52 1/2–54. M's top is none (it's held under U), so M runs 36 → 52 1/2: z 36, height 16 1/2.
- Moved: B 32 tall → top 36 → countertop to 37 1/2. U: 37 1/2 + 20 = 57 1/2, height 90 − 57 1/2 = 32 1/2; cap
  bottom 56. M: 37 1/2 → 56 = 18 1/2.
- Below only, gap 1 (manual): z 36 + 1 = 37, height 10. Above only, gap 2 (manual): top 52 1/2 − 2 = 50 1/2,
  z 40 1/2. Hutch: U (auto, cap 1 1/2) on B → z 36 + 1 1/2 = 37 1/2, keeps its auto top 90 → 52 1/2.
- Missing leader: link freed, manual M keeps 40/10. Loop: neither is ever ready.
- `stackOf` sorts by z: B 4, M 36, U 54.
- Collision: U stacked on B would be 37 1/2–90 (auto top kept), over M at 40–50 (M is an upper, starts at 40).
- The tall on the base: without the `verticalStart` change the tall counts from the floor and collides with B.

**Count:** 655 + 5 = **660**.

---

## §9 Step 198 — one vertical chain per stack

**`model/dimensions.js`**:
- Imports add `import { runBottomParts } from './bottoms.js';` and `import { stackOf } from './stacks.js';`.
- Rename the current `pickColumnRuns` (335–368) to `function pickColumnPair(…)` (not exported, body unchanged)
  and add below it:

```js
/** Choose the runs the vertical dimension column measures; a joined stack comes back as `stack`. */
export function pickColumnRuns(wall, selectedRunId, edge = 'left') {
  const column = pickColumnPair(wall, selectedRunId, edge);
  const seed = [column.lowerRun, column.upperRun].find((run) => run?.id === selectedRunId)
    ?? column.lowerRun
    ?? column.upperRun;
  const stack = seed ? stackOf(wall, seed.id) : [];
  return stack.length > 1 ? { ...column, stack } : column;
}
```

- New, just above `verticalChains`:

```js
/** One chain up a joined stack, bottom to top: each run's parts below, box and top, with the gaps. */
export function stackChain(room, wall, runs, settings) {
  const profile = resolveProfile(settings, room, wall);
  const inner = [];
  let cursor = 0;
  const append = (end, kind) => {
    if (end - cursor <= SEGMENT_EPSILON) return;
    appendSegment(inner, cursor, end, kind);
    cursor = end;
  };
  [...runs].sort((a, b) => a.z - b.z).forEach((run, index) => {
    const parts = runBottomParts(run);
    const lower = run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL;
    append(parts.length > 0 ? parts.at(-1).z : run.z, index === 0 && lower ? 'toe-kick' : 'open');
    for (const part of [...parts].reverse()) append(part.z + part.height, 'bottom');
    append(run.z + run.height, 'box');
    const top = runTop(wall, run, profile);
    append(run.z + run.height + top.height, isCountertop(top.kind) ? 'countertop' : 'molding');
  });
  append(wall.height, 'open');
  return {
    inner,
    outer: wall.height > SEGMENT_EPSILON ? [{ start: 0, end: wall.height, kind: 'wall' }] : [],
  };
}
```

- `verticalChains`: the signature becomes `verticalChains(room, wall, { lowerRun, upperRun, stack = null }, settings)`
  and its first line `if (stack && stack.length > 1) return stackChain(room, wall, stack, settings);`.
  ElevationCanvas already passes `pickColumnRuns(…)` straight in, so it needs no change.
- The `upperRun` block (419–428) shows the upper's parts below:

```js
  if (upperRun) {
    const parts = runBottomParts(upperRun);
    append(
      cursor,
      parts.length > 0 ? parts.at(-1).z : upperRun.z,
      lowerRun?.cabinetTypeId === CABINET_TYPE_IDS.BASE ? 'clearance' : 'open',
    );
    for (const part of [...parts].reverse()) append(part.z, part.z + part.height, 'bottom');
    if (append(upperRun.z, upperRun.z + upperRun.height, 'box')) {
      rememberBox(upperRun);
    }
  }
```

**`model/index.js`**: add `stackChain` to the dimensions block.

### Tests — `stacks.test.js`: add `import { pickColumnRuns, verticalChains } from '../dimensions.js';`; a describe at the end (2)

```js
describe('SPEC-35 stack chain', () => {
  const kindsAndLengths = (chain) => chain.inner.map(({ kind, start, end }) => [kind, end - start]);

  it('draws one chain up a joined stack', () => {
    const room = syncRoom(budgeted(), S);
    const wall = room.walls[0];
    const column = pickColumnRuns(wall, null, 'left');
    expect(column.stack.map((run) => run.id)).toEqual(['B', 'M', 'U']);
    expect(kindsAndLengths(verticalChains(room, wall, column, S))).toEqual([
      ['toe-kick', 4], ['box', 30.5], ['countertop', 1.5], ['box', 16.5],
      ['bottom', 1.5], ['box', 36], ['molding', 6],
    ]);
  });

  it('shows an upper\'s parts below in the ordinary chain', () => {
    const room = syncRoom(rawRoom([base(), upper()]), S);
    const wall = room.walls[0];
    const column = pickColumnRuns(wall, null, 'left');
    expect('stack' in column).toBe(false);
    expect(kindsAndLengths(verticalChains(room, wall, column, S))).toEqual([
      ['toe-kick', 4], ['box', 30.5], ['countertop', 1.5], ['clearance', 16.5],
      ['bottom', 1.5], ['box', 36], ['molding', 6],
    ]);
  });
});
```

Working: the budgeted stack is 4 + 30 1/2 + 1 1/2 + 16 1/2 + 1 1/2 + 36 + 6 = 96, the wall height, so no open
segment at the top. Unstacked, the clearance runs from the countertop (36) to the cap (52 1/2). The
`pickColumnRuns` default picks B as the lower run (the only base), so the stack is seeded from B.

**Count:** 660 + 2 = **662**.

---

## §10 Step 199 — stacks in the panel

**`store/elevationSlice.js`**:
- The room.js import (48–58) adds `joinStack`.
- After `setRunJointOffset` (1040–1049):

```js
    joinRunStack(state, action) {
      const location = wallLocation(state, action.payload);
      if (!location) return;
      const { runId, edge, leaderRunId } = action.payload;
      const result = joinStack(
        location.room,
        location.wall.id,
        runId,
        edge,
        leaderRunId,
        state.settings,
      );
      if (!result.ok) state.message = result.reason;
      else {
        state.rooms[location.roomIndex] = result.room;
        state.message = null;
      }
      syncRoomAt(state, location.roomIndex);
    },
    setRunStackOffset(state, action) {
      const location = runLocation(state, action.payload);
      const { edge, offset } = action.payload;
      const link = location?.run.stack?.[edge];
      if (!location || !link || !Number.isFinite(offset)) return;
      link.offset = offset;
      syncRoomAt(state, location.roomIndex);
    },
    freeRunStack(state, action) {
      const location = runLocation(state, action.payload);
      const { edge } = action.payload;
      if (!location || !location.run.stack?.[edge]) return;
      location.run.stack[edge] = null;
      syncRoomAt(state, location.roomIndex);
    },
```

- Export `joinRunStack`, `setRunStackOffset`, `freeRunStack` after `setRunJointOffset,` in the actions list.

**`store/__tests__/elevationSlice.test.js`** — add the three to the slice import; a describe after
`describe('SPEC-34.3 follow reducers')`:

```js
describe('SPEC-35 stack reducers', () => {
  function stackState() {
    const state = stateWithRun();
    state.rooms[0].walls[0].runs = [
      run({ id: 'B', x: 0, width: 60, heightMode: 'auto', autoCount: false, items: [auto('B-cabinet')] }),
      run({
        id: 'U', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 0, width: 60, z: 54, height: 36, depth: 12,
        heightMode: 'auto', autoCount: false, items: [auto('U-cabinet')],
      }),
      run({
        id: 'M', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 0, width: 60, z: 40, height: 10, depth: 12,
        autoCount: false, items: [auto('M-cabinet')],
      }),
    ];
    return state;
  }
  const runById = (state, id) => state.rooms[0].walls[0].runs.find((entry) => entry.id === id);
  const at = { wallId: 'wall-1', runId: 'M' };

  it('stacks a run, gaps it, refuses a loop and frees it', () => {
    let state = elevationReducer(stackState(), joinRunStack({ ...at, edge: 'below', leaderRunId: 'B' }));
    expect(state.message).toBeNull();
    expect(runById(state, 'M')).toMatchObject({ z: 36, height: 10 });

    state = elevationReducer(state, joinRunStack({ ...at, edge: 'above', leaderRunId: 'U' }));
    expect(runById(state, 'M')).toMatchObject({ z: 36, height: 18 });

    state = elevationReducer(state, setRunStackOffset({ ...at, edge: 'below', offset: 1 }));
    expect(runById(state, 'M')).toMatchObject({ z: 37, height: 17 });

    state = elevationReducer(state, joinRunStack({
      wallId: 'wall-1', runId: 'B', edge: 'below', leaderRunId: 'M',
    }));
    expect(state.message).toBe('stack-cycle');
    expect(runById(state, 'B').stack).toBeUndefined();

    state = elevationReducer(state, freeRunStack({ ...at, edge: 'above' }));
    expect(runById(state, 'M').stack).toEqual({ below: { runId: 'B', offset: 1 }, above: null });
    expect(runById(state, 'M')).toMatchObject({ z: 37, height: 17 });
  });
});
```

Working: B auto 4–34 1/2 + counter → 36. U auto at 54 (no cap here), so M fills 36–54 = 18. Gap 1 → 37–54 = 17.
Freed above, the manual M keeps its stored height 17 and still sits 1" above the counter.

**`components/properties/RunHeightsSection.jsx`** (131):
- Imports from `'../../model/index.js'` add `STACK_EDGES`, `describeStack`, `runShortLabel`, `stackLink`,
  `wallSideOf`; from the slice add `freeRunStack`, `joinRunStack`, `setRunStackOffset`.
- After `overrideFields` (47):

```js
  const links = Object.fromEntries(STACK_EDGES.map((edge) => [edge, stackLink(run, edge)]));
  const stacked = Boolean(links.below || links.above);
  const filled = Boolean(links.below && links.above);
```

- The manual branch (100–115): the Z field shows `<ReadOnlyValue value={run.z} ariaLabel="Run z" />` when
  `stacked`, else the current `InchInput`; the Height field shows `<ReadOnlyValue value={run.height}
  ariaLabel="Run height" />` when `filled`, else the current `InchInput`.
- Before the "Reset heights to defaults" button (118):

```jsx
        <div className="mt-3 space-y-3 border-t border-gray-700 pt-3">
          {STACK_EDGES.map((edge) => {
            const link = links[edge];
            const candidates = wall.runs.filter((candidate) => candidate.id !== run.id
              && wallSideOf(candidate) === wallSideOf(run)
              && (candidate.id === link?.runId
                || Math.min(candidate.x + candidate.width, run.x + run.width)
                  - Math.max(candidate.x, run.x) > 1e-6));
            return (
              <div key={edge} className="space-y-2">
                <Field label={edge === 'below' ? 'Sits on' : 'Held under'}>
                  <select
                    value={link?.runId ?? ''}
                    onChange={(event) => dispatch(event.target.value
                      ? joinRunStack({ ...actionBase, edge, leaderRunId: event.target.value })
                      : freeRunStack({ ...actionBase, edge }))}
                    aria-label={`Run ${edge} stack`}
                    className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Nothing</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{runShortLabel(candidate)}</option>
                    ))}
                  </select>
                </Field>
                {link && (
                  <>
                    <Field label="Gap">
                      <InchInput
                        value={link.offset ?? 0}
                        allowBlank
                        placeholder="0"
                        onCommit={(value) => dispatch(setRunStackOffset({
                          ...actionBase,
                          edge,
                          offset: value ?? 0,
                        }))}
                        aria-label={`Run ${edge} stack gap`}
                      />
                    </Field>
                    <p className="text-xs text-cyan-300">{describeStack(wall, run, edge)}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
```

**`components/RunGroup.jsx`**: `hasToeKick` (175) becomes

```js
  const hasToeKick = !run.stack?.below
    && (run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL);
```

**Count:** 662 + 1 = **663**.

---

## §11 Step 200 — outset

**`model/corners.js`** — `frontDepth` (19–22):

```js
/** Return the installed front depth of a run, measured from the wall (outset included). */
export function frontDepth(run, settings) {
  return (run.outset ?? 0) + run.depth + settings.bumperThickness + settings.doorThickness;
}
```

Every existing caller wants the run's front measured from the wall — corner reserves, blind panel widths,
neighbour returns, wall end panels, plan markers — so they all pick up the outset without changes. Two callers
also assume the run's back is at the wall, and change below.

**`model/footprints.js`** — `runFootprint` (7–15): the two back points use `run.outset ?? 0` instead of `0`.

**`model/planPieces.js`** (237) — `planRunPieces` (165–):
- First line: `const outset = run.outset ?? 0;`
- `faceFront` (167) becomes `frontDepth(run, settings) - outset`; the `frontLine` (177) uses `faceFront` instead of
  calling `frontDepth` again.
- Just before the `return` (228):

```js
  const shift = (piece) => (outset
    ? { ...piece, back: piece.back + outset, front: piece.front + outset }
    : piece);
```

  and the return's `boxes, faces, returns` become `boxes: boxes.map(shift)`, `faces: faces.map(shift)`,
  `returns: returns.map(shift)`. `span` is along the wall and doesn't change.

**`model/neighborProfiles.js`** — line 39: `[run.outset ?? 0, depth].map(…)` instead of `[0, depth]`.

**`components/properties/RunGeometrySection.jsx`** (139) — after the Depth field (79–85), inside the same grid:

```jsx
          <Field label="Outset">
            <InchInput
              value={run.outset ?? 0}
              onCommit={(value) => {
                if (value === null || value < 0) return false;
                return validateAndDispatch({ outset: value });
              }}
              aria-label="Run outset"
            />
          </Field>
```

The "Front depth" read-out already calls `frontDepth`, so it now reads the front from the wall.

### Tests — NEW `src/elevation/model/__tests__/outset.test.js` (2)

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { frontDepth } from '../corners.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { runFootprint } from '../footprints.js';
import { planRunPieces } from '../planPieces.js';
import { syncRoom } from '../room.js';
import { wallSideFrame } from '../wallSides.js';

const S = DEFAULT_SETTINGS;

function outsetRoom(outset) {
  return syncRoom({
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [],
      runs: [{
        id: 'B', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 10, width: 30, z: 4, height: 30.5, depth: 24,
        ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
        autoCount: false, maxCabinetWidth: null,
        items: [{ id: 'B-cabinet', kind: 'cabinet', width: null }],
        heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
        ...(outset === undefined ? {} : { outset }),
      }],
    }],
  }, S);
}

describe('SPEC-35 outset', () => {
  it('measures the front from the wall and sets the footprint back', () => {
    expect(frontDepth({ depth: 24 }, S)).toBe(24.875);
    expect(frontDepth({ depth: 24, outset: 2 }, S)).toBe(26.875);
    const room = outsetRoom(3);
    const wall = room.walls[0];
    expect(runFootprint(wallSideFrame(room, wall, 'front'), wall.runs[0], S)).toEqual([
      { x: 10, y: 3 }, { x: 40, y: 3 }, { x: 40, y: 27.875 }, { x: 10, y: 27.875 },
    ]);
  });

  it('moves plan boxes and faces out by the outset', () => {
    const planOf = (room) => {
      const wall = room.walls[0];
      const run = wall.runs[0];
      const layout = layoutRun(room, wall, run, S);
      return planRunPieces(room, wall, run, S, layout, runFaceLayouts(room, wall, run, S, layout));
    };
    expect(planOf(outsetRoom()).boxes).toEqual([{ key: 'B-cabinet', start: 10, end: 40, back: 0, front: 24 }]);
    const pieces = planOf(outsetRoom(3));
    expect(pieces.boxes).toEqual([{ key: 'B-cabinet', start: 10, end: 40, back: 3, front: 27 }]);
    expect(pieces.faces.map(({ back, front }) => [back, front])).toEqual([[27.0625, 27.875], [27.0625, 27.875]]);
    expect(pieces.span).toEqual({ start: 10, end: 40 });
  });
});
```

Working (the no-outset values were checked against the current code): front = 24 + 1/16 bumper + 13/16 door =
24 7/8; with 2 off the wall, 26 7/8. The 30" base has a pair door; its faces sit at 24 1/16–24 7/8 today, 3 more
with the outset. The footprint's back points move from y 0 to y 3.

**Count:** 663 + 2 = **665**.

---

## §12 Step 201 — clearance from what's really below

**The problem.** An auto upper sits at "counter + clearance", but the counter comes from the height settings
(toe kick + base box height + countertop, with that base's overrides), not from the base itself. A manual-height
base (typed 42" or 30") is ignored, so is a tall under the upper, and from step 192 on so is the base's real top
(none, wood, crown).

**The rule.** Measure from the floor-standing runs the upper overlaps: base and tall runs that aren't stacked on
anything. Each one's top is its box top plus the top it actually carries (`runTop`). One counts only if that top
is below the upper's box top, so a full-height tall beside an upper (crown to 96") doesn't push the upper up. The
upper sits clearance above the highest one, and warns if they differ, as now. With nothing below, it falls back
to the profile counter, as now. Stacked runs are left out: they resolve after the auto pass, and a run held under
this upper would otherwise loop. It isn't tied to the upper's type beyond "an auto upper hangs clearance above
what's under it". "Sits on" + Gap (step 199) stays the explicit way to put any run a set distance above another.

With today's defaults every result is the same as now: an auto base still tops out at 36, and an auto tall's
crown (96) is above the upper's box top, so it's skipped. (Checked: the whole suite passes with this rule.)

**`model/profile.js`** — `resolveVertical` (45–97). Entries in its third argument may now carry `counterTop`, the
measured top. Those count whatever their type, as long as they're below the box top; entries without it keep
today's profile formula, which `profile.test.js` still uses. Lines 66–72 become:

```js
    const overlappingBases = baseRunsBelow.filter((base) => (
      (Number.isFinite(base.counterTop)
        ? base.counterTop < boxTop - 1e-6
        : base.cabinetTypeId === CABINET_TYPE_IDS.BASE)
      && Math.min(run.x + run.width, base.x + base.width) - Math.max(run.x, base.x) > 1e-6
    ));
    const counterHeights = overlappingBases.map((base) => (
      Number.isFinite(base.counterTop)
        ? base.counterTop
        : counterTop(mergeDefined(profile, base.overrides))
    ));
```

**`model/room.js`**:
- Import `{ runTop } from './tops.js';`.
- Just above `syncRoom`:

```js
/** Base and tall runs standing on the floor, each with counterTop: the top of what it really carries. */
function floorRunsWithTops(wall, runs, profile) {
  return runs
    .filter((run) => (run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL) && !run.stack?.below)
    .map((run) => ({ ...run, counterTop: run.z + run.height + runTop(wall, run, profile).height }));
}
```

- `syncRoom`'s vertical pass: the third argument to `resolveVertical` (the `runs.filter(… BASE … wallSideOf …)`)
  becomes `floorRunsWithTops(wall, runs.filter((candidate) => wallSideOf(candidate) === wallSideOf(run)), profile)`.
  Bases and talls are resolved before uppers in that loop, so their z and height are already final.
- `roomDiagnostics`: `const bases = …` becomes `const bases = floorRunsWithTops(wall, wall.runs, profile);` (that
  `wall` is already one side's view).

**`components/properties/WarningsList.jsx`** — the `'mixed-counter-heights'` text becomes
`'The runs below this one have different top heights.'`

### Tests — `tops.test.js`: a describe at the end (2)

```js
describe('SPEC-35 uppers clear what is really below them', () => {
  const upperOf = (runs) => makeRoom(runs).walls[0].runs.find((run) => run.id === 'U');

  it('clears the real top of a manual base, whatever top it carries', () => {
    expect(upperOf([makeRun('B', BASE, { heightMode: 'manual', height: 38 }), makeRun('U', UPPER)]))
      .toMatchObject({ z: 61.5, height: 28.5 });
    expect(upperOf([makeRun('B', BASE, { heightMode: 'manual', height: 24.5 }), makeRun('U', UPPER)]))
      .toMatchObject({ z: 48, height: 42 });
    expect(upperOf([makeRun('B', BASE, { top: 'none' }), makeRun('U', UPPER)]))
      .toMatchObject({ z: 52.5, height: 37.5 });
  });

  it('clears a short tall, skips a full-height one and falls back to the profile', () => {
    expect(upperOf([makeRun('T', TALL, { heightMode: 'manual', height: 40 }), makeRun('U', UPPER)]))
      .toMatchObject({ z: 62, height: 28 });
    expect(upperOf([makeRun('T', TALL), makeRun('U', UPPER)])).toMatchObject({ z: 54, height: 36 });
    expect(upperOf([makeRun('U', UPPER)])).toMatchObject({ z: 54, height: 36 });
  });
});
```

Working (box top 90, clearance 18): 42" base = box 4–42 + 1 1/2 stone = 43 1/2 → upper 61 1/2, 28 1/2 tall. 30"
base = box 4–28 1/2 + 1 1/2 = 30 → 48, 42 tall. Auto base, no top → 34 1/2 → 52 1/2, 37 1/2 tall. Short manual
tall 4–44, no top → 62, 28 tall. Auto tall: crown to 96 ≥ 90 → skipped → profile counter 36 → 54. (All but the
no-top case were run against a stand-in for `runTop`; the no-top case is arithmetic.)

**Count:** 665 + 2 = **667**.

**Done when (round):** `npm test` (667) and `npm run lint` clean; with no tops, parts, stacks or outsets set,
everything behaves exactly as now.

## Open after this round

1. Auto heights with an explicit top (a tall with a wood top or none still leaves room for the crown).
2. Drawing a run between two runs doesn't stack it; no ⛓ glyph for stacks; dragging a leader doesn't preview its
   stacked runs.
3. Parts below a run: part numbers (light rail / cap as molding parts), plan view, a shop value for each default
   height (trough 3", cap 1 1/2", corbels 6" are guesses).
4. REV-011 on face frame runs (round 36). Retire the upper's "Flush" Bottom option once parts below have been
   used on a real room.
5. REV-011 "visible" = the standard reveal, still to confirm.
6. The horizontal lower/upper chains still list stacked runs by type.
7. Carried: a leader drag pushing a follower into a third run; top/bottom panels in plan; floating shelf
   thickness; reveal under a flush top panel.
