# Round 46.3 — SPEC: the Library (door designs, team door style), retire `settings.doorThickness`

Steps 413–416, designer only, on branch `elevation-doors` (after step 412, 1079 tests). Geometry and the API don't change.
DOORS-PROFILES-PLAN §10 row 46.3 and §5 (where the tools live).

**Done when:**
- The app header has a **Library** link beside Projects and Elevation Lab. `/library` opens `/library/door-designs`.
- **Door designs** (`/library/door-designs`): the team's designs in a table (code, vendor, description, construction, rails, where used). New, Copy, Edit and Delete. The three built-in designs (5PC, Slab, Slab AM) can be renamed (code, vendor, description) but not deleted, and keep their construction and rails. A design used by a style can only be deleted by moving those styles to another design.
- **Team door style** (`/library/door-style`): the same fields as a room's door style tool (design, thickness, stiles/rails, panel, arch rise, short faces). Saving it changes every part that doesn't pick a style and re-syncs every room. New room styles start as a copy of it.
- `settings.doorThickness` is gone: the team style's thickness replaces it everywhere. An older saved document moves its door thickness into the team style when it loads. The Settings panel's *Door thickness* field is replaced by a link to the Library.
- Room door style tools and pickers list the team's designs (a design added in the Library can be picked in a room).

| Step | Repo | What | Tests after |
|---|---|---|---|
| **413** | designer | Shape: `settings.teamDoorStyle` + `settings.doorDesigns`, validation, load migration; `doorThickness` retired | 1079 → **1087** |
| **414** | designer | Designs come from settings; library edits in the store | **1095** |
| **415** | designer | UI: Library nav, layout, Door designs page | 1095 |
| **416** | designer | UI: Team door style page (shared style fields), Settings link | 1095 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Today's values come from running the existing code read-only (golden document loads and validates; `formatInches(0.8125)` is `13/16"`). If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got. Values marked ⚠ are the ones to report rather than change.

---

## §1 Decisions (Claude's defaults, 2026-10-08 — Kyle can overrule)

- **Where the library lives for now.** Supabase tables come in round 47.1 (plan §8). Until then the team library sits in the elevation **settings** — saved in localStorage with the drawings, like every other team setting today:
  - `settings.teamDoorStyle` — a complete door style (`isDoorStyle`), always `id: 'default'`, `label: 'Std'`.
  - `settings.doorDesigns` — the team's design catalog, seeded with today's `DOOR_DESIGNS`.
  `DEFAULT_SETTINGS.teamDoorStyle` is `DEFAULT_DOOR_STYLE` and `DEFAULT_SETTINGS.doorDesigns` is `DOOR_DESIGNS` (the same objects); `copySettings` deep-copies both so the store never shares them with the constants.
- **Retire `doorThickness`.** `teamDoorStyle(settings)` returns `settings?.teamDoorStyle ?? DEFAULT_DOOR_STYLE`. Every `settings.doorThickness` read becomes `teamDoorStyle(settings).thickness`. Loading a document without `teamDoorStyle` builds it from `DEFAULT_DOOR_STYLE` with `thickness = settings.doorThickness` when that's a positive number (else 13/16"); `doorThickness` is always dropped on load. No schema version bump (fields added within schema 4, like earlier rounds).
- **A design** (`isDoorDesign`) has exactly: `id` (non-empty), `code` (non-empty, no leading/trailing spaces), `vendor` (`null` or non-empty with no leading/trailing spaces), `description` (string, may be empty), `construction` (`DOOR_CONSTRUCTIONS`), `topRail` / `bottomRail` (`{ shape }`, one of `RAIL_SHAPES`), `slots`.
- **Slots follow the construction** and aren't edited by hand: `DESIGN_SLOTS = { five_piece: ['outside','inside','panel','applied'], slab: ['outside'], slab_applied: ['outside','applied'] }`. A design's `slots` must equal its construction's list (same order). The store sets them on save.
- **A design list** (`isDoorDesignList`): an array of valid designs, ids unique, codes unique ignoring case, and the three seeded ids (`SEEDED_DESIGN_IDS = ['five-piece-square','slab','slab-applied']`) present with their seeded `construction`, `topRail.shape` and `bottomRail.shape`. Seeded designs can have their code, vendor and description changed (e.g. 5PC → "110", vendor Stillwater) but can't be deleted — the code falls back to them (missing designs, sheet slab panels).
- **Arched rails** (114, 115…) can be recorded now; they draw flat until round 51. The UI says so.
- **Deleting a used design** needs another design to move its styles to (team style and every room style that uses it). Unused designs delete straight away. Phases don't exist yet, so "used" = the team style + room styles.
- **New design / Copy**: a copy of the chosen design (New = copy of the first), new id, code `"<code> copy"`, then `"<code> copy 2"`, `"… copy 3"`… (first free, ignoring case).
- **Team style save**: the store forces `id: 'default'` and `label: 'Std'`; rejects a style that isn't valid or names a design not in `settings.doorDesigns`; re-syncs every room (thickness feeds `_doorThickness`, front planes, etc.).
- **Pickers name the team style's own design** (today `pickOptions` always shows 5PC for the team row — wrong once the team style can be a slab).
- **Routes**: `/library` (layout with a sub-nav) → index redirects to `door-designs`; `door-designs`; `door-style`. Files under `src/library/`. Profiles (`/library/profiles`) come in round 47.
- **Not in 46.3:** Supabase, phases, starring room styles to the team, vendors table, profile slots, arched drawing.

---

