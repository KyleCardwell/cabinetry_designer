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

## Planned

<!-- Move sufficiently defined work here. -->

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

## Later / Maybe

<!-- Keep worthwhile ideas here when they are not currently planned. -->

## Done

<!-- Keep completed items for project history. -->
