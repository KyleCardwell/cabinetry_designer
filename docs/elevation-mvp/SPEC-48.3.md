# Round 48.3 — SPEC: profile pickers in the door style tool; the editor opens over the room

Steps 448–450, designer only, on branch `elevation-doors` (after step 447, 1150 tests). Geometry and the API don't change. No Supabase (plan P18).

**Done when:**
- The door style tool's **Profiles** section (room style editor *and* Library → Team door style) has one picker per slot: **Outside edge**, **Inside profile**, **Raised panel**, **Applied molding**. Each lists *Square* (*None* for applied molding) and then the library's unarchived profiles of that slot's kind. A slot the design doesn't use is greyed but keeps its pick.
- Each slot has **New…** and **Edit…**. They open the full profile editor **full screen over whatever screen you're on** (room or Library), and **← Door style** brings you back with the door style tool exactly as you left it. A new profile you save comes back picked in its slot. A new profile you close without ever saving is removed.
- While the editor (or any modal) is open over the room, the room's keyboard shortcuts don't fire (Delete, Ctrl+Z, V, L, F… act only on the profile).
- Doors still **draw square**. Picked profiles are stored on the style; round 50 draws them.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **448** | designer | Model + slice: slot kinds, slot choices, new profile of a kind | 1150 → **1154** |
| **449** | designer | UI: `ProfileEditor` split out of the page; `ProfileEditorOverlay`; room keys ignore open modals | 1154 |
| **450** | designer | UI: `DoorProfilePickers` in `DoorStyleFields`; door style tool key guard | 1154 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Every expected value in the tests was worked out by hand from the rules below and `fixtures/sectionProfiles.json` (`sp-cove` *Cove 1/4* door_inside, `sp-bead` *Half bead* applied_molding, `sp-crown` *Crown 4 1/2* crown). If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got.

---

## §1 Decisions (2026-10-09)

- **The slot pickers move up from round 50.** Plan §10 had 48.3 as "editor full screen over the room from the door style tool's New/Edit profile…", but the tool has no slot pickers yet (`DoorStyleFields` says *All square — the profile library comes later*), so there was nothing for New/Edit to return to. Picking and storing a profile id is small; round 50 keeps the drawing (offset loops in canvas/DXF, open vs closed, fit checks).
- **Door style slot → profile kind:** `outside → door_outside`, `inside → door_inside`, `panel → door_panel`, `applied → applied_molding` (the same kind for 5-piece and slab-applied designs, plan P3/P17). Anything else → `null`.
- **What a picker lists** (`doorProfileChoices`), in order:
  1. `{ id: null, name: 'Square', note: null }` — or `name: 'None'` for `applied` (null on applied means no molding, plan P17).
  2. Every profile whose kind is the slot's kind and that isn't archived, in library order, `note: null`.
  3. If the style's current pick is a string not already listed: that profile with `note: 'wrong kind'` (kind differs — checked first), else `note: 'archived'`; or, when no profile has that id, `{ id, name: 'Missing profile', note: 'missing' }`.
  - An unknown slot → `[]`. A pick of `null`/`undefined` adds nothing.
  - The UI shows `name (note)` when there's a note. Nothing is ever auto-cleared: a style keeps an archived, wrong-kind or missing pick until someone picks again (deleting a profile in use is already blocked by `sectionProfileUses`).
