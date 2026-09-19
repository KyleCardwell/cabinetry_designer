# Elevation Lab — Codex Prompts, Steps 20–22 (angled corners, filler split, overhang)

Commit pending work first. Run in order.
Codex cannot open the app (it's behind a login), so don't plan browser checks: rely on unit tests, `npm run build` and `npm run lint`.

---
## Step 20 — Corner clearance at any angle + filler distribution

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-6.md completely (source of truth; earlier SPEC files still apply). This step covers SPEC-6 §1, §2 and tests 1–10. Model only — no UI in this step beyond what's needed to keep things compiling.
If `git status` shows uncommitted changes, stop and tell me.

1. model/corners.js:
   - cornerReserve: add the back term per §1 (θ < 90° only), and honor the per-run override `run.cornerClearance[side]` ('auto' | 'face' | number), defaulting to 'auto' when the field is missing.
   - Export a helper that returns the parts, e.g. cornerReserveParts(...) → {face, back, total, source: 'auto'|'face'|'custom'}, so the UI in step 22 can show the breakdown. cornerReserve can wrap it.
   - Add cornerFillerMin(settings, angle) per §1.2.
2. model/room.js endMinWidthsForRun: use cornerFillerMin with that side's corner angle.
3. model/splitRun.js: per-side flex filler minimums and the distribution in §2. Keep the 2-argument call signature working and don't change behavior when both minimums are equal. Attach `cornerAngle` to a corner flex filler piece per §1.3 (pass the angle through opts, e.g. opts.endCornerAngles = {left, right}).
4. elevationSlice: a reducer setRunCornerClearance({wallId, runId, side, value}) storing 'auto' | 'face' | a number, ending with syncRoom. Default the field in createRun (or leave it undefined and treat undefined as 'auto' — pick one and be consistent).
5. Tests 1–10 in the existing model test files. All current tests must keep passing; if one legitimately changes, say which and why in your summary.
6. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 20 angled corner clearance + filler split".
```
---
## Step 21 — Run overhang past wall ends

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-6.md §3 and tests 11–14.

1. model/constants.js: add maxRunOverhang (36).
2. model/overlap.js validateRunPlacement: allow the overhang range per §3; keep every other check.
3. model/room.js roomDiagnostics: add the 'overhang' warning with its left/right amounts.
4. canvas/drag.js and model/runDefaults.js createRun: clamp drawn runs to the overhang range instead of the wall bounds.
5. model/room.js stretchRun: same range; keep the 2" wall-end snap and the inside-corner-only anchoring.
6. model/dimensions.js: chains span [min(0, firstRunStart), max(L, lastRunEnd)] per §3, staying contiguous. Update the existing chain tests if the range changes for a case, and keep the "sums to the range" property test.
7. components/DimensionRow.jsx: add the optional wallEndMarks prop (heavier ticks), and pass [0, L] from ElevationCanvas.
8. plan/PlanRunFootprint.jsx: draw the part of a footprint beyond the wall ends with a dashed edge.
9. Tests 11–14. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 21 run overhang".
```
---
## Step 22 — UI for corner clearance and overhang

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-6.md §4 (and §1, §3 for the data).

1. components/PropertiesPanel.jsx:
   - Per side, when that side is anchored at an inside corner, a "Corner clearance" select (Auto / Face only / Custom) plus an InchInput for Custom, dispatching setRunCornerClearance. Below it, a read-only resolved line using cornerReserveParts, e.g. `Reserve 42 9/16" (face 28 3/4" + back 13 7/8")`; for 'face' or a custom value, show just the resolved number and which mode it came from.
   - An overhang warning line when the run extends past a wall end, e.g. `Overhangs left 6"`.
   - Include the angle in the corner info line: `Inside corner 60° · Wall 2`.
2. components/SettingsPanel.jsx: add maxRunOverhang.
3. Keep the panel's existing layout conventions; no new state beyond what's needed.
4. Add unit tests for any new pure helper (e.g. the formatter for the reserve breakdown). `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 22 corner clearance + overhang UI".
```