## §2 Step 413 — shape: team style and designs in settings; `doorThickness` retired

No behavior change: thickness values are the same everywhere.

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorStyles.js` | 173 | `teamDoorStyle` reads `settings.teamDoorStyle` |
| NEW `src/elevation/model/doorDesigns.js` | — | `DESIGN_SLOTS`, `SEEDED_DESIGN_IDS`, `isDoorDesign`, `isDoorDesignList` |
| `src/elevation/model/constants.js` | 141 | line 41 |
| `src/elevation/store/slices/helpers.js` | 243 | `copySettings` (line 28) |
| `src/elevation/store/persistence.js` | 725 | `normalizeDocument` (line 517), `isSettings` (line 615) |
| `src/elevation/model/cells.js` | 360 | line 318 |
| `src/elevation/model/elevationParts.js` | 149 | line 127 |
| `src/elevation/model/planPieces.js` | 372 | line 93 |
| `src/elevation/model/corners.js` | 240 | line 27 |
| `src/elevation/components/SettingsPanel.jsx` | 224 | line 24 removed |
| 6 test files | — | one-line edits (below) |
| NEW `src/elevation/model/__tests__/doorDesigns.test.js` | — | 4 tests, verbatim |
| NEW `src/elevation/store/__tests__/teamLibrarySaves.test.js` | — | 4 tests, verbatim |

**The `doorThickness` fan-out (source, all of it):**

```
src/elevation/components/SettingsPanel.jsx:24:  ['doorThickness', 'Door thickness'],          → delete the line
src/elevation/model/constants.js:41:  doorThickness: 0.8125,                             → teamDoorStyle / doorDesigns (below)
src/elevation/model/cells.js:318:  ... doorThickness = settings.doorThickness) {       → = teamDoorStyle(settings).thickness
src/elevation/model/elevationParts.js:127:  face.thickness ?? settings.doorThickness;  → ?? teamDoorStyle(settings).thickness
src/elevation/model/planPieces.js:93:  back + (face.thickness ?? settings.doorThickness) → ?? teamDoorStyle(settings).thickness
src/elevation/model/corners.js:27:  run._doorThickness ?? settings.doorThickness;     → ?? teamDoorStyle(settings).thickness
src/elevation/model/doorStyles.js:60:  settings?.doorThickness ?? ...                   → teamDoorStyle rewritten
```
Leave alone: every `_doorThickness` (roomSync.js 111–116, persistence.js 678/683) — that's the derived run field, not the setting. `cells.js`, `elevationParts.js`, `planPieces.js`, `corners.js` import `teamDoorStyle` from `./doorStyles.js` (doorStyles.js imports nothing, so no cycle).

**Contract.**
- `doorStyles.js`: `teamDoorStyle(settings)` → `settings?.teamDoorStyle ?? DEFAULT_DOOR_STYLE` (the object itself, not a copy). Doc: the team default style from the Library (SPEC-46.3).
- `constants.js`: `import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from './doorStyles.js';` and in `DEFAULT_SETTINGS` replace `doorThickness: 0.8125,` with `teamDoorStyle: DEFAULT_DOOR_STYLE,` and `doorDesigns: DOOR_DESIGNS,`. (`V2_NUMERIC_SETTING_KEYS` in persistence is derived from the numeric defaults, so it drops `doorThickness` by itself.)
- NEW `doorDesigns.js` (imports from `./doorStyles.js`):
  - `DESIGN_SLOTS`, `SEEDED_DESIGN_IDS` as §1.
  - `isDoorDesign(design)` — §1's rules; a plain object with exactly the seven keys; `slots` deep-equals `DESIGN_SLOTS[construction]`.
  - `isDoorDesignList(list)` — §1's rules; seeded ones compared with the matching `DOOR_DESIGNS` entry. `undefined` is **not** valid (settings always have it after load).
  - Follow the `hasKeys` / `isPlainObject` pattern in `doorStyles.js` (copy the two small helpers or export them from doorStyles.js — either is fine).
- `copySettings` (helpers.js): also `teamDoorStyle: structuredClone(settings.teamDoorStyle ?? DEFAULT_DOOR_STYLE)` and `doorDesigns: structuredClone(settings.doorDesigns ?? DOOR_DESIGNS)`.
- `persistence.js`:
  - `normalizeDocument`, inside the `settings` block after the V2 defaults: when `settings.teamDoorStyle === undefined` set it to `{ ...structuredClone(DEFAULT_DOOR_STYLE), thickness }` (`thickness` = `settings.doorThickness` when finite and > 0, else `DEFAULT_DOOR_STYLE.thickness`); when `settings.doorDesigns === undefined` set it to `structuredClone(DOOR_DESIGNS)`; then `delete settings.doorThickness` (always).
  - `isSettings`: also `isDoorStyle(settings.teamDoorStyle) && settings.teamDoorStyle.id === 'default' && isDoorDesignList(settings.doorDesigns) && findDoorDesign(settings.teamDoorStyle.designId, settings.doorDesigns) !== null`.
  - `toElevationDocument` unchanged (settings saved whole).

**Test edits (exact):**
- `model/__tests__/doorStyleResolve.test.js` line 41: `{ ...S, doorThickness: 1 }` → `{ ...S, teamDoorStyle: { ...S.teamDoorStyle, thickness: 1 } }`.
- `model/__tests__/doorStyles.test.js` line 46: title → `'takes the team default style from settings.teamDoorStyle (SPEC-46.3)'`; line 48 → `expect(teamDoorStyle({ ...DEFAULT_SETTINGS, teamDoorStyle: { ...DEFAULT_DOOR_STYLE, thickness: 1 } }).thickness).toBe(1);`.
- `model/__tests__/doorThickness.test.js` line 77: title → `'still takes the team default thickness from the team style'`; line 78 → `const thick = { ...settings, teamDoorStyle: { ...settings.teamDoorStyle, thickness: 1 } };`.
- `model/__tests__/partStyleEdits.test.js` line 82: `{ ...DEFAULT_SETTINGS, doorThickness: 1 }` → `{ ...DEFAULT_SETTINGS, teamDoorStyle: { ...DEFAULT_SETTINGS.teamDoorStyle, thickness: 1 } }`.
- `model/__tests__/teamDefaultPick.test.js` line 22: `{ ...S, doorThickness: 1 }` → `{ ...S, teamDoorStyle: { ...S.teamDoorStyle, thickness: 1 } }`.
- `store/__tests__/sliceDoorStyles.test.js` line 27: `thick.settings.doorThickness = 1;` → `thick.settings.teamDoorStyle = { ...thick.settings.teamDoorStyle, thickness: 1 };` (never mutate the shared object — it's `DEFAULT_DOOR_STYLE`).
- `model/__tests__/fixtures/golden.json` stays as it is (it still has `doorThickness`; it now tests the migration).

**NEW `src/elevation/model/__tests__/doorDesigns.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DESIGN_SLOTS, SEEDED_DESIGN_IDS, isDoorDesign, isDoorDesignList } from '../doorDesigns.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS, teamDoorStyle } from '../doorStyles.js';