- **New profile from a slot** = the library's new square (unchanged shape) with the slot's kind, named `New <kind label in lower case>` (`New door inside profile`, `New applied molding`), numbered like today (`… 2`). Kind `other` or anything that isn't a kind → kind `other`, name `New profile` (today's behaviour). With a base (Copy), the kind argument is ignored.
- **Editor over the room.** The profile editor page becomes a `ProfileEditor` component (props `profileId`, `backLabel`, `onClose`). The `/library/profiles/:id` route wraps it (back → `/library/profiles`, unchanged behaviour). `ProfileEditorOverlay` portals it full screen over the current screen. `onClose({ saved })` tells the caller whether **Save** was pressed at least once on that visit.
- **Closing a new profile without saving removes it** (it isn't in use, because the door style draft isn't stored yet). A new profile that was saved is picked in its slot when the editor closes, even if its kind was changed meanwhile (the picker then shows *(wrong kind)* so it's visible). **Edit…** never changes the pick.
- **Profiles saved from the overlay stay saved** even if the door style tool is then cancelled — they're library edits, like Save on the Library page.
- **Room shortcuts ignore open modals.** `useElevationKeys` and `usePlanKeys` return early when any `[aria-modal="true"]` element is in the document. This also stops Delete/Ctrl+Z reaching the room while the existing door style tool is open, which was already possible when focus sat on a button.
- **Not in 48.3:** drawing profiles on doors (round 50), the half cross-section (52), a profile preview in the picker, crown/base/nosing pickers on runs (50.1), deleting unused profiles when a style is cancelled.

---

## §2 Step 448 — model + slice

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/sectionProfiles.js` | 387 | `doorProfileSlotKind`, `doorProfileChoices`; `newSectionProfile` gains `kind` |
| `src/elevation/store/slices/sectionProfiles.js` | 66 | `addSectionProfile` passes `kind` |
| NEW `src/elevation/model/__tests__/doorProfileSlots.test.js` | — | 3 tests, verbatim |
| `src/elevation/store/__tests__/sliceSectionProfiles.test.js` | — | 1 test, verbatim |

**Contract.**

`sectionProfiles.js` (it already imports `DOOR_PROFILE_SLOTS, teamDoorStyle` from `./doorStyles.js` on line 1; nothing new to import):
- File-local `DOOR_SLOT_KINDS = { outside: 'door_outside', inside: 'door_inside', panel: 'door_panel', applied: 'applied_molding' }`, placed just above `doorProfileSlotKind`.
- `export function doorProfileSlotKind(slot)` → `Object.hasOwn(DOOR_SLOT_KINDS, slot) ? DOOR_SLOT_KINDS[slot] : null` (guard non-strings so `undefined` returns `null`). Doc: *SPEC-48.3 the profile kind a door style slot takes.*
- `export function doorProfileChoices(profiles, slot, pickedId)` → the list in §1. Doc: *SPEC-48.3 what a door style slot can pick: Square/None, its kind's live profiles, then a pick that no longer fits.*
- `newSectionProfile(profiles, id, base = null, kind = 'other')`: when `base` is null, the new profile's kind is `kind` if `isProfileKind(kind)`, else `'other'`; the starting name is `'New profile'` for `other`, otherwise `` `New ${PROFILE_KINDS[k].label.toLowerCase()}` ``. Everything else (dedupe loop, square geometry, `version: 1`, `archived: false`, copy path) is unchanged. `PROFILE_KINDS`/`isProfileKind` are declared lower in the same file; that's fine because they're read when the function runs. Doc: *…SPEC-48.3 a new square can start as a kind.*
- Put both new exports after `profileFitsSlot`.

`store/slices/sectionProfiles.js` `addSectionProfile.reducer`: `const { baseId, id, kind } = action.payload;` and `newSectionProfile(list, id, base, kind)`. `prepare` unchanged.

**NEW `src/elevation/model/__tests__/doorProfileSlots.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOOR_PROFILE_SLOTS } from '../doorStyles.js';
import { doorProfileChoices, doorProfileSlotKind, isSectionProfile, newSectionProfile } from '../sectionProfiles.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const SQUARE = { id: null, name: 'Square', note: null };

