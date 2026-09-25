# Cabinetry Designer — Platform Plan (2026-09-22)

How the three designer repos, Supabase and ff-job-schedule fit together once the Elevation Lab
becomes a production drawing app used by more than one shop. This file is the source of truth for
structure and sequencing. Per-step work still lands as `SPEC-N.md` / `PROMPTS-N.md` under the
conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md`.

---

## 1. Where things stand

| Repo | State | Fate |
|---|---|---|
| `cabinetry_designer` | Elevation Lab through step 108. Full room model in `src/elevation/model`, persisted only to `localStorage` (`cd.elevationLab.v3`). | Keeps everything. Gains persistence, options, revisions. |
| `cabinetry_designer_api` | Express + Supabase + Zod, built for the drag-and-drop model (`cd_walls`, `cd_placed_objects`). Those tables were never created. | Routes and `parameterResolver` are deleted. Becomes a generation + integration service. |
| `cabinetry_designer_geometry` | Working Python engine, but its input is placed objects and it lays faces out itself. | Kept. Input model replaced with the drawing payload; face layout comes from the payload. |
| `ff-job-schedule-v1` | Live. Teams, roles, catalogs, estimates, pricing. | Untouched for now. Source of truth for accounts, catalogs and pricing. |

The old `cd_*` migration (`supabase/migrations/001_create_cd_tables.sql`) is discarded, not migrated.

---

## 2. Decisions

**D1 — Hierarchy.** `team → project (estimate_projects) → phase → room → wall → run → cabinet → face`.
A phase is one body of work ("Original build 2026", "Kitchen remodel 2029"). Rooms belong to a
phase, never directly to a project, so old rooms are never confused with current ones. Starting a
drawing creates the `estimate_projects` row if it doesn't exist.

**D2 — A room is one JSON document.** `design_rooms.document` holds the elevation document (today's
v3 shape minus UI state). Walls, runs, items and faces are not separate rows. The model is a tree
with cross-references (anchors, joints, landings, pins) and is always edited as a unit.

**D3 — Working copy vs. revision.** The document autosaves constantly and nobody thinks about
versions. A revision is created only by issuing (to a client, or to the shop), and is frozen.
Drawings, PDFs and estimates always come from a revision.

**D4 — One options mechanism, not a column per feature.** Door edges, panel profiles, moldings,
furniture bases, light rails, light troughs, applied moldings and everything not yet thought of are
all *option families* resolved through the hierarchy by one resolver. See §3.

**D5 — Catalogs are shared and upgraded, never duplicated.** One `wood_catalog`, one set of
`hardware_*`, one `cabinet_types`. They get drawing-grade detail added. A second copy for the
designer would put drawings and estimates out of sync within a year.

**D6 — Supabase RLS is the security boundary.** The front end reads and writes design data directly,
as ff-job-schedule does, guarded by `has_team_permission()`. The API is not in that path.

**D7 — The API's job is generation and integration.** Given a `revision_id`: check permission, load
the revision, build the drawing payload with shared code, call geometry, store the output. Plus
"push to estimate". Nothing else.

**D8 — Geometry is a pure renderer.** Payload in, DXF/PDF out. It computes no cabinet sizes and no
face layouts. All of that already exists in `src/elevation/model` and must not be reimplemented in
Python.

**D9 — Shared JS package.** The room model and the estimator's pricing move into one package both
apps and the API consume. Separate repo, consumed as a pinned git dependency.

---

## 3. The options system (how the app absorbs growth)

This is the part that decides whether adding "light trough" in eight months is an afternoon or a
migration.

**An option family** is a kind of choice: `door_edge`, `panel_profile`, `crown`, `top_mold`,
`base_mold`, `furniture_base`, `light_rail`, `light_trough`, `applied_mold`, `hinge`, `slide`,
`pull`, `box_material`, `face_material`, `finish`, …

**Registry (code, in the shared package).** One entry per family:

```js
{ slug: 'light_rail', label: 'Light rail',
  scopes: ['team', 'phase', 'room', 'run', 'cabinet'],   // where it may be set
  cardinality: 'one',            // 'one' | 'many' (finishes are 'many')
  required: false,
  affectsGeometry: true, affectsEstimate: true }