const ARCHED = {
  id: 'd-114',
  code: '114',
  vendor: 'Stillwater',
  description: 'Arched top rail',
  construction: 'five_piece',
  topRail: { shape: 'arch' },
  bottomRail: { shape: 'flat' },
  slots: ['outside', 'inside', 'panel', 'applied'],
};
const withDesign = (id, patch) => DOOR_DESIGNS.map((design) => (design.id === id ? { ...design, ...patch } : design));

describe('SPEC-46.3 the team\'s door designs and default door style live in settings', () => {
  it('starts the settings with the seeded designs and the standard style, and no doorThickness', () => {
    expect(DEFAULT_SETTINGS.doorDesigns).toBe(DOOR_DESIGNS);
    expect(DEFAULT_SETTINGS.teamDoorStyle).toBe(DEFAULT_DOOR_STYLE);
    expect('doorThickness' in DEFAULT_SETTINGS).toBe(false);
    expect(SEEDED_DESIGN_IDS).toEqual(['five-piece-square', 'slab', 'slab-applied']);
    expect(DESIGN_SLOTS).toEqual({
      five_piece: ['outside', 'inside', 'panel', 'applied'],
      slab: ['outside'],
      slab_applied: ['outside', 'applied'],
    });
    expect([DOOR_DESIGNS.every((design) => isDoorDesign(design)), isDoorDesignList(DOOR_DESIGNS)]).toEqual([true, true]);
  });

  it('reads the team default style from settings', () => {
    const thick = { ...DEFAULT_DOOR_STYLE, thickness: 1 };
    expect([teamDoorStyle({ teamDoorStyle: thick }), teamDoorStyle({}), teamDoorStyle(undefined)])
      .toEqual([thick, DEFAULT_DOOR_STYLE, DEFAULT_DOOR_STYLE]);
    expect(teamDoorStyle({ teamDoorStyle: thick })).toBe(thick);
  });

  it('accepts a design with a code, an optional vendor, its construction\'s slots and known rail shapes', () => {
    expect([
      isDoorDesign(ARCHED),
      isDoorDesign({ ...ARCHED, vendor: null, description: '' }),
      isDoorDesign({ ...ARCHED, construction: 'slab_applied', slots: ['outside', 'applied'] }),
      isDoorDesign({ ...ARCHED, code: '' }),
      isDoorDesign({ ...ARCHED, code: ' 114' }),
      isDoorDesign({ ...ARCHED, vendor: '' }),
      isDoorDesign({ ...ARCHED, vendor: 'Stillwater ' }),
      isDoorDesign({ ...ARCHED, description: null }),
      isDoorDesign({ ...ARCHED, construction: 'glass' }),
      isDoorDesign({ ...ARCHED, topRail: { shape: 'round' } }),
      isDoorDesign({ ...ARCHED, bottomRail: {} }),
      isDoorDesign({ ...ARCHED, slots: ['outside'] }),
      isDoorDesign({ ...ARCHED, color: 'red' }),
      isDoorDesign({ ...ARCHED, id: '' }),
      isDoorDesign(null),
    ]).toEqual([true, true, true, false, false, false, false, false, false, false, false, false, false, false, false]);
  });

  it('accepts a list with unique ids and codes that keeps the seeded designs\' construction and rails', () => {
    expect([
      isDoorDesignList([...DOOR_DESIGNS, ARCHED]),
      isDoorDesignList(withDesign('slab', { code: 'SL', vendor: 'Shop', description: 'Flat slab' })),
      isDoorDesignList(DOOR_DESIGNS.slice(1)),
      isDoorDesignList([...DOOR_DESIGNS, { ...ARCHED, id: 'slab' }]),
      isDoorDesignList([...DOOR_DESIGNS, { ...ARCHED, code: 'slab' }]),
      isDoorDesignList(withDesign('slab', { construction: 'five_piece', slots: DESIGN_SLOTS.five_piece })),
      isDoorDesignList(withDesign('five-piece-square', { topRail: { shape: 'arch' } })),
      isDoorDesignList(undefined),
      isDoorDesignList({}),
    ]).toEqual([true, true, false, false, false, false, false, false, false]);
  });
});
```

**NEW `src/elevation/store/__tests__/teamLibrarySaves.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import { isElevationDocument, normalizeElevationDocument } from '../persistence.js';
import { copySettings } from '../slices/helpers.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const ARCHED = {
  id: 'd-114',
  code: '114',
  vendor: 'Stillwater',
  description: 'Arched top rail',
  construction: 'five_piece',
  topRail: { shape: 'arch' },
  bottomRail: { shape: 'flat' },
  slots: ['outside', 'inside', 'panel', 'applied'],
};

