# Round 46.1 — SPEC: slab with applied molding, and door styles in the UI

Steps 386–395, designer only, on branch `elevation-doors`. Geometry and the API don't change.
Doors & profiles rounds (DOORS-PROFILES-PLAN §10): 46 model ✅ → **46.1 slab-applied + door styles UI** → 46.2 canvas door details → 46.3 library screens → 46.4 door details in the DXF → 47+ profiles.

**Done when:**
- A third design, **Slab AM** (slab with applied molding), sets its molding in by the style's stile/rail widths, shrinks it on short fronts like rails, and leaves it off under the slab cutoff (P17). Plain Slab loses the `applied` slot.
- The room has a **Door styles** section: list, new (copy of the team default or another style), edit in a door style tool, delete (moving its uses to another style or to inherit).
- Room, wall, run and cabinet each have **Doors / Drawer fronts / Panels** pickers showing what they inherit.
- A selected face, a run's end panel, a wall end panel and a panel cell each get a style picker and a **Stiles & rails** block (**Molding inset** on Slab AM) with one field per side, notes, and mid rails/stiles.
- A flush panel cell's depth placeholder uses the run's front plane (thickest face).
- With no styles in a room, every drawing number is what it is today.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **386** | designer | Slab AM design; `partSizes` and the stacking check handle it | 1013 → **1018** |
| **387** | designer | `doorStyleEdits.js`: new style, labels, where a style is used, reassign | **1022** |
| **388** | designer | Part edits: `setFacePart`, per-side size edits, picker options, size rows | **1028** |
| **389** | designer | Store: add / edit / delete a room's door styles | **1032** |
| **390** | designer | Store: picks at every level, part styles and sizes, keep them on other edits | **1037** |
| **391** | designer | UI: room Door styles section, room pickers | 1037 |
| **392** | designer | UI: door style tool | 1037 |
| **393** | designer | UI: pickers on wall, run, cabinet | 1037 |
| **394** | designer | UI: face style picker + Stiles & rails block | 1037 |
| **395** | designer | UI: panel style pickers + blocks; flush-panel depth placeholder | 1037 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Test values come from the rules here and SPEC-46's functions as committed in steps 379–385 (read-only). If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got. Steps 391–395 are UI only: there are no component tests in this repo, so they're gated by the suite staying at 1037, lint and build, and Kyle's check at the end.

---

## §1 Decisions

From DOORS-PROFILES-PLAN (P2, P2a, P12, P13, P15, P17, §3.2, §5). New or narrowed here (Claude's defaults, say if you want any changed):

- **Slab AM molding (open question 9, Claude's default).** The molding inset *is* the style's stile/rail widths, and short fronts use the same rule as rails (2 1/8" min panel, 1 5/8" min inset, slab under 4 13/16"). Under the cutoff the front is a plain slab with the molding left off. If Kyle's answer differs it's a change inside `partSizes` only.
- **Slab AM result shape.** Same keys as a 5-piece result (`stiles`, `rails`, `midRails`, `midStiles`, `opening`, `sources`, `notes`), with `construction: 'slab_applied'`; `opening` is the molding rectangle. Under the cutoff: `{ construction: 'slab', slab: 'rule', molding: false }`. The 5-piece results don't change (SPEC-46 tests compare them whole).
- **New style = complete copy.** Copy of the team default style (`teamDoorStyle(settings)`, so it carries today's Settings → Door thickness) or of a room style; new id, next free label (A–Z, then 1, 2, …), no `name`.
- **Delete.** An unused style just goes. A used one needs a target: another style, or *inherit* (every pick of it is removed). The tool shows how many places use it. When the list is empty, `room.doorStyles` is removed.
- **Pickers.** Each picker shows *Inherit (A · 5PC · 13/16")*: the style the levels above give, not counting this level's own pick. Rows read `label · design code · thickness`. Below the room, pickers are hidden while the room has no styles (less clutter); the room section always shows them.
- **Per-part block.** Shows the final size of every side greyed (style, or short-face rule marked "short face"), typed sizes as values; blank clears. Notes per side. Mid rails/stiles: add (at half the height / width), move, set width, remove. The opening line says *Panel W × H* or *Molding W × H*. A slab part shows only why it's a slab.
- **Panel sizes in the block.** A run end panel and a blind panel: width = the run's front depth (`frontDepth`), height = run height. Wall end panel: width = its depth on this side, height = its top. Panel cell: side panel = depth × height, top panel = width × depth, back panel = width × height.
- **Kept across edits.** `setWallEndPanel` and a panel cell's type change keep `styleId` / `sizes`; `setItemFace` now re-syncs the room so a face's style moves the run's front plane (P11) at once.
- **The door style tool** is a modal over the room. Fields that don't apply to the design are greyed, not cleared (switching designs loses nothing). Profiles show "square" read-only until the profile library (round 50). Arch rise is greyed until an arched design exists (46.3).
- **Imports.** UI files import the door-style functions straight from their modules (`doorStyles.js`, `doorStyleResolve.js`, `doorSizes.js`, `doorStyleEdits.js`, `faceTree.js`, `corners.js`); `model/index.js` doesn't change.
- **Not in 46.1:** canvas door details and warnings on the canvas (46.2), designs library / team default style screen (46.3), DXF (46.4), the panel-thickness vs style-thickness warning (later), keeping a style on a joined run's auto end (roomSync rebuilds those ends; later), profiles, arches.

---

## §2 Step 386 — Slab AM design

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorStyles.js` | ~160 | third seed; slab's slots |
| `src/elevation/model/doorSizes.js` | ~70 | `partSizes` and `frontStackWarnings` handle `slab_applied` |
| `src/elevation/model/__tests__/doorStyles.test.js` | ~110 | test 1's expected list (below) |
| `src/elevation/model/__tests__/doorSizes.test.js` | ~150 | delete two lines (below) |
| NEW `src/elevation/model/__tests__/slabApplied.test.js` | — | 5 tests, verbatim |

**Contract.**
- `DOOR_DESIGNS`: `slab`'s `slots` becomes `['outside']`; append `{ id: 'slab-applied', code: 'Slab AM', vendor: null, description: 'Slab with applied molding', construction: 'slab_applied', topRail: { shape: 'flat' }, bottomRail: { shape: 'flat' }, slots: ['outside', 'applied'] }`.
- `partSizes(style, design, part)`:
  - `construction === 'slab'` → `{ construction: 'slab', slab: 'design' }` (unchanged).
  - `five_piece` under `slabBelow` → `{ construction: 'slab', slab: 'rule' }` (unchanged). `slab_applied` under `slabBelow` → `{ construction: 'slab', slab: 'rule', molding: false }`.
  - Otherwise both `five_piece` and `slab_applied` run the existing rail/stile/mid/opening/sources/notes code; the result's `construction` is the design's. Any other construction value is treated as `'slab'` (design).
- `frontStackWarnings`: a part counts when its `sizes.construction` is `'five_piece'` or `'slab_applied'` (mixed pairs compare too). Doc comment adds "molding rectangles count as panels (P17)".

**Edit `doorStyles.test.js`** test 1: the expected list becomes

```js
      ['five-piece-square', '5PC', 'five_piece', ['outside', 'inside', 'panel', 'applied']],
      ['slab', 'Slab', 'slab', ['outside']],
      ['slab-applied', 'Slab AM', 'slab_applied', ['outside', 'applied']],
```

**Edit `doorSizes.test.js`**: delete lines 75–76 (the `{ ...SLAB, construction: 'slab_applied' }` assertion, now covered by `slabApplied.test.js`). Nothing else in either file changes.

**NEW `src/elevation/model/__tests__/slabApplied.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS, findDoorDesign } from '../doorStyles.js';
import { frontStackWarnings, partSizes } from '../doorSizes.js';

const [SQUARE, SLAB, SLAB_AM] = DOOR_DESIGNS;

/** Insets and molding height of a 15" wide Slab AM front, or the whole result when it isn't slab_applied. */
function inset(height, sizes) {
  const result = partSizes(DEFAULT_DOOR_STYLE, SLAB_AM, { width: 15, height, ...(sizes ? { sizes } : {}) });
  return result.construction === 'slab_applied'
    ? [result.rails.top, result.rails.bottom, result.opening.height]
    : result;
}

describe('SPEC-46.1 slab with applied molding (P17)', () => {
  it('seeds a third design and takes the applied slot off plain slab', () => {
    expect(SLAB_AM).toEqual({
      id: 'slab-applied',
      code: 'Slab AM',
      vendor: null,
      description: 'Slab with applied molding',
      construction: 'slab_applied',
      topRail: { shape: 'flat' },
      bottomRail: { shape: 'flat' },
      slots: ['outside', 'applied'],
    });
    expect(SLAB.slots).toEqual(['outside']);
    expect(findDoorDesign('slab-applied')).toBe(SLAB_AM);
  });

  it('sets the molding in by the stile and rail widths', () => {
    expect(partSizes(DEFAULT_DOOR_STYLE, SLAB_AM, { width: 15, height: 30 })).toEqual({
      construction: 'slab_applied',
      slab: null,
      stiles: { left: 3, right: 3 },
      rails: { top: 3, bottom: 3 },
      midRails: [],
      midStiles: [],
      opening: { width: 9, height: 24 },
      sources: { top: 'style', bottom: 'style', left: 'style', right: 'style' },
      notes: {},
    });
    expect(partSizes(DEFAULT_DOOR_STYLE, SLAB, { width: 15, height: 30 })).toEqual({ construction: 'slab', slab: 'design' });
  });

  it('shrinks the inset on short fronts like rails, and leaves the molding off under the cutoff', () => {
    expect([9, 8, 7, 4.8125].map((height) => inset(height))).toEqual([
      [3, 3, 3],
      [2.9375, 2.9375, 2.125],
      [2.4375, 2.4375, 2.125],
      [1.625, 1.625, 1.5625],
    ]);
    expect(inset(4.75)).toEqual({ construction: 'slab', slab: 'rule', molding: false });
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 4.75 })).toEqual({ construction: 'slab', slab: 'rule' });
  });

  it('keeps typed insets, notes and mid rails/stiles', () => {
    const typed = partSizes(DEFAULT_DOOR_STYLE, SLAB_AM, {
      width: 15, height: 10, sizes: { rails: { top: 2 }, stiles: { left: 3.5 }, notes: { left: 'scribe' } },
    });
    expect([typed.rails, typed.stiles, typed.opening, typed.sources, typed.notes]).toEqual([
      { top: 2, bottom: 3 },
      { left: 3.5, right: 3 },
      { width: 8.5, height: 5 },
      { top: 'part', bottom: 'style', left: 'part', right: 'style' },
      { left: 'scribe' },
    ]);
    const profiled = { ...DEFAULT_DOOR_STYLE, mid: { extra: 0.625 } };
    const pantry = partSizes(profiled, SLAB_AM, {
      width: 15, height: 60, sizes: { midRails: [{ at: 30 }], midStiles: [{ at: 7.5, width: 2 }] },
    });
    expect([pantry.midRails, pantry.midStiles]).toEqual([[{ at: 30, width: 3.625 }], [{ at: 7.5, width: 2 }]]);
  });

  it('checks slab-applied fronts in the stacking check too', () => {
    const front = (path, z, height, design) => ({
      path, x: 0, z, width: 15, height, sizes: partSizes(DEFAULT_DOOR_STYLE, design, { width: 15, height }),
    });
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB_AM), front('r.0', 8.125, 7.9375, SLAB_AM)]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
    expect(frontStackWarnings([front('r.1', 0, 8, SQUARE), front('r.0', 8.125, 7.9375, SLAB_AM)]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB_AM), front('r.0', 8.125, 4.5, SLAB_AM)])).toEqual([]);
    expect(frontStackWarnings([front('r.1', 0, 8, SLAB), front('r.0', 8.125, 7.9375, SLAB_AM)])).toEqual([]);
  });
});
```

What the numbers are: the same rule as SPEC-46's rails. With the top typed at 2" on a 10" front, the bottom's room is 10 − 2 1/8 − 2 = 5 7/8, capped at the style's 3". A 7 15/16" front gets 2 7/8" insets (rounded down) and a 2 3/16" molding rectangle, bigger than an 8" front's 2 1/8".

**Count:** 1013 + 5 = **1018**. Golden snapshot unchanged.

---

## §3 Step 387 — `doorStyleEdits.js`: the style list

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/doorStyleEdits.js` | — | `nextDoorStyleLabel`, `newDoorStyle`, `doorStyleUses`, `reassignDoorStyle` |
| NEW `src/elevation/model/__tests__/doorStyleEdits.test.js` | — | 4 tests, verbatim |

