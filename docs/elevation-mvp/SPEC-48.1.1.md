# Round 48.1.1 — SPEC: one kind per profile, pin points by kind, rotate and flip

Steps 439–443, designer only, on branch `elevation-doors` (after step 438, 1142 tests). Geometry and the API don't change. No Supabase (plan P18).
Replaces the tag + attach-point setup from SPEC-47/48.1 with something simpler, after Kyle tried 48.1 (2026-10-08): choosing a tag and then choosing an attach name was the same decision twice.

**Done when:**
- Every profile has exactly **one kind** (Door outside edge, Door inside profile, Raised panel, Applied molding, Crown, Top mold, Furniture base, Toe kick, Nosing, Other). Tags are gone.
- The kind decides **which pin points** the profile needs, in plain words ("Panel opening edge: the point where this profile meets the panel opening, at the front face"). You click a point and press **Use selected point**. Nothing else to choose.
- The kind also decides **which way the shape is drawn**. The canvas says so ("Door profile · face on top · x → toward the door's middle · y ↓ into the door").
- A shape needed as a second kind is **Copied**, given the other kind, and turned with **Rotate ⟲ / ⟳** and **Flip ↔ / ↕**.
- Older saved profiles (and older profile files on Import) load: their first usable tag becomes the kind, and pins the kind doesn't use are dropped.
- A profile fits a slot when it's the slot's kind and all its pins are set. Applied molding is one kind that fits both the 5-piece and the slab applied-molding slots.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **439** | designer | Model additions: kinds, pin labels, missing pins, migration; rotate and flip | 1142 → **1148** |
| **440** | designer | Model switch: `kind` replaces `tags` (validation, slots, new/filter, load and import migrate, `setProfileKind`), fixture + test edits | **1149** |
| **441** | designer | UI switch: Profiles page, Details dialog (Kind select), editor header; remove the tag exports | 1149 |
| **442** | designer | UI: **Kind and pin points** panel replaces the Attach panel; kind is part of the editor draft | 1149 |
| **443** | designer | UI: canvas kind hints and pin labels; Rotate / Flip buttons; note text | 1149 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Every expected value in the tests was worked out by hand from the rules below and the sample profiles in `fixtures/sectionProfiles.json`. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got.

⚠ **Between steps 440 and 441 the Profiles page and the editor will error at runtime** (they still read `tags`). Tests, lint and build all pass. Run 441 straight after 440; don't open the Profiles page in between.

---

## §1 Decisions (2026-10-08 — Kyle chose one kind per profile with Copy + rotate/flip; the details are Claude's defaults)

- **One kind per profile, replacing tags.** A profile stores `kind` (a string) where it used to store `tags` (an array). The kinds, in this order:

  | kind | Label | Axes | Pins (attach names) |
  |---|---|---|---|
  | `door_outside` | Door outside edge | door | `door_edge` |
  | `door_inside` | Door inside profile | door | `frame_edge` |
  | `door_panel` | Raised panel | door | `panel_edge` |
  | `applied_molding` | Applied molding | door | `apply_point` |
  | `crown` | Crown | run | `box_top`, `box_front` |
  | `top_mold` | Top mold | run | `box_top`, `box_front` |
  | `furniture_base` | Furniture base | run | `floor`, `box_front` |
  | `toe_kick` | Toe kick | run | `floor`, `box_front` |
  | `nosing` | Nosing | run | `edge_top`, `edge_face` |
  | `other` | Other | free | — |

  - **Axes** say which way the shape is drawn. *door*: y = 0 is the door's front face, x runs in toward the door's middle, y goes down into the door (P10). *run*: x runs out from the box (or part) face toward the room, y runs up. *free*: no convention; Other profiles can't go in any slot yet (countertop edges, light rail, one-off shapes).
  - **Applied molding is one kind** with one pin, `apply_point`: the point of the molding that sits on the line it's applied along (the frame/panel joint on a 5-piece door, the inset line on a slab). It fits both the `door_applied` and `slab_applied` slots. The old `door_applied` options (`frame_edge` or `panel_edge`) are dropped.
- **"Pin points" is the UI word for attach points.** The data keeps the `attach` field and the `ATTACH_POINTS` names, so the round-48/48.1 edits (`setProfileAttach`, rename, delete) are unchanged. Pin labels: `door_edge` *Door edge*, `frame_edge` *Panel opening edge*, `panel_edge` *Panel edge*, `apply_point` *Molding line*, `box_top` *Top of box*, `box_front` *Box face*, `floor` *Floor*, `edge_top` *Top of part*, `edge_face` *Part edge*.
- **Validation stays permissive about attach.** `attach` may still hold any `ATTACH_POINTS` name, so the existing tests and the sample half bead (which has a spare `frame_edge`) stay valid. Only the kind's pins count for fitting and are shown. Pins outside the kind are dropped whenever the kind is set (`setProfileKind`) or an old profile is migrated.
- **Slots take one kind.** `PROFILE_SLOTS` becomes slot → kind. `profileFitsSlot(profile, slot)` = the profile's kind is the slot's kind **and** none of that kind's pins are missing. So a crown profile doesn't fit `top_mold`; Copy it and set the copy's kind to Top mold.
- **Migration of older profiles** (`migrateSectionProfile`), used when a saved document loads and when a profiles file is imported:
  - Only an entry that is a plain object with an array `tags` and no own `kind` is changed. Anything else is returned as it is (the same object).
  - `kind` = the first tag (in order) that is a kind name other than `other`, or is `door_applied` / `slab_applied` (both → `applied_molding`). No such tag → `other`.
  - `tags` is removed. If `attach` is a plain object, it keeps only the new kind's pins (in its existing key order).
  - Never mutates the input.
