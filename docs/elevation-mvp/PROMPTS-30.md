# Elevation Lab — Codex Prompts, Steps 153–154 (splitting the properties panel)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Order:** 153 first. 154 needs 153.

**Baseline is 522 passing**, with SPEC-29's steps 150–152 all in. Confirm with `npm test` before step 153; if the number differs, use that number in both prompts instead. Nothing else here depends on the count.

**Codex can't open the app**, so don't plan browser checks. Kyle checks each step by hand — the lists are in SPEC-30 §6.

**The gate is the same for both steps:** these steps add no tests, so run `npx vitest run` once at the end of each. Then `npm test && npm run lint` once. Don't run `npm run build`.

**The shape of this SPEC:** it is one refactor cut in half so neither session has to emit 2,238 lines of moved code faithfully. The extractions are independent — each one is cut a block, paste it into a new file, add its imports, import it back — so the suite is green after every single one, and after each step. Nothing about the app changes in either step.

**Why it's split where it is:** 153 takes the shared helpers and the five small sections, which is what the large sections in 154 depend on. 154 takes the three big ones. Both stay inside the ~2,500-line budget in the conventions.

---
## Step 153 — Shared pieces and the small sections

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-30.md §1–§5, step 153 table in §3.
If `git status` shows uncommitted changes, stop and tell me.

Pure refactor. Move code out of one file into new files. NO behavior change, NO new tests, NO edits to any test file.

Files:
- src/elevation/components/PropertiesPanel.jsx (2,238) — the only file you cut from. Ends this step at ~1,340 lines.
- src/elevation/components/properties/ — destination folder, already exists with six components. Copy their shape: default export, imports reaching up one level.

Move these blocks, VERBATIM, to these new files. Line ranges are inclusive, against HEAD:

  176–184  Field                     -> properties/Field.jsx            (default export)
  185–195  ReadOnlyValue             -> properties/Field.jsx            (named export)
  105–110  RUN_TYPES                 -> properties/constants.js         (named export)
  111–117  END_TYPES                 -> properties/EndFields.jsx        (file-local)
  206–307  EndFields                 -> properties/EndFields.jsx        (default export)
  136–144  ERROR_MESSAGES            -> properties/WarningsList.jsx     (file-local)
  145–150  WARNING_MESSAGES          -> properties/WarningsList.jsx     (file-local)
  308–345  WarningsList              -> properties/WarningsList.jsx     (default export)
  1267–1518 CabinetProperties        -> properties/CabinetProperties.jsx (default export)
  1519–1547 InteriorFillerProperties -> properties/PieceProperties.jsx  (file-local)
  1548–1565 EndProperties            -> properties/PieceProperties.jsx  (file-local)
  1566–1616 PieceProperties          -> properties/PieceProperties.jsx  (default export)
  1939–2111 SoffitProperties         -> properties/SoffitProperties.jsx (default export)

Then import each default export back into PropertiesPanel.jsx from './properties/<Name>.jsx'.

VERBATIM means verbatim. Do not reformat, rename a prop, reorder a hook, extract anything further, or remove anything that looks dead. The ONLY new text in this step is the import block at the top of each new file. If a block looks wrong while you move it, leave it and say so in the summary.

IMPORTS — do not partition the current import block by hand. For each new file add exactly what its moved body references, with paths adjusted one level: '../model/index.js' -> '../../model/index.js', '../model/room.js' -> '../../model/room.js', '../model/topology.js' -> '../../model/topology.js', '../properties/helpers.js' -> '../../properties/helpers.js', '../store/elevationSlice.js' -> '../../store/elevationSlice.js', './InchInput.jsx' -> '../InchInput.jsx', './properties/X.jsx' -> './X.jsx'. Plus React hooks and react-redux per file. ESLint has no-unused-vars: error and no-undef: error, so a leftover import fails lint and a missing one fails by name — lean on that instead of auditing by hand.

Known consumers so you don't have to look: formatRunWarning is used by WarningsList; FaceProperties by CabinetProperties; PartNumberField by PieceProperties. Everything else from helpers.js stays in PropertiesPanel.jsx this step.

THERE IS NO FAN-OUT. PropertiesPanel.jsx has one export (the default at line 2112) and one importer (src/elevation/ElevationLab.jsx:6), and that import does not change. Every symbol above is file-local today. DO NOT grep the repo for these names and DO NOT open any file outside the ones named here — in particular not ElevationLab.jsx, not InchInput.jsx, not properties/helpers.js, and not the six components already in properties/, which gain importers and nothing else.

