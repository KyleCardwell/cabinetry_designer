# Elevation Lab — Codex Prompts, Steps 67–75 (joined runs, live entry, sticky tools)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first (including these docs).

**Order:** 67 → 68 → 69 → 70 → 71 → 72 → 73 → 74 → 75. Step 67 is independent and can run any time.

**Codex can't open the app** (it's behind a login), so don't plan browser checks. Kyle checks the UI steps by hand, using the list after each one.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`. Run `npm test && npm run build && npm run lint` once, at the end. Line numbers are as of `4dd7680`.

---
## Step 67 — Draw and opening tools stay active; Escape exits

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-15.md §8 "Sticky tools".
If `git status` shows uncommitted changes, stop and tell me.

Touch only src/elevation/components/ElevationCanvas.jsx (923 lines). Three edits:
1. handleMouseUp (~544–576): after a successful addRun, delete `dispatch(setTool('select'))`. Keep setSelection on the new run.
2. handleStageClick, door/window branch (~604–636): after addOpening, delete `dispatch(setTool('select'))`. Keep the selection.
3. The keydown handler's Escape branch (~375–381): if `tool !== 'select'`, cancel any drag (`if (dragRef.current) cancelDrag()`), clear alignment guides, `dispatch(setTool('select'))`, `dispatch(setSelection({}))`, and return. Otherwise keep the existing order. Add `tool` to that effect's dependency list.
Don't touch PlanCanvas.jsx; it already behaves this way.
No new tests. Run `npm test && npm run build && npm run lint`: 348 passing.

At most five lines of summary. Commit "elevation-mvp: step 67 sticky draw tools, Escape exits".
```

**Check after 67:** draw three runs in a row without going back to the toolbar. Escape returns to Select. Placing a door leaves the door tool active.

---
## Step 68 — Joint shape (no behavior change)

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-15.md §1, §10 tests 60–62.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/store/persistence.js (572)
- src/elevation/model/room.js (719): cloneRoom/cloneRun only
- new src/elevation/model/joints.js
- src/elevation/model/index.js (163): exports
- tests: store/__tests__/persistence.test.js (483), new model/__tests__/joints.test.js

persistence.js:
- isRunAnchor (line 167): also accept `{ to:'joint', jointId: string, offset: null | finite }`.
- isEnd (109): allow an optional boolean `auto`.
- isWall (217): `joints` is undefined or an array of `{ id: string, x: finite }`.
- normalizeV3Document (~290–320): default `wall.joints` to `[]`, and turn any joint anchor whose jointId isn't in that wall's joints into `false`.
room.js: cloneRoom copies `joints: (wall.joints ?? []).map((j) => ({ ...j }))`; cloneRun copies joint anchor objects (`{ ...anchor }`).
joints.js (pure; no imports from room.js):
- `jointMembers(wall, jointId)` → [{ runId, side, offset }] in wall.runs order
- `jointEdgeX(joint, side, offset)` → right side: joint.x − (offset ?? 0); left side: joint.x + (offset ?? 0)
- `isJointAnchor(anchor)`
- `pruneJoints(wall)` → a new wall. Drop joints with < 2 members, set the lone member's anchor to false, and drop anchors pointing at missing joints.
Don't call pruneJoints from syncRoom yet (step 69).

Write joints.test.js with makeRun/makeRoom copied verbatim from model/__tests__/stretchRun.test.js lines 5–48, plus the TBT fixture exactly as SPEC-15 §10 gives it.
No other call site changes in this step: every `run.anchors` read stays as it is.
Expect 351 passing.

At most five lines of summary. Commit "elevation-mvp: step 68 joint shape".
```

---
## Step 69 — Resolve and move joints

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-15.md §2, §3, §10 tests 63–72.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- model/room.js (719)
- model/splitRun.js (504): add runWidthRange next to layoutInputs (line 22) and reuse layoutInputs
- model/joints.js
- model/index.js
- test: model/__tests__/joints.test.js

