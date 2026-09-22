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
- Phases are designer-only for now. `design_phases.estimate_id` links to an estimate when one
  exists; adding `phase_id` to `estimates` later is a one-column migration.

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
- [ ] Autosave with the version check; conflict banner ("Mike saved this 2 minutes ago").
- [ ] Realtime presence per room; second viewer opens read-only with an explicit take-over.
- [ ] IndexedDB draft cache so a dropped connection loses nothing.
- [ ] One-time import of the existing `localStorage` document into a room.
- [ ] Document schema version + migration function living in the shared package.

**Done when:** two people at the shop work in different rooms of one phase all day without stepping on each other.

### Phase 3 — Revisions and output

- [ ] Migration: `design_room_revisions`, `design_outputs`, storage bucket and policies.
- [ ] "Issue" flow: validation gate, label, status, immutable snapshot.
- [ ] Generate from a revision through the API; store DXF + PDF in `design_outputs`.
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
- [ ] "Create estimate from revision": writes an estimate version recording its source revision.
- [ ] Reconciliation check: a known room prices the same in both apps.

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
2. Can a phase have several estimates (revisions of price), or one estimate with versions as today?
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
