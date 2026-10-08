# Round 48.1 — SPEC: attach points, drawn points and tags in the profile editor

Steps 434–438, designer only, on branch `elevation-doors` (after step 433, 1136 tests). Geometry and the API don't change. No Supabase (plan P18).
DOORS-PROFILES-PLAN §2 (attach points per slot), P3, P4, §10 row 48.1, open question 3. Builds on SPEC-47 (`ATTACH_POINTS`, `PROFILE_SLOTS`, `profileFitsSlot`) and SPEC-48 (`model/profileEditing.js`, the editor page).

**Done when:**
- The editor's right panel has an **Attach points** section. It lists the profile's attach points (name → point), lets you change or clear each one, adds more from the nine known names, and shows which slots the profile now fits. A tagged slot the profile doesn't fit yet is called out with the attach names it still needs.
- It also has a **Drawn points** section: one row per point with an **Elevation** and a **Plan** checkbox, a "plan uses the same points as elevation" switch, and **All shape points** / **None** buttons.
- The canvas marks attach points (amber diamond plus the attach name) and drawn points (blue ring: solid = drawn in elevation, dashed = plan only), with a small legend.
- The editor header has a **Details** button (name and tags, the dialog from SPEC-47) and shows the tags.
- Every change is a draft edit: undo/redo works, **Save** writes through `updateSectionProfile`, and an attach or drawn-point change bumps the version (SPEC-47 P7).
- Nothing is drawn into a room yet. Door styles and runs pick profiles in round 50.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **434** | designer | Model: `setProfileAttach`, `profileSlotGaps` | 1136 → **1139** |
| **435** | designer | Model: drawn-point edits (`setProfileDrawnPoint`, `setProfileDrawnPoints`, `setProfilePlanSameAsElevation`, `profileDrawnIn`, `profileVertexIds`) | **1142** |
| **436** | designer | UI: Attach points panel, slots it fits | 1142 |
| **437** | designer | UI: Drawn points panel | 1142 |
| **438** | designer | UI: canvas markers and legend, Details button and tags in the header, text updates | 1142 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Every expected value in the tests was worked out by hand from the rules below and the sample profiles in `fixtures/sectionProfiles.json`. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got.

---

## §1 Decisions (Claude's defaults, 2026-10-08 — Kyle can overrule)