/** The golden document as saved before 46.3: `doorThickness` in settings (or none), no library. */
function older(doorThickness) {
  const document = structuredClone(golden);
  delete document.settings.teamDoorStyle;
  delete document.settings.doorDesigns;
  if (doorThickness === undefined) delete document.settings.doorThickness;
  else document.settings.doorThickness = doorThickness;
  return document;
}

describe('SPEC-46.3 saving the team library in settings', () => {
  it('moves an older document\'s door thickness into the team default style and seeds the designs', () => {
    const loaded = normalizeElevationDocument(older(1));
    expect(loaded.settings.teamDoorStyle).toEqual({ ...DEFAULT_DOOR_STYLE, thickness: 1 });
    expect(loaded.settings.doorDesigns).toEqual(DOOR_DESIGNS);
    expect(loaded.settings.doorDesigns).not.toBe(DOOR_DESIGNS);
    expect('doorThickness' in loaded.settings).toBe(false);
    expect(isElevationDocument(loaded)).toBe(true);
    expect([
      normalizeElevationDocument(older(undefined)).settings.teamDoorStyle,
      normalizeElevationDocument(older('thick')).settings.teamDoorStyle,
    ]).toEqual([DEFAULT_DOOR_STYLE, DEFAULT_DOOR_STYLE]);
  });

  it('keeps a saved library and drops a stray doorThickness', () => {
    const saved = older(1);
    saved.settings.teamDoorStyle = { ...DEFAULT_DOOR_STYLE, thickness: 0.75, designId: 'd-114' };
    saved.settings.doorDesigns = [...DOOR_DESIGNS, ARCHED];
    const loaded = normalizeElevationDocument(saved);
    expect([loaded.settings.teamDoorStyle.thickness, loaded.settings.doorDesigns.length, 'doorThickness' in loaded.settings])
      .toEqual([0.75, 4, false]);
    expect(isElevationDocument(loaded)).toBe(true);
  });

  it('rejects a broken team style or design list', () => {
    const valid = (patch) => {
      const loaded = normalizeElevationDocument(older(undefined));
      Object.assign(loaded.settings, patch);
      return isElevationDocument(loaded);
    };
    expect([
      valid({}),
      valid({ teamDoorStyle: { ...DEFAULT_DOOR_STYLE, id: 'ds-a' } }),
      valid({ teamDoorStyle: { ...DEFAULT_DOOR_STYLE, thickness: 0 } }),
      valid({ teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'gone' } }),
      valid({ doorDesigns: DOOR_DESIGNS.slice(1) }),
      valid({ doorDesigns: [...DOOR_DESIGNS, { ...ARCHED, code: '5pc' }] }),
    ]).toEqual([true, false, false, false, false, false]);
  });

  it('copies the library into the state so it never shares objects with the defaults', () => {
    const copy = copySettings(DEFAULT_SETTINGS);
    expect([copy.teamDoorStyle, copy.doorDesigns]).toEqual([DEFAULT_DOOR_STYLE, DOOR_DESIGNS]);
    expect([
      copy.teamDoorStyle === DEFAULT_DOOR_STYLE,
      copy.teamDoorStyle.stiles === DEFAULT_DOOR_STYLE.stiles,
      copy.doorDesigns === DOOR_DESIGNS,
      copy.doorDesigns[0].topRail === DOOR_DESIGNS[0].topRail,
    ]).toEqual([false, false, false, false]);
  });
});
```

**Don't touch:** every `_doorThickness`, `roomSync.js`, `doorStyleResolve.js`, `doorStyleEdits.js` (step 414), `golden.json`, the golden snapshot (must not change), other components.

**Count:** 1079 + 8 = **1087**. Golden snapshot unchanged. ⚠ If an existing persistence test fails only because a loaded document's settings now hold `teamDoorStyle` / `doorDesigns` instead of `doorThickness`, report it — don't edit it.

---

## §3 Step 414 — designs come from settings; editing the library in the store

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorDesigns.js` | (413) | `newDoorDesign`, `doorDesignUses` |
| `src/elevation/model/doorStyleResolve.js` | 118 | line 41 default `designs` |
| `src/elevation/model/doorStyleEdits.js` | 188 | `pickOptions` (lines 133–157) |
| NEW `src/elevation/store/slices/doorDesigns.js` | — | four reducers |
| `src/elevation/store/elevationSlice.js` | 183 | register + export the actions |
| NEW `src/elevation/model/__tests__/doorDesignEdits.test.js` | — | 4 tests, verbatim |
| NEW `src/elevation/store/__tests__/sliceDoorDesigns.test.js` | — | 4 tests, verbatim |