**Contract.** Imports: `DOOR_STYLE_KEYS` (`./doorStyles.js`), `gridLeaves` (`./grid.js`). Pure; nothing is mutated.

- `nextDoorStyleLabel(styles = [])` → the first of `A`…`Z` that no style's `label` uses; when all 26 are used, the first of `'1'`, `'2'`, … not used.
- `newDoorStyle(styles, base, id)` → a deep copy of `base` (`structuredClone`) without `name`, with `id` and `label: nextDoorStyleLabel(styles)`.
- `doorStyleUses(room, styleId)` → every place that picks `styleId`, in this order:
  1. the room's `DOOR_STYLE_KEYS` (in that order): `{ level: 'room', key }`;
  2. for each wall in `room.walls`: its keys `{ level: 'wall', wallId, key }`; then `wall.endPanels?.start`, `.end` with `styleId === styleId`: `{ level: 'wallEndPanel', wallId, endpoint }`; then for each run in `wall.runs`:
     - its keys `{ level: 'run', wallId, runId, key }`;
     - `run.ends?.left`, `.right`: `{ level: 'runEnd', wallId, runId, side }`;
     - each leaf of `gridLeaves(run.grid)` (skip when no grid), in order: a cabinet leaf's keys `{ level: 'cabinet', wallId, runId, itemId, key }` and then each face leaf of its `face` (pre-order, paths as `faceOutline`: `'r'`, `'r.0'`, `'r.0.1'`…) with that `styleId`: `{ level: 'face', wallId, runId, itemId, path }`; a panel leaf with that `styleId`: `{ level: 'panelCell', wallId, runId, cellId }`.
  Missing `walls` / `runs` / `endPanels` / `ends` / `face` are skipped.