- **All new edits live in `src/elevation/model/profileEditing.js`**, next to the round-48 edits, with the same rules: pure functions, `structuredClone` through the file's existing internal `editProfile` helper, `null` for any bad argument or any result that fails `isSectionProfile`, never touch `id`, `name`, `tags`, `version` or `archived`. A change that leaves the profile as it was still returns an equal profile (not `null`).
- **Attach points.**
  - Only the nine names in `ATTACH_POINTS` can be set. A value is a point id that exists, or `null` to clear.
  - Two names may share a point (the crown's `box_top` and `box_front` both sit on `c1`).
  - **Key order is kept**: changing a name that's already there keeps its position, a new name goes last, clearing removes it. That keeps "changed or not" (the version bump compares `JSON.stringify`) from flickering when someone sets a name and clears it again.
- **Drawn points: none by default (plan open question 3).** A new or copied profile already starts with `elevation: []`. The panel has an **All shape points** button for the usual "draw every corner" case. If Kyle would rather start with every shape point drawn, that's a later change to `newSectionProfile`; it isn't in 48.1.
- **Plan follows elevation until it gets its own list.** `drawnPoints.plan` missing means "same as elevation" (plan §2). Editing a plan checkbox, or clicking a plan button, gives it its own list (a copy of elevation with the change applied). The **same as elevation** switch deletes the list again, and turning it off copies elevation. Editing elevation while plan follows moves both; while plan has its own list it's left alone.
- **Drawn lists are kept in `points` order**, whatever order the clicks came in. Output is predictable and the table shows the same order. Any point may be drawn, including one no segment uses (a reference point).
- **A "shape point"** (`profileVertexIds`) is a point some segment starts or ends at. **All shape points** draws those and leaves reference points out.
- **Slot gaps (P3 says tags only filter, never decide fit).** `profileSlotGaps` only helps the person: for each tag that is itself a slot name (`door_outside`, `door_inside`, `door_panel`, `crown`, `top_mold`, `furniture_base`, `toe_kick`, `nosing`, or a team tag spelled like a slot such as `door_applied`) and where the profile doesn't fit that slot, it reports the attach names still missing. Tags that aren't slot names (`applied_molding`, `countertop_edge`, `light_rail`, team tags) are ignored, because `applied_molding` could be a 5-piece or a slab molding. The **Fits** list shows the truth either way.
- **Tags stay in the Details dialog (SPEC-48).** The plan lists tags under 48.1, so the editor gets a **Details** button that opens the same dialog, plus tag pills in the header. Details saves name and tags from the stored profile and never touches the draft or its undo history.
- **Canvas markers are drawn on the editor canvas only.** What a room draws from a profile is round 50.
- **Not in 48.1:** choosing a profile in the door style tool (50), fit checks against a door (50), an attach point on a segment edge or at a position along a segment (points only), auto-guessing attach points from tags, editing from over the room (48.2), DXF import (49).

---

## §2 Step 434 — model: attach points and slot gaps

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/profileEditing.js` | 338 | add `setProfileAttach`, `profileSlotGaps`; import `ATTACH_POINTS`, `PROFILE_SLOTS` from `./sectionProfiles.js` (the file already imports `isSectionProfile` from there) |
| NEW `src/elevation/model/__tests__/profileAttach.test.js` | — | 3 tests, verbatim |

**Contract** (§1 rules; use the file's existing `editProfile`; one-line doc comment on each export naming SPEC-48.1):

- `setProfileAttach(profile, name, pointId)` → the profile with `attach[name] = pointId`, or with `name` removed when `pointId === null`.
  - `null` when `name` isn't in `ATTACH_POINTS`, or `pointId` is neither `null` nor the id of an existing point (`undefined` and numbers are refused).
  - An existing name keeps its key position; a new name is added last.
  - Clearing a name that isn't set, or setting it to the point it already has, returns an equal profile.
- `profileSlotGaps(profile)` → an array of `{ tag, slot, missing }`, in the order of `profile.tags`.
  - Only a tag that is a key of `PROFILE_SLOTS` is considered, and only when `profileFitsSlot(profile, tag)` is false.
  - `slot` is the same string as `tag`.
  - `missing`: among the slot's options, take the one with the fewest names not in `profile.attach` (the first option on a tie). `missing` is that option's names that aren't in `attach`, in the option's own order.
  - It doesn't validate the profile and never returns `null`.

**NEW `src/elevation/model/__tests__/profileAttach.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { profileSlotGaps, setProfileAttach } from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;

describe('SPEC-48.1 editing attach points', () => {
  it('sets, replaces and clears an attach point, keeping the key order and everything else', () => {
    const added = setProfileAttach(COVE, 'door_edge', 'e');
    expect(added.attach).toEqual({ frame_edge: 'a', door_edge: 'e' });
    expect(Object.keys(added.attach)).toEqual(['frame_edge', 'door_edge']);
    expect([added.geometry, added.drawnPoints, added.version]).toEqual([COVE.geometry, COVE.drawnPoints, 1]);
    expect(COVE.attach).toEqual({ frame_edge: 'a' });
    const replaced = setProfileAttach(BEAD, 'frame_edge', 't');
    expect(replaced.attach).toEqual({ frame_edge: 't', apply_point: 's' });
    expect(Object.keys(replaced.attach)).toEqual(['frame_edge', 'apply_point']);
    expect(setProfileAttach(CROWN, 'box_front', 'c5').attach).toEqual({ box_top: 'c1', box_front: 'c5' });
    expect(setProfileAttach(BEAD, 'apply_point', null).attach).toEqual({ frame_edge: 's' });
    expect(setProfileAttach(COVE, 'frame_edge', null).attach).toEqual({});
    expect(setProfileAttach(setProfileAttach(COVE, 'frame_edge', null), 'frame_edge', 'a')).toEqual(COVE);
    expect(setProfileAttach(COVE, 'door_edge', null)).toEqual(COVE);
    expect(setProfileAttach(COVE, 'frame_edge', 'a')).toEqual(COVE);
  });

  it('refuses an unknown attach name, an unknown point, or a value that is not a point id or null', () => {
    expect([
      setProfileAttach(COVE, 'sticking', 'a'),
      setProfileAttach(COVE, '', 'a'),
      setProfileAttach(COVE, 'frame_edge', 'q'),
      setProfileAttach(COVE, 'frame_edge', undefined),
      setProfileAttach(COVE, 'frame_edge', 3),
    ]).toEqual([null, null, null, null, null]);
  });

  it('reports tagged slots the attach points do not fit yet, with the names still missing', () => {
    expect([COVE, BEAD, CROWN].map((profile) => profileSlotGaps(profile))).toEqual([[], [], []]);
    const tagged = { ...COVE, tags: ['door_inside', 'door_outside', 'crown', 'shop_ogee', 'door_panel'] };
    expect(profileSlotGaps(tagged)).toEqual([
      { tag: 'door_outside', slot: 'door_outside', missing: ['door_edge'] },
      { tag: 'crown', slot: 'crown', missing: ['box_top', 'box_front'] },
      { tag: 'door_panel', slot: 'door_panel', missing: ['panel_edge'] },
    ]);
    const half = { ...CROWN, tags: ['crown', 'top_mold', 'toe_kick'], attach: { box_top: 'c1' } };
    expect(profileSlotGaps(half)).toEqual([
      { tag: 'crown', slot: 'crown', missing: ['box_front'] },
      { tag: 'top_mold', slot: 'top_mold', missing: ['box_front'] },
      { tag: 'toe_kick', slot: 'toe_kick', missing: ['floor', 'box_front'] },
    ]);
    expect(profileSlotGaps({ ...COVE, tags: ['door_applied'], attach: {} }))
      .toEqual([{ tag: 'door_applied', slot: 'door_applied', missing: ['frame_edge'] }]);
    expect(profileSlotGaps({ ...COVE, tags: ['door_applied'], attach: { panel_edge: 'a' } })).toEqual([]);
    expect(profileSlotGaps({ ...COVE, tags: [] })).toEqual([]);
  });
});
```

How the numbers come out: the cove has `attach { frame_edge: 'a' }` and tag `door_inside`, so it fits its slot and has no gaps. The half bead's tag `applied_molding` isn't a slot name, so it's ignored. The crown has both `box_top` and `box_front`. For `door_applied` the two options `[frame_edge]` and `[panel_edge]` are each missing one name, so the first wins.

**Don't touch:** `sectionProfiles.js`, the 429/430 tests, every other model file, the store, the components.

**Count:** 1136 + 3 = **1139**. Golden snapshot unchanged.

---

## §3 Step 435 — model: drawn-point edits

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/profileEditing.js` | (434) | add the five exports below |
| NEW `src/elevation/model/__tests__/profileDrawn.test.js` | — | 3 tests, verbatim |

**Contract** (§1 rules; `view` is `'elevation'` or `'plan'`; one-line doc comment on each export naming SPEC-48.1). Keep one small internal helper that orders a list of ids by `Object.keys(points)` and the rest follows from it.

- `profileDrawnIn(profile, view)` → a **new array**: `drawnPoints.elevation` for `'elevation'`; `drawnPoints.plan ?? drawnPoints.elevation` for `'plan'`; `[]` for any other view. Doesn't validate.
- `profileVertexIds(profile)` → the ids of points that some segment of any loop starts or ends at, in `points` order. Doesn't validate.
- `setProfileDrawnPoint(profile, view, pointId, drawn)` → the list for `view` (for `'plan'`, starting from `profileDrawnIn(profile, 'plan')`, so a missing plan list is copied from elevation first) with `pointId` added or removed, ordered by `points` order, written to `drawnPoints[view]`. The other view's key is untouched. `null` for a bad view, an unknown point, or a `drawn` that isn't a boolean.
- `setProfileDrawnPoints(profile, view, ids)` → `drawnPoints[view]` becomes `ids` ordered by `points` order. `null` for a bad view, `ids` that isn't an array, a repeated id, or an unknown id. An empty array is fine.
- `setProfilePlanSameAsElevation(profile, same)` → `same === true` deletes `drawnPoints.plan` (a no-op when it's already missing); `same === false` sets `plan` to a copy of `elevation` when `plan` is missing (a no-op when it already has its own list). `null` when `same` isn't a boolean.

**NEW `src/elevation/model/__tests__/profileDrawn.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addProfilePoint, profileDrawnIn, profileVertexIds, setProfileDrawnPoint, setProfileDrawnPoints,
  setProfilePlanSameAsElevation,
} from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;

describe('SPEC-48.1 editing drawn points', () => {
  it('draws and un-draws a point in elevation; the list stays in points order', () => {
    const added = setProfileDrawnPoint(COVE, 'elevation', 'a', true);
    expect(added.drawnPoints).toEqual({ elevation: ['a', 'b', 'c'] });
    expect(setProfileDrawnPoint(added, 'elevation', 'b', false).drawnPoints).toEqual({ elevation: ['a', 'c'] });
    expect(setProfileDrawnPoint(COVE, 'elevation', 'b', true)).toEqual(COVE);
    expect(setProfileDrawnPoint(COVE, 'elevation', 'e', false)).toEqual(COVE);
    const crossed = { ...COVE, drawnPoints: { elevation: ['c', 'b'] } };
    expect(setProfileDrawnPoint(crossed, 'elevation', 'a', true).drawnPoints).toEqual({ elevation: ['a', 'b', 'c'] });
    expect(setProfileDrawnPoint(CROWN, 'elevation', 'c1', true).drawnPoints)
      .toEqual({ elevation: ['c1', 'c3', 'c4', 'c5'], plan: ['c3'] });
    expect(COVE.drawnPoints).toEqual({ elevation: ['b', 'c'] });
  });

  it('gives plan its own list only when it is edited, and takes it away again', () => {
    expect(setProfileDrawnPoint(COVE, 'plan', 'c', false).drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['b'] });
    expect(setProfileDrawnPoint(COVE, 'plan', 'd', true).drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['b', 'c', 'd'] });
    expect(setProfileDrawnPoint(CROWN, 'plan', 'c5', true).drawnPoints)
      .toEqual({ elevation: ['c3', 'c4', 'c5'], plan: ['c3', 'c5'] });
    const same = setProfilePlanSameAsElevation(CROWN, true);
    expect(same.drawnPoints).toEqual({ elevation: ['c3', 'c4', 'c5'] });
    expect('plan' in same.drawnPoints).toBe(false);
    expect(setProfilePlanSameAsElevation(COVE, false).drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['b', 'c'] });
    expect(setProfilePlanSameAsElevation(COVE, true)).toEqual(COVE);
    expect(setProfilePlanSameAsElevation(CROWN, false)).toEqual(CROWN);
    expect([
      profileDrawnIn(COVE, 'elevation'),
      profileDrawnIn(COVE, 'plan'),
      profileDrawnIn(CROWN, 'plan'),
      profileDrawnIn(COVE, 'side'),
    ]).toEqual([['b', 'c'], ['b', 'c'], ['c3'], []]);
  });

  it('sets a whole list, finds the shape points, and refuses bad input', () => {
    expect(setProfileDrawnPoints(COVE, 'elevation', ['e', 'a']).drawnPoints).toEqual({ elevation: ['a', 'e'] });
    expect(setProfileDrawnPoints(COVE, 'elevation', []).drawnPoints).toEqual({ elevation: [] });
    expect(setProfileDrawnPoints(CROWN, 'plan', ['c5', 'c4']).drawnPoints)
      .toEqual({ elevation: ['c3', 'c4', 'c5'], plan: ['c4', 'c5'] });
    expect(setProfileDrawnPoints(COVE, 'plan', ['c']).drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['c'] });
    const extra = addProfilePoint(COVE, [2, 2], 'p9');
    expect([profileVertexIds(COVE), profileVertexIds(extra), profileVertexIds(BEAD)])
      .toEqual([['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'], ['s', 't']]);
    expect(setProfileDrawnPoints(extra, 'elevation', profileVertexIds(extra)).drawnPoints)
      .toEqual({ elevation: ['a', 'b', 'c', 'd', 'e'] });
    expect(setProfileDrawnPoints(extra, 'elevation', ['p9']).drawnPoints).toEqual({ elevation: ['p9'] });
    expect([
      setProfileDrawnPoints(COVE, 'elevation', ['a', 'a']),
      setProfileDrawnPoints(COVE, 'elevation', ['q']),
      setProfileDrawnPoints(COVE, 'elevation', 'a'),
      setProfileDrawnPoints(COVE, 'side', ['a']),
      setProfileDrawnPoint(COVE, 'side', 'a', true),
      setProfileDrawnPoint(COVE, 'elevation', 'q', true),
      setProfileDrawnPoint(COVE, 'elevation', 'a', 'yes'),
      setProfilePlanSameAsElevation(COVE, 'yes'),
    ]).toEqual([null, null, null, null, null, null, null, null]);
  });
});
```

How the numbers come out: the cove's points are in the order a, b, c, d, e and the crown's c1 … c5, so every expected list is just the chosen ids in that order. The crown's plan list is its own (`['c3']`), so an elevation edit leaves it alone. `p9` is added by the 429 `addProfilePoint` and no segment uses it, so it's not a shape point but may still be drawn.

**Don't touch:** the 434 code and test, `sectionProfiles.js`, the store, the components.

**Count:** 1139 + 3 = **1142**. Golden snapshot unchanged.

---

## §4 Step 436 — UI: Attach points panel

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/library/profileEditor/AttachPanel.jsx` | — | the panel |
| `src/library/profileEditor/ProfileEditorPage.jsx` | 179 | import and render it |

**Contract.**

- `AttachPanel({ profile, selectedPointId, onApply })`. `onApply(next, failText)` is the page's `apply` and returns whether it applied. Classes: copy `BUTTON_CLASS` and `INPUT_CLASS` the way `PointsPanel.jsx` does (lines 10–12), with the small-select look `rounded border border-gray-600 bg-gray-900 px-2 py-1 font-mono text-xs text-gray-100`.
- Two file-local constants (not exported):
  - `ATTACH_INFO` — name → `{ label, help }`, in `ATTACH_POINTS` order:

    | Name | Label | Help (the row's `title`) |
    |---|---|---|
    | `door_edge` | Door edge | The door's outside edge. For outside-edge profiles. |
    | `frame_edge` | Frame edge | Where the stile meets the panel opening. For inside (sticking) profiles and applied molding. |
    | `panel_edge` | Panel edge | Where the panel sits in the opening. For panel profiles and applied molding. |
    | `apply_point` | Apply point | Where an applied molding sits on a slab face. |
    | `box_top` | Box top | The top of the cabinet box. For crown and top mold. |
    | `box_front` | Box front | The front face of the box. For crown, top mold, base and toe kick. |
    | `floor` | Floor | The floor line. For furniture base and toe kick. |
    | `edge_top` | Edge top | The top surface of the part. For nosing. |
    | `edge_face` | Edge face | The front edge of the part. For nosing. |

  - `SLOT_LABELS` — slot → label: `door_outside` *Door outside edge*, `door_inside` *Door inside (sticking)*, `door_panel` *Door panel*, `door_applied` *Applied molding (5-piece)*, `slab_applied` *Applied molding (slab)*, `crown` *Crown*, `top_mold` *Top mold*, `furniture_base` *Furniture base*, `toe_kick` *Toe kick*, `nosing` *Nosing*.
- Layout (a `section` with `space-y-3`, like `PointsPanel`):
  - Heading *Attach points* (`text-sm font-medium text-gray-200`) and a `text-xs text-gray-500` line: *Where this profile attaches. A slot accepts any profile that has its attach points.*
  - One row per entry of `profile.attach`, in object order (`flex items-center gap-2`):
    - the label (`text-xs text-gray-200`) with the raw name after it in `font-mono text-[10px] text-gray-500`; the row has `title` = the help text;
    - a `<select aria-label="{label} point">` of every point id in `points` order, value = the current id. Change → `onApply(setProfileAttach(profile, name, value), 'That point no longer exists.')`;
    - when `selectedPointId` is set and differs from the row's point, a small text button `= {selectedPointId}` (`text-xs text-gray-400 hover:text-white`, `title="Use the selected point"`) → `setProfileAttach(profile, name, selectedPointId)`;
    - a small **Clear** button (same look) → `setProfileAttach(profile, name, null)`.
  - When `attach` is empty, *No attach points yet.* (`text-xs text-gray-500`).
  - An **Add** row, shown only while some `ATTACH_POINTS` name isn't set: a `<select aria-label="Attach point to add">` with the unset names as `{label} ({name})` (first one selected), and an **Add** button. It assigns that name to `selectedPointId` when a point is selected, otherwise to the first point in `points` → `setProfileAttach(profile, name, thatId)`. The new row then appears and the person changes its point.
  - **Fits:** a `text-xs text-gray-400` line *Fits slots:* followed by one pill per slot in `PROFILE_SLOTS` order where `profileFitsSlot(profile, slot)` (`rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300`, `SLOT_LABELS`), or *No slot yet — add attach points.* when none fits.
  - **Gaps:** one `text-xs text-amber-300` line for each entry of `profileSlotGaps(profile)`: *Tagged {profileTagLabel(tag)}, but it still needs {missing.join(', ')} to fit that slot.*
- Imports: `ATTACH_POINTS`, `PROFILE_SLOTS`, `profileFitsSlot`, `profileTagLabel` from `../../elevation/model/sectionProfiles.js`; `setProfileAttach`, `profileSlotGaps` from `../../elevation/model/profileEditing.js`.
- `ProfileEditorPage.jsx`: import `AttachPanel` and render `<AttachPanel profile={draft} selectedPointId={selection?.kind === 'point' ? selection.id : null} onApply={apply} />` in the right panel directly after `<PointsPanel … />` and before the Loops section.

**Don't touch:** the model, the store, `PointsPanel.jsx`, the canvas, other pages. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1142 tests.

---

## §5 Step 437 — UI: Drawn points panel

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/library/profileEditor/DrawnPanel.jsx` | — | the panel |
| `src/library/profileEditor/ProfileEditorPage.jsx` | (436) | import and render it |

**Contract.**

- `DrawnPanel({ profile, selectedPointId, onSelectPoint, onApply })`. Same classes as `AttachPanel`.
- Layout:
  - Heading *Drawn points* and a `text-xs text-gray-500` line: *Each drawn point becomes a line in that view. Elevation is seen from the front; plan from above.*
  - A checkbox labelled *Plan uses the same points as elevation*, checked when `profile.drawnPoints.plan === undefined`. Change → `setProfilePlanSameAsElevation(profile, checked)`.
  - A row *Elevation:* with **All shape points** and **None** buttons → `setProfileDrawnPoints(profile, 'elevation', profileVertexIds(profile))` / `(…, [])`.
  - A row *Plan:* with the same two buttons for `'plan'`, shown only while plan has its own list.
  - A table, **Point | Elevation | Plan**, one row per point in `points` order (`w-full table-fixed text-left text-xs text-gray-400`, as in `PointsPanel`):
    - Point cell: the id as a button that calls `onSelectPoint(id)`; the selected point's row is `bg-blue-900/40`.
    - Elevation cell: a checkbox (`aria-label="{id} drawn in elevation"`), checked when `profileDrawnIn(profile, 'elevation')` has the id. Change → `setProfileDrawnPoint(profile, 'elevation', id, checked)`.
    - Plan cell: a checkbox (`aria-label="{id} drawn in plan"`), checked from `profileDrawnIn(profile, 'plan')`. Disabled with `title="Plan follows elevation"` while plan has no list of its own. Change → `setProfileDrawnPoint(profile, 'plan', id, checked)`.
  - Under the table, `text-xs text-gray-500`: `{n} drawn in elevation · {m} in plan` (counts from `profileDrawnIn`).
- Fail text for every call: *That change would make the shape invalid.*
- Imports: `profileDrawnIn`, `profileVertexIds`, `setProfileDrawnPoint`, `setProfileDrawnPoints`, `setProfilePlanSameAsElevation` from `../../elevation/model/profileEditing.js`.
- `ProfileEditorPage.jsx`: render `<DrawnPanel profile={draft} selectedPointId={…same expression as 436…} onSelectPoint={…same handler PointsPanel gets…} onApply={apply} />` directly after `<AttachPanel … />`.

**Don't touch:** the model, the store, `AttachPanel.jsx`, `PointsPanel.jsx`, the canvas, other pages. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1142 tests.

---

## §6 Step 438 — UI: canvas markers, Details button and tags, text updates

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/library/profileEditor/ProfileCanvas.jsx` | 266 | attach and drawn markers, legend |
| `src/library/profileEditor/ProfileEditorPage.jsx` | (437) | Details button and tag pills, dialog, key guard, note text |
| `src/library/ProfileDetailsDialog.jsx` | 112 | one read-only line's text |

**Contract.**

- **Canvas markers.** In `ProfileCanvas.jsx`, work from `drawnProfile` (the drag preview when dragging, else `profile`). Before the points loop (line ~239), compute once per render: `attachNames` = a map from point id to the attach names that use it (in `attach` key order); `elevationSet` = `new Set(profileDrawnIn(drawnProfile, 'elevation'))`; `planSet` = the same for `'plan'`. Import `profileDrawnIn` from `../../elevation/model/profileEditing.js`. In each point's `<g>`, **before** the existing circles (so the hit circle stays on top), add decorations that all have `pointerEvents="none"`:
  - **Attach:** when the point has attach names, a diamond `<path d="M x y-11 L x+11 y L x y+11 L x-11 y Z">` (`stroke="#f59e0b"`, `strokeWidth={1.5}`, `fill="none"`), and a `<text x={x + 7} y={y + 19} fontSize={10} fill="#f59e0b">` with the names joined `, `.
  - **Drawn:** when the id is in `elevationSet` or `planSet`, a ring `<circle r={7.5} fill="none" stroke="#38bdf8" strokeWidth={1.5}>`, solid when in `elevationSet`, otherwise `strokeDasharray="3 2"` (plan only).
  - Leave the existing point circle, hit circle, id label, selection colour, snap ring and Line tool drawing as they are.
- **Legend.** A sibling of the readout, `pointer-events-none absolute bottom-2 right-2 rounded bg-gray-800/80 px-2 py-1 text-xs text-gray-300`, text *◇ attach point · ○ drawn (solid: elevation, dashed: plan only)*, shown only when the profile has any attach point or any drawn point (elevation or plan).
- **Page header.** In `ProfileEditorPage.jsx`:
  - After the version, one pill per tag (`rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300`, `profileTagLabel`) — none when the profile has no tags. Import `profileTagLabel` from `../../elevation/model/sectionProfiles.js`. The tags come from `saved`, not the draft.
  - A **Details** button (`BUTTON_CLASS`) in the header, just before the spacer. State `detailsOpen`. Render `{detailsOpen && <ProfileDetailsDialog key={saved.id} profile={saved} onClose={() => setDetailsOpen(false)} />}` at the end of the page's root. Import `ProfileDetailsDialog` from `../ProfileDetailsDialog.jsx`. It saves name and tags from the stored profile and leaves the draft, the undo history and the unsaved marker alone.
  - While `detailsOpen`, the page's `keydown` handler returns immediately (add `detailsOpen` to its dependency list), so undo, tool keys and Delete don't act behind the dialog.
  - The note at the bottom of the panel becomes: *x runs in from the edge; y = 0 is the front face, negative into the door. Attach points say where the profile sits; drawn points become lines in each view. Line tool: click points, click the first point to close, Enter to finish open. Select a segment to make it an arc.*
- **`ProfileDetailsDialog.jsx`:** change only the line *The shape is edited with Edit shape; attach and drawn points come next round.* to *The shape, attach points and drawn points are edited with Edit shape.*

**Don't touch:** the model, the store, `AttachPanel.jsx`, `DrawnPanel.jsx`, `PointsPanel.jsx`, `ProfilesPage.jsx`, other pages. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1142 tests.

---

## End-to-end check (Kyle)

- **Library → Profiles →** import `cabinetry_designer/src/elevation/model/__tests__/fixtures/sectionProfiles.json` if the three samples aren't there → **Cove 1/4 → Edit shape**.
- **Attach panel:** shows *Frame edge → a*. *Fits slots:* Door inside (sticking) and Applied molding (5-piece). On the canvas, point `a` has an amber diamond and *frame_edge* under it; `b` and `c` have solid blue rings (drawn in elevation).
- Click point `e` on the canvas, then press **= e** on the Frame edge row: the diamond jumps to `e`. **Ctrl+Z** puts it back. **Clear** removes it and the slot list says *No slot yet*.
- **Add** → *Door edge (door_edge)* adds a row on the selected point (or the first point); change its point with the select.
- Open **Details**, tick *Door outside edge* under tags, Save. The header shows the tag and the Attach panel adds the amber line *Tagged Door outside edge, but it still needs door_edge to fit that slot.* Add `door_edge` and the line disappears and *Door outside edge* joins the fits list.
- **Drawn panel:** the table shows `b` and `c` ticked in Elevation, Plan greyed and ticked too. Untick the *Plan uses the same points…* switch: Plan becomes editable. Untick `c` in Plan: the canvas doesn't change (`c` is still drawn in elevation, so its ring stays solid), and the footer reads `2 drawn in elevation · 1 in plan`. Now untick `b` in Elevation but leave it ticked in Plan: its ring goes dashed.
- **All shape points** ticks every corner; **None** clears them. Add a point with the Points panel's **Add point** (it's not on a shape), and **All shape points** leaves it out.
- Rename `a` to `face` in the Points table: the attach row and the drawn rows follow. Delete a point that's drawn but unused by any segment: it leaves the drawn lists.
- **Save**: the card on the Profiles page reads `v2` and shows `attach: frame_edge` (or whatever you set). Save again without changing anything: still `v2`.
- With Details open, pressing V, L or Ctrl+Z does nothing to the drawing behind it.

**Known for now:**
- Attach and drawn points do nothing in a room yet; the door style tool picks profiles in round 50.
- Attach points are whole points; there's no "a point along this edge" and no guessing attach points from tags. The amber gap line tells you what a slot still needs.
- New profiles start with no drawn points. **All shape points** is one click.

---

## Plan updates to make at the next plan edit

- §10: row 48.1 → "SPEC-48.1 (steps 434–438): attach points panel and slot fit, drawn points (elevation/plan), canvas markers, Details button and tags in the editor header." Mark 48 ✅ once Kyle has run it.
- §11 question 3: answered for now — none drawn by default, with an **All shape points** button.
- §2: add that `profileSlotGaps` and the drawn-point edits live in `model/profileEditing.js`.
