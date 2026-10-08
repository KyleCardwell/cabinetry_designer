# Round 47 — SPEC: the profile model and the Profiles list (no Supabase)

Steps 424–428, designer only, on branch `elevation-doors` (after step 423, 1106 tests). Geometry and the API don't change.
DOORS-PROFILES-PLAN §2 (profile geometry), §5 (where the tools live), §10 row 47. P18 in the plan (2026-10-08) moves Supabase out of the door rounds.

**Done when:**
- The team's profiles live in `settings.sectionProfiles`, saved in this browser with the Elevation Lab drawings, like the door designs (SPEC-46.3). An older saved document loads with an empty list.
- A profile has a name, tags, 2D geometry (named points, loops of lines and arcs), named attach points, drawn points per view, a version and an archived flag. The model validates all of it.
- Model helpers: bounds, an SVG thumbnail path, a new 3/4" square or a copy, where a profile is used (door style slots), slot fitting by attach points, filtering, tag options, and a profiles file for export/import.
- The Library has a **Profiles** page (`/library/profiles`): thumbnails, search, tag filter, show archived, New, Copy, Details (name and tags), Archive/Restore, Delete (only when unused), Export and Import.
- The shape itself can't be edited yet. That's the profile editor in round 48.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **424** | designer | Shape: `settings.sectionProfiles`, validation, load default | 1106 → **1113** |
| **425** | designer | Model helpers (bounds, SVG path, new/copy, uses, slots, filter, tags, file/merge) | **1120** |
| **426** | designer | Store: five profile reducers | **1124** |
| **427** | designer | UI: Profiles nav + list page (thumbnails, filters, New/Copy/Archive/Delete) | 1124 |
| **428** | designer | UI: Details dialog (name, tags), Export, Import | 1124 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Every expected value in the tests was worked out by hand from the rules below. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got.

---

## §1 Decisions (Claude's defaults, 2026-10-08 — Kyle can overrule)

- **No Supabase in the door rounds (P18).** Kyle hasn't used the door style tool or any profile yet, so the shapes may still change. Profiles live in `settings.sectionProfiles` in the Elevation Lab document (localStorage), exactly as `settings.doorDesigns` does. The tables, RLS and RPCs (old round 47.1) move to one later "designer goes to Supabase" step, together with rooms, phases and team settings.
- **Name in code: "section profile".** `profile` already means the *height* profile in this repo (`settings.defaultProfile`, `room.profile`, `resolveProfile` in `model/profile.js`). So the module is `model/sectionProfiles.js`, the settings key `sectionProfiles`, the functions `…SectionProfile…`. The UI just says **Profiles**.
- **No Zod.** The repo validates by hand (`isDoorStyle`, `isDoorDesign`). Follow that pattern. No new dependency.
- **App field names are camelCase** (`drawnPoints`). The plan's snake_case (`drawn_points`) is for the future SQL columns only.
- **A profile** (`isSectionProfile`) has exactly these keys:
  - `id` — non-empty string.
  - `name` — non-empty, no leading/trailing spaces. Names may repeat (pickers show thumbnails).
  - `tags` — array of unique tags. A tag is lowercase snake_case: `/^[a-z0-9]+(_[a-z0-9]+)*$/` (`isProfileTag`). Known tags (`PROFILE_TAG_LABELS`) get labels and come first in the filter. A team can add its own (e.g. `shop_bead`).
  - `geometry` — `{ units: 'in', points, loops }`, checked by `isProfileGeometry` (below).
  - `attach` — object; keys from `ATTACH_POINTS`; each value is a point id in `geometry.points`; may be `{}`. Two attach names may share a point.
  - `drawnPoints` — `{ elevation: [...], plan?: [...] }`; unique point ids that exist; may be empty. A missing `plan` means "same as elevation" (plan §2), used from round 50.
  - `version` — integer ≥ 1.
  - `archived` — boolean.
