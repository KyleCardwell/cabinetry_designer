# Cabinetry Designer — Decisions

What has been decided, by subject, as of 2026-10-01 (round 38 written, not yet run). One line per decision, with where it came from so the full reasoning can be found in git (`docs/elevation-mvp/SPEC-*.md`). Kyle's answers are the source of truth; a SPEC is cited where it wrote the decision down.

**How to use this file.** Read it before writing a SPEC, instead of reading old SPECs. When a round finishes, add its lasting decisions here, and move anything it reversed to **Superseded**. Numbers below are today's defaults (`DEFAULT_SETTINGS` in `model/constants.js`); the shop's rule IDs (REV-, FILL-, FF-, BOX-) are in `docs/rules/shop-rules.yaml`.

Still current and not repeated here: `CELLS-PLAN.md`, `ALCOVE-PLAN.md`, `CONSOLIDATION-PLAN.md` (active plans), `docs/platform/PLATFORM-PLAN.md` and `AI-LAYER-PLAN.md` (platform and AI, summarized in the last two sections), `docs/platform/estimate-integration-notes.md`.

---

## Principles

- **Store intent, derive everything else.** The document stores what the user decided (runs, anchors, cells, overrides). Piece positions, end types marked `auto`, frames, T-fillers, part lists, dimensions and warnings are derived on every sync and never saved (fields starting `_` are stripped on save). (SPEC, SPEC-2, SPEC-36)
- **Simple first, escape hatches second.** The everyday path is: drag a rectangle, it auto-splits into cabinets. Cells, extensions, stacks and overrides exist for what that can't draw. If routine kitchens need hand-built cells, fix the UI, don't add model. (CELLS-PLAN)
- **A cabinet type is a preset**: it supplies standard reveals and depths. What the shop reads is how a cabinet *differs* from its type's standards. (CELLS-PLAN, Kyle)
- **Every rule is overridable.** Derived values show their source (`rule: …`, `manual`); a manual value always wins. (SPEC-14)
- **Signed offsets everywhere:** positive holds back on the room side of the datum, negative carries past. Applies to corner reserves, wall ends, opening clearances, joints, follows, soffit anchors, recess anchors. (SPEC-9)
- **Deterministic code decides; AI interprets and explains.** Layout, splits, reveals, reserves, part numbers, dimensions and diagnostics are code. AI never mutates the document; it returns findings or proposals the user accepts. (AI-LAYER-PLAN §1)
- **Same vocabulary as the estimator.** Cabinet type IDs (1 base, 2 upper, 3 tall, 5 filler, 10 end panel), face types and split directions match ff-job-schedule. (SPEC, FACES-PLAN)
- **Units:** inches; inch inputs accept math and feet (`30 1/2 + 3/4`, `8'6"`). (SPEC-21)

## Rooms, walls and faces of walls

