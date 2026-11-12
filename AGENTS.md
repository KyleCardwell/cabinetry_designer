# Working rules for Codex

Specs live in the `specs` repo, cloned beside this one as `../specs/` (see its README). Each prompt names one step of one SPEC.

- Read the SPEC's **§1 Decisions** and **your step** only. Don't open other SPECs or `../specs/archive/`.
- Start with `git status`. If it isn't clean, stop and tell Kyle.
- The step names the files it expects to touch. Stay in those plus the tests you add. If another file really needs a change, make it and say so in the summary.
- **Searching:** use `rg` (not grep). Fine: `rg -n SYMBOL src` to find call sites of something the step names; `rg -n` inside a named file to find the spot. For a file over ~600 lines, rg to the spot and read that range instead of the whole file. No open-ended exploring.
- **Anchor cases** in the SPEC are hand-checked expected values: put each one in a test (anchors for one rule go in one `it.each` / parametrized test). If the code gives a different number than an anchor, re-check against §1; if it still differs, report what you got. Never change an anchor number to make a test pass.
- **Test budget — keep tests few.** Tests are for what a wrong answer costs: sizes, cut/shipping/order numbers, geometry, run and layout logic, payload shape.
  - Beyond the anchors, add at most 1–3 tests per new rule, and only if the SPEC's "Tests" line allows them.
  - No new tests for UI-only, styling, panel layout, colors, hover or exact drawing coordinates unless the step asks. Kyle checks those in the app.
  - No guard tests ("unchanged", "preserves", "legacy", "still works"): the golden snapshot covers that. No tests for old saved rooms (the app isn't in production).
  - Don't mock React hooks to walk a component tree in a new test; test the logic function instead.
  - If an existing test breaks only because of layout, strings or coordinates the step meant to change, update it or delete it if obsolete, and say which in the summary.
  - Titles name the behaviour, with the round ID at the end: `omits pulls when door and drawer picks are none (HP5)`. No step letters or anchor numbers.
- While iterating, run only the test files you touched, with the quiet reporter below so only failures print. Run the full gate once, at the end.
- Move code between files by script (cut by line range), never retype it.
- A data-shape change (new field, rename) stays its own step if the SPEC splits it that way; don't fold behavior into it.
- Finish with at most 3 lines: what changed, anything surprising, anything left undone. Commit with the message the prompt gives.

## This repo (cabinetry_designer)
- One test file: `npx vitest run <path> --reporter=dot`. Full gate: `npm test -- --reporter=dot && npm run lint`; add `npm run build` when the step touches `components/` or other UI.
- The golden payload snapshot must not change unless the step says so.
- New tests build walls, runs, openings and rooms with `src/test/builders.js` (`wall`, `run`, `opening`, `room`, `auto`, `fixed`, `pin`); don't declare local builders. Add a missing default there, not in the test. Existing local builders stay until a step touches that file anyway.
- Logic tests (`.test.js`) share loaded modules unless they use `vi.mock`, `vi.spyOn`, `vi.stubGlobal`, fake timers or set `globalThis` (`vite.config.js` sends those to isolated workers). Don't mutate imported constants such as `DEFAULT_SETTINGS`; copy them.
- The geometry repo rejects unknown payload keys: a step that adds a payload field needs the geometry step in first.