- **Geometry rules** (`isProfileGeometry`):
  - `units === 'in'`; exactly the keys `units`, `points`, `loops`.
  - `points` — plain object with ≥ 2 entries; each key a non-empty string; each value `[x, y]`, two finite numbers. Points that no segment uses are fine (reference points).
  - `loops` — ≥ 1; each exactly `{ id, closed, segs }`; ids non-empty and unique; `closed` boolean; `segs` ≥ 1.
  - A segment is exactly `{ type: 'line', from, to }` or `{ type: 'arc', from, to, center: [x, y], ccw }` (`ccw` boolean: counter-clockwise with y up). `from` and `to` are point ids and differ.
  - An arc's radius is the distance from `center` to `from`. It must be more than 1/256", and the distance to `to` must match it within 1/256".
  - Segments chain: each segment's `from` is the previous one's `to`.
  - A closed loop ends at its first `from`, and has ≥ 3 segments, or ≥ 2 when one is an arc (an arc plus its chord is a shape; two lines aren't). An open loop must **not** end where it starts.
  - A full circle is two arcs (DXF import in round 49 splits CIRCLEs).
- **Coordinates** (plan §2, P10): door profiles: x is in from the reference edge, y is depth from the door's front face (0 = face, negative into the door, positive proud). Run moldings: x is projection out from the box, y is height. The model doesn't care which; only the editor and the drawing rounds do.
- **Attach points and slots (P3).** `ATTACH_POINTS = ['door_edge', 'frame_edge', 'panel_edge', 'apply_point', 'box_top', 'box_front', 'floor', 'edge_top', 'edge_face']`. A slot lists one or more options, and each option is a set of attach names. A profile fits when it has every name of at least one option (`profileFitsSlot`). Tags never decide fit. Slots are only defined and checked now. Nothing picks a profile until round 50.
  ```
  door_outside   [door_edge]
  door_inside    [frame_edge]
  door_panel     [panel_edge]
  door_applied   [frame_edge] or [panel_edge]     (5-piece applied molding)
  slab_applied   [apply_point]                    (P17)
  crown          [box_top, box_front]
  top_mold       [box_top, box_front]
  furniture_base [floor, box_front]
  toe_kick       [floor, box_front]
  nosing         [edge_top, edge_face]
  ```
- **Version (P7).** A save that changes `geometry`, `attach` or `drawnPoints` bumps `version` by 1. Name, tags and archived don't. "Changed" = `JSON.stringify` of `[geometry, attach, drawnPoints]` differs. Issued revisions will pin a version later; nothing reads it yet.
- **Archive, don't delete, when used (P7).** "Used" = a door style slot names the profile: the team style or any room style, in `DOOR_PROFILE_SLOTS` order (`outside`, `inside`, `panel`, `applied`). All slots are `null` until round 50, so for now everything can be deleted. Archived profiles stay in the list (hidden unless *Show archived*), still resolve for rooms, and won't be offered in pickers (round 50).
- **New profile** = a 3/4" × 3/4" square (points `p1 [0,0]`, `p2 [0.75,0]`, `p3 [0.75,-0.75]`, `p4 [0,-0.75]`, one closed loop `L1` of four lines), named `New profile`, then `New profile 2`, `3`, … (first free name, ignoring case). **Copy** = deep copy, new id, name `<name> copy`, then `<name> copy 2`, …, version 1, not archived.
- **Thumbnails are computed** from the geometry (`sectionProfileSvgPath`), not stored.
- **Profiles file** (export/import, also how Kyle backs up and moves profiles between browsers): `{ "kind": "section-profiles", "version": 1, "profiles": [...] }`. Import merges **by id**: an invalid entry is skipped; an id already in the list is replaced in place; a new id is appended. Within one file, a later entry with the same id replaces the earlier one. The test fixture `sectionProfiles.json` is itself a profiles file, so Kyle can import it to try the page.
- **No re-sync.** Profile edits don't change any drawing yet, so the reducers don't call `syncRoomAt`.
- **Not in 47:** the editor (48), drawn/attach point editing (48.1), DXF import (49), slot pickers in the door style tool and drawing with profiles (50), Supabase (later), checking that door style slots name existing profiles (50).

---

## §2 Step 424 — shape: `settings.sectionProfiles`, validation, load default

No behavior change. Nothing reads the list yet.

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/sectionProfiles.js` | — | `PROFILE_TAG_LABELS`, `ATTACH_POINTS`, `isProfileTag`, `isProfileGeometry`, `isSectionProfile`, `isSectionProfileList` |
| `src/elevation/model/constants.js` | 144 | `DEFAULT_SETTINGS`: `sectionProfiles: [],` after `doorDesigns` (line 44) |
| `src/elevation/store/slices/helpers.js` | 246 | `copySettings` (line 28) |
| `src/elevation/store/persistence.js` | 742 | import (line 8), `normalizeDocument` (line 536), `isSettings` (line 632) |
| NEW `src/elevation/model/__tests__/fixtures/sectionProfiles.json` | — | verbatim |
| NEW `src/elevation/model/__tests__/sectionProfiles.test.js` | — | 4 tests, verbatim |
| NEW `src/elevation/store/__tests__/sectionProfileSaves.test.js` | — | 3 tests, verbatim |

**Contract.**
- `sectionProfiles.js` imports nothing in this step (step 425 adds imports). Copy the small `isPlainObject` / `hasKeys` helpers from `doorDesigns.js` (same pattern).
  - `PROFILE_TAG_LABELS` — in this order: `door_outside: 'Door outside edge'`, `door_inside: 'Door inside (sticking)'`, `door_panel: 'Raised panel'`, `applied_molding: 'Applied molding'`, `crown: 'Crown'`, `top_mold: 'Top mold'`, `furniture_base: 'Furniture base'`, `toe_kick: 'Toe kick'`, `nosing: 'Nosing'`, `countertop_edge: 'Countertop edge'`, `light_rail: 'Light rail'`.
  - `ATTACH_POINTS` — §1.
  - `isProfileTag(tag)` — string matching §1's pattern.
  - `isProfileGeometry(geometry)`, `isSectionProfile(profile)` — §1's rules.
  - `isSectionProfileList(list)` — an array of valid profiles with unique ids. `undefined` is **not** valid (settings always have it after load).
  - One-line doc comment on each export naming SPEC-47.
- `constants.js`: `sectionProfiles: [],` right after `doorDesigns: DOOR_DESIGNS,`.
- `copySettings`: also `sectionProfiles: structuredClone(settings.sectionProfiles ?? []),`.
- `persistence.js`:
  - import `isSectionProfileList` from `'../model/sectionProfiles.js'` (next to the `doorDesigns.js` import).
  - `normalizeDocument`, right after the `doorDesigns` default (line 536): `if (settings.sectionProfiles === undefined) settings.sectionProfiles = [];` (a new array, never `DEFAULT_SETTINGS.sectionProfiles`).
  - `isSettings`: after `isDoorDesignList(settings.doorDesigns)` add `&& isSectionProfileList(settings.sectionProfiles)`.
  - `toElevationDocument` unchanged (settings are saved whole).

**NEW `src/elevation/model/__tests__/fixtures/sectionProfiles.json`**, verbatim:

```json
{
  "kind": "section-profiles",
  "version": 1,
  "profiles": [
    {
      "id": "sp-cove",
      "name": "Cove 1/4",
      "tags": ["door_inside"],
      "geometry": {
        "units": "in",
        "points": { "a": [0, 0], "b": [0.5, 0], "c": [0.75, -0.25], "d": [0.75, -0.8125], "e": [0, -0.8125] },
        "loops": [
          {
            "id": "L1",
            "closed": true,
            "segs": [
              { "type": "line", "from": "a", "to": "b" },
              { "type": "arc", "from": "b", "to": "c", "center": [0.5, -0.25], "ccw": false },
              { "type": "line", "from": "c", "to": "d" },
              { "type": "line", "from": "d", "to": "e" },
              { "type": "line", "from": "e", "to": "a" }
            ]
          }
        ]
      },
      "attach": { "frame_edge": "a" },
      "drawnPoints": { "elevation": ["b", "c"] },
      "version": 1,
      "archived": false
    },
    {
      "id": "sp-bead",
      "name": "Half bead",
      "tags": ["applied_molding"],
      "geometry": {
        "units": "in",
        "points": { "s": [0, 0], "t": [0.5, 0] },
        "loops": [
          {
            "id": "L1",
            "closed": true,
            "segs": [
              { "type": "arc", "from": "s", "to": "t", "center": [0.25, 0], "ccw": false },
              { "type": "line", "from": "t", "to": "s" }
            ]
          }
        ]
      },
      "attach": { "frame_edge": "s", "apply_point": "s" },
      "drawnPoints": { "elevation": ["s", "t"] },
      "version": 1,
      "archived": false
    },
    {
      "id": "sp-crown",
      "name": "Crown 4 1/2",
      "tags": ["crown"],
      "geometry": {
        "units": "in",
        "points": { "c1": [0, 0], "c2": [0, 4.5], "c3": [3, 4.5], "c4": [3, 3.75], "c5": [0.5, 0] },
        "loops": [
          {
            "id": "L1",
            "closed": true,
            "segs": [
              { "type": "line", "from": "c1", "to": "c2" },
              { "type": "line", "from": "c2", "to": "c3" },
              { "type": "line", "from": "c3", "to": "c4" },
              { "type": "line", "from": "c4", "to": "c5" },
              { "type": "line", "from": "c5", "to": "c1" }
            ]
          }
        ]
      },
      "attach": { "box_top": "c1", "box_front": "c1" },
      "drawnPoints": { "elevation": ["c3", "c4", "c5"], "plan": ["c3"] },
      "version": 1,
      "archived": false
    }
  ]
}
```

**NEW `src/elevation/model/__tests__/sectionProfiles.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import {
  ATTACH_POINTS, PROFILE_TAG_LABELS, isProfileGeometry, isSectionProfile, isSectionProfileList,
} from '../sectionProfiles.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const segs = COVE.geometry.loops[0].segs;
const geometry = (patch) => ({ ...COVE.geometry, ...patch });
const loop = (patch) => geometry({ loops: [{ ...COVE.geometry.loops[0], ...patch }] });
const withSegs = (...list) => loop({ segs: list });

describe('SPEC-47 the section profile shape', () => {
  it('starts with an empty library and names the known tags and attach points', () => {
    expect(DEFAULT_SETTINGS.sectionProfiles).toEqual([]);
    expect(Object.keys(PROFILE_TAG_LABELS)).toEqual([
      'door_outside', 'door_inside', 'door_panel', 'applied_molding', 'crown', 'top_mold',
      'furniture_base', 'toe_kick', 'nosing', 'countertop_edge', 'light_rail',
    ]);
    expect(PROFILE_TAG_LABELS.door_inside).toBe('Door inside (sticking)');
    expect(ATTACH_POINTS).toEqual([
      'door_edge', 'frame_edge', 'panel_edge', 'apply_point', 'box_top', 'box_front', 'floor', 'edge_top', 'edge_face',
    ]);
    expect([COVE, BEAD, CROWN].map((profile) => isSectionProfile(profile))).toEqual([true, true, true]);
  });

  it('checks the geometry: named points, chained segments, loops that close, arcs with one radius', () => {
    expect([
      isProfileGeometry(COVE.geometry),
      isProfileGeometry(BEAD.geometry),
      isProfileGeometry(geometry({ points: { ...COVE.geometry.points, z: [9, 9] } })),
      isProfileGeometry(loop({ closed: false, segs: segs.slice(0, 4) })),
      isProfileGeometry(geometry({ units: 'mm' })),
      isProfileGeometry(geometry({ points: { ...COVE.geometry.points, a: [0, 'x'] } })),
      isProfileGeometry(geometry({ points: { ...COVE.geometry.points, a: [0, 0, 0] } })),
      isProfileGeometry(geometry({ loops: [] })),
      isProfileGeometry(geometry({ loops: [COVE.geometry.loops[0], COVE.geometry.loops[0]] })),
      isProfileGeometry(loop({ segs: segs.slice(0, 4) })),
      isProfileGeometry(loop({ closed: false })),
      isProfileGeometry(withSegs(segs[0], ...segs.slice(2))),
      isProfileGeometry(withSegs(segs[0], { ...segs[1], to: 'q' }, ...segs.slice(2))),
      isProfileGeometry(withSegs(segs[0], { ...segs[1], center: [0.5, -0.3] }, ...segs.slice(2))),
      isProfileGeometry(withSegs(segs[0], { ...segs[1], ccw: 'no' }, ...segs.slice(2))),
      isProfileGeometry(withSegs(segs[0], { ...segs[1], type: 'spline' }, ...segs.slice(2))),
      isProfileGeometry(withSegs({ ...segs[0], ccw: true }, ...segs.slice(1))),
      isProfileGeometry(withSegs({ type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'a' })),
      isProfileGeometry(loop({ closed: false, segs: [{ type: 'line', from: 'a', to: 'a' }] })),
      isProfileGeometry(null),
    ]).toEqual([
      true, true, true, true,
      false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
    ]);
  });

  it('checks the profile: name, tags, attach and drawn points name real points, version and archived', () => {
    expect([
      isSectionProfile({ ...COVE, tags: [] }),
      isSectionProfile({ ...COVE, tags: ['door_inside', 'shop_ogee'] }),
      isSectionProfile({ ...COVE, attach: {} }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: [] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['b'], plan: ['c'] } }),
      isSectionProfile({ ...COVE, name: '' }),
      isSectionProfile({ ...COVE, name: ' Cove' }),
      isSectionProfile({ ...COVE, tags: ['Door inside'] }),
      isSectionProfile({ ...COVE, tags: ['crown', 'crown'] }),
      isSectionProfile({ ...COVE, attach: { frame_edge: 'q' } }),
      isSectionProfile({ ...COVE, attach: { sticking: 'a' } }),
      isSectionProfile({ ...COVE, drawnPoints: { plan: ['c'] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['b', 'b'] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['q'] } }),
      isSectionProfile({ ...COVE, version: 0 }),
      isSectionProfile({ ...COVE, version: 1.5 }),
      isSectionProfile({ ...COVE, archived: 'no' }),
      isSectionProfile({ ...COVE, thumbnail: 'M 0 0' }),
      isSectionProfile({ ...COVE, id: '' }),
    ]).toEqual([
      true, true, true, true, true,
      false, false, false, false, false, false, false, false, false, false, false, false, false, false,
    ]);
  });

  it('accepts a list with unique ids; names may repeat', () => {
    expect([
      isSectionProfileList(sample.profiles),
      isSectionProfileList([]),
      isSectionProfileList([COVE, { ...BEAD, name: COVE.name }]),
      isSectionProfileList([COVE, { ...BEAD, id: COVE.id }]),
      isSectionProfileList([COVE, { ...BEAD, version: 0 }]),
      isSectionProfileList(undefined),
      isSectionProfileList({}),
    ]).toEqual([true, true, true, false, false, false, false]);
  });
});
```

**NEW `src/elevation/store/__tests__/sectionProfileSaves.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { isElevationDocument, normalizeElevationDocument } from '../persistence.js';
import { copySettings } from '../slices/helpers.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const sample = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));

