# Round 48.2 — SPEC: 0, 0 is the pin; open lines cut, closed shapes apply; door ghost

Steps 444–447, designer only, on branch `elevation-doors` (after step 443, 1149 tests). Geometry and the API don't change. No Supabase (plan P18).
Replaces the pin points from SPEC-48.1.1 with one rule, after Kyle tried 48.1.1 (2026-10-09): **where you draw relative to 0, 0 already says where the profile sits**, so picking a pin point was a second, redundant answer.

**Done when:**
- Profiles have **no pin points** (`attach` is gone from the data). The kind says what **0, 0** means ("0, 0 is the door's outside edge, at the front face"), and the shape's position relative to 0, 0 says the rest.
- Older profiles load with their old pin moved to 0, 0, so nothing ends up in a different place.
- The editor says how to draw: **an open line is a cut** (the door's new edge, from the face in), **a closed shape is an applied piece**, and a molding that needs a notch has both. Nothing reads this yet; it's the drawing rule for round 50.
- A light, filled **door ghost** (the team default stile, Kyle's groove and panel) sits behind door-kind profiles, placed so the kind's line is at 0, 0, with a **Door** on/off button.
- Drawn points are unchanged.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **444** | designer | Model additions: `profileDoorGhost`, what 0, 0 means per kind | 1149 → **1152** |
| **445** | designer | UI: pins out of the editor, the Profiles page and Details; **Kind** panel | 1152 |
| **446** | designer | Model switch: `attach` removed; migration moves the old pin to 0, 0; fixture and test edits | **1150** |
| **447** | designer | UI: the door ghost on the canvas and its **Door** button | 1150 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Every expected value in the tests was worked out by hand from the rules below and the sample profiles in `fixtures/sectionProfiles.json`. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got.

⚠ **Run 446 straight after 445.** In between, the editor no longer shows pins but they're still stored. If you press **Origin** in that gap, the migration in 446 may shift the shape again to put the old pin at 0, 0.

---

## §1 Decisions (2026-10-09 — Kyle: the origin is the attach point; open line = cut, closed = applied; a door ghost; keep drawn points)

- **0, 0 is the attach point for every kind.** The kind names the line the profile belongs to, and 0, 0 is where that line meets the face (door kinds) or the box/part (run kinds). `PROFILE_KINDS[kind].origin` holds that in words (§2 table); `other` has `origin: null`.
  - Door kinds are already drawn face up (y = 0 is the face, x runs in toward the door's middle). The ghost shows which side is which. For an **outside edge**, x < 0 is outside the door and x > 0 is in the door. For **inside, panel and applied**, x < 0 is the stile and x > 0 is the panel opening.
  - Run kinds: x runs out from the face, y runs up. Toe kick's 0, 0 is **the toe kick's own face** at the floor, because how far back the toe kick sits is a run rule (3" back, 1" from an end panel's face), not part of its shape.
- **Open line = cut into the door (or part); closed shape = applied piece; both = a notched applied molding.** This is drawing guidance shown in the editor. No code reads it until profiles are used in rooms (round 50). The sample cove is a closed shape, so by this rule it now reads as applied. It stays as it is because it's test data.
- **Pins are removed from the data.** `attach`, `ATTACH_POINTS`, `PIN_LABELS`, `profileMissingPins` and `setProfileAttach` go. `isSectionProfile` refuses a profile that still has `attach`. `profileFitsSlot(profile, slot)` = the profile's kind is the slot's kind. `setProfileKind` only sets the kind.
- **Migration (`migrateSectionProfile`)**, used when a saved document loads and when a profiles file is imported. It runs in two stages and never mutates its input:
  1. *Tags → kind* (as SPEC-48.1.1): only when the entry has an array `tags` and no own `kind`.
  2. *Pins → 0, 0*: only when the entry has an own `attach`. Using the old pins of its kind (file-local table, §2), the shape is moved so the old pin sits at 0, 0. For door kinds that's both coordinates of the one pin. For run kinds, x comes from the face pin and y from the level pin. A coordinate whose pin is missing, or names a point that isn't there, isn't moved. Every point and arc center moves the same way, rounded to 6 places (`-0` → `0`). Then `attach` is removed.
  - An entry with neither `tags` nor `attach` is returned as it is (the same object).
- **Door ghost** (`profileDoorGhost(kind, style)`). It's a light, filled cross-section drawn behind door-kind profiles and taken from the **team default door style** (thickness and left stile width). The groove and panel are Kyle's shop standard and are fixed for now:
  - The panel is **1/2" thick**, with its back flush with the door's back. It's drawn flat, 3" past the stile.
  - The **tongue is 1/4" thick**, flush with the panel's front face, and sits **1/2" into the stile**. The stile's groove matches it.
  - The tongue runs **3/4"** from its tip, then **curves to the back of the panel, reaching it 5/8" past the stile's inside edge**. The curve is an arc that leaves the tongue level (a cove): radius 13/32" (0.40625), centered 13/32" below the tongue's back face at the tongue's end.
  - Placed by kind: **outside edge** → the stile's outer edge at x = 0. **Inside, panel, applied** → the panel opening (the stile's inside edge) at x = 0, stile to the left. Run kinds and Other → no ghost.
  - No ghost when thickness ≤ 1/2" or the stile ≤ 1/2" (the groove wouldn't fit).
  - On by default, toggled per editor visit (not saved). **Fit** still fits the shape only.
- **Not in 48.2:** a ghost for run kinds (box corner, floor), the ghost following a picked room or style rather than the team default, editable groove/panel sizes (they'll come from the panel profile when door styles draw sections, P19), any logic for open vs closed.

---

## §2 Step 444 — model additions: the ghost and what 0, 0 means

Nothing existing changes. `PROFILE_KINDS` gains an `origin` field beside `label`, `axes` and `pins`.

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/sectionProfiles.js` | 370 | add `origin` to each `PROFILE_KINDS` entry |
| NEW `src/elevation/model/profileGhost.js` | — | `profileDoorGhost` |
| NEW `src/elevation/model/__tests__/profileGhost.test.js` | — | 3 tests, verbatim |

**Contract.**

`PROFILE_KINDS[kind].origin` (add after `axes` in each entry; doc comment becomes *SPEC-48.1.1 profile kinds … SPEC-48.2 adds what 0, 0 means*):

| kind | origin |
|---|---|
| `door_outside` | `"the door's outside edge, at the front face"` |
| `door_inside` | `'the edge of the panel opening, at the front face'` |
| `door_panel` | `'the edge of the panel opening, at the front face'` |
| `applied_molding` | `'the line the molding is applied along, at the front face'` |
| `crown` | `'the front face of the box, at the top of the box'` |
| `top_mold` | `'the front face of the box, at the top of the box'` |
| `furniture_base` | `'the front face of the box, at the floor'` |
| `toe_kick` | `"the toe kick's face, at the floor"` |
| `nosing` | `'the front edge of the part, at its top'` |
| `other` | `null` |

`profileGhost.js` (no imports needed; one-line doc comment naming SPEC-48.2 on the export and on the constants):
- File constants: `PANEL_THICKNESS = 0.5`, `TONGUE = 0.25`, `TONGUE_IN = 0.5`, `TONGUE_LENGTH = 0.75`, `CURVE_END = 0.625`, `CURVE_RADIUS = 0.40625`, `PANEL_SHOWN = 3`, and `GHOST_KINDS = { door_outside: 0, door_inside: 1, door_panel: 1, applied_molding: 1 }` (how many stile widths to shift left).
- `profileDoorGhost(kind, style)` → a geometry (`{ units, points, loops }`) or `null`:
  - `null` unless `Object.hasOwn(GHOST_KINDS, kind)`, `style?.thickness` is finite and `> PANEL_THICKNESS`, and `style?.stiles?.left` is finite and `> TONGUE_IN`.
  - With `T = style.thickness`, `S = style.stiles.left`, `dx = -GHOST_KINDS[kind] * S`, `pf = -(T - PANEL_THICKNESS)` (panel face), `tb = pf - TONGUE` (tongue back), `e = dx + S` (stile inside edge). Round every coordinate with a local `round6` (`Number(v.toFixed(6))`, `-0` → `0`).
  - Points, in this order: `s1 [dx, 0]`, `s2 [e, 0]`, `s3 [e, pf]`, `s4 [e − 1/2, pf]`, `s5 [e − 1/2, tb]`, `s6 [e, tb]`, `s7 [e, −T]`, `s8 [dx, −T]`, `p1 [e − 1/2, pf]`, `p2 [e + 3, pf]`, `p3 [e + 3, −T]`, `p4 [e + 5/8, −T]`, `p5 [e + 1/4, tb]`, `p6 [e − 1/2, tb]`. (`e − 1/2` is `e − TONGUE_IN`; `e + 1/4` is `e − TONGUE_IN + TONGUE_LENGTH`; `e + 5/8` is `e + CURVE_END`; `e + 3` is `e + PANEL_SHOWN`.)
  - Loops: `{ id: 'stile', closed: true }` with lines s1→s2→…→s8→s1. `{ id: 'panel', closed: true }` with lines p1→p2, p2→p3, p3→p4, then `{ type: 'arc', from: 'p4', to: 'p5', center: [e + 1/4, tb − CURVE_RADIUS], ccw: true }`, then lines p5→p6, p6→p1.

**NEW `src/elevation/model/__tests__/profileGhost.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { profileDoorGhost } from '../profileGhost.js';
import { PROFILE_KINDS, isProfileGeometry } from '../sectionProfiles.js';

const line = (from, to) => ({ type: 'line', from, to });

describe('SPEC-48.2 the door ghost and what 0, 0 means', () => {
  it('draws the stile and 3" of panel with the panel opening at 0, 0 for inside, panel and applied kinds', () => {
    const ghost = profileDoorGhost('door_inside', DEFAULT_DOOR_STYLE);
    expect(ghost).toEqual({
      units: 'in',
      points: {
        s1: [-3, 0], s2: [0, 0], s3: [0, -0.3125], s4: [-0.5, -0.3125],
        s5: [-0.5, -0.5625], s6: [0, -0.5625], s7: [0, -0.8125], s8: [-3, -0.8125],
        p1: [-0.5, -0.3125], p2: [3, -0.3125], p3: [3, -0.8125], p4: [0.625, -0.8125],
        p5: [0.25, -0.5625], p6: [-0.5, -0.5625],
      },
      loops: [
        {
          id: 'stile',
          closed: true,
          segs: [
            line('s1', 's2'), line('s2', 's3'), line('s3', 's4'), line('s4', 's5'),
            line('s5', 's6'), line('s6', 's7'), line('s7', 's8'), line('s8', 's1'),
          ],
        },
        {
          id: 'panel',
          closed: true,
          segs: [
            line('p1', 'p2'), line('p2', 'p3'), line('p3', 'p4'),
            { type: 'arc', from: 'p4', to: 'p5', center: [0.25, -0.96875], ccw: true },
            line('p5', 'p6'), line('p6', 'p1'),
          ],
        },
      ],
    });
    expect(isProfileGeometry(ghost)).toBe(true);
    expect([profileDoorGhost('door_panel', DEFAULT_DOOR_STYLE), profileDoorGhost('applied_molding', DEFAULT_DOOR_STYLE)])
      .toEqual([ghost, ghost]);
  });

  it('puts the door\'s outside edge at 0, 0 for an outside edge, follows thickness and stile, and has no ghost otherwise', () => {
    const outside = profileDoorGhost('door_outside', DEFAULT_DOOR_STYLE);
    expect([outside.points.s1, outside.points.s2, outside.points.p2, outside.points.p4, outside.loops[1].segs[3].center])
      .toEqual([[0, 0], [3, 0], [6, -0.3125], [3.625, -0.8125], [3.25, -0.96875]]);
    expect(isProfileGeometry(outside)).toBe(true);
    const thick = profileDoorGhost('door_inside', { ...DEFAULT_DOOR_STYLE, thickness: 1, stiles: { left: 2.5, right: 2.5 } });
    expect([
      thick.points.s1, thick.points.s3, thick.points.s5, thick.points.s8, thick.points.p3, thick.points.p5,
      thick.loops[1].segs[3].center,
    ]).toEqual([[-2.5, 0], [0, -0.5], [-0.5, -0.75], [-2.5, -1], [3, -1], [0.25, -0.75], [0.25, -1.15625]]);
    expect(isProfileGeometry(thick)).toBe(true);
    expect([
      profileDoorGhost('crown', DEFAULT_DOOR_STYLE),
      profileDoorGhost('other', DEFAULT_DOOR_STYLE),
      profileDoorGhost('toString', DEFAULT_DOOR_STYLE),
      profileDoorGhost('door_inside', { ...DEFAULT_DOOR_STYLE, thickness: 0.5 }),
      profileDoorGhost('door_inside', { ...DEFAULT_DOOR_STYLE, stiles: { left: 0.5, right: 3 } }),
      profileDoorGhost('door_inside', null),
    ]).toEqual([null, null, null, null, null, null]);
  });

  it('says what 0, 0 means for each kind', () => {
    expect(Object.fromEntries(Object.entries(PROFILE_KINDS).map(([kind, { origin }]) => [kind, origin]))).toEqual({
      door_outside: "the door's outside edge, at the front face",
      door_inside: 'the edge of the panel opening, at the front face',
      door_panel: 'the edge of the panel opening, at the front face',
      applied_molding: 'the line the molding is applied along, at the front face',
      crown: 'the front face of the box, at the top of the box',
      top_mold: 'the front face of the box, at the top of the box',
      furniture_base: 'the front face of the box, at the floor',
      toe_kick: "the toe kick's face, at the floor",
      nosing: 'the front edge of the part, at its top',
      other: null,
    });
  });
});
```

How the numbers come out (team default: T = 13/16 = 0.8125, S = 3):
- `pf = −(0.8125 − 0.5) = −0.3125` (the panel's face, 5/16" back from the door face); `tb = −0.5625` (tongue back, 9/16"); the panel's back is the door's back, −0.8125.
- Inside kinds shift one stile left (`dx = −3`, `e = 0`): the groove runs from x = −0.5 to 0. The tongue ends at x = 0.25 (3/4" from its tip at −0.5). The curve reaches the back at x = 0.625 (5/8" past the stile), and the panel is shown to x = 3.
- Arc center `(0.25, −0.5625 − 0.40625) = (0.25, −0.96875)`. Distance to p5 = 0.40625. Distance to p4 = √(0.375² + 0.15625²) = √0.1650390625 = 0.40625, so one radius. From p4 at about 22.6° counter-clockwise to p5 at 90°.
- Outside edge: `dx = 0`, `e = 3`, so everything is 3 to the right (p2 x = 6, p4 x = 3.625, center x = 3.25).
- 1" thick, 2 1/2" stile: `pf = −0.5`, `tb = −0.75`, back −1, center y = −0.75 − 0.40625 = −1.15625.

**Don't touch:** every existing export's behaviour, the fixture, every existing test, the store, the components.

**Count:** 1149 + 3 = **1152**. Golden snapshot unchanged.

---

## §3 Step 445 — UI: pins out; the Kind panel

UI only, no new tests. The model still has `attach` after this step. The UI just stops showing or saving it, and step 446 removes it.

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/library/profileEditor/KindPanel.jsx` | — | the panel |
| DELETE `src/library/profileEditor/PinsPanel.jsx` | 99 | `git rm` |
| `src/library/profileEditor/ProfileEditorPage.jsx` | 200 | KindPanel in place of PinsPanel; Save without attach; note text |
| `src/library/profileEditor/useProfileDraft.js` | 50 | `shape` without attach |
| `src/library/profileEditor/ProfileCanvas.jsx` | 295 | pin markers out; 0, 0 line in the hint; legend text |
| `src/library/ProfilesPage.jsx` | 229 | card status without pins |
| `src/library/ProfileDetailsDialog.jsx` | 105 | 0, 0 line instead of pins |

**Contract.**
- **`KindPanel({ profile, onApply })`.** `INPUT_CLASS` copied from `PinsPanel.jsx` line 7. `SLOT_LABELS` copied unchanged from `PinsPanel.jsx` lines 23–34. `const kind = PROFILE_KINDS[profile.kind];`. Layout (`section`, `space-y-3`):
  - Heading *Kind* (`text-sm font-medium text-gray-200`).
  - The Kind select exactly as `PinsPanel.jsx` lines 47–54.
  - The axes line (`text-xs text-gray-500`) with the three texts of `PinsPanel.jsx` lines 56–58, **without** the *Changing the kind clears…* sentence.
  - When `kind.origin`: `text-xs text-gray-200` *0, 0 is {kind.origin}.* then `text-xs text-gray-500` *Draw the shape from there, or select a point and press Origin to move the shape so that point sits at 0, 0.*
  - When `kind.axes === 'door'`, `text-xs text-gray-500`: *An open line is a cut: the door's new edge, from the face in. A closed shape is a piece applied to the door. A molding that needs a notch in the door can have both.*
  - When `kind.axes === 'run'`, `text-xs text-gray-500`: *A closed shape is an applied piece. An open line is an edge cut into the part, like a top's nosing.*
  - Status. For `other`: `text-xs text-gray-500` *Other profiles can't be picked by doors or runs yet.* Otherwise `text-xs text-green-400` *Can be picked for {labels}.*, where labels = `SLOT_LABELS` of every `PROFILE_SLOTS` key whose value is the kind, joined `' and '` for two and `', '` otherwise.
  - Imports: `PROFILE_KINDS`, `PROFILE_SLOTS` from `'../../elevation/model/sectionProfiles.js'`; `setProfileKind` from `'../../elevation/model/profileEditing.js'`.
- **`ProfileEditorPage.jsx`:**
  - Line 9: `import KindPanel from './KindPanel.jsx';`.
  - Line 181: `<KindPanel profile={draft} onApply={apply} />`.
  - Line 147: `profile: { ...saved, kind: draft.kind, geometry: draft.geometry, drawnPoints: draft.drawnPoints },` (no `attach`).
  - Line 194, the note, becomes exactly: *Pick the kind first: it sets which way the shape is drawn and what 0, 0 means. Open lines are cuts; closed shapes are applied pieces. To turn or flip the shape about a point, press Origin on that point first. Drawn points become lines in each view. Line tool: click points, click the first point to close, Enter to finish open. Select a segment to make it an arc.*
- **`useProfileDraft.js`** line 4: `const shape = (profile) => JSON.stringify([profile.kind, profile.geometry, profile.drawnPoints]);`.
- **`ProfileCanvas.jsx`:**
  - Line 5: `import { PROFILE_KINDS } from '../../elevation/model/sectionProfiles.js';`.
  - Delete the `attachNames` block (lines 170–175) and the pin marker (lines 252–257, the `{attachNames.has(id) && (…)}` fragment).
  - After line 142 add `const originText = PROFILE_KINDS[drawnProfile.kind]?.origin ?? null;`. Use the name `originText`, because line 139 already has an `origin` (the screen position of 0, 0). Leave that one alone.
  - The hint (lines 281–284): keep its classes and first text. Wrap that text in a `<div>`, and under it add `{originText && <div>0, 0 = {originText}</div>}`.
  - The legend (lines 288–292): the condition becomes `(elevationSet.size > 0 || planSet.size > 0)` and the text *○ drawn (solid: elevation, dashed: plan only)*.
- **`ProfilesPage.jsx`:**
  - Imports (lines 5–8): drop `PIN_LABELS` and `profileMissingPins`.
  - Delete lines 147–150 (`missingPins` and `status`).
  - Line 164 → `<p className="text-xs text-gray-500">v{profile.version}{profile.kind === 'other' ? ' · not used by doors or runs yet' : ''}</p>`.
- **`ProfileDetailsDialog.jsx`:**
  - Line 3 → `import { PROFILE_KINDS } from '../elevation/model/sectionProfiles.js';`.
  - Delete lines 17–18 (`pinPoints`).
  - Line 74 text → *The kind sets which way the shape is drawn and what 0, 0 means. To use the same shape as another kind, Copy it and change the copy's kind.* (keep `&apos;`).
  - Delete line 75 (the amber line).
  - Line 79, the paragraph's content, becomes:

    ```jsx
    {PROFILE_KINDS[kind].origin ? `0, 0 is ${PROFILE_KINDS[kind].origin}.` : "Other profiles aren't used by doors or runs yet."}
    ```

  - Line 80 text → *The shape and drawn points are edited with Edit shape.*

**Don't touch:** the model, the store, persistence, every test, `PointsPanel.jsx`, `DrawnPanel.jsx`, `SegmentPanel.jsx`, `profileView.js`, other pages. After the step, `grep -rn "attach\|PIN_LABELS\|profileMissingPins\|setProfileAttach\|PinsPanel" src/library` prints nothing.

Gate: `npm test && npm run lint && npm run build`; 1152 tests.

---

## §4 Step 446 — model switch: `attach` removed; migration moves the old pin to 0, 0

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/sectionProfiles.js` | (444) | validator, `PROFILE_KINDS` without pins, `profileFitsSlot`, `newSectionProfile`, migration; delete `ATTACH_POINTS`, `PIN_LABELS`, `profileMissingPins` |
| `src/elevation/model/profileEditing.js` | 457 | drop attach handling; delete `setProfileAttach`; `setProfileKind` sets the kind only |
| `src/elevation/store/slices/sectionProfiles.js` | — | lines 32–33 |
| `src/elevation/model/__tests__/fixtures/sectionProfiles.json` | 81 | delete lines 26, 49, 75 |
| `src/elevation/model/__tests__/profileKinds.test.js` | 91 | **replace the whole file**, verbatim |
| DELETE `src/elevation/model/__tests__/profileAttach.test.js` | 47 | `git rm` (its kind test moves into profileKinds) |
| `src/elevation/model/__tests__/sectionProfiles.test.js` | — | import line, two `it` blocks |
| `src/elevation/model/__tests__/sectionProfileHelpers.test.js` | — | three `attach: {},` lines, one `it` block, line 121 |
| `src/elevation/model/__tests__/profileEditing.test.js` | — | lines 35–41, line 51 |
| `src/elevation/store/__tests__/sliceSectionProfiles.test.js` | — | line 49 |
| `src/elevation/store/__tests__/sectionProfileSaves.test.js` | 67 | one new test |

**Contract.**

`sectionProfiles.js`:
- Delete `ATTACH_POINTS` (lines 3–7), `PIN_LABELS` and `profileMissingPins`.
- `isSectionProfile`: drop `'attach'` from the `hasKeys` list. Delete the `|| !hasKeys(profile.attach, ATTACH_POINTS, [])` line. The return becomes `return isPointList(profile.drawnPoints.elevation, points) && (!Object.hasOwn(profile.drawnPoints, 'plan') || isPointList(profile.drawnPoints.plan, points));`. Doc: *…validate metadata, geometry and drawn point references (SPEC-48.2: no pins)*.
- `PROFILE_KINDS`: remove every `pins` field (each entry is `{ label, axes, origin }`).
- `profileFitsSlot(profile, slot)` → `Object.hasOwn(PROFILE_SLOTS, slot) && profile.kind === PROFILE_SLOTS[slot]`. Doc: *A profile fits a slot of its own kind (SPEC-48.2).*
- `newSectionProfile`: delete `attach: {},` from the square.
- `migrateSectionProfile(entry)`, §1. Add a file-local `OLD_PINS` (the pins from SPEC-48.1.1, as x pin and y pin): `door_outside { x: 'door_edge', y: 'door_edge' }`, `door_inside { x: 'frame_edge', y: 'frame_edge' }`, `door_panel { x: 'panel_edge', y: 'panel_edge' }`, `applied_molding { x: 'apply_point', y: 'apply_point' }`, `crown` and `top_mold { x: 'box_front', y: 'box_top' }`, `furniture_base` and `toe_kick { x: 'box_front', y: 'floor' }`, `nosing { x: 'edge_face', y: 'edge_top' }`. Also a local `round6`.
  - If `entry` isn't a plain object → return it. `fromTags = Array.isArray(entry.tags) && !Object.hasOwn(entry, 'kind')`; `hasAttach = Object.hasOwn(entry, 'attach')`. Neither → return `entry`.
  - `next = structuredClone(entry)`. If `fromTags`: set `kind` exactly as the 48.1.1 rule (first tag that's a kind other than `other`, or `door_applied` / `slab_applied` → `applied_molding`; none → `other`) and delete `tags`.
  - If `hasAttach`: the pin of a name is the point it names, when `entry.attach` is a plain object, the value is a non-empty string, and `next.geometry?.points` is a plain object that has that id holding a coordinate. Otherwise there is none. `dx` = the x of the `OLD_PINS[kind].x` pin, `dy` = the y of the `OLD_PINS[kind].y` pin (0 when there's no pin, or the kind isn't in `OLD_PINS`). If either isn't 0, move every point `[round6(x − dx), round6(y − dy)]`. When `next.geometry.loops` is an array, also move every arc segment's `center` that's a coordinate. Delete `attach`.
  - Return `next`. Doc: *SPEC-48.2 turns older tags into a kind and moves the old pin to 0, 0, without mutating the input.*

`profileEditing.js`:
- Line 1–3 import → `import { isProfileKind, isSectionProfile } from './sectionProfiles.js';`.
- `renameProfilePoint`: delete the attach loop (lines 110–112); doc *…updates segment and drawn references*.
- `deleteProfilePoint`: delete lines 129–131; doc *…removes its drawn references*.
- `deleteUnusedLoopPoints`: delete `...Object.values(profile.attach),` (line 195).
- Delete `setProfileAttach` (lines 342–353 with its doc).
- `setProfileKind`: the edit is only `next.kind = kind;`. Doc *SPEC-48.2 sets the kind; nothing else changes.*

`store/slices/sectionProfiles.js` lines 32–33 → `const changed = JSON.stringify([profile?.geometry, profile?.drawnPoints])` / `!== JSON.stringify([existing.geometry, existing.drawnPoints]);`.

**Fixture:** delete line 26 (`"attach": { "frame_edge": "a" },`), line 49 (`"attach": { "frame_edge": "s", "apply_point": "s" },`) and line 75 (`"attach": { "box_top": "c1", "box_front": "c1" },`). Nothing else.

**NEW content for `src/elevation/model/__tests__/profileKinds.test.js`** (replaces the file), verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PROFILE_KINDS, isProfileKind, isSectionProfile, migrateSectionProfile, profileKindLabel, profileKindOptions,
} from '../sectionProfiles.js';
import { setProfileKind } from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
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
const moved = (points) => ({ ...geometry, points });

describe('SPEC-48.2 profile kinds; 0, 0 is the pin', () => {
  it('names one kind per profile, each with its axes and what 0, 0 means, and no pins', () => {
    expect(Object.keys(PROFILE_KINDS)).toEqual([
      'door_outside', 'door_inside', 'door_panel', 'applied_molding', 'crown', 'top_mold',
      'furniture_base', 'toe_kick', 'nosing', 'other',
    ]);
    expect(Object.values(PROFILE_KINDS).map((kind) => Object.keys(kind)))
      .toEqual(Array(10).fill(['label', 'axes', 'origin']));
    expect(Object.values(PROFILE_KINDS).map(({ axes }) => axes))
      .toEqual(['door', 'door', 'door', 'door', 'run', 'run', 'run', 'run', 'run', 'free']);
    expect([profileKindLabel('door_inside'), profileKindLabel('door_panel'), profileKindLabel('other'), profileKindLabel('shop_x')])
      .toEqual(['Door inside profile', 'Raised panel', 'Other', 'shop_x']);
    expect([
      isProfileKind('crown'), isProfileKind('other'), isProfileKind('Crown'),
      isProfileKind('door_applied'), isProfileKind(undefined), isProfileKind('toString'),
    ]).toEqual([true, true, false, false, false, false]);
    expect([COVE, BEAD, CROWN].map((profile) => [isSectionProfile(profile), 'attach' in profile]))
      .toEqual([[true, false], [true, false], [true, false]]);
  });

  it('lists the kinds a library uses, and changes a profile\'s kind and nothing else', () => {
    const list = [
      { ...base, kind: 'nosing' },
      { ...base, id: 'sp-2', kind: 'door_inside' },
      { ...base, id: 'sp-3', kind: 'nosing', archived: true },
      { ...base, id: 'sp-4', kind: 'crown' },
    ];
    expect([profileKindOptions(list), profileKindOptions([])]).toEqual([['door_inside', 'crown', 'nosing'], []]);
    expect(setProfileKind(COVE, 'door_outside')).toEqual({ ...COVE, kind: 'door_outside' });
    expect(setProfileKind(CROWN, 'top_mold')).toEqual({ ...CROWN, kind: 'top_mold' });
    expect(setProfileKind(BEAD, 'other')).toEqual({ ...BEAD, kind: 'other' });
    expect(setProfileKind(COVE, 'door_inside')).toEqual(COVE);
    expect([setProfileKind(COVE, 'door_applied'), setProfileKind(COVE, ''), setProfileKind(COVE, undefined)])
      .toEqual([null, null, null]);
    expect(COVE.kind).toBe('door_inside');
  });

  it('turns older tags into one kind, moves the old pin to 0, 0 and drops the pins', () => {
    const old = (tags, attach) => ({ ...base, tags, attach });
    expect(migrateSectionProfile(old(['door_inside'], { frame_edge: 'a' }))).toEqual({ ...base, kind: 'door_inside' });
    expect(migrateSectionProfile(old(['shop_ogee', 'crown', 'door_inside'], { box_top: 'a', box_front: 'a', frame_edge: 'b' })))
      .toEqual({ ...base, kind: 'crown' });
    expect(migrateSectionProfile(old(['slab_applied'], {}))).toEqual({ ...base, kind: 'applied_molding' });
    expect(migrateSectionProfile(old(['countertop_edge', 'light_rail'], { door_edge: 'b' }))).toEqual({ ...base, kind: 'other' });
    expect(migrateSectionProfile({ ...base, tags: ['door_inside'] })).toEqual({ ...base, kind: 'door_inside' });
    expect(migrateSectionProfile({ ...base, kind: 'door_outside', attach: { door_edge: 'b' } }))
      .toEqual({ ...base, kind: 'door_outside', geometry: moved({ a: [-0.5, 0], b: [0, 0], c: [0, -0.5] }) });
    expect(migrateSectionProfile({ ...base, kind: 'nosing', attach: { edge_top: 'c', edge_face: 'b' } }))
      .toEqual({ ...base, kind: 'nosing', geometry: moved({ a: [-0.5, 0.5], b: [0, 0.5], c: [0, 0] }) });
    expect(migrateSectionProfile({ ...base, kind: 'crown', attach: { box_front: 'c' } }))
      .toEqual({ ...base, kind: 'crown', geometry: moved({ a: [-0.5, 0], b: [0, 0], c: [0, -0.5] }) });
    expect(migrateSectionProfile({ ...base, kind: 'door_inside', attach: { frame_edge: 'q' } })).toEqual({ ...base, kind: 'door_inside' });
    const bead = migrateSectionProfile({ ...BEAD, attach: { apply_point: 't' } });
    expect([bead.geometry.points, bead.geometry.loops[0].segs[0].center, 'attach' in bead, isSectionProfile(bead)])
      .toEqual([{ s: [-0.5, 0], t: [0, 0] }, [-0.25, 0], false, true]);
    expect(migrateSectionProfile(COVE)).toBe(COVE);
    expect([migrateSectionProfile(null), migrateSectionProfile('x')]).toEqual([null, 'x']);
    const input = { ...base, kind: 'door_outside', attach: { door_edge: 'b' } };
    migrateSectionProfile(input);
    expect([input.attach, input.geometry.points.b]).toEqual([{ door_edge: 'b' }, [0.5, 0]]);
  });
});
```

How the numbers come out (base triangle a (0, 0), b (1/2, 0), c (1/2, −1/2)):
- The old pins at a are already at 0, 0, so tags-only migrations just get a kind. `door_edge` isn't an Other pin, so the countertop entry isn't moved.
- Outside edge pinned at b: move by (1/2, 0), so a → (−1/2, 0), b → (0, 0), c → (0, −1/2).
- Nosing with face pin b (x 1/2) and top pin c (y −1/2): move by (1/2, −1/2), so a → (−1/2, 1/2), b → (0, 1/2), c → (0, 0).
- Crown with only the face pin at c: x moves by 1/2 and y stays.
- A pin to a missing point `q` moves nothing.
- The bead pinned at t (1/2, 0): s → (−1/2, 0), t → (0, 0), and the arc center (1/4, 0) → (−1/4, 0).

**Edits to other tests.** Replace each named `it(...)` block whole.

`model/__tests__/sectionProfiles.test.js`:
- Line 5: `ATTACH_POINTS, PROFILE_KINDS, isProfileGeometry, …` → `PROFILE_KINDS, isProfileGeometry, isSectionProfile, isSectionProfileList,`.
- Replace `it('starts with an empty library and names the kinds and attach points', …)` with:

```js
  it('starts with an empty library and names the kinds', () => {
    expect(DEFAULT_SETTINGS.sectionProfiles).toEqual([]);
    expect(Object.keys(PROFILE_KINDS)).toHaveLength(10);
    expect([COVE, BEAD, CROWN].map((profile) => isSectionProfile(profile))).toEqual([true, true, true]);
    expect([COVE.kind, BEAD.kind, CROWN.kind]).toEqual(['door_inside', 'applied_molding', 'crown']);
  });
```

- Replace `it('checks the profile: name, kind, attach and drawn points name real points, version and archived', …)` with:

```js
  it('checks the profile: name, kind, drawn points name real points, version and archived; no pins', () => {
    expect([
      isSectionProfile({ ...COVE, kind: 'other' }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: [] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['b'], plan: ['c'] } }),
      isSectionProfile({ ...COVE, name: '' }),
      isSectionProfile({ ...COVE, name: ' Cove' }),
      isSectionProfile({ ...COVE, kind: 'Door inside' }),
      isSectionProfile({ ...COVE, kind: undefined }),
      isSectionProfile({ ...COVE, tags: ['door_inside'] }),
      isSectionProfile({ ...COVE, attach: {} }),
      isSectionProfile({ ...COVE, attach: { frame_edge: 'a' } }),
      isSectionProfile({ ...COVE, drawnPoints: { plan: ['c'] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['b', 'b'] } }),
      isSectionProfile({ ...COVE, drawnPoints: { elevation: ['q'] } }),
      isSectionProfile({ ...COVE, version: 0 }),
      isSectionProfile({ ...COVE, version: 1.5 }),
      isSectionProfile({ ...COVE, archived: 'no' }),
      isSectionProfile({ ...COVE, thumbnail: 'M 0 0' }),
      isSectionProfile({ ...COVE, id: '' }),
    ]).toEqual([
      true, true, true,
      false, false, false, false, false, false, false, false, false, false, false, false, false, false, false,
    ]);
  });
```

`model/__tests__/sectionProfileHelpers.test.js`:
- Delete the three `attach: {},` lines (28, 87, 112).
- Line 121: `copy.attach === CROWN.attach` → `copy.drawnPoints === CROWN.drawnPoints`.
- Replace `it('fits a slot of its own kind once the kind\'s pin points are all set', …)` with:

```js
  it('fits a slot of its own kind', () => {
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
      profileFitsSlot(CROWN, 'top_mold'),
      profileFitsSlot(CROWN, 'sticking'),
      profileFitsSlot({ ...COVE, kind: 'other' }, 'door_inside'),
      profileFitsSlot({ ...COVE, kind: 'other' }, 'other'),
    ]).toEqual([true, true, true, true, false, false, false, false, false, false]);
  });
```

`model/__tests__/profileEditing.test.js`:
- Lines 35–41 become:

```js
    const referenced = { ...added, drawnPoints: { elevation: ['b', 'p1'], plan: ['p1'] } };
    expect(deleteProfilePoint(referenced, 'p1'))
      .toEqual({ ...COVE, drawnPoints: { elevation: ['b'], plan: [] } });
```

- Delete line 51 (`expect(renamed.attach).toEqual({ frame_edge: 'face' });`).

`store/__tests__/sliceSectionProfiles.test.js`:
- Line 49: `profile: { ...COVE, attach: { frame_edge: 'q' } }` → `profile: { ...COVE, drawnPoints: { elevation: ['q'] } }`. Nothing else. (Its name-and-kind and version checks already hold without attach.)

`store/__tests__/sectionProfileSaves.test.js` — add as the last `it` in the `describe` (the existing tags test stays as is; its old cove's pin is `a`, already at 0, 0, so it still loads as the sample cove):

```js
  it('moves an older profile\'s pin point to 0, 0 and drops the pins, on load and on import', () => {
    const old = { ...sample.profiles[0], kind: 'door_outside', attach: { door_edge: 'e' } };
    const saved = older();
    saved.settings.sectionProfiles = [old];
    const loaded = normalizeElevationDocument(saved);
    const [profile] = loaded.settings.sectionProfiles;
    expect(profile.geometry.points).toEqual({ a: [0, 0.8125], b: [0.5, 0.8125], c: [0.75, 0.5625], d: [0.75, 0], e: [0, 0] });
    expect(profile.geometry.loops[0].segs[1].center).toEqual([0.5, 0.5625]);
    expect([Object.hasOwn(profile, 'attach'), isElevationDocument(loaded)]).toEqual([false, true]);
    expect(parseProfileFile(JSON.stringify({ kind: 'section-profiles', version: 1, profiles: [old] }))).toEqual([profile]);
  });
```

How the numbers come out: the cove's e is (0, −13/16), so every y rises by 0.8125. a (0, 0) → (0, 0.8125), c (0.75, −0.25) → (0.75, 0.5625), d (0.75, −0.8125) → (0.75, 0), and the arc center (0.5, −0.25) → (0.5, 0.5625).

**Don't touch:** `persistence.js` (step 440 already runs `migrateSectionProfile` on load), the 444 ghost test, `profileTurns.test.js`, `profileLoops.test.js`, `profileDrawn.test.js`, the components (445 already stopped using attach). After the step, `grep -rn "attach\|ATTACH_POINTS\|PIN_LABELS\|profileMissingPins\|setProfileAttach" src/library src/elevation/model/sectionProfiles.js src/elevation/model/profileEditing.js src/elevation/store/slices/sectionProfiles.js` prints only lines inside `migrateSectionProfile` and `OLD_PINS`.

**Count:** 1152 − 3 (profileAttach.test.js) + 1 = **1150**. Golden snapshot unchanged. ⚠ If any other test fails only because a profile still carries `attach`, report it; don't edit it.

---

## §5 Step 447 — UI: the door ghost and its button

UI only, no new tests.

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/library/profileEditor/ProfileCanvas.jsx` | (445) | `ghost` prop drawn behind the shape |
| `src/library/profileEditor/ProfileEditorPage.jsx` | (445) | ghost from the team style; **Door** button |

**Contract.**
- **`ProfileCanvas.jsx`:**
  - Add the prop `ghost = null` to the destructured props (line 33).
  - After the `drawnProfile` line, add `const ghostProfile = ghost ? { ...profile, geometry: ghost, drawnPoints: { elevation: [] } } : null;`. It's a valid profile, so `loopScreenPath` (whose arcs go through `profileArcInfo`, which validates) can draw it.
  - Right after the grid/axes `<g>` (before the `drawnProfile.geometry.loops.map`), add:

    ```jsx
    {ghostProfile && (
      <g pointerEvents="none" className="text-gray-400">
        {ghostProfile.geometry.loops.map((loop) => (
          <path key={loop.id} d={loopScreenPath(ghostProfile, loop, view, size)} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeOpacity={0.4} strokeWidth={1} />
        ))}
      </g>
    )}
    ```

  - Nothing else (no hit-testing, no snapping to the ghost).
- **`ProfileEditorPage.jsx`:**
  - Imports: `teamDoorStyle` from `'../../elevation/model/doorStyles.js'`; `profileDoorGhost` from `'../../elevation/model/profileGhost.js'`; add `PROFILE_KINDS` to the `sectionProfiles.js` import.
  - With the other hooks: `const teamStyle = useSelector((state) => teamDoorStyle(state.elevation.settings));` and `const [showGhost, setShowGhost] = useState(true);`.
  - After the `if (!saved || !draft) { return … }` block (not as a hook): `const ghost = showGhost ? profileDoorGhost(draft.kind, teamStyle) : null;` and `const doorKind = PROFILE_KINDS[draft.kind]?.axes === 'door';`.
  - Toolbar: after the ⇅ button and before the Grid label, when `doorKind`:

    ```jsx
    {doorKind && (
      <button type="button" className={`${BUTTON_CLASS} ${showGhost ? 'bg-blue-600 text-white' : 'bg-gray-800'}`} aria-pressed={showGhost} title="Show the team default door (stile, groove and panel) behind the shape" onClick={() => setShowGhost((current) => !current)}>Door</button>
    )}
    ```

  - Pass `ghost={ghost}` to `<ProfileCanvas …>`.

**Don't touch:** the model, the store, `KindPanel.jsx`, `PointsPanel.jsx`, `DrawnPanel.jsx`, `profileView.js`, other pages.

Gate: `npm test && npm run lint && npm run build`; 1150 tests.

---

## End-to-end check (Kyle, after 447)

- **Older profiles load.** Open Library → Profiles. Anything you pinned in 48.1.1 now has that pin's point at 0, 0 (open **Edit shape** to see it). The cards show `v1` (or your version), plus *not used by doors or runs yet* on Other profiles. Nothing says *needs …*.
- **New → Door outside edge → Edit shape.** The right panel opens with **Kind**: *0, 0 is the door's outside edge, at the front face.* plus the open-line/closed-shape line, and *Can be picked for door outside edge.* The canvas hint has a second line, *0, 0 = the door's outside edge, at the front face*. There are no diamonds or *Use selected point* anywhere.
- **Ghost.** A light filled door sits behind the shape: the 3" stile running right from x = 0, the groove in its inside edge, and the panel's tongue in the groove, curving to the back 5/8" past the stile, with 3" of flat panel. Change Kind to *Door inside profile*: the ghost jumps 3" left so the panel opening is on x = 0. Press **Door** to hide it and again to show it. Change Kind to *Crown*: no ghost and no Door button.
- **Draw a round-over edge** as an open line on the outside edge: from (1/4, 0) on the face, arc to (0, −1/4), line down to (0, −13/16). It sits on the ghost's corner.
- **Team style follows.** Library → Team door style: set thickness to 1" and save. Back in the editor, the ghost is 1" thick and the panel's back is still flush with the door's back.
- Save still bumps the version only when the shape or drawn points change; a kind change alone doesn't.

**Known for now:**
- Open vs closed is guidance only; nothing reads it until round 50.
- The ghost's groove and panel sizes are fixed (Kyle's shop standard). They'll come from the panel profile when door styles draw their cross-section (P19).
- Run kinds have no ghost yet.

---

## Plan updates to make at the next plan edit

- **P3** → *a slot takes one kind; any profile of that kind fits*. There are no pins.
- **New P20 — 0, 0 is the attach point.** The kind says what 0, 0 means (§1 table), and the shape's position relative to 0, 0 says where it sits. Older pins are migrated by moving the shape. (Kyle, 2026-10-09)
- **New P21 — Open line = cut, closed shape = applied, both = notched applied molding.** (Kyle, 2026-10-09)
- §2: drop `attach` from the profile JSON and the "Attach points per slot" table; replace them with the kinds/origin table.
- §10: add row 48.2 (steps 444–447); mark 48.1.1 ✅.
