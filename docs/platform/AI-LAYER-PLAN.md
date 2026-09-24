# Cabinetry Designer — AI Layer Plan (2026-09-23)

How the drawing app gets to the thing it was started for: draw a room quickly, then have AI read the
finished design against rules Kyle provides and produce shop-ready reports, catch errors, and flag
what hasn't been thought through. AI interprets; it does not design.

Companion to `PLATFORM-PLAN.md`, which covers persistence, revisions, options and pricing. This file
covers the interpretation layer and the order to build it in. Per-step work still lands as
`SPEC-N.md` / `PROMPTS-N.md` under `docs/elevation-mvp/PROMPT-CONVENTIONS.md`.

State at writing: step 152 (`0da9412`), 33,753 lines of source, document persisted to `localStorage`
only. Cells are designed but not implemented — `grep -rn "cell" src` returns nothing.

---

## 1. The governing rule

**Deterministic code decides. AI interprets and explains.**

The dividing line is not "hard vs. easy." It is **must this be identical every time it runs?**

| | Owner |
|---|---|
| Layout, splits, reveals, corner reserve, part numbers, dimensions | Code |
| Anything already in `roomDiagnostics` | Code |
| Box sizing from a drawn result (later) | Code — a solver, not a model |
| Reading a prose rulebook against a design | AI |
| Spotting what the design doesn't address | AI |
| Explaining and justifying a choice in Kyle's language | AI |
| Writing the prose of a report | AI |

Box sizes feed the cut list, part numbers, the DXF and the estimate. If they change between two runs
of the same input, the paperwork churns and the shop stops trusting it. That single constraint is
what keeps the deciding on the code side of the line.

Corollary: **AI proposes, the document records.** Nothing AI produces mutates the room document
directly. It returns findings, or proposals the user accepts, and an accepted proposal is written in
as explicit, editable, pinnable state.

---

## 2. The three prerequisites

Each is a document-shape or derivation change, and each is cheapest now, while rooms live only in
`localStorage` and `persistence.js` migrations are the whole cost of a shape change. After
PLATFORM-PLAN Phase 2 (`design_rooms` in Supabase), the same changes carry migrations over saved
customer work.

**P1 — The resolved snapshot.** One pure function, `resolveRoom(room, settings) → plain JSON`, that
emits the whole derived room: walls, runs, every piece with its part number, cells, face rectangles,
reveals, blind entries and panels, openings, soffits, dimension chains, diagnostics. Today all of
this is computed inside React renders and exists nowhere as data.

The snapshot is the keystone. It is simultaneously the geometry payload (PLATFORM-PLAN §5), the
estimate input, the AI input, and — if it ever happens — the 3D viewer's input. Building it is
mostly assembly; the functions already exist.

**Rule that follows: AI reads the snapshot, never the raw document.** If it re-derives layout, the
reports stop matching the drawing and stop being reproducible.

**P2 — Intent.** The model records what is built with real fidelity and nothing about what it is
for. There is no sink base, no dishwasher, no fridge opening, no trash pullout. Most reviews a shop
actually wants are intent checks:

- sink base with a center stile under the window
- dishwasher opening drawn at 23 1/2"
- a seam behind the range
- a 6" filler at the fridge nobody confirmed clears the door swing

None are answerable from the current document at any level of geometric precision. Needed:

- a small **purpose vocabulary** per cabinet/cell — `sink`, `dw`, `range`, `fridge`, `trash`,
  `micro`, `oven`, `hood`, `appliance:<id>` — optional, one click
- **free-text notes** at room / wall / run / cell / face, carried into the snapshot verbatim

The notes field is what makes this a design review rather than a lint pass. "Client wants this to
look like furniture" is a sentence code can never act on.

**P3 — Provenance.** Every resolved number says where it came from: type default, style value,
resolved option, or user override. `REVEAL_SOURCE_LABELS` already does this for reveals; the same
idea extends across the snapshot.

Without it, review is close to useless — AI cannot tell "Kyle set this reveal deliberately" from
"this is whatever fell out of the defaults." With it, findings get sharp: *overridden and unusual*
is worth flagging; *default* usually isn't; *default where a rule says otherwise* is a real catch.

---

## 3. Keep going on cells — yes

Two reasons, and one amendment.

**Cells are the data structure the whole plan needs.** The eventual ambition is to draw the finished
elevation and have the boxes fall out. That inverts *who authors* the division — a solver instead of
Kyle — but it does not remove the need to represent "a run divided into boxes in two dimensions."
That representation is the cell model. Face-first drawing is an **authoring mode on top of cells**,
not a replacement for them. And manual authoring never goes away regardless, because it is the
override path when the solver is wrong.

**Everything else waits on it anyway.** Intent tags attach to cells. The snapshot serializes cells.
Per-box seam reveals are a provenance case. Building P1–P3 first would mean rewriting all three when
cells land. Cells first is the cheaper order.

