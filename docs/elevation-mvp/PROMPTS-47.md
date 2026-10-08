# Round 47 — Codex Prompts, Steps 424–428 (profile model and the Profiles list)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**. Geometry and the API don't change. No Supabase this round (plan P18).

| Step | Repo | What | Tests after |
|---|---|---|---|
| 424 | cabinetry_designer | Shape: `settings.sectionProfiles`, validation, load default | 1113 |
| 425 | cabinetry_designer | Model helpers (bounds, SVG path, new/copy, uses, slots, filter, tags, file/merge) | 1120 |
| 426 | cabinetry_designer | Store: five profile reducers | 1124 |
| 427 | cabinetry_designer | UI: Profiles nav + list page | 1124 |
| 428 | cabinetry_designer | UI: Details dialog, Export, Import | 1124 |

---

## Before step 424 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on elevation-doors, 423 in; only the two docs below are new
git add docs/elevation-mvp/SPEC-47.md docs/elevation-mvp/PROMPTS-47.md
git commit -m "round 47 docs"
```

---

## Step 424 — shape: settings.sectionProfiles

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-47.md §1 and §2. Step 423 is in (1106 tests).
If `git status` shows uncommitted changes, stop and tell me.

A shape change with no behavior change: settings get sectionProfiles (the team's profile library, an array, default []), validated on load. "Section profile" because `profile` already means the height profile in this repo (model/profile.js, settings.defaultProfile) — don't touch those.

- NEW src/elevation/model/sectionProfiles.js (imports nothing yet): PROFILE_TAG_LABELS (keys and labels in SPEC §2 order), ATTACH_POINTS, isProfileTag, isProfileGeometry, isSectionProfile, isSectionProfileList — rules exactly as SPEC §1 ("A profile", "Geometry rules"). Copy the isPlainObject/hasKeys helpers from src/elevation/model/doorDesigns.js (lines 14–25). Arc radius tolerance 1/256". isSectionProfileList(undefined) is false. One-line doc comment on each export naming SPEC-47.
- src/elevation/model/constants.js (144 lines): in DEFAULT_SETTINGS add `sectionProfiles: [],` right after `doorDesigns: DOOR_DESIGNS,` (line 44).
- src/elevation/store/slices/helpers.js (246 lines) copySettings (line 28): also `sectionProfiles: structuredClone(settings.sectionProfiles ?? []),`.
- src/elevation/store/persistence.js (742 lines):
  - import { isSectionProfileList } from '../model/sectionProfiles.js' next to the doorDesigns.js import (line 8).
  - normalizeDocument: right after line 536 (`if (settings.doorDesigns === undefined) …`) add `if (settings.sectionProfiles === undefined) settings.sectionProfiles = [];`.
  - isSettings (line 628): after `&& isDoorDesignList(settings.doorDesigns)` add `&& isSectionProfileList(settings.sectionProfiles)`.

Files (only these): the four above, and
- NEW src/elevation/model/__tests__/fixtures/sectionProfiles.json: the SPEC §2 JSON VERBATIM
- NEW src/elevation/model/__tests__/sectionProfiles.test.js: the SPEC §2 file VERBATIM (4 tests)
- NEW src/elevation/store/__tests__/sectionProfileSaves.test.js: the SPEC §2 file VERBATIM (3 tests)

DO NOT change model/profile.js, doorStyles.js, doorDesigns.js, any reducer, golden.json, the golden snapshot or the components. DO NOT grep the repo.

Write the fixture and the two test files first; run `npx vitest run src/elevation/model/__tests__/sectionProfiles.test.js src/elevation/store/__tests__/sectionProfileSaves.test.js` — they must fail. Iterate on those. At the end `npm test && npm run lint` once: 1106 + 7 = 1113, golden snapshot UNCHANGED, lint 0 errors. If an existing persistence test fails only because loaded settings now hold sectionProfiles, don't edit it: report it.

At most three lines of summary. Commit "elevation-mvp: step 424 Section profile library in settings".
```

