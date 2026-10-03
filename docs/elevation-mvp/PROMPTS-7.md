# Elevation Lab — Codex Prompts, Steps 23–25 (doors and windows)

Commit pending work first. Run in order.
Codex cannot open the app (it's behind a login), so don't plan browser checks: rely on unit tests, `npm run build` and `npm run lint`.

---
## Step 23 — Opening model, state and persistence

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-7.md completely (source of truth; earlier SPEC files still apply). This step covers SPEC-7 §1, §2, §7, §8 and tests 1–20 and 24–25. Model and state only — no canvas or panel work in this step beyond keeping things compiling.
If `git status` shows uncommitted changes, stop and tell me.

1. model/constants.js: add the §1.1 settings to DEFAULT_SETTINGS.
2. New file model/openings.js, all pure:
   - casingSides(kind)
   - openingGeometry(opening, wallLength, settings) per §2.1 — jamb, casing, head and all four offsets
   - setMeasureMode / setOffsetSide per §2.2. They rewrite the stored numbers and must NOT change the resolved geometry; a round trip must return the original numbers within 1e-9.
   - createOpening({kind, x, measureMode}, {settings, room, wall}) per §2.3, including the clamp that keeps the casing on the wall and the D1/W1 labelling.
   - validateOpeningPlacement(wall, opening, settings) per §2.4.
   - runBlocksOpening(run, opening, wall, settings) per §2.5 — jamb overlap only, reusing the verticalStart band rule from overlap.js (export it from there rather than duplicating it).
   - openingsAtPoint(room, point, settings), mirroring footprintsAtPoint. Nothing calls it until step 24.
   Export the new helpers from model/index.js.
3. model/geometry.js: planPointToWallX(frame, point) = dot(subtract(point, frame.leftPoint), frame.r).
4. model/room.js:
   - cloneRoom clones wall.openings (and each opening's casing object).
   - syncRoom carries openings through untouched; compensateRuns must NOT shift them (§2.6).
   - flipRunsForWall swaps each opening's offsetFrom.
   - roomDiagnostics adds {code: 'blocks-opening', openingId, label} to a run's warnings for each opening it blocks.
5. store/elevationSlice.js:
   - selection becomes {runId, pieceId, openingId}, with setSelection normalizing per §7. Don't break any existing selection.runId reader.
   - createWall defaults openings to [].
   - The six reducers in the §7 table, each ending with syncRoomAt. updateOpening rejects a change that fails validateOpeningPlacement, sets state.message to the reason, and leaves the opening as it was.
6. store/persistence.js per §8: isOpening, isWall accepting a missing openings array, normalizeV2Document defaulting openings to [] and the new settings from DEFAULT_SETTINGS, migrateV1Document writing openings: []. Stay on schemaVersion 2 — no migration.
7. Tests 1–20 in src/elevation/model/__tests__/openings.test.js (13–17 belong in the room tests), 24–25 in the persistence tests.
8. `npm test`, `npm run build` and `npm run lint` must pass. All existing tests must keep passing; if one legitimately changes, say which and why in your summary.

Commit "elevation-mvp: step 23 opening model".
```
---
## Step 24 — Drawing and placing openings

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-7.md §3, §4 and §5.

1. components/ElevationToolbar.jsx: add 'door' and 'window' tools to both views per §5, and allow them in the setTool reducer.
2. New components/OpeningShape.jsx per §4 — the casing rectangle with the jamb rectangle painted over it, the label, the selected state, and horizontal drag that dispatches moveOpening on drag end (snapped to settings.openingSnap, clamped so the casing stays on the wall).
3. components/ElevationCanvas.jsx:
   - Render openings between WallFrame and the runs.
   - Click placement with the door/window tools per §5: screenPointToWallSnapped gives x, createOpening builds it, validateOpeningPlacement gates it, failures go to the toolbar message for ~3s, success dispatches addOpening then setTool('select') and selects it.
   - Delete/Backspace removes the selected opening, matching the existing run behavior.
4. New plan/PlanOpening.jsx per §3 — the void polygon in the plan background color, jamb lines, glazing or threshold line, the room-side casing rectangle, the rotated label, the selected state. Export the background color as a shared constant rather than repeating the hex.
5. plan/PlanCanvas.jsx:
   - Render openings between the wall shapes and the run footprints.
   - Click placement with the door/window tools, using planPointToWallX on the clicked wall; a click away from any wall does nothing.
   - Selection: test run footprints first, fall through to openingsAtPoint, and only then the wall.
   - Drag an opening along its wall, constrained to frame.r, dispatching moveOpening on drag end.
6. Pure helpers only get unit tests (e.g. the click-x-to-offset clamp). Don't test Konva components. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 24 opening canvas + placement".
```
---
## Step 25 — Opening properties, dimensions and settings

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-7.md §6 and §9.

1. model/dimensions.js: openingChain and verticalOpeningChain per §6, plus tests 21–23.
2. components/ElevationCanvas.jsx: render the opening DimensionRow below the lower-band rows with wallEndMarks [0, wallLength], and use verticalOpeningChain for the vertical column when selection.openingId is set.
3. components/PropertiesPanel.jsx: the Opening section per §9 — label, kind, Measured-to toggle, size inputs (sill for windows only), the From toggle and distance input, the read-only four-distance block with the active pair highlighted, the casing controls, head height, and the warnings. Add the "Blocks {label}" warning line to the run section.
4. components/SettingsPanel.jsx: an "Openings" group with the §1.1 settings.
5. components/WallList.jsx: an opening count beside the run count.
6. Keep the panel's existing layout conventions and InchInput usage; no new state beyond what's needed. Unit-test any new pure formatter. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 25 opening properties + dimensions".
```
