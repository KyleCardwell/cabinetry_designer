# Round 48.3 — Codex Prompts, Steps 448–450 (profile pickers in the door style tool; editor over the room)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**. Geometry and the API don't change. No Supabase (plan P18).

| Step | Repo | What | Tests after |
|---|---|---|---|
| 448 | cabinetry_designer | Model + slice: slot kinds, slot choices, new profile of a kind | 1154 |
| 449 | cabinetry_designer | UI: ProfileEditor component, overlay, room keys ignore modals | 1154 |
| 450 | cabinetry_designer | UI: profile pickers + New/Edit in the door style tool | 1154 |

Line numbers in each prompt are from **before** that step's edits.

---

## Before step 448 (Kyle)

The two docs are already in `cabinetry_designer/docs/elevation-mvp/`; commit them:

```bash
cd cabinetry_designer
git status                                   # on elevation-doors, 447 in; only the two docs below are new
git add docs/elevation-mvp/SPEC-48.3.md docs/elevation-mvp/PROMPTS-48.3.md
git commit -m "round 48.3 docs"
```

---

## Step 448 — model + slice

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.3.md §1 and §2. Step 447 is in (1150 tests).
If `git status` shows uncommitted changes, stop and tell me.

Additions only — existing behaviour stays the same.

src/elevation/model/sectionProfiles.js (387 lines; line 1 already imports DOOR_PROFILE_SLOTS and teamDoorStyle from ./doorStyles.js):
- After profileFitsSlot (ends ~line 120) add a file-local DOOR_SLOT_KINDS = { outside: 'door_outside', inside: 'door_inside', panel: 'door_panel', applied: 'applied_molding' } and:
  - export doorProfileSlotKind(slot): the kind for an own key of DOOR_SLOT_KINDS, else null (undefined/non-strings → null).
  - export doorProfileChoices(profiles, slot, pickedId): unknown slot → []. Else [{ id: null, name: slot === 'applied' ? 'None' : 'Square', note: null }, then every profile with kind === the slot's kind and !archived in list order as { id, name, note: null }]; then, if pickedId is a non-empty string not already listed: the profile with that id as { id, name, note: 'wrong kind' } when its kind differs, else note 'archived'; if no profile has that id, { id: pickedId, name: 'Missing profile', note: 'missing' }.
  - one-line doc comments naming SPEC-48.3.
- newSectionProfile(profiles, id, base = null, kind = 'other') (line 204): only when base is null, the kind is `kind` if isProfileKind(kind) else 'other', and the starting name is 'New profile' for other, else `New ${PROFILE_KINDS[k].label.toLowerCase()}`. The dedupe loop, square geometry, version 1, archived false and the copy path stay exactly as they are; with a base the kind argument is ignored. Extend the doc comment ("SPEC-48.3 a new square can start as a kind").

src/elevation/store/slices/sectionProfiles.js (66 lines): addSectionProfile.reducer reads `{ baseId, id, kind }` and calls newSectionProfile(list, id, base, kind). prepare unchanged.

Tests, VERBATIM from SPEC §2:
- NEW src/elevation/model/__tests__/doorProfileSlots.test.js (3 tests).
- src/elevation/store/__tests__/sliceSectionProfiles.test.js: add the SPEC §2 `it` as the last test in the describe (after 'imports a profiles file by id').

Files (only these four).

DO NOT change any other export, the fixture, any other test, the store's other reducers or the components. DO NOT grep the repo.

Write the tests first; run `npx vitest run src/elevation/model/__tests__/doorProfileSlots.test.js src/elevation/store/__tests__/sliceSectionProfiles.test.js` — the new ones must fail. Iterate on those two files only. At the end `npm test && npm run lint` once: 1150 + 4 = 1154, golden snapshot unchanged, lint 0 errors. If a number still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 448 Door style profile slot choices".
```

---

## Step 449 — UI: ProfileEditor component, overlay, room keys

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.3.md §1 and §3. Step 448 is in (1154 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Nothing visible changes except the not-found button text. Exactly SPEC §3:

1. FIRST: git mv src/library/profileEditor/ProfileEditorPage.jsx src/library/profileEditor/ProfileEditor.jsx (210 lines). In ProfileEditor.jsx (old line numbers):
   - delete line 3 (react-router-dom import); line 22 → export default function ProfileEditor({ profileId, backLabel, onClose }); delete lines 23–24 (useParams, useNavigate).
   - add state `const [savedOnce, setSavedOnce] = useState(false);` and, after the `apply` useCallback, `const close = () => onClose({ saved: savedOnce });`.
   - the [profileId] useEffect (55–60) also calls setSavedOnce(false).
   - not-found block (112–119): the Link becomes <button type="button" className={BUTTON_CLASS} onClick={close}>{backLabel}</button>.
   - header (127–138): dirty button click → `if (discarding) close(); else setDiscarding(true);`, text {discarding ? 'Discard changes?' : backLabel}; the clean Link → <button type="button" className={BUTTON_CLASS} onClick={close}>{backLabel}</button>.
   - Save (152–155): keep the dispatch as is, then setSavedOnce(true).
   - nothing else changes.
2. NEW src/library/profileEditor/ProfileEditorPage.jsx: route wrapper — useParams profileId, useNavigate; returns <ProfileEditor profileId={profileId} backLabel="← Profiles" onClose={() => navigate('/library/profiles')} />. App.jsx keeps importing this file unchanged.
3. NEW src/library/profileEditor/ProfileEditorOverlay.jsx: export default ProfileEditorOverlay({ profileId, backLabel, onClose }). createPortal (react-dom) into document.body of <div ref role="dialog" aria-modal="true" aria-label="Profile editor" tabIndex={-1} className="fixed inset-0 z-[60] flex flex-col bg-gray-900 outline-none"> containing <ProfileEditor key={profileId} profileId={profileId} backLabel={backLabel} onClose={onClose} />. Mount effect ([]): remember document.activeElement, focus the div, refocus the remembered element on cleanup (pattern: src/elevation/components/DoorStyleEditor.jsx lines 21–23 and 45).
4. src/elevation/components/canvas/useElevationKeys.js: right after the tagName input/select/textarea return (line 40) add `if (globalThis.document?.querySelector('[aria-modal="true"]')) return;`.
5. src/elevation/plan/usePlanKeys.js: the same line right after its tagName return (line 27).

Files (only these): ProfileEditor.jsx (moved), ProfileEditorPage.jsx (new), ProfileEditorOverlay.jsx (new), useElevationKeys.js, usePlanKeys.js.

DO NOT change App.jsx, ProfilesPage.jsx, ProfileCanvas.jsx or the other editor panels, the model, the store, the ElevationCanvas/PlanCanvas space handlers or src/canvas/CanvasStage.jsx. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1154 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 449 Profile editor component and overlay".
```

---

## Step 450 — UI: profile pickers + New/Edit in the door style tool

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.3.md §1 and §4. Step 449 is in (1154 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Exactly SPEC §4:

1. NEW src/elevation/components/DoorProfilePickers.jsx — DoorProfilePickers({ draft, setDraft, design, onEditorChange }):
   - profiles from useSelector(state.elevation.settings.sectionProfiles); dispatch.
   - SLOT_LABELS { outside: 'Outside edge', inside: 'Inside profile', panel: 'Raised panel', applied: 'Applied molding' }; INPUT_CLASS and BUTTON_CLASS copied from DoorStyleEditor.jsx lines 7–8.
   - state editing: null | { slot, profileId, created }; open(next) sets it and calls onEditorChange?.(true).
   - one row per DOOR_PROFILE_SLOTS entry: usable = Boolean(design?.slots.includes(slot)); label (block text-xs text-gray-400, opacity-50 when !usable) with SLOT_LABELS[slot]; under it a flex row: select (flex-1, INPUT_CLASS, aria-label = the slot label, disabled={!usable}, value draft.profiles?.[slot] ?? '', options doorProfileChoices(profiles, slot, draft.profiles?.[slot] ?? null) → value {id ?? ''}, text note ? `${name} (${note})` : name; onChange '' → null, setDraft(prev => ({ ...prev, profiles: { ...prev.profiles, [slot]: id } }))), then "New…" (disabled !usable) and "Edit…" (disabled !usable or the pick isn't an existing profile id). Buttons get disabled:cursor-not-allowed disabled:opacity-50.
   - New…: const action = addSectionProfile({ kind: doorProfileSlotKind(slot) }); dispatch(action); open({ slot, profileId: action.payload.id, created: true }).
   - Edit…: open({ slot, profileId: pick, created: false }).
   - close({ saved }): if editing.created → saved ? set the slot to editing.profileId : dispatch(deleteSectionProfile({ profileId: editing.profileId })); then setEditing(null); onEditorChange?.(false).
   - under the rows, text-xs text-gray-400: "Doors still draw with square edges until profiles are drawn on doors. New and Edit open the profile editor; a new profile closed without saving is removed." plus, when any slot isn't usable, "Greyed slots aren't used by this design — kept if you switch back."
   - {editing && <ProfileEditorOverlay profileId={editing.profileId} backLabel="← Door style" onClose={close} />}
   - imports: DOOR_PROFILE_SLOTS ('../model/doorStyles.js'); doorProfileChoices, doorProfileSlotKind ('../model/sectionProfiles.js'); addSectionProfile, deleteSectionProfile ('../store/elevationSlice.js'); ProfileEditorOverlay ('../../library/profileEditor/ProfileEditorOverlay.jsx').
2. src/elevation/components/DoorStyleFields.jsx (142 lines): signature DoorStyleFields({ draft, setDraft, designs, onProfileEditorChange }); replace lines 136–139 with the same section + "Profiles" h3 followed by <DoorProfilePickers draft={draft} setDraft={setDraft} design={design} onEditorChange={onProfileEditorChange} />.
3. src/elevation/components/DoorStyleEditor.jsx (110 lines): const profileEditorOpen = useRef(false); beside panelRef; the keydown handler (line 24) starts with `if (profileEditorOpen.current) return;`; pass onProfileEditorChange={(open) => { profileEditorOpen.current = open; }} to DoorStyleFields (line 89).

Files (only these three).

DO NOT change the model, the store, ProfileEditor.jsx, ProfileEditorOverlay.jsx, TeamDoorStylePage.jsx, RoomDoorStylesPanel.jsx or any canvas/DXF door drawing. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1154 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 450 Door style profile pickers".
```

---

## Running it (Kyle, after 450)

Follow SPEC-48.3's end-to-end check: pickers on Library → Team door style (greyed slots on Slab), **New…** → draw → Save → **← Door style** comes back picked, **New…** then straight back leaves nothing behind, **Edit…** bumps the version, and over a room the editor's Delete / Ctrl+Z / V / L / F / Escape don't touch the room or close the style tool. Send `git show` after 450 if you want it reviewed.