describe('SPEC-48.3 door style profile slots', () => {
  it('gives each door style slot its profile kind', () => {
    expect(DOOR_PROFILE_SLOTS.map((slot) => doorProfileSlotKind(slot)))
      .toEqual(['door_outside', 'door_inside', 'door_panel', 'applied_molding']);
    expect([doorProfileSlotKind('crown'), doorProfileSlotKind('door_inside'), doorProfileSlotKind('toString'), doorProfileSlotKind(undefined)])
      .toEqual([null, null, null, null]);
  });

  it('lists Square (None for applied), the live profiles of the slot\'s kind, then a pick that no longer fits', () => {
    const cove2 = { ...COVE, id: 'sp-cove-2', name: 'Cove 3/8' };
    const old = { ...COVE, id: 'sp-old', name: 'Old cove', archived: true };
    const list = [COVE, BEAD, CROWN, old, cove2];
    const inside = [SQUARE, { id: 'sp-cove', name: 'Cove 1/4', note: null }, { id: 'sp-cove-2', name: 'Cove 3/8', note: null }];
    expect(doorProfileChoices(list, 'inside', null)).toEqual(inside);
    expect([doorProfileChoices(list, 'inside', undefined), doorProfileChoices(list, 'inside', 'sp-cove-2')]).toEqual([inside, inside]);
    expect(doorProfileChoices(list, 'inside', 'sp-old')).toEqual([...inside, { id: 'sp-old', name: 'Old cove', note: 'archived' }]);
    expect(doorProfileChoices(list, 'inside', 'sp-crown').at(-1)).toEqual({ id: 'sp-crown', name: 'Crown 4 1/2', note: 'wrong kind' });
    expect(doorProfileChoices([{ ...CROWN, archived: true }], 'inside', 'sp-crown'))
      .toEqual([SQUARE, { id: 'sp-crown', name: 'Crown 4 1/2', note: 'wrong kind' }]);
    expect(doorProfileChoices(list, 'inside', 'gone').at(-1)).toEqual({ id: 'gone', name: 'Missing profile', note: 'missing' });
    expect(doorProfileChoices(list, 'applied', null))
      .toEqual([{ id: null, name: 'None', note: null }, { id: 'sp-bead', name: 'Half bead', note: null }]);
    expect([doorProfileChoices(list, 'outside', null), doorProfileChoices(list, 'panel', null), doorProfileChoices(list, 'crown', null)])
      .toEqual([[SQUARE], [SQUARE], []]);
  });

  it('starts a new square profile of a kind, named for the kind', () => {
    const made = newSectionProfile([COVE], 'sp-new', null, 'door_inside');
    expect([made.id, made.name, made.kind, made.version, made.archived, isSectionProfile(made)])
      .toEqual(['sp-new', 'New door inside profile', 'door_inside', 1, false, true]);
    expect([made.geometry, made.drawnPoints]).toEqual([newSectionProfile([], 'x').geometry, { elevation: [] }]);
    expect(newSectionProfile([made], 'sp-2', null, 'door_inside').name).toBe('New door inside profile 2');
    expect([
      newSectionProfile([], 'a', null, 'applied_molding').name,
      newSectionProfile([], 'b', null, 'other').name,
      newSectionProfile([], 'c', null, 'nope').name,
      newSectionProfile([], 'd').name,
    ]).toEqual(['New applied molding', 'New profile', 'New profile', 'New profile']);
    expect([newSectionProfile([], 'c', null, 'nope').kind, newSectionProfile([], 'e', null, null).kind]).toEqual(['other', 'other']);
    expect(newSectionProfile([COVE], 'f', COVE, 'crown')).toMatchObject({ id: 'f', name: 'Cove 1/4 copy', kind: 'door_inside' });
  });
});
```

**Add to `src/elevation/store/__tests__/sliceSectionProfiles.test.js`** as the last `it` in the `describe` (after *imports a profiles file by id*), verbatim:

```js
  it('adds a new profile of a kind for a door style slot (SPEC-48.3)', () => {
    const state = apply(
      withLibrary(),
      addSectionProfile({ id: 'sp-1', kind: 'door_outside' }),
      addSectionProfile({ id: 'sp-2', kind: 'shop_x' }),
      addSectionProfile({ id: 'sp-3', baseId: 'sp-crown', kind: 'door_outside' }),
    );
    expect(state.settings.sectionProfiles.slice(3).map(({ id, name, kind }) => [id, name, kind])).toEqual([
      ['sp-1', 'New door outside edge', 'door_outside'],
      ['sp-2', 'New profile', 'other'],
      ['sp-3', 'Crown 4 1/2 copy', 'crown'],
    ]);
  });
