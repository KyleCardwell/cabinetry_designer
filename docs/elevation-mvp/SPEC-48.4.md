# Round 48.4 — SPEC: the door section in the door style tool; pickers only; one stile & rail width; wider tool

Steps 451–454, designer only, on branch `elevation-doors` (after step 450, 1154 tests). Geometry and the API don't change. No Supabase (plan P18).
This comes from Kyle trying 48.3 (2026-10-09). He wanted to see the picked profiles **on a cross-section of the door**, not just pick them. The plan had that as round 52 (P19), after round 50; it doesn't need round 50, so it moves up here.

**Done when:**
- The door style tool (room style editor *and* Library → Team door style) shows a **half section** of the door: the editor's door ghost, sized to **this style's** stile width and thickness, with the **picked profiles placed on it**. Open-line profiles cut the wood away; closed shapes sit on it as applied pieces. It updates live as you change the thickness, the width or any pick.
- Slab and slab-with-applied-molding designs show a slab section instead (outside edge cut, molding at the inset).
- The pickers are **pickers only**: no **New…**/**Edit…**, no editor over the room. Profiles are made and changed on Library → Profiles.
- **Stiles & rails** is one **width** field. **Different sizes…** opens the four fields for the rare style that needs them.
- The tool is **wide and two-column**: fields on the left, the section on the right (it stays in view while you scroll). The fields are in this order: Design, Thickness, Stiles & rails, Profiles, Panel, Mid rail/stile extra, Arch rise, and **Short faces last**.
- Doors on the room canvas and in the DXF still draw square (round 50).

| Step | Repo | What | Tests after |
|---|---|---|---|
| **451** | designer | Model: `doorSection` (body, placed profiles, cut regions) | 1154 → **1157** |
| **452** | designer | UI: pickers only; overlay removed | 1157 |
| **453** | designer | UI: `DoorSectionView`; two-column wider tool; field order | 1157 |
| **454** | designer | UI: one stile & rail width, **Different sizes…** | 1157 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Every expected value in the tests was worked out by hand from the rules below, `DEFAULT_DOOR_STYLE` (13/16" thick, 3" stiles), `DOOR_DESIGNS` and `fixtures/sectionProfiles.json`. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got.

---

## §1 Decisions (2026-10-09 — Kyle: show the ghost with the picked profiles; pickers only; one width; wider; short faces last)

- **The section frame.** It's the same half section as P19: a cut across the left stile, seen from below, **front face up**. **x = 0 is the door's outside edge**, x runs in toward the middle, and **y = 0 is the front face** (negative into the door). This is the outside-edge frame, so the door ghost for `door_outside` is the 5-piece body as it is.
- **Body** (the wood before profiles):
  - `five_piece`: `profileDoorGhost('door_outside', style)` from SPEC-48.2. It has the stile at `stiles.left` × `thickness`, Kyle's groove and tongue, and 3" of flat panel. When the ghost is `null` (thickness or stile ≤ 1/2"), there's **no section** (`doorSection` returns `null`).
  - `slab`: a rectangle 3" wide, 0 to −thickness.
  - `slab_applied`: a rectangle `stiles.left + 3` wide (the molding inset plus 3"), 0 to −thickness. `stiles.left` must be finite and > 0, else `null`.
  - Points `b1 [0, 0]`, `b2 [w, 0]`, `b3 [w, −T]`, `b4 [0, −T]`, one closed loop `{ id: 'slab', closed: true }`, b1→b2→b3→b4→b1.
- **Where each pick goes** (P20: a profile's 0, 0 sits on its slot's line): `outside` at x = 0. `inside`, `panel` and `applied` at x = `stiles.left` (the panel opening on 5-piece, the inset line on slab-applied). Every point and arc center is moved by (dx, 0), rounded to 6 places.
- **Which picks are drawn:** only the design's slots (`design.slots`), and only when the pick is a string. A pick whose profile is missing, or whose kind isn't the slot's kind (`doorProfileSlotKind`), isn't drawn and its slot goes in `skipped`. Archived picks are drawn (they're still picked). A slot the design doesn't use is ignored, not skipped.
- **Open line = cut, closed = applied (P21), drawn as follows.** Each open loop of a placed profile makes a **cut region**: everything between the line and the face. The region is the line itself, then straight up from its end to y = 0, along the face, and straight down to its start. The section draws the body with those regions masked out, then draws the profiles on top (open lines as a stroke, closed shapes filled). This is a drawing rule only. No geometry is subtracted, and fit checks stay in round 50.
- **Raised panels** are drawn as their profile on top of the ghost's flat panel. The ghost panel stays flat (its size is still Kyle's fixed shop standard), because a cut can only remove wood, not add it.
- **Pickers only.** **New…**, **Edit…** and the editor-over-the-room are removed (this reverses SPEC-48.3 §1). `ProfileEditorOverlay.jsx` is deleted. The `ProfileEditor` component split, `addSectionProfile`'s `kind` and the room-keys modal guard from 48.3 all stay. They're harmless and useful.
- **One width.** The style still stores four sizes (`stiles.left/right`, `rails.top/bottom`). Nothing in the model changes, so there's no migration. When all four match, the tool shows one **Stile & rail width** field (**Molding inset** on slab-applied), and typing it sets all four. **Different sizes…** shows the four fields. **Use one width** sets all four to the left stile and goes back to one field. If the four don't match, the four fields always show. Short fronts still shrink their rails by the short-face rule.
- **Not in 48.4:** drawing profiles on doors in the room canvas or DXF (round 50), a real raised-panel/groove shape from the panel profile, profile thumbnails in the pickers, run kinds (crown/base) sections, the DXF detail block (52.1, which can reuse `doorSection`).

---

## §2 Step 451 — model: `doorSection`

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/doorSection.js` | — | `doorSection` |
| NEW `src/elevation/model/__tests__/doorSection.test.js` | — | 3 tests, verbatim |

**Contract.** Reuse: `profileDoorGhost` (`./profileGhost.js`), `DOOR_PROFILE_SLOTS` (`./doorStyles.js`), `doorProfileSlotKind` (`./sectionProfiles.js`). Add a local `round6` (`Number(v.toFixed(6))`, `-0` → `0`), the same as `profileGhost.js`.

`export function doorSection(style, design, profiles)` → `null` or `{ units: 'in', body, placed, cuts, skipped }`. Doc: *SPEC-48.4 the door style's half section: the body, the picked profiles at their lines, and the wood each open line cuts away.*
- `null` when `design` is falsy, or `style?.thickness` isn't finite and > 0, or (for `slab_applied`) `style.stiles?.left` isn't finite and > 0, or (for `five_piece`) the ghost is `null`. Any other construction → `null`.
- `body`: §1.
- `S = style.stiles.left` (only read when a pick needs it).
- `placed`: for each `slot` of `DOOR_PROFILE_SLOTS` **in that order** where `design.slots.includes(slot)` and `typeof style.profiles?.[slot] === 'string'`: find the profile by id in `profiles`. If it's missing, or `profile.kind !== doorProfileSlotKind(slot)`, push `slot` to `skipped`. Otherwise push `{ slot, profileId, name, geometry }`, where `geometry` is the profile's geometry moved by `dx = slot === 'outside' ? 0 : S`: a new object (`units`, moved `points`, `loops` with moved arc `center`s), never mutating the input.
- `cuts`: for each placed entry, in order, and each of its loops with `closed === false`, in order, one `{ slot, geometry }`. The `geometry` is `{ units: 'in', points, loops: [{ id: loop.id, closed: true, segs }] }`:
  - `points` = every point of the placed geometry, plus the points added below.
  - Let `start` be the first seg's `from`, `end` the last seg's `to`. `segs` starts as a copy of the loop's segs. Then `last = end`:
    - If `y(end) !== 0`, add point `_e` = `[x(end), 0]`, push the line `last → '_e'`, and set `last = '_e'`.
    - `target` is `'_s'` = `[x(start), 0]` (add it) when `y(start) !== 0`; otherwise it's `start`.
    - If `last` and `target` have different coordinates, push the line `last → target`.
    - If `target === '_s'`, push the line `'_s' → start`.
  - (Profile point names start with a letter, so `_e`/`_s` never clash.)
- `skipped`: slot names in `DOOR_PROFILE_SLOTS` order.

**NEW `src/elevation/model/__tests__/doorSection.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { doorSection } from '../doorSection.js';
import { profileDoorGhost } from '../profileGhost.js';
import { isProfileGeometry } from '../sectionProfiles.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [, BEAD, CROWN] = sample.profiles;
const [FIVE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const line = (from, to) => ({ type: 'line', from, to });
const ROUND = {
  id: 'sp-round', name: 'Round 1/4', kind: 'door_outside', version: 1, archived: false, drawnPoints: { elevation: [] },
  geometry: {
    units: 'in',
    points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
    loops: [{ id: 'L1', closed: false, segs: [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c')] }],
  },
};
const STEP = {
  id: 'sp-step', name: 'Step', kind: 'door_inside', version: 1, archived: true, drawnPoints: { elevation: [] },
  geometry: {
    units: 'in',
    points: { p: [-0.25, 0], q: [-0.25, -0.125], r: [0, -0.125] },
    loops: [{ id: 'L1', closed: false, segs: [line('p', 'q'), line('q', 'r')] }],
  },
};
const LIBRARY = [ROUND, STEP, BEAD, CROWN];
const picks = (profiles) => ({ ...DEFAULT_DOOR_STYLE, profiles: { outside: null, inside: null, panel: null, applied: null, ...profiles } });

describe('SPEC-48.4 the door style half section', () => {
  it('is the outside-edge door ghost for a 5-piece style with nothing picked', () => {
    expect(doorSection(DEFAULT_DOOR_STYLE, FIVE, LIBRARY)).toEqual({
      units: 'in', body: profileDoorGhost('door_outside', DEFAULT_DOOR_STYLE), placed: [], cuts: [], skipped: [],
    });
  });

  it('places each pick on its line, cuts open lines back to the face, and skips picks that don\'t fit', () => {
    const section = doorSection(picks({ outside: 'sp-round', inside: 'sp-step', panel: 'gone', applied: 'sp-bead' }), FIVE, LIBRARY);
    expect(section.placed).toEqual([
      { slot: 'outside', profileId: 'sp-round', name: 'Round 1/4', geometry: ROUND.geometry },
      {
        slot: 'inside', profileId: 'sp-step', name: 'Step',
        geometry: { ...STEP.geometry, points: { p: [2.75, 0], q: [2.75, -0.125], r: [3, -0.125] } },
      },
      {
        slot: 'applied', profileId: 'sp-bead', name: 'Half bead',
        geometry: {
          units: 'in',
          points: { s: [3, 0], t: [3.5, 0] },
          loops: [{ id: 'L1', closed: true, segs: [{ type: 'arc', from: 's', to: 't', center: [3.25, 0], ccw: false }, line('t', 's')] }],
        },
      },
    ]);
    expect(section.cuts).toEqual([
      {
        slot: 'outside',
        geometry: {
          units: 'in',
          points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125], _e: [0, 0] },
          loops: [{
            id: 'L1', closed: true,
            segs: [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c'), line('c', '_e'), line('_e', 'a')],
          }],
        },
      },
      {
        slot: 'inside',
        geometry: {
          units: 'in',
          points: { p: [2.75, 0], q: [2.75, -0.125], r: [3, -0.125], _e: [3, 0] },
          loops: [{ id: 'L1', closed: true, segs: [line('p', 'q'), line('q', 'r'), line('r', '_e'), line('_e', 'p')] }],
        },
      },
    ]);
    expect(section.cuts.map(({ geometry }) => isProfileGeometry(geometry))).toEqual([true, true]);
    expect(section.skipped).toEqual(['panel']);
    expect(doorSection(picks({ inside: 'sp-crown', applied: 'sp-round' }), FIVE, LIBRARY).skipped).toEqual(['inside', 'applied']);
    expect(STEP.geometry.points.p).toEqual([-0.25, 0]);
  });

  it('draws a slab, puts slab-applied molding at the inset, and has no section when it can\'t draw one', () => {
    const slab = doorSection(picks({ outside: 'sp-round', inside: 'sp-step', applied: 'sp-bead' }), SLAB, LIBRARY);
    expect(slab.body).toEqual({
      units: 'in',
      points: { b1: [0, 0], b2: [3, 0], b3: [3, -0.8125], b4: [0, -0.8125] },
      loops: [{ id: 'slab', closed: true, segs: [line('b1', 'b2'), line('b2', 'b3'), line('b3', 'b4'), line('b4', 'b1')] }],
    });
    expect([slab.placed.map(({ slot }) => slot), slab.cuts.map(({ slot }) => slot), slab.skipped]).toEqual([['outside'], ['outside'], []]);
    const molded = doorSection({ ...picks({ applied: 'sp-bead' }), thickness: 0.75, stiles: { left: 2, right: 2 } }, SLAB_AM, LIBRARY);
    expect([molded.body.points.b2, molded.body.points.b3, molded.placed[0].geometry.points, molded.placed[0].geometry.loops[0].segs[0].center])
      .toEqual([[5, 0], [5, -0.75], { s: [2, 0], t: [2.5, 0] }, [2.25, 0]]);
    expect([
      doorSection({ ...DEFAULT_DOOR_STYLE, thickness: 0.5 }, FIVE, LIBRARY),
      doorSection({ ...DEFAULT_DOOR_STYLE, thickness: 0 }, SLAB, LIBRARY),
      doorSection(DEFAULT_DOOR_STYLE, null, LIBRARY),
      doorSection({ ...DEFAULT_DOOR_STYLE, stiles: { left: 0, right: 3 } }, SLAB_AM, LIBRARY),
    ]).toEqual([null, null, null, null]);
  });
});
```

How the numbers come out:
- The round-over is an outside-edge pick, so dx = 0 and it isn't moved. Its line starts on the face at a (1/4, 0) and ends at c (0, −13/16), below the face. `_e` = (0, 0) closes it up the edge, and since a is already on the face, the region closes with `_e → a` (the bit of face from 0 to 1/4"). So the region is just the rounded corner.
- The step (inside, archived but picked) moves by S = 3: p (2.75, 0), q (2.75, −1/8), r (3, −1/8). r is below the face, so `_e` = (3, 0) and the region closes `_e → p`. That's a 1/4" × 1/8" rabbet in the stile's inside corner.
- The half bead (applied, closed) moves to s (3, 0), t (3.5, 0), center (3.25, 0). Being closed, it has no cut.
- Panel `'gone'` is missing → skipped. Crown on inside and a door-outside profile on applied are wrong kinds → skipped.
- Slab: only `outside` is in its slots, so the inside and applied picks are ignored (not skipped). Width 3, thickness 13/16.
- Slab-applied with a 2" inset, 3/4" thick: width 5. The bead moves by 2 → s (2, 0), t (2.5, 0), center (2.25, 0).
- 1/2"-thick 5-piece → the ghost is null → no section. Thickness 0, no design, or a 0 inset → null.

**Don't touch:** every existing file. **Count:** 1154 + 3 = **1157**.

---

## §3 Step 452 — UI: pickers only

UI only, no new tests.

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/DoorProfilePickers.jsx` | 92 | drop New/Edit/overlay |
| DELETE `src/library/profileEditor/ProfileEditorOverlay.jsx` | 27 | `git rm` |
| `src/elevation/components/DoorStyleFields.jsx` | 143 | drop `onProfileEditorChange` |
| `src/elevation/components/DoorStyleEditor.jsx` | 117 | drop the `profileEditorOpen` ref, its guard and the prop |

**Contract.**
- `DoorProfilePickers({ draft, setDraft, design })`:
  - Delete the `ProfileEditorOverlay` import (line 6), `useState`/`useDispatch`, `addSectionProfile`/`deleteSectionProfile`, `doorProfileSlotKind`, `BUTTON_CLASS`, the `editing` state, `open`, `close`, both buttons (lines 59–78) and the overlay line (89).
  - Each row is the label with the select directly under it (`mt-1`, full width; drop the flex wrapper).
  - The first note (lines 83–85) becomes: *Pick from the profile library. To make or change a profile, go to Library → Profiles.*
  - Keep the greyed-slots note.
- `DoorStyleFields.jsx`: the signature becomes `({ draft, setDraft, designs })`; line 139 → `<DoorProfilePickers draft={draft} setDraft={setDraft} design={design} />`.
- `DoorStyleEditor.jsx`: delete `const profileEditorOpen = useRef(false);` (line 16), the `if (profileEditorOpen.current) return;` line (26) and the `onProfileEditorChange={…}` prop (95). Keep `useRef` (it's still used for `panelRef`).
- Then this must print nothing: `grep -rn "ProfileEditorOverlay\|profileEditorOpen\|onProfileEditorChange\|onEditorChange" src`.

**Don't touch:** `ProfileEditor.jsx`, `ProfileEditorPage.jsx`, the model, the store, `useElevationKeys.js`/`usePlanKeys.js` (keep the modal guard), `TeamDoorStylePage.jsx`.

Gate: `npm test && npm run lint && npm run build`; 1157 tests.

---

## §4 Step 453 — UI: the section view; a wide two-column tool; field order

UI only, no new tests.

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/components/DoorSectionView.jsx` | — | the section SVG |
| `src/elevation/components/DoorStyleFields.jsx` | (452) | two columns; field order |
| `src/elevation/components/DoorStyleEditor.jsx` | (452) | wider dialog |
| `src/library/TeamDoorStylePage.jsx` | 62 | wider container |

**Contract.**
- **`DoorSectionView({ style, design })`**:
  - `profiles = useSelector((state) => state.elevation.settings.sectionProfiles)`; `section = doorSection(style, design, profiles)`.
  - `null` section → `<p className="text-xs text-gray-400">Too thin to draw a section (thickness and stile/inset must be over 1/2").</p>`.
  - Bounds: the union of `sectionProfileBounds({ geometry })` over `section.body` and every `placed[].geometry`, also including y = 0. `pad = 0.25`. `viewBox = `${minX - pad} ${-maxY - pad} ${w + 2 * pad} ${h + 2 * pad}`` (y flipped, the same as `ProfileThumbnail.jsx`).
  - `<svg viewBox=… preserveAspectRatio="xMidYMid meet" role="img" aria-label="Door section" className="h-64 w-full rounded border border-gray-700 bg-gray-900">`. Paths use `sectionProfileSvgPath({ geometry })`, `vectorEffect="non-scaling-stroke"` and `strokeLinejoin="round"`. Layers, in order:
    1. `<defs><mask id={maskId} maskUnits="userSpaceOnUse" x y width height = the viewBox>`: a white `<rect>` covering the viewBox, then each `cuts[].geometry` path with `fill="black"`. Make `maskId` with `useId()` and strip its colons (`.replace(/:/g, '')`) so `url(#…)` works.
    2. The body: one path, `className="text-gray-400"`, `fill="currentColor" fillOpacity={0.2} fillRule="evenodd" stroke="currentColor" strokeOpacity={0.6} strokeWidth={1}`, `mask={`url(#${maskId})`}`.
    3. The face line: a `<line>` from (minX − pad, 0) to (maxX + pad, 0), `className="text-gray-600" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke"`.
    4. Each placed profile's loops one at a time (`sectionProfileSvgPath({ geometry: { ...geometry, loops: [loop] } })`), `className="text-blue-400"`. An open loop: `fill="none" stroke="currentColor" strokeWidth={2}`. A closed loop: `fill="currentColor" fillOpacity={0.3} stroke="currentColor" strokeWidth={1.5}`. Add `<title>{name}</title>` inside each path.
  - Under the SVG, `text-xs text-gray-400`: *Half section through the left stile, front face up, at this style's thickness and width. Open lines cut the wood back to the face; closed shapes are applied. Raised panels draw over the flat panel for now.*
  - When `section.skipped.length`, `text-xs text-amber-300`: *Not shown (missing or wrong kind): {labels joined ', '}.* using `{ outside: 'Outside edge', inside: 'Inside profile', panel: 'Raised panel', applied: 'Applied molding' }`.
  - Imports: `doorSection` (`../model/doorSection.js`); `sectionProfileBounds`, `sectionProfileSvgPath` (`../model/sectionProfiles.js`).
- **`DoorStyleFields.jsx`:**
  - Import `DoorSectionView`.
  - The returned root becomes `<div className="grid gap-6 md:grid-cols-2">`. Its left child is `<div className="space-y-4">` holding the existing blocks. **Move them with their exact JSX** (rule 9, cut and paste, don't retype) into this order: Design select → Thickness → Stiles & rails section → **Profiles section** → Panel section → Mid rail/stile extra → Arch rise block → **Short faces section** (last). Its right child is `<div className="space-y-2 self-start md:sticky md:top-0"><h3 className={HEADING_CLASS}>Section</h3><DoorSectionView style={draft} design={design} /></div>`.
- **`DoorStyleEditor.jsx`:** the dialog's `w-[36rem]` becomes `w-[64rem] max-w-[95vw]`. Nothing else.
- **`TeamDoorStylePage.jsx`:** line 23 `max-w-xl` → `max-w-5xl`.

**Don't touch:** the model, the store, `DoorProfilePickers.jsx`, `ProfileEditor*`, `RoomDoorStylesPanel.jsx`, the canvas and DXF.

Gate: `npm test && npm run lint && npm run build`; 1157 tests.

---

## §5 Step 454 — UI: one stile & rail width

UI only, no new tests. Only `src/elevation/components/DoorStyleFields.jsx`.

**Contract** (inside the Stiles & rails section; the heading stays *Stiles & rails* / *Molding inset*, and the slab note stays):
- Import `useState` from `react`.
- `const sizes = [draft.stiles.left, draft.stiles.right, draft.rails.top, draft.rails.bottom];`, `const same = sizes.every((size) => size === sizes[0]);`, `const [sides, setSides] = useState(false);`, `const showSides = sides || !same;`.
- `setAll(value)` = `setDraft((previous) => ({ ...previous, stiles: { left: value, right: value }, rails: { top: value, bottom: value } }))`.
- When `!showSides`: one `SizeField` labelled `applied ? 'Inset' : 'Stile & rail width'`, value `draft.stiles.left`, `disabled={slab}`, `onChange={setAll}`. Under it, a link-style button (`text-xs text-blue-400 hover:underline disabled:opacity-50`, `disabled={slab}`): **Different sizes…** → `setSides(true)`.
- When `showSides`: the existing four-field grid, unchanged. Under it, the same button style: **Use one width** → `setAll(draft.stiles.left); setSides(false);`.
- Under either, `text-xs text-gray-500`: *Short doors and drawer fronts still shrink their rails by the short-face rule.*

**Don't touch:** anything else in the file, every other file.

Gate: `npm test && npm run lint && npm run build`; 1157 tests.

---

## End-to-end check (Kyle, after 454)

- **Library → Team door style.** The page is wide: fields on the left, **Section** on the right. With nothing picked you see the square 3" stile, the groove, the tongue and 3" of panel, the same as the editor's ghost.
- **Width and thickness.** Set the width to 2 1/2": the stile narrows and the panel slides left. Set the thickness to 1": the section thickens and the panel's back stays flush. **Different sizes…** shows four fields; set the top rail to 2 3/4" and it stays on four fields; **Use one width** puts all four back to the left stile.
- **Pick profiles.** Make (on Library → Profiles) a Door outside edge round-over drawn as an open line from (1/4, 0) arcing to (0, −1/4) then down to (0, −13/16). Pick it: the section's outer corner is rounded away. Pick an inside profile drawn as an open line on its stile side: the stile's inside corner is cut. Pick an applied molding drawn closed: it sits on the face at the panel opening. Archive one: it still draws (picked).
- **Slab designs.** Switch to Slab: a 3" slab with only the outside edge drawn. Switch to Slab AM: the molding sits at the inset.
- **Over a room.** Elevation Lab → a room's **Door styles** → Edit: the same wide two-column tool. The pickers have no New/Edit buttons. Short faces is last.
- Doors on the canvas and in the DXF are still square, as expected until round 50.

**Known for now:**
- Raised panels draw as a line over the flat ghost panel, and the groove and tongue are still the fixed shop standard.
- Cuts remove wood straight up to the face from the line's ends. A line that doubles back under itself can look odd; draw cuts from the face in.
- The section shows the left stile only (the stile you scribe can differ per part; that's the allowances round).

---

## Plan updates to make at the next plan edit

- §10: add row **48.4** (steps 451–454): half section in the door style tool (moved up from 52, P19) with picks placed and cuts masked; pickers only (New/Edit removed); one stile & rail width with **Different sizes…**; wide two-column tool, short faces last. Mark 48.3 ✅ with a note that its New/Edit overlay was removed in 48.4.
- §10 row **52** → *real raised panel and groove from the panel profile in the section; fit checks drawn on it*. Row **52.1** (DXF detail block) can use `doorSection`.
- §5: the door style tool is two columns (fields | section). Pickers are pick-only; profiles are made only on Library → Profiles.
- §7: the section frame is x = 0 at the door's outside edge, y = 0 at the face; picks are placed at their slot's line (0 or `stiles.left`); an open line cuts the wood between itself and the face.