```

**Catalog (database, per team).**

```sql
team_options (
  option_id uuid pk, team_id uuid, family text, name text,
  active bool, sort int,
  spec jsonb,        -- family-specific: dimensions, profile outline, projection, drop
  refs jsonb,        -- links into existing catalogs: {wood_catalog_id, hardware_id, ...}
  created_at, updated_at
)
```

`spec` is JSONB so a new family needs no migration. Each family's spec shape is validated in the
shared package with Zod, so it is still checked — just not by the database.

**Assignment.** Every scope node carries an `options` map: `{ crown: "<uuid>", door_edge: null }`.
Team-level lives in `design_team_settings`, phase-level in `design_phases`, and room/run/cabinet/face
levels live inside the room document. `null` means inherit.

**Resolution.** One function in the shared package:

```js
resolveOption(family, chain)   // chain = [team, phase, room, wall, run, cabinet, face]
resolveOptions(chain)          // every family at once, with the level each came from
```

The UI shows the resolved value plus where it came from, the same way `REVEAL_SOURCE_LABELS` does
today. Geometry never resolves anything: the payload carries resolved values.

**Adding a family later:** one registry entry, catalog rows, one properties-panel section, and a
geometry handler if it draws. No schema change, no changes to unrelated code.

**Validation before issuing:** every `required: true` geometry family must resolve to something.
Unresolved options are listed as issue-blocking warnings, next to existing room diagnostics.

---

## 4. Data model

New tables (`design_` prefix; catalogs are shared, so they are not prefixed):

```
design_team_settings   team_id pk, settings jsonb, options jsonb, updated_at
design_phases          phase_id uuid pk, team_id, est_project_id, name, status,
                       options jsonb, defaults jsonb, sort, created_by, created_at, archived_at
design_rooms           room_id uuid pk, team_id, phase_id, name, sort,
                       document jsonb, schema_version int, version int,
                       updated_by, updated_at, archived_at
design_room_revisions   revision_id uuid pk, room_id, team_id, number int, label text,
                       status text ('draft'|'issued'|'approved'|'released'|'superseded'),
                       document jsonb, settings_snapshot jsonb, options_snapshot jsonb,
                       created_by, created_at            -- immutable
design_outputs         output_id uuid pk, revision_id, kind ('elevation_dxf'|'plan_dxf'|'pdf'),
                       storage_path, input_hash, status, created_at
