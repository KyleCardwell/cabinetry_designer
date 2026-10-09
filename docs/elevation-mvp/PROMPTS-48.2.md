# Round 48.2 — Codex Prompts, Steps 444–447 (0, 0 is the pin; open lines cut, closed shapes apply; door ghost)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**. Geometry and the API don't change. No Supabase (plan P18).

| Step | Repo | What | Tests after |
|---|---|---|---|
| 444 | cabinetry_designer | Model additions: door ghost, what 0, 0 means | 1152 |
| 445 | cabinetry_designer | UI: pins out; Kind panel | 1152 |
| 446 | cabinetry_designer | Model switch: `attach` removed, old pin moved to 0, 0 | 1150 |
| 447 | cabinetry_designer | UI: door ghost on the canvas, Door button | 1150 |

⚠ Run **446 straight after 445**, and don't press **Origin** in the editor in between.

Line numbers in each prompt are from **before** that step's edits.

---

## Before step 444 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on elevation-doors, 443 in; only the two docs below are new
git add docs/elevation-mvp/SPEC-48.2.md docs/elevation-mvp/PROMPTS-48.2.md
git commit -m "round 48.2 docs"
```

---

## Step 444 — model additions: door ghost and what 0, 0 means

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.2.md §1 and §2. Step 443 is in (1149 tests).
If `git status` shows uncommitted changes, stop and tell me.

Additions only — nothing existing changes behaviour.

src/elevation/model/sectionProfiles.js (370 lines): in PROFILE_KINDS (line 309 on) add an `origin` field right after `axes` in every entry, with the exact strings from the SPEC §2 table (other → null). Keep `pins`. Extend the doc comment to mention SPEC-48.2's origin.

NEW src/elevation/model/profileGhost.js — exactly the SPEC §2 contract:
- constants PANEL_THICKNESS 0.5, TONGUE 0.25, TONGUE_IN 0.5, TONGUE_LENGTH 0.75, CURVE_END 0.625, CURVE_RADIUS 0.40625, PANEL_SHOWN 3, GHOST_KINDS { door_outside: 0, door_inside: 1, door_panel: 1, applied_molding: 1 }; a local round6 (Number(v.toFixed(6)), -0 → 0).
- export profileDoorGhost(kind, style): null unless Object.hasOwn(GHOST_KINDS, kind), style?.thickness finite and > 0.5, style?.stiles?.left finite and > 0.5. T = thickness, S = stiles.left, dx = -GHOST_KINDS[kind] * S, pf = -(T - 0.5), tb = pf - 0.25, e = dx + S. Points in order s1 [dx,0], s2 [e,0], s3 [e,pf], s4 [e-0.5,pf], s5 [e-0.5,tb], s6 [e,tb], s7 [e,-T], s8 [dx,-T], p1 [e-0.5,pf], p2 [e+3,pf], p3 [e+3,-T], p4 [e+0.625,-T], p5 [e+0.25,tb], p6 [e-0.5,tb]. Loops: { id: 'stile', closed: true } lines s1→s2→…→s8→s1; { id: 'panel', closed: true } lines p1→p2, p2→p3, p3→p4, then { type: 'arc', from: 'p4', to: 'p5', center: [e+0.25, tb-0.40625], ccw: true }, lines p5→p6, p6→p1. Return { units: 'in', points, loops }. All coordinates through round6.
- one-line doc comment naming SPEC-48.2 on the export.

Files (only these):
- src/elevation/model/sectionProfiles.js
- NEW src/elevation/model/profileGhost.js
- NEW src/elevation/model/__tests__/profileGhost.test.js: the SPEC §2 file VERBATIM (3 tests)

DO NOT change any other export, the fixture, any existing test, the store or the components. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/profileGhost.test.js` — it must fail. Iterate on that file. At the end `npm test && npm run lint` once: 1149 + 3 = 1152, golden snapshot unchanged, lint 0 errors. If a number still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 444 Profile door ghost and origin meanings".
```

---

## Step 445 — UI: pins out; Kind panel

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.2.md §1 and §3. Step 444 is in (1152 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. The model keeps `attach` for now; the UI stops showing and saving it. Exactly SPEC §3 (line numbers are before your edits):
- NEW src/library/profileEditor/KindPanel.jsx: KindPanel({ profile, onApply }). Copy INPUT_CLASS (PinsPanel.jsx line 7) and SLOT_LABELS (PinsPanel.jsx lines 23–34) unchanged. Heading "Kind"; the Kind select exactly as PinsPanel.jsx lines 47–54; the axes line with PinsPanel.jsx's three texts (lines 56–58) WITHOUT the "Changing the kind clears…" sentence; when kind.origin: gray-200 "0, 0 is {origin}." then gray-500 "Draw the shape from there, or select a point and press Origin to move the shape so that point sits at 0, 0."; the door-axes and run-axes open/closed lines from SPEC §3; status: other → gray "Other profiles can't be picked by doors or runs yet.", else green "Can be picked for {labels}." (SLOT_LABELS of PROFILE_SLOTS keys whose value is the kind, ' and ' for two, ', ' otherwise). Imports PROFILE_KINDS, PROFILE_SLOTS ('../../elevation/model/sectionProfiles.js'), setProfileKind ('../../elevation/model/profileEditing.js').
- DELETE src/library/profileEditor/PinsPanel.jsx (git rm).
- src/library/profileEditor/ProfileEditorPage.jsx (200 lines): line 9 import KindPanel; line 181 → <KindPanel profile={draft} onApply={apply} />; line 147 Save without attach: `profile: { ...saved, kind: draft.kind, geometry: draft.geometry, drawnPoints: draft.drawnPoints },`; line 194 note text exactly as SPEC §3.
- src/library/profileEditor/useProfileDraft.js line 4: shape = JSON.stringify([profile.kind, profile.geometry, profile.drawnPoints]).
- src/library/profileEditor/ProfileCanvas.jsx (295 lines): line 5 imports only PROFILE_KINDS; delete the attachNames block (170–175) and the pin marker fragment (252–257); after line 142 `const originText = PROFILE_KINDS[drawnProfile.kind]?.origin ?? null;` (line 139's `origin` stays); hint box (281–284): first text in a <div>, then {originText && <div>0, 0 = {originText}</div>}; legend (288–292): condition (elevationSet.size > 0 || planSet.size > 0), text "○ drawn (solid: elevation, dashed: plan only)".
- src/library/ProfilesPage.jsx (229 lines): drop PIN_LABELS and profileMissingPins from the import (5–8); delete lines 147–150; line 164 → <p className="text-xs text-gray-500">v{profile.version}{profile.kind === 'other' ? ' · not used by doors or runs yet' : ''}</p>.
- src/library/ProfileDetailsDialog.jsx (105 lines): line 3 imports only PROFILE_KINDS; delete lines 17–18; line 74 text "The kind sets which way the shape is drawn and what 0, 0 means. To use the same shape as another kind, Copy it and change the copy&apos;s kind."; delete line 75; line 79's content → {PROFILE_KINDS[kind].origin ? `0, 0 is ${PROFILE_KINDS[kind].origin}.` : "Other profiles aren't used by doors or runs yet."}; line 80 text "The shape and drawn points are edited with Edit shape."
Then this must print nothing: grep -rn "attach\|PIN_LABELS\|profileMissingPins\|setProfileAttach\|PinsPanel" src/library

Files (only these): the seven above.

DO NOT change the model, the store, persistence, any test, PointsPanel, DrawnPanel, SegmentPanel, profileView.js or other pages. Apart from the one grep above, DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1152 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 445 Profile editor without pin points".
```

