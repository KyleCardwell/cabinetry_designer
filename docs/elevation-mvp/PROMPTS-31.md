# Elevation Lab — Codex Prompts, Step 155 (splitting RunProperties)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run the step in a fresh session, and commit pending work first, including these docs.

**Baseline is 522 passing**, at `7ca37b4` with SPEC-30 in. Confirm with `npm test` first; if the number differs, use that number in the prompt instead.

**Codex can't open the app**, so don't plan browser checks. Kyle checks by hand — the list is in SPEC-31 §5.

**The gate:** no tests are added, so run `npx vitest run` once at the end, then `npm test && npm run lint` once. Don't run `npm run build`.

**Why one step:** 754 lines move out of one file into five, all in the same folder, so no import path changes. That's well inside the ~2,500-line budget. What's different from SPEC-30 is that the pieces are slices of one function body rather than whole declarations, so the prompt gives every slice by line number and every new signature literally.

---
## Step 155 — Split RunProperties into sections

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-31.md.
If `git status` shows uncommitted changes, stop and tell me.

Pure refactor. Move code out of one file into five new ones. NO behavior change, NO new tests, NO edits to any test file.

Files:
- src/elevation/components/properties/RunProperties.jsx (754) — the only file you cut from. Ends at ~110 lines.
- Five new files in the same folder, src/elevation/components/properties/.

Line ranges are inclusive, against HEAD (7ca37b4). Each new file = its imports, its module-level blocks, then:

  export default function <Name>(<props>) {
    const dispatch = useDispatch();
    <setup slice, verbatim>
    return (
      <JSX slice, verbatim — each is exactly one <section>…</section>>
    );
  }

  RunGeometrySection.jsx
    props:        { wall, run, settings, actionBase, validateAndDispatch }
    setup:        122–136  (overhang, grow locks, runGrow useState + useEffect, runPositions)
    JSX:          180–272

  RunEndsSection.jsx
    props:        { room, wall, run, settings, actionBase }
    module-level: 61–65 CORNER_CLEARANCE_MODES, 88–96 cornerLabel (both file-local)
    setup:        110–121  (corners, reserveParts, blindEntryData useMemo)
    JSX:          274–565

  RunHeightsSection.jsx
    props:        { room, wall, run, settings, actionBase, validateAndDispatch }
    module-level: 72–86 RUN_OVERRIDE_FIELDS (file-local)
    setup:        104–109  (profile, inheritedValues, overrideFields)
    JSX:          567–646

  RunCabinetsSection.jsx
    props:        { run, actionBase }
    setup:        101–103  (finalCabinet, finalItem, cabinetCount)
    JSX:          648–711

  RunPiecesSection.jsx
    props:        { run, layout }
    setup:        none
    JSX:          713–747

In RunProperties.jsx, replace each JSX slice IN PLACE, same order, with:

      <RunGeometrySection wall={wall} run={run} settings={settings} actionBase={actionBase} validateAndDispatch={validateAndDispatch} />
      <RunEndsSection room={room} wall={wall} run={run} settings={settings} actionBase={actionBase} />
      <RunHeightsSection room={room} wall={wall} run={run} settings={settings} actionBase={actionBase} validateAndDispatch={validateAndDispatch} />
      <RunCabinetsSection run={run} actionBase={actionBase} />
      <RunPiecesSection run={run} layout={layout} />

(Break the long ones one prop per line to match the file's style; SPEC-31 §2 shows the exact layout.)

RunProperties.jsx KEEPS: PLACEMENT_MESSAGES (67–70), the signature and dispatch/actionBase (98–100), validateAndDispatch and changeType (138–159), the outer <div> and the Type section (161–178), <RunFaceOptions /> (749), <WarningsList /> (751). Its name, default export, props and its one importer (PropertiesPanel.jsx) do not change.

Every local in RunProperties is used by exactly one section except validateAndDispatch, which Geometry and Heights both get as a prop. This is verified in SPEC-31 §3 — do not re-derive it.

VERBATIM means verbatim. Do not reformat, rename, reorder hooks, memoize, wrap validateAndDispatch in useCallback, split the ends section per side, or remove anything that looks dead. The ONLY new text is: each new file's import block, its signature line, `const dispatch = useDispatch();`, the `return (` / `);` wrapper, and the five call sites. If a slice looks wrong while you move it, leave it and say so in the summary.

IMPORTS — every new file is in the same folder as RunProperties.jsx, so copy import paths UNCHANGED. The exact import list per file is the table in SPEC-31 §4; every file also imports useDispatch from 'react-redux'. RunProperties.jsx ends up needing only useDispatch, prepareRunUpdate, setRunType, updateRun, Field, RUN_TYPES, RunFaceOptions, WarningsList and the five new sections — drop its React import entirely. ESLint has no-unused-vars: error and no-undef: error; lean on that rather than auditing by hand.

THERE IS NO FAN-OUT. Everything you move is local to RunProperties.jsx today. DO NOT grep the repo, and DO NOT open any file except RunProperties.jsx and the five you create — in particular not PropertiesPanel.jsx, InchInput.jsx, helpers.js, the model, the store, or the other files in properties/.

No tests in this step. Run `npx vitest run` once at the end; 522 must still pass with NO test file edited. A test file in `git diff` means the step went wrong — say so rather than adjusting it. Then `npm test && npm run lint` once.

Finish with `wc -l src/elevation/components/properties/*`: RunProperties.jsx ~110, RunEndsSection.jsx the largest at ~355, nothing over 400.

At most five lines of summary. Commit "elevation-mvp: step 155 split run properties into sections".
```

**Check after 155:** nothing should look different. Select a run and go through the nine checks in SPEC-31 §5 — type, width and grow locks, grow resetting between runs, position and the out-of-wall message, depth and overhang, each anchor kind, heights auto/manual/reset, cabinet count, and clicking a piece.

**After:** `git show --stat HEAD` should be about 650 deletions from `RunProperties.jsx` and about 750 insertions across five new files, with no test file listed.
