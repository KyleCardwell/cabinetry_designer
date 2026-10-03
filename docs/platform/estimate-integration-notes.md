# Designer → Estimate Integration Notes (2026-09-16)

Read-only, targeted look at ff-job-schedule-v1: the estimate schema, cabinet storage, presets and calculation entry points. Nothing was changed.

## How estimates are stored
`estimate_projects` → `estimates` (versions, `is_current`) → `estimate_tasks` (rooms) → `estimate_sections` → `estimate_cabinets` / `estimate_accessories` / `estimate_lengths` / `estimate_other`.

- **`estimate_sections`** holds everything about materials and style:
  - `cabinet_style_id`, `box_mat`, `face_mat`, `door_mat`, `drawer_front_mat`, `drawer_box_mat`
  - finishes (bigint[]), hinge/slide/pull IDs, door/drawer styles, panel mods, molding flags
  - pre-wire-brushed flags, `parts_included`, `services_included`, profit/commission/discount

  NULL means inherit through three tiers: section → estimate `default_*` → team `default_*` (`utils/estimateDefaults.js`).
- **`estimate_cabinets`** holds:
  - `type` (FK `cabinet_types`: 1 base, 2 upper, 3 tall, 5 filler, 10 end panel, 11 appliance panel, …)
  - `width`/`height`/`depth`, `quantity`
  - `face_config` JSONB, `type_specific_options` JSONB (corner_45, blind, count_base/top_molding, …)
  - the `finished_left`/`right`/`top`/`bottom`/`back`/`interior` flags, `cabinet_style_override`, `saved_style_id`, and `fin_back_*` overrides
- **`face_config`** is a tree: containers are `{direction: horizontal|vertical, children}`, and leaves are door, pair_door, drawer_front, false_front, panel or open. Each node is positioned (x/y/width/height) and carries root reveals from `cabinet_styles` type config, plus derived `faceSummary` and `boxSummary`.

## Existing pieces that line up with the new designer
- **The face tree** (`CabinetFaceDivider`, `createFaceConfig`) is the same idea as splitting a rectangle into doors and drawers.
- **Cabinet group presets** (`config/cabinetGroupPresets.js`) are already a "run" concept: left/right ends (filler or end panel) plus core rows.
- **`createCabinetItemFromPresetRow({row, cabinetTypes, cabinetStyles, cabinetStyleId})`** in `utils/cabinetPresetItemBuilder.js` turns a simple row into a full `estimate_cabinets` record. That row is `{typeId, width, height, depth, quantity, facePresetKey, rootFaceTypeAboveWidth, itemOverrides}`. **This is essentially the designer → estimate converter already.**
- **Pricing is plain JS** with no React/Redux imports: `getSectionCalculations(section, context)` + `createSectionContext(section, estimate, catalogData)`. It can be extracted into a shared package.

## Implications for the designer layout JSON
- Use real `cabinet_types` IDs (`cabinetTypeId`) instead of "base/upper/tall" strings.
- Describe faces with the estimator's vocabulary: a `facePresetKey` (e.g. "3df") or a layout tree `{direction, children, type}` using `FACE_NAMES`. Don't invent a second face format.
- Materials, style and hardware live at section level. A room in the designer needs a list of "finish groups" with the same fields as `estimate_sections`, where null means inherit. Each run (or item) references one. Designer room = estimate task; finish group = estimate section.
- The designer can do the heavy lifting automatically:
  - `finished_left`/`right` from exposed run ends
  - `blind`/`corner_45` from corner rules
  - `count_base_molding`/`count_top_molding` from run type
- Reveals should come from `cabinet_styles` (as the estimator does), not from cabinetry_designer_api `SYSTEM_DEFAULTS`. `cd_team_defaults` overlaps with `teams.default_*` and should be reduced to geometry-only params.
- **Geometry opportunity:** have geometry draw from the positioned `face_config` tree instead of its own `face_layout.py`, so drawings and estimates always agree.

Sketch:
```json
{
  "schemaVersion": 1,
  "runs": [{
    "id": "run_a", "cabinetTypeId": 1, "x": 0, "width": 120, "z": 0, "height": 34.5, "depth": 24,
    "finishGroup": "painted",
    "ends": {"left": "filler", "right": "end-panel"},
    "items": [
      {"id": "i1", "cabinetTypeId": 5, "width": null},
      {"id": "i2", "cabinetTypeId": 1, "width": 36, "locked": true, "facePresetKey": null, "faceLayout": {"type": "pair_door"}},
      {"id": "i3", "cabinetTypeId": 1, "width": null, "facePresetKey": "3df", "typeSpecificOptions": {}}
    ]
  }]
}
```
Room level: `finishGroups: [{key: "painted", cabinet_style_id, box_mat, face_mat, face_finish, hinge_id, ...}]` (null means inherit from the estimate or team).

**Export path:** room → `estimate_task`; each finish group → `estimate_section`; each item → a preset row → `createCabinetItemFromPresetRow` → `estimate_cabinets` (quantity 1, or identical pieces collapsed).

## Cautions
- The app is live, so extract shared code gradually and keep the estimator's behavior identical.
- There are hardcoded catalog IDs in presets and fallbacks: style 13, type IDs 1/2/3/5/10/11.
- `face_config` stores derived summaries, so they must be recomputed whenever the tree changes.
- Candidates for a shared package: `utils/constants`, `config/cabinetItemTypes`, `config/cabinetFacePresets`, `utils/cabinetPresetItemBuilder`, `utils/getSectionCalculations` (+ its imports), `utils/createSectionContext`, `utils/estimateDefaults`.