`run.anchors` sites in room.js. Handle these:
- 72–91 compensateRuns: also shift every wall.joints x by `− shift`, the same as unanchored runs.
- 139–150 resolveRunAnchorDatum: add a joint case returning `{ x: jointEdgeX(...), type:'joint', jointId }`, or `{ error:{ code:'anchor-joint-missing', side } }` when the joint is missing.
- 153 describeAnchor: add the joint text (SPEC §2). Leave the "Joined to <label>" part as "Joined to <Type>" for now; step 72 adds runShortLabel.
- 366 syncRoom: first line after cloneRoom, map walls through pruneJoints.
- 537–615 stretchRun: at the top, if isJointAnchor(sourceRun.anchors[side]), return moveJoint(...) for that joint with newEdgeX converted back through the offset. Don't let the `anchors: {..., [side]: anchorsAtSnap}` line touch a joint side.
- 632 moveRun: unchanged (still refuses anchored runs).
- 686–712 flipRunsForWall: also map joints to `x: length − x`.
Leave alone: 87 (it already skips left-anchored runs, which is right for joints once joints shift), 100/113 (`=== true` corner checks), 184, 206/211, 278/297 (pins: a joint side counts as anchored, which is intended).
Outside room.js nothing changes. corners.js resolveHorizontal already handles two datums; don't edit it.

New:
- splitRun.js `runWidthRange(run, settings, opts)` per SPEC §3.
- room.js `moveJoint(room, wallId, jointId, x, settings)` per SPEC §3: range from every member, clamp, resolve with syncRoom, validateRunPlacement each member, and return { ok, reason, room, x, range, limit }.
Expect 361 passing.

At most five lines of summary. Commit "elevation-mvp: step 69 resolve and move joints".
```

---
## Step 70 — Joining, and joint reducers

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-15.md §3 (resizeRun), §4, §10 tests 73–81.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- model/room.js
- model/joints.js
- model/index.js
- store/elevationSlice.js (1052)
- tests: model/__tests__/joints.test.js, store/__tests__/elevationSlice.test.js (1220; append a new describe at the end, and don't read the whole file)

room.js:
- `joinEdges`, `joinTouchingEdges`, `dissolveJoint`, `resizeRun` per SPEC §3–§4. New joints get id `uuid()` (already imported in the slice; import `v4` from 'uuid' in room.js). Joined sides get `ends[side].auto = true`.
- stretchRun candidates (~546–558): for run edges, add `{ runId, side }` to the candidate. After snapping, if the snapped candidate is a butting run edge (opposite side, vertical overlap using verticalStart from overlap.js), the snap wasn't clamped (`anchorsAtSnap`-style equality check), and the result is valid, call joinEdges and return `{ ok, reason:null, room, joined:{ runId, side } }`.
elevationSlice.js (new reducers next to setRunAnchor at line 708; each ends with syncRoomAt):
- `joinRunEdges({ wallId, runId, side, targetRunId, targetSide })` → joinEdges. On !ok set state.message = reason and leave the room.
- `setRunJointOffset({ wallId, runId, side, offset })`
- `dissolveJoint({ wallId, jointId })`
- `resizeRun({ wallId, runId, width, grow })` → room.js resizeRun
- `replaceWallLayout({ wallId, runs, joints })`
Leave setRunAnchor alone: setting false/true/opening on a joint side already leaves the joint, and syncRoom prunes it (that's test 79).
Expect 370 passing.

At most five lines of summary. Commit "elevation-mvp: step 70 join run edges".
```

---
## Step 71 — End panels by depth coverage

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-15.md §5, §10 tests 82–86.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- model/joints.js: `jointEndTypes(wall)`
- model/room.js: syncRoom only (~366–440)
- store/elevationSlice.js: setRunEnd only (line 670)
- tests: model/__tests__/joints.test.js, store/__tests__/elevationSlice.test.js (append)