---

## Step 446 — model switch: `attach` removed; old pin moved to 0, 0

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.2.md §1 and §4. Step 445 is in (1152 tests).
If `git status` shows uncommitted changes, stop and tell me.

Model, slice, fixture and tests only. Exactly SPEC §4 (line numbers are before your edits):

src/elevation/model/sectionProfiles.js:
- delete ATTACH_POINTS (lines 3–7), PIN_LABELS and profileMissingPins.
- isSectionProfile: 'attach' out of the hasKeys list; delete the hasKeys(profile.attach, …) line; return only the drawnPoints checks (isPointList elevation, and plan when present).
- PROFILE_KINDS: remove every `pins` (entries are { label, axes, origin }).
- profileFitsSlot → Object.hasOwn(PROFILE_SLOTS, slot) && profile.kind === PROFILE_SLOTS[slot].
- newSectionProfile: delete `attach: {},`.
- migrateSectionProfile: the SPEC §1/§4 two stages with a file-local OLD_PINS ({ x, y } pin names per kind, from SPEC §4) and a local round6. Not a plain object → return it; neither (array tags and no own kind) nor own attach → return the same object; else structuredClone, tags → kind as before (delete tags), then if own attach: dx = x of the OLD_PINS[kind].x pin, dy = y of the OLD_PINS[kind].y pin (0 when missing/unknown point/kind not in OLD_PINS); if either isn't 0, move every point and every arc center (when loops is an array and the center is a coordinate) by (−dx, −dy) with round6; delete attach. Never mutate the input.

src/elevation/model/profileEditing.js (457 lines):
- import line(s) 1–3 → import { isProfileKind, isSectionProfile } from './sectionProfiles.js';
- renameProfilePoint: delete the attach loop (110–112); deleteProfilePoint: delete 129–131; deleteUnusedLoopPoints: delete `...Object.values(profile.attach),` (195); delete setProfileAttach and its doc (342–353); setProfileKind's edit is only `next.kind = kind;`. Update the three doc comments as SPEC §4 says.

