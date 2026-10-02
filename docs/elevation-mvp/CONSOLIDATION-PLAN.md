# Consolidation: plan (round 39, after 38.2)

Written 2026-10-01 against `3ed8712` (step 269), before round 38 was implemented. Step labels (C1, C2…) are provisional. Real step numbers, line numbers and fan-outs get filled in when `SPEC-39` / `PROMPTS-39` are written against whatever commit 38.2 ends on (PROMPT-CONVENTIONS rules 1–3 need a real commit).

## Why

The designer should cover most places cabinets go (kitchens, alcoves, recesses, islands, and later stairs, theater steps, wrapped columns, beams, and cabinetry over wall cutouts) without every new situation turning into its own special code. Today the risk isn't how many situations there are. It's how they get added:

- **Four files take most of the cost of every round:** `ElevationCanvas.jsx` 1,872 lines, `elevationSlice.js` 1,799, `room.js` 1,739 and `PlanCanvas.jsx` 1,268, plus `elevationSlice.test.js` at 2,553. Source is 29k lines and tests are 17.6k. PROMPT-CONVENTIONS already names file size × re-reads as what makes Codex expensive.
- **Parts come from about ten generators** (`splitRun`, `cells`, `tees`, `frames`, `wallEndPanels`, `bottoms`, `extensions`, `planPieces`, moldings, casing), each with its own output shape. `partNumbers.js` already gathers some of them (`runParts`, `orderedParts`), but plan, reports, the estimator and the AI layer each have to know every shape.
- **Things on a wall face** (openings, soffits, landings, and now recesses) each place themselves and report their spans in their own way.
- **The project docs** are 121 files and 39% of project knowledge, and most of them are finished rounds that already live in git.

What's already in good shape: shop numbers live in `DEFAULT_SETTINGS`, not scattered through the model. Only `constants.js` has more than a couple of hard-coded fractions. Rules are in `shop-rules.yaml`. The cell model and the test suite are solid.

**Correction to the first pass of this idea:** fillers, T-fillers, end panels and stiles should **not** be merged into one internal type. Each one's generator encodes real shop rules, and rewriting them would be high-risk for little gain. The unification belongs at the **output**: one parts list that every consumer reads.

## The rule going forward

Before adding a new situation, ask which of three layers it belongs to, and add it there as data or a configuration, not as a new special case:

1. **The space:** wall faces and what's on them (openings, soffits, recesses/projections, landings). New hosts should be described as faces with features.
2. **The parts:** runs → cells → boxes, faces, panels, and the derived parts (fillers, Ts, frames, end panels, bottom parts, moldings). Everything a shop builds ends up in **one parts list**.
3. **The rules:** numbers in settings (per shop later), checks in `shop-rules.yaml`, judgment calls left to the AI layer.

Anything that doesn't fit cleanly yet goes in as a **freeform part** (round 39.1) with notes, not as a new feature.

---

## Part A — Docs (Claude, can run any time; doesn't touch code)

**A1. Commit what's uncommitted.** Kyle commits `SPEC-38.md`, `PROMPTS-38.md`, and the `ALCOVE-PLAN.md` / `CELLS-PLAN.md` edits, so git has a copy of every project doc before anything is pruned. Three project docs aren't in the repo at all (`cabinetry-designer-review-2026-09-16.md`, `memory-check-2026-09-21.md`, `estimate-integration-notes.md`). Claude copies them into `docs/archive/` (the estimate notes into `docs/platform/`) first.

**A2. `docs/DECISIONS.md`: one place for what's been decided.** Claude writes it from the `§1 Decisions` sections of every SPEC, the plan docs' Decisions sections, `TODO.md`'s decided items and Kyle's answers. Organized by subject, not by round. Each line is the decision plus where it came from (`SPEC-37.1`), so the full reasoning stays findable in git. Sections:

- Room, walls and faces (two faces, islands, landings / wing walls, wall end panels)
- Openings, casing and measuring
- Soffits; recesses and projections
- Runs: drawing, auto-split, anchors, follow / joins, stacked runs (one-way links), outset
- Cells: grid, kinds, blind per cell, depth and align
- Cabinet types (a preset of reveals and depths), styles, reveals and deviations
- Faces: trees, splitting, hinges, presets
- Face frames: regions, stiles, beads, openings dimensions, plan miters
- Fillers, end panels, T-fillers, L end panels, extensions, chip detail
- Below-run parts, tops, moldings, crown
- Blind corners
- Dimensions, plan view, part numbers
- Platform: phases, Supabase, estimator separation, RPCs, AI layer
- **Superseded:** decisions later reversed, with what replaced them (e.g. vertical joins → one-way stacked links), so nobody re-proposes them