DO NOT touch OpeningProperties, RunProperties, WallHeightProperties, cornerLabel, CORNER_CLEARANCE_MODES, PLACEMENT_MESSAGES, OPENING_PLACEMENT_MESSAGES, RUN_OVERRIDE_FIELDS or WALL_OVERRIDE_FIELDS. They stay where they are; step 154 moves them.

No tests in this step. Run `npx vitest run` once at the end; 522 must still pass with NO test file edited. A test file in `git diff` means the step went wrong — say so rather than adjusting it.

At most five lines of summary. Commit "elevation-mvp: step 153 extract shared and small property sections".
```

**Check after 153:** nothing should look different anywhere. Click through: a cabinet inside a run (faces and part number render, change a face type), an interior filler, an end piece, a soffit (change the molding), a run with a layout warning (the warnings list still appears), a run end type change.

---
## Step 154 — The three large sections

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-30.md §1–§5, step 154 table in §3.
If `git status` shows uncommitted changes, stop and tell me. Step 153 must be in.

Same refactor, finishing it. Move code, NO behavior change, NO new tests, NO edits to any test file.

Files:
- src/elevation/components/PropertiesPanel.jsx (~1,340 after step 153) — the only file you cut from. Ends this step at ~165 lines: its imports, and the default export unchanged.
- src/elevation/components/properties/ — three new files.

Line numbers shifted in step 153, so these are named by declaration. Each is a single top-level `function` declaration; move it whole, VERBATIM:

  OPENING_PLACEMENT_MESSAGES  -> properties/OpeningProperties.jsx    (file-local)
  OpeningProperties (~263)    -> properties/OpeningProperties.jsx    (default export)
  CORNER_CLEARANCE_MODES      -> properties/RunProperties.jsx        (file-local)
  PLACEMENT_MESSAGES          -> properties/RunProperties.jsx        (file-local)
  RUN_OVERRIDE_FIELDS         -> properties/RunProperties.jsx        (file-local)
  cornerLabel (~10)           -> properties/RunProperties.jsx        (file-local)
  RunProperties (~658)        -> properties/RunProperties.jsx        (default export)
  WALL_OVERRIDE_FIELDS        -> properties/WallHeightProperties.jsx (file-local)
  WallHeightProperties (~322) -> properties/WallHeightProperties.jsx (default export)

Then import the three default exports back into PropertiesPanel.jsx from './properties/<Name>.jsx'.

RunProperties.jsx lands at roughly 710 lines, over the ~400 target in TODO.md. THAT IS CORRECT FOR THIS STEP. Splitting it internally is its own round. Do not attempt it, and do not extract anything else along the way.

VERBATIM means verbatim — no reformatting, no prop renames, no hook reordering, no dead-code removal. The only new text is each new file's import block.

IMPORTS — same rule and same path adjustments as step 153. These three files need, among others: Field and ReadOnlyValue from './Field.jsx', RUN_TYPES from './constants.js' (OpeningProperties and RunProperties), EndFields from './EndFields.jsx' (RunProperties), WarningsList from './WarningsList.jsx' (RunProperties), StretchInput from './StretchInput.jsx' (all three), RunFaceOptions from './RunFaceOptions.jsx' (RunProperties), and from '../../properties/helpers.js': formatRunOverhang, lastCabinetItem, lastRunItem, prepareRunUpdate (all RunProperties). resolveSelectedPiece stays in PropertiesPanel.jsx. Let no-unused-vars and no-undef catch the rest.

When you are done, PropertiesPanel.jsx should contain ONLY its imports and `export default function PropertiesPanel`, byte-identical to what is there now from `export default function PropertiesPanel() {` to the end of the file.

THERE IS NO FAN-OUT — same as step 153. One export, one importer (ElevationLab.jsx:6), unchanged. Do not grep for these names and do not open a file outside the ones named here.

No tests in this step. Run `npx vitest run` once at the end; 522 must still pass with NO test file edited.

At most five lines of summary. Commit "elevation-mvp: step 154 extract run, opening and wall property sections".
```

**Check after 154:** everything from the 153 list, plus a wall with no run (height fields edit), a run (type, ends, overrides, corner clearance, face options; change a run width), an opening (placement message on an invalid move), and an empty click ("Select a wall, run or opening to edit it.").

**After both:** `wc -l src/elevation/components/PropertiesPanel.jsx src/elevation/components/properties/*` — everything except `RunProperties.jsx` should be under 400, and the panel itself around 165. `git show --stat` on each step should be almost all deletions from one file and insertions across the new ones, with no test file in either.
