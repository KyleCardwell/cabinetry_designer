# Round 48 — Codex Prompts, Steps 429–433 (the profile editor)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**. Geometry and the API don't change. No Supabase (plan P18).

| Step | Repo | What | Tests after |
|---|---|---|---|
| 429 | cabinetry_designer | Model: point edits | 1130 |
| 430 | cabinetry_designer | Model: loop and segment edits | 1136 |
| 431 | cabinetry_designer | UI: editor route, page shell, draft/undo/save, points panel | 1136 |
| 432 | cabinetry_designer | UI: the canvas | 1136 |
| 433 | cabinetry_designer | UI: tools, segment panel, Join, keys | 1136 |

---

## Before step 429 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on elevation-doors, 428 in; only the two docs below are new
git add docs/elevation-mvp/SPEC-48.md docs/elevation-mvp/PROMPTS-48.md
git commit -m "round 48 docs"
```

---

## Step 429 — model: point edits

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.md §1 and §2. Step 428 is in (1124 tests).
If `git status` shows uncommitted changes, stop and tell me.

NEW src/elevation/model/profileEditing.js — pure edits on a section profile (SPEC-47 shape). Exports, exactly the SPEC §2 contract:
PROFILE_GRID_STEPS, isPointId, nextPointId, formatProfileCoord, addProfilePoint, moveProfilePoint, renameProfilePoint, deleteProfilePoint, moveProfileOrigin, snapProfilePoint.
Imports: isSectionProfile from './sectionProfiles.js'; formatInchesInput from './units.js'. One-line doc comment per export naming SPEC-48.
Rules for every edit (SPEC §1):
- structuredClone the input, never mutate it; return the new profile or null.
- null for unknown ids, bad args, or when the result fails isSectionProfile.
- Coordinates an edit writes (new/moved points, computed arc centers) are rounded to 6 decimals and -0 becomes 0 (an internal round6). Untouched coordinates stay as they are.
- Sweep rule for arcs (SPEC §1): sweep θ measured from `from`'s angle to `to`'s angle about center, ccw or clockwise, in (0, 360). New center = M ± n·(h / tan(θ/2)) with M the chord midpoint, h half the chord, u the unit chord F→T, n = (−u.y, u.x); + when ccw, − when clockwise. moveProfilePoint applies it to every arc touching the moved point, keeping each arc's sweep and ccw; zero chord → null. Write the sweep and center-from-sweep helpers as internal functions; step 430 reuses them.
- formatProfileCoord: exact 1/64 multiple (|n·64 − round(n·64)| < 1e-9) → formatInchesInput(n, 1/64); else String(Number(n.toFixed(4))).
- renameProfilePoint keeps the key's position in points and renames it in segs from/to, attach values and both drawnPoints lists.
- deleteProfilePoint: null when a segment uses it; also drops attach keys naming it and removes it from drawnPoints lists (keep an existing plan list even if empty).
- snapProfilePoint: nearest existing point within reach (inclusive, skipping exclude, first in points order on a tie) → { xy: its coordinates, id }; else { xy: [round6(Math.round(x/grid)·grid), round6(Math.round(y/grid)·grid)], id: null }.

Files (only these):
- NEW src/elevation/model/profileEditing.js
- NEW src/elevation/model/__tests__/profileEditing.test.js: the SPEC §2 file VERBATIM (6 tests)

DO NOT change sectionProfiles.js, units.js, any other model file, the store, the components or existing tests. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/profileEditing.test.js` — it must fail. Iterate on that file. At the end `npm test && npm run lint` once: 1124 + 6 = 1130, golden snapshot unchanged, lint 0 errors. The arc numbers are worked out under the test in SPEC §2; if one still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 429 Profile point edits".
```

---

## Step 430 — model: loop and segment edits

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.md §1 and §3. Step 429 is in (1130 tests).
If `git status` shows uncommitted changes, stop and tell me.

Add to src/elevation/model/profileEditing.js (from 429), exactly the SPEC §3 contract, same rules as 429 (pure, null on failure or when isSectionProfile fails, round6 on written coordinates, -0 → 0):
nextLoopId, addProfileLoop, deleteProfileLoop, splitProfileSegment, profilePointJoints, removeProfileVertex, setSegmentArc, setSegmentLine, setArcRadius, profileArcInfo.
Key details:
- addProfileLoop: lines through the ids in order (+ last→first when closed), loop id nextLoopId; leave every validity check to isSectionProfile.
- deleteProfileLoop and removeProfileVertex also delete points that only the affected loop used and that attach/drawnPoints don't name. deleteProfileLoop: null for the last loop.
- splitProfileSegment(profile, loopId, index, id = nextPointId(profile)): new point appended; line → midpoint; arc → point at half sweep (angle of from ± θ/2, + for ccw), two arcs with the same center and ccw, in place of the original.
- profilePointJoints: loop ids where a segment ends at the point and the next begins at it (closed loops include last→first).
- removeProfileVertex: the two segments become one line from the first's from to the second's to, in the first's place; at a closed loop's start: [...segs.slice(1, -1), line(last.from, first.to)].
- setSegmentArc(…, { sweep, ccw }): 0 < sweep < 360 and ccw boolean, center by the sweep rule from 429. setSegmentLine drops center/ccw.
- setArcRadius: arcs only; null when radius isn't finite or radius < h − 1e-9; θ = 2·asin(min(1, h/radius)) in degrees, or 360 − θ if the current sweep is over 180; keep ccw.
- profileArcInfo → { center, radius, sweep, ccw } (round6 numbers) or null for a line / bad index.

Files (only these):
- src/elevation/model/profileEditing.js
- NEW src/elevation/model/__tests__/profileLoops.test.js: the SPEC §3 file VERBATIM (6 tests)

DO NOT change the 429 test, any other model file, the store or the components. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/profileLoops.test.js` — it must fail. Iterate on that file. At the end `npm test && npm run lint` once: 1130 + 6 = 1136, golden snapshot unchanged, lint 0 errors. The numbers are worked out under the test in SPEC §3; if one still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 430 Profile loop and segment edits".
```

---

## Step 431 — UI: editor route, page shell, draft, points panel

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.md §1 and §4. Step 430 is in (1136 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Build exactly what SPEC §4 lists:
- src/App.jsx (70 lines): import ProfileEditorPage from './library/profileEditor/ProfileEditorPage.jsx'; add <Route path="/library/profiles/:profileId" element={<ProfileEditorPage />} /> right before the /library route (outside LibraryLayout, so the editor gets the full width).
- src/library/ProfilesPage.jsx (226 lines): an "Edit shape" <Link> (react-router-dom) to /library/profiles/{id} right after the Details button on each card, className BUTTON_CLASS; the note text change from SPEC §4. Nothing else.
- src/library/ProfileDetailsDialog.jsx (112 lines): only the one read-only line's text from SPEC §4.
- NEW src/library/profileEditor/useProfileDraft.js: useReducer { draft, past, future }; apply/undo/redo/canUndo/canRedo/dirty; history cap 100; resets when saved.id changes; dirty compares JSON.stringify([geometry, attach, drawnPoints]).
- NEW src/library/profileEditor/CoordInput.jsx: like src/elevation/components/InchInput.jsx (62 lines) but shows formatProfileCoord and commits (parseInches) only when the text changed from what it last showed; revert on parse failure or onCommit returning false; Escape reverts.
- NEW src/library/profileEditor/PointsPanel.jsx: the points table (rename / x / y / Origin / Delete) and the Add point row, with the fail texts in SPEC §4. onApply(next, failText) returns whether it applied.
- NEW src/library/profileEditor/ProfileEditorPage.jsx: not-found state; header (back link or two-click "Discard changes?", name, version, archived pill, Unsaved, Undo, Redo, Save); message line; body = canvas area (ProfileThumbnail of the draft for now) + right panel (PointsPanel, loops list, note); apply(next, failText); selection state; Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y outside inputs. Save dispatches updateSectionProfile({ profileId: saved.id, profile: { ...saved, geometry, attach, drawnPoints from the draft } }).
Classes: copy BUTTON_CLASS / INPUT_CLASS from src/library/ProfilesPage.jsx (lines 14–15).
Imports (relative): '../../elevation/model/profileEditing.js', '../../elevation/model/sectionProfiles.js', '../../elevation/model/units.js', '../../elevation/store/elevationSlice.js', '../ProfileThumbnail.jsx'.

Files (only these): the seven above.

DO NOT change the model, the store, LibraryLayout, the other library pages or ElevationLab. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1136 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 431 Profile editor page".
```