---

## Step 425 — model helpers

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-47.md §1 and §3. Step 424 is in (1113 tests).
If `git status` shows uncommitted changes, stop and tell me.

Add to src/elevation/model/sectionProfiles.js (from step 424), exactly the SPEC §3 contract:
PROFILE_SLOTS, profileFitsSlot, sectionProfileBounds, sectionProfileSvgPath, newSectionProfile, sectionProfileUses, filterSectionProfiles, profileTagOptions, profileTagLabel, normalizeProfileTags, profileFile, parseProfileFile, mergeImportedProfiles.
Import DOOR_PROFILE_SLOTS and teamDoorStyle from './doorStyles.js' (it imports nothing, so no cycle).
Key details:
- Bounds: every geometry point, plus each arc's axis extremes (center ± r on x / y, built by adding r — no trig) for directions strictly inside the sweep (from `from`'s angle to `to`'s angle, counter-clockwise when ccw, clockwise otherwise; r = |from − center|).
- SVG path: y negated; numbers rounded to 4 decimals, trailing zeros dropped, -0 → "0"; arcs `A r r 0 large sweep x y` with large = sweep angle > 180° ? 1 : 0 and sweep = ccw ? 0 : 1; closed loops write every segment then "Z"; single spaces; loops joined by one space.
- newSectionProfile(profiles, id, base = null): the 3/4" square (exact points/loop in the SPEC test) named "New profile" / "New profile 2"…; with base a deep copy named "<name> copy" / "<name> copy 2"…, version 1, archived false; names compared ignoring case (same idea as newDoorDesign in doorDesigns.js).
- sectionProfileUses: same idea as doorDesignUses in doorDesigns.js; team slots first, then rooms' doorStyles in order; slots in DOOR_PROFILE_SLOTS order; style.profiles?.[slot] === profileId.
- parseProfileFile never throws; returns the profiles array or null.
- mergeImportedProfiles returns a new array; invalid → skipped; existing id → replaced in place; new id → appended.

Files (only these):
- src/elevation/model/sectionProfiles.js
- NEW src/elevation/model/__tests__/sectionProfileHelpers.test.js: the SPEC §3 file VERBATIM (7 tests)

DO NOT change any other model file, the store, the components or the step-424 tests. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/sectionProfileHelpers.test.js` — it must fail. Iterate on that file. At the end `npm test && npm run lint` once: 1113 + 7 = 1120, golden snapshot unchanged, lint 0 errors. The arc numbers are explained under the test in SPEC §3; if one still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 425 Section profile helpers".
```

---

## Step 426 — store: profile reducers

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-47.md §1 and §4. Step 425 is in (1120 tests).
If `git status` shows uncommitted changes, stop and tell me.

- NEW src/elevation/store/slices/sectionProfiles.js: export const sectionProfileReducers with addSectionProfile ({ reducer, prepare }, uuid id like addDoorDesign), updateSectionProfile, setSectionProfileArchived, deleteSectionProfile, importSectionProfiles — rules exactly as SPEC §4 (version bumps only when JSON.stringify([geometry, attach, drawnPoints]) differs; id and archived forced from the existing profile; delete rejected while sectionProfileUses is non-empty; import via mergeImportedProfiles on a structuredClone of the payload, rejected when nothing was added or replaced). A rejected action returns before writing anything. No syncRoomAt. Pattern: src/elevation/store/slices/doorDesigns.js (78 lines; current() for reading).
- src/elevation/store/elevationSlice.js (190 lines): import sectionProfileReducers after the doorDesigns import (line 20); spread `...sectionProfileReducers,` after `...doorDesignReducers,` (line 67); export addSectionProfile, updateSectionProfile, setSectionProfileArchived, deleteSectionProfile, importSectionProfiles after moveMissingDoorDesign (line 177).