src/elevation/store/slices/sectionProfiles.js lines 32–33: compare JSON.stringify([geometry, drawnPoints]) only (no attach).

Fixture src/elevation/model/__tests__/fixtures/sectionProfiles.json: delete lines 26, 49 and 75 (the three "attach" lines). Nothing else.

Tests, VERBATIM from SPEC §4:
- REPLACE the whole of src/elevation/model/__tests__/profileKinds.test.js with the SPEC §4 file (3 tests).
- git rm src/elevation/model/__tests__/profileAttach.test.js.
- model/__tests__/sectionProfiles.test.js: line 5 import without ATTACH_POINTS; replace the blocks 'starts with an empty library and names the kinds and attach points' and 'checks the profile: name, kind, attach and drawn points name real points, version and archived'.
- model/__tests__/sectionProfileHelpers.test.js: delete the `attach: {},` lines 28, 87, 112; line 121 copy.attach === CROWN.attach → copy.drawnPoints === CROWN.drawnPoints; replace the block "fits a slot of its own kind once the kind\'s pin points are all set".
- model/__tests__/profileEditing.test.js: lines 35–41 as given; delete line 51.
- store/__tests__/sliceSectionProfiles.test.js line 49: attach: { frame_edge: 'q' } → drawnPoints: { elevation: ['q'] }.
- store/__tests__/sectionProfileSaves.test.js: add the SPEC §4 test as the last it in the describe.
Then: grep -rn "attach\|ATTACH_POINTS\|PIN_LABELS\|profileMissingPins\|setProfileAttach" src/library src/elevation/model/sectionProfiles.js src/elevation/model/profileEditing.js src/elevation/store/slices/sectionProfiles.js — only lines inside migrateSectionProfile / OLD_PINS may print.

Files (only these): the eleven in SPEC §4's table.

DO NOT change persistence.js, the components, profileGhost.test.js, profileTurns/profileLoops/profileDrawn tests. Apart from the one grep above, DO NOT grep the repo.

While iterating run only: `npx vitest run src/elevation/model/__tests__/profileKinds.test.js src/elevation/model/__tests__/sectionProfiles.test.js src/elevation/model/__tests__/sectionProfileHelpers.test.js src/elevation/model/__tests__/profileEditing.test.js src/elevation/store/__tests__/sliceSectionProfiles.test.js src/elevation/store/__tests__/sectionProfileSaves.test.js`. At the end `npm test && npm run lint && npm run build` once: 1152 − 3 + 1 = 1150, golden snapshot unchanged, lint 0 errors, build succeeds. If any other test fails only because a profile still carries attach, report it — don't edit it. If a number differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 446 Profiles pin at 0, 0; attach removed".
```

---

## Step 447 — UI: door ghost on the canvas; Door button

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.2.md §1 and §5. Step 446 is in (1150 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Exactly SPEC §5:
- src/library/profileEditor/ProfileCanvas.jsx: add prop `ghost = null`; after the drawnProfile line `const ghostProfile = ghost ? { ...profile, geometry: ghost, drawnPoints: { elevation: [] } } : null;` (a valid profile, because loopScreenPath's arcs go through profileArcInfo, which validates); right after the grid/axes <g> and before the profile loops, the ghost <g> from SPEC §5 (pointerEvents none, text-gray-400, fill currentColor 0.12, stroke currentColor 0.4, width 1). No hit-testing or snapping to it.
- src/library/profileEditor/ProfileEditorPage.jsx: import teamDoorStyle ('../../elevation/model/doorStyles.js'), profileDoorGhost ('../../elevation/model/profileGhost.js'), add PROFILE_KINDS to the sectionProfiles import; hooks `const teamStyle = useSelector((state) => teamDoorStyle(state.elevation.settings));` and `const [showGhost, setShowGhost] = useState(true);`; after the `if (!saved || !draft)` early return: `const ghost = showGhost ? profileDoorGhost(draft.kind, teamStyle) : null;` and `const doorKind = PROFILE_KINDS[draft.kind]?.axes === 'door';`; the Door toggle button from SPEC §5 after ⇅ and before Grid, only when doorKind; pass ghost={ghost} to ProfileCanvas.

Files (only these): the two above.

DO NOT change the model, the store, KindPanel, PointsPanel, DrawnPanel, profileView.js or other pages. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1150 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 447 Profile editor door ghost".
```

---

## Running it (Kyle, after 447)

Follow SPEC-48.2's end-to-end check. Open an older pinned profile and confirm its pin point now sits at 0, 0. Make a Door outside edge and check the Kind panel text, with no pins anywhere. Watch the ghost jump 3" when you switch to Door inside profile, and toggle **Door**. Draw a 1/4" round-over as an open line on the ghost's corner. Set the team style to 1" and see the ghost follow. Send `git show` after 446 if you want the switch reviewed.