/** The golden document as saved before round 47: no profile library. */
function older() {
  const document = structuredClone(golden);
  delete document.settings.sectionProfiles;
  return document;
}

describe('SPEC-47 saving the profile library in settings', () => {
  it('gives an older document an empty profile library', () => {
    const loaded = normalizeElevationDocument(older());
    expect(loaded.settings.sectionProfiles).toEqual([]);
    expect(loaded.settings.sectionProfiles).not.toBe(DEFAULT_SETTINGS.sectionProfiles);
    expect(isElevationDocument(loaded)).toBe(true);
  });

  it('keeps a saved library and rejects a broken one', () => {
    const saved = older();
    saved.settings.sectionProfiles = sample.profiles;
    expect(normalizeElevationDocument(saved).settings.sectionProfiles).toEqual(sample.profiles);
    const valid = (sectionProfiles) => {
      const loaded = normalizeElevationDocument(older());
      loaded.settings.sectionProfiles = sectionProfiles;
      return isElevationDocument(loaded);
    };
    expect([
      valid(sample.profiles),
      valid([]),
      valid(undefined),
      valid([{ ...sample.profiles[0], version: 0 }]),
      valid([sample.profiles[0], sample.profiles[0]]),
    ]).toEqual([true, true, false, false, false]);
  });

  it('copies the library into the state so it never shares objects', () => {
    const copy = copySettings({ ...DEFAULT_SETTINGS, sectionProfiles: sample.profiles });
    expect(copy.sectionProfiles).toEqual(sample.profiles);
    expect([copy.sectionProfiles === sample.profiles, copy.sectionProfiles[0].geometry === sample.profiles[0].geometry])
      .toEqual([false, false]);
    expect([
      copySettings(DEFAULT_SETTINGS).sectionProfiles,
      copySettings({ ...DEFAULT_SETTINGS, sectionProfiles: undefined }).sectionProfiles,
    ]).toEqual([[], []]);
    expect(copySettings(DEFAULT_SETTINGS).sectionProfiles).not.toBe(DEFAULT_SETTINGS.sectionProfiles);
  });
});
```

**Don't touch:** `model/profile.js` (height profile), `doorStyles.js`, `doorDesigns.js`, every reducer, `golden.json`, the golden snapshot, the components.

**Count:** 1106 + 7 = **1113**. Golden snapshot unchanged. ⚠ If an existing persistence test fails only because loaded settings now hold `sectionProfiles`, report it. Don't edit it.

---

## §3 Step 425 — model helpers

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/sectionProfiles.js` | (424) | the helpers below |
| NEW `src/elevation/model/__tests__/sectionProfileHelpers.test.js` | — | 7 tests, verbatim |

