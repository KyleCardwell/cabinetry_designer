# Round 46 — SPEC: door styles in the model (no UI)

Steps 379–385, designer only, on branch `elevation-doors` (off `feature/elevation-mvp` after 378; merges back when the door work is done). Geometry and the API don't change.
Doors & profiles rounds (DOORS-PROFILES-PLAN §10): **46 model** → 46.1 door styles UI → 46.2 canvas door details → 46.3 library screens → 46.4 door details in the DXF → 47+ profiles.

**Done when:**
- A room can hold door styles (`room.doorStyles`), and the room, walls, runs, cabinets, faces and panel parts can pick them (`doorStyleId`, `drawerFrontStyleId`, `panelStyleId`, `styleId`), saved and validated in localStorage.
- One resolver answers "which style does this face / panel use, and from where", with drawer fronts and panels falling back to the door chain (P12, P15) and the team default when nothing is set.
- Each 5-piece part's final stile/rail sizes come out of one function: per-part override, else the short-face rule for rails (Kyle's numbers), else the style. A stacking check warns when a shorter front above has a bigger panel.
- A face's thickness comes from its style: faces draw at their own thickness (backs line up, fronts move), and a Euro run's front plane follows its thickest face (P11). With no styles anywhere, every number in the app is what it is today.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **379** | designer | `doorStyles.js`: designs, team default style, shape checks | 968 → **975** |
| **380** | designer | Persistence: styles and picks saved and validated | **980** |
| **381** | designer | `doorStyleResolve.js`: which style a part uses, and from where | **988** |
| **382** | designer | `doorSizes.js`: final stile/rail sizes, short-face rule | **995** |
| **383** | designer | Stacking check | **999** |
| **384** | designer | Run front plane = thickest face (`_doorThickness`) | **1008** |
| **385** | designer | Each face at its own thickness (elevation and plan parts) | **1013** |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. The test values were worked out from the rules here and from what the existing code returns for the golden rooms today (run read-only). If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say what you got. Values marked ⚠ are the ones to report rather than change.

---

## §1 Decisions

