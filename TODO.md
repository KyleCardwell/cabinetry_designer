# Project TODO

This is the shared backlog for project ideas, bugs, improvements, and follow-up work.

## How to use this file

- Add new thoughts to **Idea inbox** immediately; they do not need to be fully specified.
- Move an item to **Planned** when its scope and completion criteria are clear.
- Use `P0` for urgent work, `P1` for important work, `P2` for normal work, and `P3` for someday work.
- Add an area such as `elevation`, `plan`, `model`, `UI`, `DXF`, `estimate`, or `docs`.
- Mark an item complete only after its completion criteria and relevant checks pass.
- Preserve completed items in **Done** with the completion date and commit or pull request when available.

AI collaborators should read this file when asked to plan or prioritize project work. Preserve the user's wording and intent, avoid silently deleting ideas, and record any important assumptions under the relevant item.

Suggested format:

```markdown
- [ ] **[P2][area] Short idea title**
  - Why: Optional context or motivation.
  - Notes: Constraints, links, or open questions.
  - Done when: A concrete, verifiable outcome.
```

## Idea inbox

- [ ] **[P1][model][plan][elevation] Wall configuration: two-faced walls, walls ending on faces, soffits**
  - Why: Alcoves between wing walls, pony walls, notched corners with a wall extending into the room, and islands where the cabinet backs butt together cannot be modeled today. Cabinets need to go on either side of any wall.
  - Decided - faces: every wall has two faces and every run says which face it is on. Thickness 0 is allowed (island, backs butted). With explicit faces, chain orientation only sets defaults and naming, so it stops being a correctness risk.
  - Decided - no wing-wall type: a wing wall, pony wall or notch extension is just a wall whose end lands on another wall's face. The host is never split, so it keeps one full-length elevation; the landing divides its face into spans. A span edge behaves like a wall end today (anchors, corner reserve, cornerClearance, end panel vs filler). A pony wall's span edge only exists below its height, so bases die into it and uppers above it do not see it.
  - Decided - positioning: the connected end gets the existing 2x2 position readout (from host left/right end, to near face/far face/center); the typed cell becomes the stored reference. References only point down a ranking, which rules out loops: wall ends -> walls on a face (from host ends or earlier walls on the same face) -> openings and soffits (same rank, never measured from each other) -> runs -> pins. The last span on a face is always derived; typing into it rebases the reference so the typed number sticks.
  - Decided - dimensions: plan shows the face span chain including wall thicknesses (example: 60 / 9 / 120 / 12 / 45 on a 246 wall). Elevation shows the full host length with walls that land on it drawn in section, and the cabinetry chain confined to the spans that take cabinets.
  - Decided - cabinets on a wing wall face meet the host's cabinets at an ordinary inside corner, same reserve logic as between two walls today. Cabinets on neighbouring faces are drawn in section on this elevation - the same drawing feature the returns from adjacent walls need.
  - Decided - no warning when cabinets are deeper than a wing wall; lapping the end panel onto the wing is a negative anchor offset. A run overlapping a wall's footprint must never be treated as an error.
  - Decided - soffits: per face, several allowed. Each end anchors to a wall end or a wall face with a signed offset (positive holds back, negative runs past). A soffit caps the cabinet top over its range (profileAt(x) instead of one profile per wall). Running past an inside corner warns; a wrap is a second soffit on the next wall.
  - Decided - drawing: an endpoint snaps to a wall face partway along it and records the connection; drawing the host after the wing walls auto-connects endpoints already on its face. When a host moves, a wall with one free end moves with it and keeps its length; a wall with both ends connected stretches. Users adjust afterwards when that is not what the room needs.
  - Decided - islands: the wall owns the left/right end treatment, both faces' runs anchor to it, and interior splits stay independent per face. The end panel is one part, width frontDepth(front) + frontDepth(back), at the right end of the front elevation and the left end of the back one.
  - Notes: Code that assumes today's model - `wallComponents`/`chainOrientation` expect no branching ("Valid elevation rooms cannot branch"); `cornerAt` only knows corners at wall ends; `resolveVertical` uses one profile per wall; `runFootprint` projects along +n only; the `backPointAt` miter limit is 0 when both walls are 0 thick; island countertop depth needs box depth, not `frontDepth` (which adds bumper and door). `resolveHorizontal`, `positionReadouts` and `startFromReadout` measure against wall length and will need to measure against a span - scope that deliberately as its own step. Bump the schema once per step, not one big v4.
  - Notes: The shared datum ranking is also the fix for the pin entry under Bugs and cleanup - a pin is the lowest rank, so it may move its own run and joints but never an opening or a wall.
  - Open: Does a soffit ever wrap a corner? Assumed two soffits joined at the corner until a real job says otherwise.
  - Build order: (1) faces and spans - islands work after this; specified as SPEC-17 steps 82–89 (done: two sides, islands, wall end panels); (3) walls ending on faces is SPEC-18 and (4) soffits SPEC-19, both pulled ahead of (2); (2) shared datum ranking; (3) walls ending on faces - alcoves, pony walls, notches; (4) soffits; (5) an "Add alcove" preset that places two wing walls and an optional soffit.