**Contract.**
- `doorDesigns.js`:
  - `newDoorDesign(designs, base, id)` → a deep copy of `base` with `id` and `code` = the first of `"<base.code> copy"`, `"<base.code> copy 2"`, `"… copy 3"`… not used in `designs` (compared ignoring case). Follows `newDoorStyle` in doorStyleEdits.js.
  - `doorDesignUses(settings, rooms, designId)` → `[{ level: 'team' }]` when `teamDoorStyle(settings).designId === designId`, then for each room in order, each of its `doorStyles` in order with that `designId`: `{ level: 'room', roomId, styleId, label }`. Empty list when unused.
- `doorStyleResolve.js` line 41: `designs = settings?.doorDesigns ?? DOOR_DESIGNS` (a default param can read `settings`). No call site changes — every caller already passes `settings`.
- `doorStyleEdits.js` `pickOptions`: `designs = settings?.doorDesigns ?? DOOR_DESIGNS`; the team row uses the team style's own design, `findDoorDesign(team.designId, designs) ?? findDoorDesign(DEFAULT_DESIGN_ID, designs)`; room rows `findDoorDesign(entry.designId, designs) ?? findDoorDesign(DEFAULT_DESIGN_ID, designs)`.
- NEW `store/slices/doorDesigns.js`, `export const doorDesignReducers` (pattern: `store/slices/doorStyles.js`; `syncRoomAt` from `./helpers.js`; use `current()` when reading the list to validate). Every reducer leaves the state untouched (returns before writing) when it rejects. "Re-sync every room" = `for (let index = 0; index < state.rooms.length; index += 1) syncRoomAt(state, index);` (as `updateSettings` in ui.js).
  - `addDoorDesign` — `{ reducer, prepare }` like `addDoorStyle`; payload `{ baseId?, id }`, `prepare(payload = {})` fills `id` with `uuid()`. Base = the design with `baseId`, or the list's first when `baseId` is absent/null; unknown → reject. Appends `newDoorDesign(list, base, id)`. No sync.
  - `updateDoorDesign({ designId, design })` — next = `{ ...design, id: designId, slots: DESIGN_SLOTS[design.construction] }`; reject when `designId` isn't in the list or the list with `next` in its place fails `isDoorDesignList`. Replace, re-sync every room.
  - `deleteDoorDesign({ designId, reassignTo })` — reject a seeded or unknown id. `uses = doorDesignUses(settings, rooms, designId)`; when used, `reassignTo` must be another id in the list (not `designId`), else reject; set `designId = reassignTo` on `settings.teamDoorStyle` (if it used it) and on every room style that used it. Remove the design, re-sync every room.
  - `setTeamDoorStyle({ style })` — next = `{ ...structuredClone(style), id: 'default', label: 'Std' }`; reject unless `isDoorStyle(next)` and `findDoorDesign(next.designId, settings.doorDesigns)`. Set `settings.teamDoorStyle = next`, re-sync every room.
- `elevationSlice.js`: import `doorDesignReducers` from `./slices/doorDesigns.js`, spread it into `reducers` next to `doorStyleReducers`, export `addDoorDesign, updateDoorDesign, deleteDoorDesign, setTeamDoorStyle` with the other actions.

**NEW `src/elevation/model/__tests__/doorDesignEdits.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { doorDesignUses, newDoorDesign } from '../doorDesigns.js';
import { pickOptions } from '../doorStyleEdits.js';
import { resolveDoorStyle } from '../doorStyleResolve.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';

const S = DEFAULT_SETTINGS;
const ARCHED = {
  id: 'd-114',
  code: '114',
  vendor: 'Stillwater',
  description: 'Arched top rail',
  construction: 'five_piece',
  topRail: { shape: 'arch' },
  bottomRail: { shape: 'flat' },
  slots: ['outside', 'inside', 'panel', 'applied'],
};
const WITH_114 = { ...S, doorDesigns: [...DOOR_DESIGNS, ARCHED] };
const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A', designId: 'd-114' };
const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', designId: 'slab' };
const C = { ...A, id: 'ds-c', label: 'C' };

describe('SPEC-46.3 door designs from the team library', () => {
  it('copies a design with a fresh id and the next free code', () => {
    expect(newDoorDesign(DOOR_DESIGNS, DOOR_DESIGNS[0], 'd-1')).toEqual({ ...DOOR_DESIGNS[0], id: 'd-1', code: '5PC copy' });
    const copied = [
      ...DOOR_DESIGNS,
      { ...DOOR_DESIGNS[0], id: 'd-1', code: '5PC copy' },
      { ...DOOR_DESIGNS[0], id: 'd-2', code: '5pc COPY 2' },
    ];
    expect(newDoorDesign(copied, DOOR_DESIGNS[0], 'd-3').code).toBe('5PC copy 3');
    const copy = newDoorDesign(DOOR_DESIGNS, ARCHED, 'd-4');
    expect([copy.code, copy.topRail, copy.topRail === ARCHED.topRail]).toEqual(['114 copy', { shape: 'arch' }, false]);
  });

  it('lists where a design is used: the team default first, then each room\'s styles', () => {
    const rooms = [{ id: 'r1', doorStyles: [A, B] }, { id: 'r2' }, { id: 'r3', doorStyles: [C] }];
    expect(doorDesignUses(WITH_114, rooms, 'd-114')).toEqual([
      { level: 'room', roomId: 'r1', styleId: 'ds-a', label: 'A' },
      { level: 'room', roomId: 'r3', styleId: 'ds-c', label: 'C' },
    ]);
    const slabTeam = { ...WITH_114, teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'slab' } };
    expect(doorDesignUses(slabTeam, rooms, 'slab')).toEqual([
      { level: 'team' },
      { level: 'room', roomId: 'r1', styleId: 'ds-b', label: 'B' },
    ]);
    expect(doorDesignUses(S, rooms, 'five-piece-square')).toEqual([{ level: 'team' }]);
    expect(doorDesignUses(S, rooms, 'slab-applied')).toEqual([]);
  });

  it('resolves a style\'s design from the team\'s designs', () => {
    const levels = [{ level: 'room', node: { doorStyleId: 'ds-a' } }];
    expect(resolveDoorStyle({ doorStyles: [A] }, WITH_114, 'door', levels).design).toBe(ARCHED);
    const missing = resolveDoorStyle({ doorStyles: [A] }, S, 'door', levels);
    expect([missing.design.id, missing.warnings]).toEqual(['five-piece-square', [{ code: 'door-design-missing', id: 'd-114' }]]);
    const team = resolveDoorStyle({}, { ...WITH_114, teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'd-114' } }, 'door', []);
    expect([team.style.id, team.design.code, team.source]).toEqual(['default', '114', { level: 'team', key: null }]);
  });

  it('names the team default\'s own design in the style pickers', () => {
    const settings = { ...WITH_114, teamDoorStyle: { ...DEFAULT_DOOR_STYLE, designId: 'd-114', thickness: 1 } };
    expect(pickOptions({ doorStyles: [A, B] }, settings, 'door', [])).toEqual({
      inherit: { id: 'default', text: 'Inherit (Std · 114 · 1")' },
      options: [
        { id: 'default', text: 'Team default (Std · 114 · 1")' },
        { id: 'ds-a', text: 'A · 114 · 13/16"' },
        { id: 'ds-b', text: 'B · Slab · 13/16"' },
      ],
    });
  });
});
```