- **New profile** = the 3/4" square with kind **Other**. The Details dialog opens on New (as today) and its **Kind** select is where you choose. **Copy** keeps the kind.
- **Kind in the editor is part of the draft.** Changing it is an undoable edit (`setProfileKind`), and Save writes it. "Unsaved" compares kind too. Kind alone doesn't bump the version, but the pins it drops do (the existing rule compares `attach`). In the editor, the Details dialog edits the **name only**, so kind is never changed in two places at once.
- **Rotate and flip** work about 0, 0, so the person puts the pin point at the origin first (the existing **Origin** button), then turns the shape about it.
  - `rotateProfile(profile, turns)`: quarter turns counter-clockwise (y up). `turns` must be an integer; it's taken mod 4. 1 → (x, y) ↦ (−y, x); 2 → (−x, −y); 3 (or −1) → (y, −x). Arc centers turn the same way, and `ccw` is unchanged (a rotation keeps direction).
  - `mirrorProfile(profile, axis)`: `'x'` negates x (flip left–right across x = 0); `'y'` negates y (flip up–down across y = 0). Arc centers flip the same way, and every arc's `ccw` is inverted (a mirror reverses direction).
  - Both use the file's `round6` on every coordinate they write (so `-0` becomes `0`) and go through `editProfile`. Attach, drawn points, kind, name and version are untouched.
- **Not in 48.1.1:** rotating by any angle other than quarter turns, mirroring about a point other than 0, 0, a "copy as another kind" button (Copy then change kind is two clicks), using profiles in rooms (round 50).

---

## §2 Step 439 — model additions: kinds, pins, migration, rotate and flip

Nothing existing changes in this step. Tags are still validated; the new exports sit beside them.

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/sectionProfiles.js` | 344 | add `PROFILE_KINDS`, `PIN_LABELS`, `isProfileKind`, `profileKindLabel`, `profileKindOptions`, `profileMissingPins`, `migrateSectionProfile` |
| `src/elevation/model/profileEditing.js` | 417 | add `rotateProfile`, `mirrorProfile` |
| NEW `src/elevation/model/__tests__/profileKinds.test.js` | — | 3 tests, verbatim |
| NEW `src/elevation/model/__tests__/profileTurns.test.js` | — | 3 tests, verbatim |

**Contract** (one-line doc comment on each export naming SPEC-48.1.1):

`sectionProfiles.js`:
- `PROFILE_KINDS` — §1's table as `{ door_outside: { label: 'Door outside edge', axes: 'door', pins: ['door_edge'] }, …, other: { label: 'Other', axes: 'free', pins: [] } }`, keys in that order.
- `PIN_LABELS` — §1's pin labels, keys in `ATTACH_POINTS` order.
- `isProfileKind(kind)` → `typeof kind === 'string' && Object.hasOwn(PROFILE_KINDS, kind)`.
- `profileKindLabel(kind)` → `PROFILE_KINDS[kind]?.label ?? kind` (use `Object.hasOwn`, so `'toString'` isn't a kind).
- `profileKindOptions(profiles)` → the kinds used by any profile (archived included), in `PROFILE_KINDS` order, no repeats.
- `profileMissingPins(profile)` → the pins of `profile.kind` that aren't keys of `profile.attach`, in pin order; `[]` for an unknown kind or `other`. Doesn't validate.
- `migrateSectionProfile(entry)` → §1.

`profileEditing.js` (both through the existing `editProfile` and `round6`; `null` for bad input):
- `rotateProfile(profile, turns)` → §1. `null` unless `Number.isInteger(turns)`.
- `mirrorProfile(profile, axis)` → §1. `null` unless `axis` is `'x'` or `'y'`.

**NEW `src/elevation/model/__tests__/profileKinds.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import {
  ATTACH_POINTS, PIN_LABELS, PROFILE_KINDS, isProfileKind, migrateSectionProfile, profileKindLabel,
  profileKindOptions, profileMissingPins,
} from '../sectionProfiles.js';

const geometry = {
  units: 'in',
  points: { a: [0, 0], b: [0.5, 0], c: [0.5, -0.5] },
  loops: [{
    id: 'L1',
    closed: true,
    segs: [
      { type: 'line', from: 'a', to: 'b' },
      { type: 'line', from: 'b', to: 'c' },
      { type: 'line', from: 'c', to: 'a' },
    ],
  }],
};
const base = { id: 'sp-1', name: 'One', geometry, drawnPoints: { elevation: [] }, version: 1, archived: false };

