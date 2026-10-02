# Alcoves, panels and recesses: plan

This plan comes from the 2026-09-26 brainstorm about two bathroom situations: an alcove paneled on its sides, top and back above the base cabinets, and a medicine cabinet set into the wall through one of those side panels. It builds on `CELLS-PLAN.md` (cells, `panel` cells, stacked runs) and SPEC-34.3 (follow anchors). Each round gets its own `SPEC-N.md` / `PROMPTS-N.md` when it's ready to run.

**Now:** round 38 (recesses and projections, SPEC-38, steps 270–279), moved up by Kyle on 2026-10-01, then 38.1 (fixes, SPEC-38.1, steps 280–283) and 38.2 (recessed cabinets and cutouts). Panel construction and nosing come after.

## The two situations

1. **The paneled alcove.** The alcove has walls on both sides and a soffit above. Side panels run from the top panel to the floor. The top panel usually runs over the side panels, but sometimes between them. The back panel runs from the top panel down to the counter. Base cabinets fill the space between the side panels, and the countertop dies into them. The side panels are usually deeper than both the cabinets and the countertop.
2. **The medicine cabinet through the side panel.** A hole is cut in the side panel. On a 5-piece panel the center panel is left out inside the stiles and rails instead. A cabinet recessed into the wall sits in that opening, flush and inset. The wall cutout is measured on site and is usually oversized, so the cabinet is sized to the panel's opening, not to the hole in the wall. In rare cases the stiles and rails sit tight to the cabinet's opening and act as its face frame.

## Decisions

### Extensions (round 35.3)

- **Any filler or panel can extend along its long direction, past its run's edge.** That covers run end panels, end fillers, interior fillers and side panel cells extending up or down, and top/bottom panel cells extending left or right. Back panels don't extend (yet).
- **Where to:**

  | Direction | Targets |
  |---|---|
  | down | the floor, another run's box bottom, or by a distance |
  | up | the ceiling (the lowest soffit over the piece, else the wall height), another run's box top, or by a distance |
  | left / right | the wall end, another run's far edge, or by a distance |