- `reassignDoorStyle(room, fromId, toId)` → a deep copy (`structuredClone`) of `room` where every use `doorStyleUses` finds is set to `toId`, or has its key deleted when `toId` is `null`. `room.doorStyles` is untouched. (A reducer passes `current(room)`, never an immer draft: `structuredClone` can't copy a draft.)

**Don't touch:** any other file.

**NEW `src/elevation/model/__tests__/doorStyleEdits.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, isDoorStyle } from '../doorStyles.js';
import { doorStyleUses, newDoorStyle, nextDoorStyleLabel, reassignDoorStyle } from '../doorStyleEdits.js';
import { gridFromItems, gridLeaves } from '../grid.js';

const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A' };
const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', thickness: 1 };
const { name, ...UNNAMED } = DEFAULT_DOOR_STYLE;
void name;

/** A room picking A and B at every level that can pick a style. */
function room() {
  return {
    id: 'room-1',
    doorStyles: [A, B],
    doorStyleId: 'ds-a',
    panelStyleId: 'ds-b',
    walls: [{
      id: 'w1',
      doorStyleId: 'ds-b',
      endPanels: { start: { width: null, styleId: 'ds-a' }, end: null },
      runs: [{
        id: 'r1',
        drawerFrontStyleId: 'ds-a',
        ends: {
          left: { type: 'end_panel', width: null, styleId: 'ds-a', sizes: { stiles: { left: 3.5 } } },
          right: { type: 'filler', width: null },
        },
        grid: gridFromItems('r1', [
          {
            id: 'c1',
            kind: 'cabinet',
            width: null,
            doorStyleId: 'ds-b',
            face: {
              direction: 'vertical',
              size: null,
              children: [{ type: 'drawer_front', size: 6, styleId: 'ds-a' }, { type: 'door', size: null, styleId: 'ds-b' }],
            },
          },
          { id: 'c2', kind: 'cabinet', width: null },
          { id: 'p1', kind: 'panel', width: 0.75, styleId: 'ds-a' },
        ]),
      }],
    }],
  };
}

describe('SPEC-46.1 the room\'s door style list', () => {
  it('labels a new style with the first free letter, then numbers', () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((label) => ({ label }));
    expect([[], [A, B], [B], letters, [...letters, { label: '1' }]].map((styles) => nextDoorStyleLabel(styles)))
      .toEqual(['A', 'C', 'A', '1', '2']);
  });

  it('copies a style as a new one: new id and label, no name, nothing shared', () => {
    expect(newDoorStyle([A, B], DEFAULT_DOOR_STYLE, 'ds-new')).toEqual({ ...UNNAMED, id: 'ds-new', label: 'C' });
    const named = { ...B, name: 'Kitchen' };
    const copy = newDoorStyle([A, named], named, 'ds-c');
    expect([copy.thickness, copy.label, 'name' in copy, copy.stiles === named.stiles, isDoorStyle(copy)])
      .toEqual([1, 'C', false, false, true]);
  });

  it('lists every place a style is picked, room to face', () => {
    const at = { wallId: 'w1', runId: 'r1' };
    expect(doorStyleUses(room(), 'ds-a')).toEqual([
      { level: 'room', key: 'doorStyleId' },
      { level: 'wallEndPanel', wallId: 'w1', endpoint: 'start' },
      { level: 'run', ...at, key: 'drawerFrontStyleId' },
      { level: 'runEnd', ...at, side: 'left' },
      { level: 'face', ...at, itemId: 'c1', path: 'r.0' },
      { level: 'panelCell', ...at, cellId: 'p1' },
    ]);
    expect(doorStyleUses(room(), 'ds-b')).toEqual([
      { level: 'room', key: 'panelStyleId' },
      { level: 'wall', wallId: 'w1', key: 'doorStyleId' },
      { level: 'cabinet', ...at, itemId: 'c1', key: 'doorStyleId' },
      { level: 'face', ...at, itemId: 'c1', path: 'r.1' },
    ]);
    expect([doorStyleUses(room(), 'ds-x'), doorStyleUses({ walls: [] }, 'ds-a')]).toEqual([[], []]);
  });

  it('moves every use to another style, or clears it, on a copy', () => {
    const before = room();
    const moved = reassignDoorStyle(before, 'ds-a', 'ds-b');
    expect([doorStyleUses(moved, 'ds-a'), doorStyleUses(moved, 'ds-b').length]).toEqual([[], 10]);
    expect(moved.walls[0].runs[0].ends.left).toEqual({
      type: 'end_panel', width: null, styleId: 'ds-b', sizes: { stiles: { left: 3.5 } },
    });
    expect(doorStyleUses(before, 'ds-a').length).toBe(6);

    const cleared = reassignDoorStyle(before, 'ds-a', null);
    const run = cleared.walls[0].runs[0];
    const leaf = (id) => gridLeaves(run.grid).find((node) => node.id === id);
    expect([
      'doorStyleId' in cleared,
      cleared.walls[0].endPanels.start,
      'drawerFrontStyleId' in run,
      run.ends.left,
      leaf('c1').face.children[0],
      'styleId' in leaf('p1'),
      cleared.doorStyles,
    ]).toEqual([
      false,
      { width: null },
      false,
      { type: 'end_panel', width: null, sizes: { stiles: { left: 3.5 } } },
      { type: 'drawer_front', size: 6 },
      false,
      [A, B],
    ]);
  });
});
```

**Count:** 1018 + 4 = **1022**.

---

## §4 Step 388 — part edits, picker options, size rows

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/faceTree.js` | 183 | `setFacePart` |
| `src/elevation/model/doorStyleEdits.js` | ~90 | `setPartSide`, `setPartNote`, `setPartMids`, `pickOptions`, `partSizeRows` |
| NEW `src/elevation/model/__tests__/partStyleEdits.test.js` | — | 6 tests, verbatim |

**Contract.**

- `faceTree.js` `setFacePart(face, path, patch)`: the node at `path` must be a leaf (`type` set) and not `'open'`, else return `face`. For each of `styleId`, `sizes` that is an own key of `patch`: `null`/`undefined` deletes the key, anything else sets it (the caller validates). Uses the file's `replaceAt`. Returns the same `face` when nothing changes (`styleId` by `===`, `sizes` by `JSON.stringify`).
- `doorStyleEdits.js` (new imports: `formatInches` from `./units.js`, `resolveDoorStyle` from `./doorStyleResolve.js`, `partSizes` from `./doorSizes.js`). All return a new object, or `undefined` when nothing is left; inputs are never mutated.
  - `setPartSide(sizes, side, width)`: `side` `top`/`bottom` → `rails`, `left`/`right` → `stiles`; any other side, or a `width` that isn't `null` and isn't finite > 0 → return `sizes` itself. `null` deletes that side; an emptied group is removed.
  - `setPartNote(sizes, side, note)`: `side` in `top, bottom, left, right`; `null` or `''` deletes; an emptied `notes` is removed.
  - `setPartMids(sizes, kind, mids)`: `kind` `midRails`/`midStiles`; `[]` deletes the key.
  - `pickOptions(room, settings, partType, levelsAbove)` → `{ inherit: { id, text: 'Inherit (' + row + ')' }, options: [{ id, text: row }] }`, one option per `room.doorStyles` entry in order. `inherit` is `resolveDoorStyle(room, settings, partType, levelsAbove)`'s style. `row` = `${label} · ${design.code} · ${formatInches(thickness)}`, the design from `resolveDoorStyle` for inherit and `findDoorDesign(style.designId) ?? DOOR_DESIGNS[0]` for options.
  - `partSizeRows(style, design, part)` → for the per-part block. `r = partSizes(style, design, part)`, `sizes = part.sizes ?? {}`.
    - `r.construction === 'slab'`: `{ title: 'Slab', note, rows: [], midRails: [], midStiles: [], opening: null }`; `note` = `'Slab design'` (`slab: 'design'`), else `` `Slab under ${formatInches(style.shortFace.slabBelow)}` `` plus `' — molding left off'` when `r.molding === false`.
    - otherwise `{ title, note: null, rows, midRails, midStiles, opening: r.opening }`; `title` `'Stiles & rails'` (five_piece) or `'Molding inset'` (slab_applied); `rows` in order top, bottom, left, right: `{ side, label, typed, value, source, note }` with labels `Top rail, Bottom rail, Left stile, Right stile` (five_piece) or `Top, Bottom, Left, Right` (slab_applied), `typed` the side's value in `sizes` or `null`, `value` the final size, `source` from `r.sources`, `note` from `sizes.notes` or `null`; `midRails` / `midStiles` are `r`'s entries plus `typed: sizes.midRails[i].width !== undefined`.

**Don't touch:** `faces.js`, `doorSizes.js`, `doorStyleResolve.js`, anything else.

**NEW `src/elevation/model/__tests__/partStyleEdits.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS, isPartSizes } from '../doorStyles.js';
import { partSizeRows, pickOptions, setPartMids, setPartNote, setPartSide } from '../doorStyleEdits.js';
import { setFacePart } from '../faceTree.js';