syncRoom: between the horizontal pass and the syncAutoItems pass, for every joined side with `ends[side].auto === true`, set `ends[side] = { type, width:null, auto:true }` from jointEndTypes. Use resolved x/width for the touch test.
setRunEnd: write `{ type, width }` only. It already does, so just confirm `auto` isn't carried over, and add test 86.
Don't touch runDefaults.js (createRun's own end choice) or RunGroup.jsx.
Expect 375 passing.

At most five lines of summary. Commit "elevation-mvp: step 71 joint end panels by depth".
```

**Check after 71** (in the app, using SampleRuns or by hand): tall 12 deep, base 24, upper 15, all joined. Each shows an end panel at the joint. Set the tall to 25 deep, and only the tall keeps its panel.

---
## Step 72 — Properties: run-edge anchors, offset, joint-aware width

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-15.md §6.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- components/PropertiesPanel.jsx (1675): only lines ~540–625 (the width block) and ~694–830 (Corners & anchors). Don't read the rest of the file.
- model/joints.js: runShortLabel
- model/room.js: describeAnchor uses runShortLabel

Width block:
- bothAnchored becomes: both sides truthy AND neither isJointAnchor.
- runGrowLocked locks a side only when it's anchored and not a joint.
- preferredRunGrow: grow away from a non-joint anchor, otherwise right.
- The StretchInput onCommit dispatches `resizeRun({ ...actionBase, width, grow: runGrow })` when either side is a joint, otherwise the existing validateAndDispatch path.
Anchor block:
- Add `<optgroup label="Run edges">` after the opening options. Options are `joint:<runId>:<side>` for both sides of every other run on `wall.runs`, labeled `${runShortLabel(r)} · ${side} edge`.
- anchorValue for a joint side is the first other member (jointMembers) as `joint:<runId>:<side>`.
- The onChange for a `joint:` value dispatches joinRunEdges.
- When the anchor is a joint, render an Offset InchInput (allowBlank, placeholder 0) dispatching setRunJointOffset, the "Positive holds the run back; negative carries it past." hint, and the describeAnchor text, the same way the opening block does (~753–796).
- Hide the corner clearance block for joint sides.
Test the model helper only: add one test to joints.test.js for runShortLabel(T1 of TBT) === 'Tall 0"–24"'. Match formatInches output exactly.

At most five lines of summary. Commit "elevation-mvp: step 72 run-edge anchors in properties".
```

**Check after 72:** pick "Tall … · right edge" in a base's Anchor left, and the base meets the tall. Type 1/2 in Offset, and a 1/2" gap opens. Type the base width with ‹, and the tall resizes with it.

---
## Step 73 — Canvas: joint handle, link icon, snap-join, draw-join

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-15.md §7.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- components/ElevationCanvas.jsx (923)
- components/RunGroup.jsx (407): only renderAnchor (~141) and renderStretchHandle (~191)
- new components/JointMarkers.jsx