describe('SPEC-48.1.1 profile kinds and pin points', () => {
  it('names one kind per profile, each with its axes and the pin points it needs', () => {
    expect(Object.keys(PROFILE_KINDS)).toEqual([
      'door_outside', 'door_inside', 'door_panel', 'applied_molding', 'crown', 'top_mold',
      'furniture_base', 'toe_kick', 'nosing', 'other',
    ]);
    expect(Object.fromEntries(Object.entries(PROFILE_KINDS).map(([kind, { pins }]) => [kind, pins]))).toEqual({
      door_outside: ['door_edge'],
      door_inside: ['frame_edge'],
      door_panel: ['panel_edge'],
      applied_molding: ['apply_point'],
      crown: ['box_top', 'box_front'],
      top_mold: ['box_top', 'box_front'],
      furniture_base: ['floor', 'box_front'],
      toe_kick: ['floor', 'box_front'],
      nosing: ['edge_top', 'edge_face'],
      other: [],
    });
    expect(Object.values(PROFILE_KINDS).map(({ axes }) => axes))
      .toEqual(['door', 'door', 'door', 'door', 'run', 'run', 'run', 'run', 'run', 'free']);
    expect([profileKindLabel('door_inside'), profileKindLabel('door_panel'), profileKindLabel('other'), profileKindLabel('shop_x')])
      .toEqual(['Door inside profile', 'Raised panel', 'Other', 'shop_x']);
    expect(Object.keys(PIN_LABELS)).toEqual(ATTACH_POINTS);
    expect([PIN_LABELS.frame_edge, PIN_LABELS.apply_point, PIN_LABELS.box_front])
      .toEqual(['Panel opening edge', 'Molding line', 'Box face']);
    expect([
      isProfileKind('crown'), isProfileKind('other'), isProfileKind('Crown'),
      isProfileKind('door_applied'), isProfileKind(undefined), isProfileKind('toString'),
    ]).toEqual([true, true, false, false, false, false]);
  });

  it('lists the pin points still missing, and the kinds a library uses', () => {
    expect([
      profileMissingPins({ ...base, kind: 'door_inside', attach: { frame_edge: 'a' } }),
      profileMissingPins({ ...base, kind: 'door_inside', attach: {} }),
      profileMissingPins({ ...base, kind: 'crown', attach: { box_front: 'a' } }),
      profileMissingPins({ ...base, kind: 'toe_kick', attach: { box_top: 'a' } }),
      profileMissingPins({ ...base, kind: 'other', attach: {} }),
      profileMissingPins({ ...base, kind: 'bogus', attach: {} }),
    ]).toEqual([[], ['frame_edge'], ['box_top'], ['floor', 'box_front'], [], []]);
    const list = [
      { ...base, kind: 'nosing' },
      { ...base, id: 'sp-2', kind: 'door_inside' },
      { ...base, id: 'sp-3', kind: 'nosing', archived: true },
      { ...base, id: 'sp-4', kind: 'crown' },
    ];
    expect([profileKindOptions(list), profileKindOptions([])]).toEqual([['door_inside', 'crown', 'nosing'], []]);
  });

  it('turns an older profile\'s tags into one kind and keeps only that kind\'s pins', () => {
    const old = (tags, attach) => ({ ...base, tags, attach });
    expect(migrateSectionProfile(old(['door_inside'], { frame_edge: 'a' })))
      .toEqual({ ...base, kind: 'door_inside', attach: { frame_edge: 'a' } });
    expect(migrateSectionProfile(old(['applied_molding'], { frame_edge: 'a', apply_point: 'b' })))
      .toEqual({ ...base, kind: 'applied_molding', attach: { apply_point: 'b' } });
    expect(migrateSectionProfile(old(['shop_ogee', 'crown', 'door_inside'], { box_top: 'a', box_front: 'a', frame_edge: 'b' })))
      .toEqual({ ...base, kind: 'crown', attach: { box_top: 'a', box_front: 'a' } });
    expect(migrateSectionProfile(old(['slab_applied'], {}))).toEqual({ ...base, kind: 'applied_molding', attach: {} });
    expect(migrateSectionProfile(old(['countertop_edge', 'light_rail'], { door_edge: 'a' })))
      .toEqual({ ...base, kind: 'other', attach: {} });
    expect(migrateSectionProfile(old([], {}))).toEqual({ ...base, kind: 'other', attach: {} });
    expect('tags' in migrateSectionProfile(old(['door_inside'], {}))).toBe(false);
    const current = { ...base, kind: 'crown', attach: { frame_edge: 'a' } };
    expect(migrateSectionProfile(current)).toBe(current);
    expect([migrateSectionProfile(null), migrateSectionProfile('x')]).toEqual([null, 'x']);
    const input = old(['door_inside'], { frame_edge: 'a', door_edge: 'b' });
    migrateSectionProfile(input);
    expect([input.tags, input.attach]).toEqual([['door_inside'], { frame_edge: 'a', door_edge: 'b' }]);
  });
});
```

**NEW `src/elevation/model/__tests__/profileTurns.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSectionProfile } from '../sectionProfiles.js';
import { mirrorProfile, rotateProfile } from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const SQUARE = newSectionProfile([], 'sp-sq');
const withPoints = (profile, points) => ({ ...profile, geometry: { ...profile.geometry, points } });