Files (only these): the two above, and
- NEW src/elevation/store/__tests__/sliceSectionProfiles.test.js: the SPEC §4 file VERBATIM (4 tests)

DO NOT change the model files, persistence.js, the other slices, the components or any existing test. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/store/__tests__/sliceSectionProfiles.test.js` — it must fail. Iterate on that file. At the end `npm test && npm run lint` once: 1120 + 4 = 1124, golden snapshot unchanged, lint 0 errors. If setTeamDoorStyle in the third test leaves the state unchanged, don't change the test: report it.

At most three lines of summary. Commit "elevation-mvp: step 426 Section profile reducers".
```

---

## Step 427 — UI: Profiles nav and list page

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-47.md §1 and §5. Step 426 is in (1124 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Build exactly what SPEC §5 lists:
- src/App.jsx (68 lines): import ProfilesPage from './library/ProfilesPage.jsx'; inside the /library route, after the door-style route: <Route path="profiles" element={<ProfilesPage />} />.
- src/library/LibraryLayout.jsx (32 lines): a third NavLink "Profiles" → "profiles", same className function as the other two.
- NEW src/library/ProfileThumbnail.jsx: the viewBox/pad math and the single <path> exactly as SPEC §5.
- NEW src/library/ProfilesPage.jsx: header (title, line, New profile → dispatch(addSectionProfile())), filter row (search, tag chips from profileTagOptions with profileTagLabel, Show archived), the card grid from filterSectionProfiles, card contents and buttons (Copy, Archive/Restore, Delete with the in-card "Confirm delete" second click, disabled with the title when sectionProfileUses is non-empty), both empty states and the note. Copy BUTTON_CLASS / INPUT_CLASS from src/library/DoorDesignsPage.jsx (lines 7–8). Room names for "Used by" come from state.elevation.rooms.
Imports (relative paths): actions from '../elevation/store/elevationSlice.js'; the helpers from '../elevation/model/sectionProfiles.js'.

Files (only these): the four above.

DO NOT change the model, the store, ElevationLab or the other library pages. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1124 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 427 Profiles list page".
```

---

## Step 428 — UI: Details dialog, Export, Import

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-47.md §1 and §6. Step 427 is in (1124 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- NEW src/library/ProfileDetailsDialog.jsx: export default function ProfileDetailsDialog({ profile, onClose }). Dialog pattern, focus/Escape/Tab trap and classes copied from src/library/DoorDesignEditor.jsx (134 lines). Fields, read-only lines, tag building (checked known tags in PROFILE_TAG_LABELS order, then normalizeProfileTags(other) minus duplicates), Save rules and reasons exactly as SPEC §6. Save dispatches updateSectionProfile({ profileId: profile.id, profile: { ...profile, name: name.trim(), tags } }) and closes.
- src/library/ProfilesPage.jsx (from 427): Details button first on each card (editingId state, <ProfileDetailsDialog key={id} … /> like DoorDesignsPage renders its editor); New profile opens the dialog on action.payload.id; header Export (disabled when empty; saveBlob from '../api/drawings.js' with JSON.stringify(profileFile(profiles), null, 2), type application/json, 'profiles.json') and Import… (hidden file input via useRef, parseProfileFile, the two status messages, mergeImportedProfiles for the counts before dispatching importSectionProfiles({ profiles: parsed }), reset the input value); the extra note sentence. All as SPEC §6.

Files (only these): the two above.

DO NOT change the model, the store, src/api/drawings.js or the other library pages. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1124 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 428 Profile details, export and import".
```

---

## Running it (Kyle, after 428)

Follow SPEC-47's end-to-end check. Use New profile and the details dialog, then import the sample file `src/elevation/model/__tests__/fixtures/sectionProfiles.json`. Thumbnails should show the cove, the half bead dome and the crown y-up. Then check the tag chips, Copy/Archive/Restore, the two-click Delete, Export then re-Import, and that everything survives a reload. Send `git show` after 425 and I'll review the geometry helpers' diff.