`FACES-PLAN.md` (rounds 13–16, all shipped) is folded into it.

**A3. Prune the project.** Once A1 and A2 are done, the project keeps only:

| Keep | Why |
|---|---|
| `DECISIONS.md` (new), `CONSOLIDATION-PLAN.md` | the current picture and what's next |
| `PROMPT-CONVENTIONS.md` | applies to every round |
| `CELLS-PLAN.md`, `ALCOVE-PLAN.md` | active plans |
| `PLATFORM-PLAN.md`, `AI-LAYER-PLAN.md`, `estimate-integration-notes.md` | not started; still the plan |
| `rules/README.md`, `rules/shop-rules.yaml` | the rules |
| the current round's `SPEC-N` / `PROMPTS-N` | what Codex is running now |

Deleted from the project (all of it kept in `cabinetry_designer/docs/` in git): `SPEC.md`/`PROMPTS.md` through `SPEC-37.4`/`PROMPTS-37.4` (~100 docs), `FACES-PLAN.md` after folding, `memory-check-2026-09-21.md`, and `cabinetry-designer-review-2026-09-16.md` (reviews the old drag-and-drop designer).

Expected: roughly 39% → about 16% now, and about 10% once round 38's spec and prompts (130 KB together) are finished and dropped.

**A4. Standing habit.** When a round is finished and committed, its SPEC/PROMPTS come out of the project and any lasting decisions get a line in `DECISIONS.md`. Chat sessions don't count toward project knowledge, so deleting them changes nothing.

---

## Part B — Round 39: consolidation (Codex, after 38.2)

**When:** after 38.2, once Kyle has decided about merging `elevation-grid-run-split`. The round runs on whichever branch survives. Doing it before 38 would invalidate SPEC-38's line numbers.

**What it promises:** **no behavior changes.** Every step leaves the suite green with the same test count or more, and the C1 snapshots unchanged. A step that needs a snapshot change is a bug in the step.

**Renumbering:** combine and full grids moves from 39 to **40**, and panel construction and nosing from 40 to **41**. CELLS-PLAN and ALCOVE-PLAN get updated to match.

| Step | What | Size guard |
|---|---|---|
| **C1** | **Golden rooms.** 6 sample rooms saved as JSON fixtures under `src/elevation/model/__tests__/fixtures/`: Euro kitchen with blind corner and island; face frame kitchen with beaded frame; alcove with side panels and soffit; T-filler run with L end panels; a recess room (38) with a recessed medicine cabinet (38.2); a stacked-run room with light rail. One test snapshots each room's derived output (layouts, part numbers, plan pieces, dimension rows). This is what proves every later step changed nothing. | new files only |
| **C2** | **Split `elevationSlice.js`** into domain reducer modules under `store/slices/` (walls, openings, soffits, recesses, runs, cells, faces, selection, settings). `elevationSlice.js` stays as the combiner with the same exported actions, so no import outside `store/` changes. | ~1,800 lines; likely two steps (walls/openings/soffits/recesses, then runs/cells/faces) |
| **C3** | **Split `elevationSlice.test.js`** (2,553 lines) to match C2, one test file per slice. Test count unchanged. | tests only |
| **C4** | **Split `room.js`**: `syncRoom` stays as the orchestrator, and anchors/follow, corner and end resolution, and conflicts and diagnostics move into their own modules. `room.js` keeps re-exporting what it exports today. | ~1,740 lines |
| **C5** | **Split `ElevationCanvas.jsx`** into one layer component per thing drawn (runs, openings, soffits, recesses, dimensions, overlays) plus a `useElevationPointer` hook for drawing, dragging and stretching. | ~1,870 lines; likely two steps |
| **C6** | **Split `PlanCanvas.jsx`** the same way. | ~1,270 lines |
| **C7** | **Face features.** One `faceFeatures(room, wall, side, settings)` that returns everything placed on a face (openings, soffits, recesses/projections, landings) as `{ kind, id, x, width, bottom, top, depth }`, plus one shared placement helper for the `offsetFrom` / `offsetAnchor` / `offset` math that openings, soffits and recesses each do now. `wallFaceSegments`, the dimension rows and the conflict checks read it. This is where future hosts (a stepped floor, a column face, a cutout filled with cabinetry) plug in. | check duplication with the fan-out commands first; skip the placement half if it's thin |
| **C8** | **One parts list.** New `model/parts.js`: `roomParts(room, settings)` returns every part the shop makes or orders, as one record type: `{ key, kind, role, wallId, side, runId, cellId, x, z, width, height, planFrom, planTo, thickness, orientation, hidden, notes, source }`. `kind` covers cabinet, filler, tee, end_panel, wall_end_panel, panel, shelf, frame, bottom part, molding and casing. `planFrom`/`planTo` give its depth from the wall face. It's built by promoting `runParts` / `orderedParts` out of `partNumbers.js`. Each generator keeps its own shape internally; `parts.js` translates. | shape-only step; nothing reads it yet |
| **C9** | **Part numbers read the parts list.** `partNumbers()` numbers `roomParts()` and C1's snapshots are unchanged. After this, reports, the estimator and the AI layer have a single input. | small |
| **C10** | **Housekeeping.** Update PROMPT-CONVENTIONS' file-size table, delete dead exports the splits exposed (list them; don't delete without checking tests), and move finished TODO items to Done. | small |

