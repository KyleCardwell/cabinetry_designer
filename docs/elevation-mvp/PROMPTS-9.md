# Elevation Lab — Codex Prompts, Steps 32–33 (deselection, signed anchors, wall navigation)

Commit pending work first. Run in order. The two steps are independent, but 32 is the smaller one.
Codex cannot open the app (it's behind a login), so don't plan browser checks: rely on unit tests, `npm run build` and `npm run lint`.

---
## Step 32 — Deselection and wall navigation

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-9.md completely (source of truth; earlier SPEC files still apply). This step covers SPEC-9 §1, §3 and tests 1–4 and 16.
If `git status` shows uncommitted changes, stop and tell me.

1. §1.2 — split the navigation cursor from the visual selection:
   - selection gains wallId. setActiveWall sets activeWallId AND selection.wallId and clears the other three; clearTransientSelection nulls all four and leaves activeWallId alone; setView('elevation') sets selection.wallId = activeWallId.
   - plan/PlanWallShape.jsx takes isSelected from selection.wallId.
   - components/PropertiesPanel.jsx renders its wall section from selection.wallId, with the one-line hint when nothing is selected.
   - Everything that DRAWS keeps using activeWallId — ElevationCanvas, RoomPicker, WallList. Grep for activeWallId and decide each site deliberately; say in your summary which ones you switched and which you left.
2. §1.3 — plan/PlanCanvas.jsx dispatches clearSelection() on a left click on empty space under the select tool, when no live entry is open and no shape was hit. ElevationCanvas keeps selection.wallId on an empty click and clears only run, piece and opening. Escape matches an empty click in both views, after any live entry has been cancelled.
3. §3 — wall navigation in components/ElevationToolbar.jsx, elevation view only, beside the zoom controls: ‹ Wall 2 / 5 ›, ordered by room.wallOrder, labelled with wallLabel, wrapping at both ends, disabled below two walls. Put the ordering in a pure nextWallId(room, activeWallId, direction) helper so it can be tested. Bind [ and ] in the elevation canvas with the existing input/live-entry guard.
4. Tests 1–4 and 16. `npm test`, `npm run build` and `npm run lint` must pass. All existing tests must keep passing; if one legitimately changes, say which and why.

Commit "elevation-mvp: step 32 deselection + wall navigation".
```
---
## Step 33 — Signed anchor offsets

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-9.md §2 and tests 5–15.

The rule is one sentence and it applies to all three datum kinds: a positive offset holds the run back on the room side of its datum, a negative offset carries it past. resolveHorizontal's arithmetic already produces that, so do not change its formulas.

1. Confirm before you start that parseInches already accepts a leading +/- in all three forms and formatInches emits a leading minus. They do. Do not change units.js or InchInput.jsx.
2. model/corners.js cornerReserveParts: for outside, straight and open ends return total = run.cornerClearance?.[side] when that is a finite number, else 0, with source 'custom' or 'auto'. Treat 'face' as 'auto' at those ends. Inside-corner behavior is unchanged except that a custom number may now be negative.
3. Relax the four inside-only gates listed in §2.2 — setRunAnchor's end treatment (end_panel at a non-inside end, filler at an inside corner, leave an existing end panel alone), createRun's auto-anchor, stretchRun's snap candidates, and the two components that show the control and the marker. Leave endMinWidthsForRun, endCornerAnglesForRun, NeighborReturns and the dimensions corner-gap inside-only — §2.2 says why for each.
4. §2.3 — allow a negative clearance on an opening anchor. No formula changes; past the casing but short of the jamb stays silent, past the jamb already warns via runBlocksOpening. Verify that with a test rather than by adding code.
5. §2.4 — show the offset control at every anchored end with the mode sets listed there, add the helper line, and put the resolved line in a pure describeAnchor(room, wall, run, side, settings) beside the existing resolveRunAnchorDatum so it can be unit-tested.
6. Tests 5–15. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 33 signed anchor offsets".
```