const [SQUARE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A' };
const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', thickness: 1 };
const C = { ...DEFAULT_DOOR_STYLE, id: 'ds-c', label: 'C', designId: 'slab-applied', thickness: 0.75 };

describe('SPEC-46.1 a face\'s own style and sizes', () => {
  it('sets and clears styleId and sizes on a face leaf, never on a group or an open face', () => {
    const face = {
      direction: 'vertical', size: null, children: [{ type: 'drawer_front', size: 6 }, { type: 'open', size: null }],
    };
    const withA = setFacePart(face, 'r.0', { styleId: 'ds-a' });
    expect([withA.children[0], face.children[0]])
      .toEqual([{ type: 'drawer_front', size: 6, styleId: 'ds-a' }, { type: 'drawer_front', size: 6 }]);
    const sized = setFacePart(withA, 'r.0', { sizes: { rails: { top: 2 } } });
    expect(setFacePart(sized, 'r.0', { styleId: null }).children[0])
      .toEqual({ type: 'drawer_front', size: 6, sizes: { rails: { top: 2 } } });
    expect(setFacePart(sized, 'r.0', { styleId: 'ds-b', sizes: null }).children[0])
      .toEqual({ type: 'drawer_front', size: 6, styleId: 'ds-b' });
    expect([
      setFacePart(face, 'r', { styleId: 'ds-a' }),
      setFacePart(face, 'r.1', { styleId: 'ds-a' }),
      setFacePart(face, 'r.5', { styleId: 'ds-a' }),
    ].every((next) => next === face)).toBe(true);
    expect(setFacePart(withA, 'r.0', { styleId: 'ds-a' })).toBe(withA);
    expect(setFacePart(sized, 'r.0', { sizes: { rails: { top: 2 } } })).toBe(sized);
  });
});

describe('SPEC-46.1 per-part size edits (P13)', () => {
  it('sets and clears one stile or rail, dropping empty groups', () => {
    const one = setPartSide(undefined, 'top', 2.625);
    const two = setPartSide(one, 'bottom', 2.625);
    expect([one, two]).toEqual([{ rails: { top: 2.625 } }, { rails: { top: 2.625, bottom: 2.625 } }]);
    expect(setPartSide(undefined, 'left', 3.5)).toEqual({ stiles: { left: 3.5 } });
    expect(setPartSide({ rails: { top: 2.625 }, notes: { top: 'match' } }, 'top', null)).toEqual({ notes: { top: 'match' } });
    expect(setPartSide({ rails: { top: 2.625 } }, 'top', null)).toBeUndefined();
    const sizes = { stiles: { left: 3 } };
    expect([setPartSide(sizes, 'left', 0), setPartSide(sizes, 'middle', 3)].every((next) => next === sizes)).toBe(true);
  });

  it('sets notes and mid rails/stiles the same way; every result is valid sizes or undefined', () => {
    const results = [
      setPartNote(undefined, 'left', 'scribe'),
      setPartNote({ notes: { left: 'scribe' }, stiles: { left: 3.5 } }, 'left', ''),
      setPartNote({ notes: { left: 'scribe' } }, 'left', null),
      setPartMids(undefined, 'midRails', [{ at: 31.5 }]),
      setPartMids({ midRails: [{ at: 31.5 }], midStiles: [{ at: 7.5, width: 3 }] }, 'midRails', []),
      setPartMids({ midStiles: [{ at: 7.5 }] }, 'midStiles', []),
    ];
    expect(results).toEqual([
      { notes: { left: 'scribe' } },
      { stiles: { left: 3.5 } },
      undefined,
      { midRails: [{ at: 31.5 }] },
      { midStiles: [{ at: 7.5, width: 3 }] },
      undefined,
    ]);
    expect(results.every((entry) => entry === undefined || isPartSizes(entry))).toBe(true);
  });
});

describe('SPEC-46.1 what the pickers and the Stiles & rails block show', () => {
  it('lists the room\'s styles and what a level inherits from the levels above it', () => {
    const room = { doorStyles: [A, B, C], doorStyleId: 'ds-b' };
    expect(pickOptions(room, DEFAULT_SETTINGS, 'door', [])).toEqual({
      inherit: { id: 'default', text: 'Inherit (Std · 5PC · 13/16")' },
      options: [
        { id: 'ds-a', text: 'A · 5PC · 13/16"' },
        { id: 'ds-b', text: 'B · 5PC · 1"' },
        { id: 'ds-c', text: 'C · Slab AM · 3/4"' },
      ],
    });
    expect(pickOptions(room, DEFAULT_SETTINGS, 'drawer_front', [{ level: 'room', node: room }]).inherit)
      .toEqual({ id: 'ds-b', text: 'Inherit (B · 5PC · 1")' });
    const panels = { ...room, panelStyleId: 'ds-c' };
    expect(pickOptions(panels, DEFAULT_SETTINGS, 'panel', [{ level: 'room', node: panels }]).inherit.id).toBe('ds-c');
    expect(pickOptions({}, { ...DEFAULT_SETTINGS, doorThickness: 1 }, 'door', [])).toEqual({
      inherit: { id: 'default', text: 'Inherit (Std · 5PC · 1")' }, options: [],
    });
  });

  it('gives each side\'s typed value, final value, where it came from and its note', () => {
    expect(partSizeRows(DEFAULT_DOOR_STYLE, SQUARE, {
      width: 15, height: 7, sizes: { stiles: { left: 3.5 }, notes: { left: 'scribe' }, midStiles: [{ at: 7.5 }] },
    })).toEqual({
      title: 'Stiles & rails',
      note: null,
      rows: [
        { side: 'top', label: 'Top rail', typed: null, value: 2.4375, source: 'rule', note: null },
        { side: 'bottom', label: 'Bottom rail', typed: null, value: 2.4375, source: 'rule', note: null },
        { side: 'left', label: 'Left stile', typed: 3.5, value: 3.5, source: 'part', note: 'scribe' },
        { side: 'right', label: 'Right stile', typed: null, value: 3, source: 'style', note: null },
      ],
      midRails: [],
      midStiles: [{ at: 7.5, width: 3, typed: false }],
      opening: { width: 8.5, height: 2.125 },
    });
  });

  it('relabels for a molding inset and says why a part is a slab', () => {
    const molding = partSizeRows(DEFAULT_DOOR_STYLE, SLAB_AM, {
      width: 15, height: 30, sizes: { midRails: [{ at: 15, width: 4 }] },
    });
    expect([molding.title, molding.rows.map(({ label }) => label), molding.midRails, molding.opening]).toEqual([
      'Molding inset', ['Top', 'Bottom', 'Left', 'Right'], [{ at: 15, width: 4, typed: true }], { width: 9, height: 24 },
    ]);
    const slab = { title: 'Slab', rows: [], midRails: [], midStiles: [], opening: null };
    expect([
      partSizeRows(DEFAULT_DOOR_STYLE, SLAB, { width: 15, height: 30 }),
      partSizeRows(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 4.75 }),
      partSizeRows(DEFAULT_DOOR_STYLE, SLAB_AM, { width: 15, height: 4.75 }),
    ]).toEqual([
      { ...slab, note: 'Slab design' },
      { ...slab, note: 'Slab under 4 13/16"' },
      { ...slab, note: 'Slab under 4 13/16" — molding left off' },
    ]);
  });
});
```

What the numbers are: a 7" front's rails are 2 7/16" by the rule (SPEC-46); with a 3 1/2" left stile the opening is 15 − 3 1/2 − 3 = 8 1/2 wide. `formatInches(0.8125)` is `13/16"`, `formatInches(4.8125)` `4 13/16"`.

**Count:** 1022 + 6 = **1028**.

---

## §5 Step 389 — store: the room's door style list

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/store/slices/doorStyles.js` | — | `doorStyleReducers`: `addDoorStyle`, `updateDoorStyle`, `deleteDoorStyle` |
| `src/elevation/store/elevationSlice.js` | 175 | spread `...doorStyleReducers` after `styleReducers`; export the three actions |
| NEW `src/elevation/store/__tests__/sliceDoorStyles.test.js` | — | 4 tests, verbatim |

