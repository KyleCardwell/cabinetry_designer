# Round 48.1.1 — Codex Prompts, Steps 439–443 (one kind per profile, pin points by kind, rotate and flip)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**. Geometry and the API don't change. No Supabase (plan P18).

| Step | Repo | What | Tests after |
|---|---|---|---|
| 439 | cabinetry_designer | Model additions: kinds, pins, migration, rotate/flip | 1148 |
| 440 | cabinetry_designer | Model switch: `kind` replaces `tags` | 1149 |
| 441 | cabinetry_designer | UI switch: Profiles page, Details dialog, header; remove tag exports | 1149 |
| 442 | cabinetry_designer | UI: Kind and pin points panel; kind in the draft | 1149 |
| 443 | cabinetry_designer | UI: canvas hints, pin labels, Rotate/Flip, note | 1149 |

⚠ Run **441 straight after 440**. In between, the Profiles page and editor error at runtime (tests, lint and build still pass).

---

## Before step 439 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on elevation-doors, 438 in; only the two docs below are new
git add docs/elevation-mvp/SPEC-48.1.1.md docs/elevation-mvp/PROMPTS-48.1.1.md
git commit -m "round 48.1.1 docs"
```

---

## Step 439 — model additions: kinds, pins, migration, rotate and flip

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.1.md §1 and §2. Step 438 is in (1142 tests).
If `git status` shows uncommitted changes, stop and tell me.

Additions only — nothing existing changes in this step (tags are still validated).

src/elevation/model/sectionProfiles.js (344 lines) — add, exactly the SPEC §2 contract:
- PROFILE_KINDS: the SPEC §1 table as { kind: { label, axes, pins } }, keys in table order (door_outside, door_inside, door_panel, applied_molding, crown, top_mold, furniture_base, toe_kick, nosing, other).
- PIN_LABELS: the nine pin labels from SPEC §1, keys in ATTACH_POINTS order.
- isProfileKind(kind): string and Object.hasOwn(PROFILE_KINDS, kind).
- profileKindLabel(kind): the label, or kind itself when unknown (Object.hasOwn, so 'toString' isn't a kind).
- profileKindOptions(profiles): kinds used by any profile (archived included), PROFILE_KINDS order, no repeats.
- profileMissingPins(profile): the kind's pins not in profile.attach, pin order; [] for other or an unknown kind. No validation.
- migrateSectionProfile(entry): only a plain object with an array `tags` and no own `kind` changes; anything else is returned as is (same object). kind = first tag that is a kind name other than 'other', or 'door_applied'/'slab_applied' (→ 'applied_molding'); none → 'other'. Remove tags; if attach is a plain object keep only the new kind's pins (existing key order). Never mutate the input.

src/elevation/model/profileEditing.js (417 lines) — add, through the existing editProfile and round6:
- rotateProfile(profile, turns): null unless Number.isInteger(turns); t = ((turns % 4) + 4) % 4; 1 → (x, y) ↦ (−y, x), 2 → (−x, −y), 3 → (y, −x); arc centers the same; ccw unchanged; round6 every written coordinate (-0 → 0).
- mirrorProfile(profile, axis): 'x' negates x, 'y' negates y, points and arc centers; every arc's ccw inverted; round6; null for any other axis.
Neither touches attach, drawnPoints, name, version or the tags/kind field.
One-line doc comment on each export naming SPEC-48.1.1.

Files (only these):
- src/elevation/model/sectionProfiles.js
- src/elevation/model/profileEditing.js
- NEW src/elevation/model/__tests__/profileKinds.test.js: the SPEC §2 file VERBATIM (3 tests)
- NEW src/elevation/model/__tests__/profileTurns.test.js: the SPEC §2 file VERBATIM (3 tests)

DO NOT change the validator or any existing export, the fixture, any existing test, the store or the components. DO NOT grep the repo.

Write both test files first; run `npx vitest run src/elevation/model/__tests__/profileKinds.test.js src/elevation/model/__tests__/profileTurns.test.js` — they must fail. Iterate on those two. At the end `npm test && npm run lint` once: 1142 + 6 = 1148, golden snapshot unchanged, lint 0 errors. If a number still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 439 Profile kinds, migration, rotate and flip".
```