team_options           (see §3)
```

Notes:

- UUID primary keys for design tables (the document already references things by client-made id).
  The estimator's bigint identities stay as they are.
- `team_id` on every row, RLS on every table, checks via `has_team_permission()` with new
  permissions: `view_designs`, `edit_designs`, `issue_revisions`, `manage_design_settings`.
- `design_rooms.version` is a plain integer for optimistic concurrency.
- Revisions store a settings and options snapshot, so a later rule change never alters an old
  drawing.
- Storage bucket `cd-drawings` for DXF/PDF, team-scoped paths.
- Phases are designer-only. The `estimate_*` tables get no new columns and no designer rows (D10).

### D10 — The estimator and the designer share code, not tables

ff-job-schedule stores no finalized prices: opening an estimate recalculates everything from current
catalogs and settings, so a price change only needs a fresh print. The designer works the same way
and goes one step further — it writes no estimate rows at all.

- **The estimator is untouched.** Estimates are still created inside it, without regard for the
  designer. No `phase_id`, no design columns, no design-sourced sections. Creating an estimate on
  the fly with no drawing works exactly as it does now.
- **A designer estimate is generated, priced and rendered in the browser**, then saved as a PDF in
  `design_outputs` (`kind = 'estimate_pdf'`). The PDF is the record. Nothing in `estimates`,
  `estimate_tasks`, `estimate_sections` or `estimate_cabinets` is written.
- **The only thing shared is the logic**: the pricing engine in the shared package, plus
  `designRoomToEstimateItems(room, options, catalogs)` which turns a design room into the
  estimator-shaped items the engine expects. One pricing implementation, two callers.
- **Scheduling is its own path.** Hours and prices are computed in the front end either way, and
  `add_estimate_to_schedule` already takes them as `p_groups` JSONB. The designer gets a sibling RPC
  taking the same group shape, with the back-link stored on the designer side rather than on
  `estimate_sections.scheduled_task_id`.

Consequence to accept: there is no queryable history of designer estimates, only PDFs and whatever
`design_outputs` records about them. That matches how the estimator already treats prices. If a job
list ever needs "what we quoted", a small totals column on the output row is the cheapest fix, and
it is the one place a stored number would be legitimate — it records what was sent, not what
something costs now.

### Writes go through RPCs

Invariants live in `security definer` functions, as they already do in ff-job-schedule
(`duplicate_estimate_rpc`, `revise_section_rpc`, `move_item_rpc`). Then it does not matter whether
the browser or the API is calling: the rules are enforced in one place.

| RPC | Why it isn't a plain write |
|---|---|
| `save_room_document(room_id, document, expected_version)` | Version check + bump, atomic; returns the new version or the conflict. |
| `create_design_phase(...)` | Project row if needed, phase, defaults, first room. |
| `duplicate_room(...)` / `duplicate_phase(...)` | New ids throughout a copied document. |
| `issue_room_revision(room_id, label)` | number = max + 1 under concurrency, snapshot, supersede the prior revision, update room status. |
| `release_revision(revision_id)` | Status transition plus the guard against releasing twice. |
| `record_design_output(revision_id, ...)` | Output row + status, after the file lands in storage. |
| `add_design_to_schedule(...)` | Schedule project + tasks + subtasks from front-end-computed groups; sibling of `add_estimate_to_schedule`, same `p_groups` shape. |

Rules for every one of them:

1. `security definer` means RLS does not apply inside, so the first statement is a
   `has_team_permission()` check. No exceptions.
2. Keep them thin — permission check, validate, write. No pricing and no geometry math in plpgsql;
   that lives in the shared package where it is tested and shared with the browser.
3. Reads stay plain RLS-guarded selects and views.

---

## 5. The drawing payload (contract v1)

Built by shared code from a revision, consumed by geometry. Versioned (`payloadVersion`) and
validated on both sides — Zod in JS, Pydantic in Python.

Per room: name, phase/room labels, wall order, units, sheet settings.
Per wall: id, label, length, height, side, openings, soffits, profile heights.
Per piece (cabinet, filler, end panel): x and z along the wall, width, height (box only — the toe
kick sits below, not inside), depth, style, resolved options.
Per cabinet: face rectangles `{type, x, z, width, height}` exactly as `runFaceLayouts` produces them.

Geometry draws what it is given. Adding crown or a light rail means adding a handler for that
option's `spec`, not new layout math.

---

## 6. Phases and checklist

Ordered so something useful works early and nothing is built twice.

### Phase 0 — Groundwork

- [ ] Settle how phases relate to `estimates` in ff-job-schedule (now vs. later; a phase with 0, 1 or many estimates).
- [ ] Create the shared package repo (`ff-cabinet-core`): model exports first, pricing later. Pinned git dependency.
- [ ] Move `src/elevation/model/**` into the package; `cabinetry_designer` imports it. No behavior change, suite stays green.
- [ ] `.env` for the API; document local dev (Vite, API, geometry venv).
- [ ] Point `geometryBridge` at a configurable Python path (`GEOMETRY_PYTHON`), not bare `python`.

**Done when:** the Elevation Lab runs unchanged off the shared package.

### Phase 1 — Draw one wall end to end (no database)

- [ ] Define the payload contract v1 (§5) in the shared package, with Zod validation.
- [ ] `toDrawingPayload(room, settings)` built on `layoutRun` / `runFaceLayouts` / `resolveVertical`.
- [ ] Geometry: new Pydantic models + `generate --payload v1`; draw wall outline, pieces, face outlines; toe kick below the box. Delete the placed-object path once the new one works.
- [ ] API: `POST /api/drawings/preview` — auth, validate, spawn geometry, return DXF.
- [ ] Front end: "Send to drawing" button; download the DXF.
- [ ] Geometry tests: one wall with base + upper runs, a filler, an end panel.

**Done when:** a room drawn in the browser produces an elevation DXF that opens correctly in CAD.

### Phase 2 — Persistence and multi-user

- [ ] Migration: `design_phases`, `design_rooms`, `design_team_settings`, RLS, permissions.
- [ ] Project/phase/room browser UI; create a phase, create a room, open a room.
- [ ] Create the `estimate_projects` row when a drawing starts; select an existing project otherwise.
- [ ] RPCs: `save_room_document`, `create_design_phase`, `duplicate_room`, `duplicate_phase`, each opening with a `has_team_permission()` check.
- [ ] Autosave through `save_room_document`; conflict banner ("Mike saved this 2 minutes ago").
- [ ] Realtime presence per room; second viewer opens read-only with an explicit take-over.
- [ ] IndexedDB draft cache so a dropped connection loses nothing.
- [ ] One-time import of the existing `localStorage` document into a room.
- [ ] Document schema version + migration function living in the shared package.

**Done when:** two people at the shop work in different rooms of one phase all day without stepping on each other.

### Phase 3 — Revisions and output

- [ ] Migration: `design_room_revisions`, `design_outputs`, storage bucket and policies.
- [ ] "Issue" flow: validation gate, label, status, immutable snapshot — through `issue_room_revision`; `release_revision` for the shop release.
- [ ] Generate from a revision through the API; store DXF + PDF via `record_design_output`.
- [ ] PDF sheet layout in geometry: title block, room/phase/rev, wall elevations, dimensions.
- [ ] Revision list per room: who, when, status, the files.
- [ ] Release-to-shop status, with edits after release flagged.

**Done when:** "what did we send the client on 10/3" is one click, and the shop builds from a numbered revision.

### Phase 4 — Options foundation

- [ ] `team_options` table + family registry in the shared package.
- [ ] `resolveOption` / `resolveOptions`, with source labels; folds in today's style and profile resolution.
- [ ] Options UI sections at team / phase / room / run / cabinet / face, showing inherited values.
- [ ] Two families end to end, one that draws and one that doesn't: `crown` and `door_edge`.
- [ ] Geometry handler for a drawn profile (outline in `spec`, projection and drop).
- [ ] Unresolved required options become issue-blocking warnings.

**Done when:** adding the third family touches only the registry, a catalog screen and one geometry handler.

### Phase 5 — Catalogs and construction rules

- [ ] Audit each existing catalog for what drawing needs that estimating didn't (thickness, projection, profile outline, reveal implications, hardware geometry).
- [ ] Additive migrations on the shared catalogs; no designer-only copies.
- [ ] Construction rules table: per-team, per-style reveal rules, replacing the temporary reveals on `cabinet_styles`; keep the estimator working off the old values until it's moved.
- [ ] Remaining option families as catalog data: panel profiles, moldings, furniture bases, light rails, light troughs, applied moldings.
- [ ] Remove hardcoded IDs (style 13, types 1/2/3/5/10/11) in favor of `team_cabinet_types` / `team_cabinet_styles`.

**Done when:** a second shop's catalog can be entered without code changes.

### Phase 6 — Estimating

- [ ] Extract pricing into the shared package (`getSectionCalculations`, `createSectionContext`, `createCabinetItemFromPresetRow`, defaults chain). ff-job-schedule switches to the package; behavior identical.
- [ ] Finish groups at phase/room level, mapping to `estimate_sections`.
- [ ] Live estimate panel in the designer, calculated in the browser, nothing written.
- [ ] Migration: `estimates.phase_id`, `estimate_sections.design_finish_group` (nullable, additive).
- [ ] `designRoomToEstimateItems(room, options, catalogs)` in the shared package: a design room → estimator-shaped cabinet items in memory.
- [ ] `create_estimate_for_phase` RPC: estimate + one commercial section per finish group.
- [ ] Estimator: open a design-sourced estimate, derive cabinets at load, render those rooms read-only.
- [ ] Reconciliation check: a known room prices the same whether entered by hand or drawn.

**Done when:** a drawn room produces an estimate that matches what the estimator would have produced by hand.

### Phase 7 — Production hardening

- [ ] RLS tests: a second team sees nothing; permissions honored per route.
- [ ] Error handling and recovery: failed generation, offline save, stale document.
- [ ] Audit columns and an activity log on issue/release.
- [ ] Deployment: API and geometry hosted, Vercel front end, env management.
- [ ] Onboarding a new team: catalogs, settings, users, invites.
- [ ] Performance pass on large rooms and the room list.

---

## 7. Open decisions

1. Do phases go into ff-job-schedule now, or stay designer-only with a link added later? (Leaning later.)
2. Does an old estimate re-derive from the current drawing, or pin a revision once it is sent? Live everywhere is simplest and the sent PDF is the record; pinning on send is the fallback if "what did we quote in January" needs to be answerable from data.
3. Is a revision per room, or per phase (an issue set bundling one revision per room)? Per room is simpler; issue sets can wrap it later.
4. Does the shared package hold the whole `elevation/model`, or just the parts the server needs?
5. Geometry as CLI subprocess (today) or a small FastAPI service? CLI is fine until generation gets slow or concurrent.
6. Do drawings ever need to reference a catalog row *as of* the issue date, beyond the settings snapshot?

---

## 8. Working notes

- One SPEC per phase, steps sized per `PROMPT-CONVENTIONS.md`. A shape change is its own step.
- Migrations land in `cabinetry_designer_api/supabase/migrations`, one file per phase, never edited after being applied.
- The document schema version and its migrations live in one place in the shared package, used by the browser, the API and any backfill.
- Keep `ff-job-schedule-v1` behavior identical through Phase 6; it is live and in daily use.
