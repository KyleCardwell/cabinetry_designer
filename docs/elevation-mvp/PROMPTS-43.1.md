# Round 43.1 — Codex Prompts, Steps 348–350 (drawing style, readable dimensions)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-43.1.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 348 | cabinetry_designer_geometry | Arial Narrow, 3/32" dimension text, lineweights, `$LTSCALE` | 41 |
| 349 | cabinetry_designer_geometry | `textX` / `textZ`: moved dimension text | 42 |
| 350 | cabinetry_designer | `elevationDimensions` moves text that doesn't fit | 927 |

The API doesn't change. Branches as before: the designer on `feature/elevation-mvp`, geometry on `feature/drawing`. 349 has to be in before you export with 350 in, because geometry rejects unknown fields.

The SPEC's test values come from the golden fixture and a reference build of these steps. If a test fails, fix the code, not the number, unless the number contradicts a SPEC rule. In that case, stop and say so.

---

## Before step 348 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on feature/elevation-mvp
git add docs/elevation-mvp/SPEC-43.1.md docs/elevation-mvp/PROMPTS-43.1.md docs/DECISIONS.md
git commit -m "round 43.1 docs"
```

Geometry: `git status` clean on `feature/drawing`, and `.venv/bin/python -m pytest` → 38 passed.

---

## Step 348 — geometry: Arial Narrow, smaller text, lineweights, dashes

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-43.1.md §1 and §2. Step 345 is in.
If `git status` shows uncommitted changes, stop and tell me.

The drawing style. One text style FF_TEXT (font arialn.ttf, extended font data family "Arial Narrow") used by the FF dimstyle (dimtxsty) and by the title texts. Dimension text goes to 3/32" paper (dimtxt 0.09375). Every layer gets a lineweight (LAYER_DEFS tuples gain a third value, 1/100 mm), with $LWDISPLAY = 1. $LTSCALE = plot_scale / 2 so DASHED reads on paper.

Files (only these):
- src/dxf/writer.py (133 lines): LAYER_DEFS and its comment, TEXT_STYLE/TEXT_FONT/TEXT_FAMILY, the end of create_dxf_document from `# Create layers`, all VERBATIM from SPEC §2; dimtxt 0.09375 with its comment; `style.dxf.dimtxsty = TEXT_STYLE` after the dimscale line; add_dimstyle's docstring as SPEC §2 says (lines ≤ 110 characters)
- src/drawing/elevation_dxf.py (149): TEXT_STYLE in the writer import, the $LTSCALE lines after add_dimstyle (line 86), and "style": TEXT_STYLE in the title texts' dxfattribs (line 146)
- tests/test_elevation_dimensions.py (106): line 76 (0.125 → 0.09375) and line 83 ([6] → [4.5])
- NEW tests/test_drawing_style.py: VERBATIM from SPEC §2 (3 tests)

ezdxf is 1.4.4: doc.layers.add(name, color=, linetype=, lineweight=) and Textstyle.set_extended_font_data(family=, italic=, bold=) both exist. DO NOT change dimensions.py, models.py, bundle.py, hlr.py, the fixtures or the README. No new dependencies.

First add and change the tests and run `.venv/bin/python -m pytest tests/test_drawing_style.py tests/test_elevation_dimensions.py`: the new and changed ones must fail. Iterate on those. At the end `.venv/bin/python -m pytest` once: 38 + 3 = 41 passed.

At most three lines of summary. Commit "round 43.1: step 348 Drawing style".
```

---

## Step 349 — geometry: moved dimension text

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-43.1.md §1 and §3. Step 348 is in.
If `git status` shows uncommitted changes, stop and tell me.

A dimension record can carry textX and textZ (drawing inches, the text's middle). If it does, add_dimensions calls override.set_location((textX, textZ), leader=False, relative=False) before render(), so the text goes there with no leader and the user-location flag set. The title also moves under the lowest moved text, not just the lowest line.

Files (only these):
- src/drawing/models.py (97 lines): textX and textZ on PayloadDimension, VERBATIM from SPEC §3
- src/drawing/dimensions.py (25): the docstring and the set_location block, as SPEC §3
- src/drawing/elevation_dxf.py (~151 after 348): the `low = min([...])` line and its comment, VERBATIM from SPEC §3
- tests/test_elevation_dimensions.py (~106): append the SPEC §3 test at the end, VERBATIM (1 test)

DO NOT change writer.py, bundle.py, any other test or the fixtures. No new dependencies.

First add the test and run `.venv/bin/python -m pytest tests/test_elevation_dimensions.py`: it must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 41 + 1 = 42 passed.

At most three lines of summary. Commit "round 43.1: step 349 Moved dimension text".
```

---

## Step 350 — designer: move text that doesn't fit

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.1.md §1 and §4. Step 347 is in.
If `git status` shows uncommitted changes, stop and tell me.

In each dimension row, a label whose estimated width (characters × 0.5 × text height) plus a gap each side doesn't fit between its ticks moves outward. It's centred on its segment, in the first level where it clears every moved label already there. Its record gets textX/textZ. The next row out moves by 5/32" (paper) per level used. Text height 3/32" and gap 1/16" match geometry's FF dimstyle. The canvas doesn't change.

Files (only these):
- src/elevation/model/elevationDimensions.js (61 lines): replace the whole file with SPEC §4's, VERBATIM
- src/elevation/model/__tests__/elevationDimensions.test.js (73): replace the whole file with SPEC §4's, VERBATIM (same 3 tests, new numbers)

What you need without opening them: formatInches(n) gives e.g. '28 1/2"'. plotScale(settings) is in drawingScale.js. horizontalChains, openingChain and wallExtent are unchanged.
DO NOT open or change dimensions.js, drawingPayload.js, drawingPayload.test.js, wallExtent.js or any canvas file. DO NOT grep the repo.

First replace the test file and run `npx vitest run src/elevation/model/__tests__/elevationDimensions.test.js`: it must fail. Iterate on that file and src/elevation/model/__tests__/drawingPayload.test.js, which must pass unchanged. At the end `npm test && npm run lint` once: 927, golden snapshot unchanged. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 350 Dimension text that doesn't fit moves off the line".
```

---

## Running it (Kyle, after 350)

`npm run build` once in the designer. Then start the API and designer as in round 42, and run the end-to-end check at the end of the SPEC: *Export DXF* on G1 and G2.

If anything looks wrong, export the room, keep the zip (its `payload.json` shows what was sent), and bring it back.
