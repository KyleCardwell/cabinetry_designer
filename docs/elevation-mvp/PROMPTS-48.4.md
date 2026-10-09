# Round 48.4 — Codex Prompts, Steps 451–454 (door section in the door style tool; pickers only; one width; wider tool)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**. Geometry and the API don't change. No Supabase (plan P18).

| Step | Repo | What | Tests after |
|---|---|---|---|
| 451 | cabinetry_designer | Model: `doorSection` | 1157 |
| 452 | cabinetry_designer | UI: pickers only; overlay removed | 1157 |
| 453 | cabinetry_designer | UI: section view; wide two-column tool; field order | 1157 |
| 454 | cabinetry_designer | UI: one stile & rail width | 1157 |

Line numbers in each prompt are from **before** that step's edits.

---

## Before step 451 (Kyle)

The two docs are already in `cabinetry_designer/docs/elevation-mvp/`; commit them:

```bash
cd cabinetry_designer
git status                                   # on elevation-doors, 450 in; only the two docs below are new
git add docs/elevation-mvp/SPEC-48.4.md docs/elevation-mvp/PROMPTS-48.4.md
git commit -m "round 48.4 docs"
```

---

## Step 451 — model: doorSection

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.4.md §1 and §2. Step 450 is in (1154 tests).
If `git status` shows uncommitted changes, stop and tell me.

New files only — nothing existing changes.

NEW src/elevation/model/doorSection.js — export doorSection(style, design, profiles), exactly the SPEC §2 contract:
- imports: profileDoorGhost ('./profileGhost.js'), DOOR_PROFILE_SLOTS ('./doorStyles.js'), doorProfileSlotKind ('./sectionProfiles.js'); a local round6 like profileGhost.js.
- null when no design, thickness not finite > 0, slab_applied with stiles.left not finite > 0, five_piece whose profileDoorGhost('door_outside', style) is null, or any other construction.
- body: five_piece → that ghost; slab → rectangle width 3; slab_applied → width stiles.left + 3; rectangle points b1 [0,0], b2 [w,0], b3 [w,-T], b4 [0,-T], one closed loop id 'slab' b1→b2→b3→b4→b1.
- placed: DOOR_PROFILE_SLOTS order, only slots in design.slots with a string pick; missing profile or kind !== doorProfileSlotKind(slot) → skipped.push(slot); else { slot, profileId, name, geometry } with geometry moved by dx (outside 0, else stiles.left): new points and new arc centers, round6, never mutate input.
- cuts: per placed entry, per open loop: { slot, geometry: { units: 'in', points: all placed points + added, loops: [{ id: loop.id, closed: true, segs }] } } with segs = the loop's segs, then: last = end; if y(end) !== 0 add _e [x(end),0] and line last→_e, last = _e; target = '_s' [x(start),0] (added) when y(start) !== 0, else start; line last→target when their coordinates differ; line _s→start when target is _s.
- doc comment naming SPEC-48.4.

NEW src/elevation/model/__tests__/doorSection.test.js: the SPEC §2 file VERBATIM (3 tests).

Files (only these two).

DO NOT change any existing file. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/doorSection.test.js` — it must fail. Iterate on that file only. At the end `npm test && npm run lint` once: 1154 + 3 = 1157, golden snapshot unchanged, lint 0 errors. If a number still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 451 Door style half section model".
```

---