**Amendment — build the auto/pinned distinction in from the start.** `run.items` already carries
`auto` items with `width: null` and an `autoCount` flag. Carry that into two dimensions, and add one
more thing every cell records: **who decided its size** — `auto` (derived), `manual` (Kyle typed
it), or `solved` (a solver wrote it, and it stays until unpinned).

Nothing writes `solved` for a long time. Adding the field now costs one enum on a shape that is
being designed this week; adding it later is a migration across every saved room plus a rewrite of
the splitter's contract. This one field is what makes §7 possible without a second shape change.

The thing to watch is not AI-readability — precision helps a reader, ambiguity hurts it, and cells
are precision. The thing to watch is the **drawing burden**. The original goal was quick to draw.
Auto-split should keep carrying the ordinary 90%; cells should be the escape hatch for the desk run
and the 72" over two 36"s. If routine kitchens start needing hand-built cell trees, that is the
signal to stop and reconsider, and it is a UI signal, not a model one.

---

## 4. 3D — not yet, and it is not on this path

**The model is already 3D. Only the views are 2D.** Every piece carries x, z, depth and face
rectangles. Anything a 3D view would reveal — collisions, door swings, appliance clearances, crown
running into a soffit — is computable from the data by a checker that reports in the panel. A 3D
view is a *display* for those errors, and the display is the expensive part.

**It is orthogonal to the AI layer.** AI reads the snapshot, not pixels. 3D neither helps nor blocks
anything in this plan.

The real distinction is the one already sensed: a read-only **viewer** is not a 3D **editor**. An
editor means a third authoring surface, three sets of gestures, three selection models, three sets
of drag semantics — that is the complex design system, and it is a different product. A read-only
viewer fed by `resolveRoom()`'s output is purely additive: no model change, no new gestures, delete
it if it doesn't earn its place.

So: don't build it now. When there's a reason — client presentation is the most likely one, not
error-catching — build the read-only viewer off the snapshot. Which is one more argument for P1.

---

## 5. Build order

### Stage A — Cut the cost floor (step 153, before anything else)

**Split `PropertiesPanel.jsx` into per-selection sections.** Already logged in `TODO.md` as a P1;
it has grown from 1,642 to 2,238 lines since that entry was written. Nearly every step below touches
it, and an agent re-reads it three or four times per step at roughly 27k tokens a read.

`RunSection`, `PieceSection`, `CellSection`, `OpeningSection`, `WallSection`, `SettingsSection` under
`components/properties/`, shared `Field` and `InchInput` wiring staying put. Pure presentation split,
no behavior change, no new state.

**Done when:** no file under `components/properties/` exceeds ~400 lines and the suite passes
untouched.

This is the highest-return single step in the plan and it pays out on every step after it. Do it
before cells, not after — cells will touch the panel heavily.

### Stage B — Cells

Specified in the parallel session. Two amendments from §3:

- every cell records its size mode: `auto` | `manual` | `solved`
- auto semantics carry into two dimensions — a cell with a null size resolves from its siblings, the
  way `splitRun` already resolves auto items

Expect a block of steps. A shape change is its own step (conventions rule 4), so the cell tree shape
lands green and inert before anything draws it.

### Stage C — Provenance (2 steps)

**C1 — thread source through the resolvers.** Every resolver that returns a number returns
`{ value, source }` where it doesn't already. Reveals set the pattern; extend to depths, heights,
end types, widths, corner clearances. Shape change, no behavior change, suite stays green.

**C2 — surface it.** The properties panel shows the resolved value and where it came from, as the
reveal fields already do.

**Done when:** for any number in the panel, it is one glance to tell a deliberate value from a
default.

### Stage D — Intent (2 steps)

**D1 — shape.** `purpose` (from a fixed vocabulary, nullable) on cells; `notes` (free text) on room,
wall, run, cell and face. Schema bump and migration. Nothing reads them yet.

**D2 — UI.** A purpose picker in `CellSection`, a notes field in each section. Purposes get a glyph
in elevation so a room reads at a glance.

**Done when:** a drawn kitchen can say which box is the sink base and carry a sentence about the
peninsula.

### Stage E — The resolved snapshot (3 steps)

**E1 — `model/resolveRoom.js`.** One pure function, returns plain JSON, no React. Assembles
`splitRun`, `runFaceLayouts`, `resolveVertical`, `resolveHorizontal`, `blindEntries`, `partNumbers`,
`wallEndPanels`, `dimensions`, `roomDiagnostics`, plus C's provenance and D's intent. Versioned
(`snapshotVersion`).

**E2 — golden fixtures.** Three real rooms serialized to golden files: a plain kitchen, one with a
blind corner and a soffit, one with cells and an island. These become the regression net for every
change after this, and the input fixtures for every AI prompt in Stage G.

**E3 — make it the geometry payload.** PLATFORM-PLAN Phase 1's `toDrawingPayload` becomes a thin
projection of the snapshot rather than its own construction. One derivation, four consumers.

**Done when:** the whole resolved room is a JSON file you can open, read and diff.

### Stage F — The rulebook (1 step + content)

Rules split in two, and the split is the whole design:

**Hard rules** stay in code, in `roomDiagnostics`. Deterministic, enforced as you draw. Every check
that can move here should, because it shrinks what AI has to be trusted with.

**Shop rules** become data: `{ id, scope, severity, statement }`, where `statement` is prose.
Versioned per team, snapshotted into a revision alongside settings and options so a report from
October regenerates in March.

> `SR-014` · scope `cabinet` · severity `warn` · "Sink bases get a false front, never a drawer."
> `SR-022` · scope `run` · severity `info` · "Drawer banks over 42" get a center support."

Seed content comes from the existing job-processing checklist — already logged in `TODO.md` as
"Upload current job processing checklist document to inform AI on current rules for processing."
That document is the single highest-value input to this whole stage and writing it down is Kyle's
work, not an agent's.

### Stage G — One report, end to end (3–4 steps)

Pick the narrowest valuable report and do it completely: **door and drawer front order, separated by
style and size** (`TODO.md`, idea inbox). Small, verifiable against an order Kyle has already placed
by hand, and immediately useful.

- **G1** — report contract: structured output schema, not prose. Line items with part numbers.
- **G2** — the prompt: snapshot + rulebook in, JSON out. Lives in the repo, versioned, with the E2
  goldens as its test fixtures.
- **G3** — render and export.
- **G4** — reconciliation: a room Kyle has built produces the order he actually placed.

**Done when:** a drawn room produces a front order Kyle would send to the supplier without editing.

### Stage H — The review pass (2–3 steps)

The "catch what isn't thought through" half. Same inputs, different output: findings, not lines.

`{ rule_id, severity, part_number, wall, finding, suggestion }` — structured so findings pin to the
drawing instead of arriving as a wall of text, and so a dismissed finding stays dismissed.

Three categories, and the third is the one only AI can produce:

1. **Violated** — a rule the design breaks.
2. **At risk** — a rule the design is close to breaking.
3. **Unaddressed** — something in the design no rule covers and nobody decided.

### Stage I — The solver, and face-first drawing (later, after E)

The "draw the result, let the system work out the boxes" ambition. Not started until the snapshot
exists and cells carry `solved`.

- **I1** — `solveBoxes(span, faceGrid, constraints)`: deterministic, returns **ranked valid splits
  with reasons**, not one answer. An extension of what `splitRun` already does — it is the same
  problem in two dimensions with a cost function.
- **I2** — accepting a solution writes `solved` cells into the document. Stable across regeneration,
  overridable per cell, diffable between revisions.
- **I3** — face-first drawing mode: draw the elevation as a grid of doors and drawer fronts, boxes
  fall out underneath. Face frame is the natural proving ground — one frame already spans the run,
  so faces and boxes are already somewhat independent there. European is harder, because box edges
  show in the reveals.
- **I4** — AI around the solver: constrain it from the rulebook, explain its choice, handle the
  no-solution and three-equal-options cases.

---

## 6. Who builds what

| Work | Who | Why |
|---|---|---|
| Stage A panel split | Codex | Mechanical, huge, verified by "suite passes untouched" |
| C1 threading source through call sites | Codex | Fan-out with the sites pasted in |
| D1 shape + migration | Codex | Well-specified, schema bump, tests green |
| E2 golden fixtures | Codex | Generate, eyeball, commit |
| Cell model design | Claude | Domain judgment, new abstraction |
| E1 snapshot shape | Claude | The contract four consumers depend on |
| F rulebook schema | Claude | Gets the hard/soft split wrong easily |
| G2 report prompts | Claude | Iterative, judgment-heavy |
| I1 solver cost function | Claude | Encodes shop preference, not just constraints |

The pattern: **Codex for work that is fully specified and locally verifiable; Claude for work where
the specification is the hard part.** A SPEC file that is genuinely complete is a Codex job by
definition — which is an argument for writing the SPEC carefully rather than for using the more
expensive model.

---

## 7. What to write next

1. **`SPEC-30` / `PROMPTS-30` — the PropertiesPanel split.** One step, Codex, do it before cells.
2. Finish the cell design in the parallel session, with the `auto | manual | solved` amendment
   folded in before the shape step is written.
3. Write the job-processing checklist down. It gates Stage F, it is pure content, and no agent can
   do it.

Stages C through E can be specified in detail once cells land and their shape is known.

---

## 8. Open decisions

1. Does `purpose` live on the cell, the face, or both? A sink base is a box; a false front is a
   face. Probably the cell, with faces inheriting.
2. Does the snapshot embed diagnostics, or sit beside them? Embedding makes one artifact; separating
   keeps it pure. Leaning embedded, in a `diagnostics` key.
3. Are shop rules per team, per phase, or both? PLATFORM-PLAN's option resolution already answers
   this shape — reuse `resolveOption`'s chain rather than inventing a second one.
4. Does a report run against a revision only, or also against the working copy? Reports against a
   working copy are useful while drawing and dangerous to send. Probably both, watermarked.
5. How much does the front-order report need from catalogs that don't exist yet (PLATFORM-PLAN
   Phase 5)? If the answer is "a lot," Stage G moves after Phase 5.