**NEW `src/elevation/store/__tests__/sliceDoorDesigns.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import elevationReducer, {
  addDoorDesign, addDoorStyle, deleteDoorDesign, setTeamDoorStyle, updateDoorDesign, updateDoorStyle,
} from '../elevationSlice.js';
import { auto, currentRun, run, stateWithRun } from './helpers/sliceFixtures.js';

const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const designs = (state) => state.settings.doorDesigns.map(({ id, code }) => [id, code]);
const SEEDED = [['five-piece-square', '5PC'], ['slab', 'Slab'], ['slab-applied', 'Slab AM']];
const ARCHED = {
  id: 'ignored',
  code: '114',
  vendor: 'Stillwater',
  description: 'Arched top rail',
  construction: 'five_piece',
  topRail: { shape: 'arch' },
  bottomRail: { shape: 'flat' },
  slots: [],
};

/** A base run with one cabinet; `doorStyleId` is the room's pick (it may name a style added later). */
function base(doorStyleId) {
  const state = stateWithRun(run({ autoCount: false, items: [auto('c1')] }));
  if (doorStyleId) state.rooms[0].doorStyleId = doorStyleId;
  return state;
}

describe('SPEC-46.3 editing the team library', () => {
  it('adds a copy of a design, or of the first, with the next free code', () => {
    const state = apply(base(), addDoorDesign({ id: 'd-1' }), addDoorDesign({ id: 'd-2', baseId: 'slab' }));
    expect(designs(state)).toEqual([...SEEDED, ['d-1', '5PC copy'], ['d-2', 'Slab copy']]);
    expect(apply(state, addDoorDesign({ id: 'd-3', baseId: 'gone' }))).toBe(state);
    expect(addDoorDesign().payload.id).toEqual(expect.any(String));
    expect(DOOR_DESIGNS).toHaveLength(3);
  });

  it('saves an edited design with its construction\'s slots; a seeded design keeps its construction and rails', () => {
    const state = apply(base(), addDoorDesign({ id: 'd-1' }));
    const saved = apply(state, updateDoorDesign({ designId: 'd-1', design: ARCHED }));
    expect(saved.settings.doorDesigns[3]).toEqual({ ...ARCHED, id: 'd-1', slots: ['outside', 'inside', 'panel', 'applied'] });
    const applied = apply(saved, updateDoorDesign({ designId: 'd-1', design: { ...ARCHED, construction: 'slab_applied' } }));
    expect(applied.settings.doorDesigns[3].slots).toEqual(['outside', 'applied']);
    const renamed = apply(state, updateDoorDesign({ designId: 'slab', design: { ...DOOR_DESIGNS[1], code: 'SL', vendor: 'Shop' } }));
    expect(renamed.settings.doorDesigns[1]).toEqual({ ...DOOR_DESIGNS[1], code: 'SL', vendor: 'Shop' });
    expect([
      apply(state, updateDoorDesign({ designId: 'slab', design: { ...DOOR_DESIGNS[1], construction: 'five_piece' } })),
      apply(state, updateDoorDesign({ designId: 'five-piece-square', design: { ...DOOR_DESIGNS[0], topRail: { shape: 'arch' } } })),
      apply(state, updateDoorDesign({ designId: 'd-1', design: { ...ARCHED, code: 'slab' } })),
      apply(state, updateDoorDesign({ designId: 'd-1', design: { ...ARCHED, code: '' } })),
      apply(state, updateDoorDesign({ designId: 'gone', design: ARCHED })),
    ].every((next) => next === state)).toBe(true);
  });

  it('saves the team default style as "default" / Std and re-syncs every room', () => {
    const picked = apply(base('ds-1'), addDoorStyle({ id: 'ds-1' }));
    const thick = apply(picked, setTeamDoorStyle({ style: { ...DEFAULT_DOOR_STYLE, id: 'x', label: 'Z', thickness: 1 } }));
    expect(thick.settings.teamDoorStyle).toEqual({ ...DEFAULT_DOOR_STYLE, thickness: 1 });
    expect(currentRun(thick)._doorThickness).toBe(0.8125);
    expect(apply(thick, addDoorStyle({ id: 'ds-2' })).rooms[0].doorStyles[1].thickness).toBe(1);
    expect([
      apply(picked, setTeamDoorStyle({ style: { ...DEFAULT_DOOR_STYLE, thickness: 0 } })),
      apply(picked, setTeamDoorStyle({ style: { ...DEFAULT_DOOR_STYLE, designId: 'gone' } })),
    ].every((next) => next === picked)).toBe(true);
    expect(DEFAULT_DOOR_STYLE.thickness).toBe(0.8125);
  });

  it('deletes an unused design; a used one moves its styles to another design first', () => {
    const state = apply(base(), addDoorDesign({ id: 'd-1' }), addDoorStyle({ id: 'ds-1' }));
    const used = apply(
      state,
      updateDoorStyle({ styleId: 'ds-1', style: { ...state.rooms[0].doorStyles[0], designId: 'd-1' } }),
      setTeamDoorStyle({ style: { ...DEFAULT_DOOR_STYLE, designId: 'd-1' } }),
    );
    expect([used.settings.teamDoorStyle.designId, used.rooms[0].doorStyles[0].designId]).toEqual(['d-1', 'd-1']);
    expect([
      apply(used, deleteDoorDesign({ designId: 'd-1' })),
      apply(used, deleteDoorDesign({ designId: 'd-1', reassignTo: 'd-1' })),
      apply(used, deleteDoorDesign({ designId: 'd-1', reassignTo: 'gone' })),
    ].every((next) => next === used)).toBe(true);
    const moved = apply(used, deleteDoorDesign({ designId: 'd-1', reassignTo: 'slab' }));
    expect([designs(moved), moved.settings.teamDoorStyle.designId, moved.rooms[0].doorStyles[0].designId])
      .toEqual([SEEDED, 'slab', 'slab']);
    expect(designs(apply(state, deleteDoorDesign({ designId: 'd-1' })))).toEqual(SEEDED);
    expect(apply(state, deleteDoorDesign({ designId: 'slab', reassignTo: 'five-piece-square' }))).toBe(state);
  });
});
```