**Contract** (all exported from `sectionProfiles.js`; import `DOOR_PROFILE_SLOTS` and `teamDoorStyle` from `./doorStyles.js`, which imports nothing, so no cycle):

- `PROFILE_SLOTS` — §1's table as `{ door_outside: [['door_edge']], …, door_applied: [['frame_edge'], ['panel_edge']], … }`, keys in that order.
- `profileFitsSlot(profile, slot)` → `true` when `PROFILE_SLOTS[slot]` has an option whose names are all keys of `profile.attach`. Unknown slot → `false`.
- `sectionProfileBounds(profile)` → `{ minX, minY, maxX, maxY }` over every point in `geometry.points`, plus each arc's extreme points. An arc's extremes are `center + (r, 0)`, `(0, r)`, `(−r, 0)`, `(0, −r)` (build them from the center and `r`, not with trig, so the numbers stay exact) for each direction strictly inside the arc's sweep. The sweep runs from the angle of `from` to the angle of `to`, counter-clockwise when `ccw`, clockwise otherwise; `r` = distance from center to `from`.
- `sectionProfileSvgPath(profile)` → one string for the thumbnail, **y flipped** (SVG y points down):
  - Each loop: `M x y`, then for each segment `L x y` (line) or `A r r 0 large sweep x y` (arc), then ` Z` when closed. Tokens are separated by single spaces; loops are joined by one space.
  - x is as stored and y is negated. Numbers are rounded to 4 decimals with trailing zeros dropped, and `-0` prints `0`.
  - `large` is `1` when the arc's sweep angle is more than 180°, else `0`. `sweep` is `0` when `ccw`, `1` when not.
  - A closed loop still writes its last segment before `Z`.
- `newSectionProfile(profiles, id, base = null)` → §1: without `base`, the 3/4" square named `New profile` / `New profile 2`…; with `base`, a deep copy named `<name> copy` / `<name> copy 2`…, version 1, `archived: false`. Names compare ignoring case. Same idea as `newDoorDesign` in `doorDesigns.js`.
- `sectionProfileUses(settings, rooms, profileId)` → first the team style's slots, as `{ level: 'team', slot }`, then each room's `doorStyles` in order, as `{ level: 'room', roomId, styleId, label, slot }`. Within a style, slots go in `DOOR_PROFILE_SLOTS` order, and a slot counts when `style.profiles?.[slot] === profileId`. Same idea as `doorDesignUses`.
- `filterSectionProfiles(profiles, { search = '', tag = null, showArchived = false } = {})` → the profiles in list order where (`showArchived` or not archived) and the name contains `search.trim()` ignoring case (an empty search matches everything) and (`tag` is null or in `tags`).
- `profileTagOptions(profiles)` → every key of `PROFILE_TAG_LABELS` in order, then every other tag used by any profile (archived included), sorted, no repeats.
- `profileTagLabel(tag)` → `PROFILE_TAG_LABELS[tag] ?? tag`.
- `normalizeProfileTags(text)` → split on commas; for each piece: trim, lowercase, replace runs of spaces/hyphens with `_`; drop empty pieces and repeats (keep the first). It doesn't validate (the dialog uses `isProfileTag`).
- `profileFile(profiles)` → `{ kind: 'section-profiles', version: 1, profiles }`.
- `parseProfileFile(text)` → the `profiles` array when `text` parses as JSON with `kind === 'section-profiles'`, `version === 1` and an array `profiles`; else `null` (never throws). The entries aren't checked here.
- `mergeImportedProfiles(profiles, incoming)` → `{ profiles: next, added, replaced, skipped }` per §1, where `next` is a new array. Incoming entries are used as given.

