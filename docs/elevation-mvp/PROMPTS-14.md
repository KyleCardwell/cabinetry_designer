# Elevation Lab — Codex Prompts, Steps 60–63 (cabinet styles and reveal rules)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first (including these docs and `docs/elevation-mvp/patches-14/`).

**Order:** 60 → 61 → 62 → 63.

**This round's code is prewritten.** Each step applies a verified patch; the agent's job is to apply it, run the gate and commit. Don't rewrite or "improve" the patched code. If `git apply --check` fails, stop and report. Don't hand-merge.

Codex can't open the app (it's behind a login), so don't plan browser checks.

---
## Step 60 — Style model, rules and neighbor capture

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-14.md §1–§4 (skim only if a test fails).
If `git status` shows uncommitted changes, stop and tell me.

git apply --check docs/elevation-mvp/patches-14/step-60.patch && git apply docs/elevation-mvp/patches-14/step-60.patch

It touches only src/elevation/model: constants.js, faces.js, units.js, index.js, three new files (styles.js, capture.js, faceLayouts.js) and five test files. Nothing outside model/ calls the new code yet.
Run `npm test && npm run build && npm run lint`. Expect 333 tests passing. If a new test fails, report it; don't edit expectations.

At most five lines of summary. Commit "elevation-mvp: step 60 cabinet styles and reveal rules".
```
---
## Step 61 — Persist and store styles

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-14.md §1, §2, §6.
If `git status` shows uncommitted changes, stop and tell me.

git apply --check docs/elevation-mvp/patches-14/step-61.patch && git apply docs/elevation-mvp/patches-14/step-61.patch

Touches store/persistence.js, store/elevationSlice.js and their two test files. No UI.
Run `npm test && npm run build && npm run lint`. Expect 339 tests passing.

At most five lines of summary. Commit "elevation-mvp: step 61 persist and store styles".
```
---
## Step 62 — Draw faces with style reveals; upper panels drop

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-14.md §5.
If `git status` shows uncommitted changes, stop and tell me.

git apply --check docs/elevation-mvp/patches-14/step-62.patch && git apply docs/elevation-mvp/patches-14/step-62.patch

Touches only components/RunGroup.jsx (faces from runFaceLayouts; fillers/end panels drawn with panelDrop).
Run `npm test && npm run build && npm run lint`. No new tests; 339 passing.

At most five lines of summary. Commit "elevation-mvp: step 62 draw style reveals".
```
---
## Step 63 — Style and reveal controls

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-14.md §6 (step 63 row).
If `git status` shows uncommitted changes, stop and tell me.

git apply --check docs/elevation-mvp/patches-14/step-63.patch && git apply docs/elevation-mvp/patches-14/step-63.patch

Four new components (properties/StyleFields.jsx, RoomStylePanel.jsx, properties/RunFaceOptions.jsx, properties/CabinetStyleProperties.jsx) plus small edits to ElevationLab.jsx, InchInput.jsx, PropertiesPanel.jsx (one import, one line) and properties/FaceProperties.jsx. Don't open PropertiesPanel.jsx beyond checking the diff.
Run `npm test && npm run build && npm run lint`. 339 passing.

At most five lines of summary. Commit "elevation-mvp: step 63 style and reveal controls".
```

---
## Manual check after step 63 (Kyle, in the app)

1. **Room style.** In the sidebar, set Cabinet style → Inset face frame.
   - Base doors should sit 3/4" from the box sides and 1 1/2" from the top and bottom.
   - Uppers should sit 3/4" from the bottom.
   - Upper-run fillers and end panels should drop 3/4" below the box.
2. **Run options.**
   - Base run → Top: Shop-built wood. On a European base, the top reveal reads "1/8" · rule: wood top".
   - Upper run → Bottom: Flush. The panels should return to box height.
3. **Captured single.** A one-cabinet European base run with end panels on both sides, holding a single door or 3Df, reads "3/32" · rule: captured single". A pair door stays 1/16".
4. **Manual override.** Type a manual reveal, and its source changes to "manual". Clear the input, and it's automatic again.