What the numbers are: the room picks ds-1, a copy of the team style made at 13/16"; the team style then goes to 1", so the run's faces (13/16") differ from the team's and the run gets `_doorThickness` 13/16. A style added after that copies 1". ⚠ If `_doorThickness` comes out missing, report it rather than change the test.

**Don't touch:** `doorStyles.js`, `persistence.js`, `slices/doorStyles.js`, the components, other tests.

**Count:** 1087 + 8 = **1095**. Golden snapshot unchanged.

---

## §4 Step 415 — UI: Library nav, layout, Door designs page

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/App.jsx` | 60 | `/library` routes |
| `src/components/layout/AppShell.jsx` | 58 | **Library** NavLink after Elevation Lab |
| NEW `src/library/LibraryLayout.jsx` | — | sub-nav + `<Outlet />` |
| NEW `src/library/DoorDesignsPage.jsx` | — | the table and actions |
| NEW `src/library/DoorDesignEditor.jsx` | — | the edit dialog |

**Contract.**
- `App.jsx`: a nested route, before the `*` route:
  `<Route path="/library" element={<LibraryLayout />}>` with `<Route index element={<Navigate to="door-designs" replace />} />` and `<Route path="door-designs" element={<DoorDesignsPage />} />`.
- `AppShell.jsx`: a third `NavLink` to `/library` (no `end`, so it stays active on sub-pages), label *Library*, same classes as the other two.
- `LibraryLayout`: `flex h-full min-h-0`; left `aside` `w-56 shrink-0 border-r border-gray-700 bg-gray-800/60 p-4` with the small blue *Library* heading (same classes as ElevationLab's *Elevation Lab* label) and a vertical list of NavLinks (*Door designs* → `door-designs`; step 416 adds *Team door style*); right `main` `min-w-0 flex-1 overflow-y-auto p-6` with `<Outlet />`.
- `DoorDesignsPage` (reads `settings` and `rooms` from `state.elevation`):
  - Heading *Door designs*; line under it: *How doors are built — your vendor's codes. Each room's door styles pick one.*
  - *New design* button: `const action = addDoorDesign(); dispatch(action);` then open the editor on `action.payload.id`.
  - A table, one row per design in list order: **Code** (with a small grey *built-in* tag on seeded ids), **Vendor** (— when null), **Description**, **Construction** (*5-piece*, *Slab*, *Slab + applied molding*), **Rails** (`Flat` when both flat, else e.g. `Arch top / flat bottom`), **Used by** (from `doorDesignUses`: *Team default* and `<room name> <label>`, comma-separated; — when unused), and actions **Edit**, **Copy** (`addDoorDesign({ baseId })`), **Delete** (not on seeded rows).
  - Delete: unused → dispatch `deleteDoorDesign({ designId })`. Used → the row shows *Used by N style(s). Move them to:* a select of the other designs (default the first other one) and a *Delete* button that dispatches with `reassignTo`; *Cancel* closes it. No browser `confirm()`.
  - Note under the table (text-xs text-gray-500): *Arched rails are recorded now and drawn flat until arched rails are added. Profile slots follow the construction. The library is saved in this browser with the Elevation Lab drawings until it moves to the team's account.*
- `DoorDesignEditor({ design, designs, onClose })`: a dialog following `DoorStyleEditor`'s pattern (overlay, `role="dialog"`, focus the first input, Escape closes, Tab trap — lines 49–86 of DoorStyleEditor.jsx; same input/button classes).
  - Fields: *Code* (required), *Vendor* (optional), *Description*, *Construction* select (the three constructions with the labels above), *Top rail* and *Bottom rail* selects (`RAIL_SHAPES`: Flat, Arch, Cathedral, Eyebrow). Construction and both rail selects are disabled on seeded designs, with *Built-in design: only the code, vendor and description can change.* Under the rails, when either isn't flat: *Drawn flat until arched rails are added.* Read-only line: *Profile slots: outside, inside, panel, applied* (from `DESIGN_SLOTS` for the chosen construction).
  - Save builds `{ ...draft, code: code.trim(), vendor: vendor.trim() || null, description: description.trim(), slots: DESIGN_SLOTS[construction] }`. Disabled with a red reason when the code is empty (*Code is required*), another design has the same code ignoring case (*Code already used*), or `isDoorDesignList` of the list with this design swapped in fails (*Not a valid design*). Save dispatches `updateDoorDesign({ designId, design })` and closes.

**Don't touch:** the model, the store, ElevationLab, other components. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1095 tests.

---

## §5 Step 416 — UI: Team door style page; shared style fields; Settings link

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/DoorStyleEditor.jsx` | 237 | fields moved out (by script) |
| NEW `src/elevation/components/DoorStyleFields.jsx` | — | the moved fields |
| `src/elevation/components/RoomDoorStylesPanel.jsx` | 176 | line 57 |
| NEW `src/library/TeamDoorStylePage.jsx` | — | the page |
| `src/library/LibraryLayout.jsx` | (415) | second NavLink |
| `src/App.jsx` | (415) | `door-style` route |
| `src/elevation/components/SettingsPanel.jsx` | (413) | Library link |

