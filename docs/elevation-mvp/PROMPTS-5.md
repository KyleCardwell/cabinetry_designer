# Elevation Lab — Codex Prompts, Steps 18–19

Commit pending work first. Run in order.
Codex cannot open the app (it's behind a login), so don't write browser checks into the work: rely on unit tests, `npm run build` and `npm run lint`. Kyle does the visual check afterwards.

---
## Step 18 — Elevation zoom/pan + bigger run click targets

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-5.md completely (source of truth; earlier SPEC files still apply). This step covers SPEC-5 §1, §2 and tests 1–4.
If `git status` shows uncommitted changes, stop and tell me.

1. canvas/transform.js: add DEFAULT_VIEW, withView, zoomViewAt and panView exactly per §1.1 (pure, JSDoc). Don't change the existing exports' behavior.
2. components/ElevationCanvas.jsx: hold the view state, reset it on wall change and on Zoom to fit, and pass `withView(base, view)` everywhere the transform is used. Add wheel zoom at the pointer, and stage drag panning in Select mode when no draw/stretch drag is active. Make sure draggable handles set cancelBubble on dragstart so they never start a pan.
3. components/ElevationToolbar.jsx: in Elevation view, add "−" / "+" buttons and a zoom percentage readout next to Zoom to fit. They zoom about the viewport center (the canvas can expose a callback, or the toolbar can dispatch through a shared prop — keep it simple and local; no new Redux state).
4. Keyboard shortcuts per §1.1's last bullet, ignored while typing in a form field, registered and cleaned up in one effect.
5. components/DimensionRow.jsx: replace the thin hit area for 'run' segments with the hit rectangles in §2.
6. Tests 1–4 in canvas/__tests__/transform.test.js. `npm test`, `npm run build` and `npm run lint` must pass.

Keep the change focused; no other behavior changes.
Commit "elevation-mvp: step 18 elevation zoom + click targets" and summarize (including anything you had to do to keep panning from fighting the stretch handles).
```
---
## Step 19 — Plan fills, corner snap distance, automatic end panels

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-5.md §3–§4 and tests 5–10.

1. plan/PlanRunFootprint.jsx: give upper runs the translucent fill per §3, keeping the dashed outline, the render order and click-through.
2. model/constants.js: cornerSnapDistance 3, plus autoEndPanelOnFreeEnd (true) and adjacentRunGap (1). components/SettingsPanel.jsx: expose both new settings (checkbox + inch input) with clear labels.
3. model/runDefaults.js: apply §4.2's anchor and end-type rules in createRun. It already receives the room and wall, so use them for the corner check (cornerAt) and the adjacency check (bandsCompatible). Auto-anchoring now requires an inside corner as well as the distance.
3b. model/room.js stretchRun: apply the same inside-corner restriction per §4.3 — snapping to an open, straight or outside wall end no longer sets an anchor.
4. Check every existing caller of createRun and of DEFAULT_SETTINGS.cornerSnapDistance for assumptions about the old 30" value, and update anything that breaks.
5. Tests 5–11 in model/__tests__/runDefaults.test.js (plus a stretchRun test for the open-end case) (extend the existing file). Update existing tests only where the new defaults legitimately change the expected result, and call out each one in your summary.
6. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 19 plan fills + end rules" and summarize.
```