**Contract.** Follow `store/slices/rooms.js` (`addRoom` has the `prepare` pattern) and `styles.js`. Helpers from `./helpers.js`: `roomFor`, `roomIndexFor`, `syncRoomAt`. `current` from `@reduxjs/toolkit`. Model: `isDoorStyle`, `teamDoorStyle` (`doorStyles.js`), `newDoorStyle`, `doorStyleUses`, `reassignDoorStyle` (`doorStyleEdits.js`). `roomId` is optional everywhere (active room).

- `addDoorStyle`: `prepare(payload = {})` → `{ payload: { ...payload, id: payload.id ?? uuid() } }`. Reducer: `styles = room.doorStyles ?? []`; `base` = the style with `payload.baseId` (return if not found) or, with no `baseId`, `teamDoorStyle(state.settings)`; `room.doorStyles = [...styles, newDoorStyle(styles, base, id)]`. No sync (nothing picks it yet).
- `updateDoorStyle({ roomId, styleId, style })`: `next = { ...style, id: styleId }`; return unless the style exists, `isDoorStyle(next)`, and no *other* style has `next.label`. Replace it in place in the list, then `syncRoomAt` (thickness moves fronts).
- `deleteDoorStyle({ roomId, styleId, reassignTo })`: return if the style isn't in the list. `uses = doorStyleUses(current(room), styleId)`. With uses: `reassignTo` must be `null` or another listed style's id (not `styleId`), else return; then `state.rooms[index] = reassignDoorStyle(current(room), styleId, reassignTo)`. Remove the style from the (new) room's list; delete `doorStyles` when empty. `syncRoomAt`.

**Don't touch:** the other slice files, `persistence.js`, model files.

**NEW `src/elevation/store/__tests__/sliceDoorStyles.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import elevationReducer, { addDoorStyle, deleteDoorStyle, updateDoorStyle } from '../elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

const { name, ...UNNAMED } = DEFAULT_DOOR_STYLE;
void name;
const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const room = (state) => state.rooms[0];

/** A base run with one cabinet; `doorStyleId` is the room's pick (it may name a style added later). */
function base(doorStyleId) {
  const state = stateWithRun(run({ autoCount: false, items: [auto('c1')] }));
  if (doorStyleId) state.rooms[0].doorStyleId = doorStyleId;
  return state;
}

describe('SPEC-46.1 adding, editing and deleting a room\'s door styles', () => {
  it('adds a copy of the team default, or of another style, with the next free label', () => {
    const state = apply(base(), addDoorStyle({ id: 'ds-1' }), addDoorStyle({ id: 'ds-2', baseId: 'ds-1' }));
    expect(room(state).doorStyles).toEqual([
      { ...UNNAMED, id: 'ds-1', label: 'A' },
      { ...UNNAMED, id: 'ds-2', label: 'B' },
    ]);
    expect(apply(state, addDoorStyle({ id: 'ds-3', baseId: 'gone' }))).toBe(state);
    const thick = base();
    thick.settings.doorThickness = 1;
    expect(room(apply(thick, addDoorStyle({ id: 'ds-1' }))).doorStyles[0].thickness).toBe(1);
  });

  it('saves an edited style under its own id and re-syncs the room (P11)', () => {
    const state = apply(base('ds-1'), addDoorStyle({ id: 'ds-1' }), addDoorStyle({ id: 'ds-2' }));
    expect('_doorThickness' in currentRun(state)).toBe(false);
    const edited = { ...room(state).doorStyles[0], id: 'other', thickness: 1, name: 'Thick' };
    const next = apply(state, updateDoorStyle({ styleId: 'ds-1', style: edited }));
    expect(room(next).doorStyles[0]).toEqual({ ...UNNAMED, id: 'ds-1', label: 'A', thickness: 1, name: 'Thick' });
    expect(currentRun(next)._doorThickness).toBe(1);
  });

  it('refuses a repeated label, a broken style or an unknown id', () => {
    const state = apply(base(), addDoorStyle({ id: 'ds-1' }), addDoorStyle({ id: 'ds-2' }));
    const [a] = room(state).doorStyles;
    expect([
      updateDoorStyle({ styleId: 'ds-1', style: { ...a, label: 'B' } }),
      updateDoorStyle({ styleId: 'ds-1', style: { ...a, thickness: 0 } }),
      updateDoorStyle({ styleId: 'ds-1', style: { ...a, color: 'red' } }),
      updateDoorStyle({ styleId: 'gone', style: a }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true, true]);
  });

  it('deletes an unused style, and a used one only when told where its uses go', () => {
    const state = apply(
      base('ds-1'),
      addDoorStyle({ id: 'ds-1' }),
      addDoorStyle({ id: 'ds-2' }),
      updateDoorStyle({ styleId: 'ds-1', style: { ...UNNAMED, id: 'ds-1', label: 'A', thickness: 1 } }),
    );
    expect(currentRun(state)._doorThickness).toBe(1);
    expect([
      deleteDoorStyle({ styleId: 'ds-1' }),
      deleteDoorStyle({ styleId: 'ds-1', reassignTo: 'ds-1' }),
      deleteDoorStyle({ styleId: 'ds-1', reassignTo: 'gone' }),
      deleteDoorStyle({ styleId: 'gone', reassignTo: null }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true, true]);

    const unused = apply(state, deleteDoorStyle({ styleId: 'ds-2' }));
    expect(room(unused).doorStyles.map(({ id }) => id)).toEqual(['ds-1']);
    const moved = apply(state, deleteDoorStyle({ styleId: 'ds-1', reassignTo: 'ds-2' }));
    expect([room(moved).doorStyleId, room(moved).doorStyles.map(({ id }) => id), '_doorThickness' in currentRun(moved)])
      .toEqual(['ds-2', ['ds-2'], false]);
    const cleared = apply(unused, deleteDoorStyle({ styleId: 'ds-1', reassignTo: null }));
    expect(['doorStyleId' in room(cleared), 'doorStyles' in room(cleared), '_doorThickness' in currentRun(cleared)])
      .toEqual([false, false, false]);
  });
});
```

**Count:** 1028 + 4 = **1032**.

---