**NEW `src/elevation/model/__tests__/sectionProfileHelpers.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import {
  PROFILE_SLOTS, PROFILE_TAG_LABELS, filterSectionProfiles, isProfileTag, mergeImportedProfiles,
  newSectionProfile, normalizeProfileTags, parseProfileFile, profileFile, profileFitsSlot, profileTagLabel,
  profileTagOptions, sectionProfileBounds, sectionProfileSvgPath, sectionProfileUses,
} from '../sectionProfiles.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
/** A 270° arc, clockwise from (1/4, 0) round to (0, 1/4), closed by its chord. */
const THREE_QUARTER = {
  ...COVE,
  id: 'sp-tq',
  geometry: {
    units: 'in',
    points: { u: [0.25, 0], v: [0, 0.25] },
    loops: [{
      id: 'L1',
      closed: true,
      segs: [
        { type: 'arc', from: 'u', to: 'v', center: [0, 0], ccw: false },
        { type: 'line', from: 'v', to: 'u' },
      ],
    }],
  },
  attach: {},
  drawnPoints: { elevation: [] },
};

describe('SPEC-47 section profile helpers', () => {
  it('fits a slot by attach points, never by tags', () => {
    expect(PROFILE_SLOTS).toEqual({
      door_outside: [['door_edge']],
      door_inside: [['frame_edge']],
      door_panel: [['panel_edge']],
      door_applied: [['frame_edge'], ['panel_edge']],
      slab_applied: [['apply_point']],
      crown: [['box_top', 'box_front']],
      top_mold: [['box_top', 'box_front']],
      furniture_base: [['floor', 'box_front']],
      toe_kick: [['floor', 'box_front']],
      nosing: [['edge_top', 'edge_face']],
    });
    const withAttach = (attach) => ({ ...COVE, attach });
    expect([
      profileFitsSlot(COVE, 'door_inside'),
      profileFitsSlot(COVE, 'door_applied'),
      profileFitsSlot(withAttach({ panel_edge: 'a' }), 'door_applied'),
      profileFitsSlot(BEAD, 'slab_applied'),
      profileFitsSlot(CROWN, 'crown'),
      profileFitsSlot(CROWN, 'top_mold'),
      profileFitsSlot(COVE, 'door_outside'),
      profileFitsSlot(withAttach({}), 'door_inside'),
      profileFitsSlot(withAttach({ box_top: 'a' }), 'crown'),
      profileFitsSlot(CROWN, 'sticking'),
    ]).toEqual([true, true, true, true, true, true, false, false, false, false]);
  });

  it('measures a profile, arcs included', () => {
    expect([COVE, BEAD, CROWN, THREE_QUARTER].map((profile) => sectionProfileBounds(profile))).toEqual([
      { minX: 0, minY: -0.8125, maxX: 0.75, maxY: 0 },
      { minX: 0, minY: 0, maxX: 0.5, maxY: 0.25 },
      { minX: 0, minY: 0, maxX: 3, maxY: 4.5 },
      { minX: -0.25, minY: -0.25, maxX: 0.25, maxY: 0.25 },
    ]);
  });

  it('draws a thumbnail path with y flipped for SVG', () => {
    expect([COVE, BEAD, CROWN, THREE_QUARTER].map((profile) => sectionProfileSvgPath(profile))).toEqual([
      'M 0 0 L 0.5 0 A 0.25 0.25 0 0 1 0.75 0.25 L 0.75 0.8125 L 0 0.8125 L 0 0 Z',
      'M 0 0 A 0.25 0.25 0 0 1 0.5 0 L 0 0 Z',
      'M 0 0 L 0 -4.5 L 3 -4.5 L 3 -3.75 L 0.5 0 L 0 0 Z',
      'M 0.25 0 A 0.25 0.25 0 1 1 0 -0.25 L 0.25 0 Z',
    ]);
    const open = {
      ...COVE,
      geometry: {
        units: 'in',
        points: { p: [0.333333, -0.1], q: [1, -0.1], r: [1, 0] },
        loops: [
          { id: 'L1', closed: false, segs: [{ type: 'line', from: 'p', to: 'q' }] },
          { id: 'L2', closed: false, segs: [{ type: 'line', from: 'q', to: 'r' }] },
        ],
      },
      attach: {},
      drawnPoints: { elevation: [] },
    };
    expect(sectionProfileSvgPath(open)).toBe('M 0.3333 0.1 L 1 0.1 M 1 0.1 L 1 0');
  });

  it('makes a new 3/4" square profile or a copy, with the next free name', () => {
    expect(newSectionProfile([], 'sp-1')).toEqual({
      id: 'sp-1',
      name: 'New profile',
      tags: [],
      geometry: {
        units: 'in',
        points: { p1: [0, 0], p2: [0.75, 0], p3: [0.75, -0.75], p4: [0, -0.75] },
        loops: [{
          id: 'L1',
          closed: true,
          segs: [
            { type: 'line', from: 'p1', to: 'p2' },
            { type: 'line', from: 'p2', to: 'p3' },
            { type: 'line', from: 'p3', to: 'p4' },
            { type: 'line', from: 'p4', to: 'p1' },
          ],
        }],
      },
      attach: {},
      drawnPoints: { elevation: [] },
      version: 1,
      archived: false,
    });
    const named = [{ ...COVE, name: 'New profile' }, { ...BEAD, name: 'new PROFILE 2' }];
    expect(newSectionProfile(named, 'sp-2').name).toBe('New profile 3');
    const copy = newSectionProfile(sample.profiles, 'sp-3', { ...CROWN, version: 4, archived: true });
    expect(copy).toEqual({ ...CROWN, id: 'sp-3', name: 'Crown 4 1/2 copy', version: 1, archived: false });
    expect([copy.geometry === CROWN.geometry, copy.tags === CROWN.tags]).toEqual([false, false]);
    expect(newSectionProfile([...sample.profiles, { ...COVE, id: 'x', name: 'Crown 4 1/2 COPY' }], 'sp-4', CROWN).name)
      .toBe('Crown 4 1/2 copy 2');
  });

  it('lists the door style slots that use a profile: team default first, then each room\'s styles', () => {
    const team = { ...DEFAULT_DOOR_STYLE, profiles: { outside: null, inside: 'sp-cove', panel: null, applied: 'sp-cove' } };
    const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A', profiles: { ...DEFAULT_DOOR_STYLE.profiles, applied: 'sp-bead' } };
    const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', profiles: { ...DEFAULT_DOOR_STYLE.profiles, inside: 'sp-cove' } };
    const settings = { ...DEFAULT_SETTINGS, teamDoorStyle: team, sectionProfiles: sample.profiles };
    const rooms = [{ id: 'r1', doorStyles: [A, B] }, { id: 'r2' }];
    expect(sectionProfileUses(settings, rooms, 'sp-cove')).toEqual([
      { level: 'team', slot: 'inside' },
      { level: 'team', slot: 'applied' },
      { level: 'room', roomId: 'r1', styleId: 'ds-b', label: 'B', slot: 'inside' },
    ]);
    expect(sectionProfileUses(settings, rooms, 'sp-bead'))
      .toEqual([{ level: 'room', roomId: 'r1', styleId: 'ds-a', label: 'A', slot: 'applied' }]);
    expect(sectionProfileUses(settings, rooms, 'sp-crown')).toEqual([]);
    expect(sectionProfileUses(DEFAULT_SETTINGS, [], 'sp-cove')).toEqual([]);
  });

  it('writes and reads a profiles file, and merges an import by id', () => {
    expect(profileFile([COVE])).toEqual({ kind: 'section-profiles', version: 1, profiles: [COVE] });
    expect(parseProfileFile(JSON.stringify(sample))).toEqual(sample.profiles);
    expect([
      parseProfileFile('nope'),
      parseProfileFile('{"kind":"other","version":1,"profiles":[]}'),
      parseProfileFile('{"kind":"section-profiles","version":2,"profiles":[]}'),
      parseProfileFile('{"kind":"section-profiles","version":1,"profiles":{}}'),
      parseProfileFile('null'),
    ]).toEqual([null, null, null, null, null]);
    const edited = { ...COVE, name: 'Cove 3/8', version: 2 };
    const list = [COVE, BEAD];
    const merged = mergeImportedProfiles(list, [edited, CROWN, { ...BEAD, id: 'sp-bad', version: 0 }]);
    expect(merged).toEqual({ profiles: [edited, BEAD, CROWN], added: 1, replaced: 1, skipped: 1 });
    expect(merged.profiles).not.toBe(list);
    expect(list).toEqual([COVE, BEAD]);
    expect(mergeImportedProfiles([], [CROWN, { ...CROWN, name: 'Crown 2' }]))
      .toEqual({ profiles: [{ ...CROWN, name: 'Crown 2' }], added: 1, replaced: 1, skipped: 0 });
  });

  it('filters by name, tag and archived, and offers known tags then the team\'s own', () => {
    const list = [
      COVE,
      { ...BEAD, tags: ['applied_molding', 'shop_bead'] },
      { ...CROWN, archived: true, tags: ['crown', 'a_custom'] },
    ];
    const ids = (options) => filterSectionProfiles(list, options).map(({ id }) => id);
    expect([
      ids(undefined),
      ids({ showArchived: true }),
      ids({ search: '  COVE ' }),
      ids({ search: 'crown' }),
      ids({ search: 'crown', showArchived: true }),
      ids({ tag: 'shop_bead' }),
      ids({ tag: 'door_outside' }),
    ]).toEqual([
      ['sp-cove', 'sp-bead'],
      ['sp-cove', 'sp-bead', 'sp-crown'],
      ['sp-cove'],
      [],
      ['sp-crown'],
      ['sp-bead'],
      [],
    ]);
    expect(profileTagOptions(list)).toEqual([...Object.keys(PROFILE_TAG_LABELS), 'a_custom', 'shop_bead']);
    expect([profileTagLabel('door_inside'), profileTagLabel('shop_bead')]).toEqual(['Door inside (sticking)', 'shop_bead']);
    expect(normalizeProfileTags(' Shop Bead, door-inside ,,crown, shop_bead ')).toEqual(['shop_bead', 'door_inside', 'crown']);
    expect([isProfileTag('shop_bead'), isProfileTag('ogee#2'), isProfileTag('_x'), isProfileTag('a__b')])
      .toEqual([true, false, false, false]);
  });
});
```