describe('SPEC-48.1.1 rotating and flipping a profile', () => {
  it('turns a profile a quarter turn at a time about 0, 0; arcs keep their direction', () => {
    expect(rotateProfile(SQUARE, 1))
      .toEqual(withPoints(SQUARE, { p1: [0, 0], p2: [0, 0.75], p3: [0.75, 0.75], p4: [0.75, 0] }));
    expect(rotateProfile(SQUARE, -1))
      .toEqual(withPoints(SQUARE, { p1: [0, 0], p2: [0, -0.75], p3: [-0.75, -0.75], p4: [-0.75, 0] }));
    expect(rotateProfile(SQUARE, 3)).toEqual(rotateProfile(SQUARE, -1));
    expect([rotateProfile(SQUARE, 0), rotateProfile(SQUARE, 4)]).toEqual([SQUARE, SQUARE]);
    const cove = rotateProfile(COVE, 1);
    expect(cove.geometry.points).toEqual({ a: [0, 0], b: [0, 0.5], c: [0.25, 0.75], d: [0.8125, 0.75], e: [0.8125, 0] });
    expect(cove.geometry.loops[0].segs[1]).toEqual({ type: 'arc', from: 'b', to: 'c', center: [0.25, 0.5], ccw: false });
    expect({ ...cove, geometry: COVE.geometry }).toEqual(COVE);
    expect(rotateProfile(COVE, 2).geometry.loops[0].segs[1].center).toEqual([-0.5, 0.25]);
  });

  it('flips a profile left-right or up-down about 0, 0; arcs change direction', () => {
    const cove = mirrorProfile(COVE, 'x');
    expect(cove.geometry.points).toEqual({ a: [0, 0], b: [-0.5, 0], c: [-0.75, -0.25], d: [-0.75, -0.8125], e: [0, -0.8125] });
    expect(cove.geometry.loops[0].segs[1]).toEqual({ type: 'arc', from: 'b', to: 'c', center: [-0.5, -0.25], ccw: true });
    expect({ ...cove, geometry: COVE.geometry }).toEqual(COVE);
    expect(mirrorProfile(CROWN, 'y').geometry.points)
      .toEqual({ c1: [0, 0], c2: [0, -4.5], c3: [3, -4.5], c4: [3, -3.75], c5: [0.5, 0] });
    expect(mirrorProfile(BEAD, 'y').geometry.loops[0].segs[0])
      .toEqual({ type: 'arc', from: 's', to: 't', center: [0.25, 0], ccw: true });
    expect(mirrorProfile(mirrorProfile(COVE, 'x'), 'x')).toEqual(COVE);
  });

  it('refuses a turn that is not a whole number and an unknown flip', () => {
    expect([
      rotateProfile(COVE, 1.5), rotateProfile(COVE, '1'), rotateProfile(COVE, Number.NaN),
      mirrorProfile(COVE, 'z'), mirrorProfile(COVE),
    ]).toEqual([null, null, null, null, null]);
    expect(COVE.geometry.points.b).toEqual([0.5, 0]);
  });
});
```

How the numbers come out:
- **Square, one turn** ((x, y) ↦ (−y, x)): p2 (0.75, 0) → (−0, 0.75) → `round6` → (0, 0.75); p3 (0.75, −0.75) → (0.75, 0.75); p4 (0, −0.75) → (0.75, 0). **−1 turn** ((x, y) ↦ (y, −x)): p2 → (0, −0.75), p3 → (−0.75, −0.75), p4 → (−0.75, −0) → (−0.75, 0).
- **Cove, one turn:** b (0.5, 0) → (0, 0.5); c (0.75, −0.25) → (0.25, 0.75); d (0.75, −0.8125) → (0.8125, 0.75); e (0, −0.8125) → (0.8125, 0); center (0.5, −0.25) → (0.25, 0.5). Radius to b and c is still 0.25. **Two turns:** center → (−0.5, 0.25).
- **Flips:** the cove across x = 0 negates every x (a and e give −0 → 0) and the arc turns counter-clockwise. The crown across y = 0 negates every y; the half bead's dome now points down, so its arc is `ccw: true`.

**Don't touch:** the validator and every existing export in `sectionProfiles.js`, the existing edits in `profileEditing.js`, the fixture, every existing test, the store, the components.

**Count:** 1142 + 6 = **1148**. Golden snapshot unchanged.

---

## §3 Step 440 — model switch: `kind` replaces `tags`

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/sectionProfiles.js` | (439) | validator, `PROFILE_SLOTS`, `profileFitsSlot`, `newSectionProfile`, `filterSectionProfiles`, `parseProfileFile` |
| `src/elevation/model/profileEditing.js` | (439) | add `setProfileKind` |
| `src/elevation/store/persistence.js` | 745 | **only** line 9 (import) and line 538 (normalize). Edit those two lines with a script; don't read the file. |
| `src/elevation/model/__tests__/fixtures/sectionProfiles.json` | 81 | lines 8, 34, 57 |
| `src/elevation/model/__tests__/sectionProfiles.test.js` | 95 | import line, two `it` blocks |
| `src/elevation/model/__tests__/sectionProfileHelpers.test.js` | 194 | import lines 5–9, three `it` blocks |
| `src/elevation/store/__tests__/sliceSectionProfiles.test.js` | 86 | lines 32, 36, 38 |
| `src/elevation/model/__tests__/profileAttach.test.js` | 55 | import line, one `it` block |
| `src/elevation/store/__tests__/sectionProfileSaves.test.js` | — | one import, one new test |

**Contract** (§1):

`sectionProfiles.js`:
- `isSectionProfile`: in the `hasKeys` key list, `'tags'` becomes `'kind'`. The two `tags` lines (array check and uniqueness, lines 107–108) become `|| !isProfileKind(profile.kind)`. Everything else stays (attach stays permissive).
- `PROFILE_SLOTS` → slot → kind: `{ door_outside: 'door_outside', door_inside: 'door_inside', door_panel: 'door_panel', door_applied: 'applied_molding', slab_applied: 'applied_molding', crown: 'crown', top_mold: 'top_mold', furniture_base: 'furniture_base', toe_kick: 'toe_kick', nosing: 'nosing' }`.
- `profileFitsSlot(profile, slot)` → `Object.hasOwn(PROFILE_SLOTS, slot) && profile.kind === PROFILE_SLOTS[slot] && profileMissingPins(profile).length === 0`. Doc: *a profile fits a slot of its own kind once all the kind's pins are set (SPEC-48.1.1)*.
- `newSectionProfile`: the new square gets `kind: 'other'` instead of `tags: []`. Copies keep the base's kind (already true through the deep copy).
- `filterSectionProfiles(profiles, { search = '', kind = null, showArchived = false } = {})`: `kind === null || profile.kind === kind` replaces the tag test.
- `parseProfileFile`: returns `file.profiles.map(migrateSectionProfile)` instead of `file.profiles`.
- **Keep, unchanged, for one more step:** `PROFILE_TAG_LABELS`, `isProfileTag`, `profileTagOptions`, `profileTagLabel`, `normalizeProfileTags`. The UI still imports them; step 441 removes them. Add `// Removed in step 441 (SPEC-48.1.1).` above each.