## §6 Step 390 — store: picks, part styles, and keeping them

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/store/slices/doorStyles.js` | ~60 | `setDoorStylePick`, `setPartStyle` |
| `src/elevation/store/elevationSlice.js` | ~180 | export the two actions |
| `src/elevation/store/slices/styles.js` | 96 | `setItemFace` ends with `syncRoomAt(state, location.roomIndex)` |
| `src/elevation/store/slices/walls.js` | 316 | `setWallEndPanel` (line 182) keeps the stored `styleId` / `sizes` |
| `src/elevation/model/cellTree.js` | ~500 | `setGridPanelType` (line 372) keeps `styleId` / `sizes` |
| NEW `src/elevation/store/__tests__/sliceDoorStylePicks.test.js` | — | 5 tests, verbatim |

**Contract.** Helpers: `roomFor`, `roomIndexFor`, `wallLocation`, `runLocation`, `syncRoomAt` (`./helpers.js`); `gridLeaves` (`../../model/grid.js`), `findLeaf` (`../../model/cellTree.js`); `DOOR_STYLE_KEYS`, `isPartSizes` (`doorStyles.js`). A style id is valid when it's in `room.doorStyles`.

- `setDoorStylePick({ roomId, level, wallId, runId, itemIds = [], key, styleId })`: `key` must be in `DOOR_STYLE_KEYS`; `styleId` `null` (delete the key) or a valid id; otherwise return. Targets: `'room'` → the room; `'wall'` → `wallLocation(...).wall`; `'run'` → `runLocation(...).run`; `'cabinet'` → each `kind === 'cabinet'` leaf of `gridLeaves(run.grid)` whose id is in `itemIds`; any other level, or a missing target → return. Then `syncRoomAt`.
- `setPartStyle({ roomId, wallId, part, runId, side, endpoint, cellId, styleId?, sizes? })`. Target: `'runEnd'` → `run.ends[side]` (`left`/`right`); `'wallEndPanel'` → `wall.endPanels?.[endpoint]` (`start`/`end`, must be non-null); `'panelCell'` → `findLeaf(run.grid, cellId)` with `kind === 'panel'` (the draft node; mutate it). Any other `part` or no target → return. Validate first, then apply both: when `styleId` is an own key of the payload it must be `null` (delete) or a valid id; when `sizes` is an own key it must be `null` (delete) or pass `isPartSizes` (store `structuredClone`). Either invalid → return without changes. Then `syncRoomAt`.
- `setItemFace` (styles.js): add `syncRoomAt(state, location.roomIndex)` at the end (import it from `./helpers.js`; check it's already imported).
- `setWallEndPanel` (walls.js 182–198): when `panel` isn't null, the new entry also carries the stored entry's `styleId` and `sizes` when they're set (the UI only sends width/frame).
- `setGridPanelType` (cellTree.js 372–389): `next` also copies the leaf's `styleId` and `sizes` when present, and the `sameLeaf` check compares them too.

**Don't touch:** `roomSync.js` (a joined run's auto end is rebuilt without its style; noted for later), `setRunEnd` (it already keeps extra keys except on `none`), `setGridCellKind` (a panel turned into a cabinet drops its style, as it should), `persistence.js`.

**NEW `src/elevation/store/__tests__/sliceDoorStylePicks.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import { gridLeaves } from '../../model/grid.js';
import elevationReducer, {
  addDoorStyle,
  setDoorStylePick,
  setItemFace,
  setPanelType,
  setPartStyle,
  setWallEndPanel,
  updateDoorStyle,
} from '../elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const THICK = { ...DEFAULT_DOOR_STYLE, id: 'ds-1', label: 'A', thickness: 1 };
const at = { wallId: 'wall-1', runId: 'run-1' };
const leaf = (state, id) => gridLeaves(currentRun(state).grid).find((node) => node.id === id);

/** A base run 12" in (end panel left, cabinet c1, panel cell p1) and style A at 1" thick (ds-1). */
function base() {
  const state = stateWithRun(run({
    x: 12,
    autoCount: false,
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: null } },
    items: [auto('c1'), { id: 'p1', kind: 'panel', width: 0.75 }],
  }));
  return apply(state, addDoorStyle({ id: 'ds-1' }), updateDoorStyle({ styleId: 'ds-1', style: THICK }));
}