How the arc numbers come out:
- Cove: the arc goes from b (angle 90° about its center) clockwise to c (0°), a 90° sweep, so `large 0 sweep 1`. No axis direction lies strictly inside it, so the bounds are just the points.
- Bead: from s (180°) clockwise to t (0°) passes 90°, so the top of the bead, (0.25, 0.25), sets `maxY`. The sweep is exactly 180°, which is not more than 180°, so `large 0`.
- Three-quarter: from u (0°) clockwise to v (90°) is a 270° sweep (`large 1`). It passes 270° and 180°, giving (0, −0.25) and (−0.25, 0).

**Don't touch:** every other model file, the store, the components, the step-424 tests.

**Count:** 1113 + 7 = **1120**.

---

## §4 Step 426 — store: profile reducers

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/store/slices/sectionProfiles.js` | — | `sectionProfileReducers` |
| `src/elevation/store/elevationSlice.js` | 190 | import (after line 20), spread (after line 67), export the five actions (after `moveMissingDoorDesign`, line 177) |
| NEW `src/elevation/store/__tests__/sliceSectionProfiles.test.js` | — | 4 tests, verbatim |

**Contract** (pattern: `store/slices/doorDesigns.js`, 78 lines — `current()` to read, `uuid` in `prepare`). Every reducer returns before writing when it rejects, so the state object is unchanged. No `syncRoomAt` (§1). `list` below = `current(state.settings).sectionProfiles`.
- `addSectionProfile` — `{ reducer, prepare }`; payload `{ baseId?, id }`; `prepare(payload = {})` fills `id` with `uuid()`. `base` = `null` when `baseId` is null/absent, otherwise the profile with that id (unknown → reject). Set `sectionProfiles` to `[...list, newSectionProfile(list, id, base)]`; reject if that fails `isSectionProfileList`.
- `updateSectionProfile({ profileId, profile })` — reject an unknown id. `next = { ...structuredClone(profile), id: profileId, version, archived: existing.archived }`, where `version` = `existing.version + 1` when `JSON.stringify([geometry, attach, drawnPoints])` differs between `profile` and `existing`, else `existing.version`. Reject unless `isSectionProfile(next)`. Replace it in place.
- `setSectionProfileArchived({ profileId, archived })` — reject unknown ids or a non-boolean `archived`; set the flag.
- `deleteSectionProfile({ profileId })` — reject unknown ids, or when `sectionProfileUses(current(state.settings), current(state.rooms), profileId)` isn't empty (archive it instead). Remove it.
- `importSectionProfiles({ profiles })` — reject unless `Array.isArray(profiles)`. `{ profiles: next, added, replaced } = mergeImportedProfiles(list, structuredClone(profiles))`; reject when `added + replaced === 0`; else set.
- `elevationSlice.js`: `import { sectionProfileReducers } from './slices/sectionProfiles.js';`, spread `...sectionProfileReducers,` after `...doorDesignReducers,`, export `addSectionProfile, updateSectionProfile, setSectionProfileArchived, deleteSectionProfile, importSectionProfiles`.

**NEW `src/elevation/store/__tests__/sliceSectionProfiles.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import elevationReducer, {
  addSectionProfile, deleteSectionProfile, importSectionProfiles, setSectionProfileArchived, setTeamDoorStyle,
  updateSectionProfile,
} from '../elevationSlice.js';
import { stateWithRun } from './helpers/sliceFixtures.js';

const sample = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const rows = (state) => state.settings.sectionProfiles.map(({ id, name, version, archived }) => [id, name, version, archived]);