---

## Step 440 — model switch: `kind` replaces `tags`

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.1.md §1 and §3. Step 439 is in (1148 tests).
If `git status` shows uncommitted changes, stop and tell me.

Model, persistence, fixture and tests only — the UI is the next step. Exactly SPEC §3:

src/elevation/model/sectionProfiles.js:
- isSectionProfile: 'tags' → 'kind' in the hasKeys list; the two tags lines (107–108) → `|| !isProfileKind(profile.kind)`. Attach stays permissive.
- PROFILE_SLOTS → slot → kind map from SPEC §3 (door_applied and slab_applied → 'applied_molding', the rest map to themselves).
- profileFitsSlot(profile, slot) → Object.hasOwn(PROFILE_SLOTS, slot) && profile.kind === PROFILE_SLOTS[slot] && profileMissingPins(profile).length === 0.
- newSectionProfile: kind: 'other' instead of tags: [] for the new square.
- filterSectionProfiles option `tag` → `kind` (kind === null || profile.kind === kind).
- parseProfileFile returns file.profiles.map(migrateSectionProfile).
- KEEP PROFILE_TAG_LABELS, isProfileTag, profileTagOptions, profileTagLabel, normalizeProfileTags unchanged, each with the comment `// Removed in step 441 (SPEC-48.1.1).` (the UI still imports them).

src/elevation/model/profileEditing.js:
- add setProfileKind(profile, kind): through editProfile; sets kind and reduces attach to the new kind's pins (key order kept); null unless isProfileKind(kind). Import PROFILE_KINDS and isProfileKind from './sectionProfiles.js'.
- KEEP profileSlotGaps unchanged with the same `// Removed in step 441` comment.

src/elevation/store/persistence.js (745 lines) — edit ONLY these two lines with a script; don't read the file:
- line 9 → `import { isSectionProfileList, migrateSectionProfile } from '../model/sectionProfiles.js';`
- after line 538 (`if (settings.sectionProfiles === undefined) settings.sectionProfiles = [];`) add `else if (Array.isArray(settings.sectionProfiles)) settings.sectionProfiles = settings.sectionProfiles.map(migrateSectionProfile);`

Fixture src/elevation/model/__tests__/fixtures/sectionProfiles.json: line 8 `"tags": ["door_inside"],` → `"kind": "door_inside",`; line 34 → `"kind": "applied_molding",`; line 57 → `"kind": "crown",`. Nothing else.

Test edits, VERBATIM from SPEC §3 (replace each named it(...) block whole):
- model/__tests__/sectionProfiles.test.js: line 5 import (PROFILE_TAG_LABELS → PROFILE_KINDS); replace the two blocks titled 'starts with an empty library and names the known tags and attach points' and 'checks the profile: name, tags, attach and drawn points name real points, version and archived'.
- model/__tests__/sectionProfileHelpers.test.js: the import (lines 5–9) as given; replace 'fits a slot by attach points, never by tags' and "filters by name, tag and archived, and offers known tags then the team's own"; in the new-square block, line 98 `tags: [],` → `kind: 'other',` and line 122 `copy.tags === CROWN.tags` → `copy.attach === CROWN.attach`.
- store/__tests__/sliceSectionProfiles.test.js: line 32 title 'name and tag edits' → 'name and kind edits'; lines 36 and 38 `tags: ['door_inside', 'door_outside']` → `kind: 'other'`.
- model/__tests__/profileAttach.test.js: line 3 import → `import { setProfileAttach, setProfileKind } from '../profileEditing.js';`; replace the block titled 'reports tagged slots the attach points do not fit yet, with the names still missing'.
- store/__tests__/sectionProfileSaves.test.js: add the parseProfileFile import and the new last test from SPEC §3.

Files (only these): the nine listed in SPEC §3's table.

