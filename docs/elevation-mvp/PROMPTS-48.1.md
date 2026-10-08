# Round 48.1 — Codex Prompts, Steps 434–438 (attach points, drawn points, tags in the profile editor)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**. Geometry and the API don't change. No Supabase (plan P18).

| Step | Repo | What | Tests after |
|---|---|---|---|
| 434 | cabinetry_designer | Model: attach edits and slot gaps | 1139 |
| 435 | cabinetry_designer | Model: drawn-point edits | 1142 |
| 436 | cabinetry_designer | UI: Attach points panel | 1142 |
| 437 | cabinetry_designer | UI: Drawn points panel | 1142 |
| 438 | cabinetry_designer | UI: canvas markers, Details button and tags, text updates | 1142 |

---

## Before step 434 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on elevation-doors, 433 in; only the two docs below are new
git add docs/elevation-mvp/SPEC-48.1.md docs/elevation-mvp/PROMPTS-48.1.md
git commit -m "round 48.1 docs"
```

---

## Step 434 — model: attach points and slot gaps

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.md §1 and §2. Step 433 is in (1136 tests).
If `git status` shows uncommitted changes, stop and tell me.

Add to src/elevation/model/profileEditing.js (338 lines, from round 48), exactly the SPEC §2 contract, same rules as the existing edits (pure, go through the file's existing editProfile helper, null on a bad argument or when the result fails isSectionProfile):
- setProfileAttach(profile, name, pointId): attach[name] = pointId, or remove the name when pointId === null. null when name isn't in ATTACH_POINTS, or pointId is neither null nor the id of an existing point (undefined and numbers are refused). An existing name keeps its key position, a new name goes last. Clearing an unset name, or setting the point it already has, returns an equal profile.
- profileSlotGaps(profile) → [{ tag, slot, missing }] in profile.tags order. Only tags that are keys of PROFILE_SLOTS and where profileFitsSlot(profile, tag) is false. slot === tag. missing: take the slot option with the fewest names not in profile.attach (first option on a tie); missing = that option's names not in attach, in the option's order. No validation, never null.
Import ATTACH_POINTS and PROFILE_SLOTS (and profileFitsSlot if you use it) from './sectionProfiles.js' next to the existing import. One-line doc comment on each export naming SPEC-48.1.

Files (only these):
- src/elevation/model/profileEditing.js
- NEW src/elevation/model/__tests__/profileAttach.test.js: the SPEC §2 file VERBATIM (3 tests)

DO NOT change sectionProfiles.js, the round-48 tests, any other model file, the store or the components. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/profileAttach.test.js` — it must fail. Iterate on that file. At the end `npm test && npm run lint` once: 1136 + 3 = 1139, golden snapshot unchanged, lint 0 errors. If a number still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 434 Profile attach point edits".
```

---

## Step 435 — model: drawn-point edits

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.md §1 and §3. Step 434 is in (1139 tests).
If `git status` shows uncommitted changes, stop and tell me.

Add to src/elevation/model/profileEditing.js, exactly the SPEC §3 contract, same rules as the other edits (pure, editProfile, null on failure). view is 'elevation' or 'plan'. Keep one small internal helper that orders a list of ids by Object.keys(points) order.
- profileDrawnIn(profile, view) → a NEW array: drawnPoints.elevation for 'elevation'; drawnPoints.plan ?? drawnPoints.elevation for 'plan'; [] for any other view. No validation.
- profileVertexIds(profile) → ids of points that some segment of any loop starts or ends at, in points order. No validation.
- setProfileDrawnPoint(profile, view, pointId, drawn): the list for view (for 'plan', starting from profileDrawnIn(profile, 'plan'), so a missing plan list is copied from elevation first) with pointId added or removed, ordered by points order, written to drawnPoints[view]. The other view's key is untouched. null for a bad view, an unknown point, or a non-boolean drawn.
- setProfileDrawnPoints(profile, view, ids): drawnPoints[view] = ids ordered by points order. null for a bad view, a non-array, a repeated id or an unknown id. [] is fine.
- setProfilePlanSameAsElevation(profile, same): true deletes drawnPoints.plan (no-op when missing); false sets plan to a copy of elevation when plan is missing (no-op when it already has one). null when same isn't a boolean.
Any point may be drawn, including one no segment uses. One-line doc comment on each export naming SPEC-48.1.

Files (only these):
- src/elevation/model/profileEditing.js
- NEW src/elevation/model/__tests__/profileDrawn.test.js: the SPEC §3 file VERBATIM (3 tests)

DO NOT change the 434 code or test, sectionProfiles.js, the store or the components. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/profileDrawn.test.js` — it must fail. Iterate on that file. At the end `npm test && npm run lint` once: 1139 + 3 = 1142, golden snapshot unchanged, lint 0 errors. If a number still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 435 Profile drawn point edits".
```

---

## Step 436 — UI: Attach points panel

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.md §1 and §4. Step 435 is in (1142 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Build exactly what SPEC §4 lists:
- NEW src/library/profileEditor/AttachPanel.jsx: AttachPanel({ profile, selectedPointId, onApply }). Copy the button/input class constants the way PointsPanel.jsx does (its lines 10–12). File-local ATTACH_INFO (label + help for the nine ATTACH_POINTS names) and SLOT_LABELS (ten slots) from the SPEC tables. Heading "Attach points" and the hint line; one row per entry of profile.attach in object order: label + raw name in small mono, a select of every point id (points order) → setProfileAttach(profile, name, value), a "= {selectedPointId}" button when a point is selected and differs, a Clear button → setProfileAttach(profile, name, null); "No attach points yet." when empty; an Add row (select of the unset names as "{label} ({name})" + Add button) while any name is unset, assigning to selectedPointId or else the first point; a "Fits slots:" line with one pill per PROFILE_SLOTS slot where profileFitsSlot is true (SLOT_LABELS) or "No slot yet — add attach points."; one amber line per profileSlotGaps entry: "Tagged {profileTagLabel(tag)}, but it still needs {missing.join(', ')} to fit that slot." Fail text for the selects/buttons: "That point no longer exists."
- src/library/profileEditor/ProfileEditorPage.jsx (179 lines): import AttachPanel and render <AttachPanel profile={draft} selectedPointId={selection?.kind === 'point' ? selection.id : null} onApply={apply} /> in the right panel directly after <PointsPanel … /> and before the Loops section. Nothing else.
Imports: ATTACH_POINTS, PROFILE_SLOTS, profileFitsSlot, profileTagLabel from '../../elevation/model/sectionProfiles.js'; setProfileAttach, profileSlotGaps from '../../elevation/model/profileEditing.js'.

Files (only these): the two above.

DO NOT change the model, the store, PointsPanel, the canvas or other pages. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1142 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 436 Profile attach points panel".
```