Rough size: 10–13 Codex sessions, almost all of them mechanical moves with a snapshot gate, so cheap per step. Everything after this round should cost less per step, because no step needs a 1,800-line file read four times.

---

## Part C — What 39 sets up (new features, after 39)

### 39.1 Freeform parts

A part drawn as a rectangle on any wall face, positioned from the face by `planFrom`/`planTo` (so it can sit behind doors, inside a wall cutout, or proud of the face), with a thickness, a material/label, notes and a `hidden` flag (drawn dashed when it's behind doors). It gets a part number, shows in plan at its depth, and appears in the parts list like any other part. It has no automatic rules: it doesn't push runs, resize anything or anchor. The AI layer reviews it from its notes. This is the escape hatch for raked stair paneling, odd one-offs, and anything below until it earns real rules.

### Cabinetry over a wall cutout ("false door")

What happens: a door-sized cutout through the wall, cabinetry on the front face covering it, jamb panels (sides and top) from the back face of the wall to the front of the cabinets so it reads as one piece, edge panels or casing on the back face, cabinet doors on the front, and sometimes panels and fillers inside behind those doors that need dimensions and part numbers.

How it maps, almost all onto existing pieces:

| Piece of it | Built from |
|---|---|
| The cutout | An existing **opening** (doors already go through the wall) with a new treatment, `fill: 'cabinetry'`: no door, no swing in plan, and runs are allowed to cover it (`runBlocksOpening` skips it). |
| Jamb panels, sides and top | Derived **lining parts** of that opening, from the back face to the front of the run over it. These are the same kind of part as 38.2's recess casing and lining, just deeper. |
| Back-face edge panels or casing | The opening's casing setting, extended to the back face (openings only dimension and case on the front face today), with "by shop / by others" from 38.2 (a part only when it's ours). |
| Doors on the front | A normal run of cabinet cells, plus one new cell option: **faces without a box** (doors hung on the lining). This is the only new cell concept. |
| Panels and fillers inside | **Freeform parts** (39.1) with `hidden: true`, placed by depth. Dimensioned in plan, and in elevation with a "show hidden parts" toggle. |
| Catching what wasn't thought through | **AI layer**: doors with nothing to hinge on, hidden parts with no dimensions, lining that doesn't meet the cabinet front. |

Nothing about this needs to be AI-designed. It's geometry plus one new cell option, and AI only checks it. Cross sections (already in TODO) would be the nicest way to dimension the inside later, but freeform parts in plan and a hidden-parts toggle are enough to build from.

### Scope: where future situations land

| Situation | Where it fits | When |
|---|---|---|
| Wrapped columns | A free-standing wall to the ceiling (like an island) with panel runs on its faces. Mostly works today; test it with a golden room. | try after 39 |
| Theater / long steps | A floor-step face feature (C7) that raises the floor datum over a span, with runs on that span sitting on it. | its own round, when a job needs it |
| Cabinetry over a wall cutout | Above. | after 39.1 |
| Stair paneling (raked) | Freeform parts with notes. Real raked geometry only if it comes up often. | 39.1 |
| Ceiling beams | Needs a ceiling view, which is a new view type. Freeform parts on the wall elevations until then. | later |
| 45° / lazy-susan corners | Already in TODO as a corner-unit entity shared by two walls. | later |

## Open

- Branch decision after 38.2 decides which code C1–C10 run on.
- Whether C7's placement half is worth it depends on how much 38's `recesses.js` duplicates `openings.js`. Measure it when writing SPEC-39.
- Freeform part UI: draw on the elevation only, or also in plan? Assumed elevation first, with depth typed in.