RunGroup: renderAnchor and renderStretchHandle return null for a side where isJointAnchor(run.anchors[side]).
JointMarkers.jsx props: { wall, transform, selectedRunId, onJointDragStart, onJointDragMove, onJointDragEnd, onDissolve, hoveredJointId, setHoveredJointId }.
- For every joint, draw the link glyph "⛓" (fontSize 12, fill #67e8f9) centered at joint.x and the members' mid height. Clicking it calls onDissolve(joint.id). Hovering it outlines the members, and the tooltip reads "Joined edge — click to disconnect".
- When selectedRunId is a member, draw a draggable handle styled like RunGroup's stretch Rect, spanning the members' min bottom to max top.
ElevationCanvas:
- stretchPreview becomes { room, wall, runIds }. startStretch/previewStretch/startRunMove set runIds (one id for a plain stretch). The preview layer (~893–906) maps runIds to RunGroup.
- Joint drag: preview with moveJoint, and runIds = the members. On release, moveJoint → dispatch replaceWallLayout. If limit is set, showMessage "<Type> can't go below <min>" for min-width or "<Type> is fixed at <w> (all cabinets fixed)" for fixed-width.
- finishStretch: if result.joined, dispatch replaceWallLayout with the resolved wall. Otherwise keep replaceRun.
- handleMouseUp (draw): after tryPlaceRun ok, run joinTouchingEdges on placement.room. If anything was joined, dispatch replaceWallLayout for that wall instead of addRun.
- The moveRun 'anchored' message (~700) becomes "Joined — drag the joint, or set Anchor to Free" when either side is a joint.
- Render <JointMarkers> in the select layer (~803) after the run groups.
No new tests (UI). 376 passing.

At most five lines of summary. Commit "elevation-mvp: step 73 joint handles on canvas".
```

**Check after 73:**

1. Draw a tall, then a base starting at its edge. The link icon appears.
2. Drag the joint. Both runs change, and a tall on the base's far side doesn't move.
3. Click the link icon. The runs separate but stay where they are.
4. Stretch a base's free edge to within 2" of a tall. It snaps and joins.

---
## Step 74 — Live entry in elevation

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-15.md §8 "Live entry" (not Tab).
If `git status` shows uncommitted changes, stop and tell me.

Files:
- components/ElevationCanvas.jsx
- components/JointMarkers.jsx
- components/RunGroup.jsx: the stretch handle callbacks only
- components/LiveEntryInput.jsx (90): only if a label needs `run-move` sign formatting like `wall-perpendicular`

Reference, read-only: plan/PlanCanvas.jsx lines 144–170 (hook setup), 735–770 (beginWallLength), 1083–1093 (render). Don't edit PlanCanvas.

- Wire useLiveEntry into ElevationCanvas the same way. Begin an entry on stretch/joint drag start, run move start and draw start, with the kinds, labels, values and min/max from the SPEC §8 table.
- Drag moves call update(value).
- On release: if entry.typed === null, commit. Otherwise keep the entry open and let Enter commit.
- Press + release with < 3px of movement keeps the entry open. Pointer moves keep updating it, and a stage click commits.
- While typed, preview with the typed value through the same preview functions.
- Escape: step 67's rule 1 (cancel the entry) comes first.
No new tests (the hook is already tested). 376 passing.

At most five lines of summary. Commit "elevation-mvp: step 74 live entry in elevation".
```

**Check after 74:** drag a base's edge and type 30, Enter. The base is 30" and a joined tall absorbs the change. Press a joint handle without moving, type 18, Enter. Draw a run and type 36.

---
## Step 75 — Tab cycles live-entry modes

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-15.md §8 "Tab cycling", §10 tests 87–88.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- canvas/useLiveEntry.js (107)
- components/LiveEntryInput.jsx (90): Tab calls onCycle and preventDefault; show "Tab ⇥ next" when there's more than one mode
- components/ElevationCanvas.jsx: only the run-edge begin() call
- test: canvas/__tests__/useLiveEntry.test.js (68)

- `begin(config)` accepts optional `modes`. Without modes, behavior is unchanged, so plan view is untouched.
- `cycle()` advances the mode, resets `typed` to null, and sets value/min/max/label from the mode.
- `commit` calls `onCommit(value, modeKey)`.
- In ElevationCanvas, the run-edge entry passes these modes: grabbed run width, each other member's width, the edge from the left wall end, and the edge from the right wall end. onCommit converts the active mode's value to the joint (or edge) x.
Expect 378 passing.

At most five lines of summary. Commit "elevation-mvp: step 75 Tab cycles live entry".
```

**Check after 75:** drag the tall | base joint and press Tab. The label steps through Tall width, Base width, Upper width, From left and From right, and typing in any of them lands the same joint.