DO NOT change any other part of persistence.js, the 439 tests, profileEditing/profileLoops/profileDrawn tests, the store slices or any component. DO NOT grep the repo.

While iterating run only the six touched test files: `npx vitest run src/elevation/model/__tests__/sectionProfiles.test.js src/elevation/model/__tests__/sectionProfileHelpers.test.js src/elevation/model/__tests__/profileAttach.test.js src/elevation/store/__tests__/sliceSectionProfiles.test.js src/elevation/store/__tests__/sectionProfileSaves.test.js src/elevation/model/__tests__/profileKinds.test.js`. At the end `npm test && npm run lint && npm run build` once: 1148 + 1 = 1149, golden snapshot unchanged, lint 0 errors, build succeeds. If any other test fails only because a profile now needs kind instead of tags, report it — don't edit it. If a number differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 440 Profile kind replaces tags".
```

---

## Step 441 — UI switch: Profiles page, Details dialog, editor header; remove tag exports

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.1.md §1 and §4. Step 440 is in (1149 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Exactly SPEC §4:
- src/library/ProfilesPage.jsx (228 lines): imports profileTagLabel/profileTagOptions → PIN_LABELS, profileKindLabel, profileKindOptions, profileMissingPins; state tag → kind; filter { search, kind, showArchived }; chips from [null, ...profileKindOptions(profiles)] labelled profileKindLabel, keys `kind-${option}`; the tag pills (lines 158–162) → one kind pill; the v line (163) → `v{version} · {status}` with status 'no pin points' (kind other), 'ready' (nothing missing) or `needs {PIN_LABELS of missing, joined ', '}`; remove the unused attachPoints variable.
- src/library/ProfileDetailsDialog.jsx (112 lines): signature ({ profile, onClose, showKind = true }); remove all tag state, the Tags fieldset, the Other tags input, the tag reason and their imports; add kind state and, when showKind, a Kind select (PROFILE_KINDS labels, aria-label "Kind") right after Name with the two hint lines from SPEC §4 (the amber one only when kind !== profile.kind); the attach line → "Pin points: {PIN_LABELS[name]} → {point or 'not set'}, …" for the selected kind (Other: "Other profiles have no pin points."); text "The shape, pin points and drawn points are edited with Edit shape."; Save → base = { ...profile, name: name.trim() }, next = showKind ? setProfileKind(base, kind) : base, dispatch updateSectionProfile when next isn't null, close. Imports PIN_LABELS, PROFILE_KINDS ('../elevation/model/sectionProfiles.js'), setProfileKind ('../elevation/model/profileEditing.js').
- src/library/profileEditor/ProfileEditorPage.jsx (195 lines): import profileKindLabel instead of profileTagLabel; line 133 → one pill profileKindLabel(saved.kind). Nothing else.
- src/library/profileEditor/AttachPanel.jsx (112 lines): remove the profileSlotGaps(...) block (~lines 105–109) and the profileTagLabel / profileSlotGaps imports. Nothing else.
- src/elevation/model/sectionProfiles.js: delete PROFILE_TAG_LABELS, isProfileTag, profileTagOptions, profileTagLabel, normalizeProfileTags.
- src/elevation/model/profileEditing.js: delete profileSlotGaps and any import only it used.
Then this must print nothing: grep -rn "profileTag\|PROFILE_TAG_LABELS\|isProfileTag\|normalizeProfileTags\|profileSlotGaps\|\.tags" src/library src/elevation/model/sectionProfiles.js src/elevation/model/profileEditing.js

Files (only these): the six above.

DO NOT change the store, persistence, any test, PointsPanel, DrawnPanel, the canvas or other pages. Apart from the one grep above, DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1149 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 441 Profile kinds in the library UI".
```

---