```

How the numbers come out: the labels are *Door inside profile*, *Door outside edge*, *Applied molding* lower-cased after *New*. `sp-old` is archived, so it's left out of the live list and only comes back as the pick. The archived crown is listed as *wrong kind*, because the kind check comes first. Outside and panel have no sample profiles, so they show *Square* alone.

**Don't touch:** every other export, the fixture, every other test, the components.

**Count:** 1150 + 3 + 1 = **1154**. Golden snapshot unchanged.

---

## §3 Step 449 — UI: `ProfileEditor` component, overlay, room keys

UI only, no new tests. Nothing visible changes yet (the Library editor works exactly as before; the overlay isn't used until 450).

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/library/profileEditor/ProfileEditorPage.jsx` → `ProfileEditor.jsx` | 210 | `git mv`, then make it a component with props |
| NEW `src/library/profileEditor/ProfileEditorPage.jsx` | — | the route wrapper |
| NEW `src/library/profileEditor/ProfileEditorOverlay.jsx` | — | full-screen portal |
| `src/elevation/components/canvas/useElevationKeys.js` | 174 | one guard line |
| `src/elevation/plan/usePlanKeys.js` | 76 | one guard line |

`src/App.jsx` stays as it is (it imports `./library/profileEditor/ProfileEditorPage.jsx`, which is the new wrapper).

**Contract.**
- **Move first:** `git mv src/library/profileEditor/ProfileEditorPage.jsx src/library/profileEditor/ProfileEditor.jsx`. Then edit `ProfileEditor.jsx` (line numbers are from the old file):
  - Line 3: delete the `react-router-dom` import.
  - Line 22: `export default function ProfileEditor({ profileId, backLabel, onClose }) {`.
  - Delete lines 23–24 (`useParams`, `useNavigate`).
  - With the other state: `const [savedOnce, setSavedOnce] = useState(false);`. Below the hooks: `const close = () => onClose({ saved: savedOnce });` (a plain function, not a hook — put it after the `apply` callback, before `switchTool`).
  - The `useEffect` on `[profileId]` (lines 55–60) also calls `setSavedOnce(false)`.
  - Not found (lines 112–119): replace the `Link` with `<button type="button" className={BUTTON_CLASS} onClick={close}>{backLabel}</button>`.
  - Header (lines 127–138): the dirty button's click becomes `if (discarding) close(); else setDiscarding(true);` and its text `{discarding ? 'Discard changes?' : backLabel}`; the clean case becomes `<button type="button" className={BUTTON_CLASS} onClick={close}>{backLabel}</button>`.
  - Save (lines 152–155): after the `dispatch(updateSectionProfile(…))` call, `setSavedOnce(true);` (keep the dispatch exactly as is).
  - Nothing else changes (keys, canvas, panels, ghost, Details).