- [ ] Inset face frame vs. Euro cabinet styles; this would change the reveals per cabinet, and face frame would rarely need fillers at all.
- [ ] UI settings modal with tabs instead of the sidebar to increase the working area.
- [ ] Extend parts above or below their run box, such as fillers or panels sitting on the floor next to appliances or on the countertop.
- [ ] Divide individual cabinetry into doors, drawer fronts, panels, and other components.
- [ ] Rules for AI to “process” a room and generate reports: shipping list, cabinet order, door order, etc.
  - Separate doors/drawer fronts by style and size
- [ ] Rules for AI to determine stile and rail widths for smaller doors/drawer fronts
- [ ] Upload current job processing checklist document to inform AI on current rules for processing
- [ ] Molding designer: crown, applied moldings, and choosing which points of the molding are drawn into the room geometry.
- [ ] Door Style editor with door-thickness options that adjust how cabinets fit in a room.
- [ ] Allow every cabinet to override its room or team defaults for every setting.
- [ ] Hardware choices: hinges, slides, pulls, and more. Hinges might determine cabinet style; slides would adjust drawer-front widths and depths.
- [ ] Appliance panels.
- [ ] Appliances without panels.
- [ ] Split cabinets vertically within a run so they can stack on top of each other, not only side by side.
  - Blind Corner Cabinets
  - Add Accessories to individual cabinets
- [ ] Comments per unique cabinet box or part.
- [ ] Part numbering for a whole room.
- [ ] Cross sections on drawings.
- [ ] Saving to the database - how to structure for edits, redraws and versions, etc. Do we need a version history since multiple people could work on one project?
- [ ] save clearances to side objects - i.e. a run needs 4" clearance from door casing, etc.
- [ ] hoods
- [ ] splitting into a pencil drawer and nothing below or a panel below, automatically add side panels
- [ ] doran paneled openings in bathrooms
- [ ] cabinet numbering***
- [ ] choose light rail/trough/panel below uppers (or all cabinets?)
  - Same for wood tops, lids, furniture base, toekick. Project/Room/Cabinet Overrides
- [ ] add multiple rows/options of top of crown per room
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 

## Planned

<!-- Move sufficiently defined work here. -->

Specified in `docs/elevation-mvp/SPEC-20.md`, step prompts in `PROMPTS-20.md`.