- Walls are drawn and connected in plan; clicking a wall opens its elevation. Walls snap ortho by default. (SPEC-2)
- **An angled wall gives** (neither horizontal nor vertical in plan): when a neighbour's length is typed or a neighbour is dragged, only their shared corner moves, so the angled wall changes angle and length and nothing past it moves. Square walls keep their angle; a typed or dragged wall keeps its own. No length lock. (SPEC-42.2, Kyle)
- **Every wall has two faces** (`front` = the room side / `+n`; `back`). Every run, joint, soffit and recess says which face it's on. Thickness 0 is allowed (an island with backs butted). (SPEC-17, TODO)
- **Islands:** a free-standing wall; both faces' runs anchor to it. The wall owns its end treatment: a **wall end panel** at a free endpoint, one part through both faces, width = the two sides' front depths + thickness. Runs anchored there stop short of it and get no end of their own. (SPEC-17)
- **Wing walls / landings:** a wall whose end lands on another wall's face. Not a separate type. The host is never split and keeps one elevation; landings divide its face into spans, and a span edge behaves like a wall end (anchors, corner reserve, end type). Positioned from the host's left/right end or another wing wall, to its near/far face or centre. (SPEC-18, TODO)
- Wing walls and soffits are drawn as plain outlines (no hatch) on the host's elevation, with a wing wall's cabinets in section; the elevation's wall row shows doors, windows and wing walls at their thickness, with or without cabinets. (SPEC-20, SPEC-37.4)
- **Named elevations:** each wall face with runs gets a letter (A, B…), independent of wall numbers; an empty wall can be forced in. A plan marker points at each lettered face. (SPEC-10, SPEC-20)
- Height comes from a room **height profile** (toe kick 4, base box 30 1/2, counter 1 1/2, upper clearance 18, top of crown 96, top mold 3, crown 4 1/2, crown stack 6), overridable per wall and run. The toe kick / furniture base is built separately and is outside the box. (SPEC-2, Kyle)
- **Crown is specified by its total height** ("a 6" crown"); the overlap between top mold and crown is derived and only displayed. (SPEC-8)
- A room centres on the origin; per-room wall height. (SPEC-11)

## Openings (doors and windows)

- An opening is a hole plus a rectangular casing (3" × 3/4", no reveal). Windows are cased on 4 sides, doors on 3. Openings have no runs and don't split. (SPEC-7)
- **Measure mode per opening:** jamb or outside of casing, for size and position alike, matching how the field measures. Position is stored from a wall end (left/right), by edge or centre, so it stays put when the wall length changes. (SPEC-7, SPEC-8)
- Runs can anchor to an opening's casing or jamb with a signed clearance (default `casingClearance` 0); unanchored runs too close get a warning; clearances get their own dimension row. A run past the jamb warns `blocks-opening`; under the casing is silent. (SPEC-8, SPEC-9)
- Openings sit on the front face only and appear in plan's face row from outside casing to outside casing. (SPEC-36.3.1)
- A door or window can be set in the back of a recess (`opening.recessId`); a door in a recess back is just a normal door. (SPEC-38, Kyle)

## Soffits

- Per wall face, several allowed, never overlapping. Underside height, depth (default 14), molding under it (crown / top mold / none), ends anchored to wall ends or wing walls with signed offsets. A soffit around a corner is two soffits. (SPEC-19)
- Uppers and talls under (even partly under) a soffit drop to it, less the chosen molding; the lower soffit wins. A wall's crown line can be set below a soffit, and then cabinets follow the crown line. (SPEC-19, SPEC-20, SPEC-21)
- A run end beside a soffit anchors to its side: filler if cabinets continue under the soffit, end panel if not. (SPEC-19)
- The vertical chain stops at the lowest soffit over its runs; with none over them, the soffit nearest that chain's edge. Each end of a wall gets its own chain. (SPEC-36.3.2, SPEC-36.3.3)
- A soffit anchored into a corner or a wing wall shows as a return on that wall's elevation, like corner-anchored cabinets: its depth wide, from its bottom to the ceiling. It counts only when its end is anchored there. (SPEC-38.1, Kyle)

## Recesses and projections (round 38)

- **One wall, one elevation.** A recess is a section of a wall face pushed back by any depth (deeper than the 4 1/2" wall too, e.g. 24" cabinet recesses by a fireplace); a projection is the same built out (fireplace breast, chase). Positioned like a window; bottom 0 = floor or raised (a medicine cabinet's); height or up to the ceiling. (SPEC-38, Kyle)
- A run sits on the wall face or on one recess (`run.recessId`). Depth is measured from the run's own plane; plan depths from the face, so a front can be negative. (SPEC-38)
- **Square corners at recesses:** inside a recess (or beside a projection) its side stops a run like a wall, with a filler; on the face beside a recess (or on a projection) the run ends at an outside corner with an end panel. A box standing out past the corner's wall gets an end panel. (SPEC-38)
- A recess top below the ceiling acts like a soffit for runs on it. Runs on different planes conflict only where plan depths overlap, so a base on the face can cross a recess with uppers inside. (SPEC-38)
- Real walls are still the way when a niche's side faces need their own elevations. (SPEC-38)
- A recess full of cabinets is selected from its segment in the wall row, and the selected recess is outlined over the runs. In plan, a deep recess keeps its filled bump-out even when raised, and the wall's dimension rows move out past it. (SPEC-38.1, Kyle)
- **38.2 (decided, not built):** how a recessed cabinet finishes is a run setting: face frame laps past the recess edge on all sides (1/4"–3/4" depending on the cabinets between); Euro gets an end panel flush with the cabinet face, as deep as the cabinet to the wall face, which can sit in that overlap; a base deeper than the recess gets end panels at its sides; casing on 3 or 4 sides by the shop or by others (a part only when ours). A face run crossing a recess may later go deeper behind the face, front in line with the other bases. (SPEC-38 §12, Kyle)
- **Panel cutouts (38.2):** hole = box + clearance each side: 0 when the box fits inside the hole, −3/4" when the box interior is flush with the hole and the panel covers the box edges. Inset doors in the hole get 1/16" all four sides for now. The cabinet is sized to the panel opening, not the (oversized, field-measured) wall cutout. Cutout types: cut hole, 5-piece centre removed, frame acts as face frame (rare). Glass/mirror later. (ALCOVE-PLAN, Kyle)

## Runs: drawing, position and anchors

- **A run is a rectangle drawn on an elevation** (base, upper or tall) that auto-splits into cabinets, fillers and end panels. Auto count follows width (max 36, min 9, rounded to 1/2"). (SPEC)
- Anchoring is automatic within 3" of a wall end (`cornerSnapDistance`). At an inside corner an anchored side gets a flex filler; at any other wall end an end panel. A free end not beside another run gets an end panel (`autoEndPanelOnFreeEnd`). (SPEC-5, SPEC-9)
- **Corner reserve** at an inside corner = the neighbour's front depth / sin θ, plus a back term below 90°. Front depth = box + bumper 1/16 + door 13/16 (24 7/8 on a 24" base), plus outset; face frame runs are box + 13/16 frame (no bumper, no door). Overridable per side: auto / face only / a number. Corner filler minimum 1 1/2" ÷ sin θ. (SPEC-2, SPEC-6, SPEC-36.1)
- Flex fillers split the leftover with per-side minimums; the odd 1/16" goes left. Runs may overhang wall ends up to 36". (SPEC-6)
- **Position readouts:** any span reads from either end, by edge or centre; typing a cell stores that reference. (SPEC-8)
- **Cabinet pins:** pin a cabinet's centre or edge to a wall end or an opening (two faucets on a vanity). The pinned cabinet stays auto-width; with two pins the pinned widths lock, and one `absorb` cabinet in a pinned segment takes the remainder. A pin never inserts a filler. (SPEC-8)
- **Joints:** two runs sharing an edge move together (a base between two talls). A joined end is `none` when the neighbour covers it fully (as deep, full height), else an end panel; never a filler automatically. Joints are per wall, never across corners. (SPEC-15, SPEC-16)
- **Follow anchors:** an edge joined to an edge that is already anchored (to a window, a soffit, a corner) follows it one way instead of forming a joint. Talls anchored off a window casing, a base following them, everything moves when the window does. (SPEC-34.3, Kyle)
- **Outset:** a run's distance off its wall (or recess back). (SPEC-35)
- A run has one depth; its fillers and end panels follow one set of rules. Deeper than the run means a separate run. (CELLS-PLAN, Kyle)
- A run has one end type per side, except blind corners per stacked cell. (Kyle)
- Future editing actions wanted: merge runs, split a run, copy a run, copy styles from another run. (Kyle)

## Run ends: fillers, end panels, blind corners

- **A chosen end type is manual:** picking one on a joined end sticks (only joining again makes it automatic). A joined end counts as covered by its neighbour only by the neighbour's depth along that edge (a back-panel-only run doesn't hide a base's end). (SPEC-38.3, Kyle)
- End types: `filler`, `end_panel`, `blind`, `none`. (SPEC-28)
- **Filler:** a 3/4" face with a return lapping the box beside it, 3/4" × 2 1/2" by default (sometimes deeper). Fillers sit flush with the doors: face from box top to door bottom, the return held up by the doors' negative bottom reveal so a part below runs under it. Any filler whose face drops below the box is noted "return up {drop}". (SPEC-27, SPEC-35.2, Kyle)
- **Blind corner:** a box that runs past the corner behind the neighbour; a blind belongs to one wall. The filler is ordered ~6" wide (true plan width, room to adjust on site) though ~1 1/2" shows; no return. (SPEC-25, SPEC-28, Kyle)
- **Blind corner panel:** when the blind is taller than what dies into it, a panel from the adjacent wall to the outer edge of the filler, as wide as the deepest neighbouring run that overlaps it vertically plus the filler (e.g. 24 7/8 + filler). It flexes with the filler but always touches the wall. (SPEC-29, Kyle)
- Blind is per cell: any cell in the outermost column can be blind; the run's end stays one full-height piece (the shop has built a blind tall over a non-blind drawer base with one full-height filler). (SPEC-34, Kyle)
- End panel thickness 3/4" (13/16" real for face frame ends). Upper-run fillers and end panels drop with the doors (Euro 1/8", inset 3/4"). (SPEC-14)
- **Extensions:** any filler or panel can extend along its long direction past its run's edge, to the floor, ceiling (or soffit), wall end, another run's edge, or by a distance. Still one part; never shrinks; only from the run's edge. A follower run stops at an extended end piece's inside face. (SPEC-35.3, Kyle)
- **Chip detail:** an end panel or filler sitting on a flush part below, where the doors have a 1/8" bottom reveal, gets a 1/8" rabbet/kerf at the bottom edge (height unchanged). (SPEC-35.2, Kyle)
- Wall end panels (islands): see Rooms; under a face frame see Face frames.

## Cells (a run is a grid)

- **A run's root grid replaces `run.items`.** A grid has columns, rows and cells; a cell is a leaf or another grid; any cell can split again. Spans exist in the shape but stay 1 until combine (round 39/40). Grids are expected to be rare and rarely nested more than 2 deep. (SPEC-32, CELLS-PLAN, Kyle)
- **Size lives on tracks** (`auto` / `manual` / `solved`), edited on the dimension chain. Root columns are solved by `splitRun` (ends, fillers, pins, rounding, auto count); everything else shares auto/fixed like face groups. (CELLS-PLAN, SPEC-33)
- **Split** keeps the original cell (id, face, style, reveals) and adds siblings; same direction as the parent adds tracks, otherwise nests. 2–8 per split. (SPEC-33)
- **Kinds:** `cabinet`, `filler`, `panel`, `void` (nothing; breaks a face frame; no part), `shelves` (floating shelves, count, optional back; 1 1/2" shelf thickness assumed). An open box with a frame is a cabinet with an `open` face, not a void. (CELLS-PLAN, SPEC-34)
- **Panel type is derived** from the thinnest dimension: side, top/bottom, back. Choosing a type sets the sizes. Which panel runs through follows split order (the way the box is built); "Wrap in panels" does sides-through or top-through in one click. (SPEC-34, SPEC-34.1)
- **Panel doors:** a side or top/bottom panel is flush (reaches the door face, 24 7/8" on a 24" run; the cabinet beside it is captured) or covered (box depth; the cabinet's reveal on that side becomes standard − panel thickness, e.g. −11/16" beside a 3/4" panel). A door covering a side panel stops 1/16" back by default. A door can't cover a panel on its hinge side. (SPEC-34.2, Kyle)
- **Cell depth and align:** a cell can be shallower than the run, faces aligned or backs aligned (the 21" oven box, backs in line). A back panel is a 3/4" panel cell, backs aligned. (SPEC-34)
- **Stacked seams are reveals**, not objects: Euro 0" on the upper box's bottom, 1/8" on the lower's top (default; can flip or go negative to hold a line). Face frame: 3/4" each side of one shared 1 1/2" rail; the lower box has a full top, upper deck at 0. Source `rule: stacked seam`. (SPEC-33, Kyle)
- **Empty space inside a run is valid** (the desk: a 4" pencil drawer cell over a void between full-height end panels, sometimes a back panel below). (SPEC-34, Kyle)
- **Neighbours are found from resolved rectangles**, not the tree, so capture, seams and frames work across nesting and across runs. (CELLS-PLAN)
- Nothing splits a cell front to back (yet). Accessories, interior sections (fixed shelves, partitions) and automatic splits by material height are deferred. (CELLS-PLAN)
- **Hinge side:** a single door can store left/right; blank defaults to the side against a filler, end panel or flush side panel, else away from a covered panel, else stays blank. (SPEC-34.2, Kyle)

## Tops, parts below, stacked runs

- **`run.top`** is independent of cabinet type: stone, wood, crown, top mold or none; the type only picks the default. REV-002 (1/8" top reveal under a wood top, Euro) follows the top on any run type. A wood top splitting cabinets means separate face frames above and below. (SPEC-35, Kyle)
- **Parts below a run** (`run.bottom`, top to bottom): light rail 1 1/2, light trough 3, panel 3/4, bottom cap 1 1/2, corbels 6. Each is covered by the doors, flush below them, or visible; bottom cap and corbels never covered. (SPEC-35)
- **REV-011:** covered → bottom reveal −(covered height) − 1/8 (−1 5/8 over a 1 1/2 light rail, −7/8 over a 3/4 panel); flush → +1/8; visible → standard (assumed; confirm on a real room). End panels and fillers drop to the doors. A visible light rail/trough is flush with the boxes: doors keep −1/8, ends are 1/8" taller, the rail sits inside end panels or runs under fillers. (SPEC-35, SPEC-35.2, Kyle)
- **Stacked runs are one-way links**, not vertical joints: a run **sits on** another's top part and/or is **held under** another's lowest part, with a gap; a run linked both ways fills between them (base / panel run / upper with a bottom cap). Leaders keep their own height rules. (SPEC-35, Kyle)
- A stack gets one vertical chain: toe kick | box | top | box | cap | box | crown. (SPEC-35)

## Cabinet styles and reveals

- Styles use the estimator's `cabinet_styles` IDs: 13 European, 14 inset face frame, 15 beaded inset (bead 1/4"). Resolved settings ← room ← run ← cabinet. Both European and inset face frame must be supported. (SPEC-14, Kyle)
- **European reveals (defaults):** base top 1/4, bottom 1/8; upper top 1/8, bottom −1/8; tall 1/8 / 1/8; sides 1/16; 1/8 between faces. Measured inward from the box edge; negative is an overhang. (FACES-PLAN)
- **Inset reveals** are box edge to frame opening (the shop orders faces tight to the opening): rails 1 1/2, stiles 3/4 per box, mid rails/mullions 1 1/2; upper bottom 3/4 (rail less the 3/4" drop); base/tall bottom up 1 1/8 on centre. Profiled faces sit 3/32 inside the slot; a pair has 1/8 between. Drawing and order sizes use 3/4 and 1 1/2, not Cabinet Vision's 13/16 and 1 9/16. (SPEC-14, Kyle)
- **Rules, after style and before manual:** wood top (1/8 top), upper flush or on counter (tall bottom), captured single column (3/32 each side when captured both sides), covered panel, stacked seam, below-run (REV-011), hanging base. A side is captured by a filler, end panel, flush side panel or anything deeper beside it. (SPEC-14, SPEC-34.2)
- Reveals are editable per cabinet (all six) because shop rules alter them per cabinet; eventually reveal rules are saved per shop as settings. The reveals on `cabinet_styles` are not trusted (a temporary cleanup step); catalogs will need drawing-grade detail. (Kyle)
- **Deviations** from the type standard (`{ key, standard, actual, source }`) become report notes (REV-001/003: only sides that differ, T B L R). Not built; moves to reports. (CELLS-PLAN)

## Faces

- **A face tree per cabinet:** groups split vertical (top to bottom) or horizontal (left to right) into any number of sections; leaves are door, pair door, drawer front, false front, panel, open. Sizes are fixed or auto; sizes are finished face sizes (Euro) or slot sizes (inset). Reveals are settings, never nodes. (FACES-PLAN, SPEC-13)
- Default face: one door, or a pair above 24" wide; it follows the width until edited. (SPEC-13)
- The designer draws face outlines only: no stiles/rails on doors, no pulls. Interior (drawer boxes, shelves) is separate and later. (Kyle)
- Drawer stacks can be built by hand (nested group with a stack height) or by preset; standard drawer heights Euro 5 7/8, face frame 5. (SPEC-20, settings)

## Face frames

- **The frame belongs to the run and covers each rectangle of face frame cells**, breaking at voids, panels, Euro cells (pencil drawers are always Euro) and run edges. One frame spans the run. (CELLS-PLAN, SPEC-36, Kyle)
- **Stiles 1 1/2", 3/4" over each box.** At a free side the stile overhangs 3/4", so the box is 3/4" narrower (a 30" frame section → 28 1/2" box). Width fields show the box width, with the frame section under it. (SPEC-36, SPEC-36.2, Kyle)
- **The frame covers exactly 3/4" of every box; a bead lives in gaps.** In a beaded run there's a bead-width gap (1/4" by default; it follows the bead width) at every end: beside an end panel, a neighbour's end panel, a corner filler, or a plain end, as well as between boxes. Side reveals are the 3/4" stile. A mitered end panel's stile is 3/4 + 1/4 + 3/4 = 1 3/4". (SPEC-38.3, Kyle)
- **Face frame end stiles stay standard** (1 3/4" beaded at an end panel, 1 1/2" inset). Rounding boxes to `roundTo` is the ideal and a filler or filler stile flexes to allow it; when nothing can flex the boxes take the leftover (equal to the 1/16", the last taking any odd sixteenth, with the "widths not rounded" warning), never the stiles. Type one box's width to choose the split. (SPEC-42.1, Kyle)
- **Fillers in a face frame run are part of a wider stile**, not parts, and aren't drawn; an anchored end gets a wider stile instead of a filler. End panels are mitered into the frame: still parts, shown in plan, hidden in elevation except on hover/select (still numbered and clickable). (SPEC-36, SPEC-36.1, Kyle)
- **Beaded:** bead 1/4". Box-to-opening is 3/4" everywhere; a beaded seam stile is 1/4 + 1 1/2 + 1/4 = 2", so beaded runs default to a 1/2" gap between boxes; 1 3/4" at an end with a mitered panel. At an inside corner the flat stretches like a filler and the bead stays by the faces. (SPEC-36, Kyle)
- **Gaps between boxes are spacing, not parts** (`gap` on a track; run seam gap default 2 × bead on beaded). (SPEC-36)
- A blind face frame cabinet's frame shows only its visible part. (SPEC-36, Kyle)
- **Frame is 13/16" thick, no bumper**: front = box + 13/16. Upper clearance (18") is measured to the bottom of the frame's bottom rail, which hangs 3/4" below the box. The corner stile clears the return run's doors: corner filler minimum = Euro minimum less the side reveal, so the stile is 1 1/2" at 90°. (SPEC-36.1, Kyle)
- **Plan:** no fillers; boxes at their true width; one 13/16" frame strip per region, mitered into end/side/wall end panels. (SPEC-36.1)
- **Wall end panels under a frame:** mitered by default (the frame covers the panel edge); the frame butts (dies into it) when the panel is deeper or taller than the run, with a per-panel Auto / miter / butt override. A face frame run covers the edges of wall end panels that extend back (island panels) by default. (SPEC-36.2, Kyle)
- **Back panels at wall end panels** (SPEC-43, Kyle): a panel-only run anchored to a wall end panel meets it like a face frame does. Auto miters when the run's outer panel face is the end panel's depth on that face, else butts. The panel's one Auto / miter / butt choice (stored as `frame`, shown as **Joint**) covers both. Mitered, the back panel runs over the end panel to the outside corner (45° on both). It's ordered longer by the end panel's width, and the end panel shows only where the back panel leaves it. A panel-only run is never treated as a face frame, even in an inset room.
- **The frame is one part number** per region; stiles (full height), rails (between) and mullions are derived for pricing, never stored or shown in elevation. (SPEC-36.2, Kyle)
- **Dimensions:** stile | opening | stile replaces box dimensions across and vertically (on the wall's vertical chain); overall run dimension stays below. Doors are dimensioned to the adjacent door with the 1 1/2" between as its own dimension. (SPEC-36, SPEC-36.2.1, Kyle)
- **No rail / no mullion per seam:** any seam between two faces can drop its rail or mullion; faces either side share one opening, gap 0 square or 1/16" profiled. Euro ignores it. (SPEC-36.3)
- **Hanging base:** an explicit run setting on inset bases; the bottom rail hangs 3/4" below the box, the box is 3/4" shorter, the toe kick value is floor to rail bottom, so it looks like a normal base. (SPEC-36.3)
- Later: frame flush at the outside edge; the wider-frame variant; a gap-and-wider-stile when boxes are spaced. (Kyle)

## T-fillers and L-shaped end panels (Euro)

- **A T-filler is a part and is drawn**, in elevation and plan. It covers 3/4" of each box edge (1 1/2" between tight boxes, wider by any gap), vertical or horizontal between stacked boxes. Hardwood, 13/16" thick from the box face, return 3/4" × 2 1/2". Euro only. (SPEC-37, Kyle)
- On via `run.tFiller` (`seams` | `all`), per cabinet side, per run end. Derived, never stored; the solver doesn't see them. (SPEC-37)
- **A vertical seam is one T for its whole length**, even between columns of different-height cabinets; horizontal Ts butt into it like rails into a stile. (SPEC-37, Kyle)
- **At a run end** the T stands in for the filler: visible filler width + 3/4" over the box, return off-centre, starting where the box ends. At an inside corner the minimum drops by 3/4", so the flat is 1 1/2" at 90°. (SPEC-37, SPEC-37.1, Kyle)
- Reveals beside a T follow REV-005/006 (13/16" pair, 27/32" single). Each box a T covers gets the rabbet note (FILL-007); the T is noted `T-shape`. Dimensioned like a face frame. (SPEC-37)
- **L-shaped end panels:** with Ts on, a run-end end panel gets a lip covering the box edge: face = panel thickness + 3/4" (1 1/2", or 1 9/16" with a 13/16" panel). Automatic when that end's T is on, overridable per end. Still the end panel part, no rabbet note. Panel and lip are mitered in plan, both 13/16" from the box face, flush with the Ts. (SPEC-37.1, SPEC-37.2, Kyle)
- **Numbering:** a seam T comes right after the cabinets on its left (a whole stacked column); a horizontal T right after the box below it; an end T or L keeps its filler's or panel's number. (SPEC-37.3, Kyle)

## Alcoves and panels

- **The paneled alcove** (bathroom; walls both sides, soffit above): side panels full height floor to top panel, a top panel (usually over the sides, sometimes between), a back panel from the top panel to the counter, bases between the side panels; the countertop dies into side panels that are deeper than cabinets and counter. Drawn either as one wall (panel run on the counter, extended end panels, back panel cell, base following) or with **side panels as panel runs on the return walls**, width typed when drawn. (ALCOVE-PLAN, Kyle)
- **Panel-only runs reserve only their thickness** (no bumper, no door). (SPEC-38)
- **Panel construction (round 40/41):** slab 3/4"; built like a door 13/16" with matching stile/rail details; a thicker panel gets **mitered nosing** (nosing width = panel depth; the core stays full size), nosed edges default to the exposed ones; each nosed edge is its own part. (ALCOVE-PLAN, Kyle)
- Stile/rail details for 5-piece doors and panels aren't designed yet: one standard set at room level, inherited, overridable down to each face; panels match doors. (Kyle)

## Dimensions

- **Each chain sits next to what it measures.** Runs: an inner chain of pieces and an overall chain below; a split column's own chain inside the run. Wall: a row for doors, windows and wing walls; the overall wall length always shows. (SPEC-4, SPEC-10, CELLS-PLAN, SPEC-37.4)
- **Vertical chains at both wall edges**, each taking only runs that reach into its half; a counter-height row (floor to top of counter) for base runs. (SPEC-22, SPEC-36.3.1, SPEC-36.3.3)
- Click a dimension to select, then type to move; drag a run by its dimension. (SPEC-12, SPEC-16)
- A pinned cabinet gets a callout from the pin's datum to the point it holds: ℄ for a centre pin, the distance alone for an edge pin. (SPEC-12, SPEC-38.1)
- Neighbouring walls' runs that pass this wall's end show as profiles with their moldings, and their reach is dimensioned in the stack. (SPEC-22, SPEC-26, SPEC-28)
- **Plan:** wall length outermost, with a face row of wing walls and openings inside it; depth dimensions by type lane (base centre, upper left, tall right). (SPEC-21, SPEC-36.3.1)
- **Plan clearances,** always shown, at the tightest point: island outside edges to the nearest thing across (cabinet front, end panel, wall), and facing base/tall runs front to front (galleys, U legs, peninsulas). Uppers never count; each gap once. (SPEC-36.3, Kyle)

## Plan view

- Plan draws what's built: boxes, a 1/16" bumper gap, 13/16" doors at true face widths, fillers with their returns, blind boxes at full width, end panels as 3/4" rectangles, face frame strips mitered, T and L lips. The topmost cells are drawn; covered top/bottom panels aren't. (SPEC-27, SPEC-28, SPEC-34.2)
- Collisions use each run's full installed front depth. (SPEC-27)

## Drawings (DXF output)

- **The designer builds the payload in the browser** (`toDrawingPayload`); the API verifies the login and runs geometry; one zip per room: `payload.json`, then `elevation-<letter>.dxf` per lettered wall face (`plan.dxf` from round 44). (SPEC-40, Kyle)
- **Geometry is a renderer** and computes no sizes. The payload stays `payloadVersion: 1` while nothing is stored; new fields arrive with defaults, geometry step first. (SPEC-40, SPEC-41)
- **Elevation parts** carry their rectangle and their depth (`back`, `front` from the wall face, the plan view's own numbers); geometry removes hidden lines. Dashed only where a part is behind a *different* part; a box's edges behind its faces, frame, fillers or T/L fillers are left out (`coversBoxEdges`). Layers: CABINETS, FACES, FILLERS, PANELS, FRAMES, SHELVES, plus one dashed HIDDEN. (SPEC-41, Kyle)
- **Run bands** (SPEC-42, Kyle): toe kicks, countertops / wood tops, top molds, crowns and parts below a run are elevation parts from one model function (`runBands`) the canvas and the DXF share. A band runs past a *free* run end by its projection (toe kick stops short by its setback) and stops at a wall, the side of the run's own recess, or a joined run that carries it on; a top runs past a wall end panel. Placeholder depths until profiles (`bandDepths`): toe kick 3" back from the box front, countertop 3/4", top mold 1/4" and crown 3" past the faces. Parts below a run are flush with the boxes. Toe kicks, top molds and crowns are never dashed. Layers COUNTERTOPS and MOLDINGS; a chip detail is a detail line (`lines`) on its end panel or filler.
- **Band returns between runs** (SPEC-42.1, Kyle): where two touching runs carry the same band (same top height and family, or both toe kicks), the deeper run's band returns past the shared side as at a free end and the shallower one's meets it there; equal depths run through; a top dies into a taller run. Toe kicks: 3" back from the face; at a free side 1" from an end panel's face, else 1/4" from the cabinet side; a shallower toe kick runs on to meet a deeper one's return. Flush profiles come later with profiles.
- **Bands meet corner returns** (SPEC-42.3, Kyle): at a run end anchored into an inside corner or to a wing wall, the return from the other wall is the deeper run. When it carries the same band at the same height, this run's countertop, top mold or crown stops at the return's band front (G1 B's countertop at 25 5/8"), and its toe kick runs past the run's end to meet the return's (21", 3" back from both faces). Matched band by band; with no match the ends are as before. Read from `cornerShapes`, so canvas and DXF agree.
- **Wall things in the DXF** (SPEC-42.1, Kyle): wall end panels on PANELS (behind a frame mitered over them); doors and windows (casing + opening) on OPENINGS; soffits, recesses, projections and wing walls on WALLS. These are outlines (`opaque: false`): hidden by cabinets in front, hiding nothing. Recess edges are solid corners, dashed only behind a cabinet. A soffit as deep as its wing wall leaves that side open (`openEdges`).
- **Corner returns and profiles** (SPEC-42.2, Kyle): runs on the next wall or a wing wall anchored into this face's corner, and soffits that die into it, are drawn in section: outlined and hatched (ANSI31, lines 1" apart in the drawing, scale 8; SPEC-42.3) on `SECTIONS`, hatched only where visible; their box and faces hide what's behind them (the blind box in a corner is dashed), their bands are outlines. Runs on a connected wall that reach past this face's end are drawn from the side (`profile` on `CABINETS`). Both use a true side shape (`runSide`): box, faces, toe kick set back, countertop / top mold / crown projecting by `bandDepths`, top mold stopping under the crown, until real profiles. A run in a neighbour's recess is never seen past this face's end. Canvas and DXF draw from one function (`cornerShapes`).
- **Drawing rounds:** 40 plumbing → 41 elevation parts + hidden lines → 42 run bands → 42.1 band returns, face frame stiles and wall things (wall end panels, openings, soffits, recesses, wing walls) → 42.2 angled walls, corner returns in section and neighbour profiles → 42.3 bands meet corner returns, denser section hatch → 43 back panel miters and horizontal elevation dimensions → 43.1 drawing style and readable dimensions → 43.2 vertical dimensions and counter height → 43.3 cell chains and callouts → 43.4 corner reach on cornerShapes → 44 plan → 45 plan dimensions and labels → sheet layout. (SPEC-40, SPEC-42)
- **Branches (Kyle, 2026-10-04):** no new branch or PR per round. Designer commits on `feature/elevation-mvp`; geometry (and the API when a round touches it) on one long-lived `feature/drawing`, merged into `main` by PR only when wanted.
- **Profiles (Kyle, 2026-10-04, not built):** a profile drawing tool for crown, top mold, toe kick, furniture base, door edges, countertop edges and the like. Profiles are saved per team as option-family catalog rows (`team_options.spec`: a closed outline in depth × height, arcs allowed, with an attachment point) and chosen when drawing; the payload carries the resolved outline and geometry draws it. Until then, round 42 sends toe kicks, tops and moldings as parts with overall height and depth plus an optional `profileId` that geometry ignores. Profiles mostly show in corner side views, end views/sections and plan (countertop and door edges); in a front elevation they only add step lines. (PLATFORM-PLAN Phase 4)
- **Elevation dimensions** (SPEC-43, Kyle): real DIMENSION entities on `DIMENSIONS` in dimstyle `FF` (paper sizes × DIMSCALE = plot scale: 1/8" text, 1/16" ticks, fractional to 1/16", text above the line). The block shows the designer's text; the entity keeps `<>` so CAD can re-measure. The designer sends one record per segment (`{ row, kind, start, end, base, at, text }`) from the canvas's own chains; geometry places nothing. Round 43 has the horizontal rows: below (pieces, runs, the wall row) and above (pieces, runs), 3/8" (paper) past the drawing's extent and 3/8" apart, with empty rows skipped. The title moves under the lowest line. Vertical chains and counter height follow in 43.2; cell chains, callouts and corner reach in 43.3 and 43.4.
- **Drawing style** (SPEC-43.1, Kyle): every label and dimension uses one text style, `FF_TEXT`, in Arial Narrow (`arialn.ttf`, family name in the extended font data). The DXF names the font; the viewer supplies it. Dimension text is 3/32" on paper. Lineweights per layer (1/100 mm): walls 50; cabinets and countertops 35; faces, fillers, panels, frames, moldings, openings and sections 25; shelves, hidden, dimensions and text 18. `$LTSCALE` = plot scale ÷ 2 so dashes are 1/4" on paper. These are shop defaults in geometry; per-team drawing standards come later.
- **Dimension text that doesn't fit** (SPEC-43.1, Kyle): the designer estimates each label's width (characters × 0.5 × text height). One that doesn't fit between its ticks with a gap each side moves outward, centred on its segment, to the first level that clears its neighbours. Levels are 5/32" apart on paper, and the next row moves out to make room. The record carries `textX`/`textZ`, and geometry places the text there with no leader. The designer's `DIMENSION_TEXT_HEIGHT`/`DIMENSION_TEXT_GAP` must match geometry's `dimtxt`/`dimgap`.
- **Vertical dimensions in the DXF** (SPEC-43.2): both wall edges get the canvas's vertical chains as chosen with nothing selected (a selection changes only the canvas). Columns, nearest first: the stack, counter height (base runs), wall height; 3/8" (paper) past the extent and 3/8" apart plus moved-text levels, like the rows. Records carry `orientation: 'vertical'` (start/end heights, base/at x); horizontal records omit it. Text reads from the right, so on the left edge it sits outside the line and on the right edge inside. A column that only repeats the wall height is left out (Claude's default). The title follows horizontal records only.
- **Plot scale (from round 43):** text, dimension and arrow sizes are set in paper inches × a plot scale (default 1/2" = 1'-0", 1:24, so 1/8" text is 3" in the drawing), so drawings print correctly when laid out on sheets. The setting is `plotScale` (default 24; 12, 16, 24, 32 or 48), *Drawing scale* in Settings, sent as the payload's top-level `plotScale`. (Kyle, 2026-10-04; SPEC-43)
- **Sheet layout (after round 45, Kyle 2026-10-04):** geometry arranges a room's elevations and plan (or several rooms') onto 36 × 24 sheets at 1/2" = 1'-0" automatically, with a border and title block (job, phase, room, revision, sheet, date, scale), as a sheet DXF (paper-space layouts with viewports) and a print-ready PDF. Not hand-arranged exported DXFs. (PLATFORM-PLAN Phase 3)

## Part numbers

- Every part gets a number: cabinets, fillers, end panels, panels, shelves, T-fillers, frames, wall end panels, and one per molding kind per room (toe kick, top mold, crown). Faces are part of their cabinet; voids and gaps get none. (SPEC-23, CELLS-PLAN)
- Numbered per room from a starting number, wall by wall, by resolved rectangle (left edge, then bottom edge). Any part can take a hand-set number; the rest close up around it. The shop has no preferred order as long as every unique cabinet has a number. (SPEC-23, SPEC-33, Kyle)
- Overrides live on the room keyed by part key, not on the part, so they survive end-type changes. (SPEC-23)

## Data, platform and estimating (summary of PLATFORM-PLAN)

- **Hierarchy:** team → project (`estimate_projects`) → **phase** → room → wall → run → cabinet → face. Phases (new work on the same project over months or years) are critical in the designer; old rooms must never be confused with current ones. Integrating phases into the estimator comes later. (D1, Kyle)
- **A room is one JSON document** (re-confirmed 2026-10-02: no separate room-layout / cabinet-layout columns; cross-references make a split cost more than it saves; revisit for frequent same-room editing, reusable cabinet layouts, or cross-room queries via a derived parts table); the document autosaves; a **revision** is created only by issuing, and is frozen. Revision history approach otherwise still open. (D2, D3)
- **One options mechanism** (door edges, panel and molding profiles, furniture bases, light rails/troughs, applied moldings…) resolved through project/room/run/cabinet/face, not a column per feature. Catalogs are shared with the estimator and upgraded, never duplicated. (D4, D5, Kyle)
- Supabase RLS is the security boundary; writes go through **RPCs** where possible. The API only generates (geometry) and integrates. Geometry is a pure renderer that computes no sizes. The room model and pricing move to a shared JS package. (D6–D9, Kyle)
- **The estimator keeps its own tables; only pricing logic is shared.** A designer estimate is generated on the fly in the browser from current settings and saved as a PDF; a designer room reaches the scheduler by sending front-end-computed hours and prices. Estimates can still be created without a drawing. (D10, Kyle)
- The designer's JSON should match ff-job-schedule's estimating vocabulary; designer room = estimate task. (Kyle, estimate-integration-notes)
- Multi-user: several people draw at once, 2+ on one project, rarely the same room in two browsers. The app is for Kyle's shop first, built to extend to other teams with their own rules, materials, hardware and finishes. It replaces Cabinet Vision. (Kyle)

## AI layer (summary of AI-LAYER-PLAN)

- AI interprets a finished design against Kyle's rules (`shop-rules.yaml`) to produce shop reports, catch errors and flag what wasn't thought through. It does not design the room. (Kyle)
- Prerequisites, in order: provenance (where each value came from), intent (`purpose`, `notes` on cells), a resolved snapshot (one artifact with diagnostics). Then the rulebook, one report end to end, a review pass, and later a solver for drawing only the finished result and deriving boxes. (AI-LAYER-PLAN §5, Kyle)

---

## Superseded

Decisions later reversed. Don't re-propose these without a new reason.

| Was | Now | Where |
|---|---|---|
| The old drag-and-drop / click-to-add designer | Draw walls in plan, draw runs on elevations that auto-split; per-wall JSON | cabinetry-designer-review, Kyle |
| `crownOverlap` stored | `crownStackHeight` (total) stored; overlap derived | SPEC-8 |
| `cornerSnapDistance` 30 | 3 | SPEC-5 |
| Anchoring only at inside corners | Any wall end (end panel outside, filler inside) | SPEC-9 |
| `run.top` stone/wood on bases only | Five values on any run, independent of type | SPEC-35 |
| `run.items` | `run.grid` (items only as the solver's transient view) | SPEC-32 |
| `run.blind` | `leaf.blind`, per cell; edge leaves keep their own value through edits | SPEC-32, SPEC-34 |
| Vertical joins as joints in `run.anchors` | One-way stack links (`run.stack`) | SPEC-35 |
| Changing a panel to another kind keeps depth/align | Leaving Panel drops them | SPEC-34.1 |
| Beaded: box-to-opening 3/4 + bead at the sides | 3/4 everywhere; the bead widens the stile with a gap between boxes | SPEC-36 |
| FACES-PLAN round 15 frame on items (never built) | Face frames built on cells, round 36 | CELLS-PLAN |
| Per-cabinet vertical opening chains | rail \| opening \| rail on the wall's vertical chain | SPEC-36.2.1 |
| Frame badge one level up | Two levels up over the stile nearest the frame centre | SPEC-36.2.1 |
| An island lies wholly inside another group | It reaches inside a larger group | SPEC-36.3.1 |
| Vertical chain stops at the lowest soffit on the wall | Nearest that chain's edge; each wall end gets its own chain | SPEC-36.3.3 |
| End T = filler + 3/4 at an inside corner (2 1/4") | Corner minimum drops by 3/4 (1 1/2" flat) | SPEC-37.1 |
| L lip to the door-face line, two rectangles | 13/16" from the box face, mitered, flush with Ts | SPEC-37.2 |
| Seam Ts numbered after the run's pieces | Beside their seam | SPEC-37.3 |
| Alcove niches only as separate walls | Recesses keep them on one elevation (real walls when sides need elevations) | SPEC-38 |
| Combine and full grids in round 38, then 39 | Proposed round 40 (consolidation takes 39) | CONSOLIDATION-PLAN |
| Recesses after round 38 | Moved up to round 38 | Kyle, 2026-10-01 |
| Face frame boxes round down to 1/2"; end stiles take the leftover | End stiles stay standard; boxes take the leftover | SPEC-42.1, Kyle |
| Bands stop at any joint whose neighbour carries them | The deeper run's band returns; the shallower meets it | SPEC-42.1, Kyle |
| Typing a wall length or dragging a wall keeps every neighbour's angle | An angled neighbour gives; square ones keep their angle | SPEC-42.2, Kyle |
| Neighbour profiles and returns as one rectangle with molding bands stretched across | True side shape (box, faces, toe kick notch, projecting tops) | SPEC-42.2, Kyle |
| A band at a corner stops at the run's end | It meets the corner return's band (the return is the deeper run) | SPEC-42.3, Kyle |
| Section hatch 3" apart (scale 24) | 1" apart (scale 8) | SPEC-42.3, Kyle |

## Still open

- Floating shelf thickness (1 1/2" assumed) and spacing; reveal for a cabinet under a top panel / over a bottom panel. (SPEC-34)
- REV-011 "visible" = standard reveal (assumed). (CELLS-PLAN)
- Chain placement when neighbouring stacks differ in height. (CELLS-PLAN)
- T-filler assumptions in SPEC-37 §13 and 37.1 §6 (return position at an end, horizontal T reveal, wall end panels never L). Unconfirmed but built.
- Back panels extending; the top panel "between" variant; whether a 5-piece cutout moves the panel's rails. (ALCOVE-PLAN)
- Face presets approach; revision history; phases in the estimator now or later; revision per room or per phase. (Kyle, PLATFORM-PLAN §7)
- Profile tool: drawn in the app, imported from a DXF, or both; which families get profiles first. (Kyle, 2026-10-04)
- Two blinds meeting in one corner; 45° and lazy-susan corner units (a part shared by two walls). (TODO)