## Step 442 — UI: Kind and pin points panel; kind in the draft

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.1.md §1 and §5. Step 441 is in (1149 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Exactly SPEC §5:
- NEW src/library/profileEditor/PinsPanel.jsx: PinsPanel({ profile, selectedPointId, onApply }). Class constants copied the way PointsPanel.jsx does (lines 10–12). File-local PIN_HELP and SLOT_LABELS from the SPEC tables. Heading "Kind and pin points"; Kind select (aria-label "Kind") → onApply(setProfileKind(profile, value), "That kind couldn't be set."); the axes hint line (door / run / free texts from SPEC §5) plus "Changing the kind clears pin points it doesn't use."; per pin of the kind: label (PIN_LABELS), PIN_HELP, a select ("" = "— not set —", then point ids in points order) → setProfileAttach(profile, name, value === '' ? null : value), a "Use selected point ({selectedPointId})" button when a point is selected and differs → setProfileAttach(profile, name, selectedPointId), and the amber "Click a point on the drawing, then press Use selected point." when unset with nothing selected; fail text "That point no longer exists."; the status line (Other / Ready — can be picked for … / Still needs: …) exactly as SPEC §5. Imports PIN_LABELS, PROFILE_KINDS, PROFILE_SLOTS, profileMissingPins from '../../elevation/model/sectionProfiles.js'; setProfileAttach, setProfileKind from '../../elevation/model/profileEditing.js'.
- DELETE src/library/profileEditor/AttachPanel.jsx (git rm).
- src/library/profileEditor/useProfileDraft.js (50 lines): shape = JSON.stringify([profile.kind, profile.geometry, profile.attach, profile.drawnPoints]). Nothing else.
- src/library/profileEditor/ProfileEditorPage.jsx (after 441): PinsPanel replaces AttachPanel (same place, same selectedPointId expression); Save writes kind: draft.kind alongside geometry, attach, drawnPoints; header pill uses profileKindLabel(draft.kind); pass showKind={false} to ProfileDetailsDialog.

Files (only these): the four above.

DO NOT change the model, the store, PointsPanel, DrawnPanel, the canvas, ProfileDetailsDialog or ProfilesPage. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1149 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 442 Profile kind and pin points panel".
```

---

## Step 443 — UI: canvas hints and pin labels; Rotate and Flip; note text

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.1.md §1 and §6. Step 442 is in (1149 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Exactly SPEC §6:
- src/library/profileEditor/ProfileCanvas.jsx (288 lines): import PIN_LABELS, PROFILE_KINDS from '../../elevation/model/sectionProfiles.js'; axes = PROFILE_KINDS[drawnProfile.kind]?.axes ?? 'free'. The y = 0 label (line 226) → 'face (y = 0)' for door axes, else 'y = 0'. attachNames (line 168 on) collects only the kind's pins; marker text (line 252) shows PIN_LABELS[name] joined ', '. Add the top-right direction hint (classes and the three texts from SPEC §6). Legend text (line 282 on) → "◇ pin point · ○ drawn (solid: elevation, dashed: plan only)". Leave everything else.
- src/library/profileEditor/ProfileEditorPage.jsx (after 442): add rotateProfile, mirrorProfile to the profileEditing import; file-level const TURN_FAILURE = 'That turn would make the shape invalid.'; after Fit, four buttons with Fit's classes — ⟲ (rotateProfile(draft, 1)), ⟳ (rotateProfile(draft, -1)), ⇆ (mirrorProfile(draft, 'x')), ⇅ (mirrorProfile(draft, 'y')) — each apply(…, TURN_FAILURE), with the titles and aria-labels from SPEC §6. The bottom note text becomes exactly the SPEC §6 text.

Files (only these): the two above.

DO NOT change the model, the store, PinsPanel, PointsPanel, DrawnPanel or other pages. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1149 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 443 Profile editor kind hints, rotate and flip".
```

---

## Running it (Kyle, after 443)

Follow SPEC-48.1.1's end-to-end check: your old profiles load with a kind; New → pick Door inside profile; in the editor click the opening-side corner and press Use selected point until it says Ready; switch Kind to Crown and back with Ctrl+Z; Origin then ⟲ / ⇆; Copy the cove, make the copy Applied molding, turn it and pin it. Send `git show` after 440 if you want the switch reviewed.