- **Only from the run's edge.** A cell in the middle of a run can't extend down through the cells below it. Inside a run that's what spans are for (round 38): a filler covering two stacked boxes in the same run is one cell spanning both rows.
- **An extended piece is still one part**, just longer. An extension never shrinks a piece. Extending down replaces the drop to the doors, and an end piece that extends down has no chip detail and no "return up" note.
- **Runs stop at extensions through follow anchors.** When a run follows another run's edge from the inside (the base's left edge follows the panel run's left edge), and that edge's end piece is extended over the follower, the follower stops at the piece's inside face. If the piece covers the follower's whole box height, the follower needs no end of its own. No new anchor type is needed.
- **Stored** as `extend` on a run end (`run.ends.left.extend`) and on panel and filler leaves (`leaf.extend`), e.g. `{ down: { to: 'floor' } }`. Targets: `{ to: 'floor' | 'ceiling' | 'wall' }`, `{ to: 'run', runId }`, `{ to: 'by', amount }`. No schema bump; it's optional.
- **The paneled alcove on one wall:** a base run with a countertop, plus a panel run that sits on the countertop and is held under the soffit (round 35 links). The panel run has end panels at both ends extended down to the floor, a back `panel` cell (3/4" deep, backs aligned), and a top panel. The base follows the panel run's left and right edges, so it fits between the side panels, and the countertop follows it.

### Panel runs and nosing (after 38.2; the panel-only depth fix moved into round 38)

This is the other way to draw the alcove (Kyle's option 3), and the better one when a medicine cabinet goes through a side panel. **Each side panel is a panel run on its own return wall**, drawn face-on in that wall's elevation, with its width typed when it's drawn (no anchor to the base). The corner logic (`cornerReserveParts`) already makes the back wall's base run stop at a neighbouring run on the return wall that's anchored into the corner and overlaps it in height. So the base stops at the panel's face and the countertop dies into it.

- **Panel-only runs reserve only their thickness.** Today `frontDepth()` always adds bumper and door thickness. A run that's only a panel shouldn't.
- **Thickness comes from how the panel is built.** Slab: 3/4". Built like a door so the stile/rail details match: 13/16". Typing a thicker depth adds nosing.
- **Nosing is mitered.** Its width equals the panel's total thickness, and its thickness is the stock (3/4" or 13/16"). The panel core stays full width and height, because it's mitered into the nosing and has to cover the returns' thickness too.
  - Nosed edges default to the exposed ones and can be changed per edge.
  - Each nosed edge is its own part: W = panel thickness, T = stock, L = edge length, noted "mitered".
  - Where two nosed edges meet, the strips miter to each other.

### Recesses and projections (round 38, revised 2026-10-01)

Kyle's point: from the room's side the walls are 4 1/2" thick, but the shop builds recesses of any depth (a 24" cabinet recess each side of a fireplace), and **it's all one elevation**. Sometimes the door is in the recess back with cabinets on the face either side; sometimes the cabinets are in the recess and the door is on the face. The alcove work (extensions, panel runs on return walls) still stands, but it drew those as separate walls; a recess keeps them on one wall.

- **A recess is a section of a wall face pushed back by a depth; a projection is the same, built out** (a fireplace breast, a chase). Width, position (like a window: from either end, edge or center), bottom (0 = floor, or raised like a medicine cabinet's), height or up to the ceiling, depth (any, deeper than the wall too).
- **Everything on the wall sits on the face or on one recess** (`run.recessId`, `opening.recessId`). `outset` stays measured from the run's own plane; plan depths are measured from the face, so a run deep in a recess has a negative front.
- **Square corners at recesses:** inside a recess (or beside a projection) its side stops runs like a wall, with a filler; beside a recess (or on a projection) the run ends at an outside corner with an end panel. A box that stands out past the corner's wall (a 24" base in a 12" recess) gets an end panel.
- **The top acts like a soffit** for the runs on a recess when it's below the ceiling.
- **A run on the face can cross a recess** (a base across it with uppers inside); runs on different planes only conflict where their plan depths overlap.
- **Plan:** a floor recess is a notch; one as deep as the wall bumps the wall out behind it; a raised one is dashed; a projection is solid wall in front of the face. Doors in a recess are drawn at its back.
- **Draw real walls instead** when the niche's side faces need cabinets of their own (their own elevations).

### Recessed cabinets and panel cutouts (round 38.2)

- **How a cabinet in a recess finishes** (Kyle, 2026-10-01): the face frame laps past the recess edge on all sides (1/4" to 3/4", depending on the cabinets between); on Euro runs an end panel flush with the cabinet face, as deep as the cabinet to the wall face, which can also sit in that overlap (more for a wider panel); a base deeper than the recess with end panels at its sides; casing around the recess on 3 or 4 sides, by the shop or the finish carpenter (drawn, a part only when it's ours).
- **Runs may overlap in the elevation when their plan footprints don't touch.** A recessed cabinet sits behind the wall face, and the panel run sits on it.
- **A recessed run that passes through a panel cuts it automatically.** The cabinet is flush with the panel face, so it passes through the panel's thickness.
- **Cutout types:** *cut hole* (a slab panel), *5-piece center removed*, and *frame acts as face frame* (rare: the stiles and rails sit tight to the cabinet opening and the door is inset in the panel frame, using the inset face frame reveal math from round 36).
- **The hole is the box plus a clearance each side:** 0 when the box fits in the hole, −3/4" when the box interior is flush with the hole and the panel covers the box edges. **Doors are inset and flush, 1/16" all four sides for now.**
- **The cabinet is sized to the panel's opening**, which fits anywhere inside the (oversized) wall recess. Until stiles and rails are designed, the opening size is typed with the cutout type.

### T-fillers (round 37 addition)

- **A T-filler runs the full length of a continuous seam.** Two stacked boxes on each side of one vertical seam get one T. It breaks only where something crosses the seam: a rail, a top, or a split that doesn't line up. Stacked boxes in separate runs use an extension.

### Deferred

- **Stiles and rails:** one standard set at room level, inherited by runs and cabinets, with overrides down to each face. Panels inherit the same set. The 5-piece cutout opening will come from it.
- **Glass and mirror** on doors and panels.

## Rounds

| Round | What | Delivers |
|---|---|---|
| **35.3 — Extensions** | `extend` on run ends and panel/filler leaves; pieces grow on screen; warnings; follow anchors stop at extended end pieces; reducers and panel fields. Steps 206–211. | the paneled alcove on one wall; the desk run with side panels to the floor; one filler over a stacked base and upper |
| 35.4 — Extension follow-ups | A run that overlaps another run's extended piece gets a collision warning; flipping a run swaps left/right extensions on its cells; extended pieces show in neighbouring walls' profiles; an automatic end keeps its extension. | fewer surprises |
| **38 — Recesses and projections** | Recesses and projections on a wall face; runs and openings on a recess; recess anchors and corners; the top as a soffit; conflicts by plan depth; warnings; wall rows; plan notch, bump-out and projection; panel-only runs reserve only their thickness. SPEC-38, steps 270–279. | fireplace recesses, doors at a recess back, niches |
| 38.1 — Fixes | Select a recess from its wall-row segment; Add menu; plan rows clear bump-outs; soffit returns on side walls; edge pin callouts. SPEC-38.1, steps 280–283. | recess editing |
| 38.2 — Recessed cabinets and cutouts | Frame lap, end panels to the face, recess casing; overlap by plan footprint; automatic cutouts with signed clearance; inset flush doors. | the medicine cabinet through a side panel |
| 41 — Panel construction and nosing | Slab / door-built panels set the default thickness; mitered nosing parts. (Round 39 is consolidation, 40 combine and full grids; 38.2 is parked.) | panels thicker than 13/16" |

## Open

1. **Back panels extending.** Not offered yet. Wait for a real case.
2. **The top panel "between" variant** on one wall: draw the top as a top cell between extended side panels, or as a run top over them? Settle it on the first real room.
3. **When stiles and rails arrive:** does a 5-piece cutout move the panel's rails to suit the cabinet, or stay a typed opening?
