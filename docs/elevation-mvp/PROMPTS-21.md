# Elevation Lab — Codex Prompts, Steps 106–108 (math in inputs, crown under soffits, plan dimension lanes)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Order:** the three steps are independent. Run them in any order after SPEC-20 (steps 101–105). The pass counts below assume 106 → 107 → 108.

**Codex can't open the app**, so don't plan browser checks. Kyle checks each step by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of `2c00ace`.

---
## Step 106 — Math in inch inputs

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-21.md §1, §5 tests 180–181.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/units.js (~120): rewrite parseInches (lines 14–44) only
- test: src/elevation/model/__tests__/units.test.js (append a describe at the end)

Every inch box already goes through InchInput → parseInches, and live entry through useLiveEntry → parseInches. Don't open InchInput.jsx, useLiveEntry.js or any component; the signature (string → number | null) doesn't change.

parseInches: a small recursive-descent evaluator exactly as SPEC §1 — tokenizer with sticky regexes (mixed first, then decimal), unit marks " and ' with the feet compound (no hyphen form), '-' always subtraction, unary +/-, parentheses, + - * /. Any error (unknown char, leftover token, missing paren, bad mixed fraction) → null; non-finite result → null; otherwise normalizeResult(value). Keep it self-contained in units.js; no new dependency. Keep formatInches / formatInchesInput / floorTo / roundTo untouched.

In the existing round-trip table, change ['30-1/2', 30.5, '30 1/2"'] to ['30-1/2', 29.5, '29 1/2"']; every other existing parseInches test ('2 2/2' → null, '3 feet' → null, …) must pass unchanged. Tests 180–181 exactly as SPEC-21 §5.
Expect 471 passing.

At most five lines of summary. Commit "elevation-mvp: step 106 math in inch inputs".
```

**Check after 106:**
- On a run's Width, type `36 - 1 1/2` and press Enter. It becomes `34 1/2`.
- Type `(120 - 3/4) / 4` into a width. It becomes `29 13/16`.
- Type `8'6` into a wall length. It becomes `102`.
- Type `30-1/2` or `30 - 1/2`, and both are 29 1/2. Type `30 1/2`, and it's 30 1/2.
- Type `(55 - 4.5)/2`, and it's 25 1/4.
- Type `30 +` and press Enter. It reverts to the old value.
- While drawing, type a live entry like `24 + 6`. The preview follows once the expression is complete.

---
## Step 107 — Top of crown below a soffit

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-21.md §2, §5 tests 182–183.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/profile.js (~100): new export boxTopOf; use it at line 50 (`const boxTop = boxTopOf(q);`)
- src/elevation/model/soffits.js (198): new governingSoffit after soffitOverRun (~61); profileUnderSoffit (~98) and runMolding (~106) per SPEC. Import boxTopOf from './profile.js' (moldingStack is already imported from there).
- src/elevation/model/index.js: export boxTopOf (profile block ~148–154) and governingSoffit (soffits block ~130–147)
- src/elevation/components/PropertiesPanel.jsx: ONLY lines ~548–552 (inheritedValues in RunProperties) and the model import block (~15–41). Don't read the rest.
- src/elevation/components/RunGroup.jsx: ONLY line 74 → runMolding(wall, run, profile)
- test: src/elevation/model/__tests__/soffits.test.js (append a describe at the end; extend the imports)
- TODO.md: one bullet (below)

PropertiesPanel: inheritedValues.boxTop = boxTopOf(profileUnderSoffit(profile, wall, run)). Import boxTopOf and profileUnderSoffit from '../model/index.js'; drop moldingStack from that import only if nothing else in the file uses it (grep the file for moldingStack; don't read around it).

Leave soffitOverRun, soffitConflicts, soffitEndType and room.js alone — room.js calls profileUnderSoffit, which picks up the change.

TODO.md, in "## Later / Maybe", add:
- [ ] **[model][elevation] Multiple top-of-crown lines per wall** — runs choose which line they grow to. `governingSoffit` (SPEC-21 §2) already compares a soffit against the profile's crown top; the run's chosen line would supply that crownTop.

Tests 182–183 exactly as SPEC-21 §5.
Expect 473 passing.

At most five lines of summary. Commit "elevation-mvp: step 107 crown line below soffits".
```

**Check after 107:**
- Draw a soffit at 84" over some uppers. Drag the wall's top-of-crown line down to 80". The uppers under the soffit drop to the crown line, show crown, and leave a gap below the soffit. There's no warning.
- Drag the crown line back above 84". They snap back under the soffit with its molding.
- Select an upper under a soffit. The Box top placeholder shows the soffit-limited value, for example `78` for an 84" soffit with 6" crown, not `90`.

---
## Step 108 — Plan: depth dimension lanes, pop-out labels, wall length outermost

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-21.md §3, §4, §5 test 184.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- NEW src/elevation/plan/depthDimension.js (pure, no React): constants + depthDimension exactly as SPEC §3. Imports CABINET_TYPE_IDS from '../model/constants.js', formatInches from '../model/units.js', PLAN_DIM_FONT_SIZE from './constants.js'.
- NEW test src/elevation/plan/__tests__/depthDimension.test.js (184)
- src/elevation/plan/PlanRunFootprint.jsx (236): the depth block (~88–116) and the depth render (~150–192) only
- src/elevation/plan/PlanWallShape.jsx (337): offsets (~25–45) and landingDimensionOffset (~69) only

PlanRunFootprint: const dim = depthDimension(run, depth, scale). Replace dimensionX with dim.x for dimensionBack/dimensionFront. Delete depthLabelFits, depthLabelPoint, depthLeaderEnd, depthTextPx, and the old leader Line. Render: leader Line from elevationToPlan(frame, dim.leader.x1, dim.leader.offset) to (dim.leader.x2, dim.leader.offset) when dim.leader, stroke #64748b, strokeWidth 0.75 / scale. Text at elevationToPlan(frame, dim.label.x, dim.label.offset); width stays text-sized (keep depthTextWidth from formatInches(depth)), offsetY = dim.fits ? depthFontSize + 2 / scale : depthFontSize / 2; rotation unchanged.

PlanWallShape per SPEC §4: hasFrontLandings from landingsOn(room, wallSideView(wall, 'front')) (both already imported); innerRowOffset; dimensionOffset; extensionEndOffset = dimensionOffset + 4 / scale; numberOffset = dimensionOffset + 24 / scale. Landing rows: offset = side === 'front' ? innerRowOffset : innerRowOffset + 20 / scale (replace the single landingDimensionOffset; it's used in the row start/end, extension and label math — keep one per-row value, e.g. row.offset). Don't open PlanCanvas.jsx.

Test 184 exactly as SPEC-21 §5.
Expect 474 passing.

At most five lines of summary. Commit "elevation-mvp: step 108 plan depth lanes and wall length outermost".
```

**Check after 108:**
- Put a base and an upper on the same stretch of wall. In plan, the upper's depth line sits left of the base's, and each is readable.
- Add a tall beside them. Its depth line sits right of its centre.
- Zoom out until the numbers don't fit. Each one stays at the middle of its line on a short sideways leader: uppers to the left, bases and talls to the right. Zoomed far out, a popped-out label can reach back across a thin wall. Say if that bothers you.
- On a wall with wing walls on its front, the breakdown row is next to the wall and the full wall length is outside it. The wall-number bubble sits past both. On a wall without wing walls, nothing moved.