/** A one-wall room with the sample profiles in its library. */
function withLibrary() {
  const state = stateWithRun();
  state.settings.sectionProfiles = structuredClone(sample.profiles);
  return state;
}

describe('SPEC-47 editing the profile library', () => {
  it('adds a new square profile or a copy of one', () => {
    const state = apply(withLibrary(), addSectionProfile({ id: 'sp-1' }), addSectionProfile({ id: 'sp-2', baseId: 'sp-bead' }));
    expect(rows(state).slice(3)).toEqual([['sp-1', 'New profile', 1, false], ['sp-2', 'Half bead copy', 1, false]]);
    expect(state.settings.sectionProfiles[4].geometry).toEqual(BEAD.geometry);
    const before = withLibrary();
    expect(apply(before, addSectionProfile({ id: 'sp-3', baseId: 'gone' }))).toBe(before);
    expect(addSectionProfile().payload.id).toEqual(expect.any(String));
  });

  it('saves name and tag edits without a new version; a shape edit bumps it', () => {
    const state = withLibrary();
    const renamed = apply(state, updateSectionProfile({
      profileId: 'sp-cove',
      profile: { ...COVE, name: 'Cove 3/8', tags: ['door_inside', 'door_outside'], id: 'x', version: 9, archived: true },
    }));
    expect(renamed.settings.sectionProfiles[0]).toEqual({ ...COVE, name: 'Cove 3/8', tags: ['door_inside', 'door_outside'] });
    const moved = { ...COVE.geometry, points: { ...COVE.geometry.points, d: [0.75, -0.875], e: [0, -0.875] } };
    const reshaped = apply(renamed, updateSectionProfile({ profileId: 'sp-cove', profile: { ...COVE, geometry: moved } }));
    expect([reshaped.settings.sectionProfiles[0].version, reshaped.settings.sectionProfiles[0].name]).toEqual([2, 'Cove 1/4']);
    const pointed = apply(reshaped, updateSectionProfile({
      profileId: 'sp-cove',
      profile: { ...reshaped.settings.sectionProfiles[0], drawnPoints: { elevation: ['b'] } },
    }));
    expect(pointed.settings.sectionProfiles[0].version).toBe(3);
    expect([
      apply(state, updateSectionProfile({ profileId: 'sp-cove', profile: { ...COVE, name: '' } })),
      apply(state, updateSectionProfile({ profileId: 'sp-cove', profile: { ...COVE, attach: { frame_edge: 'q' } } })),
      apply(state, updateSectionProfile({ profileId: 'gone', profile: COVE })),
    ].every((next) => next === state)).toBe(true);
  });

  it('archives and restores; deletes only a profile no door style uses', () => {
    const state = withLibrary();
    const archived = apply(state, setSectionProfileArchived({ profileId: 'sp-crown', archived: true }));
    expect(rows(archived)[2]).toEqual(['sp-crown', 'Crown 4 1/2', 1, true]);
    expect(rows(apply(archived, setSectionProfileArchived({ profileId: 'sp-crown', archived: false })))[2])
      .toEqual(['sp-crown', 'Crown 4 1/2', 1, false]);
    expect([
      apply(state, setSectionProfileArchived({ profileId: 'gone', archived: true })),
      apply(state, setSectionProfileArchived({ profileId: 'sp-crown', archived: 'yes' })),
    ].every((next) => next === state)).toBe(true);
    const used = apply(state, setTeamDoorStyle({
      style: { ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, inside: 'sp-cove' } },
    }));
    expect(apply(used, deleteSectionProfile({ profileId: 'sp-cove' }))).toBe(used);
    expect(apply(used, deleteSectionProfile({ profileId: 'gone' }))).toBe(used);
    expect(rows(apply(used, deleteSectionProfile({ profileId: 'sp-bead' }))).map(([id]) => id)).toEqual(['sp-cove', 'sp-crown']);
  });

  it('imports a profiles file by id', () => {
    const state = withLibrary();
    const imported = apply(state, importSectionProfiles({
      profiles: [{ ...BEAD, name: 'Bead 1/2', version: 3 }, { ...CROWN, id: 'sp-crown-2' }, { nope: true }],
    }));
    expect(rows(imported)).toEqual([
      ['sp-cove', 'Cove 1/4', 1, false],
      ['sp-bead', 'Bead 1/2', 3, false],
      ['sp-crown', 'Crown 4 1/2', 1, false],
      ['sp-crown-2', 'Crown 4 1/2', 1, false],
    ]);
    expect(apply(state, importSectionProfiles({ profiles: [{ nope: true }] }))).toBe(state);
    expect(apply(state, importSectionProfiles({ profiles: 'x' }))).toBe(state);
  });
});
```

**Don't touch:** the model files, `persistence.js`, the other slices, the components, existing tests.

**Count:** 1120 + 4 = **1124**. ⚠ If `setTeamDoorStyle` in the third test leaves the state unchanged (so `used === state`), report it. Don't change the test.

---

## §5 Step 427 — UI: Profiles nav and list page

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/App.jsx` | 68 | import + `<Route path="profiles" element={<ProfilesPage />} />` inside `/library`, after `door-style` |
| `src/library/LibraryLayout.jsx` | 32 | third NavLink **Profiles** → `profiles`, same classes |
| NEW `src/library/ProfileThumbnail.jsx` | — | the SVG thumbnail |
| NEW `src/library/ProfilesPage.jsx` | — | the page |

**Contract.**
- `ProfileThumbnail({ profile, className = '' })`:
  - `b = sectionProfileBounds(profile)`; `w = max(maxX − minX, 0.01)`, `h = max(maxY − minY, 0.01)`, `pad = max(w, h) × 0.08`.
  - `<svg viewBox={`${minX − pad} ${−maxY − pad} ${w + 2·pad} ${h + 2·pad}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${profile.name} profile`} className={className}>`.
  - One `<path d={sectionProfileSvgPath(profile)} fill="currentColor" fillOpacity={0.12} fillRule="evenodd" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />`.
  - The thumbnail is y-up because the path is already flipped. That's why the viewBox top is `−maxY − pad`.