From DOORS-PROFILES-PLAN (P2, P2a, P5, P6, P9, P11, P12, P13, P15). New or narrowed here (Claude's defaults, say if you want any changed):

- **Names.** The model already uses `style` / `resolveStyle` / `styles.js` for the **cabinet** style (Euro / inset / beaded). Door styles never use those names: everything here is `doorStyle…`, `DOOR_…`, or a new file. Nothing in `styles.js` changes.
- **Interim team default.** No team settings screen until 46.3, so the team default style is a constant (`DEFAULT_DOOR_STYLE`) whose **thickness comes from `settings.doorThickness`** (`teamDoorStyle(settings)`). The Settings panel's "Door thickness" keeps working and keeps meaning "the team default style's thickness". 46.3 moves it into the style and retires the setting. `DEFAULT_SETTINGS` doesn't change.
- **Designs are local seeds for now.** `DOOR_DESIGNS` has two: `five-piece-square` (code `5PC`) and `slab` (code `Slab`). The per-team catalog, `doorDesignStore` and Stillwater's 110/114/115 come with the library screen (46.3). A style whose `designId` isn't in the list falls back to `five-piece-square` with a warning.
- **Mid rails/stiles.** The style gets `mid: { extra: 0 }`: a mid rail is the style's top rail + `extra`, a mid stile the left stile + `extra` (DOOR-003; `extra` becomes the inside profile's width in round 50). A part's `sizes.midRails` / `midStiles` give positions on centre (from the bottom / left edge) and optional widths.
- **Rails never grow.** The plan's `max(minRail, min(R, room))` would make a style with rails under 1 5/8" *wider* on a short face. Here it's `min(R, max(minRail, room))`: the same for every normal style, and a narrow-rail style stays as drawn.
- **Stacking check catches the formula too.** Rounding down to 1/16 means a 7 15/16" front gets a 2 3/16" panel and an 8" front 2 1/8", so a 7 15/16" over an 8" breaks the rule on its own (the plan said it couldn't). The check warns; nothing is auto-fixed. It's a pure function in 46; the canvas shows it in 46.2.
- **Lenient loading.** Losing the whole localStorage document to a bad field is worse than a stale pick, so a pick that names a style the room doesn't list still loads; the resolver skips it with a `door-style-missing` warning. Shapes (types, sizes, duplicate ids/labels) are validated.
- **Where picks live.** `doorStyleId` / `drawerFrontStyleId` / `panelStyleId` on the room, a wall, a run and a cabinet leaf. `styleId` + `sizes` on a face leaf, a run end (`run.ends.left/right`, used when it's an end panel or blind panel), a wall end panel (`wall.endPanels.start/end`) and a panel cell. A face leaf's `styleId` is the drawer-front style for a drawer front and the door style otherwise.
- **Which chain.** `drawer_front` faces: drawer-front chain, then door chain. `door`, `pair_door`, `false_front` and face `panel`: door chain. `open`: no style. Panel parts (end panels, wall end panels, panel cells): panel chain, then door chain.
- **Thickness.** Faces hang off box + bumper (Euro) or sit flush with the frame face (inset), so a thicker door moves its front (Euro) or its back (inset). A Euro run's front plane (`frontDepth`: fillers, end panels, flush panels, toe kick, tops, corners, clearances) is its thickest face; it's stored as a derived `run._doorThickness` (like `_frame`, never saved), only when it differs from the team default. A face frame run's front stays the frame's, so it gets no `_doorThickness`.
- **Not in 46:** UI (46.1), canvas loops (46.2), library and designs catalog (46.3), DXF (46.4), arches, profiles, allowances. `CellProperties.jsx`'s depth placeholder still uses the global thickness (46.1).

---

## §2 Step 379 — `doorStyles.js`

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/doorStyles.js` | — | constants, `teamDoorStyle`, `findDoorDesign`, shape checks |
| NEW `src/elevation/model/__tests__/doorStyles.test.js` | — | 7 tests, verbatim |

**Contract.** No imports.

- `DOOR_CONSTRUCTIONS = ['five_piece', 'slab', 'slab_applied']`, `RAIL_SHAPES = ['flat', 'arch', 'cathedral', 'eyebrow']`, `DOOR_PROFILE_SLOTS = ['outside', 'inside', 'panel', 'applied']`, `PANEL_TYPES = ['flat', 'raised']`.
- `DOOR_STYLE_KEYS = ['doorStyleId', 'drawerFrontStyleId', 'panelStyleId']` (the picks on room / wall / run / cabinet).
- `DEFAULT_DESIGN_ID = 'five-piece-square'`.
- `DOOR_DESIGNS` (frozen is fine), in this order:
  - `{ id: 'five-piece-square', code: '5PC', vendor: null, description: '5-piece square', construction: 'five_piece', topRail: { shape: 'flat' }, bottomRail: { shape: 'flat' }, slots: ['outside', 'inside', 'panel', 'applied'] }`
  - `{ id: 'slab', code: 'Slab', vendor: null, description: 'Slab', construction: 'slab', topRail: { shape: 'flat' }, bottomRail: { shape: 'flat' }, slots: ['outside', 'applied'] }`
- `DEFAULT_DOOR_STYLE` — exactly the object in test 2.
- `teamDoorStyle(settings)` → a copy of `DEFAULT_DOOR_STYLE` with `thickness: settings?.doorThickness ?? DEFAULT_DOOR_STYLE.thickness`. Doc comment: interim until the team style screen (SPEC-46, 46.3).
- `findDoorDesign(designId, designs = DOOR_DESIGNS)` → the design with that `id`, else `null`.
- `isStyleRef(value)` → `undefined`, `null` or a non-empty string.
- `isDoorStyle(style)` → a plain object whose keys are all in `id, label, name, designId, thickness, stiles, rails, mid, panel, profiles, arch, shortFace`, all present except `name`, and:
  - `id`, `label`, `designId` non-empty strings; `name` undefined or a string;
  - `thickness` finite > 0;
  - `stiles` exactly `{ left, right }`, `rails` exactly `{ top, bottom }`, each finite > 0;
  - `mid` exactly `{ extra }`, finite ≥ 0;
  - `panel` exactly `{ type, thickness }`, `type` in `PANEL_TYPES`, `thickness` finite > 0;
  - `profiles` a plain object, keys within `DOOR_PROFILE_SLOTS`, each value `null` or a non-empty string;
  - `arch` exactly `{ rise }`, finite > 0;
  - `shortFace` exactly `{ minPanel, minRail, slabBelow, step }`: `minPanel`, `minRail`, `step` finite > 0, `slabBelow` finite ≥ 0.
- `isDoorStyleList(list)` → `undefined`, or an array where every entry `isDoorStyle`, ids are unique, labels are unique, and no id is `'default'` (reserved for the team default).
- `isPartSizes(sizes)` → a plain object with at least one key, keys within `rails, stiles, midRails, midStiles, archRise, notes`:
  - `rails`: plain object, ≥ 1 key, keys within `top, bottom`; `stiles`: same with `left, right`; values finite > 0;
  - `midRails`, `midStiles`: non-empty arrays of plain objects with keys within `at, width`; `at` finite > 0; `width` undefined or finite > 0;
  - `archRise` finite > 0;
  - `notes`: plain object, ≥ 1 key, keys within `top, bottom, left, right`, non-empty strings.

**Don't touch:** `constants.js` (`DEFAULT_SETTINGS`), `styles.js`, `index.js`, anything else.

**NEW `src/elevation/model/__tests__/doorStyles.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import {
  DEFAULT_DOOR_STYLE,
  DOOR_DESIGNS,
  findDoorDesign,
  isDoorStyle,
  isDoorStyleList,
  isPartSizes,
  isStyleRef,
  teamDoorStyle,
} from '../doorStyles.js';

const style = (patch = {}) => ({ ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A', ...patch });

describe('SPEC-46 door designs and the team default style', () => {
  it('seeds a 5-piece square design and a slab design', () => {
    expect(DOOR_DESIGNS.map(({ id, code, construction, slots }) => [id, code, construction, slots])).toEqual([
      ['five-piece-square', '5PC', 'five_piece', ['outside', 'inside', 'panel', 'applied']],
      ['slab', 'Slab', 'slab', ['outside', 'applied']],
    ]);
    expect(findDoorDesign('slab')).toBe(DOOR_DESIGNS[1]);
    expect(findDoorDesign('110')).toBeNull();
    expect(findDoorDesign('110', [{ ...DOOR_DESIGNS[0], id: '110', code: '110' }]).code).toBe('110');
  });

  it('defaults to square 3" stiles and rails, 13/16" thick, flat panel', () => {
    expect(DEFAULT_DOOR_STYLE).toEqual({
      id: 'default',
      label: 'Std',
      name: 'Team default',
      designId: 'five-piece-square',
      thickness: 0.8125,
      stiles: { left: 3, right: 3 },
      rails: { top: 3, bottom: 3 },
      mid: { extra: 0 },
      panel: { type: 'flat', thickness: 0.25 },
      profiles: { outside: null, inside: null, panel: null, applied: null },
      arch: { rise: 2 },
      shortFace: { minPanel: 2.125, minRail: 1.625, slabBelow: 4.8125, step: 0.0625 },
    });
    expect(isDoorStyle(DEFAULT_DOOR_STYLE)).toBe(true);
  });

  it('takes the team default thickness from settings.doorThickness until the team style screen (46.3)', () => {
    expect(teamDoorStyle(DEFAULT_SETTINGS)).toEqual(DEFAULT_DOOR_STYLE);
    expect(teamDoorStyle({ ...DEFAULT_SETTINGS, doorThickness: 1 }).thickness).toBe(1);
    expect(teamDoorStyle({}).thickness).toBe(0.8125);
    expect(DEFAULT_DOOR_STYLE.thickness).toBe(0.8125);
  });
});

describe('SPEC-46 door style shapes', () => {
  it('accepts a complete style, with or without a name, and rejects anything off', () => {
    const { name, ...unnamed } = style();
    void name;
    expect([style(), unnamed, style({ profiles: { inside: 'prof-og' } })].map(isDoorStyle)).toEqual([true, true, true]);
    expect([
      null,
      [],
      style({ id: '' }),
      style({ label: 7 }),
      style({ designId: undefined }),
      style({ thickness: 0 }),
      style({ rails: { top: 3 } }),
      style({ stiles: { left: 3, right: -1 } }),
      style({ mid: { extra: -0.125 } }),
      style({ panel: { type: 'cloud', thickness: 0.25 } }),
      style({ profiles: { crown: null } }),
      style({ profiles: { inside: 42 } }),
      style({ arch: { rise: 0 } }),
      style({ shortFace: { ...DEFAULT_DOOR_STYLE.shortFace, step: 0 } }),
      style({ color: 'red' }),
    ].map(isDoorStyle)).toEqual(Array(15).fill(false));
  });

  it('accepts a room\'s list with unique ids and labels, never "default"', () => {
    const A = style();
    const B = style({ id: 'ds-b', label: 'B', thickness: 1 });
    expect([undefined, [], [A, B]].map(isDoorStyleList)).toEqual([true, true, true]);
    expect([
      [A, { ...B, id: 'ds-a' }],
      [A, { ...B, label: 'A' }],
      [style({ id: 'default' })],
      [style({ thickness: 'thick' })],
      { a: A },
      null,
    ].map(isDoorStyleList)).toEqual(Array(6).fill(false));
  });

  it('takes a pick as absent, null or an id', () => {
    expect([undefined, null, 'ds-a'].map(isStyleRef)).toEqual([true, true, true]);
    expect(['', 5, {}].map(isStyleRef)).toEqual([false, false, false]);
  });

  it('checks per-part sizes: any stile or rail, mid rails and stiles, arch rise, notes', () => {
    expect([
      { rails: { top: 2.625, bottom: 2.625 } },
      { stiles: { left: 3.5 }, notes: { left: 'scribe' } },
      { midRails: [{ at: 31.5 }], midStiles: [{ at: 12, width: 3.625 }] },
      { archRise: 2.5 },
    ].map(isPartSizes)).toEqual([true, true, true, true]);
    expect([
      null,
      {},
      { rails: {} },
      { rails: { middle: 3 } },
      { rails: { top: 0 } },
      { stiles: { left: 'wide' } },
      { midRails: [] },
      { midRails: [{ width: 3 }] },
      { midStiles: [{ at: 12, width: 0 }] },
      { archRise: -1 },
      { notes: { left: '' } },
      { notes: { middle: 'scribe' } },
      { color: 'red' },
    ].map(isPartSizes)).toEqual(Array(13).fill(false));
  });
});
```

**Count:** 968 + 7 = **975**.

---

## §3 Step 380 — persistence: styles and picks saved and validated

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/store/persistence.js` | 695 | validate the new keys (below) |
| `src/elevation/model/faces.js` | 240 | `isFaceNode`: a leaf's `styleId` and `sizes` |
| NEW `src/elevation/store/__tests__/doorStyleSaves.test.js` | — | 5 tests, verbatim |

**Contract.** Import `DOOR_STYLE_KEYS`, `isDoorStyleList`, `isPartSizes`, `isStyleRef` from `../model/doorStyles.js`. A private `hasStyleRefs(node)` = every key of `DOOR_STYLE_KEYS` passes `isStyleRef(node[key])`; a private `isPartPick(entry)` = `isStyleRef(entry.styleId) && (entry.sizes === undefined || isPartSizes(entry.sizes))`.

| Where (persistence.js) | Line | Add |
|---|---:|---|
| `CELL_KIND_KEYS.panel` | 35 | `'styleId', 'sizes'` to the list |
| `isEnd` | 110 | `&& isPartPick(end)` (any end type, so switching type never invalidates the document) |
| `isItem` | 137 | `&& hasStyleRefs(item)` |
| `isCellLeaf` | 295 | for `kind === 'panel'`, `&& isPartPick(leaf)` |
| `isEndPanels` | 371 | each non-null entry `&& isPartPick(entry)` |
| `isWall` | 442 | `&& hasStyleRefs(wall)` |
| `isRoom` | 475 | `&& isDoorStyleList(room.doorStyles) && hasStyleRefs(room)` |

`isRun` (238) gets `&& hasStyleRefs(run)`.

**`faces.js`** `isFaceNode`, the leaf branch (line ~49): also require `isStyleRef(node.styleId)` and `node.sizes === undefined || isPartSizes(node.sizes)`. Import both from `./doorStyles.js` (no cycle: `doorStyles.js` imports nothing).

**Don't touch:** `normalizeDocument` / `normalizeElevationDocument` (they already keep unknown keys), `toElevationDocument` (step 384), the schema version and storage key, `persistence.test.js`, the store slices.

**NEW `src/elevation/store/__tests__/doorStyleSaves.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import { gridFromItems } from '../../model/grid.js';
import { isElevationDocument, toElevationDocument } from '../persistence.js';

const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A', name: 'Kitchen' };
const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', thickness: 1 };

/** One wall with a wall end panel and a base run: end panel left, a cabinet, a back panel cell. */
function document({ room = {}, wall = {}, run = {}, cabinet = {}, panel = {}, leftEnd = {}, endPanel = {} } = {}) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  return {
    schemaVersion: 4,
    settings,
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...settings.defaultProfile },
      wallOrder: ['wall-a'],
      walls: [{
        id: 'wall-a', name: '', numberOverride: null, elevationForced: false,
        x1: 0, y1: 0, x2: 240, y2: 0, height: 108, thickness: 4.5, flipped: false,
        connections: { start: null, end: null }, profile: {}, openings: [],
        endPanels: { start: { width: null, ...endPanel }, end: null },
        runs: [{
          id: 'a', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
          ends: { left: { type: 'end_panel', width: null, ...leftEnd }, right: { type: 'filler', width: null } },
          autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
          anchors: { left: false, right: false },
          grid: gridFromItems('a', [
            { id: 'a-cab', kind: 'cabinet', width: null, ...cabinet },
            { id: 'a-pan', kind: 'panel', width: 0.75, depth: 0.75, align: 'back', ...panel },
          ]),
          ...run,
        }],
        ...wall,
      }],
      ...room,
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-a',
    view: 'elevation',
  };
}

describe('SPEC-46 door styles in the saved document', () => {
  it('keeps the room\'s styles, the picks at every level and per-part sizes', () => {
    const saved = document({
      room: { doorStyles: [A, B], doorStyleId: 'ds-a', drawerFrontStyleId: null, panelStyleId: 'ds-b' },
      wall: { doorStyleId: 'ds-b' },
      run: { drawerFrontStyleId: 'ds-a' },
      cabinet: {
        doorStyleId: 'ds-b',
        face: {
          direction: 'vertical',
          size: null,
          children: [
            { type: 'drawer_front', size: 6, styleId: 'ds-a', sizes: { rails: { top: 2.625, bottom: 2.625 } } },
            { type: 'door', size: null, sizes: { midRails: [{ at: 12 }], notes: { top: 'match' } } },
          ],
        },
      },
      panel: { styleId: 'ds-b', sizes: { stiles: { left: 3.5 }, notes: { left: 'scribe' } } },
      leftEnd: { styleId: 'ds-a', sizes: { stiles: { left: 3.5 }, notes: { left: 'scribe' } } },
      endPanel: { styleId: 'ds-b', sizes: { rails: { bottom: 3.5 } } },
    });
    expect(isElevationDocument(saved)).toBe(true);
    expect(toElevationDocument(saved)).toEqual(saved);
  });

  it('rejects a style list with a bad or repeated style', () => {
    expect([
      document({ room: { doorStyles: [A, { ...B, id: 'ds-a' }] } }),
      document({ room: { doorStyles: [A, { ...B, label: 'A' }] } }),
      document({ room: { doorStyles: [{ ...A, thickness: 0 }] } }),
      document({ room: { doorStyles: [{ ...A, id: 'default' }] } }),
      document({ room: { doorStyles: { a: A } } }),
    ].map(isElevationDocument)).toEqual([false, false, false, false, false]);
  });

  it('rejects picks that aren\'t style ids, and bad part sizes', () => {
    expect([
      document({ room: { doorStyleId: 5 } }),
      document({ wall: { panelStyleId: '' } }),
      document({ run: { doorStyleId: 7 } }),
      document({ cabinet: { drawerFrontStyleId: {} } }),
      document({ leftEnd: { styleId: 7 } }),
      document({ endPanel: { sizes: {} } }),
      document({ panel: { styleId: 3 } }),
      document({ panel: { sizes: { rails: { top: -1 } } } }),
    ].map(isElevationDocument)).toEqual(Array(8).fill(false));
  });

  it('rejects a bad pick or sizes on a face, at any depth', () => {
    expect([
      document({ cabinet: { face: { type: 'door', size: null, styleId: 4 } } }),
      document({ cabinet: { face: { type: 'door', size: null, sizes: { color: 'red' } } } }),
      document({
        cabinet: {
          face: {
            direction: 'vertical',
            size: null,
            children: [{ type: 'drawer_front', size: 6, sizes: { rails: {} } }, { type: 'door', size: null }],
          },
        },
      }),
    ].map(isElevationDocument)).toEqual([false, false, false]);
  });

  it('still loads a pick of a style the room doesn\'t list (the resolver warns instead)', () => {
    expect(isElevationDocument(document({ run: { doorStyleId: 'gone' } }))).toBe(true);
  });
});
```

The base document passes `isElevationDocument` today. Before the change, test 1 fails (a panel cell refuses `styleId`), and tests 2–4 fail (bad values are let through); test 5 passes either way.

**Count:** 975 + 5 = **980**. Golden snapshot unchanged.

---

## §4 Step 381 — `doorStyleResolve.js`: which style a part uses

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/doorStyleResolve.js` | — | `resolveDoorStyle`, `facePartType`, `cabinetFaceLevels`, `panelLevels` |
| NEW `src/elevation/model/__tests__/doorStyleResolve.test.js` | — | 8 tests, verbatim |

**Contract.** Imports from `./doorStyles.js` only (step 384 adds `./grid.js`).

- `facePartType(type)` → `'drawer_front'` for `'drawer_front'`; `null` for `'open'`; `'door'` for `door`, `pair_door`, `false_front`, `panel`.
- `cabinetFaceLevels(room, wall, run, cabinet, face)` → `[{ level: 'face', node: face }, { level: 'cabinet', node: cabinet }, { level: 'run', node: run }, { level: 'wall', node: wall }, { level: 'room', node: room }]`, leaving out any whose node is null/undefined.
- `panelLevels(room, wall, run, part)` → the same with `{ level: 'part', node: part }` first and no cabinet level (`run` is null for a wall end panel).
- `resolveDoorStyle(room, settings, partType, levels, designs = DOOR_DESIGNS)` → `{ style, design, source, warnings }`:
  - `styles` = `room?.doorStyles ?? []`, looked up by id.
  - A level named `'face'` or `'part'` is the part itself: its key is `styleId`. Every other level uses the chain keys, in order: `door` → `['doorStyleId']`; `drawer_front` → `['drawerFrontStyleId', 'doorStyleId']`; `panel` → `['panelStyleId', 'doorStyleId']`.
  - Walk: the part's `styleId` first; then for each chain key in order, the other levels nearest first. The first id that's in `styles` wins: `source = { level, key }`. `null`/`undefined` inherit. An id that isn't in `styles` adds `{ code: 'door-style-missing', level, id }` and the walk goes on.
  - Nothing found: `teamDoorStyle(settings)`, `source = { level: 'team', key: null }`.
  - `design = findDoorDesign(style.designId, designs)`; when null, `findDoorDesign(DEFAULT_DESIGN_ID, designs) ?? DOOR_DESIGNS[0]` and a warning `{ code: 'door-design-missing', id: style.designId }` (after the style warnings).
  - `style` is the stored object itself (no copy) when it comes from the room.

**Don't touch:** `styles.js` (`resolveStyle` is the cabinet style), anything else.

**NEW `src/elevation/model/__tests__/doorStyleResolve.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { cabinetFaceLevels, facePartType, panelLevels, resolveDoorStyle } from '../doorStyleResolve.js';

const S = DEFAULT_SETTINGS;
const ds = (id, label, patch = {}) => ({ ...DEFAULT_DOOR_STYLE, id, label, ...patch });
const A = ds('ds-a', 'A');
const B = ds('ds-b', 'B', { thickness: 1 });
const C = ds('ds-c', 'C', { designId: 'slab' });
const D = ds('ds-d', 'D', { designId: '114' });
const ARCHED = { ...DOOR_DESIGNS[0], id: '114', code: '114', topRail: { shape: 'arch' } };

/** A face (or cabinet-level part) resolved through cabinet, run, wall and the room holding A–D. */
function resolve(partType, { face, cabinet, run, wall, room } = {}, settings = S, designs) {
  const roomNode = { doorStyles: [A, B, C, D], ...room };
  const levels = [
    { level: 'face', node: face ?? null },
    { level: 'cabinet', node: cabinet ?? null },
    { level: 'run', node: run ?? null },
    { level: 'wall', node: wall ?? null },
    { level: 'room', node: roomNode },
  ].filter(({ node }) => node);
  return resolveDoorStyle(roomNode, settings, partType, levels, designs);
}

/** A panel part (end panel, wall end panel, panel cell) resolved through run, wall and room. */
function resolvePanel({ part, run, wall, room } = {}) {
  const roomNode = { doorStyles: [A, B, C, D], ...room };
  return resolveDoorStyle(roomNode, S, 'panel', panelLevels(roomNode, wall ?? null, run ?? null, part ?? null));
}

const pick = ({ style, design, source, warnings }) => ({ id: style.id, design: design.id, source, warnings });
const from = (result) => [result.style.id, result.source];

describe('SPEC-46 which door style a part uses', () => {
  it('falls back to the team default when nothing picks a style', () => {
    expect(pick(resolve('door'))).toEqual({
      id: 'default', design: 'five-piece-square', source: { level: 'team', key: null }, warnings: [],
    });
    expect(resolve('door', {}, { ...S, doorThickness: 1 }).style.thickness).toBe(1);
    expect(resolveDoorStyle({}, S, 'door', []).style).toEqual(DEFAULT_DOOR_STYLE);
  });

  it('takes the nearest level\'s pick; null inherits', () => {
    expect(from(resolve('door', { run: { doorStyleId: 'ds-b' }, room: { doorStyleId: 'ds-a' } })))
      .toEqual(['ds-b', { level: 'run', key: 'doorStyleId' }]);
    expect(from(resolve('door', { wall: { doorStyleId: 'ds-b' }, room: { doorStyleId: 'ds-a' } })))
      .toEqual(['ds-b', { level: 'wall', key: 'doorStyleId' }]);
    expect(from(resolve('door', { cabinet: { doorStyleId: null }, room: { doorStyleId: 'ds-a' } })))
      .toEqual(['ds-a', { level: 'room', key: 'doorStyleId' }]);
    expect(resolve('door', { run: { doorStyleId: 'ds-b' } }).style).toBe(B);
  });

  it('lets a face pick its own style over everything above it', () => {
    expect(from(resolve('door', { face: { type: 'door', styleId: 'ds-a' }, cabinet: { doorStyleId: 'ds-b' } })))
      .toEqual(['ds-a', { level: 'face', key: 'styleId' }]);
  });

  it('walks the drawer-front chain first, then the door chain (P12)', () => {
    const levels = { run: { doorStyleId: 'ds-b' }, room: { drawerFrontStyleId: 'ds-a' } };
    expect(from(resolve('drawer_front', levels))).toEqual(['ds-a', { level: 'room', key: 'drawerFrontStyleId' }]);
    expect(from(resolve('door', levels))).toEqual(['ds-b', { level: 'run', key: 'doorStyleId' }]);
    expect(from(resolve('drawer_front', { run: { doorStyleId: 'ds-b' } })))
      .toEqual(['ds-b', { level: 'run', key: 'doorStyleId' }]);
    expect(from(resolve('drawer_front', { face: { styleId: 'ds-c' }, run: { drawerFrontStyleId: 'ds-a' } })))
      .toEqual(['ds-c', { level: 'face', key: 'styleId' }]);
  });

  it('walks the panel chain first, then the door chain (P15)', () => {
    expect(from(resolvePanel({ run: { doorStyleId: 'ds-b' }, room: { panelStyleId: 'ds-c', doorStyleId: 'ds-a' } })))
      .toEqual(['ds-c', { level: 'room', key: 'panelStyleId' }]);
    expect(from(resolvePanel({ part: { styleId: 'ds-a' }, room: { panelStyleId: 'ds-c' } })))
      .toEqual(['ds-a', { level: 'part', key: 'styleId' }]);
    expect(from(resolvePanel({ run: { doorStyleId: 'ds-b' }, room: { doorStyleId: 'ds-a' } })))
      .toEqual(['ds-b', { level: 'run', key: 'doorStyleId' }]);
  });

  it('skips a pick of a style the room doesn\'t have, with a warning', () => {
    expect(pick(resolve('door', {
      face: { styleId: 'gone-1' }, run: { doorStyleId: 'gone-2' }, room: { doorStyleId: 'ds-a' },
    }))).toEqual({
      id: 'ds-a',
      design: 'five-piece-square',
      source: { level: 'room', key: 'doorStyleId' },
      warnings: [
        { code: 'door-style-missing', level: 'face', id: 'gone-1' },
        { code: 'door-style-missing', level: 'run', id: 'gone-2' },
      ],
    });
  });

  it('finds the style\'s design, falling back to 5-piece square with a warning', () => {
    expect(resolve('door', { room: { doorStyleId: 'ds-c' } }).design).toBe(DOOR_DESIGNS[1]);
    expect(pick(resolve('door', { room: { doorStyleId: 'ds-d' } }))).toEqual({
      id: 'ds-d',
      design: 'five-piece-square',
      source: { level: 'room', key: 'doorStyleId' },
      warnings: [{ code: 'door-design-missing', id: '114' }],
    });
    const withArched = resolve('door', { room: { doorStyleId: 'ds-d' } }, S, [...DOOR_DESIGNS, ARCHED]);
    expect([withArched.design, withArched.warnings]).toEqual([ARCHED, []]);
  });

  it('maps face types to chains and builds the level lists', () => {
    expect(['door', 'pair_door', 'false_front', 'panel', 'drawer_front', 'open'].map(facePartType))
      .toEqual(['door', 'door', 'door', 'door', 'drawer_front', null]);
    const [R, W, U, I, F, P] = [{ id: 'R' }, { id: 'W' }, { id: 'U' }, { id: 'I' }, { type: 'door' }, { id: 'P' }];
    expect(cabinetFaceLevels(R, W, U, I, F)).toEqual([
      { level: 'face', node: F },
      { level: 'cabinet', node: I },
      { level: 'run', node: U },
      { level: 'wall', node: W },
      { level: 'room', node: R },
    ]);
    expect(cabinetFaceLevels(R, W, U, undefined, F).map(({ level }) => level)).toEqual(['face', 'run', 'wall', 'room']);
    expect(panelLevels(R, W, null, P)).toEqual([
      { level: 'part', node: P },
      { level: 'wall', node: W },
      { level: 'room', node: R },
    ]);
  });
});
```

**Count:** 980 + 8 = **988**.

---

## §5 Step 382 — `doorSizes.js`: final stile and rail sizes

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/doorSizes.js` | — | `partSizes` |
| NEW `src/elevation/model/__tests__/doorSizes.test.js` | — | 7 tests, verbatim |

**Contract.** No imports needed (tests pass the design in).

`partSizes(style, design, part)`, `part = { width, height, sizes? }` (installed size, inches):

- **Slab:** `design.construction !== 'five_piece'` → `{ construction: 'slab', slab: 'design' }`. Else `height < style.shortFace.slabBelow − 1e-9` → `{ construction: 'slab', slab: 'rule' }`. Nothing else on a slab result.
- **Rounding:** `down(x) = Math.floor(x / step + 1e-9) * step`, `step = style.shortFace.step`; `{ minPanel, minRail } = style.shortFace`.
- **Rails** (`R = style.rails`, `T`/`Bo` = `sizes.rails?.top` / `.bottom`):
  - both typed: kept, both sources `'part'`;
  - one typed: it's kept (`'part'`); the other = `min(R.side, max(minRail, down(height − minPanel − typed)))`;
  - none typed: each = `min(R.side, max(minRail, down((height − minPanel) / 2)))`;
  - a calculated rail's source is `'style'` when it equals `R.side` (within 1e-9), else `'rule'`.
- **Stiles:** `sizes.stiles?.left ?? style.stiles.left` (same for right), source `'part'` when typed, else `'style'`. Stiles never shrink.
- **Mids:** `midRails` = `(sizes.midRails ?? []).map(({ at, width }) => ({ at, width: width ?? style.rails.top + style.mid.extra }))`; `midStiles` the same with `style.stiles.left + style.mid.extra`.
- **Opening** (the frame opening, mids ignored): `{ width: width − left − right, height: height − top − bottom }`.
- Result: `{ construction: 'five_piece', slab: null, stiles: { left, right }, rails: { top, bottom }, midRails, midStiles, opening, sources: { top, bottom, left, right }, notes: sizes.notes ?? {} }`.

**Don't touch:** anything else. Nothing calls `partSizes` yet (46.2 does).

**NEW `src/elevation/model/__tests__/doorSizes.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { partSizes } from '../doorSizes.js';

const [SQUARE, SLAB] = DOOR_DESIGNS;
const withRails = (width) => ({ ...DEFAULT_DOOR_STYLE, rails: { top: width, bottom: width } });

/** Rails and opening height of a 15" wide face, or 'slab'. */
function rails(height, style = DEFAULT_DOOR_STYLE, sizes) {
  const result = partSizes(style, SQUARE, { width: 15, height, ...(sizes ? { sizes } : {}) });
  return result.construction === 'slab' ? 'slab' : [result.rails.top, result.rails.bottom, result.opening.height];
}

describe('SPEC-46 stile and rail sizes', () => {
  it('shrinks 3" rails on short faces to keep a 2 1/8" panel, down to 1 5/8" rails, then slab (Kyle\'s table)', () => {
    expect([9, 8.125, 8, 7.9375, 7, 6, 5.375, 5, 4.8125, 4.75].map((height) => rails(height))).toEqual([
      [3, 3, 3],
      [3, 3, 2.125],
      [2.9375, 2.9375, 2.125],
      [2.875, 2.875, 2.1875],
      [2.4375, 2.4375, 2.125],
      [1.9375, 1.9375, 2.125],
      [1.625, 1.625, 2.125],
      [1.625, 1.625, 1.75],
      [1.625, 1.625, 1.5625],
      'slab',
    ]);
  });

  it('drops 2 3/4" rails below 7 5/8" and 2 1/2" rails below 7 1/8"', () => {
    expect([7.625, 7.5625].map((height) => rails(height, withRails(2.75))))
      .toEqual([[2.75, 2.75, 2.125], [2.6875, 2.6875, 2.1875]]);
    expect([7.125, 7.0625].map((height) => rails(height, withRails(2.5))))
      .toEqual([[2.5, 2.5, 2.125], [2.4375, 2.4375, 2.1875]]);
  });

  it('gives the whole result for a 7" drawer front, rails from the rule', () => {
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 7 })).toEqual({
      construction: 'five_piece',
      slab: null,
      stiles: { left: 3, right: 3 },
      rails: { top: 2.4375, bottom: 2.4375 },
      midRails: [],
      midStiles: [],
      opening: { width: 9, height: 2.125 },
      sources: { top: 'rule', bottom: 'rule', left: 'style', right: 'style' },
      notes: {},
    });
  });

  it('keeps typed sizes and fits the other rail around them (P13)', () => {
    const oneRail = partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 7, sizes: { rails: { top: 3 } } });
    expect([oneRail.rails, oneRail.opening.height, oneRail.sources.top, oneRail.sources.bottom])
      .toEqual([{ top: 3, bottom: 1.875 }, 2.125, 'part', 'rule']);
    const scribe = partSizes(DEFAULT_DOOR_STYLE, SQUARE, {
      width: 15, height: 30, sizes: { stiles: { left: 3.5 }, notes: { left: 'scribe' } },
    });
    expect([scribe.stiles, scribe.rails, scribe.opening, scribe.sources, scribe.notes]).toEqual([
      { left: 3.5, right: 3 },
      { top: 3, bottom: 3 },
      { width: 8.5, height: 24 },
      { top: 'style', bottom: 'style', left: 'part', right: 'style' },
      { left: 'scribe' },
    ]);
    expect(rails(6, DEFAULT_DOOR_STYLE, { rails: { top: 2.625, bottom: 2.625 } })).toEqual([2.625, 2.625, 0.75]);
  });

  it('never widens a rail narrower than the minimum', () => {
    expect([30, 5].map((height) => rails(height, withRails(1.5)))).toEqual([[1.5, 1.5, 27], [1.5, 1.5, 2]]);
    expect(partSizes(withRails(1.5), SQUARE, { width: 15, height: 5 }).sources.top).toBe('style');
  });

  it('makes slab-design parts slab at any size, and short parts slab by the rule', () => {
    expect(partSizes(DEFAULT_DOOR_STYLE, SLAB, { width: 15, height: 30 })).toEqual({ construction: 'slab', slab: 'design' });
    expect(partSizes(DEFAULT_DOOR_STYLE, { ...SLAB, construction: 'slab_applied' }, { width: 15, height: 30 }))
      .toEqual({ construction: 'slab', slab: 'design' });
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 4.75 })).toEqual({ construction: 'slab', slab: 'rule' });
  });

  it('places mid rails and stiles, outside width plus the style\'s extra unless typed (DOOR-003)', () => {
    const tall = { width: 15, height: 60 };
    expect(partSizes(DEFAULT_DOOR_STYLE, SQUARE, { ...tall, sizes: { midRails: [{ at: 31.5 }] } }).midRails)
      .toEqual([{ at: 31.5, width: 3 }]);
    const profiled = { ...DEFAULT_DOOR_STYLE, mid: { extra: 0.625 } };
    expect(partSizes(profiled, SQUARE, { ...tall, sizes: { midRails: [{ at: 31.5 }] } }).midRails)
      .toEqual([{ at: 31.5, width: 3.625 }]);
    const typed = partSizes(DEFAULT_DOOR_STYLE, SQUARE, {
      ...tall, sizes: { midRails: [{ at: 31.5, width: 4 }], midStiles: [{ at: 7.5 }] },
    });
    expect([typed.midRails, typed.midStiles, typed.opening]).toEqual([
      [{ at: 31.5, width: 4 }], [{ at: 7.5, width: 3 }], { width: 9, height: 54 },
    ]);
  });
});
```

What the numbers are: Kyle's table (DOORS-PROFILES-PLAN §3.4). At 7 15/16" the room is (7 15/16 − 2 1/8) / 2 = 2 29/32, rounded down to 2 7/8, leaving a 2 3/16" panel. With the top typed at 3" on a 7" front, the bottom gets 7 − 2 1/8 − 3 = 1 7/8. A 1 1/2" rail style stays 1 1/2 at 5" (2" panel).

**Count:** 988 + 7 = **995**.

---

## §6 Step 383 — stacking check

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorSizes.js` | ~70 | `frontStackWarnings` |
| `src/elevation/model/__tests__/doorSizes.test.js` | ~120 | one `describe` appended, verbatim |

**Contract.** `frontStackWarnings(parts)`, `parts = [{ path, x, z, width, height, sizes }]` (one cabinet's faces, `sizes` from `partSizes`). For each `a` then each `b` in input order (a ≠ b), both `five_piece`: warn `{ code: 'front-panel-over-taller', path: a.path, below: b.path }` when
- they overlap across: `min(a.x + a.width, b.x + b.width) − max(a.x, b.x) > 1e-6`,
- `a` is above `b`: `a.z ≥ b.z + b.height − 1e-6`,
- `a` is no taller: `a.height ≤ b.height + 1e-6`,
- and `a`'s panel is taller: `a.sizes.opening.height > b.sizes.opening.height + 1e-6`.

Doc comment: a shorter front above must never have a bigger panel than one below (SPEC-46); warns, never fixes.

**Don't touch:** `partSizes`, anything else.

**Append to `doorSizes.test.js`**, verbatim:

```js

describe('SPEC-46 stacking check', () => {
  const front = (path, z, height, sizes, x = 0) => ({
    path, x, z, width: 15, height,
    sizes: partSizes(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height, ...(sizes ? { sizes } : {}) }),
  });

  it('is quiet for fronts stacking shorter above taller, equal fronts, or a taller one above', () => {
    expect(frontStackWarnings([front('r.2', 0, 9), front('r.1', 9.125, 7), front('r.0', 16.25, 5.375)])).toEqual([]);
    expect(frontStackWarnings([front('r.2', 0, 10), front('r.1', 10.125, 10), front('r.0', 20.25, 10)])).toEqual([]);
    expect(frontStackWarnings([front('r.1', 0, 9), front('r.0', 9.125, 10)])).toEqual([]);
  });

  it('warns when rounding gives a 7 15/16" front above an 8" one the bigger panel', () => {
    expect(frontStackWarnings([front('r.1', 0, 8), front('r.0', 8.125, 7.9375)]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
  });

  it('warns when typed rails give a shorter front above the bigger panel', () => {
    expect(frontStackWarnings([front('r.1', 0, 10), front('r.0', 10.125, 9, { rails: { top: 2, bottom: 2 } })]))
      .toEqual([{ code: 'front-panel-over-taller', path: 'r.0', below: 'r.1' }]);
  });

  it('ignores fronts side by side and slab fronts', () => {
    expect(frontStackWarnings([front('r.1', 0, 8), front('r.0', 8.125, 7.9375, undefined, 16)])).toEqual([]);
    expect(frontStackWarnings([front('r.1', 0, 8), front('r.0', 8.125, 4.5)])).toEqual([]);
  });
});
```

and add `frontStackWarnings` to the file's `doorSizes.js` import.

**Count:** 995 + 4 = **999**.

---

## §7 Step 384 — run front plane = thickest face

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorStyleResolve.js` | ~70 | `runDoorThickness` |
| `src/elevation/model/roomSync.js` | 385 | `withDoorThickness` in the first runs pass |
| `src/elevation/model/corners.js` | 235 | `runFaceThickness`; `frontDepth` uses it |
| `src/elevation/model/cells.js` | 360 | `cellDepth` takes the thickness |
| `src/elevation/model/planPieces.js` | 372 | line 241 passes it |
| `src/elevation/store/persistence.js` | ~715 | `toElevationDocument` strips `_doorThickness` |
| NEW `src/elevation/model/__tests__/doorThickness.test.js` | — | 9 tests, verbatim |

**Contract.**
- `doorStyleResolve.js`: `runDoorThickness(room, wall, run, settings)` → the largest resolved `style.thickness` over every non-`open` face leaf of every cabinet leaf in `gridLeaves(run.grid)` (`./grid.js`; cabinet leaves are `kind === 'cabinet'`). Face leaves: walk `cabinet.face` (a node with `type` is a leaf; a group has `children`); a cabinet with no `face` counts as one `{ type: 'door' }` leaf. Each leaf resolves with `resolveDoorStyle(room, settings, facePartType(type), cabinetFaceLevels(room, wall, run, cabinet, leaf))`. No cabinets, or no run grid → `teamDoorStyle(settings).thickness`.
- `roomSync.js`: private `withDoorThickness(room, wall, run, settings)`, following `withSeamGap` / `withFrame`: a run with `_frame` → none; else `t = runDoorThickness(...)`; when `|t − teamDoorStyle(settings).thickness| > 1e-9` the run gets `_doorThickness: t` (same run back when it already has it), otherwise the key is removed (same run back when it has none). In `syncRoom`'s first runs pass (lines 162–165) it goes outside `withFrame`: `withRunPlane(wall, withDoorThickness(nextRoom, wall, withFrame(nextRoom, withSeamGap(nextRoom, run, settings), settings), settings))`.
- `corners.js`: export `runFaceThickness(run, settings)` → `run._doorThickness ?? settings.doorThickness`, doc comment: the run's front plane thickness, its thickest face (SPEC-46 P11). `frontDepth`'s last line uses it in place of `settings.doorThickness`.
- `cells.js` `cellDepth(piece, leaf, runDepth, settings, doorThickness = settings.doorThickness)`: the flush-panel line uses `doorThickness`. Doc comment unchanged except "door face".
- `planPieces.js` line 241: `cellDepth(piece, leafOf(piece), run.depth, settings, runFaceThickness(run, settings))`; import `runFaceThickness` with `frontDepth`.
- `persistence.js` `toElevationDocument` (line ~651): add `_doorThickness` to the stripped keys with its `void`.

**Don't touch:** the planFaces / elevationParts face lines (step 385), `CellProperties.jsx` (46.1), `SettingsPanel.jsx`, `constants.js`, other tests. The golden snapshot must not change (no golden room has styles).

**NEW `src/elevation/model/__tests__/doorThickness.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frontDepth } from '../corners.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { runDoorThickness } from '../doorStyleResolve.js';
import { elevationParts } from '../elevationParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument, toElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

const THICK = { ...DEFAULT_DOOR_STYLE, id: 'ds-thick', label: 'A', thickness: 1 };
const THIN = { ...DEFAULT_DOOR_STYLE, id: 'ds-thin', label: 'B', thickness: 0.75 };
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const CAB_24 = 'cfc9c904-3a11-43ee-a48d-88bef061b5ae';
const CAB_36 = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
const FF_BASE = '860a1197-d14f-4fc2-9499-2d44cd1d8fa3';

const runOf = (room, id) => room.walls.flatMap((wall) => wall.runs).find((run) => run.id === id);
const leafOf = (run, id) => run.grid.cells.map((cell) => cell.node).find((node) => node.id === id);

/** A golden room with THICK and THIN listed, after `edit` picks where they're used, synced. */
function styled(edit, name = 'G1 Euro kitchen', s = settings) {
  const room = structuredClone(stored(name));
  room.doorStyles = [THICK, THIN];
  edit(room);
  return syncRoom(room, s);
}
const baseFront = (room, s = settings) => frontDepth(runOf(room, BASE), s);

describe('SPEC-46 a run\'s front plane follows its thickest face (P11)', () => {
  it('leaves a room with no styles as it was (G1)', () => {
    const room = syncRoom(stored('G1 Euro kitchen'), settings);
    expect('_doorThickness' in runOf(room, BASE)).toBe(false);
    expect(baseFront(room)).toBe(24.875);
  });

  it('moves the front of a run whose style is thicker', () => {
    const room = styled((r) => { runOf(r, BASE).doorStyleId = 'ds-thick'; });
    expect(runOf(room, BASE)._doorThickness).toBe(1);
    expect(baseFront(room)).toBe(25.0625);
    expect(runDoorThickness(room, room.walls[0], runOf(room, BASE), settings)).toBe(1);
  });

  it('takes the thickest face when only one cabinet is thicker', () => {
    const room = styled((r) => { leafOf(runOf(r, BASE), CAB_24).doorStyleId = 'ds-thick'; });
    expect(runOf(room, BASE)._doorThickness).toBe(1);
    expect(baseFront(room)).toBe(25.0625);
  });

  it('brings the front in when every face is thinner', () => {
    const room = styled((r) => { r.doorStyleId = 'ds-thin'; });
    expect(runOf(room, BASE)._doorThickness).toBe(0.75);
    expect(baseFront(room)).toBe(24.8125);
  });

  it('applies a drawer-front style only to drawer fronts', () => {
    const doors = styled((r) => { r.drawerFrontStyleId = 'ds-thick'; });
    expect('_doorThickness' in runOf(doors, BASE)).toBe(false);
    expect(baseFront(doors)).toBe(24.875);
    const drawers = styled((r) => {
      r.drawerFrontStyleId = 'ds-thick';
      leafOf(runOf(r, BASE), CAB_24).face = {
        direction: 'vertical', size: null, children: [{ type: 'drawer_front', size: 6 }, { type: 'drawer_front', size: null }],
      };
    });
    expect(runOf(drawers, BASE)._doorThickness).toBe(1);
    expect(baseFront(drawers)).toBe(25.0625);
  });

  it('still takes the team default thickness from settings.doorThickness', () => {
    const thick = { ...settings, doorThickness: 1 };
    const plain = syncRoom(stored('G1 Euro kitchen'), thick);
    expect('_doorThickness' in runOf(plain, BASE)).toBe(false);
    expect(baseFront(plain, thick)).toBe(25.0625);
    const same = styled((r) => { runOf(r, BASE).doorStyleId = 'ds-thick'; }, 'G1 Euro kitchen', thick);
    expect('_doorThickness' in runOf(same, BASE)).toBe(false);
  });

  it('keeps a face frame run\'s front at the frame (G2)', () => {
    const room = styled((r) => { runOf(r, FF_BASE).doorStyleId = 'ds-thick'; }, 'G2 Face frame kitchen');
    expect('_doorThickness' in runOf(room, FF_BASE)).toBe(false);
    expect(frontDepth(runOf(room, FF_BASE), settings)).toBe(24.8125);
  });

  it('brings fillers out to the new front plane (G1 elevation A)', () => {
    const room = styled((r) => { leafOf(runOf(r, BASE), CAB_36).doorStyleId = 'ds-thick'; });
    const filler = elevationParts(room, room.walls[0], 'front', settings).find((part) => part.id === `${BASE}:right`);
    expect([filler.back, filler.front]).toEqual([24.0625, 25.0625]);
  });

  it('never saves _doorThickness', () => {
    const room = styled((r) => { runOf(r, BASE).doorStyleId = 'ds-thick'; });
    const saved = toElevationDocument({ ...document, rooms: [room] });
    expect('_doorThickness' in runOf(saved.rooms[0], BASE)).toBe(false);
    expect(runOf(saved.rooms[0], BASE).doorStyleId).toBe('ds-thick');
  });
});
```

What the numbers are: G1's base run is 24" deep: front = 24 + 1/16 bumper + door. 13/16 → 24 7/8 (today), 1" → 25 1/16, 3/4 → 24 13/16. Its right filler sits back at 24 1/16 (box + bumper) and comes out to the front plane. G2's base is face frame: its front is box + frame (24 + 13/16) whatever the doors.

**Count:** 999 + 9 = **1008**. Golden snapshot unchanged.

---

## §8 Step 385 — each face at its own thickness

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/faceLayouts.js` | 106 | faces carry `thickness` when it isn't the team default |
| `src/elevation/model/elevationParts.js` | 148 | lines 126–130 use the face's thickness |
| `src/elevation/model/planPieces.js` | 372 | line 93 uses the face's thickness |
| `src/elevation/model/__tests__/doorThickness.test.js` | ~120 | one `describe` appended, verbatim |

**Contract.**
- `faceLayouts.js` `runFaceLayouts`: after `applyHinges`, each face whose `facePartType(face.type)` isn't null resolves `resolveDoorStyle(room, settings, partType, cabinetFaceLevels(room, wall, run, item, getFaceNode(<the cabinet's face tree>, face.path)))`. The tree is the local `face` (`item?.face ?? defaultFace(...)`); name the mapped face something else. When `|thickness − teamDoorStyle(settings).thickness| > 1e-9` the face gets `thickness`; otherwise it's unchanged (no new key, so every existing layout test still matches). `wall` is already the run's side view there; keep it.
- `elevationParts.js`: `const thickness = face.thickness ?? settings.doorThickness;` and the two `settings.doorThickness` reads in the face loop use it. Euro: back = box front + bumper, front = back + thickness. Inset: front = the frame's front, back = front − thickness.
- `planPieces.js` `planFaces`: `front: back + (face.thickness ?? settings.doorThickness)`.
- Imports: `getFaceNode` (`./faceTree.js`), `cabinetFaceLevels`, `facePartType`, `resolveDoorStyle` (`./doorStyleResolve.js`), `teamDoorStyle` (`./doorStyles.js`). Check there's no import cycle (`faceTree.js` imports only `faces.js`).

**Don't touch:** the frame, filler, panel and box lines in either file, `cabinetFaces` in `faces.js`, `runScene.js`, other tests. Resolver warnings aren't shown yet (46.2).

**Append to `doorThickness.test.js`**, verbatim (add `resolveWall` to the `../room.js` import, and import `runScene` from `../runScene.js` and `planRunPieces` from `../planPieces.js`):

```js

describe('SPEC-46 each face at its own thickness: backs line up, fronts move', () => {
  const G1_BASE_FACES = [
    `${CAB_24}:r`, `${CAB_36}:rleft`, `${CAB_36}:rright`,
    '0624c9d5-b951-4191-95f2-1562a6b32343:rleft', '0624c9d5-b951-4191-95f2-1562a6b32343:rright',
    'e3bfb331-0a5d-4cf2-aaba-929c53ca8c54:rleft', 'e3bfb331-0a5d-4cf2-aaba-929c53ca8c54:rright',
  ];
  const faces = (room, runId) => elevationParts(room, room.walls[0], 'front', settings)
    .filter((part) => part.kind === 'face' && part.runId === runId)
    .map(({ id, back, front }) => [id, back, front]);
  const fillerFront = (room) => elevationParts(room, room.walls[0], 'front', settings)
    .find((part) => part.id === `${BASE}:right`).front;

  it('draws every face of a thicker run 1" thick off the same back (G1)', () => {
    const room = styled((r) => { runOf(r, BASE).doorStyleId = 'ds-thick'; });
    expect(faces(room, BASE)).toEqual(G1_BASE_FACES.map((id) => [id, 24.0625, 25.0625]));
  });

  it('draws only the thicker cabinet\'s face out front; the filler follows the thickest', () => {
    const room = styled((r) => { leafOf(runOf(r, BASE), CAB_24).doorStyleId = 'ds-thick'; });
    expect(faces(room, BASE)).toEqual(G1_BASE_FACES.map((id) => [id, 24.0625, id === `${CAB_24}:r` ? 25.0625 : 24.875]));
    expect(fillerFront(room)).toBe(25.0625);
  });

  it('lets one face pick a thinner style; the run\'s front stays at the thickest', () => {
    const room = styled((r) => {
      leafOf(runOf(r, BASE), CAB_36).face = { type: 'pair_door', size: null, styleId: 'ds-thin' };
    });
    expect(faces(room, BASE)).toEqual(G1_BASE_FACES.map((id) => [id, 24.0625, id.startsWith(CAB_36) ? 24.8125 : 24.875]));
    expect(fillerFront(room)).toBe(24.875);
  });

  it('sinks a thicker inset door into the frame: face flush with the frame, back deeper (G2)', () => {
    const room = styled((r) => { runOf(r, FF_BASE).doorStyleId = 'ds-thick'; }, 'G2 Face frame kitchen');
    expect(faces(room, FF_BASE)).toEqual([
      'b736ca24-6df8-41d5-88bc-416dbd85eab3:rleft', 'b736ca24-6df8-41d5-88bc-416dbd85eab3:rright',
      '50803545-180e-4af0-b612-1a8922d48d09:rleft', '50803545-180e-4af0-b612-1a8922d48d09:rright',
    ].map((id) => [id, 23.8125, 24.8125]));
    const frame = elevationParts(room, room.walls[0], 'front', settings)
      .find((part) => part.id === 'frame:b736ca24-6df8-41d5-88bc-416dbd85eab3');
    expect([frame.back, frame.front]).toEqual([24, 24.8125]);
  });

  it('draws plan faces at their own thickness too (G1)', () => {
    const room = styled((r) => { leafOf(runOf(r, BASE), CAB_24).doorStyleId = 'ds-thick'; });
    const view = resolveWall(room, room.walls[0], 'front');
    const run = view.runs.find((candidate) => candidate.id === BASE);
    const scene = runScene(room, view, run, settings);
    const plan = planRunPieces(room, view, run, settings, scene.result, scene.faceLayouts);
    const at = (key) => plan.faces.find((entry) => entry.key === key);
    expect([at(`${CAB_24}:r`).back, at(`${CAB_24}:r`).front]).toEqual([24.0625, 25.0625]);
    expect([at(`${CAB_36}:rleft`).back, at(`${CAB_36}:rleft`).front]).toEqual([24.0625, 24.875]);
    expect(at(`${BASE}:right`).front).toBe(25.0625);
  });
});
```

What the numbers are: the face ids and the today values (back 24 1/16, front 24 7/8 on G1's base; back 24, front 24 13/16 on G2's base faces and frame) are what the existing code gives for these rooms. A 1" face on G1 comes out to 25 1/16 from the same back; a 3/4" one to 24 13/16. G2's 1" inset doors keep their face at the frame's 24 13/16 and their back goes in to 23 13/16. ⚠ If the G2 frame part's back/front come out other than 24 / 24 13/16, report it rather than change the test.

**Count:** 1008 + 5 = **1013**. Gate: `npm test && npm run lint && npm run build`. Golden snapshot unchanged.

---

## End-to-end check (Kyle)

Nothing to see: no UI picks a style yet, and with no styles the app draws exactly as before.

- Open your own rooms: elevations, plan and DXF export unchanged.
- Settings → Door thickness still works (it's the team default style's thickness until 46.3).

**Known for now:**
- Styles can only be set by editing the saved JSON; 46.1 adds the Door styles section and pickers.
- The stacking check and `partSizes` aren't called yet; the canvas uses them in 46.2.
- `CellProperties`' depth placeholder for a flush panel still assumes the team thickness (46.1).
- Two designs only (5-piece square, Slab) until the library screen (46.3).