**Contract.**
- Move by script (rule 9), don't retype: from `DoorStyleEditor.jsx` cut `SizeField` (lines 11–29) and the fields from the *Design* label through the *Profiles* section (lines 118–216) into NEW `DoorStyleFields.jsx`, which exports `default function DoorStyleFields({ draft, setDraft, designs })` and copies the `INPUT_CLASS` / `HEADING_CLASS` constants. Inside it, `design = findDoorDesign(draft.designId, designs)`, `slab` / `fivePiece` / `applied` / `arched`, `change` and `changeSize` move with the fields (lines 36–40, 44–48). The Design select maps `designs` (not `DOOR_DESIGNS`). The arch rise note *For arched designs (46.3)* becomes *Drawn flat until arched rails are added*.
- `DoorStyleEditor`: keeps Label, Name, the reason line and the buttons; renders `<DoorStyleFields draft={draft} setDraft={setDraft} designs={settings.doorDesigns} />` with `settings` from `useSelector((state) => state.elevation.settings)`; keeps a small `change` for the label. Remove imports it no longer uses.
- `RoomDoorStylesPanel` line 57: `findDoorDesign(style.designId, settings.doorDesigns)`.
- `TeamDoorStylePage` (route `door-style`): reads `settings`; an inner component keyed on `JSON.stringify(settings.teamDoorStyle)` holds `draft = structuredClone(settings.teamDoorStyle)` (pattern: `RoomDoorStylesContent` keyed by room).
  - Heading *Team door style*; line: *Every door, drawer front and panel that doesn't pick a style uses this (shown as Std). New room styles start as a copy of it.*
  - `<DoorStyleFields draft setDraft designs={settings.doorDesigns} />` in a `max-w-xl` column.
  - Buttons: **Save** (disabled when `!isDoorStyle(draft)` — reason *Every size must be more than 0* — or the draft equals the saved style) → `setTeamDoorStyle({ style: draft })`; **Revert** (back to the saved style); **Standard** (draft = `structuredClone(DEFAULT_DOOR_STYLE)`, not saved until Save).
- `LibraryLayout`: second NavLink *Team door style* → `door-style`. `App.jsx`: `<Route path="door-style" element={<TeamDoorStylePage />} />`.
- `SettingsPanel`: right after the block that renders `NUMBER_SETTINGS`, a line (text-xs text-gray-500): *Door thickness is on the team door style —* `<Link to="/library/door-style">Library</Link>` (react-router `Link`, `text-blue-400 hover:underline`).

**Don't touch:** the model, the store, other components. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1095 tests.

---

## End-to-end check (Kyle)

- Header → **Library** → Door designs: 5PC, Slab, Slab AM marked built-in, 5PC *Used by: Team default* (plus any room styles).
- Edit 5PC: change code to `110`, vendor `Stillwater` → construction and rails are locked; save → room style pickers now read `A · 110 · 13/16"`.
- New design → `5PC copy`; edit to code `114`, Top rail Arch → note says drawn flat. In a room's door style tool, the Design list includes 114.
- Delete 114 while a room style uses it → asks where to move the style; pick 110 → gone, the style shows 110.
- Library → Team door style: set thickness 1", Save → doors that don't pick a style get thicker in plan / toe kick moves with the face; a new room style starts at 1".
- Settings panel: no *Door thickness* field, a link to the Library instead.
- Reload: the library and team style are still there. An older saved drawing loads with its door thickness carried into the team style.

**Known for now:**
- The library is per browser (localStorage), not per team, until the Supabase round.
- Arched rails are recorded but drawn flat.