---

## Step 437 — UI: Drawn points panel

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.md §1 and §5. Step 436 is in (1142 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Build exactly what SPEC §5 lists:
- NEW src/library/profileEditor/DrawnPanel.jsx: DrawnPanel({ profile, selectedPointId, onSelectPoint, onApply }). Same class constants as AttachPanel. Heading "Drawn points" + the hint line; a checkbox "Plan uses the same points as elevation" (checked when profile.drawnPoints.plan === undefined) → setProfilePlanSameAsElevation(profile, checked); an "Elevation:" row with "All shape points" (setProfileDrawnPoints(profile, 'elevation', profileVertexIds(profile))) and "None" ([]); a "Plan:" row with the same two buttons for 'plan', shown only while plan has its own list; a table Point | Elevation | Plan, one row per point in points order — the id is a button calling onSelectPoint(id), the selected row is bg-blue-900/40, Elevation and Plan are checkboxes (aria-label "{id} drawn in elevation" / "{id} drawn in plan") checked from profileDrawnIn(profile, view) and calling setProfileDrawnPoint(profile, view, id, checked); the Plan checkboxes are disabled with title "Plan follows elevation" while plan has no list of its own; under the table "{n} drawn in elevation · {m} in plan". Fail text for every call: "That change would make the shape invalid."
- src/library/profileEditor/ProfileEditorPage.jsx (after 436): render <DrawnPanel profile={draft} selectedPointId={same expression as AttachPanel} onSelectPoint={same handler PointsPanel gets} onApply={apply} /> directly after <AttachPanel … />. Nothing else.
Imports: profileDrawnIn, profileVertexIds, setProfileDrawnPoint, setProfileDrawnPoints, setProfilePlanSameAsElevation from '../../elevation/model/profileEditing.js'.

Files (only these): the two above.

DO NOT change the model, the store, AttachPanel, PointsPanel, the canvas or other pages. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1142 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 437 Profile drawn points panel".
```

---

## Step 438 — UI: canvas markers, Details button and tags, text updates

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.1.md §1 and §6. Step 437 is in (1142 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Build exactly what SPEC §6 lists:
- src/library/profileEditor/ProfileCanvas.jsx (266 lines): import profileDrawnIn from '../../elevation/model/profileEditing.js'. Work from drawnProfile (the drag preview when dragging, else profile). Once per render, before the points loop (about line 239): attachNames (point id → attach names using it, in attach key order), elevationSet = new Set(profileDrawnIn(drawnProfile, 'elevation')), planSet = same for 'plan'. In each point's <g>, BEFORE the existing circles (the transparent hit circle must stay on top), add decorations with pointerEvents="none": if the point has attach names, a diamond path (±11 px around the point, stroke #f59e0b, strokeWidth 1.5, fill none) and a <text> at (x + 7, y + 19), fontSize 10, fill #f59e0b, with the names joined ", "; if the id is in elevationSet or planSet, a <circle r={7.5} fill="none" stroke="#38bdf8" strokeWidth={1.5}>, solid when in elevationSet, otherwise strokeDasharray="3 2". Add a legend next to the cursor readout: pointer-events-none absolute bottom-2 right-2 rounded bg-gray-800/80 px-2 py-1 text-xs text-gray-300, text "◇ attach point · ○ drawn (solid: elevation, dashed: plan only)", shown only when the profile has any attach point or any drawn point (elevation or plan). Leave everything else in the file as it is.
- src/library/profileEditor/ProfileEditorPage.jsx (after 437): import profileTagLabel from '../../elevation/model/sectionProfiles.js' and ProfileDetailsDialog from '../ProfileDetailsDialog.jsx'. After the version in the header, one pill per tag of `saved` (rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300, profileTagLabel); a "Details" button (BUTTON_CLASS) just before the flex-1 spacer; state detailsOpen; render {detailsOpen && <ProfileDetailsDialog key={saved.id} profile={saved} onClose={() => setDetailsOpen(false)} />} at the end of the root div. The window keydown handler returns immediately while detailsOpen (add detailsOpen to its dependency list). The bottom note text becomes exactly: "x runs in from the edge; y = 0 is the front face, negative into the door. Attach points say where the profile sits; drawn points become lines in each view. Line tool: click points, click the first point to close, Enter to finish open. Select a segment to make it an arc."
- src/library/ProfileDetailsDialog.jsx (112 lines): change only the line "The shape is edited with Edit shape; attach and drawn points come next round." to "The shape, attach points and drawn points are edited with Edit shape."

Files (only these): the three above.

DO NOT change the model, the store, AttachPanel, DrawnPanel, PointsPanel, ProfilesPage or other pages. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1142 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 438 Profile editor markers and details".
```

---

## Running it (Kyle, after 438)

Follow SPEC-48.1's end-to-end check: on the Cove, move the Frame edge attach point and watch the slot list change, add a Door edge, tick Door outside edge in Details and watch the amber "still needs" line come and go, split Plan from Elevation in the Drawn panel and watch the rings go solid/dashed, rename a point and confirm the attach and drawn rows follow, then Save and confirm the card reads `v2`. Send `git show` after 435 if you want the model diff reviewed.