`profileEditing.js`:
- `setProfileKind(profile, kind)` → through `editProfile`: `kind` set, and `attach` reduced to the new kind's pins (keeping key order). `null` unless `isProfileKind(kind)`. Import `PROFILE_KINDS` and `isProfileKind` from `./sectionProfiles.js`.
- **Keep `profileSlotGaps` unchanged** for one more step (the Attach panel imports it; it's removed in 441). Add the same `// Removed in step 441` comment.

`persistence.js` (two lines only):
- Line 9: `import { isSectionProfileList, migrateSectionProfile } from '../model/sectionProfiles.js';`
- After line 538 (`if (settings.sectionProfiles === undefined) settings.sectionProfiles = [];`) add: `else if (Array.isArray(settings.sectionProfiles)) settings.sectionProfiles = settings.sectionProfiles.map(migrateSectionProfile);`

**Fixture** `fixtures/sectionProfiles.json`: line 8 `"tags": ["door_inside"],` → `"kind": "door_inside",`; line 34 `"tags": ["applied_molding"],` → `"kind": "applied_molding",`; line 57 `"tags": ["crown"],` → `"kind": "crown",`. Nothing else (the half bead keeps its spare `frame_edge`).

**Test edits.** Replace each named `it(...)` block whole (from `it(` to its closing `});`).

`model/__tests__/sectionProfiles.test.js`:
- Line 5: `ATTACH_POINTS, PROFILE_TAG_LABELS, isProfileGeometry, isSectionProfile, isSectionProfileList,` → `ATTACH_POINTS, PROFILE_KINDS, isProfileGeometry, isSectionProfile, isSectionProfileList,`
- Replace `it('starts with an empty library and names the known tags and attach points', …)` with:

```js
  it('starts with an empty library and names the kinds and attach points', () => {
    expect(DEFAULT_SETTINGS.sectionProfiles).toEqual([]);
    expect(Object.keys(PROFILE_KINDS)).toHaveLength(10);
    expect(ATTACH_POINTS).toEqual([
      'door_edge', 'frame_edge', 'panel_edge', 'apply_point', 'box_top', 'box_front', 'floor', 'edge_top', 'edge_face',
    ]);
    expect([COVE, BEAD, CROWN].map((profile) => isSectionProfile(profile))).toEqual([true, true, true]);
    expect([COVE.kind, BEAD.kind, CROWN.kind]).toEqual(['door_inside', 'applied_molding', 'crown']);
  });
```

- Replace `it('checks the profile: name, tags, attach and drawn points name real points, version and archived', …)` with:

```js
  it('checks the profile: name, kind, attach and drawn points name real points, version and archived', () => {
    expect([
      isSectionProfile({ ...COVE, kind: 'other' }),
      isSectionProfile({ ...COVE, attach: { frame_edge: 'a', door_edge: 'b' } }),
      isSectionProfile({ ...COVE, attach: {} }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: [] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['b'], plan: ['c'] } }),
      isSectionProfile({ ...COVE, name: '' }),
      isSectionProfile({ ...COVE, name: ' Cove' }),
      isSectionProfile({ ...COVE, kind: 'Door inside' }),
      isSectionProfile({ ...COVE, kind: undefined }),
      isSectionProfile({ ...COVE, tags: ['door_inside'] }),
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
      false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
    ]);
  });
```

`model/__tests__/sectionProfileHelpers.test.js`:
- Lines 5–9 (the import from `'../sectionProfiles.js'`) become:

```js
import {
  PROFILE_SLOTS, filterSectionProfiles, mergeImportedProfiles, newSectionProfile, parseProfileFile, profileFile,
  profileFitsSlot, sectionProfileBounds, sectionProfileSvgPath, sectionProfileUses,
} from '../sectionProfiles.js';
```

- Replace `it('fits a slot by attach points, never by tags', …)` with:

```js
  it('fits a slot of its own kind once the kind\'s pin points are all set', () => {
    expect(PROFILE_SLOTS).toEqual({
      door_outside: 'door_outside',
      door_inside: 'door_inside',
      door_panel: 'door_panel',
      door_applied: 'applied_molding',
      slab_applied: 'applied_molding',
      crown: 'crown',
      top_mold: 'top_mold',
      furniture_base: 'furniture_base',
      toe_kick: 'toe_kick',
      nosing: 'nosing',
    });
    expect([
      profileFitsSlot(COVE, 'door_inside'),
      profileFitsSlot(BEAD, 'door_applied'),
      profileFitsSlot(BEAD, 'slab_applied'),
      profileFitsSlot(CROWN, 'crown'),
      profileFitsSlot(COVE, 'door_applied'),
      profileFitsSlot(COVE, 'door_outside'),
      profileFitsSlot({ ...COVE, attach: {} }, 'door_inside'),
      profileFitsSlot(CROWN, 'top_mold'),
      profileFitsSlot({ ...CROWN, attach: { box_top: 'c1' } }, 'crown'),
      profileFitsSlot(CROWN, 'sticking'),
      profileFitsSlot({ ...COVE, kind: 'other', attach: {} }, 'door_inside'),
    ]).toEqual([true, true, true, true, false, false, false, false, false, false, false]);
  });
```

- In `it('makes a new 3/4" square profile or a copy, with the next free name', …)`: line 98 `tags: [],` → `kind: 'other',`; line 122 `copy.tags === CROWN.tags` → `copy.attach === CROWN.attach`. Nothing else in that block.
- Replace `it('filters by name, tag and archived, and offers known tags then the team\'s own', …)` with:

```js
  it('filters by name, kind and archived', () => {
    const list = [COVE, BEAD, { ...CROWN, archived: true }];
    const ids = (options) => filterSectionProfiles(list, options).map(({ id }) => id);
    expect([
      ids(undefined),
      ids({ showArchived: true }),
      ids({ search: '  COVE ' }),
      ids({ search: 'crown' }),
      ids({ search: 'crown', showArchived: true }),
      ids({ kind: 'applied_molding' }),
      ids({ kind: 'crown' }),
      ids({ kind: 'crown', showArchived: true }),
      ids({ kind: 'door_outside' }),
    ]).toEqual([
      ['sp-cove', 'sp-bead'],
      ['sp-cove', 'sp-bead', 'sp-crown'],
      ['sp-cove'],
      [],
      ['sp-crown'],
      ['sp-bead'],
      [],
      ['sp-crown'],
      [],
    ]);
  });
```

`store/__tests__/sliceSectionProfiles.test.js`:
- Line 32: the title `'saves name and tag edits without a new version; a shape edit bumps it'` → `'saves name and kind edits without a new version; a shape edit bumps it'`.
- Lines 36 and 38: `tags: ['door_inside', 'door_outside']` → `kind: 'other'` (both places). Nothing else.

`model/__tests__/profileAttach.test.js`:
- Line 3: `import { profileSlotGaps, setProfileAttach } from '../profileEditing.js';` → `import { setProfileAttach, setProfileKind } from '../profileEditing.js';`
- Replace `it('reports tagged slots the attach points do not fit yet, with the names still missing', …)` with:

```js
  it('changes the kind and drops pin points the new kind does not use', () => {
    expect(setProfileKind(COVE, 'door_outside')).toEqual({ ...COVE, kind: 'door_outside', attach: {} });
    expect(setProfileKind(BEAD, 'applied_molding')).toEqual({ ...BEAD, attach: { apply_point: 's' } });
    expect(setProfileKind(CROWN, 'top_mold')).toEqual({ ...CROWN, kind: 'top_mold' });
    expect(setProfileKind(CROWN, 'nosing')).toEqual({ ...CROWN, kind: 'nosing', attach: {} });
    expect(setProfileKind(COVE, 'other')).toEqual({ ...COVE, kind: 'other', attach: {} });
    expect(setProfileKind(COVE, 'door_inside')).toEqual(COVE);
    expect([setProfileKind(COVE, 'door_applied'), setProfileKind(COVE, ''), setProfileKind(COVE, undefined)])
      .toEqual([null, null, null]);
    expect(COVE.kind).toBe('door_inside');
  });
```

`store/__tests__/sectionProfileSaves.test.js`:
- Add `import { parseProfileFile } from '../../model/sectionProfiles.js';` after the `DEFAULT_SETTINGS` import.
- Add this test as the last `it` in the `describe`:

```js
  it('turns an older library\'s tags into kinds, on load and on import', () => {
    const old = { ...sample.profiles[0], tags: ['shop_ogee', 'door_inside'], attach: { frame_edge: 'a', door_edge: 'e' } };
    delete old.kind;
    const saved = older();
    saved.settings.sectionProfiles = [old];
    const loaded = normalizeElevationDocument(saved);
    expect(loaded.settings.sectionProfiles).toEqual([sample.profiles[0]]);
    expect(isElevationDocument(loaded)).toBe(true);
    expect(parseProfileFile(JSON.stringify({ kind: 'section-profiles', version: 1, profiles: [old] })))
      .toEqual([sample.profiles[0]]);
  });
```

How the numbers come out: the cove is kind `door_inside` with `frame_edge → a`, so it fits `door_inside` only. The half bead is `applied_molding` with `apply_point → s`, so it fits both applied-molding slots; its spare `frame_edge` is ignored, and `setProfileKind` (even to the same kind) drops it. The crown is kind `crown`, so it doesn't fit `top_mold`; set to Top mold, it keeps both pins because Top mold uses the same two. The old cove in the last test has `shop_ogee` first (not a kind, skipped), then `door_inside`; `door_edge` isn't a door-inside pin, so it's dropped, which leaves exactly the sample cove.

**Don't touch:** every other part of `persistence.js`, the 439 tests, `profileEditing.test.js`, `profileLoops.test.js`, `profileDrawn.test.js`, the store slices, the components (the UI is step 441).

**Count:** 1148 + 1 = **1149**. Golden snapshot unchanged. ⚠ Any other failing test that only fails because a profile now needs `kind` instead of `tags`: report it, don't edit it.

---

## §4 Step 441 — UI switch: Profiles page, Details dialog, editor header; remove tag exports

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/library/ProfilesPage.jsx` | 228 | kind chips, kind pill, pin status |
| `src/library/ProfileDetailsDialog.jsx` | 112 | Kind select replaces the tag fields; `showKind` prop |
| `src/library/profileEditor/ProfileEditorPage.jsx` | 195 | header kind pill (line 133) |
| `src/library/profileEditor/AttachPanel.jsx` | 112 | drop the gaps block (deleted in 442 anyway) |
| `src/elevation/model/sectionProfiles.js` | (440) | delete `PROFILE_TAG_LABELS`, `isProfileTag`, `profileTagOptions`, `profileTagLabel`, `normalizeProfileTags` |
| `src/elevation/model/profileEditing.js` | (440) | delete `profileSlotGaps`; drop imports it alone used |

**Contract.**
- **ProfilesPage.jsx:**
  - Imports: `profileTagLabel, profileTagOptions` → `PIN_LABELS, profileKindLabel, profileKindOptions, profileMissingPins`.
  - State `tag` / `setTag` → `kind` / `setKind`; `filterSectionProfiles(profiles, { search, kind, showArchived })`.
  - Chips (line 111 on): `[null, ...profileKindOptions(profiles)]`, labels `profileKindLabel(option)`, keys `kind-${option}`. Same classes and behaviour.
  - Card: the tag pills block (lines 158–162) becomes one pill `profileKindLabel(profile.kind)` (same pill classes).
  - The `v{version} · …` line (line 163): `v{version} · {status}`. Status: `no pin points` when the kind is `other`; `ready` when `profileMissingPins(profile)` is empty; else `needs {missing labels joined ', '}` using `PIN_LABELS`. Remove the unused `attachPoints` variable.
  - Nothing else changes (New still opens the Details dialog, where the kind is chosen).
- **ProfileDetailsDialog.jsx** — `ProfileDetailsDialog({ profile, onClose, showKind = true })`:
  - Remove the tag state (`checkedTags`, `other`, `knownTags`, `tags`), the Tags fieldset, the Other tags input, the tag part of `reason`, and the imports they used. `reason` is now only *Name is required*.
  - Add `const [kind, setKind] = useState(profile.kind);`. When `showKind`, right after Name: a `<label>` *Kind* with `<select aria-label="Kind">` (same input class) listing every `PROFILE_KINDS` entry as `<option value={key}>{label}</option>`. Under it, `text-xs text-gray-500`: *The kind sets which way the shape is drawn and which pin points it needs. To use the same shape as another kind, Copy it and change the copy's kind.* When `kind !== profile.kind`, also `text-xs text-amber-300`: *Changing the kind clears pin points the new kind doesn't use.*
  - The attach line (`attachPoints`) becomes a pins line for the selected `kind`: each pin of `PROFILE_KINDS[kind].pins` as `{PIN_LABELS[name]} → {profile.attach[name] ?? 'not set'}`, joined `', '`, prefixed *Pin points:*; for `other`, *Other profiles have no pin points.*
  - The line *The shape, attach points and drawn points are edited with Edit shape.* → *The shape, pin points and drawn points are edited with Edit shape.*
  - Save: `const base = { ...profile, name: name.trim() }; const next = showKind ? setProfileKind(base, kind) : base;` then, when `next` isn't null, `dispatch(updateSectionProfile({ profileId: profile.id, profile: next }))` and close.
  - Imports: `PIN_LABELS`, `PROFILE_KINDS` from `'../elevation/model/sectionProfiles.js'`; `setProfileKind` from `'../elevation/model/profileEditing.js'`.
- **ProfileEditorPage.jsx:** import `profileKindLabel` instead of `profileTagLabel`; line 133 becomes one pill `profileKindLabel(saved.kind)` (same classes). Nothing else in this step.
- **AttachPanel.jsx:** remove the `profileSlotGaps(profile).map(…)` block (lines ~105–109) and the `profileTagLabel` and `profileSlotGaps` imports. Nothing else. (The "Fits slots" line still works with the new `profileFitsSlot`.)
- **sectionProfiles.js / profileEditing.js:** delete the six exports marked *Removed in step 441* and any import only they used (`PROFILE_SLOTS` and `profileFitsSlot` in `profileEditing.js`, if nothing else there uses them). Then `grep -rn "profileTag\|PROFILE_TAG_LABELS\|isProfileTag\|normalizeProfileTags\|profileSlotGaps\|\.tags" src/library src/elevation/model/sectionProfiles.js src/elevation/model/profileEditing.js` must print nothing.

**Don't touch:** the store, persistence, the tests, `PointsPanel.jsx`, `DrawnPanel.jsx`, the canvas, other pages. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1149 tests.

---

## §5 Step 442 — UI: Kind and pin points panel; kind in the draft

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/library/profileEditor/PinsPanel.jsx` | — | the panel |
| DELETE `src/library/profileEditor/AttachPanel.jsx` | 112 | `git rm` |
| `src/library/profileEditor/useProfileDraft.js` | 50 | `shape` includes `kind` |
| `src/library/profileEditor/ProfileEditorPage.jsx` | (441) | PinsPanel in place of AttachPanel; Save writes kind; header pill from the draft; Details name-only |

**Contract.**
- **`PinsPanel({ profile, selectedPointId, onApply })`.** Class constants copied the way `PointsPanel.jsx` does (lines 10–12); small select look `rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100`. Two file-local constants:
  - `PIN_HELP` (shown under each pin's label):

    | Pin | Help |
    |---|---|
    | `door_edge` | The point on the door's outside edge, at the front face. |
    | `frame_edge` | The point where this profile meets the panel opening, at the front face. |
    | `panel_edge` | The point where the panel meets the frame opening. |
    | `apply_point` | The point of the molding that sits on the line it's applied along. |
    | `box_top` | The point level with the top of the cabinet box. For crown it's usually the same corner as Box face. |
    | `box_front` | The point against the front face of the box. |
    | `floor` | The point that sits on the floor. |
    | `edge_top` | The point level with the top of the part. |
    | `edge_face` | The point against the front edge of the part. |

  - `SLOT_LABELS`: `door_outside` *door outside edge*, `door_inside` *door inside profile*, `door_panel` *door panel*, `door_applied` *applied molding on 5-piece doors*, `slab_applied` *applied molding on slab doors*, `crown` *crown*, `top_mold` *top mold*, `furniture_base` *furniture base*, `toe_kick` *toe kick*, `nosing` *nosing*.
  - Layout (`section`, `space-y-3`):
    - Heading *Kind and pin points* (`text-sm font-medium text-gray-200`).
    - **Kind** select (`aria-label="Kind"`, every `PROFILE_KINDS` entry by label) → `onApply(setProfileKind(profile, value), 'That kind couldn't be set.')`.
    - A `text-xs text-gray-500` line by the kind's `axes`: door → *Door profile: the front face is the top line (y = 0); x runs in toward the middle of the door; y goes down into the door.* run → *Run molding: x runs out from the box toward the room; y runs up.* free → *Other: not used by doors or runs yet; draw it any way you like.* Then: *Changing the kind clears pin points it doesn't use.*
    - For each pin of the kind, a block (`space-y-1`):
      - the label `PIN_LABELS[name]` (`text-xs font-medium text-gray-200`) and `PIN_HELP[name]` (`text-xs text-gray-500`);
      - a row: a `<select aria-label="{label} point">` with a first option `value=""` *— not set —* then every point id in `points` order, value `profile.attach[name] ?? ''`. Change → `setProfileAttach(profile, name, value === '' ? null : value)`;
      - when `selectedPointId` is set and differs from the pin's point, a button **Use selected point ({selectedPointId})** (the small `BUTTON_CLASS` look) → `setProfileAttach(profile, name, selectedPointId)`;
      - when the pin isn't set and no point is selected, `text-xs text-amber-300`: *Click a point on the drawing, then press Use selected point.*
      - Fail text for these: *That point no longer exists.*
    - Status line: kind `other` → `text-xs text-gray-500` *Other profiles have no pin points and can't be picked by doors or runs yet.* All pins set → `text-xs text-green-400` *Ready — can be picked for {labels}.* where labels = `SLOT_LABELS` of every `PROFILE_SLOTS` key whose value is the kind, joined *' and '* for two, `', '` otherwise. Pins missing → `text-xs text-amber-300` *Still needs: {PIN_LABELS of profileMissingPins(profile), joined ', '}.*
  - Imports: `PIN_LABELS`, `PROFILE_KINDS`, `PROFILE_SLOTS`, `profileMissingPins` from `'../../elevation/model/sectionProfiles.js'`; `setProfileAttach`, `setProfileKind` from `'../../elevation/model/profileEditing.js'`.
- **`useProfileDraft.js`:** `shape = (profile) => JSON.stringify([profile.kind, profile.geometry, profile.attach, profile.drawnPoints])`. Nothing else.
- **`ProfileEditorPage.jsx`:**
  - Import `PinsPanel` instead of `AttachPanel`; render `<PinsPanel profile={draft} selectedPointId={…same expression…} onApply={apply} />` in AttachPanel's place.
  - Save: `profile: { ...saved, kind: draft.kind, geometry: draft.geometry, attach: draft.attach, drawnPoints: draft.drawnPoints }`.
  - Header pill: `profileKindLabel(draft.kind)` (the draft's kind, so it follows the panel before Save).
  - Details dialog: pass `showKind={false}` (the editor's dialog edits the name only).

**Don't touch:** the model, the store, `PointsPanel.jsx`, `DrawnPanel.jsx`, the canvas, `ProfileDetailsDialog.jsx`, `ProfilesPage.jsx`. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1149 tests.

---

## §6 Step 443 — UI: canvas hints and pin labels; Rotate and Flip; note text

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/library/profileEditor/ProfileCanvas.jsx` | 288 | y = 0 label and direction hint by kind; pin labels on markers; legend text |
| `src/library/profileEditor/ProfileEditorPage.jsx` | (442) | Rotate / Flip toolbar buttons; note text |

**Contract.**
- **ProfileCanvas.jsx** (import `PIN_LABELS`, `PROFILE_KINDS` from `'../../elevation/model/sectionProfiles.js'`; `axes = PROFILE_KINDS[drawnProfile.kind]?.axes ?? 'free'`):
  - The y = 0 axis label (line 226): `face (y = 0)` when `axes === 'door'`, else `y = 0`. The x = 0 label stays.
  - `attachNames` (line 168 on): only collect names that are pins of the kind (`PROFILE_KINDS[kind].pins`), so spare attach names aren't drawn. The marker text (line 252) shows `PIN_LABELS[name]` instead of the raw name, joined `', '`.
  - A direction hint, `pointer-events-none absolute right-2 top-2 rounded bg-gray-800/80 px-2 py-1 text-xs text-gray-300`: door → *Door profile · face on top · x → toward the door's middle · y ↓ into the door*; run → *Run molding · x → out from the box · y ↑ up*; free → *Other · x → · y ↑*.
  - The legend text (line 282 on) → *◇ pin point · ○ drawn (solid: elevation, dashed: plan only)*. Same condition and classes.
  - Leave everything else as it is.
- **ProfileEditorPage.jsx:**
  - Import `rotateProfile`, `mirrorProfile` from `'../../elevation/model/profileEditing.js'` (add to the existing import).
  - In the canvas toolbar, after **Fit** and before the Grid label, four buttons with the Fit button's classes:
    - **⟲** (`title="Rotate 90° counter-clockwise about 0, 0"`, `aria-label="Rotate counter-clockwise"`) → `apply(rotateProfile(draft, 1), TURN_FAILURE)`;
    - **⟳** (`title="Rotate 90° clockwise about 0, 0"`, `aria-label="Rotate clockwise"`) → `rotateProfile(draft, -1)`;
    - **⇆** (`title="Flip left–right across x = 0"`, `aria-label="Flip left-right"`) → `mirrorProfile(draft, 'x')`;
    - **⇅** (`title="Flip up–down across y = 0"`, `aria-label="Flip up-down"`) → `mirrorProfile(draft, 'y')`;
    - `const TURN_FAILURE = 'That turn would make the shape invalid.';` at file level.
  - The bottom note becomes exactly: *Pick the kind first: it sets which way the shape is drawn and which pin points it needs. To turn or flip the shape about a pin, press Origin on that point first. Drawn points become lines in each view. Line tool: click points, click the first point to close, Enter to finish open. Select a segment to make it an arc.*

**Don't touch:** the model, the store, `PinsPanel.jsx`, `PointsPanel.jsx`, `DrawnPanel.jsx`, other pages. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1149 tests.

---

## End-to-end check (Kyle, after 443)

- **Older profiles load.** Open Library → Profiles. Anything you made in 47/48.1 is still there with a kind pill (from its first tag, or *Other*). Import the sample file `cabinetry_designer/src/elevation/model/__tests__/fixtures/sectionProfiles.json`: Cove 1/4 reads *Door inside profile · ready*, Half bead *Applied molding · ready*, Crown 4 1/2 *Crown · ready*.
- **New profile:** **New profile** → the dialog shows **Kind**. Pick *Door inside profile*, Save. The card reads *needs Panel opening edge*.
- **Edit shape** on it: the right panel starts with **Kind and pin points**: *Panel opening edge — The point where this profile meets the panel opening, at the front face.* and *Still needs: Panel opening edge.* The top-right of the canvas says *Door profile · face on top …*.
- Click the corner on the opening side at the face, press **Use selected point (p…)**: the amber diamond appears labelled *Panel opening edge* and the status turns green: *Ready — can be picked for door inside profile.*
- Change Kind to *Crown*: two pins appear (*Top of box*, *Box face*), the old pin is cleared, the hint says *Run molding …*, the y = 0 label is plain `y = 0`. **Ctrl+Z** puts it back to Door inside with its pin.
- **Rotate / Flip:** press **Origin** on the pinned point, then ⟲: the shape turns a quarter turn about it; ⇆ mirrors it. Undo each.
- **Copy as another kind:** on the Profiles page, **Copy** the cove, open the copy's **Details**, set Kind to *Applied molding* (the amber line warns the pin will clear), Save. **Edit shape** on the copy, turn or flip it as needed, set its *Molding line* pin, Save.
- Save shows `v2` when a shape, pin or drawn point changed; changing only the name doesn't bump it.

**Known for now:**
- Rotating is in quarter turns about 0, 0 only; put a pin at the origin first.
- *Other* profiles can't be picked by any slot yet.
- Profiles still aren't used in rooms until round 50.

---

## Plan updates to make at the next plan edit

- **P1** (one profile table, kinds as tags) → *one kind per profile*; a shape used as two kinds is copied (Kyle, 2026-10-08).
- **P3** (slots validate, tags only filter) → *a slot takes one kind; the profile fits once that kind's pin points are set*. Applied molding is one kind with pin `apply_point`, fitting both applied-molding slots.
- §2: the profile JSON has `"kind": "door_inside"` instead of `"tags"`; add the kinds/pins table from §1 here; note that "pin points" is the UI word for attach points.
- §10: add row 48.1.1 (steps 439–443); mark 48 and 48.1 ✅.