---

## Step 432 — UI: the canvas

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.md §1 and §5. Step 431 is in (1136 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Build exactly what SPEC §5 lists:
- NEW src/library/profileEditor/profileView.js: fitView, toScreen, toModel, zoomAt, segmentScreenPath, loopScreenPath (plain functions; scale = px per inch, clamped 20–4000; y-up: screenY = H/2 − (y − cy)·scale; arc sweep flag = ccw ? 0 : 1, large = sweep > 180). Use sectionProfileBounds and profileArcInfo from the model.
- NEW src/library/profileEditor/ProfileCanvas.jsx: ResizeObserver size; fit on first size and on fitSignal change; grid (minor at `grid` when grid·scale ≥ 8, inch lines when scale ≥ 8), axes and their labels ("face (y = 0)", "x = 0"); loop fills; per-segment visible + transparent 12 px hit paths; points with hit circles and id labels; click selects point/segment/none; left-drag on empty (>3 px) or middle-drag pans (pointer capture); wheel zoom about the cursor ×1.15 via addEventListener('wheel', …, { passive: false }); cursor readout bottom-left with formatProfileCoord (rounded to 1/64). Colors and sizes as SPEC §5. Screen coordinates, no viewBox.
- src/library/profileEditor/ProfileEditorPage.jsx (431): replace the thumbnail with the toolbar (Fit, Grid select from PROFILE_GRID_STEPS labelled with formatInches, default 1/16) + ProfileCanvas; grid state; the selected-segment line above the points table; F key = Fit outside inputs. Drop the ProfileThumbnail import if unused.

Files (only these): the three above.

DO NOT change the model, the store, PointsPanel, CoordInput, useProfileDraft or other pages. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1136 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 432 Profile editor canvas".
```

---

## Step 433 — UI: tools, segment panel, Join, keys

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.md §1 and §6. Step 432 is in (1136 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Build exactly what SPEC §6 lists:
- src/library/profileEditor/ProfileCanvas.jsx (432): props tool, onApply, onMessage (+ a cancel signal or ref for Escape/Enter, your choice). Select tool: point drag past 3 px with snapProfilePoint(start, …, { grid, reach: 8 / scale, exclude: id }) and moveProfilePoint(start, …) previews (keep the last valid preview), one apply on pointer-up, green snap ring. Line tool: snapped hover cross + dashed preview, picks (ignore a repeat of the last xy; reuse an earlier new pick at the same xy), close by clicking within 8 px of the first pick when ≥ 3 picks, finish open on Enter/double-click (≥ 2), Escape cancels; finish = addProfilePoint for new picks (nextPointId, same id for repeats) then addProfileLoop, applied as one step with the SPEC fail text.
- NEW src/library/profileEditor/SegmentPanel.jsx: header, Line | Arc toggle (Arc → setSegmentArc 90° clockwise), Radius (CoordInput → setArcRadius), Sweep° (2 decimals → setSegmentArc keeping ccw), Clockwise / Counter-clockwise, read-only center, Split (select the new point), two-click Delete loop. Fail texts as SPEC §6.
- src/library/profileEditor/PointsPanel.jsx (431): Join action between Origin and Delete, enabled when profilePointJoints is non-empty → removeProfileVertex(profile, joints[0], id); title and fail text as SPEC §6.
- src/library/profileEditor/ProfileEditorPage.jsx (432): tool state; Select (V) / Line (L) toggle buttons before Fit; SegmentPanel replaces the selected-segment line; keys outside inputs: V, L, Escape, Enter, Delete/Backspace (deleteProfilePoint on a selected point); the extra note sentence.

Files (only these): the four above (profileView.js only if a new helper is needed, without changing existing ones).

DO NOT change the model, the store, CoordInput, useProfileDraft or other pages. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1136 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 433 Profile editor tools".
```

---

## Running it (Kyle, after 433)

Follow SPEC-48's end-to-end check: Edit shape on the new square, type `-13/16` coordinates, turn the face edge into an arc and change radius/direction, split and drag to make a cove (watch the snap ring), draw a triangle with the Line tool and undo/redo it, Join and Origin, the Discard prompt, then Save and confirm the card shows `v2`. Send `git show` after 430 and I'll review the arc math diff.