- [ ] **[P1][model][plan][elevation] Steps 101–105 — soffit and plan polish**
  - Why: Kyle's first pass over wing walls and soffits: thick plan dashes, runs partly under a soffit not dropping, no soffit width edit, no back-side elevation letters, markers crowding walls on zoom, small/hidden plan dimensions, no manual drawer stack, hatching that reads as a section, no clearance to a wing wall.
  - Deferred: notching a cabinet deeper than a shallow soffit (decide per run); dragging soffit edges in elevation; forced elevations for wall backs.
  - Done when: SPEC-20 tests 167 (changed) and 174–179 pass and the manual checks in PROMPTS-20 hold.

Specified in `docs/elevation-mvp/SPEC-18.md` and `SPEC-19.md`, step prompts in `PROMPTS-18.md` and `PROMPTS-19.md`.

- [ ] **[P1][model][plan][elevation] Steps 90–95 — wing walls (walls landing on another wall's face)**
  - Why: Build-order item (3) of the wall configuration entry, pulled ahead of (2). Alcoves, pony walls, notches.
  - Notes: `wall.landings.start|end = { wallId, side, ref, to, offset }`, separate from `connections` so no topology code changes. `resolveLandings` runs first in `syncRoom`. Run anchor `{ to: 'wall', wallId }`. The datum ranking only covers wing walls here (host ends, then earlier wing walls).
  - Done when: SPEC-18 tests 133–159 pass and the manual checks in PROMPTS-18 hold.
- [ ] **[P1][model][elevation] Steps 96–100 — soffits**
  - Why: Build-order item (4). A soffit is a dropped ceiling; the molding under it (crown, top mold or none) is chosen as you draw.
  - Notes: `wall.soffits[]` per side; uppers and talls fully under one cap their box top at `bottom − molding`. Run anchor `{ to: 'soffit', soffitId, offset }` with a filler when cabinets continue under the soffit, otherwise an end panel. Straddling runs warn.
  - Done when: SPEC-19 tests 160–173 pass and the manual checks in PROMPTS-19 hold.

Specified in `docs/elevation-mvp/SPEC-17.md`, step prompts in `PROMPTS-17.md`.

- [ ] **[P1][model][plan][elevation] Steps 82–89 — wall sides, islands, wall end panels**
  - Why: Build-order item (1) of the wall configuration entry in the Idea inbox. Cabinets on either side of any wall; islands as one 0"-thick wall with backs butted; one end panel through both sides of an island.
  - Notes: `run.wallSide` / `joint.wallSide` ('front' | 'back', missing reads as front). `wallSideView` gives a wall-shaped view of one side (filtered runs and joints, openings mirrored, `flipped` toggled), and every function taking a run converts to it on entry. `cornerAt` gains `neighborWallSide`. `elevation.activeWallSide` with a Front/Back toggle. `wall.endPanels` keyed by endpoint, free ends only. Step 82 also fixes the transform test left red by step 76.
  - Deferred: the back side's true extent at connected ends, doors and windows from the back, wall end panels in estimates, island countertops.
  - Done when: SPEC-17 tests 100–132 pass and the manual checks in PROMPTS-17 hold.

Specified in `docs/elevation-mvp/SPEC-15.md`, step prompts in `PROMPTS-15.md`.

- [ ] **[P1][model][elevation] Steps 67–75 — joined runs, live entry, sticky draw tools**
  - Why: A base next to a tall should stay connected when widths change; typed distances on drag like plan walls; draw several runs without re-picking the tool.
  - Notes: wall.joints [{id, x}] with anchors {to:'joint', jointId, offset}; dragging or typing a joint moves every member's edge, clamped to the tightest member; end panels at a joint follow depth coverage. Pushing through rigid runs and moving joined runs are deferred.
  - Done when: SPEC-15 tests 60–88 pass and the manual checks in PROMPTS-15 hold.

Specified in `docs/elevation-mvp/SPEC-8.md`, step prompts in `PROMPTS-8.md`.

- [ ] **[P1][plan][elevation] Step 26 — pan snap-back fix, select-before-move for openings, crown by total height**
  - Why: Panning after a zoom reverts on mouse-up; openings move on an accidental hover-drag; we say "a 6" crown", not an overlap.
  - Done when: Panning is pointer-driven in both canvases, an opening drags only when selected, crownStackHeight replaces crownOverlap with a v2 to v3 migration, SPEC-8 tests 1-5 pass.
- [ ] **[P1][plan][UI] Step 27 — live numeric entry (click, move, type, Enter)**
  - Notes: Shared useLiveEntry hook plus an HTML input over the canvas. Wired first to the perpendicular wall-move handle and to wall drawing with Ortho on.
  - Done when: Both gestures are click-move-click with a typable distance, Esc cancels, the hook is unit-tested.
- [ ] **[P1][plan] Step 28 — wall length propagates orthogonally, corner handles become length arrows**
  - Why: Typing a known wall length should translate the neighbouring wall, not rotate it; free corner drags make angles wonky.
  - Done when: setWallLength(room, wallId, length, growEnd) delegates to moveWallPerpendicular, the panel has per-edit end buttons, connected corners show one length arrow per wall under Ortho, SPEC-8 tests 6-10 pass.
- [ ] **[P2][elevation][UI] Step 29 — edge and center readouts from either wall end**
  - Notes: New model/positions.js; openings gain offsetAnchor; openingGeometry offsets become nested, which changes some SPEC-7 test shapes.
  - Done when: Openings and runs both show a 2x2 edge/center by left/right grid of inputs, typing in a cell makes that cell the stored reference, SPEC-8 tests 11-14 pass.
- [ ] **[P2][model] Step 30 — cabinet center pins**
  - Why: Two wall-mounted faucets on one vanity wall have to land on their exact centers.
  - Notes: Two-pass splitter. One pin: the pinned cabinet keeps its auto width from pass 1 and the neighbours absorb the offset. Two or more: adding the second pin locks both pinned widths, and the interior segment concentrates the odd amount in one cabinet (last auto by default, movable with an absorb flag) instead of splitting it evenly. A filler is never auto-inserted. An unreachable pin grows the run at a free end, or clamps and warns at an anchored one; a short middle segment always clamps.
  - Open: which cabinet should absorb by default is a try-it-and-see question - the absorb flag exists so it can be moved without a code change.
  - Done when: An item can pin its left edge, center or right edge to a wall end or an opening, output is unchanged for runs without pins (SPEC §11 test 7 still [30 5/8, 30 5/8]), SPEC-8 tests 15-25 pass.
- [ ] **[P2][model][elevation] Step 31 — clearance to side objects as a constraint**
  - Why: Closes the "save clearances to side objects" idea below - a run needs 4" clearance from door casing.
  - Notes: run.anchors[side] widens from a boolean to false | true | {to: 'opening', openingId, edge, clearance}; new casingClearance setting; casing-to-cabinetry dimension row with violated segments in amber.
  - Done when: A run can anchor to a casing with a clearance, moving the opening moves the run, unanchored runs warn when closer than the clearance, SPEC-8 tests 26-33 pass.

- [ ] **[P2][plan][UI] Step 32 — deselect on empty space, wall navigation arrows**
  - Why: Clicking empty space in plan doesn't deselect anything; jumping between wall elevations means going back to the plan every time.
  - Notes: selection gains wallId so the visual selection splits from activeWallId, which stays the navigation cursor. Elevation keeps its wall selected on an empty click - you're inside it - which is the one asymmetry; flag it if it reads wrong in use.
  - Done when: Empty-space click clears everything in plan, the elevation toolbar has wrapping wall arrows with [ and ] bound, SPEC-9 tests 1-4 and 16 pass.
- [ ] **[P2][model][UI] Step 33 — signed anchor offsets everywhere**
  - Why: Outside corners can only pin flush; there's no way to hold a run back from a wall end or run it past one.
  - Notes: One rule for all three datum kinds - positive holds the run back on the room side, negative carries it past. resolveHorizontal's arithmetic already does this and parseInches already takes a minus sign, so the work is relaxing four inside-corner gates and labelling it. Outside/straight/open ends get Auto (flush) or a custom signed number in the existing cornerClearance field; an anchored non-inside end gets an end panel, not a filler.
  - Done when: Anchors work at any wall end with a signed offset, a negative opening clearance runs cabinetry under the casing while going past the jamb still warns, SPEC-9 tests 5-15 pass.

## In progress

<!-- Include the branch, task, or owner when useful. -->

## Bugs and cleanup

<!-- Record known defects, technical debt, and maintenance work here. -->

- [ ] **[P1][model][elevation] Pins clamp silently inside a joined run**
  - Why: A middle upper pinned to a door center landed 1" off and the joined runs on either side did not move. Reproduced: wall 0-144 style case, joints at 34 and 84, middle run 34-84 with one auto cabinet pinned center-to-door-center, distance 0 -> pinned center 59, target 60, `pin-unreachable` warning.
  - Notes: Two causes. (1) A single auto cabinet swells in splitRun pass 1 to fill the run, its width is then frozen in `_pinWidths`, and the fillers are already at `fillerMinWidth`, so the cabinet has nowhere to slide and `splitRun` clamps it to `run.x + leftMinimum`. Locking the cabinet width first (30" in the repro) resolves the pin exactly, so the freeze is the blocker. (2) `resolvePinnedSpan` (room.js:353) refuses to grow any end that carries an anchor, and a joint anchor is an anchor; nothing in the pin path calls `moveJoint`, which is only wired to canvas drags and `stretchRun`. Step 30 landed before joints existed and the two have never been reconciled.
  - Notes: The failure is invisible. `pin-unreachable` has no entry in `WARNING_LABELS`, and `WarningsList` only renders under a run selection, so with the cabinet selected nothing is flagged - even though the Pin section shows "Resolved target 60" and "Actual center 59" side by side.
  - Open: Proposed resolution ladder for an unreachable pin, in order: slack in the pinned cabinet's own segment (works today), then the pinned cabinet's own auto width, then free run ends (works today), then move the joints so a pinned run translates and its joined neighbours re-solve through `moveJoint` and its tightest-member clamp, then clamp and warn naming the run that blocked it. Underlying question to settle first: does a pin mean "this cabinet sits here in the run" (what the code does) or "this cabinet sits here on the wall" (what was meant)? If the latter, the pin should probably reuse the Step 33 signed-offset anchor grammar and be allowed to translate the run, not only stretch it.
  - Done when: A pinned cabinet in a run joined on both sides lands on its target or reports why it cannot, the mismatch is visible from the cabinet selection, and the ladder above is covered by tests.

- [ ] **[P1][UI] Split PropertiesPanel.jsx into per-selection sections**
  - Why: At 1,642 lines it is the largest per-round cost in the project. Nearly every step touches it, and an agent re-reads it three or four times per step - roughly 20k tokens each time. This is a bigger lever on usage than any prompt wording.
  - Notes: RunSection, PieceSection, OpeningSection, WallSection, SettingsSection under components/properties/, with the shared Field and InchInput wiring staying put. Pure presentation split - no behavior change, no new state.
  - Done when: No file under components/properties/ exceeds ~400 lines, the whole suite passes untouched, and a step that edits one selection type only has to open one of them.
- [ ] **[P2][docs] Follow docs/elevation-mvp/PROMPT-CONVENTIONS.md for every future PROMPTS-N round**
  - Why: Steps 32 and 33 produced the least code of the last eight steps (235 and 382 insertions vs step 30's 1,050) and cost the most usage - all of it spent reading and looping, not writing.
  - Notes: Name the files per step, paste fan-out greps instead of asking for them, literal test fixtures, shape changes in their own step, scoped test loop, capped summary. One step per fresh session.

## Later / Maybe

<!-- Keep worthwhile ideas here when they are not currently planned. -->

## Done

<!-- Keep completed items for project history. -->