- **NEW `ProfileEditorPage.jsx`** (route wrapper): reads `profileId` with `useParams`, gets `navigate` with `useNavigate`, and returns `<ProfileEditor profileId={profileId} backLabel="← Profiles" onClose={() => navigate('/library/profiles')} />`. (The not-found button now reads *← Profiles* instead of *Back to profiles*; that's the only visible difference.)
- **NEW `ProfileEditorOverlay.jsx`** — `export default function ProfileEditorOverlay({ profileId, backLabel, onClose })`:
  - Uses `createPortal` from `react-dom` into `document.body`.
  - The portal content is `<div ref={ref} role="dialog" aria-modal="true" aria-label="Profile editor" tabIndex={-1} className="fixed inset-0 z-[60] flex flex-col bg-gray-900 outline-none">` holding `<ProfileEditor key={profileId} profileId={profileId} backLabel={backLabel} onClose={onClose} />`.
  - A mount effect (`[]`): remember `document.activeElement`, focus the div, and on cleanup focus the remembered element again (same pattern as `DoorStyleEditor.jsx` lines 21–23 and 45). Focusing the div matters: otherwise the **New…** button behind the overlay keeps focus, and Enter/Space would press it again.
  - z-[60] puts it above the door style tool (`z-50`). `ProfileDetailsDialog` (`fixed inset-0 z-50`) renders inside the overlay's subtree, so it still shows on top of the editor.
- **Room keys:** in `useElevationKeys.js`, right after the `tagName` input/select/textarea `return` (line 40), add `if (globalThis.document?.querySelector('[aria-modal="true"]')) return;`. Same line in `usePlanKeys.js`, right after its `tagName` `return` (line 27). Use `globalThis.document?.` so a test without a DOM doesn't throw.

**Don't touch:** `App.jsx`, `ProfilesPage.jsx` (its *Edit shape* link still goes to the route), the other editor panels, `ProfileCanvas.jsx`, the model, the store, `ElevationCanvas.jsx`/`PlanCanvas.jsx` space-to-pan handlers, `CanvasStage.jsx` (old designer). Don't grep the repo.

Gate: `npm test && npm run lint && npm run build`; 1154 tests.

---

## §4 Step 450 — UI: the pickers in the door style tool

UI only, no new tests.

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/components/DoorProfilePickers.jsx` | — | the four slot rows, New/Edit, the overlay |
| `src/elevation/components/DoorStyleFields.jsx` | 142 | Profiles section uses it; new optional prop |
| `src/elevation/components/DoorStyleEditor.jsx` | 110 | key handler skips while the profile editor is open |

**Contract.**
- **`DoorProfilePickers({ draft, setDraft, design, onEditorChange })`**:
  - `profiles = useSelector((state) => state.elevation.settings.sectionProfiles)`; `dispatch = useDispatch()`.
  - `SLOT_LABELS = { outside: 'Outside edge', inside: 'Inside profile', panel: 'Raised panel', applied: 'Applied molding' }`. `INPUT_CLASS` and a small `BUTTON_CLASS` copied from `DoorStyleEditor.jsx` lines 7–8.
  - State `editing`: `null` or `{ slot, profileId, created }`. `open(next)` sets it and calls `onEditorChange?.(true)`.
  - **Pick:** `setDraft((previous) => ({ ...previous, profiles: { ...previous.profiles, [slot]: id } }))`, where the select's `''` value means `null`.
  - **New…:** `const action = addSectionProfile({ kind: doorProfileSlotKind(slot) }); dispatch(action); open({ slot, profileId: action.payload.id, created: true });`.
  - **Edit…:** `open({ slot, profileId: picked, created: false })`. Enabled only when the pick is a string and `profiles.some((profile) => profile.id === picked)`.
  - **Close** (`onClose({ saved })` from the overlay): when `editing.created`, if `saved` pick the new id in `editing.slot`, otherwise `dispatch(deleteSectionProfile({ profileId: editing.profileId }))`. Then `setEditing(null)` and `onEditorChange?.(false)`.
  - **Rows**, one per `DOOR_PROFILE_SLOTS` entry, in order. `usable = Boolean(design?.slots.includes(slot))`. A row is a label (`block text-xs text-gray-400`, `opacity-50` when not usable) with `SLOT_LABELS[slot]` and, under it, a flex line: the select (`flex-1`, `INPUT_CLASS`, `aria-label={SLOT_LABELS[slot]}`, `disabled={!usable}`, value `draft.profiles?.[slot] ?? ''`, options from `doorProfileChoices(profiles, slot, draft.profiles?.[slot] ?? null)` with `value={id ?? ''}`, text `note ? `${name} (${note})` : name`), then **New…** (`disabled={!usable}`) and **Edit…** (`disabled={!usable || !editable}`). Buttons get `disabled:cursor-not-allowed disabled:opacity-50`.
  - Under the rows, `text-xs text-gray-400`: *Doors still draw with square edges until profiles are drawn on doors. New and Edit open the profile editor; a new profile closed without saving is removed.* When any slot isn't usable, also *Greyed slots aren't used by this design — kept if you switch back.*
  - `{editing && <ProfileEditorOverlay profileId={editing.profileId} backLabel="← Door style" onClose={close} />}`.
  - Imports: `DOOR_PROFILE_SLOTS` (`../model/doorStyles.js`), `doorProfileChoices`, `doorProfileSlotKind` (`../model/sectionProfiles.js`), `addSectionProfile`, `deleteSectionProfile` (`../store/elevationSlice.js`), `ProfileEditorOverlay` (`../../library/profileEditor/ProfileEditorOverlay.jsx`).
- **`DoorStyleFields.jsx`:** the signature becomes `DoorStyleFields({ draft, setDraft, designs, onProfileEditorChange })`. Replace lines 136–139 (the Profiles section) with the same `<section className="space-y-2">` and `<h3 className={HEADING_CLASS}>Profiles</h3>`, followed by `<DoorProfilePickers draft={draft} setDraft={setDraft} design={design} onEditorChange={onProfileEditorChange} />`. `TeamDoorStylePage.jsx` doesn't pass the prop and doesn't need to.
- **`DoorStyleEditor.jsx`:** `const profileEditorOpen = useRef(false);` beside `panelRef`. The keydown handler (line 24) starts with `if (profileEditorOpen.current) return;`, so Escape and the Tab trap leave the editor alone. Pass `onProfileEditorChange={(open) => { profileEditorOpen.current = open; }}` to `DoorStyleFields` (line 89).

**Don't touch:** the model, the store, `ProfileEditor.jsx`, `ProfileEditorOverlay.jsx`, `TeamDoorStylePage.jsx`, `RoomDoorStylesPanel.jsx`, the canvas and DXF door drawing. Don't grep the repo.

Gate: `npm test && npm run lint && npm run build`; 1154 tests.

---

## End-to-end check (Kyle, after 450)

- **Library → Team door style.** The Profiles section has four rows. On the 5-piece design all four are live; *Applied molding* says *None*, the others *Square*. Switch Design to *Slab*: Inside and Raised panel and Applied grey out (Slab only uses Outside). Back to 5-piece: anything you'd picked is still there.
- **New from a slot.** On *Inside profile* press **New…**. The profile editor fills the screen with *New door inside profile*, kind already *Door inside profile*, and the door ghost behind it. Draw something, **Save**, then **← Door style**: you're back on the team style with the new profile picked. Save the team style.
- **New, then back out.** Press **New…** on *Outside edge* and go straight back with **← Door style** (nothing saved): no pick, and Library → Profiles has no *New door outside edge*.
- **Edit.** With a profile picked, **Edit…** opens it. Change the shape, Save, go back: the pick is the same; its version went up on the Profiles page.
- **Over the room.** In the Elevation Lab open a room's **Door styles** → Edit a style → **New…** on Inside. In the editor, select a point and press **Delete**, press **Ctrl+Z**, **V**, **L**, **F**: only the profile reacts, the room behind doesn't change. **Escape** cancels the line / clears the selection; it doesn't close the door style tool. **← Door style** returns to the tool with your unsaved style edits still there. Save the style.
- **Notes in pickers.** Archive the picked profile on the Profiles page, reopen the style: it shows *(archived)*. Change a picked profile's kind to Crown: *(wrong kind)*. Trying to delete a picked profile on the Profiles page is still refused (it's in use once the style is saved).
- Doors on the canvas and in the DXF still draw square — expected until round 50.

**Known for now:**
- Profiles saved from the overlay stay in the library even if you then cancel the door style.
- No thumbnail in the pickers yet.
- Room shortcuts are now off whenever any modal is open (door style tool, details dialogs); that's intended.

---

## Plan updates to make at the next plan edit

- §10: row **48.3** → *SPEC-48.3 (steps 448–450): profile pickers in the door style tool (moved up from 50) with New…/Edit… opening the editor full screen over the room or Library; a new profile closed unsaved is removed; room keys ignore open modals.* Mark 48.2 ✅.
- §10 row **50**: drop "Profile slots in the door style tool"; it becomes *picked profiles → offset loops in canvas and DXF (P4)…*.
- §5 door style tool bullet: the pickers list *Square* / *None* (applied) plus the kind's unarchived profiles; picks that no longer fit show *(archived)*, *(wrong kind)* or *Missing profile* and are never cleared automatically.