- `ProfilesPage` (reads `settings` and `rooms` from `state.elevation`; button/input classes copied from `DoorDesignsPage.jsx`):
  - Header row: *Profiles* (`text-xl font-semibold text-gray-100`) and the line *Section shapes for door edges, panels and moldings. Door styles and runs will pick them once profile slots are added.* On the right, a **New profile** button that dispatches `addSectionProfile()`. Step 428 makes it open the details dialog.
  - Filter row:
    - A search input (`aria-label="Search profiles"`, placeholder *Search names*, `max-w-xs`).
    - Tag chips: *All*, then `profileTagOptions(profiles)` shown with `profileTagLabel`. One chip is active at a time; clicking the active chip goes back to *All*. Active chip `bg-blue-600 text-white`, others `border border-gray-600 text-gray-300 hover:bg-gray-700`, `rounded-full px-2.5 py-1 text-xs`.
    - A *Show archived* checkbox.
  - Results: `filterSectionProfiles(profiles, { search, tag, showArchived })` in a grid `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
  - Card: `rounded border border-gray-700 bg-gray-800/60 p-3 space-y-2`, plus `opacity-60` when archived. It holds:
    - the thumbnail in a `h-32 rounded bg-gray-900 p-2 text-gray-200` box (`className="h-full w-full"`);
    - the name (`font-medium text-gray-100`), with a grey *archived* pill when archived;
    - tag pills (`rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300`, `profileTagLabel`), or *No tags* in grey;
    - a `text-xs text-gray-500` line: `v{version} · attach: {keys of attach joined ', '}`, or `v{version} · no attach points`;
    - a *Used by:* line (`text-xs text-gray-400`), only when used, from `sectionProfileUses`. Each use reads `Team default {slot}`, or `{room name} {label} {slot}`; comma-separated.
    - Buttons:
      - **Copy** → `addSectionProfile({ baseId })`.
      - **Archive** / **Restore** → `setSectionProfileArchived`.
      - **Delete** — disabled when used, with `title="Used by a door style — archive it instead"`. The first click turns that card's button into **Confirm delete** (component state `confirmingId`); the second click dispatches `deleteSectionProfile`. Any other button, or changing the filters, clears it. No browser `confirm()`.
  - Empty states (`text-sm text-gray-400`): when there are no profiles at all, *No profiles yet. New profile starts a 3/4" square to work from.* When the filters hide everything, *No profiles match.*
  - Note under the grid (`text-xs text-gray-500`): *Shapes are drawn in the profile editor (next round). Profiles are saved in this browser with the Elevation Lab drawings until the library moves to the team's account.*

**Don't touch:** the model, the store, ElevationLab, the other library pages. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1124 tests.

---

## §6 Step 428 — UI: Details dialog, Export, Import

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/library/ProfileDetailsDialog.jsx` | — | name and tags |
| `src/library/ProfilesPage.jsx` | (427) | Details button, New opens the dialog, Export, Import |

**Contract.**
- `ProfileDetailsDialog({ profile, onClose })` follows `src/library/DoorDesignEditor.jsx`'s dialog pattern: overlay, `role="dialog"`, focus the first input, Escape closes, Tab trap, same input/button classes.
  - Title *Profile details*.
  - **Name** input (required).
  - **Tags**: a two-column checkbox list of every `PROFILE_TAG_LABELS` entry (label text), checked when the profile has it.
  - **Other tags** text input (comma separated, placeholder *e.g. shop_bead, ogee*), starting with the profile's tags that aren't known, joined `', '`.
  - Read-only `text-xs text-gray-500` lines: `Version {version} · {n} points · {m} loops`, the attach points as `name → point` pairs (or *No attach points*), and *The shape, attach points and drawn points are edited in the profile editor (next round).*
  - Save builds `tags` = the checked known tags in `PROFILE_TAG_LABELS` order, then `normalizeProfileTags(other)` minus any already listed. It dispatches `updateSectionProfile({ profileId: profile.id, profile: { ...profile, name: name.trim(), tags } })` and closes.
  - Save is disabled, with a red reason, when the trimmed name is empty (*Name is required*) or any tag fails `isProfileTag` (*Tags can use lowercase letters, numbers and single underscores*). **Cancel** closes.
- `ProfilesPage`:
  - **Details** button on each card (first in the row) opens the dialog for that profile (`editingId` state; render `<ProfileDetailsDialog key={id} … />` like `DoorDesignsPage` does with its editor).
  - **New profile**: `const action = addSectionProfile(); dispatch(action); setEditingId(action.payload.id);`.
  - **Export** button in the header, disabled when there are no profiles: `saveBlob(new Blob([JSON.stringify(profileFile(profiles), null, 2)], { type: 'application/json' }), 'profiles.json')`. `saveBlob` comes from `src/api/drawings.js` (exists; don't change it). It exports every profile, archived included.
  - **Import…** button in the header clicks a hidden `<input type="file" accept=".json,application/json">` (`useRef`). On change: `text = await file.text()`; `parsed = parseProfileFile(text)`.
    - `null` → show *That file isn't a profiles export.* (`text-sm text-red-400`, `role="status"`).
    - Otherwise compute `{ added, replaced, skipped } = mergeImportedProfiles(profiles, parsed)`, dispatch `importSectionProfiles({ profiles: parsed })` and show `Imported: {added} new, {replaced} replaced, {skipped} skipped.` (`text-sm text-gray-300`, `role="status"`).
    - Reset the input's value so the same file can be picked again. The message clears on the next import or when the dialog opens.
  - The page note gains: *Export saves every profile to a file; Import adds new ones and replaces any with the same id.*

**Don't touch:** the model, the store, `src/api/drawings.js`, the other library pages. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1124 tests.

---

## End-to-end check (Kyle)

- Header → **Library** → **Profiles**: empty, with the "No profiles yet" line.
- **New profile** → the details dialog opens on *New profile*. Name it `Test ogee`, tick *Door inside (sticking)*, add `shop_ogee` under other tags, Save. The card shows a square thumbnail, both tags and `v1 · no attach points`.
- **Import…** → pick `cabinetry_designer/src/elevation/model/__tests__/fixtures/sectionProfiles.json` → *Imported: 3 new, 0 replaced, 0 skipped.* The cove, the half bead (a dome sitting on its flat) and the crown show with the right shapes, y up.
- Tag chips: *Crown* shows only the crown; a `shop_ogee` chip appears after the known ones.
- **Copy** the cove → *Cove 1/4 copy*. **Archive** it: it disappears until *Show archived*, then shows faded with **Restore**.
- **Delete** asks **Confirm delete** first.
- **Export** → `profiles.json` downloads. Delete a profile, **Import** the file again → it comes back (*1 new, N replaced*).
- Reload: everything is still there. An older saved drawing loads fine with an empty profile list.

**Known for now:**
- Shapes can't be drawn or edited yet (round 48). New profiles are 3/4" squares.
- The library is per browser until the Supabase step. Export is the backup.
- Profiles aren't used by any door style or drawing until round 50.