describe('SPEC-46.1 door style picks in the store', () => {
  it('sets and clears a pick at the room, a wall, a run and cabinets', () => {
    const state = apply(
      base(),
      setDoorStylePick({ level: 'room', key: 'doorStyleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'wall', wallId: 'wall-1', key: 'panelStyleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'run', ...at, key: 'drawerFrontStyleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'cabinet', ...at, itemIds: ['c1'], key: 'doorStyleId', styleId: 'ds-1' }),
    );
    expect([
      state.rooms[0].doorStyleId,
      state.rooms[0].walls[0].panelStyleId,
      currentRun(state).drawerFrontStyleId,
      leaf(state, 'c1').doorStyleId,
      currentRun(state)._doorThickness,
    ]).toEqual(['ds-1', 'ds-1', 'ds-1', 'ds-1', 1]);
    const cleared = apply(
      state,
      setDoorStylePick({ level: 'room', key: 'doorStyleId', styleId: null }),
      setDoorStylePick({ level: 'cabinet', ...at, itemIds: ['c1'], key: 'doorStyleId', styleId: null }),
    );
    expect(['doorStyleId' in cleared.rooms[0], 'doorStyleId' in leaf(cleared, 'c1'), '_doorThickness' in currentRun(cleared)])
      .toEqual([false, false, false]);
  });

  it('ignores a style the room doesn\'t have, a bad key, level or target', () => {
    const state = base();
    expect([
      setDoorStylePick({ level: 'room', key: 'doorStyleId', styleId: 'gone' }),
      setDoorStylePick({ level: 'room', key: 'styleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'face', ...at, key: 'doorStyleId', styleId: 'ds-1' }),
      setDoorStylePick({ level: 'run', wallId: 'wall-1', runId: 'gone', key: 'doorStyleId', styleId: 'ds-1' }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true, true]);
  });

  it('sets a run end panel\'s and a wall end panel\'s style and sizes, and keeps them on other edits', () => {
    const sizes = { stiles: { left: 3.5 }, notes: { left: 'scribe' } };
    const state = apply(
      base(),
      setPartStyle({ ...at, part: 'runEnd', side: 'left', styleId: 'ds-1', sizes }),
      setWallEndPanel({ wallId: 'wall-1', endpoint: 'start', panel: { width: null } }),
      setPartStyle({ wallId: 'wall-1', part: 'wallEndPanel', endpoint: 'start', styleId: 'ds-1' }),
      setWallEndPanel({ wallId: 'wall-1', endpoint: 'start', panel: { width: 1 } }),
    );
    expect(currentRun(state).ends.left).toEqual({ type: 'end_panel', width: null, styleId: 'ds-1', sizes });
    expect(state.rooms[0].walls[0].endPanels.start).toEqual({ width: 1, styleId: 'ds-1' });
    const cleared = apply(state, setPartStyle({ ...at, part: 'runEnd', side: 'left', sizes: null }));
    expect(currentRun(cleared).ends.left).toEqual({ type: 'end_panel', width: null, styleId: 'ds-1' });
  });

  it('sets a panel cell\'s style and sizes, kept when its panel type changes; refuses bad parts', () => {
    const state = apply(
      base(),
      setPartStyle({ ...at, part: 'panelCell', cellId: 'p1', styleId: 'ds-1', sizes: { rails: { bottom: 3.5 } } }),
      setPanelType({ ...at, cellId: 'p1', type: 'back' }),
    );
    const p1 = leaf(state, 'p1');
    expect([p1.styleId, p1.sizes, p1.align]).toEqual(['ds-1', { rails: { bottom: 3.5 } }, 'back']);
    expect([
      setPartStyle({ ...at, part: 'panelCell', cellId: 'c1', styleId: 'ds-1' }),
      setPartStyle({ ...at, part: 'panelCell', cellId: 'p1', styleId: 'gone' }),
      setPartStyle({ ...at, part: 'panelCell', cellId: 'p1', styleId: null, sizes: { rails: {} } }),
      setPartStyle({ wallId: 'wall-1', part: 'wallEndPanel', endpoint: 'end', styleId: 'ds-1' }),
      setPartStyle({ ...at, part: 'thing', styleId: 'ds-1' }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true, true, true]);
  });

  it('re-syncs the room when a face picks a style (P11)', () => {
    const state = apply(base(), setItemFace({ ...at, itemIds: ['c1'], face: { type: 'door', size: null, styleId: 'ds-1' } }));
    expect(currentRun(state)._doorThickness).toBe(1);
  });
});
```

⚠ If an existing slice test breaks because `setItemFace` now syncs, report it rather than change that test.

**Count:** 1032 + 5 = **1037**. Golden snapshot unchanged.

---

## §7 Step 391 — UI: the room's Door styles section and room pickers

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/components/properties/DoorStylePicks.jsx` | — | the three pickers for one level |
| NEW `src/elevation/components/RoomDoorStylesPanel.jsx` | — | list, new, delete, room pickers |
| `src/elevation/ElevationLab.jsx` | 83 | mount `<RoomDoorStylesPanel />` after `<RoomStylePanel />` |

**`DoorStylePicks`** — props `{ room, settings, levelsAbove, node, label, onChange, always = false }`.
- Renders nothing when `room.doorStyles` is empty, unless `always`.
- Three `<select>`s like `StyleFields.jsx` (same `SELECT_CLASS`, label above each): **Doors** (`'door'`, `doorStyleId`), **Drawer fronts** (`'drawer_front'`, `drawerFrontStyleId`), **Panels** (`'panel'`, `panelStyleId`). Options from `pickOptions(room, settings, partType, levelsAbove)`: first `value=""` with `inherit.text`, then each option. Value `node?.[key] ?? ''`; a stored id not in the list shows as an extra option `Missing (${id})`. `aria-label` `${label} doors style` / `drawer fronts style` / `panels style`.
- `onChange(key, event.target.value || null)`.

**`RoomDoorStylesPanel`** — follows `RoomStylePanel.jsx` (same `section` + `h3` classes, heading **Door styles**). Reads `rooms`, `activeRoomId`, `settings` from the store; renders nothing without a room.
- One row per style: `label` (bold), `design code · thickness` (`findDoorDesign(...)?.code ?? designId`, `formatInches`), `name` if any, and `n uses` / `unused` from `doorStyleUses(room, id).length`. A **Delete** button.
- Delete: no uses → `deleteDoorStyle({ roomId, styleId })`. With uses → the row opens a small confirm under it: "Used n times. Move them to:" + a select (`Inherit` = `''`, then the other styles) + **Delete** (`deleteDoorStyle({ roomId, styleId, reassignTo: value || null })`) + **Cancel**. Local state only.
- **New style**: a select "Copy of" (`''` = `Team default (Std)`, then the room's styles) and a **New** button → `addDoorStyle({ roomId, baseId: value || undefined })`.
- Under the list, the room's pickers: `<DoorStylePicks always room settings levelsAbove={[]} node={room} label="Room" onChange={(key, styleId) => dispatch(setDoorStylePick({ roomId, level: 'room', key, styleId }))} />`.
- No styles: one grey line, "No door styles yet — everything uses " + `pickOptions(room, settings, 'door', []).inherit.text` without the `Inherit ` wrapper (i.e. the team row).

**Don't touch:** `RoomStylePanel.jsx`, `PropertiesPanel.jsx`, model or store files. No Edit button yet (step 392).

Gate: `npm test && npm run lint && npm run build`; 1037 tests.

---

## §8 Step 392 — UI: the door style tool

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/components/DoorStyleEditor.jsx` | — | modal editor for one style |
| `src/elevation/components/RoomDoorStylesPanel.jsx` | ~150 | **Edit** per row; New opens the editor on the new style |

**`DoorStyleEditor`** — props `{ room, styleId, onClose }`; reads `settings` only if needed. A local `draft` (`structuredClone` of the stored style when it opens).
- Overlay: `fixed inset-0 z-50 flex items-center justify-center bg-black/60`; panel `w-[36rem] max-h-[90vh] overflow-y-auto rounded border border-gray-700 bg-gray-800 p-5`. Title `Door style ${draft.label}`. Escape and **Cancel** close without saving.
- Fields (inputs styled like `StyleFields.jsx`; sizes with `InchInput`, `displayStep` 1/16, rejecting non-positive values by returning `false`):
  - **Label** (text, required), **Name** (text; blank removes `name`).
  - **Design**: select of `DOOR_DESIGNS`, `${code} — ${description}`.
  - **Thickness**.
  - Widths block, titled by the design's construction: `five_piece` **Stiles & rails** (Left stile, Right stile, Top rail, Bottom rail); `slab_applied` **Molding inset** (Left, Right, Top, Bottom); `slab` shows the Stiles & rails labels **disabled**, with the note "Not used by a slab — kept if you switch back".
  - **Mid rail/stile extra** (`mid.extra`, ≥ 0 allowed): enabled for `five_piece` and `slab_applied`.
  - **Panel**: type select (`PANEL_TYPES`: Flat, Raised) and thickness: enabled for `five_piece` only.
  - **Arch rise**: disabled unless the design's top or bottom rail shape isn't `'flat'` (none yet), note "For arched designs (46.3)".
  - **Short faces**: Min panel, Min rail/inset, Slab below, Round to (`shortFace.step`; `slabBelow` may be 0): disabled on `slab`.
  - **Profiles**: read-only line "All square — the profile library comes later."
- **Save**: enabled when `isDoorStyle(draft)` and no other style in `room.doorStyles` has `draft.label`; otherwise disabled with a short red reason ("Label already used" / "Every size must be more than 0"). Dispatches `updateDoorStyle({ roomId: room.id, styleId, style: draft })` and closes.

**`RoomDoorStylesPanel`**: local `editingId`; an **Edit** button per row sets it; **New** does `const action = addDoorStyle({ roomId, baseId }); dispatch(action); setEditingId(action.payload.id);`. Render `<DoorStyleEditor room={room} styleId={editingId} onClose={() => setEditingId(null)} />` when the id is in the list.

**Don't touch:** store, model, other components.

Gate: `npm test && npm run lint && npm run build`; 1037 tests.

---

## §9 Step 393 — UI: pickers on a wall, a run and a cabinet

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/properties/WallHeightProperties.jsx` | 357 | a **Door styles** section at the end |
| `src/elevation/components/properties/RunProperties.jsx` | 109 | a **Door styles** section after `<RunFaceOptions>` |
| `src/elevation/components/properties/CabinetStyleProperties.jsx` | 73 | pickers after `<StyleFields>` |

Each uses `DoorStylePicks` (hidden when the room has no styles) and dispatches `setDoorStylePick`:

| Where | `node` | `levelsAbove` | `label` | action payload |
|---|---|---|---|---|
| Wall | `room.walls.find((w) => w.id === wall.id)` | `[{ level: 'room', node: room }]` | `Wall` | `{ level: 'wall', wallId: wall.id, key, styleId }` |
| Run | `run` | `[{ level: 'wall', node: wall }, { level: 'room', node: room }]` | `Run` | `{ level: 'run', ...actionBase, key, styleId }` |
| Cabinet | `item` | `[run, wall, room]` as `{ level, node }` | `Cabinet` | `{ level: 'cabinet', wallId: wall.id, runId: run.id, itemIds: [item.id], key, styleId }` |

`WallHeightProperties` has no `settings` prop: read it with `useSelector((state) => state.elevation.settings)`. Section headings follow each file's existing `h3` classes. Put the wall and run sections in their own `<section>` so nothing renders when the room has no styles (wrap: only render the section when `room.doorStyles?.length`).

**Don't touch:** anything else.

Gate: `npm test && npm run lint && npm run build`; 1037 tests.

---

## §10 Step 394 — UI: a face's style and Stiles & rails

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/components/properties/PartStyleFields.jsx` | — | style picker + Stiles & rails / Molding inset block for one part |
| `src/elevation/components/properties/FaceProperties.jsx` | 354 | use it for the selected face |

**`PartStyleFields`** — props `{ room, settings, partType, levels, part, width, height, label, onChange }`. `levels` starts with the part's own level (`face` / `part`); `part` is the stored node (`styleId`, `sizes`); `onChange(patch)` with `patch` `{ styleId }` and/or `{ sizes }` (`null` clears).
- `partType` null → render nothing.
- Picker (only when `room.doorStyles?.length`): `pickOptions(room, settings, partType, levels.slice(1))`; `value = part?.styleId ?? ''`; change → `onChange({ styleId: value || null })`. `aria-label` `${label} style`.
- `{ style, design, warnings } = resolveDoorStyle(room, settings, partType, levels)`; `rows = partSizeRows(style, design, { width, height, sizes: part?.sizes })`.
- Heading: `rows.title` + ` · ${style.label}`. `rows.note` (slab) → shown as a grey line and nothing else below.
- One line per `rows.rows` entry: label; `InchInput` (`value = typed`, `allowBlank`, `displayStep` 1/16, placeholder `formatInchesInput(value)`, `aria-label` `${label} ${row.label}`); commit `null` or > 0 → `onChange({ sizes: setPartSide(part?.sizes, side, v) ?? null })`, else return `false`. After the input, a small grey tag: `short face` when `source === 'rule'`. A small text input for the note (placeholder `note`, `key` by the stored note so it resets), on blur `onChange({ sizes: setPartNote(part?.sizes, side, text.trim()) ?? null })` when it changed.
- Mid rails (always) and mid stiles (only when `width > 0`): one line per entry with **at** (`InchInput`, > 0, required) and **width** (`InchInput`, blank = style, placeholder the final width) and a remove button; then **Add mid rail** (`at = Math.round(height / 2 * 16) / 16`) / **Add mid stile** (`at` from `width`). Edits rebuild the stored list (`part?.sizes?.midRails ?? []`, never `rows.midRails`) and call `onChange({ sizes: setPartMids(part?.sizes, kind, list) ?? null })`.
- Last line: `Panel W × H` (five_piece) or `Molding W × H` (slab_applied) from `rows.opening` with `formatInches`.
- `warnings` with `door-style-missing`: an amber line "Style … is missing — using …".

**`FaceProperties`**: inside the `selected && (...)` box, first thing, when `selected.type && selected.type !== 'open'` and `resolvedFace` exists:
```
<PartStyleFields room settings partType={facePartType(selected.type)}
  levels={cabinetFaceLevels(room, wall, run, item, selected)} part={selected}
  width={resolvedFace.width} height={resolvedFace.height} label={`Face ${facePath}`}
  onChange={(patch) => commitIfChanged(setFacePart(face, facePath, patch))} />
```
(a pair door's `resolvedFace` is its left leaf, so width is one leaf). Imports: `facePartType`, `cabinetFaceLevels` from `../../model/doorStyleResolve.js`, `setFacePart` from `../../model/faceTree.js`.

**Don't touch:** the rest of `FaceProperties`, store, model.

Gate: `npm test && npm run lint && npm run build`; 1037 tests.

---

## §11 Step 395 — UI: panel styles; flush-panel depth placeholder

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/properties/RunEndsSection.jsx` | 382 | pass `room` and `wall` to `<EndFields>` (line ~107) |
| `src/elevation/components/properties/EndFields.jsx` | 172 | `PartStyleFields` for an end panel or blind end |
| `src/elevation/components/properties/WallEndPanelProperties.jsx` | 53 | `PartStyleFields` under the fields |
| `src/elevation/components/properties/CellKindSection.jsx` | 123 | `PartStyleFields` for a panel cell |
| `src/elevation/components/properties/CellProperties.jsx` | 279 | depth placeholder (line 184) uses the run's face thickness |

All three panels use `partType="panel"` and `panelLevels(room, wall, run, part)` (`doorStyleResolve.js`), and dispatch `setPartStyle({ ...where, ...patch })`:

| Where | `part` | `run` in levels | `width` × `height` | `where` |
|---|---|---|---|---|
| Run end, type `end_panel` or `blind` | `run.ends[side]` | `run` | `frontDepth(run, settings)` × `run.height` | `{ ...actionBase, part: 'runEnd', side }` |
| Wall end panel | `stored` | `null` | `side.depth` × `panel.top` | `{ wallId: wall.id, part: 'wallEndPanel', endpoint: panel.endpoint }` |
| Panel cell | `item` | `run` | side: `piece.depth` × `piece.height`; top: `piece.width` × `piece.depth`; back: `piece.width` × `piece.height` (`panelOrientation(piece)`) | `{ wallId: wall.id, runId: run.id, part: 'panelCell', cellId: item.id }` |

`frontDepth` is in `model/index.js`. `CellKindSection` has no `room` / `settings` props: read them with `useSelector` (as `FaceProperties` does for the room). Label: `Left end panel` / `Right end panel`, `Wall end panel`, `Panel`.

**`CellProperties`** line 184: `cellDepth(piece, item, run.depth, settings, runFaceThickness(run, settings))`, with `runFaceThickness` imported from `../../model/corners.js`.

**Don't touch:** `setRunEnd` / end-type logic, `ExtendFields`, store, model.

Gate: `npm test && npm run lint && npm run build`; 1037 tests.

---

## End-to-end check (Kyle)

- Rooms with no door styles draw exactly as before (elevation, plan, DXF).
- Room sidebar → **Door styles**: New → the tool opens on style A (copy of the team default); change thickness to 1" and save. Pick **Doors: A** for the room: the Euro runs' doors, fillers and end panels come out 3/16" (elevation side view / plan).
- New style B, design **Slab AM**: its width fields read **Molding inset**. Delete A while it's used → it asks where its uses go.
- Wall / run / cabinet: the three pickers show *Inherit (…)* from the level above.
- Select a drawer front 7" tall: **Stiles & rails** shows 2 7/16" rails greyed with "short face"; type 2 5/8" top → the bottom follows. Add a mid rail to a tall door.
- End panel, wall end panel and panel cell show a style picker and the same block.

**Known for now:**
- Nothing new draws on the canvas yet: stiles/rails, molding rectangles and the stacking warning come in 46.2.
- A joined run's auto end (rebuilt on sync) loses a style picked on it.
- No warning yet when a 5-piece panel's style thickness doesn't match the panel's own thickness.
- Two designs plus Slab AM, all local, until the library screen (46.3).
