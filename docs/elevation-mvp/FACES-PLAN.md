# Cabinet faces — plan (rounds 13–16)

This plan comes from the 2026-09-18 brainstorm. Each round gets its own `SPEC-N.md` / `PROMPTS-N.md` when it's ready to run. Only round 13 is written out in detail so far. The later rounds depend on decisions that aren't made yet and on the code round 13 produces.

## Decisions so far

- **Same vocabulary as the estimator.** Face types are `door`, `pair_door`, `drawer_front`, `false_front`, `panel` and `open`. Split directions are `vertical` (stacked top to bottom) and `horizontal` (side by side, left to right). These match `FACE_NAMES` and `SPLIT_DIRECTIONS` in ff-job-schedule.
- **Store sizing rules, not positions.** Each section is **fixed** (a size in inches) or **auto** (`size: null`, sharing what's left equally). If every section in a group is fixed, the last one is treated as auto. A pure resolver turns the tree into true face rectangles. Reveals are settings, never nodes. Later, the export adapter builds the estimator's positioned `face_config` from the resolved result.
- **A split can hold any number of sections.** "Split into N" is the main action. Splitting a section in the same direction as its group adds siblings to that group. A new nested group only appears when the direction changes.
- **Sizes are finished face sizes**, not openings.
- **Default face:** when `item.face` is null, a cabinet shows one door, or a pair door when it's wider than 24". Once edited, the face is stored.
- **Where editing happens:** on the elevation canvas (click a face of the selected cabinet) and in the properties panel (presets, an outline of the sections, type and size, and split, remove and equalize actions). There's no separate editor.
- **European reveals by cabinet type (defaults):**

  | Type | Top | Bottom | Left | Right |
  |---|---:|---:|---:|---:|
  | Base | 1/4 | 1/8 | 1/16 | 1/16 |
  | Upper | 1/8 | −1/8 | 1/16 | 1/16 |
  | Tall | 1/8 | 1/8 | 1/16 | 1/16 |

  The gaps between faces are 1/8" in both directions. "Horizontal" is the gap between stacked faces and "vertical" is the gap between side-by-side faces. Edge values are measured inward from the box edge, and a negative value is an overhang.

## Round 13 — European face layouts (steps 51–59) · `SPEC-13.md`

| Step | What | Kind |
|---|---|---|
| 51 | Face model: `faces.js` (types, default face, reveals, resolver) and new settings | pure + tests |
| 52 | Tree edits: `faceTree.js` (split into N, set count, type, size, remove, make equal) | pure + tests |
| 53 | Presets: `facePresets.js` (European values from the estimator) | pure + tests |
| 54 | Persistence accepts `item.face` and defaults the new settings | shape + tests |
| 55 | Store: `setItemFace`, `facePath` (which face is selected) | shape + tests |
| 56 | Draw face outlines on the elevation | render |
| 57 | Panel: presets, section outline, type and size | UI |
| 58 | Panel: split, count, remove, make equal, apply to same-width cabinets | UI |
| 59 | Canvas: click a face to select it, highlight it, Esc clears it | UI |

## Round 14 — Styles and reveal rules (steps 60–63) · `SPEC-14.md`

Style (European 13 / Inset 14 / Beaded inset 15) is set per room, run or cabinet. Reveals come from the style, then the rules (wood top, upper flush or on the counter, captured single column), then manual per-cabinet overrides, and the panel shows each value's source. Upper-run fillers and end panels drop to the door bottom. Inset faces are drawn at order size (tight to the opening, or 3/16" smaller when profiled), but the frame isn't drawn yet. The code is prewritten as verified patches in `patches-14/`.

## Round 15 — Inset face frame

- **Style** already exists (round 14). Here it also picks the frame drawing and the dimension mode.
- **The frame belongs to the run.**
  - A stile goes over each seam, 1 1/2" wide and 3/4" onto each box.
  - The top and bottom rails run the full length of the run.
  - Rails or mullions between sections are per cabinet: each split line can have a member or not. Drawer stacks default to rails, and a pair door defaults to no mullion.
- **End stile = 3/4" over the box + what's beyond the box side:**
  - free end: 3/4" overhang, so 1 1/2"
  - end panel: 13/16" panel, so 1 9/16"
  - anchored end: the filler width the splitter calculates, so no separate filler
  - flush (later): 0, so 3/4"
- **Box widths are derived.** Only run ends lose width (3/4" at a free end). At interior seams the shared stile covers the joint.
- **Faces sit inside openings** (a section minus its stiles and rails), using inset reveals.
- **Drawing:** the frame outline and the faces only. No box edges or interior parts.
- **Dimensions in opening mode:** end stile | opening | 1 1/2 | opening | … | end stile. Vertical chains work the same way with rails.
- **Settled in round 14 (settings.insetFrame):** stile 3/4" per box, top and bottom rails 1 1/2", mid rails and mullions 1 1/2", upper bottom rail 1 1/2" with 3/4" below the box, beads add to each opening edge. The per-split member toggle comes here: in a shared opening, the gap is 0 (square) or 1/16" (profiled). Hanging bases get a 3/4" bottom rail.
- **Later:** the wider-frame variant with a gap between boxes, flush ends, and a face frame part in reports.

## Round 16+ — Interior, export, geometry

- An interior slot next to the face, defaulting from the faces (drawer boxes behind drawer fronts, shelves behind doors).
- An export adapter from resolved faces to the estimator's `face_config` (re-nesting to two-child groups if the estimator needs that).
- Geometry draws the resolved face rectangles and drops its own split logic in `face_layout.py`.
- Door swing lines, once there's a hinge-side setting on doors.