## Step 452 — UI: pickers only

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.4.md §1 and §3. Step 451 is in (1157 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Exactly SPEC §3:
- src/elevation/components/DoorProfilePickers.jsx (92 lines): signature ({ draft, setDraft, design }); remove the ProfileEditorOverlay import (line 6), useState/useDispatch, addSectionProfile/deleteSectionProfile, doorProfileSlotKind, BUTTON_CLASS, editing state, open, close, both buttons (59–78) and the overlay line (89). Each row = label with the select directly under it (mt-1, full width, no flex wrapper). Note text (83–85) → "Pick from the profile library. To make or change a profile, go to Library → Profiles." Keep the greyed-slots note.
- git rm src/library/profileEditor/ProfileEditorOverlay.jsx
- src/elevation/components/DoorStyleFields.jsx (143 lines): signature ({ draft, setDraft, designs }); line 139 → <DoorProfilePickers draft={draft} setDraft={setDraft} design={design} />.
- src/elevation/components/DoorStyleEditor.jsx (117 lines): delete line 16 (profileEditorOpen ref), line 26 (its guard) and the onProfileEditorChange prop (line 95). useRef stays for panelRef.
Then this must print nothing: grep -rn "ProfileEditorOverlay\|profileEditorOpen\|onProfileEditorChange\|onEditorChange" src

Files (only these four).

DO NOT change ProfileEditor.jsx, ProfileEditorPage.jsx, the model, the store, useElevationKeys.js / usePlanKeys.js (keep the modal guard) or TeamDoorStylePage.jsx. Apart from the one grep above, DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1157 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 452 Door style profile pickers only".
```

---

## Step 453 — UI: section view; wide two-column tool; field order

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.4.md §1 and §4. Step 452 is in (1157 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Exactly SPEC §4:
1. NEW src/elevation/components/DoorSectionView.jsx — DoorSectionView({ style, design }): profiles from useSelector(state.elevation.settings.sectionProfiles); section = doorSection(style, design, profiles); null → the "Too thin to draw a section…" text. Bounds = union of sectionProfileBounds({ geometry }) over body and every placed geometry, plus y = 0; pad 0.25; viewBox y-flipped like src/library/ProfileThumbnail.jsx. <svg … role="img" aria-label="Door section" className="h-64 w-full rounded border border-gray-700 bg-gray-900">, layers in order: (1) <defs><mask> (id from useId() with colons stripped, maskUnits userSpaceOnUse, covering the viewBox): white rect + each cut path fill black; (2) body path text-gray-400 fill currentColor 0.2, evenodd, stroke 0.6 width 1, mask url(#id); (3) dashed face line at y = 0 (text-gray-600, dasharray "4 4"); (4) each placed loop alone via sectionProfileSvgPath({ geometry: { ...geometry, loops: [loop] } }), text-blue-400: open → fill none stroke width 2; closed → fill 0.3, stroke width 1.5; <title>{name}</title> in each. All paths vectorEffect="non-scaling-stroke", strokeLinejoin="round". Then the gray caption and, when skipped is non-empty, the amber "Not shown (missing or wrong kind): …" line, both with SPEC §4's exact text and slot labels.
2. src/elevation/components/DoorStyleFields.jsx: import DoorSectionView; root → <div className="grid gap-6 md:grid-cols-2">; left child <div className="space-y-4"> with the existing blocks MOVED (cut and paste, don't retype) into this order: Design → Thickness → Stiles & rails → Profiles → Panel → Mid rail/stile extra → Arch rise → Short faces (last); right child <div className="space-y-2 self-start md:sticky md:top-0"><h3 className={HEADING_CLASS}>Section</h3><DoorSectionView style={draft} design={design} /></div>.
3. src/elevation/components/DoorStyleEditor.jsx: the dialog's w-[36rem] → w-[64rem] max-w-[95vw]. Nothing else.
4. src/library/TeamDoorStylePage.jsx line 23: max-w-xl → max-w-5xl.

Files (only these four).

DO NOT change the model, the store, DoorProfilePickers.jsx, ProfileEditor*, RoomDoorStylesPanel.jsx, the canvas or DXF. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1157 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 453 Door style section view and two-column tool".
```

---

## Step 454 — UI: one stile & rail width

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-48.4.md §1 and §5. Step 453 is in (1157 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Only src/elevation/components/DoorStyleFields.jsx, inside the Stiles & rails section (heading and slab note stay):
- import useState; sizes = [stiles.left, stiles.right, rails.top, rails.bottom]; same = all equal; const [sides, setSides] = useState(false); showSides = sides || !same; setAll(value) sets stiles { left, right } and rails { top, bottom } all to value.
- !showSides: one SizeField labelled applied ? 'Inset' : 'Stile & rail width', value draft.stiles.left, disabled={slab}, onChange={setAll}; under it a button (text-xs text-blue-400 hover:underline disabled:opacity-50, disabled={slab}) "Different sizes…" → setSides(true).
- showSides: the existing four-field grid unchanged; under it the same button style "Use one width" → setAll(draft.stiles.left); setSides(false).
- under either: text-xs text-gray-500 "Short doors and drawer fronts still shrink their rails by the short-face rule."

Files (only this one).

DO NOT change anything else in the file or any other file. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1157 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 454 One stile and rail width".
```

---

## Running it (Kyle, after 454)

Follow SPEC-48.4's end-to-end check: the section on Team door style follows width and thickness; picked round-over, inside cut and applied molding show on it; Slab / Slab AM sections; the room's style editor is wide and two-column with no New/Edit; Short faces last; **Different sizes…** / **Use one width**. Send `git show` after 453 if you want the section reviewed.
