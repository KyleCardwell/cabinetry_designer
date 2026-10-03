# Cabinetry Designer — Structure Review (2026-09-16)

Scope: cabinetry_designer, cabinetry_designer_api, cabinetry_designer_geometry (ff-job-schedule-v1 not read). Read-only review; no changes made.

## Current state
- **Frontend** (React + Vite + react-konva + Redux; ~2.4k lines). Floorplan wall drawing is solid: endpoint snapping, wall connections, length/angle locks. "Drag-and-drop" is really click-to-add from the catalog, then slide the object along its wall. The 3D viewer (`src/three`) mentioned in the README doesn't exist. Working branch: `package-updates` (not merged).
- **API** (Express + Zod + Supabase service role; ~1.7k lines). CRUD for projects, rooms, walls and objects. It resolves a parameter chain (object → room → project → team → system), spawns Python via CLI, and caches generations by input hash.
- **Geometry** (Python + Pydantic + ezdxf + Shapely). Takes a resolved room as JSON and builds boxes, a floorplan, elevations with hidden-line removal, and reports. `face_layout.py` already splits a single cabinet into drawers and doors. Working branch: `setup-output-fix` (today's commits, not merged).

## Broken connections (need fixing whichever UI you keep)
1. **Walls and objects are never saved.** The frontend only calls GET/PUT on rooms. Nothing calls the batch endpoints, and `fetchRoom` doesn't load walls or objects into their Redux slices.
2. **The `PUT /batch` routes can't be reached.** `PUT /:wallId` and `PUT /:objectId` are registered first, so they catch "batch" as an ID.
3. **Batch save deletes everything, then re-inserts.**
   - It isn't atomic.
   - It creates new IDs on every save.
   - Deleting the walls sets every object's `wall_id` to NULL (`ON DELETE SET NULL`).
4. **The ID types don't match.**
   - The frontend generates UUIDs, but the DB uses BIGINT identity columns.
   - Geometry requires string IDs, and Pydantic v2 rejects integers (verified). Generating from real DB rows would fail.
5. **Object coordinates mean different things.** The frontend stores `x` as the distance along the wall, but geometry treats `x/y` as room coordinates. That's only correct for a wall that starts at (0,0) and runs along +X, which is what the demo uses.
6. **Some frontend fields aren't in the DB.** Wall `connections`, `locks` and `soffit_height`, and object colors, have no columns, and Zod strips them.
7. **Authorization gaps.**
   - The walls and objects routes and room PUT/DELETE never check team ownership, and the service role bypasses row-level security. Any logged-in user with an ID can edit or delete another team's data.
   - The auth middleware uses `.single()` on `team_members`, which fails for users who belong to more than one team.
8. **DXF output.**
   - The API stores only the floorplan DXF. `elevation_dxf_base64` is dropped.
   - Elevations are all walls side by side in one file, not one file per wall.
   - `getPublicUrl` requires a public bucket, which would make client drawings public.
9. **Minor.**
   - The API's `.env.example` contains a real Supabase anon key. Anon keys are meant to be public, but a placeholder is cleaner.
   - The canvas size is hardcoded from the window size.
   - The `.github` security-scan workflow is defensive and looks fine.

## Proposed data model for the elevation / "run" UI
- Add `layout JSONB` to `cd_walls` (one per wall). Keep `cd_placed_objects` for the classic UI for now.
- Store the intent: an ordered list of items per run. `width: null` means the splitter sizes it automatically. Item IDs stay stable, so overrides stick to the right piece.

```json
{
  "schemaVersion": 1,
  "openings": [{"id": "op1", "type": "window", "x": 36, "width": 30, "sill": 42, "height": 40}],
  "runs": [{
    "id": "run_a", "type": "base", "x": 0, "width": 120, "z": 0, "height": 34.5, "depth": 24,
    "ends": {"left": "wall", "right": "finished_panel"},
    "params": {"reveal_gap": 0.125},
    "items": [
      {"id": "i1", "kind": "filler", "width": null},
      {"id": "i2", "kind": "cabinet", "width": 36, "locked": true, "face": "sink_2door"},
      {"id": "i3", "kind": "cabinet", "width": null, "face": "drawers_3"},
      {"id": "i4", "kind": "appliance", "width": 24, "locked": true, "label": "DW"}
    ]
  }]
}
```

- **Splitter** (JS, pure function): runs in the browser for instant feedback. The API uses the same code to expand runs into resolved objects before calling geometry. Geometry's input format stays essentially the same, apart from coordinate and ID fixes.
- **Later:** room-level corner rules, a flat parts table written when a design is finalized (for reports and job schedule integration), and a revision table if needed.

## Estimating integration (future)
- Keep all tables in the same Supabase project as ff-job-schedule-v1, with disciplined migrations, since that DB is live.
- The ff-job-schedule estimating logic runs in its frontend. Plan: first a "send to estimate" step that writes into the existing estimate tables; later, extract the estimating logic into a shared JS package.
- **Layering decision:** keep three separate layers:
  1. The stored layout JSON: simple, and it captures the user's intent.
  2. The expanded cabinet list: derived and detailed.
  3. An adapter that converts that list into the estimator's format.

  The simple UI doesn't have to change the detailed estimate format, and the estimate format doesn't have to shape the layout JSON.
- **Requirement for the layout JSON:** every field the estimator needs (materials, finish, door style, box type, hardware, etc.) must be settable somewhere, whether on the item, run, room, project or team. Usually it's inherited from defaults, so users rarely see it.
- **Next step, when ready:** a targeted, read-only look at ff-job-schedule-v1's cabinet and estimate tables and its estimating functions, to list those required fields.

## Suggested path
0. Tag the current frontend (e.g. `classic-v0`). Fix issues 1–7 (string/UUID IDs, wall-local coordinates, route order, auth checks, a real save path).
1. Prototype the elevation editor on a separate route (`/projects/:p/rooms/:r/elevations`). Reuse the existing floorplan wall drawing. Use local-only JSON and the JS splitter, with no DB yet, then judge whether it's faster.
2. If it is: add `cd_walls.layout`. The API expands layouts, geometry stays unchanged, and the classic UI keeps working with `cd_placed_objects`.
3. Output one DXF per wall, add corner handling, and add the parts table and job schedule hook.
